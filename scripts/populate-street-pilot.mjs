import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {streetKitIds,streetPilot,streetPilotPlacements} from '../src/street-kit.js';

// Explicitly scoped additive layout. Never regenerate the existing world.
// Dry-run is the default; --apply requires real reviewed asset files.
const root=fileURLToPath(new URL('../',import.meta.url));
const file=path.join(root,'world.json');
const before=await fs.readFile(file);const world=JSON.parse(before);
const originalIds=new Set(world.assets.map(a=>a[0]));
if(originalIds.size!==world.assets.length)throw Error('World has duplicate IDs; refusing mutation');
const types=[...world.assetTypes];
for(const id of streetKitIds)if(!types.includes(id))types.push(id);
const planned=streetPilotPlacements();
const records=planned.map(p=>[p.id,types.indexOf(p.type),p.theta,p.z,p.scale,p.rotation,null,p.surface]);
if(records.length!==36||records.some(r=>r[1]<0))throw Error('Unexpected pilot contract');
const added=[];
for(const record of records){
 const existing=world.assets.find(a=>a[0]===record[0]);
 if(existing){if(JSON.stringify(existing)!==JSON.stringify(record))throw Error('Existing pilot ID differs: '+record[0]);}
 else added.push(record);
}
const counts=Object.fromEntries([...new Set(planned.map(p=>p.type))].map(id=>[id,planned.filter(p=>p.type===id).length]));
const missing=[];
for(const id of streetKitIds)for(const ext of ['obj','mtl','asset.json'])try{await fs.access(path.join(root,'assets','ultimate-buildings',id+'.'+ext));}catch{missing.push(id+'.'+ext);}
const preview={pilot:streetPilot.name,existingPlacements:world.assets.length,added:added.length,resultPlacements:world.assets.length+added.length,counts,missingAssetFiles:missing,walkUrl:'https://stanfordtorus.com/?theta=150&z=5&yaw=0&pitch=0'};
if(!process.argv.includes('--apply')){console.log(JSON.stringify({...preview,dryRun:true},null,2));process.exit(0);}
if(missing.length)throw Error('Cannot apply unreviewed/missing assets: '+missing.join(', '));
if(!added.length){console.log(JSON.stringify({...preview,unchanged:true},null,2));process.exit(0);}
const backupDir=path.join(os.homedir(),'.local','share','oneillsim','backups');await fs.mkdir(backupDir,{recursive:true});
const stamp=new Date().toISOString().replaceAll(':','-');const backup=path.join(backupDir,`world-before-street-pilot-${stamp}.json`);
await fs.writeFile(backup,before,{flag:'wx'});
const next={...world,assetTypes:types,assets:[...world.assets,...added]};
const originalText=before.toString('utf8');
const pretty=originalText.trim().includes('\n');
const after=Buffer.from(JSON.stringify(next,null,pretty?2:undefined)+(originalText.endsWith('\n')?'\n':''));
const staging=file+'.street-pilot-staging';
try{
 await fs.writeFile(staging,after,{flag:'wx'});
 if(!(await fs.readFile(file)).equals(before))throw Error('Live world changed during preparation; refusing overwrite');
 await fs.rename(staging,file);
}finally{await fs.rm(staging,{force:true});}
const verified=await fs.readFile(file);if(!verified.equals(after))throw Error('World read-back mismatch');
const saved=JSON.parse(verified);
for(let i=0;i<world.assets.length;i++)if(JSON.stringify(saved.assets[i])!==JSON.stringify(world.assets[i]))throw Error('Preexisting record changed');
for(const key of Object.keys(world))if(!['assets','assetTypes'].includes(key)&&JSON.stringify(saved[key])!==JSON.stringify(world[key]))throw Error('Unrelated world field changed: '+key);
console.log(JSON.stringify({...preview,applied:true,backup,beforeSha256:crypto.createHash('sha256').update(before).digest('hex'),afterSha256:crypto.createHash('sha256').update(verified).digest('hex')},null,2));
