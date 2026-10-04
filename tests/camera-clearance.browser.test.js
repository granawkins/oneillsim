import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/';

test('human eye and near plane preserve opaque walls and ceilings at contact',{timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:320,height:240}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/world.json',async route=>{
   assert.equal(route.request().method(),'GET');const response=await route.fetch();const world=await response.json();
   world.assets=[];world.terraces={decks:[],stairs:[]};delete world.cropConfig;await route.fulfill({response,json:world});
  });
  await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.fallback():route.abort());
  await page.goto(base+'?capture=1&theta=0&z=0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:60000});
  const result=await page.evaluate(async()=>{
   if(window.__oneillSimError)throw Error(window.__oneillSimError);
   window.requestAnimationFrame=()=>0;
   const THREE=await import('three');
   const {camera,cameraAnchor,habitatGroup,renderer}=await import('./src/scene.js');
   const {humanController,setupHumanMode,updateHumanMode}=await import('./src/controls/modes/human.js');
   const {characterColliders}=await import('./src/physics/collider-world.js');
   const {moveState,setYaw}=await import('./src/controls/state.js');
   const red=new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide});
   const wall=new THREE.Mesh(new THREE.BoxGeometry(12,12,.1),red);wall.position.set(828,0,-2);
   habitatGroup.add(wall);characterColliders.setObject('test-wall',wall,habitatGroup);
   setupHumanMode();setYaw(0);moveState.forward=true;
   for(let i=0;i<120;i++)updateHumanMode(1/120);moveState.forward=false;
   const wallEye=cameraAnchor.position.clone(),wallGap=wallEye.z+1.95;
   const ceiling=new THREE.Mesh(new THREE.BoxGeometry(.1,12,12),red);ceiling.position.set(827.5,0,0);
   habitatGroup.add(ceiling);characterColliders.setObject('test-ceiling',ceiling,habitatGroup);
   // Move away from the wall and jump into the ceiling; track the smallest eye gap.
   characterColliders.remove('test-wall');habitatGroup.remove(wall);
   humanController.teleport(new THREE.Vector3(830,0,0));humanController.queueJump();
   let ceilingGap=Infinity,ceilingEye;
   for(let i=0;i<240;i++){
    updateHumanMode(1/120);const gap=cameraAnchor.position.x-827.55;
    if(gap<ceilingGap){ceilingGap=gap;ceilingEye=cameraAnchor.position.clone();}
   }
   const target=new THREE.WebGLRenderTarget(32,32);const pixel=new Uint8Array(4);
   const probe=(surface,eye,look,near)=>{
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x0000ff);scene.add(surface.clone());
    const view=new THREE.PerspectiveCamera(camera.fov,1,near,camera.far);view.position.copy(eye);view.lookAt(look);view.updateMatrixWorld();
    renderer.setRenderTarget(target);renderer.render(scene,view);renderer.readRenderTargetPixels(target,16,16,1,1,pixel);renderer.setRenderTarget(null);
    return Array.from(pixel);
   };
   const wallPixel=probe(wall,wallEye,wall.position,camera.near),oldWallPixel=probe(wall,wallEye,wall.position,1);
   const ceilingPixel=probe(ceiling,ceilingEye,ceiling.position,camera.near);
   target.dispose();
   return {near:camera.near,eyeHeight:humanController.config.eyeHeight,wallGap,ceilingGap,wallPixel,oldWallPixel,ceilingPixel};
  });
  assert.deepEqual(errors,[]);assert.equal(result.near,.05);assert.equal(result.eyeHeight,1.65);
  assert.ok(result.wallGap>.34&&result.wallGap<.37);assert.ok(result.ceilingGap>.34&&result.ceilingGap<.37);
  for(const pixel of [result.wallPixel,result.ceilingPixel])assert.ok(pixel[0]>240&&pixel[2]<15,`opaque surface should be red: ${pixel}`);
  assert.ok(result.oldWallPixel[2]>240&&result.oldWallPixel[0]<15,'old 1m near plane must reproduce seeing the blue background');
  console.log(JSON.stringify({cameraClearance:result}));
 }finally{await browser.close();}
});
