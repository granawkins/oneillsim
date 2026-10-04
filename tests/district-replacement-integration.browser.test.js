import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {candidateWorld,districtTargetIds,districtBuildingIds,districtCapture} from '../src/district-replacement.js';
import {readContracts,inspectAssets} from '../scripts/replace-residential-district.mjs';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
const target=new URL(base),candidate=process.env.DISTRICT_REPLACEMENT_CANDIDATE==='1';
assert.ok(['127.0.0.1','localhost','[::1]','stanfordtorus.com','granawkins.com'].includes(target.hostname),'QA must use the existing local/public app');
const scratch=process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch');
test('complete Residential A: actual OBJ placements, preserved decks, doors/stairs, floor support and render/collision profile',{timeout:360000},async()=>{
 // Missing worker resources are a failure, not a pass/skip with placeholder geometry.
 const {buildings,landscape}=await readContracts();
 const response=await fetch(new URL('world.json',base));assert.equal(response.status,200);
 const original=await response.json(),plan=candidateWorld(original,buildings,landscape);
 if(!candidate)assert.equal(plan.replaced,0,'Deployed check requires the migrated saved world; use DISTRICT_REPLACEMENT_CANDIDATE=1 for read-only candidate QA');
 const saved=candidate?plan.next:original,assets=await inspectAssets(saved,buildings,landscape);
 const browser=await chromium.launch({executablePath:process.env.SNAPSHOT_CHROMIUM_PATH||'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:640,height:400}}),errors=[],writes=[],resourceFailures=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&/TorusDistrict_/.test(r.url()))resourceFailures.push({url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{window.__districtBlockoutCalls=[];});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(!['GET','HEAD'].includes(request.method())){writes.push({url:request.url(),method:request.method()});await route.abort();return;}
   // No candidate writes, extra server, data URL fake geometry or fallback assets.
   if(candidate&&request.method()==='GET'&&url.origin===target.origin&&url.pathname.endsWith('/world.json')){
    const live=await route.fetch(),world=await live.json();assert.deepEqual(world,original,'World changed during candidate browser run');
    await route.fulfill({response:live,json:saved});return;
   }
   if(candidate&&url.origin===target.origin&&url.pathname.endsWith('/src/editor/catalog.js')){
    // Browser-local provisional registration only: parent owns shared catalog.
    // Once registered, these guards add nothing. Deployed mode never fixtures it.
    const live=await route.fetch(),source=await live.text();
    const additions=assets.models.map(m=>`if (!${m.directory==='ultimate-nature'?'PLANTS':'BUILDINGS'}.includes(${JSON.stringify(m.id)})) ${m.directory==='ultimate-nature'?'PLANTS':'BUILDINGS'}.push(${JSON.stringify(m.id)});`).join('\n');
    await route.fulfill({response:live,body:source+'\n'+additions});return;
   }
   if(candidate&&url.origin===target.origin&&url.pathname.endsWith('/src/editor/blockout.js')){
    const live=await route.fetch(),source=await live.text();
    assert.ok(source.includes('export function createBlockout(spec) {'),'Blockout instrumentation signature changed');
    await route.fulfill({response:live,body:source.replace('export function createBlockout(spec) {','export function createBlockout(spec) { window.__districtBlockoutCalls.push(spec.id);')});return;
   }
   await route.fallback();
  });
  const started=Date.now();await page.goto(base+districtCapture.plannerQuery,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:120000});
  const startupMs=Date.now()-started;
  const result=await page.evaluate(async({saved,models,targetIds,buildingIds})=>{
   if(window.__oneillSimError)throw Error(window.__oneillSimError);
   window.requestAnimationFrame=()=>0;
   const THREE=await import('three'),{scene,camera,renderer,habitatGroup}=await import('./src/scene.js');
   const {editorState,exportWorldState}=await import('./src/editor/state.js'),{getAsset}=await import('./src/editor/loader.js');
   const {characterColliders}=await import('./src/physics/collider-world.js'),{CharacterController}=await import('./src/physics/character-controller.js');
   const {humanController}=await import('./src/controls/modes/human.js');
   const makeController=()=>new CharacterController(characterColliders,{...humanController.config,groundExists:humanController.groundExists});
   habitatGroup.updateWorldMatrix(true,true);
   const inverse=habitatGroup.matrixWorld.clone().invert(),objects=new Map(habitatGroup.children.filter(o=>o.userData.assetId).map(o=>[o.userData.assetId,o]));
   const prototypes=new Map(models.map(m=>[m.id,getAsset(m.id)]));
   const entries=targetIds.map(id=>{
    const record=saved.assets.find(a=>a[0]===id),type=saved.assetTypes[record[1]],object=objects.get(id),prototype=prototypes.get(type),state=editorState.placedAssets.find(a=>a.id===id);
    if(!object||!prototype)return {id,missing:true,type};
    const prototypeMeshes=[];prototype.traverse(c=>{if(c.isMesh)prototypeMeshes.push(c);});
    let meshes=0,shared=true,mapsLoaded=true,maxTubeDistance=0,minHeight=Infinity,maxHeight=-Infinity;
    const matrix=new THREE.Matrix4(),v=new THREE.Vector3();
    object.traverse(c=>{
     if(!c.isMesh)return;meshes++;shared&&=prototypeMeshes.some(p=>p.geometry===c.geometry&&p.material===c.material);
     mapsLoaded&&=(Array.isArray(c.material)?c.material:[c.material]).every(m=>m.map?.image?.width>0&&m.map?.image?.height>0);
     matrix.multiplyMatrices(inverse,c.matrixWorld);
     for(let n=0;n<c.geometry.attributes.position.count;n++){
      v.fromBufferAttribute(c.geometry.attributes.position,n).applyMatrix4(matrix);const radial=Math.hypot(v.x,v.y);
      maxTubeDistance=Math.max(maxTubeDistance,Math.hypot(radial-830,v.z));minHeight=Math.min(minHeight,830-radial);maxHeight=Math.max(maxHeight,830-radial);
     }
    });
    const b=new THREE.Box3().setFromObject(prototype),actualBounds=[0,1,2].map(k=>[b.min.getComponent(k)*4,b.max.getComponent(k)*4]);
    return {id,type,meshes,sharedGeometryAndMaterials:shared,mapsLoaded,scale:object.scale.toArray(),footRadius:Math.hypot(object.position.x,object.position.y),deckId:object.userData.deckId,surface:state?.surface,hasBlockout:!!state?.blockout,colliderTriangles:characterColliders.colliders.get(id)?.length,actualBounds,maxTubeDistance,minHeight,maxHeight};
   });
   const routes=[],floors=[];
   // Real gameplay capsule on full-world colliders, not an isolated AABB fixture.
   for(const type of buildingIds){
    const model=models.find(m=>m.id===type),d=model.descriptor,id=d.parcelIds[0],object=objects.get(id);
    if(!object)throw Error('Missing route object '+type);
    const matrix=new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld),toLocal=matrix.clone().invert();
    const r=model.manifest.radiusMeters??(830-d.elevation),curved=!!model.manifest.warp;
    const warp=(x,y,z)=>curved?new THREE.Vector3((r-y)*Math.sin(x/r),r-(r-y)*Math.cos(x/r),z):new THREE.Vector3(x,y,z);
    const localPoint=(x,y,z)=>warp(x,y,z).multiplyScalar(.25).applyMatrix4(matrix);
    const localPosition=controller=>{const p=controller.position.clone().applyMatrix4(toLocal).multiplyScalar(4);return curved?new THREE.Vector3(Math.atan2(p.x,r-p.y)*r,r-Math.hypot(p.x,r-p.y),p.z):p;};
    const intent=model.manifest.collisionIntent;
    if(!intent?.entries?.length||!intent.floorSurfaces?.length)throw Error('Reviewed entry/floor metadata required '+type);
    const entry=intent.entries.find(e=>e.passable&&(e.centerIntrinsicMeters?.[1]??e.floorMeters)<=.3);
    if(!entry)throw Error('Reviewed ground door required '+type);
    const axis=entry.frontAxis||'+Z',normal=axis==='+Z'?new THREE.Vector3(0,0,1):axis==='-Z'?new THREE.Vector3(0,0,-1):axis==='+X'?new THREE.Vector3(1,0,0):axis==='-X'?new THREE.Vector3(-1,0,0):null;
    if(!normal)throw Error('Unsupported entry axis '+axis);
    const center=new THREE.Vector3(...(entry.centerIntrinsicMeters??entry.centerMeters)),start=center.clone().addScaledVector(normal,.85);start.y+=.01;
    const controller=makeController();controller.teleport(localPoint(...start.toArray()));
    for(let n=0;n<20;n++)controller.tick(new THREE.Vector3());
    const before=localPosition(controller),direction=normal.clone().negate().transformDirection(matrix);
    for(let n=0;n<16;n++)controller.tick(direction);
    for(let n=0;n<60;n++)controller.tick(new THREE.Vector3());
    const after=localPosition(controller);
    routes.push({type,id,kind:'door',before:before.toArray(),after:after.toArray(),startSide:before.clone().sub(center).dot(normal),endSide:after.clone().sub(center).dot(normal),clear:controller.clear(),grounded:controller.grounded});
    // Every advertised floor gets a support/clearance check. Coordinate metadata
    // is interpreted in placed metres, exactly like collisionIntent entries.
    for(const floor of intent.floorSurfaces.filter(f=>f.tag==='floor')){
     const [x0,x1,z0,z1]=floor.boundsXZ,x=(x0+x1)/2,z=(z0+z1)/2;
     const capsule=makeController();capsule.teleport(localPoint(x,floor.topMeters+.01,z));
     for(let n=0;n<90;n++)capsule.tick(new THREE.Vector3());
     const position=localPosition(capsule);floors.push({type,id,expected:floor.topMeters,actual:position.y,grounded:capsule.grounded,clear:capsule.clear()});
    }
    if(d.levels>1&&!(intent.allStairRoutes?.length>=d.levels-1))throw Error('All upper floors require reviewed intrinsic stair routes '+type);
    for(const route of intent.allStairRoutes||[]){
     const waypoints=route.intrinsicMeters;
     if(!Array.isArray(waypoints)||waypoints.length<3||!waypoints.every(p=>p.length===3&&p.every(Number.isFinite)))throw Error('Unsupported stair route schema '+type);
     const capsule=makeController(),start=waypoints[0];capsule.teleport(localPoint(start[0],start[1]+.01,start[2]));
     for(let n=0;n<30;n++)capsule.tick(new THREE.Vector3());
     let ticks=0,reached=0;
     for(const goal of waypoints.slice(1)){
      let segmentTicks=0;
      for(;segmentTicks<240;segmentTicks++){
       const p=localPosition(capsule),dx=goal[0]-p.x,dz=goal[2]-p.z;
       if(Math.hypot(dx,dz)<.18){reached++;break;}
       const angle=p.x/r,direction=new THREE.Vector3(dx*Math.cos(angle),dx*Math.sin(angle),dz).transformDirection(matrix);
       capsule.tick(direction);ticks++;
      }
      if(segmentTicks===240)break;
     }
     for(let n=0;n<60;n++)capsule.tick(new THREE.Vector3());
     const position=localPosition(capsule);routes.push({type,id,kind:'stairs',ticks,reached,waypoints:waypoints.length-1,expected:waypoints.at(-1)[1],actual:position.y,clear:capsule.clear(),grounded:capsule.grounded,position:position.toArray()});
    }
   }
   const landscapeChecks=[];
   for (const model of models.filter(m=>m.descriptor.category!=='trees'&&!buildingIds.includes(m.id))) {
    const d=model.descriptor,o=objects.get(d.parcelIds[0]),matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),inv=matrix.clone().invert(),r=830-d.elevation;
    const warp=(x,y,z)=>new THREE.Vector3((r-y)*Math.sin(x/r),r-(r-y)*Math.cos(x/r),z).multiplyScalar(.25).applyMatrix4(matrix);
    for(const x of [-d.width*.35,0,d.width*.35]) {
     const c=makeController();c.teleport(warp(x,d.height+.01,0));
     for(let n=0;n<60;n++)c.tick(new THREE.Vector3());
     const p=c.position.clone().applyMatrix4(inv).multiplyScalar(4),height=r-Math.hypot(p.x,r-p.y);
     landscapeChecks.push({id:model.id,x,expected:d.height,height,clear:c.clear(),grounded:c.grounded});
    }
   }
   const queryStart=performance.now();for(const id of targetIds){const o=objects.get(id),p=o.position.clone(),box=new THREE.Box3().setFromCenterAndSize(p,new THREE.Vector3(2,3,2));characterColliders.query(box);}const queryMs=performance.now()-queryStart;
   renderer.render(scene,camera);
   const render={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};
   const atlasNames=[...new Set(models.map(m=>m.descriptor.textureAtlas))];
   const maps=atlasNames.map(name=>({name,requests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/'+name)).map(r=>({transferSize:r.transferSize,decodedBodySize:r.decodedBodySize,duration:r.duration}))}));
   const exported=exportWorldState();return {entries,routes,floors,landscapeChecks,render,maps,queryMs,queryCount:targetIds.length,collisionStats:{...characterColliders.stats},collisionCount:characterColliders.colliders.size,collisionTriangles:characterColliders.triangleCount,loadedIds:editorState.placedAssets.map(a=>a.id),exported,blockoutCalls:window.__districtBlockoutCalls};
  },{saved,models:assets.models,targetIds:districtTargetIds,buildingIds:districtBuildingIds});
  assert.deepEqual(result.loadedIds,saved.assets.map(a=>a[0]));assert.equal(result.entries.length,297);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(resourceFailures,[]);
  if(candidate)assert.ok(result.blockoutCalls.every(id=>!districtTargetIds.includes(id)),'createBlockout called for original replacement target');
  for(const e of result.entries){
   const record=saved.assets.find(a=>a[0]===e.id),model=assets.models.find(m=>m.id===e.type);
   assert.equal(e.missing,undefined,e.id+' did not load');assert.ok(e.meshes>0);assert.equal(e.sharedGeometryAndMaterials,true,e.id+' is not actual cached OBJ');assert.equal(e.hasBlockout,false);assert.equal(e.mapsLoaded,true,e.id+' has an undecoded atlas');
   assert.deepEqual(e.scale,[4,4,4]);assert.deepEqual(e.surface,record[7]);assert.equal(e.deckId,record[7].deckId);assert.ok(Math.abs(e.footRadius-(830-record[7].height-.05))<1e-6);assert.ok(e.colliderTriangles>0,e.id+' lacks mesh collision');assert.ok(e.maxTubeDistance<=65.001,e.id+' outside tube');
   for(let k=0;k<3;k++)for(let j=0;j<2;j++)assert.ok(Math.abs(e.actualBounds[k][j]-model.bounds[k][j])<1e-4);
  }
  result.exported.assets.forEach((a,i)=>{assert.equal(result.exported.assetTypes[a[1]],saved.assetTypes[saved.assets[i][1]]);assert.deepEqual(a.slice(2),saved.assets[i].slice(2));});
  assert.equal(new Set(result.routes.map(r=>r.type)).size,12);
  for(const route of result.routes){
   assert.equal(route.clear,true,JSON.stringify(route));assert.equal(route.grounded,true,JSON.stringify(route));
   if(route.kind==='door'){assert.ok(route.startSide>.4,JSON.stringify(route));assert.ok(route.endSide<-.4,JSON.stringify(route));}
   else{assert.equal(route.reached,route.waypoints,JSON.stringify(route));assert.ok(Math.abs(route.expected-route.actual)<.12,JSON.stringify(route));}
  }
  assert.equal(result.landscapeChecks.length,108);
  for(const check of result.landscapeChecks) {assert.equal(check.clear,true,JSON.stringify(check));assert.equal(check.grounded,true,JSON.stringify(check));assert.ok(Math.abs(check.height-check.expected)<.12,JSON.stringify(check));}
  assert.ok(result.floors.length>=buildings.reduce((n,d)=>n+d.levels,0),'Missing multi-level floor support checks');
  for(const floor of result.floors){assert.equal(floor.grounded,true,JSON.stringify(floor));assert.equal(floor.clear,true,JSON.stringify(floor));assert.ok(Math.abs(floor.expected-floor.actual)<.12,JSON.stringify(floor));}
  for(const map of result.maps)assert.ok(map.requests.length>=1&&map.requests.length<=1,'Atlas should download once, cached across placements: '+map.name);
  await fs.mkdir(scratch,{recursive:true});await page.screenshot({path:path.join(scratch,'district-replacement-planner.png'),timeout:30000});
  await page.goto(base+districtCapture.humanQuery,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:120000});
  await page.evaluate(async elevation=>{
   if(window.__oneillSimError)throw Error(window.__oneillSimError);
   const {cameraAnchor,scene,camera,renderer,habitatGroup}=await import('./src/scene.js');
   window.requestAnimationFrame=()=>0;const theta=38*Math.PI/180,r=830-elevation-1.65;
   cameraAnchor.position.set(r*Math.cos(theta),r*Math.sin(theta),0);habitatGroup.updateWorldMatrix(true,true);renderer.render(scene,camera);
  },districtCapture.humanElevation);
  await page.screenshot({path:path.join(scratch,'district-replacement-human.png'),timeout:30000});assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  const profile={candidate,base,startupMs,...result};await fs.writeFile(path.join(scratch,'district-replacement-profile.json'),JSON.stringify(profile,null,2));
  console.log(JSON.stringify({districtReplacement:{candidate,total:435,replaced:297,preserved:138,models:assets.modelCount,startupMs,render:result.render,maps:result.maps,collisionCount:result.collisionCount,collisionTriangles:result.collisionTriangles,queryMs:result.queryMs,queryCount:result.queryCount,collisionStats:result.collisionStats,doors:result.routes.filter(r=>r.kind==='door').length,stairs:result.routes.filter(r=>r.kind==='stairs').length,floors:result.floors.length,scratch}}));
 }finally{await browser.close();}
});
