// Allocation decision: SP-413 Table 5-1's 430,000:240,000 m² ratio.
// Angular proportions are our implementation, not measured from the NASA drawing.
export const settlementRadius=830, tubeRadius=65;
export const residentialAngle=2*Math.PI/3*430/670;
export const agriculturalAngle=2*Math.PI/3-residentialAngle;
export const districts=Array.from({length:3},(_,i)=>{
 const start=i*2*Math.PI/3;
 return [{id:`residential-${'abc'[i]}`,name:`Residential ${'ABC'[i]}`,kind:'residential',start,end:start+residentialAngle,population:i===2?3334:3333},
 {id:`farm-${'abc'[i]}`,name:`Farm ${'ABC'[i]}`,kind:'agricultural',start:start+residentialAngle,end:(i+1)*2*Math.PI/3,population:10000/3}];
}).flat().map(d=>({...d,center:(d.start+d.end)/2,projectedArea:(d.end-d.start)*settlementRadius*130}));
export const settlementPlan={version:1,source:'NASA SP-413 Table 5-1',allocationBasis:{residential:430000,agriculturalAndMechanical:240000},decision:'Distribute the entire modeled ground projection in the ratio 430:240; retain alternating districts.',coordinates:'u is the fraction along a district; z is metres across the tube axis; elevation is metres inward from the 830 m reference radius.',districts};
