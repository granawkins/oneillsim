import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3201/oneillsim';
test('farm page, deck picking, asset placement and walking work together', {timeout:90000},async()=>{
 const browser=await chromium.launch({executablePath:process.env.SNAPSHOT_CHROMIUM_PATH || '/home/granawkins/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/agriculture/`);await page.locator('select').selectOption('farm-a-processing');
 await page.locator('.district-map g').first().click();assert.match(await page.locator('.selection').innerText(),/Processing/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:1000});
 await page.goto(`${base}/?theta=90&z=0&mode=planner&height=180&pitch=-89&yaw=0&capture=1`);await page.waitForFunction(()=>window.__oneillSimReady);
 // Drive the same deck selector event in capture mode, where the UI is intentionally hidden.
 await page.locator('select[aria-label="Terrace / landing"]').selectOption('farm-a-grain',{force:true});
 const placement=await page.evaluate(async()=>{
  const THREE=await import('three');const {camera,habitatGroup}=await import('/oneillsim/src/scene.js');
  const pick=await import('/oneillsim/src/editor/raycaster.js');
  camera.updateMatrixWorld(true);habitatGroup.updateMatrixWorld(true);
  const target=new THREE.Vector3(0,840,50);habitatGroup.localToWorld(target);target.project(camera);
  pick.setPointerLockMode(false);pick.updateMousePosition({clientX:(target.x+1)/2*innerWidth,clientY:(1-target.y)/2*innerHeight});pick.invalidateRaycastCache();const hit=pick.getSurfacePosition();
  if(!hit)return {hit:null};
  const {placeAsset}=await import('/oneillsim/src/editor/placement.js');const {exportWorldState}=await import('/oneillsim/src/editor/state.js');
  const id=await placeAsset('TorusHome_ModA',hit.theta,hit.z,1,0,hit);return {hit,record:exportWorldState().assets.find(a=>a[0]===id)};
 });
 assert.equal(placement.hit?.deckId,'farm-a-grain');assert.ok(Math.abs(placement.hit.height+10)<.03);assert.equal(placement.record[7].deckId,'farm-a-grain');
 const walked=await page.evaluate(async()=>{
  const {farmStairs,farmDecks}=await import('/oneillsim/src/agriculture-plan.js');
  const s=await import('/oneillsim/src/controls/state.js');const {updateHumanMode}=await import('/oneillsim/src/controls/modes/human.js');
  const result=[];
  for(const stair of farmStairs){
   const upper=farmDecks.find(d=>d.id===stair.upper);const theta=stair.start-.2/830,r=828-upper.height;
   s.cameraAnchor.position.set(r*Math.cos(theta),r*Math.sin(theta),stair.z);s.humanState.floorHeight=upper.height;s.humanState.currentRadius=r;s.humanState.isGrounded=true;s.humanState.radialVelocity=0;s.setYaw(-Math.PI/2);s.moveState.forward=true;
   for(let i=0;i<100;i++)updateHumanMode();
   result.push({actual:s.humanState.floorHeight,expected:farmDecks.find(d=>d.id===stair.lower).height});
  }
  s.moveState.forward=false;return result;
 });
 for(const r of walked)assert.ok(Math.abs(r.actual-r.expected)<.02,JSON.stringify(r));
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
