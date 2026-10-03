import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = (process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3200/oneillsim').replace(/\/$/, '');
const executablePath = process.env.SNAPSHOT_CHROMIUM_PATH || '/home/granawkins/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

test('Next owns content routes while the original simulation and private-file boundary remain intact', async () => {
  const home = await (await fetch(`${base}/`)).text();
  assert.match(home, /src="src\/main.js"/);
  assert.doesNotMatch(home, /\/_next\//, 'simulation does not load React');
  for (const route of ['study', 'assets']) {
    const response = await fetch(`${base}/${route}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /\/_next\//);
    const redirect = await fetch(`${base}/${route}/index.html?q=rabbit`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), `/oneillsim/${route}/?q=rabbit`);
  }
  for (const route of ['app/layout.jsx', 'server.mjs', 'next.config.mjs', 'package.json', '.env', 'docs/reference/nasa-sp-413-space-settlements-a-design-study.pdf']) {
    assert.equal((await fetch(`${base}/${route}`)).status, 404, route);
  }
  assert.equal((await fetch(`${base}/world.json`)).status, 200);
  assert.equal((await fetch(`${base}/world.json`, { method: 'PUT', body: 'invalid json' })).status, 400);
  const response = await fetch(`${base}/api/study/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'rabbit', modes: ['bm25'] }),
  });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).bm25.length > 0);
});

test('client navigation mounts and disposes the gallery and reader without leaking styles, anchors, or listeners', { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/assets/houses/`);
    await page.waitForFunction(() => window.__assetReady === true);
    await page.evaluate(() => { window.__navigationMarker = 'same document'; });
    for (let turn = 0; turn < 2; turn++) {
      assert.equal(await page.locator('#asset-canvas').count(), 1);
      const factCount = await page.locator('.facts li').count();
      assert.ok(factCount > 0);
      await page.locator('a[href="/oneillsim/study/#figure-5-5"]').click();
      await page.waitForURL('**/study/#figure-5-5');
      await page.waitForFunction(() => document.querySelector('#reader-status')?.hidden);
      assert.equal(await page.evaluate(() => window.__navigationMarker), 'same document');
      assert.equal(await page.evaluate(() => window.__assetReady), false, 'viewer disposed on route departure');
      assert.equal(await page.locator('#figure-5-5').count(), 1);
      assert.equal(await page.locator('.study-page').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
      const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(n => n.id));
      assert.equal(new Set(ids).size, ids.length);
      await page.goBack();
      await page.waitForURL('**/assets/houses/');
      await page.waitForFunction(() => window.__assetReady === true);
      assert.equal(await page.locator('.facts li').count(), factCount);
      assert.equal(await page.evaluate(() => window.__navigationMarker), 'same document');
      assert.notEqual(await page.locator('.asset-page').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    }
    await page.goto(`${base}/assets/houses/?capture=1`);
    await page.waitForFunction(() => window.__assetReady === true);
    assert.equal(await page.locator('.topbar').isHidden(), true);
    assert.equal(await page.locator('#asset-canvas').evaluate(el => Math.round(el.getBoundingClientRect().height)), 1000);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('library index lists planned types without model viewers and links to the available house', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/assets/`);
    assert.equal(await page.locator('h1').innerText(), 'Asset library');
    assert.equal(await page.locator('canvas').count(), 0);
    assert.equal(await page.locator('.library-groups a').count(), 1);
    assert.ok(await page.locator('.library-groups li').count() > 50);
    assert.equal(await page.locator('.library-groups img').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('a.available').click();
    await page.waitForFunction(() => window.__assetReady === true);
    assert.match(await page.locator('.design-list').innerText(), /984 tris · 656 verts/);
    await page.locator('a.back').click();
    await page.waitForURL('**/assets/');
    assert.equal(await page.evaluate(() => window.__assetReady), false);
    const legacy = await page.goto(`${base}/assets/?capture=1&asset=TorusHome_ModA`);
    assert.equal(legacy.status(), 200);
    await page.waitForFunction(() => window.__assetReady === true);
    assert.match(page.url(), /assets\/houses\//);
    assert.equal((await fetch(`${base}/assets/unknown-type/`)).status, 404);
  } finally { await browser.close(); }
});
