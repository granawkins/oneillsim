# Additive B/C productive layers — source and geometry ledger

## Delivered scope

`src/capacity-farm-layers.js` exports a deterministic, read-only `planCapacityFarmLayers(world)` and `createCapacityFarmLayers({habitatGroup, world})`. No saved world records, assets, terrain, catalog or engine are edited. A's seven decks and 78 fitted plots, B/C's 64 existing mixed-use ground parcels, original sourceAllocation summaries, ground promenade and existing visits remain unchanged. Runtime IDs start `capacity-farm-b-` / `capacity-farm-c-`; no runtime geometry is saved to JSON.

Each B/C sector comes from **its actual masterPlan start/end**, not an A clone. Three new floors are at canonical inward heights **−10, −25, −40 m**, with 15 m between productive stages. Ground-to-first-floor is a separate 10 m entry. Deck metadata is `cutGround:false`.

Closed curved slabs and actual collision stair treads use habitat-local positions `[(830-h)cos(theta), (830-h)sin(theta), z]`. Floors have 0.4 m thickness; half-width is `sqrt(65²-(h-0.4)²)-0.35`, conservatively using the slab bottom and leaving 0.35 m of shell clearance. Tests inspect every actual geometry vertex, not just reservation endpoints.

Central z=0 aisles, perimeter aisles and transverse aisles have ≥6 m allocation. Two transverse aisles and a separately reserved stair-connection strip keep circulation clear. Stairs run at z=6.5 with 4 m clear width, 0.125 m risers / 0.3 m treads, open slab holes and real guardrails/handrails. They are not teleport markers. Their ground entrances begin 45 m along the sector (beyond the actual promenade’s 35 m spoke bypass) from the spoke center, outside the existing ±12 m spoke landing; ground openings stay between z=4.3 and 8.7, outside all original farm parcel reservations and outside the z=0 promenade.

Plant mosaics are deterministic vertex-colored curved canopy ribbons in a single mesh per floor, not thousands of leaf objects. Bed footprints exclude slab openings, main/perimeter/cross aisles, service precincts and local separators. The authored 72×24 m mosaic cells have 0.28 m separator gaps: these are not claimed human walkways; human access uses the six-metre aisle network. Greenhouse ribs and visible luminous light strips interpret the study's controlled growing environment and below-plain lighting. They are not a validated photon/yield simulation. Animal/feed, processing, drying and water precincts remain distinct from edible beds. Barn/equipment blocks have actual solid collider geometry once each; foliage, greenhouse decoration, light strips and painted service surfaces are explicitly nonblocking. Floor support is never also credited as crop area.

## Source authority and unresolved arithmetic

Read in conjunction with `docs/settlement-capacity-audit.md` and `scripts/audit-settlement-capacity.mjs`. The reviewed reading-edition pages were retrieved locally with the study-reference helper; baseline audit scan verification is retained rather than repeated or normalized.

* SP-413 printed94, Table5-1, `sp413-s02289`: agricultural/processing/mechanical **650,000 m² surface**, **240,000 m² projected**. Community surface 980,000; printed total 1,680,000. Category sum 1,630,000 leaves the printed **50,000 m² discrepancy** unresolved.
* Printed26 Table3-2: plant 440,000, animal 50,000, processing 40,000, drying 80,000, water 40,000 m². This allocation sum is 650,000, not a new operational certification.
* Printed98, Table5-4, `sp413-s02395`: crop target **442,000 m²**: sorghum38,000; soybeans235,000; wheat72,000; rice36,000; corn9,000; vegetables52,000. Fruit/orchards are explicitly outside this quota. Animal/feed relationships do not make feed storage a second edible crop credit.
* Printed98 Table5-5, `sp413-s02393`: animals **51,000 m²** rather than rounded50,000. Substituting detailed crop/animal quantities into the other rounded allocations gives **653,000**, 3,000 above Table5-1's agricultural/mechanical650,000.
* Figures5-8/5-9, printed93: layered agriculture and below-plain processing; precise reservations, greenhouse kit and stair locations here are authored interpretation. Three productive stages are not seven identical uniform-height A clones.

`FARM_LAYER_SOURCE`, `plan.sourceBudgets` and its disjoint `useLedger` expose both detailed/rounded values. Neither source discrepancy becomes fabricated floor. No 10,000-person completion claim is made.

## Exact area ledger

Areas are horizontal **intrinsic floor-bed footprints**, not sloping canopy surface, camera projection or yield-equivalent acres. New crop masks are disjoint by (district, deck, category). Each `plan.patches` crop bed has its own stable ID, theta/z bounds, canonical height, category and `netAreaM2`. Sum category areas once. Do not add deck support, gross parcel reservation and crop-bed area together.

The extraction API `extractExistingFarmBedMasks(world)` reconstructs actual existing known-crop footprints from the delivered generator `assets/scripts/build_settlement_farm_landscape.py` lines125–132 and175–180 and explicit canonical `collisionSupport`. It accepts only the tested zero-yaw / canonical-scale / matched-radius contract. Unsupported transformations are `unknownIds`, not guessed net capacity. Existing masks are in `plan.existingBedLedger.bedMasks`; their original asset IDs are retained. Same-level intersections are union-subtracted and flagged. The test independently reads actual OBJ vertices/UV crop tiles, inverts curvature, integrates horizontal canopy-triangle footprints and confirms the reconstruction within 0.02 m² per district. This is geometric evidence, not operational certification.

| Measure, m² | Farm A (preserved) | Farm B | Farm C |
|---|---:|---:|---:|
| Existing all-use parcel gross |217,666.67|38,976.00|38,976.00|
| Existing known-crop parcel gross |147,333.33|13,920.00|12,180.00|
| Existing reconstructed net crop footprints |86,862.89|8,054.73|7,081.84|
| Detailed equal-share crop target |147,333.33|147,333.33|147,333.33|
| Original gross lower-bound crop shortage |0.00|133,413.33|135,153.33|
| New gross support |0.00|222,056.17|222,056.17|
| New floor after stair holes |0.00|221,732.33|221,732.33|
| **New net crop-bed masks** |0.00|**170,216.85**|**170,216.85**|
| New separate service/feed precincts |0.00|3,780.00|3,780.00|
| New circulation/unallocated floor |0.00|47,735.48|47,735.48|
| New-layer-only crop reserve above detailed share |0.00|22,883.51|22,883.51|

Each B/C new floor stack independently exceeds its entire one-third detailed crop quota, **without any baseline gross-as-net credit**. Excess is openly declared productive reserve, not quietly changed source requirements. Each B/C has 756 m² apiece of animals, feed, processing, drying and water precincts. Feed storage is its own unreconciled bucket, not a second crop, animal or processing credit.

New net crop category allocations **per B/C**:

| Category | New net m² |
|---|---:|
| Sorghum |14,437.18|
| Soybeans |92,311.44|
| Wheat |28,201.28|
| Rice |13,102.86|
| Corn |2,652.97|
| Vegetables |19,511.13|

These follow the remaining detailed crop-by-crop net deficits after subtracting independently measured existing crop beds. They are deliberately rebalanced, not forced into identical gross A proportions. Each category has declared reserve and zero remaining geometric footprint deficit in `sourceBudgets.cropCategoryLedger`. Aggregates retain full precision; displayed rounding is not used to allocate geometry.

**Crop footprint closure, not full agriculture compliance:** A's standalone quantified net crop masks are 60,470.44 below its detailed one-third quota despite its sufficient-looking gross allocation. B/C deliberately carry enough legitimate productive reserve to rebalance that shortfall without changing A. New beds total **340,433.70 m²**; separately measured existing beds total **101,999.45 m²**; combined crop footprints are **442,433.15 m²**, with **433.15 m² declared settlement reserve** above442,000. All six detailed crop category footprint requirements are individually met, not just the total. Existing service net masks remain unquantified. The small new service precincts do not close animal/processing/drying/water quotas. `summary.compliant` and `fullSourceUseCompliant` remain false; conflicts preserve unknown service evidence, operating/yield uncertainty and printed inconsistencies. This is geometric crop allocation closure only. No A geometry is moved or gross-as-net credit invented.

## Parent integration — important analytic-ground blocker

Return shape:

```js
const runtime = createCapacityFarmLayers({habitatGroup, world});
// {group, colliders:[{id, object}], plan, stats, dispose}
for (const {id, object} of runtime.colliders)
  characterColliders.setObject(id, object, habitatGroup);
```

Register **only returned colliders**, not the complete group (which includes foliage). Do not pass these stairs blindly to legacy `createTerraces` / `supportAt`: first-flight `upper:'ground'` is an explicit runtime entry, not an existing terrace-deck ID; this factory already creates the real geometry and must not be duplicated by a second terrace factory. Remove the same IDs before `dispose()`; disposal removes geometry/materials/group but does not know the parent's collider-world instance. Disposal is idempotent. Runtime leaves saved/editor records unchanged. `stats.rendererData` separately indexes each mesh, its floor, triangles, nominal one-material draw call and blocking policy.

`plan.groundOpenings` contains only the two entry holes:
`[{id,thetaStart,thetaEnd,zMin,zMax,height}]`.
Use `farmOpeningContains(opening,theta,z)` for normalized angular membership. Parent clips **visible ground geometry only at those ground entry holes**, never removes all B/C ground. The production physical sheet supplies ground support and ceilings across B/C, replacing the analytic half-space only in those physically supported districts. Underfloor slab openings are already real mesh holes. Parent's optional inspection cutaway is separate and must not remove collisions. `plan.layerViews` provides `[{id,name,theta,z,height,yaw}]` with canonical supporting-floor height, not eye height; add eye offset in the parent's controller/camera.

**However, hole-only `groundExists(theta,z)` cannot work with the current controller.** `CharacterController.resolve` lines109–115 treats analytic ground as a radial **solid half-space**, forcing every foot with radius≥830 back to the plain wherever that callback returns true. A walker exiting an entry hole onto a below-ground floor is therefore projected back to ground. A real regression test demonstrates this with the exact hole-only callback: height−9.54 inside the entrance becomes approximately0.00 beyond the opening. This is not a stair failure or permission for a wholesale cutaway.

The standalone worker verified the following altitude-aware adapter. Production instead uses `createCapacityGround`: exact triangle clipping, real two-sided ground floor/ceiling collision, and analytic fallback disabled only in the explicitly supported B/C districts. This additionally prevents jumping through intact ground. No engine resolve code was changed. The isolated test adapter is:

```js
let controller;
controller = new CharacterController(characterColliders, {
  groundExists: (theta, z) =>
    Math.hypot(controller.position.x, controller.position.y) <= 830.3 &&
    !runtime.plan.groundOpenings.some(h => farmOpeningContains(h, theta, z))
});
```

Merge this with existing A/other terrace policy rather than overriding it. The 0.30 m fallback margin exceeds the current controller's bounded 0.14 m movement increment; the real test also drops each capsule from 20 m onto unaffected ground before starting its below-plain route. This retains all unaffected ground visits, allows below-plain feet to use real colliders and lets the real approach slab return ascenders to ground. It is **not** `groundExists:false` for the entire world. Visible ground remains intact outside the two holes. `plan.conflicts` exposes this requirement as `analytic-ground-half-space-requires-radial-gate`.

## Real verification and limits

Run:

```sh
node --test tests/capacity-farm-layers.test.js tests/settlement-capacity-audit.test.js
```

Verified: 12 passing tests (8 new plus4 audit); frozen-input determinism; original IDs/decks/terrain/sourceAllocation byte preservation; source discrepancies; rectangle subtraction/union; independently extracted actual baseline OBJ footprint areas; new category-mask disjointness; all geometry vertices within actual tube envelope; actual 2.2 m radial headroom rays along every flight; actual capsule controller at speed15 continuously from each spoke ground to all three layers and back (all six stairs in both directions, no intermediate teleports), with grounded clear landings; explicit regression for the uncorrected half-space blocker.

Measured geometry: **73,400 triangles / 50 one-material meshes**, versus budgets120,000 /80. Returned solid collider inventory: **30 objects /43,016 triangles**; plant foliage never enters that index. These are geometry/draw-submission counts, not a fabricated WebGL timing report. No browser/render preview was made because browser use was forbidden; parent still owns visual inspection, full-scene saved-solid/controller tests, lighting polish and runtime/audit integration.

Before and after world SHA-256: `30fa3a8784133571c948aa44425db43087197c18033d095d3b706675be83b3fb`. No ports, services, installations, commits or world writes were performed. Only the three assigned new files were created.
