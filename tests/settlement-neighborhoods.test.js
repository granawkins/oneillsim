import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNeighborhoods, neighborhoodBounds, neighborhoodFootprint, neighborhoodFitsTube, neighborhoodRouteIntersects} from '../src/settlement-neighborhoods.js';
import {CATALOG} from '../src/editor/catalog.js';

const root=new URL('../',import.meta.url), source=readFileSync(new URL('assets/settlement-source-world.json',root));
const world=JSON.parse(source), result=buildNeighborhoods(world);
const district=id=>world.masterPlan.districts.find(d=>d.id===id);
const measured=new Map();
function asset(type) {
  if(measured.has(type))return measured.get(type);
  const dir=existsSync(new URL(`assets/ultimate-nature/${type}.obj`,root))?'ultimate-nature':'ultimate-buildings';
  const manifest=JSON.parse(readFileSync(new URL(`assets/${dir}/${type}.asset.json`,root)));
  const vertices=readFileSync(new URL(`assets/${dir}/${type}.obj`,root),'utf8').split('\n').filter(l=>l.startsWith('v ')).map(l=>l.trim().split(/\s+/).slice(1).map(Number).map(n=>n*4));
  const bounds=[0,1,2].map(j=>[Math.min(...vertices.map(v=>v[j])),Math.max(...vertices.map(v=>v[j]))]);
  const value={manifest,vertices,bounds};measured.set(type,value);return value;
}
function freeze(o){if(o&&typeof o==='object'){Object.freeze(o);for(const v of Object.values(o))freeze(v);}return o;}
function box(p,center) {
  const b=asset(p.type).bounds,c=Math.cos(p.rotation),s=Math.sin(p.rotation),xx=[],zz=[];
  for(const x of b[0])for(const z of b[2]){xx.push((p.theta-center)*830+c*x+s*z);zz.push(p.z-s*x+c*z);}
  return {xMin:Math.min(...xx),xMax:Math.max(...xx),zMin:Math.min(...zz),zMax:Math.max(...zz)};
}
function overlap(a,b,gap=0){return a.xMin<b.xMax+gap&&a.xMax+gap>b.xMin&&a.zMin<b.zMax+gap&&a.zMax+gap>b.zMin;}
function baseline(d) {
  return world.assets.filter(a=>a[2]>=d.start&&a[2]<=d.end&&!a[7]?.worldTransform).map(a=>{
    const p={id:a[0],type:world.assetTypes[a[1]],theta:a[2],z:a[3],scale:a[4],rotation:a[5],surface:a[7],parcel:a[6]};
    const x=(p.theta-d.center)*830;
    return {p,b:p.parcel?{xMin:x-p.parcel.width/2,xMax:x+p.parcel.width/2,zMin:p.z-p.parcel.depth/2,zMax:p.z+p.parcel.depth/2}:box(p,d.center)};
  });
}
function segmentBox(a,b,r,pad) {
  // Independent slab interval intersection; entire route widths are considered.
  let low=0,high=1;
  for(const [j,min,max] of [[0,r.xMin-pad,r.xMax+pad],[1,r.zMin-pad,r.zMax+pad]]) {
    const delta=b[j]-a[j];
    if(Math.abs(delta)<1e-10){if(a[j]<min||a[j]>max)return false;continue;}
    let t1=(min-a[j])/delta,t2=(max-a[j])/delta;if(t1>t2)[t1,t2]=[t2,t1];
    low=Math.max(low,t1);high=Math.min(high,t2);if(low>high)return false;
  }
  return true;
}
function routeHits(r,b,c,pad=0){return r.points.some((v,i)=>i>0&&segmentBox([(r.points[i-1][0]-c)*830,r.points[i-1][1]],[(v[0]-c)*830,v[1]],b,r.width/2+pad));}
function segmentDistance(a,b,c,d) {
  const pointDistance=(p,u,v)=>{const dx=v[0]-u[0],dz=v[1]-u[1],den=dx*dx+dz*dz,t=den?Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dz)/den)):0;return Math.hypot(p[0]-u[0]-dx*t,p[1]-u[1]-dz*t);};
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),x=cross(c,d,b);
  if(u*v<0&&w*x<0)return 0;
  return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
function routesConnect(a,b,center) {
  const pts=r=>r.points.map(([t,z])=>[(t-center)*830,z]);const aa=pts(a),bb=pts(b);
  for(let i=1;i<aa.length;i++)for(let j=1;j<bb.length;j++)if(segmentDistance(aa[i-1],aa[i],bb[j-1],bb[j])<=(a.width+b.width)/2+1e-7)return true;
  return false;
}

test('source hash and all 482 records are immutable; build is deterministic before/after additive apply',()=>{
  assert.equal(createHash('sha256').update(source).digest('hex'),'98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591');
  assert.equal(world.assets.length,482);
  assert.deepEqual(buildNeighborhoods(freeze(structuredClone(world))),result);
  assert.deepEqual(buildNeighborhoods(world),result);
  const candidate=structuredClone(world);
  for(const p of result.additions){let i=candidate.assetTypes.indexOf(p.type);if(i<0){i=candidate.assetTypes.length;candidate.assetTypes.push(p.type);}candidate.assets.push([p.id,i,p.theta,p.z,p.scale,p.rotation,null,p.surface]);}
  assert.deepEqual(candidate.assets.slice(0,482),world.assets);
  assert.deepEqual(buildNeighborhoods(candidate),result);
  assert.deepEqual(result.replacements,[]);assert.deepEqual(result.decks,[]);assert.deepEqual(result.stairs,[]);
  assert.deepEqual(world,JSON.parse(source));
});

test('registered real geometry, scale four, measured bounds, IDs and ground anchors',()=>{
  const catalog=new Set(CATALOG.map(p=>p.id)),ids=new Set();
  for(const p of result.additions){assert.ok(/^settlement-neighborhood-[bc]-[a-z-]+-\d{3}$/.test(p.id),p.id);assert.ok(!ids.has(p.id),p.id);ids.add(p.id);assert.ok(catalog.has(p.type),p.type);assert.equal(p.scale,4);assert.deepEqual(p.surface,{deckId:'ground',height:-.05,anchorHeight:0});
    const b=asset(p.type).bounds;for(let j=0;j<3;j++)for(let k=0;k<2;k++)assert.ok(Math.abs(b[j][k]-neighborhoodBounds[p.type][j][k])<2e-5,`${p.type} stale bounds`);
    assert.ok(!/TorusDistrict_(Path|Terrace|Park)/.test(p.type),'no imported curved landscape slabs');
  }
  for(const r of result.routes){assert.ok(!ids.has(r.id),r.id);ids.add(r.id);}
  for(const l of result.landmarks){assert.ok(!ids.has(l.id),l.id);ids.add(l.id);assert.ok([l.theta,l.z,l.height,l.yaw,l.pitch].every(Number.isFinite));}
});

test('full OBJ vertices and conservative full geometry corners fit the tube and whole district boundaries',()=>{
  for(const p of result.additions){const d=district(p.districtId),b=box(p,d.center);assert.ok(neighborhoodFitsTube(p),p.id);assert.ok(b.xMin>(d.start-d.center)*830+7,p.id);assert.ok(b.xMax<(d.end-d.center)*830-7,p.id);assert.ok(b.zMin>=7||b.zMax<=-7,`${p.id} promenade`);
    for(const [x,y,z] of asset(p.type).vertices){const c=Math.cos(p.rotation),s=Math.sin(p.rotation),t=c*x+s*z,ax=p.z-s*x+c*z,rad=Math.hypot(830-(y-.05),t);assert.ok(Math.hypot(rad-830,ax)<64.9,`${p.id} OBJ vertex outside tube`);}
  }
});

test('all additions clear each other, all preserved baseline geometry and 24m spoke landings',()=>{
  for(const id of ['residential-b','residential-c']){
    const d=district(id),items=result.additions.filter(p=>p.districtId===id).map(p=>({p,b:box(p,d.center)})),old=baseline(d);
    for(let i=0;i<items.length;i++){
      const a=items[i];const authored=neighborhoodFootprint(a.p,d.center);for(const k of Object.keys(a.b))assert.ok(Math.abs(authored[k]-a.b[k])<2e-5,`${a.p.id} footprint ${k}`);
      for(let j=i+1;j<items.length;j++)assert.ok(!overlap(a.b,items[j].b,.6),`${a.p.id} intersects ${items[j].p.id}`);
      for(const b of old)assert.ok(!overlap(a.b,b.b,.6),`${a.p.id} intersects original ${b.p.id}`);
    }
  }
});

test('complete-width routes clear all new and old solids, except walkable spoke platform floors',()=>{
  for(const r of result.routes){const d=district(r.districtId);assert.ok(r.width>=1.5);assert.equal(r.deckId,'ground');assert.equal(r.height,0);assert.ok(r.points.length>=2);
    for(const [t,z,h] of r.points){assert.ok(t-r.width/2/830>=d.start-1e-8);assert.ok(t+r.width/2/830<=d.end+1e-8);assert.ok(Math.abs(z)+r.width/2<65);assert.equal(h,0);}
    for(const p of result.additions.filter(p=>p.districtId===r.districtId)){assert.ok(!routeHits(r,box(p,d.center),d.center,.25),`${r.id} clips ${p.id}`);assert.equal(neighborhoodRouteIntersects(r,p,d.center),routeHits(r,box(p,d.center),d.center));}
    for(const {p,b} of baseline(d)){if(p.type==='SpokePlaceholder'&&p.parcel.height<1)continue;assert.ok(!routeHits(r,b,d.center,.1),`${r.id} clips baseline ${p.id}`);}
  }
});

test('entries face streets; full external door/stair frontage is reserved and connected',()=>{
  for(const p of result.additions.filter(p=>p.entry)){
    const d=district(p.districtId),r=result.routes.find(r=>r.id===p.entry.apronRouteId),front=result.routes.find(r=>r.id===p.entry.frontageRouteId);assert.ok(r);assert.ok(front);assert.equal(r.entryFor,p.id);assert.equal(front.entryFor,p.id);
    const c=Math.cos(p.rotation),s=Math.sin(p.rotation),[t,z]=p.entry.streetPoint;assert.ok(((t-p.theta)*830*s+(z-p.z)*c)>0,p.id+' faces away from street');
    assert.ok(routesConnect(r,front,d.center));
    const others=result.additions.filter(q=>q.districtId===p.districtId&&q.id!==p.id);
    for(const q of others)assert.ok(!overlap(p.entry.apronBounds,box(q,d.center),.25),`${q.id} blocks full frontage of ${p.id}`);
    const ci=asset(p.type).manifest.collisionIntent||{},entries=ci.groundEntries||ci.entries||[];
    for(const e of entries){const v=e.centerModelLocalMeters||e.centerMeters;if(!v||v[1]>2)continue;const x=(p.theta-d.center)*830+c*v[0]+s*v[2];assert.ok(x>=p.entry.apronBounds.xMin-.1&&x<=p.entry.apronBounds.xMax+.1,p.id+' ground entry outside protected frontage');}
  }
  assert.ok(result.additions.filter(p=>p.entry).length>200);
});

test('all court, civic and frontage routes form one traversable geometric network in each district',()=>{
  for(const id of ['residential-b','residential-c']){
    const rr=result.routes.filter(r=>r.districtId===id),d=district(id),visited=new Set([0]),queue=[0];
    while(queue.length){const i=queue.pop();for(let j=0;j<rr.length;j++)if(!visited.has(j)&&routesConnect(rr[i],rr[j],d.center)){visited.add(j);queue.push(j);}}
    assert.equal(visited.size,rr.length,`${id} disconnected: ${rr.filter((r,j)=>!visited.has(j)).map(r=>r.id).join(',')}`);
  }
});

test('both complete sectors, distinct compositions, civic essentials, substantial open space and honest capacity',()=>{
  const essential=['TorusHome_ModA','TorusHome_CourtyardA','TorusHome_RowA','TorusApartment_TerraceA','TorusDistrict_Housing5A','TorusDistrict_Housing4A','TorusDistrict_SchoolA','TorusDistrict_ClinicA','TorusDistrict_CommunityA','TorusDistrict_RecreationA','TorusDistrict_ShopsA','TorusCommerce_MarketA','TorusCommerce_RestaurantA','TorusTransport_StationA','TorusTransport_BusA','TorusTransport_BicycleA','TorusBench_A','TorusTable_A','TorusPlanter_A','TorusSign_A','TorusWasteBin_A','TorusNature_TreeA','TorusDistrict_TreeA','TorusNature_ShrubA','TorusNature_FlowersA','TorusNature_GrassA','TorusNature_PondA','TorusNature_RockA'];
  let housing=0,known=0;
  for(const id of ['residential-b','residential-c']){const d=district(id),s=result.summary.districts[id],pp=result.additions.filter(p=>p.districtId===id);assert.equal(s.additions,pp.length);housing+=s.housingInstances;known+=s.explicitResidenceUnits;assert.ok(s.additions>=280);assert.ok(s.courts>=10);for(const type of essential)assert.ok(s.inventory[type]>0,`${id} missing ${type}`);
    assert.ok(s.unoccupiedProjectionLowerBoundSquareMeters>100000);assert.ok(Math.min(...pp.map(p=>(p.theta-d.center)*830))<-495);assert.ok(Math.max(...pp.map(p=>(p.theta-d.center)*830))>505);
    // Whole-extent distribution, not a single precinct: ten longitudinal deciles.
    const bins=new Set(pp.map(p=>Math.floor((p.theta-d.start)/(d.end-d.start)*10)));assert.ok(bins.size>=9,`${id} longitudinal coverage ${[...bins]}`);
  }
  assert.ok(housing>=200);assert.equal(result.summary.explicitResidenceUnits,known);assert.equal(result.summary.populationCapacity,null);assert.match(result.summary.capacityNote,/no 10,000-person/);
  assert.notDeepEqual(result.summary.districts['residential-b'].inventory,result.summary.districts['residential-c'].inventory);
  assert.equal(result.summary.additions,result.additions.length);assert.equal(result.summary.routes,result.routes.length);assert.equal(result.summary.landmarks,result.landmarks.length);
});

test('malformed input fails rather than inventing an extent or ignoring unmeasured baseline obstacles',()=>{
  assert.throws(()=>buildNeighborhoods({}),/immutable source-world schema/);
  const w=structuredClone(world);w.assetTypes.push('UnknownRealModel');w.assets.push(['unknown',w.assetTypes.length-1,district('residential-c').center,30,4,0,null,{height:0}]);assert.throws(()=>buildNeighborhoods(w),/lacks measured bounds/);
});
