import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudySearchDatabase,
  indexStudySegments,
  sanitizeStudySearchQuery,
  searchStudyBm25,
  searchStudySemantic,
} from '../src/study-search.js';

function fixtureSegments() {
  return [
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
      search_text: 'Agriculture uses light and nutrient cycles.',
      embedding: [0, 1],
    },
    {
      id: 'housing', index: 3, type: 'image', pdf_page: 108, printed_page: 91,
      text: 'Terraced homes line the central plain.',
      caption: 'Terrace housing exterior views.',
      description: 'Perspective drawing of stepped homes.',
      search_text: 'Terraced homes line the central plain. Terrace housing exterior views.',
      embedding: [0.8, 0.2],
    },
  ];
}

test('BM25 search returns matching report segments in relevance order with page references', () => {
  const db = createStudySearchDatabase(':memory:');
  try {
    indexStudySegments(db, fixtureSegments());
    const results = searchStudyBm25(db, 'rotation pseudogravity', 5);
    assert.equal(results[0].id, 'rotation');
    assert.equal(results[0].pdf_page, 40);
    assert.equal(results[0].printed_page, 23);
  } finally {
    db.close();
  }
});

test('BM25 search includes section headings as context for paragraph segments', () => {
  const db = createStudySearchDatabase(':memory:');
  try {
    indexStudySegments(db, fixtureSegments());
    const results = searchStudyBm25(db, 'colonization', 5);
    assert.equal(results[0].id, 'rotation');
    assert.equal(results[0].heading_context, 'Chapter 1 — The Colonization of Space');
  } finally {
    db.close();
  }
});

test('semantic ranking uses cosine similarity over persisted SQLite vectors', () => {
  const db = createStudySearchDatabase(':memory:');
  try {
    indexStudySegments(db, fixtureSegments());
    const results = searchStudySemantic(db, [0.99, 0.01], 3);
    assert.equal(results[0].id, 'rotation');
    assert.equal(results[1].id, 'housing');
    assert.ok(results[0].score > results[1].score);
  } finally {
    db.close();
  }
});

test('BM25 query syntax is built from quoted user tokens, not executable FTS operators', () => {
  assert.equal(sanitizeStudySearchQuery('food OR * "water"'), '"food" AND "or" AND "water"');
  assert.equal(sanitizeStudySearchQuery('   '), '');
});

test('indexing rejects inconsistent or non-finite embeddings', () => {
  const db = createStudySearchDatabase(':memory:');
  try {
    assert.throws(() => indexStudySegments(db, [
      { ...fixtureSegments()[0], embedding: [1, 0] },
      { ...fixtureSegments()[1], embedding: [0, 1, 0] },
    ]), /dimension/i);
    assert.throws(() => indexStudySegments(db, [
      { ...fixtureSegments()[0], embedding: [Number.NaN, 0] },
    ]), /finite/i);
  } finally {
    db.close();
  }
});
