import test from 'node:test';
import assert from 'node:assert/strict';
import {blocks,population,length,totals} from '../src/residential-plan.js';
import {importWorldState,exportWorldState} from '../src/editor/state.js';
import {createBlockout} from '../src/editor/blockout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('district quantities and bounds are consistent',()=>{
 near(totals('housing').floor,37*population);
 near(totals('park').footprint,10*population);
 near(totals('circulation').footprint,12*population);
 const housing=blocks.filter(b=>b.category==='housing');
 assert.equal(housing.length,40);
 assert.deepEqual([2,4,5].map(n=>housing.filter(b=>b.levels===n).length),[4,12,24]);
 for(const b of blocks){assert.ok(b.x-b.width/2>=-1e-6);assert.ok(b.x+b.width/2<=length+1e-6);assert.ok(Math.abs(b.z)+b.depth/2<=65);}
});
test('ground parcels do not overlap (tree canopies are park decoration)',()=>{
 const parcels=blocks.filter(b=>b.deck===0&&b.category!=='trees');
 for(let i=0;i<parcels.length;i++)for(let j=i+1;j<parcels.length;j++){
  const a=parcels[i],b=parcels[j];
  assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2-1e-6||Math.abs(a.z-b.z)>=(a.depth+b.depth)/2-1e-6,`${a.name} overlaps ${b.name}`);
 }
});
test('blockout dimensions survive normal world save/load',()=>{
 const spec=blocks[0];
 const world={version:4,assetTypes:['ResidentialBlockout'],assets:[[spec.id,0,.1,12,1,0,spec]]};
 importWorldState(world);
 assert.deepEqual(exportWorldState().assets,world.assets);
 const mesh=createBlockout(spec);
 assert.ok(mesh.children.length>0);
 assert.equal(mesh.name,spec.name);
});
