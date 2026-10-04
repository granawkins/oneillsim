import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {candidateWorld,verifyPreservation,validateDescriptors,validateCurvedVertices,districtCapture} from '../src/district-replacement.js';
export {candidateWorld,verifyPreservation};
const root=fileURLToPath(new URL('../',import.meta.url));
export const authorizedWorldSha256='bb4da561e4b28cdd25f17ff125ac906c8e412a84ef56bb7fd31966e2a16cd209';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const safeFile=name=>typeof name==='string'&&/^[A-Za-z0-9_.-]+$/.test(name)&&!name.includes('..');
export async function readContracts(repo=root){
 const buildings=JSON.parse(await fs.readFile(path.join(repo,'assets/district-building-kit.json'),'utf8'));
 const landscape=JSON.parse(await fs.readFile(path.join(repo,'assets/district-landscape-kit.json'),'utf8'));
 validateDescriptors(buildings,landscape);return {buildings,landscape};
}
export async function inspectAssets(world,buildings,landscape,{repo=root}={}){
 const {byAsset}=validateDescriptors(buildings,landscape),models=[];
 for(const d of byAsset.values()){
  const choices=[];
  for(const directory of ['ultimate-buildings','ultimate-nature']){
   const dir=path.join(repo,'assets',directory);
   try{await fs.access(path.join(dir,d.assetId+'.asset.json'));choices.push({dir,directory});}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  assert.equal(choices.length,1,'Missing or ambiguous manifest: '+d.assetId);
  const {dir,directory}=choices[0],manifest=JSON.parse(await fs.readFile(path.join(dir,d.assetId+'.asset.json'),'utf8'));
  // Explicitly supported schemas: legacy authored assets, district buildings,
  // and district landscape. Do not invent dimensions from filenames/bounds.
  const schema=manifest.id?'legacy':manifest.intrinsicReservationMeters?'district-building':manifest.intrinsicReservedExtentsMetres?'district-landscape':null;
  assert.ok(schema,'Unknown manifest schema: '+d.assetId);
  assert.equal(manifest.id??manifest.assetId,d.assetId);assert.equal(manifest.editorDefaultScale??manifest.intendedPlacementScale,4);assert.equal(manifest.objCoordinateScale??manifest.objScale,.25);
  const objName=manifest.obj??(schema==='district-building'?d.assetId+'.obj':null),mtlName=manifest.mtl??(schema==='district-building'?d.assetId+'.mtl':null);
  assert.equal(objName,d.assetId+'.obj');assert.equal(mtlName,d.assetId+'.mtl');assert.equal(manifest.textureAtlas,d.textureAtlas);
  const reserved=schema==='district-building'?manifest.intrinsicReservationMeters:schema==='district-landscape'?[0,1,2].map(k=>[manifest.intrinsicReservedExtentsMetres.min[k],manifest.intrinsicReservedExtentsMetres.max[k]]):null;
  const expectedReservation=[[-d.width/2,d.width/2],[0,d.height],[-d.depth/2,d.depth/2]];
  if(reserved)for(let k=0;k<3;k++)for(let j=0;j<2;j++)assert.ok(Math.abs(reserved[k][j]-expectedReservation[k][j])<1e-6,'Manifest reservation differs from descriptor');
  if(schema!=='legacy'){
   assert.equal(manifest.category,d.category);assert.equal(manifest.elevation,d.elevation);assert.equal(manifest.levels,d.levels);assert.deepEqual(manifest.parcelIds,d.parcelIds);
   assert.equal(manifest.radiusMeters??manifest.curvature?.radius,830-d.elevation);
  }
  const obj=await fs.readFile(path.join(dir,objName),'utf8'),mtl=await fs.readFile(path.join(dir,mtlName),'utf8');
  const atlas=await fs.readFile(path.join(dir,d.textureAtlas));
  assert.ok(atlas.length>24&&atlas.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid PNG: '+d.textureAtlas);
  assert.ok(atlas.readUInt32BE(16)>0&&atlas.readUInt32BE(20)>0,'Empty atlas');
  const mtllib=[...obj.matchAll(/^mtllib\s+(.+)$/gm)].map(m=>m[1].trim());assert.deepEqual(mtllib,[mtlName]);
  const materialNames=[...mtl.matchAll(/^newmtl\s+(.+)$/gm)].map(m=>m[1].trim());assert.ok(materialNames.length>0);
  const used=[...new Set([...obj.matchAll(/^usemtl\s+(.+)$/gm)].map(m=>m[1].trim()))];
  assert.ok(used.length>0&&used.every(m=>materialNames.includes(m)),'OBJ references undefined material');
  const maps=[...mtl.matchAll(/^map_\w+\s+(.+)$/gm)].map(m=>m[1].trim());assert.ok(maps.includes(d.textureAtlas),'MTL missing atlas');
  for(const resource of maps){assert.ok(safeFile(resource),'Unsafe/unsupported MTL resource');await fs.access(path.join(dir,resource));}
  const vertices=[],faces=[],bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];let normals=0,uvs=0;
  for(const line of obj.split(/\r?\n/)){
   if(line.startsWith('v ')){
    const v=line.trim().split(/\s+/).slice(1).map(Number);assert.ok(v.length===3&&v.every(Number.isFinite),'Invalid OBJ vertex');
    const scaled=v.map(n=>n*4);vertices.push(scaled);scaled.forEach((n,k)=>{bounds[k][0]=Math.min(bounds[k][0],n);bounds[k][1]=Math.max(bounds[k][1],n);});
   }else if(line.startsWith('vn '))normals++;
   else if(line.startsWith('vt '))uvs++;
   else if(line.startsWith('f '))faces.push({tokens:line.trim().split(/\s+/).slice(1),vertexCount:vertices.length,normalCount:normals,uvCount:uvs});
  }
  let triangles=0;
  for(const f of faces){
   assert.ok(f.tokens.length>=3,'Invalid OBJ face');triangles+=f.tokens.length-2;
   for(const token of f.tokens){
    const parts=token.split('/');assert.ok(parts.length<=3,'Invalid OBJ face index');
    for(let k=0;k<parts.length;k++)if(parts[k]){
     assert.match(parts[k],/^-?\d+$/);const n=Number(parts[k]),count=k===0?vertices.length:k===1?uvs:normals,atFace=k===0?f.vertexCount:k===1?f.uvCount:f.normalCount;
     assert.ok(n!==0&&(n>0?n<=count:-n<=atFace),'OBJ index outside resource');
    }
   }
  }
  assert.ok(triangles>0&&uvs>0&&normals>0,'OBJ lacks faces/UVs/normals');
  const advertised=manifest.actualModelBoundsMeters??(schema==='district-landscape'?[0,1,2].map(k=>[manifest.boundsMetres.min[k],manifest.boundsMetres.max[k]]):null);
  assert.ok(Array.isArray(advertised)&&advertised.length===3&&advertised.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'Missing actualModelBoundsMeters');
  for(let k=0;k<3;k++)for(let j=0;j<2;j++)assert.ok(Math.abs(bounds[k][j]-advertised[k][j])<1e-4,'Manifest/actual OBJ bounds mismatch: '+d.assetId);
  for(const [keys,value] of [[['vertices','vertexCount'],vertices.length],[['triangles','triangleCount'],triangles],[['normals'],normals],[['uvs'],uvs],[['materials','materialCount'],materialNames.length]])for(const key of keys)if(manifest[key]!==undefined)assert.equal(manifest[key],value,'Manifest '+key+' mismatch');
  const intrinsicEnvelope=schema==='district-landscape'?[0,1,2].map(k=>[manifest.intrinsicRenderedBoundsMetres.min[k],manifest.intrinsicRenderedBoundsMetres.max[k]]):reserved;
  validateCurvedVertices(d,vertices,world,intrinsicEnvelope);
  models.push({id:d.assetId,directory,bounds,vertices:vertices.length,triangles,manifest,descriptor:d,schema});
 }
 return {models,modelCount:models.length,placementCount:297};
}
// Preserve the exact source layout, whitespace and numeric spelling outside the
// two authorized arrays; replace only target tuple slots and append type names.
function arrayRanges(text){
 const ranges=new Map();let i=0;
 const skip=()=>{while(/\s/.test(text[i]||'')&&i<text.length)i++;};
 const value=()=>{
  skip();const start=i,ch=text[i++];
  if(ch==='"'){while(i<text.length){const c=text[i++];if(c==='\\')i++;else if(c==='"')break;}}
  else if(ch==='['||ch==='{'){skip();while(text[i]!== (ch==='['?']':'}')){if(text[i]===','||text[i]===':'){i++;continue;}value();skip();}i++;}
  else while(i<text.length&&!/[\s,\]}:]/.test(text[i]))i++;
  return [start,i];
 };
 skip();assert.equal(text[i++],'{');skip();
 while(text[i]!=='}'){
  const [s,e]=value(),key=JSON.parse(text.slice(s,e));skip();assert.equal(text[i++],':');
  const range=value();assert.ok(!ranges.has(key),'Duplicate top-level field');ranges.set(key,range);skip();if(text[i]===','){i++;skip();}
 }
 return {ranges,valueAt(start){i=start;return value();}};
}
export function serializePreservingFormat(before,next){
 const text=before.toString('utf8'),world=JSON.parse(text),parser=arrayRanges(text),edits=[];
 const [ts,te]=parser.ranges.get('assetTypes');
 assert.deepEqual(next.assetTypes.slice(0,world.assetTypes.length),world.assetTypes);
 const additions=next.assetTypes.slice(world.assetTypes.length);
 if(additions.length)edits.push([te-1,te-1,(world.assetTypes.length?',':'')+additions.map(t=>JSON.stringify(t)).join(',')]);
 const [as,ae]=parser.ranges.get('assets');let cursor=as+1;
 for(let n=0;n<world.assets.length;n++){
  while(/[\s,]/.test(text[cursor]))cursor++;
  const [s,e]=parser.valueAt(cursor);cursor=e;
  if(JSON.stringify(world.assets[n])===JSON.stringify(next.assets[n]))continue;
  let p=s+1;
  for(let k=0;k<world.assets[n].length;k++){
   while(/[\s,]/.test(text[p]))p++;
   const [vs,ve]=parser.valueAt(p);p=ve;
   if(JSON.stringify(world.assets[n][k])!==JSON.stringify(next.assets[n][k]))edits.push([vs,ve,JSON.stringify(next.assets[n][k])]);
  }
 }
 assert.ok(cursor<ae);edits.sort((a,b)=>b[0]-a[0]);let out=text;
 for(const [s,e,v] of edits)out=out.slice(0,s)+v+out.slice(e);
 assert.deepEqual(JSON.parse(out),next,'Format-preserving serialization mismatch');return Buffer.from(out);
}
export async function applyCandidate(file,before,next,{buildings,landscape,repo=root,backupDir=path.join(os.homedir(),'.local/share/oneillsim/backups/district-replacement'),beforeCommit}={}){
 const original=JSON.parse(before);verifyPreservation(original,next,buildings,landscape);
 await inspectAssets(next,buildings,landscape,{repo});
 const after=serializePreservingFormat(before,next);
 assert.ok((await fs.readFile(file)).equals(before),'Concurrent world change; refusing overwrite');
 if(after.equals(before))return {unchanged:true,beforeSha256:sha(before),afterSha256:sha(before)};
 const lock=file+'.district-replacement-lock',staging=file+'.district-replacement-'+crypto.randomUUID()+'.staging';
 const handle=await fs.open(lock,'wx',0o600);let staged=false;
 try{
  const check=async()=>assert.ok((await fs.readFile(file)).equals(before),'Concurrent world change; refusing overwrite');
  await check();const stat=await fs.lstat(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Refuse non-regular world file');
  await fs.mkdir(backupDir,{recursive:true,mode:0o700});
  const privateStat=await fs.stat(backupDir);assert.equal(privateStat.mode&0o077,0,'Backup directory must be private');
  const backup=path.join(backupDir,'world-before-district-'+sha(before)+'-'+crypto.randomUUID()+'.json');
  const backupHandle=await fs.open(backup,'wx',0o600);
  try{await backupHandle.writeFile(before);await backupHandle.sync();}finally{await backupHandle.close();}
  assert.ok((await fs.readFile(backup)).equals(before),'Backup byte mismatch');
  const out=await fs.open(staging,'wx',stat.mode&0o777);staged=true;
  try{await out.writeFile(after);await out.sync();}finally{await out.close();}
  if(beforeCommit)await beforeCommit(); // Fixture-only injection for deterministic concurrency checks.
  await check();await fs.rename(staging,file);staged=false;
  const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}
  const saved=await fs.readFile(file);assert.ok(saved.equals(after),'Atomic readback mismatch');verifyPreservation(original,JSON.parse(saved),buildings,landscape);
  return {backup,beforeSha256:sha(before),afterSha256:sha(saved),applied:true};
 }finally{if(staged)await fs.rm(staging,{force:true});await handle.close();await fs.rm(lock,{force:true});}
}
export async function main(){
 const args=process.argv.slice(2);assert.ok(args.every(a=>['--apply','--dry-run'].includes(a))&&!(args.includes('--apply')&&args.includes('--dry-run')),'Use --dry-run (default) or --apply');
 const file=path.join(root,'world.json'),before=await fs.readFile(file),world=JSON.parse(before),{buildings,landscape}=await readContracts();
 const {next,replaced,alreadyReplaced}=candidateWorld(world,buildings,landscape);verifyPreservation(world,next,buildings,landscape);
 if(replaced)assert.equal(sha(before),authorizedWorldSha256,'Original world differs from the authorized byte-exact baseline; do not apply without renewed review');
 const assets=await inspectAssets(next,buildings,landscape);serializePreservingFormat(before,next);
 const report={dryRun:!args.includes('--apply'),beforeSha256:sha(before),replaced,alreadyReplaced,preserved:138,total:435,models:assets.modelCount,capture:districtCapture};
 if(args.includes('--apply'))Object.assign(report,await applyCandidate(file,before,next,{buildings,landscape}));
 console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
