import * as THREE from 'three';
import { districts } from './settlement-plan.js';

// Authored metre-scale geometry, not a scan texture or an engineering simulation.
const freeze = value => { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(value); };
export const energySpec = freeze({
  coordinates: 'Untransformed habitat XY ring, rotation axis Z; north +Z; Sun propagation -X.',
  facts: {
    spokes: { count: 6, diameterM: 15, source: 'sp413-s02206', printedPage: 89 },
    optics: { mainStationary: true, secondaryRotating: true, secondaryIndividuallyDirected: true, sources: ['sp413-s02218', 'sp413-s02219'], printedPage: 89 },
    solarCells: { material: 'silicon', location: 'Between hub, spokes and secondary mirrors, looking north toward main mirror', sources: ['sp413-s02232', 'sp413-s02233'], printedPage: 89 },
    shield: { gapM: 1.5, thicknessM: 1.7, mirroredChevronsOverWindows: true, sources: ['sp413-s02211', 'sp413-s02212', 'sp413-s02213'], printedPage: 89 },
    fabrication: { diameterM: 100, source: 'sp413-s02225', printedPage: 89 },
    furnace: { documentedCapacityMW: 200, source: 'sp413-s02227', printedPage: 89, operational: false },
    radiator: { tourAreaM2: 490000, thermalPeakAreaM2: 940000, sources: ['sp413-s02227', 'sp413-s02228', 'sp413-s02458'], printedPages: [89, 103], stationary: true, edgeTowardSun: true, uncertainty: 'Tour gives 4.9 × 10^5 m²; thermal discussion gives 9.4 × 10^5 m². Area basis is unresolved, not silently reconciled or doubled.' }
  },
  interpretation: {
    solar: { radialM: [115, 530], zM: 95, projectedAxisHoleM: 110, spokeProjectedClearanceM: 10, alignment: 'Sectors between adjacent saved world.masterPlan.districts[].center spoke axes; canonical plan fallback only when absent.', fallbackSpokeAxes: districts.map(d => ({ districtId: d.id, theta: d.center })), powerRating: null },
    secondary: { radialM: [575, 745], zM: [115, 195], targetRadialM: [775, 800], targetZM: 0, method: 'Each physical facet normal bisects outgoing direction and reversed incoming -Z ray. Static regulating modules; simplified single-bounce construction, not ray-traced illumination.' },
    mainMirror: { centerM: [0, 0, 1300], outerRadiusM: 900, projectedHoleRadiusM: 110, tiltAboutYDeg: -45, nominalNormal: [-Math.SQRT1_2, 0, Math.SQRT1_2], incoming: [-1, 0, 0], nominalReflected: [0, 0, -1], sagM: 18, sourceDimensionsPrescribed: false, note: 'Center, radius, tilt and shallow faceting are authored. Nominal central tangent reflects -X to -Z; curved facet normals vary, so the whole surface is not claimed to collimate exactly.' },
    radiator: { widthM: 700, heightM: 700, xM: [150, 850], zM: [-855, -155], yM: 0, physicalPanelAreaM2: 490000, areaBasis: 'One physical sheet tiled into 196 bays; triangles counted once, not two emissive faces.' },
    furnace: { centerM: [-150, 0, -155], dishRadiusM: 65, label: 'Solar thermal plant / fabrication furnace — documented 200 MW capacity; authored static plant, not operation or photovoltaic output.' },
    chevrons: { majorRadiusM: 830, minorOuterM: 68.2, phiCenter: Math.PI, phiSpan: 2 * Math.PI / 3, note: 'Authored thin folded reflective strips over inner one-third window span only, outside the 66.5 m shield inner boundary. Not volumetric 1.7 m bricks. Solid two-thirds shield belongs to the envelope module; shield is stationary. Fold spacing is illustrative, not certified radiation protection.' },
    sourceFigures: { figures: ['5-1', '5-2'], segment: 'sp413-s02183', printedPage: 88, pdfPage: 105, note: 'Combined colony configuration and secondary-mirror / shield-chevron diagram; source depiction is not a dimensioned fabrication drawing.' },
    imagePolicy: 'Fig. 5-1 / 5-2 local source diagram consulted only. No raw credited blue diagram, image link or source texture is published.'
  }
});

const V = a => new THREE.Vector3(...a);
const polar = (r, t, z) => [r * Math.cos(t), r * Math.sin(t), z];
export function reflectionNormal(incoming, outgoing) { return V(outgoing).normalize().sub(V(incoming).normalize()).normalize().toArray(); }
export function reflectDirection(incoming, normal) { const i = V(incoming).normalize(), n = V(normal).normalize(); return i.addScaledVector(n, -2 * i.dot(n)).toArray(); }

/** Attach once to the supplied rotating and stationary frames. Never convert world frames. */
export function createExteriorEnergy({ rotatingGroup, stationaryGroup, world } = {}) {
  if (!rotatingGroup?.isObject3D || !stationaryGroup?.isObject3D || rotatingGroup === stationaryGroup) throw new TypeError('Distinct rotatingGroup and stationaryGroup Object3D parents required');
  // Read the same saved centers as the structural spokes, without editing or
  // registering saved placements. The canonical plan is only a missing-world fallback.
  const savedDistricts = world?.masterPlan?.districts;
  if (savedDistricts !== undefined && (!Array.isArray(savedDistricts) || savedDistricts.length !== 6 || savedDistricts.some(d => !Number.isFinite(d?.center)))) {
    throw new TypeError('world.masterPlan.districts must contain six finite sector centers');
  }
  const tau = 2 * Math.PI;
  const spokeAxes = (savedDistricts ?? districts).map((d, i) => ({ districtId: d.id ?? `spoke-${i}`, theta: ((d.center % tau) + tau) % tau }))
    .sort((a, b) => a.theta - b.theta);
  if (spokeAxes.some((a, i) => (spokeAxes[(i + 1) % 6].theta + (i === 5 ? tau : 0) - a.theta) < 1e-6)) {
    throw new TypeError('Spoke centers must define six distinct axes');
  }
  const groups = {}, components = {}, resources = new Set();
  const own = r => { resources.add(r); return r; };
  const mat = (color, metalness = .5, roughness = .4) => own(new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide }));
  const azure = mat(0x087dd4, .65, .3), silver = mat(0xb9dcec, .92, .17), dark = mat(0x243c4c, .65, .7), receiver = mat(0xcc7134, .65, .55);
  const lineMat = own(new THREE.LineBasicMaterial({ color: 0x7295a9 }));
  const cellMat = own(new THREE.LineBasicMaterial({ color: 0x60c9f4, transparent: true, opacity: .55 }));
  const group = (name, parent) => { const g = new THREE.Group(); g.name = `exterior-energy:${name}`; g.userData = { exteriorOnly: true, collisionMode: 'none' }; parent.add(g); groups[name] = g; return g; };
  const rotating = group('rotating', rotatingGroup), stationary = group('stationary', stationaryGroup);
  const solar = group('solar', rotating), secondary = group('secondary', rotating), main = group('mainMirror', stationary), radiator = group('radiator', stationary), furnace = group('furnace', stationary), chevrons = group('chevrons', stationary);
  const lines = (name, points, parent, material = lineMat) => { const geo = own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3)); const o = new THREE.LineSegments(geo, material); o.name = name; parent.add(o); return o; };
  const mesh = (name, geo, material, parent) => { const m = new THREE.Mesh(own(geo), material); m.name = name; parent.add(m); return m; };
  const instances = (name, geo, material, transforms, parent) => { const m = own(new THREE.InstancedMesh(own(geo), material, transforms.length)); const dummy = new THREE.Object3D(); transforms.forEach((p, i) => { dummy.position.fromArray(p.center); dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(p.normal || [0, 0, 1])); if (p.angle !== undefined) dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.angle)); dummy.scale.set(...(p.scale || [1, 1, 1])); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.name = name; parent.add(m); return m; };
  const quadGeometry = quads => { const p = []; quads.forEach(q => { p.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g; };

  // Actual district centers, not equal-angle district proxies. Panels filtered by
  // every corner; the six 15 m spoke projections retain an extra 2.5 m clearance.
  const solarRecords = [], solarSectors = [], cellLines = [], carrierLines = [];
  for (let axisIndex = 0; axisIndex < spokeAxes.length; axisIndex++) {
    const axis = spokeAxes[axisIndex], next = spokeAxes[(axisIndex + 1) % spokeAxes.length];
    const start = axis.theta, end = next.theta + (axisIndex === 5 ? tau : 0);
    const d = { id: axis.districtId, center: (start + end) / 2 };
    const sector = group(`solar-${d.id}`, solar), panels = [];
    for (let r = 126; r <= 516; r += 22) {
      const steps = Math.floor(r * (end - start) / 18);
      for (let j = 0; j < steps; j++) {
        const t = start + (j + .5) * (end - start) / steps;
        const center = polar(r, t, 95), radial = [Math.cos(t), Math.sin(t), 0], tangent = [-Math.sin(t), Math.cos(t), 0];
        const at = (u, v) => center.map((c, k) => c + u * radial[k] + v * tangent[k]);
        const corners = [[-9,-7],[9,-7],[9,7],[-9,7]].map(([u,v]) => at(u,v));
        const cornerAngles = corners.map(p => start + ((Math.atan2(p[1], p[0]) - start + tau) % tau));
        if (!cornerAngles.every(a => a > start && a < end)) continue;
        if (!corners.every(p => Math.hypot(p[0],p[1]) >= 115 && Math.hypot(p[0],p[1]) <= 530)) continue;
        // All four corners must lie on one side of each projected spoke line;
        // absolute corner distances alone would admit a panel crossing that line.
        if (!spokeAxes.every(axis => {
          const distances = corners.map(p => p[0] * Math.sin(axis.theta) - p[1] * Math.cos(axis.theta));
          return distances.every(v => v >= 10) || distances.every(v => v <= -10);
        })) continue;
        const p = { districtId: d.id, center, angle: t, normal: [0,0,1], corners, areaM2: 252 }; panels.push(p); solarRecords.push(p);
        for (let k = 0; k < 4; k++) cellLines.push(corners[k],corners[(k+1)%4]);
        for (const u of [-3,3]) cellLines.push(at(u,-7),at(u,7));
        cellLines.push(at(-9,0),at(9,0));
      }
    }
    const panelMesh = instances(`azure silicon cells ${d.id}`, new THREE.PlaneGeometry(18,14), azure, panels, sector);
    sector.userData.districtId = d.id; sector.userData.districtCenter = axis.theta;
    sector.userData.spokeAngles = [start, end];
    const points = [polar(115,d.center,92),polar(530,d.center,92),polar(560,d.center,112)];
    carrierLines.push(points[0],points[1],points[1],points[2]);
    for (const t of [start+.1,end-.1]) carrierLines.push(polar(115,t,92),polar(530,t,92),polar(530,t,92),polar(560,t,112));
    solarSectors.push({ districtId:d.id, theta:d.center, spokeAngles:[start,end], adjacentDistrictIds:[axis.districtId,next.districtId], mesh:panelMesh, panelCount:panels.length });
  }
  lines('photovoltaic cell grids',cellLines,solar,cellMat); lines('six district carriers and secondary ties',carrierLines,solar);
  components.solar = { group:solar, sectors:solarSectors, panels:solarRecords, projectedPanelAreaM2:solarRecords.length*252, powerRating:null };

  const mirrors = [], mirrorLines = [];
  for (let row=0;row<4;row++) for(let k=0;k<144;k++) {
    // Centers leave room for tilted 17 m discs: the full facet, not just its
    // center, must stay in the authored 115..195 m north-side envelope.
    const t=(k+.5)*2*Math.PI/144, r=595+row*40, z=132+row*15;
    const center=polar(r,t,z), target=polar(775+row*25/3,t,0), outgoing=V(target).sub(V(center)).normalize().toArray(), normal=reflectionNormal([0,0,-1],outgoing);
    mirrors.push({center,target,incoming:[0,0,-1],outgoing,normal,row});
    mirrorLines.push(polar(r,t,z-5),polar(r,t+2*Math.PI/144,z-5));
    if(row<3)mirrorLines.push(polar(r,t,z-5),polar(r+40,t,z+10));
  }
  const secondaryMesh=instances('individually directed secondary mirror discs',new THREE.CircleGeometry(17,12),silver,mirrors,secondary);
  lines('secondary annular carrier lattice',mirrorLines,secondary);
  components.secondary={group:secondary,mesh:secondaryMesh,panels:mirrors,rayTraced:false};

  // A shallow faceted annulus, with circular 110 m hole in XY projection even
  // after tilt. The inner rim is elliptical in the local mirror plane.
  main.position.set(0,0,1300); main.rotation.y=-Math.PI/4;
  const mainQuads=[], mainLines=[]; const angular=384, rings=14;
  // Backing stands off in global -Z, not along the tilted local normal: normal
  // offsets would translate its projected inner rim into the 110 m axis hole.
  // 384 angular facets keep the projected rim chord error below one centimetre.
  const mirrorPoint=(j,k,back=0)=>{const a=k*2*Math.PI/angular, inner=110/Math.sqrt(.5*Math.cos(a)**2+Math.sin(a)**2), f=j/rings, r=inner+(900-inner)*f; return [r*Math.cos(a)-back*Math.SQRT1_2,r*Math.sin(a),18*f*f-back*Math.SQRT1_2];};
  for(let j=0;j<rings;j++)for(let k=0;k<angular;k++) {
    mainQuads.push([mirrorPoint(j,k),mirrorPoint(j+1,k),mirrorPoint(j+1,k+1),mirrorPoint(j,k+1)]);
    mainLines.push(mirrorPoint(j,k,12),mirrorPoint(j,k+1,12),mirrorPoint(j,k,12),mirrorPoint(j+1,k,12));
    if(k%3===0)mainLines.push(mirrorPoint(j,k,12),mirrorPoint(j+1,k+1,12));
  }
  for(let k=0;k<angular;k++) { mainLines.push(mirrorPoint(rings,k),mirrorPoint(rings,k+1),mirrorPoint(0,k),mirrorPoint(0,k+1)); if(k%12===0)mainLines.push(mirrorPoint(rings,k),mirrorPoint(rings,k,25),mirrorPoint(rings,k,25),mirrorPoint(0,k,12)); }
  const mainMesh=mesh('curved reflective annulus facets',quadGeometry(mainQuads),silver,main);
  lines('full main mirror backing rim and cable lattice',mainLines,main);
  components.mainMirror={group:main,mesh:mainMesh,nominalNormal:energySpec.interpretation.mainMirror.nominalNormal,rayTraced:false};

  const bays=[], radiatorLines=[];
  for(let x=0;x<14;x++)for(let z=0;z<14;z++)bays.push({center:[175+x*50,0,-180-z*50],normal:[0,1,0],bay:[x,z]});
  const radiatorMesh=instances('196 physical radiator fin bays',new THREE.PlaneGeometry(50,50),dark,bays,radiator);
  for(let k=0;k<=14;k++){const x=150+k*50,z=-155-k*50; radiatorLines.push([x,1,-155],[x,1,-855],[150,1,z],[850,1,z]);}
  // Feed and return manifolds stand off the panel; narrow neck touches fab's 50 m rim.
  radiatorLines.push([50,0,-155],[150,0,-155],[50,3,-155],[150,3,-155],[150,3,-155],[850,3,-155]);
  for(let k=0;k<14;k++){const x=175+k*50;radiatorLines.push([x,3,-155],[x,3,-855]);for(let z=0;z<14;z++)radiatorLines.push([x,3,-180-z*50],[x+22,1,-205-z*50]);}
  lines('radiator fin ribs feed return header neck',radiatorLines,radiator);
  const header=mesh('physical heat exchange neck',new THREE.CylinderGeometry(2,2,100,8),dark,radiator);header.rotation.z=-Math.PI/2;header.position.set(100,0,-155);
  components.radiator={group:radiator,mesh:radiatorMesh,bays,physicalPanelAreaM2:490000,sourceUncertainty:energySpec.facts.radiator.uncertainty};

  furnace.position.set(-150,0,-155);
  const dishQuads=[], dishLines=[], dishPoint=(r,t)=>[r*Math.cos(t),r*Math.sin(t),r*r/(4*90)];
  for(let j=0;j<6;j++)for(let k=0;k<64;k++){const a=k*2*Math.PI/64,b=(k+1)*2*Math.PI/64,r=j*65/6,s=(j+1)*65/6;dishQuads.push([dishPoint(r,a),dishPoint(s,a),dishPoint(s,b),dishPoint(r,b)]);if(k%8===0)dishLines.push(dishPoint(s,a),[0,0,75]);}
  mesh('solar thermal concentrator dish',quadGeometry(dishQuads),silver,furnace);
  const process=mesh('process receiver documented capacity not operation',new THREE.CylinderGeometry(9,9,16,12),receiver,furnace);process.rotation.x=Math.PI/2;process.position.z=75;
  const plant=mesh('static thermal power conversion plant',new THREE.BoxGeometry(38,24,35),dark,furnace);plant.position.set(0,0,-25);
  dishLines.push([65,0,0],[100,0,0],[100,0,0],[100,0,-12],[0,0,75],[0,0,-25]);
  for(let k=0;k<64;k++)dishLines.push(dishPoint(65,k*2*Math.PI/64),dishPoint(65,(k+1)*2*Math.PI/64));
  lines('furnace rim receiver truss and fabrication conduit',dishLines,furnace);
  furnace.userData.label=energySpec.interpretation.furnace.label;
  components.furnace={group:furnace,documentedCapacityMW:200,operational:false,photovoltaicOutputMW:null};

  const shieldQuads=[];
  const shieldPoint=(theta,phi,r)=>polar(830+r*Math.cos(phi),theta,r*Math.sin(phi));
  // Two thin folded faces per strip. Curved boundaries become straight triangle
  // chords; clearance is checked on rendered vertices, edge midpoints and centroids.
  for(let j=0;j<18;j++)for(let k=0;k<192;k++) {
    const a=2*Math.PI/3+j*(2*Math.PI/3)/18,b=a+(2*Math.PI/3)/18*.92,mid=(a+b)/2,t=k*2*Math.PI/192,u=(k+1)*2*Math.PI/192;
    shieldQuads.push([shieldPoint(t,a,68.2),shieldPoint(u,a,68.2),shieldPoint(u,mid,75),shieldPoint(t,mid,75)],[shieldPoint(t,mid,75),shieldPoint(u,mid,75),shieldPoint(u,b,68.2),shieldPoint(t,b,68.2)]);
  }
  const chevronMesh=mesh('mirrored window radiation chevron strips',quadGeometry(shieldQuads),silver,chevrons);
  chevronMesh.userData.opticalSimplification='Illustrative reflected-light shield; no radiation transport or lighting simulation';
  components.chevrons={group:chevrons,mesh:chevronMesh};
  // Nothing casts shadows: cutting away this optical envelope must not blacken
  // the explorable interior; illumination remains the lighting module's job.
  Object.values(groups).forEach(g=>g.traverse(o=>{o.castShadow=false;o.receiveShadow=false;o.userData.exteriorOnly=true;o.userData.collisionMode='none';}));
  const stats={triangles:0,drawCalls:0,lineSegments:0,solarPanels:solarRecords.length,secondaryPanels:mirrors.length,radiatorPanelAreaM2:490000,solarProjectedPanelAreaM2:solarRecords.length*252,renderCounts:'Geometry inventory including instance multiplicity, not measured GPU renderer calls.'};
  for(const root of [rotating,stationary])root.traverse(o=>{if(o.isMesh){stats.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);stats.drawCalls++;}else if(o.isLineSegments){stats.lineSegments+=o.geometry.attributes.position.count/2;stats.drawCalls++;}});
  let disposed=false;
  const setEnvelopeVisible=visible=>{chevrons.visible=Boolean(visible);};
  setEnvelopeVisible(false);
  return {groups,components,stats,setEnvelopeVisible,dispose(){if(disposed)return;disposed=true;rotating.removeFromParent();stationary.removeFromParent();resources.forEach(r=>r.dispose());resources.clear();}};
}
