import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';
import {residentialPlacements} from '../src/residential-kit.js';
test('actual residential stair meshes support the speed-15 capsule to every upper landing',async()=>{
 const colliders=new ColliderWorld(),objects=new Map(),manifests=new Map();
 for(const p of residentialPlacements()){
  const model=new OBJLoader().parse(await fs.readFile(new URL(`../assets/ultimate-buildings/${p.type}.obj`,import.meta.url),'utf8'));
  manifests.set(p.type,JSON.parse(await fs.readFile(new URL(`../assets/ultimate-buildings/${p.type}.asset.json`,import.meta.url),'utf8')));
  const up=new THREE.Vector3(-Math.cos(p.theta),-Math.sin(p.theta),0),forward=new THREE.Vector3(0,0,1),right=new THREE.Vector3().crossVectors(up,forward);
  model.position.set(830*Math.cos(p.theta),830*Math.sin(p.theta),p.z);model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));model.rotateY(p.rotation);model.scale.setScalar(4);model.updateMatrixWorld(true);
  objects.set(p.id,model);colliders.setObject(p.id,model);
 }
 const results=[];
 for(const p of residentialPlacements()){
  const model=objects.get(p.id),inverse=model.matrixWorld.clone().invert();
  for(const stair of manifests.get(p.type).collisionIntent.stairs){
   const x=(stair.xBoundsMeters[0]+stair.xBoundsMeters[1])/2;
   const controller=new CharacterController(colliders);
   controller.teleport(new THREE.Vector3(x/4,(stair.bottomMeters+.001)/4,(stair.zStartMeters+.45)/4).applyMatrix4(model.matrixWorld));
   const direction=new THREE.Vector3(0,0,-1).transformDirection(model.matrixWorld);
   for(let i=0;i<30;i++)controller.tick(new THREE.Vector3());
   let ticks=0;
   for(;ticks<160;ticks++){
    const position=controller.position.clone().applyMatrix4(inverse).multiplyScalar(4);
    if(position.z<stair.zEndMeters-.4)break;
    controller.tick(direction);
   }
   for(let i=0;i<60;i++)controller.tick(new THREE.Vector3());
   const position=controller.position.clone().applyMatrix4(inverse).multiplyScalar(4);
   assert.ok(ticks<160,p.id+' failed to ascend '+JSON.stringify(position.toArray()));
   assert.ok(Math.abs(position.y-stair.topMeters)<.09,p.id+' landing support '+JSON.stringify(position.toArray()));
   assert.ok(Math.abs(position.x-x)<.12,p.id+' stair sideways drift');
   assert.equal(controller.clear(),true,p.id+' capsule intersects at upper landing');
   assert.equal(controller.grounded,true,p.id+' not grounded at upper landing');
   results.push({id:p.id,landing:stair.topMeters,height:position.y,ticks});
  }
 }
 assert.equal(results.length,22);console.log(JSON.stringify({residentialStairs:results}));
});
