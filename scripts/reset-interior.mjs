import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {dressInteriorGardens} from './dress-interior-gardens.mjs';
import {createInteriorPlan,interiorFloorLedger} from '../src/interior-plan.js';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const file=new URL('../world.json',import.meta.url),raw=fs.readFileSync(file),old=JSON.parse(raw);
if(old.settlementDesign?.version!==1)throw Error('Only the reviewed version-1 baseline can be replaced. Refusing repeated reset.');
const fixturePath=new URL('../tests/fixtures/interior-farm-source.json',import.meta.url);
const source={baselineSha256:hash(raw),assetTypes:old.assetTypes,assets:old.assets.filter(a=>/^farm-a-plot-/.test(a[0])),terraces:{decks:old.terraces.decks.filter(d=>d.id.startsWith('farm-a-')),stairs:old.terraces.stairs.filter(s=>s.id.startsWith('farm-stair-'))},exterior:old.assets.filter(a=>a[7]?.worldTransform)};
if(source.assets.length!==78||source.exterior.length!==9)throw Error('Unexpected baseline inventory');
const privateDir=path.join(os.homedir(),'.local/share/oneillsim/backups/interior-reset');fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
const backup=path.join(privateDir,`world-${Date.now()}-${source.baselineSha256.slice(0,12)}.json`);fs.writeFileSync(backup,raw,{mode:0o600,flag:'wx'});
if(hash(fs.readFileSync(backup))!==source.baselineSha256)throw Error('Backup verification failed');
fs.mkdirSync(new URL('../tests/fixtures/',import.meta.url),{recursive:true});fs.writeFileSync(fixturePath,JSON.stringify(source,null,2)+'\n');
const plan=createInteriorPlan(),w={...old,grid:old.grid.map(row=>row.map(()=>0)),assets:[...source.exterior],terraces:{decks:[],stairs:[]},settlementDesign:{version:2,name:plan.name,sources:plan.sources,landmarks:plan.landmarks,ledger:interiorFloorLedger(plan),baselineSha256:source.baselineSha256}};
const typeId=name=>{let i=w.assetTypes.indexOf(name);if(i<0){i=w.assetTypes.length;w.assetTypes.push(name);}return i;};
const add=(id,name,t,z,scale=4,yaw=0,surface={height:-.05})=>w.assets.push([id,typeId(name),t,z,scale,yaw,null,surface]);
for(const d of w.masterPlan.districts.filter(d=>d.kind==='agricultural')){
 const offset=d.start-w.masterPlan.districts[1].start,letter=d.id.at(-1);
 const rename=id=>id?.replace('farm-a-',`farm-${letter}-`).replace('farm-stair-',`farm-${letter}-stair-`);
 for(const sourceDeck of source.terraces.decks)w.terraces.decks.push({...sourceDeck,id:rename(sourceDeck.id),name:sourceDeck.name.replace('A',''+letter.toUpperCase()),start:sourceDeck.start+offset,end:sourceDeck.end+offset});
 for(const s of source.terraces.stairs)w.terraces.stairs.push({...s,id:rename(s.id),upper:rename(s.upper),lower:rename(s.lower),start:s.start+offset,end:s.end+offset});
 for(const a of source.assets){const b=structuredClone(a);b[0]=rename(a[0]);b[2]+=offset;b[7].deckId=rename(b[7].deckId);w.assets.push(b);}
}
for(const [di,d]of w.masterPlan.districts.filter(d=>d.kind==='residential').entries()){
 const L=(d.end-d.start)*830;
 for(const side of [0,1])for(let j=0;j<4;j++)for(const z of [-45,-23,23,45]){
  const x=side?L-35-j*30:35+j*30,t=d.start+x/830;
  add(`interior-${d.id}-home-${side}-${j}-${z}`,j%2?'TorusHome_CourtyardA':'TorusHome_ModA',t,z+Math.sin(j+z)*3,4,Math.sin(j*2+z)*.3);
 }
 // Groves compose a winding linear garden rather than randomly scattered props.
 for(let j=0;j<95;j++)for(const sign of [-1,1]){
  const x=20+j*(L-40)/94,z=sign*(12.4+Math.sin(j*.53+di)*.8);
  if(Math.abs(x-L/2)<28)continue;
  add(`interior-${d.id}-tree-${j}-${sign}`,'TorusNature_TreeA',d.start+x/830,z,3.2+(j%3)*.45,j*.7);
  if(j%3===0)add(`interior-${d.id}-flowers-${j}-${sign}`,'TorusNature_FlowersA',d.start+(x+4)/830,sign*11,4,j*.3,{height:-.05,collisionMode:'none'});
 }
 for(let j=0;j<18;j++){
  const t=d.start+(30+j*(L-60)/17)/830;
  add(`interior-${d.id}-bench-${j}`,'TorusBench_A',t,j%2?3.7:-3.7,4,j%2?Math.PI:0);
 }
}
dressInteriorGardens(w);
if(hash(fs.readFileSync(file))!==source.baselineSha256)throw Error('Concurrent world change; refusing replacement');
fs.writeFileSync(file,JSON.stringify(w));
const result=JSON.parse(fs.readFileSync(file));if(result.assets.length!==w.assets.length||result.settlementDesign.version!==2)throw Error('Readback failed');
console.log(JSON.stringify({backup,baselineSha256:source.baselineSha256,worldSha256:hash(fs.readFileSync(file)),assets:w.assets.length,exteriorPreserved:source.exterior.length,farmPlots:234,terraceDecks:w.terraces.decks.length,buildings:plan.buildings.length,ledger:interiorFloorLedger(plan)},null,2));
