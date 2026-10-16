# Interior daylight / contact lighting (v2 only)

`src/interior-lighting.js` is an optional, reversible render treatment. It does not
change layout, geometry, exterior optics, solar facts, cameras, collision or saved
world data. `src/lighting.js` is unchanged. Non-v2 worlds return `null` before
allocating or touching anything.

## Source authority versus approximation

Reviewed local SP-413 sources consulted with the study-reference helper:

* Printed p.89 / PDF p.106, `sp413-s02208`–`sp413-s02209`: windows occupy one third
  of the shell and admit sunlight downward; the remainder is aluminum plate.
* Printed p.89, `sp413-s02211`–`sp413-s02219`: separate shielding, reflective
  chevrons passing light through successive reflections, stationary main mirror
  illuminating rotating, individually directed secondary facets. Those are the
  daylight-chain facts. This module does not change the exterior's -X incident
  sunlight or main-mirror -Z reflected direction.
* Printed p.89, `sp413-s02220`–`sp413-s02223`: source residential/agricultural
  irradiance targets differ, and secondary steering provides regulation/night.
  This treatment does **not** simulate those irradiances, steering or day cycles.
* Appendix K, printed p.134 / PDF p.151, `sp413-s03151`–`sp413-s03157`, Figure
  5-36: right-angle first-surface aluminum mirrors, repeated reflected visible
  paths, and connecting glass strips where gas is contained. The actual local
  extracted diagram `study/images/sp413-p0151-11.jpg` was inspected. Chevrons are
  **not opaque Venetian blinds**; dark, razor-edged fake louver decals would be
  misleading.

The local reader retains these IDs. The original source PDF is NASA NTRS citation
19770014162; no study image is shipped as a texture.

### Actual geometry used

`exteriorEnergy.components.chevrons.mesh` is the existing stationary folded
window mesh, not an invented ring. Its rendered vertices are projected to tube
cross-section phi intervals. The present geometry yields 18 intervals in the
inner one-third window arc. A 512x1 linear-filtered data texture records a soft
aperture envelope and a deliberately **subtle 0.76–1.0** reflective-fold
modulation. The interval count/edges come from geometry, not a separate stripe
frequency. The texture is data, not sRGB art.

The actual lower/upper secondary panel records supply the receiver positions.
Each bank's *post-chevron illustrative* slope is from its receiver toward the
830 m, z=0 garden plain. The shader traces backwards through the 65 m tube
cross-section to the inner pressure-window entry, transforms that point into the
actual stationary chevron frame, and samples its profile. Outside the aperture
there is no direct component from that bank. The source direction varies around
the whole XY ring: local down is radial outward, never global -Y. Normal maps,
vertex colors and material textures retain their original Three lighting roles.

This is explicitly **not** a solution of all chevron reflections. The existing
exterior guarantees first-face delivery only. Pressure-window to shield
stand-off, chordal/azimuth seams, facet-by-facet flux, glass transmission, precise
fold penumbrae and mirror BRDFs are not solved. The profile is an axisymmetric
projection; the original mesh must keep its present centered toroidal local
coordinates. A source-geometry edit requires recreating the rig/profile. Rigid
habitat rotations and shared scene-frame rotations are supported; arbitrary
nonuniform parent scaling or a reoriented non-coaxial shield are not claimed.

## Illumination and genuine contact shadows

* Default legacy ambient intensity is **3**; main supplies **7** after rendered
  review to keep older tree materials readable (existing dark-gray color retained)
  instead of the live 75 after `setLightIntensity(3)`. Legacy ring points become
  **4** each instead of 60. These are lookdev values, not NASA irradiances.
* Scoped cloned `MeshStandardMaterial` / `MeshPhysicalMaterial` shaders add two
  warm, aperture-filtered radial diffuse banks. No global directional sun is
  added. Material diffuse color, metalness, maps and normal shading remain in
  Three's standard pipeline. Existing custom `onBeforeCompile` materials are
  deliberately skipped rather than overwritten.
* A small cool bounce term prevents unlit surfaces collapsing into black.
  Below-plain civic floors (e.g. r=872 m / h=-42 m) receive **zero direct beam**
  and **no local sun-shadow patch**. A smooth 832–838 m radial transition gives
  them a larger, uniform enclosed-area bounce. This is an authored readability /
  artificial-service-light approximation, not claimed daylight under solid
  ceilings. No striping/grass decals are applied to these floors.
* One **zero-intensity directional light** provides a real depth shadow map only;
  its ordinary directional contribution is exactly zero. Its source vector
  follows the selected actual upper/lower bank's interpreted direction. The
  shader uses the map only on its radial daylight contribution and only inside
  a camera-local soft-faded patch. It never darkens bounce/emissive illumination.
* Contact shadows use Three r160 PCFSoftShadowMap over a **64x64 m** orthographic
  patch, **512x512** texels, at **at most 6 Hz**. Radius is 32 m; the receiver
  weight fades from 19.2 to 28.8 m, before the boundary. Shadow opacity is capped
  at 75% on direct light. PCF is a small filtering kernel, not an area-source
  penumbra or a path tracer. `shadow.radius` is not a claimed adjustable softness
  control for Three's PCFSoft implementation.
* Only the nearest **12 eligible mesh submissions / 80,000 triangles total**
  can cast, including InstancedMesh multiplicity. Bounding spheres over 160 m
  are excluded: a whole-torus ground/deck never becomes a map caster. Transparent
  materials and exterior/free-transform assemblies are excluded. Existing merged
  interior cells are used directly; nothing is duplicated as shadow proxies.
* Depth maps are cached in the habitat frame. The sampled shadow matrix is
  compensated for habitat motion between 6 Hz map refreshes. This avoids a stale
  world-space map sweeping across spinning ground. Dynamic object animation
  between refreshes can still show the bounded update interval.

One map cannot exactly represent the two broad banks simultaneously; the selected
near-bank map attenuates their combined direct term. Distant meshes have radial
normal shading and broad fold modulation but **no building contact shadows**.
Objects omitted by the explicit caster/triangle budget can miss shadows. This is
a deliberate performance/accuracy trade, not complete global occlusion.

## Parent integration

Install after v2 runtime, texture treatment, vegetation and exterior assembly exist
(and after any `createSettlementRendering.refresh()` that generates new meshes):

```js
import {createInteriorLighting} from './interior-lighting.js';

const interiorLighting = createInteriorLighting({
  world: worldData,
  scene, habitatGroup, renderer,
  exteriorEnergy: exteriorAssembly.energy,
  contactShadows: true,
  ambientIntensity: 7, // chosen after full-scene rendered review
  // Leave exposure null if createSettlementPresentation already owns it.
  exposure: null,
});
```

In the parent frame, **after habitat/camera movement and exterior visibility
update, immediately before renderer.render**, call:

```js
interiorLighting?.update({
  camera, // world-space camera converted to habitat coordinates
  time: time / 1000, // monotonic seconds; do not leave this at default 0
  exteriorVisible: exteriorAssembly.envelopeVisible,
});
```

Alternatively pass `position: cameraAnchor.position` if it is known to be
habitat-local. `position` takes precedence over `camera`. Passing the camera is
safer if its rig uses mixed world/local frames. A frame call with no position or
camera retains broad daylight but disables the contact patch. The rig does not
own an animation loop or spawn a browser.

**Brightness UI:** route v2 changes to `interiorLighting.setIntensity(sliderValue)`
instead of `setLightIntensity`. The legacy slider's normal 3 maps to the new
baseline; the contribution is capped at 2x. Do not call `setLightIntensity(3)`
after installing this rig: that would overwrite the intentionally rebalanced
borrowed lights. Non-v2 keeps its existing brightness path. On entering exterior
mode `update` restores the exact captured legacy light intensities and optional
exposure; returning restores interior balance. Exterior objects retain original
materials and never receive the shader.

When rebuilding render batches/adding plants, call `interiorLighting.refresh()`
**after** their new meshes exist. It restores removed bindings before rescanning.
Prefer installing textures before lighting: shader clones borrow, never dispose,
texture resources. Ordinary map replacement later should target the active clone
or be followed by a correctly ordered dispose/recreate, not edit a hidden original.

Dispose lighting **before** disposing materials, geometry or exterior optics:

```js
interiorLighting?.dispose();
// then vegetation/textures/runtime/exterior disposal in their ownership order
```

Dispose is idempotent and restores exact borrowed material identities, cast/receive
flags, original light intensities, renderer shadow enabled/type/autoUpdate/
needsUpdate state, and optional exposure. Only owned material clones, profile
texture and shadow map are disposed. Tone mapping is never changed. No global
scene environment, fog, cameras or exterior sunlight directions are touched.
As with other scoped render treatments, renderer shadow settings should have a
single owner while active. Other shadow lights would also enter Three's
`getShadowMask`; the current scene has none. A future multi-shadow scene should
replace that helper with an explicitly indexed owned-light sample.

### Starting settings and softwareGL fallback

Use the existing ACESFilmic presentation, exposure **1.0** initially (roughly
0.9–1.05 for visual review), rather than compensate by raising ambient again.
The module's default does not alter exposure, so parent presentation lifecycle
stays authoritative. Start with 512 contact shadows; if a measured softwareGL
frame cost is unacceptable, recreate with `contactShadows:false`. This preserves
radial beam shading, reduced ambient and enclosed readability with **zero extra
shadow passes**. Do not increase to whole-ring maps or 8192 px maps.

`rig.stats` exposes receiver/material counts, selected caster/triangle counts,
map size and target refresh rate. These are CPU inventory/budget assertions,
**not measured GPU timings**. Shader costs are two profile samples plus ordinary
PCF lookup in the near patch; no new color-pass draw call per receiver and no
new geometry. Standard lights remain twelve cheap rebalanced points plus the
single shadow-only directional light. Node tests cannot establish softwareGL
frame rate or the final aesthetics.

## Verification / implementation reference

Run `node --test tests/interior-lighting.test.js` (12 tests). Includes actual
folded-face ray hits versus the geometry-derived profile, modified-geometry
profile response, bank targets, tube-entry masks, below-plain exclusions, exact
energy/renderer lifecycle restoration, radial/reference-frame rotation, cached
shadow-map coordinate invariance, budget/throttling, shader-hook compatibility,
custom/exterior exclusions and the real v2 merged-runtime geometry identity.

The actual installed Three r160 source was read, rather than guessing APIs:
`ShaderLib/meshphysical.glsl.js`, `ShaderChunk/project_vertex.glsl.js`,
`lights_fragment_begin.glsl.js`, `shadowmask_pars_fragment.glsl.js`,
`WebGLShadowMap.js`, `DirectionalLightShadow.js`, and `Material.js` under
`node_modules/three/src/`. Those establish material.diffuseColor scope, existing
normal-map normals, instanced transforms, receiveShadow gating, per-light
`autoUpdate`/`needsUpdate`, and shadow-camera/map disposal behavior.

No browser was spawned by this delegated task. The parent must render the complete
scene, check shader compiler logs, actual 512-map rendering and frame costs,
review garden/roof/civic-floor views and the exterior toggle, and check brightness
UI routing. Passing Node tests is not claimed visual or GPU compilation approval.
