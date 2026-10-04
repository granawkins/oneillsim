import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {streetKit,streetKitIds,streetPilotPlacements} from '../src/street-kit.js';
import {BUILDINGS,CATALOG,CATEGORIES} from '../src/editor/catalog.js';
import {assetGroups,findModelType} from '../src/asset-library.js';
test('all six library types have real curated editor models and bounded assets',()=>{
 const group=assetGroups.find(g=>g.name==='Furniture & small props');assert.equal(group.types.length,6);
 assert.equal(CATEGORIES.furniture.items.length,6);
 for(const {id,slug} of streetKit){
  assert.ok(BUILDINGS.includes(id));assert.equal(CATALOG.filter(x=>x.id===id).length,1);
  const type=findModelType(id);assert.equal(type.slug,slug);assert.ok(type.thumbnail.startsWith('/oneillsim/'));
  const manifest=JSON.parse(fs.readFileSync(new URL(`../assets/ultimate-buildings/${id}.asset.json`,import.meta.url)));
  assert.ok(manifest.triangles<500);assert.equal(manifest.materials,1);assert.equal(manifest.objects,1);
  assert.equal(manifest.textureAtlas,'TorusStreetKit_Atlas.png');
 }
});
test('pilot is a deterministic bounded additive court with every kit type',()=>{
 const p=streetPilotPlacements();assert.equal(p.length,36);assert.equal(new Set(p.map(x=>x.id)).size,36);
 assert.equal(p.filter(x=>streetKitIds.includes(x.type)).length,30);
 assert.equal(p.filter(x=>x.type==='TorusHome_ModA').length,6);
 for(const id of streetKitIds)assert.ok(p.some(x=>x.type===id));
 for(const x of p){assert.ok(Math.abs(x.x)<=33);assert.ok(Math.abs(x.z)<=14);assert.equal(x.scale,4);assert.equal(x.surface.height,-.05);}
 assert.deepEqual(p,streetPilotPlacements());
});
