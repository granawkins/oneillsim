import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {planCapacityFarmLayers,createCapacityFarmLayers,subtractFarmMasks,farmOpeningContains} from '../src/capacity-farm-layers.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';
const file=new URL('../world.json',import.meta.url), bytes=fs.readFileSync(file),world=JSON.parse(bytes);
const sha=b=>createHash('sha256').update(b).digest('hex');
const rect=p=>[p.thetaStart,p.thetaEnd,p.zMin,p.zMax];
const area=r=>(r[1]-r[0])*(r[3]-r[2]);
const overlap=(a,b)=>Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[2],b[2]));
const point=(t,z,h)=>new THREE.Vector3((830-h)*Math.cos(t),(830-h)*Math.sin(t),z);
const frozen=object=>{if(object&&typeof object==='object'){Object.values(object).forEach(frozen);Object.freeze(object);}return object;};

test('pure deterministic plan preserves exact world bytes, A seven decks and all 142 original farm IDs',()=>{
 const before=JSON.stringify(world),input=frozen(JSON.parse(before)),plan=planCapacityFarmLayers(input);
 assert.deepEqual(plan,planCapacityFarmLayers(input));assert.equal(JSON.stringify(world),before);
 assert.equal(sha(fs.readFileSync(file)),sha(bytes));
 assert.equal(sha(bytes),'30fa3a8784133571c948aa44425db43087197c18033d095d3b706675be83b3fb');
 assert.equal(world.terraces.decks.filter(d=>d.id.startsWith('farm-a-')).length,7);
 const plots=world.assets.filter(a=>world.assetTypes[a[1]].startsWith('TorusSettlementFarm'));
 assert.equal(plots.filter(a=>a[7]?.districtId==='farm-a').length,78);
 assert.equal(plots.filter(a=>['farm-b','farm-c'].includes(a[7]?.districtId)).length,64);
 assert.equal(plan.decks.length,6);assert.equal(plan.stairs.length,6);assert.equal(plan.groundOpenings.length,2);
 assert.ok(plan.decks.every(d=>d.cutGround===false));assert.equal(plan.summary.compliant,false);
 assert.ok(plan.layerViews.every(v=>plan.decks.find(d=>d.id===v.id)?.height===v.height));
});

test('exact crop masks disjoint from categories, holes, six-metre routes; no gross-to-net credit',()=>{
 const plan=planCapacityFarmLayers(world);assert.deepEqual(subtractFarmMasks([[0,10,0,10]],[[2,8,2,8],[2,8,2,8]]).reduce((s,r)=>s+area(r),0),64);
 for(const d of plan.decks){
  const patches=plan.patches.filter(p=>p.deckId===d.id);
  for(let i=0;i<patches.length;i++){
   const p=patches[i],q=rect(p);
   assert.ok(Math.abs(p.netAreaM2-area(q)*d.radius)<1e-7);
   assert.ok(q[0]>=d.start&&q[1]<=d.end&&q[2]>=-d.halfWidth&&q[3]<=d.halfWidth);
   assert.equal(overlap(q,[d.start,d.end,-3,3]),0);
   for(const h of d.holes)assert.equal(overlap(q,rect(h)),0);
   for(let j=i+1;j<patches.length;j++)assert.ok(overlap(q,rect(patches[j]))<1e-14,'overlapping categories');
  }
 }
 for(const row of plan.summary.districts){
  assert.ok(row.baselineNetCropM2<row.baselineKnownCropGrossM2);assert.equal(row.baselineNetCreditTowardNewLayersM2,0);
  assert.ok(row.newNetCropBedM2>442000/3);assert.equal(row.conservativeCropDeficitM2,0);
  assert.ok(Math.abs(Object.values(row.newSourceCategoryAreasM2).reduce((s,n)=>s+n,0)-row.newNetCropBedM2)<1e-6);
  assert.ok(Math.abs(row.floorAfterHolesM2-row.newNetCropBedM2-row.newServiceTotalM2-row.circulationAndUnallocatedM2)<1e-6);
 }
 // Entry only: no baseline crop/animal/landscape parcel reservation is cut.
 for(const h of plan.groundOpenings)for(const a of world.assets.filter(a=>a[7]?.districtId===h.id.slice(9,15))){
  const type=world.assetTypes[a[1]];if(!type.startsWith('TorusSettlementFarm'))continue;
  const m=JSON.parse(fs.readFileSync(new URL(`../assets/ultimate-buildings/${type}.asset.json`,import.meta.url)));
  const r=m.intrinsicReservation,scale=a[4]*(m.objCoordinateScale??.25);
  assert.equal(overlap(rect(h),[a[2]-r.width*scale/1660,a[2]+r.width*scale/1660,a[3]-r.depth*scale/2,a[3]+r.depth*scale/2]),0);
 }
});

test('baseline footprint extraction agrees with actual OBJ canopy triangles, not parcel gross',()=>{
 const plan=planCapacityFarmLayers(world),actual={},cache=new Map();
 for(const a of world.assets){
  const type=world.assetTypes[a[1]],meta=a[7]||{},category=meta.sourcePlot?.category||type.replace('TorusSettlementFarm_','').toLowerCase();
  if(!['sorghum','soybeans','wheat','rice','corn','vegetables'].includes(category)||!type.startsWith('TorusSettlementFarm_'))continue;
  const key=type+':'+category;let net=cache.get(key);
  if(net===undefined){
   const manifest=JSON.parse(fs.readFileSync(new URL(`../assets/ultimate-buildings/${type}.asset.json`,import.meta.url)));
   const radius=manifest.intrinsicReservation.radius,positions=[],uvs=[];let group='',sum=0;
   const targetTile={wheat:2,sorghum:3,soybeans:4,vegetables:5,corn:6,rice:7}[category];
   for(const line of fs.readFileSync(new URL(`../assets/ultimate-buildings/${type}.obj`,import.meta.url),'utf8').split('\n')){
    const [tag,...values]=line.trim().split(/\s+/);
    if(tag==='v')positions.push(values.map(Number));
    else if(tag==='vt')uvs.push(values.map(Number));
    else if(tag==='g')group=values[0];
    else if(tag==='f'&&group==='ornament'){
     const face=values.map(v=>v.split('/').map(Number)),uv=uvs[face[0][1]-1];
     const tile=Math.floor(uv[0]*4)+4*Math.floor((1-uv[1])*4);if(tile!==targetTile)continue;
     const p=face.map(v=>positions[v[0]-1]).map(v=>[radius*Math.atan2(v[0]*4,radius-v[1]*4),v[2]*4]);
     sum+=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1]))/2;
    }
   }
   net=sum;cache.set(key,net);
  }
  actual[meta.districtId]=(actual[meta.districtId]||0)+net;
 }
 assert.equal(plan.existingBedLedger.unknownIds.length,0);assert.equal(plan.existingBedLedger.overlaps.length,0);
 for(const [districtId,net] of Object.entries(actual))assert.ok(Math.abs(plan.existingBedLedger.districts[districtId].netCropFootprintM2-net)<.02,districtId+' OBJ footprint mismatch');
 assert.equal(plan.summary.settlementConservativeCropDeficitM2,0);assert.ok(plan.sourceBudgets.cropCategoryLedger.every(r=>r.conservativeDeficitM2===0));console.log(JSON.stringify({baselineOBJFootprints:actual,summary:plan.summary,cropCategoryLedger:plan.sourceBudgets.cropCategoryLedger}));
});

test('unsupported baseline transforms remain unknown; repeated masks are unioned without extra net credit',()=>{
 const copy=JSON.parse(JSON.stringify(world)),original=copy.assets.find(a=>a[0]==='settlement-farm-b-wheat-south-1');
 const baseline=planCapacityFarmLayers(copy).existingBedLedger.districts['farm-b'].netCropFootprintM2;
 const duplicate=JSON.parse(JSON.stringify(original));duplicate[0]='test-duplicate-crop';copy.assets.push(duplicate);
 const doubled=planCapacityFarmLayers(copy);assert.ok(doubled.existingBedLedger.overlaps.length>0);
 assert.ok(Math.abs(doubled.existingBedLedger.districts['farm-b'].netCropFootprintM2-baseline)<1e-6);
 duplicate[5]=.3;const unknown=planCapacityFarmLayers(copy);assert.ok(unknown.existingBedLedger.unknownIds.includes(duplicate[0]));
 assert.ok(Math.abs(unknown.existingBedLedger.districts['farm-b'].netCropFootprintM2-baseline)<1e-6);
});

test('actual THREE surfaces fit circular tube; pooled draw/collision budgets and lifecycle',()=>{
 const habitatGroup=new THREE.Group(),runtime=createCapacityFarmLayers({habitatGroup,world});
 let triangles=0,calls=0;
 runtime.group.traverse(o=>{if(!o.isMesh)return;calls++;const p=o.geometry.attributes.position;triangles+=(o.geometry.index?.count??p.count)/3;
  for(let i=0;i<p.count;i++)assert.ok(Math.hypot(Math.hypot(p.getX(i),p.getY(i))-830,p.getZ(i))<=65.001,`${o.name} exceeds tube`);
 });
 assert.equal(triangles,runtime.stats.triangles);assert.equal(calls,runtime.stats.drawCalls);
 assert.ok(triangles<=120000,`triangle budget ${triangles}`);assert.ok(calls<=80);
 assert.equal(new Set(runtime.colliders.map(c=>c.id)).size,runtime.colliders.length);
 assert.ok(runtime.colliders.every(c=>c.id.startsWith('capacity-farm-')&&c.object.userData.collisionMode==='solid'));
 assert.ok(runtime.stats.rendererData.filter(r=>/crop|lighting|greenhouse/.test(r.id)).every(r=>!r.blocking));
 runtime.dispose();runtime.dispose();assert.equal(habitatGroup.children.length,0);
 console.log(JSON.stringify({triangles,calls,colliders:runtime.stats.colliderCount,collisionTriangles:runtime.stats.colliderTriangles}));
});

test('every stair flight has actual 2.2m radial headroom through its upper opening',()=>{
 const runtime=createCapacityFarmLayers({habitatGroup:new THREE.Group(),world});
 const ray=new THREE.Raycaster();ray.far=2.2;ray.near=.02;
 for(const s of runtime.plan.stairs)for(let i=0;i<s.steps;i++){
  const theta=s.start+(s.end-s.start)*(i+.5)/s.steps,height=s.upperHeight-s.riser*(i+1);
  const origin=point(theta,s.z,height+.01),up=new THREE.Vector3(-Math.cos(theta),-Math.sin(theta),0);
  ray.set(origin,up);assert.equal(ray.intersectObjects(runtime.colliders.map(c=>c.object),false).length,0,s.id+' obstructed headroom at step '+i);
 }
 runtime.dispose();
});

function setup(){const habitatGroup=new THREE.Group(),runtime=createCapacityFarmLayers({habitatGroup,world}),cw=new ColliderWorld();
 for(const c of runtime.colliders)cw.setObject(c.id,c.object,habitatGroup);return {runtime,cw};}
function walk(controller,t,z){
 for(let i=0;i<2500;i++){
  let theta=Math.atan2(controller.position.y,controller.position.x);if(theta<0)theta+=2*Math.PI;
  const arc=(t-theta)*Math.hypot(controller.position.x,controller.position.y),dz=z-controller.position.z;
  if(Math.hypot(arc,dz)<.12){for(let j=0;j<30;j++)controller.tick(new THREE.Vector3());return;}
  const direction=new THREE.Vector3(-Math.sin(theta)*arc,Math.cos(theta)*arc,dz).normalize();controller.tick(direction);
 }
 assert.fail('controller route stalled '+JSON.stringify(controller.position.toArray()));
}

test('continuous spoke ground -> all three real stairs -> ground; radius-aware analytic-ground fallback',()=>{
 const {runtime,cw}=setup();const results=[];
 for(const districtId of ['farm-b','farm-c']){
  const center=world.masterPlan.districts.find(d=>d.id===districtId).center;
  let controller;
  // The controller treats analytic ground as a solid radial half-space, not a sheet.
  // Disable that half-space ONLY when already below it, never all world ground.
  controller=new CharacterController(cw,{groundExists:(theta,z)=>
   Math.hypot(controller.position.x,controller.position.y)<=830.3&&!runtime.plan.groundOpenings.some(h=>farmOpeningContains(h,theta,z))});
  controller.teleport(point(center,0,20));for(let j=0;j<400;j++)controller.tick(new THREE.Vector3());
  assert.ok(Math.abs(830-Math.hypot(controller.position.x,controller.position.y))<.02,'ordinary fall must land on untouched ground');assert.ok(controller.grounded);
  walk(controller,center+13/830,0);walk(controller,center+13/830,6.5);
  const stairs=runtime.plan.stairs.filter(s=>s.districtId===districtId);
  for(const s of stairs){walk(controller,s.start-.6/(830-s.upperHeight),s.z);walk(controller,s.end+1/(830-s.lowerHeight),s.z);
   const h=830-Math.hypot(controller.position.x,controller.position.y);
   assert.ok(Math.abs(h-s.lowerHeight)<.08,`${s.id} down height ${h}`);assert.ok(controller.grounded);assert.ok(controller.clear());
   results.push({id:s.id,direction:'down',height:h});
  }
  for(const s of [...stairs].reverse()){
   walk(controller,s.end+1/(830-s.lowerHeight),s.z);walk(controller,s.start-.8/(830-s.upperHeight),s.z);
   const h=830-Math.hypot(controller.position.x,controller.position.y);
   assert.ok(Math.abs(h-s.upperHeight)<.08,`${s.id} up height ${h}`);assert.ok(controller.grounded);assert.ok(controller.clear());
   results.push({id:s.id,direction:'up',height:h});
  }
  walk(controller,center+13/830,0);walk(controller,center,0);assert.ok(controller.grounded);
 }
 console.log(JSON.stringify({controllerRoutes:results}));runtime.dispose();
});

test('entry-hole-only callback exposes existing controller half-space blocker, not false compliance',()=>{
 const {runtime,cw}=setup(),s=runtime.plan.stairs[0];
 const controller=new CharacterController(cw,{groundExists:(theta,z)=>!runtime.plan.groundOpenings.some(h=>farmOpeningContains(h,theta,z))});
 controller.teleport(point(s.start-.6/830,s.z,.001));for(let j=0;j<30;j++)controller.tick(new THREE.Vector3());
 walk(controller,s.end-1/840,s.z);
 const insideHeight=830-Math.hypot(controller.position.x,controller.position.y);assert.ok(insideHeight<-9);
 walk(controller,s.end+2/840,s.z);
 const outsideHeight=830-Math.hypot(controller.position.x,controller.position.y);assert.ok(outsideHeight>-.05);
 console.log(JSON.stringify({integrationBlocker:'entry-hole-only fallback projects below-deck feet back onto ground',insideHeight,outsideHeight}));runtime.dispose();
});
