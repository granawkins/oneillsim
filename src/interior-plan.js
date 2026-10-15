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
export function createInteriorPlan(){
 const buildings=[],landmarks=[],paths=[],hills=[];
 const add=(district,category,x,z,width,depth,levels,base=0)=>{const storey=category==='hospital'?5:category==='assembly'?8:category==='schools'?3.8:3;const b={id:`interior-${district.id}-${category}-${buildings.length}`,districtId:district.id,category,theta:district.start+x/830,z,width,depth,levels,base,storey,floorArea:width*depth*levels};buildings.push(b);return b;};
 districts.filter(d=>d.kind==='residential').forEach((d,di)=>{
  const L=(d.end-d.start)*830,center=L/2;
  // Asymmetric clusters: four staggered contour streets, open ends for rural gardens.
  const candidates=[];
  for(let row=0;row<4;row++)for(let j=3;j<23;j++){
   const x=42+j*(L-84)/25+Math.sin(j*2.19+row*1.7+di)*6+[0,14,-11,6][row];
   if(Math.abs(x-center)<28)continue; // open spoke arrival/civic cross-axis
   const z=[-47,-24,22,45][row]+Math.sin(j*.83+row+di)*2;
   const hub=Math.abs(x-center)<185,medium=Math.abs(x-center)<365;
   const inner=row===1||row===2;
   const levels=hub?(inner?7+(j+row)%3:5+(j+row)%2):medium?(inner?4+(j+row)%3:3+(j+row)%2):3;
   const width=22+((j*7+row*3+di)%9),depth=row===0||row===3?13:15;
   const base=hub?(row%2?6:9):medium?(j%3===0?3:0):0;
   candidates.push({x,z,width,depth,levels,base});
  }
  // Match the indoor area budget exactly by varying floor depth, not by claiming
  // facade/window count is population. All shells are measured gross envelopes.
  const target=370000/3,raw=candidates.reduce((s,b)=>s+b.width*b.depth*b.levels,0),setbacks=candidates.reduce((s,b)=>s+b.width*.35*b.levels*(b.levels-1),0),factor=(target+setbacks)/raw;
  for(const b of candidates){const house=add(d,'housing',b.x,b.z,b.width,b.depth*factor,b.levels,b.base);house.setback=.7;house.floorArea=b.width*(house.depth*b.levels-.35*b.levels*(b.levels-1));}
  // Civic rooms occupy open cross-axis courts; services are concentrated at
  // district ends rather than squeezing fake medical buildings into gardens.
  const programs=[['schools',10000/3,3],['hospital',3000/3,1],['assembly',15000/3,1],['shops',23000/3,2],['offices',10000/3,3],['recreation',10000/3,1],['industry',40000/3,2],['storage',50000/3,4],['miscellaneous',29000/3,3],['communications',500/3,1],['water',40000/3,2],['electrical',1000/3,1]];
  // Civic/service precincts are a genuine additional below-plain floor system,
  // not a second overlapping credit on the housing streets. Access is disclosed.
  const cursors=[25,25];
  programs.forEach(([cat,area,levels],i)=>{const row=i%2,depth=28,width=area/levels/depth;add(d,cat,cursors[row]+width/2,row?18:-18,width,depth,levels,-42);cursors[row]+=width+6;});
  for(const side of [-1,1]){
   paths.push({id:`${d.id}-gallery-${side}`,width:4,points:[[d.start+140/830,side*35,.15],[d.start+300/830,side*35,9.24],[d.end-300/830,side*35,9.24],[d.end-140/830,side*35,.15]],supports:true});
   // Hills form the footings of raised urban terraces, not floating greenery.
   hills.push({id:`${d.id}-hill-${side}`,theta:d.center,z:side*46,width:430,depth:28,height:9});
  }
  landmarks.push({id:`${d.id}-garden`,name:['Acacia Gardens','Water Courts','Orchard Village'][di],theta:d.start+110/830,z:0,height:.16,yaw:-90,exactFloor:true},
   {id:`${d.id}-hub`,name:`${d.name} · spoke garden & elevated galleries`,theta:d.center-90/830,z:35,height:9.26,yaw:-90,exactFloor:true},
   {id:`${d.id}-civic`,name:`${d.name} · school, clinic & civic street`,theta:d.start+22/830,z:0,height:-41.76,yaw:-90,exactFloor:true},
   {id:`${d.id}-civic-entry`,name:`${d.name} · civic descent`,theta:d.start+3/830,z:-36,height:0,yaw:-90,exactFloor:true});
 });
 for(const d of districts.filter(d=>d.kind==='agricultural'))landmarks.push({id:`${d.id}-terraces`,name:`${d.name} · sunlight terraces`,theta:d.start+140/830,z:44,height:5,exactFloor:true,yaw:-90});
 return {version:INTERIOR_VERSION,name:'The inhabited garden',districts,buildings,paths,hills,landmarks,sources:interiorSources,limitations:[
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
