import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createInteriorPlan,interiorFloorLedger,housingLevelShape} from '../src/interior-plan.js';
import {createInteriorRuntime,interiorPoint,conveyorVelocity} from '../src/interior-runtime.js';
import {createCylinder} from '../src/cylinder.js';
import {configureTerraces} from '../src/terrace-surfaces.js';
import {CharacterController} from '../src/physics/character-controller.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
const world=JSON.parse(fs.readFileSync('world.json')),source=JSON.parse(fs.readFileSync('tests/fixtures/interior-farm-source.json'));
const plan=createInteriorPlan();
test('six alternating districts; exterior records and farm source geometry preserved exactly',()=>{
 assert.deepEqual(plan.districts.map(d=>d.kind),['residential','agricultural','residential','agricultural','residential','agricultural']);
 assert.deepEqual(world.assets.filter(a=>a[7]?.worldTransform),source.exterior);
 for(const d of plan.districts.filter(d=>d.kind==='agricultural')){
  const plots=world.assets.filter(a=>a[0].startsWith(d.id+'-plot-'));assert.equal(plots.length,78);
  for(let i=0;i<plots.length;i++){assert.equal(plots[i][1],source.assets[i][1]);assert.equal(plots[i][3],source.assets[i][3]);assert.equal(plots[i][7].height,source.assets[i][7].height);}
  assert.equal(world.terraces.decks.filter(v=>v.id.startsWith(d.id+'-')).length,7);
 }
});
test('source program floor envelopes match explicit 10,000-person ledger; no compliance claim',()=>{
 const ledger=interiorFloorLedger(plan),floors=ledger.measuredGrossShellFloors;
 assert.ok(Math.abs(floors.housing-370000)<1e-6);
 for(const [key,per]of Object.entries(plan.sources.community.perPerson))if(!['housing','park','transportation'].includes(key))assert.ok(Math.abs(floors[key]-per*10000)<1e-6,key);
 assert.equal(ledger.fullSourceCompliance,false);
 for(const b of plan.buildings){const top=b.base+b.storey*b.levels+.5;assert.ok(Math.hypot(top,Math.abs(b.z)+b.depth/2)<65,b.id+' tube clearance');const d=plan.districts.find(d=>d.id===b.districtId);assert.ok(b.theta-b.width/2/830>d.start&&b.theta+b.width/2/830<d.end,b.id+' boundary');}
});
test('authored housing has no overlapping floor footprints; all raised housing has foundation to plain',()=>{
 const houses=plan.buildings.filter(b=>b.category==='housing');
 for(let i=0;i<houses.length;i++)for(let j=i+1;j<houses.length;j++){const a=houses[i],b=houses[j];if(a.districtId!==b.districtId)continue;const dx=Math.abs(a.theta-b.theta)*830,dz=Math.abs(a.z-b.z);assert.ok(dx>=(a.width+b.width)/2||dz>=(a.depth+b.depth)/2,`overlap ${a.id} ${b.id}`);}
 assert.ok(new Set(houses.map(b=>b.base)).size>=4);assert.ok(new Set(houses.map(b=>b.levels)).size>=4);
});
test('districts and banks have independent silhouettes; shouldered physical floor polygons close housing ledger',()=>{
 const signatures=[];
 for(const d of plan.districts.filter(d=>d.kind==='residential')){
  const houses=plan.buildings.filter(b=>b.category==='housing'&&b.districtId===d.id);
  assert.ok(new Set(houses.map(b=>b.width)).size>=6,'footprints must vary substantively');
  assert.ok(Math.max(...houses.map(b=>b.levels))-Math.min(...houses.map(b=>b.levels))>=8,'low/tall skyline contrast');
  const mirrored=houses.filter(a=>a.z<0&&houses.some(b=>b.z>0&&Math.abs(a.theta-b.theta)*830<3&&Math.abs(a.z+b.z)<2));
  assert.equal(mirrored.length,0,'reflected housing axes remain');
  signatures.push(houses.map(b=>[b.width,b.levels,b.setback]).join(';'));
  for(const b of houses){
   let measured=0;
   for(let level=0;level<b.levels;level++){
    const s=housingLevelShape(b,level);assert.ok(s.width>15&&s.depth>6,'unusable crown sliver');
    assert.ok(Math.abs(s.theta-b.theta)*830+s.width/2<=b.width/2+1e-8,'unsupported crown');
    measured+=s.width*s.depth;
   }
   assert.ok(Math.abs(measured-b.floorArea)<1e-8,'ledger does not use modeled shouldered floors');
  }
  const courts=plan.courts.filter(c=>c.districtId===d.id);assert.equal(courts.length,2);
  assert.ok(Math.abs(courts[0].theta-courts[1].theta)*830>25,'paired court copies');
  for(const court of courts)for(const b of houses){
   assert.ok(Math.abs(court.theta-b.theta)*830>(court.width+b.width)/2+3||Math.abs(court.z-b.z)>(court.depth+b.depth)/2+2,'court overlaps housing or balcony');
   if(Math.sign(b.z)===court.side)assert.ok(Math.abs(court.theta-b.theta)*830>b.width/2+3,'entry aisle blocked');
  }
 }
 assert.equal(new Set(signatures).size,3,'district massing cloned');
});

test('actual controller: idle conveyor ride, step-off stops, opposite lane and height gating; gallery grounding',()=>{
 const habitatGroup=new THREE.Group(),colliderWorld=new ColliderWorld(),controller=new CharacterController(colliderWorld);
 configureTerraces(world.terraces);const {ground}=createCylinder(habitatGroup);
 const groundColor=ground.material.color.getHex();
 const runtime=createInteriorRuntime({habitatGroup,colliderWorld,controller,world,ground});
 assert.equal(ground.material.color.getHex(),0x536b3d);
 console.log('interior-runtime',runtime.stats,'triangles',colliderWorld.triangleCount);
 const settle=(t,z,h)=>{controller.teleport(interiorPoint(t,z,h+.02));for(let i=0;i<90;i++)controller.advance(1/120);};
 settle(.15,5,.36);const start=Math.atan2(controller.position.y,controller.position.x);for(let i=0;i<240;i++)controller.advance(1/120);const travel=(Math.atan2(controller.position.y,controller.position.x)-start)*830;
 assert.ok(travel>34&&travel<38,'idle ride '+travel);assert.ok(controller.grounded);assert.ok(Math.abs(830-Math.hypot(controller.position.x,controller.position.y)-.36)<.03);
 for(let i=0;i<70;i++)controller.advance(1/120,new THREE.Vector3(0,0,1));const off=Math.atan2(controller.position.y,controller.position.x);for(let i=0;i<120;i++)controller.advance(1/120);assert.ok(Math.abs(Math.atan2(controller.position.y,controller.position.x)-off)*830<.02,'step-off retained belt motion');
 assert.equal(conveyorVelocity(interiorPoint(.2,5,9),true).length(),0);assert.equal(conveyorVelocity(interiorPoint(.2,5,.36),false).length(),0);assert.ok(conveyorVelocity(interiorPoint(.2,-5,.36),true).dot(new THREE.Vector3(-Math.sin(.2),Math.cos(.2),0))<0);
 settle(plan.districts[0].center-90/830,9,.16);assert.ok(controller.grounded);assert.ok(Math.abs(830-Math.hypot(controller.position.x,controller.position.y)-.16)<.03);
 // Traverse the real entrance down, below intact ground, into the civic street.
 const walkToX=(target,zSign=1)=>{for(let i=0;i<2000;i++){const t=Math.atan2(controller.position.y,controller.position.x),x=t*830;if((zSign>0&&x>=target)||(zSign<0&&x<=target))return;controller.advance(1/120,new THREE.Vector3(-Math.sin(t)*zSign,Math.cos(t)*zSign,0));}throw Error('route blocked at x='+Math.atan2(controller.position.y,controller.position.x)*830);};
 settle(3/830,-36,0);walkToX(90);for(let i=0;i<120;i++)controller.advance(1/120);assert.ok(Math.abs(830-Math.hypot(controller.position.x,controller.position.y)+42)<.05,'descent to actual lower landing');
 walkToX(20,-1);for(let i=0;i<300&&controller.position.z<-.05;i++)controller.advance(1/120,new THREE.Vector3(0,0,1));for(let i=0;i<120;i++)controller.advance(1/120);assert.ok(830-Math.hypot(controller.position.x,controller.position.y)<-41.5,'below-ground travel must not snap to plain');
 settle(90/830,-36,-42);walkToX(3,-1);for(let i=0;i<120;i++)controller.advance(1/120);assert.ok(Math.abs(830-Math.hypot(controller.position.x,controller.position.y))<.08,'ascent to unchanged plain');
 settle(27/830,-1.1,-41.76);walkToX(42.1);for(let i=0;i<40;i++)controller.advance(1/120,new THREE.Vector3(0,0,-1));for(let i=0;i<120;i++)controller.advance(1/120);assert.ok(Math.abs(830-Math.hypot(controller.position.x,controller.position.y)+34.16)<.08,'school upper-floor actual stair access');
 settle(3/830,32,0);controller.queueJump();for(let i=0;i<300;i++)controller.advance(1/120);assert.ok(controller.grounded,'unchanged plain support');
 runtime.dispose();assert.equal(ground.material.color.getHex(),groundColor);assert.equal(colliderWorld.colliders.size,0);
});
