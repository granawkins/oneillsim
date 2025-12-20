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
| `src/controls.js` | Pointer lock, surface walking, mouse look, god mode toggle |
| `src/lighting.js` | Sun ring torus with 12 point lights, ambient light |
| `src/cylinder.js` | Cylinder geometry for hull and ground layer |
| `src/features.js` | River band, procedural towns and forests |
| `src/stars.js` | Random starfield particles |
| `src/styles.css` | Overlay, UI panel, crosshair styles |
