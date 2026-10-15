// Authored composition. Source budgets are kept separate from measured geometry.
import {districts} from './settlement-plan.js';
export const INTERIOR_VERSION=2;
export const interiorSources={
 population:{value:10000,unit:'people',source:'SP-413 Area and Volume Requirements, printed p.66 / PDF p.83',segment:'sp413-s01662'},
 community:{source:'SP-413 Table 3-2, printed p.26 / PDF p.43',segment:'sp413-s00708',perPerson:{housing:49,shops:2.3,offices:1,schools:1,hospital:.3,assembly:1.5,recreation:1,industry:4,storage:5,miscellaneous:2.9,communications:.05,water:4,electrical:.1,park:10,transportation:12}},
 crops:{source:'SP-413 Table 5-4 (PLANT AREAS in original scan; reader caption is transposed), printed p.98 / PDF p.115',segment:'sp413-s02395',perPerson:{sorghum:3.8,soybeans:23.5,wheat:7.2,rice:3.6,corn:.9,vegetables:5.2}},
 animals:{source:'SP-413 Table 5-5 (ANIMAL AREAS in original scan; reader caption is transposed), printed p.98 / PDF p.115',segment:'sp413-s02393',perPerson:{fish:2.6,chickens:.8,rabbits:1.1,cattle:.6}},
 housing:{source:'SP-413 Residences, printed p.32 / PDF p.49; Figs.5-5 and 5-7, printed pp.91–92',segments:['sp413-s00912','sp413-s02259','sp413-s02284'],note:'Explicit source minimum: 37 m²/person indoor floor + 12 m²/person exterior access = 49 total, not 49 indoor.'},
 composition:{source:'SP-413 Fig.5-9, printed p.93 / PDF p.110',segment:'sp413-s02286',note:'Dense spoke hub, graded density, gardens and bridges. Exact forms, streets and landscape are authored.'}
};
// Shared geometry contract: upper shoulder floors are narrower and offset, not
// facade paint masquerading as a different skyline. Keep ledger/roof plants exact.
export function housingLevelShape(b,level){
 const crown=b.category==='housing'&&level>=b.levels-(b.crownLevels||0),inset=crown?(b.crownInset||0):0;
 return {width:b.width-2*inset,depth:b.depth-(b.setback||0)*level,theta:b.theta+(crown?(b.crownShift||0)/830:0),z:b.z+Math.sign(b.z||1)*(b.setback||0)*level/2};
}
export function createInteriorPlan(){
 const buildings=[],landmarks=[],paths=[],hills=[],courts=[];
 const add=(district,category,x,z,width,depth,levels,base=0)=>{const storey=category==='hospital'?5:category==='assembly'?8:category==='schools'?3.8:3;const b={id:`interior-${district.id}-${category}-${buildings.length}`,districtId:district.id,category,theta:district.start+x/830,z,width,depth,levels,base,storey,floorArea:width*depth*levels};buildings.push(b);return b;};
 districts.filter(d=>d.kind==='residential').forEach((d,di)=>{
  const L=(d.end-d.start)*830,center=L/2;
  // Authored courts, not reflected rows. The two banks have separate longitudinal
  // rhythms; low, long garden houses are interleaved with narrow shouldered homes.
  // District-specific sequences make the skyline readable without random props.
  const candidates=[],bankOffsets=[[-17,19],[16,-16],[-23,13]][di];
  const innerHeights=[[7,12,9,11,6,10],[11,7,13,8,10,6],[9,13,6,10,7,12]][di];
  const widths=[[30,43,36,40,29,44],[42,31,39,29,44,35],[35,44,29,42,32,39]][di];
  for(let cluster=0;cluster<3;cluster++)for(let row=0;row<4;row++)for(let j=0;j<3;j++){
   if(cluster===1&&j===1)continue; // generous, unblocked spoke arrival
   const inner=row===1||row===2,side=row<2?-1:1,bank=side<0?0:1,sequence=(cluster*2+j+row*3)%6;
   const x=[270,center,L-270][cluster]+bankOffsets[bank]+[-50,1,50][j]+[-4,5,-5,4][row];
   const z=[-46.5,-24.5,25,46][row]+[0,.7,-.6][(cluster+j+di+row)%3];
   const levels=inner?innerHeights[sequence]:[4,6,5,7,4,5][(sequence+di+bank)%6];
   const width=widths[(sequence+bank)%6],depth=inner?16:13.5;
   const base=[0,1.5,3,4.5][(cluster+j+row+di)%4];
   const setback=[.45,.65,.85][(j+row+di)%3],crownLevels=inner&&levels>=9?2+(cluster+bank)%2:0,crownInset=3+(j+di)%3,crownShift=side*(1.5+(cluster%2));
   candidates.push({x,z,width,depth,levels,base,cluster,side,setback,crownLevels,crownInset,crownShift,palette:['acacia','water','orchard'][di],facadeRhythm:(j+2*row+cluster)%3});
  }
  // Solve the actual sum of shouldered floor polygons, including every setback.
  // No access/roof area is counted as indoor housing and no category is credited twice.
  let raw=0,setbacks=0;
  for(const b of candidates)for(let level=0;level<b.levels;level++){const width=housingLevelShape({...b,category:'housing',theta:0},level).width;raw+=width*b.depth;setbacks+=width*b.setback*level;}
  const factor=(370000/3+setbacks)/raw;
  for(const b of candidates){
   const house=add(d,'housing',b.x,b.z,b.width,b.depth*factor,b.levels,b.base);
   for(const key of ['setback','crownLevels','crownInset','crownShift','palette','facadeRhythm','cluster','side'])house[key]=b[key];
   house.floorArea=Array.from({length:b.levels},(_,level)=>{const s=housingLevelShape(house,level);return s.width*s.depth;}).reduce((a,b)=>a+b,0);
  }
  // Civic rooms occupy open cross-axis courts; services are concentrated at
  // district ends rather than squeezing fake medical buildings into gardens.
  const programs=[['schools',10000/3,3],['hospital',3000/3,1],['assembly',15000/3,1],['shops',23000/3,2],['offices',10000/3,3],['recreation',10000/3,1],['industry',40000/3,2],['storage',50000/3,4],['miscellaneous',29000/3,3],['communications',500/3,1],['water',40000/3,2],['electrical',1000/3,1]];
  // Civic/service precincts are a genuine additional below-plain floor system,
  // not a second overlapping credit on the housing streets. Access is disclosed.
  const cursors=[25,25];
  programs.forEach(([cat,area,levels],i)=>{const row=i%2,depth=28,width=area/levels/depth;add(d,cat,cursors[row]+width/2,row?18:-18,width,depth,levels,-42);cursors[row]+=width+6;});
  for(const side of [-1,1]){
   const arrival=candidates.filter(b=>b.cluster===1&&b.side===side),axis=center+bankOffsets[side<0?0:1];
   const left=Math.max(...arrival.filter(b=>b.x<axis).map(b=>b.x+b.width/2)),right=Math.min(...arrival.filter(b=>b.x>axis).map(b=>b.x-b.width/2));
   courts.push({id:`${d.id}-arrival-${side}`,districtId:d.id,theta:d.start+(left+right)/2/830,z:side*(side<0?24:27),width:Math.min(side<0?22:18,right-left-12),depth:18,side,kind:side<0?'water':'grove'});
   paths.push({id:`${d.id}-gallery-${side}`,width:3,points:[[d.start+140/830,side*9,.16],[d.end-140/830,side*9,.16]],supports:false});
   // Broad ground-connected park pockets BETWEEN neighborhoods, not wall strips.
   for(let park=0;park<2;park++){
    const left=Math.max(...candidates.filter(b=>b.cluster===park&&b.side===side).map(b=>b.x+b.width/2))+8;
    const right=Math.min(...candidates.filter(b=>b.cluster===park+1&&b.side===side).map(b=>b.x-b.width/2))-8;
    hills.push({id:`${d.id}-hill-${side}-${park}`,districtId:d.id,theta:d.start+(left+right)/2/830,z:side*35,width:right-left,depth:40,height:5.5+di*.4,side,park,pathBend:side*(2.4+di*.55+park*.65),pathRipple:(park?-.65:.8),skew:side*(.13+park*.04),groveStyle:(di+park+(side>0?1:0))%3});
   }
  }
  landmarks.push({id:`${d.id}-garden`,name:['Acacia Gardens','Water Courts','Orchard Village'][di],theta:d.start+110/830,z:0,height:.16,yaw:-90,exactFloor:true},
   {id:`${d.id}-hub`,name:`${d.name} · spoke garden & contour walks`,theta:d.center-90/830,z:9,height:.16,yaw:-90,exactFloor:true},
   {id:`${d.id}-hill-walk`,name:`${d.name} · meadow summit walk`,theta:hills.find(h=>h.districtId===d.id&&h.side===1).theta,z:35,height:5.555+di*.4,yaw:-90,exactFloor:true},
   {id:`${d.id}-civic`,name:`${d.name} · school, clinic & civic street`,theta:d.start+22/830,z:0,height:-41.76,yaw:-90,exactFloor:true},
   {id:`${d.id}-civic-entry`,name:`${d.name} · civic descent`,theta:d.start+3/830,z:-36,height:0,yaw:-90,exactFloor:true});
 });
 for(const d of districts.filter(d=>d.kind==='agricultural'))landmarks.push({id:`${d.id}-terraces`,name:`${d.name} · sunlight terraces`,theta:d.start+140/830,z:44,height:5,exactFloor:true,yaw:-90});
 return {version:INTERIOR_VERSION,name:'The inhabited garden',districts,buildings,paths,hills,courts,landmarks,sources:interiorSources,limitations:[
 'Floor ledger measures modeled gross architectural shells, not certified usable/net area or demonstrated occupancy. The 10,000-person study program is a design target, not simulated inhabitants.',
 'Service precincts have connected stairs and a physical below-plain civic street; shells are not furnished schools, clinics or operating services, and accessibility/egress certification is not modeled.',
 'Original farm A terraces are repeated in B/C. Layer geometry and crop footprints are preserved; irradiance, yield, animal welfare and atmospheric engineering are not simulated.',
 'Conveyor speed and open step-on lanes are authored visitor circulation, not a sourced SP-413 transport specification.',
 'Housing access, transportation and classified open-space allocations are not certified. Detailed homes and procedural multilevel envelopes are not fully furnished apartments.'
 ]};
}
export function interiorFloorLedger(plan=createInteriorPlan()){
 const measured={};for(const b of plan.buildings)measured[b.category]=(measured[b.category]||0)+b.floorArea;
 return {populationTarget:10000,measuredGrossShellFloors:measured,indoorHousingTarget:370000,residentialExteriorAccessTarget:120000,sourceCommunity:interiorSources.community,fullSourceCompliance:false,limitations:plan.limitations};
}
