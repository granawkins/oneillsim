import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';
import {planCapacityResidentialLayers,createCapacityResidentialLayers,residentialLayerPoint,openingContains,residentialGroundExists,residentialInteriorFloorArea} from '../src/capacity-residential-layers.js';
const root=new URL('../',import.meta.url),world=JSON.parse(fs.readFileSync(new URL('world.json',root))),original=JSON.stringify(world);
const overlap=(a,b)=>Math.min(a[1],b[1])-Math.max(a[0],b[0])>1e-7&&Math.min(a[3],b[3])-Math.max(a[2],b[2])>1e-7;
const runtime=createCapacityResidentialLayers({world,habitatGroup:new THREE.Group()}),plan=runtime.plan;
const polar=p=>{let theta=Math.atan2(p.y,p.x);if(theta<0)theta+=2*Math.PI;return [theta*830,p.z,830-Math.hypot(p.x,p.y)];};
test('pure, deterministic, preserves every original ID and metadata',()=>{
 assert.equal(JSON.stringify(world),original);assert.deepEqual(planCapacityResidentialLayers(world),plan);
 assert.equal(plan.housing.every(h=>['residential-b','residential-c'].includes(h.districtId)),true);
 assert.equal(plan.groundOpenings.length,2);assert.ok(plan.layerViews.length>10);
 assert.equal(plan.sourceBudgets.housingIncludingAccessM2,490000);assert.equal(plan.sourceBudgets.indoorInterpretationM2,370000);
 for(const id of ['residential-b','residential-c']){assert.ok(plan.summary[id].housingIndoorFloorM2>100000);assert.ok(plan.summary[id].publicOpenM2>=33335-1e-6);assert.ok(plan.summary[id].serviceAccess);}
});
test('exact room polygons, not model counts, determine disjoint indoor floor ledgers',()=>{
 let total=0;
 for(const h of [...plan.housing,...plan.services]){let sum=0;for(const r of h.rooms){const [a,b,c,d]=r.rect,m2=residentialInteriorFloorArea(r.rect,h.height);assert.ok(Math.abs(r.areaM2-m2)<1e-7);sum+=m2;assert.ok(b>a&&d>c);assert.ok(r.rect[0]>h.rect[0]&&r.rect[1]<h.rect[1]);}assert.ok(Math.abs(sum-h.indoorFloorM2)<1e-6);total+=sum;}
 assert.ok(Math.abs(total-plan.floorLedger.reduce((s,p)=>s+p.areaM2,0))<1e-6);
 assert.ok(Math.abs(total-plan.summary.total.housingIndoorFloorM2-plan.summary.total.serviceIndoorFloorM2)<1e-6);
 for(const [i,a] of plan.floorLedger.entries())for(const b of plan.floorLedger.slice(i+1))if(a.height===b.height)assert.ok(!overlap([a.intrinsicPolygon[0][0],a.intrinsicPolygon[1][0],a.intrinsicPolygon[0][1],a.intrinsicPolygon[2][1]],[b.intrinsicPolygon[0][0],b.intrinsicPolygon[1][0],b.intrinsicPolygon[0][1],b.intrinsicPolygon[2][1]]));
});
test('independent actor-triangle measurement matches every credited interior polygon',()=>{
 const totals=new Map(plan.floorLedger.map(r=>[r.id,0])),byHeight=new Map();
 for(const r of plan.floorLedger){const list=byHeight.get(r.height)||[];list.push(r);byHeight.set(r.height,list);}
 const triangle=new THREE.Triangle();
 for(const {object} of runtime.colliders){if(!['capacity-layer-floor','capacity-layer-service'].includes(object.name))continue;const pos=object.geometry.attributes.position;
  for(let i=0;i<pos.count;i+=3){const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(pos,i+j)),p=vertices.map(polar),height=Math.round((p[0][2]+p[1][2]+p[2][2])/3);if(!byHeight.has(height)||p.some(p=>Math.abs(p[2]-height)>.01))continue;
   const x=(p[0][0]+p[1][0]+p[2][0])/3,z=(p[0][1]+p[1][1]+p[2][1])/3;
   const mask=byHeight.get(height).find(r=>{const q=r.intrinsicPolygon;return x>q[0][0]+1e-5&&x<q[1][0]-1e-5&&z>q[0][1]+1e-5&&z<q[2][1]-1e-5;});
   if(mask)totals.set(mask.id,totals.get(mask.id)+triangle.set(...vertices).getArea());
  }
 }
 for(const r of plan.floorLedger)assert.ok(Math.abs(totals.get(r.id)-r.areaM2)<1e-5,r.id+' credited area differs from actor triangles');
});
test('public parks are disjoint from all saved full bounds, old routes, promenade, spoke and new buildings',()=>{
 for(const [i,p] of plan.publicSpaceMasks.entries()){
  for(const b of plan.preservedBounds)assert.ok(!overlap(p.rect,b.rect),p.id+' vs '+b.id);
  for(const q of plan.publicSpaceMasks.slice(i+1))assert.ok(!overlap(p.rect,q.rect));
  for(const h of plan.housing)assert.ok(!overlap(p.rect,h.rect));
  assert.ok(p.rect[3]<=-7||p.rect[2]>=7);
  for(const r of world.settlementDesign.routes||[])for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],w=(r.width||2)/2;assert.ok(!overlap(p.rect,[Math.min(a[0],b[0])*830-w,Math.max(a[0],b[0])*830+w,Math.min(a[1],b[1])-w,Math.max(a[1],b[1])+w]),p.id+' vs '+r.id);}
 }
 assert.ok(Math.abs(plan.publicSpaceMasks.reduce((s,p)=>s+p.areaM2,33330)-100000)<1e-5);
});
test('all actual finite triangle vertices satisfy tube envelope and preserved model bounds; bounded resources',()=>{
 assert.ok(runtime.stats.triangles<=200000);assert.ok(runtime.stats.drawCalls<=120);
 let count=0,maxCross=0;const cells=new Map();
 for(const b of plan.preservedBounds)for(let x=Math.floor(b.rect[0]/32);x<=Math.floor(b.rect[1]/32);x++)for(let z=Math.floor(b.rect[2]/16);z<=Math.floor(b.rect[3]/16);z++){const key=x+':'+z,list=cells.get(key)||[];list.push(b);cells.set(key,list);}
 for(const {object} of runtime.colliders){const p=object.geometry.attributes.position;assert.ok(p.count>0);for(let i=0;i<p.count;i++){
  const v=new THREE.Vector3().fromBufferAttribute(p,i);assert.ok(v.toArray().every(Number.isFinite));const [x,z,h]=polar(v);maxCross=Math.max(maxCross,Math.hypot(h,z));assert.ok(Math.hypot(h,z)<65.001);assert.ok(h<45.001);
  for(const b of cells.get(Math.floor(x/32)+':'+Math.floor(z/16))||[])assert.ok(!(x>b.rect[0]&&x<b.rect[1]&&z>b.rect[2]&&z<b.rect[3]&&h>b.bottom&&h<b.top),'new geometry vs '+b.id);
  count++;
 }}
 console.log(JSON.stringify({triangles:runtime.stats.triangles,drawCalls:runtime.stats.drawCalls,vertices:count,maxTubeCrossSection:maxCross,summary:plan.summary,deficits:plan.deficits}));
});
function collidersWithSavedModels(){
 const colliders=new ColliderWorld();for(const c of runtime.colliders)colliders.setObject(c.id,c.object);
 const loader=new OBJLoader(),cache=new Map();let loaded=0;
 for(const a of world.assets){const meta=a[7]||{};if(meta.worldTransform||meta.deckId==='exterior-structures')continue;if(!plan.preservedBounds.some(b=>b.id===a[0]&&b.rect[0]>=2.09*830))continue;
  const name=world.assetTypes[a[1]];let model;
  if(a[6]){const d=a[6];model=new THREE.Mesh(new THREE.BoxGeometry(d.width,d.height,d.depth));model.geometry.translate(0,d.height/2,0);}else{
   if(!cache.has(name)){const f=['assets/ultimate-buildings/','assets/ultimate-nature/'].map(p=>new URL(p+name+'.obj',root)).find(f=>fs.existsSync(f));assert.ok(f,'missing saved model '+name);cache.set(name,loader.parse(fs.readFileSync(f,'utf8')));}model=cache.get(name).clone();model.scale.setScalar(a[4]);
  }
  const c=Math.cos(a[2]),s=Math.sin(a[2]),h=meta.height??0,rad=h?830-h-.05:829.7;
  model.position.set(rad*c,rad*s,a[3]);model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-s,c,0),new THREE.Vector3(-c,-s,0),new THREE.Vector3(0,0,1)));model.rotateY(a[5]||0);model.updateMatrixWorld(true);colliders.setObject(a[0],model);loaded++;
 }
 return {colliders,loaded};
}
function moveTo(controller,theta,z,height,maxTicks=2400){
 const target=residentialLayerPoint(theta,z,height);let ticks=0;
 for(;ticks<maxTicks;ticks++){const delta=target.clone().sub(controller.position),up=controller.radialUp().clone();delta.addScaledVector(up,-delta.dot(up));if(delta.length()<.12)break;controller.tick(delta.normalize());}
 for(let i=0;i<25;i++)controller.tick(new THREE.Vector3());
 const p=polar(controller.position);assert.ok(ticks<maxTicks,'route stuck '+JSON.stringify({target:[theta*830,z,height],actual:p}));assert.ok(Math.abs(p[2]-height)<.22,'wrong floor '+JSON.stringify({target:[theta*830,z,height],actual:p}));assert.ok(controller.grounded,'not grounded');assert.ok(controller.clear(),'capsule not clear');return ticks;
}
test('continuous speed-15 ground → each tower landing → gallery → physical portal, with saved scene colliders',()=>{
 const {colliders,loaded}=collidersWithSavedModels();assert.ok(loaded>700);const results=[];
 for(const districtId of ['residential-b','residential-c']){
  const tower=plan.stairs.find(s=>s.districtId===districtId&&s.landings),center=(tower.rect[2]+tower.rect[3])/2,reverse=tower.height0>0;
  const controller=new CharacterController(colliders,{groundExists:(theta,z)=>!openingContains(plan,theta,z)});const start=reverse?tower.rect[1]+1:tower.rect[0]-1;
  controller.teleport(residentialLayerPoint(start/830,center,.15));for(let i=0;i<40;i++)controller.tick(new THREE.Vector3());
  for(const h of [16,20,24,28,32,36,40])moveTo(controller,tower.landings[h]/830,center,h);
  const home=plan.housing.find(h=>h.id.startsWith(tower.id.replace('-ascent',''))&&h.height===40);assert.ok(home);
  const route=plan.routes.find(r=>r.id===home.id+'-level');moveTo(controller,tower.landings[40]/830,route.points[0][1],40);
  for(const p of route.points.slice(1,3))moveTo(controller,...p);
  const room=home.rooms[0],x=(room.rect[0]+room.rect[1])/2,front=home.side<0?room.rect[3]:room.rect[2];
  moveTo(controller,x/830,route.points[2][1],40);moveTo(controller,x/830,front+home.side*.8,40);results.push({districtId,visitedHeights:[0,16,20,24,28,32,36,40],portalClear:controller.clear()});
 }
 console.log(JSON.stringify({savedColliderRecords:loaded,continuousHousingRoutes:results}));
});
test('continuous ground → below-plain stair → service gallery → room portal; no global ground disabling',()=>{
 const {colliders}=collidersWithSavedModels();
 for(const districtId of ['residential-b','residential-c']){
  const stair=plan.stairs.find(s=>s.id===`capacity-${districtId}-service-entry`),z=(stair.rect[2]+stair.rect[3])/2;let controller;controller=new CharacterController(colliders,{groundExists:(theta,z)=>residentialGroundExists(plan,theta,z,Math.hypot(controller.position.x,controller.position.y))});
  controller.teleport(residentialLayerPoint((stair.rect[0]-1)/830,z,.15));for(let i=0;i<40;i++)controller.tick(new THREE.Vector3());
  moveTo(controller,(stair.rect[1]+1.5)/830,z,-16);moveTo(controller,(stair.rect[1]+1.5)/830,22.5,-16);
  const service=plan.services.filter(s=>s.districtId===districtId).sort((a,b)=>Math.abs(a.rect[0]-stair.rect[1])-Math.abs(b.rect[0]-stair.rect[1]))[0],room=service.rooms[0],x=(room.rect[0]+room.rect[1])/2;
  moveTo(controller,x/830,22.5,-16);moveTo(controller,x/830,20,-16);
  assert.equal(openingContains(plan,world.masterPlan.districts.find(d=>d.id===districtId).center,0),false);
 }
});
test('dispose releases every owned geometry/material once, removes group and leaves originals unchanged',()=>{
 const r=createCapacityResidentialLayers({world,habitatGroup:new THREE.Group()});let geometries=0,materials=0;const n=r.colliders.length;
 r.group.traverse(o=>{o.geometry?.addEventListener('dispose',()=>geometries++);o.material?.addEventListener('dispose',()=>materials++);});r.dispose();r.dispose();assert.equal(geometries,n);assert.equal(materials,n);assert.equal(r.group.parent,null);assert.equal(r.colliders.length,0);assert.equal(JSON.stringify(world),original);
});
