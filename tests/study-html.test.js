import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studyDir = path.resolve(process.env.STUDY_TEST_DIR || path.join(projectRoot, 'study'));
const studyHtmlPath = path.join(studyDir, 'index.html');
const segmentsPath = path.join(studyDir, 'segments.json');
const assetHtmlPath = path.join(projectRoot, 'assets', 'index.html');

let studyHtml;
let segmentsData;

async function loadStudy() {
  studyHtml ??= await readFile(studyHtmlPath, 'utf8');
  return studyHtml;
}

async function loadSegments() {
  segmentsData ??= JSON.parse(await readFile(segmentsPath, 'utf8'));
  return segmentsData;
}

test('study reader is a continuous article with an accessible chapter menu and visible search-results region', async () => {
  const html = await loadStudy();
  assert.match(html, /id="study-search"/);
  assert.match(html, /id="chapter-menu-toggle"/);
  assert.match(html, /id="chapter-navigation"/);
  assert.match(html, /id="search-results"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="study-article"/);
  assert.match(html, /Chapter 1/i);
  assert.doesNotMatch(html, /class="report-page"/);
  assert.doesNotMatch(html, /id="page-jump"/);
});

test('ordered segments retain original PDF citations and keep each table as one described segment', async () => {
  const data = await loadSegments();
  const segments = data.segments;
  assert.equal(data.metadata.pdf_pages, 204);
  assert.equal(data.metadata.table_count, 84);
  assert.equal(data.metadata.image_count, 106);
  assert.equal(segments.length, data.metadata.segment_count);
  assert.deepEqual(segments.map((segment) => segment.index), segments.map((_, index) => index + 1));
  assert.ok(segments.every((segment) => segment.id && segment.pdf_page >= 1 && segment.source_url.includes(`#page=${segment.pdf_page}`)));

  const tables = segments.filter((segment) => segment.type === 'table');
  assert.equal(tables.length, 84);
  assert.ok(tables.every((segment) => segment.description && segment.table_markdown.startsWith('|')));
  const images = segments.filter((segment) => segment.type === 'image');
  assert.equal(images.length, 106);
  assert.ok(images.every((segment) => segment.image_path && segment.description));
  assert.ok(!images.some((segment) => /p0026-13|p0027-09|p0038-09/.test(segment.image_path)));
  assert.ok(segments.some((segment) => segment.type === 'heading' && /Solar radiation: an abundant, essential source of energy/i.test(segment.text)));
  assert.ok(segments.some((segment) => segment.text.includes('The focus of the system is a space habitat')));
  assert.ok(!segments.some((segment) => /DIAGRAM LABEL|INITIAL EXPORT/.test(segment.text)));
});

test('housing figure anchors and chapter navigation targets exist in the continuous reader', async () => {
  const html = await loadStudy();
  const data = await loadSegments();
  for (const anchor of ['figure-5-5', 'figure-5-6', 'figure-5-7', 'appendix-b']) {
    assert.ok(data.segments.some((segment) => segment.anchor === anchor || segment.id === anchor), `missing segment anchor ${anchor}`);
  }
  for (const page of ['018', '026', '038', '056', '104', '130', '156', '188', '196']) {
    assert.match(html, new RegExp(`href="#pdf-${page}"`), `missing chapter target for PDF page ${page}`);
  }
});

test('credited Figure 4-8 remains described in text and links to the NASA source, not a copied image', async () => {
  const html = await loadStudy();
  const data = await loadSegments();
  assert.match(html, /ntrs\.nasa\.gov\/citations\/19770014162/);
  assert.match(html, /not been individually rights-cleared/i);
  assert.ok(data.segments.some((segment) => segment.text.includes('Figure 4-8')));
  assert.ok(!data.segments.some((segment) => segment.image_path?.includes('p0067')));
});

test('asset gallery still links directly to report housing figures', async () => {
  const assets = await readFile(assetHtmlPath, 'utf8');
  assert.match(assets, /\.\.\/study\/#figure-5-5/);
  assert.match(assets, /\.\.\/study\/#figure-5-6/);
  assert.match(assets, /\.\.\/study\/#figure-5-7/);
});
