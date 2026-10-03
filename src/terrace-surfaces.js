// Analytic walk/placement surfaces, in habitat-local angular coordinates.
let terraces={decks:[],stairs:[]};
export let selectedDeckId=null;
export function configureTerraces(value){terraces=value || {decks:[],stairs:[]};selectedDeckId=null;}
export function getTerraces(){return terraces;}
export function selectDeck(id){selectedDeckId=id || null;}
export function normalizedTheta(theta){return (theta%(2*Math.PI)+2*Math.PI)%(2*Math.PI);}
export function inTerraceSector(theta){theta=normalizedTheta(theta);return terraces.decks.some(d=>d.cutGround!==false&&theta>=d.start&&theta<d.end);}
export function stairContains(s,theta,z){return theta>=s.start&&theta<=s.end&&Math.abs(z-s.z)<=s.width/2;}
export function deckContains(d,theta,z){return theta>=d.start&&theta<=d.end&&d.bands.some(([a,b])=>z>=a&&z<=b)&&!terraces.stairs.some(s=>s.upper===d.id&&stairContains(s,theta,z));}
export function supportAt(theta,z,maxHeight=Infinity){
 theta=normalizedTheta(theta);const candidates=[];
 if(!inTerraceSector(theta)&&Math.abs(z)<=65)candidates.push({height:0,deckId:null});
 for(const d of terraces.decks)if(deckContains(d,theta,z))candidates.push({height:d.height,deckId:d.id});
 for(const s of terraces.stairs)if(stairContains(s,theta,z)){
  const upper=terraces.decks.find(d=>d.id===s.upper),lower=terraces.decks.find(d=>d.id===s.lower);
  candidates.push({height:upper.height+(lower.height-upper.height)*(theta-s.start)/(s.end-s.start),deckId:s.upper,stairId:s.id});
 }
 return candidates.filter(s=>s.height<=maxHeight+1e-6).sort((a,b)=>b.height-a.height)[0] || null;
}
export function walkStep(theta,z,previousHeight){
 const support=supportAt(theta,z,previousHeight+.4);
 return support&&Math.abs(support.height-previousHeight)<=.4?support:null;
}
