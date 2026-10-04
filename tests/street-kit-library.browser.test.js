import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {streetKit} from '../src/street-kit.js';
const base=(process.env.ONEILLSIM_TEST_URL||'http://127.0.0.1:3200/oneillsim/').replace(/\/?$/,'/');
test('all six live library types render and expose real icons/shared atlas',{timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());await route.abort();}else await route.fallback();});
  assert.equal((await page.goto(base+'assets/',{waitUntil:'domcontentloaded'})).status(),200);
  await page.waitForFunction(()=>[...document.querySelectorAll('.available img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:30000});
  const cards=await page.locator('.available').evaluateAll(links=>links.map(a=>({text:a.textContent,href:a.getAttribute('href')})));
  for(const {slug} of streetKit)assert.ok(cards.some(a=>a.href.includes('/assets/'+slug+'/')));
  const checked=[];
  for(const {id,slug} of streetKit){
   assert.equal((await page.goto(base+`assets/${slug}/?capture=1`,{waitUntil:'domcontentloaded'})).status(),200);
   await page.waitForFunction(()=>window.__assetReady||window.__assetError,null,{timeout:30000});
   assert.equal(await page.evaluate(()=>window.__assetError),null);
   assert.ok((await page.locator('#asset-description').textContent()).length>15);
   const atlas=await page.locator('a[href$="/TorusStreetKit_Atlas.png"]').getAttribute('href');assert.ok(atlas.endsWith('/TorusStreetKit_Atlas.png'));
   const response=await page.request.get(new URL(atlas,base).href);assert.equal(response.status(),200);assert.ok(response.headers()['content-type'].includes('image/png'));
   checked.push({id,slug,atlas});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({library:checked,errors}));
 }finally{await browser.close();}
});
