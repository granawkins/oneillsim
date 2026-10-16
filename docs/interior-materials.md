# Interior material look development

Original authored surface interpretation, not a historical material specification.
This module does **not** change the scene, layout, lighting, saved world, or any
existing runtime module by itself. It is now integrated into the v2 runtime,
with awaited texture readiness, scoped metre UVs and reversible ground ownership.
Rendered grass, paving and concrete views were reviewed. Software-renderer
visits disable bump sampling while retaining albedo and roughness.

## What is provided

- `src/interior-materials.js`: explicitly initialized shared texture library and
  static geometry metre-UV helper. No shader injection, new material groups,
  draw calls, shadows, mandatory remote requests, or import-time DOM work.
- `assets/textures/interior-lookdev/`: six 512×512 RGB PNGs plus deterministic
  manifest (hashes, sizes, bump strengths, physical tile width).
- `assets/scripts/build_interior_materials.py`: original deterministic authoring
  from periodic fields, aggregate/pore masks, and staggered stone courses. No
  downloaded photos, external image licenses or runtime random generation.
- `tests/interior-materials.test.js`: real PNG decode/filter reconstruction,
  payload hashes, repeat edges, channel bounds, regeneration, readiness/error
  handling, shared resource ownership and mapping on actual runtime geometry.

The neutral, slightly warm color maps **multiply** the existing material color
and vertex shading. They do not replace the authored palette with a green photo
or gray concrete image. Grass has crossed fine fibres and soft turf variation;
concrete has restrained mineral clouds and pores; paving has 1 m × 0.5 m staggered
stone setts with narrow joints. The 4 m tile repeats are deliberately low contrast.
Packed surface PNGs store linear **R=bump height, G=roughness, B=255 reserved**.
The same texture object is shared by `bumpMap` and `roughnessMap`.

## Explicit integration recipe

```js
import {
  createInteriorMaterialLibrary, createInteriorMetreUVs,
  INTERIOR_MATERIAL_FAMILIES,
} from './interior-materials.js';

// One library per interior lifetime. Call early to start all six local requests.
const lookdev = createInteriorMaterialLibrary({renderer});
// For software GL, consider {renderer, bump: false}; roughness still works.
// A particular material can opt out via apply(material, family, {bump:false}).

// Immediately after the existing runtime's materials object is constructed:
lookdev.applyPalette(materials);
// Leaves glass, rail, gold, water, conveyors and darkgreen shrub/foliage alone.
// Does not replace existing maps/normal maps (throws on accidental replacement).

// Before the existing mergeGeometries loop:
const hillIds = plan.hills.map(h => h.id);
// Inside that loop, BEFORE creating each render Mesh:
let geometry = mergeGeometries(geometries);
if (INTERIOR_MATERIAL_FAMILIES[color]) {
  const unmapped = geometry;
  geometry = createInteriorMetreUVs(unmapped, {
    // Slopes should stay in top projection, not flip to a wall projection.
    surface: hillIds.some(id => key.startsWith(id + ':')) ? 'top' : 'auto',
  });
  unmapped.dispose(); // ONLY this newly-owned intermediate merged geometry.
}
const mesh = new THREE.Mesh(geometry, materials[color]);
```

Alternatively map the two landscape geometries with `{surface:'top'}` when they
are created and avoid remapping those batches. Default `auto` is appropriate for curved solid boxes,
including their floors, end faces, and retaining walls. Existing BoxGeometry
UVs and `landscapeGeometry`'s `[0,1]` parcel UVs are **not usable unchanged**.
Do not apply the helper to belt geometry: its animated stripe UVs must survive.

### Ground: a different local axis frame

`cylinder.js` creates a Y-axis CylinderGeometry and rotates its Mesh by +π/2
about X. Its local `(x,y,z)` becomes habitat `(x,-z,y)`. The helper defaults to
the runtime's **habitat** frame: XY ring and Z tube axis. Passing untransformed
CylinderGeometry would project the wrong axes.

Map ground **before calling `createCapacityGround`** in the interior runtime:

```js
ground.updateMatrix(); // ensure its rotation is present in ground.matrix
const originalGroundGeometry = ground.geometry;
const metreGroundGeometry = createInteriorMetreUVs(originalGroundGeometry, {
  matrix: ground.matrix, // current cylinder is a direct habitatGroup child
  surface: 'top',
});
ground.geometry = metreGroundGeometry;
lookdev.apply(ground.material, 'grass');
// Then createCapacityGround({ground, ...}) as before: its clipping interpolates
// every attribute, including these metre UVs. Rendering/collision remain shared.
```

If the mesh is nested, pass its matrix **relative to habitatGroup**, not absolute
world coordinates. Rotating the whole habitat must not make textures swim.
Do not replace the clipped ground after `createCapacityGround` without extending
its ownership/disposal contract; its restoration is guarded by geometry identity.
Mapping doesn't change triangle positions or collision shapes.

### Readiness and disposal (required)

Expose `ready: lookdev.ready` on the interior runtime and **await it in main's
complete-scene readiness barrier**, along with model/atlas completion. A loader
failure rejects with the failing filename; parent must retain the existing
loading/error UI and dispose the library on failed startup. Merely constructing
the library or awaiting model loading alone does not prove textures are ready.
No extra `fetch()` or preload is necessary. Each PNG is requested exactly once
per library. Browser's Three TextureLoader handles same-origin image loading;
unit tests inject a loader and never initialize a browser.

Dispose in this order:

1. `groundRuntime?.dispose()` restores its original mapped ground geometry.
2. If `ground.geometry === metreGroundGeometry`, restore `originalGroundGeometry`;
   dispose `metreGroundGeometry` (not the original cylinder geometry).
3. `lookdev.dispose()` restores its borrowed materials' previous map/roughness/
   bump properties and disposes its six owned textures exactly once in the normal
   completed-loading path. It does not dispose borrowed materials/geometries.
4. Dispose runtime-owned batch geometries/materials as usual. Existing ground
   color restoration remains owned by the runtime, not this library.

Library disposal is idempotent and preserves a map another owner installed
later. Disposing while loading rejects `.ready`; outstanding image requests
cannot be aborted through TextureLoader, and late callbacks dispose their
texture again to avoid late GPU ownership. Do not dispose a shared map from
individual material/batch cleanup. Materials can be detached using
`lookdev.restore(material)` before library shutdown.

## Mapping, scale and seams

UV values are **metres**; every map's repeat is `(1/4,1/4)`. Top/bottom surfaces
use `(ring arc, tube Z)`; axial-facing walls use `(ring arc, inward height)`;
circumferential end walls use `(tube Z, inward height)`. Dominant triangle face
normals are evaluated in a ring-relative radial/tangent/axial basis. Double-sided
floors therefore map the same way; no assumption that world Y is up. Projection
boundaries duplicate only vertices needing another UV; normals, colors, groups,
indices' triangle order, and the original input geometry are retained.

The ring circumference is rounded to an integer number of four-metre repeats so
both atan2 branches have exactly the same texture phase. At R=830 the effective
circumference is 5,216 m, a negligible physical scale adjustment. Triangles across
the atan branch are individually unwrapped; no giant interpolated UV jump.
Independent parcels share a habitat anchor, so same-height adjacent top pieces
do not reset their texture at parcel edges. Merge before or after mapping; all
attributes remain merge-compatible. Use only static, non-interleaved geometry;
morphs, skinned attributes, and instanced buffer attributes are explicitly
rejected. A source prototype may be mapped before rigid instancing only if its
positions have first been baked into the intended habitat frame.

**Curvature limitation:** one shared ring reference radius is an intentional
continuous chart, not a perfect isometric unfolding of arbitrary terrain. At
height h, tangential texel scale relative to physical length differs by
`830/(830-h)`. For a uniformly elevated deck, pass `{radius:830-height}` to
calibrate that deck to physical metres. Map before merging different calibrated
levels; each still uses the same shared material and four-metre maps. Ground
uses 830. Prefer a common 830 reference for connected garden slopes to keep
phase continuous at their toes. Top projection on steep slopes foreshortens the
texture; it is appropriate for the current broad, walkable hills, not cliffs.
Do not pick a new radius for every small adjacent parcel (phase would shift).
At hard floor/wall projection corners, joints may change direction; no seamless
cross-corner masonry pattern is claimed. There is no three-sample triplanar
shader or world-matrix precision cost on every pixel.

## Measured delivery and budget

| File | Bytes |
|---|---:|
| grass-color.png | 235,250 |
| grass-surface.png | 239,347 |
| concrete-color.png | 259,725 |
| concrete-surface.png | 249,048 |
| paving-color.png | 164,023 |
| paving-surface.png | 152,323 |
| **Six PNGs** | **1,299,716** |
| manifest.json | 1,640 |

Six 512² textures are approximately **8,388,600 bytes** if uploaded as RGBA8
including the full mip chain; driver allocation and browser decoded image
storage are additional. PNG compression does not reduce GPU allocation. There
is no per-batch texture clone. Trilinear mipmapping and capped anisotropy
`min(4, renderer maximum)` reduce distant shimmer. With no renderer supplied,
anisotropy is conservatively 1. Bump uses StandardMaterial's derivative path and
costs extra texture samples; use `bump:false` first if software GL is constrained.
No normal map, parallax, displacement, AO map, added geometry detail or new
shadow source is introduced. Microcontrast is restrained but mip filtering is
not proof of zero moire at every camera angle: eye-level and overview render QA
is still required, especially paving viewed down the long promenade.

Neutral maps darken the existing diffuse color slightly (mean 8-bit red values:
grass 226.553, concrete 236.859, paving 232.870). They preserve the **material
color value**, not the previous flat surface's final brightness. Lighting/exposure
must be judged in the final scene; no fabricated rendered approval is implied.

## Verification and reproduction

```sh
node --test tests/interior-materials.test.js
python3 assets/scripts/build_interior_materials.py
```

Generator requirements: Python 3 + NumPy + Pillow; runtime has none of these
dependencies. Reproducibility test invokes Python and uses only the approved
Hermes scratch directory. Actual run: 16 tests passed, including byte-for-byte
regeneration and actual curvedSolid/landscape/CylinderGeometry fixtures. A 2D
contact sheet of the generated albedo was inspected; **no browser or full-scene
render QA was performed by this material subtask**. Parent should verify final
loading failures, ground clipping/disposal, vertex shade preservation, texture
phase at patch joins, eye-height perceived scale, and software-renderer timing.

`assets/` may be ignored by Git. When parent commits, explicitly include these
six PNGs, manifest, and generator; do not force-add an entire asset tree.
