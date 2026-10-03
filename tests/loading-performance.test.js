import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { prepareStaticResponse, acceptsGzip, cachePolicy } from '../src/static-response.js';
import { runLoadQueue } from '../src/load-queue.js';

const contents = Buffer.from('v 1.0000 2.0000 3.0000\n'.repeat(2000));
const options = { path: 'assets/model.obj', extension: '.obj', contents, contentType: 'text/plain; charset=utf-8' };

test('text is gzipped, varies by encoding, and round trips exactly', async () => {
    const response = await prepareStaticResponse({ ...options, requestHeaders: { 'accept-encoding': 'br, gzip' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Encoding'], 'gzip');
    assert.equal(response.headers.Vary, 'Accept-Encoding');
    assert.deepEqual(gunzipSync(response.body), contents);
    assert.ok(response.body.length < contents.length / 4);
});

test('encoding negotiation respects gzip refusal and wildcard preferences', () => {
    assert.equal(acceptsGzip('br, gzip;q=0'), false);
    assert.equal(acceptsGzip('*;q=1, gzip;q=0'), false);
    assert.equal(acceptsGzip('*;q=0.5'), true);
    assert.equal(acceptsGzip('gzip;q=0.5'), true);
    assert.equal(acceptsGzip(''), false);
});

test('unversioned assets revalidate and matching ETags return 304', async () => {
    const first = await prepareStaticResponse(options);
    assert.equal(first.headers['Cache-Control'], 'public, max-age=0, must-revalidate');
    const second = await prepareStaticResponse({ ...options, requestHeaders: { 'if-none-match': `W/${first.headers.ETag}` } });
    assert.equal(second.status, 304);
    assert.equal(second.body, undefined);
    assert.equal(second.headers['Content-Length'], undefined);
    const changed = await prepareStaticResponse({ ...options, contents: Buffer.from('changed'), requestHeaders: { 'if-none-match': first.headers.ETag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.ETag, first.headers.ETag);
});

test('world stays fresh even with a matching ETag; immutable cache only for fingerprinted skyboxes', async () => {
    const first = await prepareStaticResponse({ ...options, path: 'world.json', extension: '.json' });
    const second = await prepareStaticResponse({ ...options, path: 'world.json', extension: '.json', requestHeaders: { 'if-none-match': first.headers.ETag } });
    assert.equal(second.status, 200);
    assert.equal(second.headers['Cache-Control'], 'no-store');
    assert.equal(cachePolicy('assets/skybox/skybox_front.1024.abcdef123456.webp'), 'public, max-age=31536000, immutable');
    assert.equal(cachePolicy('src/main.js'), 'public, max-age=0, must-revalidate');
});

test('images are never gzipped and encoding variants have different validators', async () => {
    const image = await prepareStaticResponse({ ...options, extension: '.webp', requestHeaders: { 'accept-encoding': 'gzip' } });
    assert.equal(image.headers['Content-Encoding'], undefined);
    const plain = await prepareStaticResponse(options);
    const zipped = await prepareStaticResponse({ ...options, requestHeaders: { 'accept-encoding': 'gzip', 'if-none-match': plain.headers.ETag } });
    assert.equal(zipped.status, 200);
    assert.notEqual(zipped.headers.ETag, plain.headers.ETag);
});

test('queue deduplicates models, loads in parallel, and respects the limit', async () => {
    let active = 0, maxActive = 0;
    const loaded = [];
    await runLoadQueue(['a', 'b', 'a', 'c', 'd', 'e'], async (name) => {
        active++; maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 10));
        loaded.push(name); active--;
    }, 3);
    assert.equal(maxActive, 3);
    assert.deepEqual(loaded.sort(), ['a', 'b', 'c', 'd', 'e']);
    await runLoadQueue([], () => { throw new Error('empty queue called loader'); });
    await assert.rejects(runLoadQueue(['a'], async () => {}, 0), RangeError);
});
