import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studyDir = path.resolve(process.env.STUDY_TEST_DIR || path.join(projectRoot, 'study'));
const siteDir = path.join(projectRoot, 'study');
const browserExecutable = process.env.SNAPSHOT_CHROMIUM_PATH
  || '/home/granawkins/.hermes/tools/chromium-1208/chrome-linux64/chrome';

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('reader renders report segments, citations, responsive chapter menu, and visible search results', { timeout: 90000 }, async () => {
  const source = JSON.parse(await readFile(path.join(studyDir, 'segments.json'), 'utf8'));
  const segments = source.segments;
  const chapter = segments.find((segment) => segment.type === 'heading' && /The Colonization of Space/i.test(segment.text));
  const paragraph = segments.find((segment) => segment.type === 'text' && /The focus of the system is a space habitat/i.test(segment.text));
  const image = segments.find((segment) => segment.type === 'image' && segment.anchor === 'figure-5-5');
  const table = segments.find((segment) => segment.type === 'table');
  assert.ok(chapter && paragraph && image && table, 'generated segment data must contain reader fixtures');
  const fixture = {
    metadata: source.metadata,
    segments: [chapter, paragraph, { ...image, image_path: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }, table],
  };
  const html = (await readFile(path.join(studyDir, 'index.html'), 'utf8'))
    .replace('<head>', '<head><base href="https://example.test/oneillsim/study/">')
    .replace('<link rel="stylesheet" href="study.css">', `<style>${await readFile(path.join(siteDir, 'study.css'), 'utf8')}</style>`)
    .replace(/\s*<script src="study\.js" defer><\/script>/, '');
  const script = await readFile(path.join(siteDir, 'study.js'), 'utf8');
  const browser = await chromium.launch({
    executablePath: browserExecutable,
    headless: true,
    chromiumSandbox: false,
    args: ['--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ segmentPayload, searchResult }) => {
      window.fetch = async (url) => {
        if (String(url).includes('segments.json')) return response(segmentPayload);
        if (String(url).includes('/api/study/search')) return response(searchResult);
        return new Response('Unexpected request', { status: 404 });
      };
      function response(body) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }, {
      segmentPayload: fixture,
      searchResult: { bm25: [paragraph], semantic: [paragraph], semantic_available: true },
    });
    await page.addScriptTag({ content: script });
    try {
      await page.waitForFunction(() => document.querySelector('#study-article')?.children.length > 0, null, { timeout: 5000 });
    } catch (error) {
      const status = await page.locator('#reader-status').textContent();
      assert.fail(`${error.message}; reader status=${status}; browser errors=${errors.join(' | ')}`);
    }

    assert.match(await page.locator('#study-article').innerText(), /The focus of the system is a space habitat/);
    assert.equal(await page.locator('#pdf-018').count(), 1);
    assert.equal(await page.locator('#figure-5-5').count(), 1);
    assert.ok(await page.locator('#study-article table').count() >= 1);
    assert.match(await page.locator('#study-article .page-citation').first().getAttribute('href'), /#page=18/);

    const menu = page.locator('#chapter-menu-toggle');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#chapter-menu-backdrop').isHidden(), false);
    const chapterLink = page.locator('#chapter-navigation a[href="#pdf-018"]');
    await chapterLink.evaluate((link) => link.addEventListener('click', (event) => event.preventDefault(), { once: true }));
    await chapterLink.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');

    await page.locator('#study-search').fill('pseudogravity');
    await page.locator('#study-search-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#search-results')?.hidden === false);
    assert.match(await page.locator('#bm25-results').innerText(), /The focus of the system/);
    assert.match(await page.locator('#semantic-results').innerText(), /The focus of the system/);
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally {
    await browser.close();
  }
});
