import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {exteriorModelPlacements} from '../src/model-placement-exterior.js';
import {completedModels} from '../src/completed-models.js';
test('nine exterior designs have real full-scale poses, survive habitat rotation, and avoid inhabited tube',()=>{
 const placements=exteriorModelPlacements();assert.equal(placements.length,9);assert.equal(new Set(placements.map(p=>p.id)).size,9);assert.deepEqual(new Set(placements.map(p=>p.type)),new Set(completedModels.filter(m=>m.materialKit==='structure').map(m=>m.id)));
 const models=new Map();
 for(const p of placements){
  assert.equal(p.scale,4);assert.equal(p.rotation,0);assert.equal(p.surface.deckId,'exterior-structures');
  const {position,quaternion}=p.surface.worldTransform;assert.ok(position.every(Number.isFinite));assert.ok(quaternion.every(Number.isFinite));const q=new THREE.Quaternion().fromArray(quaternion);assert.ok(Math.abs(q.length()-1)<1e-12);
  const model=new OBJLoader().parse(fs.readFileSync(`assets/ultimate-buildings/${p.type}.obj`,'utf8'));model.position.fromArray(position);model.quaternion.copy(q);model.scale.setScalar(p.scale);model.updateMatrixWorld(true);models.set(p.type,model);
  const point=new THREE.Vector3();let closest=Infinity;model.traverse(c=>{if(!c.isMesh)return;for(let i=0;i<c.geometry.attributes.position.count;i++){point.fromBufferAttribute(c.geometry.attributes.position,i).applyMatrix4(c.matrixWorld);closest=Math.min(closest,Math.hypot(Math.hypot(point.x,point.y)-830,point.z));}});assert.ok(closest>65.1,p.id+' intrudes into inhabited tube: '+closest);
  const parent=new THREE.Group();parent.rotation.z=.73;parent.add(model);parent.updateMatrixWorld(true);const recovered=model.matrixWorld.clone().premultiply(parent.matrixWorld.clone().invert());assert.ok(recovered.elements.every((v,i)=>Math.abs(v-model.matrix.elements[i])<1e-9));
 }
 const hub=models.get('TorusStructure_HubA');const center=new THREE.Vector3(0,65/4,0).applyMatrix4(hub.matrix);assert.ok(center.length()<1e-8,'Spherical hub center must be settlement axis');const axial=new THREE.Vector3(0,1,0).applyQuaternion(hub.quaternion);assert.ok(axial.distanceTo(new THREE.Vector3(0,0,1))<1e-12,'Docking/spin axis must be habitat Z');
 const spoke=models.get('TorusStructure_SpokeA');assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(spoke.quaternion).distanceTo(new THREE.Vector3(1,0,0))<1e-12,'Spoke cutaway points along the +X hub port');
 console.log(JSON.stringify({exteriorPlacements:placements.map(p=>({id:p.id,position:p.surface.worldTransform.position}))}));
});
