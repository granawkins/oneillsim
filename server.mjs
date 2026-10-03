import { createServer } from 'node:http';
import next from 'next';
import { existsSync, realpathSync } from 'node:fs';
import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { prepareStaticResponse } from './src/static-response.js';
import { parseSnapshotOptions } from './src/snapshot-options.js';
import { createStudyEmbeddingQueryService } from './src/study-embedding-cache.js';
import { requestOpenRouterEmbeddings } from './src/study-embeddings.js';
import { handleStudySearchHttp } from './src/study-search-http.js';
import { openStudySearchDatabase } from './src/study-search-runtime.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT_REAL = realpathSync(ROOT);
const dev = process.env.NODE_ENV !== 'production';
const BASE_PATH = '/oneillsim';
const PORT = Number(process.env.PORT || 3200);
const HOST = process.env.HOST || '127.0.0.1';
const WORLD_PATH = resolve(ROOT, 'world.json');
const STUDY_SEARCH_DATABASE_PATH = resolve(join(homedir(), '.local', 'share', 'oneillsim', 'study-search.sqlite3'));
const STUDY_SEGMENTS_PATH = resolve(ROOT, 'study', 'segments.json');
const MAX_WORLD_BYTES = 10 * 1024 * 1024;
const SNAPSHOT_CHROMIUM_PATH = process.env.SNAPSHOT_CHROMIUM_PATH || '/home/granawkins/.hermes/tools/chromium-1208/chrome-linux64/chrome';
const MAX_ACTIVE_SNAPSHOTS = 2;
let snapshotBrowser = null;
let snapshotBrowserPromise = null;
let activeSnapshots = 0;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mtl': 'text/plain; charset=utf-8',
  '.obj': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let studySearchDatabase = null;
if (existsSync(STUDY_SEARCH_DATABASE_PATH)) {
  try {
    studySearchDatabase = openStudySearchDatabase(STUDY_SEARCH_DATABASE_PATH, STUDY_SEGMENTS_PATH);
    if (studySearchDatabase) {
      const count = studySearchDatabase.prepare('SELECT COUNT(*) AS count FROM study_segments').get().count;
      console.log(`Loaded private study search index (${count} segments).`);
    } else {
      console.error('Study search index does not match the public segment manifest; search is unavailable.');
    }
  } catch (error) {
    console.error('Study search index could not be opened:', error.message);
  }
}

const embedStudySearchQuery = createStudyEmbeddingQueryService({
  embed: async (query) => {
    const [vector] = await requestOpenRouterEmbeddings([query], {
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    return vector;
  },
});

function isPathInside(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}

function send(res, status, message) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(message);
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_WORLD_BYTES) throw new Error('too-large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function getSnapshotBrowser() {
  if (snapshotBrowser?.isConnected()) return snapshotBrowser;
  if (!snapshotBrowserPromise) {
    snapshotBrowserPromise = chromium.launch({
      executablePath: SNAPSHOT_CHROMIUM_PATH,
      headless: true,
      chromiumSandbox: false,
      args: ['--disable-dev-shm-usage'],
    }).then((browser) => {
      snapshotBrowser = browser;
      browser.on('disconnected', () => {
        if (snapshotBrowser === browser) snapshotBrowser = null;
      });
      return browser;
    }).finally(() => {
      snapshotBrowserPromise = null;
    });
  }
  return snapshotBrowserPromise;
}

async function handleSnapshot(req, res, url) {
  let options;
  try {
    options = parseSnapshotOptions(url.searchParams);
  } catch (error) {
    return send(res, 400, error.message);
  }
  if (activeSnapshots >= MAX_ACTIVE_SNAPSHOTS) return send(res, 429, 'Snapshot service busy; retry shortly');

  activeSnapshots += 1;
  let context;
  try {
    const browser = await getSnapshotBrowser();
    context = await browser.newContext({
      viewport: options.viewport,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const pageUrl = `http://127.0.0.1:${PORT}${BASE_PATH}${options.pagePath}?${options.pageSearch}`;
    const pageResponse = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!pageResponse?.ok()) throw new Error(`Render page returned HTTP ${pageResponse?.status() ?? 'no response'}`);
    await page.waitForFunction((scene) => {
      return scene === 'asset'
        ? window.__assetReady === true || Boolean(window.__assetError)
        : window.__oneillSimReady === true || Boolean(window.__oneillSimError);
    }, options.scene, { timeout: 30000 });

    const pageState = await page.evaluate((scene) => scene === 'asset'
      ? { ready: window.__assetReady === true, error: window.__assetError || null }
      : { ready: window.__oneillSimReady === true, error: window.__oneillSimError || null }, options.scene);
    if (!pageState.ready) throw new Error(pageState.error || 'Render page did not become ready');
    if (pageErrors.length) throw new Error(`Render page error: ${pageErrors[0]}`);
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));

    const image = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled' });
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="stanford-torus-${options.scene}-snapshot.png"`,
      'Content-Length': image.length,
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(image);
  } catch (error) {
    console.error('Snapshot generation failed:', error.message);
    return send(res, error.name === 'TimeoutError' ? 504 : 503, `Snapshot rendering failed: ${error.message}`);
  } finally {
    if (context) await context.close().catch(() => {});
    activeSnapshots -= 1;
  }
}

const nextApp = next({ dev, dir: ROOT, hostname: HOST, port: PORT });
await nextApp.prepare();
const handleNext = nextApp.getRequestHandler();

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }

  if (pathname === BASE_PATH && req.method === 'GET') {
    res.writeHead(308, { Location: `${BASE_PATH}/`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (!pathname.startsWith(`${BASE_PATH}/`)) return send(res, 404, 'Not found');

  const relativePath = pathname.slice(BASE_PATH.length + 1);
  if (['assets', 'study'].includes(relativePath) && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(308, { Location: `${BASE_PATH}/${relativePath}/${new URL(req.url, 'http://localhost').search}`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (relativePath === 'api/snapshot') {
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
    return handleSnapshot(req, res, new URL(req.url, 'http://localhost'));
  }
  if (relativePath === 'api/study/search') {
    return handleStudySearchHttp(req, res, {
      database: studySearchDatabase,
      embedQuery: embedStudySearchQuery,
    });
  }
  if (req.method === 'PUT' && relativePath === 'world.json') {
    let body;
    try {
      body = await readRequestBody(req);
    } catch (error) {
      return send(res, error.message === 'too-large' ? 413 : 400, 'Invalid request body');
    }
    try {
      const parsed = JSON.parse(body);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        return send(res, 400, 'World data must be a JSON object');
      }
    } catch {
      return send(res, 400, 'Invalid JSON');
    }
    try {
      const tempPath = `${WORLD_PATH}.tmp`;
      await writeFile(tempPath, body, { mode: 0o644 });
      await rename(tempPath, WORLD_PATH);
      console.log('Saved world.json');
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('OK');
    } catch (error) {
      console.error('Failed to save world.json:', error.message);
      return send(res, 500, 'Could not save world data');
    }
  }

  if (['study/index.html', 'assets/index.html'].includes(relativePath)) {
    res.writeHead(308, { Location: `${BASE_PATH}/${relativePath.replace('index.html', '')}${new URL(req.url, 'http://localhost').search}` });
    return res.end();
  }
  const legacyStatic = relativePath === '' || relativePath === 'index.html' || relativePath === 'world.json'
    || relativePath.startsWith('src/')
    || (relativePath.startsWith('assets/') && relativePath !== 'assets/' && !relativePath.startsWith('assets/scripts/'))
    || ['study/segments.json', 'study/reader-layout.json', 'study/study.js', 'study/bootstrap.js', 'study/study.css'].includes(relativePath)
    || relativePath.startsWith('study/images/');
  if (!legacyStatic || relativePath.startsWith('_next/')) return handleNext(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  const decodedPath = relativePath.endsWith('/') ? `${relativePath}index.html` : (relativePath || 'index.html');
  const deniedFiles = new Set([
    'AGENTS.md',
    'CLAUDE.md',
    'bun.lock',
    'package-lock.json',
    'package.json',
    'server.mjs',
    'docs/reference/nasa-sp-413-space-settlements-a-design-study.pdf',
  ]);
  if (decodedPath.split('/').some((part) => part.startsWith('.')) || deniedFiles.has(decodedPath)) {
    return send(res, 404, 'Not found');
  }
  const filePath = resolve(ROOT, decodedPath);
  if (!isPathInside(ROOT, filePath)) return send(res, 403, 'Forbidden');
  try {
    const realFilePath = await realpath(filePath);
    if (!isPathInside(ROOT_REAL, realFilePath)) return send(res, 403, 'Forbidden');
    const contents = await readFile(realFilePath);
    const response = await prepareStaticResponse({
      path: decodedPath,
      extension: extname(filePath).toLowerCase(),
      contents,
      contentType: CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      requestHeaders: req.headers,
    });
    res.writeHead(response.status, response.headers);
    return res.end(req.method === 'HEAD' ? undefined : response.body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return handleNext(req, res);
    return send(res, 500, 'Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Oneill Sim listening on http://${HOST}:${PORT}${BASE_PATH}/`);
});

async function shutdown() {
  server.close();
  await snapshotBrowser?.close();
  studySearchDatabase?.close();
  await nextApp.close();
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
