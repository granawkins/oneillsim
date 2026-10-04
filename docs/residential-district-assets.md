# Complete Residential A asset replacement

The 297 original Residential A parcel records are now real OBJ assets rather than procedural blockouts. All original IDs, record order, positions, rotations and deck attachments remain unchanged. The other 138 saved records, terrain, crop configuration, master plan and terrace topology are preserved. The saved world still contains 435 records.

## Kit and coverage

49 curated, deduplicated models:

- Three housing assets cover 48 blocks: two, four and five levels.
- Nine civic/service assets cover 14 parcels: schools, clinic wings, assembly halls, shops, offices, workshops, storage, recreation and community buildings.
- 37 landscape assets cover 235 parcels: two parks, 35 circulation surfaces, 142 shared terraces and 56 fruit trees.

The two opaque 512px district atlases are shared only within their explicitly compatible kits. Each model has one mesh and material; cached clones share geometry and texture resources. This is not runtime instancing. Every design is registered in the editor and asset library, with actual rendered icons/previews, valid statistics and scale-aware viewer/snapshot framing. The original Garden Court models are unchanged.

## Historical and geometric limits

SP-413 printed p.91/PDF108 (`sp413-s02268`) describes modular one/two-level homes and four/five-story groups. `sp413-s02265` places much commerce/light industry below the central plain. Table 3-2, printed p.26/PDF43 (`sp413-s00708`), gives approximate community-space allocations for enclosure design. Detailed floorplans, facades, doors, stairs, gardens and furniture are authored interpretation, not report-specified architecture or certified designs.

The original parcel envelopes and level counts are retained. Gross allocation and stair-hole/net-floor differences are documented in building manifests; no claim of engineered accessibility/fire compliance, occupied/furnished residences or functioning services is made. Spoke landing/marker prototypes and existing structural decks remain unchanged, not misrepresented as completed spoke assets.

Geometry is curved BEFORE OBJ export: intrinsic arc coordinate x maps to `X=(r-y)*sin(x/r)`, `Y=r-(r-y)*cos(x/r)`, with `r=830-elevation`. OBJ coordinates are placed metres divided by four, placement scale4. Cartesian Y bounds intentionally include cylinder curvature; the 578m parks must not be flattened. Floor segmentation and capsule support are tested.

## Migration and rebuild safety

`assets/district-building-kit.json` and `assets/district-landscape-kit.json` explicitly map all original IDs to reviewed assets. `src/district-kit.js` registers the curated variants. `scripts/replace-residential-district.mjs` is dry-run by default; `--apply` checks complete coverage, actual OBJ/MTL/atlas/manifests, intrinsic bounds/tube containment and the pinned initial world hash. It makes a byte-exact backup in the private `~/.local/share/oneillsim/backups/district-replacement/` directory, guards concurrent writes, writes atomically, verifies readback and is idempotent. The second application replaced zero records.

Generators default to the immutable public source fixture `assets/district-source-world.json`, not the now-migrated mutable world. Its baseline SHA is `bb4da561e4b28cdd25f17ff125ac906c8e412a84ef56bb7fd31966e2a16cd209`. This retains original dimensions for reproducible exports. **Do not run the old whole-layout population scripts over the live world**: they would regenerate blockouts and overwrite approved placements.

## Verification and measurements

- 12 offline asset tests: deterministic geometry/atlas, indices, normals, UVs, curvature, bounds, original coverage, floor/entry/stair clearances, actual preview evidence and budgets.
- Migration/serialization/concurrency/idempotency tests, plus existing plan/physics/camera/resource-lifecycle regressions.
- Full candidate and public browser checks: all297 actual OBJ placements, exact deck attachments, save roundtrip (without PUT), 12 representative building doors, 19 authored stair routes, 88 building-floor support points and 108 landscape support points across36 non-tree landscape variants.
- All49 district designs exercised in the public library: real viewers, normalized manifest statistics, scale and atlas links, no page errors.
- At fixed640×400 district planner capture: 84 draw calls,141,390 visible render triangles; collision index510colliders/389,822triangles. Both district atlases downloaded once. These are viewpoint-specific, not total full-scene draw-call counts or desktop/mobile FPS promises.
- Serial live collision benchmark: build2.816s, average21.58broadphase candidates/query, mean.0443ms and p95.1445ms. Parallel CPU/WebGL tests exceeded the old5s build-time limit; the same unchanged benchmark passed in isolation. Do not run timing gates alongside software-WebGL jobs on this shared host.

Checks:

```
python3 -m unittest discover -s tests -p 'district_*assets_test.py' -v
node --test tests/district-replacement.test.js tests/material-kits.test.js
DISTRICT_REPLACEMENT_CANDIDATE=1 node --test tests/district-replacement-integration.browser.test.js
ONEILLSIM_TEST_URL=https://stanfordtorus.com/ node --test --test-concurrency=1 tests/district-replacement-integration.browser.test.js tests/district-kit-library.browser.test.js
node --test tests/character-physics.test.js
```

Planner URL: `/?theta=38&z=0&mode=planner&height=70&yaw=-90&pitch=-65`.

The public unauthenticated world-save endpoint is deliberately unchanged. QA uses GET/HEAD and browser-local candidate interception only; never PUT test fixtures into the live world.
