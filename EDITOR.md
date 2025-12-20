# Editor System Plan

A world-building editor for placing assets and painting ground textures on the Stanford Torus ring surface.

## Surface Coordinate System

The cylinder's inner surface unfolds to a rectangle:
- **Width (Z axis):** 130m (-65 to +65)
- **Length (theta):** ~4082m (circumference at r=649.8m, 0 to 2π radians)

Storage uses **(theta, z)** coordinates - natural cylindrical coords that map directly to Three.js positions.

---

## Part 1: Ground Texture System

### Grid Definition
- Divide surface into tiles: **10m × 10m** patches
- Grid dimensions: 13 tiles wide (Z) × ~408 tiles around (theta)
- Each tile stores a texture ID

### Texture Types
Built-in ground textures (procedurally generated or simple materials):
- `grass` - default green (current)
- `dirt` - brown earth
- `sand` - light tan
- `water` - blue (shallow, walkable)
- `path` - gray cobblestone/gravel
- `farm` - tilled dirt rows

### Data Format: `world/textures.json`
```json
{
  "gridSize": 10,
  "default": "grass",
  "tiles": {
    "0.1,-3": "dirt",
    "0.1,-2": "path",
    "3.14,0": "water"
  }
}
```
Keys are `"theta,z"` (theta in radians rounded to 2 decimals, z in tile units).

### Rendering Approach
**Option A: Texture Atlas (Recommended)**
- Create a single ground mesh with UV mapping
- Paint a canvas texture based on tile data
- Update texture regions on edit

**Option B: Tile Meshes**
- Generate small plane meshes per unique texture region
- More objects but simpler initial implementation
- Could merge adjacent same-texture tiles

### Implementation Files
- `src/editor/textures.js` - Texture painting logic and grid management
- `src/editor/groundMesh.js` - Custom ground geometry with texture support

---

## Part 2: Asset Placement System

### Asset Catalog
Scan `/assets/ultimate-nature/` and categorize:

| Category | Assets |
|----------|--------|
| Trees | CommonTree, BirchTree, PineTree, Willow, PalmTree, TreeStump |
| Rocks | Rock, Rock_Moss, Rock_Snow |
| Plants | Bush, Plant, Grass, Flowers, Cactus, Corn, Wheat |
| Water | Lilypad |
| Other | WoodLog |

### Placement Data Format: `world/assets.json`
```json
{
  "assets": [
    {
      "id": "tree_001",
      "type": "CommonTree_1",
      "theta": 1.234,
      "z": 15.5,
      "scale": 4.0,
      "rotation": 0.5
    }
  ]
}
```

### Placement Logic
1. Raycast from camera through mouse position to ground
2. Convert hit point to (theta, z) coordinates
3. Create asset instance at surface with proper orientation:
   ```javascript
   asset.position.set(r * cos(theta), r * sin(theta), z);
   asset.lookAt(0, 0, z);
   asset.rotateX(Math.PI / 2);
   ```
4. Add to placement list and habitatGroup

### Asset Loading
- Pre-load all assets on editor init (show loading progress)
- Cache loaded geometries/materials for cloning
- Use `InstancedMesh` for performance if many of same type

### Implementation Files
- `src/editor/assets.js` - Asset catalog, loading, placement
- `src/editor/assetInstances.js` - Instance management and optimization

---

## Part 3: Editor UI

### Asset Selector Bar
Position: Bottom of screen, horizontal strip

```
┌─────────────────────────────────────────────────────────────────┐
│  ◄  │ [grass] [dirt] [path] │ Tree1 │ [TREE2] │ Tree3 │ Rock │  ►  │
└─────────────────────────────────────────────────────────────────┘
                                   ↑ selected (highlighted)
```

### UI Elements
- **Selector container:** Fixed bottom, 80px height, semi-transparent
- **Items:** 64px thumbnails with labels below
- **Selection highlight:** Border/glow on active item
- **Categories:** Textures first, then asset categories
- **Search:** Optional text filter at left

### Controls (Planner Mode Only)
- **Left/Right arrows:** Scroll selector, change selection
- **Click on ground:** Place selected asset OR paint texture
- **Delete/Backspace:** Remove asset under cursor
- **R:** Rotate selected asset (before placing)
- **+/-:** Scale selected asset (before placing)
- **Ctrl+S:** Save world state

### Visual Feedback
- Ghost preview of asset at cursor position
- Grid overlay showing texture tiles (toggle with G)
- Highlight placed assets on hover

### Implementation Files
- `src/editor/ui.js` - Selector bar HTML/CSS injection
- `src/editor/controls.js` - Editor-specific input handling
- `src/editor/preview.js` - Ghost preview and grid overlay
- `index.html` - Add editor container div

---

## Part 4: Persistence

### File Structure
```
world/
├── textures.json    # Ground texture grid
├── assets.json      # Placed asset instances
└── manifest.json    # Metadata, version, last edit
```

### Save/Load Flow
1. **Save:** Serialize current state to JSON, download as file
2. **Load:** Fetch JSON files on startup, reconstruct scene
3. **Default:** Ship with a default world state

### API
```javascript
// In src/editor/persistence.js
export function saveWorld() → downloads zip or individual files
export function loadWorld(path) → fetches and applies world state
export function exportWorld() → returns JSON for external use
```

### Considerations
- Local-first: Changes saved to localStorage until explicit export
- Versioning: Include schema version in manifest
- Validation: Check asset types exist before loading

---

## Part 5: Integration with Existing Code

### Mode Awareness
- Editor UI only visible in planner mode
- Hide on mode switch to human/god
- Preserve editor state between mode switches

### File Changes Required

| File | Changes |
|------|---------|
| `src/main.js` | Init editor, load world on start |
| `src/controls/state.js` | Add `editorEnabled`, `selectedAsset` state |
| `src/controls/input.js` | Editor key bindings (arrows, R, G, Ctrl+S) |
| `src/controls/modes/planner.js` | Raycast on click, preview updates |
| `src/cylinder.js` | Replace simple ground with textured mesh |
| `src/features.js` | Load from assets.json instead of procedural |
| `index.html` | Editor UI container, asset selector |
| `src/styles.css` | Editor UI styles |

### New Files
```
src/editor/
├── index.js          # Main editor init and exports
├── textures.js       # Texture grid system
├── assets.js         # Asset catalog and placement
├── ui.js             # Selector bar UI
├── controls.js       # Editor input handling
├── preview.js        # Ghost preview, grid overlay
├── persistence.js    # Save/load world state
└── raycaster.js      # Ground picking utilities
```

---

## Implementation Order

### Phase 1: Foundation
1. Create `src/editor/` directory structure
2. Implement raycaster for ground picking
3. Add editor state to controls/state.js
4. Basic click-to-log-coordinates in planner mode

### Phase 2: Asset System
5. Build asset catalog from /assets directory scan
6. Implement asset loading with caching
7. Create asset placement function
8. Add ghost preview at cursor

### Phase 3: UI
9. Create selector bar HTML/CSS
10. Populate with textures + asset thumbnails
11. Arrow key navigation
12. Click to place selected item

### Phase 4: Textures
13. Design textured ground mesh
14. Implement texture painting on click
15. Add grid overlay toggle

### Phase 5: Persistence
16. Define JSON schemas
17. Implement save/export
18. Implement load on startup
19. Add default world state

### Phase 6: Polish
20. Undo/redo stack
21. Multi-select and bulk operations
22. Asset rotation/scale before placement
23. Performance optimization (instancing)

---

## Technical Considerations

### Performance
- Use `InstancedMesh` for repeated assets (trees, rocks)
- Texture atlas for ground to minimize draw calls
- Frustum culling (Three.js default)
- LOD for distant assets if needed

### Raycasting
- Single raycast against ground plane per frame when moving mouse
- Use `Raycaster.intersectObject(groundMesh)`
- Convert intersection point to (theta, z):
  ```javascript
  const theta = Math.atan2(point.y, point.x);
  const z = point.z;
  ```

### Asset Orientation
All placed assets need consistent orientation:
```javascript
function placeAsset(asset, theta, z, scale = 1, rotation = 0) {
  const r = 649.5; // slightly above ground
  asset.position.set(r * Math.cos(theta), r * Math.sin(theta), z);
  asset.lookAt(0, 0, z);
  asset.rotateX(Math.PI / 2);
  asset.rotateY(rotation); // local Y rotation for variety
  asset.scale.setScalar(scale);
}
```

### Memory
- Dispose of geometries/materials when removing assets
- Limit undo history depth
- Consider streaming for very large worlds

---

## Open Questions

1. **Texture resolution:** How detailed should ground textures be? Canvas size vs visual quality.

2. **Asset scale:** Should assets have fixed scales or allow arbitrary sizing?

3. **Collision:** Should assets block player movement in human mode?

4. **Multiplayer:** Future consideration for shared editing sessions?

5. **Undo scope:** Per-action undo or checkpoint-based?

---

## Success Criteria

- [ ] Can paint ground textures by clicking in planner mode
- [ ] Can place/remove assets from the selector
- [ ] Arrow keys scroll through asset options
- [ ] World state persists across page reloads
- [ ] Can export world as JSON files
- [ ] Editor UI hidden in human/god modes
- [ ] Performance stays smooth with 1000+ assets
