import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Vector3, Ray} from 'three';
import {buildResidentialA, residentialAGeometry as G, residentialAPlacedBounds, decodeResidentialARecord} from '../src/settlement-residential-a.js';

const root=new URL('../',import.meta.url), read=p=>fs.readFileSync(new URL(p,root),'utf8');
const raw=read('assets/settlement-source-world.json'), world=JSON.parse(raw);
const original=JSON.parse(read('assets/district-source-world.json'));
const baseline=world.assets.map(a=>decodeResidentialARecord(a,world));
const byId=new Map(baseline.map(a=>[a.id,a]));
const output=buildResidentialA(world), additions=output.additions;
const cache=new Map();
function obj(type) {
  if(cache.has(type))return cache.get(type);
  const family=type.startsWith('TorusNature_')?'ultimate-nature':'ultimate-buildings';
  const v=[],faces=[];
  for(const l of read(`assets/${family}/${type}.obj`).split('\n')) {
    if(l.startsWith('v '))v.push(l.split(/\s+/).slice(1).map(x=>Number(x)*4));
    if(l.startsWith('f ')) {const ids=l.split(/\s+/).slice(1).map(x=>Number(x.split('/')[0])-1);for(let i=1;i<ids.length-1;i++)faces.push([ids[0],ids[i],ids[i+1]]);}
  }
  const triangles=faces.map(ids=>ids.map(i=>new Vector3(...v[i])));
  const result={v,triangles};cache.set(type,result);return result;
}
function actualPoints(p) {
  const r=830-p.surface.height,c=Math.cos(p.rotation||0),s=Math.sin(p.rotation||0);
  return obj(p.type).v.map(([x,y,z])=>{
    const X=x*c+z*s,Z=z*c-x*s;
    return [p.theta+Math.atan2(X,r-y),830-Math.hypot(X,r-y),p.z+Z];
  });
}
function bbox(v){return {min:[0,1,2].map(i=>Math.min(...v.map(a=>a[i]))),max:[0,1,2].map(i=>Math.max(...v.map(a=>a[i])))};}
function intersects(a,b){return [0,1,2].every(i=>a.min[i]<b.max[i]-1e-8&&a.max[i]>b.min[i]+1e-8);}
function planeOverlap(a,b){return [0,2].every(i=>a.min[i]<b.max[i]-1e-8&&a.max[i]>b.min[i]+1e-8);}
function intrinsicBox(p,min,max){const r=830-p.surface.height;return {min:[p.theta+min[0]/r,p.surface.height+min[1],p.z+min[2]],max:[p.theta+max[0]/r,p.surface.height+max[1],p.z+max[2]]};}
function close(a,b,epsilon=1e-5){assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);}
function freeze(o){if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(freeze);}return o;}
// Radial ray against the REAL exported curved OBJ triangles, not an assumed roof.
function supportAt(p,theta,z) {
  const r=830-p.surface.height,a=theta-p.theta, y=G.kit[p.type].height+2;
  const ray=new Ray(new Vector3((r-y)*Math.sin(a),r-(r-y)*Math.cos(a),z-p.z),new Vector3(Math.sin(a),-Math.cos(a),0));
  let nearest=Infinity,point=null;
  const hit=new Vector3();
  for(const t of obj(p.type).triangles) {
    if(ray.intersectTriangle(...t,false,hit)) {
      const d=hit.distanceTo(ray.origin);
      if(d<nearest){nearest=d;point=hit.clone();}
    }
  }
  assert.ok(point,`Missing actual floor ${p.id} at ${theta}, ${z}`);
  return 830-Math.hypot(point.x,r-point.y);
}

test('immutable baseline, all 297 conserved IDs, deterministic additive contract',()=>{
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591');
  assert.equal(baseline.length,482);
  const frozen=freeze(JSON.parse(raw));
  assert.deepEqual(buildResidentialA(frozen),output);
  assert.deepEqual(frozen,world);
  assert.equal(baseline.filter(a=>/^residential-a-\d+$/.test(a.id)).length,297);
  for(const key of ['replacements','decks','stairs'])assert.deepEqual(output[key],[]);
  assert.ok(additions.length>=300);
  assert.equal(new Set(additions.map(a=>a.id)).size,additions.length);
  assert.ok(additions.every(a=>a.id.startsWith('settlement-residential-a-')&&!byId.has(a.id)&&a.scale===4));
  assert.deepEqual(JSON.parse(JSON.stringify(output)),output);
  const combined=JSON.parse(raw);combined.assets.push(...additions);
  assert.equal(buildResidentialA(combined).additions.length,0,'idempotent after additive application');
  assert.deepEqual(world.assets,JSON.parse(raw).assets);
});

test('measured native prop bounds and exact existing landscape masks stay in sync',()=>{
  for(const [type,b] of Object.entries(G.props)) {
    const actual=bbox(obj(type).v);
    for(const k of ['min','max'])for(let i=0;i<3;i++)close(actual[k][i],b[k][i],1e-7);
  }
  for(const [type,spec] of Object.entries(G.kit)) {
    if(!['park','terrace','circulation','trees'].includes(spec.category))continue;
    const manifest=JSON.parse(read(`assets/ultimate-buildings/${type}.asset.json`));
    assert.deepEqual(spec.masks,manifest.collisionPaths);
    close(spec.width,manifest.dimensionsMetres.width);
    close(spec.depth,manifest.dimensionsMetres.depth);
  }
});

test('every actual vertex fits support band, curved-sector bounds and true tube',()=>{
  for(const a of additions) {
    const points=actualPoints(a), b=bbox(points), conservative=residentialAPlacedBounds(a);
    for(const v of points) {
      assert.ok(Math.hypot(v[1],v[2])<65,`tube ${a.id}`);
      for(let i=0;i<3;i++)assert.ok(v[i]>=conservative.min[i]-1e-7&&v[i]<=conservative.max[i]+1e-7,`conservative envelope ${a.id}/${i}`);
    }
    const deck=world.terraces.decks.find(d=>d.id===a.surface.deckId);
    assert.ok(b.min[0]>=deck.start&&b.max[0]<=deck.end,a.id);
    assert.ok(deck.bands.some(([lo,hi])=>b.min[2]>=lo&&b.max[2]<=hi),a.id);
    assert.ok(b.max[1]<0,'height-zero overhead promenade stays clear');
  }
});

test('feet rest on actual curved landscape triangles, never suspended origins or guessed roofs',()=>{
  let samples=0;
  for(const a of additions) {
    const p=byId.get(a.surface.supportAssetId), spec=G.kit[p.type];
    assert.ok(['park','terrace'].includes(spec.category));
    close(a.surface.anchorHeight,p.surface.height+spec.height);
    close(a.surface.height,a.surface.anchorHeight-.05);
    const floor=supportAt(p,a.theta,a.z);
    close(floor,a.surface.anchorHeight,.001);
    const feet=actualPoints(a).filter((_,i)=>obj(a.type).v[i][1]<.001);
    assert.ok(feet.length>0);
    // All foot vertices use the same actual support, including rotated props.
    for(const [theta,h,z] of feet) {
      const top=supportAt(p,theta,z);
      assert.ok(top-h>=.048&&top-h<.061,`grounding ${a.id}: ${top-h}`);samples++;
    }
  }
  assert.ok(samples>1000);
});

test('no additions overlap each other, conserved buildings/trees, or baked garden furniture',()=>{
  const boxes=additions.map(residentialAPlacedBounds);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(!intersects(boxes[i],boxes[j]),`${additions[i].id} / ${additions[j].id}`);
  const originalRecords=original.assets.filter(a=>/^residential-a-\d+$/.test(a[0]));
  assert.equal(originalRecords.length,297);
  for(const record of originalRecords) {
    const p=byId.get(record[0]), spec=G.kit[p.type], old=record[6];
    close(spec.width,old.width);close(spec.depth,old.depth); // conserved allocation
    if(!['park','terrace','circulation'].includes(spec.category)) {
      const actual=bbox(actualPoints(p));
      for(let j=0;j<boxes.length;j++)assert.ok(!intersects(actual,boxes[j]),`actual curved OBJ ${p.id} / ${additions[j].id}`);
      const b=intrinsicBox(p,spec.bounds.min,spec.bounds.max);
      for(let j=0;j<boxes.length;j++)assert.ok(!intersects(b,boxes[j]),`conserved parcel ${p.id} / ${additions[j].id}`);
      if(spec.category!=='trees') {
        const entrance=intrinsicBox(p,[-spec.width/2-1.5,0,-spec.depth/2-1.5],[spec.width/2+1.5,spec.height,spec.depth/2+1.5]);
        for(let j=0;j<boxes.length;j++)assert.ok(!intersects(entrance,boxes[j]),`entrance/stair access ${p.id}`);
      }
    }
    for(const o of spec.masks.obstacles||[]) {
      const b=intrinsicBox(p,...o.boundsIntrinsic);
      for(let j=0;j<boxes.length;j++)assert.ok(!intersects(b,boxes[j]),`baked obstacle ${p.id}`);
    }
  }
});

test('all original public masks and metadata routes remain completely clear',()=>{
  for(const a of additions) {
    const p=byId.get(a.surface.supportAssetId), spec=G.kit[p.type],b=residentialAPlacedBounds(a),r=830-p.surface.height;
    const lo=(b.min[0]-p.theta)*r,hi=(b.max[0]-p.theta)*r,zlo=b.min[2]-p.z,zhi=b.max[2]-p.z;
    for(const m of spec.masks.clearRoutes) {
      if(m.zRange)assert.ok(zhi<=m.zRange[0]-.349||zlo>=m.zRange[1]+.349,a.id);
      if(m.xRange)assert.ok(hi<=m.xRange[0]-.349||lo>=m.xRange[1]+.349,a.id);
      for(const [x1,x2] of m.intrinsicXStripes||[])assert.ok(hi<=x1-.349||lo>=x2+.349,a.id);
    }
  }
  for(const route of output.routes) {
    assert.ok(route.width>=1.8);
    assert.ok(route.points.every(p=>p.length===3&&p.every(Number.isFinite)));
    assert.ok(world.terraces.decks.some(d=>d.id===route.deckId));
    const [a,b]=route.points,r=830-a[2],half=route.width/2;
    const box={min:[Math.min(a[0],b[0])-(a[0]===b[0]?half/r:0),a[2]-.1,Math.min(a[1],b[1])-(a[1]===b[1]?half:0)],
      max:[Math.max(a[0],b[0])+(a[0]===b[0]?half/r:0),a[2]+2.2,Math.max(a[1],b[1])+(a[1]===b[1]?half:0)]};
    for(const item of additions)assert.ok(!intersects(box,residentialAPlacedBounds(item)),`route ${route.id}/${item.id}`);
    if(route.supportAssetId) {
      const p=byId.get(route.supportAssetId);
      for(const t of [.01,.25,.5,.75,.99])close(supportAt(p,a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])),a[2],.001);
    }
  }
  assert.equal(output.routes.filter(a=>a.role==='terrace-edge-public-route').length,4);
  assert.equal(output.routes.filter(a=>a.id.includes('-cross-')).length,26);
});

test('overhead slab headroom, complete stair approaches and varied garden-room inventory',()=>{
  for(const a of additions) {
    const b=residentialAPlacedBounds(a);
    for(const d of world.terraces.decks) {
      if(d.height<=a.surface.anchorHeight+.1)continue;
      const footprint={min:[d.start,d.height-1,d.bands[0][0]],max:[d.end,d.height,d.bands.at(-1)[1]]};
      if(planeOverlap(b,footprint)&&d.bands.some(([lo,hi])=>b.max[2]>lo&&b.min[2]<hi))assert.ok(d.height-b.max[1]>2.2,a.id);
    }
    for(const stair of world.terraces.stairs) {
      assert.ok(b.max[0]<=stair.start-4/(830-a.surface.anchorHeight)||b.min[0]>=stair.end+4/(830-a.surface.anchorHeight)||
        b.max[2]<=stair.z-stair.width/2-2||b.min[2]>=stair.z+stair.width/2+2,a.id);
    }
  }
  const inventory={};for(const a of additions)inventory[a.type]=(inventory[a.type]||0)+1;
  assert.deepEqual(inventory,output.summary.inventory);
  assert.ok(inventory.TorusNature_TreeA>=10);
  assert.ok(inventory.TorusNature_PondA>=4);
  assert.ok(inventory.TorusNature_FlowersA>=100);
  assert.ok(inventory.TorusNature_ShrubA>=30);
  assert.ok(inventory.TorusBench_A>=30);
  assert.ok(inventory.TorusTable_A>=4);
  assert.ok(inventory.TorusPlanter_A>=15);
  for(const deckId of ['residential-a-basin','residential-a-middle','residential-a-outer'])assert.ok(additions.some(a=>a.surface.deckId===deckId));
  assert.ok(output.landmarks.length>=4);
  assert.ok(output.landmarks.every(a=>a.description));
});
