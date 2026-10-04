import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { interceptCandidate } from './candidate-interception.js';

const baseUrl = (process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3200/oneillsim').replace(/\/$/, '');
const executablePath = process.env.SNAPSHOT_CHROMIUM_PATH || '/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome';
const launch = () => chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

test('live scene loads six WebP faces and repeat visits reuse the skybox cache', { timeout: 90000 }, async () => {
    const browser = await launch();
    try {
        const page = await browser.newPage({ viewport: process.env.ONEILLSIM_CANDIDATE === '1' ? { width: 320, height: 240 } : { width: 1024, height: 720 } });
        await interceptCandidate(page, { enabled: process.env.ONEILLSIM_CANDIDATE === '1' });

        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${baseUrl}/?capture=1&pitch=10`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__oneillSimReady || window.__oneillSimError, null, { timeout: 30000 });
        await page.waitForFunction(async () => {
            const { getStars } = await import(new URL('src/stars.js', location.href));
            return getStars()?.images.filter(image => image?.complete && image?.naturalWidth === 1024).length === 6;
        }, null, { timeout: 30000 });
        const state = await page.evaluate(async () => {
            const { editorState } = await import(new URL('src/editor/state.js', location.href));
            const world = await fetch('world.json').then(response => response.json());
            return { error: window.__oneillSimError || null, firstFrame: window.__oneillSimFirstFrame,
                placed: editorState.placedAssets.length, saved: world.assets.length,
                skyboxes: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/skybox/')).map(entry => ({ url: entry.name, bytes: entry.encodedBodySize })) };
        });
        assert.equal(state.error, null);
        assert.equal(state.firstFrame, true);
        assert.equal(state.placed, state.saved);
        assert.equal(state.skyboxes.length, 6);
        assert.ok(state.skyboxes.every(entry => entry.url.endsWith('.webp')));
        assert.deepEqual(errors, []);
        if (process.env.ONEILLSIM_SCREENSHOT_PATH) await page.screenshot({ path: process.env.ONEILLSIM_SCREENSHOT_PATH });
        if (process.env.ONEILLSIM_CANDIDATE === '1') {
            // Playwright routing disables Chromium's HTTP cache globally. The
            // candidate load above verifies integration; cache itself is checked
            // on two ordinary, unrouted read-only visits to the unchanged server.
            await page.unrouteAll();
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.__oneillSimReady || window.__oneillSimError, null, { timeout: 30000 });
            await page.waitForFunction(async () => {
                const { getStars } = await import(new URL('src/stars.js', location.href));
                return getStars()?.images.every(image => image?.complete && image?.naturalWidth === 1024);
            }, null, { timeout: 30000 });
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__oneillSimReady || window.__oneillSimError, null, { timeout: 30000 });
        const cached = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/skybox/')).map(entry => entry.transferSize));
        assert.equal(cached.length, 6);
        assert.ok(cached.every(bytes => bytes === 0), `expected six cached skybox faces, got ${cached}`);
        console.log(JSON.stringify({ liveScene: state, cachedSkyboxTransfers: cached, cacheCheck: process.env.ONEILLSIM_CANDIDATE === '1' ? 'unrouted live service (routing disables HTTP cache)' : 'live service' }));
    } finally { await browser.close(); }
});

test('browser-only delayed model fixture renders early and blocks saving until ready', { timeout: 90000 }, async () => {
    const browser = await launch();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    try {
        const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
        await interceptCandidate(page, { enabled: process.env.ONEILLSIM_CANDIDATE === '1' });
        let modelsRequested = 0;
        // Modify only the GET response inside this browser, never production data.
        await page.route('**/world.json', async route => {
            assert.equal(route.request().method(), 'GET');
            const response = await route.fetch();
            const world = await response.json();
            const typeIndex = world.assetTypes.indexOf('TorusHome_ModA');
            const index = typeIndex < 0 ? world.assetTypes.push('TorusHome_ModA') - 1 : typeIndex;
            world.assets.push(['test-loading-a', index, 0.1, 0, 1, 0], ['test-loading-b', index, 0.2, 0, 1, 0]);
            await route.fulfill({ response, json: world });
        });
        await page.route('**/*.obj', async route => { modelsRequested++; await gate; await route.continue(); });
        await page.goto(`${baseUrl}/?capture=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__oneillSimFirstFrame, null, { timeout: 30000 });
        const loading = await page.evaluate(() => {
            let saveBlocked = false;
            try { window.saveWorld(); } catch (error) { saveBlocked = error.message.includes('still loading'); }
            return { ready: window.__oneillSimReady, saveBlocked, text: document.querySelector('#overlay span').textContent };
        });
        assert.equal(loading.ready, false);
        assert.equal(loading.saveBlocked, true);
        assert.match(loading.text, /Loading/);
        release();
        await page.waitForFunction(() => window.__oneillSimReady || window.__oneillSimError, null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => window.__oneillSimError || null), null);
        assert.equal(modelsRequested, 1, 'duplicate placements must reuse one model download');
    } finally { release(); await browser.close(); }
});
