import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudySearchDatabase, indexStudySegments } from '../src/study-search.js';
import { executeStudySearch } from '../src/study-search-api.js';

function makeDatabase() {
  const db = createStudySearchDatabase(':memory:');
  indexStudySegments(db, [
    {
      id: 'rotation', index: 1, type: 'text', pdf_page: 40, printed_page: 23,
      text: 'Rotation creates pseudogravity along the inner surface.',
      heading_context: 'Chapter 1 — The Colonization of Space',
      search_text: 'Chapter 1 — The Colonization of Space Rotation creates pseudogravity along the inner surface.',
      embedding: [1, 0],
    },
    {
      id: 'agriculture', index: 2, type: 'text', pdf_page: 50, printed_page: 33,
      text: 'Agriculture uses light and nutrient cycles.',
      heading_context: 'Chapter 5 — A Tour of the Colony',
      search_text: 'Agriculture uses light and nutrient cycles.',
      embedding: [0, 1],
    },
  ]);
  return db;
}

test('study search validates bounded query and explicit search modes', async () => {
  const db = makeDatabase();
  try {
    assert.equal((await executeStudySearch({ query: '   ', modes: ['bm25'] }, { database: db })).status, 400);
    assert.equal((await executeStudySearch({ query: 'x'.repeat(401), modes: ['bm25'] }, { database: db })).status, 400);
    assert.equal((await executeStudySearch({ query: 'habitat', modes: ['unknown'] }, { database: db })).status, 400);
    assert.equal((await executeStudySearch({ query: 'habitat', modes: [] }, { database: db })).status, 400);
  } finally {
    db.close();
  }
});

test('BM25 returns only compact public fields with PDF citations and avoids embedding calls', async () => {
  const db = makeDatabase();
  let embeddingCalls = 0;
  try {
    const result = await executeStudySearch(
      { query: 'rotation pseudogravity', modes: ['bm25'], limit: 5 },
      { database: db, embedQuery: async () => { embeddingCalls += 1; return [1, 0]; } },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.bm25[0].id, 'rotation');
    assert.equal(result.body.bm25[0].pdf_page, 40);
    assert.equal(result.body.bm25[0].heading_context, 'Chapter 1 — The Colonization of Space');
    assert.equal(Object.hasOwn(result.body.bm25[0], 'embedding'), false);
    assert.equal(embeddingCalls, 0);
  } finally {
    db.close();
  }
});

test('hybrid search uses the query embedder and returns independent BM25 and semantic rankings', async () => {
  const db = makeDatabase();
  const embeddedQueries = [];
  try {
    const result = await executeStudySearch(
      { query: '  artificial gravity  ', modes: ['bm25', 'semantic'], limit: 3 },
      { database: db, embedQuery: async (query) => { embeddedQueries.push(query); return [0.99, 0.01]; } },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.semantic_available, true);
    assert.equal(result.body.semantic[0].id, 'rotation');
    assert.deepEqual(embeddedQueries, ['artificial gravity']);
  } finally {
    db.close();
  }
});

test('semantic provider failure leaves lexical results available without exposing details', async () => {
  const db = makeDatabase();
  try {
    const result = await executeStudySearch(
      { query: 'rotation', modes: ['bm25', 'semantic'] },
      { database: db, embedQuery: async () => { throw new Error('private provider detail'); } },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.bm25[0].id, 'rotation');
    assert.deepEqual(result.body.semantic, []);
    assert.equal(result.body.semantic_available, false);
    assert.equal(JSON.stringify(result.body).includes('private provider detail'), false);
  } finally {
    db.close();
  }
});

test('study search reports unavailable when no local index exists', async () => {
  const result = await executeStudySearch({ query: 'rotation', modes: ['bm25'] }, { database: null });
  assert.equal(result.status, 503);
});
