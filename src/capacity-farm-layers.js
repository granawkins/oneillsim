import * as THREE from 'three';

// All dimensions below are authored interpretation; source quantities are kept separate.
export const FARM_LAYER_SOURCE = Object.freeze({
  population: 10000, radius: 830, tubeRadius: 65,
  printed94: { agricultureMechanicalSurfaceM2: 650000, communitySurfaceM2: 980000,
    printedTotalSurfaceM2: 1680000, categorySumSurfaceM2: 1630000, unresolvedDifferenceM2: 50000 },
  roundedTable32: { cropM2: 440000, animalsM2: 50000, processingM2: 40000, dryingM2: 80000, waterM2: 40000 },
  detailedTable54: { cropM2: 442000, sorghum: 38000, soybeans: 235000, wheat: 72000,
    rice: 36000, corn: 9000, vegetables: 52000 },
  detailedTable55: { animalsM2: 51000 },
  references: ['SP-413 p94 Table5-1 sp413-s02289', 'p98 Table5-4 sp413-s02395',
    'p98 Table5-5 sp413-s02393', 'p93 Figures5-8/5-9', 'p26 Table3-2'],
});
const CROPS = ['sorghum', 'soybeans', 'wheat', 'rice', 'corn', 'vegetables'];
const COLORS = { sorghum: '#b79251', soybeans: '#729354', wheat: '#d5b55a', rice: '#8caf78',
  corn: '#a2ae58', vegetables: '#3c875e', animals: '#a49377', feed: '#bbb071', processing: '#99aca3', drying: '#ccbc8a', water: '#519ba8' };
const area = r => (r[1] - r[0]) * (r[3] - r[2]);
const intersect = (a,b) => [Math.max(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.min(a[3],b[3])];
const positive = r => r[1] > r[0] && r[3] > r[2];
// Exact disjoint rectangular subtraction, not a percentage estimate or summed overlaps.
export function subtractFarmMasks(rects, holes) {
  let result = rects.map(r => [...r]);
  for (const h of holes) result = result.flatMap(r => {
    const q = intersect(r,h); if (!positive(q)) return [r];
    return [[r[0],q[0],r[2],r[3]],[q[1],r[1],r[2],r[3]],
      [q[0],q[1],r[2],q[2]],[q[0],q[1],q[3],r[3]]].filter(positive);
  });
  return result;
}
export function farmOpeningContains(opening, theta, z) {
  theta = (theta % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
  return theta >= opening.thetaStart && theta <= opening.thetaEnd && z >= opening.zMin && z <= opening.zMax;
}
const rectOf = p => [p.thetaStart,p.thetaEnd,p.zMin,p.zMax];
const mask = (id, r, height, extra={}) => ({id,thetaStart:r[0],thetaEnd:r[1],zMin:r[2],zMax:r[3],height,...extra});

// Reconstruct the checked-in generator's horizontal bed footprints, not its gross parcels.
// This is a geometric lower-bound ledger, NOT operational/yield certification.
export function extractExistingFarmBedMasks(world) {
  const districts={},bedMasks=[],unknownIds=[],overlaps=[],maskGroups=new Map();
  for(const id of ['farm-a','farm-b','farm-c'])districts[id]={netCropFootprintM2:0,grossKnownCropM2:0,grossAllUsesM2:0,plotInstances:0,categoryAreasM2:{},verifiedInstances:0};
  for(const a of world?.assets||[]) {
    const type=world.assetTypes?.[a[1]]||'',meta=a[7]||{},source=meta.sourcePlot;
    if(!type.startsWith('TorusSettlementFarm_'))continue;
    const category=source?.category||type.slice('TorusSettlementFarm_'.length).toLowerCase();
    const districtId=meta.districtId,row=districts[districtId],support=meta.collisionSupport;
    if(row){row.plotInstances++;if(Number.isFinite(support?.width)&&Number.isFinite(support?.depth))row.grossAllUsesM2+=support.width*support.depth*(a[4]/4)**2;}
    if(!CROPS.includes(category))continue;
    // Only the delivered zero-yaw, canonical scale, explicit supported generator contract.
    if(!row||a[4]!==4||a[5]!==0||!support||!Number.isFinite(support.width)||!Number.isFinite(support.depth)
      ||!Number.isFinite(support.curveRadiusMeters)||support.width<=0||support.depth<=0
      ||source&&(source.width!==support.width||source.depth!==support.depth)) {unknownIds.push(a[0]);continue;}
    const w=support.width,d=support.depth,r=support.curveRadiusMeters,margin=Math.min(1.4,w*.15,d*.15),aisle=Math.min(2.4,w*.2);
    const height=meta.anchorHeight,deckId=meta.deckId||'ground';
    if(!Number.isFinite(height)||r!==830-height){unknownIds.push(a[0]);continue;}
    const rows=category==='rice'?3:Math.min(14,Math.max(2,Math.floor(d/2)));
    const xs=category==='rice'?[[-w/2+margin,-aisle/2-.2],[aisle/2+.2,w/2-margin]]:
      [[-w/2+margin,-aisle/2-.1],[aisle/2+.1,w/2-margin]];
    let serial=0;row.grossKnownCropM2+=w*d;row.verifiedInstances++;
    for(let j=0;j<rows;j++) {
      const z0=-d/2+margin+j*(d-2*margin)/rows+(category==='rice'?.2:0);
      const z1=category==='rice'? -d/2+margin+(j+1)*(d-2*margin)/3-.65-.3:
        z0+(d-2*margin)/rows*.68;
      for(const [x0,x1] of xs)if(x1>x0&&z1>z0){
        const p=mask(`${a[0]}-existing-bed-${serial++}`,[a[2]+x0/r,a[2]+x1/r,a[3]+z0,a[3]+z1],height,
          {sourceAssetId:a[0],districtId,deckId,category,kind:'existing-crop-bed',radius:r,netAreaM2:(x1-x0)*(z1-z0)});
        const q=rectOf(p),key=districtId+':'+deckId;
        if(!maskGroups.has(key))maskGroups.set(key,[]);
        const group=maskGroups.get(key),prior=group.filter(b=>positive(intersect(q,rectOf(b))));
        for(const b of prior){const intersection=intersect(q,rectOf(b));if(positive(intersection))overlaps.push({a:p.id,b:b.id,areaM2:area(intersection)*r});}
        // Union credit; overlap is subtracted exactly once even if instances ever collide.
        const credit=subtractFarmMasks([q],prior.map(rectOf)).reduce((s,b)=>s+area(b)*r,0);
        row.netCropFootprintM2+=credit;row.categoryAreasM2[category]=(row.categoryAreasM2[category]||0)+credit;
        bedMasks.push(p);group.push(p);
      }
    }
  }
  return {districts,bedMasks,unknownIds,overlaps,measure:'Exact horizontal generator bed footprint union, no canopy slope, gross parcel or operational credit',
    generator:'assets/scripts/build_settlement_farm_landscape.py lines125-132 and175-180',
    complianceCertified:false};
}

export function planCapacityFarmLayers(world) {
  const plan = {decks:[],stairs:[],patches:[],routes:[],groundOpenings:[],layerViews:[],
    summary:{districts:[],compliant:false},conflicts:[],sourceBudgets:JSON.parse(JSON.stringify(FARM_LAYER_SOURCE))};
  plan.existingBedLedger=extractExistingFarmBedMasks(world);
  if(plan.existingBedLedger.unknownIds.length||plan.existingBedLedger.overlaps.length)
    plan.conflicts.push({code:'existing-bed-mask-unknown-or-overlap',unknownIds:plan.existingBedLedger.unknownIds,overlaps:plan.existingBedLedger.overlaps});
  const remainingCropAreas=CROPS.map(k=>Math.max(0,FARM_LAYER_SOURCE.detailedTable54[k]-
    Object.values(plan.existingBedLedger.districts).reduce((s,d)=>s+(d.categoryAreasM2[k]||0),0)));
  const remainingCropTotal=remainingCropAreas.reduce((s,n)=>s+n,0);
  const cropFractions=remainingCropTotal>0?remainingCropAreas.map(n=>n/remainingCropTotal):CROPS.map(k=>FARM_LAYER_SOURCE.detailedTable54[k]/442000);
  plan.sourceBudgets.newCropAllocationBasis='Detailed crop-by-crop remaining net deficit after independently verified existing bed masks, with proportional declared reserve';
  for (const districtId of ['farm-b','farm-c']) {
    const sector = world?.masterPlan?.districts?.find(d=>d.id===districtId);
    if (!sector || !Number.isFinite(sector.start) || !Number.isFinite(sector.end) || sector.end<=sector.start) {
      plan.conflicts.push({districtId,code:'missing-masterplan-sector'}); continue;
    }
    const prefix = `capacity-${districtId}`, center = (sector.start+sector.end)/2;
    const ds = [-10,-25,-40].map((height,i) => {
      const radius = 830-height, halfWidth = Math.sqrt(65**2-(height-.4)**2)-.35;
      const d = {id:`${prefix}-level-${i+1}`,districtId,name:`${districtId.toUpperCase()} · productive ${i+1}`,
        height,radius,start:sector.start+1/radius,end:sector.end-1/radius,
        bands:[[-halfWidth,halfWidth]],halfWidth,thickness:.4,cutGround:false,holes:[],floorMasks:[]};
      plan.decks.push(d); plan.layerViews.push({id:d.id,name:d.name,theta:center-100/radius,z:0,height,yaw:Math.PI/2});
      return d;
    });
    // Clear the actual promenade's z=6 spoke bypass, which returns to z=0
    // only 35 m from each spoke. The narrow entry must not sit under its paving.
    const links = [[0,-10,45,ds[0]],[-10,-25,85,ds[1]],[-25,-40,135,ds[2]]];
    links.forEach(([upperHeight,lowerHeight,x,lower],i)=>{
      const upper = i===0 ? null : ds[i-1], radius = 830-upperHeight;
      const steps = Math.round((upperHeight-lowerHeight)/.125), length=steps*.3;
      const start = center+x/radius, end=start+length/radius, z=6.5, width=4;
      const s={id:`${prefix}-stair-${i+1}`,districtId,upper:upper?.id||'ground',lower:lower.id,
        upperHeight,lowerHeight,start,end,z,width,steps,riser:(upperHeight-lowerHeight)/steps,
        tread:length/steps,minimumHeadroom:2.2};
      plan.stairs.push(s);
      const h=mask(`${s.id}-opening`,[start,end+.8/radius,z-width/2-.2,z+width/2+.2],upperHeight);
      if (upper) upper.holes.push(h); else plan.groundOpenings.push(h);
      plan.routes.push({id:`${s.id}-route`,districtId,kind:'stairs',stairId:s.id,
        points:[{theta:start-.6/radius,z,height:upperHeight},{theta:end+1/radius,z,height:lowerHeight}],width});
    });
    plan.routes.push({id:`${prefix}-spoke-entry`,districtId,kind:'ground-entry',width:6,
      points:[{theta:center,z:6,height:0},{theta:center+43/830,z:6.5,height:0}]});
    const serviceMasks = [];
    for (const [i,d] of ds.entries()) {
      const r=d.radius, hw=d.halfWidth;
      d.floorMasks = subtractFarmMasks([[d.start,d.end,-hw,hw]],d.holes.map(rectOf));
      plan.routes.push({id:`${d.id}-main-aisle`,districtId,deckId:d.id,kind:'aisle',width:6,
        points:[{theta:d.start,z:0,height:d.height},{theta:d.end,z:0,height:d.height}]});
      // Perimeter six metres, z=0 six metres, two transverse six-metre aisles.
      const exclusions=[...d.holes.map(rectOf),[d.start,d.end,-3,3],
        [d.start,d.start+6/r,-hw,hw],[d.end-6/r,d.end,-hw,hw],
        [d.start,d.end,-hw,-hw+6],[d.start,d.end,hw-6,hw]];
      for (const x of [0,190]) {
        exclusions.push([center+(x-3)/r,center+(x+3)/r,-hw,hw]);
        plan.routes.push({id:`${d.id}-cross-${x}`,districtId,deckId:d.id,kind:'aisle',width:6,
          points:[{theta:center+x/r,z:-hw+3,height:d.height},{theta:center+x/r,z:hw-3,height:d.height}]});
      }
      // Clear stair approaches and connecting aisle alongside the central route.
      exclusions.push([center+41/r,center+177/r,3,10]);
      const services = i===2 ? ['animals','feed','processing','drying','water'] : [];
      services.forEach((category,j)=>{
        const x=[-260,-214,-168,-94,-48][j], q=[center+x/r,center+(x+42)/r,-hw+7,-hw+25];
        const p=mask(`${prefix}-${category}`,q,d.height,{districtId,deckId:d.id,category,kind:'service',netAreaM2:area(q)*r});
        serviceMasks.push(p);plan.patches.push(p);exclusions.push(q);
      });
      const free = subtractFarmMasks([[d.start,d.end,-hw,hw]],exclusions);
      // Deterministic 72m x 24m crop mosaic; 0.28m separators are NOT claimed walkways.
      let serial=0;
      for(const q of free) {
        const nx=Math.max(1,Math.ceil((q[1]-q[0])*r/72)),nz=Math.max(1,Math.ceil((q[3]-q[2])/24));
        for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++) {
          const a=q[0]+(q[1]-q[0])*ix/nx+.14/r,b=q[0]+(q[1]-q[0])*(ix+1)/nx-.14/r;
          const c=q[2]+(q[3]-q[2])*iz/nz+.14,e=q[2]+(q[3]-q[2])*(iz+1)/nz-.14;
          if(b<=a||e<=c)continue;
          const fractions=cropFractions;
          let cursor=a;
          // Allocate source-faithful remaining category deficits, not six guessed equal shares.
          CROPS.forEach((category,k)=>{
            const end=k===CROPS.length-1?b:cursor+(b-a)*fractions[k];
            const bed=mask(`${d.id}-bed-${serial++}`, [cursor,end,c,e],d.height,
              {districtId,deckId:d.id,category,kind:'crop-bed',netAreaM2:(end-cursor)*r*(e-c),foliageBlocking:false});
            plan.patches.push(bed);cursor=end;
          });
        }
      }
    }
    const beds=plan.patches.filter(p=>p.districtId===districtId&&p.kind==='crop-bed');
    const net=beds.reduce((sum,p)=>sum+p.netAreaM2,0),target=442000/3;
    const baselineCropGrossM2=plan.existingBedLedger.districts[districtId].grossKnownCropM2;
    const sourceCategoryAreas=Object.fromEntries(CROPS.map(k=>[k,beds.filter(p=>p.category===k).reduce((s,p)=>s+p.netAreaM2,0)]));
    const services=Object.fromEntries(serviceMasks.map(p=>[p.category,p.netAreaM2]));
    const gross=ds.reduce((s,d)=>s+(d.end-d.start)*d.radius*2*d.halfWidth,0);
    const floor=ds.reduce((s,d)=>s+d.floorMasks.reduce((n,q)=>n+area(q)*d.radius,0),0);
    const row={districtId,baselineGrossAllUsesM2:plan.existingBedLedger.districts[districtId].grossAllUsesM2,baselineKnownCropGrossM2:baselineCropGrossM2,
      baselineNetCropM2:plan.existingBedLedger.districts[districtId].netCropFootprintM2,baselineNetCreditTowardNewLayersM2:0,
      baselineEvidence:'Exact delivered generator horizontal crop-bed masks reconstructed from explicit canonical collisionSupport; kept separate from new runtime masks.',
      detailedEqualShareCropM2:target,roundedEqualShareCropM2:440000/3,
      grossCropLowerBoundMissingM2:target-baselineCropGrossM2,grossSupportM2:gross,floorAfterHolesM2:floor,
      newNetCropBedM2:net,newSourceCategoryAreasM2:sourceCategoryAreas,newServiceAreasM2:services,
      newServiceTotalM2:serviceMasks.reduce((s,p)=>s+p.netAreaM2,0),
      circulationAndUnallocatedM2:floor-net-serviceMasks.reduce((s,p)=>s+p.netAreaM2,0),
      conservativeCropDeficitM2:Math.max(0,target-net),declaredCropReserveM2:Math.max(0,net-target),
      cropGeometryTargetMet:net>=target,fullSourceUseCompliant:false};
    plan.summary.districts.push(row);
    if(net<target)plan.conflicts.push({districtId,code:'net-crop-deficit',areaM2:target-net});
    plan.conflicts.push({districtId,code:'operational-agriculture-unverified',blockingCompliance:true});
  }
  plan.summary.newNetCropBedM2=plan.summary.districts.reduce((s,d)=>s+d.newNetCropBedM2,0);
  plan.summary.farmA={preserved:true,decks:(world?.terraces?.decks||[]).filter(d=>d.id.startsWith('farm-a-')).length,
    plotIds:plan.existingBedLedger.districts['farm-a'].plotInstances,grossAllUsesM2:plan.existingBedLedger.districts['farm-a'].grossAllUsesM2,
    knownCropGrossM2:plan.existingBedLedger.districts['farm-a'].grossKnownCropM2,netCropM2:plan.existingBedLedger.districts['farm-a'].netCropFootprintM2,
    conservativeCropDeficitM2:442000/3-plan.existingBedLedger.districts['farm-a'].netCropFootprintM2};
  plan.summary.baselineNetCropBedM2=Object.values(plan.existingBedLedger.districts).reduce((s,d)=>s+d.netCropFootprintM2,0);
  plan.summary.totalQuantifiedCropBedM2=plan.summary.newNetCropBedM2+plan.summary.baselineNetCropBedM2;
  plan.summary.settlementConservativeCropDeficitM2=Math.max(0,442000-plan.summary.totalQuantifiedCropBedM2);
  plan.summary.settlementCropReserveM2=Math.max(0,plan.summary.totalQuantifiedCropBedM2-442000);
  plan.sourceBudgets.cropCategoryLedger=CROPS.map(category=>{
    const existingNetM2=Object.values(plan.existingBedLedger.districts).reduce((s,d)=>s+(d.categoryAreasM2[category]||0),0);
    const newNetM2=plan.summary.districts.reduce((s,d)=>s+(d.newSourceCategoryAreasM2[category]||0),0);
    const sourceM2=FARM_LAYER_SOURCE.detailedTable54[category];
    return {category,sourceM2,existingNetM2,newNetM2,conservativeDeficitM2:Math.max(0,sourceM2-existingNetM2-newNetM2),declaredReserveM2:Math.max(0,existingNetM2+newNetM2-sourceM2)};
  });
  plan.summary.existingWorldMutated=false;
  plan.sourceBudgets.useLedger=[{category:'plant-growing',roundedSourceM2:440000,detailedSourceM2:442000,
    existingNetM2:plan.summary.baselineNetCropBedM2,newNetM2:plan.summary.newNetCropBedM2,
    conservativeDeficitM2:plan.summary.settlementConservativeCropDeficitM2,measure:'disjoint horizontal crop-bed footprints; supports and gross parcels excluded'}];
  for(const [category,rounded,detailed] of [['animals',50000,51000],['processing',40000,40000],['drying',80000,80000],['water',40000,40000]]) {
    const net=plan.summary.districts.reduce((s,d)=>s+(d.newServiceAreasM2[category]||0),0);
    plan.sourceBudgets.useLedger.push({category,roundedSourceM2:rounded,detailedSourceM2:detailed,existingNetM2:null,
      newNetM2:net,conservativeUnverifiedRemainderM2:detailed-net,
      measure:'new disjoint service-precinct footprint only; existing net services unquantified, not proven absent'});
  }
  plan.sourceBudgets.detailedUseSumM2=653000;plan.sourceBudgets.roundedUseSumM2=650000;
  plan.sourceBudgets.feedStorageNewM2=plan.summary.districts.reduce((s,d)=>s+(d.newServiceAreasM2.feed||0),0);
  if(plan.summary.settlementConservativeCropDeficitM2>0)plan.conflicts.push({code:'settlement-net-crop-deficit',areaM2:plan.summary.settlementConservativeCropDeficitM2,blockingCompliance:true});
  plan.conflicts.push({code:'analytic-ground-half-space-requires-radial-gate',integrationRequired:true,
    detail:'Existing CharacterController.resolve projects every foot at radius>=830 onto ground when groundExists is true. Entry-hole-only theta/z masks are insufficient below intact plain. Gate analytic fallback by current foot radius<=830.3 as well as entry holes; retain visible ground outside holes.'});
  plan.conflicts.push({code:'full-source-services-not-met',blockingCompliance:true,
    detail:'Small new service zones are not 50/51k animal, 40k processing, 80k drying or 40k water compliance. Existing gross reservations are not net.'});
  plan.conflicts.push({code:'source-rounding-and-total-discrepancy',blockingCompliance:true, cropM2:2000,animalsM2:1000,printedTotalM2:50000});
  return plan;
}

// Curved closed slabs: theta/z are intrinsic; inward height increases toward the rotation axis.
function curvedBox(r, h0, h1, positions, colors, color, segmentLength=5) {
  const [a,b,z0,z1]=r, n=Math.max(1,Math.ceil((b-a)*(830-h0)/segmentLength));
  const rgb=new THREE.Color(color),point=(t,z,h)=>[(830-h)*Math.cos(t),(830-h)*Math.sin(t),z];
  const quad=(A,B,C,D)=>{positions.push(...A,...B,...C,...A,...C,...D);for(let k=0;k<6;k++)colors.push(rgb.r,rgb.g,rgb.b);};
  for(let i=0;i<n;i++) {
    const x=a+(b-a)*i/n,y=a+(b-a)*(i+1)/n;
    const A=point(x,z0,h0),B=point(y,z0,h0),C=point(y,z1,h0),D=point(x,z1,h0);
    const E=point(x,z0,h1),F=point(y,z0,h1),G=point(y,z1,h1),H=point(x,z1,h1);
    quad(E,F,G,H);quad(D,C,B,A);quad(A,B,F,E);quad(C,D,H,G);
    if(i===0)quad(D,A,E,H);if(i===n-1)quad(B,C,G,F);
  }
}
function curvedSheet(r, height, positions, colors, color, ridge=0) {
  const [a,b,z0,z1]=r, n=Math.max(1,Math.ceil((b-a)*(830-height)/8));
  const rgb=new THREE.Color(color),point=(t,z,h)=>[(830-h)*Math.cos(t),(830-h)*Math.sin(t),z];
  const quad=(A,B,C,D)=>{positions.push(...A,...B,...C,...A,...C,...D);for(let k=0;k<6;k++)colors.push(rgb.r,rgb.g,rgb.b);};
  for(let i=0;i<n;i++) {
    const x=a+(b-a)*i/n,y=a+(b-a)*(i+1)/n;
    if(ridge) {const z=(z0+z1)/2;quad(point(x,z0,height),point(y,z0,height),point(y,z,height+ridge),point(x,z,height+ridge));
      quad(point(x,z,height+ridge),point(y,z,height+ridge),point(y,z1,height),point(x,z1,height));}
    else quad(point(x,z0,height),point(y,z0,height),point(y,z1,height),point(x,z1,height));
  }
}
function bufferGeometry(positions,colors) {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}

export function createCapacityFarmLayers({habitatGroup,world}) {
  if(!habitatGroup?.isObject3D)throw new TypeError('habitatGroup must be a THREE.Object3D');
  const plan=planCapacityFarmLayers(world),group=new THREE.Group();group.name='capacity-farm-layers';
  group.userData={runtimeOnly:true,capacityFarmLayers:true};habitatGroup.add(group);
  const colliders=[],material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.9});
  const luminous=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
  const resources=[],renderIndex=[];
  function mesh(id,deckId,build,blocking=true,mat=material) {
    const positions=[],colors=[];build(positions,colors);if(!positions.length)return null;
    const geometry=bufferGeometry(positions,colors),object=new THREE.Mesh(geometry,mat);
    object.name=id;object.userData={id,deckId,runtimeOnly:true,capacityFarmLayers:true,collisionMode:blocking?'solid':'none'};
    group.add(object);resources.push(geometry);
    if(blocking)colliders.push({id,object});
    renderIndex.push({id,deckId,triangles:positions.length/9,drawCalls:1,blocking});return object;
  }
  for(const d of plan.decks) {
    mesh(d.id,d.id,(p,c)=>d.floorMasks.forEach(q=>curvedBox(q,d.height-d.thickness,d.height,p,c,'#a9b0a0')));
    const beds=plan.patches.filter(p=>p.deckId===d.id&&p.kind==='crop-bed');
    mesh(`${d.id}-crop-mosaic`,d.id,(p,c)=>beds.forEach(b=>curvedSheet(rectOf(b),d.height+.18,p,c,COLORS[b.category],.12)),false);
    // Nonblocking greenhouse ribs and row-level luminaires, pooled into two meshes per floor.
    mesh(`${d.id}-greenhouse`,d.id,(p,c)=>beds.filter((_,i)=>i%18===0).forEach(b=>{
      const r=rectOf(b);curvedBox([r[0],r[1],r[2],r[2]+.08],d.height+2.9,d.height+3,p,c,'#a1c9bb',8);
    }),false);
    mesh(`${d.id}-lighting`,d.id,(p,c)=>beds.filter((_,i)=>i%6===1).forEach(b=>{
      const r=rectOf(b),z=(r[2]+r[3])/2;curvedBox([r[0],r[1],z-.12,z+.12],d.height+3.7,d.height+3.8,p,c,'#fff4c4',8);
    }),false,luminous);
    const services=plan.patches.filter(p=>p.deckId===d.id&&p.kind==='service');
    mesh(`${d.id}-service-zones`,d.id,(p,c)=>services.forEach(b=>curvedBox(rectOf(b),d.height+.02,d.height+.06,p,c,COLORS[b.category],8)),false);
    if(services.length)mesh(`${d.id}-service-solids`,d.id,(p,c)=>services.forEach(b=>{
      const r=rectOf(b),mid=(r[0]+r[1])/2;
      curvedBox([mid-4/d.radius,mid+4/d.radius,r[2]+2,r[2]+8],d.height,d.height+(b.category==='animals'?3:2.4),p,c,COLORS[b.category]);
    }));
    // Closed perimeter rails are real blockers. Hole rails have open ends for walking.
    mesh(`${d.id}-rails`,d.id,(p,c)=>{
      for(const z of [-d.halfWidth+.3,d.halfWidth-.3])curvedBox([d.start,d.end,z-.08,z+.08],d.height,d.height+1.1,p,c,'#748379');
      for(const t of [d.start,d.end])curvedBox([t-.08/d.radius,t+.08/d.radius,-d.halfWidth+.3,d.halfWidth-.3],d.height,d.height+1.1,p,c,'#748379');
      for(const h of d.holes)for(const z of [h.zMin,h.zMax])curvedBox([h.thetaStart,h.thetaEnd,z-.08,z+.08],d.height,d.height+1.1,p,c,'#748379');
    });
  }
  for(const s of plan.stairs) {
    mesh(s.id,s.lower,(p,c)=>{
      for(let i=0;i<s.steps;i++) {
        const a=s.start+(s.end-s.start)*i/s.steps,b=s.start+(s.end-s.start)*(i+1)/s.steps;
        const h=s.upperHeight-s.riser*(i+1);
        curvedBox([a,b,s.z-s.width/2,s.z+s.width/2],h-.2,h,p,c,'#d9cfaf');
      }
    });
    mesh(`${s.id}-handrails`,s.lower,(p,c)=>{
      for(let i=0;i<s.steps;i++) {
        const a=s.start+(s.end-s.start)*i/s.steps,b=s.start+(s.end-s.start)*(i+1)/s.steps,h=s.upperHeight-s.riser*(i+1);
        for(const z of [s.z-s.width/2-.12,s.z+s.width/2+.12])curvedBox([a,b,z-.06,z+.06],h,h+1.1,p,c,'#73887f');
      }
    });
  }
  // A guarded ground hole, not an optional inspection cutaway. Its open ends remain traversable.
  for(const h of plan.groundOpenings) {
    mesh(`${h.id}-approach`,null,(p,c)=>curvedBox([h.thetaStart-2/830,h.thetaStart,h.zMin+.2,h.zMax-.2],-.4,0,p,c,'#b4b8a3'));
    mesh(`${h.id}-guard`,null,(p,c)=>{
    for(const z of [h.zMin,h.zMax])curvedBox([h.thetaStart,h.thetaEnd,z-.08,z+.08],0,1.1,p,c,'#73887f');
  });
  }
  group.updateMatrixWorld(true);
  const stats={triangles:renderIndex.reduce((s,r)=>s+r.triangles,0),drawCalls:renderIndex.length,
    colliderCount:colliders.length,colliderTriangles:renderIndex.filter(r=>r.blocking).reduce((s,r)=>s+r.triangles,0),
    rendererData:renderIndex,netCropBedM2:plan.summary.newNetCropBedM2,
    foliageBlocking:false,geometryBudget:{maxTriangles:120000,maxDrawCalls:80}};
  let disposed=false;
  return {group,colliders,plan,stats,dispose(){if(disposed)return;disposed=true;group.removeFromParent();
    resources.forEach(g=>g.dispose());material.dispose();luminous.dispose();}};
}
