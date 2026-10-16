# Deterministic residential woodland infill

## Status and scope

Additive runtime module; **integrated and reviewed in the complete scene**. No saved placements, plan, runtime, catalog, controller, world, textures, or lights were edited. No browser, service restart, commit or push was performed by this task. The generator is runtime JavaScript, not an asset-export script: there are no new OBJ files or downloads.

The historical anchors are SP-413 printed p.90 / PDF p.107, `sp413-s02257` (long sight lines, small fruit-tree clusters, parks and openness), and printed p.98 / PDF p.115, `sp413-s02373` (trees in residential areas and parks, beauty and fruit). Exact species, silhouettes, understory, densities, biome lobes and clearances here are **authored interpretation**, not NASA planting requirements. The local study keyword helper retrieved both passages.

## Parent integration

```js
import {createInteriorVegetation} from './interior-vegetation.js';

// After createInteriorRuntime and the saved world have been loaded, only for
// the approved v2 interior. Do not delay the existing parallel OBJ/atlas fetches.
const vegetation = interiorRuntime && createInteriorVegetation({
  habitatGroup, colliderWorld, plan: interiorRuntime.plan, world,
});
// Expose vegetation.stats in the existing diagnostics if desired.
// No animation/update callback is needed.

// Dispose vegetation BEFORE its containing interior runtime (which traverses
// child geometry during disposal).
vegetation?.dispose();
interiorRuntime?.dispose();
```

Required: real `habitatGroup` and `colliderWorld`; a missing physics world throws rather than silently making trees nonblocking. `plan` defaults to `createInteriorPlan()`. Optional `seed` defaults to `inhabited-woodland-v1` and is included in stats. Supplying `world` reserves existing authored roots/solids; pass the actual loaded world, not an empty mock. The module never writes to it. Keep `world.assets`/saved OBJ trees loaded exactly as before.

Return value: `{group, placements, stats, dispose}`. `placements` contains stable IDs, intrinsic theta/z/x, exact landscape height, species, scale, yaw, conservative radius, hill/district IDs and blocking policy. Pure `generateInteriorVegetation({plan,world,seed})` permits tests and diagnostics without creating render/collision objects. `vegetationReservation(plan,hill,x,z,radius)` exposes the exclusion reason for inspection.

The group nests under the existing `inhabited-garden` root. A standalone fallback attaches directly under the habitat with `userData.capacityInterior=true`, matching existing reversible distant-exterior culling. No additional scene parent, counter-rotation or exterior visibility logic is introduced. Hidden render roots do not remove physics. Create this module before distant-interior visibility is first evaluated, as with other runtime interior roots.

## Composition and prototypes

Only the twelve authored residential hill parks are eligible. Different grove styles choose coherent offset woodland lobes and a quieter open meadow bank; keyed jitter and a smooth Gaussian density field prevent rows or uniform whole-world scatter. Each hill retains its summit ribbon, open summit cross-axis, full transverse toe crossings/aprons and a broad meadow ellipse. The central promenade/conveyors, contour galleries, courts/entries, houses/stairs and civic descent are excluded with **full silhouette radii**, not trunk centres. New trunks avoid existing saved roots and one another. Small nonblocking plants can interleave existing low dressing.

Seven independently constructed geometries, one opaque rough vertex-colour material:

| Kind | Geometry/silhouette | Prototype triangles | New instances |
| --- | --- | ---: | ---: |
| Fruit | low fork, exposed branches, five offset spreading crowns, small fruit | 424 | 34 |
| Birch | fine pale leaning leader, dark bark marks, separate ascending leaf sprays | 372 | 54 |
| Cedar | tall spire, six asymmetric horizontal whorls and exposed radial boughs | 618 | 57 |
| Shrub | compact five-lobed mound and rooted stem | 124 | 691 |
| Fern | seven folded fronds with four pairs of pinnae apiece | 252 | 1,032 |
| Grass | nine individually bent pointed blades | 36 | 1,430 |
| Tallflower | three stems, folded leaves, dimensional five-petal flowers | 240 | 504 |

All feet originate at local Y=0; the leaning birch base penetrates at most 4 mm rather than hovering. Root positions use **the imported actual `landscapeHeight(hill,x,z)`**, then the existing intrinsic radial frame at `theta=hill.theta+x/830`. There is no tangent-plane height drop. Geometry is in metres, +Y inward/up, +X longitudinal, +Z tube cross-axis before random local yaw. Conservative dimensions are in `VEGETATION_KINDS`; tests validate all actual prototype vertices against these silhouette reservations and tube bounds. No recoloured single-tree clone is used.

Leader trunks alone are physical: the same six-sided tapered cylinders as rendering, including the birch lean, registered separately through `ColliderWorld.setObject`. Canopies, branches above head height and all low foliage are intentionally nonblocking. Collision does not traverse instanced render geometry. A namespaced collider preflight and one-active-root guard prevent accidental replacement/double registration. Registration failure rolls back owned colliders and render resources. Disposal removes IDs, hash cells, instance GPU buffers, prototype/collision geometries, material and root; repeated disposal is safe.

## Measured budgets and verification

Against the current 1,292 saved placements:

- **3,802 new plants: 145 trees + 3,657 understory plants.** The existing 144 saved hill-grove OBJ trees remain present, giving 289 hill trees in the combined fixture.
- **82 InstancedMesh render batches**, partitioned by hill and species, with computed instance bounds and frustum culling. One shared material, no geometry groups or extra shadow passes; cast-shadow remains off. Maximum is 84 batches for twelve parks × seven species.
- **587,918 submitted triangles if every instance batch is visible**, counted from actual generated geometry attributes × instance counts; shared prototype triangles are not counted just once.
- **3,480 collision triangles**, 24 per new trunk. No low-plant/canopy collision triangles.
- Drawing the same 3,802 prototypes as individual meshes would require 3,802 opaque draws; current batching needs at most 82, a **97.84% structural draw reduction**. This compares identical new geometry; it is not a claim about full-scene FPS, GPU timing, or existing OBJ draws.

`node --test tests/interior-vegetation.test.js` verifies deterministic exact counts, alternate seeds, independence of hill-array ordering, world/plan preservation, geometric bounds/grounding, path/building/meadow/saved-root exclusion, actual instance transforms/triangle budgets, safe registration and disposal. It also exercises the real capsule against all three new trunk types, proves low plants have no colliders, walks through a removed trunk, and completes **24 controller routes (12 summit + 12 transverse grass)** with the actual sampled hill meshes and all **144 real saved hill-tree OBJ colliders** loaded. These are meaningful local loaded-park tests, not complete-world integration or visual acceptance.

Renderer draw calls were **not captured in a browser** in this subtask. Parent should render the same fixed camera/frame with `vegetation.group.visible=false/true`, resetting `renderer.info` each time, then compare `renderer.info.render.calls` and `.triangles`. This gives actual visible-frame overhead (bounded by the structural figures above) without confusing existing OBJ geometry with added planting. Capture real eye-level and overview images and inspect silhouette, leaf detail, soil contact, density and open vistas before claiming visual success.

## Camera recipes for parent render review

Coordinates below are intrinsic `{theta,z,height}` in the habitat frame, not world XYZ; use `interiorPoint` and the habitat world matrix. The eye is 1.65 m above the actual local landscape, not an arbitrary fixed altitude. Eye is on the reserved summit ribbon; look targets face woodland on its denser bank.

| Grove style / hill | Eye `(theta,z,height)` | Look target `(theta,z,height)` |
| --- | --- | --- |
| 0 / `residential-b-hill-1-1` | `(2.8832927962,38.6,4.2464830598)` | `(2.8977506275,27.5782559015,6.8712293883)` |
| 1 / `residential-a-hill-1-0` | `(0.4794662857,37.4,4.2399508374)` | `(0.4939241171,47.2548822320,4.8444369503)` |
| 2 / `residential-a-hill-1-1` | `(0.8283555251,38.05,4.1435064856)` | `(0.8428133565,27.1052951673,6.5112678801)` |

Recompute after future plan changes:

```js
const x = -hill.width * .25;
const z = landscapePathZ(hill, x);
const eye = interiorPoint(hill.theta + x/830, z,
  landscapeHeight(hill, x, z) + 1.65);
const tx = x + 12;
const tz = landscapePathZ(hill, tx) + (hill.groveStyle === 1 ? 1 : -1)*11;
const target = interiorPoint(hill.theta + tx/830, tz,
  landscapeHeight(hill, tx, tz) + 3.5);
```

For a close-up of all forms, use the style-1 hill, select `placements.filter(p=>p.hillId===hill.id)`, and aim from the nearest summit-ribbon point toward a tree/fern/flower root at 5–8 m distance. Do not teleport inside its trunk. For composition use a planner view over the entire bank with a 100–160 m footprint; compare the quieter meadow bank, unobstructed cross-axis and retained central-ring vista rather than only counting plants. Parent must additionally verify full-scene controller routes, culling restore and rendering after integration.
