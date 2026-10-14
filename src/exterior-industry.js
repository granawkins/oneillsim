import * as THREE from 'three';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/** Dimensions in metres. Source capacity is a design statement, NOT simulated output. */
export const industrySpec = freeze({
  units: 'metres', ringPlane: 'XY', axis: 'Z', runtimeOnly: true,
  sourceFacts: {
    report: 'NASA SP-413', printedPage: 103, pdfPage: 120,
    segments: ['sp413-s02464', 'sp413-s02465', 'sp413-s02466', 'sp413-s02467', 'sp413-s02468'],
    facilityDistanceFromHubMetres: 10000, direction: 'south',
    purpose: 'Separate heavy-industry pollution and possible industrial accidents from the habitat.',
    operation: 'Remote operation in exposed vacuum; attached small pressurized maintenance spheres.',
    electricCapacityMW: 200, electricEnergySource: 'solar', solarFurnaces: true,
    transport: { pressurizedTube: ['people', 'small items'], tugs: ['aluminum ingots', 'oxygen gas', 'plate glass', 'expanded soil', 'shielding material'] },
    tubeConcern: 'The narrative reports structural problems near the remote end.',
  },
  interpretation: {
    hubCenter: [0, 0, 0], fabricationCenter: [0, 0, -155], fabricationDiameter: 100,
    airlockJunction: [0, 0, -220], adapterZ: [-220, -230], adapterRadii: [7.5, 3],
    tubeZ: [-230, -10000], tubeLengthMetres: 9770, tubeOuterDiameter: 6, tubeWallThickness: 0.3,
    plantCenter: [0, 0, -10000], plantCoreFootprint: [180, 80], maintenanceRadii: [8, 6, 10],
    solarFacing: '+Z (north)', solarColor: 'deep blue', metalColor: 'grey',
    sourceDimensions: 'Only the approximate 10 km hub-to-facility distance and 200 MW capacity are sourced here. Tube bore, adapter, plant footprint, sphere radii, solar area, hardware shapes and colors are authored.',
    capacityNote: 'Panels symbolize the plant solar-electric station, not a photovoltaic area/output calculation or proof of 200 MW.',
    omissions: ['no pressure or thermal physics', 'no operating extraction process', 'no dynamic tug flights', 'no colliders or editor placements', 'no reconstructed engineering solution to the source tube structural concern'],
  },
});

// Closed wall cross-section, open bore at BOTH ends. Separate normals at rims.
function hollowTube(r0, r1, length, wall = 0.3, sides = 24) {
  const p = [], n = [], indices = [];
  const surface = (ra, rb, za, zb, inward = false) => {
    const base = p.length / 3;
    const slope = (ra - rb) / (zb - za);
    for (const [r, z] of [[ra, za], [rb, zb]]) for (let i = 0; i <= sides; i++) {
      const a = i * Math.PI * 2 / sides, c = Math.cos(a), s = Math.sin(a);
      p.push(r * c, r * s, z);
      const v = new THREE.Vector3(c, s, slope).normalize().multiplyScalar(inward ? -1 : 1);
      n.push(v.x, v.y, v.z);
    }
    for (let i = 0; i < sides; i++) {
      const a = base + i, b = a + sides + 1;
      const t = [a, b, a + 1, b, b + 1, a + 1];
      if (inward) for (let j = 0; j < 6; j += 3) [t[j + 1], t[j + 2]] = [t[j + 2], t[j + 1]];
      indices.push(...t);
    }
  };
  surface(r0, r1, 0, -length); surface(r0 - wall, r1 - wall, 0, -length, true);
  for (const [r, z, sign] of [[r0, 0, 1], [r1, -length, -1]]) {
    const base = p.length / 3;
    for (const radius of [r - wall, r]) for (let i = 0; i <= sides; i++) {
      const a = i * Math.PI * 2 / sides; p.push(radius * Math.cos(a), radius * Math.sin(a), z); n.push(0, 0, sign);
    }
    for (let i = 0; i < sides; i++) {
      const a = base + i, b = a + sides + 1;
      const t = [a, b, a + 1, b, b + 1, a + 1];
      if (sign < 0) for (let j = 0; j < 6; j += 3) [t[j + 1], t[j + 2]] = [t[j + 2], t[j + 1]];
      indices.push(...t);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setIndex(indices);
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

/** Additive stationary runtime geometry; never reads or changes saved world records. */
export function createExteriorIndustry({ rotatingGroup, stationaryGroup, world } = {}) {
  // rotatingGroup/world intentionally unused: not borrowed, mutated, or disposed.
  if (!stationaryGroup?.isObject3D || stationaryGroup === rotatingGroup) throw new TypeError('An independent stationaryGroup Object3D is required');
  const groups = {}, components = {}, geometries = new Set(), materials = new Set();
  const group = (key, parent) => {
    const g = new THREE.Group(); g.name = `exterior-industry:${key}`;
    g.userData = { runtimeOnly: true, exteriorIndustry: true, collision: false, frame: 'stationary' };
    groups[key] = g; parent.add(g); return g;
  };
  const root = group('stationary', stationaryGroup), transport = group('transport', root), plant = group('plant', root), tugs = group('tugs', root);
  plant.position.set(0, 0, -10000);
  const mat = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const metal = mat({ color: 0xaab2ba, metalness: 0.8, roughness: 0.38 });
  const maintenanceMetal = mat({ color: 0xaab2ba, metalness: 0.8, roughness: 0.38, side: THREE.DoubleSide });
  const frame = mat({ color: 0x4d5963, metalness: 0.75, roughness: 0.5 });
  const solar = mat({ color: 0x08264d, metalness: 0.3, roughness: 0.48 });
  const mirror = mat({ color: 0xc6d6de, metalness: 0.95, roughness: 0.16, side: THREE.DoubleSide });
  const ceramic = mat({ color: 0x5c6267, metalness: 0.2, roughness: 0.85 });
  const track = g => { geometries.add(g); return g; };
  const mesh = (key, geometry, material, parent, position = [0, 0, 0]) => {
    const m = new THREE.Mesh(track(geometry), material); m.position.fromArray(position);
    m.name = `exterior-industry:${key}`; m.userData = { runtimeOnly: true, exteriorIndustry: true, collision: false, component: key };
    components[key] = m; parent.add(m); return m;
  };
  const matrix = (p, s = [1, 1, 1], q = new THREE.Quaternion()) => new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(...s));
  const batch = (key, geometry, material, parent, transforms) => {
    const m = new THREE.InstancedMesh(track(geometry), material, transforms.length);
    transforms.forEach((t, i) => m.setMatrixAt(i, t)); m.instanceMatrix.needsUpdate = true;
    m.name = `exterior-industry:${key}`; m.userData = { runtimeOnly: true, exteriorIndustry: true, collision: false, component: key };
    m.computeBoundingBox(); m.computeBoundingSphere(); parent.add(m); components[key] = m; return m;
  };
  const box = track(new THREE.BoxGeometry(1, 1, 1));
  const beam = (a, b, width = 0.35) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.clone().sub(start);
    return matrix(start.add(end).multiplyScalar(0.5).toArray(), [width, width, d.length()], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  };
  mesh('airlockAdapter', hollowTube(7.5, 3, 10), metal, transport, [0, 0, -220]);
  const tube = mesh('pressurizedTransportTube', hollowTube(3, 3, 9770), metal, transport, [0, 0, -230]);
  tube.userData.purpose = 'Pressurized passage for people and small items';
  tube.userData.lengthMetres = 9770; tube.userData.protectedBoreRadius = 2.7;
  const rings = [], rails = [], braces = [];
  for (let z = -235; z >= -9995; z -= 200) {
    rings.push(matrix([0, 0, z]));
    const next = Math.max(z - 200, -9995);
    if (next === z) continue;
    for (const x of [-4, 4]) {
      rails.push(beam([x, -4, z], [x, -4, next], 0.22));
      braces.push(beam([x, -4, z], [x, 4, next], 0.18));
    }
  }
  for (const z of [-230, -10000]) rings.push(matrix([0, 0, z]));
  batch('tubeFrameRings', new THREE.TorusGeometry(3.55, 0.16, 3, 16), frame, transport, rings);
  batch('tubeRails', box, frame, transport, rails);
  batch('tubeTruss', box, frame, transport, braces);

  // Vacuum-open lattice, no envelope or fictional pressurized factory volume.
  const lattice = [], machinery = [], seams = [], crates = [], panels = [], cellLines = [], solarFrames = [];
  for (const y of [-40, 40]) lattice.push(beam([-90, y, -16], [90, y, -16], 1));
  for (let x = -90; x <= 90; x += 30) lattice.push(beam([x, -40, -16], [x, 40, -16], 0.8));
  for (const x of [-70, -35, 35, 70]) for (const y of [-22, 22]) {
    machinery.push(matrix([x, y, -8], [18, 14, 12]));
    for (const dy of [-7.1, 7.1]) seams.push(matrix([x, y + dy, -8], [18.3, 0.18, 0.18]));
    lattice.push(beam([x - 9, y - 7, -16], [x + 9, y + 7, -16], 0.5));
  }
  for (const x of [-78, -62, 62, 78]) crates.push(matrix([x, 0, -10], [9, 10, 8]));
  batch('plantLattice', box, frame, plant, lattice);
  batch('processModules', box, metal, plant, machinery);
  batch('moduleSeams', box, frame, plant, seams);
  batch('bulkCargoCrates', box, ceramic, plant, crates);
  const tankTransforms = [-52, -26, 26, 52].map(x => matrix([x, 32, -4], [5, 12, 5]));
  batch('oxygenTanks', new THREE.CylinderGeometry(1, 1, 1, 12), metal, plant, tankTransforms);
  const hoppers = [-52, -26, 26, 52].map(x => matrix([x, -32, -5], [7, 10, 7]));
  batch('feedHoppers', new THREE.CylinderGeometry(1, 0.3, 1, 12), ceramic, plant, hoppers);

  // Tube arrives at an actual opening in the north face of the maintenance sphere.
  const radius = 8, aperture = 2.7, theta = Math.asin(aperture / radius);
  const arrival = mesh('arrivalMaintenanceSphere', new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, theta, Math.PI - theta), maintenanceMetal, plant, [0, 0, -Math.sqrt(radius * radius - aperture * aperture)]);
  arrival.rotation.x = Math.PI / 2;
  mesh('maintenanceSphereWest', new THREE.SphereGeometry(6, 20, 12), metal, plant, [-60, -12, 2]);
  mesh('maintenanceSphereEast', new THREE.SphereGeometry(10, 24, 16), metal, plant, [60, -12, 2]);
  const locks = [[-60, -12, 8], [60, -12, 12]];
  batch('maintenanceAirlocks', hollowTube(2, 2, 4, 0.25, 16), frame, plant, locks.map(p => matrix(p)));
  batch('maintenanceHatches', new THREE.CircleGeometry(1.75, 16), metal, plant, locks.map(p => matrix(p)));
  // Perimeter solar station, active planes face +Z; footprint/area deliberately authored.
  for (const x of [-135, 135]) for (const y of [-36, 0, 36]) {
    panels.push(matrix([x, y, 16], [60, 28, 0.35]));
    solarFrames.push(beam([Math.sign(x) * 90, y, -16], [x, y, 15], 0.7));
    for (let i = -2; i <= 2; i++) cellLines.push(matrix([x + i * 10, y, 16.23], [0.12, 28, 0.12]));
    for (const dy of [-14, 14]) cellLines.push(matrix([x, y + dy, 16.23], [60, 0.2, 0.12]));
  }
  batch('solarElectricPanels', box, solar, plant, panels).userData.facing = '+Z';
  batch('solarPanelGrid', box, frame, plant, cellLines);
  batch('solarStationSupports', box, frame, plant, solarFrames);
  // Parabolic bowl mesh with receiver above +Z, not solid spheres pretending to be dishes.
  const dishP = [], dishI = [], sideCount = 24, steps = 5;
  for (let j = 0; j <= steps; j++) for (let i = 0; i <= sideCount; i++) {
    const r = j / steps * 12, a = i / sideCount * Math.PI * 2;
    dishP.push(r * Math.cos(a), r * Math.sin(a), r * r / 48);
    if (j < steps && i < sideCount) { const k = j * (sideCount + 1) + i; if (j > 0) dishI.push(k, k + sideCount + 1, k + 1); dishI.push(k + 1, k + sideCount + 1, k + sideCount + 2); }
  }
  const dish = new THREE.BufferGeometry(); dish.setAttribute('position', new THREE.Float32BufferAttribute(dishP, 3)); dish.setIndex(dishI); dish.computeVertexNormals();
  const dishPositions = [[-40, -64, 0], [40, -64, 0]];
  batch('solarFurnaceConcentrators', dish, mirror, plant, dishPositions.map(p => matrix(p)));
  batch('solarFurnaceReceivers', box, ceramic, plant, dishPositions.map(([x, y]) => matrix([x, y, 12], [3, 3, 4])));
  const receiverSupports = [];
  for (const [x, y] of dishPositions) for (const dx of [-10, 10]) receiverSupports.push(beam([x + dx, y, 2.1], [x, y, 11], 0.22));
  batch('furnaceReceiverSupports', box, frame, plant, receiverSupports);

  const tugPositions = [[-75, 40, -160], [-90, -25, -205], [105, 55, -9980], [-100, 65, -10020]];
  batch('cargoTugBodies', box, metal, tugs, tugPositions.map(p => matrix(p, [7, 4, 10])));
  batch('cargoTugCargo', box, ceramic, tugs, tugPositions.map(([x, y, z]) => matrix([x, y, z - 11], [12, 8, 10])));
  batch('cargoTugThrusters', new THREE.CylinderGeometry(1.1, 1.5, 2, 8, 1, true), frame, tugs, tugPositions.flatMap(([x, y, z]) => [-2, 2].map(dx => matrix([x + dx, y, z + 6], [1, 1, 1], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)))));

  root.updateMatrixWorld(true);
  const stats = { units: 'metres', meshes: 0, drawCalls: 0, triangles: 0, instances: 0, materials: materials.size, uniqueGeometries: geometries.size, tubeLengthMetres: 9770, facilityDistanceMetres: 10000 };
  for (const m of Object.values(components)) {
    const count = m.isInstancedMesh ? m.count : 1;
    stats.meshes++; stats.drawCalls++; stats.triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 * count;
    if (m.isInstancedMesh) stats.instances += count;
  }
  let disposed = false;
  const setEnvelopeVisible = visible => { if (!disposed) root.visible = Boolean(visible); };
  const dispose = () => {
    if (disposed) return; disposed = true; root.removeFromParent();
    Object.values(components).forEach(m => { if (m.isInstancedMesh) m.dispose(); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  };
  setEnvelopeVisible(false);
  return { groups, components, stats, setEnvelopeVisible, dispose };
}
