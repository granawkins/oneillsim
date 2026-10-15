import fs from 'node:fs';
import crypto from 'node:crypto';
import {createInteriorPlan,interiorFloorLedger} from '../src/interior-plan.js';
export function dressInteriorGardens(w){
 const plan=createInteriorPlan();w.assets=w.assets.filter(a=>!a[0].startsWith('interior-garden-detail-'));
 const index=name=>{let n=w.assetTypes.indexOf(name);if(n<0){n=w.assetTypes.length;w.assetTypes.push(name);}return n;};
 const add=(id,type,theta,z,scale,height,yaw=0)=>w.assets.push(['interior-garden-detail-'+id,index(type),theta,z,scale,yaw,null,{height,...(type==='TorusNature_TreeA'||type==='TorusNature_RockA'?{}:{collisionMode:'none'})}]);
 for(const [i,b]of plan.buildings.filter(b=>b.category==='housing').entries()){
  const h=b.base+b.levels*b.storey+.43,z=b.z+Math.sign(b.z)*.7*(b.levels-1)/2;
  if(i%3!==1)for(const side of [-1,1]){
   add(b.id+'-roof-'+side,i%4?'TorusNature_TreeA':'TorusNature_ShrubA',b.theta+side*(b.width*.25)/830,z,2.5,h-.05,i*.7);
   add(b.id+'-roof-flower-'+side,'TorusNature_FlowersA',b.theta+side*(b.width*.3)/830,z-Math.sign(b.z)*2,4,h-.05,i);
  }
 }
 for(const [di,d]of plan.districts.filter(d=>d.kind==='residential').entries()){
  const L=(d.end-d.start)*830;
  for(let j=0;j<60;j++){
   const x=25+j*(L-50)/59,side=j%2?1:-1,z=side*(11+Math.sin(j*1.37+di)*.7);
   add(`${d.id}-shrub-${j}`,'TorusNature_ShrubA',d.start+x/830,z,3.5,-.05,j);
  }
  for(let j=0;j<9;j++)for(const side of [-1,1]){
   const x=38+j*11,z=side*(32+Math.sin(j+di)*2);
   add(`${d.id}-orchard-${j}-${side}`,'TorusNature_TreeA',d.start+x/830,z,4+(j%2)*.6,-.05,j);
  }
  // Existing pond/rock/flower kit gives each rural court an identifiable garden.
  for(const [j,x]of [L/2-8,L/2+10].entries()){
   add(`${d.id}-arrival-pond-${j}`,'TorusNature_PondA',d.start+x/830,j?25:-23,5,.11,j);
   for(let k=0;k<4;k++)add(`${d.id}-arrival-tree-${j}-${k}`,'TorusNature_TreeA',d.start+(x+(k-1.5)*6)/830,(j?31:-29)+Math.sin(k)*2,4.5,-.05,k);
   add(`${d.id}-arrival-table-${j}`,'TorusTable_A',d.start+(x-4)/830,j?18:-17,4,-.05);
  }
  for(const [j,x]of [80,L-76].entries()){
   add(`${d.id}-pond-${j}`,'TorusNature_PondA',d.start+x/830,32,4,-.05);
   add(`${d.id}-rock-${j}`,'TorusNature_RockA',d.start+(x+5)/830,35,3,-.05,j);
  }
 }
 // Break bilateral tree pairing into independently composed groves.
 for(const a of w.assets){const match=a[0].match(/^interior-(residential-.)-tree-(\d+)-(-?1)$/);if(match){const d=plan.districts.find(d=>d.id===match[1]),j=Number(match[2]),side=Number(match[3]),L=(d.end-d.start)*830;a[3]=side*(12.2+Math.sin(j*.79+side*1.8)*1.2);a[2]=d.start+(20+j*(L-40)/94+(side===1?Math.sin(j*.4)*2:Math.cos(j*.62)*3))/830;}}
 w.settlementDesign.landmarks=plan.landmarks;w.settlementDesign.sources=plan.sources;w.settlementDesign.ledger=interiorFloorLedger(plan);return w;
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const path=new URL('../world.json',import.meta.url),raw=fs.readFileSync(path),w=JSON.parse(raw);if(w.settlementDesign?.version!==2)throw Error('Requires interior v2');
 const before=crypto.createHash('sha256').update(raw).digest('hex');dressInteriorGardens(w);if(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')!==before)throw Error('Concurrent world change');fs.writeFileSync(path,JSON.stringify(w));const check=JSON.parse(fs.readFileSync(path));console.log(JSON.stringify({assets:check.assets.length,gardenDetails:check.assets.filter(a=>a[0].startsWith('interior-garden-detail-')).length}));
}
