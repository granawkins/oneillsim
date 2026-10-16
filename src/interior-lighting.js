import * as THREE from 'three';

const R = 830, TUBE = 65, TAU = 2 * Math.PI;
export const INTERIOR_LIGHTING_BUDGET = Object.freeze({ shadowMapSize: 512, patchHalfWidth: 32, maxCasters: 12, maxCasterTriangles: 80000, shadowInterval: 1 / 6, profileSize: 512 });
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const angle = x => (x % TAU + TAU) % TAU;
const materials = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/** Actual folded-mesh angular coverage, not an invented stripe frequency.
 * The current chevrons are axisymmetric; curved chord/azimuth gaps are NOT resolved.
 * Radial projection of their phi intervals is an aperture proxy, not optical transport.
 */
export function chevronApertureProfile(mesh) {
    if (!mesh?.geometry?.attributes.position) throw new TypeError('Actual chevron mesh required');
    const geometry = mesh.geometry, p = geometry.attributes.position, intervals = [];
    for (let i = 0; i < (geometry.index?.count ?? p.count); i += 3) {
        const phis = [0, 1, 2].map(k => {
            const j = geometry.index ? geometry.index.getX(i + k) : i + k;
            return angle(Math.atan2(p.getZ(j), Math.hypot(p.getX(j), p.getY(j)) - R));
        });
        const lo = Math.min(...phis), hi = Math.max(...phis);
        if (hi - lo > Math.PI) throw new RangeError('Chevron profile crosses phi seam; unsupported aperture');
        intervals.push([lo, hi]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [lo, hi] of intervals) {
        const last = merged.at(-1);
        if (last && lo <= last[1] + 1e-5) last[1] = Math.max(last[1], hi);
        else merged.push([lo, hi]);
    }
    if (!merged.length) throw new RangeError('Empty chevron aperture');
    const min = merged[0][0], max = merged.at(-1)[1];
    // Soften fold transitions over 0.012 rad (~0.8m at the window).
    const sample = phi => {
        phi = angle(phi);
        const envelope = smooth(min, min + .035, phi) * (1 - smooth(max - .035, max, phi));
        let coverage = 0;
        for (const [a, b] of merged) coverage = Math.max(coverage, smooth(a - .006, a + .006, phi) * (1 - smooth(b - .006, b + .006, phi)));
        // Chevrons TRANSMIT by reflection, not opaque louver shadows. Only subtle modulation.
        return envelope * (.76 + .24 * coverage);
    };
    const data = new Uint8Array(INTERIOR_LIGHTING_BUDGET.profileSize * 4);
    for (let i = 0; i < data.length / 4; i++) {
        const v = Math.round(255 * sample((i + .5) / (data.length / 4) * TAU));
        data.set([v, v, v, 255], i * 4);
    }
    return { intervals: merged, min, max, sample, data };
}

/** CPU equivalent of the shader's straight post-chevron approximation. */
export function projectInteriorBeam(point, slope, profile) {
    const p = point.isVector3 ? point : new THREE.Vector3(...point);
    const r = Math.hypot(p.x, p.y), q = r - R;
    const b = q + slope * p.z, d = b * b - (1 + slope * slope) * (q * q + p.z * p.z - TUBE * TUBE);
    if (d < 0 || r > R + 8 || r < R - TUBE || Math.abs(p.z) > TUBE) return { transmission: 0, phi: null };
    const distance = (b + Math.sqrt(d)) / (1 + slope * slope);
    if (distance <= 0) return { transmission: 0, phi: null };
    const phi = angle(Math.atan2(p.z - slope * distance, q - distance));
    return { transmission: profile.sample(phi), phi, entry: new THREE.Vector3((r - distance) * p.x / r, (r - distance) * p.y / r, p.z - slope * distance) };
}

function excluded(object, habitatGroup) {
    for (let o = object; o && o !== habitatGroup; o = o.parent) {
        if (o.userData.exteriorOnly || o.userData.worldTransform || o.userData.interiorLighting === false || /^(exterior-|completed-model-)/.test(o.name)) return true;
    }
    return false;
}

const FRAGMENT_PARS = /* glsl */`
varying vec3 vInteriorWorldPosition;
uniform mat4 ilWorldToHabitat;
uniform mat4 ilHabitatToChevron;
uniform sampler2D ilProfile;
uniform vec2 ilSlopes;
uniform float ilEnabled;
uniform float ilStrength;
uniform float ilShadowEnabled;
uniform vec3 ilPatch;
uniform float ilPatchRadius;
float ilBeam(vec3 p, float slope) {
    float r = length(p.xy), q = r - 830.0;
    float b = q + slope * p.z;
    float d = b*b - (1.0+slope*slope)*(q*q+p.z*p.z-4225.0);
    if (d < 0.0 || r < 765.0 || r > 838.0 || abs(p.z) > 65.0) return 0.0;
    float t = (b+sqrt(max(d,0.0)))/(1.0+slope*slope);
    if (t <= 0.0) return 0.0;
    vec3 entry = vec3(p.xy/r*(r-t), p.z-slope*t);
    entry = (ilHabitatToChevron * vec4(entry,1.0)).xyz;
    float phi = mod(atan(entry.z,length(entry.xy)-830.0)+6.28318530718,6.28318530718);
    return texture2D(ilProfile,vec2(phi/6.28318530718,0.5)).r;
}
`;
const FRAGMENT_LIGHT = /* glsl */`
if (ilEnabled > 0.5) {
    vec3 ilP = (ilWorldToHabitat * vec4(vInteriorWorldPosition,1.0)).xyz;
    float ilR = max(length(ilP.xy),0.001);
    vec3 ilN = normalize(mat3(ilWorldToHabitat) * inverseTransformDirection(normal,viewMatrix));
    vec3 ilRadial = vec3(ilP.xy/ilR,0.0);
    float ilSun = 0.0;
    for (int ilBank=0; ilBank<2; ilBank++) {
        float slope = ilBank==0 ? ilSlopes.x : ilSlopes.y;
        vec3 toLight = normalize(-ilRadial-vec3(0.0,0.0,slope));
        ilSun += 0.5 * ilBeam(ilP,slope) * max(dot(ilN,toLight),0.0);
    }
    float ilShade = 1.0;
    #ifdef USE_SHADOWMAP
        // Real geometry PCF contact shadows; fade BEFORE the local map boundary.
        float ilPatchWeight = 1.0-smoothstep(ilPatchRadius*0.6,ilPatchRadius*0.9,length(ilP-ilPatch));
        ilShade = mix(1.0,getShadowMask(),ilShadowEnabled*ilPatchWeight*0.75);
    #endif
    // Nonzero enclosed-area bounce: no daylight stripes on the below-plain civic floors.
    float ilEnclosed = smoothstep(832.0,838.0,ilR);
    float ilBounce = mix(0.12,0.48,ilEnclosed);
    reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * ilStrength *
        (vec3(1.0,0.94,0.82)*ilSun*ilShade*2.6 + vec3(0.83,0.9,1.0)*ilBounce);
}
`;

/** v2 only. Call AFTER exterior, runtime and render batching exist.
 * No renderer/tone-map or source assembly edits; all borrowed state is restored.
 */
export function createInteriorLighting({ world, scene, habitatGroup, renderer, exteriorEnergy, roots = [habitatGroup], contactShadows = true, exposure = null, ambientIntensity = 3 } = {}) {
    if (world?.settlementDesign?.version !== 2) return null;
    if (!scene?.isScene || !habitatGroup?.isObject3D || !renderer?.shadowMap) throw new TypeError('scene, habitatGroup and renderer required');
    if (!Number.isFinite(ambientIntensity) || ambientIntensity < 0) throw new RangeError('ambientIntensity must be finite and nonnegative');
    const chevrons = exteriorEnergy?.components?.chevrons?.mesh;
    const secondary = exteriorEnergy?.components?.secondary;
    const profile = chevronApertureProfile(chevrons);
    const panels = [-1, 1].map(bank => secondary?.panels?.find(p => p.bank === bank));
    if (panels.some(p => !p)) throw new TypeError('Actual upper/lower secondary panel records required');
    const slopes = panels.map(p => { const [x, y, z] = p.target; return -z / (R - Math.hypot(x, y)); });
    if (slopes.some(x => !Number.isFinite(x))) throw new TypeError('Invalid secondary entry slope');
    const texture = new THREE.DataTexture(profile.data, INTERIOR_LIGHTING_BUDGET.profileSize, 1);
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
    const uniforms = {
        ilWorldToHabitat: { value: new THREE.Matrix4() }, ilHabitatToChevron: { value: new THREE.Matrix4() },
        ilProfile: { value: texture }, ilSlopes: { value: new THREE.Vector2(...slopes) },
        ilEnabled: { value: 1 }, ilStrength: { value: 1 }, ilShadowEnabled: { value: 0 },
        ilPatch: { value: new THREE.Vector3() }, ilPatchRadius: { value: INTERIOR_LIGHTING_BUDGET.patchHalfWidth },
    };
    const previousRenderer = { enabled: renderer.shadowMap.enabled, type: renderer.shadowMap.type, autoUpdate: renderer.shadowMap.autoUpdate, needsUpdate: renderer.shadowMap.needsUpdate, exposure: renderer.toneMappingExposure };
    const borrowedLights = new Map();
    scene.traverse(o => {
        if (o.isAmbientLight || (o.isPointLight && o.parent === habitatGroup && o.distance === 500 && o.decay === 1)) borrowedLights.set(o, o.intensity);
    });
    const group = new THREE.Group(); group.name = 'interior-lighting'; group.userData.interiorLighting = false; habitatGroup.add(group);
    // Intensity zero: this light provides ONLY a local shadow map. Daylight above is radial.
    const light = new THREE.DirectionalLight(0xfff0d8, 0); light.name = 'interior-contact-shadow';
    light.castShadow = contactShadows;
    const target = new THREE.Object3D(); group.add(light, target); light.target = target;
    const budget = INTERIOR_LIGHTING_BUDGET;
    light.shadow.mapSize.set(budget.shadowMapSize, budget.shadowMapSize);
    Object.assign(light.shadow.camera, { left: -budget.patchHalfWidth, right: budget.patchHalfWidth, top: budget.patchHalfWidth, bottom: -budget.patchHalfWidth, near: 1, far: 180 });
    light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -.00025; light.shadow.normalBias = .12; light.shadow.radius = 2;
    light.shadow.autoUpdate = false;
    const bindings = new Map(), clones = new Map(), shadowFlags = new Map();
    let disposed = false, active = true, multiplier = 1, lastShadowTime = -Infinity;
    let candidates = [], casters = [], casterTriangles = 0;
    let pendingHabitatMatrix = null, localShadowMatrix = null;
    function cloneMaterial(original) {
        if (!original?.isMeshStandardMaterial || original.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return original;
        if (clones.has(original)) return clones.get(original);
        const material = original.clone();
        material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = 'varying vec3 vInteriorWorldPosition;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
                vec4 ilVertex = vec4(transformed,1.0);
                #ifdef USE_BATCHING
                    ilVertex = batchingMatrix * ilVertex;
                #endif
                #ifdef USE_INSTANCING
                    ilVertex = instanceMatrix * ilVertex;
                #endif
                vInteriorWorldPosition = (modelMatrix * ilVertex).xyz;`);
            shader.fragmentShader = FRAGMENT_PARS + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAGMENT_LIGHT);
        };
        material.customProgramCacheKey = () => 'interior-chevron-daylight-r160-v1';
        clones.set(original, material); return material;
    }
    function refresh() {
        if (disposed) return;
        // Restore first: removed roots can never retain our material/state accidentally.
        for (const [mesh, original] of bindings) mesh.material = original;
        for (const [mesh, flags] of shadowFlags) Object.assign(mesh, flags);
        shadowFlags.clear(); bindings.clear(); candidates = []; casters = [];
        for (const root of roots) root?.traverse(mesh => {
            if (!mesh.isMesh || excluded(mesh, habitatGroup) || bindings.has(mesh)) return;
            const old = mesh.material, list = materials(mesh), next = list.map(cloneMaterial);
            if (next.every((m, i) => m === list[i])) return;
            bindings.set(mesh, old); mesh.material = Array.isArray(old) ? next : next[0];
            if (!shadowFlags.has(mesh)) shadowFlags.set(mesh, { castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow });
            mesh.receiveShadow = true; mesh.castShadow = false;
            // Transparent glass/water do not act as opaque shadow casters.
            if (!mesh.isSkinnedMesh && !list.some(m => m.transparent || m.opacity < 1)) candidates.push(mesh);
        });
        lastShadowTime = -Infinity;
    }
    function applyBalance() {
        for (const [o, original] of borrowedLights) o.intensity = active ? (o.isAmbientLight ? ambientIntensity : 4) * multiplier : original;
        uniforms.ilEnabled.value = active ? 1 : 0; uniforms.ilStrength.value = multiplier;
        renderer.shadowMap.enabled = active && contactShadows ? true : previousRenderer.enabled;
        renderer.shadowMap.type = active && contactShadows ? THREE.PCFSoftShadowMap : previousRenderer.type;
        // Existing global autoUpdate remains untouched. Only our light updates at 6 Hz.
        if (exposure !== null) renderer.toneMappingExposure = active ? exposure : previousRenderer.exposure;
        light.visible = active && contactShadows;
    }
    function setIntensity(value = 3) {
        if (disposed) return;
        if (!Number.isFinite(value) || value < 0) throw new RangeError('Light intensity must be finite and nonnegative');
        multiplier = clamp(value / 3, 0, 2); applyBalance();
    }
    function update({ camera = null, position = null, time = 0, exteriorVisible = false } = {}) {
        if (disposed) return;
        const nextActive = !exteriorVisible;
        if (active !== nextActive) { active = nextActive; applyBalance(); lastShadowTime = -Infinity; }
        habitatGroup.updateWorldMatrix(true, false); chevrons.updateWorldMatrix(true, false);
        uniforms.ilWorldToHabitat.value.copy(habitatGroup.matrixWorld).invert();
        uniforms.ilHabitatToChevron.value.copy(chevrons.matrixWorld).invert().multiply(habitatGroup.matrixWorld);
        // Cached maps live in the habitat frame, not the last world rotation.
        // The renderer clears needsUpdate after a successful shadow render.
        if (pendingHabitatMatrix && !light.shadow.needsUpdate) {
            localShadowMatrix = light.shadow.matrix.clone().multiply(pendingHabitatMatrix);
            pendingHabitatMatrix = null;
        }
        if (localShadowMatrix) light.shadow.matrix.copy(localShadowMatrix).multiply(uniforms.ilWorldToHabitat.value);
        if (!active || !contactShadows) { uniforms.ilShadowEnabled.value = 0; return; }
        const p = position ? (position.isVector3 ? position.clone() : new THREE.Vector3(...position)) : camera ? camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(uniforms.ilWorldToHabitat.value) : null;
        // No sun/contact patch underground or far outside. Ambient/bounce remains readable.
        const r = p ? Math.hypot(p.x, p.y) : 0;
        if (!p || r > R + 8 || r < R - TUBE || Math.abs(p.z) > TUBE) { uniforms.ilShadowEnabled.value = 0; light.visible = false; return; }
        light.visible = true; uniforms.ilShadowEnabled.value = 1;
        if (time - lastShadowTime < budget.shadowInterval && time >= lastShadowTime) return;
        lastShadowTime = time;
        const patch = p.clone(); uniforms.ilPatch.value.copy(patch); target.position.copy(patch);
        const radial = new THREE.Vector3(p.x / r, p.y / r, 0), slope = slopes[p.z >= 0 ? 1 : 0];
        light.position.copy(patch).addScaledVector(radial, -90).add(new THREE.Vector3(0, 0, -slope * 90));
        // Fixed metre distance; source slopes can be steep at the outer fold.
        light.position.sub(patch).setLength(100).add(patch);
        light.shadow.camera.up.set(0, 0, 1).transformDirection(habitatGroup.matrixWorld);
        for (const mesh of casters) mesh.castShadow = false;
        casters = []; casterTriangles = 0;
        const eligible = [];
        for (const mesh of candidates) {
            if (!mesh.visible) continue;
            mesh.updateWorldMatrix(true, false);
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(uniforms.ilWorldToHabitat.value);
            const distance = sphere.center.distanceTo(patch);
            const triangles = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1);
            // Never submit a whole-ring ground/deck as a contact-map caster.
            if (sphere.radius < 160 && distance - sphere.radius < budget.patchHalfWidth && triangles <= budget.maxCasterTriangles) eligible.push({ mesh, distance, triangles });
        }
        eligible.sort((a, b) => a.distance - b.distance);
        for (const e of eligible) {
            if (casters.length >= budget.maxCasters) break;
            if (casterTriangles + e.triangles > budget.maxCasterTriangles) continue;
            e.mesh.castShadow = true; casters.push(e.mesh); casterTriangles += e.triangles;
        }
        light.shadow.needsUpdate = true;
        renderer.shadowMap.needsUpdate = true;
        pendingHabitatMatrix = habitatGroup.matrixWorld.clone();
    }
    refresh(); applyBalance(); update();
    return {
        group, light, profile, uniforms, refresh, update, setIntensity,
        get stats() { return { materials: clones.size, receivers: bindings.size, casters: casters.length, casterTriangles, shadowMapSize: budget.shadowMapSize, shadowHz: 6, opticalTransport: false }; },
        dispose() {
            if (disposed) return; disposed = true;
            for (const [mesh, original] of bindings) mesh.material = original;
            for (const [mesh, flags] of shadowFlags) Object.assign(mesh, flags);
            for (const [o, original] of borrowedLights) o.intensity = original;
            renderer.shadowMap.enabled = previousRenderer.enabled; renderer.shadowMap.type = previousRenderer.type;
            renderer.shadowMap.autoUpdate = previousRenderer.autoUpdate; renderer.shadowMap.needsUpdate = previousRenderer.needsUpdate;
            if (exposure !== null) renderer.toneMappingExposure = previousRenderer.exposure;
            group.removeFromParent(); light.shadow.dispose(); clones.forEach(m => m.dispose()); texture.dispose();
            bindings.clear(); clones.clear(); shadowFlags.clear(); candidates = []; casters = [];
        },
    };
}
