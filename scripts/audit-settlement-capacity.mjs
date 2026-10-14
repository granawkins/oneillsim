// Read-only inventories: metres and square metres, no inferred occupancy.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const SOURCE={population:10000,communityProjected:430000,agricultureProjected:200000,mechanicalProjected:40000,availableProjected:678000,communitySurface:980000,agricultureMechanicalSurface:650000,printedTotalSurface:1680000,housingSurface:490000,openSpaceSurface:100000,cropSurface:440000,detailedCropSurface:442000,detailedAnimalSurface:51000};
export function unionArea(rects){
 const xs=[...new Set(rects.flatMap(r=>[r[0],r[1]]))].sort((a,b)=>a-b);let area=0;
 for(let i=1;i<xs.length;i++){const intervals=rects.filter(r=>r[0]<xs[i]&&r[1]>xs[i-1]).map(r=>[r[2],r[3]]).sort((a,b)=>a[0]-b[0]);let length=0,lo=null,hi=null;for(const [a,b] of intervals){if(lo===null){lo=a;hi=b;}else if(a<=hi)hi=Math.max(hi,b);else{length+=hi-lo;lo=a;hi=b;}}if(lo!==null)length+=hi-lo;area+=(xs[i]-xs[i-1])*length;}return area;
}
function subtract(rects,holes){const all=unionArea(rects);const intersections=[];for(const r of rects)for(const h of holes){const q=[Math.max(r[0],h[0]),Math.min(r[1],h[1]),Math.max(r[2],h[2]),Math.min(r[3],h[3])];if(q[1]>q[0]&&q[3]>q[2])intersections.push(q);}return all-unionArea(intersections);}
export function audit(world,manifests={}){
 const decks=world.terraces?.decks||[],stairs=world.terraces?.stairs||[];
 const district=theta=>world.masterPlan?.districts.find(d=>theta>=d.start&&theta<d.end)?.id||'unassigned';
 const rows=(world.masterPlan?.districts||[]).map(d=>({id:d.id,plannedProjectedM2:d.projectedArea,records:0,plotCount:0,sourcePlotCount:0,sourceAllocationCount:0,plotReservationM2:0,plotCategories:{},quantifiedFloorM2:0,housingQuantifiedFloorM2:0,housingInstances:0,explicitDwellingUnits:0,unknownHousingInstances:0,parkReservationM2:0,buildingShellInstances:0}));const by=Object.fromEntries(rows.map(r=>[r.id,r]));const ledger=[];const plotRects=[];
 for(const a of world.assets){const id=a[0],name=world.assetTypes[a[1]],m=manifests[name]||{},meta=a[7]||{},d=meta.districtId||district(a[2]),r=by[d];if(!r)continue;r.records++;const factor=a[4]*(m.objCoordinateScale??.25),sq=factor*factor;let category=m.category||null;
 const p=meta.sourcePlot||m.sourceAllocation;const reservation=m.intrinsicReservation;const isPlot=!!reservation&&name.startsWith('TorusSettlementFarm');let floor=0,park=0,plot=0;
 if(isPlot){r.plotCount++;if(meta.sourcePlot)r.sourcePlotCount++;if(m.sourceAllocation)r.sourceAllocationCount++;category=p?.category||name.replace('TorusSettlementFarm_','').toLowerCase();plot=reservation.width*reservation.depth*sq;r.plotReservationM2+=plot;r.plotCategories[category]=(r.plotCategories[category]||0)+plot;const radius=meta.collisionSupport?.curveRadiusMeters||reservation.radius||830;plotRects.push({district:d,level:meta.deckId||'ground',rect:[a[2]-reservation.width*factor/(2*radius),a[2]+reservation.width*factor/(2*radius),a[3]-reservation.depth*factor/2,a[3]+reservation.depth*factor/2],radius});}
 if(m.floorAllocation){floor=m.floorAllocation.netFloorSquareMeters*sq;r.quantifiedFloorM2+=floor;}
 else if(m.collisionIntent?.floorSurfaces){floor=m.collisionIntent.floorSurfaces.filter(s=>s.tag==='floor').reduce((n,s)=>{const b=s.boundsXZ;return n+(b[1]-b[0])*(b[3]-b[2])*sq;},0);r.quantifiedFloorM2+=floor;}
 const housing=category==='housing'||/^Torus(Home|Apartment|District_Housing)/.test(name);if(housing){r.housingInstances++;r.housingQuantifiedFloorM2+=floor;const units=m.dwellingUnits??m.capacity?.dwellingUnits;if(Number.isFinite(units))r.explicitDwellingUnits+=units;else r.unknownHousingInstances++;}
 if(category==='park'){const dim=m.dimensionsMetres||m;park=(dim.width||0)*(dim.depth||0)*sq;r.parkReservationM2+=park;}
 if(!isPlot&&!floor&&/Home|Apartment|Housing|Commerce|District_(School|Clinic|Hall|Shops|Offices|Workshop|Storage|Recreation|Community)/.test(name))r.buildingShellInstances++;
 ledger.push({id,district:d,asset:name,category:category||'unclassified',plotReservationM2:plot,quantifiedFloorM2:floor,parkReservationM2:park,sourceAreaM2:p?.area??null});
 }
 const surfaces=decks.map(d=>{const radius=830-d.height,rects=d.bands.map(([lo,hi])=>[d.start,d.end,lo,hi]);const holes=stairs.filter(s=>s.upper===d.id).map(s=>[s.start,s.end,s.z-s.width/2,s.z+s.width/2]);return {id:d.id,heightM:d.height,grossM2:unionArea(rects)*radius,netAfterStairHolesM2:subtract(rects,holes)*radius,projectedAtReferenceM2:unionArea(rects)*830};});
 const groups={};for(const p of plotRects){const k=p.district+':'+p.level;(groups[k]??=[]).push(p);}const plotUnions=Object.entries(groups).map(([level,ps])=>({level,intrinsicUnionM2:unionArea(ps.map(p=>p.rect))*ps[0].radius,referenceProjectedUnionM2:unionArea(ps.map(p=>p.rect))*830}));
 const referenceProjectionUnionM2=unionArea(plotRects.map(p=>p.rect))*830;
 const sourceAllocation=(world.settlementDesign?.summaries||[]).flatMap(s=>s.sourceAllocation||[]);
 const neighborhoodClaims=(world.settlementDesign?.summaries||[]).find(s=>s.generator==='settlement-neighborhoods-v1')||null;
 const crops=['sorghum','soybeans','wheat','rice','corn','vegetables'];
 const measuredCropReservationM2=rows.reduce((n,r)=>n+crops.reduce((s,k)=>s+(r.plotCategories[k]||0),0),0);
 const measuredHousingFloorM2=rows.reduce((s,r)=>s+r.housingQuantifiedFloorM2,0);
 const budgetLedger=[{category:'housing',sourceSurfaceM2:SOURCE.housingSurface,measuredM2:measuredHousingFloorM2,unverifiedGapM2:SOURCE.housingSurface-measuredHousingFloorM2,measure:'net modeled slab floor; exterior access excluded'}, {category:'public-open-space',sourceSurfaceM2:SOURCE.openSpaceSurface,measuredM2:rows.reduce((s,r)=>s+r.parkReservationM2,0),measure:'explicit park reservation; unclassified lawns not credited'}, {category:'plant-growing',sourceSurfaceM2:SOURCE.cropSurface,measuredM2:measuredCropReservationM2,unverifiedGapM2:SOURCE.cropSurface-measuredCropReservationM2,measure:'gross crop parcel ceiling, not net crop beds'}];
 const categoryFloorTotals={};for(const e of ledger)categoryFloorTotals[e.category]=(categoryFloorTotals[e.category]||0)+e.quantifiedFloorM2;
 const sourceBudget={shops:23000,offices:10000,schools:10000,hospital:3000,assembly:15000,recreation:10000,industry:40000,storage:50000,miscellaneous:29000};
 for(const [category,sourceSurfaceM2] of Object.entries(sourceBudget))budgetLedger.push({category,sourceSurfaceM2,measuredM2:categoryFloorTotals[category]||0,unverifiedGapM2:sourceSurfaceM2-(categoryFloorTotals[category]||0),measure:'manifest slab floor only; unknown shells not credited'});
 return {categoryFloorTotals,units:'m and m²',source:SOURCE,recordCount:world.assets.length,districts:rows,deckSurfaces:surfaces,plotUnions,referenceProjectionUnionM2,sourceAllocation,neighborhoodClaims,budgetLedger,ledger,limitations:['Floor allocations are net slab after stair holes, not net habitable interiors; wall/circulation deductions unmeasured.','Plot reservations include paths/equipment, not net planted crop area.','Decks, plots, floors and source allocations are nested ledgers; never sum them together.','Stacked plot union is by deck, NOT a disjoint reference ground-projection union.','No occupancy model; unknown shells are not zero capacity and not compliance.']};
}
export function auditFile(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){const bytes=fs.readFileSync(path.join(root,'world.json'));const world=JSON.parse(bytes);const manifests={};for(const name of world.assetTypes){const f=path.join(root,'assets/ultimate-buildings',name+'.asset.json');if(fs.existsSync(f))manifests[name]=JSON.parse(fs.readFileSync(f));}const result=audit(world,manifests);result.worldSha256=createHash('sha256').update(bytes).digest('hex');return result;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(auditFile(process.argv[2]),null,2));
