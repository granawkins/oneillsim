import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = (process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3200/oneillsim').replace(/\/$/, '');
const root = new URL('../', import.meta.url);
const kit = ['TorusBench_A', 'TorusTable_A', 'TorusPlanter_A', 'TorusRailing_A', 'TorusSign_A', 'TorusWasteBin_A'];
const obj = 'o Fixture\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl TorusStreetKit\nf 1/1 2/2 3/3\n';
const mtl = 'newmtl TorusStreetKit\nKd 1 1 1\nd 1\nmap_Kd TorusStreetKit_Atlas.png\n';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=', 'base64');

// GET-only fixture harness on the existing app origin; no server or world writes.
// Always intercept owned candidate modules, so a stale production build cannot
// make the test silently exercise old code. Models/catalog/atlas are bounded
// fixtures, independent of whether the parallel asset worker has finished.
async function harness(browser, failure = null) {
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    const counts = new Map();
    const stats = { active: 0, peak: 0, blocked: 0 };
    let failed = false;
    await page.route('**/*', async route => {
        const request = route.request();
        if (request.method() !== 'GET') { stats.blocked++; return route.abort('blockedbyclient'); }
        const url = new URL(request.url());
        const name = url.pathname.split('/').pop();
        if (url.pathname === new URL(`${baseUrl}/`).pathname) {
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>' });
        }
        if (url.hostname === 'cdn.jsdelivr.net') {
            const relative = url.pathname.split('/three@0.160.0/')[1];
            assert.ok(relative && !relative.includes('..'));
            return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(`node_modules/three/${relative}`, root)) });
        }
        if (url.pathname.endsWith('/src/editor/catalog.js')) {
            return route.fulfill({ contentType: 'text/javascript', body: 'export const BUILDINGS = ["FixtureHouse_A", "FixtureHouse_B"]; export const PLANTS = [];' });
        }
        for (const module of ['loader.js', 'placement.js']) {
            if (url.pathname.endsWith(`/src/editor/${module}`)) {
                return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(`src/editor/${module}`, root)) });
            }
        }
        if (url.pathname.includes('/assets/ultimate-buildings/')) {
            assert.ok([...kit, 'FixtureHouse_A', 'FixtureHouse_B'].some(id => name === `${id}.obj` || name === `${id}.mtl`) || name === 'TorusStreetKit_Atlas.png');
            if (name === 'FixtureHouse_A.mtl') stats.kitAtlasRequests = counts.get('TorusStreetKit_Atlas.png') || 0;
            counts.set(name, (counts.get(name) || 0) + 1);
            if (!failed && failure && name.endsWith(failure)) {
                failed = true;
                return route.fulfill({ status: 503, body: 'Intentional retry fixture' });
            }
            if (name.endsWith('.obj')) {
                stats.active++; stats.peak = Math.max(stats.peak, stats.active);
                await new Promise(resolve => setTimeout(resolve, 50));
                stats.active--;
                return route.fulfill({ contentType: 'text/plain', body: obj });
            }
            return route.fulfill({ contentType: name.endsWith('.png') ? 'image/png' : 'text/plain', body: name.endsWith('.png') ? png : mtl });
        }
        assert.equal(url.origin, new URL(baseUrl).origin, 'no unbounded external requests');
        return route.continue();
    });
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        window.kitTest = {
            THREE: await import('three'),
            loader: await import('./src/editor/loader.js'),
            placement: await import('./src/editor/placement.js'),
            physics: await import('./src/physics/collider-world.js')
        };
    });
    await page.waitForFunction(() => Boolean(window.kitTest?.placement), null, { timeout: 10000 });
    return { page, counts, stats };
}

const launch = () => chromium.launch({
    executablePath: process.env.SNAPSHOT_CHROMIUM_PATH || '/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});

test('kit shares one material/GPU texture, clones borrow safely, blockouts dispose, queue stays four-wide', { timeout: 60000 }, async () => {
    const browser = await launch();
    try {
        const { page, counts, stats } = await harness(browser);
        const result = await page.evaluate(async kit => {
            const { THREE, loader, placement, physics } = window.kitTest;
            let progress = [];
            await loader.preloadAssets([...kit, ...kit], (loaded, total) => progress.push([loaded, total]));
            const objects = await Promise.all([...kit, ...kit].map(id => loader.loadAsset(id)));
            const mesh = object => object.children.find(child => child.isMesh);
            const reference = mesh(objects[0]);
            const sameMaterial = objects.every(object => mesh(object).material === reference.material);
            const sameMap = objects.every(object => mesh(object).material.map === reference.material.map);
            const sameGeometry = kit.every((id, i) => mesh(objects[i]).geometry === mesh(objects[i + kit.length]).geometry && mesh(loader.getAsset(id)).geometry === mesh(objects[i]).geometry);
            const distinctClones = objects[0] !== objects[6] && objects[0].children[0] !== objects[6].children[0];
            const scene = new THREE.Scene();
            objects.forEach(object => scene.add(object));
            scene.add(new THREE.AmbientLight(0xffffff));
            const camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
            camera.position.set(.2, .2, 3);
            const renderer = new THREE.WebGLRenderer(); renderer.setSize(64, 64);
            renderer.render(scene, camera);
            const gpuTextures = renderer.info.memory.textures;
            const habitat = new THREE.Group(); placement.initPlacement(habitat);
            const ids = await Promise.all([placement.placeAsset(kit[0], .1, 0, 1), placement.placeAsset(kit[0], .2, 0, 1)]);
            const survivorCollider = physics.characterColliders.colliders.get(ids[1]);
            let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0;
            reference.geometry.addEventListener('dispose', () => geometryDisposals++);
            reference.material.addEventListener('dispose', () => materialDisposals++);
            reference.material.map.addEventListener('dispose', () => textureDisposals++);
            const removed = placement.removeAsset(ids[0]);
            const survivorIntact = !physics.characterColliders.colliders.has(ids[0]) && physics.characterColliders.colliders.get(ids[1]) === survivorCollider && survivorCollider.length > 0 && habitat.children.length === 1;
            const after = await loader.loadAsset(kit[0]);
            const afterSame = mesh(after).geometry === reference.geometry && mesh(after).material === reference.material;
            // A unique replacement material is owned, even on a borrowed clone.
            const survivingMesh = mesh(habitat.children[0]);
            survivingMesh.material = survivingMesh.material.clone();
            let replacementDisposals = 0;
            survivingMesh.material.addEventListener('dispose', () => replacementDisposals++);
            placement.removeAsset(ids[1]);
            await placement.loadPlacedAssets([{ id: 'fixture-block', theta: .3, z: 0, scale: 1, blockout: { width: 24, height: 1, depth: 1, color: 0x888888 } }]);
            const block = habitat.children[0];
            let blockGeometryDisposals = 0, blockMaterialDisposals = 0;
            block.children.forEach(child => child.geometry.addEventListener('dispose', () => blockGeometryDisposals++));
            block.children[0].material.addEventListener('dispose', () => blockMaterialDisposals++);
            placement.removeAsset('fixture-block');
            const houses = await Promise.all(['FixtureHouse_A', 'FixtureHouse_B'].map(id => loader.loadAsset(id)));
            const housesIsolated = mesh(houses[0]).material !== mesh(houses[1]).material && mesh(houses[0]).material.map !== mesh(houses[1]).material.map && mesh(houses[0]).material !== reference.material;
            // Verify the guard really blocks writes without touching the live world.
            await fetch('world.json', { method: 'PUT', body: '{}' }).catch(() => {});
            renderer.dispose();
            return { sameMaterial, sameMap, sameGeometry, distinctClones, gpuTextures, removed, survivorIntact, afterSame, geometryDisposals, materialDisposals, textureDisposals, replacementDisposals, blockGeometryDisposals, blockMaterialDisposals, housesIsolated, progress };
        }, kit);
        for (const key of ['sameMaterial', 'sameMap', 'sameGeometry', 'distinctClones', 'removed', 'survivorIntact', 'afterSame', 'housesIsolated']) assert.equal(result[key], true, key);
        assert.equal(result.gpuTextures, 1);
        for (const key of ['geometryDisposals', 'materialDisposals', 'textureDisposals']) assert.equal(result[key], 0, key);
        assert.equal(result.replacementDisposals, 1);
        assert.equal(result.blockGeometryDisposals, 2);
        assert.equal(result.blockMaterialDisposals, 1);
        assert.deepEqual(result.progress, kit.map((_, i) => [i + 1, 6]));
        kit.forEach(id => assert.equal(counts.get(`${id}.obj`), 1));
        assert.equal(kit.reduce((sum, id) => sum + (counts.get(`${id}.mtl`) || 0), 0), 1);
        assert.equal(stats.kitAtlasRequests, 1, 'all six kit models request exactly one atlas before unrelated house loads');
        assert.equal(stats.peak, 4);
        assert.equal(stats.blocked, 1);
        console.log(JSON.stringify({ ...result, requests: Object.fromEntries(counts), peakModelLoads: stats.peak }));
    } finally { await browser.close(); }
});

for (const failure of ['.mtl', '.png', '.obj']) {
    test(`failed ${failure} loading clears pending promises for concurrent retry`, { timeout: 60000 }, async () => {
        const browser = await launch();
        try {
            const { page, counts } = await harness(browser, failure);
            const result = await page.evaluate(async () => {
                const { loader } = window.kitTest;
                const first = await Promise.allSettled([loader.loadAsset('TorusBench_A'), loader.loadAsset('TorusBench_A')]);
                const cachedAfterFailure = loader.isAssetLoaded('TorusBench_A');
                const retry = await Promise.all([loader.loadAsset('TorusBench_A'), loader.loadAsset('TorusBench_A')]);
                return { rejected: first.every(result => result.status === 'rejected'), cachedAfterFailure, loaded: loader.isAssetLoaded('TorusBench_A'), sameGeometry: retry[0].children[0].geometry === retry[1].children[0].geometry };
            });
            assert.deepEqual(result, { rejected: true, cachedAfterFailure: false, loaded: true, sameGeometry: true });
            const failedName = failure === '.png' ? 'TorusStreetKit_Atlas.png' : `TorusBench_A${failure}`;
            assert.equal(counts.get(failedName), 2);
        } finally { await browser.close(); }
    });
}
