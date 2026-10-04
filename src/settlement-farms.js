import {farmBlocks, farmDecks, farmAllocations} from './agriculture-plan.js';
import {districts} from './settlement-plan.js';

// SP-413 p98 Tables 5-4/5-5, Appendix C Table 5-18 p115 supply the program,
// not these precise parcel forms or extra B/C quantities. p91 requires lighting
// below the plain. Orchard visitor parks interpret p98's fruit-tree gardens.
const prefix='TorusSettlementFarm_';
const categories=['wheat','sorghum','soybeans','vegetables','corn','rice','fish','greenhouse','orchard','garden','cattle','chickens','rabbits','processing','drying','water'];
const slugFor=category=>({wheat:'grain-crops',sorghum:'grain-crops',corn:'grain-crops',rice:'grain-crops',soybeans:'beans-other-legumes',vegetables:'vegetable-crops',fish:'aquaculture-tanks',greenhouse:'greenhouses',orchard:'fruit-trees',garden:'gardens-parks',cattle:'animal-housing',chickens:'animal-housing',rabbits:'animal-housing',processing:'warehouses',drying:'warehouses',water:'water-treatment'})[category];
const templateId=c=>prefix+c[0].toUpperCase()+c.slice(1);
const aId=id=>prefix+'A'+id.split('-').at(-1).padStart(2,'0');
const descriptor=(id,category,width,depth,height)=>({id,slug:slugFor(category),name:`${category} cultivated landscape · ${id}`,directory:'ultimate-buildings',materialKit:'settlement-farms-v1',textureAtlas:prefix+'Atlas.png',mtl:id+'.mtl',manifest:id+'.asset.json',thumbnail:`/oneillsim/assets/icons/ultimate-buildings/${id}.png`,preview:id+'_Preview.png',width,depth,canonicalHeight:height,scale:4});
export const farmAssets=[...farmBlocks.map(p=>descriptor(aId(p.id),p.category,p.width,p.depth,p.elevation)),...categories.map(c=>descriptor(templateId(c),c,58,['orchard','garden'].includes(c)?12:30,0))];

// Intrinsic metres. The parent collision builder must consume this contract:
// support is existing analytic ground/deck, not solid crop tops. Barn/equipment
// blockers are explicitly separate from ornamental canopy, water and lights.
export function farmCollision(category,width,depth,height) {
 const solids=[];
 if (['processing','drying','chickens','rabbits','cattle','greenhouse'].includes(category)&&width>8) {
  for(const x of [-width*.28,width*.28]) solids.push({name:category==='greenhouse'?'greenhouse-precinct':'shed',x,z:-depth*.23,width:Math.min(width*.35,23)+.2,depth:depth*.31+.2,minHeight:0,maxHeight:category==='processing'?3.85:category==='greenhouse'?3.45:3.15});
  if(category==='processing')for(const x of [-width*.28,width*.28])for(let j=0;j<3;j++)solids.push({name:'collection-crate',x:x+(j-1)*Math.min(2,width*.03),z:depth*.25,width:1.5,depth:1.5,minHeight:0,maxHeight:1.3});
  if(category==='drying')for(let j=0;j<5;j++)for(const x of [-width*.28,width*.28])solids.push({name:'drying-tray',x,z:depth*.17+j*depth*.055,width:Math.min(width*.32,20),depth:Math.max(.2,depth*.025),minHeight:0,maxHeight:.4});
 } else if(category==='water'&&width>12) {
  for(const x of [-width*.28,width*.28]) solids.push({name:'pump-filter',x,z:0,width:Math.min(width*.16,7),depth:Math.min(depth*.3,8),minHeight:0,maxHeight:2.2});
 } else if(['orchard','garden'].includes(category)) {
  for(let j=0;j<12;j++) {const x=(-.38+j%4*.25)*width,z=(-.3+Math.floor(j/4)*.3)*depth;if(Math.abs(x)>Math.min(2.4,width*.2)/2+2)solids.push({name:'tree-trunk',x,z,width:.25,depth:.25,minHeight:0,maxHeight:2.25});}
 }
 return {collisionMode:solids.length?'farm-zoned':'support-only',collisionSupport:{width,depth,curveRadiusMeters:830-height,heightMeters:.05},collisionSolids:solids,collisionIgnoreGroups:['ornament','water','glass','lighting'],collisionIntegration:'Consume curved intrinsic support and explicit solid blockers; never mark barns/pumps noncolliding. Native integration owned by parent/performance worker.'};
}
function placement(id,type,theta,z,width,depth,category,height=0,deckId='ground',sourcePlot=null) {
 return {id,type,theta,z,scale:4,rotation:0,surface:{deckId,height:height-.05,anchorHeight:height,districtId:id.startsWith('farm-a-')?'farm-a':id.includes('-b-')?'farm-b':'farm-c',...farmCollision(category,width,depth,height),...(sourcePlot?{sourcePlot:structuredClone(sourcePlot)}:{})},footprint:{width,depth,category},interpretation:'Authored cultivated landscape; not an operational food-system claim.'};
}
export function buildFarms(world) {
 if(!world||!Array.isArray(world.assets)||!Array.isArray(world.assetTypes)) throw new TypeError('Saved world with assets and assetTypes required');
 const byId=new Map(world.assets.map(a=>[a[0],a]));
 const replacements=farmBlocks.map(plot=>{
  const old=byId.get(plot.id);
  if(!old) throw new Error(`Missing retained source plot ${plot.id}`);
  // Re-running against the already composed candidate retains identical outputs.
  const prior=old[7]?.sourcePlot || old[6];
  if(!prior || prior.category!==plot.category || Math.abs(prior.width-plot.width)>1e-7 || Math.abs(prior.depth-plot.depth)>1e-7 || prior.deckId!==plot.deckId) throw new Error(`Source allocation changed for ${plot.id}`);
  return placement(plot.id,aId(plot.id),old[2],old[3],plot.width,plot.depth,plot.category,plot.elevation,plot.deckId,prior);
 });
 const additions=[],routes=[],landmarks=[];
 const programs={
  b:[['wheat','vegetables'],['soybeans','greenhouse'],['rice','fish'],['sorghum','greenhouse'],['processing','water'],['corn','chickens'],['soybeans','vegetables'],['drying','rabbits']],
  c:[['sorghum','cattle'],['soybeans','rabbits'],['wheat','vegetables'],['processing','water'],['fish','greenhouse'],['corn','cattle'],['drying','chickens'],['soybeans','rice']],
 };
 for(const letter of ['b','c']) {
  const district=districts.find(d=>d.id===`farm-${letter}`),length=(district.end-district.start)*830;
  routes.push({id:`settlement-farm-${letter}-central-walk`,kind:'pedestrian',width:6,deckId:'ground',points:[[district.start,0,0],[district.end,0,0]],support:'existing ground; no objects in z[-7,7]'});
  for(const z of [-41.5,41.5])routes.push({id:`settlement-farm-${letter}-edge-walk-${z<0?'south':'north'}`,kind:'pedestrian',width:2,deckId:'ground',points:[[district.start+6/830,z,0],[district.end-6/830,z,0]],support:'existing ground'});
  for(let bay=0;bay<8;bay++) {
   const theta=district.start+(35+(length-70)*bay/7)/830;
   for(const [side,z] of [['south',-25],['north',25]]) {
    const category=programs[letter][bay][side==='south'?0:1];
    additions.push(placement(`settlement-farm-${letter}-${category}-${side}-${bay+1}`,templateId(category),theta,z,58,30,category));
    const park=letter==='b'&&bay%3===0?'garden':'orchard';
    additions.push(placement(`settlement-farm-${letter}-${park}-${side}-${bay+1}`,templateId(park),theta,z<0?-49:49,58,12,park));
   }
   routes.push({id:`settlement-farm-${letter}-plot-aisle-${bay+1}`,kind:'pedestrian',width:2,deckId:'ground',points:[[theta,-55,0],[theta,0,0],[theta,55,0]],support:'existing ground; exact x=0 cross aisles in all plot assets'});
  }
  landmarks.push({id:`settlement-farm-${letter}-precinct`,name:letter==='b'?'Glasshouse and aquaculture garden':'Orchard and pastoral food gardens',theta:district.center,z:0,height:0});
 }
 for(const deck of farmDecks) {
  const radius=830-deck.height,theta=deck.start+45/radius;
  for(let band=0;band<deck.bands.length;band++) {
   const [min,max]=deck.bands[band];
   routes.push({id:`settlement-farm-a-${deck.id}-apron-${band}`,kind:'pedestrian',width:2,deckId:deck.id,points:[[theta,(min+max)/2,deck.height],[theta,max-1,deck.height],[deck.end-10/radius,max-1,deck.height]],support:'existing farm slab; initial x=45 apron beyond original stair flight and before plot start x=50'});
  }
 }
 const sourceAllocation=farmAllocations.map(({id,name,perPerson,area})=>({id,name,perPerson,area}));
 return {additions,replacements,decks:[],stairs:[],routes,landmarks,summary:{source:'SP-413 p91 prose, p93 Figures 5-8/5-9; p98 Tables 5-4/5-5; Table 3-2 p26; Appendix C Table 5-18 p115',replacedPlots:replacements.length,addedPlots:additions.length,sourceAllocation,preserved:'All Farm A IDs, theta/z, category/area/deck provenance and source allocation; all non-plot samples/exterior records untouched.',groundReservation:'z[-7,7] kept empty; 2m cross aisles and edge routes remain on analytic ground.',netPlanting:'Gross original ledger areas include authored internal lanes; visible planted footprint is smaller. Extra B/C fields and orchard parks are interpretation, not additional sourced allocation.',collisionIntegrationRequired:true,operationalFoodSystem:false}};
}
