import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const BASE_PATH = '/oneillsim';
const PORT = Number(process.env.PORT || 3200);
const HOST = process.env.HOST || '127.0.0.1';
const WORLD_PATH = resolve(ROOT, 'world.json');
const MAX_WORLD_BYTES = 10 * 1024 * 1024;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mtl': 'text/plain; charset=utf-8',
  '.obj': 'text/plain; charset=utf-8',
  '.png': 'image/png',
};

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

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  const decodedPath = relativePath || 'index.html';
  const deniedFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'bun.lock', 'package-lock.json', 'package.json', 'server.mjs']);
  if (decodedPath.split('/').some((part) => part.startsWith('.')) || deniedFiles.has(decodedPath)) {
    return send(res, 404, 'Not found');
  }
  const filePath = resolve(ROOT, decodedPath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) return send(res, 403, 'Forbidden');
  try {
    const contents = await readFile(filePath);
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    return send(res, error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500, 'Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Oneill Sim listening on http://${HOST}:${PORT}${BASE_PATH}/`);
});
