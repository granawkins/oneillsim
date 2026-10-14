import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createExteriorStructure, structuralSpec } from '../src/exterior-structure.js';
import { ColliderWorld } from '../src/physics/collider-world.js';
import { CharacterController, CHARACTER } from '../src/physics/character-controller.js';
import { createBlockout } from '../src/editor/blockout.js';
import { orientToSurface } from '../src/editor/placement.js';

// Immutable historical/placement fixture, not generated from mutable world data.
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
};
const fixture = deepFreeze({
  world: { masterPlan: { districts: [
    { center: 0.6720820104694583 }, { center: 1.7192795616660559 },
    { center: 2.7664771128626535 }, { center: 3.813674664059251 },
    { center: 4.860872215255849 }, { center: 5.908069766452447 },
  ] } },
  sourceFacts: { spokeCount: 6, spokeDiameter: 15, hubDiameter: 130,
    fabricationDiameter: 100, dockingDiameter: 15, dockingLength: 60,
    tubeDiameter: 130, glazingSurfaceFraction: 1 / 3, aluminumSurfaceFraction: 2 / 3,
    shieldGap: 1.5, shieldThickness: 1.7 },
  anchors: [ ['5-1', 105, 88, 'sp413-s02183'], ['5-3', 106, 89, 'sp413-s02235'] ],
});
const close = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (tolerance ${eps})`);
const make = (world = fixture.world) => {
  const scene = new THREE.Scene(), rotatingGroup = new THREE.Group(), stationaryGroup = new THREE.Group();
  scene.add(rotatingGroup, stationaryGroup);
  return { scene, rotatingGroup, stationaryGroup, ...createExteriorStructure({ rotatingGroup, stationaryGroup, world }) };
};
const tubeDistance = p => Math.hypot(Math.hypot(p.x, p.y) - 830, p.z);
function* transforms(mesh) {
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
    const matrix = new THREE.Matrix4();
    if (mesh.isInstancedMesh) mesh.getMatrixAt(i, matrix);
    yield mesh.matrixWorld.clone().multiply(matrix);
  }
}
function* triangles(mesh, matrix = new THREE.Matrix4()) {
  const { position } = mesh.geometry.attributes, indices = mesh.geometry.index;
  for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
    yield [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, indices ? indices.getX(i + j) : i + j).applyMatrix4(matrix));
  }
}
function sampleTriangle(a, b, c, divisions = 4) {
  const samples = [];
  for (let i = 0; i <= divisions; i++) for (let j = 0; j <= divisions - i; j++) {
    samples.push(a.clone().multiplyScalar(i / divisions).addScaledVector(b, j / divisions).addScaledVector(c, 1 - (i + j) / divisions));
  }
  samples.push(a.clone().add(b).add(c).multiplyScalar(1 / 3));
  return samples;
}

// Only reads the protected saved scene, never imports it as procedural authoring input.
test('protected 1,573-record world remains byte-identical', () => {
  const bytes = readFileSync(new URL('../world.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '30fa3a8784133571c948aa44425db43087197c18033d095d3b706675be83b3fb');
  const world = JSON.parse(bytes);
  assert.equal(world.assets.length, 1573);
  const before = JSON.stringify(world);
  const a = make(deepFreeze(world));
  assert.deepEqual(a.stats.spokeAngles, world.masterPlan.districts.map(d => d.center));
  a.setEnvelopeVisible(true); a.dispose();
  assert.equal(JSON.stringify(world), before);
  assert.deepEqual(readFileSync(new URL('../world.json', import.meta.url)), bytes);
});

test('source facts match immutable fixture and actual SP-413 figure manifest', () => {
  for (const [key, value] of Object.entries(fixture.sourceFacts)) assert.equal(structuralSpec.sourceFacts[key], value, key);
  const segments = JSON.parse(readFileSync(new URL('../study/segments.json', import.meta.url))).segments;
  for (const [figure, pdfPage, printedPage, id] of fixture.anchors) {
    const anchor = structuralSpec.sourceFacts.anchors.find(a => a.figure === figure);
    assert.deepEqual([anchor.pdfPage, anchor.printedPage, anchor.segment], [pdfPage, printedPage, id]);
    const source = segments.find(s => s.id === id);
    assert.equal(source.pdf_page, pdfPage); assert.equal(source.printed_page, printedPage);
    assert.equal(`study/${source.image_path}`, anchor.image);
    assert.match(source.caption, new RegExp(`Figure ${figure}`));
  }
  for (const [id, text] of [['sp413-s02206', 'Six spokes, each 15 m'], ['sp413-s02208', '1/3'], ['sp413-s02209', '2/3'], ['sp413-s02211', '1-1 /2 m'], ['sp413-s02212', '1.7 m'], ['sp413-s02230', 'do not rotate']]) {
    assert.ok(segments.find(s => s.id === id).text.includes(text));
  }
  const frozen = value => {
    if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
  };
  frozen(structuralSpec); frozen(fixture);
  assert.throws(() => { structuralSpec.sourceFacts.spokeCount = 7; }, TypeError);
  assert.throws(() => { fixture.world.masterPlan.districts[0].center = 0; }, TypeError);
  const before = JSON.stringify([fixture, structuralSpec]); const a = make(); a.dispose();
  assert.equal(JSON.stringify([fixture, structuralSpec]), before);
});

test('six hollow spokes align exactly with saved district centers, including nonzero yaw', () => {
  const a = make(), m = a.components.spokeTubes;
  assert.equal(m.count, 6); assert.equal(m.userData.sourceFacts.spokeCount, m.count);
  assert.equal(m.userData.sourceFacts.spokeDiameter, 15);
  assert.deepEqual(a.stats.spokeAngles, fixture.world.masterPlan.districts.map(d => d.center));
  for (let i = 0; i < m.count; i++) {
    const matrix = new THREE.Matrix4(); m.getMatrixAt(i, matrix);
    const direction = new THREE.Vector3(1, 0, 0).transformDirection(matrix), yaw = a.stats.spokeAngles[i];
    close(direction.x, Math.cos(yaw)); close(direction.y, Math.sin(yaw)); close(direction.z, 0);
    close(yaw, fixture.world.masterPlan.districts[0].center + i * Math.PI / 3, 1e-12);
  }
  const p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i), r = Math.hypot(v.y, v.z);
    assert.ok(Math.abs(r - 7.5) < 1e-5 || Math.abs(r - 7.15) < 1e-5, 'annular wall only, no bore cap');
    if (v.x < 100) close(v.length(), 65, 1e-4);
    else {
      close(Math.hypot(v.x, v.y), 765, 1e-4);
      assert.ok(tubeDistance(v) >= 65 - 1e-4 && tubeDistance(v) < 65.44);
    }
  }
  // Actual mesh raycasts: open bore, not a closed cylinder hidden by double-sided materials.
  const ray = new THREE.Raycaster(new THREE.Vector3(100, 0, 0), new THREE.Vector3(1, 0, 0), 0, 660);
  const local = new THREE.Mesh(m.geometry, m.material); local.updateMatrixWorld();
  assert.equal(ray.intersectObject(local).length, 0);
  ray.set(new THREE.Vector3(400, 0, 0), new THREE.Vector3(0, 1, 0));
  const hits = ray.intersectObject(local); assert.ok(hits.length > 0); close(hits[0].distance, 7.15, 1e-4);
  a.dispose();
});

test('actual geometry has finite bounds, normalized normals and consistent triangle winding', () => {
  const a = make();
  const unique = new Set(Object.values(a.components).map(m => m.geometry));
  a.groups.groundEntries.traverse(m => { if (m.isMesh) unique.add(m.geometry); });
  let trianglesChecked = 0;
  for (const g of unique) {
    g.computeBoundingBox(); g.computeBoundingSphere();
    for (const n of [...g.boundingBox.min.toArray(), ...g.boundingBox.max.toArray(), ...g.boundingSphere.center.toArray(), g.boundingSphere.radius]) assert.ok(Number.isFinite(n));
    const p = g.attributes.position, n = g.attributes.normal;
    assert.equal(p.count, n.count);
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i), normal = new THREE.Vector3().fromBufferAttribute(n, i);
      assert.ok(v.toArray().every(Number.isFinite)); close(normal.length(), 1, 2e-5);
      assert.ok(g.boundingBox.containsPoint(v));
      assert.ok(v.distanceTo(g.boundingSphere.center) <= g.boundingSphere.radius + 1e-4);
    }
    const index = g.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
      const [v0, v1, v2] = ids.map(id => new THREE.Vector3().fromBufferAttribute(p, id));
      const cross = v1.clone().sub(v0).cross(v2.clone().sub(v0));
      assert.ok(cross.length() > 1e-10, `nondegenerate triangle ${g.type}:${i}`);
      const normal = ids.reduce((s, id) => s.add(new THREE.Vector3().fromBufferAttribute(n, id)), new THREE.Vector3());
      assert.ok(cross.dot(normal) > 0, `winding agrees with normals ${g.type}:${i}`); trianglesChecked++;
    }
  }
  for (const m of Object.values(a.components)) for (const transform of transforms(m)) assert.ok(transform.elements.every(Number.isFinite));
  assert.ok(trianglesChecked > 30000);
  a.dispose();
});

test('envelope surfaces point outward except inner shield, source aperture and gaps are explicit', () => {
  const a = make(), c = a.components;
  for (const name of ['pressureShell', 'glazing', 'shieldOuter', 'shieldInner']) {
    const g = c[name].geometry, p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i), normal = new THREE.Vector3().fromBufferAttribute(n, i);
      const radial = Math.hypot(v.x, v.y);
      const expected = new THREE.Vector3(v.x / radial * (radial - 830), v.y / radial * (radial - 830), v.z).normalize();
      assert.ok(normal.dot(expected) * (name === 'shieldInner' ? -1 : 1) > 0.99999);
      close(tubeDistance(v), g.userData.nominalRadius + structuralSpec.interpretation.envelopeRenderClearance, 1e-4);
    }
  }
  const phiSpan = name => { const g = c[name].geometry.userData; return (g.phiEnd - g.phiStart) / (2 * Math.PI); };
  close(phiSpan('glazing'), 1 / 3); close(phiSpan('pressureShell'), 2 / 3);
  close(c.shieldInner.geometry.userData.nominalRadius - c.pressureShell.geometry.userData.nominalRadius, 1.5);
  close(c.shieldOuter.geometry.userData.nominalRadius - c.shieldInner.geometry.userData.nominalRadius, 1.7);
  // Conservative whole-triangle lower bound, independent of sample spacing:
  // subtract the maximal tube chord and ring chord sagittas from vertex radius.
  for (const name of ['pressureShell', 'glazing', 'shieldOuter', 'shieldInner']) {
    const g = c[name].geometry.userData, r = g.nominalRadius + g.renderClearance;
    const bound = r * Math.cos((g.phiEnd - g.phiStart) / g.tubeSegments / 2)
      - (830 + r) * (1 - Math.cos(Math.PI / g.ringSegments));
    assert.ok(bound > 65, `${name}: complete flat triangles clear the tube, not only sampled vertices`);
  }
  // Edges close both thickness boundaries with no extra plane across the light aperture.
  for (const [i, phi] of structuralSpec.interpretation.windowPhiRadians.entries()) {
    const positions = c[`shieldWindowEdge${i}`].geometry.attributes.position;
    for (let j = 0; j < positions.count; j++) {
      const v = new THREE.Vector3().fromBufferAttribute(positions, j);
      close(Math.atan2(v.z, Math.hypot(v.x, v.y) - 830), phi > Math.PI ? phi - 2 * Math.PI : phi, 1e-5);
    }
  }
  a.dispose();
});

test('unapproved exterior triangles retain full tube clearance; approved interior portion is tested separately', t => {
  const a = make(); let minEnvelope = Infinity, minServices = Infinity, minShaft = Infinity, sampled = 0;
  for (const [name, mesh] of Object.entries(a.components)) for (const transform of transforms(mesh)) {
    for (const vertices of triangles(mesh, transform)) for (const p of sampleTriangle(...vertices)) {
      const distance = tubeDistance(p); sampled++;
      if (name === 'spokeTubes') {
        minShaft = Math.min(minShaft, distance);
        // Float32 positions and instance yaw introduce <0.1 mm roundoff.
        assert.ok(distance >= 65 - 1e-4, `${name} intrudes: ${distance}`);
        if (distance < 65.001) assert.ok(Math.hypot(p.x, p.y) > 764.9 && Math.abs(p.z) < 0.5, 'only the equatorial rim end may touch');
      } else {
        assert.ok(distance >= 65, `${name} intrudes: ${distance}`);
        if (/pressureShell|glazing|shield/.test(name)) minEnvelope = Math.min(minEnvelope, distance);
        else minServices = Math.min(minServices, distance);
      }
    }
  }
  t.diagnostic(JSON.stringify({ sampledTrianglePoints: sampled, minEnvelopeTubeDistance: minEnvelope, minServiceTubeDistance: minServices, minSpokeTubeDistance: minShaft }));
  a.dispose();
});

test('bulk spoke joints, collars and service lines have clearance at all six landings', () => {
  const a = make();
  for (const name of ['spokeCollars', 'spokeServicePipesAndCables', 'spokeTrussSegments']) {
    const mesh = a.components[name];
    for (const transform of transforms(mesh)) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(transform);
        assert.ok(tubeDistance(v) > 65.5, `${name}: services stop short of pressure boundary`);
        assert.ok(Math.hypot(v.x, v.y) < 764.5);
      }
    }
  }
  a.dispose();
});

test('hub and axial dimensions are correct; stationary objects remain fixed under rotor rotation', () => {
  const a = make(), c = a.components;
  const bounds = mesh => new THREE.Box3().setFromObject(mesh);
  close(bounds(c.hub).getSize(new THREE.Vector3()).x, 130);
  const docking = bounds(c.dockingTube); close(docking.min.z, 65); close(docking.max.z, 125);
  close(docking.getSize(new THREE.Vector3()).x, 15);
  const fab = bounds(c.fabricationSphere); close(fab.getSize(new THREE.Vector3()).x, 100);
  close(fab.getCenter(new THREE.Vector3()).z, -155); close(c.southAirlock.position.z, -220);
  assert.equal(c.hub.parent, a.groups.rotating);
  for (const name of ['dockingTube', 'fabricationSphere', 'southAirlock', 'northBearingStator', 'southBearingStator']) assert.equal(c[name].parent, a.groups.stationary);
  a.scene.updateMatrixWorld(true);
  const fixed = Object.values(c).filter(m => { let p = m; while (p) { if (p === a.groups.stationary) return true; p = p.parent; } return false; });
  const before = fixed.map(m => m.matrixWorld.clone());
  const moving = c.spokeTubes.matrixWorld.clone();
  a.rotatingGroup.rotation.z = 0.845; a.scene.updateMatrixWorld(true);
  fixed.forEach((m, i) => assert.deepEqual(m.matrixWorld.elements, before[i].elements));
  assert.notDeepEqual(c.spokeTubes.matrixWorld.elements, moving.elements);
  assert.ok(!Object.keys(c).some(name => /radiator|solar|mirror|chevron|extraction|transport/i.test(name)), 'other leaf ownership stays separate');
  a.dispose();
});

test('visibility controls only owned envelope/shield, not spokes, hub or existing objects', () => {
  const a = make(); const existing = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  a.rotatingGroup.add(existing);
  for (const visible of [true, false, true, false]) {
    a.setEnvelopeVisible(visible);
    assert.equal(a.groups.envelope.visible, visible); assert.equal(a.groups.shield.visible, visible);
    assert.equal(a.groups.spokes.visible, true); assert.equal(a.components.hub.visible, true); assert.equal(existing.visible, true);
  }
  a.dispose(); a.setEnvelopeVisible(true);
  assert.equal(existing.parent, a.rotatingGroup); existing.geometry.dispose(); existing.material.dispose();
});

test('owned resources dispose exactly once, with existing and second-instance resources untouched', () => {
  const scene = new THREE.Scene(), rotatingGroup = new THREE.Group(), stationaryGroup = new THREE.Group(); scene.add(rotatingGroup, stationaryGroup);
  const borrowedGeometry = new THREE.BoxGeometry(), borrowedMaterial = new THREE.MeshBasicMaterial();
  const existing = [new THREE.Mesh(borrowedGeometry, borrowedMaterial), new THREE.Mesh(borrowedGeometry, borrowedMaterial)];
  rotatingGroup.add(existing[0]); stationaryGroup.add(existing[1]);
  let borrowedDisposals = 0; for (const r of [borrowedGeometry, borrowedMaterial]) r.addEventListener('dispose', () => borrowedDisposals++);
  const a = createExteriorStructure({ rotatingGroup, stationaryGroup, world: fixture.world });
  const b = createExteriorStructure({ rotatingGroup, stationaryGroup, world: fixture.world });
  const interiorMeshes = []; a.groups.groundEntries.traverse(m => { if (m.isMesh) interiorMeshes.push(m); });
  const resources = new Set([...Object.values(a.components), ...interiorMeshes].flatMap(m => [m.geometry, m.material, ...(m.isInstancedMesh ? [m] : [])]));
  const counts = new Map([...resources].map(r => [r, 0]));
  for (const r of resources) r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  let otherDisposals = 0;
  for (const m of Object.values(b.components)) for (const r of [m.geometry, m.material]) r.addEventListener('dispose', () => otherDisposals++);
  a.dispose(); a.dispose();
  assert.equal(a.groups.rotating.parent, null); assert.equal(a.groups.stationary.parent, null);
  assert.equal(b.groups.rotating.parent, rotatingGroup); assert.equal(b.groups.stationary.parent, stationaryGroup);
  for (const n of counts.values()) assert.equal(n, 1);
  assert.equal(resources.size, a.stats.uniqueGeometries + a.stats.materials + Object.values(a.components).filter(m => m.isInstancedMesh).length);
  assert.equal(borrowedDisposals, 0); assert.equal(otherDisposals, 0);
  assert.equal(existing[0].parent, rotatingGroup); assert.equal(existing[1].parent, stationaryGroup);
  b.dispose(); borrowedGeometry.dispose(); borrowedMaterial.dispose();
});

test('actual expanded triangle counts and standard color-pass submissions stay within budgets', t => {
  const a = make(); let triangles = 0, calls = 0, instances = 0;
  for (const mesh of Object.values(a.components)) {
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1);
    if (mesh.isInstancedMesh) instances += mesh.count;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) calls += mat.side === THREE.DoubleSide && mat.transparent && !mat.forceSinglePass ? 2 : 1;
  }
  assert.equal(a.stats.triangles, triangles); assert.equal(a.stats.drawCalls, calls); assert.equal(a.stats.instances, instances);
  assert.equal(a.stats.components, Object.keys(a.components).length);
  assert.equal(a.stats.meshes, calls); assert.ok(triangles < 100000); assert.ok(calls < 80);
  t.diagnostic(JSON.stringify(a.stats)); a.dispose();
});

test('approved interior shafts have real solid proxies and speed-15 tangential ground portals', t => {
  const saved = JSON.parse(readFileSync(new URL('../world.json', import.meta.url)));
  const a = make(saved), colliders = new ColliderWorld(), results = [];
  assert.equal(a.interiorColliders.length, 6);
  assert.equal(Object.keys(a.components).length, 26); // Existing baseline has 26, not 27.
  assert.equal(CHARACTER.speed, 15);
  let proxyTriangles = 0;
  for (const [i, {id, object}] of a.interiorColliders.entries()) {
    assert.equal(id, `spoke-ground-${saved.masterPlan.districts[i].id}`);
    assert.equal(object.parent, a.groups.groundEntries);
    object.traverse(m => { if (m.isMesh) {
      assert.equal(m.userData.collisionMode, undefined);
      proxyTriangles += m.geometry.index.count / 3;
      for (const transform of transforms(m)) for (const tri of triangles(m, transform)) {
        for (const p of sampleTriangle(...tri)) {
          assert.ok(Math.hypot(p.x, p.y) >= 764.9 && Math.hypot(p.x, p.y) <= 830);
          assert.ok(Math.abs(p.z) <= 7.51);
        }
      }
    }});
    colliders.setObject(id, object, a.rotatingGroup);
  }
  // Exercise actual retained 24 m legacy platform geometry where its real
  // transformed top is on the central plain. Elevated/basin cases are diagnosed,
  // not silently moved or used as imaginary ground support.
  const platformHeights = [];
  for (const raw of saved.assets.filter(v => Array.isArray(v) && /^spoke-.*-platform$/.test(v[0]))) {
    const spec = raw[6], elevation = raw[7]?.height ?? spec.elevation ?? 0;
    const platform = createBlockout(spec); orientToSurface(platform, raw[2], raw[3], elevation);
    a.rotatingGroup.add(platform); platform.updateMatrixWorld(true);
    const top = 830 - Math.hypot(platform.children[0].getWorldPosition(new THREE.Vector3()).x, platform.children[0].getWorldPosition(new THREE.Vector3()).y) + spec.height / 2;
    platformHeights.push({id: raw[0], elevation, transformedTop: top});
    colliders.setObject(raw[0], platform, a.rotatingGroup);
  }
  for (const [i, {object}] of a.interiorColliders.entries()) {
    const angle = saved.masterPlan.districts[i].center;
    a.scene.updateMatrixWorld(true);
    const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const mouthRay = new THREE.Raycaster(direction.clone().multiplyScalar(100), direction.clone().negate(), 0, 90);
    assert.equal(mouthRay.intersectObjects([a.components.hub, a.components.hubSurfaceBands]).length, 0, 'hub pressure mouth is physically open');
    const legacy = platformHeights.find(p => p.id === `spoke-${saved.masterPlan.districts[i].id}-platform`);
    const floor = legacy.elevation === 0 ? .6 : .31;
    for (const sign of [-1, 1]) {
      const c = new CharacterController(colliders);
      const start = angle - sign * 10 / 830;
      c.teleport(new THREE.Vector3((830-floor-.01)*Math.cos(start),(830-floor-.01)*Math.sin(start),0));
      for (let n=0;n<60;n++) c.tick(new THREE.Vector3());
      for (let n=0;n<160;n++) {
        const theta = Math.atan2(c.position.y,c.position.x);
        c.tick(new THREE.Vector3(-Math.sin(theta)*sign,Math.cos(theta)*sign,0));
      }
      for (let n=0;n<60;n++) c.tick(new THREE.Vector3());
      const offset = Math.atan2(Math.sin(Math.atan2(c.position.y,c.position.x)-angle),Math.cos(Math.atan2(c.position.y,c.position.x)-angle))*830;
      assert.ok(sign*offset>9, `${object.name} blocked: ${offset}`);
      assert.ok(sign*offset<11, 'actual speed / displacement');
      assert.ok(c.grounded && c.clear(), object.name+' floor / capsule');
      const height = 830-Math.hypot(c.position.x,c.position.y);
      close(height,floor,.08);
      results.push({id:object.name,sign,offset,height});
    }
  }
  assert.equal(proxyTriangles,a.stats.interiorTriangles);
  assert.equal(results.length,12);
  assert.ok(a.stats.fullTriangles < 100000);
  t.diagnostic(JSON.stringify({proxyTriangles,fullTriangles:a.stats.fullTriangles,fullDrawCalls:a.stats.fullDrawCalls,platformHeights,routes:results,limitations:['Basin R878 platform and elevated farm platform are preserved, not ground-level anchors; no elevator connects these elevations.','Dense-world housing/tree apron validation remains parent integration.']}));
  a.dispose();
});

test('invalid frames and malformed placement inputs fail before changing parent children', () => {
  const r = new THREE.Group(), s = new THREE.Group();
  for (const args of [{}, { rotatingGroup: r, stationaryGroup: r }, { rotatingGroup: {}, stationaryGroup: s }, { rotatingGroup: r, stationaryGroup: s, world: { masterPlan: { districts: [] } } }, { rotatingGroup: r, stationaryGroup: s, world: { masterPlan: { districts: Array(6).fill({ center: NaN }) } } }]) {
    assert.throws(() => createExteriorStructure(args), TypeError); assert.equal(r.children.length, 0); assert.equal(s.children.length, 0);
  }
  r.add(s); assert.throws(() => createExteriorStructure({ rotatingGroup: r, stationaryGroup: s }), /ancestors/); r.remove(s);
  s.add(r); assert.throws(() => createExteriorStructure({ rotatingGroup: r, stationaryGroup: s }), /ancestors/); s.remove(r);
  const a = make(null);
  for (let i = 0; i < 6; i++) close(a.stats.spokeAngles[i], fixture.world.masterPlan.districts[i].center, 1e-12);
  a.dispose();
});
