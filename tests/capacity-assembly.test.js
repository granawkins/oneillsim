import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {createCapacityAssembly} from '../src/capacity-assembly.js';

test('real layer factories register owned colliders, preserve saved records and restore unrelated state',()=>{
 const bytes=fs.readFileSync('world.json'),world=JSON.parse(bytes),habitatGroup=new THREE.Group(),colliderWorld=new ColliderWorld();
 const prior=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));habitatGroup.add(prior);colliderWorld.setObject('prior-safe',prior,habitatGroup);
 let groundDisposed=0;
 // Ground behavior is independently tested by capacity-ground.test.js; this isolates ownership.
 const runtime=createCapacityAssembly({habitatGroup,world,colliderWorld,controller:{},ground:{},groundBuilder:()=>({stats:{ownershipTestDouble:true},dispose(){groundDisposed++;}})});
 assert.ok(runtime.stats.registeredObjects>30);assert.equal(colliderWorld.colliders.size,runtime.stats.registeredObjects+1);
 assert.ok(runtime.landmarks.length>6);assert.ok(runtime.landmarks.every(p=>p.exactFloor&&[p.theta,p.z,p.height,p.yaw].every(Number.isFinite)));
 assert.equal(runtime.ledger.fullSourceCompliance,false);assert.equal(runtime.farms.group.userData.capacityInterior,true);
 assert.deepEqual(JSON.parse(bytes),world);runtime.dispose();runtime.dispose();assert.equal(groundDisposed,1);assert.deepEqual([...colliderWorld.colliders.keys()],['prior-safe']);assert.equal(colliderWorld.triangleCount,12);
 assert.equal(fs.readFileSync('world.json').equals(bytes),true);
});
test('missing physical ground helper fails closed and removes only newly built layer roots',()=>{
 const habitatGroup=new THREE.Group(),colliderWorld=new ColliderWorld(),prior=new THREE.Group();habitatGroup.add(prior);
 assert.throws(()=>createCapacityAssembly({habitatGroup,world:JSON.parse(fs.readFileSync('world.json')),colliderWorld}),/Physical clipped ground builder/);
 assert.equal(colliderWorld.colliders.size,0);assert.deepEqual(habitatGroup.children,[prior]);
});
