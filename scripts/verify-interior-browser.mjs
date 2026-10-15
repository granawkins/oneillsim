import fs from 'node:fs';
import {chromium} from 'playwright';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
const out=process.env.INTERIOR_REVIEW_DIR||'/home/granawkins/.hermes/cache/scratch/torus-interior-redesign';
fs.mkdirSync(out,{recursive:true});
const started=Date.now(),progress=message=>console.log(`${((Date.now()-started)/1000).toFixed(1)}s ${message}`);
const browser=await chromium.launch({executablePath:process.env.SNAPSHOT_CHROMIUM_PATH||'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const watchdog=setTimeout(()=>{console.error('Verification exceeded 300s wall-clock bound');browser.close().finally(()=>process.exit(1));},300000);
try{
 const page=await browser.newPage({viewport:{width:320,height:240}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.message);});
 progress('navigation');
 await page.goto(base+'?capture=1&theta=20&z=0',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:180000});
 progress('ready');
 const state=await page.evaluate(async()=>{
  if(window.__oneillSimError)throw Error(window.__oneillSimError);
  window.requestAnimationFrame=()=>0;
  window.reviewThree=await import('three');window.reviewScene=await import('./src/scene.js');window.reviewHuman=await import('./src/controls/modes/human.js');
  return {ready:window.__oneillSimReady,stats:window.__oneillInterior?.stats,ledger:window.__oneillInterior?.ledger,resources:performance.getEntriesByType('resource').length};
 });
 // Use the live full-world controller before expensive screenshots.
 const controller=await page.evaluate(()=>{
  const {humanController:c}=window.reviewHuman,pt=(t,z,h)=>({x:(830-h)*Math.cos(t),y:(830-h)*Math.sin(t),z});
  const settle=(t,z,h)=>{c.teleport(pt(t,z,h+.02));for(let i=0;i<120;i++)c.advance(1/120);};
  const angle=()=>Math.atan2(c.position.y,c.position.x),height=()=>830-Math.hypot(c.position.x,c.position.y);
  settle(.15,5,.36);let t=angle();for(let i=0;i<240;i++)c.advance(1/120);
  const ride=(angle()-t)*830,rideH=height();
  for(let i=0;i<70;i++)c.advance(1/120,new window.reviewThree.Vector3(0,0,1));t=angle();for(let i=0;i<120;i++)c.advance(1/120);
  const offTravel=(angle()-t)*830,spokeRides=[];
  for(const d of window.__oneillInterior.plan.districts){
   settle(d.center-25/830,5,.36);const start=angle();for(let i=0;i<480;i++)c.advance(1/120);
   spokeRides.push({id:d.id,travel:(angle()-start)*830,height:height(),grounded:c.grounded});
  }
  return {ride,rideH,offTravel,spokeRides};
 });
 fs.writeFileSync(out+'/verification.json',JSON.stringify({base,state,controller,errors},null,2));progress('controller '+JSON.stringify(controller));
 if(!(controller.ride>34&&controller.ride<38&&Math.abs(controller.offTravel)<.03))throw Error('Live controller regression');
 for(const r of controller.spokeRides)if(!(r.travel>70&&r.travel<74&&Math.abs(r.height-.36)<.06&&r.grounded))throw Error('Spoke crossing regression '+JSON.stringify(r));
 if(process.env.INTERIOR_SKIP_CAPTURES!=='1'){
  await page.setViewportSize({width:800,height:600});await page.waitForTimeout(500);
  async function capture(name,t,z,h,targetT,targetZ,targetH){
   progress('render '+name);
   await page.evaluate(({t,z,h,targetT,targetZ,targetH})=>{
    const {camera,cameraAnchor,habitatGroup,renderer,scene}=window.reviewScene;
    habitatGroup.rotation.z=0;cameraAnchor.position.set(0,0,0);cameraAnchor.rotation.set(0,0,0);
    camera.position.set((830-h)*Math.cos(t),(830-h)*Math.sin(t),z);camera.up.set(-Math.cos(t),-Math.sin(t),0);
    camera.lookAt((830-targetH)*Math.cos(targetT),(830-targetH)*Math.sin(targetT),targetZ);
    camera.fov=70;camera.near=.05;camera.far=5000;camera.updateProjectionMatrix();renderer.setSize(800,600);renderer.render(scene,camera);
   },{t,z,h,targetT,targetZ,targetH});
   const shot=await page.context().newCDPSession(page);const image=await shot.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(image.data,'base64'));await shot.detach();progress('captured '+name);
  }
  await capture('overview',.56,0,59,.69,0,0);
  await capture('eye-level',.38,0,1.81,.49,0,1.81);
  await capture('gallery',.672082-90/830,35,10.89,.672082+10/830,0,8);
  await capture('farm',1.344164+140/830,44,6.65,1.344164+230/830,25,-12);
 }
 if(errors.length)throw Error(errors.join('\n'));
 progress('PASS');
}finally{clearTimeout(watchdog);await browser.close();}
