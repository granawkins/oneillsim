# Human character physics — operating note

## Integration and tuning

`src/physics/character-controller.js` owns the SI-unit configuration (`CHARACTER`), fixed-step controller and capsule/triangle contacts. `src/physics/collider-world.js` owns the habitat-local spatial hash and `characterColliders` singleton. The human camera adapter is `src/controls/modes/human.js`; planner/god movement, zoom, camera presets and deck UI remain separate.

- Capsule: 0.35 m radius, 2 m height; eye at the capsule's upper tip. Foot position is the physics origin.
- Walk: 5 m/s, normalized diagonal input. Jump: 5 m/s initial upward speed, approximately 1.32 m apex at the centerline. Step clearance: 0.30 m. Higher terraces require the existing stairs, not enlarged jumps.
- Physics: 120 Hz accumulator, incoming frame delta capped at 0.25 s. Additional travel subdivisions cap each collision increment at 0.14 m. Excess real time after a stall is intentionally discarded rather than causing a teleport or unbounded catch-up.
- Gravity: outward radial, `9.32 * radialDistance / 830` m/s², in the rotating habitat's local coordinates. No Coriolis/inertial dynamics are claimed.
- Invisible containment: both capsule-end spheres are constrained to the tube's circular cross-section (major radius 830 m, tube radius 65 m), including inner, outer and both Z sides. This is the project's centerline-ground presentation, not a historical floor-layout claim.
- Human gravity runs while idle/unlocked. Blur, hidden document and pointer unlock clear held input. Capture-only poses remain frozen until gameplay is explicitly advanced.

## Geometry lifecycle / future doors

The hash uses 8 m XYZ cells. Asset and terrace triangles are transformed into habitat-local coordinates once during registration; queries deduplicate nearby cells and then filter triangle AABBs before narrowphase. The high-resolution cylinder ground is **not indexed or scanned**; its support is analytic, with terrace-sector ground cuts respected. Actual rendered stair risers, terrace undersides, roofs and walls are indexed. Geometry, not whole-building bounds, determines collision, so real mesh apertures remain open if large enough for the capsule. Rendering visibility/deck selection never disables physics.

`createTerraces` registers its geometry. `loadPlacedAssets`/`placeAsset` register transformed geometry synchronously before load/placement completes; `removeAsset` removes the same exact ID. World serialization and saved data are unchanged.

For a future moving door/proxy:

```js
characterColliders.setObject(doorId, doorMesh, habitatGroup); // closed, or refresh after transform
characterColliders.remove(doorId);                          // open / removed
// Equivalent clear operation:
characterColliders.setObject(doorId, doorMesh, habitatGroup, { enabled: false });
```

Call replacement between controller updates. Static triangles are snapshots: moving/deforming geometry must be refreshed explicitly. There is no door UI or world-layout change. Closed door geometry already present in an authored mesh remains solid; physics does not invent an opening. This is a kinematic capsule, not a rigid-body engine: no moving-platform carry, pushing bodies, swept moving-door forces, skinned/instanced deformation support, or general recovery from spawning deep inside closed solids. Thin surface contacts are two-sided and iterative; pathological dense mesh intersections can need authoring cleanup.

## Safe verification

Run from the isolated worktree (or the parent-reviewed integration), using the existing read-only dependency symlink. Do not install dependencies, start a QA server, PUT `world.json`, or restart/push for these checks.

```sh
NODE=/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node
$NODE --test --test-concurrency=1 tests/character-physics.test.js tests/loading-performance.test.js tests/camera-presets.test.js tests/agriculture-plan.test.js tests/residential-plan.test.js tests/settlement-plan.test.js tests/snapshot-options.test.js
ONEILLSIM_CANDIDATE=1 SNAPSHOT_CHROMIUM_PATH=/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome $NODE --test --test-concurrency=1 tests/character-physics.browser.test.js tests/loading-performance.browser.test.js tests/camera-links.browser.test.js
git diff --check
git hash-object world.json
git rev-parse HEAD:world.json
```

Browser tests intercept only the candidate source responses from this checkout against `http://127.0.0.1:3200/oneillsim/`. Fixture worlds are browser-only GET responses; routed non-GET requests are aborted. Small viewports avoid exhausting shared-host software WebGL. The deterministic editing/controller fixture stops redundant capture redraws after initialization; the separate unlocked-fall test exercises actual animation.

Playwright routing globally disables HTTP cache. Therefore the loading regression first exercises candidate integration, then explicitly removes routing and verifies six zero-transfer skybox cache hits on ordinary live-service visits. This is **not** a claim that intercepted requests exercise normal browser caching. Delayed-model readiness and first-frame/save guards run against candidate code. Static gzip/cache rules also have unchanged passing unit tests.

## Evidence / interpretation

The latest serial run passed **37 Node tests** (including 12 controller tests) in 2.94 s; the candidate browser run passed **6/6** in 135.79 s. The representative saved layout has 387 placements plus 75 terrace meshes: 462 collider registrations, 55,008 triangles, 16,265 occupied hash cells. The 1,200-location benchmark visits all ring angles and multiple elevations/Z positions, measuring two fixed ticks per 60 Hz update. Average hash candidates were 2.42/query (maximum 210 in that run), not the full triangle set. The final serial benchmark measured mean **0.02162 ms**, p95 **0.05903 ms**, maximum **0.21617 ms**, and blockout construction/registration **460.43 ms**. Under concurrent shared-host load, observed p95 rose to 0.68 ms and outliers reached 128 ms, so this is not a hard worst-case frame-time guarantee. Blockout construction/registration across those runs was approximately 0.40–2.48 s; colliders are ready before the ready event.

Deterministic tests include zero-thickness/thin walls, ceilings, sliding, roof jumps, independent high-deck falls, a 60 m long-frame fall, stairs (including the actual 15 m/100-riser farm staircase), transforms, visibility, proxy removal/motion, tube limits, centrifugal gravity and 30/60/144 Hz/irregular frames. Browser integration additionally landed on the real rotated/scaled/elevated TorusHome roof at 7.57001 m, walked 5 m in one simulated second, measured the 1.32151 m jump, preserved exact live IDs and camera captures, and verified editor deletion clears collision. No mutable world or infrastructure file is part of this feature.
