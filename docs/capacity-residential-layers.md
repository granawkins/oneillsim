# B/C sidewall housing and below-plain services

## Scope and measured result

Owned, additive runtime architecture only. No saved placement, ID, metadata, original Garden Commons/Civic Gardens home, civic model, flora, master-plan district or existing A neighborhood is changed. No network loaders, assets, materials workers, global collider edits, endpoints or scene integration are introduced. Baseline `world.json` remains SHA-256 `30fa3a8784133571c948aa44425db43087197c18033d095d3b706675be83b3fb`.

Measured **Float32 actor-floor triangles**, excluding room boundary walls and exterior galleries:

| Added use, m² | Residential B | Residential C |
|---|---:|---:|
| Housing interiors | 121,762.306 | 121,368.821 |
| Service industry | 13,339.980 | 13,339.981 |
| Community storage | 16,677.287 | 16,677.287 |
| Offices | 3,341.657 | 3,341.656 |
| Schools | 1,697.464 | 1,697.464 |
| Hospital | 500.100 | 500.099 |
| Assembly | 4,375.306 | 4,375.305 |
| Protected disjoint ground public-open space | 33,335.000 | 33,335.000 |

Totals: **243,131.127 m² new indoor housing**, **79,863.586 m² new community/service interiors**, **66,670 m² classified B/C public open space**. With the audit's known A parks, the disjoint park ledger reaches **100,000 m²**. Housing front galleries alone measure 39,693.802 m² ideal curved access surface; approach bridges, stairs and service transport are *not* included in that figure or indoor housing. It is not a full exterior-access compliance claim.

Runtime: **198,494 triangles, eight mesh/material draw calls, eight returned collider objects** before parent integration. This is an object/triangle budget, not a measured renderer FPS or full-scene draw-call claim. Park masks are protected ground classifications, not additional indoor floors, artificial slabs or production crops.

## Historical authority and interpretation

Read alongside `docs/settlement-capacity-audit.md` and its read-only `scripts/audit-settlement-capacity.mjs`.

* SP-413 **Table 3-2**, printed 26: 490,000 m² residential surface **includes exterior access**, 100,000 m² public open space, 120,000 m² transportation. Do not compare 490,000 solely against indoor floor. The existing A plan's 37 m²/person inside / 12 outside split is an implementation interpretation, retained explicitly as 370,000 / 120,000 m², not a newly verified source-derived net dwelling standard.
* **Figures 5-7 and 5-9**, printed residential/community discussion: wall terraces, varied density and below-plain industry/storage inform this geometry. Four residential layers in Figure 5-8/Table 3-2 do not specify this module's exact architecture.
* **Appendix B, printed 113**, reading segments `sp413-s02724`–`sp413-s02728`: typical aluminum-column **4 × 6 m bays**, beams **2 m on center**, 5 cm honeycomb floor panels. Local study helper retrieved the complete printed page. Here B's 24 m rooms follow six 4 m bays; C's 18 m loggias follow three 6 m bays. Visible 2 m roof-beam rhythm is modeled. Room depth, seven storeys, 4 m floor spacing, wall/roof thicknesses, 18 cm collision slabs, colors, windows and stairs are **authored interpretations**, not an engineering reconstruction of the source panel assembly.
* Service targets are half of each measured settlement-wide gap in the audit: industry 26,679.97; storage 33,354.58; offices 6,683.32; schools 3,394.93; hospital 1,000.20; assembly 8,750.62 m². No extra credit is assigned to shops, recreation or miscellaneous already near their audited targets. Water, communications, electrical, agriculture, transportation and the parent's remaining community allocation are not appropriated by this module.

The baseline **153,052.99 m² housing manifest** is not certified net living area. Adding this module's independently measured interior floors to it would mix area definitions; no net-habitable-area or 10,000-person completion claim is supported. The tiny per-category service gaps in `plan.deficits` are real chord/Float32 differences (combined under 0.04 m²), not silently rounded to zero. Existing small audited shops/recreation/miscellaneous differences and source total inconsistencies remain unresolved.

## Real geometry and protection

Housing occupies both sidewalls at inward heights **16, 20, 24, 28, 32, 36, 40 m**. Each upper band retreats according to `sqrt(65² - (height + 4)²) - 2`; no constant-width rectangular tower is forced outside the true tube. Floors are sampled at no more than 4 m arc intervals using radius `830 - height`. The tested largest actual cross-section is **63.0661 m**, below 65 m; every generated vertex is finite and below 45 m inward. Each room has an unobstructed 1.6 m portal, two open windows, party/rear walls, physical roof and visible beams. Interiors remain enterable, not opaque boxes or empty counted support decks. Services have 2.4 m portals and separate front circulation.

Two-metre stair landings branch into side passages and a longitudinal 3 m access gallery. Real risers are at most 15 cm, with a physical support at each landing. Where a new stair would block a protected door/path, an elevated bridge connects the next court to an already-safe neighboring core instead; it does not relocate the neighborhood. B uses warm 24 m veranda rooms; C uses teal 18 m loggias, shifted courts and different actual stair choices.

All 200 saved OBJ catalog bounds were measured from complete vertex sets in both building and nature directories and embedded as a local immutable lookup. Unknown saved model types fail planning rather than fabricate empty space. Transformed corner envelopes include actual placement scale/yaw/height, conservative radial extrema and a 0.5 m buffer; free-transform exterior objects are excluded from tube occupancy. Housing/service candidates and stair risers are rejected against those full volumes. The tests load 844 applicable saved-scene collider records, including nature models and procedural blockouts, for actual-controller routes.

Park rectangles are obtained by **exact rectangle subtraction**, not a landscape instance count or an unoccupied-area estimate. Exclusions include all saved full-model footprints, extra building/apron buffers, every authored route with width, central promenade `z ∈ [-7,7]`, the old 24 m spoke landing, added housing, stairs and exterior approach geometry. Polygons are mutually disjoint. No new foliage is added. Existing flora stays untouched and collidable in the tests; no blanket foliage bypass is used.

Floors and all support geometry are separate accounting hierarchies. `plan.floorLedger` contains category-specific **interior** polygons, level/radius, intrinsic coordinates and measured actor area. Supports, roof slabs, door aprons, voids, parks, transportation and outside access are not credited again as indoor housing/services. `residentialInteriorFloorArea` reproduces the Float32 chordal top-face area; tests independently sum triangles from the constructed actor to verify every credited polygon.

## Parent integration contract — required

```js
import {
  createCapacityResidentialLayers,
  openingContains,
  residentialGroundExists,
} from './capacity-residential-layers.js';

const layers = createCapacityResidentialLayers({ habitatGroup, world });
// Register each {id, object} in layers.colliders using the parent's collider lifecycle.
// Keep the registration removals so they can run BEFORE layers.dispose().
```

`planCapacityResidentialLayers(world)` is pure and returns `decks`, `stairs`, `housing`, `services`, `publicSpaceMasks`, `routes`, `summary`, `deficits`, `sourceBudgets`, `floorLedger`, `groundCuts`, `groundOpenings`, `layerViews` and explicit limitations. `createCapacityResidentialLayers` returns `{group, colliders, plan, stats, dispose}` and owns only its newly created geometries/materials. Dispose is idempotent; it does not unregister colliders owned by the parent. Do not serialize this group into saved-world asset records.

**Cut the visible ground only at** `plan.groundOpenings` entries (`{id,thetaStart,thetaEnd,zMin,zMax}`), not across whole B/C districts. There are two finite 36 × 4 m shaft openings, one per district. `groundCuts` carries the equivalent intrinsic reference-metre rectangle/polygon. `openingContains` normalizes negative controller theta without changing saved identifiers. Ground under all 698 protected additions remains otherwise unchanged.

**Important controller finding:** `CharacterController.resolve()` currently treats any radius ≥830 as an analytic-ground penetration, even when feet are already 16 m below the plain. A theta/z-only hole predicate allows descent but snaps the character back to ground when leaving the shaft under the still-visible ground. A narrow visible hole does **not** by itself fix that controller behavior. The standalone worker verified the supplied altitude-aware hook below. Production uses `createCapacityGround` with exactly clipped visible triangles and a real two-sided ground floor/ceiling collider; it disables analytic fallback only for supported B/C districts and preserves the original predicate elsewhere. The isolated adapter remains documented for diagnosis:

```js
// Closure assigned after controller construction; do not pass globally false ground.
controller.groundExists = (theta, z) =>
  originalGroundExists(theta, z) &&
  residentialGroundExists(
    layers.plan, theta, z,
    Math.hypot(controller.position.x, controller.position.y),
  );
```

The guard keeps normal analytic ground near/above the plain, and avoids a nonphysical teleport of feet already below it. It does not widen visible shaft masks or remove existing ground model colliders. Parent must review integration with other layered systems and restore its original predicate at disposal. Existing underlying ground collider triangles, if separately registered, must also be treated consistently; this module cannot change them. No shared controller edits were made here.

`plan.layerViews` contains finite `{id,name,theta,z,height,yaw}` inspection positions including original-ground views. Parent chooses camera mode/eye-height and UI wiring. Route points are `[theta,z,height]`; rectangle x coordinates are intrinsic metres at reference radius 830, while `floorLedger.polygon` uses `[theta,z]` and `intrinsicPolygon` retains metres. Collision supports are real returned meshes, not virtual route metadata.

## Verification and remaining limits

Run from repository root:

```sh
node --test tests/capacity-residential-layers.test.js
```

Verified: deterministic pure planning; exact input/IDs/metadata preservation; finite tube-contained actual geometry; full saved-model envelope avoidance; disjoint park and interior ledgers; independent actor-floor triangle areas; triangle/draw budgets; actual speed-15 controller traversing continuously from ground through all seven representative housing landings and a physical housing portal in **both** districts; continuously from ground down each service stair and into service rooms using the narrow opening plus live-radius ground hook; disposal once per owned geometry/material. Only the initial ground position is teleported, never an intermediate landing or service floor.

Not performed: browser or visual deployment QA (forbidden by delegation), global collider/cylinder/controller integration, every door/every stair traversal, structural load engineering, universal accessibility or fire-code egress review, community operations, occupancy certification, or correction of pre-existing B/C civic baked-curvature floors. Elevated galleries now have actual transparent front parapets, but no complete certified guardrail/egress system; parent should not characterize this as a safety-certified built environment. Runtime additions leave A untouched rather than claiming to repair A's remaining access/net-area uncertainties.
