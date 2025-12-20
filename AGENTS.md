# Stanford Torus Simulation

Live at [oneillsim.com](https://oneillsim.com)

## User Experience

A first-person 3D simulation of a Stanford Torus space habitat built with Three.js. The user walks on the inner surface of a rotating cylindrical space station, experiencing artificial gravity.

**Controls:**
- Click to enter (pointer lock)
- WASD: Walk forward/back/strafe left/right (always on ground)
- Mouse: Look around (up/down and turn left/right)
- Tab: Toggle god mode (free flying, detached from rotating habitat)
- L: Toggle sun ring visibility
- ESC: Release mouse

**View Modes:**
- *Human view* (default): Walk on the ring surface, camera 2m above ground, movement constrained to surface. Looking up/down doesn't affect movement direction.
- *God view* (Tab): Free flying in world space, 5x speed, camera detached from rotating habitat so you can watch it spin. No movement constraints.

**Environment:**
- Rotating cylindrical habitat (1 RPM)
- Central sun ring providing lighting
- Ground with grass texture
- River band circling the cylinder
- Two small towns with houses
- Forest concentrated near the endcaps
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

## Codebase Structure

ES modules with no build step. Three.js loaded via import map from CDN.

```
src/
├── main.js       # Entry point, init and animation loop
├── scene.js      # Three.js scene, camera, renderer setup
├── controls.js   # Keyboard/mouse input handling
├── lighting.js   # Sun ring and ambient light
├── cylinder.js   # The habitat hull and ground
├── torus.js      # Steel torus structure (outer ring visible in space)
├── features.js   # River, towns, forests
├── stars.js      # Background starfield
└── styles.css    # UI styling
```

## Files

| File | Description |
|------|-------------|
| `serve.ts` | Bun dev server with no-cache headers |
| `index.html` | HTML shell, import map, UI elements |
| `src/main.js` | Entry point, calls init functions, runs animation loop |
| `src/scene.js` | Creates scene, camera, renderer, habitatGroup, cameraAnchor |
| `src/controls.js` | Pointer lock, surface walking, mouse look, god mode toggle |
| `src/lighting.js` | Sun ring torus with 12 point lights, ambient light |
| `src/cylinder.js` | Cylinder geometry for hull and ground layer |
| `src/torus.js` | Steel torus structure with toggleable inner/outer halves |
| `src/features.js` | River band, procedural towns and forests |
| `src/stars.js` | Random starfield particles |
| `src/styles.css` | Overlay, UI panel, crosshair styles |
