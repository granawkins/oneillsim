import {blocks as reservations} from './residential-plan.js';

// No migration marker: persisted type identity plus null blockout is the marker.
// The reservation ledger remains untouched and authoritative after migration.
export const districtBuildingIds = ['Housing5A','Housing4A','Housing2A','SchoolA','ClinicA','HallA','ShopsA','OfficesA','WorkshopA','StorageA','RecreationA','CommunityA'].map(s=>'TorusDistrict_'+s);
export const districtTargetIds = Object.freeze(reservations.map(b=>b.id));
export const districtCapture = Object.freeze({
 plannerQuery:'?capture=1&theta=38&z=0&mode=planner&height=70&yaw=-90&pitch=-65',
 humanQuery:'?capture=1&theta=38&z=0&mode=human&yaw=90&pitch=0',
 // Human capture presets currently ignore elevation. Browser QA sets the eye on
 // the -48 m basin explicitly after readiness, without changing camera parsing.
 humanElevation:-48
});
const ledger=new Map(reservations.map(b=>[b.id,b]));
const buildingByCategory={schools:'SchoolA',hospital:'ClinicA',assembly:'HallA',shops:'ShopsA',offices:'OfficesA',industry:'WorkshopA',storage:'StorageA',recreation:'RecreationA',miscellaneous:'CommunityA'};
export function guard(condition,message){if(!condition)throw new Error(message);}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-7;
export function validateDescriptors(buildings,landscape){
 guard(Array.isArray(buildings)&&Array.isArray(landscape),'Both descriptor contracts must be arrays');
 const byParcel=new Map(),byAsset=new Map();
 for(const [group,descriptors] of [['building',buildings],['landscape',landscape]])for(const d of descriptors){
  guard(d&&typeof d==='object','Invalid descriptor');
  guard(typeof d.assetId==='string'&&!byAsset.has(d.assetId),'Duplicate/invalid asset descriptor: '+d.assetId);
  guard(group==='building'?districtBuildingIds.includes(d.assetId):/^TorusDistrict_(ParkA|TreeA|Path\d+|Terrace\d+)$/.test(d.assetId),'Unexpected '+group+' asset: '+d.assetId);
  guard(Array.isArray(d.parcelIds)&&d.parcelIds.length>0,'Empty parcelIds: '+d.assetId);
  guard(typeof d.textureAtlas==='string'&&/^[A-Za-z0-9_-]+\.png$/.test(d.textureAtlas),'Invalid textureAtlas: '+d.assetId);
  for(const key of ['width','depth','height','levels'])guard(Number.isFinite(d[key])&&d[key]>0,'Invalid '+key+': '+d.assetId);
  guard(Number.isInteger(d.levels)&&Number.isFinite(d.elevation),'Invalid levels/elevation: '+d.assetId);
  for(const id of d.parcelIds){
   const b=ledger.get(id);guard(b,'Extraneous parcel ID: '+id);guard(!byParcel.has(id),'Duplicate parcel coverage: '+id);
   const expected=b.category==='housing'?'Housing'+b.levels+'A':buildingByCategory[b.category];
   guard(expected?group==='building'&&d.assetId==='TorusDistrict_'+expected:group==='landscape'&&(b.category==='park'?d.assetId==='TorusDistrict_ParkA':b.category==='trees'?d.assetId==='TorusDistrict_TreeA':b.category==='circulation'?/^TorusDistrict_Path\d+$/.test(d.assetId):/^TorusDistrict_Terrace\d+$/.test(d.assetId)),'Category/type mismatch: '+id);
   guard(d.category===b.category,'Category mismatch: '+id);
   for(const key of ['width','depth','height','levels','elevation'])guard(near(d[key],b[key]),'Reservation '+key+' mismatch: '+id);
   byParcel.set(id,d);
  }
  byAsset.set(d.assetId,d);
 }
 guard(districtBuildingIds.every(id=>byAsset.has(id)),'All twelve building variants required');
 guard(byParcel.size===297&&districtTargetIds.every(id=>byParcel.has(id)),'Incomplete 297 target coverage');
 return {byParcel,byAsset};
}
export function candidateWorld(world,buildings,landscape){
 const contract=validateDescriptors(buildings,landscape);
 guard(world&&Array.isArray(world.assets)&&Array.isArray(world.assetTypes),'Compact world required');
 guard(world.assets.length===435,'Expected 435 saved records');
 guard(new Set(world.assetTypes).size===world.assetTypes.length,'Duplicate type index');
 guard(new Set(world.assets.map(a=>a[0])).size===world.assets.length,'Duplicate saved ID');
 const targets=world.assets.filter(a=>ledger.has(a[0]));
 guard(targets.length===297&&world.assets.filter(a=>!ledger.has(a[0])).length===138,'Expected 297 targets and 138 preserved records');
 for(const a of world.assets){
  guard(Array.isArray(a)&&Number.isInteger(a[1])&&typeof world.assetTypes[a[1]]==='string','Invalid existing type index');
  guard(!String(a[0]).startsWith('residential-a-')||ledger.has(a[0]),'Extraneous residential target: '+a[0]);
 }
 const types=[...world.assetTypes];for(const id of contract.byAsset.keys())if(!types.includes(id))types.push(id);
 let replaced=0,alreadyReplaced=0;
 const assets=world.assets.map(a=>{
  const b=ledger.get(a[0]);if(!b)return a;
  const d=contract.byParcel.get(a[0]);
  guard(near(a[2],b.theta)&&near(a[3],b.z)&&Number.isFinite(a[5]),'Conflicting target position/rotation: '+a[0]);
  guard(a[7]&&near(a[7].height,b.elevation)&&a[7].deckId===b.deckId,'Conflicting target surface: '+a[0]);
  if(a[6]===null){
   guard(world.assetTypes[a[1]]===d.assetId&&a[4]===4,'Conflicting already-replaced model: '+a[0]);alreadyReplaced++;return a;
  }
  guard(same(a[6],b),'Conflicting original reservation metadata: '+a[0]);
  guard(!world.assetTypes[a[1]].startsWith('TorusDistrict_'),'Curated model still carries blockout: '+a[0]);
  const next=[...a];next[1]=types.indexOf(d.assetId);next[4]=4;next[6]=null;replaced++;return next;
 });
 return {next:{...world,assetTypes:types,assets},replaced,alreadyReplaced,contract};
}
export function verifyPreservation(before,after,buildings,landscape){
 const expected=candidateWorld(before,buildings,landscape).next;
 guard(same(after,expected),'Candidate changes outside authorized replacement');
 guard(same(candidateWorld(after,buildings,landscape).next,after),'Candidate is not idempotent');
 return true;
}
// Use actual curved OBJ vertices, not tangent-plane AABB corners. Placement uses
// a 5 cm deck offset. Verify angular footprint, intrinsic elevation, and the
// toroidal tube cross-section for every point at each preserved rotation/z.
export function validateCurvedVertices(descriptor,vertices,world,intrinsicEnvelope=null){
 guard(vertices.length>0,'Empty model: '+descriptor.assetId);
 const r=830-descriptor.elevation,maxHeight=intrinsicEnvelope?.[1]?.[1]??descriptor.height;
 if(intrinsicEnvelope){
  guard(intrinsicEnvelope.length===3&&intrinsicEnvelope.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[1]>=p[0]),'Invalid intrinsic envelope');
  guard(intrinsicEnvelope[0][0]>=-descriptor.width/2-.001&&intrinsicEnvelope[0][1]<=descriptor.width/2+.001&&intrinsicEnvelope[2][0]>=-descriptor.depth/2-.001&&intrinsicEnvelope[2][1]<=descriptor.depth/2+.001&&intrinsicEnvelope[1][0]>=-.001,'Advertised intrinsic envelope outside parcel');
 }
 for(const id of descriptor.parcelIds){
  const a=world.assets.find(a=>a[0]===id);guard(a,'Missing placement: '+id);
  const c=Math.cos(a[5]),s=Math.sin(a[5]);
  for(const v of vertices){
   const x=c*v[0]+s*v[2],y=v[1],z=-s*v[0]+c*v[2];
   const radial=Math.hypot(x,r-.05-y),modelRadial=Math.hypot(x,r-y),intrinsic=r-modelRadial,arc=Math.atan2(x,r-y)*r;
   guard(Math.abs(arc)<=descriptor.width/2+.001&&Math.abs(z)<=descriptor.depth/2+.001,'Actual curved footprint outside reservation: '+id);
   guard(intrinsic>=-.001&&intrinsic<=maxHeight+.001,'Actual intrinsic height outside reservation: '+id);
   if(intrinsicEnvelope)for(const [k,n] of [arc,intrinsic,z].entries())guard(n>=intrinsicEnvelope[k][0]-.001&&n<=intrinsicEnvelope[k][1]+.001,'Actual vertex outside advertised intrinsic envelope: '+id);
   guard(Math.hypot(radial-830,a[3]+z)<=65+.001,'Actual model outside tube: '+id);
  }
 }
}
