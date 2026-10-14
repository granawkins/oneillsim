import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {chromium} from 'playwright';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
test('upfront model preload keeps the first loading frame and blocks saving until the full batch is ready',{timeout:90000},async()=>{
 const bytes=await fs.readFile('world.json'),browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage']});let release;const gate=new Promise(r=>release=r);let objRequests=0;
 try{const page=await browser.newPage({viewport:{width:320,height:240}});
  await page.route('**/world.json',async route=>{assert.equal(route.request().method(),'GET');const response=await route.fetch(),world=await response.json(),index=world.assetTypes.indexOf('TorusHome_ModA');assert.ok(index>=0);world.assets=[['preload-fixture-a',index,.1,0,1,0],['preload-fixture-b',index,.2,0,1,0]];delete world.settlementDesign;await route.fulfill({response,json:world});});
  await page.route('**/*.obj',async route=>{objRequests++;await gate;await route.continue();});
  await page.goto(base+'?capture=1&exterior=overview',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__oneillSimFirstFrame,null,{timeout:30000});
  const state=await page.evaluate(()=>{let saveBlocked=false;try{window.saveWorld();}catch(e){saveBlocked=/still loading/.test(e.message);}return {ready:window.__oneillSimReady,saveBlocked};});assert.deepEqual(state,{ready:false,saveBlocked:true});release();await page.waitForFunction(()=>window.__oneillSimReady||window.__oneillSimError,null,{timeout:30000});assert.equal(await page.evaluate(()=>window.__oneillSimError||null),null);assert.equal(objRequests,1);assert.equal((await fs.readFile('world.json')).equals(bytes),true);
 }finally{release();await browser.close();}
});
