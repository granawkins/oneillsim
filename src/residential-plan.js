import {districts} from './settlement-plan.js';
// District A blockout: dimensions in metres, areas in square metres.
export const population = 3333;
export const radius = 830;
export const length = (districts[0].end-districts[0].start)*radius;
export const width = 130;
export const palette = { housing:'#d9ad73', schools:'#edcf68', hospital:'#ee9292', assembly:'#bba0df', recreation:'#df9ac4', shops:'#ecab62', offices:'#82baca', industry:'#9aabc2', storage:'#a6a0a0', miscellaneous:'#a8b5c3', park:'#639a6c', circulation:'#87969b', trees:'#3a704d', terrace:'#c9b899' };
// Table 3-2, PDF p.43 / printed p.26: keep printed rounding intact.
export const allocations = [
 ['housing','Residential (including exterior access)',49,4,12,3],
 ['shops','Shops',2.3,2,1,4], ['offices','Offices',1,3,.33,4],
 ['schools','Schools',1,3,.3,3.8], ['hospital','Hospital',.3,1,.3,5],
 ['assembly','Assembly halls',1.5,1,1.5,10], ['recreation','Recreation & entertainment',1,1,1,3],
 ['park','Public open space',10,1,10,50], ['industry','Service industry',4,2,2,6],
 ['storage','Storage',5,4,1,3.2], ['circulation','Transportation',12,1,12,6],
 ['communications','Communications',.05,1,.05,4], ['water','Waste & water treatment',4,1,4,4],
 ['electrical','Electrical distribution',.1,1,.1,4], ['miscellaneous','Miscellaneous',2.9,3,1,3.8],
].map(([key,name,surface,levels,projected,height])=>({key,name,surface,levels,projected,height}));
export const residentialDecks=[
 {id:'residential-a-basin',name:'Residential A · garden basin',height:-48,bands:[[-34,34]]},
 {id:'residential-a-middle',name:'Residential A · middle terraces',height:-32,bands:[[-51,-30],[30,51]]},
 {id:'residential-a-outer',name:'Residential A · upper side terraces',height:-12,bands:[[-63,-48],[48,63]]},
 {id:'residential-a-services',name:'Residential A · services',height:-61.5,bands:[[-18,18]]},
].map(d=>({...d,start:districts[0].start,end:districts[0].end,color:'#8e9581'}));
export function createResidentialBlocks() {
 const blocks=[];
 function add(category,name,u,z,w,depth,height,levels,deck){
  const r=radius-deck.height;
  blocks.push({id:`residential-a-${blocks.length+1}`,districtId:'residential-a',u,theta:deck.start+u*(deck.end-deck.start),category,name,x:u*(deck.end-deck.start)*r,z,width:w,depth,height,levels,deck:0,elevation:deck.height,deckId:deck.id,color:palette[category] || '#c9bea1'});
 }
 // 16 five-story + 16 four-story + 16 two-story blocks = 176 floor plates.
 const footprint=37*population/176;
 const rows=[[residentialDecks[0],24,16,5],[residentialDecks[1],43,14,4],[residentialDecks[2],57,10,2]];
 for(const [deck,z,depth,levels] of rows)for(const u of [.05,.15,.25,.35,.65,.75,.85,.95])for(const side of [-1,1])add('housing',`${levels}-story housing`,u,side*z,footprint/depth,depth,3*levels,levels,deck);
 const basin=residentialDecks[0],L=(radius-basin.height)*(basin.end-basin.start);
 const parkDepth=10*population/(L-24);
 for(const side of [-1,1])add('park','Central basin park',.5+side*(L/4+6)/L,0,L/2-12,parkDepth,.12,1,basin);
 // Civic buildings flank the arrival plaza on the middle shelves.
 const middle=residentialDecks[1];
 for(const side of [-1,1]) {
  add('schools','School wing',.43,side*43,population/3/2/14,14,11.4,3,middle);
  add('hospital','Clinic wing',.57,side*43,.3*population/2/14,14,5,1,middle);
  for(const u of [.48,.52])add('assembly','Assembly hall',u===.48?.44:.56,side*24,1.5*population/4/16,16,10,1,basin);
 }
 // Allocate usable exterior and circulation surfaces from genuinely free shelf rectangles.
 // Subdivision by obstacle edges makes the ledger auditable and avoids overlapping credits.
 const free=[];
 for(const deck of residentialDecks.slice(0,3)) {
  const r=radius-deck.height,span=(deck.end-deck.start)*r;
  const occupied=blocks.filter(b=>b.deckId===deck.id).map(b=>({x:b.u*span-b.width/2,y:b.z-b.depth/2,w:b.width,h:b.depth}));
  if(deck===basin)occupied.push({x:span/2-12,y:-12,w:24,h:24});
  for(const [lo,hi] of deck.bands) {
   const xs=[...new Set([0,span,...occupied.flatMap(b=>[b.x,b.x+b.w]).filter(x=>x>0&&x<span)])].sort((a,b)=>a-b);
   const zs=[...new Set([lo,hi,...occupied.flatMap(b=>[b.y,b.y+b.h]).filter(z=>z>lo&&z<hi)])].sort((a,b)=>a-b);
   for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
    const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2;
    if(!occupied.some(b=>x>b.x&&x<b.x+b.w&&z>b.y&&z<b.y+b.h))free.push({deck,x:xs[i],z:zs[j],w:xs[i+1]-xs[i],d:zs[j+1]-zs[j],span});
   }
  }
 }
 free.sort((a,b)=>b.w*b.d-a.w*a.d);
 for(const category of ['circulation','terrace']) {
  let remaining=12*population;
  while(remaining>1e-6){
   const cell=free.shift();if(!cell)throw new Error('Residential shelf area exhausted');
   const area=Math.min(remaining,cell.w*cell.d),w=area/cell.d;
   add(category,category==='terrace'?'Shared residential exterior/access reserve':'Circulation reserve',(cell.x+w/2)/cell.span,cell.z+cell.d/2,w,cell.d,.06,1,cell.deck);
   if(cell.w-w>1e-6)free.unshift({...cell,x:cell.x+w,w:cell.w-w});
   remaining-=area;
  }
 }
 const services=[['shops',2.3,2,4],['offices',1,3,4],['industry',4,2,6],['storage',5,4,3.2],['recreation',1,1,3],['miscellaneous',2.9,3,3.8]];
 const serviceDeck=residentialDecks[3],serviceLength=(radius-serviceDeck.height)*(serviceDeck.end-serviceDeck.start);let x=30;
 for(const [category,area,levels,storey] of services){const w=area*population/levels/30;add(category,`${category} · service deck`,(x+w/2)/serviceLength,0,w,30,storey*levels,levels,serviceDeck);x+=w+8;}
 for(let i=0;i<28;i++)for(const side of [-1,1])add('trees','Fruit-tree canopy',.02+i*.96/27,side*9,3,3,4,1,basin);
 return blocks;
}
export const blocks=createResidentialBlocks();
export function totals(category) {
 const selected=blocks.filter(b=>b.category===category);
 return {footprint:selected.reduce((n,b)=>n+b.width*b.depth,0),floor:selected.reduce((n,b)=>n+b.width*b.depth*b.levels,0)};
}
