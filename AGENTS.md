# Stanford Torus Simulation

Live at [oneillsim.com](https://oneillsim.com)

## User Experience

A first-person 3D simulation of a Stanford Torus space habitat built with Three.js. The user flies freely inside a rotating toroidal space station.

**Controls:**
- Click to enter (pointer lock)
- WASD: Move forward/back/left/right
- Space/Shift: Move up/down
- Mouse: Look around
- L: Toggle sun ring visibility
- ESC: Release mouse

**Environment:**
- Rotating cylindrical habitat (1 RPM)
- Central sun ring providing lighting
- Ground with grass texture
- River band circling the cylinder
- Two small towns with houses
- Forest concentrated near the endcaps
- Starfield visible outside

The camera is oriented so "down" points toward the cylinder surface (inverted gravity feel).

## Codebase Structure

ES modules with no build step. Three.js loaded via import map from CDN.

```
src/
├── main.js       # Entry point, init and animation loop
├── scene.js      # Three.js scene, camera, renderer setup
├── controls.js   # Keyboard/mouse input handling
├── lighting.js   # Sun ring and ambient light
├── cylinder.js   # The habitat hull and ground
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
| `src/controls.js` | Pointer lock, WASD movement, mouse look, boundary clamping |
| `src/lighting.js` | Sun ring torus with 12 point lights, ambient light |
| `src/cylinder.js` | Cylinder geometry for hull and ground layer |
| `src/features.js` | River band, procedural towns and forests |
| `src/stars.js` | Random starfield particles |
| `src/styles.css` | Overlay, UI panel, crosshair styles |
