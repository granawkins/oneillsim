import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {completedModels} from '../src/completed-models.js';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
const chrome='/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome';
test('47 completed models render on real published type pages with valid metadata and files',{timeout:360000},async()=>{
 const browser=await chromium.launch({executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:480,height:320}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const checked=[];
  for(const m of completedModels){
   await page.goto(base+`assets/${m.slug}/?capture=1&design=${m.id}`,{waitUntil:'domcontentloaded',timeout:30000});
   try{await page.waitForFunction(()=>window.__assetReady||window.__assetError,null,{timeout:60000});}catch(error){throw Error(`${m.id}: ${error.message}; page errors: ${JSON.stringify(errors)}`);}
   const info=await page.evaluate(()=>({error:window.__assetError,id:window.__assetManifest?.id,bounds:document.querySelector('#spec-bounds').textContent,geometry:document.querySelector('#spec-geometry').textContent,scale:document.querySelector('#spec-scale').textContent,atlasSize:document.querySelector('#spec-atlas').textContent,interpretation:document.querySelector('#asset-interpretation').textContent,atlas:document.querySelector('a[href$="_Atlas.png"]').getAttribute('href'),snapshot:document.querySelector('#snapshot-link').getAttribute('href')}));
   assert.equal(info.error,null);assert.equal(info.id,m.id);assert.notEqual(info.bounds,'—');assert.ok(!info.geometry.includes('undefined'));assert.equal(info.scale,'4× in the simulator');assert.ok(info.interpretation.length>10);assert.ok(info.atlas.endsWith(m.textureAtlas));assert.match(info.atlasSize,/^(512|1024) × (512|1024) atlas$/);
   for(const suffix of [m.id+'.obj',m.id+'.mtl',m.textureAtlas])assert.equal((await page.request.get(new URL(`assets/${m.directory}/${suffix}`,base).href)).status(),200);
   assert.ok(info.snapshot.includes(m.id));checked.push(m.id);
  }
  assert.equal(checked.length,47);assert.deepEqual(errors,[]);console.log(JSON.stringify({completedLibrary:{designs:checked.length,errors}}));
 }finally{await browser.close();}
});
test('all 47 actual editor loader models share seven isolated atlases; place/remove 46 without changing saved scene',{timeout:240000},async()=>{
 const browser=await chromium.launch({executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:320,height:240}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/world.json',async r=>{if(!['GET','HEAD'].includes(r.request().method())){writes.push(r.request().method());await r.abort();}else await r.continue();});
  await page.goto(base+'?capture=1&theta=150&z=0&mode=planner&height=45',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:120000});
  const result=await page.evaluate(async models=>{
   if(window.__oneillSimError)throw Error(window.__oneillSimError);window.requestAnimationFrame=()=>0;
   const {preloadAssets,loadAsset,getAsset}=await import('./src/editor/loader.js'),{placeAsset,removeAsset}=await import('./src/editor/placement.js'),{exportWorldState}=await import('./src/editor/state.js'),{characterColliders}=await import('./src/physics/collider-world.js');
   const before=JSON.stringify(exportWorldState()),count=characterColliders.colliders.size;await preloadAssets(models.map(m=>m.id));
   const kitMaterials=new Map(),kitMaps=new Map(),rows=[];let disposals=0;
   for(const m of models){
    const a=getAsset(m.id),b=await loadAsset(m.id),meshes=[],other=[];if(!a)throw Error('Not cached: '+m.id);a.traverse(c=>{if(c.isMesh)meshes.push(c)});b.traverse(c=>{if(c.isMesh)other.push(c)});
    if(meshes.length!==1||other.length!==1)throw Error('Expected one real mesh: '+m.id);
    const mesh=meshes[0];if(!mesh.material.map?.image?.width)throw Error('Undecoded atlas '+m.id);
    if(kitMaterials.has(m.materialKit)&&kitMaterials.get(m.materialKit)!==mesh.material)throw Error('Unpooled material '+m.id);
    kitMaterials.set(m.materialKit,mesh.material);kitMaps.set(m.materialKit,mesh.material.map);
    mesh.geometry.addEventListener('dispose',()=>disposals++);mesh.material.addEventListener('dispose',()=>disposals++);mesh.material.map.addEventListener('dispose',()=>disposals++);
    let placed=false,removed=false,collider=false;
    if(m.placeable!==false){const id=await placeAsset(m.id,Math.PI,0,4,0,{height:0,deckId:'completion-fixture'});placed=!!id;collider=(characterColliders.colliders.get(id)?.length||0)>0;removed=removeAsset(id);}
    rows.push({id:m.id,clone:a!==b,sharedGeometry:mesh.geometry===other[0].geometry,sharedMaterial:mesh.material===other[0].material,placed,removed,collider});
   }
   return {rows,materialPools:kitMaterials.size,gpuMaps:new Set(kitMaps.values()).size,disposals,savedUnchanged:before===JSON.stringify(exportWorldState()),collidersUnchanged:count===characterColliders.colliders.size,atlasRequests:[...new Set(models.map(m=>m.textureAtlas))].map(name=>({name,count:performance.getEntriesByType('resource').filter(r=>r.name.includes('/'+name)).length}))};
  },completedModels);
  assert.equal(result.rows.length,47);assert.equal(result.materialPools,7);assert.equal(result.gpuMaps,7);assert.equal(result.disposals,0);assert.equal(result.savedUnchanged,true);assert.equal(result.collidersUnchanged,true);
  for(const row of result.rows){assert.equal(row.clone,true);assert.equal(row.sharedGeometry,true);assert.equal(row.sharedMaterial,true);if(row.id!=='TorusStructure_HubA'){assert.equal(row.placed,true);assert.equal(row.removed,true);assert.equal(row.collider,true);}}
  for(const atlas of result.atlasRequests)assert.equal(atlas.count,1,atlas.name);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({completedEngine:result}));
 }finally{await browser.close();}
});
test('failed atlas is not reported as a ready rendered asset',{timeout:90000},async()=>{
 const browser=await chromium.launch({executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:320,height:240}});
  await page.route('**/TorusCommerceKit_Atlas.png',r=>r.abort());
  await page.goto(base+'assets/markets/?capture=1&design=TorusCommerce_MarketA',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__assetError,null,{timeout:60000});
  const result=await page.evaluate(()=>({ready:window.__assetReady,error:window.__assetError}));assert.equal(result.ready,false);assert.match(result.error,/Atlas failed/);
 }finally{await browser.close();}
});
