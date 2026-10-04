import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {settlementCandidate,serializeSettlement,applySettlement,digest,settlementBaselineSha} from '../scripts/apply-settlement-design.mjs';
const baseline=JSON.parse(await fs.readFile(new URL('../assets/settlement-source-world.json',import.meta.url),'utf8'));
function samplePlan(){const a=baseline.assets.find(a=>a[0]==='farm-a-plot-1');return {replacements:[{id:a[0],type:'TorusAgri_GrainA',theta:a[2],z:a[3],scale:4,rotation:0,surface:{deckId:a[7].deckId,height:a[7].height-.05,anchorHeight:a[7].height}}],additions:[{id:'settlement-test-tree',type:'TorusNature_TreeA',theta:4.7,z:30,scale:4,rotation:.6,surface:{deckId:'ground',height:-.05,anchorHeight:0}}],metadata:{version:1,interpretation:'Fixture only',routes:[]}};}
test('whole-settlement candidate preserves IDs, 481 unedited records and unrelated fields; farm provenance and repeat no-op',()=>{
 const before=structuredClone(baseline),plan=samplePlan(),c=settlementCandidate(before,plan);assert.deepEqual(before,baseline);assert.equal(c.added,1);assert.equal(c.replaced,1);assert.equal(c.next.assets.length,483);const edited=c.next.assets.find(a=>a[0]==='farm-a-plot-1');assert.deepEqual(edited[7].sourcePlot,baseline.assets.find(a=>a[0]==='farm-a-plot-1')[6]);const again=settlementCandidate(c.next,plan);assert.equal(again.added,0);assert.deepEqual(again.next,c.next);
 assert.throws(()=>settlementCandidate(baseline,{...plan,replacements:[{...plan.replacements[0],id:baseline.assets[0][0]}]}),/Only explicitly/);
 assert.throws(()=>settlementCandidate(baseline,{...plan,additions:[{...plan.additions[0],id:baseline.assets[0][0]}]}),/namespace/);
 assert.throws(()=>settlementCandidate(baseline,{...plan,replacements:[{...plan.replacements[0],theta:0}]}),/position/);
 assert.throws(()=>settlementCandidate(baseline,{...plan,replacements:[{...plan.replacements[0],surface:{...plan.replacements[0].surface,deckId:'ground'}}]}),/deck/);
 assert.throws(()=>settlementCandidate(baseline,{...plan,additions:[{...plan.additions[0],surface:{deckId:'ground',height:NaN}}]}),/support/);
});
test('surgical serialization preserves untouched tuple bytes, JSON strings, CRLF, indentation and unrelated number spelling',()=>{
 for(const pretty of [false,true]){let text=JSON.stringify({...baseline,note:'odd ], { \\" string',opaque:100},null,pretty?4:0).replace(/"opaque":\s*100/,'"opaque": 1e2');if(pretty)text=text.replace(/\n/g,'\r\n');const b=Buffer.from(text),w=JSON.parse(b),c=settlementCandidate(w,samplePlan()),out=serializeSettlement(b,c.next,c.approvedReplacementIds);assert.deepEqual(JSON.parse(out),c.next);assert.ok(out.includes('"opaque": 1e2'));for(const a of baseline.assets.filter(a=>a[0]!=='farm-a-plot-1'))if(!pretty)assert.ok(out.includes(JSON.stringify(a)));const repeated=settlementCandidate(c.next,samplePlan());assert.ok(serializeSettlement(out,repeated.next,repeated.approvedReplacementIds).equals(out));}
});
test('private fixture atomic apply pins baseline, exact backup, concurrent refusal, no-op repeat and lock cleanup',async()=>{
 const scratch=process.env.TMPDIR||path.join(os.homedir(),'.hermes/cache/scratch'),dir=await fs.mkdtemp(path.join(scratch,'settlement-write-test-')),file=path.join(dir,'world.json'),backupDir=path.join(dir,'backups');
 try{const bytes=Buffer.from(JSON.stringify(baseline)),c=settlementCandidate(baseline,samplePlan());await fs.writeFile(file,bytes);
  await assert.rejects(applySettlement(file,bytes,c.next,c.approvedReplacementIds,{backupDir,authorizedSha:'0'.repeat(64)}),/baseline/);assert.ok((await fs.readFile(file)).equals(bytes));
  const result=await applySettlement(file,bytes,c.next,c.approvedReplacementIds,{authorizedSha:digest(bytes),backupDir});assert.ok((await fs.readFile(result.backup)).equals(bytes));assert.equal((await fs.stat(result.backup)).mode&0o777,0o600);assert.equal((await fs.stat(backupDir)).mode&0o777,0o700);
  const saved=await fs.readFile(file),repeat=settlementCandidate(JSON.parse(saved),samplePlan());assert.equal((await applySettlement(file,saved,repeat.next,repeat.approvedReplacementIds,{backupDir})).unchanged,true);
  await fs.writeFile(file,bytes);await assert.rejects(applySettlement(file,bytes,c.next,c.approvedReplacementIds,{backupDir,authorizedSha:digest(bytes),beforeCommit:()=>fs.writeFile(file,Buffer.concat([bytes,Buffer.from(' ')]))}),/Concurrent/);assert.ok((await fs.readFile(file)).equals(Buffer.concat([bytes,Buffer.from(' ')])));assert.ok(!(await fs.readdir(dir)).some(n=>n.endsWith('-lock')||n.endsWith('.staging')));
  assert.equal(settlementBaselineSha,digest(await fs.readFile(new URL('../assets/settlement-source-world.json',import.meta.url))));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
