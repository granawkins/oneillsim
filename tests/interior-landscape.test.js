import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {createInteriorPlan,interiorFloorLedger,housingLevelShape} from '../src/interior-plan.js';
import {createInteriorRuntime,interiorPoint} from '../src/interior-runtime.js';
import {landscapeGeometry,landscapeHeight,landscapePathZ} from '../src/interior-landscape.js';
import {dressInteriorGardens} from '../scripts/dress-interior-gardens.mjs';
import {CharacterController} from '../src/physics/character-controller.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {createCylinder} from '../src/cylinder.js';
import {configureTerraces} from '../src/terrace-surfaces.js';
const plan=createInteriorPlan(),world=JSON.parse(fs.readFileSync('world.json'));
const polar=c=>({x:((Math.atan2(c.position.y,c.position.x)+Math.PI*2)%(Math.PI*2))*830,z:c.position.z,h:830-Math.hypot(c.position.x,c.position.y)});

test('broad smooth hills meet plain, fit tube, clear housing, and retain uncredited park semantics',()=>{
 assert.equal(plan.hills.length,12);
 for(const hill of plan.hills){
  assert.ok(hill.depth>=40&&hill.width>=100);
  for(const x of [-hill.width/2,hill.width/2])assert.equal(landscapeHeight(hill,x,hill.z),0);
  for(const z of [hill.z-hill.depth/2,hill.z+hill.depth/2])assert.equal(landscapeHeight(hill,0,z),0);
  const geometry=landscapeGeometry(hill),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){const h=830-Math.hypot(p.getX(i),p.getY(i));assert.ok(h>=-.001,'no floor burial');assert.ok(Math.hypot(h,p.getZ(i))<64,'tube clipping');}
  for(const b of plan.buildings.filter(b=>b.category==='housing'&&b.districtId===hill.districtId))assert.ok(Math.abs(b.theta-hill.theta)*830>(b.width+hill.width)/2+1||Math.abs(b.z-hill.z)>(b.depth+hill.depth)/2+2,'hill intersects facade '+b.id);
  geometry.dispose();
 }
 // Ground contour paths clear the full facade/balcony envelope, not just centers.
 for(const route of plan.paths)for(const b of plan.buildings.filter(b=>b.category==='housing'&&route.id.startsWith(b.districtId))){
  const z=route.points[0][1];assert.ok(Math.abs(z-b.z)>b.depth/2+route.width/2+1.75,'path intersects balcony '+b.id);
 }
 assert.ok(Math.abs(interiorFloorLedger(plan).measuredGrossShellFloors.housing-370000)<1e-6);
 assert.equal(interiorFloorLedger(plan).fullSourceCompliance,false);
});

test('dressing is deterministic/idempotent, preserves farms/exterior, grounds all new hill plants',()=>{
 const dressed=dressInteriorGardens(structuredClone(world));
 assert.equal(JSON.stringify(dressInteriorGardens(structuredClone(dressed))),JSON.stringify(dressed));
 assert.deepEqual(dressed.assets.filter(a=>a[7]?.worldTransform),world.assets.filter(a=>a[7]?.worldTransform));
 assert.deepEqual(dressed.assets.filter(a=>a[0].includes('-plot-')),world.assets.filter(a=>a[0].includes('-plot-')));
 assert.deepEqual(dressed.terraces,world.terraces);
 assert.deepEqual(dressed.assetTypes,world.assetTypes);
 const replaced=a=>a[0].startsWith('interior-garden-detail-')||/^interior-residential-.-tree-\d+-(-?1)$/.test(a[0]);
 assert.deepEqual(dressed.assets.filter(a=>!replaced(a)),world.assets.filter(a=>!replaced(a)),'unrelated placement changed');
 assert.ok(!dressed.assets.some(a=>/^interior-residential-.-tree-\d+-(-?1)$/.test(a[0])),'repetitive trunk rows retained');
 for(const hill of plan.hills)for(const a of dressed.assets.filter(a=>a[0].startsWith('interior-garden-detail-'+hill.id))){const x=(a[2]-hill.theta)*830;assert.ok(Math.abs(a[7].height+.05-landscapeHeight(hill,x,a[3]))<1e-8);assert.ok(Math.abs(a[3]-landscapePathZ(hill,x))>4,'plant on walk');}
});

test('park banks have offset footprints, distinct bends and grove recipes; crown and court plants stay supported/clear',()=>{
 const dressed=dressInteriorGardens(structuredClone(world));
 for(const hill of plan.hills.filter(h=>h.side<0)){
  const other=plan.hills.find(h=>h.districtId===hill.districtId&&h.park===hill.park&&h.side>0);
  assert.ok(Math.abs(hill.theta-other.theta)*830>25,'mirrored park footprints');
  assert.notEqual(hill.groveStyle,other.groveStyle);
  assert.ok(Math.abs((landscapePathZ(hill,hill.width*.2)-hill.z)-(landscapePathZ(other,other.width*.2)-other.z))>3,'identical park bends');
 }
 for(const b of plan.buildings.filter(b=>b.category==='housing')){
  const roof=housingLevelShape(b,b.levels-1),plants=dressed.assets.filter(a=>a[0].startsWith('interior-garden-detail-'+b.id+'-roof'));
  for(const a of plants){assert.ok(Math.abs(a[2]-roof.theta)*830<roof.width/2-2);assert.ok(Math.abs(a[3]-roof.z)<roof.depth/2-1);assert.ok(Math.abs(a[7].height+.05-(b.base+b.levels*b.storey+.43))<1e-8);}
 }
 for(const court of plan.courts){
  const plants=dressed.assets.filter(a=>a[0].startsWith('interior-garden-detail-'+court.id+'-tree'));
  assert.equal(plants.length,court.kind==='water'?4:7);
  for(const a of plants)for(const b of plan.buildings.filter(b=>b.category==='housing'&&b.districtId===court.districtId))assert.ok(Math.abs(a[2]-b.theta)*830>b.width/2+2.5||Math.abs(a[3]-b.z)>b.depth/2+2.5,'court tree clips facade/stairs');
 }
});

test('actual controller traverses every summit walk, transverse grass slope, and solid housing plinth stairs',()=>{
 const habitatGroup=new THREE.Group(),colliderWorld=new ColliderWorld(),controller=new CharacterController(colliderWorld);
 configureTerraces(world.terraces);const {ground}=createCylinder(habitatGroup);
 const runtime=createInteriorRuntime({habitatGroup,colliderWorld,controller,world,ground});
 // Real authored tree models, not invented trunk bounds; trees stay beside walks.
 const dressed=dressInteriorGardens(structuredClone(world)),cache=new Map(),loader=new OBJLoader();let trees=0;
 for(const a of dressed.assets.filter(a=>a[0].includes('-hill-')&&a[0].includes('-grove-')||a[0].includes('-arrival-')&&a[0].includes('-tree-'))){
  const name=dressed.assetTypes[a[1]];if(!cache.has(name))cache.set(name,loader.parse(fs.readFileSync('assets/ultimate-nature/'+name+'.obj','utf8')));
  const o=cache.get(name).clone();o.scale.setScalar(a[4]);o.position.copy(interiorPoint(a[2],a[3],a[7].height+.05));
  const c=Math.cos(a[2]),s=Math.sin(a[2]);o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-s,c,0),new THREE.Vector3(-c,-s,0),new THREE.Vector3(0,0,1)));o.rotateY(a[5]||0);habitatGroup.add(o);o.updateMatrixWorld(true);colliderWorld.setObject(a[0],o,habitatGroup);trees++;
 }
 const settle=(t,z,h=0)=>{controller.teleport(interiorPoint(t,z,h+.03));for(let i=0;i<80;i++)controller.advance(1/120);assert.ok(controller.grounded,'settle not grounded');};
 const routes=[];
 for(const hill of plan.hills){
  settle(hill.theta-(hill.width/2+2)/830,hill.z,.16);let maxHeight=0,maxGap=0,air=0,longestAir=0,ticks=0;
  for(;ticks<1500;ticks++){
   const q=polar(controller),x=q.x-hill.theta*830;if(x>hill.width/2+1)break;
   const targetZ=landscapePathZ(hill,x+1),t=q.x/830;
   const direction=new THREE.Vector3(-Math.sin(t),Math.cos(t),(targetZ-q.z)*1.6).normalize();controller.advance(1/120,direction);
   const a=polar(controller),h=landscapeHeight(hill,a.x-hill.theta*830,a.z);maxHeight=Math.max(maxHeight,a.h);maxGap=Math.max(maxGap,a.h-h);
   assert.ok(a.h>=h-.03,'feet clipped through hill');
   if(controller.grounded)air=0;else{air++;longestAir=Math.max(longestAir,air);}
  }
  assert.ok(ticks<1500,'summit walk blocked '+hill.id);assert.ok(maxHeight>hill.height-.15,'did not climb summit');assert.ok(maxGap<.23,'lost hill support '+maxGap);assert.ok(longestAir<30,'airborne on walk');
  for(let i=0;i<80;i++)controller.advance(1/120);assert.ok(controller.grounded);assert.ok(polar(controller).h<.2,'descent did not return to plain');routes.push({id:hill.id,maxHeight,maxGap,longestAir});
 }
 // Enter all six differently positioned arrival rooms with their real trees loaded.
 for(const court of plan.courts){
  settle(court.theta,court.side*11,.16);
  let ticks=0;for(;ticks<400&&Math.abs(controller.position.z)<Math.abs(court.z)-2;ticks++)controller.advance(1/120,new THREE.Vector3(0,0,court.side*.4));
  assert.ok(ticks<400,'court entry blocked '+court.id);for(let i=0;i<60;i++)controller.advance(1/120);assert.ok(controller.grounded,'court entry unsupported');
 }
 // Walk the broad turf face at 6 m/s, rather than only a decorative path ribbon.
 const hill=plan.hills[1];settle(hill.theta,hill.z-hill.depth/2-1);
 let crest=0;for(let i=0;i<1100&&controller.position.z<hill.z+hill.depth/2+1;i++){controller.advance(1/120,new THREE.Vector3(0,0,.4));const q=polar(controller);crest=Math.max(crest,q.h);assert.ok(q.h>=landscapeHeight(hill,q.x-hill.theta*830,q.z)-.03,'grass slope floor clipping');}
 for(let i=0;i<80;i++)controller.advance(1/120);assert.ok(crest>hill.height-.15);assert.ok(controller.grounded);assert.ok(polar(controller).h<.1,'turf descent');
 // A real retaining foundation is continuous below the house; enter along its
 // broad parallel front stair, then turn onto the finished balcony floor.
 const b=plan.buildings.find(b=>b.category==='housing'&&b.base===4.5),side=Math.sign(b.z),front=b.z-side*b.depth/2,n=Math.ceil((b.base+.24)/.15),x0=b.theta*830-b.width/2+3;
 settle((x0-.7)/830,front-side*2);
 for(let i=0;i<300&&polar(controller).x<x0+n*.3-.12;i++){const t=polar(controller).x/830;controller.advance(1/120,new THREE.Vector3(-Math.sin(t),Math.cos(t),0));}
 for(let i=0;i<35;i++)controller.advance(1/120,new THREE.Vector3(0,0,side*.35));for(let i=0;i<80;i++)controller.advance(1/120);
 assert.ok(controller.grounded);assert.ok(Math.abs(polar(controller).h-(b.base+.24))<.05,'raised home stair/landing '+JSON.stringify(polar(controller)));
 assert.ok([...colliderWorld.colliders.keys()].includes(b.id+'-foundation-plinth'));
 assert.ok(![...colliderWorld.colliders.keys()].some(id=>id.startsWith(b.id+'-foundation-')&&!id.endsWith('plinth')),'tiny stilts remain');
 console.log(JSON.stringify({runtime:runtime.stats,hillAndCourtTrees:trees,summitRoutes:routes,grassCrest:crest,housingLanding:polar(controller)}));runtime.dispose();
});
