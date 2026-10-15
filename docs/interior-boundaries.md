# Opaque district boundaries

## Integration (parent-owned; not performed by this module)

```js
import {createInteriorBoundaries} from './interior-boundaries.js';

// After createInteriorRuntime has built the continuous surface decks:
const boundaries = interiorRuntime && createInteriorBoundaries({
  habitatGroup,
  colliderWorld,
  parent: interiorRuntime.group,
});

// No per-frame update. Dispose before the parent interior runtime:
boundaries?.dispose();
interiorRuntime?.dispose();
```

Use the existing version-2 interior guard. Instantiate **once**, not every frame or world update; dispose the previous instance before rebuilding. `parent` defaults to `habitatGroup`, but parenting beneath `interiorRuntime.group` lets existing exterior-distance visibility policy hide the interior consistently. Visibility never changes collision. `habitatGroup` remains the physics reference even when a different render parent is provided.

Returned API: `{group, plan, stats, dispose()}`. Disposal is idempotent and removes only this module's six named collider entries and owned meshes/materials. Exports also include `BOUNDARY_SPEC`, `BOUNDARY_PORTALS`, `createBoundaryPlan()`, `createBoundaryGeometry(theta)`, and `boundaryPoint(theta,z,height)` for inspection/tests. No controller hook or ground-policy replacement is installed.

## Geometry and actual connections

Six partitions occupy the starts of the six alternating districts in `settlement-plan.js`, including the periodic farm-C/residential-A seam at angle zero. Each is a **complete circular cross-sectional solid**, 0.6 m thick along the circumferential direction. It follows the existing major radius 830 m and tube radius 65 m. Both faces use opaque, double-sided material (`transparent:false`, `opacity:1`). The same wall and frame geometry is registered in `ColliderWorld`; there is no invisible full-disk collider across the doorways and no cosmetic transparent panel.

Each partition has precisely three rectangular, physically framed **open doorways**:

| Connection | Clear axial interval z (m) | Existing deck height (m) | Clear top height (m) |
| --- | --- | --- | --- |
| Reverse belt | −7.4 to −2.7 | 0.36 | 4.2 |
| Central promenade | −2.5 to +2.5 | 0.16 | 4.2 |
| Forward belt | +2.7 to +7.4 | 0.36 | 4.2 |

The belt lanes themselves remain z=±5, width 4 m; their 18 m/s velocity comes only from the existing interior runtime. Doorway thresholds are exactly flush with its existing decks, not new raised sills. Clear headroom is 3.84 m on belts / 4.04 m on the promenade, exceeding the real 2 m capsule. Jambs and lintels are outside those clear apertures and physically solid. These are permanently open architectural portals, **not** animated doors or simulated pressure airlocks. Continuous existing decks are the actual walkways through them; this module adds no redundant overlapping floor.

The circular perimeter uses 256 sides, circumscribed around the analytic tube with a 15 mm hidden shell overlap. This closes chord/polygon cracks at the hull. It does not modify exterior meshes, camera, terraces, assets, belts, saved data, source allocations or the floor ledger. The tiny buried overlap reaches at most about 20 mm beyond the analytic tube; exterior visual review remains a parent integration check.

### Lower levels: intentionally sealed, not a shortcut into void

The wall continues down to the hull under every doorway, and across all retained farm floors (5, −10, −25, −40, −50, −56 and −61 m) and the residential civic base at −42 m. There is no passage at −40/−42: those elevations are different and the residential civic street does not reach both district ends. An aperture alone would expose unsupported residential void. A safe direct lower crossing would require an independently authored enclosed landing, a 1.76 m level transition to the civic street's actual −41.76 m walking surface, extension of that street and collision/ground-clearance review. It is deliberately not fabricated here.

Cross-district access uses the surface doorways, retained farm stair access and residential civic descent. This module does not certify the full existing farm/civic stair network, accessibility, evacuation or service access. Existing descent/stair systems are outside its scope. Complete partitions also close upper cross-district views: no transparent top strip is left. They leave the tube roof/daylight geometry and lighting code unchanged; light transport/irradiance is not simulated or certified here.

## Source versus interpretation

- The district positions, radius and tube dimensions come from the **existing simulation** (`settlement-plan.js`); this work does not newly certify those dimensions against a historical drawing.
- The reviewed SP-413 reading edition was searched for residential/agricultural context. `sp413-s02255` is the “A Residential Area” heading, printed p.90 / PDF p.107; `sp413-s02373`, printed p.98 / PDF p.115, discusses trees in residential areas and parks. Neither specifies these partitions, gateway dimensions or doors. A narrow alternating-district search returned no result, not evidence of a historical requirement.
- Complete opaque partitions, their 0.6 m thickness, palette, frame design, three portals and opening dimensions are **user-directed architectural interpretation**. Do not label them a NASA bulkhead specification, pressure containment, fire separation, or a source-faithful engineered airlock.
- This adds no area to `interiorFloorLedger`: walls and trims are not inhabited floors, and existing circulation floors are not counted again.

## Verification

Run:

```sh
node --test tests/interior-boundaries.test.js
```

The tests exercise real Three.js geometry, `ColliderWorld` and `CharacterController`, not substituted collision stubs:

1. All six boundaries have opaque two-sided walls; rays from both directions hit lower farm/civic levels, upper walls, portal subfloors/lintels and near-hull seams. Rays pass through the actual three apertures.
2. Dense cross-section samples identify no unintended opening.
3. The actual capsule is blocked from both directions at all eight relevant farm/civic elevations on paired physical floor fixtures; the floor seam remains grounded.
4. All 21 actual farm deck definitions use the real `terraceGeometry` function at both sector endpoints, retaining source height and band coordinates; the capsule cannot leave the supported edge through a partition.
5. The complete procedural interior runtime supplies the real promenade/belt decks. The capsule crosses all 18 openings in **both** directions, grounded at the correct height, then the original moving belts carry an idle capsule through all six partitions in their own directions.
6. Saved source data remains unmodified; lifecycle cleanup removes all owned colliders. Geometry is batched into 12 render meshes using two shared materials, with six collider registrations and **7,128 rendered / 7,128 collision triangles**.

Verified combined regression command: `node --test --test-concurrency=1 tests/interior-boundaries.test.js tests/interior-redesign.test.js` — **10 tests passed, 0 failed**. `git diff --check` passed. The unchanged `world.json` SHA-256 at this implementation's handoff was `b1d0922e2fb9277ae8c3d34ebd33ae27439799b6b45f469b2633cacb14fd54ca`.

Integrated in `src/main.js` under the version-2 guard, with boundary disposal
before interior disposal. Parent verification passed the 26-test combined suite
and a real full-world browser run: all 18 surface portals were crossed in both
directions (36 crossings), all twelve hills traversed with saved model colliders,
and six spoke/belt routes remained grounded. Nine current PNGs were captured and
reviewed, including the surface frame and completely opaque lower farm wall.
The separate paired-floor tests remain the evidence for lower-level blocking;
no unsupported lower crossing has been added. No claim of pressure containment,
functional doors, accessibility or irradiance certification is made.
