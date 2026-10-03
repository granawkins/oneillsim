import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.ONEILLSIM_TEST_URL || 'http://127.0.0.1:3201/oneillsim';
test('residential plan hydrates, switches decks and opens the populated simulation', {timeout:60000}, async()=>{
 const browser=await chromium.launch({executablePath:process.env.SNAPSHOT_CHROMIUM_PATH || '/home/granawkins/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']});
 try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/residential/`);
 await page.locator('.district-map g').first().click();
 assert.match(await page.locator('.selection').innerText(),/5-story housing/);
 await page.locator('select').selectOption('residential-a-services');
 assert.equal(await page.locator('.district-map g').count(),6);
 await page.locator('select').selectOption('residential-a-basin');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('link',{name:'District in 3D'}).click();
 await page.waitForFunction(()=>window.__oneillSimReady===true);
 const blockouts=await page.evaluate(async()=>{const {editorState}=await import('/oneillsim/src/editor/state.js');return editorState.placedAssets.filter(a=>a.id.startsWith('residential-a-')).length});
 assert.ok(blockouts>140);
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
