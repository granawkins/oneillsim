// Garden Court extension: authored prototype interpretation, not an SP-413 floor plan.
export const residentialKit = [
 {id:'TorusHome_CourtyardA',slug:'houses',name:'Courtyard Home'},
 {id:'TorusHome_RowA',slug:'houses',name:'Row-house Block'},
 {id:'TorusApartment_TerraceA',slug:'apartments',name:'Terrace Apartments'},
];
export const residentialKitIds = residentialKit.map(item=>item.id);
export const residentialPilot = {
 id:'residential-kit-pilot-v1',name:'Garden Court · residential extension',
 districtId:'residential-b',thetaDegrees:150,groundRadius:830,tubeRadius:65,
 originalPlacements:423,minimumAisle:4,
 description:'Twelve ground-level buildings facing the public Garden Court green; six courtyard homes, four row-house blocks, two terrace apartments. Authored interpretation.',
 // Existing court includes model overhangs beyond its placement centres at z=±14.
 existingCourt:{xMin:-37,xMax:37,zMin:-19,zMax:19},
 publicSpace:{xMin:-80,xMax:50,zMin:-20,zMax:20},
 reservations:{TorusHome_CourtyardA:{width:8,depth:8,height:10},TorusHome_RowA:{width:12,depth:8,height:10},TorusApartment_TerraceA:{width:16,depth:12,height:10}},
 plannerQuery:'?capture=1&theta=148.7&z=58&mode=planner&height=45&yaw=0&pitch=-40',
 humanQuery:'?capture=1&theta=149&z=18&yaw=180&pitch=0',
};
export function residentialPlacements(){
 const records=[],center=residentialPilot.thetaDegrees*Math.PI/180;
 const add=(type,x,side)=>records.push({
  id:`residential-kit-${String(records.length+1).padStart(2,'0')}`,type,x,
  theta:center+x/residentialPilot.groundRadius,z:side*(type===residentialKitIds[2]?30:28),scale:4,
  rotation:side>0?Math.PI:0,surface:{height:-.05,deckId:null},
  pilot:residentialPilot.id,reservation:{...residentialPilot.reservations[type]},
 });
 for(const x of [-72,-54,-36])for(const side of [-1,1])add(residentialKitIds[0],x,side);
 for(const x of [-14,8])for(const side of [-1,1])add(residentialKitIds[1],x,side);
 for(const side of [-1,1])add(residentialKitIds[2],40,side);
 return records;
}
export function reservationBounds(p){return {xMin:p.x-p.reservation.width/2,xMax:p.x+p.reservation.width/2,zMin:p.z-p.reservation.depth/2,zMax:p.z+p.reservation.depth/2};}
export function rectanglesOverlap(a,b,gap=0){return a.xMin<b.xMax+gap&&a.xMax+gap>b.xMin&&a.zMin<b.zMax+gap&&a.zMax+gap>b.zMin;}
// The model is tangent to the ground sheet. Include tangent-induced radial sag,
// rather than treating a model's local y as its exact toroidal altitude.
export function fitsTube(p,bounds){
 const c=Math.cos(p.rotation),s=Math.sin(p.rotation);
 for(const x of bounds[0])for(const y of bounds[1])for(const z of bounds[2]){
  const tangent=c*x+s*z,axial=p.z-s*x+c*z;
  const radial=Math.hypot(residentialPilot.groundRadius-y,tangent);
  if(Math.hypot(radial-residentialPilot.groundRadius,axial)>residentialPilot.tubeRadius-1e-6)return false;
 }
 return true;
}
