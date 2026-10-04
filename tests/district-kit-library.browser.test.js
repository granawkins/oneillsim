import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {districtKit} from '../src/district-kit.js';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
test('all 49 district designs expose valid stats, shared atlases and bounds-framed real viewers',{timeout:360000},async()=>{
 const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage({viewport:{width:480,height:320}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/world.json',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  const checked=[];
  for (const {id,slug} of districtKit) {
   await page.goto(base+`assets/${slug}/?capture=1&design=${id}`,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>window.__assetReady||window.__assetError,null,{timeout:30000});
   const info=await page.evaluate(()=>({error:window.__assetError,id:window.__assetManifest?.id,geometry:document.querySelector('#spec-geometry').textContent,bounds:document.querySelector('#spec-bounds').textContent,scale:document.querySelector('#spec-scale').textContent,interpretation:document.querySelector('#asset-interpretation').textContent,atlas:document.querySelector('a[href$="_Atlas.png"]')?.getAttribute('href')}));
   assert.equal(info.error,null);assert.equal(info.id,id);assert.ok(!info.geometry.includes('undefined'));assert.notEqual(info.bounds,'—');assert.equal(info.scale,'4× in the simulator');assert.ok(info.interpretation.length>10);assert.ok(info.atlas.includes('TorusDistrict'));checked.push(id);
  }
  assert.equal(checked.length,49);assert.deepEqual(errors,[]);console.log(JSON.stringify({districtLibrary:{designs:checked.length,errors}}));
 } finally {await browser.close();}
});
