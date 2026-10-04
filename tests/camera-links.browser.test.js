import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { interceptCandidate } from './candidate-interception.js';

const baseUrl = (process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3200/oneillsim').replace(/\/$/, '');
const executablePath = process.env.SNAPSHOT_CHROMIUM_PATH || '/home/granawkins/.hermes/tools/chromium-1208/chrome-linux64/chrome';

test('camera URL parameters set a stable human view and capture mode', { timeout: 90000 }, async () => {
    const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
        await interceptCandidate(page, { enabled: process.env.ONEILLSIM_CANDIDATE === '1' });
        await page.goto(`${baseUrl}/?x=0&y=830&z=12&yaw=0&pitch=10&capture=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__oneillSimReady === true || window.__oneillSimError, null, { timeout: 12000 });
        const state = await page.evaluate(() => ({
            view: window.__oneillSimView,
            initError: window.__oneillSimError || null,
            captureClass: document.documentElement.classList.contains('capture-mode'),
            uiHidden: getComputedStyle(document.getElementById('ui')).display === 'none',
            overlayHidden: getComputedStyle(document.getElementById('overlay')).display === 'none',
        }));
        assert.equal(state.initError, null, `app initialization should complete: ${state.initError}`);
        assert.ok(state.view, 'the resolved camera preset should be exposed for stable, inspectable captures');
        assert.equal(state.view.mode, 'human');
        assert.equal(state.view.z, 12);
        assert.equal(state.view.thetaDegrees, 90);
        assert.equal(state.view.pitchDegrees, 10);
        assert.equal(state.captureClass, true);
    } finally {
        await browser.close();
    }
});
