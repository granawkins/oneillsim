// Asset loading with caching
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { BUILDINGS, PLANTS } from './catalog.js';

const NATURE_PATH = '/assets/ultimate-nature/';
const BUILDINGS_PATH = '/assets/ultimate-buildings/';
const assetCache = new Map();
const loadingPromises = new Map();

// Determine asset path based on asset name
function getAssetPath(assetName) {
    if (BUILDINGS.includes(assetName)) {
        return BUILDINGS_PATH;
    }
    return NATURE_PATH;
}

// Load a single asset (with caching)
export function loadAsset(assetName) {
    // Return cached if available
    if (assetCache.has(assetName)) {
        return Promise.resolve(assetCache.get(assetName).clone());
    }

    // Return existing promise if already loading
    if (loadingPromises.has(assetName)) {
        return loadingPromises.get(assetName).then(obj => obj.clone());
    }

    const assetPath = getAssetPath(assetName);

    // Start new load
    const promise = new Promise((resolve, reject) => {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath(assetPath);
        mtlLoader.load(
            `${assetName}.mtl`,
            (materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                objLoader.setPath(assetPath);
                objLoader.load(
                    `${assetName}.obj`,
                    (obj) => {
                        // Make all materials matte
                        obj.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material.roughness = 1.0;
                                child.material.metalness = 0.0;
                            }
                        });
                        assetCache.set(assetName, obj);
                        loadingPromises.delete(assetName);
                        resolve(obj.clone());
                    },
                    undefined,
                    (error) => {
                        loadingPromises.delete(assetName);
                        reject(error);
                    }
                );
            },
            undefined,
            (error) => {
                loadingPromises.delete(assetName);
                reject(error);
            }
        );
    });

    loadingPromises.set(assetName, promise);
    return promise;
}

// Preload common assets
export async function preloadAssets(assetNames, onProgress) {
    const total = assetNames.length;
    let loaded = 0;

    const promises = assetNames.map(async (name) => {
        try {
            await loadAsset(name);
            loaded++;
            if (onProgress) onProgress(loaded, total);
        } catch (e) {
            console.warn(`Failed to load asset: ${name}`, e);
            loaded++;
            if (onProgress) onProgress(loaded, total);
        }
    });

    await Promise.all(promises);
}

// Get cached asset (returns clone)
export function getAsset(assetName) {
    if (assetCache.has(assetName)) {
        return assetCache.get(assetName).clone();
    }
    return null;
}

// Check if asset is loaded
export function isAssetLoaded(assetName) {
    return assetCache.has(assetName);
}
