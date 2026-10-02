import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = (process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3200/oneillsim').replace(/\/$/, '');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function assertPng(path) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `snapshot should return HTTP 200, got ${response.status}`);
    assert.match(response.headers.get('content-type') || '', /^image\/png/);
    const image = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(image.subarray(0, 8), pngSignature);
    assert.ok(image.length > 1000, 'rendered PNG should contain a real scene, not an empty image');
}

test('snapshot API renders the Three.js asset viewer to PNG', { timeout: 90000 }, async () => {
    await assertPng('/api/snapshot?scene=asset&asset=TorusHome_ModA&azimuth=38&elevation=22&distance=14&imageWidth=640&imageHeight=480');
});

test('snapshot API renders the game at URL-specified coordinates and angle', { timeout: 90000 }, async () => {
    await assertPng('/api/snapshot?scene=game&x=0&y=830&z=12&yaw=0&pitch=10&mode=human&imageWidth=640&imageHeight=480');
});
