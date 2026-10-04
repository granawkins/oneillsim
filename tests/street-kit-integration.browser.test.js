import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {streetKitIds,streetPilotPlacements} from '../src/street-kit.js';
const base=process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/';
const pilot=streetPilotPlacements();
test('real street kit loads at correct scale, shares resources, collides and fits Garden Court',{timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:640,height:400}});const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());await route.abort();return;}
   if(process.env.STREET_KIT_CANDIDATE==='1'&&new URL(route.request().url()).pathname.endsWith('/world.json')){
    const response=await route.fetch(),world=await response.json();
    for(const id of streetKitIds)if(!world.assetTypes.includes(id))world.assetTypes.push(id);
    for(const p of pilot)if(!world.assets.some(a=>a[0]===p.id))world.assets.push([p.id,world.assetTypes.indexOf(p.type),p.theta,p.z,p.scale,p.rotation,null,p.surface]);
    await route.fulfill({response,json:world});return;
   }
   await route.fallback();
  });
  await page.goto(base+'?capture=1&theta=150&z=22&mode=planner&height=14&yaw=0&pitch=-30',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:60000});
  const result=await page.evaluate(async({ids,pilot})=>{
   if(window.__oneillSimError)throw Error(window.__oneillSimError);
   window.requestAnimationFrame=()=>0;
   const THREE=await import('three');
   const {scene,camera,renderer,habitatGroup}=await import('./src/scene.js');
   const {editorState}=await import('./src/editor/state.js');
   const {characterColliders}=await import('./src/physics/collider-world.js');
   const {getAsset}=await import('./src/editor/loader.js');
   const objects=new Map(habitatGroup.children.filter(o=>o.userData.assetId).map(o=>[o.userData.assetId,o]));
   const models=ids.map(id=>{const o=getAsset(id);let m;o.traverse(c=>{if(c.isMesh)m=c;});return m;});
   const world=await fetch('world.json').then(r=>r.json());
   const entries=pilot.map(p=>{const o=objects.get(p.id);if(!o)return {id:p.id,missing:true};const b=new THREE.Box3().setFromObject(getAsset(p.type));return {id:p.id,type:p.type,footRadius:Math.hypot(o.position.x,o.position.y),scale:o.scale.x,dimensions:b.getSize(new THREE.Vector3()).multiplyScalar(4).toArray(),colliderTriangles:characterColliders.colliders.get(p.id)?.length};});
   const info=()=>{renderer.render(scene,camera);return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,gpuTextures:renderer.info.memory.textures,gpuGeometries:renderer.info.memory.geometries};};
   const metrics=info();
   // Use exactly the same camera for before/after draw-call comparison.
   for(const p of pilot)if(objects.has(p.id))objects.get(p.id).visible=false;
   const withoutPilot=info();
   for(const p of pilot)if(objects.has(p.id))objects.get(p.id).visible=true;
   info();
   // Repetition proof, not a FPS benchmark: 1,200 plain clones versus six batches.
   const repeatScene=new THREE.Scene(),repeatCamera=new THREE.OrthographicCamera(-32,32,32,-32,.1,200);
   repeatCamera.position.set(0,50,50);repeatCamera.lookAt(0,0,0);repeatScene.add(new THREE.AmbientLight(0xffffff,2));
   const placements=[];for(let i=0;i<1200;i++){const model=getAsset(ids[i%6]);model.scale.setScalar(4);model.position.set((i%40-20)*1.3,0,(Math.floor(i/40)-15)*1.3);model.updateMatrixWorld(true);placements.push(model);repeatScene.add(model);}
   renderer.render(repeatScene,repeatCamera);const cloneCalls=renderer.info.render.calls;
   for(const o of placements)repeatScene.remove(o);
   for(let k=0;k<6;k++){const instanced=new THREE.InstancedMesh(models[k].geometry,models[k].material,200);for(let j=0;j<200;j++)instanced.setMatrixAt(j,placements[k+j*6].matrix);instanced.instanceMatrix.needsUpdate=true;repeatScene.add(instanced);}
   renderer.render(repeatScene,repeatCamera);const instanceCalls=renderer.info.render.calls;
   info();
   return {ids:editorState.placedAssets.map(a=>a.id),savedIds:world.assets.map(a=>a[0]),entries,sharedMaterial:models.every(m=>m.material===models[0].material),sharedMap:models.every(m=>m.material.map===models[0].material.map),colliders:characterColliders.colliders.size,collisionTriangles:characterColliders.triangleCount,metrics,withoutPilot,repetition:{count:1200,cloneCalls,instanceCalls},atlasRequests:performance.getEntriesByType('resource').filter(e=>e.name.includes('TorusStreetKit_Atlas.png')).length};
  },{ids:streetKitIds,pilot});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(result.ids,result.savedIds);
  assert.equal(result.entries.length,36);assert.equal(result.sharedMaterial,true);assert.equal(result.sharedMap,true);
  assert.equal(result.atlasRequests,1);
  for(const e of result.entries){assert.equal(e.missing,undefined);assert.ok(e.colliderTriangles>0);assert.equal(e.scale,4);assert.ok(Math.abs(e.footRadius-830)<1e-8);}
  assert.equal(result.repetition.cloneCalls,1200);assert.equal(result.repetition.instanceCalls,6);
  const scratch=process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch');
  await page.screenshot({path:path.join(scratch,'street-kit-court-planner.png')});
  // Human preset at the central aisle, with no pointer-lock/input/save actions.
  await page.goto(base+'?capture=1&theta=150&z=5&yaw=0&pitch=0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:60000});
  await page.screenshot({path:path.join(scratch,'street-kit-court-human.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  await fs.writeFile(path.join(scratch,'street-kit-integrated-profile.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({streetKit:{placements:result.ids.length,pilot:result.entries.length,sharedMaterial:result.sharedMaterial,sharedMap:result.sharedMap,atlasRequests:result.atlasRequests,colliders:result.colliders,collisionTriangles:result.collisionTriangles,metrics:result.metrics,withoutPilot:result.withoutPilot,repetition:result.repetition}}));
 }finally{await browser.close();}
});
