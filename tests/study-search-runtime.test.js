import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createStudySearchDatabase, indexStudySegments, searchStudyBm25 } from '../src/study-search.js';
import { openStudySearchDatabase } from '../src/study-search-runtime.js';

async function makeScratchDirectory() {
  const base = process.env.TMPDIR || path.join(homedir(), '.hermes', 'cache', 'scratch');
  return mkdtemp(path.join(base, 'study-search-runtime-'));
}

const segment = {
  id: 'rotation', index: 1, type: 'text', pdf_page: 40, printed_page: 23,
  text: 'Rotation creates pseudogravity along the inner surface.',
  heading_context: 'Chapter 1 — The Colonization of Space',
  embedding: [1, 0],
};

async function makeStaticSegments(pathname, count = 1) {
  await writeFile(pathname, JSON.stringify({ metadata: { segment_count: count }, segments: [segment] }));
}

test('missing study-search database stays unavailable and is not created at startup', async () => {
  const directory = await makeScratchDirectory();
  const databasePath = path.join(directory, 'missing.sqlite3');
  const segmentsPath = path.join(directory, 'segments.json');
  try {
    await makeStaticSegments(segmentsPath);
    assert.equal(openStudySearchDatabase(databasePath, segmentsPath), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runtime opens a complete local FTS/vector index matching static segment metadata', async () => {
  const directory = await makeScratchDirectory();
  const databasePath = path.join(directory, 'study.sqlite3');
  const segmentsPath = path.join(directory, 'segments.json');
  try {
    const db = createStudySearchDatabase(databasePath);
    indexStudySegments(db, [segment]);
    db.close();
    await makeStaticSegments(segmentsPath);
    const opened = openStudySearchDatabase(databasePath, segmentsPath);
    assert.ok(opened);
    try {
      assert.equal(searchStudyBm25(opened, 'pseudogravity', 1)[0].id, 'rotation');
    } finally {
      opened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runtime rejects an index whose table counts do not match static segment metadata', async () => {
  const directory = await makeScratchDirectory();
  const databasePath = path.join(directory, 'study.sqlite3');
  const segmentsPath = path.join(directory, 'segments.json');
  try {
    const db = createStudySearchDatabase(databasePath);
    indexStudySegments(db, [segment]);
    db.close();
    await makeStaticSegments(segmentsPath, 2);
    assert.equal(openStudySearchDatabase(databasePath, segmentsPath), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
