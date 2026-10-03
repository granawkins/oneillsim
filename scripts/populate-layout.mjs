import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {districts,settlementPlan} from '../src/settlement-plan.js';
import {blocks,residentialDecks} from '../src/residential-plan.js';
import {farmBlocks,farmTerraces} from '../src/agriculture-plan.js';
const world=JSON.parse(readFileSync('world.json','utf8'));
copyFileSync('world.json',`/tmp/oneillsim-before-sector-layout-${Date.now()}.json`);
// Replace generated plans; preserve and remap other user placements by their district fraction.
world.assets=world.assets.filter(a=>!a[0].startsWith('residential-a-')&&!a[0].startsWith('farm-a-')&&!a[0].startsWith('spoke-'));
const old=world.masterPlan?.districts || Array.from({length:6},(_,i)=>({start:i*Math.PI/3,end:(i+1)*Math.PI/3}));
for(const a of world.assets){const theta=(a[2]+2*Math.PI)%(2*Math.PI),i=old.findIndex(d=>theta>=d.start&&theta<d.end);if(i>=0)a[2]=districts[i].start+(theta-old[i].start)/(old[i].end-old[i].start)*(districts[i].end-districts[i].start);}
function put(typeName,b){let type=world.assetTypes.indexOf(typeName);if(type<0)type=world.assetTypes.push(typeName)-1;world.assets.push([b.id,type,b.theta,b.z,1,0,b,{height:b.elevation,deckId:b.deckId}]);}
blocks.forEach(b=>put('ResidentialBlockout',b));farmBlocks.forEach(b=>put('AgriculturalBlockout',{...b,districtId:'farm-a',u:(b.theta-districts[1].start)/(districts[1].end-districts[1].start)}));
const landingDecks=[];
for(const d of districts){
 const height=d.id==='residential-a'?-48:d.id==='farm-a'?5:0;
 const deckId=d.id==='residential-a'?'residential-a-basin':`spoke-${d.id}`;
 if(d.id!=='residential-a')landingDecks.push({id:deckId,name:`${d.name} · spoke landing`,height,bands:[[-12,12]],start:d.center-12/(830-height),end:d.center+12/(830-height),color:'#b584b9',cutGround:false});
 put('SpokePlaceholder',{id:`spoke-${d.id}-platform`,name:`${d.name} spoke landing`,districtId:d.id,u:.5,theta:d.center,z:0,width:24,depth:24,height:.3,elevation:height,deckId,deck:0,levels:1,color:'#b584b9'});
 put('SpokePlaceholder',{id:`spoke-${d.id}-marker`,name:`${d.name} spoke axis marker`,districtId:d.id,u:.5,theta:d.center,z:0,width:2,depth:2,height:20,elevation:height,deckId,deck:0,levels:1,color:'#ebc8f2'});
}
world.terraces={decks:[...residentialDecks,...farmTerraces.decks,...landingDecks],stairs:farmTerraces.stairs};
world.masterPlan=settlementPlan;
world.grid=world.grid.map((row,r)=>row.map((value,c)=>{const theta=(c+.5)/row.length*2*Math.PI;const d=districts.find(d=>theta>=d.start&&theta<d.end);return r===0?2:d.kind==='agricultural'?1:0;}));
writeFileSync('world.json',JSON.stringify(world));
console.log(`${world.assets.length} assets; six district boundaries and landings recorded.`);
