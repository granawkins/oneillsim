import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export const settlementBaselineSha='98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591';
const root=fileURLToPath(new URL('../',import.meta.url));
export const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
function validatePlacement(p){
 assert.ok(typeof p.id==='string'&&typeof p.type==='string'&&p.id.length>0&&p.type.length>0,'Named placement required');
 assert.ok([p.theta,p.z,p.scale,p.rotation].every(Number.isFinite)&&p.scale>0,'Finite placement required '+p.id);
 assert.ok(p.surface&&typeof p.surface.deckId==='string'&&Number.isFinite(p.surface.height),'Named support required '+p.id);
 assert.ok(!p.surface.worldTransform,'Full-settlement interior design must not add or move exterior inspection models');
}
export function settlementCandidate(before,plan){
 assert.ok(Array.isArray(before.assets)&&Array.isArray(before.assetTypes),'Compact world required');
 const additions=plan.additions||[],replacements=plan.replacements||[];
 assert.ok(Array.isArray(additions)&&Array.isArray(replacements),'Explicit arrays required');
 const approved=new Set(replacements.map(p=>p.id));assert.equal(approved.size,replacements.length,'Duplicate replacement');
 const replacementMap=new Map(),types=[...before.assetTypes];
 for(const p of [...replacements,...additions]){validatePlacement(p);if(!types.includes(p.type))types.push(p.type);}
 for(const p of replacements){
  const prior=before.assets.find(a=>a[0]===p.id);assert.ok(prior,'Replacement ID missing '+p.id);
  assert.ok(/^farm-a-plot-\d+$/.test(p.id),'Only explicitly authorized farm plot replacements allowed: '+p.id);
  assert.ok(prior[6]?.category||prior[7]?.sourcePlot,'Original farm provenance missing '+p.id);
  const sourcePlot=prior[7]?.sourcePlot||prior[6];
  assert.equal(p.surface.deckId,sourcePlot.deckId,'Farm deck changed '+p.id);
  assert.equal(p.theta,prior[2],'Farm allocation position changed '+p.id);assert.equal(p.z,prior[3],'Farm axial position changed '+p.id);
  const surface={...clone(p.surface),sourcePlot:clone(sourcePlot)};
  replacementMap.set(p.id,clone([p.id,types.indexOf(p.type),p.theta,p.z,p.scale,p.rotation,null,surface]));
 }
 const assets=before.assets.map(a=>replacementMap.get(a[0])||clone(a)),known=new Map(assets.map(a=>[a[0],a]));
 assert.equal(known.size,assets.length,'Duplicate original IDs');
 for(const p of additions){
  assert.ok(p.id.startsWith('settlement-'),'New namespace required '+p.id);
  const row=clone([p.id,types.indexOf(p.type),p.theta,p.z,p.scale,p.rotation,null,p.surface]);
  if(known.has(p.id))assert.deepEqual(known.get(p.id),row,'Conflicting settlement ID '+p.id);else{assets.push(row);known.set(p.id,row);}
 }
 const metadata=clone(plan.metadata||{});assert.equal(metadata.version,1,'Versioned design metadata required');
 const next={...clone(before),assetTypes:types,assets,settlementDesign:metadata};verifySettlementPreservation(before,next,approved);
 return {next,approvedReplacementIds:[...approved],added:assets.length-before.assets.length,replaced:replacements.length};
}
export function verifySettlementPreservation(before,next,approvedIds){
 const approved=new Set(approvedIds);assert.deepEqual(next.assetTypes.slice(0,before.assetTypes.length),before.assetTypes,'Existing type indices changed');
 assert.ok(next.assets.length>=before.assets.length,'Records deleted');const oldById=new Map(before.assets.map(a=>[a[0],a]));
 for(let i=0;i<before.assets.length;i++){
  const a=before.assets[i],b=next.assets[i];assert.equal(b[0],a[0],'Saved order/ID changed');
  if(!approved.has(a[0]))assert.deepEqual(b,a,'Unauthorized record edit '+a[0]);
  else{assert.ok(/^farm-a-plot-\d+$/.test(a[0]));assert.deepEqual(b[7].sourcePlot,a[7]?.sourcePlot||a[6],'Farm allocation provenance lost');}
 }
 for(const a of next.assets.slice(before.assets.length))assert.ok(a[0].startsWith('settlement-')&&!oldById.has(a[0]),'Unapproved addition');
 for(const key of Object.keys(before))if(!['assets','assetTypes','settlementDesign'].includes(key))assert.deepEqual(next[key],before[key],'Unrelated world field changed '+key);
 assert.ok(Object.keys(next).every(k=>Object.hasOwn(before,k)||k==='settlementDesign'),'Unapproved top-level field');
 assert.equal(new Set(next.assets.map(a=>a[0])).size,next.assets.length,'Duplicate resulting IDs');
}
// Preserve every untouched original tuple byte and unrelated numeric lexeme.
function scanner(text){
 let i=0;const ws=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
 const value=()=>{ws();const start=i,c=text[i++];if(c==='"'){while(i<text.length){const q=text[i++];if(q==='\\')i++;else if(q==='"')break;}}else if(c==='['||c==='{'){const close=c==='['?']':'}';ws();while(text[i]!==close){assert.ok(i<text.length,'Unterminated JSON');if(text[i]===','||text[i]===':')i++;else value();ws();}i++;}else while(i<text.length&&!/[\s,\]}:]/.test(text[i]))i++;return [start,i];};
 ws();assert.equal(text[i++],'{');const fields=new Map();ws();while(text[i]!=='}'){const key=JSON.parse(text.slice(...value()));assert.ok(!fields.has(key),'Duplicate top-level key');ws();assert.equal(text[i++],':');fields.set(key,value());ws();if(text[i]===','){i++;ws();}}return {fields,end:i,value,setIndex:n=>{i=n},index:()=>i,ws};
}
export function serializeSettlement(bytes,next,approvedIds){
 const before=JSON.parse(bytes);verifySettlementPreservation(before,next,approvedIds);
 const text=bytes.toString('utf8'),s=scanner(text),edits=[];
 const [start,end]=s.fields.get('assets');s.setIndex(start+1);s.ws();const spans=[];
 while(s.index()<end-1){spans.push(s.value());s.ws();if(text[s.index()]===','){s.setIndex(s.index()+1);s.ws();}}
 assert.equal(spans.length,before.assets.length);
 for(let i=0;i<before.assets.length;i++)if(JSON.stringify(before.assets[i])!==JSON.stringify(next.assets[i]))edits.push([spans[i][0],spans[i][1],JSON.stringify(next.assets[i])]);
 for(const key of ['assets','assetTypes']){const added=next[key].slice(before[key].length);if(added.length){const [,e]=s.fields.get(key);edits.push([e-1,e-1,(before[key].length?',':'')+added.map(a=>JSON.stringify(a)).join(',')]);}}
 if(!Object.hasOwn(before,'settlementDesign'))edits.push([s.end,s.end,',"settlementDesign":'+JSON.stringify(next.settlementDesign)]);
 else if(JSON.stringify(before.settlementDesign)!==JSON.stringify(next.settlementDesign)){const [a,b]=s.fields.get('settlementDesign');edits.push([a,b,JSON.stringify(next.settlementDesign)]);}
 let out=text;for(const [a,b,v] of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,a)+v+out.slice(b);
 assert.deepEqual(JSON.parse(out),next,'Serialization mismatch');return Buffer.from(out);
}
export async function applySettlement(file,bytes,next,approvedIds,{authorizedSha=settlementBaselineSha,backupDir=path.join(os.homedir(),'.local/share/oneillsim/backups/full-settlement'),beforeCommit}={}){
 const after=serializeSettlement(bytes,next,approvedIds);const check=async()=>assert.ok((await fs.readFile(file)).equals(bytes),'Concurrent world change');await check();
 if(after.equals(bytes))return {unchanged:true,sha256:digest(bytes)};
 assert.equal(digest(bytes),authorizedSha,'World changed from reviewed baseline; refuse apply');
 const lock=file+'.settlement-lock',staging=file+'.settlement-'+crypto.randomUUID()+'.staging',handle=await fs.open(lock,'wx',0o600);let staged=false;
 try{
  await check();const stat=await fs.lstat(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Regular file required');
  await fs.mkdir(backupDir,{recursive:true,mode:0o700});const bs=await fs.lstat(backupDir);assert.ok(bs.isDirectory()&&!bs.isSymbolicLink()&&(bs.mode&0o077)===0,'Private backup directory required');
  const backup=path.join(backupDir,'world-before-full-settlement-'+digest(bytes)+'-'+crypto.randomUUID()+'.json'),b=await fs.open(backup,'wx',0o600);
  try{await b.writeFile(bytes);await b.sync();}finally{await b.close();}assert.ok((await fs.readFile(backup)).equals(bytes),'Backup mismatch');
  const out=await fs.open(staging,'wx',stat.mode&0o777);staged=true;try{await out.writeFile(after);await out.sync();}finally{await out.close();}
  if(beforeCommit)await beforeCommit();await check();await fs.rename(staging,file);staged=false;
  const dir=await fs.open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
  const saved=await fs.readFile(file);assert.ok(saved.equals(after),'Readback mismatch');verifySettlementPreservation(JSON.parse(bytes),JSON.parse(saved),approvedIds);
  return {applied:true,backup,beforeSha256:digest(bytes),afterSha256:digest(saved)};
 }finally{if(staged)await fs.rm(staging,{force:true});await handle.close();await fs.rm(lock,{force:true});}
}
async function main(){
 const args=process.argv.slice(2);assert.ok(args.every(a=>['--dry-run','--apply'].includes(a))&&!(args.includes('--dry-run')&&args.includes('--apply')),'Use --dry-run or --apply');
 const {buildSettlementPlan}=await import('../src/settlement-world.js');const before=await fs.readFile(path.join(root,'world.json')),world=JSON.parse(before),plan=await buildSettlementPlan();
 const candidate=settlementCandidate(world,plan);const report={dryRun:!args.includes('--apply'),original:world.assets.length,total:candidate.next.assets.length,added:candidate.added,replaced:candidate.replaced};
 if(args.includes('--apply'))Object.assign(report,await applySettlement(path.join(root,'world.json'),before,candidate.next,candidate.approvedReplacementIds));console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
