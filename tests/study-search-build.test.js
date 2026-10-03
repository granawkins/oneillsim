import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStudySearchDatabase, indexStudySegments, searchStudyBm25, searchStudySemantic } from '../src/study-search.js';
import { buildStudySearchIndex } from '../assets/scripts/build_study_search.mjs';

async function makeScratchDirectory() {
  const base = tmpdir();
  return mkdtemp(path.join(base, 'study-search-build-'));
}

const segments = [
  {
    id: 'rotation', index: 1, type: 'text', pdf_page: 40, printed_page: 23,
    text: 'Rotation creates pseudogravity along the inner surface.',
    heading_context: 'Chapter 1 — The Colonization of Space',
    search_text: 'Chapter 1 — The Colonization of Space Rotation creates pseudogravity along the inner surface.',
  },
  {
    id: 'agriculture', index: 2, type: 'text', pdf_page: 50, printed_page: 33,
    text: 'Agriculture uses light and nutrient cycles.',
    heading_context: 'Chapter 5 — A Tour of the Colony',
    search_text: 'Chapter 5 — A Tour of the Colony Agriculture uses light and nutrient cycles.',
  },
];

test('search-index build persists FTS and vectors outside the static segment JSON', async () => {
  const directory = await makeScratchDirectory();
  const segmentsPath = path.join(directory, 'segments.json');
  const databasePath = path.join(directory, 'private', 'study-search.sqlite3');
  try {
    await writeFile(segmentsPath, JSON.stringify({ metadata: { segment_count: segments.length }, segments }));
    const result = await buildStudySearchIndex({
      segmentsPath,
      databasePath,
      batchSize: 1,
      delayMs: 0,
      embedBatch: async (batch) => batch.map((text) => text.includes('Rotation') ? [1, 0] : [0, 1]),
    });
    assert.equal(result.segment_count, 2);
    assert.equal(result.dimensions, 2);
    assert.equal(result.database_path, databasePath);
    const staticPayload = JSON.parse(await (await import('node:fs/promises')).readFile(segmentsPath, 'utf8'));
    assert.equal(Object.hasOwn(staticPayload.segments[0], 'embedding'), false);
    const db = createStudySearchDatabase(databasePath);
    try {
      assert.equal(searchStudyBm25(db, 'pseudogravity', 5)[0].id, 'rotation');
      assert.equal(searchStudySemantic(db, [0.99, 0.01], 5)[0].id, 'rotation');
    } finally {
      db.close();
    }
    assert.equal((await stat(databasePath)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(databasePath))).mode & 0o777, 0o700);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed embedding leaves the previously indexed database unchanged', async () => {
  const directory = await makeScratchDirectory();
  const segmentsPath = path.join(directory, 'segments.json');
  const databasePath = path.join(directory, 'study-search.sqlite3');
  try {
    await writeFile(segmentsPath, JSON.stringify({ metadata: { segment_count: segments.length }, segments }));
    const db = createStudySearchDatabase(databasePath);
    indexStudySegments(db, [{ ...segments[0], embedding: [1, 0] }]);
    db.close();
    await assert.rejects(buildStudySearchIndex({
      segmentsPath,
      databasePath,
      delayMs: 0,
      embedBatch: async () => { throw new Error('test provider failure'); },
    }), /test provider failure/);
    const preserved = createStudySearchDatabase(databasePath);
    try {
      assert.equal(searchStudyBm25(preserved, 'pseudogravity', 5)[0].id, 'rotation');
    } finally {
      preserved.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
