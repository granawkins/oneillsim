import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createExteriorEnergy, energySpec, reflectDirection } from '../src/exterior-energy.js';
import { districts } from '../src/settlement-plan.js';

const TAU = Math.PI * 2;
const freeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
const fixture = (offset = 0) => freeze({ masterPlan: { districts: districts.map(d => ({ ...d, center: d.center + offset })) }, assets: [{ id: 'untouched-placement', worldTransform: { position: [1, 2, 3] } }] });
function build(world = fixture()) {
  const rotatingGroup = new THREE.Group(), stationaryGroup = new THREE.Group();
  const scene = new THREE.Scene(); scene.add(rotatingGroup, stationaryGroup);
  const energy = createExteriorEnergy({ rotatingGroup, stationaryGroup, world });
  scene.updateMatrixWorld(true);
  return { energy, scene, rotatingGroup, stationaryGroup };
}
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} ± ${tolerance}`);
const vectorClose = (a, b, tolerance = 1e-5) => a.forEach((v, i) => close(v, b[i], tolerance));
const tubeDistance = p => Math.hypot(Math.hypot(p.x, p.y) - 830, p.z);
function matrices(object) {
  if (!object.isInstancedMesh) return [object.matrixWorld];
  return Array.from({ length: object.count }, (_, i) => {
    const local = new THREE.Matrix4(); object.getMatrixAt(i, local);
    return new THREE.Matrix4().multiplyMatrices(object.matrixWorld, local);
  });
}
function triangles(object, callback) {
  const geometry = object.geometry, position = geometry.attributes.position;
  for (const matrix of matrices(object)) {
    const length = geometry.index?.count ?? position.count;
    for (let i = 0; i < length; i += 3) {
      const points = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, geometry.index ? geometry.index.getX(i + k) : i + k).applyMatrix4(matrix));
      callback(points, matrix);
    }
  }
}
function samples(points) {
  const [a, b, c] = points;
  return [a, b, c, a.clone().add(b).multiplyScalar(.5), b.clone().add(c).multiplyScalar(.5), c.clone().add(a).multiplyScalar(.5), a.clone().add(b).add(c).multiplyScalar(1 / 3)];
}
function actualNormal(mesh, index) {
  const local = new THREE.Matrix4(); mesh.getMatrixAt(index, local);
  const matrix = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, local);
  return new THREE.Vector3(0, 0, 1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize().toArray();
}

test('saved world centers define six actual between-spoke sectors, not zero-origin bins', () => {
  for (const world of [fixture(), fixture(.213), freeze({ masterPlan: { districts: [...fixture().masterPlan.districts].reverse() } })]) {
    const before = JSON.stringify(world), { energy } = build(world);
    const axes = world.masterPlan.districts.map(d => ((d.center % TAU) + TAU) % TAU).sort((a, b) => a - b);
    assert.equal(energy.components.solar.sectors.length, 6);
    for (const [i, sector] of energy.components.solar.sectors.entries()) {
      const [start, end] = sector.spokeAngles;
      close(start, axes[i], 1e-12); close(end, axes[(i + 1) % 6] + (i === 5 ? TAU : 0), 1e-12);
      close(sector.theta, (start + end) / 2, 1e-12);
      assert.ok(sector.panelCount > 0);
      triangles(sector.mesh, points => {
        for (const p of samples(points)) {
          const r = Math.hypot(p.x, p.y), theta = start + ((Math.atan2(p.y, p.x) - start + TAU) % TAU);
          assert.ok(r >= 115 - .01 && r <= 590 + .01);
          assert.ok(theta >= start && theta <= end);
          close(p.z, 95);
          for (const axis of axes) assert.ok(Math.abs(p.x * Math.sin(axis) - p.y * Math.cos(axis)) >= 10 - .01, 'actual spoke projection clearance');
        }
      });
    }
    assert.equal(JSON.stringify(world), before, 'frozen world and all placement metadata unchanged');
    energy.dispose();
  }
});

test('invalid frames/centers fail before allocating or attaching; absent world has aligned fallback', () => {
  const rotatingGroup = new THREE.Group(), stationaryGroup = new THREE.Group();
  assert.throws(() => createExteriorEnergy({ rotatingGroup, stationaryGroup: rotatingGroup }), /Distinct/);
  for (const centers of [[], Array(6).fill({ center: NaN }), Array(6).fill({ center: 1 })]) {
    assert.throws(() => createExteriorEnergy({ rotatingGroup, stationaryGroup, world: { masterPlan: { districts: centers } } }), /centers|axes/);
    assert.equal(rotatingGroup.children.length, 0); assert.equal(stationaryGroup.children.length, 0);
  }
  const energy = createExteriorEnergy({ rotatingGroup, stationaryGroup });
  energy.components.solar.sectors.forEach((s, i) => close(s.spokeAngles[0], districts[i].center, 1e-12));
  energy.dispose();
});

test('actual PV front normals remain north +Z under rotating habitat frame', () => {
  const { energy, scene, rotatingGroup } = build();
  rotatingGroup.rotation.z = .93; scene.updateMatrixWorld(true);
  let actualArea = 0;
  for (const sector of energy.components.solar.sectors) {
    triangles(sector.mesh, ([a, b, c]) => { actualArea += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; });
    matrices(sector.mesh).forEach((matrix, i) => {
      vectorClose(actualNormal(sector.mesh, i), [0, 0, 1]);
      const normal = new THREE.Vector3().fromBufferAttribute(sector.mesh.geometry.attributes.normal, 0).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
      vectorClose(normal.toArray(), [0, 0, 1]);
    });
  }
  // Instanced matrices are float32: allow a few cm² over the full field.
  close(actualArea, energy.components.solar.projectedPanelAreaM2, .1);
  energy.dispose();
});

test('two segmented banks: rendered normals, unobstructed main chain, first actual chevron entry', () => {
  const {energy}=build(), {secondary,mainMirror,chevrons,solar}=energy.components;
  assert.equal(secondary.panels.length,192);
  assert.ok(solar.projectedPanelAreaM2>850000);
  const geometry=secondary.mesh.geometry.attributes.position;
  secondary.panels.forEach((p,i)=>{
    const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(geometry,i*6+k));
    const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    vectorClose(normal.toArray(),p.normal,2e-5);
    vectorClose(reflectDirection([0,0,-1],normal.toArray()),p.outgoing,3e-5);
    const center=new THREE.Vector3(...p.center),out=new THREE.Vector3(...p.outgoing);
    const mainHit=new THREE.Raycaster(center,new THREE.Vector3(0,0,1)).intersectObject(mainMirror.mesh)[0];
    assert.ok(mainHit,'projected main mirror covers facet');
    const incident=new THREE.Raycaster(mainHit.point.clone().add(new THREE.Vector3(0,0,-.01)),new THREE.Vector3(0,0,-1));
    const intercept=incident.intersectObjects([secondary.mesh,...solar.sectors.map(s=>s.mesh)],false)[0];
    assert.equal(intercept.object,secondary.mesh,'PV and upper bank do not intercept lower bank center rays');
    assert.ok(intercept.point.distanceTo(center)<.01);
    const ray=new THREE.Raycaster(center.clone().addScaledVector(out,.01),out);
    const hit=ray.intersectObject(chevrons.mesh)[0];
    assert.ok(hit,'actual folded shield hit');
    assert.ok(hit.point.z*p.bank>0,'correct upper/lower window');
    const phi=Math.atan2(hit.point.z,Math.hypot(hit.point.x,hit.point.y)-830);
    assert.ok(Math.abs(phi)>=2*Math.PI/3 && Math.abs(phi)<=Math.PI,'inner 120-degree glazing span');
    assert.ok(Math.abs(hit.point.z)>45 && Math.abs(hit.point.z)<65,'window height, not equatorial floor');
    assert.ok(tubeDistance(hit.point)>66.5,'not inside habitat floor');
    assert.ok(hit.point.distanceTo(new THREE.Vector3(...p.target))<1.0,'first chevron is assigned roof fold');
    for(let f=0;f<1;f+=.05)assert.ok(tubeDistance(center.clone().lerp(hit.point,f))>65);
  });
  energy.dispose();
});

test('main nominal tangent reflects -X to -Z; physical annulus preserves dock clearance without claiming collimation', () => {
  const { energy } = build(), main = energy.components.mainMirror;
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(main.group.matrixWorld).toArray();
  vectorClose(normal, [-Math.SQRT1_2, 0, Math.SQRT1_2]);
  vectorClose(reflectDirection([-1, 0, 0], normal), [0, 0, -1]);
  vectorClose(main.group.position.toArray(), [0, 0, 1500]);
  let minimumProjection = Infinity, minimumZ = Infinity, variedNormal = false;
  triangles(main.mesh, points => {
    for (const p of samples(points)) {
      minimumProjection = Math.min(minimumProjection, Math.hypot(p.x, p.y)); minimumZ = Math.min(minimumZ, p.z);
    }
    const faceNormal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    if (faceNormal.distanceTo(new THREE.Vector3(...normal)) > .001) variedNormal = true;
  });
  main.group.traverse(o => {
    if (!o.isLineSegments) return;
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i += 2) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(position, i + 1).applyMatrix4(o.matrixWorld);
      for (const p of [a, b, a.clone().add(b).multiplyScalar(.5)]) {
        minimumProjection = Math.min(minimumProjection, Math.hypot(p.x, p.y));
        minimumZ = Math.min(minimumZ, p.z);
      }
    }
  });
  assert.ok(minimumProjection >= 110 - .01, 'entire mirror including backing preserves 110 m projected hole to 1 cm');
  assert.ok(minimumZ > 125, 'entire mirror north of docking z=65..125');
  assert.equal(variedNormal,false); assert.equal(main.rayTraced, false);
  assert.equal(energySpec.interpretation.mainMirror.sagM, 0);
  assert.equal(energySpec.interpretation.mainMirror.sourceDimensionsPrescribed, false);
  energy.dispose();
});

test('radiator actual triangles total exactly 940000 square metres, XZ bounds and edge-on Sun', () => {
  const { energy } = build(), radiator = energy.components.radiator;
  let area = 0; const box = new THREE.Box3();
  triangles(radiator.mesh, ([a, b, c]) => {
    area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    [a, b, c].forEach(p => { box.expandByPoint(p); close(p.y, energySpec.interpretation.radiator.yM, 1e-8); });
  });
  close(area, 940000, .1); vectorClose(box.min.toArray(), [-895, energySpec.interpretation.radiator.yM, -155-940000/1790], .001); vectorClose(box.max.toArray(), [895, energySpec.interpretation.radiator.yM, -155], .001);
  vectorClose(actualNormal(radiator.mesh, 0), [0, 1, 0]);
  close(new THREE.Vector3(...actualNormal(radiator.mesh, 0)).dot(new THREE.Vector3(-1, 0, 0)), 0);
  assert.equal(radiator.bays.length, 1);
  assert.equal(energySpec.facts.radiator.thermalPeakAreaM2, 940000);
  assert.deepEqual(energySpec.facts.radiator.printedPages, [89, 103]);
  assert.match(radiator.sourceUncertainty, /unresolved/);
  energy.dispose();
});

test('full rendered geometry is finite and outside 65 m habitat tube; chevron triangle interiors clear 66.5 m shield boundary', () => {
  const { energy } = build();
  let minimumChevron = Infinity, minimumTube = Infinity;
  for (const root of [energy.groups.rotating, energy.groups.stationary]) root.traverse(o => {
    if (!o.geometry) return;
    assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite), o.name);
    if (o.geometry.attributes.normal) assert.ok([...o.geometry.attributes.normal.array].every(Number.isFinite), `${o.name} normals`);
    if (o.isMesh) triangles(o, points => samples(points).forEach(p => {
      assert.ok(p.toArray().every(Number.isFinite));
      const distance = tubeDistance(p); minimumTube = Math.min(minimumTube, distance);
      assert.ok(distance >= 65 - .01, `${o.name} tube clearance ${distance}`);
      if (o === energy.components.chevrons.mesh) {
        minimumChevron = Math.min(minimumChevron, distance);
        assert.ok(distance >= 66.5 - .01, `chevron shield gap ${distance}`);
        const phi = Math.atan2(p.z, Math.hypot(p.x, p.y) - 830);
        assert.ok(Math.abs(phi) >= 2 * Math.PI / 3 - .01, 'partial inner window span only');
      }
    }));
    else for (const matrix of matrices(o)) for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(o.geometry.attributes.position, i).applyMatrix4(matrix);
      assert.ok(tubeDistance(p) >= 65 - .01, `${o.name} line vertex clearance`);
    }
    assert.equal(o.userData.collisionMode, 'none'); assert.equal(o.castShadow, false);
  });
  console.log(JSON.stringify({ minimumChevronMinorRadiusM: minimumChevron, minimumMeshTubeDistanceM: minimumTube, ...energy.stats }));
  assert.ok(energy.stats.triangles <= 150000, 'bounded geometry inventory');
  assert.ok(energy.stats.drawCalls <= 50, 'inventory only, not GPU measurement');
  energy.dispose();
});

test('stationary optics/heat systems stay fixed as habitat rotates; furnace capacity is not PV output', () => {
  const { energy, scene, rotatingGroup } = build();
  const stationary = ['mainMirror', 'radiator', 'furnace', 'chevrons'];
  const before = stationary.map(k => energy.groups[k].matrixWorld.toArray());
  const solarBefore = energy.groups.solar.matrixWorld.toArray();
  rotatingGroup.rotation.z = 1.234; scene.updateMatrixWorld(true);
  stationary.forEach((k, i) => assert.deepEqual(energy.groups[k].matrixWorld.toArray(), before[i]));
  assert.notDeepEqual(energy.groups.solar.matrixWorld.toArray(), solarBefore);
  vectorClose(energy.groups.furnace.position.toArray(), [-150, 0, -155]);
  assert.equal(energy.components.furnace.documentedCapacityMW, 200);
  assert.equal(energy.components.furnace.operational, false);
  assert.equal(energy.components.furnace.photovoltaicOutputMW, null);
  assert.equal(energy.components.solar.powerRating, null);
  assert.equal(energySpec.facts.shield.gapM, 1.5); assert.equal(energySpec.facts.shield.thicknessM, 1.7);
  assert.deepEqual(energySpec.interpretation.sourceFigures.figures, ['5-1', '5-2']);
  assert.equal(energySpec.interpretation.sourceFigures.pdfPage, 105);
  energy.dispose();
});

test('local reflective Mylar owns its 64px environment; radiator has no wire grid', () => {
  const {energy,scene}=build();
  assert.equal(scene.environment,null);
  const material=energy.components.mainMirror.mesh.material;
  assert.ok(material.isMeshBasicMaterial);
  assert.ok(material.envMap.isCubeTexture);
  assert.equal(material.envMap.images.length,6);
  for(const face of material.envMap.images) {
    assert.equal(face.image.width,64); assert.equal(face.image.height,64);
    assert.ok(new Set(face.image.data).size>40,'reflection is not flat grey');
  }
  assert.equal(energy.groups.mainMirror.children.filter(o=>o.isLineSegments).length,1);
  assert.equal(energy.groups.radiator.children.some(o=>o.isLineSegments),false);
  assert.equal(energy.components.radiator.mesh.material.color.getHex(),0x050607);
  const textures=[material.envMap,...material.envMap.images];
  const disposed=textures.map(()=>0);
  textures.forEach((t,i)=>t.addEventListener('dispose',()=>disposed[i]++));
  energy.dispose(); energy.dispose();
  assert.deepEqual(disposed,textures.map(()=>1));
});

test('toggle, exclusive resource disposal and detach are idempotent and leave caller/world intact', () => {
  const world = fixture(), before = JSON.stringify(world), { energy, rotatingGroup, stationaryGroup } = build(world);
  const foreignGeometry = new THREE.BoxGeometry(), foreignMaterial = new THREE.MeshBasicMaterial(), foreign = new THREE.Mesh(foreignGeometry, foreignMaterial);
  rotatingGroup.add(foreign);
  let foreignDisposals = 0; foreignGeometry.addEventListener('dispose', () => foreignDisposals++); foreignMaterial.addEventListener('dispose', () => foreignDisposals++);
  const counts = new Map();
  for (const root of [energy.groups.rotating, energy.groups.stationary]) root.traverse(o => {
    for (const resource of [o.geometry, o.material, o.isInstancedMesh ? o : null].flat().filter(Boolean)) if (!counts.has(resource)) {
      counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
    }
  });
  assert.equal(energy.groups.chevrons.visible, false);
  energy.setEnvelopeVisible(true); assert.equal(energy.groups.chevrons.visible, true);
  energy.setEnvelopeVisible(false); assert.equal(energy.groups.chevrons.visible, false);
  assert.equal(energy.groups.mainMirror.visible, true);
  energy.dispose(); energy.dispose();
  for (const count of counts.values()) assert.equal(count, 1);
  assert.equal(energy.groups.rotating.parent, null); assert.equal(energy.groups.stationary.parent, null);
  assert.deepEqual(rotatingGroup.children, [foreign]); assert.equal(stationaryGroup.children.length, 0);
  assert.equal(foreignDisposals, 0); assert.equal(JSON.stringify(world), before);
  foreignGeometry.dispose(); foreignMaterial.dispose();
});
