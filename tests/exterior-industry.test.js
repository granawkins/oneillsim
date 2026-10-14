import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createExteriorIndustry, industrySpec } from '../src/exterior-industry.js';

const WORLD_SHA = '30fa3a8784133571c948aa44425db43087197c18033d095d3b706675be83b3fb';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
// Immutable authored fixture, independent of mutable saved layout.
const fixture = freeze({ assets: [['immutable-sentinel', 'NeverChange', 1, 2, 3, 4, { arbitrary: true }]], masterPlan: { districts: [{ center: 1 }] } });
function make(world = fixture) {
  const scene = new THREE.Scene(), rotatingGroup = new THREE.Group(), stationaryGroup = new THREE.Group();
  scene.add(rotatingGroup, stationaryGroup);
  return { scene, rotatingGroup, stationaryGroup, ...createExteriorIndustry({ rotatingGroup, stationaryGroup, world }) };
}
const close = (a, b, epsilon = 0.002) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const box = m => new THREE.Box3().setFromObject(m);
function rays(objects, origin, direction, far = Infinity) {
  objects.forEach(o => o.updateWorldMatrix(true, true));
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far).intersectObjects(objects, true);
}

test('source facts and immutable interpretation distinguish location, length, capacity and authored geometry', () => {
  assert.equal(industrySpec.sourceFacts.printedPage, 103);
  assert.equal(industrySpec.sourceFacts.segments.length, 5);
  assert.equal(industrySpec.sourceFacts.electricCapacityMW, 200);
  assert.equal(industrySpec.sourceFacts.facilityDistanceFromHubMetres, 10000);
  assert.equal(industrySpec.interpretation.tubeLengthMetres, 9770);
  assert.deepEqual(industrySpec.sourceFacts.transport.pressurizedTube, ['people', 'small items']);
  assert.match(industrySpec.sourceFacts.purpose, /pollution.*accidents/);
  assert.match(industrySpec.interpretation.capacityNote, /not.*output/);
  assert.throws(() => { industrySpec.interpretation.tubeZ[0] = 0; }, TypeError);
});

test('stationary-only namespaced ownership, immutable fixture and invalid-parent guard', () => {
  const before = JSON.stringify(fixture), a = make();
  assert.equal(a.rotatingGroup.children.length, 0);
  assert.equal(a.groups.stationary.parent, a.stationaryGroup);
  assert.deepEqual(a.groups.plant.position.toArray(), [0, 0, -10000]);
  a.groups.stationary.traverse(o => { assert.match(o.name, /^exterior-industry:/); assert.equal(o.userData.runtimeOnly, true); assert.equal(o.userData.collision, false); assert.equal(o.userData.assetId, undefined); });
  assert.equal(JSON.stringify(fixture), before);
  assert.throws(() => createExteriorIndustry(), /stationaryGroup/);
  assert.throws(() => createExteriorIndustry({ stationaryGroup: a.stationaryGroup, rotatingGroup: a.stationaryGroup }), /stationaryGroup/);
  a.dispose();
});

test('actual metre bounds and finite matrices of all junctions, instances and geometry', () => {
  const a = make(), c = a.components;
  const tube = box(c.pressurizedTransportTube), adapter = box(c.airlockAdapter);
  close(tube.min.z, -10000); close(tube.max.z, -230); close(tube.max.z - tube.min.z, 9770);
  close(tube.max.x - tube.min.x, 6); close(adapter.max.z, -220); close(adapter.min.z, tube.max.z);
  close(adapter.max.x, 7.5); close(adapter.min.x, -7.5);
  for (const m of Object.values(c)) {
    const b = box(m); assert.ok(!b.isEmpty()); assert.ok([...b.min.toArray(), ...b.max.toArray(), ...m.matrixWorld.elements].every(Number.isFinite));
    for (const attr of Object.values(m.geometry.attributes)) assert.ok([...attr.array].every(Number.isFinite));
    if (m.isInstancedMesh) assert.ok([...m.instanceMatrix.array].every(Number.isFinite));
  }
  const arrival = c.arrivalMaintenanceSphere, v = arrival.geometry.attributes.position;
  let north = -Infinity, bore = Infinity;
  for (let i = 0; i < v.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(v, i).applyMatrix4(arrival.matrixWorld);
    if (p.z > north + 0.002) { north = p.z; bore = Math.hypot(p.x, p.y); }
  }
  close(north, -10000); close(bore, 2.7);
  a.dispose();
});

test('hollow tube and adapter ends have clear bores, outward/inward normals and correct winding', () => {
  const a = make();
  for (const key of ['airlockAdapter', 'pressurizedTransportTube']) {
    const m = a.components[key], b = box(m);
    assert.equal(rays([m], [0, 0, b.max.z + 1], [0, 0, -1]).length, 0);
    assert.equal(rays([m], [0, 0, b.min.z - 1], [0, 0, 1]).length, 0);
    const p = m.geometry.attributes.position, n = m.geometry.attributes.normal, idx = m.geometry.index;
    for (let i = 0; i < idx.count; i += 3) {
      const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, idx.getX(i + j)));
      const cross = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      const normal = new THREE.Vector3().fromBufferAttribute(n, idx.getX(i));
      assert.ok(cross.dot(normal) > 0.9, `${key} reversed face ${i / 3}`);
    }
    close(n.getX(0), Math.abs(n.getX(0)));
    assert.ok(n.getX(50) < 0, 'inner wall normals face the bore');
  }
  const tube = a.components.pressurizedTransportTube;
  assert.ok(rays([tube], [0, 0, -500], [1, 0, 0], 5).length > 0, 'inner wall ray hits front-facing inner surface');
  assert.ok(rays([tube], [5, 0, -500], [-1, 0, 0], 5).length > 0, 'outer wall ray hits front-facing exterior');
  a.dispose();
});

test('tube bore remains unobstructed by collars/truss and arrival aperture remains open', () => {
  const a = make();
  for (const x of [-1.8, 0, 1.8]) assert.equal(rays([a.groups.transport], [x, 0, -231], [0, 0, -1], 9768).length, 0);
  const hit = rays([a.components.arrivalMaintenanceSphere], [0.2, 0.1, -9999], [0, 0, -1]);
  assert.ok(hit.length > 0); assert.ok(hit[0].point.z < -10010, 'arrival north entry is not a solid sphere cap');
  // All industry geometry is south of the torus tube (whose z extent is ±65).
  const bounds = box(a.groups.stationary); assert.ok(bounds.max.z < -65);
  const protectedTransport = box(a.groups.transport);
  assert.ok(protectedTransport.max.x < 10 && protectedTransport.min.x > -10);
  assert.ok(protectedTransport.max.x < 150, 'no intersection with the x=150..850 radiator');
  a.dispose();
});

test('north-facing deep-blue solar station, furnace dishes, spheres and static cargo tugs are real meshes', () => {
  const a = make(), c = a.components;
  assert.equal(c.solarElectricPanels.material.color.getHex(), 0x08264d);
  assert.equal(c.solarElectricPanels.count, 6); assert.equal(c.solarElectricPanels.userData.facing, '+Z');
  assert.equal(c.cargoTugBodies.count, 4);
  assert.equal(c.solarFurnaceConcentrators.count, 2);
  assert.equal(c.oxygenTanks.count, 4); assert.equal(c.feedHoppers.count, 4);
  const normal = c.solarFurnaceConcentrators.geometry.attributes.normal;
  assert.ok(normal.getZ(10) > 0.5);
  assert.equal(c.maintenanceSphereWest.geometry.parameters.radius, 6);
  assert.equal(c.maintenanceSphereEast.geometry.parameters.radius, 10);
  const before = c.pressurizedTransportTube.matrixWorld.clone();
  a.rotatingGroup.rotation.z = 1.5; a.scene.updateMatrixWorld(true);
  assert.deepEqual(c.pressurizedTransportTube.matrixWorld.elements, before.elements);
  a.dispose();
});

test('instanced geometry counts satisfy 20k triangle / 30 draw-call budget', () => {
  const a = make(); let tris = 0, calls = 0;
  a.groups.stationary.traverse(o => { if (o.isMesh) { calls++; tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
  assert.equal(tris, a.stats.triangles); assert.equal(calls, a.stats.drawCalls);
  assert.ok(tris <= 20000, `${tris} triangles`); assert.ok(calls <= 30, `${calls} calls`);
  console.log('exterior-industry measured geometry:', JSON.stringify(a.stats));
  a.dispose();
});

test('visibility and idempotent disposal free only owned resources, including instance buffers', () => {
  const a = make(), borrowed = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  a.stationaryGroup.add(borrowed); let borrowedDisposals = 0;
  borrowed.geometry.addEventListener('dispose', () => borrowedDisposals++); borrowed.material.addEventListener('dispose', () => borrowedDisposals++);
  const geometries = new Set(), materials = new Set(), instances = [];
  for (const m of Object.values(a.components)) { geometries.add(m.geometry); materials.add(m.material); if (m.isInstancedMesh) instances.push(m); }
  let g = 0, m = 0, i = 0;
  geometries.forEach(v => v.addEventListener('dispose', () => g++)); materials.forEach(v => v.addEventListener('dispose', () => m++)); instances.forEach(v => v.addEventListener('dispose', () => i++));
  assert.equal(a.groups.stationary.visible, false); a.setEnvelopeVisible(true); assert.equal(a.groups.stationary.visible, true);
  a.setEnvelopeVisible(false); assert.equal(borrowed.visible, true);
  a.dispose(); a.dispose(); a.setEnvelopeVisible(true);
  assert.equal(a.groups.stationary.parent, null); assert.equal(a.stationaryGroup.children[0], borrowed);
  assert.equal(g, geometries.size); assert.equal(m, materials.size); assert.equal(i, instances.length); assert.equal(borrowedDisposals, 0);
  borrowed.geometry.dispose(); borrowed.material.dispose();
});

test('independent assemblies never share or dispose each other resources', () => {
  const a = make(), b = make();
  assert.notEqual(a.components.pressurizedTransportTube.geometry, b.components.pressurizedTransportTube.geometry);
  let disposals = 0; b.components.pressurizedTransportTube.geometry.addEventListener('dispose', () => disposals++);
  a.dispose(); assert.equal(disposals, 0); assert.equal(b.groups.stationary.parent, b.stationaryGroup); b.dispose(); assert.equal(disposals, 1);
});

test('entire live world stays byte-identical: frozen 1573-record input is never edited', () => {
  const url = new URL('../world.json', import.meta.url), before = readFileSync(url);
  assert.equal(createHash('sha256').update(before).digest('hex'), WORLD_SHA);
  const world = freeze(JSON.parse(before)); assert.equal(world.assets.length, 1573);
  const a = make(world); a.setEnvelopeVisible(true); a.setEnvelopeVisible(false); a.dispose();
  assert.deepEqual(readFileSync(url), before);
  assert.equal(JSON.stringify(world), JSON.stringify(JSON.parse(before)));
});
