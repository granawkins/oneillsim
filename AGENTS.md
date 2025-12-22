# Stanford Torus Simulation

Live at [oneillsim.com](https://oneillsim.com)

## User Experience

A first-person 3D simulation of a Stanford Torus space habitat built with Three.js. The user walks on the inner surface of a rotating cylindrical space station, experiencing artificial gravity.

**Controls:**
- Click to enter (pointer lock)
- WASD: Walk forward/back/strafe left/right (always on ground)
- Mouse: Look around (up/down and turn left/right)
- Space: Jump (human mode only)
- Scroll: Zoom in/out, transitions between view modes (human ↔ planner ↔ god)
- E: Toggle editor mode (shows editor overlay in planner mode)
- L: Toggle sun ring visibility
- ESC: Release mouse

**View Modes:**
- *Human view* (default): Walk on the ring surface, camera 2m above ground, movement constrained to surface. Looking up/down doesn't affect movement direction. Space to jump.
- *Planner view* (scroll out): Birds-eye view 10-200m above ground, move along the ring with WASD. Scroll to zoom in/out.
- *God view* (scroll out from planner): Free flying in world space, 5x speed, camera detached from rotating habitat so you can watch it spin. No movement constraints.

**Environment:**
- Rotating cylindrical habitat (1 RPM)
- Central sun ring providing lighting
- Ground with texture grid (grass, farm, path, etc.)
- River band circling the cylinder
- Placed assets (buildings, trees, rocks) loaded from world.json
- Starfield visible outside

## Geometry & Coordinate System

The Stanford Torus is a donut-shaped space station. The simulation uses a specific coordinate system:

**Axes:**
- **Z axis**: The axis of rotation (the "axle" the donut spins around)
- **XY plane**: The plane the torus ring lies in (horizontal, like a donut on a table)

**Torus Dimensions:**
- **Ring radius (R)**: 650m - distance from origin to the center of the tube
- **Tube radius (r)**: 65m - radius of the tube's circular cross-section
- Inner surface (toward Z axis): R - r = 585m from Z axis
- Outer surface (away from Z axis): R + r = 715m from Z axis
- Total tube diameter: 130m (matches CYLINDER_LENGTH)

**Player Position:**
- Player stands on the inner surface of the tube at radius ~648m from Z axis
- The cylinder (CYLINDER_RADIUS = 650) represents the living space cross-section
- Player's "down" = radially outward from Z axis (toward outer surface)
- Player's "up" = radially inward toward Z axis (toward inner surface)

**Torus Parametric Equations** (ring in XY plane):
```
x = (R + r·cos(φ))·cos(θ)
y = (R + r·cos(φ))·sin(θ)
z = r·sin(φ)
```
Where θ = angle around the ring, φ = angle around the tube cross-section.

**Rotation:**
- `habitatGroup` rotates around Z axis at 1 RPM
- Everything inside habitatGroup (cylinder, torus, features) rotates together
- Stars are in the scene (not habitatGroup) so they appear fixed in space

## World Data (world.json)

The world state is stored in `world.json` and loaded on startup. The dev server supports PUT to save changes.

**Texture Grid:**
- 2D array of texture IDs: `grid[row][col]`
- **13 rows** (z axis: -60m to +60m in 10m tiles)
- **408 columns** (around the ring: ~10m tiles at radius 650m)
- Texture IDs: `0=grass, 1=farm, 2=path, 3=dirt, 4=sand, 5=water`
- Grass (0) is the default ground color; other textures render as colored patches

**Coordinate mapping:**
- Row 0 = z=-60m (one edge), Row 12 = z=+60m (other edge)
- Column 0 = θ=0, Column 408 = θ=2π (wraps around)
- Functions `worldToGrid(theta, z)` and `gridToWorld(row, col)` convert between systems

**Assets (sparse):**
- Array of placed objects: `{ id, type, theta, z, scale, rotation }`
- Loaded from OBJ/MTL files in `/assets/ultimate-buildings/` and `/assets/ultimate-nature/`
- Not tied to the texture grid

## World Initialization Rules

The initial world layout follows these rules:

**Six Sections:**
- The ring is divided into 6 equal sections (68 columns each, 408 / 6 = 68)
- Sections alternate between grass (0) and farm (1)
- Pattern around the ring: grass → farm → grass → farm → grass → farm

**Section Boundaries:**
| Section | Columns   | θ Range      | Texture |
|---------|-----------|--------------|---------|
| 1       | 0-67      | 0° - 60°     | grass   |
| 2       | 68-135    | 60° - 120°   | farm    |
| 3       | 136-203   | 120° - 180°  | grass   |
| 4       | 204-271   | 180° - 240°  | farm    |
| 5       | 272-339   | 240° - 300°  | grass   |
| 6       | 340-407   | 300° - 360°  | farm    |

**Path Along One Edge:**
- Row 0 (z = -60m, the negative-z edge of the cylinder) is entirely path (2)
- This creates a continuous walkway around the entire ring at one edge
- Rows 1-12 follow the grass/farm alternating pattern

**Visual Summary:**
```
Row 0:  [path path path path path path]  ← entire ring circumference
Row 1:  [grass|farm|grass|farm|grass|farm]
Row 2:  [grass|farm|grass|farm|grass|farm]
...
Row 12: [grass|farm|grass|farm|grass|farm]
```

## Codebase Structure

ES modules with no build step. Three.js loaded via import map from CDN.

```
src/
├── main.js       # Entry point, loads world.json, animation loop
├── scene.js      # Three.js scene, camera, renderer setup
├── controls/     # Camera and input handling
│   ├── index.js      # Main exports, setupControls
│   ├── constants.js  # Movement speeds, physics, dimensions
│   ├── state.js      # Shared state (mode, camera refs, input)
│   ├── input.js      # Keyboard, mouse, wheel event handlers
│   ├── transitions.js # Mode switching logic
│   └── modes/
│       ├── human.js   # First-person walking on surface
│       ├── planner.js # Birds-eye view above ground
│       └── god.js     # Free-flying detached camera
├── editor/       # World editing system
│   ├── index.js      # Editor orchestration, save/load
│   ├── state.js      # Grid constants, texture IDs, import/export
│   ├── textures.js   # Ground texture painting and rendering
│   ├── placement.js  # Asset placement on surface
│   ├── catalog.js    # Available textures and assets
│   ├── loader.js     # OBJ/MTL asset loading with cache
│   ├── raycaster.js  # Mouse-to-surface intersection
│   └── ui.js         # Editor UI components
├── lighting.js   # Sun ring and ambient light
├── cylinder.js   # The habitat hull and ground
├── torus.js      # Steel torus structure (outer ring visible in space)
├── features.js   # River band (procedural)
├── stars.js      # Background starfield
└── styles.css    # UI styling
```

## Files

| File | Description |
|------|-------------|
| `serve.ts` | Bun dev server with PUT endpoint for saving world.json |
| `world.json` | World state: texture grid (13×408) + placed assets |
| `index.html` | HTML shell, import map, UI elements |
| `src/main.js` | Entry point, loads world.json, runs animation loop |
| `src/scene.js` | Creates scene, camera, renderer, habitatGroup, cameraAnchor |
| `src/controls/` | Camera and input handling (see Codebase Structure) |
| `src/editor/index.js` | Editor orchestration, save/load world |
| `src/editor/state.js` | Editor state, grid constants, import/export |
| `src/editor/textures.js` | Ground texture painting and rendering |
| `src/editor/placement.js` | Asset placement on surface |
| `src/editor/catalog.js` | Available textures and assets |
| `src/lighting.js` | Sun ring torus with 12 point lights, ambient light |
| `src/cylinder.js` | Cylinder geometry for hull and ground layer |
| `src/torus.js` | Steel torus structure with toggleable inner/outer halves |
| `src/features.js` | River band (procedural) |
| `src/stars.js` | Random starfield particles |
| `src/styles.css` | Overlay, UI panel, crosshair styles |
