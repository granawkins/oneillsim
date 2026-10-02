import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudyEmbeddingQueryService } from '../src/study-embedding-cache.js';

test('semantic query cache deduplicates normalized repeated and concurrent requests', async () => {
  let calls = 0;
  let release;
  const service = createStudyEmbeddingQueryService({
    embed: async (query) => {
      calls += 1;
      await new Promise((resolve) => { release = resolve; });
      return [query.length, 1];
    },
  });
  const first = service('Artificial   Gravity');
  const second = service(' artificial gravity ');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [[20, 1], [20, 1]]);
  assert.deepEqual(await service('ARTIFICIAL GRAVITY'), [20, 1]);
  assert.equal(calls, 1);
});

test('semantic query service bounds provider requests per time window while allowing cached queries', async () => {
  let currentTime = 1_000;
  let calls = 0;
  const service = createStudyEmbeddingQueryService({
    embed: async (query) => { calls += 1; return [query.length]; },
    maxQueriesPerWindow: 1,
    windowMs: 100,
    cacheTtlMs: 1_000,
    now: () => currentTime,
  });
  assert.deepEqual(await service('first'), [5]);
  assert.deepEqual(await service('first'), [5]);
  await assert.rejects(service('second'), /limit/i);
  currentTime += 101;
  assert.deepEqual(await service('second'), [6]);
  assert.equal(calls, 2);
});

test('semantic query service releases pending requests after provider failure', async () => {
  let calls = 0;
  const service = createStudyEmbeddingQueryService({
    embed: async () => {
      calls += 1;
      if (calls === 1) throw new Error('provider unavailable');
      return [1, 0];
    },
  });
  await assert.rejects(service('habitat'), /provider unavailable/);
  assert.deepEqual(await service('habitat'), [1, 0]);
  assert.equal(calls, 2);
});
