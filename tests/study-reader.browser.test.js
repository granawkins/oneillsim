import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const study = path.join(root, 'study');
const executablePath = process.env.SNAPSHOT_CHROMIUM_PATH
  || '/home/granawkins/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

test('clean reader, debounced URL history, search selection, deep links, and responsive layout', { timeout: 90000 }, async () => {
  const source = JSON.parse(await readFile(path.join(study, 'segments.json'), 'utf8'));
  const paragraph = source.segments.find(s => /The focus of the system is a space habitat/.test(s.text));
  const hidden = source.segments.find(s => s.index === 219);
  const animalTable = source.segments.find(s => s.id === 'sp413-s02393');
  const figure = source.segments.find(s => s.type === 'image' && s.pdf_page >= 18);
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const queries = [];
    page.on('pageerror', error => errors.push(error.message));
    const liveBase = process.env.ONEILLSIM_NEXT_TEST_URL;
    await page.route(liveBase ? `${new URL(liveBase).origin}/**` : 'https://reader.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/api/study/search')) {
        const { query } = route.request().postDataJSON();
        queries.push(query);
        if (query === 'rabbit') return route.fulfill({ json: {
          bm25: [animalTable, paragraph, figure].map(s => ({ id: s.id, text: 'Metadata-only placeholder' })),
          semantic: [], semantic_available: false,
        } });
        if (query === 'bunny') return route.fulfill({ json: { bm25: [], semantic: [], semantic_available: false } });
        if (query === 'bunny semantic') return route.fulfill({ json: {
          bm25: [], semantic: [{ id: animalTable.id }], semantic_available: true,
        } });
        if (query === 'slow') await new Promise(resolve => setTimeout(resolve, 800));
        return route.fulfill({ json: { bm25: [paragraph, hidden], semantic: [paragraph], semantic_available: true } });
      }
      if (liveBase) return route.continue();
      const file = url.pathname.split('/study/')[1] || 'index.html';
      const contentType = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript'
        : file.endsWith('.json') ? 'application/json' : file.endsWith('.jpg') ? 'image/jpeg' : 'text/html';
      return route.fulfill({ body: await readFile(path.join(study, file)), contentType });
    });
    const base = liveBase || 'https://reader.test/oneillsim/study/';
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#reader-status').hidden);
    assert.equal(await page.locator('.page-citation,.reading-note,.study-footer,.search-modes').count(), 0);
    assert.equal(await page.locator(`#${hidden.id}`).isHidden(), true);
    assert.equal(await page.locator('#sp413-s00068').count(), 0, 'participant roster hidden');
    assert.equal(await page.locator('#study-article .frontispiece img').count(), 2);
    assert.ok(await page.locator('#study-article .frontispiece img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)));
    assert.ok(await page.locator('#study-article a.reference-link').count() > 0);
    assert.equal(await page.locator('#figure-5-5').count(), 1);
    assert.ok(await page.locator('#study-article table').count() > 0);
    const transportPanels = page.locator('#sp413-s03341 table');
    assert.equal(await transportPanels.count(), 2, 'transport costs use their own column headings');
    assert.equal(await transportPanels.nth(0).locator('thead th').count(), 8);
    assert.equal(await transportPanels.nth(1).locator('thead th').count(), 5);
    assert.match(await page.locator('#sp413-s02395').innerText(), /dry weights/);
    assert.match(await page.locator('#sp413-s01355').innerText(), /<0\.4/);
    assert.equal(await page.locator('#sp413-s02813 table').count(), 1, 'animal feeding data restored as a table');
    const grouped = await page.locator(`#${paragraph.id}`).evaluate(el => el.closest('p').querySelectorAll('.study-sentence').length);
    assert.ok(grouped > 1, 'sentences read as paragraphs');

    await page.locator('#chapter-navigation a').first().click();
    await page.waitForURL('**/#sp413-s00110');
    await page.waitForTimeout(100);
    const readingY = await page.evaluate(() => scrollY);
    assert.ok(readingY > 0);
    // Fill through DOM to avoid scrolling the offscreen input before testing restoration.
    await page.locator('#study-search').evaluate(input => { input.value = 'housing'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#reading-view').isHidden(), true);
    assert.equal(new URL(page.url()).searchParams.has('q'), false, 'URL waits for debounce');
    await page.waitForURL('**/?q=housing#sp413-s00110');
    await page.waitForSelector('.search-result-link');
    assert.equal(await page.locator('.search-result-link').count(), 2, 'deduplicates modes while retaining searchable references');
    await page.locator('#study-search').fill('gravity');
    await page.waitForURL('**/?q=gravity#sp413-s00110');
    await page.waitForSelector('.search-result-link');
    await page.locator('.search-result-link').first().click();
    await page.waitForURL(`**/#${paragraph.id}`);
    assert.equal(await page.locator('#study-search').inputValue(), '');
    assert.equal(await page.locator('#search-results').isHidden(), true);
    assert.equal(await page.locator('#reading-view').isVisible(), true);
    await page.waitForTimeout(100);
    assert.ok(Math.abs(await page.locator(`#${paragraph.id}`).evaluate(el => el.getBoundingClientRect().top)) < 150);
    await page.goBack();
    await page.waitForSelector('.search-result-link');
    assert.equal(await page.locator('#study-search').inputValue(), 'gravity');
    await page.goBack();
    await page.waitForSelector('.search-result-link');
    assert.equal(await page.locator('#study-search').inputValue(), 'housing');
    await page.goBack();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#study-search').inputValue(), '');
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - readingY) < 5, 'Back restores reading position');
    await page.goForward();
    await page.waitForSelector('.search-result-link');
    assert.equal(await page.locator('#study-search').inputValue(), 'housing');
    await page.reload();
    await page.waitForSelector('.search-result-link');
    assert.equal(await page.locator('#reading-view').isHidden(), true, 'URL search survives reload');
    await page.locator('#study-search').fill('slow');
    await page.waitForURL('**/?q=slow#sp413-s00110');
    await page.locator('#study-search').fill('');
    await page.waitForURL('**/#sp413-s00110');
    await page.waitForTimeout(850);
    assert.equal(await page.locator('#reading-view').isVisible(), true, 'late search cannot replace reader');
    assert.equal(await page.locator('#search-results').isHidden(), true);
    await page.locator('#study-search').fill('instant');
    await page.locator('#study-search-form button').click();
    await page.waitForURL('**/?q=instant#sp413-s00110');
    await page.waitForSelector('.search-result-link');
    assert.ok(queries.includes('instant'));
    // References retain source numbering, expand on selection, and flash their target.
    await page.goto(`${base}#sp413-s00160`);
    await page.waitForFunction(() => document.querySelector('#reader-status').hidden);
    await page.locator('#sp413-s00160 a.reference-link').click();
    await page.waitForURL('**/#ref-1-1');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#references-1').getAttribute('open'), '');
    assert.ok(await page.locator('#ref-1-1').evaluate(el => el.classList.contains('reference-flash')));
    assert.ok(Math.abs(await page.locator('#ref-1-1').evaluate(el => el.getBoundingClientRect().top)) < 150);
    await page.goBack();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#references-1').getAttribute('open'), null);
    await page.goForward();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#references-1').getAttribute('open'), '');
    // Search stays on screen while the article and outline scroll independently.
    assert.ok(await page.locator('#study-search').evaluate(el => el.getBoundingClientRect().top >= 0));
    assert.ok(await page.locator('#sp413-s00433').evaluate(el => el.tagName === 'H3'));
    assert.ok(await page.locator('#sp413-s00110').evaluate(el => el.tagName === 'H2'));
    assert.ok(await page.locator('.outline-chapter[data-chapter="2"] a[href="#sp413-s00433"]').count());
    assert.equal(await page.locator('#sp413-s00048').evaluate(el => el.closest('p').contains(document.getElementById('sp413-s00049'))), true);
    assert.equal(await page.locator('#sp413-s03262').evaluate(el => el.closest('p').contains(document.getElementById('sp413-s03242'))), true);
    assert.equal(await page.locator('#sp413-s03474').evaluate(el => el.closest('p').contains(document.getElementById('sp413-s03479'))), true);
    assert.equal(await page.locator('#sp413-s02501 a[href="#ref-4-26"]').count(), 1, 'cross-chapter citation');
    assert.equal(await page.locator('#sp413-s02501 a[href="#ref-4-25"]').count(), 1);
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(n => n.id));
    assert.equal(new Set(ids).size, ids.length, 'stable anchors must be unique');
    await page.goto(`${base}#figure-5-5`);
    await page.waitForFunction(() => document.querySelector('#reader-status').hidden);
    await page.waitForTimeout(100);
    assert.ok(Math.abs(await page.locator('#figure-5-5').evaluate(el => el.getBoundingClientRect().top)) < 150);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator('#chapter-navigation').isVisible(), true);
    await page.goto(`${base}#sp413-s01355`);
    await page.waitForFunction(() => document.querySelector('#reader-status').hidden);
    await page.waitForTimeout(100);
    const mobilePosition = await page.evaluate(() => ({
      table: document.querySelector('#sp413-s01355').getBoundingClientRect().top,
      sidebar: document.querySelector('.study-sidebar').getBoundingClientRect().bottom,
    }));
    assert.ok(mobilePosition.table >= mobilePosition.sidebar, 'table deep links clear the sticky mobile outline');
    await page.locator('#study-search').fill('rabbit');
    await page.waitForURL('**/?q=rabbit#sp413-s01355');
    await page.waitForSelector('.result-preview-table');
    assert.equal(await page.locator('.result-preview-table tbody tr').count(), 1, 'matching table rows lead the excerpt');
    assert.match(await page.locator('.result-preview-table').innerText(), /Rabbits[\s\S]*2\.8[\s\S]*1\.1/);
    assert.match(await page.locator('.result-preview-table thead').innerText(), /m²/);
    assert.match(await page.locator('.result-preview-text').innerText(), /The focus of the system/);
    assert.equal(await page.locator('.result-preview-image img').getAttribute('src'), figure.image_path);
    assert.equal(await page.locator('#result-list').innerText().then(t => t.includes('Metadata-only placeholder')), false);
    assert.match(await page.locator('#search-status').innerText(), /Related-word search is currently unavailable/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const previewIds = await page.locator('[id]').evaluateAll(nodes => nodes.map(n => n.id));
    assert.equal(new Set(previewIds).size, previewIds.length, 'previews do not duplicate reader anchors');
    await page.locator('#study-search').fill('bunny');
    await page.waitForURL('**/?q=bunny#sp413-s01355');
    await page.waitForFunction(() => document.querySelector('#search-status').textContent.startsWith('No keyword matches.'));
    assert.equal(await page.locator('.search-result-link').count(), 0);
    await page.locator('#study-search').fill('bunny semantic');
    await page.waitForSelector('.result-preview-table');
    assert.equal(await page.locator('#search-status').isHidden(), true);
    assert.match(await page.locator('.result-preview-table').innerText(), /Rabbits/);
    await page.locator('.search-result-link').click();
    await page.waitForURL(`**/#${animalTable.id}`);
    assert.equal(await page.locator('#study-search').inputValue(), '');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
