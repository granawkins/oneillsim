import fs from 'node:fs';
import crypto from 'node:crypto';
import {createInteriorPlan,interiorFloorLedger,housingLevelShape} from '../src/interior-plan.js';
import {landscapeHeight,landscapePathZ} from '../src/interior-landscape.js';
export function dressInteriorGardens(w){
 const plan=createInteriorPlan();w.assets=w.assets.filter(a=>!a[0].startsWith('interior-garden-detail-')&&!/^interior-residential-.-tree-\d+-(-?1)$/.test(a[0]));
 const index=name=>{let n=w.assetTypes.indexOf(name);if(n<0){n=w.assetTypes.length;w.assetTypes.push(name);}return n;};
 const add=(id,type,theta,z,scale,height,yaw=0)=>w.assets.push(['interior-garden-detail-'+id,index(type),theta,z,scale,yaw,null,{height,...(type==='TorusNature_TreeA'||type==='TorusNature_RockA'?{}:{collisionMode:'none'})}]);
 for(const [i,b]of plan.buildings.filter(b=>b.category==='housing').entries()){
  const h=b.base+b.levels*b.storey+.43,roof=housingLevelShape(b,b.levels-1),{z,theta,width,depth}=roof;
  if(i%3!==1)for(const side of [-1,1]){
   // Crown geometry and variable setbacks are authoritative: no orphaned old trees.
   add(b.id+'-roof-'+side,i%4?'TorusNature_TreeA':'TorusNature_ShrubA',theta+side*(width*.25)/830,z,Math.min(2.5,depth*.28),h-.05,i*.7);
   add(b.id+'-roof-flower-'+side,'TorusNature_FlowersA',theta+side*(width*.3)/830,z-Math.sign(b.z)*Math.min(2,depth*.2),3.5,h-.05,i);
  }
 }
 // Authored woodland edges/copses, not equal trees at equal intervals. A broad
 // open grass room remains alongside each summit route; the opposite bank uses
 // a different recipe, scale rhythm and bend direction.
 const groves=[
  [[-.39,-9],[-.33,-12],[-.25,-9],[-.18,-12],[-.09,-10],[.08,-12],[.17,-9],[.28,-11],[.34,-8],[.27,10],[.34,13],[.39,9]],
  [[-.38,9],[-.31,12],[-.23,10],[-.11,12],[.02,9],[.12,12],[.22,10],[.36,12],[-.34,-11],[-.26,-8],[.27,-10],[.35,-13]],
  [[-.38,-10],[-.3,-13],[-.22,-9],[-.13,-12],[-.04,-9],[.05,-12],[.31,9],[.38,12],[.23,12],[.15,9],[.28,-11],[.36,-8]]
 ];
 for(const hill of plan.hills){
  for(const [j,[f,offset]]of groves[hill.groveStyle].entries()){
   const x=f*hill.width,z=landscapePathZ(hill,x)+offset,h=landscapeHeight(hill,x,z);
   add(`${hill.id}-grove-${j}`,'TorusNature_TreeA',hill.theta+x/830,z,3.3+((j*3+hill.groveStyle)%5)*.32,h-.05,j*.73+hill.groveStyle);
   if(j%2===0){
    const xx=x+2.2,zz=z+Math.sign(offset)*1.1;
    add(`${hill.id}-flowers-${j}`,'TorusNature_FlowersA',hill.theta+xx/830,zz,3.2,landscapeHeight(hill,xx,zz)-.05,j);
   }
  }
  for(let j=0;j<6;j++){
   const x=(-.32+j*.125)*hill.width,z=landscapePathZ(hill,x)+(hill.groveStyle===1?1:-1)*(6+((j+hill.park)%3)*1.1);
   add(`${hill.id}-low-planting-${j}`,'TorusNature_ShrubA',hill.theta+x/830,z,2.8+(j%2)*.5,landscapeHeight(hill,x,z)-.05,j*.8);
  }
 }
 for(const [di,d]of plan.districts.filter(d=>d.kind==='residential').entries()){
  const L=(d.end-d.start)*830;
  for(let j=0;j<36;j++){
   const x=25+j*(L-50)/35,side=j%2?1:-1,z=side*(12.6+Math.sin(j*1.37+di)*.5);
   if(plan.buildings.some(b=>b.category==='housing'&&b.districtId===d.id&&Math.abs((b.theta-d.start)*830-x)<b.width/2+3))continue;
   add(`${d.id}-shrub-${j}`,'TorusNature_ShrubA',d.start+x/830,z,3,-.05,j);
  }
  for(let j=0;j<9;j++)for(const side of [-1,1]){
   const x=38+j*11,z=side*(32+Math.sin(j+di)*2);
   add(`${d.id}-orchard-${j}-${side}`,'TorusNature_TreeA',d.start+x/830,z,4+(j%2)*.6,-.05,j);
  }
  // One intimate water court faces a shaded grove, not a reflected second pond.
  // Court centers come from ACTUAL bank-specific gaps, never the old mirror axis.
  for(const court of plan.courts.filter(c=>c.districtId===d.id)){
   const water=court.kind==='water';
   if(water)add(`${court.id}-pond`,'TorusNature_PondA',court.theta,court.z-2,4.5,.11,di*.5);
   const trees=water?[[-7,-6],[6,-7],[-8,5],[7,4]]:[[-5,5],[2,6],[7,4],[-6,-2],[6,-2],[-5,-8],[7,-8]];
   for(const [k,[x,z]]of trees.entries())add(`${court.id}-tree-${k}`,'TorusNature_TreeA',court.theta+x/830,court.z+z,(water?4.1:4.5)+((k+di)%3)*.3,-.05,k*.8);
   if(!water)for(const [k,[x,z]]of [[-8,1],[8,1],[-7,7],[7,8]].entries())add(`${court.id}-understorey-${k}`,'TorusNature_ShrubA',court.theta+x/830,court.z+z,3.3,.11,k);
   add(`${court.id}-table`,'TorusTable_A',court.theta+(water?-7:4)/830,court.z+(water?0:-5),3.5,.11,di*.5);
  }
  for(const [j,x]of [80,L-76].entries()){
   add(`${d.id}-pond-${j}`,'TorusNature_PondA',d.start+x/830,32,4,-.05);
   add(`${d.id}-rock-${j}`,'TorusNature_RockA',d.start+(x+5)/830,35,3,-.05,j);
  }
 }
 // The former twin 95-tree contour rows are replaced by the authored hill
 // groves above. Their trunks occupied the new housing stairs and court edges.
 w.settlementDesign.landmarks=plan.landmarks;w.settlementDesign.sources=plan.sources;w.settlementDesign.ledger=interiorFloorLedger(plan);return w;
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const path=new URL('../world.json',import.meta.url),raw=fs.readFileSync(path),w=JSON.parse(raw);if(w.settlementDesign?.version!==2)throw Error('Requires interior v2');
 const hash=data=>crypto.createHash('sha256').update(data).digest('hex'),before=hash(raw),exterior=JSON.stringify(w.assets.filter(a=>a[7]?.worldTransform));
 const replaced=a=>a[0].startsWith('interior-garden-detail-')||/^interior-residential-.-tree-\d+-(-?1)$/.test(a[0]);
 const preserved=JSON.stringify(w.assets.filter(a=>!replaced(a))),terraces=JSON.stringify(w.terraces),types=JSON.stringify(w.assetTypes);
 dressInteriorGardens(w);const payload=JSON.stringify(w),again=JSON.stringify(dressInteriorGardens(structuredClone(w)));
 if(payload!==again)throw Error('Dressing is not idempotent');
 if(JSON.stringify(w.assets.filter(a=>a[7]?.worldTransform))!==exterior)throw Error('Exterior changed');
 if(JSON.stringify(w.assets.filter(a=>!replaced(a)))!==preserved||JSON.stringify(w.terraces)!==terraces)throw Error('Unrelated placements or farm surfaces changed');
 if(JSON.stringify(w.assetTypes)!==types)throw Error('Dressing must reuse existing asset types');
 const apply=process.argv.includes('--apply');let backup=null;
 if(apply){
  const dir=process.env.HOME+'/.local/share/oneillsim/backups/interior-garden-terraces';fs.mkdirSync(dir,{recursive:true,mode:0o700});
  backup=dir+'/'+new Date().toISOString().replaceAll(':','-')+'-'+before.slice(0,12)+'.json';fs.writeFileSync(backup,raw,{flag:'wx',mode:0o600});
  if(hash(fs.readFileSync(path))!==before)throw Error('Concurrent world change');
  fs.writeFileSync(path,payload);if(fs.readFileSync(path,'utf8')!==payload)throw Error('World read-back mismatch');
 }
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',backup,before,after:hash(payload),assets:w.assets.length,gardenDetails:w.assets.filter(a=>a[0].startsWith('interior-garden-detail-')).length}));
}
