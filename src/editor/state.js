// Editor state management

export const editorState = {
    enabled: false,  // Toggle with 'E' key
    selectedIndex: 0,        // Index in the catalog
    placedAssets: [],        // Array of { id, type, theta, z, scale, rotation }
    textureGrid: {},         // Map of "theta,z" -> textureId
    previewAsset: null,      // Current ghost preview mesh
    previewVisible: false,
    assetScale: 4.0,         // Default scale for new assets
    assetRotation: 0,        // Rotation for next placed asset
    gridVisible: false,      // Show texture grid overlay
    nextAssetId: 1,          // Auto-increment ID for placed assets
    // Editor input state (for free cursor mode)
    isDragging: false,       // True when click-dragging to pan camera
    dragStartX: 0,           // Mouse X when drag started
    dragStartY: 0,           // Mouse Y when drag started
    lastMouseX: 0,           // Last mouse X position
    lastMouseY: 0            // Last mouse Y position
};

// Generate unique asset ID
export function generateAssetId() {
    return `asset_${editorState.nextAssetId++}`;
}

// Add a placed asset
export function addPlacedAsset(asset) {
    editorState.placedAssets.push(asset);
}

// Remove a placed asset by ID
export function removePlacedAsset(id) {
    const index = editorState.placedAssets.findIndex(a => a.id === id);
    if (index !== -1) {
        editorState.placedAssets.splice(index, 1);
        return true;
    }
    return false;
}

// Set texture at grid position
export function setTexture(theta, z, textureId) {
    // Round theta to 2 decimal places, z to nearest tile
    const key = `${theta.toFixed(2)},${Math.round(z / 10) * 10}`;
    if (textureId === 'grass') {
        delete editorState.textureGrid[key]; // grass is default
    } else {
        editorState.textureGrid[key] = textureId;
    }
}

// Get texture at grid position
export function getTexture(theta, z) {
    const key = `${theta.toFixed(2)},${Math.round(z / 10) * 10}`;
    return editorState.textureGrid[key] || 'grass';
}

// Export world state for saving
export function exportWorldState() {
    return {
        version: 1,
        assets: editorState.placedAssets,
        textures: editorState.textureGrid
    };
}

// Import world state
export function importWorldState(data) {
    if (data.assets) {
        editorState.placedAssets = data.assets;
        editorState.nextAssetId = Math.max(...data.assets.map(a => {
            const num = parseInt(a.id.split('_')[1]) || 0;
            return num;
        }), 0) + 1;
    }
    if (data.textures) {
        editorState.textureGrid = data.textures;
    }
}
