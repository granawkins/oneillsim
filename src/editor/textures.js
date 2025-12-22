// Ground texture painting system
import * as THREE from 'three';
import {
    editorState,
    setTextureAt,
    getTextureId,
    gridToWorld,
    worldToGrid,
    GRID_TILE_SIZE,
    GRID_ROWS,
    GRID_COLS,
    GROUND_RADIUS,
    TEXTURE_NAMES
} from './state.js';
import { TEXTURES } from './catalog.js';

let gridOverlay = null;
let habitatGroup = null;
let texturePatchGroup = null;  // Group for all texture patches

// Initialize with habitat reference
export function initTextures(habitat) {
    habitatGroup = habitat;

    // Create group to hold all texture patches
    texturePatchGroup = new THREE.Group();
    texturePatchGroup.name = 'texturePatchGroup';
    habitatGroup.add(texturePatchGroup);
}

// Paint a texture at a position (world coordinates)
export function paintTexture(theta, z, textureId) {
    const { row, col } = worldToGrid(theta, z);

    // Store in state
    setTextureAt(row, col, textureId);

    // Update visual patch
    updateTexturePatchAt(row, col);
}

// Create/update a visual patch at grid position
function updateTexturePatchAt(row, col) {
    if (!texturePatchGroup) return;

    const key = `patch_${row}_${col}`;
    const textureId = getTextureId(row, col);
    const textureName = TEXTURE_NAMES[textureId];

    // Find texture color
    const texInfo = TEXTURES.find(t => t.id === textureName);

    // Remove existing patch if any
    const existing = texturePatchGroup.getObjectByName(key);
    if (existing) {
        texturePatchGroup.remove(existing);
        existing.geometry.dispose();
        existing.material.dispose();
    }

    // Don't create patch for grass (it's the default ground color)
    if (textureName === 'grass') return;
    if (!texInfo) return;

    // Get world position for this grid cell
    const { theta, z } = gridToWorld(row, col);

    // Create a plane for the patch
    const geometry = new THREE.PlaneGeometry(GRID_TILE_SIZE, GRID_TILE_SIZE);
    const material = new THREE.MeshStandardMaterial({
        color: texInfo.color,
        side: THREE.DoubleSide,
        roughness: 1.0
    });

    const patch = new THREE.Mesh(geometry, material);
    patch.name = key;

    // Position on surface (slightly above ground)
    const radius = GROUND_RADIUS - 0.1;
    patch.position.set(
        radius * Math.cos(theta),
        radius * Math.sin(theta),
        z
    );

    // Orient to face inward (toward center)
    patch.lookAt(0, 0, z);

    texturePatchGroup.add(patch);
}

// Create grid overlay for visualizing tiles
export function createGridOverlay(habitat) {
    if (gridOverlay) return gridOverlay;

    const group = new THREE.Group();
    group.name = 'gridOverlay';

    const linesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    const radius = GROUND_RADIUS - 0.05;

    // Z lines (circles around the cylinder, every 10m)
    for (let z = -60; z <= 60; z += GRID_TILE_SIZE) {
        const points = [];
        for (let t = 0; t <= Math.PI * 2; t += 0.1) {
            points.push(new THREE.Vector3(
                radius * Math.cos(t),
                radius * Math.sin(t),
                z
            ));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, linesMaterial);
        group.add(line);
    }

    // Theta lines (every 4 tiles to reduce clutter)
    const thetaStep = (2 * Math.PI) / GRID_COLS;
    for (let col = 0; col < GRID_COLS; col += 4) {
        const t = col * thetaStep;
        const points = [
            new THREE.Vector3(radius * Math.cos(t), radius * Math.sin(t), -60),
            new THREE.Vector3(radius * Math.cos(t), radius * Math.sin(t), 60)
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

// Clear all texture patches
export function clearTexturePatches() {
    if (!texturePatchGroup) return;

    while (texturePatchGroup.children.length > 0) {
        const child = texturePatchGroup.children[0];
        texturePatchGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }
}

// Render all textures from the grid (call after loading)
export function renderTextureGrid() {
    if (!texturePatchGroup || !editorState.textureGrid) return;

    // Clear existing patches
    clearTexturePatches();

    // Create patches for all non-grass tiles
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const textureId = editorState.textureGrid[row][col];
            if (textureId !== 0) {  // 0 = grass, skip it
                updateTexturePatchAt(row, col);
            }
        }
    }
}

// Load textures from saved state (handles both v1 sparse and v2 grid formats)
// Note: importWorldState in state.js handles the data conversion
export function loadTextureGrid() {
    // Just render whatever is in the grid now
    renderTextureGrid();
}
