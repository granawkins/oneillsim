// Ground texture painting system
import * as THREE from 'three';
import { editorState, setTexture, getTexture } from './state.js';
import { TEXTURES } from './catalog.js';

const TILE_SIZE = 10; // meters
const GRID_WIDTH = 13; // tiles along Z axis (-60 to +60)
const GRID_LENGTH = 408; // tiles around theta (approximate)

let texturedGround = null;
let gridOverlay = null;
let habitatGroup = null;

// Initialize with habitat reference
export function initTextures(habitat) {
    habitatGroup = habitat;
}

// Paint a texture at a position
export function paintTexture(theta, z, textureId) {
    // Store in state
    setTexture(theta, z, textureId);

    // Create or update visual patch
    updateTexturePatch(theta, z, textureId);
}

// Create/update a visual patch for a texture
function updateTexturePatch(theta, z, textureId) {
    if (!habitatGroup) return;

    // Find texture color
    const texInfo = TEXTURES.find(t => t.id === textureId);
    if (!texInfo) return;

    // Snap to grid
    const tileZ = Math.round(z / TILE_SIZE) * TILE_SIZE;
    const thetaStep = TILE_SIZE / 649.5;
    const tileTheta = Math.round(theta / thetaStep) * thetaStep;
    const key = `patch_${tileTheta.toFixed(4)}_${tileZ}`;

    // Remove existing patch if any
    const existing = habitatGroup.getObjectByName(key);
    if (existing) {
        habitatGroup.remove(existing);
        existing.geometry.dispose();
        existing.material.dispose();
    }

    // Don't create patch for grass (it's the default)
    if (textureId === 'grass') return;

    // Create a plane for the patch
    const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const material = new THREE.MeshStandardMaterial({
        color: texInfo.color,
        side: THREE.DoubleSide,
        roughness: 1.0
    });

    const patch = new THREE.Mesh(geometry, material);
    patch.name = key;

    // Position on surface (slightly above ground at 649.7, ground is at 649.8)
    const radius = 649.7;
    patch.position.set(
        radius * Math.cos(tileTheta),
        radius * Math.sin(tileTheta),
        tileZ
    );

    // Orient to face inward (toward center)
    patch.lookAt(0, 0, tileZ);

    habitatGroup.add(patch);
}

// Create grid overlay for visualizing tiles
export function createGridOverlay(habitat) {
    if (gridOverlay) return gridOverlay;

    const group = new THREE.Group();
    group.name = 'gridOverlay';

    // Create grid lines along theta (circles around the cylinder)
    const linesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });

    // Z lines (every 10m)
    for (let z = -60; z <= 60; z += TILE_SIZE) {
        const points = [];
        for (let t = 0; t <= Math.PI * 2; t += 0.1) {
            points.push(new THREE.Vector3(
                649.6 * Math.cos(t),
                649.6 * Math.sin(t),
                z
            ));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, linesMaterial);
        group.add(line);
    }

    // Theta lines (every ~10m along circumference = ~0.0154 radians)
    const thetaStep = TILE_SIZE / 649.8;
    for (let t = 0; t < Math.PI * 2; t += thetaStep * 4) { // every 4 tiles to reduce clutter
        const points = [
            new THREE.Vector3(649.6 * Math.cos(t), 649.6 * Math.sin(t), -60),
            new THREE.Vector3(649.6 * Math.cos(t), 649.6 * Math.sin(t), 60)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, linesMaterial);
        group.add(line);
    }

    gridOverlay = group;
    gridOverlay.visible = false;
    habitat.add(gridOverlay);

    return gridOverlay;
}

// Toggle grid visibility
export function toggleGrid() {
    if (gridOverlay) {
        editorState.gridVisible = !editorState.gridVisible;
        gridOverlay.visible = editorState.gridVisible;
    }
    return editorState.gridVisible;
}

// Show/hide grid
export function setGridVisible(visible) {
    editorState.gridVisible = visible;
    if (gridOverlay) {
        gridOverlay.visible = visible;
    }
}

// Load textures from saved state
export function loadTextureGrid(textures) {
    for (const [key, textureId] of Object.entries(textures)) {
        const [thetaStr, zStr] = key.split(',');
        const theta = parseFloat(thetaStr);
        const z = parseFloat(zStr);
        updateTexturePatch(theta, z, textureId);
    }
}
