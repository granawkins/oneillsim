# Street furniture kit and Garden Court

The complete **Furniture & small props** library group now has one authored variant per type: benches, tables, planters, fences/railings, signs and waste bins. Real editor models and the development library share stable IDs through `src/street-kit.js`.

## Historical grounding

SP-413 Figures 5-5 and 5-7 (printed pp. 91–92, PDF pp. 108–109) establish the terraced residential and planted pedestrian context. They are conceptual illustrations, not dimensioned furniture drawings. Shapes, dimensions, palette, sign wording, vegetation, and the Garden Court arrangement are authored interpretation consistent with `TorusHome_ModA`. No functional seating, waste processing or guardrail certification is implied.

## Asset contract

- Six opaque OBJ models, one mesh/material each; 58–270 triangles.
- One RGB 512×512 atlas, `TorusStreetKit_Atlas.png`, 15,308 bytes.
- Feet y=0, +Y up, +Z front; OBJ coordinates divided by four for editor scale 4.
- Matching `.asset.json` manifests contain measured bounds/counts and provenance.
- Repeatable generator: `python3 assets/scripts/build_torus_street_kit.py`.
- Offline validation: `python3 -m unittest discover -s tests -p 'street_kit_assets_test.py' -v`.

The simulation loader explicitly shares the kit's material creator/material/atlas. Same-model clones borrow geometry; deleting a clone does not dispose resources used by survivors. Unrelated material names are not globally pooled. Failed MTL/atlas/OBJ loads are retryable, and the four-worker preload queue remains bounded.

## Bounded live layout

Garden Court is at theta=150° on Residential B ground. It adds six copies of the existing home and 30 props: eight benches, three tables, eight planters, six railings, two signs and three bins. Its 36 IDs have the `street-pilot-` prefix. All pre-existing 387 asset records, terrain, crop configuration, terrace topology and other fields are preserved. The resulting world has 423 records.

Visit `/oneillsim/?theta=150&z=5&yaw=0&pitch=0` for walking, or `/oneillsim/?theta=150&z=22&mode=planner&height=14&yaw=0&pitch=-30` for an overview. The library also links to the court.

`scripts/populate-street-pilot.mjs` defaults to a dry run. `--apply` checks reviewed files and ID conflicts, makes a private byte-exact world backup, adds only the specified records and missing type entries, checks for concurrent world changes, writes atomically, and reads back unchanged original records/fields. Repeating it is a no-op. Backup files remain outside Git and public serving under `~/.local/share/oneillsim/backups/`.

## Measurements and scaling limit

Measured from the actual 640×400 planner view with a fixed camera, not an FPS benchmark:

- Without the pilot visible: 19 draw calls / 54,572 rendered triangles.
- With the pilot: 51 draw calls / 65,624 rendered triangles.
- One atlas download across all six prop types; same material and texture identities.
- World collision index: 498 colliders / 66,716 triangles, including the existing 75 terrace meshes.

A browser-only repetition proof using the actual six models rendered 1,200 ordinary clones in 1,200 draw calls; the equivalent six `InstancedMesh` batches used six calls. **The production editor still uses ordinary cached clones.** This task delivers small geometry, shared textures and a bounded populated court, not runtime instancing or a claim of thousands-of-assets FPS performance. Add spatially bounded instancing/batching while retaining per-ID editor picking, deletion and physics before dense city-wide population. Software-WebGL on this host is not a representative desktop/mobile GPU benchmark.

## Checks

- `node --test tests/street-kit.test.js`
- `node --test tests/street-kit-loading.browser.test.js` — bounded fixtures, ownership, retry and queue behavior.
- `node --test tests/street-kit-integration.browser.test.js` — real files, full saved IDs, scale/feet/colliders, material/atlas identities, actual rendered court and repetition experiment.
- `STREET_KIT_CANDIDATE=1` adds the pilot to browser-only GET world responses for pre-placement review; no saves.
- `ONEILLSIM_TEST_URL=https://stanfordtorus.com/` checks the deployed world. Tests block non-GET/HEAD methods and do not call the public save endpoint.
- `node --test tests/street-kit-library.browser.test.js` — every library type, actual mesh readiness, thumbnails and shared-atlas file links.

The existing unauthenticated PUT world-save endpoint is unchanged.
