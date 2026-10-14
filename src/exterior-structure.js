import * as THREE from 'three';

const TAU = Math.PI * 2;
const WINDOW_START = 2 * Math.PI / 3;
const WINDOW_END = 4 * Math.PI / 3;
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

/** Historical facts and authored interpretation; no renderer objects or saved placements. */
export const structuralSpec = freeze({
  units: 'metres', axis: 'Z', ringPlane: 'XY', runtimeOnly: true,
  sourceFacts: {
    report: 'NASA SP-413, Space Settlements: A Design Study',
    anchors: [
      { figure: '5-1', image: 'study/images/sp413-p0105-00.jpg', printedPage: 88, pdfPage: 105, segment: 'sp413-s02183' },
      { figure: '5-3', image: 'study/images/sp413-p0106-08.jpg', printedPage: 89, pdfPage: 106, segment: 'sp413-s02235' },
      { printedPage: 89, segments: ['sp413-s02206', 'sp413-s02208', 'sp413-s02209', 'sp413-s02211', 'sp413-s02212', 'sp413-s02225', 'sp413-s02230'] },
    ],
    spokeCount: 6, spokeDiameter: 15, hubDiameter: 130,
    fabricationDiameter: 100, dockingDiameter: 15, dockingLength: 60,
    tubeDiameter: 130, glazingSurfaceFraction: 1 / 3, aluminumSurfaceFraction: 2 / 3,
    shieldGap: 1.5, shieldThickness: 1.7,
    stationary: ['docking', 'fabrication', 'habitat radiator'],
    note: 'Figure 5-3 depicts a circular central hub and fabrication sphere, ports, and north/south de-spin systems; it does not specify their detailed engineering.',
  },
  interpretation: {
    majorRadius: 830, tubeRadius: 65, hubCenter: [0, 0, 0], hubShape: 'sphere',
    spokeInnerStartRadius: 65, spokeLandingRadius: 765, spokeWallThickness: 0.35,
    spokeEnds: 'Curved annular hub contact and cylindrical radius-765 rim end. Rim contact at z=0 only; the remaining end clears the nominal torus by at most 0.44 m. Open bore, no interior shaft extension or triangulated curved-end intrusion.',
    spokeAlignment: 'saved world.masterPlan.districts[].center (six legacy sector centers)',
    windowPhiRadians: [WINDOW_START, WINDOW_END],
    shellPhiRadians: [WINDOW_END, WINDOW_START + TAU],
    shieldMinorRadii: [66.5, 68.2], shieldFrame: 'stationary; future counterrotation is caller-owned',
    dockingZ: [65, 125], northBearingZ: 65, southNeckZ: [-105, -65],
    fabricationCenter: [0, 0, -155], southAirlockZ: [-235, -205], southAirlockCenterZ: -220,
    dockingPortCount: 4,
    envelopeRenderClearance: 0.5,
    envelopeTessellation: '192 ring / 24 tube segments per surface; 0.5 m outward rendering allowance keeps flat triangles outside the nominal 65 m interior. Shield radii receive the same allowance, preserving nominal 1.5 m gap / 1.7 m thickness.',
    glazingFractionBasis: 'The source says one-third of surface area; Figure 5-1 shows a 120-degree aperture. This mesh reproduces the diagram angular span, not an exact one-third torus-area allocation.',
    detail: 'Panel ribs, bands, hatches, four port arrangement, collars, pipes, truss, sphere-shaped hub, and axial component offsets are authored visual interpretation, not engineering specifications.',
    omissions: ['solar, mirrors, chevrons and radiator belong to the energy assembly', 'south transport and extraction plant belong to the industry assembly', 'no colliders, interiors, pressure simulation, bearing mechanics, or saved-world placements', 'glazing is continuous at spoke landings; engineered pressure doors / cutouts are not modeled'],
    integration: 'Caller hides legacy torus meshes while envelope is visible. setEnvelopeVisible(false) hides only envelope/shield/detail groups, not hub or spokes.',
  },
});

// Partial tube-phi surface: Three.TorusGeometry arc instead clips ring-theta.
function torusSurface(radius, phiStart, phiEnd, ringSegments = 192, tubeSegments = 24, inward = false) {
  const nominalRadius = radius;
  radius += structuralSpec.interpretation.envelopeRenderClearance;
  const positions = [], indices = [], normals = [], uv = [];
  for (let i = 0; i <= ringSegments; i++) {
    const theta = i / ringSegments * TAU, c = Math.cos(theta), s = Math.sin(theta);
    for (let j = 0; j <= tubeSegments; j++) {
      const phi = phiStart + (phiEnd - phiStart) * j / tubeSegments;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      positions.push((830 + radius * cp) * c, (830 + radius * cp) * s, radius * sp);
      const sign = inward ? -1 : 1;
      normals.push(sign * cp * c, sign * cp * s, sign * sp); uv.push(i / ringSegments, j / tubeSegments);
      if (i < ringSegments && j < tubeSegments) {
        const a = i * (tubeSegments + 1) + j, b = a + tubeSegments + 1;
        if (inward) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { nominalRadius, renderClearance: radius - nominalRadius, phiStart, phiEnd, ringSegments, tubeSegments };
  return geometry;
}

// Annular end rings and open bore, ending at the inner-rim cylinder in local +X.
function spokeGeometry() {
  const positions = [], indices = [], normals = [], segments = 32;
  const outer = 7.5, inner = outer - 0.35;
  // Separate surface vertices avoid averaging opposite end/wall normals.
  const point = (r, end, j) => {
    const phi = j / segments * TAU, y = r * Math.cos(phi), z = r * Math.sin(phi);
    // Using the inner-rim cylinder instead of a triangulated torus cut keeps
    // the complete end triangles (not merely their vertices) out of the tube.
    return [end ? Math.sqrt(765 * 765 - y * y) : Math.sqrt(65 * 65 - r * r), y, z];
  };
  for (const r of [outer, inner]) {
    for (const end of [false, true]) {
      for (let j = 0; j <= segments; j++) {
        const phi = j / segments * TAU, sign = r === outer ? 1 : -1;
        positions.push(...point(r, end, j));
        normals.push(0, sign * Math.cos(phi), sign * Math.sin(phi));
      }
    }
  }
  const stride = segments + 1;
  const connect = (a, b, reverse = false) => {
    for (let j = 0; j < segments; j++) {
      const q = [a + j, b + j, a + j + 1, b + j, b + j + 1, a + j + 1];
      if (reverse) for (let k = 0; k < 6; k += 3) [q[k + 1], q[k + 2]] = [q[k + 2], q[k + 1]];
      indices.push(...q);
    }
  };
  connect(0, stride, true); connect(2 * stride, 3 * stride);
  for (const end of [false, true]) {
    const base = positions.length / 3;
    for (const r of [outer, inner]) for (let j = 0; j <= segments; j++) {
      const p = point(r, end, j); positions.push(...p);
      const n = end ? new THREE.Vector3(p[0], p[1], 0).normalize() : new THREE.Vector3(...p).normalize().negate();
      normals.push(...n.toArray());
    }
    connect(base, base + stride, end);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Full-scale additive runtime assembly. All created resources belong to this instance. */
export function createExteriorStructure({ rotatingGroup, stationaryGroup, world } = {}) {
  if (!rotatingGroup?.isObject3D || !stationaryGroup?.isObject3D || rotatingGroup === stationaryGroup) {
    throw new TypeError('Distinct rotatingGroup and stationaryGroup Object3D frames are required');
  }
  // A stator nested beneath the rotor (or vice versa) cannot remain independent.
  for (const [frame, other] of [[rotatingGroup, stationaryGroup], [stationaryGroup, rotatingGroup]]) {
    for (let p = frame.parent; p; p = p.parent) if (p === other) throw new TypeError('Rotation frames must not be ancestors of one another');
  }
  const districts = world?.masterPlan?.districts;
  if (districts !== undefined && (!Array.isArray(districts) || districts.length !== 6 || districts.some(d => !Number.isFinite(d.center)))) {
    throw new TypeError('world.masterPlan.districts must contain six finite sector centers');
  }
  const residentialHalf = TAU / 3 * 430 / 670 / 2;
  const angles = districts ? districts.map(d => d.center) : Array.from({ length: 6 }, (_, i) => residentialHalf + i * Math.PI / 3);
  const groups = {}, components = {}, geometries = new Set(), materials = new Set();
  const group = (name, parent) => {
    const g = new THREE.Group(); g.name = `exterior:${name}`; parent.add(g); groups[name] = g; return g;
  };
  const rotating = group('rotating', rotatingGroup), stationary = group('stationary', stationaryGroup);
  const spokes = group('spokes', rotating), envelope = group('envelope', rotating);
  const shield = group('shield', stationary), envelopeDetails = group('envelopeDetails', envelope);
  const material = options => { const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...options }); materials.add(m); return m; };
  const aluminum = material({ color: 0xc5cbd0, metalness: 0.75, roughness: 0.36 });
  const dark = material({ color: 0x273846, metalness: 0.65, roughness: 0.5 });
  const seam = material({ color: 0x647784, metalness: 0.75, roughness: 0.4 });
  const glass = material({ color: 0x86b7cc, metalness: 0.12, roughness: 0.16, transparent: true, opacity: 0.3, depthWrite: false });
  const regolith = material({ color: 0x736d65, roughness: 0.92 });
  glass.forceSinglePass = true;
  const track = geometry => { geometries.add(geometry); return geometry; };
  const mesh = (name, geometry, mat, parent, position = [0, 0, 0]) => {
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const m = new THREE.Mesh(track(geometry), mat); m.name = `exterior:${name}`;
    m.position.fromArray(position); m.userData = { exteriorStructure: true, component: name, runtimeOnly: true };
    parent.add(m); components[name] = m; return m;
  };
  const instances = (name, geometry, mat, parent, transforms) => {
    const m = new THREE.InstancedMesh(track(geometry), mat, transforms.length); m.name = `exterior:${name}`;
    transforms.forEach((matrix, i) => m.setMatrixAt(i, matrix)); m.instanceMatrix.needsUpdate = true;
    m.userData = { exteriorStructure: true, component: name, runtimeOnly: true };
    m.computeBoundingBox(); m.computeBoundingSphere(); parent.add(m); components[name] = m; return m;
  };
  const matrix = (position, quaternion = new THREE.Quaternion(), scale = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
  const axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
  const segmentMatrix = (a, b, radius = 1) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    return matrix(start.add(end).multiplyScalar(0.5).toArray(), new THREE.Quaternion().setFromUnitVectors(axisY, delta.clone().normalize()), [radius, delta.length(), radius]);
  };
  const cylinder = track(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true));
  const ring = track(new THREE.TorusGeometry(1, 0.045, 4, 16));
  const ringMatrices = [], pipeMatrices = [], trussMatrices = [];
  const axialQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const zTube = (name, radius, z0, z1, parent, mat = aluminum) => {
    const m = mesh(name, new THREE.CylinderGeometry(radius, radius, Math.abs(z1 - z0), 32, 1, true), mat, parent, [0, 0, (z0 + z1) / 2]);
    m.quaternion.copy(axialQuaternion); return m;
  };
  mesh('hub', new THREE.SphereGeometry(65, 48, 32), aluminum, rotating);
  const spokeTubes = instances('spokeTubes', spokeGeometry(), aluminum, spokes, angles.map(a => matrix([0, 0, 0], new THREE.Quaternion().setFromAxisAngle(axisZ, a))));
  spokeTubes.userData.sourceFacts = { spokeCount: structuralSpec.sourceFacts.spokeCount, spokeDiameter: structuralSpec.sourceFacts.spokeDiameter, figure: '5-3', segment: 'sp413-s02206' };
  spokeTubes.userData.spokeAngles = [...angles];
  angles.forEach(a => {
    const dir = [Math.cos(a), Math.sin(a)];
    const p = (r, t = 0, z = 0) => [r * dir[0] - t * dir[1], r * dir[1] + t * dir[0], z];
    const q = new THREE.Quaternion().setFromUnitVectors(axisZ, new THREE.Vector3(...p(1)));
    for (let r = 70; r <= 750; r += 40) ringMatrices.push(matrix(p(r), q, [7.8, 7.8, 7.8]));
    // All bulky endpoint services stop before the curved pressure boundary.
    for (const r of [66, 738, 756]) ringMatrices.push(matrix(p(r), q, [8.2, 8.2, 8.2]));
    for (const side of [-1, 1]) {
      pipeMatrices.push(segmentMatrix(p(70, side * 8.1), p(754, side * 8.1), 0.32));
      pipeMatrices.push(segmentMatrix(p(70, 0, side * 8.1), p(754, 0, side * 8.1), 0.22));
    }
    for (let r = 82; r < 722; r += 40) {
      trussMatrices.push(segmentMatrix(p(r, -8.5, 2), p(r + 40, 8.5, 2), 0.24));
      trussMatrices.push(segmentMatrix(p(r, 8.5, -2), p(r + 40, -8.5, -2), 0.24));
    }
  });
  instances('spokeCollars', ring, seam, spokes, ringMatrices);
  instances('spokeServicePipesAndCables', cylinder, dark, spokes, pipeMatrices);
  instances('spokeTrussSegments', cylinder, seam, spokes, trussMatrices);
  mesh('pressureShell', torusSurface(65, WINDOW_END, WINDOW_START + TAU), aluminum, envelope);
  mesh('glazing', torusSurface(65, WINDOW_START, WINDOW_END), glass, envelope);
  mesh('shieldOuter', torusSurface(68.2, WINDOW_END, WINDOW_START + TAU), regolith, shield);
  mesh('shieldInner', torusSurface(66.5, WINDOW_END, WINDOW_START + TAU, 192, 24, true), regolith, shield);
  for (const [index, phi] of [WINDOW_START, WINDOW_END].entries()) {
    // Custom boundary strip closes the thickness without covering the chevron aperture.
    const positions = [], indices = [];
    for (let i = 0; i <= 192; i++) for (const r of [67, 68.7]) {
      const t = i / 192 * TAU; positions.push((830 + r * Math.cos(phi)) * Math.cos(t), (830 + r * Math.cos(phi)) * Math.sin(t), r * Math.sin(phi));
      if (r === 67 && i < 192) {
        const n = i * 2;
        if (index === 0) indices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
        else indices.push(n, n + 2, n + 1, n + 2, n + 3, n + 1);
      }
    }
    const strip = new THREE.BufferGeometry(); strip.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); strip.setIndex(indices); strip.computeVertexNormals();
    mesh(`shieldWindowEdge${index}`, strip, regolith, shield);
  }
  // Repeated glazing mullion curves are shared/instanced around theta, never inside the tube.
  const ribs = [], ribCurve = [];
  for (let i = 0; i <= 32; i++) {
    const phi = WINDOW_START + (WINDOW_END - WINDOW_START) * i / 32;
    ribCurve.push(new THREE.Vector3(830 + 65.6 * Math.cos(phi), 0, 65.6 * Math.sin(phi)));
  }
  for (let i = 0; i < 48; i++) ribs.push(matrix([0, 0, 0], new THREE.Quaternion().setFromAxisAngle(axisZ, i / 48 * TAU)));
  instances('glazingRibs', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribCurve), 24, 0.18, 4, false), seam, envelopeDetails, ribs);
  const hubBands = [];
  for (const [radius, z] of [[65.25, 0], [56.6, 32.5], [56.6, -32.5]]) hubBands.push(matrix([0, 0, z], undefined, [radius, radius, 0.8]));
  instances('hubSurfaceBands', ring, seam, rotating, hubBands);
  // Explicitly separate rotor and stator races; neither touches borrowed parent resources.
  for (const [pole, z] of [['north', 65], ['south', -65]]) {
    const rotor = mesh(`${pole}BearingRotor`, new THREE.TorusGeometry(8.6, 0.7, 8, 48), seam, rotating, [0, 0, z]);
    rotor.userData.frame = 'rotating';
    const stator = mesh(`${pole}BearingStator`, new THREE.TorusGeometry(10.3, 0.65, 8, 48), dark, stationary, [0, 0, z]);
    stator.userData.frame = 'stationary';
  }
  zTube('dockingTube', 7.5, 65, 125, stationary);
  zTube('southDeSpinNeck', 7.5, -105, -65, stationary);
  mesh('fabricationSphere', new THREE.SphereGeometry(50, 40, 28), aluminum, stationary, [0, 0, -155]);
  zTube('southAirlock', 7.5, -235, -205, stationary, seam);
  // Open transport interface: the maintenance hatch is shown as an annular
  // frame around the 6 m bore, not a closed disc intersecting the joined tube.
  const hatch = mesh('southAirlockHatch', new THREE.RingGeometry(3.1, 6.1, 32), dark, stationary, [0, 0, -235.05]);
  hatch.rotation.y = Math.PI;
  const serviceBands = [];
  for (const z of [70, 82, 94, 106, 120, -72, -85, -100, -210, -222]) serviceBands.push(matrix([0, 0, z], undefined, [7.9, 7.9, 1]));
  instances('axialServiceCollars', ring, seam, stationary, serviceBands);
  const ports = [], portRings = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, z = i % 2 ? 108 : 89;
    const d = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    ports.push(segmentMatrix([d.x * 6.8, d.y * 6.8, z], [d.x * 11, d.y * 11, z], 2.2));
    portRings.push(matrix([d.x * 11, d.y * 11, z], new THREE.Quaternion().setFromUnitVectors(axisZ, d), [2.4, 2.4, 2.4]));
  }
  instances('dockingPorts', cylinder, dark, stationary, ports);
  instances('dockingPortFlanges', ring, aluminum, stationary, portRings);
  mesh('fabricationEquatorBand', new THREE.TorusGeometry(50.3, 0.45, 6, 64), seam, stationary, [0, 0, -155]);
  const stats = { components: Object.keys(components).length, meshes: 0, drawCalls: 0, instances: 0, triangles: 0, uniqueGeometries: geometries.size, materials: materials.size, spokeAngles: [...angles], units: 'metres', drawCallBasis: 'All components visible, one standard color pass, no shadows; counted from real mesh/material groups, not a GPU benchmark.' };
  Object.values(components).forEach(m => {
    const count = m.isInstancedMesh ? m.count : 1;
    stats.meshes++; if (m.isInstancedMesh) stats.instances += count;
    stats.drawCalls += Array.isArray(m.material) ? m.geometry.groups.length : 1;
    stats.triangles += count * (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
  });
  let disposed = false;
  const setEnvelopeVisible = visible => {
    if (disposed) return;
    envelope.visible = Boolean(visible); shield.visible = Boolean(visible);
  };
  const dispose = () => {
    if (disposed) return; disposed = true;
    rotating.removeFromParent(); stationary.removeFromParent();
    Object.values(components).forEach(m => { if (m.isInstancedMesh) m.dispose(); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  };
  setEnvelopeVisible(false);
  return { groups, components, stats, dispose, setEnvelopeVisible };
}
