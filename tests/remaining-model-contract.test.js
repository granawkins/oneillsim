import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingModelContract as models} from '../src/remaining-model-contract.js';
import {assetTypes} from '../src/asset-library.js';
import {materialKitKey} from '../src/editor/material-kits.js';
test('47 exact remaining types have unique names and explicit compatible material contracts',()=>{
 assert.equal(models.length,47);assert.equal(new Set(models.map(m=>m.id)).size,47);assert.equal(new Set(models.map(m=>m.slug)).size,47);
 for(const m of models){
  assert.ok(assetTypes.some(t=>t.slug===m.slug));
  assert.ok(['ultimate-buildings','ultimate-nature'].includes(m.directory));
  assert.equal(materialKitKey(m.id,[]),null,'Unregistered planned asset must not enable pooling');
  assert.equal(materialKitKey(m.id,[m.id]),m.materialKit);
  assert.equal(materialKitKey(m.id+'_untrusted',[m.id+'_untrusted']),null);
 }
 const counts={};for(const m of models)counts[m.materialKit]=(counts[m.materialKit]||0)+1;
 assert.deepEqual(counts,{commerce:3,nature:7,agriculture:8,fauna:4,transport:8,utility:8,structure:9});
});
