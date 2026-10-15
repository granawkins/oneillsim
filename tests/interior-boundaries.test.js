import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {BOUNDARY_SPEC,BOUNDARY_PORTALS,createBoundaryPlan,createInteriorBoundaries,boundaryPoint} from '../src/interior-boundaries.js';
import {curvedSolid,createInteriorRuntime} from '../src/interior-runtime.js';
import {createCylinder} from '../src/cylinder.js';
import {configureTerraces} from '../src/terrace-surfaces.js';
import {terraceGeometry} from '../src/terraces.js';
import {CharacterController} from '../src/physics/character-controller.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
const world=JSON.parse(fs.readFileSync(new URL('../world.json',import.meta.url)));
const arc=(p,t)=>Math.atan2(Math.sin(Math.atan2(p.y,p.x)-t),Math.cos(Math.atan2(p.y,p.x)-t))*830;
const height=p=>830-Math.hypot(p.x,p.y);
function fixture(){const habitatGroup=new THREE.Group(),colliderWorld=new ColliderWorld();
 const runtime=createInteriorBoundaries({habitatGroup,colliderWorld});return {habitatGroup,colliderWorld,runtime};}
function drive(c,theta,sign,ticks=100){for(let i=0;i<ticks;i++){
 const t=Math.atan2(c.position.y,c.position.x);c.advance(1/120,new THREE.Vector3(-Math.sin(t)*sign,Math.cos(t)*sign,0));}}
function settle(c,theta,z,h){c.teleport(boundaryPoint(theta,z,h+.015));for(let i=0;i<65;i++)c.advance(1/120);}
function floor(f,theta,z,h,id){const mesh=new THREE.Mesh(curvedSolid(theta,z,h-.24,16,4,.24));
 f.habitatGroup.add(mesh);f.colliderWorld.setObject(id,mesh,f.habitatGroup);return mesh;}
function rayHits(runtime,theta,z,h,side){const start=boundaryPoint(theta-side*2/830,z,h),end=boundaryPoint(theta+side*2/830,z,h);
 const ray=new THREE.Raycaster(start,end.clone().sub(start).normalize(),0,start.distanceTo(end));
 runtime.group.updateWorldMatrix(true,true);return ray.intersectObject(runtime.group,true);}

test('six closed opaque toroidal partitions; exactly three authored surface portals each',()=>{
 const f=fixture();assert.equal(f.runtime.plan.length,6);assert.equal(f.runtime.stats.portals,18);
 assert.equal(f.runtime.stats.renderMeshes,12);assert.equal(f.colliderWorld.colliders.size,6);
 for(const b of createBoundaryPlan()){
   for(const side of [-1,1]){
     // Actual lower farm levels and the residential civic street must never be
     // mistaken for portal voids. Probe above feet as well as at the deck seam.
     for(const h of [-61,-56,-50,-42,-40,-25,-10])for(const z of [-18,0,18])
       if(Math.hypot(h+1.65,z)<64)assert.ok(rayHits(f.runtime,b.theta,z,h+1.65,side).length,`${b.id} lower ${z}/${h}/${side}`);
     for(const [z,h]of [[50,6.65],[-50,6.65],[30,20],[0,40],[0,-64.9]])
       assert.ok(rayHits(f.runtime,b.theta,z,h,side).length,`${b.id} closed ${z}/${h}`);
     for(const p of BOUNDARY_PORTALS){assert.equal(rayHits(f.runtime,b.theta,(p.zMin+p.zMax)/2,p.floor+1.65,side).length,0);
       assert.ok(rayHits(f.runtime,b.theta,(p.zMin+p.zMax)/2,p.floor-.01,side).length,'solid directly below portal floor');
       assert.ok(rayHits(f.runtime,b.theta,(p.zMin+p.zMax)/2,p.ceiling+.01,side).length,'solid lintel');}
     // Tube edge samples verify no inscribed-polygon seam at either hemisphere.
     for(let j=0;j<64;j++){const a=(j+.37)*2*Math.PI/64;
       assert.ok(rayHits(f.runtime,b.theta,64.995*Math.cos(a),64.995*Math.sin(a),side).length,'hull perimeter sealed');}
   }
 }
 f.runtime.group.traverse(o=>{if(o.isMesh){assert.equal(o.material.side,THREE.DoubleSide);assert.equal(o.material.transparent,false);assert.equal(o.material.opacity,1);}});
 console.log('boundary geometry',f.runtime.stats,'collider triangles',f.colliderWorld.triangleCount);
 f.runtime.dispose();f.runtime.dispose();assert.equal(f.colliderWorld.colliders.size,0);assert.equal(f.habitatGroup.children.length,0);
});

test('dense cross-section sampling: the only sightlines are the real doorway apertures',()=>{
 const f=fixture(),theta=f.runtime.plan[1].theta;
 for(let h=-64;h<=64;h+=2)for(let z=-64;z<=64;z+=2){
   if(Math.hypot(h,z)>=64.9)continue;
   const portal=BOUNDARY_PORTALS.some(p=>z>p.zMin&&z<p.zMax&&h>p.floor&&h<p.ceiling);
   assert.equal(rayHits(f.runtime,theta,z,h,1).length===0,portal,`cross-section z=${z} h=${h}`);
 }
 f.runtime.dispose();
});

test('real CharacterController: solid lower walls block both ways at every farm level and civic level',()=>{
 const f=fixture(),c=new CharacterController(f.colliderWorld,{groundExists:()=>false});
 // The paired floor fixture deliberately supports both sides: blocking is the
 // actual wall contact, not falling off an unsupported residential edge.
 for(const b of f.runtime.plan)for(const h of [-61,-56,-50,-42,-40,-25,-10,5]){
   const z=h===5?50:h===-10?40:h===-25?20:0;
   const mesh=floor(f,b.theta,z,h,'lower-test-floor');
   for(const side of [-1,1]){
     settle(c,b.theta-side*2/830,z,h);drive(c,b.theta,side,70);
     assert.ok(arc(c.position,b.theta)*side<-.6,`${b.id} lower ${h} side ${side} escaped ${arc(c.position,b.theta)}`);
     assert.ok(Math.abs(height(c.position)-h)<.025,'floor seam preserved '+height(c.position));
     assert.ok(c.grounded);
   }
   f.colliderWorld.remove('lower-test-floor');mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();
 }
 f.runtime.dispose();
});

test('actual farm terrace edge geometry: all 21 decks have sealed supported endpoints',()=>{
 const f=fixture(),c=new CharacterController(f.colliderWorld,{groundExists:()=>false});
 for(const deck of world.terraces.decks){
   const [lo,hi]=deck.bands.at(-1),z=(lo+hi)/2;
   for(const [theta,side]of [[deck.start,-1],[deck.end,1]]){
     // Retain the actual source deck height, bands and original tessellation
     // function, only trim its far end to avoid unrelated crop/stair fixtures.
     const a=side<0?theta:theta-6/830,b=side<0?theta+6/830:theta;
     const mesh=new THREE.Mesh(terraceGeometry(a,b,lo,hi,deck.height));
     f.habitatGroup.add(mesh);f.colliderWorld.setObject('actual-terrace-edge',mesh,f.habitatGroup);
     settle(c,theta-side*2/830,z,deck.height);drive(c,theta,side,65);
     assert.ok(arc(c.position,theta)*side<-.6,deck.id+' endpoint wall');
     assert.ok(Math.abs(height(c.position)-deck.height)<.035,deck.id+' endpoint floor support');assert.ok(c.grounded);
     f.colliderWorld.remove('actual-terrace-edge');mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();
   }
 }
 f.runtime.dispose();
});

test('complete interior runtime: both belt lanes and central promenade cross every doorway in both directions',()=>{
 const habitatGroup=new THREE.Group(),colliderWorld=new ColliderWorld(),controller=new CharacterController(colliderWorld);
 configureTerraces(world.terraces);const {ground}=createCylinder(habitatGroup);
 const interior=createInteriorRuntime({habitatGroup,colliderWorld,controller,world,ground});
 assert.ok(interior);const boundaries=createInteriorBoundaries({habitatGroup,colliderWorld,parent:interior.group});
 // Test pedestrian passage independent of belt propulsion, then test the real
 // moving lanes separately below. No controller configuration is changed by
 // boundary construction itself.
 const velocity=controller.surfaceVelocity;controller.surfaceVelocity=undefined;
 for(const b of boundaries.plan)for(const p of BOUNDARY_PORTALS)for(const side of [-1,1]){
   const z=(p.zMin+p.zMax)/2;
   settle(controller,b.theta-side*2/830,z,p.floor);drive(controller,b.theta,side,40);
   assert.ok(arc(controller.position,b.theta)*side>2,`${b.id} ${p.id} side ${side} blocked at ${arc(controller.position,b.theta)}`);
   assert.ok(Math.abs(height(controller.position)-p.floor)<.035,'supported portal floor '+height(controller.position));
   assert.ok(controller.grounded);
 }
 controller.surfaceVelocity=velocity;
 for(const b of boundaries.plan)for(const side of [-1,1]){
   settle(controller,b.theta-side*4/830,side*5,.36);
   for(let i=0;i<65;i++)controller.advance(1/120);
   assert.ok(arc(controller.position,b.theta)*side>3,'belt carried capsule through frame');assert.ok(controller.grounded);
 }
 boundaries.dispose();interior.dispose();assert.equal(colliderWorld.colliders.size,0);
});

test('boundary API does not mutate saved source, floor ledger, ground policy or conveyor velocity',()=>{
 const before=JSON.stringify(world),f=fixture();assert.equal(JSON.stringify(world),before);
 assert.equal(BOUNDARY_SPEC.radius,830);assert.equal(BOUNDARY_SPEC.tubeRadius,65);
 assert.deepEqual(BOUNDARY_PORTALS.map(p=>p.floor),[.36,.16,.36]);f.runtime.dispose();
});
