import {createCapacityFarmLayers} from './capacity-farm-layers.js';
import {createCapacityResidentialLayers} from './capacity-residential-layers.js';

// Additive source-ledger architecture. Saved editor records remain untouched.
export function createCapacityAssembly({habitatGroup,world,colliderWorld,controller,ground,groundBuilder}){
 if(!world.settlementDesign)return null;
 const runtimes=[],registered=[];let groundRuntime,disposed=false;
 try{
  runtimes.push(createCapacityFarmLayers({habitatGroup,world}));
  runtimes.push(createCapacityResidentialLayers({habitatGroup,world}));
  for(const runtime of runtimes)runtime.group.userData.capacityInterior=true;
  const entries=runtimes.flatMap(r=>r.colliders),ids=new Set();
  for(const p of entries){if(typeof p.id!=='string'||!p.id.startsWith('capacity-')||!p.object?.isObject3D||ids.has(p.id)||colliderWorld.colliders.has(p.id))throw Error('Invalid or occupied capacity collider '+p.id);ids.add(p.id);}
  for(const p of entries){colliderWorld.setObject(p.id,p.object,habitatGroup);registered.push(p.id);}
  if(typeof groundBuilder!=='function')throw Error('Physical clipped ground builder is required for below-plain access');
  groundRuntime=groundBuilder({ground,habitatGroup,plans:runtimes.map(r=>({...r.plan,masterPlan:world.masterPlan})),colliderWorld,controller});
 }catch(error){groundRuntime?.dispose();for(const id of registered)colliderWorld.remove(id);for(const r of runtimes)r.dispose();throw error;}
 const [farms,residential]=runtimes;
 // Runtime views use radians; the existing tour contract uses degrees.
 const landmarks=runtimes.flatMap(r=>r.plan.layerViews).map(p=>({...p,...(['residential-b-ground','residential-c-ground'].includes(p.id)?{z:6,height:.6}:{}),name:p.name+' · '+p.height+' m',yaw:(p.yaw??0)*180/Math.PI,exactFloor:true}));
 const ledger={crop:farms.plan.sourceBudgets,community:residential.plan.sourceBudgets,interiorFloors:residential.plan.floorLedger,parks:residential.plan.publicSpaceMasks,limitations:[...farms.plan.conflicts,...(residential.plan.limitations||[])],fullSourceCompliance:false};
 return {farms,residential,ground:groundRuntime,landmarks,ledger,stats:{farms:farms.stats,residential:residential.stats,ground:groundRuntime.stats,registeredObjects:registered.length},dispose(){if(disposed)return;disposed=true;groundRuntime.dispose();for(const id of registered)colliderWorld.remove(id);for(const r of runtimes)r.dispose();}};
}
