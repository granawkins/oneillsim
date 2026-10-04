import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {residentialKit,residentialKitIds,residentialPilot,residentialPlacements,reservationBounds,rectanglesOverlap,fitsTube} from '../src/residential-kit.js';
import {streetPilotPlacements} from '../src/street-kit.js';
import {candidateWorld,validateLayout,inspectAssets,verifyPreservation,applyCandidate} from '../scripts/populate-residential-kit.mjs';
// Test the historical pilot against its immutable source, not the growing live scene.
const world=JSON.parse(await fs.readFile(new URL('../assets/district-source-world.json',import.meta.url)));
test('exact deterministic residential namespace, counts, categories and reservations',()=>{
 assert.deepEqual(residentialKit,[{id:'TorusHome_CourtyardA',slug:'houses',name:'Courtyard Home'},{id:'TorusHome_RowA',slug:'houses',name:'Row-house Block'},{id:'TorusApartment_TerraceA',slug:'apartments',name:'Terrace Apartments'}]);
 const p=residentialPlacements();assert.deepEqual(p,residentialPlacements());assert.equal(p.length,12);
 assert.deepEqual(p.map(x=>x.id),Array.from({length:12},(_,i)=>'residential-kit-'+String(i+1).padStart(2,'0')));
 assert.deepEqual(residentialKitIds.map(id=>p.filter(x=>x.type===id).length),[6,4,2]);
 assert.deepEqual(residentialKitIds.map(id=>[residentialPilot.reservations[id].width,residentialPilot.reservations[id].depth]),[[8,8],[12,8],[16,12]]);
 for(const x of p){assert.equal(x.scale,4);assert.deepEqual(x.surface,{height:-.05,deckId:null});assert.equal(x.rotation,x.z>0?Math.PI:0);assert.ok(Math.abs(x.theta-(150*Math.PI/180+x.x/830))<1e-12);}
});
test('safe aisles, existing court model extents, masterPlan/spoke exclusion and tube-65 envelope',()=>{
 validateLayout(world);
 for(const p of residentialPlacements()){
  const b=reservationBounds(p);assert.ok(!rectanglesOverlap(b,residentialPilot.existingCourt,4));
  for(const existing of streetPilotPlacements()){
   // Conservative 8×10 m old home reservation; props have smaller envelopes.
   const old={xMin:existing.x-4,xMax:existing.x+4,zMin:existing.z-5,zMax:existing.z+5};
   assert.ok(!rectanglesOverlap(b,old,4),p.id+' vs '+existing.id);
  }
  assert.ok(fitsTube(p,[[-p.reservation.width/2,p.reservation.width/2],[0,10],[-p.reservation.depth/2,p.reservation.depth/2]]));
 }
 assert.equal(fitsTube({...residentialPlacements()[0],z:65},[[-4,4],[0,10],[-4,4]]),false);
});
test('additive world preserves all original fields and type indices, idempotent and rejects conflicts',()=>{
 const {next,added}=candidateWorld(world);verifyPreservation(world,next);assert.equal(next.assets.length,435);
 assert.equal(added.length,435-world.assets.length);assert.equal(candidateWorld(next).added.length,0);
 const conflict=structuredClone(next);conflict.assets.find(a=>a[0]==='residential-kit-01')[3]++;
 assert.throws(()=>candidateWorld(conflict),/Conflicting residential ID/);
 const duplicate=structuredClone(next);duplicate.assets.push(next.assets[0]);assert.throws(()=>candidateWorld(duplicate),/Duplicate saved IDs/);
 const unknown=structuredClone(next);unknown.assets.push(['residential-kit-99',0,0,0]);assert.throws(()=>candidateWorld(unknown),/Unknown residential namespace/);
 const changed=structuredClone(next);changed.assets[0][3]++;assert.throws(()=>verifyPreservation(world,changed),/Original records changed/);
});
test('real available manifests and OBJ bounds fit; missing worker assets are explicit prerequisites',async t=>{
 const result=await inspectAssets();assert.deepEqual(result.errors,[]);
 if(result.missing.length){t.skip('Asset-worker prerequisite missing: '+result.missing.join(', '));return;}
 assert.equal(result.models.length,3);
});
test('actual OBJ ground doorway supports a speed-15 capsule crossing (no live world writes)',async t=>{
 const assets=await inspectAssets();if(assets.missing.length){t.skip('Asset-worker files unavailable');return;}assert.deepEqual(assets.errors,[]);
 const THREE=await import('three'),{OBJLoader}=await import('three/addons/loaders/OBJLoader.js');
 const {ColliderWorld}=await import('../src/physics/collider-world.js'),{CharacterController}=await import('../src/physics/character-controller.js');
 const colliders=new ColliderWorld(),objects=new Map();
 for(const p of residentialPlacements()){
  const obj=new OBJLoader().parse(await fs.readFile(new URL('../assets/ultimate-buildings/'+p.type+'.obj',import.meta.url),'utf8'));
  const up=new THREE.Vector3(-Math.cos(p.theta),-Math.sin(p.theta),0),forward=new THREE.Vector3(0,0,1),right=new THREE.Vector3().crossVectors(up,forward);
  obj.position.set(830*Math.cos(p.theta),830*Math.sin(p.theta),p.z);obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));obj.rotateY(p.rotation);obj.scale.setScalar(4);obj.updateMatrixWorld(true);
  objects.set(p.id,obj);colliders.setObject(p.id,obj);
 }
 for(const p of residentialPlacements()){
  const entry=assets.models.find(m=>m.id===p.type).groundEntries.at(-1);assert.ok(entry,'Reviewed ground entry required '+p.type);
  const obj=objects.get(p.id),[x,y,z]=entry.centerMeters,controller=new CharacterController(colliders);
  controller.teleport(new THREE.Vector3(x/4,(y+.001)/4,(z+.8)/4).applyMatrix4(obj.matrixWorld));
  for(let i=0;i<8;i++)controller.tick(new THREE.Vector3());
  const inverse=obj.matrixWorld.clone().invert(),before=controller.position.clone().applyMatrix4(inverse).multiplyScalar(4),direction=new THREE.Vector3(0,0,-1).transformDirection(obj.matrixWorld);
  for(let i=0;i<14;i++)controller.tick(direction);
  // Allow threshold stepping to settle before checking final floor support.
  for(let i=0;i<60;i++)controller.tick(new THREE.Vector3());
  const after=controller.position.clone().applyMatrix4(inverse).multiplyScalar(4);
  assert.ok(before.z>z+.4,p.id+' start outside');assert.ok(after.z<z-.4,p.id+' ground passage blocked');assert.ok(Math.abs(after.x-x)<.12,p.id+' sideways slide');assert.ok(Math.abs(after.y-y)<.08,p.id+' floor support '+JSON.stringify({before:before.toArray(),after:after.toArray(),entry:entry.centerMeters}));assert.equal(controller.clear(),true,p.id+' capsule penetrates');
 }
});
test('atomic write/read-back, private backup and concurrency guard use scratch fixture only',async()=>{
 const scratch=process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch');
 await fs.mkdir(scratch,{recursive:true});const dir=await fs.mkdtemp(path.join(scratch,'residential-kit-unit-'));
 try{
  const file=path.join(dir,'fixture.json'),bytes=Buffer.from(JSON.stringify(world)),next=candidateWorld(world).next;
  await fs.writeFile(file,bytes);const result=await applyCandidate(file,bytes,next,{backupDir:path.join(dir,'backups')});
  assert.deepEqual(await fs.readFile(result.backup),bytes);assert.equal((await fs.stat(result.backup)).mode&0o777,0o600);
  const saved=await fs.readFile(file);assert.equal(saved.includes(10),false);verifyPreservation(world,JSON.parse(saved));
  // Deliberately stale bytes even after the pilot has already been applied;
  // a no-op world otherwise has identical before/after serialization.
  const staleBytes=Buffer.concat([bytes,Buffer.from(' ')]);
  await assert.rejects(applyCandidate(file,staleBytes,next,{backupDir:path.join(dir,'backups')}),/Concurrent world change/);
  assert.deepEqual(await fs.readFile(file),saved);
  await fs.writeFile(file+'.residential-kit-lock','occupied');
  await assert.rejects(applyCandidate(file,saved,next,{backupDir:path.join(dir,'backups')}),/EEXIST/);
  assert.deepEqual(await fs.readFile(file),saved);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
