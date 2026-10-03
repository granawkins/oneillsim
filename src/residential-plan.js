// District A blockout: dimensions in metres, areas in square metres.
export const population = 3333;
export const radius = 830;
export const length = 2 * Math.PI * radius / 6;
export const width = 130;
export const palette = { housing:'#d9ad73', schools:'#edcf68', hospital:'#ee9292', assembly:'#bba0df', recreation:'#df9ac4', shops:'#ecab62', offices:'#82baca', industry:'#9aabc2', storage:'#a6a0a0', miscellaneous:'#a8b5c3', park:'#639a6c', circulation:'#87969b', trees:'#3a704d' };
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
export function createResidentialBlocks() {
 const blocks=[];
 const add=(category,name,x,z,w,d,h,levels=1,deck=0)=>{
  blocks.push({id:`residential-a-${blocks.length+1}`,category,name,x,z,width:w,depth:d,height:h,levels,deck,color:palette[category] || '#91a5aa'});
 };
 // Forty multi-dwelling blocks. 4×2 + 12×4 + 24×5 = 176 occupied floor plates.
 const footprint=37*population/176;
 let home=0;
 for(let column=0;column<24;column++) for(const side of [-1,1]) {
  const x=(column+.5)*length/24;
  if(column>=10 && column<=13) {
   const category=column===10?'schools':column===13?'hospital':'assembly';
   const area=category==='schools'?population/3/2:category==='hospital'?.3*population/2:1.5*population/8;
   const levels=category==='schools'?3:1;
   add(category,`${category} ${side===-1?'south':'north'} ${column}`,x,side*38.5,32,area/32,levels*(category==='schools'?3.8:category==='hospital'?5:10),levels);
  } else {
   const levels=home<4?2:home<16?4:5;
   add('housing',`Housing block ${++home} · ${levels} floors`,x,side*38.5,32,footprint/32,levels*3,levels);
  }
 }
 const parkDepth=10*population/(length-20);
 add('park','Central linear park',length/2,0,length-20,parkDepth,.12);
 // Narrow separated strips bend to the ground; all unused surface remains circulation/reserve.
 for(const side of [-1,1]) add('circulation','Ring transport corridor',length/2,side*57,length,15,.08);
 for(const side of [-1,1]) add('circulation','Pedestrian promenade',length/2,side*24,length,7,.09);
 const crossWidth=(12*population-length*44)/(24*22);
 for(let i=0;i<12;i++) for(const side of [-1,1]) add('circulation','Local connecting path',(2*i+1)*length/24,side*38.5,crossWidth,22,.09);
 // Below-deck service parcels share the district projection. Their placement is conceptual.
 const services=[['shops',2.3,2,4],['offices',1,3,4],['industry',4,2,6],['storage',5,4,3.2],['recreation',1,1,3],['assembly',.75,1,10],['miscellaneous',2.9,3,3.8]];
 services.forEach(([category,area,levels,storey],i)=>add(category,`${category} · lower deck`,65+i*120,0,90,area*population/levels/90,storey*levels,levels,-16));
 for(let i=0;i<28;i++) for(const side of [-1,1]) add('trees','Fruit-tree canopy placeholder',20+i*(length-40)/27,side*13,3,3,4);
 return blocks;
}
export const blocks=createResidentialBlocks();
export function totals(category) {
 const selected=blocks.filter(b=>b.category===category);
 return {footprint:selected.reduce((n,b)=>n+b.width*b.depth,0),floor:selected.reduce((n,b)=>n+b.width*b.depth*b.levels,0)};
}
