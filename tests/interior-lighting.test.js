import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createExteriorEnergy } from '../src/exterior-energy.js';
import { createInteriorRuntime } from '../src/interior-runtime.js';
import { createInteriorLighting, chevronApertureProfile, projectInteriorBeam, INTERIOR_LIGHTING_BUDGET as B } from '../src/interior-lighting.js';

const world = { settlementDesign: { version: 2 } };
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function fixture(options = {}) {
    const scene = new THREE.Scene(), habitatGroup = new THREE.Group(), stationary = new THREE.Group(); scene.add(habitatGroup, stationary);
    const exteriorEnergy = createExteriorEnergy({ rotatingGroup: habitatGroup, stationaryGroup: stationary });
    const ambient = new THREE.AmbientLight(0x404040, 75); scene.add(ambient);
    const point = new THREE.PointLight(0xfff8e0, 60, 500, 1); habitatGroup.add(point);
    const renderer = { shadowMap: { enabled: false, type: THREE.PCFShadowMap, autoUpdate: true, needsUpdate: false }, toneMappingExposure: 1.1 };
    const material = new THREE.MeshStandardMaterial({ color: 0xaabbaa });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), material); mesh.position.set(820, 0, 0); habitatGroup.add(mesh);
    const initialChildren = habitatGroup.children.length;
    const rig = createInteriorLighting({ world, scene, habitatGroup, renderer, exteriorEnergy, ...options });
    return { scene, habitatGroup, stationary, exteriorEnergy, ambient, point, renderer, material, mesh, rig, initialChildren, dispose() { rig?.dispose(); exteriorEnergy.dispose(); mesh.geometry.dispose(); material.dispose(); } };
}

test('v1/absent versions are strict no-ops even with missing scene/optics', () => {
    assert.equal(createInteriorLighting(), null);
    assert.equal(createInteriorLighting({ world: { settlementDesign: { version: 1 } } }), null);
    assert.throws(() => createInteriorLighting({ world }), /required/);
});

test('visual-review ambient override scales through UI and restores exact exterior balance', () => {
    const f=fixture({ambientIntensity:7});close(f.ambient.intensity,7);f.rig.setIntensity(1.5);close(f.ambient.intensity,3.5);
    f.rig.update({exteriorVisible:true});close(f.ambient.intensity,75);f.rig.update({exteriorVisible:false});close(f.ambient.intensity,3.5);
    f.dispose();close(f.ambient.intensity,75);
});

test('actual chevron mesh yields eighteen real folded intervals, not arbitrary bands', () => {
    const f = fixture();
    const profile = f.rig.profile, p = f.exteriorEnergy.components.chevrons.mesh.geometry.attributes.position;
    assert.equal(profile.intervals.length, 18);
    // Sample actual rendered triangle centroid phi, excluding the outermost aperture fade.
    let checked = 0;
    for (let i = 0; i < p.count; i += 771) {
        const phi = Math.atan2(p.getZ(i), Math.hypot(p.getX(i), p.getY(i)) - 830);
        const a = (phi + 2 * Math.PI) % (2 * Math.PI);
        assert.ok(profile.intervals.some(([lo, hi]) => a >= lo - 1e-5 && a <= hi + 1e-5)); checked++;
    }
    assert.ok(checked > 20);
    for (const [lo, hi] of profile.intervals.slice(1, -1)) assert.ok(profile.sample((lo + hi) / 2) > .99);
    // Rays against the actual triangle mesh independently verify the profile's
    // reflective-fold centers, not just a duplicate analytic eighteen-band formula.
    const theta = .031, mesh = f.exteriorEnergy.components.chevrons.mesh;
    f.scene.updateMatrixWorld(true);
    for (const [lo, hi] of profile.intervals.slice(1, -1)) {
        const phi = (lo + hi) / 2;
        const origin = new THREE.Vector3(830 * Math.cos(theta), 830 * Math.sin(theta), 0);
        const direction = new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi));
        assert.ok(new THREE.Raycaster(origin, direction).intersectObject(mesh).length > 0, 'profile center has a real folded-face hit');
    }
    assert.equal(profile.sample(0), 0);
    assert.equal(profile.sample(Math.PI / 2), 0);
    f.dispose();
});

test('profile reacts to actual edited geometry; reflection modulation is subtle, not opaque fake shadows', () => {
    const point = (phi, r = 70) => [(830 + r * Math.cos(phi)), 0, r * Math.sin(phi)];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([point(2.7), point(2.8), point(2.75, 75), point(3), point(3.1), point(3.05, 75)].flat(), 3));
    const mesh = new THREE.Mesh(geometry), p = chevronApertureProfile(mesh);
    assert.equal(p.intervals.length, 2); assert.ok(p.sample(2.75) > .99);
    close(p.sample(2.9), .76);
    assert.equal(p.sample(2.5), 0);
    geometry.dispose();
});

test('beam directions come from actual secondary receiver points; lower civic floors get no direct beam', () => {
    const f = fixture();
    const slopes = f.rig.uniforms.ilSlopes.value.toArray();
    [-1, 1].forEach((bank, i) => {
        const t = f.exteriorEnergy.components.secondary.panels.find(p => p.bank === bank).target;
        close(slopes[i], -t[2] / (830 - Math.hypot(t[0], t[1])));
        const beam = projectInteriorBeam([830, 0, 0], slopes[i], f.rig.profile);
        assert.ok(beam.transmission > .95);
        close(Math.hypot(Math.hypot(beam.entry.x, beam.entry.y) - 830, beam.entry.z), 65);
        assert.equal(projectInteriorBeam([872, 0, 0], slopes[i], f.rig.profile).transmission, 0);
        assert.equal(projectInteriorBeam([830, 0, 100], slopes[i], f.rig.profile).transmission, 0);
    });
    assert.equal(projectInteriorBeam([830, 0, 40], slopes[1], f.rig.profile).transmission, 0, 'not every bank lights every tube surface');
    assert.ok(projectInteriorBeam([830, 0, 40], slopes[0], f.rig.profile).transmission > .9);
    f.dispose();
});

test('rebalance, bounded UI scaling and idempotent disposal restore exact borrowed state', () => {
    const f = fixture({ exposure: .95 });
    assert.equal(f.ambient.intensity, 3); assert.equal(f.point.intensity, 4);
    assert.equal(f.renderer.toneMappingExposure, .95);
    assert.notEqual(f.mesh.material, f.material);
    f.rig.setIntensity(6); assert.equal(f.ambient.intensity, 6); assert.equal(f.point.intensity, 8);
    f.rig.setIntensity(100); assert.equal(f.ambient.intensity, 6, 'bounded, not washed out');
    assert.throws(() => f.rig.setIntensity(NaN), /finite/);
    const clone = f.mesh.material; let disposed = 0; clone.addEventListener('dispose', () => disposed++);
    f.rig.dispose(); f.rig.dispose();
    assert.equal(f.mesh.material, f.material); assert.equal(disposed, 1);
    assert.equal(f.ambient.intensity, 75); assert.equal(f.point.intensity, 60);
    assert.equal(f.habitatGroup.children.length, f.initialChildren);
    assert.deepEqual(f.renderer.shadowMap, { enabled: false, type: THREE.PCFShadowMap, autoUpdate: true, needsUpdate: false });
    assert.equal(f.renderer.toneMappingExposure, 1.1);
    assert.equal(f.mesh.receiveShadow, false); assert.equal(f.mesh.castShadow, false);
    f.dispose();
});

test('exterior envelope restores legacy light/exposure and keeps assembly materials untouched', () => {
    const f = fixture({ exposure: .9 });
    const exteriorMaterial = f.exteriorEnergy.components.secondary.mesh.material;
    f.rig.update({ exteriorVisible: true });
    assert.equal(f.ambient.intensity, 75); assert.equal(f.point.intensity, 60);
    assert.equal(f.renderer.shadowMap.enabled, false); assert.equal(f.renderer.toneMappingExposure, 1.1);
    assert.equal(f.rig.uniforms.ilEnabled.value, 0);
    assert.equal(f.exteriorEnergy.components.secondary.mesh.material, exteriorMaterial);
    f.rig.update({ exteriorVisible: false }); assert.equal(f.ambient.intensity, 3);
    f.dispose();
});

test('actual Three r160 shader hooks preserve maps, instancing and enclosed bounce', () => {
    const f = fixture();
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    f.mesh.material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /instanceMatrix \* ilVertex/);
    assert.match(shader.vertexShader, /batchingMatrix \* ilVertex/);
    assert.match(shader.fragmentShader, /getShadowMask\(\)/);
    assert.match(shader.fragmentShader, /smoothstep\(832.0,838.0,ilR\)/);
    assert.match(shader.fragmentShader, /mix\(0.12,0.48,ilEnclosed\)/);
    assert.match(shader.fragmentShader, /#include <map_fragment>/);
    assert.equal(shader.uniforms.ilProfile, f.rig.uniforms.ilProfile);
    assert.equal(f.rig.light.intensity, 0, 'shadow-only light cannot add global directional illumination');
    f.dispose();
});

test('full radial down varies around ring; habitat and stationary coordinate transforms stay correct', () => {
    const f = fixture();
    f.scene.rotation.set(.2, -.1, .3); f.habitatGroup.rotation.z = .93;
    f.rig.update(); f.scene.updateMatrixWorld(true);
    for (const theta of [0, .4, Math.PI / 2, Math.PI, 4.3]) {
        const local = new THREE.Vector3(830 * Math.cos(theta), 830 * Math.sin(theta), 0);
        const actual = local.clone().applyMatrix4(f.habitatGroup.matrixWorld).applyMatrix4(f.rig.uniforms.ilWorldToHabitat.value);
        assert.ok(actual.distanceTo(local) < 1e-9);
        close(projectInteriorBeam(actual, f.rig.uniforms.ilSlopes.value.x, f.rig.profile).transmission, 1);
        const stationary = local.clone().applyMatrix4(f.rig.uniforms.ilHabitatToChevron.value);
        close(Math.hypot(stationary.x, stationary.y), 830);
        close(stationary.z, 0);
    }
    f.dispose();
});

test('one local 512 map, fixed caster/triangle limits, throttling and no whole-torus casters', () => {
    const f = fixture();
    for (let i = 0; i < 25; i++) {
        const m = new THREE.Mesh(f.mesh.geometry, f.material); m.position.set(820, i * .5, 0); f.habitatGroup.add(m);
    }
    const wholeRing = new THREE.Mesh(new THREE.TorusGeometry(830, 65, 8, 32), f.material); f.habitatGroup.add(wholeRing);
    f.renderer.shadowMap.autoUpdate = false;
    f.rig.refresh(); f.rig.update({ position: [828, 0, 0], time: 0 });
    assert.equal(f.renderer.shadowMap.needsUpdate, true, 'explicit update also works with a frozen global shadow map');
    assert.ok(f.rig.stats.casters <= B.maxCasters); assert.ok(f.rig.stats.casters > 0);
    assert.ok(f.rig.stats.casterTriangles <= B.maxCasterTriangles);
    assert.equal(wholeRing.castShadow, false); assert.equal(f.rig.light.shadow.mapSize.x, 512);
    assert.equal(f.renderer.shadowMap.type, THREE.PCFSoftShadowMap);
    // Simulate the renderer consuming its map update, using its real matrix update API.
    f.scene.updateMatrixWorld(true); f.rig.light.shadow.updateMatrices(f.rig.light);
    f.rig.light.shadow.needsUpdate = false;
    f.rig.update({ position: [827, 0, 0], time: .05 });
    assert.equal(f.rig.light.shadow.needsUpdate, false);
    f.rig.update({ position: [827, 0, 0], time: .2 }); assert.equal(f.rig.light.shadow.needsUpdate, true);
    f.rig.update({ position: [872, 0, 0], time: .4 });
    assert.equal(f.rig.uniforms.ilShadowEnabled.value, 0); assert.equal(f.rig.light.visible, false);
    wholeRing.geometry.dispose(); f.dispose();
});

test('cached contact-map coordinates remain attached to habitat during rotation between updates', () => {
    const f = fixture();
    f.rig.update({ position: [828, 0, 0], time: 0 }); f.scene.updateMatrixWorld(true);
    f.rig.light.shadow.updateMatrices(f.rig.light); f.rig.light.shadow.needsUpdate = false;
    const point = new THREE.Vector3(827, 2, 0);
    const before = point.clone().applyMatrix4(f.habitatGroup.matrixWorld).applyMatrix4(f.rig.light.shadow.matrix);
    f.habitatGroup.rotation.z = .5;
    f.rig.update({ position: [828, 0, 0], time: .05 }); f.scene.updateMatrixWorld(true);
    const after = point.clone().applyMatrix4(f.habitatGroup.matrixWorld).applyMatrix4(f.rig.light.shadow.matrix);
    assert.ok(before.distanceTo(after) < 1e-9);
    f.dispose();
});

test('refresh excludes explicit exterior/custom shaders and restores removed mesh state', () => {
    const f = fixture();
    const outside = new THREE.Mesh(f.mesh.geometry, f.material); outside.userData.exteriorOnly = true; f.habitatGroup.add(outside);
    const custom = f.material.clone(); custom.onBeforeCompile = () => {};
    const c = new THREE.Mesh(f.mesh.geometry, custom); f.habitatGroup.add(c);
    f.rig.refresh(); assert.equal(outside.material, f.material); assert.equal(c.material, custom);
    f.mesh.removeFromParent(); f.rig.refresh();
    assert.equal(f.mesh.material, f.material); assert.equal(f.mesh.receiveShadow, false);
    custom.dispose(); f.dispose();
});

test('real v2 merged runtime receives lighting without geometry changes or unbounded contact submissions', () => {
    const f = fixture(); f.rig.dispose();
    const colliderWorld = { setObject() {}, remove() {} }, controller = {};
    const runtime = createInteriorRuntime({ habitatGroup: f.habitatGroup, colliderWorld, controller, world });
    const geometries = runtime.group.children.map(o => o.geometry);
    const rig = createInteriorLighting({ world, scene: f.scene, habitatGroup: f.habitatGroup, renderer: f.renderer, exteriorEnergy: f.exteriorEnergy });
    rig.update({ position: [828, 0, 0], time: 1 });
    assert.ok(rig.stats.receivers > 100);
    assert.ok(rig.stats.casters <= B.maxCasters); assert.ok(rig.stats.casterTriangles <= B.maxCasterTriangles);
    assert.deepEqual(runtime.group.children.map(o => o.geometry), geometries);
    rig.dispose(); runtime.dispose(); f.dispose();
});
