import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {remainingModelContract as expected} from '../src/remaining-model-contract.js';
import {completedModels as actual} from '../src/completed-models.js';
import {assetTypes,findModelType} from '../src/asset-library.js';
import {BUILDINGS,PLANTS,CATEGORIES,CATALOG} from '../src/editor/catalog.js';
import {materialKitKey} from '../src/editor/material-kits.js';
import {normalizeAssetManifest} from '../src/asset-manifest.js';
test('47 reviewed assets close all library gaps and match the exact acceptance contract',()=>{
 assert.equal(actual.length,47);assert.equal(new Set(actual.map(m=>m.id)).size,47);assert.ok(assetTypes.every(t=>t.variants.length>0));
 const segments=new Set(JSON.parse(fs.readFileSync('study/segments.json')).segments.map(s=>s.id));
 for(const e of expected){
  const a=actual.find(m=>m.id===e.id);assert.ok(a);
  for(const [k,v] of Object.entries(e))assert.equal(a[k],v,e.id+' '+k);
  assert.ok(findModelType(a.id));assert.ok(findModelType(a.id).facts.every(f=>typeof f==='string' && f.length>0));assert.ok([...BUILDINGS,...PLANTS].includes(a.id));assert.equal(materialKitKey(a.id,[...BUILDINGS,...PLANTS]),a.materialKit);
  const raw=JSON.parse(fs.readFileSync(`assets/${a.directory}/${a.id}.asset.json`)),m=normalizeAssetManifest(raw);
  assert.equal(m.id,a.id);assert.equal(m.editorDefaultScale,4);assert.equal(m.materials,1);assert.ok(m.vertices>0&&m.trianglesAfterQuadTriangulation>0);assert.equal(m.actualModelBoundsMeters.length,3);assert.ok(m.actualModelBoundsMeters.every(p=>p.length===2&&p.every(Number.isFinite)));assert.ok(m.interpretations.length>0);
  for(const ref of raw.sourceReferences)assert.ok(segments.has(ref.segmentId),JSON.stringify(ref));
  for(const f of [m.obj,m.mtl,m.textureAtlas,m.preview])assert.ok(fs.existsSync(f.startsWith('assets/') ? f : `assets/${a.directory}/${f}`),`${a.id}: ${f}`);
  assert.ok(fs.existsSync(raw.icon.startsWith('assets/') ? raw.icon : `assets/${a.directory}/${raw.icon}`),a.id+' icon');
  assert.equal(CATALOG.some(c=>c.id===a.id),a.placeable!==false);
 }
 assert.equal(CATEGORIES.structure.items.some(a=>a.id==='TorusStructure_HubA'),false,'Full external hub must not appear in terrain placement menu');
 console.log(JSON.stringify({completeLibrary:{types:assetTypes.length,models:assetTypes.reduce((n,t)=>n+t.variants.length,0),newModels:actual.length,emptyTypes:0}}));
});
