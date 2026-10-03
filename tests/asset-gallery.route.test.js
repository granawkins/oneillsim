import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3200/oneillsim').replace(/\/$/, '');
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

async function fetchOk(path) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `${path} should return HTTP 200, got ${response.status}`);
    return response;
}

test('asset gallery route serves a technical viewer and its active model files', async () => {
    const response = await fetchOk('/assets/houses/');
    const html = await response.text();
    assert.match(html, /Stanford Torus.*Asset Library/i);
    assert.match(html, /asset-canvas/);
    assert.match(html, /TECHNICAL RECORD/);

    const css = await fetchOk('/assets/gallery.css');
    assert.match(await css.text(), /viewer-shell/);
    const script = await fetchOk('/assets/gallery.js');
    const scriptText = await script.text();
    assert.match(scriptText, /queryNumber\('distance', 17/, 'interactive viewer and API should share the wider default framing');
    assert.match(scriptText, /TorusHome_ModA/);
    assert.match(html, /distance=17/, 'the downloadable snapshot link should use the whole-house framing');
    assert.match(html, /scene=game&amp;x=778\.9737&amp;y=286\.5310&amp;z=8&amp;yaw=0&amp;pitch=10&amp;mode=human/, 'the page should provide a concrete saved-world camera example');
    const manifestResponse = await fetchOk('/assets/ultimate-buildings/TorusHome_ModA.asset.json');
    const manifest = await manifestResponse.json();
    assert.equal(manifest.id, 'TorusHome_ModA');
});

test('bare /study path resolves to the reading edition', async () => {
    const response = await fetchOk('/study');
    assert.match(await response.text(), /Space Settlements: A Design Study/);
});

test('JPEG routes use an explicit image MIME type without tracked figure images', async (t) => {
    const hostname = new URL(baseUrl).hostname;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) {
        t.skip('the temporary image route test only runs against a local server');
        return;
    }

    const imageDirectory = join(projectRoot, 'study', 'images');
    const imageName = `route-mime-test-${process.pid}.jpg`;
    const imagePath = join(imageDirectory, imageName);
    await mkdir(imageDirectory, { recursive: true });
    try {
        await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
        const image = await fetchOk(`/study/images/${imageName}`);
        assert.ok((image.headers.get('content-type') || '').startsWith('image/jpeg'));
    } finally {
        await unlink(imagePath).catch(() => {});
        await rm(imageDirectory, { force: true }).catch(() => {});
    }
});

test('the source NASA PDF is never served from the project directory', async () => {
    const response = await fetch(`${baseUrl}/docs/reference/nasa-sp-413-space-settlements-a-design-study.pdf`);
    assert.equal(response.status, 404);
});

test('static routes do not serve a symlink pointing outside the project root', async (t) => {
    const hostname = new URL(baseUrl).hostname;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) {
        t.skip('the symlink route test only runs against a local server');
        return;
    }

    const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'oneillsim-static-symlink-'));
    const markerPath = join(scratch, 'private-marker.txt');
    const linkName = `oneillsim-symlink-test-${process.pid}.txt`;
    const linkPath = join(projectRoot, 'assets', linkName);
    const marker = 'outside-root-symlink-marker';
    await writeFile(markerPath, marker);

    try {
        await symlink(markerPath, linkPath);
        const response = await fetch(`${baseUrl}/assets/${linkName}`);
        assert.ok([403, 404].includes(response.status), `symlink route should be rejected, got ${response.status}`);
        assert.notEqual(await response.text(), marker);
    } finally {
        await unlink(linkPath).catch(() => {});
        await rm(scratch, { recursive: true, force: true });
    }
});
