# Completed asset library

## Scope

The remaining 47 empty library types now each have one curated, source-informed model:

- Commerce: 3 (covered market, cafe/restaurant, internal light-service workshop).
- Nature: 7 (tree, shrub, grass, flowers, rock, pond, stream).
- Agriculture: 8 (grain, legumes, vegetables, greenhouse, growing bed, irrigation, animal housing, aquaculture tank).
- Fauna: 4 (cow, chicken, rabbit, fish).
- Transport: 8 (road, pedestrian bridge, stairs/ramp, rail, station, minibus, cart, bicycle).
- Utilities: 8 (water tank, pump, water treatment, air handler, waste processing, distribution cabinet, pipes/cables, light).
- Structure: 9 (hull coupon, truss, spoke section, hub envelope, docking collar, open airlock, mirror bay, shield section, radiator bay).

The complete library contains **67 types, 106 model variants, zero empty types**. The existing 59 variants are retained. `src/remaining-model-contract.js` is the exact acceptance contract; `src/completed-models.js` contains reviewed actual descriptors/references. Each kit has its own descriptor, deterministic generator, tests, shared opaque atlas, real Three.js previews and editor icons. All models use OBJ metres/4 and intended scale 4, one mesh and one atlas material.

## Source versus interpretation

Raw manifests preserve printed pages, stable reading-edition IDs, source facts, authored choices, uncertainties, precise bounds and collision intent. Every new cited segment is validated against `study/segments.json`. Detailed architecture, equipment layouts, colors, vehicles, farm specimens and animals are interpretations, not engineering blueprints. The commercial factory is an internal light-service workshop, not an occupied-torus smelter. Structural models distinguish full-system envelopes from representative full-scale sections. The radiator source discrepancy is retained in the model record rather than resolved by invention.

These are static assets, not operating transportation, life support, agriculture, animal AI, fluids, moving doors or engineered thermal/radiation systems. Water surfaces and foliage have ordinary static mesh collision, not swimming or botanical simulation. Long local access modules need deliberate orientation/terrain accommodation, not automatic cylinder tiling. The exterior-only full hub is inspection-only and excluded from terrain placement menus; the other 46 designs are available in the editor. No structural prototype or scene district was automatically replaced by this work.

## Integration and verification

- Library/group references, editor names/directories/thumbnails and snapshot allowlists include all 47 designs.
- Manifest normalization accepts axis-pair bounds or object min/max bounds, numeric or named-array material counts; source-fact objects are rendered as prose without changing raw files.
- Actual-bounds inspection framing supports both small props and large structural specimens. Atlas size is read from the decoded image rather than hard-coded.
- Viewer readiness waits for atlas loading and surfaces failures instead of reporting an untextured model ready.
- New kit material pooling is exact-ID and registration gated; nature-directory models participate alongside building-directory models.
- Public browser verification renders all 47 real models, checks metadata, scale, interpretation, mesh/material/atlas links and capture URLs without page errors.
- Real editor-loader verification creates distinct borrowed clones for all 47 with shared geometry/materials. Seven isolated GPU atlas maps each download once. All 46 placeable models register colliders and remove cleanly without disposing cached resources or changing exported world data. The test forbids world writes.
- Actual speed-15 capsule traversal passes both the stairs and ramp upper landings, plus market, restaurant, workshop pedestrian entry, greenhouse, animal shelter and airlock entries, settling grounded and clear.
- Production Next build, asset validators and relevant existing regressions pass. The broad 73-check regression run had 72 passes and one existing wall-clock build gate failure (6.30 s); an isolated unchanged physics rerun passed all 14 checks, build 3.27 s, mean query .055 ms, p95 .149 ms. The threshold was not relaxed.

Saved world remains byte-identical: 435 records; SHA-256 `3a0743b3215b777c14033ccb8d4eee3b624336d586005104edbbbdda645561b6`. The intentionally unauthenticated public world-save endpoint is unchanged and never used by these tests.

## Reproducible checks

Run each of `commerce_kit_assets_test.py`, `nature_kit_assets_test.py`, `agriculture_kit_assets_test.py`, `fauna_kit_assets_test.py`, `transport_kit_assets_test.py`, `utility_kit_assets_test.py`, and `structure_kit_assets_test.py` through `python3 -m unittest discover -s tests -p NAME -v`. Generators own their explicit kit outputs; real offline previews use the existing Chromium/Three installation and blocking render lock.

Run `node --test tests/completed-models.test.js tests/remaining-model-contract.test.js tests/material-kits.test.js tests/completed-models-traversal.test.js tests/district-manifest.test.js tests/snapshot-options.test.js`; then `ONEILLSIM_TEST_URL=https://stanfordtorus.com/ node --test --test-concurrency=1 tests/completed-models.browser.test.js`. Run `tests/character-physics.test.js` separately from software-WebGL and generation jobs. Use the service's pinned Node and existing Chromium; do not install packages or create QA ports.
