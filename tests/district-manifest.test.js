import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {districtKit} from '../src/district-kit.js';
import {normalizeAssetManifest} from '../src/asset-manifest.js';
import {findModelType} from '../src/asset-library.js';
import {BUILDINGS} from '../src/editor/catalog.js';
import {materialKitKey} from '../src/editor/material-kits.js';
test('all district manifests normalize without mutation and are registered in isolated atlas pools',()=>{
 assert.equal(districtKit.length,49);
 for(const {id} of districtKit){
  const raw=JSON.parse(fs.readFileSync(`assets/ultimate-buildings/${id}.asset.json`)),before=JSON.stringify(raw),m=normalizeAssetManifest(raw);
  assert.equal(m.id,id);assert.equal(m.editorDefaultScale,4);assert.ok(m.vertices>0);assert.ok(m.trianglesAfterQuadTriangulation>0);assert.equal(m.materials,1);assert.equal(m.actualModelBoundsMeters.length,3);assert.ok(m.interpretations.length>0);
  assert.equal(JSON.stringify(raw),before);assert.ok(findModelType(id));assert.ok(BUILDINGS.includes(id));assert.equal(materialKitKey(id,BUILDINGS),raw.textureAtlas.includes('Buildings')?'district-buildings':'district-landscape');
 }
});
