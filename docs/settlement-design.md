# Gardens of the Stanford Torus

A deterministic, source-informed full-ring settlement composition, generated from the immutable 482-record source at `assets/settlement-source-world.json` (SHA-256 `98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591`). Detailed routes, garden planting, furniture and farm geometry are authored interpretation, not dimensions reconstructed from SP-413 artwork. Figures 5-4, 5-5 and 5-7 informed grouped housing, stepped gardens, long vistas and substantial open space; food allocations retain the original agricultural ledger.

## Composition and inventory

- **Residential B — Garden Commons:** 302 additions, 87 housing instances and 11 asymmetric courts; markets, transit, community facilities, ponds and planted gathering rooms.
- **Residential C — Civic Gardens:** 396 additions, 114 housing instances and 14 courts; education/health/community frontages, recreation, shops and quieter orchard parks.
- These two sectors explicitly represent **295 residence units**, plus 24 housing instances with no independently established dwelling count. This is not a verified 10,000-person capacity.
- **Residential A:** 329 additions over 36 existing support parcels: 13 trees, 37 shrubs, 189 flowering borders, 49 benches, 7 tables, 27 planters and 7 static ponds. All 297 original district IDs and source-curved architecture remain intact; narrow circulation shelves and entrances remain clear.
- **Farm A:** 78 original colored plot blockouts receive curved, reservation-sized landscape models. Original IDs, positions, deck references, allocations and full blockout provenance are retained in `surface.sourcePlot`.
- **Farm B/C:** 64 productive landscape parcels: crop mosaics, orchards, greenhouse/aquaculture areas, animal housing and processing/water/drying precincts.
- **Total:** 1,091 additions; 78 authorized appearance replacements; **1,573 saved instances**. All 482 original IDs remain, and the other 404 original records—including all 47 recent specimen placements and nine exterior models—remain exact.
- New farm kit: 94 variants, shared atlas and identical MTL definitions, no model above 530 triangles. Library total: 200 variants across 67 types. Farm A's fitted models are available in the library but not offered as generic terrain-placement templates.

## Connected public space

`createSettlementCirculation` consumes persisted route metadata after terrace construction. It produces real curved paving/colliders, continuous main promenade, long Residential A descent and lateral terrace links, and transfers between the six unchanged Farm A stair flights. Streets are clipped at same-level junctions and batched by deck/material; existing OBJ floors are reused rather than covered with duplicate slabs.

Combined-scene verification retains 784 routes, including all 436 entrance/frontage routes. 126 links are repaired/rerouted; 12 optional links are explicitly rejected rather than crossing preserved buildings, a greenhouse or support boundaries. Main-ring and A-level journeys remain connected. The legacy specimen bypass contains a disclosed 2.4 m pinch. Ground paving has a real 15 cm crown above the chordal ground and the existing 10 cm terrain paint; its rendered surface is also its physical support. Existing deck/OBJ floors are not shifted.

The **Explore the gardens** panel selects starting places without replacing the connected walking network. Bare root visits start in the landscaped Residential A garden basin; explicit camera/capture URL parameters retain their established behavior.

## Rendering and collision

- Shared geometry/material identities are spatially batched using actual `THREE.InstancedMesh`; all logical roots, IDs, exports, imported transforms and removal semantics remain intact. Transparent water remains unbatched.
- The candidate browser verified 281 render batches and 951 instances, exact saved-state round trip, decoded atlases and one farm-atlas download. Seven named human views are captured at full review resolution, after startup at a smaller software-WebGL viewport.
- Low flower/shrub/grass foliage is explicitly nonblocking on 491 **new** placements; trees, rocks, furniture, buildings and equipment remain collidable. No category-based runtime inference or baseline collision policy is changed.
- Farm `support-only`/`farm-zoned` contracts describe genuinely curved floor support and explicit curved solid zones. Barns, equipment and trunks block entry, while crop ornament and orchard canopies do not become giant walls. Malformed metadata rejects before removing a prior collider.
- Farm verification covers all 142 placements, 282 actual-controller routes, 19,554 floor vertices, 15,114 floor ray hits and maximum floor sagitta 8.15 mm. The 50 mm authored support height is intentional and is not hidden as zero-offset fidelity.
- Full-candidate/live physics retains 841,092 triangles and 21,555 hash cells. The isolated five-second parser/build gate passed at 3,489 ms before apply and 3,594 ms after apply; live query p95 was 0.990 ms. Exact-coordinate caches, placement-local shared corners, reused cell-key lists and scalar bounds retain triangle/query parity; collision corners are read-only. These are host measurements, not a promised device-independent frame rate.
- An optional ACES display mapping, lighter grass and neutral spoke-platform palette are display-only; saved source colors remain unchanged. An early habitat frame is retained during loading instead of repeatedly rendering an unbatched partial scene that competes with model decoding.

## Guarded apply and QA

Parent-only apply: `node scripts/apply-settlement-design.mjs --apply`; repeat is a no-op. The script requires the pinned original bytes, creates a private exact backup, locks the target, checks concurrent changes, preserves unrelated JSON formatting/lexemes and performs atomic read-back. Browser tests never PUT a fixture to the public world endpoint.

Relevant checks:

- `tests/settlement-world-guard.test.js`: formatting, named replacement provenance, preservation, idempotency, private backup and concurrent refusal.
- `tests/settlement-neighborhoods.test.js`, `settlement-residential-a.test.js`, `settlement-farms.test.js`: real geometry, tube/headroom, support, entrances, reservations and immutable sources.
- `tests/settlement-circulation.test.js`: every accepted route both directions, whole ring, A descent and all seven Farm A decks without intermediate teleports.
- `tests/settlement-farm-collision.test.js`, `settlement-rendering.test.js`: real support/solid contracts, batching parity, lifecycle and borrowed resources.
- `tests/settlement-design.browser.test.js`: candidate or deployed browser read-back, atlas/collider/instance inventory, metadata round trip, grounded named visits and screenshots. Candidate flag: `SETTLEMENT_CANDIDATE=1`; URL override: `ONEILLSIM_TEST_URL`.
- `tests/character-physics.test.js`: unchanged five-second build gate and speed-15 physics. Optional `ONEILLSIM_WORLD_FIXTURE` selects a scratch candidate without modifying the live world. Run wall-clock gates separately from software-WebGL work.
- `tests/settlement_farm_assets_test.py`: complete farm geometry, preview decoding and byte-reproducible generation. Exact intended outputs are listed in `TorusSettlementFarm_OwnedFiles.json`; do not force-add arbitrary asset directories.

## Limits

Animals, vehicles, water and food/equipment systems remain static museum visualization. Original terrain/support and saved identities are conserved, so structural stepped terraces remain visible; planting, public rooms, retaining profiles and access soften rather than erase that study-informed organization. Twelve optional paths remain unavailable with explicit diagnostics. Multiplayer and operational ecology are not implemented. The pre-existing unauthenticated public world-save endpoint remains unchanged.
