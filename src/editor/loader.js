// Asset loading with caching
import { LoadingManager } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { BUILDINGS, PLANTS } from './catalog.js';
import { runLoadQueue } from '../load-queue.js';

const NATURE_PATH = 'assets/ultimate-nature/';
const BUILDINGS_PATH = 'assets/ultimate-buildings/';
// Only this authored kit guarantees identical TorusStreetKit MTL definitions.
// Do not pool arbitrary materials by name (unrelated houses can reuse names).
const STREET_KIT = new Set([
    'TorusBench_A', 'TorusTable_A', 'TorusPlanter_A',
    'TorusRailing_A', 'TorusSign_A', 'TorusWasteBin_A'
]);
const RESIDENTIAL_KIT = new Set([
    'TorusHome_CourtyardA', 'TorusHome_RowA', 'TorusApartment_TerraceA'
]);
const assetCache = new Map();
const loadingPromises = new Map();
// Pool only explicitly compatible kit definitions, never arbitrary names.
const kitMaterialsPromises = new Map();

function getAssetPath(assetName) {
    if (STREET_KIT.has(assetName) || RESIDENTIAL_KIT.has(assetName) || BUILDINGS.includes(assetName)) return BUILDINGS_PATH;
    if (PLANTS.includes(assetName)) return NATURE_PATH;
    throw new Error(`Asset is not in the active client catalog: ${assetName}`);
}

// Record borrowed identities outside userData: never serialize resource objects.
// Identity checks also allow instance-specific replacement resources to be freed.
function cloneCachedAsset(obj) {
    const clone = obj.clone();
    clone.traverse(child => {
        if (!child.isMesh) return;
        Object.defineProperty(child, 'borrowedAssetResources', {
            value: {
                geometry: child.geometry,
                materials: Array.isArray(child.material) ? [...child.material] : [child.material]
            }
        });
    });
    return clone;
}

function loadMaterials(assetName, assetPath) {
    const materialKey = STREET_KIT.has(assetName) ? 'street' : RESIDENTIAL_KIT.has(assetName) ? 'residential' : null;
    const shared = materialKey !== null;
    if (shared && kitMaterialsPromises.has(materialKey)) return kitMaterialsPromises.get(materialKey);
    const promise = new Promise((resolve, reject) => {
        // For the kit, readiness includes the atlas: failed images must be retryable.
        const manager = shared ? new LoadingManager() : undefined;
        let materials;
        if (manager) {
            manager.onLoad = () => { if (materials) resolve(materials); };
            manager.onError = url => reject(new Error(`Failed to load street kit resource: ${url}`));
        }
        const loader = new MTLLoader(manager);
        loader.setPath(assetPath);
        loader.load(`${assetName}.mtl`, creator => {
            try {
                materials = creator;
                materials.preload();
                if (!shared) resolve(materials);
            } catch (error) { reject(error); }
        }, undefined, reject);
    });
    if (shared) {
        kitMaterialsPromises.set(materialKey, promise);
        promise.catch(() => {
            if (kitMaterialsPromises.get(materialKey) === promise) kitMaterialsPromises.delete(materialKey);
        });
    }
    return promise;
}

// The stored promise resolves the cache prototype, never an instance clone.
export function loadAsset(assetName) {
    if (assetCache.has(assetName)) return Promise.resolve(cloneCachedAsset(assetCache.get(assetName)));
    if (!loadingPromises.has(assetName)) {
        const promise = Promise.resolve().then(async () => {
            const assetPath = getAssetPath(assetName);
            const materials = await loadMaterials(assetName, assetPath);
            const loader = new OBJLoader();
            loader.setMaterials(materials);
            loader.setPath(assetPath);
            const obj = await loader.loadAsync(`${assetName}.obj`);
            obj.traverse(child => {
                if (!child.isMesh || !child.material) return;
                const list = Array.isArray(child.material) ? child.material : [child.material];
                for (const material of list) {
                    material.roughness = 1.0;
                    material.metalness = 0.0;
                }
            });
            assetCache.set(assetName, obj);
            return obj;
        }).finally(() => { loadingPromises.delete(assetName); });
        loadingPromises.set(assetName, promise);
    }
    return loadingPromises.get(assetName).then(cloneCachedAsset);
}

// Preload common assets (retain the existing four-worker queue).
export async function preloadAssets(assetNames, onProgress) {
    const uniqueNames = [...new Set(assetNames)];
    const total = uniqueNames.length;
    let loaded = 0;
    await runLoadQueue(uniqueNames, async name => {
        try {
            await loadAsset(name);
        } catch (error) {
            console.warn(`Failed to load asset: ${name}`, error);
        }
        loaded++;
        if (onProgress) onProgress(loaded, total);
    });
}

export function getAsset(assetName) {
    return assetCache.has(assetName) ? cloneCachedAsset(assetCache.get(assetName)) : null;
}

export function isAssetLoaded(assetName) {
    return assetCache.has(assetName);
}
