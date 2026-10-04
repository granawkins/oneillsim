import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {residentialKitIds,residentialPilot,residentialPlacements,reservationBounds,rectanglesOverlap,fitsTube} from '../src/residential-kit.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function candidateWorld(world){
 assert.ok(Array.isArray(world.assets)&&Array.isArray(world.assetTypes),'Compact world required');
 assert.equal(new Set(world.assetTypes).size,world.assetTypes.length,'Duplicate type index');
 assert.equal(new Set(world.assets.map(a=>a[0])).size,world.assets.length,'Duplicate saved IDs');
 const planned=residentialPlacements(),known=new Set(planned.map(p=>p.id));
 for(const a of world.assets){
  assert.ok(Number.isInteger(a[1])&&world.assetTypes[a[1]],'Invalid existing type index');
  if(a[0].startsWith('residential-kit-'))assert.ok(known.has(a[0]),'Unknown residential namespace ID: '+a[0]);
 }
 assert.equal(world.assets.filter(a=>!known.has(a[0])).length,residentialPilot.originalPlacements,'Expected exactly 423 original records');
 const types=[...world.assetTypes];for(const id of residentialKitIds)if(!types.includes(id))types.push(id);
 const added=[];
 for(const p of planned){
  const record=[p.id,types.indexOf(p.type),p.theta,p.z,p.scale,p.rotation,null,p.surface];
  const existing=world.assets.find(a=>a[0]===p.id);
  if(existing)assert.deepEqual(existing,record,'Conflicting residential ID: '+p.id);else added.push(record);
 }
 return {next:{...world,assetTypes:types,assets:[...world.assets,...added]},added};
}
export function validateLayout(world){
 const planned=residentialPlacements(),district=world.masterPlan?.districts?.find(d=>d.id===residentialPilot.districtId);
 assert.ok(district,'Missing Residential B masterPlan');
 for(const p of planned){
  const b=reservationBounds(p),half=p.reservation.width/2/830;
  assert.ok(p.theta-half>district.start&&p.theta+half<district.end,'Outside Residential B');
  assert.ok(!rectanglesOverlap(b,residentialPilot.existingCourt,3),'Overlaps existing court/access');
  assert.ok(fitsTube(p,[[-p.reservation.width/2,p.reservation.width/2],[0,10],[-p.reservation.depth/2,p.reservation.depth/2]]),'Reservation exceeds tube');
  for(const q of planned)if(p.id!==q.id)assert.ok(!rectanglesOverlap(b,reservationBounds(q),residentialPilot.minimumAisle),'Unsafe aisle');
  for(const a of world.assets){
   if(a[0].startsWith('residential-kit-'))continue;
   const block=a[6];if(!block)continue;
   // Guard the spoke arrival reservation even when its platform is elevated.
   if(!a[0].includes('spoke-')&&Math.abs(a[7]?.height??block.elevation??0)>.1)continue;
   const x=(a[2]-residentialPilot.thetaDegrees*Math.PI/180)*830;
   const existing={xMin:x-block.width/2,xMax:x+block.width/2,zMin:a[3]-block.depth/2,zMax:a[3]+block.depth/2};
   assert.ok(!rectanglesOverlap(b,existing,4),'Overlap existing block/spoke: '+a[0]);
  }
 }
}
export async function inspectAssets(assetDir=path.join(root,'assets/ultimate-buildings')){
 const missing=[],errors=[],models=[];
 try{
  const atlas=await fs.readFile(path.join(assetDir,'TorusResidentialKit_Atlas.png'));
  assert.ok(atlas.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&atlas.length>24,'Invalid PNG atlas');
  assert.ok(atlas.readUInt32BE(16)>0&&atlas.readUInt32BE(20)>0,'Empty PNG atlas');
 }catch(e){if(e.code==='ENOENT')missing.push('TorusResidentialKit_Atlas.png');else errors.push('TorusResidentialKit_Atlas.png: '+e.message);}
 for(const id of residentialKitIds){
  const files={};
  for(const ext of ['obj','mtl','asset.json'])try{files[ext]=await fs.readFile(path.join(assetDir,id+'.'+ext),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;missing.push(id+'.'+ext);}
  if(Object.keys(files).length!==3)continue;
  try{
   const m=JSON.parse(files['asset.json']),b=m.actualModelBoundsMeters;
   assert.equal(m.id,id);assert.equal(m.editorDefaultScale,4);
   assert.ok(Array.isArray(b)&&b.length===3&&b.every(v=>v.length===2&&v.every(Number.isFinite)&&v[1]>v[0]),'Invalid actualModelBoundsMeters');
   const r=residentialPilot.reservations[id];
   assert.ok(b[0][0]>=-r.width/2&&b[0][1]<=r.width/2&&b[2][0]>=-r.depth/2&&b[2][1]<=r.depth/2,'Bounds outside origin-centred reservation');
   assert.ok(Math.abs(b[1][0])<1e-6&&b[1][1]<=10,'Feet/height contract');
   assert.equal(m.materials,1);assert.equal(m.objects,1);assert.equal(m.textureAtlas,'TorusResidentialKit_Atlas.png');
   assert.deepEqual([...new Set(files.mtl.match(/^newmtl\s+(.+)$/gm))],['newmtl TorusResidentialKit']);
   assert.deepEqual([...new Set(files.obj.match(/^usemtl\s+(.+)$/gm))],['usemtl TorusResidentialKit']);
   assert.equal((files.obj.match(/^o\s+/gm)||[]).length,1);
   assert.ok(files.obj.includes('mtllib '+id+'.mtl'),'Wrong MTL reference');
   const actual=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];let vertices=0;
   for(const line of files.obj.split('\n'))if(line.startsWith('v ')){
    const v=line.trim().split(/\s+/).slice(1).map(Number);assert.equal(v.length,3);assert.ok(v.every(Number.isFinite));vertices++;
    for(let k=0;k<3;k++){actual[k][0]=Math.min(actual[k][0],v[k]*4);actual[k][1]=Math.max(actual[k][1],v[k]*4);}
   }
   assert.ok(vertices>0);
   for(let k=0;k<3;k++)for(let j=0;j<2;j++)assert.ok(Math.abs(actual[k][j]-b[k][j])<1e-4,'Manifest/OBJ bounds mismatch');
   const maps=[...files.mtl.matchAll(/^map_Kd\s+(.+)$/gm)].map(x=>x[1].trim());assert.deepEqual(maps,['TorusResidentialKit_Atlas.png']);
   await fs.access(path.join(assetDir,maps[0]));
   for(const p of residentialPlacements().filter(p=>p.type===id))assert.ok(fitsTube(p,b),'Actual model exceeds tube');
   models.push({id,bounds:b,vertices,groundEntries:(m.collisionIntent?.entries||[]).filter(e=>e.passable&&e.floorMeters<=.2)});
  }catch(e){errors.push(id+': '+e.message);}
 }
 return {missing,errors,models};
}
export function verifyPreservation(before,after){
 assert.deepEqual(after.assetTypes.slice(0,before.assetTypes.length),before.assetTypes,'Type indices changed');
 assert.deepEqual(after.assets.slice(0,before.assets.length),before.assets,'Original records changed');
 for(const key of Object.keys(before))if(!['assets','assetTypes'].includes(key))assert.deepEqual(after[key],before[key],'Unrelated field changed: '+key);
 assert.deepEqual(Object.keys(after),Object.keys(before),'World fields changed');
 assert.equal(after.assets.length,435);
 candidateWorld(after);
}
export async function applyCandidate(file,before,next,{backupDir=path.join(os.homedir(),'.local/share/oneillsim/backups')}={}){
 const world=JSON.parse(before);verifyPreservation(world,next);
 const text=before.toString('utf8');assert.ok(!text.trim().includes('\n'),'Expected original compact world format');
 const after=Buffer.from(JSON.stringify(next)+(text.endsWith('\n')?'\n':''));
 const staging=file+'.residential-kit-staging',lock=file+'.residential-kit-lock';
 const handle=await fs.open(lock,'wx',0o600);let backup,staged=false;
 try{
  if(!(await fs.readFile(file)).equals(before))throw Error('Concurrent world change before backup');
  await fs.mkdir(backupDir,{recursive:true,mode:0o700});
  backup=path.join(backupDir,'world-before-residential-kit-'+new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID()+'.json');
  await fs.writeFile(backup,before,{flag:'wx',mode:0o600});
  const out=await fs.open(staging,'wx',0o600);staged=true;try{await out.writeFile(after);await out.sync();}finally{await out.close();}
  if(!(await fs.readFile(file)).equals(before))throw Error('Concurrent world change; refusing overwrite');
  await fs.rename(staging,file);staged=false;
  const saved=await fs.readFile(file);assert.ok(saved.equals(after),'Read-back mismatch');verifyPreservation(world,JSON.parse(saved));
  return {backup,beforeSha256:sha(before),afterSha256:sha(saved)};
 }finally{if(staged)await fs.rm(staging,{force:true});await handle.close();await fs.rm(lock,{force:true});}
}
export async function main(){
 const args=process.argv.slice(2);if(args.some(a=>!['--apply','--dry-run'].includes(a))||args.includes('--apply')&&args.includes('--dry-run'))throw Error('Use --dry-run (default) or --apply');
 const file=path.join(root,'world.json'),before=await fs.readFile(file),world=JSON.parse(before);
 validateLayout(world);const {next,added}=candidateWorld(world);verifyPreservation(world,next);
 const assets=await inspectAssets(),preview={pilot:residentialPilot.name,existingPlacements:world.assets.length,added:added.length,resultPlacements:next.assets.length,counts:{courtyard:6,row:4,apartments:2},...assets,plannerUrl:'https://stanfordtorus.com/'+residentialPilot.plannerQuery,humanUrl:'https://stanfordtorus.com/'+residentialPilot.humanQuery};
 if(!args.includes('--apply')){console.log(JSON.stringify({...preview,dryRun:true},null,2));return;}
 if(assets.missing.length||assets.errors.length)throw Error('Cannot apply: '+[...assets.missing,...assets.errors].join('; '));
 if(!added.length){console.log(JSON.stringify({...preview,unchanged:true},null,2));return;}
 console.log(JSON.stringify({...preview,applied:true,...await applyCandidate(file,before,next)},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
