import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  embedTextCollection,
  readOpenRouterApiKey,
  requestOpenRouterEmbeddings,
} from '../src/study-embeddings.js';

const apiKey = 'test-key-never-logged';

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

test('embedding request batches text, sets requested dimensions, and restores response order', async () => {
  let sent;
  const vectors = await requestOpenRouterEmbeddings(['first', 'second'], {
    apiKey,
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return okJson({ data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ] });
    },
    dimensions: 2,
    model: 'test/model',
  });
  assert.equal(sent.url, 'https://openrouter.ai/api/v1/embeddings');
  assert.equal(sent.options.headers.Authorization, `Bearer ${apiKey}`);
  assert.deepEqual(sent.body.input, ['first', 'second']);
  assert.equal(sent.body.dimensions, 2);
  assert.deepEqual(vectors, [[1, 0], [0, 1]]);
});

test('embedding response rejects wrong dimensions, duplicate indexes, and non-finite values', async () => {
  await assert.rejects(requestOpenRouterEmbeddings(['one'], {
    apiKey, dimensions: 2, fetchImpl: async () => okJson({ data: [{ index: 0, embedding: [1] }] }),
  }), /dimension/i);
  await assert.rejects(requestOpenRouterEmbeddings(['one', 'two'], {
    apiKey, dimensions: 2, fetchImpl: async () => okJson({ data: [
      { index: 0, embedding: [1, 0] }, { index: 0, embedding: [0, 1] },
    ] }),
  }), /index/i);
  await assert.rejects(requestOpenRouterEmbeddings(['one'], {
    apiKey, dimensions: 2, fetchImpl: async () => okJson({ data: [{ index: 0, embedding: [Number.NaN, 0] }] }),
  }), /finite/i);
});

test('embedding collection retries transient failures and preserves segment order across batches', async () => {
  let calls = 0;
  const vectors = await embedTextCollection(['a', 'b', 'c'], {
    batchSize: 2,
    delayMs: 0,
    sleep: async () => {},
    embedBatch: async (batch) => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('temporary');
        error.retryable = true;
        throw error;
      }
      return batch.map((_, index) => [calls, index]);
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(vectors, [[2, 0], [2, 1], [3, 0]]);
});

test('embedding collection reports batch completion without leaking input or vectors', async () => {
  const progress = [];
  await embedTextCollection(['a', 'b', 'c'], {
    batchSize: 2,
    delayMs: 0,
    embedBatch: async (batch) => batch.map(() => [1, 0]),
    onBatch: (value) => progress.push(value),
  });
  assert.deepEqual(progress, [
    { completed: 2, total: 3 },
    { completed: 3, total: 3 },
  ]);
});

test('API key loader reads only the named variable from the shared environment file', async () => {
  const scratchDirectory = tmpdir();
  const directory = await mkdtemp(path.join(scratchDirectory, 'study-env-'));
  const envFile = path.join(directory, 'shared.env');
  try {
    await writeFile(envFile, 'OTHER_SECRET=do-not-read\nOPENROUTER_API_KEY="sample-secret"\n', { mode: 0o600 });
    assert.equal(await readOpenRouterApiKey({ env: {}, envFile }), 'sample-secret');
    assert.equal(await readOpenRouterApiKey({ env: { OPENROUTER_API_KEY: 'process-secret' }, envFile }), 'process-secret');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
