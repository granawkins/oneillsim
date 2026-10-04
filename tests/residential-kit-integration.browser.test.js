import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {residentialKitIds,residentialPilot,residentialPlacements} from '../src/residential-kit.js';
import {candidateWorld,inspectAssets} from '../scripts/populate-residential-kit.mjs';
const base=process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/';
const target=new URL(base);
assert.ok(['127.0.0.1','localhost','[::1]','stanfordtorus.com'].includes(target.hostname),'Browser QA requires the existing app');
const pilot=residentialPlacements();
test('twelve real residential models: saved IDs, feet, actual bounds, shared resources, colliders and render cost',{timeout:120000},async()=>{
 const assets=await inspectAssets();assert.deepEqual(assets.missing,[],'Finish asset-worker files before browser integration');assert.deepEqual(assets.errors,[]);
 const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:640,height:400}}),errors=[],writes=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  // Even candidate mode intercepts only GET; it never PUTs the live world.
  await page.route('**/*',async route=>{
   const request=route.request();if(!['GET','HEAD'].includes(request.method())){writes.push(request.url());await route.abort();return;}
   if(process.env.RESIDENTIAL_KIT_CANDIDATE==='1'&&request.method()==='GET'&&new URL(request.url()).origin===target.origin&&new URL(request.url()).pathname.endsWith('/world.json')){
    const response=await route.fetch(),world=await response.json();const {next}=candidateWorld(world);
    await route.fulfill({response,json:next});return;
   }
   await route.fallback();
  });
  await page.goto(base+residentialPilot.plannerQuery,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:60000});
  const result=await page.evaluate(async({ids,pilot,manifests})=>{
   if(window.__oneillSimError)throw Error(window.__oneillSimError);
   window.requestAnimationFrame=()=>0;
   const THREE=await import('three'),{scene,camera,renderer,habitatGroup}=await import('./src/scene.js');
   const {editorState}=await import('./src/editor/state.js'),{characterColliders}=await import('./src/physics/collider-world.js'),{getAsset}=await import('./src/editor/loader.js');
   const saved=await fetch('world.json').then(r=>r.json());
   const objects=new Map(habitatGroup.children.filter(o=>o.userData.assetId).map(o=>[o.userData.assetId,o]));
   const prototypes=ids.map(id=>{
    const object=getAsset(id);if(!object)throw Error('Unregistered model '+id);
    const meshes=[];object.traverse(c=>{if(c.isMesh)meshes.push(c);});if(meshes.length!==1)throw Error('Expected one mesh '+id);
    return meshes[0];
   });
   habitatGroup.updateWorldMatrix(true,true);
   const inverse=habitatGroup.matrixWorld.clone().invert();
   const entries=pilot.map(p=>{
    const o=objects.get(p.id);if(!o)return {id:p.id,missing:true};
    const mesh=[];o.traverse(c=>{if(c.isMesh)mesh.push(c);});
    const prototype=prototypes[ids.indexOf(p.type)],localBounds=new THREE.Box3().setFromObject(getAsset(p.type));
    const actualBounds=[0,1,2].map(k=>[localBounds.min.getComponent(k)*4,localBounds.max.getComponent(k)*4]);
    let maxTubeDistance=0,minHeight=Infinity,maxHeight=-Infinity;
    const matrix=new THREE.Matrix4(),v=new THREE.Vector3();
    o.traverse(c=>{if(!c.isMesh)return;matrix.multiplyMatrices(inverse,c.matrixWorld);
     for(let i=0;i<c.geometry.attributes.position.count;i++){
      v.fromBufferAttribute(c.geometry.attributes.position,i).applyMatrix4(matrix);
      const radial=Math.hypot(v.x,v.y);maxTubeDistance=Math.max(maxTubeDistance,Math.hypot(radial-830,v.z));
      minHeight=Math.min(minHeight,830-radial);maxHeight=Math.max(maxHeight,830-radial);
     }
    });
    return {id:p.id,type:p.type,scale:o.scale.toArray(),footRadius:Math.hypot(o.position.x,o.position.y),actualBounds,manifestBounds:manifests.find(m=>m.id===p.type).bounds,maxTubeDistance,minHeight,maxHeight,meshCount:mesh.length,sharedGeometry:mesh.length===1&&mesh[0].geometry===prototype.geometry,sharedMaterial:mesh.length===1&&mesh[0].material===prototype.material,colliderTriangles:characterColliders.colliders.get(p.id)?.length};
   });
   const {CharacterController,CHARACTER}=await import('./src/physics/character-controller.js');
   const doorPassage=[];
   for(const p of pilot){
    const entry=manifests.find(m=>m.id===p.type).groundEntries?.at(-1),o=objects.get(p.id);
    if(!entry||!o){doorPassage.push({id:p.id,verified:false,reason:'No reviewed ground entry metadata/object'});continue;}
    const placementMatrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),toLocal=placementMatrix.clone().invert();
    const [x,y,z]=entry.centerMeters;
    const controller=new CharacterController(characterColliders);
    controller.teleport(new THREE.Vector3(x/4,(y+.001)/4,(z+.8)/4).applyMatrix4(placementMatrix));
    for(let i=0;i<8;i++)controller.tick(new THREE.Vector3());
    const before=controller.position.clone().applyMatrix4(toLocal).multiplyScalar(4);
    const direction=new THREE.Vector3(0,0,-1).transformDirection(placementMatrix);
    for(let i=0;i<14;i++)controller.tick(direction);
    for(let i=0;i<60;i++)controller.tick(new THREE.Vector3());
    const after=controller.position.clone().applyMatrix4(toLocal).multiplyScalar(4);
    doorPassage.push({id:p.id,verified:true,entry:[x,y,z],before:before.toArray(),after:after.toArray(),clear:controller.clear(),radius:CHARACTER.radius,height:CHARACTER.height,speed:CHARACTER.speed});
   }
   const measure=()=>{renderer.render(scene,camera);return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};
   const withBuildings=measure(),visibility=pilot.map(p=>objects.get(p.id)?.visible);
   for(const p of pilot)if(objects.has(p.id))objects.get(p.id).visible=false;
   const withoutBuildings=measure();pilot.forEach((p,i)=>{if(objects.has(p.id))objects.get(p.id).visible=visibility[i];});measure();
   return {savedIds:saved.assets.map(a=>a[0]),loadedIds:editorState.placedAssets.map(a=>a.id),entries,sharedKitMaterial:prototypes.every(m=>m.material===prototypes[0].material),materialName:prototypes[0].material.name,sharedMap:prototypes.every(m=>m.material.map===prototypes[0].material.map),mapLoaded:!!prototypes[0].material.map?.image?.width,atlasRequests:performance.getEntriesByType('resource').filter(e=>e.name.includes('TorusResidentialKit_Atlas.png')).length,colliders:characterColliders.colliders.size,collisionTriangles:characterColliders.triangleCount,withBuildings,withoutBuildings,doorPassage};
  },{ids:residentialKitIds,pilot,manifests:assets.models});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(result.loadedIds,result.savedIds);
  assert.equal(result.savedIds.length,435);assert.equal(result.entries.length,12);assert.equal(result.sharedKitMaterial,true);assert.equal(result.materialName,'TorusResidentialKit');assert.equal(result.sharedMap,true);assert.equal(result.mapLoaded,true);assert.equal(result.atlasRequests,1);
  for(const e of result.entries){
   assert.equal(e.missing,undefined,e.id+' absent');assert.equal(e.meshCount,1);assert.deepEqual(e.scale,[4,4,4]);assert.ok(Math.abs(e.footRadius-830)<1e-8);
   assert.equal(e.sharedGeometry,true);assert.equal(e.sharedMaterial,true);assert.ok(e.colliderTriangles>0);assert.ok(e.maxTubeDistance<65);
   for(let k=0;k<3;k++)for(let j=0;j<2;j++)assert.ok(Math.abs(e.actualBounds[k][j]-e.manifestBounds[k][j])<1e-4,'Actual/manifest bounds '+e.id);
  }
  for(const passage of result.doorPassage){
   if(!passage.verified){console.warn('Ground door passage unverified: '+passage.id+' '+passage.reason);continue;}
   assert.equal(passage.radius,.35);assert.equal(passage.height,2);assert.equal(passage.speed,15);
   assert.ok(passage.before[2]>passage.entry[2]+.4,'Must begin outside doorway: '+passage.id);
   assert.ok(passage.after[2]<passage.entry[2]-.4,'Capsule must cross actual ground doorway: '+passage.id);
   assert.ok(Math.abs(passage.after[0]-passage.entry[0])<.12,'Door crossing must not slide sideways: '+passage.id);
   assert.ok(Math.abs(passage.after[1]-passage.entry[1])<.08,'Ground-floor support lost: '+passage.id);
   assert.equal(passage.clear,true,'Capsule intersects geometry after entry: '+passage.id);
  }
  assert.ok(result.withBuildings.drawCalls>=result.withoutBuildings.drawCalls);
  const scratch=process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch');await fs.mkdir(scratch,{recursive:true});
  await page.screenshot({path:path.join(scratch,'residential-kit-planner.png'),timeout:30000});
  await page.goto(base+residentialPilot.humanQuery,{waitUntil:'domcontentloaded',timeout:10000});
  await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.__oneillSimError),undefined);
  await page.screenshot({path:path.join(scratch,'residential-kit-human.png'),timeout:30000});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  await fs.writeFile(path.join(scratch,'residential-kit-integrated-profile.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({residentialKit:{candidate:process.env.RESIDENTIAL_KIT_CANDIDATE==='1',placements:result.savedIds.length,newBuildings:12,sharedMaterial:result.sharedKitMaterial,sharedMap:result.sharedMap,atlasRequests:result.atlasRequests,colliders:result.colliders,collisionTriangles:result.collisionTriangles,withBuildings:result.withBuildings,withoutBuildings:result.withoutBuildings,doorPassage:result.doorPassage}}));
 }finally{await browser.close();}
});
