import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { completedModels } from '../src/completed-models.js';
import { normalizeAssetManifest } from '../src/asset-manifest.js';
import { interiorModelPlacements, interiorLayout } from '../src/model-placement-interior.js';

const root = path.resolve(import.meta.dirname, '..');
const world = JSON.parse(fs.readFileSync(path.join(root, 'world.json')));
const baseline = world.assets.filter(a => !a[0].startsWith('completed-model-'));
const placements = interiorModelPlacements(world);
const modelById = new Map(completedModels.map(m => [m.id, m]));
const cache = new Map();
function asset(type) {
  if (cache.has(type)) return cache.get(type);
  const directory = modelById.get(type)?.directory ?? (fs.existsSync(path.join(root, `assets/ultimate-buildings/${type}.obj`)) ? 'ultimate-buildings' : 'ultimate-nature');
  const prefix = path.join(root, 'assets', directory, type);
  const text = fs.readFileSync(prefix + '.obj', 'utf8');
  const vertices = text.split('\n').filter(s => s.startsWith('v ')).map(s => s.trim().split(/\s+/).slice(1).map(Number));
  const raw = normalizeAssetManifest(JSON.parse(fs.readFileSync(prefix + '.asset.json', 'utf8')));
  const result = { vertices, raw, text };
  cache.set(type, result);
  return result;
}
function corners(bounds) {
  return bounds[0].flatMap(x => bounds[1].flatMap(y => bounds[2].map(z => [x,y,z])));
}
function pose(p, [x,y,z]) {
  const c = Math.cos(p.rotation), s = Math.sin(p.rotation);
  const X = x*c + z*s, Z = -x*s + z*c;
  const r = 830 - p.surface.height - (p.surface.height === 0 ? .3 : .05);
  return { theta: p.theta + Math.atan2(X, r-y), z: p.z + Z, height: 830-Math.hypot(r-y,X) };
}
function envelope(p, vertices) {
  const v = vertices.map(v => pose(p,v));
  return ['theta','z','height'].map(k => [Math.min(...v.map(v => v[k])), Math.max(...v.map(v => v[k]))]);
}
function overlap(a,b,epsilon = 1e-5) {
  return a.every(([lo,hi],i) => lo < b[i][1]-epsilon && hi > b[i][0]+epsilon);
}
const boxes = placements.map(p => envelope(p, corners(p.reservation.boundsMeters)));
const oldBoxes = new Map();
function oldBox(a) {
  if(oldBoxes.has(a)) return oldBoxes.get(a);
  const type = world.assetTypes[a[1]];
  const surface = a[7] ?? { height: a[6]?.elevation ?? 0 };
  const p = {theta:a[2], z:a[3], rotation:a[5], surface};
  if (a[6]) {
    // Curved procedural blockouts: theta extent is constant through height.
    const b = a[6], r = 830-surface.height;
    const result=[[a[2]-b.width/(2*r), a[2]+b.width/(2*r)], [a[3]-b.depth/2,a[3]+b.depth/2], [surface.height-.3,surface.height+b.height]];
    oldBoxes.set(a,result);
    return result;
  }
  const result=envelope(p, asset(type).vertices.map(v => v.map(n => n*a[4])));
  oldBoxes.set(a,result);
  return result;
}

function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}

test('exact 38 unique interior types and stable IDs; scale 4; deterministic fresh output', () => {
  assert.equal(baseline.length,435, 'original world records retained');
  assert.equal(placements.length,38);
  const expected = completedModels.filter(m => m.materialKit !== 'structure');
  assert.equal(new Set(placements.map(p => p.type)).size,38);
  assert.equal(new Set(placements.map(p => p.id)).size,38);
  assert.deepEqual(placements.map(p => p.type).sort(),expected.map(m => m.id).sort());
  for (const p of placements) {
    assert.equal(p.id,`completed-model-${modelById.get(p.type).slug}`);
    for (const n of [p.theta,p.z,p.rotation,p.scale,p.surface.height]) assert.ok(Number.isFinite(n));
    assert.equal(p.scale,4);
    assert.ok(p.label && p.zone && p.sourceFacts.length && p.layoutInterpretation);
    if(p.surface.deckId === 'ground') {
      assert.equal(p.surface.height,-.05);
      assert.equal(p.surface.anchorHeight,0);
    }
  }
  const frozen = deepFreeze(structuredClone(world));
  const before = JSON.stringify(frozen);
  assert.deepEqual(interiorModelPlacements(frozen), placements);
  const applied=structuredClone(world);
  for(const p of placements) {
    let index=applied.assetTypes.indexOf(p.type);
    if(index<0) {index=applied.assetTypes.length;applied.assetTypes.push(p.type);}
    applied.assets.push([p.id,index,p.theta,p.z,p.scale,p.rotation,null,p.surface]);
  }
  assert.deepEqual(interiorModelPlacements(applied),placements,'identical poses before/after application');
  assert.equal(JSON.stringify(frozen), before, 'no world/grid/terrace/record mutation');
  const output = interiorModelPlacements(frozen);
  output[0].sourceFacts.push('local edit');
  output[0].reservation.boundsMeters[0][0] = 999;
  assert.deepEqual(interiorModelPlacements(frozen), placements, 'caller cannot corrupt layout');
  assert.throws(() => interiorModelPlacements({assets:[],terraces:{decks:[]}}), /Missing required existing deck/);
});

test('reservations equal actual normalized manifests AND actual scaled OBJ extrema', () => {
  for(const p of placements) {
    const a = asset(p.type);
    assert.deepEqual(p.reservation.boundsMeters, a.raw.actualModelBoundsMeters, p.type);
    const actual = [0,1,2].map(i => [Math.min(...a.vertices.map(v=>v[i]*4)),Math.max(...a.vertices.map(v=>v[i]*4))]);
    actual.forEach((b,i) => b.forEach((n,j) => assert.ok(Math.abs(n-p.reservation.boundsMeters[i][j])<1e-5, `${p.type} axis ${i}`)));
  }
});

test('every transformed vertex and conservative bound corner remains inside the 65 m tube', () => {
  for(const p of placements) {
    const vertices = [...asset(p.type).vertices.map(v=>v.map(n=>n*4)), ...corners(p.reservation.boundsMeters)];
    for(const v of vertices) {
      const q = pose(p,v);
      assert.ok(q.height*q.height + q.z*q.z < 65*65, `${p.id}: outside tube at ${JSON.stringify(q)}`);
    }
  }
});

test('Farm A complete geometry fits existing deck bands/sectors, avoids stairs and overhead slabs', () => {
  for(let i=0;i<placements.length;i++) {
    const p=placements[i], box=boxes[i];
    if(!p.surface.deckId.startsWith('farm-a-')) continue;
    const d=world.terraces.decks.find(d=>d.id===p.surface.deckId);
    assert.ok(box[0][0]>=d.start && box[0][1]<=d.end, p.id+' sector');
    assert.ok(d.bands.some(([lo,hi])=>box[1][0]>=lo && box[1][1]<=hi),p.id+' band');
    assert.equal(p.surface.anchorHeight,d.height);
    if(!p.overlapAllowance) assert.equal(p.surface.height,d.height-.05);
    for(const s of world.terraces.stairs) {
      if(s.upper !== d.id && s.lower !== d.id) continue;
      assert.ok(!overlap(box.slice(0,2),[[s.start,s.end],[s.z-s.width/2,s.z+s.width/2]]),p.id+' stair '+s.id);
    }
    for(const upper of world.terraces.decks) {
      if(upper.id===d.id || upper.height<=d.height) continue;
      for(const band of upper.bands) {
        const slab=[[upper.start,upper.end],band,[upper.height-.4,upper.height]];
        assert.ok(!overlap(box,slab),p.id+' slab '+upper.id);
      }
    }
    assert.ok((box[0][1]-d.start)*(830-d.height)<50, p.id+' precedes existing plot reservations');
  }
});

test('no new-new overlap except precisely named fish/tank nesting; no intersection with any original record', () => {
  for(let i=0;i<placements.length;i++) {
    for(let j=i+1;j<placements.length;j++) {
      if(!overlap(boxes[i],boxes[j])) continue;
      const a=placements[i],b=placements[j];
      assert.ok(a.overlapAllowance?.with===b.id || b.overlapAllowance?.with===a.id, `${a.id} intersects ${b.id}`);
    }
    for(const a of baseline) assert.ok(!overlap(boxes[i],oldBox(a)),`${placements[i].id} intersects original ${a[0]}`);
  }
});

test('shared courtyard, service-front aisles, farm apron routes and original stair mouths stay clear', () => {
  for(const route of interiorLayout.routes) {
    const deck=route.deckId && world.terraces.decks.find(d=>d.id===route.deckId);
    const height=deck?.height ?? route.height, r=830-height, anchor=deck?.start ?? route.anchor;
    const box=[[anchor+route.x[0]/r,anchor+route.x[1]/r],route.z,[height-.4,height+2.2]];
    if(deck) {
      assert.ok(deck.bands.some(([lo,hi])=>route.z[0]>=lo && route.z[1]<=hi),route.id+' supported band');
      assert.ok(box[0][0]>=deck.start && box[0][1]<=deck.end,route.id+' supported sector');
      for(const s of world.terraces.stairs.filter(s=>s.upper===deck.id)) {
        assert.ok(!overlap(box.slice(0,2),[[s.start,s.end],[s.z-s.width/2,s.z+s.width/2]]),route.id+' crosses stair hole');
      }
    }
    for(let i=0;i<placements.length;i++) {
      if(route.allowed.includes(modelById.get(placements[i].type).slug)) continue;
      assert.ok(!overlap(box,boxes[i]),`${placements[i].id} blocks ${route.id}`);
    }
    for(const a of baseline) assert.ok(!overlap(box,oldBox(a)),`${a[0]} already blocks ${route.id}`);
  }
  // Farm stair approaches on both landings, outside the stair's cut itself.
  for(const s of world.terraces.stairs) for(const deckId of [s.upper,s.lower]) {
    const deck=world.terraces.decks.find(d=>d.id===deckId);
    const margin=1.5/(830-deck.height);
    const box=[[s.start-margin,s.end+margin],[s.z-s.width/2-1,s.z+s.width/2+1],[deck.height-.4,deck.height+2.2]];
    for(let i=0;i<placements.length;i++) assert.ok(!overlap(box,boxes[i]),`${placements[i].id} blocks ${s.id} approach`);
  }
});

test('vehicles park beside road/shelter, nature borders remain outside entries, no fake upper connection', () => {
  const get=slug=>placements.find(p=>p.id===`completed-model-${slug}`);
  for(const slug of ['buses','utility-carts','bicycles']) {
    const p=get(slug),road=get('roads');
    assert.ok(Math.abs(p.theta-road.theta)*830<13);
    assert.ok(Math.abs(p.z-road.z)<7);
    assert.ok(!overlap(boxes[placements.indexOf(p)],boxes[placements.indexOf(road)]));
  }
  for(const slug of ['bridges','stairs-ramps']) {
    const p=get(slug);
    assert.equal(p.surface.deckId,'ground');
    assert.match(p.layoutInterpretation,/no connection to an invented upper terrace/);
    assert.equal(p.rotation,Math.PI/2, 'long route runs around major circle');
  }
  const fish=get('fish'),tank=get('aquaculture-tanks');
  const f=fish.reservation.boundsMeters;
  assert.equal(fish.overlapAllowance.with,tank.id);
  assert.ok(Math.abs((fish.surface.height-tank.surface.height)-1.13)<1e-10);
  // Entire fish footprint is inside the 1.22 m open left tank radius. Center
  // is displaced .6 m forward from the inlet. Opaque water lies below it.
  for(const x of f[0]) for(const z of f[2]) assert.ok(Math.hypot(x,z+.6)<1.22);
  assert.ok(fish.surface.height+f[1][0]>tank.surface.height+1.12);
  assert.ok(fish.surface.height+f[1][1]<tank.surface.height+1.5);
});

test('actual bridge, ramp, greenhouse and barn triangles retain floors and headroom on interior routes', () => {
  // Geometry proof, not a gameplay-controller claim. Cast actual OBJ triangle
  // rays through center-line samples in metres; props in other records were
  // already excluded using full bounds above.
  const samples = {
    'TorusTransport_BridgeA': [[0, -4.8], [0,-2], [0,0], [0,2], [0,4.8]],
    'TorusTransport_StairsRampA': [[-1.2,5.5],[-1.2,3.5],[-1.2,1],[-1.2,-6],[1.2,7],[1.2,4],[1.2,0],[1.2,-4],[1.2,-7.8]],
    'TorusAgri_GreenhouseA': [[0,3.85],[0,2],[0,0],[0,-2]],
    'TorusAgri_AnimalHousingA': [[0,3.85],[0,2],[0,0],[0,-2]],
  };
  for(const model of completedModels.filter(m=>m.materialKit==='utility')) {
    samples[model.id]=[-3.2,0,3.2].flatMap(x=>[1.7,2.1,2.5].map(z=>[x,z]));
  }
  for(const [type,points] of Object.entries(samples)) {
    const model=new OBJLoader().parse(asset(type).text);
    model.scale.setScalar(4); model.updateMatrixWorld(true);
    model.traverse(o=>{if(o.isMesh)o.material.side=THREE.DoubleSide;});
    const ray=new THREE.Raycaster();
    for(const [x,z] of points) {
      ray.set(new THREE.Vector3(x,2.3,z),new THREE.Vector3(0,-1,0));
      const floor=ray.intersectObject(model,true).filter(h=>h.point.y>=-.001 && h.point.y<2.2)[0];
      assert.ok(floor,`${type} missing floor at ${x},${z}`);
      ray.set(new THREE.Vector3(x,floor.point.y+.02,z),new THREE.Vector3(0,1,0));
      const above=ray.intersectObject(model,true)[0];
      assert.ok(!above || above.point.y-floor.point.y>2.2,`${type} obstructed headroom ${x},${z}`);
    }
  }
});
