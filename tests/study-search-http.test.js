import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createStudySearchDatabase, indexStudySegments } from '../src/study-search.js';
import { handleStudySearchHttp } from '../src/study-search-http.js';

function request(body, method = 'POST', contentType = 'application/json') {
  const stream = Readable.from([Buffer.from(body)]);
  stream.method = method;
  stream.headers = { 'content-type': contentType };
  return stream;
}

function captureResponse() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = '') { this.body = body.toString(); },
  };
}

function makeDatabase() {
  const db = createStudySearchDatabase(':memory:');
  indexStudySegments(db, [{
    id: 'rotation', index: 1, type: 'text', pdf_page: 40, printed_page: 23,
    text: 'Rotation creates pseudogravity along the inner surface.',
    heading_context: 'Chapter 1 — The Colonization of Space',
    embedding: [1, 0],
  }]);
  return db;
}

test('HTTP handler returns compact search JSON with no-store and nosniff headers', async () => {
  const db = makeDatabase();
  try {
    const response = captureResponse();
    await handleStudySearchHttp(request(JSON.stringify({ query: 'rotation', modes: ['bm25'] })), response, { database: db });
    assert.equal(response.status, 200);
    assert.match(response.headers['Content-Type'], /application\/json/);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(JSON.parse(response.body).bm25[0].id, 'rotation');
  } finally {
    db.close();
  }
});

test('HTTP handler rejects wrong methods, content types, malformed JSON, and oversized bodies', async () => {
  const db = makeDatabase();
  try {
    const methodResponse = captureResponse();
    await handleStudySearchHttp(request('{}', 'GET'), methodResponse, { database: db });
    assert.equal(methodResponse.status, 405);

    const typeResponse = captureResponse();
    await handleStudySearchHttp(request('{}', 'POST', 'text/plain'), typeResponse, { database: db });
    assert.equal(typeResponse.status, 415);

    const jsonResponse = captureResponse();
    await handleStudySearchHttp(request('{bad json'), jsonResponse, { database: db });
    assert.equal(jsonResponse.status, 400);

    const largeResponse = captureResponse();
    await handleStudySearchHttp(request(JSON.stringify({ query: 'x'.repeat(20_000), modes: ['bm25'] })), largeResponse, { database: db });
    assert.equal(largeResponse.status, 413);
  } finally {
    db.close();
  }
});
