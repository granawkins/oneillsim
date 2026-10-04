import * as THREE from 'three';
import {normalizeAssetManifest} from '../src/asset-manifest.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function mountAssetViewer(root = document.body, options = {}) {
let disposed = false;
let animationFrame;
const lifetime = new AbortController();
const loadedMaterials = new Set();
const get = id => root.querySelector(`#${CSS.escape(id)}`);
function disposeObject(object) {
    object.traverse(child => {
        child.geometry?.dispose();
        for (const material of [child.material].flat().filter(Boolean)) {
            for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
            material.dispose();
        }
    });
}
const ASSET_ID = options.assetId || new URLSearchParams(location.search).get('asset') || 'TorusHome_ModA';
const ROOT = options.assetRoot || 'ultimate-buildings/';
const params = new URLSearchParams(location.search);
const captureMode = params.get('capture') === '1';
window.__assetReady = false;
window.__assetError = null;
root.classList.toggle('capture-mode', captureMode);

const canvas = get('asset-canvas');
const status = get('viewer-status');
status.hidden = false;
status.classList.remove('error');
get('source-facts')?.replaceChildren();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#152128');
scene.fog = new THREE.Fog('#152128', 28, 70);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

scene.add(new THREE.HemisphereLight(0xddebf0, 0x29383b, 1.7));
const key = new THREE.DirectionalLight(0xffe5c8, 3.4);
key.position.set(7, 11, 9);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 10;
key.shadow.camera.bottom = -7;
scene.add(key);
const fill = new THREE.DirectionalLight(0x9bc9dc, 1.8);
fill.position.set(-8, 6, -5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xe7f5ee, 1.2);
rim.position.set(-2, 8, 9);
scene.add(rim);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshStandardMaterial({ color: 0x25343a, roughness: 0.92, metalness: 0.04 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.035;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(16, 16, 0x718d91, 0x3b5157);
grid.position.y = -0.02;
scene.add(grid);

function queryNumber(name, fallback, min, max) {
    if (!params.has(name)) return fallback;
    const value = Number(params.get(name));
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

const target = new THREE.Vector3(0, 2.55, 0);
const azimuth = queryNumber('azimuth', 38, -180, 180) * Math.PI / 180;
const elevation = queryNumber('elevation', 22, -10, 75) * Math.PI / 180;
const distance = queryNumber('distance', 17, 7, 45);
camera.position.set(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth)
);
camera.lookAt(target);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 7;
controls.maxDistance = 45;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = 1.48;
controls.autoRotate = !captureMode && params.get('autoRotate') !== '0';
controls.autoRotateSpeed = 0.34;
controls.update();

function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
}
const observer = new ResizeObserver(resize);
observer.observe(canvas.parentElement);
resize();

async function loadAsset() {
    try {
        const response = await fetch(`${ROOT}${ASSET_ID}.asset.json`, { cache: 'no-store', signal: lifetime.signal });
        if (!response.ok) throw new Error(`Manifest request returned HTTP ${response.status}`);
        const manifest = normalizeAssetManifest(await response.json());

        if (disposed) return;
        const materialsLoader = new MTLLoader();
        materialsLoader.setPath(ROOT);
        const materials = await materialsLoader.loadAsync(`${ASSET_ID}.mtl`);
        if (disposed) return;
        materials.preload();
        for (const material of Object.values(materials.materials)) loadedMaterials.add(material);
        const objectLoader = new OBJLoader();
        objectLoader.setMaterials(materials);
        objectLoader.setPath(ROOT);
        const model = await objectLoader.loadAsync(`${ASSET_ID}.obj`);
        if (disposed) { disposeObject(model); return; }
        model.scale.setScalar(Number(manifest.editorDefaultScale) || 4);
        model.rotation.y = queryNumber('modelRotation', 0, -3600, 3600) * Math.PI / 180;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(model);
        // Small props need a human-scale inspection frame, not the house's
        // 2.55m target/17m distance. Preserve existing house/capture conventions.
        if (ASSET_ID.startsWith('TorusDistrict_') || ['Furniture & small props', 'Residential buildings'].includes(manifest.family)) {
            const bounds = new THREE.Box3().setFromObject(model);
            bounds.getCenter(target);
            const extent = bounds.getSize(new THREE.Vector3());
            const district = ASSET_ID.startsWith('TorusDistrict_');
            const maxDistance = district ? 2000 : 45;
            const propDistance = queryNumber('distance', Math.max(3, Math.max(extent.x, extent.y, extent.z) * 2.8), 2, maxDistance);
            if (district) {
                scene.fog = null; camera.far = 10000; camera.updateProjectionMatrix();
                controls.maxDistance = maxDistance; grid.visible = false; ground.visible = false;
            }
            camera.position.set(
                target.x + propDistance * Math.cos(elevation) * Math.sin(azimuth),
                target.y + propDistance * Math.sin(elevation),
                target.z + propDistance * Math.cos(elevation) * Math.cos(azimuth)
            );
            controls.target.copy(target);
            controls.minDistance = 1.5;
            camera.lookAt(target);
            controls.update();
        }

        const bounds = manifest.actualModelBoundsMeters || [];
        const dimensions = bounds.map(([min, max]) => (Number(max) - Number(min)).toFixed(2));
        get('asset-name').textContent = manifest.displayName || ASSET_ID;
        get('asset-description').textContent = manifest.description || '';
        get('spec-geometry').textContent = `${manifest.trianglesAfterQuadTriangulation} tris · ${manifest.vertices} verts`;
        get('spec-materials').textContent = `${manifest.materials} atlas material`;
        get('spec-bounds').textContent = dimensions.length === 3 ? `${dimensions[0]} × ${dimensions[1]} × ${dimensions[2]} m` : '—';
        get('spec-scale').textContent = `${manifest.editorDefaultScale}× in the simulator`;
        if (get('asset-source')) get('asset-source').textContent = manifest.source || '';
        get('asset-interpretation').textContent = (manifest.interpretations || []).join(' ');
        const list = get('source-facts');
        for (const fact of manifest.sourceFacts || []) {
            const item = document.createElement('li');
            item.textContent = fact;
            list?.append(item);
        }

        status.hidden = true;
        renderer.render(scene, camera);
        window.__assetManifest = manifest;
        window.__assetReady = true;
        window.dispatchEvent(new Event('asset-viewer-ready'));
    } catch (error) {
        if (disposed || error.name === 'AbortError') return;
        window.__assetError = String(error);
        status.textContent = `Could not load asset: ${error.message}`;
        status.classList.add('error');
        console.error('Asset viewer failed:', error);
    }
}

function render() {
    if (disposed) return;
    animationFrame = requestAnimationFrame(render);
    controls.update();
    renderer.render(scene, camera);
}
loadAsset();
render();

return () => {
    disposed = true;
    lifetime.abort();
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
    controls.dispose();
    disposeObject(scene);
    // MTL textures may have loaded before an in-flight OBJ joined the scene.
    for (const material of loadedMaterials) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
    }
    key.shadow.map?.dispose();
    renderer.dispose();
    root.classList.remove('capture-mode');
    window.__assetReady = false;
    delete window.__assetManifest;
};
}
