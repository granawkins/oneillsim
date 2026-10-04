import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildFarms,farmAssets,farmCollision} from '../src/settlement-farms.js';
import {farmBlocks,farmDecks,farmStairs} from '../src/agriculture-plan.js';
import {districts} from '../src/settlement-plan.js';
const raw=fs.readFileSync(new URL('../assets/settlement-source-world.json',import.meta.url));
const source=JSON.parse(raw);
function deepFreeze(o){Object.freeze(o);for(const v of Object.values(o))if(v&&typeof v==='object')deepFreeze(v);return o;}
const plan=buildFarms(deepFreeze(structuredClone(source)));
const inventory=JSON.parse(fs.readFileSync(new URL('../assets/ultimate-buildings/TorusSettlementFarm_Inventory.json',import.meta.url)));

test('pinned immutable fixture, deterministic output, 78 replacements and 64 new landscape parcels',()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),'98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591');
 assert.deepEqual(buildFarms(source),plan);assert.equal(plan.replacements.length,78);assert.equal(plan.additions.length,64);assert.equal(farmAssets.length,94);
 assert.deepEqual(plan.decks,[]);assert.deepEqual(plan.stairs,[]);assert.equal(new Set([...plan.replacements,...plan.additions].map(p=>p.id)).size,142);
 assert.ok(plan.additions.every(p=>p.id.startsWith('settlement-farm-')));
 assert.equal(JSON.stringify(source),JSON.stringify(JSON.parse(raw)));
});
test('every original allocation and position retained; all 404 unrelated specimens untouched',()=>{
 const ids=new Set(plan.replacements.map(p=>p.id));
 for(const p of plan.replacements){const prior=source.assets.find(a=>a[0]===p.id);assert.equal(p.theta,prior[2]);assert.equal(p.z,prior[3]);assert.deepEqual(p.surface.sourcePlot,prior[6]);assert.equal(p.surface.deckId,prior[7].deckId);assert.equal(p.surface.anchorHeight,prior[6].elevation);assert.equal(p.surface.height,prior[6].elevation-.05);assert.equal(p.scale,4);}
 assert.equal(source.assets.filter(a=>!ids.has(a[0])).length,404);
 const totals={};for(const p of plan.replacements)totals[p.surface.sourcePlot.category]=(totals[p.surface.sourcePlot.category]||0)+p.surface.sourcePlot.area;
 for(const a of plan.summary.sourceAllocation)assert.ok(Math.abs(totals[a.id]-a.area)<1e-7);
});
test('applying named replacements/additions twice is idempotent',()=>{
 const candidate=structuredClone(source);
 function apply(p){for(const x of [...p.replacements,...p.additions]){let i=candidate.assetTypes.indexOf(x.type);if(i<0){i=candidate.assetTypes.length;candidate.assetTypes.push(x.type);}const record=[x.id,i,x.theta,x.z,x.scale,x.rotation,null,structuredClone(x.surface)];let k=candidate.assets.findIndex(a=>a[0]===x.id);if(k<0)candidate.assets.push(record);else candidate.assets[k]=record;}}
 apply(plan);const first=JSON.stringify(candidate);const again=buildFarms(candidate);assert.deepEqual(again,plan);apply(again);assert.equal(JSON.stringify(candidate),first);
});
test('Farm B/C grounded, varied, sector-contained, nonoverlapping and central corridor empty',()=>{
 for(const letter of ['b','c']){
  const plots=plan.additions.filter(p=>p.surface.districtId===`farm-${letter}`),d=districts.find(d=>d.id===`farm-${letter}`);assert.equal(plots.length,32);assert.ok(new Set(plots.map(p=>p.footprint.category)).size>=10);
  for(const p of plots){const f=p.footprint;assert.equal(p.surface.anchorHeight,0);assert.equal(p.surface.height,-.05);assert.ok(p.theta-f.width/2/830>=d.start);assert.ok(p.theta+f.width/2/830<=d.end);assert.ok(Math.abs(p.z)-f.depth/2>=7);assert.ok(Math.abs(p.z)+f.depth/2<=55);}
  for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++){const a=plots[i],b=plots[j];assert.ok(Math.abs(a.theta-b.theta)*830>=(a.footprint.width+b.footprint.width)/2-.001||Math.abs(a.z-b.z)>=(a.footprint.depth+b.footprint.depth)/2-.001);}
 }
});
test('authored assets exactly cover source reservation; support and solid collision contract explicit',()=>{
 for(const p of [...plan.replacements,...plan.additions]){
  const asset=inventory.find(a=>a.id===p.type);assert.ok(asset);assert.equal(asset.width,p.footprint.width);assert.equal(asset.depth,p.footprint.depth);assert.equal(asset.canonicalHeight,p.surface.anchorHeight);assert.deepEqual(p.surface.collisionSupport,{width:p.footprint.width,depth:p.footprint.depth,curveRadiusMeters:830-p.surface.anchorHeight,heightMeters:.05});
  assert.ok(p.surface.collisionIgnoreGroups.includes('ornament'));for(const solid of p.surface.collisionSolids){assert.equal(p.surface.collisionMode,'farm-zoned');assert.ok(solid.width>0&&solid.depth>0&&solid.maxHeight>solid.minHeight);assert.ok(Math.abs(solid.x)+solid.width/2<p.footprint.width/2);}
 }
 assert.equal(farmCollision('wheat',58,30,0).collisionMode,'support-only');assert.equal(farmCollision('greenhouse',58,30,0).collisionMode,'farm-zoned');
});
test('local routes on real decks, preserved stair approach and central plot aisles',()=>{
 assert.equal(plan.routes.length,32);assert.ok(plan.routes.every(r=>r.points.every(p=>p.length===3&&p.every(Number.isFinite))));
 for(const r of plan.routes){if(r.deckId==='ground')assert.ok(r.points.every(p=>p[2]===0));else{const d=farmDecks.find(d=>d.id===r.deckId);assert.ok(d);assert.ok(r.points.every(([t,z,h])=>h===d.height&&t>=d.start&&t<=d.end&&d.bands.some(([min,max])=>z>=min&&z<=max)));}}
 assert.equal(farmStairs.length,6);assert.ok(plan.summary.collisionIntegrationRequired);assert.equal(plan.summary.operationalFoodSystem,false);
 // Every visitor cross route hits only the explicitly open central x=0 lanes.
 for(const p of plan.additions)for(const box of p.surface.collisionSolids)assert.ok(Math.abs(box.x)-box.width/2>=1);
});

test('actual Three.js OBJ/MTL/atlas preview (opt-in, external flock required)',{skip:process.env.FARM_PREVIEW!=='1'},async()=>{
 const {chromium}=await import('playwright');const path=await import('node:path');
 const root=path.resolve(new URL('..',import.meta.url).pathname);const browser=await chromium.launch({executablePath:process.env.SNAPSHOT_CHROMIUM_PATH||'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:1100,height:800}});
 await page.route('**/__farm/**',async route=>{
  const rel=new URL(route.request().url()).pathname.split('/__farm/')[1];
  const aliases={'three.js':'node_modules/three/build/three.module.js','OBJLoader.js':'node_modules/three/examples/jsm/loaders/OBJLoader.js','MTLLoader.js':'node_modules/three/examples/jsm/loaders/MTLLoader.js'};
  const filename=aliases[rel]||'assets/ultimate-buildings/'+rel;
  await route.fulfill({body:fs.readFileSync(path.join(root,filename)),contentType:rel.endsWith('.png')?'image/png':rel.endsWith('.js')?'text/javascript':'text/plain'});
 });
 await page.route('**/__farm-review',route=>route.fulfill({contentType:'text/html',body:`<html><body style="margin:0"><script type="importmap">{"imports":{"three":"/__farm/three.js"}}</script><script type="module">
 import * as THREE from 'three';import {OBJLoader} from '/__farm/OBJLoader.js';import {MTLLoader} from '/__farm/MTLLoader.js';
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1100,800);renderer.setPixelRatio(1);document.body.appendChild(renderer.domElement);const scene=new THREE.Scene();scene.background=new THREE.Color('#e7ecde');scene.add(new THREE.HemisphereLight(0xffffff,0x627154,2.5));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(30,80,40);scene.add(sun);
 const manager=new THREE.LoadingManager();let loaded=false;manager.onLoad=()=>loaded=true;manager.onError=url=>window.failure=url;
 const materials=await new MTLLoader(manager).setPath('/__farm/').loadAsync('TorusSettlementFarm_Kit.mtl');materials.preload();const loader=new OBJLoader(manager).setMaterials(materials).setPath('/__farm/');
 const ids=['TorusSettlementFarm_A01','TorusSettlementFarm_Greenhouse','TorusSettlementFarm_Orchard','TorusSettlementFarm_Cattle'];
 for(let i=0;i<ids.length;i++){const o=await loader.loadAsync(ids[i]+'.obj');o.scale.setScalar(4);o.position.set((i%2-.5)*90,0,(Math.floor(i/2)-.5)*65);scene.add(o);}
 const camera=new THREE.PerspectiveCamera(42,1100/800,.1,1000);camera.position.set(140,150,190);camera.lookAt(0,0,0);window.previewRenderer=renderer;window.previewScene=scene;window.previewCamera=camera;
 const start=performance.now();while(!loaded&&performance.now()-start<15000)await new Promise(r=>setTimeout(r,30));await new Promise(r=>setTimeout(r,300));renderer.render(scene,camera);window.ready=loaded&&!window.failure;window.meshes=0;scene.traverse(o=>{if(o.isMesh)window.meshes++});window.textureSizes=Object.values(materials.materials).map(m=>m.map?.image?.width||0);window.drawCalls=renderer.info.render.calls;
 </script></body></html>`}));
 await page.goto('http://127.0.0.1:3200/__farm-review');await page.waitForFunction(()=>window.ready,{timeout:30000});const metrics=await page.evaluate(()=>{window.previewRenderer.render(window.previewScene,window.previewCamera);const gl=window.previewRenderer.getContext(),pixels=new Uint8Array(1100*800*4);gl.readPixels(0,0,1100,800,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();for(let i=0;i<pixels.length;i+=128)colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);return {meshes:window.meshes,textureSizes:window.textureSizes,drawCalls:window.previewRenderer.info.render.calls,uniqueColors:colors.size,lost:gl.isContextLost()}});assert.ok(metrics.uniqueColors>20);assert.ok(metrics.drawCalls>=4);assert.equal(metrics.lost,false);assert.ok(metrics.meshes>=4);assert.ok(metrics.textureSizes.every(x=>x===1024));await page.screenshot({path:path.join(root,'assets/ultimate-buildings/TorusSettlementFarm_BrowserReview.png')});console.log('REAL THREE PREVIEW',metrics);
 }finally{await browser.close();}
});
