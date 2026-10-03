import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {districts} from '../src/settlement-plan.js';
import {blocks,residentialDecks,totals} from '../src/residential-plan.js';
import {importWorldState,exportWorldState} from '../src/editor/state.js';
test('six sectors fill the ring with the stated area ratio and evenly spaced centers',()=>{
 assert.equal(districts.length,6);for(let i=0;i<6;i++){assert.ok(Math.abs(districts[i].start-(i?districts[i-1].end:0))<1e-10);if(i)assert.ok(Math.abs(districts[i].center-districts[i-1].center-Math.PI/3)<1e-10)}
 assert.ok(Math.abs(districts.at(-1).end-2*Math.PI)<1e-10);assert.ok(Math.abs(districts[0].projectedArea/districts[1].projectedArea-430/240)<1e-10);
});
test('residential exterior budget and complete building envelopes fit the tube',()=>{
 assert.ok(Math.abs(totals('terrace').footprint-12*3333)<1e-6);
 for(const d of residentialDecks)for(const band of d.bands)for(const z of band)assert.ok(z*z+(d.height-.4)**2<=65**2,d.id);
 for(const b of blocks.filter(b=>!['trees','park','circulation','terrace'].includes(b.category)))for(const z of [b.z-b.depth/2,b.z+b.depth/2])for(const h of [b.elevation,b.elevation+b.height])assert.ok(z*z+h*h<=65**2,b.name);
});
test('world stores centered landing placeholders and the master plan through editor saves',()=>{
 const world=JSON.parse(readFileSync('world.json','utf8'));
 const landings=world.assets.filter(a=>a[0].startsWith('spoke-')&&a[0].endsWith('-platform'));assert.equal(landings.length,6);
 for(const d of districts){const a=landings.find(a=>a[6].districtId===d.id);assert.equal(a[2],d.center);assert.equal(a[3],0);assert.equal(a[6].width,24);}
 importWorldState(world);assert.deepEqual(exportWorldState().masterPlan,world.masterPlan);
});
