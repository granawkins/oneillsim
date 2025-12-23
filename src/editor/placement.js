// Asset placement on the cylinder surface
import * as THREE from 'three';
import { editorState, generateAssetId, addPlacedAsset, removePlacedAsset } from './state.js';
import { loadAsset, getAsset } from './loader.js';
import { surfaceToWorld } from './raycaster.js';

const SURFACE_RADIUS = 649.5;

// Map of asset ID -> Three.js object for cleanup
const assetObjects = new Map();

let habitatGroup = null;

// Initialize with habitat group reference
export function initPlacement(habitat) {
    habitatGroup = habitat;
}

// Reusable vectors for orientation calculation
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3(0, 0, 1);
const _right = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

// Orient an object to stand on the cylinder surface
export function orientToSurface(object, theta, z) {
    object.position.copy(surfaceToWorld(theta, z, SURFACE_RADIUS));

    // Compute orientation directly (avoids lookAt singularities)
    // Up = radially inward toward cylinder axis
    _up.set(-Math.cos(theta), -Math.sin(theta), 0);
    // Forward = along cylinder axis
    // Right = up × forward
    _right.crossVectors(_up, _forward).normalize();

    // Build rotation matrix from basis vectors
    _matrix.makeBasis(_right, _up, _forward);
    object.quaternion.setFromRotationMatrix(_matrix);
}

// Place an asset at surface coordinates
export async function placeAsset(assetName, theta, z, scale = 4.0, rotation = 0) {
    if (!habitatGroup) {
        console.warn('Placement not initialized');
        return null;
    }

    // Load or get cached asset
    let asset;
    try {
        asset = await loadAsset(assetName);
    } catch (e) {
        console.error(`Failed to load asset ${assetName}:`, e);
        return null;
    }

    // Generate unique ID
    const id = generateAssetId();

    // Position and orient
    orientToSurface(asset, theta, z);
    asset.rotateY(rotation);
    asset.scale.setScalar(scale);

    // Store reference
    asset.userData.assetId = id;
    assetObjects.set(id, asset);

    // Add to scene
    habitatGroup.add(asset);

    // Track in state
    addPlacedAsset({
        id,
        type: assetName,
        theta,
        z,
        scale,
        rotation
    });

    return id;
}

// Remove an asset by ID
export function removeAsset(id) {
    const asset = assetObjects.get(id);
    if (asset && habitatGroup) {
        habitatGroup.remove(asset);
        // Dispose geometry and materials
        asset.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        assetObjects.delete(id);
        removePlacedAsset(id);
        return true;
    }
    return false;
}

// Find asset at surface position (for deletion)
export function findAssetAtPosition(theta, z, tolerance = 0.05) {
    for (const [id, asset] of assetObjects) {
        const data = editorState.placedAssets.find(a => a.id === id);
        if (!data) continue;

        // Check if within tolerance
        // Handle theta wrap-around at 2*PI boundary
        let dTheta = Math.abs(data.theta - theta);
        if (dTheta > Math.PI) {
            dTheta = 2 * Math.PI - dTheta;
        }
        const dZ = Math.abs(data.z - z);
        if (dTheta < tolerance && dZ < 5) {
            return id;
        }
    }
    return null;
}

// Create ghost preview mesh
export function createPreview(assetName, theta, z, scale = 4.0) {
    const asset = getAsset(assetName);
    if (!asset) return null;

    // Make semi-transparent
    asset.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = 0.5;
        }
    });

    orientToSurface(asset, theta, z);
    asset.scale.setScalar(scale);

    return asset;
}

// Update preview position
export function updatePreview(preview, theta, z, rotation = 0) {
    if (!preview) return;
    orientToSurface(preview, theta, z);
    preview.rotateY(rotation);
}

// Load all placed assets from state (for restoring saved worlds)
export async function loadPlacedAssets(assets) {
    for (const data of assets) {
        try {
            const asset = await loadAsset(data.type);
            orientToSurface(asset, data.theta, data.z);
            asset.rotateY(data.rotation || 0);
            asset.scale.setScalar(data.scale || 4.0);
            asset.userData.assetId = data.id;
            assetObjects.set(data.id, asset);
            if (habitatGroup) {
                habitatGroup.add(asset);
            }
        } catch (e) {
            console.warn(`Failed to load placed asset ${data.type}:`, e);
        }
    }
}
