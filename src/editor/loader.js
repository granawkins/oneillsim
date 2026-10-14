// Asset loading with caching
import { FileLoader, LoadingManager } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { BUILDINGS, PLANTS } from './catalog.js';
import { materialKitKey } from './material-kits.js';

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
    const materialKey = materialKitKey(assetName, [...BUILDINGS, ...PLANTS]);
    const shared = materialKey !== null;
    if (shared && kitMaterialsPromises.has(materialKey)) return kitMaterialsPromises.get(materialKey);
    const promise = new Promise((resolve, reject) => {
        // Every model waits for its textures, not just pooled kits.
        const manager = new LoadingManager();
        let materials;
        manager.onLoad = () => { if (materials) resolve(materials); };
        manager.onError = url => reject(new Error(`Failed to load asset resource: ${url}`));
        const loader = new MTLLoader(manager);
        loader.setPath(assetPath);
        loader.load(`${assetName}.mtl`, creator => {
            try {
                materials = creator;
                materials.preload();
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
function loadAssetPrototype(assetName) {
    if (assetCache.has(assetName)) return Promise.resolve(assetCache.get(assetName));
    if (!loadingPromises.has(assetName)) {
        const promise = Promise.resolve().then(async () => {
            const assetPath = getAssetPath(assetName);
            // OBJ parsing needs materials; its download does not. Start both
            // files immediately instead of an MTL/texture -> OBJ waterfall.
            const sourceLoader = new FileLoader().setPath(assetPath);
            const [materials, source] = await Promise.all([
                loadMaterials(assetName, assetPath),
                sourceLoader.loadAsync(`${assetName}.obj`)
            ]);
            const loader = new OBJLoader();
            loader.setMaterials(materials);
            loader.setPath(assetPath);
            const obj = loader.parse(source);
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
    return loadingPromises.get(assetName);
}

export function loadAsset(assetName) {
    return loadAssetPrototype(assetName).then(cloneCachedAsset);
}

// Start all distinct scene assets together; browser transport handles limits.
export async function preloadAssets(assetNames, onProgress) {
    const uniqueNames = [...new Set(assetNames)];
    const total = uniqueNames.length;
    let loaded = 0;
    await Promise.all(uniqueNames.map(async name => {
        try {
            await loadAssetPrototype(name);
        } catch (error) {
            console.warn(`Failed to load asset: ${name}`, error);
        }
        loaded++;
        if (onProgress) onProgress(loaded, total);
    }));
}

export function getAsset(assetName) {
    return assetCache.has(assetName) ? cloneCachedAsset(assetCache.get(assetName)) : null;
}

export function isAssetLoaded(assetName) {
    return assetCache.has(assetName);
}
