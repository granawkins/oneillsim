import fs from 'node:fs';
import {chromium} from 'playwright';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
const out=process.env.INTERIOR_REVIEW_DIR||'/home/granawkins/.hermes/cache/scratch/torus-interior-redesign';
fs.mkdirSync(out,{recursive:true});
const started=Date.now(),progress=message=>console.log(`${((Date.now()-started)/1000).toFixed(1)}s ${message}`);
const browser=await chromium.launch({executablePath:process.env.SNAPSHOT_CHROMIUM_PATH||'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const watchdog=setTimeout(()=>{console.error('Verification exceeded 420s wall-clock bound');browser.close().finally(()=>process.exit(1));},420000);
try{
 const page=await browser.newPage({viewport:{width:320,height:240}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.message);});
 page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|GLSL|WebGLProgram/i.test(m.text())){errors.push(m.text());console.error('rendererror',m.text());}});
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
 const routes=await page.evaluate(async()=>{
  const {humanController:c}=window.reviewHuman,V=window.reviewThree.Vector3;
  const {landscapeHeight,landscapePathZ}=await import('./src/interior-landscape.js');
  const polar=()=>({x:((Math.atan2(c.position.y,c.position.x)+Math.PI*2)%(Math.PI*2))*830,z:c.position.z,h:830-Math.hypot(c.position.x,c.position.y)});
  const settle=(t,z,h)=>{c.teleport(new V((830-h-.03)*Math.cos(t),(830-h-.03)*Math.sin(t),z));for(let i=0;i<80;i++)c.advance(1/120);};
  const hills=[];
  for(const hill of window.__oneillInterior.plan.hills){
   settle(hill.theta-(hill.width/2+2)/830,hill.z,.16);let ticks=0,crest=0,minGap=Infinity;
   for(;ticks<1600;ticks++){
    const q=polar(),x=q.x-hill.theta*830;if(x>hill.width/2+1)break;
    const z=landscapePathZ(hill,x+1),t=q.x/830;
    c.advance(1/120,new V(-Math.sin(t),Math.cos(t),(z-q.z)*1.6).normalize());
    const a=polar();crest=Math.max(crest,a.h);minGap=Math.min(minGap,a.h-landscapeHeight(hill,a.x-hill.theta*830,a.z));
   }
   for(let i=0;i<80;i++)c.advance(1/120);
   hills.push({id:hill.id,ticks,crest,minGap,grounded:c.grounded,height:polar().h});
   if(ticks>=1600||crest<hill.height-.2||minGap<-.04||!c.grounded||polar().h>.22)throw Error('Full-world hill route '+JSON.stringify(hills.at(-1)));
  }
  const portals=[],velocity=c.surfaceVelocity;c.surfaceVelocity=undefined;
  try{
   for(const b of window.__oneillInterior.boundaries.plan)for(const p of b.portals)for(const side of [-1,1]){
    settle(b.theta-side*2/830,(p.zMin+p.zMax)/2,p.floor);
    for(let i=0;i<40;i++){const t=Math.atan2(c.position.y,c.position.x);c.advance(1/120,new V(-Math.sin(t)*side,Math.cos(t)*side,0));}
    const arc=Math.atan2(Math.sin(Math.atan2(c.position.y,c.position.x)-b.theta),Math.cos(Math.atan2(c.position.y,c.position.x)-b.theta))*830;
    const result={boundary:b.id,portal:p.id,side,travel:arc*side,grounded:c.grounded,height:polar().h};portals.push(result);
    if(result.travel<2||!result.grounded||Math.abs(result.height-p.floor)>.04)throw Error('Full-world portal '+JSON.stringify(result));
   }
  }finally{c.surfaceVelocity=velocity;}
  return {hills,portals};
 });
 fs.writeFileSync(out+'/verification.json',JSON.stringify({base,state,controller,routes,errors},null,2));progress('full-world routes '+routes.hills.length+' hills, '+routes.portals.length+' portal crossings');progress('controller '+JSON.stringify(controller));
 if(!(controller.ride>34&&controller.ride<38&&Math.abs(controller.offTravel)<.03))throw Error('Live controller regression');
 for(const r of controller.spokeRides)if(!(r.travel>70&&r.travel<74&&Math.abs(r.height-.36)<.06&&r.grounded))throw Error('Spoke crossing regression '+JSON.stringify(r));
 if(process.env.INTERIOR_SKIP_CAPTURES!=='1'){
  await page.setViewportSize({width:640,height:480});await page.waitForTimeout(500);
  async function capture(name,t,z,h,targetT,targetZ,targetH){
   progress('render '+name);
   await page.evaluate(({t,z,h,targetT,targetZ,targetH})=>{
    const {camera,cameraAnchor,habitatGroup,renderer,scene}=window.reviewScene;
    habitatGroup.rotation.z=0;cameraAnchor.position.set(0,0,0);cameraAnchor.rotation.set(0,0,0);
    camera.position.set((830-h)*Math.cos(t),(830-h)*Math.sin(t),z);camera.up.set(-Math.cos(t),-Math.sin(t),0);
    camera.lookAt((830-targetH)*Math.cos(targetT),(830-targetH)*Math.sin(targetT),targetZ);
    camera.fov=70;camera.near=.05;camera.far=5000;camera.updateProjectionMatrix();renderer.setSize(640,480);window.__oneillInteriorLighting?.update({camera,time:performance.now()/1000,exteriorVisible:false});renderer.render(scene,camera);
   },{t,z,h,targetT,targetZ,targetH});
   const shot=await page.context().newCDPSession(page);const image=await shot.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(image.data,'base64'));await shot.detach();progress('captured '+name);
  }
  await capture('overview',.49,0,59,.60,0,0);
  const hillPose=await page.evaluate(async()=>{const h=window.__oneillInterior.plan.hills.find(h=>h.side===1),{landscapeHeight,landscapePathZ}=await import('./src/interior-landscape.js');const x=-h.width/2+6,targetX=x+30,z=landscapePathZ(h,x),tz=landscapePathZ(h,targetX);return {t:h.theta+x/830,z,h:landscapeHeight(h,x,z)+1.81,tt:h.theta+targetX/830,tz,th:landscapeHeight(h,targetX,tz)+1.1};});
  await capture('meadow',hillPose.t,hillPose.z,hillPose.h,hillPose.tt,hillPose.tz,hillPose.th);
  await capture('grass-face',429.91403434482515/830,12,1.81,429.91403434482515/830,38,4);
  await capture('housing-plinth',285/830,-7,1.81,301/830,-17,5);
  await capture('summit',429.91403434482515/830,35,7.205,590/830,25,16);
  await capture('oblique-skyline',350/830,-9,13,590/830,25,17);
  await capture('arrival-grove',572.8280686896503/830,11,1.81,572.8280686896503/830,29,3);
  await capture('boundary-portal',1.344164-15/830,0,1.81,1.344164+15/830,0,1.81);
  await capture('lower-farm-wall',1.344164+18/830,26,-23.2,1.344164,26,-23.2);
 }
 if(errors.length)throw Error(errors.join('\n'));
 progress('PASS');
}finally{clearTimeout(watchdog);await browser.close();}
