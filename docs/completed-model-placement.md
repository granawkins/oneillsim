# First placement of the completed 47-model collection

The world now contains 482 records: all 435 previous records preserved, followed by one instance of each new model. This is a bounded, authored demonstration layout, not a reconstruction of a sourced historical floorplan or a full-sector population.

## Locations

- **Residential B commons**, west of Garden Court: market and restaurant face an open courtyard; transport specimens park beside the road/station; nature borders the neighborhood. Center is approximately 142°.
- **Residential B service court**: light-service workshop and eight utilities around clear maintenance aisles. Equipment remains static; no operational life-support or transport network is implied.
- **Existing Farm A terraces**: grain, garden and livestock apron displays use real deck IDs/heights, bypass stair mouths and retain all original plots. Greenhouse, growing beds, irrigation, crop samples, animal housing, livestock and aquaculture are first exhibits, not replacements for the farm blockouts. Fish is intentionally nested just above the tank's opaque water as a visible surface-swimming display.
- **Exterior inspection collection**: hub, docking, spoke/frame cutaways, airlock, mirror, hull panel, shield and radiator. Hub local +Y is aligned to the habitat's +Z spin axis. These are full-scale inspection envelopes/sections, not a completely connected or engineered operational assembly. Exterior models render and roundtrip but are excluded from human tube colliders.

Bridge and stairs/ramp lead to their own modeled landings, not an invented terrace connection. SP-413 source facts remain separate from authored placement choices in the layout modules and asset manifests.

## Persistence and safety

Stable IDs are `completed-model-<type-slug>`, scale 4. `src/model-placement-interior.js` and `src/model-placement-exterior.js` define deterministic poses; their combined contract requires 38 interior plus nine exterior models exactly once.

The unchanged legacy transform treats saved height zero specially. New interior poses instead use ground display height −0.05 or canonical deck height minus 0.05, retaining `surface.anchorHeight` separately. Exterior `surface.worldTransform` stores habitat-local position and unit quaternion; yaw is not reapplied. Malformed explicit transforms are rejected without normalization or fallback. JSON-incompatible negative zero from authored Euler conversion is canonicalized in the pose generator, not in imported user data.

`scripts/place-completed-models.mjs --dry-run` verifies actual asset resources and prepares an additive candidate. `--apply` pins the reviewed baseline SHA, refuses conflicting IDs or concurrent changes, creates a private exact backup, atomically replaces the file and verifies readback. It preserves original record bytes, type indices, unrelated fields, numeric lexemes and formatting. Applying again is a byte-identical no-op. Do not run old whole-world population scripts.

Reviewed baseline SHA-256: `3a0743b3215b777c14033ccb8d4eee3b624336d586005104edbbbdda645561b6`.
Applied SHA-256: `98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591`.

## Checks

- Placement/transform unit tests cover exact model coverage, full OBJ bounds, tube/deck/slab/stair clearance, all existing-record exclusions, reserved circulation/maintenance routes, intentional fish nesting, legacy transform parity and compact-state roundtrip.
- Read-only candidate and deployed browser checks load all 482 records, verify all 47 actual transforms, atlas decode/pooling and one request per kit, borrowed geometry/material identity, interior collision registration and exterior exclusion. Seven actual-controller routes cover commerce/farm entry crossings and both stairs/ramp landings in the complete collision world. An ephemeral exterior editor placement/removal checks raw metadata and shared-resource survival; no world-save request is permitted.
- Full-world physics loads actual building and nature OBJ files, excludes exterior specimens and retains the original performance gates. Applied scene: 548 collider entries, 415,810 collision triangles; isolated build 2.927 s and query p95 0.155 ms. Measurements are host/test-specific, not an FPS guarantee.
- Actual neighborhood, farm and hub renders are reviewed separately from geometric proofs. Layered farm views must keep the camera below the overhead slab.

Run browser jobs under the shared renderer lock, separately from wall-clock physics gates. `MODEL_PLACEMENT_CANDIDATE=1` intercepts only GET world data for preview; omit it to verify persisted deployment. No PUT tests are used. The existing unauthenticated public world-save endpoint remains unchanged.
