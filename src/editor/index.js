// Main editor module
import * as THREE from 'three';
import { editorState, exportWorldState, importWorldState } from './state.js';
import { CATALOG } from './catalog.js';
import { preloadAssets, loadAsset, getAsset } from './loader.js';
import { initRaycaster, updateMousePosition, getSurfacePosition, setHabitatGroup, setPointerLockMode } from './raycaster.js';
import { initPlacement, placeAsset, removeAsset, findAssetAtPosition, loadPlacedAssets } from './placement.js';
import { createSelectorUI, showSelector, selectNext, selectPrevious, getSelectedItem } from './ui.js';
import { initTextures, createGridOverlay, toggleGrid, setGridVisible, paintTexture, loadTextureGrid } from './textures.js';
import { worldToGrid, gridToWorld, GROUND_RADIUS } from './state.js';

let camera = null;
let habitatGroup = null;
let groundMesh = null;
let cellHighlight = null;
let ghostPreview = null;
let ghostAssetName = null;
const SURFACE_RADIUS = 649.5;

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

    // Note: texture grid is loaded from world.json in main.js

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
        updateGhostPreview();
    }
}

// Handle click for placement
export async function onClick(event) {
    if (!editorState.enabled) return;

    const surfacePos = getSurfacePosition();
    if (!surfacePos) return;

    // Handle bulldozer mode - delete items on click
    if (editorState.bulldozerMode) {
        const assetId = findAssetAtPosition(surfacePos.theta, surfacePos.z);
        if (assetId) {
            removeAsset(assetId);
        }
        return;
    }

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

// Handle rotation via R + scroll
export function onRotateScroll(direction) {
    editorState.assetRotation += direction * Math.PI / 8; // 22.5 degree increments
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

// Update cell highlight at cursor (only for textures)
function updateCellHighlight() {
    if (!cellHighlight) return;

    const selected = getSelectedItem();
    const isTexture = selected && selected.type === 'texture';

    // Only show cell highlight for textures
    if (!isTexture) {
        cellHighlight.visible = false;
        return;
    }

    const surfacePos = getSurfacePosition();
    if (!surfacePos) {
        cellHighlight.visible = false;
        return;
    }

    // Convert to grid indices and back to get cell center
    const { row, col } = worldToGrid(surfacePos.theta, surfacePos.z);
    const { theta, z } = gridToWorld(row, col);

    // Position highlight above textures (textures are at GROUND_RADIUS - 0.1)
    const radius = GROUND_RADIUS - 0.15;
    cellHighlight.position.set(
        radius * Math.cos(theta),
        radius * Math.sin(theta),
        z
    );

    // Orient to surface (face inward toward center)
    cellHighlight.lookAt(0, 0, z);

    cellHighlight.visible = true;
}

// Orient an object to stand on the cylinder surface
function orientToSurface(object, theta, z) {
    const radius = SURFACE_RADIUS + 0.1; // Slightly above ground
    object.position.set(
        radius * Math.cos(theta),
        radius * Math.sin(theta),
        z
    );
    object.lookAt(0, 0, z);
    object.rotateX(Math.PI / 2);
}

// Update ghost preview for buildings/plants
async function updateGhostPreview(forceRecreate = false) {
    const selected = getSelectedItem();
    const isAsset = selected && (selected.type === 'building' || selected.type === 'plant');

    // Remove ghost if not placing an asset
    if (!isAsset) {
        if (ghostPreview && habitatGroup) {
            habitatGroup.remove(ghostPreview);
            ghostPreview = null;
            ghostAssetName = null;
        }
        return;
    }

    // Check if we need to create/recreate the ghost
    if (forceRecreate || ghostAssetName !== selected.id) {
        // Remove old ghost
        if (ghostPreview && habitatGroup) {
            habitatGroup.remove(ghostPreview);
            ghostPreview = null;
        }

        // Try to get from cache first, otherwise load
        let asset = getAsset(selected.id);
        if (!asset) {
            try {
                asset = await loadAsset(selected.id);
            } catch (e) {
                console.warn(`Failed to load ghost preview for ${selected.id}`);
                return;
            }
        }

        // Make semi-transparent
        asset.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.5;
                child.material.depthWrite = false;
            }
        });

        ghostPreview = asset;
        ghostAssetName = selected.id;

        if (habitatGroup) {
            habitatGroup.add(ghostPreview);
        }
    }

    // Update position
    if (ghostPreview) {
        const surfacePos = getSurfacePosition();
        if (surfacePos) {
            orientToSurface(ghostPreview, surfacePos.theta, surfacePos.z);
            ghostPreview.rotateY(editorState.assetRotation);
            ghostPreview.scale.setScalar(editorState.assetScale);
            ghostPreview.visible = true;
        } else {
            ghostPreview.visible = false;
        }
    }
}

// Show/hide editor based on mode
export function setEditorVisible(visible) {
    const showEditor = visible && editorState.enabled;
    showSelector(showEditor);
    if (cellHighlight) {
        cellHighlight.visible = showEditor;
    }
    // Hide ghost preview when editor is hidden
    if (!showEditor && ghostPreview) {
        ghostPreview.visible = false;
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

// Save world state to server
export async function saveWorld() {
    const state = exportWorldState();
    const json = JSON.stringify(state);

    try {
        const response = await fetch('/world.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: json
        });
        if (response.ok) {
            console.log('World saved to world.json');
        } else {
            console.error('Failed to save world:', response.status);
        }
    } catch (e) {
        console.error('Failed to save world:', e);
        // Fallback: download file
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'world.json';
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Load world state
export async function loadWorld(data) {
    importWorldState(data);
    if (data.assets) {
        await loadPlacedAssets(data.assets);
    }
    // Render textures (importWorldState already loaded them into state)
    loadTextureGrid();
}

// Export for external use
export { editorState } from './state.js';
export { CATALOG } from './catalog.js';
