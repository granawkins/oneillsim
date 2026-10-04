// Curated streetscape kit; dimensions/layout are authored interpretation,
// not furniture specifications claimed from NASA SP-413.
export const streetKit = [
 {id:'TorusBench_A',slug:'benches',name:'Frame bench'},
 {id:'TorusTable_A',slug:'tables',name:'Community table'},
 {id:'TorusPlanter_A',slug:'planters',name:'Garden planter'},
 {id:'TorusRailing_A',slug:'fences-railings',name:'Terrace railing'},
 {id:'TorusSign_A',slug:'signs',name:'Neighborhood sign'},
 {id:'TorusWasteBin_A',slug:'waste-bins',name:'Sorting bin'},
];
export const streetKitIds=streetKit.map(item=>item.id);
export const streetPilot={
 id:'street-kit-pilot-v1',name:'Garden Court · street furniture pilot',
 thetaDegrees:150,groundRadius:830,
 description:'A small authored court on the undeveloped Residential B ground: six existing terrace homes plus the complete six-type prop kit. Not a sourced historical floor plan.',
};
export function streetPilotPlacements(){
 const records=[];const center=streetPilot.thetaDegrees*Math.PI/180;
 const add=(type,x,z,rotation=0)=>records.push({id:`street-pilot-${String(records.length+1).padStart(2,'0')}`,type,
  theta:center+x/streetPilot.groundRadius,z,scale:4,rotation,
  // The placement adapter applies a 0.05m inward offset on nonzero elevations;
  // compensate it here so the authored feet are at the ground sheet, not floating.
  surface:{height:-.05,deckId:null},pilot:streetPilot.id,x});
 for(const x of [-20,0,20])for(const side of [-1,1])add('TorusHome_ModA',x,side*14,side>0?Math.PI:0);
 for(const x of [-20,0,20]){
  add('TorusTable_A',x,0);
  add('TorusBench_A',x,-2.5);add('TorusBench_A',x,2.5,Math.PI);
  add('TorusWasteBin_A',x,6.5);
 }
 add('TorusBench_A',-29,0,Math.PI/2);add('TorusBench_A',29,0,-Math.PI/2);
 for(const x of [-28,-10,10,28])for(const side of [-1,1])add('TorusPlanter_A',x,side*6);
 for(const x of [-20,0,20])for(const side of [-1,1])add('TorusRailing_A',x,side*8);
 add('TorusSign_A',-33,5,Math.PI/2);add('TorusSign_A',33,5,-Math.PI/2);
 return records;
}
