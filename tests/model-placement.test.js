import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {candidateWorld,verifyPreservation,serializeAdditions,applyCandidate,inspectAssets,sha} from '../scripts/place-completed-models.mjs';
import {completedModels} from '../src/completed-models.js';
async function baseline(){const w=JSON.parse(await fs.readFile('world.json','utf8')),newTypes=new Set(completedModels.map(m=>m.id));w.assets=w.assets.filter(a=>!a[0].startsWith('completed-model-'));w.assetTypes=w.assetTypes.filter(t=>!newTypes.has(t));assert.equal(w.assets.length,435);return w;}
test('all 47 models append once with exact preservation and namespace conflicts are rejected',async()=>{
 const original=await baseline(),copy=structuredClone(original),{next,added,planned}=candidateWorld(original);assert.deepEqual(original,copy);assert.equal(added.length,47);assert.equal(next.assets.length,original.assets.length+47);assert.equal(planned.filter(p=>p.surface.worldTransform).length,9);assert.equal(planned.filter(p=>!p.surface.worldTransform).length,38);verifyPreservation(original,next);assert.equal(candidateWorld(next).added.length,0);
 const conflict=structuredClone(next);conflict.assets.at(-1)[4]=8;assert.throws(()=>candidateWorld(conflict),/Conflicting/);const unknown=structuredClone(original);unknown.assets.push(['completed-model-unapproved',0,0,0,4,0]);assert.throws(()=>candidateWorld(unknown),/Unknown/);const duplicate=structuredClone(original);duplicate.assets.push(duplicate.assets[0]);assert.throws(()=>candidateWorld(duplicate),/Duplicate/);
});
test('all real manifest/OBJ/MTL/atlas bounds agree before placement',async()=>{assert.equal((await inspectAssets()).length,47);});
test('append serialization preserves original tuple bytes, unrelated strings/numeric lexemes, whitespace and repeat bytes',async()=>{
 const original={...await baseline(),note:'text ] [ { } \\" preserved',opaque:100};const before=Buffer.from(JSON.stringify(original,null,2).replace('"opaque": 100','"opaque": 1e2').replaceAll('\n','\r\n')+'\r\n'),{next}=candidateWorld(JSON.parse(before));const after=serializeAdditions(before,next);assert.deepEqual(JSON.parse(after),next);assert.ok(after.toString().includes('"opaque": 1e2'));assert.ok(after.toString().endsWith('\r\n'));assert.ok(after.toString().includes(JSON.stringify(original.assets[0],null,2).replaceAll('\n','\r\n').split('\r\n').slice(1,-1).map(s=>'    '+s).join('\r\n')));assert.ok(serializeAdditions(after,candidateWorld(next).next).equals(after));
});
test('atomic fixture-only apply has private exact backup, readback, baseline pin and idempotency',async()=>{
 const directory=await fs.mkdtemp(path.join(process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch'),'model-placement-test-'));
 try{const file=path.join(directory,'world.json'),backupDir=path.join(directory,'backup'),original=await baseline(),before=Buffer.from(JSON.stringify(original)+'\n'),{next}=candidateWorld(original);await fs.writeFile(file,before);
  await assert.rejects(applyCandidate(file,before,next,{backupDir,authorizedSha:'0'.repeat(64)}),/baseline/);assert.ok((await fs.readFile(file)).equals(before));
  const result=await applyCandidate(file,before,next,{backupDir,authorizedSha:sha(before)}),after=await fs.readFile(file);assert.equal(result.applied,true);assert.ok((await fs.readFile(result.backup)).equals(before));assert.equal((await fs.stat(result.backup)).mode&0o077,0);assert.equal((await fs.stat(backupDir)).mode&0o077,0);verifyPreservation(original,JSON.parse(after));
  assert.equal((await applyCandidate(file,after,candidateWorld(JSON.parse(after)).next,{backupDir})).unchanged,true);assert.equal((await fs.readdir(backupDir)).length,1);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('concurrent world modification or occupied lock refuses overwrite and cleans staging',async()=>{
 const directory=await fs.mkdtemp(path.join(process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch'),'model-placement-race-'));
 try{const file=path.join(directory,'world.json'),original=await baseline(),before=Buffer.from(JSON.stringify(original)),{next}=candidateWorld(original),backupDir=path.join(directory,'backup');await fs.writeFile(file,before);await fs.writeFile(file+'.model-placement-lock','occupied');await assert.rejects(applyCandidate(file,before,next,{backupDir,authorizedSha:sha(before)}),/EEXIST/);assert.ok((await fs.readFile(file)).equals(before));await fs.rm(file+'.model-placement-lock');
  const changed=Buffer.concat([before,Buffer.from(' ')]);await assert.rejects(applyCandidate(file,before,next,{backupDir,authorizedSha:sha(before),beforeCommit:()=>fs.writeFile(file,changed)}),/Concurrent/);assert.ok((await fs.readFile(file)).equals(changed));assert.ok((await fs.readdir(directory)).every(n=>!n.includes('staging')&&!n.endsWith('-lock')));
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
