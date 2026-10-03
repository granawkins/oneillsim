import test from 'node:test';
import assert from 'node:assert/strict';
import {farmAllocations,farmArea,farmBlocks,farmDecks,farmTerraces,farmStairs,farmStart,farmEnd} from '../src/agriculture-plan.js';
import {configureTerraces,supportAt,walkStep,deckContains} from '../src/terrace-surfaces.js';
import {importWorldState,exportWorldState} from '../src/editor/state.js';
import {createTerraces,terraceMeshes} from '../src/terraces.js';
import * as THREE from 'three';
configureTerraces(farmTerraces);
test('each farm allocation is placed exactly once and plots fit their bands without overlap',()=>{
 for(const a of farmAllocations)assert.ok(Math.abs(farmArea(a.id)-a.area)<1e-6,a.id);
 for(const b of farmBlocks){
  const d=farmDecks.find(d=>d.id===b.deckId),r=830-d.height;
  assert.ok(b.theta-b.width/2/r>=farmStart&&b.theta+b.width/2/r<=farmEnd);
  assert.ok(d.bands.some(([lo,hi])=>b.z-b.depth/2>=lo&&b.z+b.depth/2<=hi));
  assert.ok(Math.abs(b.width*b.depth-b.area)<1e-6);
 }
 for(let i=0;i<farmBlocks.length;i++)for(let j=i+1;j<farmBlocks.length;j++){
  const a=farmBlocks[i],b=farmBlocks[j];if(a.deckId!==b.deckId)continue;
  assert.ok(Math.abs(a.theta-b.theta)*(830-a.elevation)>=(a.width+b.width)/2-1e-6||Math.abs(a.z-b.z)>=(a.depth+b.depth)/2-1e-6,`${a.id}/${b.id}`);
 }
});
test('slabs fit inside the lower tube arc, leaving positive usable floor area',()=>{
 for(const d of farmDecks)for(const [lo,hi] of d.bands)for(const z of [lo,hi])assert.ok(z*z+(d.height-.4)**2<65**2,d.id);
 const h=new THREE.Group();createTerraces(h);assert.ok(terraceMeshes.length>7);
 for(const mesh of terraceMeshes)assert.ok(mesh.geometry.attributes.position.count>0);
});
test('stairs support continuous walking in both directions without snapping between decks',()=>{
 for(const stair of farmStairs){
  const upper=farmDecks.find(d=>d.id===stair.upper),lower=farmDecks.find(d=>d.id===stair.lower);
  for(const reverse of [false,true]){
   let height=reverse?lower.height:upper.height;
   for(let i=0;i<=200;i++){
    const t=reverse?1-i/200:i/200;
    const theta=stair.start+(stair.end-stair.start)*t;
    const support=walkStep(theta,stair.z,height);assert.ok(support,`${stair.id}: ${i}`);height=support.height;
   }
   assert.ok(Math.abs(height-(reverse?upper.height:lower.height))<1e-5);
  }
 }
 const grain=farmDecks[1];
 assert.equal(walkStep((farmStart+farmEnd)/2,0,grain.height),null,'cannot step off shelf to a distant lower floor');
 assert.equal(supportAt(.5,0,0).height,0,'ordinary residential ground remains supported');
});
test('saved worlds preserve terrace topology and placed asset attachments',()=>{
 const b=farmBlocks[0],surface={deckId:b.deckId,height:b.elevation};
 const world={version:4,assetTypes:['block'],assets:[[b.id,0,b.theta,b.z,1,0,b,surface]],terraces:farmTerraces};
 importWorldState(world);const result=exportWorldState();assert.deepEqual(result.assets,world.assets);assert.deepEqual(result.terraces,farmTerraces);
});
