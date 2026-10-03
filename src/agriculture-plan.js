// SP-413 Tables 5-4/5-5 (PDF 115) and 3-2 (PDF 43).
export const farmPopulation=10000/3;
export const farmStart=Math.PI/3, farmEnd=2*Math.PI/3;
export const farmAllocations=[
 ['sorghum','Sorghum',3.8,'#cfac61'],['soybeans','Soybeans',23.5,'#81a855'],['wheat','Wheat',7.2,'#d5c084'],['rice','Rice',3.6,'#9dbf87'],['corn','Corn',.9,'#b2c74a'],['vegetables','Vegetables',5.2,'#569969'],
 ['fish','Fish ponds',2.6,'#679eae'],['chickens','Chickens',.8,'#e0b08a'],['rabbits','Rabbits',1.1,'#bdb0a5'],['cattle','Cattle',.6,'#b7967b'],
 ['processing','Processing, collection & storage',4,'#b6a1c1'],['drying','Drying',8,'#d3b47d'],['water','Waste & water treatment',4,'#8eacb9'],
].map(([id,name,perPerson,color])=>({id,name,perPerson,color,area:perPerson*farmPopulation}));
const definition=[
 ['ponds','Ponds & rice',5,[[-63,-48],[48,63]]],
 ['grain','Grain terraces',-10,[[-62,-32],[32,62]]],
 ['gardens','Vegetable & soybean terraces',-25,[[-58,-14],[14,58]]],
 ['livestock','Lower growing & animal deck',-40,[[-48,48]]],
 ['drying','Drying deck',-50,[[-39,39]]],
 ['processing','Processing & storage',-56,[[-30,30]]],
 ['water','Water treatment & pumps',-61,[[-20,20]]],
];
export const farmDecks=definition.map(([id,name,height,bands])=>({id:`farm-a-${id}`,name,height,bands,start:farmStart,end:farmEnd,color:'#777c70'}));
export const farmStairs=farmDecks.slice(0,-1).map((deck,i)=>({id:`farm-stair-${i}`,upper:deck.id,lower:farmDecks[i+1].id,start:farmStart+8/830,end:farmStart+(8+2*(deck.height-farmDecks[i+1].height))/830,z:[50,40,25,0,0,0][i],width:4}));
export const farmTerraces={decks:farmDecks,stairs:farmStairs};
export const farmBlocks=[];
const program=[
 [['fish',2.6*farmPopulation],['rice',3.6*farmPopulation]],
 [['wheat',7.2*farmPopulation],['sorghum',3.8*farmPopulation]],
 [['vegetables',5.2*farmPopulation],['corn',.9*farmPopulation],['soybeans',45000]],
 [['soybeans',23.5*farmPopulation-45000],['chickens',.8*farmPopulation],['rabbits',1.1*farmPopulation],['cattle',.6*farmPopulation]],
 [['drying',8*farmPopulation]],[['processing',4*farmPopulation]],[['water',4*farmPopulation]],
];
for(let i=0;i<farmDecks.length;i++) {
 const deck=farmDecks[i],r=830-deck.height,end=(deck.end-deck.start)*r-10;
 let band=0,x=50;
 for(const [category,total] of program[i]) {
  let remaining=total;
  while(remaining>1e-6) {
   if(band>=deck.bands.length) throw new Error(`Insufficient area on ${deck.id}`);
   const [min,max]=deck.bands[band],depth=max-min-2;
   const available=end-x;
   if(available<.01){band++;x=50;continue;}
   const area=Math.min(remaining,available*depth,70*depth),w=area/depth;
   const source=farmAllocations.find(a=>a.id===category);
   farmBlocks.push({id:`farm-a-plot-${farmBlocks.length+1}`,name:source.name,category,color:source.color,width:w,depth,height:category==='water'?3:category==='processing'?4:category==='drying'?3:category==='fish'?1:category==='cattle'?2:.45,levels:1,deck:0,deckId:deck.id,theta:deck.start+(x+w/2)/r,z:(min+max)/2,elevation:deck.height,area});
   remaining-=area;x+=w;
  }
 }
}
export function farmArea(category){return farmBlocks.filter(b=>b.category===category).reduce((s,b)=>s+b.area,0)}
