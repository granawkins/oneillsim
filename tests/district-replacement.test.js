import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {blocks} from '../src/residential-plan.js';
import {districtBuildingIds,candidateWorld,validateDescriptors,validateCurvedVertices,verifyPreservation} from '../src/district-replacement.js';
import {applyCandidate,inspectAssets,serializePreservingFormat} from '../scripts/replace-residential-district.mjs';
import {importWorldState,exportWorldState} from '../src/editor/state.js';
const clone=v=>structuredClone(v);
// Independent worker contracts: this suite never needs worker output files.
export function fixtureContracts(){
 const descriptors=new Map(),seq={circulation:0,terrace:0};
 const names={schools:'SchoolA',hospital:'ClinicA',assembly:'HallA',shops:'ShopsA',offices:'OfficesA',industry:'WorkshopA',storage:'StorageA',recreation:'RecreationA',miscellaneous:'CommunityA',park:'ParkA',trees:'TreeA'};
 for(const b of blocks){
  const key=[b.category,b.width,b.depth,b.height,b.levels,b.elevation].join('|');
  if(!descriptors.has(key)){
   const name=b.category==='housing'?'Housing'+b.levels+'A':names[b.category]||(b.category==='circulation'?'Path':'Terrace')+String(++seq[b.category]).padStart(2,'0');
   descriptors.set(key,{assetId:'TorusDistrict_'+name,category:b.category,parcelIds:[],width:b.width,depth:b.depth,height:b.height,levels:b.levels,elevation:b.elevation,textureAtlas:'Fixture_Atlas.png'});
  }
  descriptors.get(key).parcelIds.push(b.id);
 }
 const all=[...descriptors.values()];return {buildings:all.filter(d=>districtBuildingIds.includes(d.assetId)),landscape:all.filter(d=>!districtBuildingIds.includes(d.assetId))};
}
export function fixtureWorld(){
 const targets=blocks.map(b=>[b.id,0,b.theta,b.z,1,0,clone(b),{height:b.elevation,deckId:b.deckId}]);
 const preserved=Array.from({length:138},(_,i)=>['preserved-'+i,1,.5+i/1000,i%60,4,.01,{category:'unrelated',sentinel:i},{height:0,deckId:'preserved'}]);
 // Interleaving catches accidental append/reorder and preserved-prefix shortcuts.
 const assets=[];targets.forEach((a,i)=>{assets.push(a);if(i<preserved.length)assets.push(preserved[i]);});
 return {version:4,gridSize:{rows:13,cols:408,tileSize:10},textureNames:['grass'],grid:[[0,0]],assetTypes:['Blockout','OriginalModel'],assets,terraces:{decks:[{id:'untouched'}]},masterPlan:{sentinel:42},unknown:{preserve:[1,2,3]}};
}
async function fixtureFiles(dir,contract){
 const dest=path.join(dir,'assets/ultimate-buildings');await fs.mkdir(dest,{recursive:true});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');await fs.writeFile(path.join(dest,'Fixture_Atlas.png'),png);
 for(const d of [...contract.buildings,...contract.landscape]){
  const x=Math.min(.2,d.width/4),z=Math.min(.2,d.depth/4),y=Math.min(.01,d.height/4),vertices=[[-x,y,-z],[x,y,-z],[0,y*2,z]];
  const obj='mtllib '+d.assetId+'.mtl\no Fixture\n'+vertices.map(v=>'v '+v.map(n=>n/4).join(' ')).join('\n')+'\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 1 0\nusemtl Fixture\nf 1/1/1 2/2/1 3/3/1\n';
  const manifest={id:d.assetId,obj:d.assetId+'.obj',mtl:d.assetId+'.mtl',textureAtlas:d.textureAtlas,editorDefaultScale:4,objCoordinateScale:.25,actualModelBoundsMeters:[[-x,x],[y,y*2],[-z,z]],vertices:3,triangles:1,normals:1,uvs:3,materials:1};
  await fs.writeFile(path.join(dest,d.assetId+'.obj'),obj);await fs.writeFile(path.join(dest,d.assetId+'.mtl'),'newmtl Fixture\nmap_Kd Fixture_Atlas.png\n');await fs.writeFile(path.join(dest,d.assetId+'.asset.json'),JSON.stringify(manifest));
 }
}
async function scratch(fn){
 const dir=await fs.mkdtemp(path.join(process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch'),'district-fixture-'));
 try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
const contracts=fixtureContracts();
test('complete 297-ID replacement preserves all 138 records, fields, exact surfaces/order and source metadata',()=>{
 const before=fixtureWorld(),copy=clone(before),{next,replaced,alreadyReplaced}=candidateWorld(before,contracts.buildings,contracts.landscape);
 assert.equal(replaced,297);assert.equal(alreadyReplaced,0);assert.equal(next.assets.length,435);assert.deepEqual(before,copy);
 assert.deepEqual(next.assets.map(a=>a[0]),before.assets.map(a=>a[0]));assert.deepEqual(next.assetTypes.slice(0,2),before.assetTypes);
 for(let i=0;i<435;i++){
  const a=before.assets[i],b=next.assets[i];
  if(!a[0].startsWith('residential-a-'))assert.deepEqual(b,a);
  else{assert.equal(b[4],4);assert.equal(b[6],null);for(const k of [0,2,3,5,7])assert.deepEqual(b[k],a[k]);assert.match(next.assetTypes[b[1]],/^TorusDistrict_/);}
 }
 for(const key of Object.keys(before).filter(k=>!['assets','assetTypes'].includes(k)))assert.deepEqual(next[key],before[key]);
 assert.deepEqual(Object.keys(next),Object.keys(before));assert.ok(verifyPreservation(before,next,contracts.buildings,contracts.landscape));
 assert.equal(blocks.length,297);assert.deepEqual(before.assets.filter(a=>a[0].startsWith('residential-a-')).map(a=>a[6]),blocks);
});
test('type identity makes repeated migration a no-op; conflicts never get silently repaired',()=>{
 const {next}=candidateWorld(fixtureWorld(),contracts.buildings,contracts.landscape),again=candidateWorld(next,contracts.buildings,contracts.landscape);
 assert.equal(again.replaced,0);assert.equal(again.alreadyReplaced,297);assert.deepEqual(again.next,next);
 for(const mutate of [w=>w.assets[0][1]=1,w=>w.assets[0][4]=1,w=>w.assets[0][7].height=0,w=>w.assets[0][2]+=.1,w=>w.assets[0][6]={fake:true}]){
  const w=clone(next);mutate(w);assert.throws(()=>candidateWorld(w,contracts.buildings,contracts.landscape),/Conflicting/);
 }
});
test('coverage rejects missing, duplicate, extraneous IDs, categories, dimensions and model names',()=>{
 const invalid=[c=>c.landscape.pop(),c=>c.buildings[0].parcelIds.push(c.buildings[1].parcelIds[0]),c=>c.landscape[0].parcelIds.push('residential-a-298'),c=>c.buildings[0].category='park',c=>c.buildings[0].width+=1,c=>c.buildings[0].assetId='TorusDistrict_Unknown',c=>c.landscape[0].textureAtlas='../atlas.png',c=>c.buildings.push(clone(c.buildings[0]))];
 for(const mutate of invalid){const c=clone(contracts);mutate(c);assert.throws(()=>validateDescriptors(c.buildings,c.landscape));}
 for(const mutate of [w=>w.assets.pop(),w=>w.assets[1][0]=w.assets[0][0],w=>w.assets[1][0]='residential-a-298',w=>w.assetTypes.push('Blockout'),w=>w.assets[0][1]=999,w=>w.assets[0][6].width+=1]){
  const w=fixtureWorld();mutate(w);assert.throws(()=>candidateWorld(w,contracts.buildings,contracts.landscape));
 }
});
test('curved vertex constraints use intrinsic heights, footprint, tube and preserved rotation',()=>{
 const w=fixtureWorld(),d=contracts.buildings[0],r=830-d.elevation,x=d.width/2-.01,angle=x/r;
 const curved=[[(r-1)*Math.sin(angle),r-(r-1)*Math.cos(angle),0]];
 assert.doesNotThrow(()=>validateCurvedVertices(d,curved,w));
 assert.throws(()=>validateCurvedVertices(d,[[0,-1,0]],w),/intrinsic/);
 assert.throws(()=>validateCurvedVertices(d,[[d.width,1,0]],w),/footprint/);
 assert.throws(()=>validateCurvedVertices(d,[[0,1,d.depth]],w),/footprint/);
 const services=contracts.buildings.find(d=>d.category==='storage'),outside=clone(w);outside.assets.find(a=>a[0]===services.parcelIds[0])[3]=30;
 assert.throws(()=>validateCurvedVertices(services,[[0,0,15]],outside),/tube/);
});
test('ordinary editor import/export preserves replacement IDs, scale, null blockout and deck attachment',()=>{
 const {next}=candidateWorld(fixtureWorld(),contracts.buildings,contracts.landscape);importWorldState(next);const exported=exportWorldState();
 assert.deepEqual(exported.assets.map(a=>a[0]),next.assets.map(a=>a[0]));
 exported.assets.forEach((a,i)=>{assert.equal(exported.assetTypes[a[1]],next.assetTypes[next.assets[i][1]]);assert.deepEqual(a.slice(2),next.assets[i].slice(2));});
});
test('format writer retains unrelated bytes, CRLF, indentation, numeric lexemes and trailing whitespace',()=>{
 const w=fixtureWorld(),{next}=candidateWorld(w,contracts.buildings,contracts.landscape);
 for(const text of [JSON.stringify(w)+'\n',JSON.stringify(w,null,2).replaceAll('\n','\r\n')+'\r\n ',JSON.stringify(w).replace('"sentinel":42','"sentinel":4.2e1')]){
  const out=serializePreservingFormat(Buffer.from(text),next).toString();assert.deepEqual(JSON.parse(out),next);
  assert.ok(out.endsWith(text.match(/\s*$/)[0]));assert.equal(out.includes('"sentinel":4.2e1'),text.includes('"sentinel":4.2e1'));
  assert.ok(out.includes(JSON.stringify(w.assets[1]))||out.includes('"preserved-0"'));
  assert.ok(serializePreservingFormat(Buffer.from(out),next).equals(Buffer.from(out)));
 }
});
test('actual files required; manifests, atlas, indices and bounds cannot be waived',async()=>scratch(async dir=>{
 const w=fixtureWorld(),{next}=candidateWorld(w,contracts.buildings,contracts.landscape);
 await assert.rejects(inspectAssets(next,contracts.buildings,contracts.landscape,{repo:dir}),/manifest/);
 await fixtureFiles(dir,contracts);const result=await inspectAssets(next,contracts.buildings,contracts.landscape,{repo:dir});assert.equal(result.modelCount,contracts.buildings.length+contracts.landscape.length);
 const file=path.join(dir,'assets/ultimate-buildings',contracts.buildings[0].assetId+'.obj'),original=await fs.readFile(file);
 await fs.writeFile(file,original.toString().replace('f 1/1/1','f 999/1/1'));await assert.rejects(inspectAssets(next,contracts.buildings,contracts.landscape,{repo:dir}),/index/);
 await fs.writeFile(file,original);await fs.rm(path.join(dir,'assets/ultimate-buildings/Fixture_Atlas.png'));await assert.rejects(inspectAssets(next,contracts.buildings,contracts.landscape,{repo:dir}),/ENOENT/);
}));
test('fixture-only atomic write, byte-exact private backup/readback and idempotent no second backup',async()=>scratch(async dir=>{
 await fixtureFiles(dir,contracts);const before=Buffer.from(JSON.stringify(fixtureWorld(),null,2)+'\n'),{next}=candidateWorld(JSON.parse(before),contracts.buildings,contracts.landscape),file=path.join(dir,'world.json'),backupDir=path.join(dir,'backups');await fs.writeFile(file,before,{mode:0o640});
 const options={...contracts,repo:dir,backupDir},result=await applyCandidate(file,before,next,options),saved=await fs.readFile(file);
 assert.deepEqual(JSON.parse(saved),next);assert.ok((await fs.readFile(result.backup)).equals(before));assert.equal((await fs.stat(result.backup)).mode&0o777,0o600);assert.equal((await fs.stat(backupDir)).mode&0o777,0o700);assert.equal((await fs.stat(file)).mode&0o777,0o640);
 assert.equal(result.afterSha256,crypto.createHash('sha256').update(saved).digest('hex'));
 assert.equal((await applyCandidate(file,saved,next,options)).unchanged,true);assert.equal((await fs.readdir(backupDir)).length,1);assert.deepEqual((await fs.readdir(dir)).filter(n=>n.endsWith('.staging')||n.endsWith('-lock')),[]);
}));
test('concurrent changes and occupied lock prevent overwrite and staging is cleaned',async()=>scratch(async dir=>{
 await fixtureFiles(dir,contracts);const before=Buffer.from(JSON.stringify(fixtureWorld())),{next}=candidateWorld(JSON.parse(before),contracts.buildings,contracts.landscape),file=path.join(dir,'world.json'),options={...contracts,repo:dir,backupDir:path.join(dir,'backups')};await fs.writeFile(file,before);
 const concurrent=Buffer.from(before.toString()+'\n');await fs.writeFile(file,concurrent);await assert.rejects(applyCandidate(file,before,next,options),/Concurrent/);assert.ok((await fs.readFile(file)).equals(concurrent));
 await fs.writeFile(file,before);await fs.writeFile(file+'.district-replacement-lock','occupied');await assert.rejects(applyCandidate(file,before,next,options),/EEXIST/);assert.ok((await fs.readFile(file)).equals(before));await fs.rm(file+'.district-replacement-lock');
 await assert.rejects(applyCandidate(file,before,next,{...options,beforeCommit:()=>fs.writeFile(file,concurrent)}),/Concurrent/);assert.ok((await fs.readFile(file)).equals(concurrent));assert.deepEqual((await fs.readdir(dir)).filter(n=>n.endsWith('.staging')||n.endsWith('-lock')),[]);
}));
