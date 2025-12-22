// Main editor module
import * as THREE from 'three';
import { editorState, exportWorldState, importWorldState } from './state.js';
import { CATALOG } from './catalog.js';
import { preloadAssets } from './loader.js';
import { initRaycaster, updateMousePosition, getSurfacePosition, setHabitatGroup, setPointerLockMode } from './raycaster.js';
import { initPlacement, placeAsset, removeAsset, findAssetAtPosition, loadPlacedAssets } from './placement.js';
import { createSelectorUI, showSelector, selectNext, selectPrevious, getSelectedItem } from './ui.js';
import { initTextures, createGridOverlay, toggleGrid, setGridVisible, paintTexture, loadTextureGrid } from './textures.js';

let camera = null;
let habitatGroup = null;
let groundMesh = null;
let cellHighlight = null;

// Initialize the editor
export async function initEditor(cam, habitat, ground) {
    camera = cam;
    habitatGroup = habitat;
    groundMesh = ground;


    // Initialize subsystems
    initRaycaster(ground, cam);
    setHabitatGroup(habitat);
    initPlacement(habitat);
    initTextures(habitat);

    // Create UI
    createSelectorUI();
    showSelector(false); // Hidden until planner mode

    // Create grid overlay
    createGridOverlay(habitat);

    // Create cell highlight (a square on the ground)
    createCellHighlight(habitat);

    // Preload first few common assets for responsiveness
    const commonAssets = ['CommonTree_1', 'CommonTree_2', 'Rock_1', 'Bush_1', 'Plant_1'];
    await preloadAssets(commonAssets);

    console.log('Editor initialized');
}

// Create the cell highlight square
function createCellHighlight(habitat) {
    const TILE_SIZE = 10;
    const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const material = new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    cellHighlight = new THREE.Mesh(geometry, material);
    cellHighlight.visible = false;
    habitat.add(cellHighlight);
}

// Handle mouse move (called on camera movement)
export function onMouseMove(event) {
    updateMousePosition(event);
    updateCellHighlight();
}

// Update editor each frame
export function updateEditor() {
    if (editorState.enabled) {
        updateCellHighlight();
    }
}

// Handle click for placement
export async function onClick(event) {
    if (!editorState.enabled) return;

    const surfacePos = getSurfacePosition();
    if (!surfacePos) return;

    const selected = getSelectedItem();
    if (!selected) return;

    if (selected.type === 'texture') {
        // Paint texture
        paintTexture(surfacePos.theta, surfacePos.z, selected.id);
    } else if (selected.type === 'building' || selected.type === 'plant') {
        // Place building or plant asset
        await placeAsset(
            selected.id,
            surfacePos.theta,
            surfacePos.z,
            editorState.assetScale,
            editorState.assetRotation
        );
        // Randomize rotation for next placement
        editorState.assetRotation = Math.random() * Math.PI * 2;
    }
}

// Handle delete key
export function onDelete() {
    const surfacePos = getSurfacePosition();
    if (!surfacePos) return;

    const assetId = findAssetAtPosition(surfacePos.theta, surfacePos.z);
    if (assetId) {
        removeAsset(assetId);
    }
}

// Handle arrow keys
export function onArrowLeft() {
    selectPrevious();
    updateGhostPreview(true);
}

export function onArrowRight() {
    selectNext();
    updateGhostPreview(true);
}

// Handle rotation key (R)
export function onRotate() {
    editorState.assetRotation += Math.PI / 4; // 45 degree increments
    updateGhostPreview();
}

// Handle scale keys (+/-)
export function onScaleUp() {
    editorState.assetScale = Math.min(10, editorState.assetScale + 0.5);
    updateGhostPreview();
}

export function onScaleDown() {
    editorState.assetScale = Math.max(0.5, editorState.assetScale - 0.5);
    updateGhostPreview();
}

// Toggle grid
export function onToggleGrid() {
    toggleGrid();
}

// Update cell highlight at cursor
function updateCellHighlight() {
    if (!cellHighlight) return;

    const surfacePos = getSurfacePosition();
    if (!surfacePos) {
        cellHighlight.visible = false;
        return;
    }

    // Snap to grid
    const TILE_SIZE = 10;
    const snappedZ = Math.round(surfacePos.z / TILE_SIZE) * TILE_SIZE;
    const thetaStep = TILE_SIZE / 649.5;
    const snappedTheta = Math.round(surfacePos.theta / thetaStep) * thetaStep;

    // Position highlight on surface
    const radius = 649.6; // Slightly above ground
    cellHighlight.position.set(
        radius * Math.cos(snappedTheta),
        radius * Math.sin(snappedTheta),
        snappedZ
    );

    // Orient to surface (face inward toward center)
    cellHighlight.lookAt(0, 0, snappedZ);

    cellHighlight.visible = true;
}

// Show/hide editor based on mode
export function setEditorVisible(visible) {
    const showEditor = visible && editorState.enabled;
    showSelector(showEditor);
    if (cellHighlight) {
        cellHighlight.visible = showEditor;
    }
    setGridVisible(showEditor && editorState.gridVisible);

    // Update pointer lock mode when visibility changes
    // When editor is visible, use free cursor mode
    setPointerLockMode(!showEditor);

    // Update overlay text based on editor state
    const overlay = document.getElementById('overlay');
    if (overlay) {
        const span = overlay.querySelector('span');
        if (showEditor) {
            span.textContent = 'Editor Mode - ESC to exit';
            overlay.style.alignItems = 'flex-start';
            overlay.style.paddingTop = '5vh';
        }
    }
}

// Toggle editor enabled state
export function toggleEditorEnabled() {
    editorState.enabled = !editorState.enabled;
    // When editor is enabled, use free cursor mode (not pointer lock)
    setPointerLockMode(!editorState.enabled);
    return editorState.enabled;
}

// Check if editor is enabled
export function isEditorEnabled() {
    return editorState.enabled;
}

// Save world state
export function saveWorld() {
    const state = exportWorldState();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'world.json';
    a.click();
    URL.revokeObjectURL(url);
}

// Load world state
export async function loadWorld(data) {
    importWorldState(data);
    if (data.assets) {
        await loadPlacedAssets(data.assets);
    }
    if (data.textures) {
        loadTextureGrid(data.textures);
    }
}

// Export for external use
export { editorState } from './state.js';
export { CATALOG } from './catalog.js';
