# Residential kit and Garden Court extension

Three curated models extend the existing residence and street furniture palette:

- `TorusHome_CourtyardA`: 7.6 × 7.6 m footprint, 5.62 m tall, 1,056 triangles.
- `TorusHome_RowA`: 11.5 × 7.6 m footprint, 5.62 m tall, 1,944 triangles; three connected exterior dwelling shells.
- `TorusApartment_TerraceA`: 15.5 × 11.6 m footprint, 8.40 m tall, 2,412 triangles; three stepped levels with shared terraces.

All have one mesh, one opaque material, and one shared RGB 512px atlas. OBJ coordinates are metres divided by four; scale 4 restores human scale. Feet are at y=0, +Y up and +Z entry facade. Existing `TorusHome_ModA` remains unchanged and separately cached.

## Historical grounding and limits

SP-413 Figures 5-5–5-7 (printed pp.91–92, PDF108–109) establish terraced modular residences and pedestrian space. Text segment `sp413-s02268` describes one/two-level homes and higher groups. Appendix B printed p.113/PDF130 (`sp413-s02724`, `sp413-s02725`) gives typical 4×6m bays and 2m beam spacing; the source scan was visually checked during authoring. These new variants do not enforce that exact structural grid. Their extents, room arrangement, storey heights, openings and stairs are authored interpretation, not dimensioned report plans or certified construction designs.

Buildings are unfurnished shells with actual open door gaps, solid floors, opaque solid glazing, external stairs and terraces. No moving doors, furniture fitout, functional residence systems or engineered guardrail/accessibility compliance is claimed.

## Live placement

The extension adds 12 stable records: six courtyard homes, four row-house blocks and two apartment buildings, around Garden Court in Residential B. `src/residential-kit.js` owns the deterministic placements, safe aisle reservations and view presets. All 423 prior world records, IDs, type indices, terrain/crop settings and terrace topology are retained; resulting world count is 435.

Walking link: `/oneillsim/?theta=149&z=18&yaw=180&pitch=0`.
Planner capture: `/oneillsim/?capture=1&theta=148.7&z=58&mode=planner&height=45&yaw=0&pitch=-40`.

`scripts/populate-residential-kit.mjs` is dry-run by default. `--apply` validates files, exact model bounds, tube containment, safe aisles and original-record preservation. It creates a private byte-exact backup, guards concurrent changes, writes atomically, reads back, and preserves compact formatting. Repeating is a no-op; ID conflicts are errors. This is a bounded prototype extension, not a whole-settlement population plan.

## Collision and stair fix

Real doorway crossings pass with the production radius0.35m, height2m and speed15m/s capsule at all 12 placed buildings. All 22 authored stair flights are exercised against actual OBJ triangles, reaching and remaining grounded at their upper landings (2.9m or5.68m). Treads are 0.278m high and 0.30–0.32m deep, with1.4m width.

Integration discovered stair-edge contact normals converting commanded horizontal speed into upward velocity, launching walkers. The controller now removes contact-created upward velocity while preserving explicit jump velocity. Small-riser, tall-wall, jump/apex, hull, thin-wall, falling, existing farm-stair and browser regressions remain required. Stair fixtures stop at the landing rather than running off its next edge.

## Performance evidence

At the fixed 640×400 planner capture, adding the 12 buildings changes 62 draw calls/66,294 rendered triangles to 74 calls/85,230 triangles. All new models share the same material/map identities and download the residential atlas once. The full collision index has510colliders/85,652triangles. CPU/WebGL host measurements are not desktop/mobile FPS promises. Runtime editor models remain cached clones, not instanced batches; city-wide dense repetition still requires batching/instancing with per-ID editing/physics preservation.

## Rebuild and checks

- `python3 assets/scripts/build_torus_residential_kit.py`
- `python3 -m unittest discover -s tests -p 'residential_kit_assets_test.py' -v` — indices, normals/winding, UVs, paths, counts/bounds/budgets, byte-exact regeneration, shell/opening/floor/stair/headroom/route geometry, real Three.js render.
- `node --test tests/residential-kit.test.js tests/residential-stairs.test.js` — additive layout safety and actual physics.
- `RESIDENTIAL_KIT_CANDIDATE=1 node --test tests/residential-kit-integration.browser.test.js` — read-only browser-only placement before applying.
- `ONEILLSIM_TEST_URL=https://stanfordtorus.com/ node --test tests/residential-kit-integration.browser.test.js tests/residential-kit-library.browser.test.js` — real deployed IDs/resources/colliders/doors/views and all three library variants.
- Run the existing character/camera/loading/plan regressions and Next production build.

Browser tests block non-GET/HEAD world writes; the existing unauthenticated PUT save endpoint is unchanged. Screenshots use a bounded shared-host render timeout and frozen capture pose; never substitute generated art for actual mesh render proof.
