// Editor state management

// Grid constants
export const GRID_TILE_SIZE = 10;  // meters per tile
export const GRID_ROWS = 13;       // tiles along Z axis (130m / 10m)
export const GRID_COLS = 408;      // tiles around ring (2 * PI * 650 / 10)
export const GROUND_RADIUS = 649.8;

// Texture IDs (numeric for compact storage)
export const TEXTURE_IDS = {
    grass: 0,
    farm: 1,
    path: 2,
    dirt: 3,
    sand: 4,
    water: 5
};

// Reverse lookup
export const TEXTURE_NAMES = ['grass', 'farm', 'path', 'dirt', 'sand', 'water'];

export const editorState = {
    enabled: false,  // Toggle with 'E' key
    bulldozerMode: false,    // When true, clicking deletes items
    selectedIndex: 0,        // Index in the catalog (legacy)
    selectedCategory: null,  // Currently selected category key
    selectedItem: null,      // Currently selected item object
    placedAssets: [],        // Array of { id, type, theta, z, scale, rotation } - SPARSE
    textureGrid: null,       // 2D array [row][col] of texture IDs - loaded from world.json
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

// Convert world coordinates to grid indices
export function worldToGrid(theta, z) {
    // theta is in radians [0, 2*PI), col is [0, GRID_COLS)
    // Normalize theta to [0, 2*PI)
    let normTheta = theta % (2 * Math.PI);
    if (normTheta < 0) normTheta += 2 * Math.PI;
    const col = Math.floor(normTheta / (2 * Math.PI) * GRID_COLS) % GRID_COLS;

    // z is in [-65, 65], row is [0, GRID_ROWS)
    // z = -65 -> row 0, z = +65 -> row 12
    const row = Math.floor((z + 65) / GRID_TILE_SIZE);
    const clampedRow = Math.max(0, Math.min(GRID_ROWS - 1, row));

    return { row: clampedRow, col };
}

// Convert grid indices to world coordinates (center of tile)
export function gridToWorld(row, col) {
    const theta = (col + 0.5) / GRID_COLS * 2 * Math.PI;
    const z = (row + 0.5) * GRID_TILE_SIZE - 65;
    return { theta, z };
}

// Set texture at grid position
export function setTextureAt(row, col, textureId) {
    if (!editorState.textureGrid) return;
    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        // Handle string or numeric texture ID
        const id = typeof textureId === 'string' ? (TEXTURE_IDS[textureId] ?? 0) : textureId;
        editorState.textureGrid[row][col] = id;
    }
}

// Get texture ID at grid position
export function getTextureId(row, col) {
    if (!editorState.textureGrid) return 0;
    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        return editorState.textureGrid[row][col];
    }
    return 0;
}

// Export world state for saving
export function exportWorldState() {
    return {
        version: 2,
        gridSize: { rows: GRID_ROWS, cols: GRID_COLS, tileSize: GRID_TILE_SIZE },
        textureNames: TEXTURE_NAMES,
        grid: editorState.textureGrid,  // 2D array of texture IDs
        assets: editorState.placedAssets  // Sparse array of placed assets
    };
}

// Import world state from world.json
export function importWorldState(data) {
    // Load texture grid
    if (data.grid) {
        editorState.textureGrid = data.grid;
    }

    // Load assets (sparse)
    if (data.assets) {
        editorState.placedAssets = data.assets;
        editorState.nextAssetId = Math.max(...data.assets.map(a => {
            const num = parseInt(a.id.split('_')[1]) || 0;
            return num;
        }), 0) + 1;
    }
}
