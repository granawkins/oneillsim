# Interior feel pass: materials, light and woodland

This pass preserves the approved layout, saved world and exterior engineering.
`world.json` remains SHA-256
`df442e3dc7c1349e4385545f5f20664f079383bcfbfb3e51552751ba9a2d9ecf`.

## Integrated treatment

- Six original deterministic texture maps provide grass, mineral concrete and
  staggered stone paving with physically scaled curved-surface UVs. Neutral
  albedo multiplies the existing palette. Packed roughness/bump maps are shared,
  not cloned for every mesh. Texture decode is part of complete-scene readiness.
- The main v2 runtime applies these materials and restores its borrowed ground
  geometry/material on disposal. Existing conveyor UV animation is unchanged.
- Three new tree forms (forked fruit tree, pale birch, whorled cedar), shrubs,
  ferns, blade grass and tallflowers fill selected wooded park lobes. 3,802 new
  plants include 145 trees and 3,657 understory plants. Seven distinct reusable
  geometries are instanced into 82 spatial/species batches. Existing saved trees
  remain. Trunks are physical; understory is intentionally nonblocking.
- Ambient light is lower, with two radial daylight banks filtered by a profile
  derived from the actual chevron mesh and actual secondary receiver targets.
  The module defaults to ambient 3; main deliberately chooses 7 after image
  review so older tree materials remain legible. The old baseline was 75.
- One local 512², 64 m-wide PCF-soft contact map supplies real geometry shadows,
  throttled to 6 Hz and capped at 12 caster submissions / 80,000 triangles.
  This is not whole-habitat shadow coverage or exact reflected optical transport.
  Below-plain civic areas use readable bounce, not invented sunlight through
  their opaque ceiling. Exterior mode restores its original lighting balance.
- Brightness UI routes through the new rig. Software-renderer visits retain
  color/roughness textures but disable derivative bump sampling; ordinary GPU
  visits enable it. The fallback is exposed through `__oneillRenderQuality`.

## Actual checks

The combined pre-integration-specific suite passed 60 tests, followed by passing
checks for the ambient override and textured runtime ground/material lifecycle.
The real full-scene browser traversed all twelve hill summit paths, all eighteen
partition portals both ways, all six spoke/belt routes and step-off behavior with
new vegetation loaded. No shader compiler errors occurred in the completed
render verification.

`node scripts/verify-interior-lookdev.mjs` verified all six decoded maps, brightness
slider scaling, exterior/interior light restoration and actual allocated shadow
maps. At the woodland camera the selected contact map contained twelve casters /
27,468 triangles. Switching its shadow contribution off/on changed 454 pixels
at 320×240, with a maximum 8-bit channel difference of 9: a measured subtle shadow
contribution, not merely a shadow-map allocation claim.

At that fixed camera, cached visible-frame inventory was 296 calls / 399,456
triangles without infill and 314 calls / 549,904 triangles with it. These are
camera-specific whole-scene counters, not the full-visible 82-batch upper bound.
Host software-GL timing samples were noisy; no stable FPS or hardware-GPU
performance claim is made. Later large capture runs hit wall-clock bounds while
the shared server was heavily loaded and swapping; successful earlier captures
and route evidence are retained, and capture resolution was reduced to 640×480.

Rendered views were inspected for grass and paving scale, shaded concrete,
woodland species/density, overview and lower-level readability. The visual style
remains intentionally low-poly. Chevron filtering is a source-informed lookdev
approximation rather than a solved multi-reflection lighting simulation.

The optional `INTERIOR_TEST_FAILURE=1` browser injection exercises texture failure
cleanup; it is off by default. Its first shared-host run timed out before a
recorded result. Unit tests cover texture rejection and disposal, and the main
error path detaches the runtime; do not claim the optional browser injection
passed without a recorded result.

## Files and verification entry points

- `src/interior-materials.js`, `docs/interior-materials.md`
- `src/interior-lighting.js`, `docs/interior-lighting.md`
- `src/interior-vegetation.js`, `src/interior-vegetation-prototypes.js`,
  `docs/interior-vegetation.md`
- `scripts/verify-interior-browser.mjs` (complete-world movement + comparison views)
- `scripts/verify-interior-lookdev.mjs` (render inventories, maps, UI, shadows)
- `tests/interior-materials.test.js`, `tests/interior-lighting.test.js`,
  `tests/interior-vegetation.test.js`, `tests/interior-lookdev-integration.test.js`

The existing public world-save endpoint and its authorization behavior are unchanged.
