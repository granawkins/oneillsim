import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = (process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3200/oneillsim').replace(/\/$/, '');

test('simulation home links to the asset gallery', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /href="assets\/"/, 'the primary page should expose the asset library');
});
