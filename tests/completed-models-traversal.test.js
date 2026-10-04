import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {ColliderWorld} from '../src/physics/collider-world.js';
import {CharacterController} from '../src/physics/character-controller.js';
const root=new URL('../assets/ultimate-buildings/',import.meta.url);
async function fixture(id){
 const model=new OBJLoader().parse(await fs.readFile(new URL(id+'.obj',root),'utf8'));
 model.scale.setScalar(4);model.position.set(-830,0,0);model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)));model.updateMatrixWorld(true);
 const colliders=new ColliderWorld();colliders.setObject(id,model);
 return {model,colliders,inverse:model.matrixWorld.clone().invert(),manifest:JSON.parse(await fs.readFile(new URL(id+'.asset.json',root),'utf8'))};
}
async function walk(id,route){
 const f=await fixture(id),c=new CharacterController(f.colliders);
 c.teleport(new THREE.Vector3(...route.start).divideScalar(4).applyMatrix4(f.model.matrixWorld));
 for(let i=0;i<30;i++)c.tick(new THREE.Vector3());
 const direction=new THREE.Vector3(0,0,-1).transformDirection(f.model.matrixWorld);
 let ticks=0;for(;ticks<300;ticks++){
  const local=c.position.clone().applyMatrix4(f.inverse).multiplyScalar(4);if(local.z<=route.end[2])break;c.tick(direction);
 }
 for(let i=0;i<60;i++)c.tick(new THREE.Vector3());
 const local=c.position.clone().applyMatrix4(f.inverse).multiplyScalar(4);
 assert.ok(ticks<300,id+' blocked '+JSON.stringify(local.toArray()));assert.ok(Math.abs(local.y-route.end[1])<.12,id+' floor height '+JSON.stringify(local.toArray()));assert.equal(c.grounded,true,id+' grounded');assert.equal(c.clear(),true,id+' clear');return {id,ticks,position:local.toArray()};
}
test('actual transport stairs and ramp both reach their upper landing at speed 15',async()=>{
 const id='TorusTransport_StairsRampA',f=await fixture(id),results=[];
 for(const r of f.manifest.collisionIntent.routes)results.push(await walk(id,{start:r.startMeters,end:r.endMeters}));
 assert.equal(results.length,2);console.log(JSON.stringify({transportTraversal:results}));
});
test('actual commercial, greenhouse, animal housing and airlock entries accept the gameplay capsule',async()=>{
 const routes=[
  ['TorusCommerce_MarketA',{start:[0,.001,6.7],end:[0,0,-4.5]}],
  ['TorusCommerce_RestaurantA',{start:[0,.001,6],end:[0,0,0]}],
  ['TorusCommerce_FactoryA',{start:[6.3,.001,7.5],end:[6.3,0,0]}],
  ['TorusAgri_GreenhouseA',{start:[0,.001,4.7],end:[0,.08,-3]}],
  ['TorusAgri_AnimalHousingA',{start:[0,.001,4.7],end:[0,.08,-3]}],
  ['TorusStructure_AirlockA',{start:[0,.001,3.7],end:[0,.3,-2.9]}]
 ];const results=[];for(const [id,r] of routes)results.push(await walk(id,r));console.log(JSON.stringify({newEntryTraversal:results}));
});
