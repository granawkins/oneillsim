import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3201/oneillsim';
test('residential plan hydrates, switches decks and opens the populated simulation', {timeout:60000}, async()=>{
 const browser=await chromium.launch({executablePath:process.env.SNAPSHOT_CHROMIUM_PATH || '/home/granawkins/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']});
 try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/residential/`);
 await page.locator('svg g').first().click();
 assert.match(await page.locator('.selection').innerText(),/32.00 × 21.90/);
 await page.getByRole('button',{name:'Show lower deck',exact:true}).click();
 assert.equal(await page.locator('svg g').count(),7);
 await page.getByRole('button',{name:'Show ground level',exact:true}).click();
 assert.equal(await page.locator('svg g').count(),133);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('link',{name:'Open district in 3D'}).click();
 await page.waitForFunction(()=>window.__oneillSimReady===true);
 const blockouts=await page.evaluate(async()=>{const {editorState}=await import('/oneillsim/src/editor/state.js');return editorState.placedAssets.filter(a=>a.id.startsWith('residential-a-')).length});
 assert.equal(blockouts,140);
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
