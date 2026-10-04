import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {completedModels} from '../src/completed-models.js';
import {completedModelPlacements} from '../src/model-placement.js';
import {normalizeAssetManifest} from '../src/asset-manifest.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export const authorizedWorldSha256='3a0743b3215b777c14033ccb8d4eee3b624336d586005104edbbbdda645561b6';
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function candidateWorld(world){
 assert.ok(Array.isArray(world.assets)&&Array.isArray(world.assetTypes),'Compact saved world required');
 assert.equal(new Set(world.assetTypes).size,world.assetTypes.length,'Duplicate original type');assert.equal(new Set(world.assets.map(a=>a[0])).size,world.assets.length,'Duplicate saved IDs');
 const planned=completedModelPlacements(world),known=new Set(planned.map(p=>p.id));
 for(const a of world.assets){assert.ok(Number.isInteger(a[1])&&world.assetTypes[a[1]],'Invalid type index');if(a[0].startsWith('completed-model-'))assert.ok(known.has(a[0]),'Unknown completed-model namespace ID '+a[0]);}
 const types=[...world.assetTypes];for(const p of planned)if(!types.includes(p.type))types.push(p.type);
 const added=[];for(const p of planned){const record=[p.id,types.indexOf(p.type),p.theta,p.z,p.scale,p.rotation,null,p.surface];const existing=world.assets.find(a=>a[0]===p.id);if(existing)assert.deepEqual(existing,record,'Conflicting completed-model placement '+p.id);else added.push(record);}
 const next={...world,assetTypes:types,assets:[...world.assets,...added]};verifyPreservation(world,next);return {next,added,planned};
}
export function verifyPreservation(before,after){
 assert.deepEqual(after.assetTypes.slice(0,before.assetTypes.length),before.assetTypes,'Existing type indices changed');assert.deepEqual(after.assets.slice(0,before.assets.length),before.assets,'Existing records changed');assert.deepEqual(Object.keys(after),Object.keys(before),'Fields changed');
 for(const key of Object.keys(before))if(!['assets','assetTypes'].includes(key))assert.deepEqual(after[key],before[key],'Unrelated field changed '+key);
 const planned=completedModelPlacements(before),known=new Set(planned.map(p=>p.id));assert.ok(after.assets.slice(before.assets.length).every(a=>known.has(a[0])),'Unapproved addition');
 for(const p of planned){const a=after.assets.find(a=>a[0]===p.id);assert.ok(a,'Missing placement '+p.id);assert.deepEqual(a,[p.id,after.assetTypes.indexOf(p.type),p.theta,p.z,p.scale,p.rotation,null,p.surface]);}
 assert.equal(new Set(after.assets.map(a=>a[0])).size,after.assets.length,'Duplicate result ID');
}
// Scan JSON rather than searching a bracket with a regexp: strings/nested objects
// may contain delimiters. Existing record bytes and all unrelated fields survive.
function ranges(text){
 let i=0;const skip=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
 const value=()=>{skip();const s=i,c=text[i++];if(c==='"'){while(i<text.length){const c=text[i++];if(c==='\\')i++;else if(c==='"')break;}}else if(c==='['||c==='{'){const close=c==='['?']':'}';skip();while(text[i]!==close){assert.ok(i<text.length,'Unterminated JSON');if(text[i]===','||text[i]===':')i++;else value();skip();}i++;}else{while(i<text.length&&!/[\s,\]}:]/.test(text[i]))i++;}return [s,i];};
 skip();assert.equal(text[i++],'{');const found=new Map();skip();while(text[i]!=='}'){const [s,e]=value(),key=JSON.parse(text.slice(s,e));assert.ok(!found.has(key),'Duplicate top-level key');skip();assert.equal(text[i++],':');found.set(key,value());skip();if(text[i]===','){i++;skip();}}
 return found;
}
export function serializeAdditions(before,next){
 const world=JSON.parse(before);verifyPreservation(world,next);const text=before.toString('utf8'),found=ranges(text),edits=[];
 for(const key of ['assetTypes','assets']){const additions=next[key].slice(world[key].length);if(additions.length){const [start,end]=found.get(key);assert.equal(text[end-1],']');edits.push([end-1,(world[key].length?',':'')+additions.map(a=>JSON.stringify(a)).join(',')]);}}
 let out=text;for(const [i,v] of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,i)+v+out.slice(i);assert.deepEqual(JSON.parse(out),next);return Buffer.from(out);
}
export async function inspectAssets(repo=root){
 const result=[];
 for(const d of completedModels){
  const dir=path.join(repo,'assets',d.directory),raw=JSON.parse(await fs.readFile(path.join(dir,d.id+'.asset.json'),'utf8')),m=normalizeAssetManifest(raw);assert.equal(m.id,d.id);assert.equal(m.editorDefaultScale,4);assert.equal(m.textureAtlas,d.textureAtlas);
  const obj=await fs.readFile(path.join(dir,d.id+'.obj'),'utf8'),mtl=await fs.readFile(path.join(dir,d.id+'.mtl'),'utf8'),atlas=await fs.readFile(path.join(dir,d.textureAtlas));assert.ok(atlas.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.ok(obj.includes('mtllib '+d.id+'.mtl'));assert.ok(mtl.includes('map_Kd '+d.textureAtlas));
  const actual=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];let count=0;for(const line of obj.split('\n'))if(line.startsWith('v ')){const v=line.trim().split(/\s+/).slice(1).map(Number);assert.ok(v.length===3&&v.every(Number.isFinite));v.forEach((n,k)=>{actual[k][0]=Math.min(actual[k][0],n*4);actual[k][1]=Math.max(actual[k][1],n*4)});count++;}
  assert.ok(count>0);for(let k=0;k<3;k++)for(let j=0;j<2;j++)assert.ok(Math.abs(actual[k][j]-m.actualModelBoundsMeters[k][j])<1e-4,'Manifest/actual bounds mismatch '+d.id);result.push({id:d.id,bounds:actual});
 }return result;
}
export async function applyCandidate(file,before,next,{backupDir=path.join(os.homedir(),'.local/share/oneillsim/backups/model-placement'),authorizedSha=authorizedWorldSha256,beforeCommit}={}){
 verifyPreservation(JSON.parse(before),next);const after=serializeAdditions(before,next);assert.ok((await fs.readFile(file)).equals(before),'Concurrent world change');if(after.equals(before))return {unchanged:true,sha256:sha(before)};assert.equal(sha(before),authorizedSha,'World changed from reviewed baseline; refuse apply');
 const lock=file+'.model-placement-lock',staging=file+'.model-placement-'+crypto.randomUUID()+'.staging';const handle=await fs.open(lock,'wx',0o600);let staged=false;
 try{
  const check=async()=>assert.ok((await fs.readFile(file)).equals(before),'Concurrent world change');await check();const stat=await fs.lstat(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Regular world file required');await fs.mkdir(backupDir,{recursive:true,mode:0o700});const bs=await fs.lstat(backupDir);assert.ok(bs.isDirectory()&&!bs.isSymbolicLink()&&(bs.mode&0o077)===0,'Private backup directory required');
  const backup=path.join(backupDir,'world-before-model-placement-'+sha(before)+'-'+crypto.randomUUID()+'.json');const bh=await fs.open(backup,'wx',0o600);try{await bh.writeFile(before);await bh.sync();}finally{await bh.close();}assert.ok((await fs.readFile(backup)).equals(before),'Backup mismatch');const out=await fs.open(staging,'wx',stat.mode&0o777);staged=true;try{await out.writeFile(after);await out.sync();}finally{await out.close();}if(beforeCommit)await beforeCommit();await check();await fs.rename(staging,file);staged=false;const dh=await fs.open(path.dirname(file),'r');try{await dh.sync();}finally{await dh.close();}const saved=await fs.readFile(file);assert.ok(saved.equals(after),'Atomic readback mismatch');verifyPreservation(JSON.parse(before),JSON.parse(saved));return {applied:true,backup,beforeSha256:sha(before),afterSha256:sha(saved)};
 }finally{if(staged)await fs.rm(staging,{force:true});await handle.close();await fs.rm(lock,{force:true});}
}
export async function main(){
 const args=process.argv.slice(2);assert.ok(args.every(a=>['--dry-run','--apply'].includes(a))&&!(args.includes('--dry-run')&&args.includes('--apply')),'Use --dry-run (default) or --apply');const file=path.join(root,'world.json'),before=await fs.readFile(file),world=JSON.parse(before),{next,added,planned}=candidateWorld(world);await inspectAssets();const report={dryRun:!args.includes('--apply'),added:added.length,original:world.assets.length,total:next.assets.length,interior:planned.filter(p=>!p.surface.worldTransform).length,exterior:planned.filter(p=>p.surface.worldTransform).length};if(args.includes('--apply'))Object.assign(report,await applyCandidate(file,before,next));console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
