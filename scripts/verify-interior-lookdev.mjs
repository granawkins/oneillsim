import fs from 'node:fs';
import {chromium} from 'playwright';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
const out=process.env.INTERIOR_REVIEW_DIR||'/home/granawkins/.hermes/cache/scratch/torus-feel-detail';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:320,height:240}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|GLSL|WebGLProgram/i.test(m.text()))errors.push(m.text());});
 await page.goto(base+'?capture=1&theta=20&z=0',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:180000});
 const measurements=await page.evaluate(async()=>{
  if(window.__oneillSimError)throw Error(window.__oneillSimError);
  window.requestAnimationFrame=()=>0;
  const S=await import('./src/scene.js'),{landscapeHeight,landscapePathZ}=await import('./src/interior-landscape.js');window.lookdevScene=S;
  const {camera,cameraAnchor,habitatGroup,renderer,scene}=S,interior=window.__oneillInterior,rig=window.__oneillInteriorLighting;
  habitatGroup.rotation.z=0;cameraAnchor.position.set(0,0,0);cameraAnchor.rotation.set(0,0,0);
  const hill=interior.plan.hills.find(h=>h.id==='residential-a-hill-1-0'),x=-hill.width*.25,z=landscapePathZ(hill,x),t=hill.theta+x/830,h=landscapeHeight(hill,x,z)+1.65,tx=x+12,tz=landscapePathZ(hill,tx)+11,tt=hill.theta+tx/830,th=landscapeHeight(hill,tx,tz)+3.5;
  camera.position.set((830-h)*Math.cos(t),(830-h)*Math.sin(t),z);camera.up.set(-Math.cos(t),-Math.sin(t),0);camera.lookAt((830-th)*Math.cos(tt),(830-th)*Math.sin(tt),tz);camera.fov=70;camera.near=.05;camera.far=5000;camera.updateProjectionMatrix();
  rig.update({camera,time:performance.now()/1000,exteriorVisible:false});renderer.render(scene,camera);renderer.getContext().finish();
  const measure=visible=>{interior.vegetation.group.visible=visible;const samples=[];for(let i=0;i<3;i++){renderer.info.reset();const start=performance.now();renderer.render(scene,camera);renderer.getContext().finish();samples.push({ms:performance.now()-start,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});}return samples;};
  const withoutInfill=measure(false),withInfill=measure(true);
  const gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,a=new Uint8Array(width*height*4),b=new Uint8Array(width*height*4);
  rig.uniforms.ilShadowEnabled.value=0;renderer.render(scene,camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,a);
  rig.uniforms.ilShadowEnabled.value=1;renderer.render(scene,camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,b);
  let shadowPixels=0,maxShadowDifference=0;for(let i=0;i<a.length;i+=4){const diff=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(diff>1)shadowPixels++;maxShadowDifference=Math.max(maxShadowDifference,diff);}
  if(!shadowPixels)throw Error('Allocated shadow map has no rendered pixel effect');
  const maps=new Map();habitatGroup.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const key of ['map','roughnessMap','bumpMap'])if(m[key]?.name.startsWith('interior-lookdev/'))maps.set(m[key].name,m[key]);});
  if(maps.size!==6||[...maps.values()].some(t=>!t.image?.width))throw Error('Material readiness: '+maps.size);
  const ambient=()=>{let value;scene.traverse(o=>{if(o.isAmbientLight)value=o.intensity;});return value;};
  const slider=document.getElementById('light-slider');slider.value='1.5';slider.dispatchEvent(new Event('input',{bubbles:true}));const dimAmbient=ambient();slider.value='3';slider.dispatchEvent(new Event('input',{bubbles:true}));if(Math.abs(ambient()-2*dimAmbient)>1e-6)throw Error('Brightness routing');
  rig.update({camera,time:performance.now()/1000,exteriorVisible:true});const exteriorAmbient=ambient();rig.update({camera,time:performance.now()/1000,exteriorVisible:false});
  const state={quality:window.__oneillRenderQuality,vegetation:interior.vegetation.stats,lighting:rig.stats,maps:[...maps.keys()],ambient:ambient(),dimAmbient,exteriorAmbient,shadowMapAllocated:!!rig.light.shadow.map,shadowPixels,maxShadowDifference,withoutInfill,withInfill};
  if(!state.shadowMapAllocated||state.lighting.casters>12||state.lighting.casterTriangles>80000)throw Error('Shadow budget/map '+JSON.stringify(state.lighting));
  return state;
 });
 console.log(JSON.stringify(measurements,null,2));
 await page.setViewportSize({width:640,height:480});await page.waitForTimeout(200);
 await page.evaluate(()=>{const {renderer,scene,camera}=window.lookdevScene;renderer.setSize(640,480);window.__oneillInteriorLighting.update({camera,time:performance.now()/1000,exteriorVisible:false});renderer.render(scene,camera);});
 const cdp=await page.context().newCDPSession(page),png=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(out+'/woodland.png',Buffer.from(png.data,'base64'));await cdp.detach();
 if(errors.length)throw Error(errors.join('\n'));
 let failureGate=null;
 if(process.env.INTERIOR_TEST_FAILURE==='1'){
 const failurePage=await browser.newPage({viewport:{width:240,height:180}});await failurePage.route('**/concrete-color.png',route=>route.abort('failed'));
 await failurePage.goto(base+'?capture=1&theta=20&z=0',{waitUntil:'domcontentloaded',timeout:45000});await failurePage.waitForFunction(()=>window.__oneillSimError,null,{timeout:180000});
 failureGate=await failurePage.evaluate(()=>({ready:window.__oneillSimReady,error:window.__oneillSimError,interiorDetached:window.__oneillInterior?.group.parent===null}));
 if(failureGate.ready||!failureGate.error.includes('concrete-color.png')||!failureGate.interiorDetached)throw Error('Failed texture bypassed readiness/cleanup '+JSON.stringify(failureGate));await failurePage.close();console.log('Texture failure gate PASS');
 }
 fs.writeFileSync(out+'/measurements.json',JSON.stringify({base,...measurements,errors,failureGate},null,2));console.log('PASS '+out);
}finally{await browser.close();}
