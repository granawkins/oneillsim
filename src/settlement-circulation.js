import * as THREE from 'three';
import { characterColliders } from './physics/collider-world.js';
import { residentialAGeometry } from './settlement-residential-a.js';

// Authored interpretation of SP-413 Figs 5-4/5-7, not sourced engineering.
// Intrinsic coordinates: theta radians, z metres, height inward from R=830.
// Support is real triangle geometry. No changes to analytic ground/terrace support.
// SOURCE_BOUNDS is an immutable manifest-derived reservation ledger at scale 4.
const R = 830, TAU = Math.PI * 2, STEP = 3;
const SOURCE_BOUNDS = {"TorusHome_ModA":[[-2.01,2.01],[0.0,5.52],[-3.01,4.44]],"TorusBench_A":[[-0.9,0.9],[0.0,1.01],[-0.3,0.3]],"TorusTable_A":[[-0.82,0.82],[0.0,0.76],[-0.495,0.495]],"TorusPlanter_A":[[-0.77,0.77],[0.0,1.3],[-0.415,0.415]],"TorusRailing_A":[[-1.0,1.0],[0.0,1.08],[-0.08,0.08]],"TorusSign_A":[[-0.4,0.4],[0.0,2.2125],[-0.15,0.15]],"TorusWasteBin_A":[[-0.32,0.32],[0.0,1.05],[-0.29,0.29]],"TorusHome_CourtyardA":[[-3.8,3.8],[0.0,5.62],[-3.8,3.8]],"TorusHome_RowA":[[-5.75,5.75],[0.0,5.62],[-3.8,3.8]],"TorusApartment_TerraceA":[[-7.8,7.7],[0.0,8.4],[-5.8,5.8]],"TorusDistrict_Housing5A":[[-21.896484375,21.896484375],[0,15],[-8.0,8.0]],"TorusDistrict_Housing4A":[[-25.024553571428573,25.024553571428573],[0,12],[-7.0,7.0]],"TorusDistrict_Housing2A":[[-35.034375,35.034375],[0,6],[-5.0,5.0]],"TorusDistrict_SchoolA":[[-19.839285714285715,19.839285714285715],[0,11.4],[-7.0,7.0]],"TorusDistrict_ClinicA":[[-17.85535714285714,17.85535714285714],[0,5],[-7.0,7.0]],"TorusDistrict_HallA":[[-39.05859375,39.05859375],[0,10],[-8.0,8.0]],"TorusDistrict_ShopsA":[[-63.8825,63.8825],[0,8],[-15.0,15.0]],"TorusDistrict_OfficesA":[[-18.516666666666666,18.516666666666666],[0,12],[-15.0,15.0]],"TorusDistrict_WorkshopA":[[-111.1,111.1],[0,12],[-15.0,15.0]],"TorusDistrict_StorageA":[[-69.4375,69.4375],[0,12.8],[-15.0,15.0]],"TorusDistrict_RecreationA":[[-55.55,55.55],[0,3],[-15.0,15.0]],"TorusDistrict_CommunityA":[[-53.69833333333333,53.69833333333333],[0,11.399999999999999],[-15.0,15.0]],"TorusDistrict_Path01":[[-22.290292818648084,22.290292818648084],[0,0.06],[-8.0,8.0]],"TorusDistrict_Path02":[[-22.630381404796623,22.630381404796623],[0,0.06],[-8.0,8.0]],"TorusDistrict_Path03":[[-32.908915731038746,32.908915731038746],[0,0.06],[-7.0,7.0]],"TorusDistrict_Path04":[[-37.11231614421844,37.11231614421844],[0,0.06],[-8.0,8.0]],"TorusDistrict_Path05":[[-62.25953559488278,62.25953559488278],[0,0.06],[-3.0,3.0]],"TorusDistrict_Path06":[[-62.25953559488278,62.25953559488278],[0,0.06],[-7.0,7.0]],"TorusDistrict_Path07":[[-134.73354084458526,134.73354084458526],[0,0.06],[-2.0,2.0]],"TorusDistrict_Path08":[[-134.73354084458526,134.73354084458526],[0,0.06],[-5.0,5.0]],"TorusDistrict_ParkA":[[-289.0440025960922,289.0440025960922],[0,0.12],[-14.413895332821989,14.413895332821989]],"TorusDistrict_Terrace01":[[-0.3400885861485108,0.3400885861485108],[0,0.06],[-8.0,8.0]],"TorusDistrict_Terrace02":[[-9.8759834365311,9.8759834365311],[0,0.06],[-8.0,8.0]],"TorusDistrict_Terrace03":[[-10.777465140764207,10.777465140764207],[0,0.06],[-5.0,5.0]],"TorusDistrict_Terrace04":[[-11.999999999999886,11.999999999999886],[0,0.06],[-8.0,8.0]],"TorusDistrict_Terrace05":[[-16.45445786551943,16.45445786551943],[0,0.06],[-3.0,3.0]],"TorusDistrict_Terrace06":[[-16.45445786551943,16.45445786551943],[0,0.06],[-7.0,7.0]],"TorusDistrict_Terrace07":[[-17.855357142857144,17.855357142857144],[0,0.06],[-3.0,3.0]],"TorusDistrict_Terrace08":[[-18.55615807210919,18.55615807210919],[0,0.06],[-8.0,8.0]],"TorusDistrict_Terrace09":[[-19.839285714285722,19.839285714285722],[0,0.06],[-3.0,3.0]],"TorusDistrict_Terrace10":[[-21.173268811495937,21.173268811495937],[0,0.06],[-1.0,1.0]],"TorusDistrict_Terrace11":[[-21.554930281528414,21.554930281528414],[0,0.06],[-2.0,2.0]],"TorusDistrict_Terrace12":[[-21.554930281528414,21.554930281528414],[0,0.06],[-5.0,5.0]],"TorusDistrict_Terrace13":[[-22.630381404796623,22.630381404796623],[0,0.06],[-1.0,1.0]],"TorusDistrict_Terrace14":[[-22.630381404796594,22.630381404796594],[0,0.06],[-8.0,8.0]],"TorusDistrict_Terrace15":[[-23.91485579911668,23.91485579911668],[0,0.06],[-3.0,3.0]],"TorusDistrict_Terrace16":[[-23.91485579911668,23.91485579911668],[0,0.06],[-7.0,7.0]],"TorusDistrict_Terrace17":[[-24.906820084830997,24.906820084830997],[0,0.06],[-3.0,3.0]],"TorusDistrict_Terrace18":[[-24.906820084830997,24.906820084830997],[0,0.06],[-7.0,7.0]],"TorusDistrict_Terrace19":[[-25.024553571428584,25.024553571428584],[0,0.06],[-3.0,3.0]],"TorusDistrict_Terrace20":[[-32.908915731038746,32.908915731038746],[0,0.06],[-3.0,3.0]],"TorusDistrict_Terrace21":[[-35.03437500000001,35.03437500000001],[0,0.06],[-2.0,2.0]],"TorusDistrict_Terrace22":[[-37.11231614421844,37.11231614421844],[0,0.06],[-0.7930523335890056,0.7930523335890056]],"TorusDistrict_Terrace23":[[-37.11231614421844,37.11231614421844],[0,0.06],[-1.0,1.0]],"TorusDistrict_Terrace24":[[-39.05859375,39.05859375],[0,0.06],[-0.7930523335890056,0.7930523335890056]],"TorusDistrict_Terrace25":[[-39.05859375,39.05859375],[0,0.06],[-1.0,1.0]],"TorusDistrict_Terrace26":[[-62.25953559488278,62.25953559488278],[0,0.06],[-0.5,0.5]],"TorusDistrict_Terrace27":[[-134.73354084458526,134.73354084458526],[0,0.06],[-0.5,0.5]],"TorusDistrict_TreeA":[[-1.5,1.5],[0,4],[-1.5,1.5]],"TorusCommerce_MarketA":[[-8.74,8.74],[0.0,4.45],[-5.95,5.95]],"TorusCommerce_RestaurantA":[[-7.0,7.0],[0.0,4.2],[-5.7,4.9]],"TorusCommerce_FactoryA":[[-10.0,10.0],[0.0,6.35],[-6.75,6.75]],"TorusNature_TreeA":[[-2.849988,2.595112],[0.0,6.289752],[-2.114176,2.236144]],"TorusNature_ShrubA":[[-1.349996,1.46196],[0.0,1.609036],[-0.942828,1.183868]],"TorusNature_GrassA":[[-0.594084,0.664612],[0.0,0.85],[-0.593064,0.631596]],"TorusNature_FlowersA":[[-1.269076,1.354228],[0.0,0.735],[-0.688164,0.688164]],"TorusNature_RockA":[[-1.185568,1.197108],[0.0,1.3],[-0.86974,0.79282]],"TorusNature_PondA":[[-3.903116,3.765688],[0.0,0.865108],[-2.517524,2.520864]],"TorusNature_StreamA":[[-1.968416,2.011592],[0.0,0.68],[-4.0,4.0]],"TorusAgri_GrainA":[[-1.8,1.8],[0.0,1.76],[-1.3,1.3]],"TorusAgri_LegumeA":[[-1.8,1.8],[0.0,0.8],[-1.3,1.3]],"TorusAgri_VegetablesA":[[-1.8,1.8],[0.0,0.59],[-1.3,1.3]],"TorusAgri_GreenhouseA":[[-3.015812,3.015812],[0.0,4.066],[-4.0,4.0]],"TorusAgri_GrowingBedA":[[-2.5,2.5],[0.0,3.265],[-1.8,1.8]],"TorusAgri_IrrigationA":[[-2.4,2.4],[0.0,1.95],[-1.5,1.5]],"TorusAgri_AnimalHousingA":[[-4.017556,4.017556],[0.0,4.56518],[-4.0,4.0]],"TorusAgri_AquacultureA":[[-3.23,3.23],[0.0,1.64],[-2.3,1.43]],"TorusFauna_CowA":[[-0.43,0.43],[0.0,1.86],[-1.114306,1.45076]],"TorusFauna_ChickenA":[[-0.161,0.161],[0.0,0.6651236],[-0.34,0.285]],"TorusFauna_RabbitA":[[-0.165,0.165],[0.0,0.5599808],[-0.31882,0.3076]],"TorusFauna_FishA":[[-0.111,0.111],[0.0,0.285],[-0.32,0.25]],"TorusTransport_RoadA":[[-3.0,3.0],[0.0,0.11],[-5.0,5.0]],"TorusTransport_BridgeA":[[-1.1,1.1],[0.0,1.510312],[-5.035,5.0175]],"TorusTransport_StairsRampA":[[-2.230312,2.235],[0.0,2.910312],[-8.6,8.4]],"TorusTransport_RailA":[[-1.35,1.35],[0.0,0.35],[-4.0,4.0]],"TorusTransport_StationA":[[-2.5,2.5],[0.0,3.03],[-4.0,4.0]],"TorusTransport_BusA":[[-1.235,1.235],[0.0,2.65],[-3.1,3.145]],"TorusTransport_CartA":[[-0.785,0.785],[0.0,2.02],[-1.3,1.345]],"TorusTransport_BicycleA":[[-0.315496,0.315],[0.0,1.065],[-1.06,1.06]],"TorusUtility_WaterTankA":[[-3.9,3.9],[0.0,4.18],[-3.0,2.8]],"TorusUtility_PumpA":[[-3.9,3.9],[0.0,2.64],[-3.0,2.8]],"TorusUtility_WaterTreatmentA":[[-3.9,3.9],[0.0,3.58],[-3.0,2.8]],"TorusUtility_AirHandlerA":[[-3.9,3.9],[0.0,3.65],[-3.0,2.8]],"TorusUtility_WasteProcessingA":[[-3.9,3.9],[0.0,3.5],[-3.0,2.8]],"TorusUtility_PowerDistributionA":[[-3.9,3.9],[0.0,3.825],[-3.0,2.8]],"TorusUtility_PipesCablesA":[[-3.9,3.9],[0.0,3.525],[-3.0,2.8]],"TorusUtility_LightA":[[-3.9,3.9],[0.0,4.06],[-3.0,2.8]],"TorusStructure_HullPanelA":[[-11.28713155,11.28713155],[0.0,1.33217877],[-6.0,6.0]],"TorusStructure_FrameA":[[-4.15,4.15],[0.0,6.3],[-6.15,6.15]],"TorusStructure_SpokeA":[[-7.8,7.8],[0.0,15.6],[-15.0,15.0]],"TorusStructure_HubA":[[-85.0,85.0],[0.0,189.0],[-77.36215932,77.36215932]],"TorusStructure_DockingA":[[-8.0,8.0],[0.0,16.0],[-4.0,4.3]],"TorusStructure_AirlockA":[[-2.0,3.3],[0.0,3.4],[-3.72,3.72]],"TorusStructure_MirrorA":[[-12.15,12.15],[0.0,9.65233117],[-6.5900527,6.93419856]],"TorusStructure_ShieldA":[[-6.0,6.0],[0.0,2.245],[-4.0,4.0]],"TorusStructure_RadiatorA":[[-12.4,12.4],[0.0,0.8],[-6.4,8.0]]};
const lerp = (a,b,t) => a + (b-a)*t;
const distance = (a,b) => Math.hypot((b[0]-a[0])*R,b[1]-a[1]);
function widthAt(route,theta) {
    const profile=route.widthProfile;
    if(!profile)return route.width;
    for(let i=1;i<profile.length;i++)if(theta<=profile[i][0])return lerp(profile[i-1][1],profile[i][1],Math.max(0,(theta-profile[i-1][0])/(profile[i][0]-profile[i-1][0])));
    return profile.at(-1)[1];
}
export const circulationPoint = ([theta,z,height]) => new THREE.Vector3((R-height)*Math.cos(theta),(R-height)*Math.sin(theta),z);

// Same +X tangent / +Y inward / +Z axial basis as THREE placement.
// Curved district/farm bounds are intrinsic arc metres; ordinary OBJ bounds
// are Cartesian metres at scale four. Never reserve the entire crop canopy.
export function circulationReservations(world) {
    return (world.assets || []).flatMap(item => {
        const a=Array.isArray(item)?{id:item[0],type:world.assetTypes?.[item[1]],theta:item[2],z:item[3],scale:item[4],rotation:item[5],spec:item[6],surface:item[7]}:item;
        if(a.surface?.worldTransform)return [];
        const h=a.surface?.height ?? a.spec?.elevation ?? 0, factor=(a.spec?.width || a.blockout?.width) ? 1 : (a.scale ?? 4)/4, yaw=a.rotation || 0;
        const kit=residentialAGeometry.kit[a.type];
        const make=(id,b,curved=false,walkable=false)=>{
            const xs=[],zs=[],hs=[],radius=R-h;
            for(const x of b[0])for(const z of b[2])for(const y of b[1]) {
                let X=x*factor,Y=y*factor,Z=z*factor;
                if(curved) {const r=a.surface?.collisionSupport?.curveRadiusMeters ?? (kit?R-kit.elevation:R-(a.surface?.anchorHeight ?? h)); X=(r-y)*Math.sin(x/r)*factor;Y=(r-(r-y)*Math.cos(x/r))*factor;}
                const xx=X*Math.cos(yaw)+Z*Math.sin(yaw),zz=Z*Math.cos(yaw)-X*Math.sin(yaw);
                xs.push(Math.atan2(xx,radius-Y)*radius);zs.push(a.z+zz);hs.push(R-Math.hypot(xx,radius-Y));
            }
            return {id,assetId:a.id,theta:a.theta,z:a.z,height:h,x:[Math.min(...xs),Math.max(...xs)],zBounds:[Math.min(...zs),Math.max(...zs)],h:[Math.min(...hs),h+b[1][1]*factor],walkable};
        };
        const support=a.surface?.collisionSupport;
        if(support && ['support-only','farm-zoned'].includes(a.surface.collisionMode)) {
            const floor=make(a.id,[[-support.width/2,support.width/2],[0,support.heightMeters],[-support.depth/2,support.depth/2]],true,true);
            return [floor,...(a.surface.collisionSolids || []).map((v,i)=>make(`${a.id}:solid-${i}`,[[v.x-v.width/2,v.x+v.width/2],[v.minHeight,v.maxHeight],[v.z-v.depth/2,v.z+v.depth/2]],true))];
        }
        if(kit && ['terrace','park','circulation'].includes(kit.category)) {
            return [make(a.id,[[-kit.width/2,kit.width/2],[0,kit.height],[-kit.depth/2,kit.depth/2]],true,true),...(kit.masks.obstacles || []).map((v,i)=>make(`${a.id}:ornament-${i}`,[0,1,2].map(k=>[v.boundsIntrinsic[0][k],v.boundsIntrinsic[1][k]]),true))];
        }
        const spec=a.spec || a.blockout;
        const b=a.reservationBounds || (spec?.width?[[-spec.width/2,spec.width/2],[0,spec.height],[-spec.depth/2,spec.depth/2]]:SOURCE_BOUNDS[a.type]);
        if(!b)return [{id:a.id,unknown:true,theta:a.theta,z:a.z,height:h}];
        return [make(a.id,b,!!kit,b[1][1]*factor<=.31)];
    });
}

export function normalizeCirculationRoute(input,index=0) {
    return {...input,id:input.id || `settlement-circulation-additional-${index}`,kind:input.kind || 'paved-path',width:input.width ?? input.widthMeters,deckId:input.deckId ?? null,points:Array.isArray(input.points)?input.points.map(p=>Array.isArray(p)?[...p]:p&&typeof p==='object'?[p.theta,p.z,p.height ?? input.height ?? 0]:p):input.points};
}

export function sampleCirculationRoute(route, step=STEP) {
    const out=[];
    for(let i=1;i<route.points.length;i++) {
        const a=route.points[i-1],b=route.points[i],n=Math.max(1,Math.ceil(distance(a,b)/step));
        for(let j=0;j<n;j++) out.push(a.map((v,k)=>lerp(v,b[k],j/n)));
    }
    out.push([...route.points.at(-1)]); return out;
}

export function validateCirculationRoute(route, world, reservations=circulationReservations(world)) {
    const errors=[];
    if(route.bankSlope!==undefined&&(!Number.isFinite(route.bankSlope)||Math.abs(route.bankSlope)>.061))errors.push('invalid cross slope');
    if(!route.id || !Number.isFinite(route.width) || route.width<1 || route.width>12 || !Array.isArray(route.points) || route.points.length<2 || route.points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))) return ['invalid route schema'];
    for(let i=1;i<route.points.length;i++) {
        const a=route.points[i-1],b=route.points[i],d=distance(a,b);
        if(d<.01) errors.push('zero length segment');
        if(Math.abs(b[2]-a[2])/d>.061) errors.push('grade exceeds 6%; author stairs instead');
    }
    if(route.widthProfile && (!Array.isArray(route.widthProfile)||route.widthProfile.length<2||route.widthProfile.some((p,i)=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[1]<1||p[1]>12||(i>0&&p[0]<=route.widthProfile[i-1][0]))))return ['invalid width profile'];
    const checkSamples=sampleCirculationRoute(route,1.5);
    for(const [index,p] of checkSamples.entries()) {
        const a=checkSamples[Math.max(0,index-1)],b=checkSamples[Math.min(checkSamples.length-1,index+1)],dx=(b[0]-a[0])*R,dz=b[1]-a[1],length=Math.hypot(dx,dz);
        const half=widthAt(route,p[0])/2,halfX=Math.abs(dz)/length*half+.4,halfZ=Math.abs(dx)/length*half+.4;
        // Foot, head, width and underside must fit the actual circular tube.
        if(Math.hypot(Math.max(Math.abs(p[2]-.25),Math.abs(p[2]+2.1)),Math.abs(p[1])+widthAt(route,p[0])/2+.35)>64.9) errors.push('outside tube / insufficient capsule clearance');
        const theta=((p[0]%TAU)+TAU)%TAU,decks=world.terraces?.decks || [],stairs=world.terraces?.stairs || [];
        if(p[2]<-.081&&!decks.some(d=>d.cutGround!==false&&theta>=d.start&&theta<d.end))errors.push('below unchanged analytic ground');
        for(const d of decks)if(theta>=d.start&&theta<=d.end&&d.bands.some(([lo,hi])=>p[1]>lo-halfZ&&p[1]<hi+halfZ)&&p[2]<d.height-.081&&p[2]+2.1>d.height-.4&&!stairs.some(s=>s.upper===d.id&&theta>=s.start&&theta<=s.end&&Math.abs(p[1]-s.z)<s.width/2))errors.push(`insufficient headroom below deck: ${d.id}`);
        for(const v of reservations) {
            const dx=((p[0]-v.theta+Math.PI)%TAU+TAU)%TAU-Math.PI;
            const x=dx*(R-v.height);
            if(v.unknown) { if(Math.hypot(x,p[1]-v.z)<half+8 && Math.abs(p[2]-v.height)<8) errors.push(`unverified bounds: ${v.id}`); continue; }
            if(x<v.x[0]-halfX || x>v.x[1]+halfX || p[1]<v.zBounds[0]-halfZ || p[1]>v.zBounds[1]+halfZ) continue;
            if(p[2]+2.05>v.h[0] && p[2]-.24<v.h[1] && !(v.walkable && v.h[1]<=p[2]+.081)) errors.push(`occupied volume: ${v.id}`);
        }
        for(const s of world.terraces?.stairs || []) {
            if(p[0]>s.start+1e-6 && p[0]<s.end-1e-6 && Math.abs(p[1]-s.z)<s.width/2+route.width/2-.1) {
                const upper=world.terraces.decks.find(d=>d.id===s.upper),lower=world.terraces.decks.find(d=>d.id===s.lower);
                const h=lerp(upper.height,lower.height,(p[0]-s.start)/(s.end-s.start));
                if(Math.abs(p[2]-h)<2.1) errors.push(`existing stair opening: ${s.id}`);
            }
        }
    }
    return [...new Set(errors)];
}

// Search only a bounded apron. Endpoint/floor changes are disclosed, never
// achieved by moving a saved specimen, hiding an obstacle or adding fake ground.
export function resolveCirculationRoute(input,world,reservations,main=null) {
    const route=normalizeCirculationRoute(input),sector=world.terraces?.decks.find(d=>d.id===route.deckId&&d.cutGround!==false);
    let boundaryClipped=false;
    if(sector && route.supportAssetId) {
        const pad=1/(R-sector.height);
        for(const p of route.points || []) {const t=Math.max(sector.start+pad,Math.min(sector.end-pad,p[0]));if(t!==p[0]){p[0]=t;boundaryClipped=true;}}
    }
    const originalReasons=validateCirculationRoute(route,world,reservations);
    if(boundaryClipped)originalReasons.push('retained-floor route touched an unchanged analytic ground cut boundary; inset 1m');
    // Even clear neighboring frontages must match a platform approach crossing
    // them. Apply the common low-platform apron profile before accepting them.
    if(originalReasons.includes('invalid route schema') || originalReasons.some(r=>r.includes('grade exceeds')))return {route:null,diagnostic:{routeId:route.id,status:'rejected',reasons:originalReasons}};
    const acceptable=candidate=>{
        if(validateCirculationRoute(candidate,world,reservations).length)return false;
        if(candidate.supportAssetId) {
            const floor=reservations.find(r=>r.id===candidate.supportAssetId);
            if(!floor)return false;
            if(sampleCirculationRoute(candidate,1).some(p=>{const x=(p[0]-floor.theta)*(R-floor.height);return x<floor.x[0] || x>floor.x[1] || p[1]<floor.zBounds[0] || p[1]>floor.zBounds[1];}))return false;
        }
        try{circulationRibbon(candidate);}catch{return false;}return true;
    };
    const result=(candidate,method)=>{
        const resolved={...candidate,resolution:method};
        if(candidate.supportAssetId&&candidate.points.some(p=>p[2]>route.points[0][2]+.001)){resolved.originalSupportAssetId=candidate.supportAssetId;delete resolved.supportAssetId;}
        return {route:resolved,diagnostic:{routeId:route.id,status:'rerouted',method,reasons:originalReasons,originalPoints:route.points,points:candidate.points,width:candidate.width}};
    };
    if(main && (route.role==='promenade' || /central-walk$/.test(route.id))) {
        const lo=route.points[0][0],hi=route.points.at(-1)[0];
        const at=t=>{for(let i=1;i<main.points.length;i++)if(t<=main.points[i][0]){const a=main.points[i-1],b=main.points[i],f=(t-a[0])/(b[0]-a[0]);return a.map((v,k)=>lerp(v,b[k],f));}return main.points.at(-1);};
        const candidate={...route,width:Math.min(route.width,6),widthProfile:main.widthProfile,points:[at(lo),...main.points.filter(p=>p[0]>lo&&p[0]<hi),at(hi)]};
        if(acceptable(candidate))return result(candidate,'shared preserved-specimen promenade bypass');
    }
    // Low spoke platforms are genuine walkable tops. Match their elevation via
    // gentle approaches rather than painting a path through their side walls.
    const platforms=reservations.filter(v=>!v.unknown&&v.walkable&&v.h[1]>.15+route.points[0][2]&&v.h[1]<route.points[0][2]+.4);
    const sourceSamples=sampleCirculationRoute(route,2);
    const raised={...route,points:sourceSamples.map(q=>{
        const p=[...q];
        for(const v of platforms) {
            const x=(p[0]-v.theta)*(R-v.height),pad=route.width/2+.5,delta=Math.hypot(Math.max(v.x[0]-pad-x,0,x-v.x[1]-pad),Math.max(v.zBounds[0]-pad-p[1],0,p[1]-v.zBounds[1]-pad));
            p[2]=Math.max(p[2],v.h[1]+.01-delta*.03);
        }
        return p;
    })};
    const changed=raised.points.some((p,i)=>p[2]>sourceSamples[i][2]+.001);
    if(changed && acceptable(raised)) {
        // Above the existing OBJ floor, the approach needs a real paved mesh.
        const resolved=result(raised,'gentle approach to retained platform top');
        if(route.supportAssetId){resolved.route.originalSupportAssetId=route.supportAssetId;delete resolved.route.supportAssetId;}
        return resolved;
    }
    if(!originalReasons.length)return {route,diagnostic:null};
    if(boundaryClipped&&acceptable(route))return result(route,'inset from unchanged cut-sector boundary');
    for(const width of [...new Set([route.width,Math.min(route.width,1.5)])]) {
        const narrow={...route,width};
        if(acceptable(narrow))return result(narrow,'narrow clear apron');
        for(const offset of [1,-1,2,-2,3,-3,4,-4,6,-6,8,-8,10,-10]) {
            const points=[route.points[0]];
            for(let i=1;i<route.points.length;i++) {
                const a=route.points[i-1],b=route.points[i],d=distance(a,b),dx=(b[0]-a[0])*R,dz=b[1]-a[1];
                if(d<8){points.push(b);continue;}
                const lead=Math.min(12,d/4),n=[-dz/d,dx/d];
                for(const t of [lead/d,1-lead/d])points.push([lerp(a[0],b[0],t)+n[0]*offset/R,lerp(a[1],b[1],t)+n[1]*offset,lerp(a[2],b[2],t)]);
                points.push(b);
            }
            const candidate={...route,width,points};
            if(acceptable(candidate))return result(candidate,'bounded free-apron detour');
        }
        // Legacy room crossings often terminate inside their neighboring facade
        // AABBs. Retain only the clear floor segment; do not claim door access.
        if(route.role==='retained-room-crossing'&&route.points.length===2) {
            const samples=sampleCirculationRoute(narrow,.5),safe=samples.map((p,i)=>{
                const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)];
                return distance(a,b)>.01&&!validateCirculationRoute({...narrow,points:[a,b]},world,reservations).length;
            });
            let best=[],run=[];
            safe.forEach((ok,i)=>{if(ok)run.push(samples[i]);else{if(run.length>best.length)best=run;run=[];}});if(run.length>best.length)best=run;
            if(best.length>2) {const candidate={...narrow,points:[best[0],best.at(-1)]};if(acceptable(candidate))return result(candidate,'clipped to genuinely clear retained floor; not facade access');}
        }
    }
    return {route:null,diagnostic:{routeId:route.id,status:'rejected',reasons:originalReasons,action:'No clear bounded apron; preserve layout and disclose this link as unavailable.'}};
}

export function buildCirculation(world) {
    const routes=[],diagnostics=[],landmarks=[],reservations=circulationReservations(world);
    const add=(id,points,width=4,extra={})=>{
        const route={id:`settlement-circulation-${id}`,points,width,deckId:null,kind:'paved-path',...extra};
        const errors=validateCirculationRoute(route,world,reservations);
        if(errors.length) diagnostics.push({routeId:route.id,status:'rejected',reasons:errors}); else routes.push(route);
        return errors.length ? null : route;
    };
    // Existing spoke-axis markers cannot be removed. The continuous promenade
    // bends through their plazas with gentle approaches to the original .3m tops.
    const points=[[0,0,0]],districts=world.masterPlan?.districts || [];
    // Legacy transport specimens and the furnished street pilot already occupy
    // z=0. Preserve them: broad detours, then a disclosed 2.4m garden pinch.
    points.push([2.43,0,0],[2.445,6,0],[2.52,6,0],[2.54,0,0]);
    const rows=[2.593897492449326,2.6179938779914944,2.642090263533663];
    points.push([2.565,0,0],[2.575,-3.5,0]);
    rows.forEach((t,i)=>points.push([t-6/R,i===0?-3.5:0,0],[t-3/R,-4.6,0],[t+3/R,-4.6,0],[t+6/R,i===rows.length-1?-3.5:0,0]));
    points.push([2.66,-3.5,0],[2.675,0,0]);
    const widthProfile=[[0,6],[2.54,6],[2.565,2.4],[2.675,2.4],[2.70,6],[TAU,6]];
    for(const d of districts) {
        if(d.id==='residential-a' || d.id==='farm-a') continue;
        const c=d.center;
        points.push([c-35/R,0,0],[c-15/R,6,.31],[c+15/R,6,.31],[c+35/R,0,0]);
        landmarks.push({id:`settlement-circulation-${d.id}-plaza`,theta:c,z:6,height:.31,role:'spoke plaza bypass',sceneryOnly:true});
    }
    points.push([TAU,0,0]);points.sort((a,b)=>a[0]-b[0]);
    for(let i=points.length-1;i>0;i--)if(distance(points[i],points[i-1])<.01)points.splice(i,1);
    add('promenade',points,6,{kind:'main-promenade',closed:true,widthProfile,reservedCorridor:[-7,7],rails:'cut-sectors'});
    const basin=world.terraces?.decks.find(d=>d.id==='residential-a-basin');
    if(basin) {
        // First move clear of the overhead promenade. A >1000m descending
        // garden walk occupies the central unbuilt vista, not housing shelves.
        // Crossing bridges use a searched gap in actual parcel reservations.
        let chosen=null;
        for(let outer=.30;outer<=.55&&!chosen;outer+=.005) for(let middle=.78;middle<=1.05&&!chosen;middle+=.005) {
            const ramp={id:'probe',width:4,points:[[.015,3,0],[.015,10,0],[.12,10,-4],[.18,0,-7],[outer,0,-12],[middle,0,-32],[basin.end-.04,0,-47.86]]};
            const branches=[];
            for(const sign of [-1,1]) for(const [t,h,z,deck] of [[outer,-12,50,'residential-a-outer'],[middle,-32,32,'residential-a-middle']]) {
                branches.push({id:'probe',width:3,points:[[t,0,h],[t,sign*4,h],[t,sign*8,h+.08],[t,sign*z,h+.08]],deckId:deck,bankSlope:t===outer?(-32+7)/((middle-.18)*R):(-47.86+12)/((basin.end-.04-outer)*R)});
            }
            if(!validateCirculationRoute(ramp,world,reservations).length && branches.every(b=>!validateCirculationRoute(b,world,reservations).length)) chosen={ramp,branches};
        }
        if(chosen) {
            add('a-garden-descent',chosen.ramp.points,4,{kind:'garden-ramp',deckId:basin.id,rails:'all'});
            chosen.branches.forEach((b,i)=>add(`a-lateral-${i}`,b.points,3,{deckId:b.deckId,bankSlope:b.bankSlope,kind:'lateral-bridge',rails:'all'}));
            landmarks.push({id:'settlement-circulation-basin-arrival',theta:basin.end-.04,z:0,height:-48,role:'long-vista garden arrival',sceneryOnly:true});
        } else diagnostics.push({routeId:'settlement-circulation-a-garden-descent',status:'rejected',reasons:['No clear ramp and lateral bridge combination in authored search apron.']});
    }
    const stairs=world.terraces?.stairs || [],pond=world.terraces?.decks.find(d=>d.id==='farm-a-ponds'),first=stairs.find(s=>s.id==='farm-stair-0');
    if(pond&&first) {
        const mouth=first.start-3/R,start=first.start+100/R;
        for(const sign of [-1,1]) add(`farm-a-entry-${sign<0?'south':'north'}`,[[start,0,0],[start,sign*32,0],[mouth,sign*32,5],[mouth,sign*50,5],[first.start,sign*50,5]],4,{deckId:pond.id,kind:'farm-apron-ramp',rails:'all'});
        for(let i=0;i<stairs.length-1;i++) {
            const s=stairs[i],next=stairs[i+1];
            if(s.lower!==next.upper) continue;
            const h=world.terraces.decks.find(d=>d.id===s.lower).height;
            const far=i===2?1.399:s.end+3/R,near=next.start-3/R,mid=i===1?35:i===2?5:s.z===next.z?5:(s.z+next.z)/2;
            // Follow an apron around, never lay a slab over a stair opening.
            add(`farm-a-stair-transfer-${i}`,[[s.end,s.z,h],[far,s.z,h],[far,mid,h],[near,mid,h],[near,next.z,h],[next.start,next.z,h]],2.2,{deckId:s.lower,kind:'stair-mouth-link',rails:false});
        }
        landmarks.push({id:'settlement-circulation-farm-a-stairs',theta:first.start,z:first.z,height:5,role:'existing farm stair chain',stairId:first.id,sceneryOnly:true});
    }
    // Narrow curved retaining profiles in free strips between the old levels.
    // These are not replacement ground. Leave every occupied parcel intact;
    // reject profile cells intersecting even the original low paving volumes.
    const terrainEdges=[];
    if(basin)for(const sign of [-1,1])for(const [z,top,bottom] of [[34,-32,-48],[51,-12,-32]]) {
        const count=Math.ceil((basin.end-basin.start)*R/8);
        for(let i=0;i<count;i++) {
            const start=lerp(basin.start,basin.end,i/count),end=lerp(basin.start,basin.end,(i+1)/count),theta=(start+end)/2;
            if(reservations.some(v=>{if(v.unknown)return true;const x=(theta-v.theta)*(R-v.height),half=(end-start)*(R-v.height)/2;return x+half>v.x[0]-.3&&x-half<v.x[1]+.3&&sign*z>v.zBounds[0]-.4&&sign*z<v.zBounds[1]+.4&&top>v.h[0]+.01&&bottom<v.h[1]-.01;}))continue;
            terrainEdges.push({start,end,z:sign*z,top,bottom,width:.18,role:'retaining profile; not a walkable ground replacement'});
        }
    }
    return {routes,landmarks,diagnostics,terrainEdges,reservations:routes.map(r=>({routeId:r.id,width:r.width,points:r.points.map(p=>[...p]),widthProfile:r.widthProfile?.map(p=>[...p]) || null,clearanceHeight:2.1,noVegetation:true})),scope:{support:'Registered paved triangle strips, sloped approaches and collision rails; existing stairs/decks remain authoritative.',scenery:'Stone fascia and narrow curved retaining profiles only; no new vegetation, blanket slabs or invisible support.',source:'SP-413 Figures 5-4 and 5-7 composition; all exact routes are authored interpretation.'},summary:{acceptedRoutes:routes.length,rejectedRoutes:diagnostics.length,minimumLegacyPinchWidth:2.4,legacyExceptions:['Existing street furniture requires a 2.4m pinch and z=-4.6 bypass; broad specimen/plaza detours extend locally beyond z +/-7.','Original spoke platforms are crossed at +.31m with gentle approaches; the rest of the promenade is canonical height 0.','Basin park arrival is -47.86m on the existing .12m garden skin; terrace bridges land .08m above their canonical decks.'],mainPromenadeConnected:routes.some(r=>r.kind==='main-promenade'),residentialAConnected:routes.some(r=>r.kind==='garden-ramp')}};
}

// Continuous mitered ribbon: each station is shared by adjacent quads. There
// are no stacked segment boxes, doubled corner slabs or tangent flat floors.
export function circulationRibbon(route) {
    const samples=sampleCirculationRoute(route),edges=[];
    const normal=(a,b)=>{const dx=(b[0]-a[0])*R,dz=b[1]-a[1],n=Math.hypot(dx,dz);return [-dz/n,dx/n];};
    for(let i=0;i<samples.length;i++) {
        const p=samples[i],before=normal(samples[Math.max(0,i-1)],samples[Math.min(samples.length-1,i||1)]),after=normal(samples[Math.max(0,i===samples.length-1?i-1:i)],samples[Math.min(samples.length-1,i+1)]);
        let nx=before[0]+after[0],nz=before[1]+after[1],len=Math.hypot(nx,nz);
        if(len<.1) throw new Error(`Reversing corner: ${route.id}`);
        nx/=len;nz/=len;const divisor=nx*after[0]+nz*after[1];
        if(divisor<.5) throw new Error(`Unbuildable sharp miter: ${route.id}`);
        const half=widthAt(route,p[0])/2/divisor;
        edges.push([[p[0]+nx*half/R,p[1]+nz*half,p[2]+nx*half*(route.bankSlope || 0)],[p[0]-nx*half/R,p[1]-nz*half,p[2]-nx*half*(route.bankSlope || 0)]]);
    }
    return {samples,edges};
}
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function halfPlane(poly,a,b,inside) {
    const out=[];
    for(let i=0;i<poly.length;i++) {
        const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q),ip=inside?dp>=-1e-8:dp<=1e-8,iq=inside?dq>=-1e-8:dq<=1e-8;
        if(ip) out.push(p);
        if(ip!==iq) {const t=dp/(dp-dq);out.push(p.map((v,k)=>lerp(v,q[k],t)));}
    }
    return out;
}
function subtract(poly,clip) {
    let remaining=poly;const pieces=[];
    for(let i=0;i<clip.length&&remaining.length>=3;i++) {
        const a=clip[i],b=clip[(i+1)%clip.length],outside=halfPlane(remaining,a,b,false);
        if(outside.length>=3) pieces.push(outside);
        remaining=halfPlane(remaining,a,b,true);
    }
    return pieces;
}
function area(poly){return poly.reduce((s,p,i)=>s+p[0]*poly[(i+1)%poly.length][1]-p[1]*poly[(i+1)%poly.length][0],0)/2;}
function surfacePlane(poly){
    const [a,b,c]=poly,ux=b[0]-a[0],uz=b[1]-a[1],uh=b[2]-a[2],vx=c[0]-a[0],vz=c[1]-a[1],vh=c[2]-a[2],det=ux*vz-uz*vx;
    if(Math.abs(det)<1e-9)return [0,0,a[2]];
    const x=(uh*vz-uz*vh)/det,z=(ux*vh-uh*vx)/det;return [x,z,a[2]-x*a[0]-z*a[1]];
}
const planeHeight=(plane,x,z)=>plane[0]*x+plane[1]*z+plane[2];
function matchingPlanes(a,b,bounds){return [[bounds[0],bounds[2]],[bounds[0],bounds[3]],[bounds[1],bounds[2]],[bounds[1],bounds[3]]].every(([x,z])=>Math.abs(planeHeight(a,x,z)-planeHeight(b,x,z))<.035);}
function box(poly){return [Math.min(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[1]))];}
const overlaps=(a,b)=>a[0]<b[1]-1e-7&&a[1]>b[0]+1e-7&&a[2]<b[3]-1e-7&&a[3]>b[2]+1e-7;
function geometry(positions) {const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;}
function appendTriangle(out,a,b,c){out.push(...circulationPoint([a[0]/R,a[1],a[2]]).toArray(),...circulationPoint([b[0]/R,b[1],b[2]]).toArray(),...circulationPoint([c[0]/R,c[1],c[2]]).toArray());}

export function createSettlementCirculation(habitatGroup,world,additionalRoutes=[]) {
    const plan=buildCirculation(world),diagnostics=[...plan.diagnostics],routes=[...plan.routes],ids=[],meshes=[],coverage=[];
    const reservations=circulationReservations(world),primaryRampStations=plan.routes.filter(r=>r.kind==='garden-ramp').map(r=>({route:r,samples:sampleCirculationRoute(r,1.5)}));
    for(const [index,input] of additionalRoutes.entries()) {
        const inputRoute=normalizeCirculationRoute(input,index);
        if(routes.some(r=>r.id===inputRoute.id)){diagnostics.push({routeId:inputRoute.id,status:'rejected',reasons:['duplicate route id']});continue;}
        const {route,diagnostic}=resolveCirculationRoute(inputRoute,world,reservations,plan.routes.find(r=>r.kind==='main-promenade'));
        if(diagnostic)diagnostics.push(diagnostic);
        if(route) {
            // Existing-floor metadata can cross the final low end of the garden
            // descent. It cannot pass through that ribbon's fascia or underside.
            const stations=sampleCirculationRoute(route,1.5);
            let needsApproach=false;
            const lifted=stations.map(q=>{
                const p=[...q];
                for(const {route:r} of primaryRampStations) {
                    let nearest=null;
                    for(let i=1;i<r.points.length;i++) {
                        const a=r.points[i-1],b=r.points[i],dx=(b[0]-a[0])*R,dz=b[1]-a[1];
                        const t=Math.max(0,Math.min(1,(((q[0]-a[0])*R)*dx+(q[1]-a[1])*dz)/(dx*dx+dz*dz)));
                        const v=a.map((x,k)=>lerp(x,b[k],t)),d=distance(q,v);
                        if(!nearest||d<nearest.d)nearest={d,height:v[2],bankSlope:(b[2]-a[2])/dx};
                    }
                    const delta=nearest.height-q[2];
                    if(delta>=-.08&&delta<=2.15&&nearest.d<r.width/2+route.width/2+.4)needsApproach=true;
                    if(delta>=-.08&&delta<=2.15)p[2]=Math.max(p[2],nearest.height-Math.max(0,nearest.d-r.width/2-route.width/2-.4)*.03);
                }
                return p;
            });
            if(needsApproach&&lifted.some((p,i)=>p[2]>stations[i][2]+.02)) {
                const primary=primaryRampStations[0]?.route,segment=primary?.points.slice(1).map((b,i)=>({a:primary.points[i],b})).find(({a,b})=>route.points[0][0]>=a[0]&&route.points[0][0]<=b[0]);
                const candidate={...route,points:lifted,...(segment&&Math.abs(route.points.at(-1)[0]-route.points[0][0])<1e-7?{bankSlope:(segment.b[2]-segment.a[2])/((segment.b[0]-segment.a[0])*R)}:{})};
                const reasons=validateCirculationRoute(candidate,world,reservations);
                if(reasons.length){diagnostics.push({routeId:route.id,status:'rejected',reasons:['Existing floor crossing cannot fit a gentle approach over the primary garden descent.',...reasons]});continue;}
                candidate.originalSupportAssetId=route.supportAssetId;delete candidate.supportAssetId;
                diagnostics.push({routeId:route.id,status:'rerouted',method:'real gentle approach over low primary garden descent',originalPoints:route.points,points:candidate.points,reasons:['Primary descent ribbon occupies capsule headroom above the retained floor.']});
                routes.push(candidate);
            } else routes.push(route);
        }
    }
    const group=new THREE.Group();group.name='settlement-circulation';habitatGroup.add(group);
    const pavement=new THREE.MeshStandardMaterial({color:'#cfbd98',roughness:.92,side:THREE.DoubleSide});
    const stone=new THREE.MeshStandardMaterial({color:'#7d887b',roughness:1,side:THREE.DoubleSide});
    const metal=new THREE.MeshStandardMaterial({color:'#5e6b62',roughness:.65,side:THREE.DoubleSide});
    const register=(route,kind,g,material)=>{if(!g.attributes.position.count){g.dispose();return;}const mesh=new THREE.Mesh(g,material);mesh.name=`${route.id}:${kind}`;mesh.userData={circulation:true,routeId:route.id,deckId:route.deckId,kind};group.add(mesh);meshes.push(mesh);ids.push(mesh.name);characterColliders.setObject(mesh.name,mesh,habitatGroup);};
    // Batch by material/kind and deck, not by individual entry path. Keep the
    // complete semantic route ledger even when several routes share one mesh.
    const batches=new Map(),coverageCells=new Map();
    const cellKeys=b=>{const keys=[];for(let x=Math.floor(b[0]/12);x<=Math.floor(b[1]/12);x++)for(let z=Math.floor(b[2]/12);z<=Math.floor(b[3]/12);z++)keys.push(`${x}:${z}`);return keys;};
    const nearby=b=>[...new Set(cellKeys(b).flatMap(k=>coverageCells.get(k)||[]))];
    const store=v=>{coverage.push(v);for(const k of cellKeys(v.box)){if(!coverageCells.has(k))coverageCells.set(k,[]);coverageCells.get(k).push(v);}};
    const queue=(route,kind,positions,material)=>{if(!positions.length)return;const key=`${route.deckId || 'ground'}:${kind}`;if(!batches.has(key))batches.set(key,{deckId:route.deckId,kind,material,positions:[],routeIds:new Set()});const b=batches.get(key);for(const v of positions)b.positions.push(v);b.routeIds.add(route.id);};
    const ribbons=[];
    // The analytic circle lies just outside the chordal rendered ground, and
    // saved terrain paint is lifted 10 cm inward. Give ground paving a real
    // 15 cm crown so it is visible above both; the same mesh is its collider.
    // Retained OBJ floors and non-ground decks are not raised or replaced.
    for(const source of routes) {try{
        const route=source.supportAssetId?source:{...source,points:source.points.map(p=>[p[0],p[1],p[2]>=0&&p[2]<.15?.15:p[2]])};
        ribbons.push({route,...circulationRibbon(route)});
    }catch(error){diagnostics.push({routeId:source.id,status:'rejected',reasons:[error.message]});}}
    const mouthCells=new Map();
    for(const ribbon of ribbons)for(const p of ribbon.samples){const k=`${Math.floor(p[0]*R/12)}:${Math.floor(p[1]/12)}`;if(!mouthCells.has(k))mouthCells.set(k,[]);mouthCells.get(k).push({route:ribbon.route,p});}
    const mouthOpen=(edge,route)=>{const b=[edge[0]*R-9,edge[0]*R+9,edge[1]-9,edge[1]+9];return cellKeys(b).some(k=>(mouthCells.get(k)||[]).some(other=>other.route!==route&&distance(edge,other.p)<other.route.width/2+2.5&&Math.abs(edge[2]-other.p[2])<.6));};
    for(const {route,edges,samples} of ribbons) {
        // These rooms already have visible real curved OBJ floors. Preserve
        // their support; do not stack 274 replacement strips over those floors.
        if(route.supportAssetId)continue;
        const top=[],fascia=[],rails=[];
        for(let i=1;i<edges.length;i++) {
            let poly=[edges[i-1][0],edges[i][0],edges[i][1],edges[i-1][1]].map(p=>[p[0]*R,p[1],p[2]]);
            if(area(poly)<0)poly.reverse();const bounds=box(poly),plane=surfacePlane(poly);let pieces=[poly];
            // Trim same-level junctions against already emitted surface cells.
            // Different levels must not be unioned (bridge over basin ramp).
            for(const prior of nearby(bounds)) if(overlaps(bounds,prior.box)&&matchingPlanes(plane,prior.plane,[Math.max(bounds[0],prior.box[0]),Math.min(bounds[1],prior.box[1]),Math.max(bounds[2],prior.box[2]),Math.min(bounds[3],prior.box[3])])) pieces=pieces.flatMap(p=>subtract(p,prior.poly));
            pieces=pieces.filter(p=>Math.abs(area(p))>=1e-6);
            if(!pieces.length)continue; // Completely shared surface: no duplicate fascia/rails either.
            for(const p of pieces) {for(let j=1;j<p.length-1;j++){appendTriangle(top,p[0],p[j],p[j+1]);const lower=v=>[v[0],v[1],v[2]-.24];appendTriangle(fascia,lower(p[0]),lower(p[j+1]),lower(p[j]));}store({poly:p,box:box(p),plane});}
            for(const side of [0,1]) {
                const a=edges[i-1][side].map((v,k)=>k===0?v*R:v),b=edges[i][side].map((v,k)=>k===0?v*R:v),c=[b[0],b[1],b[2]-.24],d=[a[0],a[1],a[2]-.24];
                appendTriangle(fascia,a,b,c);appendTriangle(fascia,a,c,d);
                const midpoint=samples[i],cut=world.terraces?.decks.some(d=>d.cutGround!==false&&midpoint[0]>=d.start&&midpoint[0]<=d.end);
                if(!route.rails || (route.rails==='cut-sectors'&&!cut))continue;
                // Open every crossing/branch mouth; rails never barricade links.
                const edge=[(a[0]+b[0])/2/R,(a[1]+b[1])/2,(a[2]+b[2])/2];
                if(mouthOpen(edge,route))continue;
                const aa=[a[0],a[1],a[2]+.95],bb=[b[0],b[1],b[2]+.95],cc=[b[0],b[1],b[2]+1.08],dd=[a[0],a[1],a[2]+1.08];
                appendTriangle(rails,aa,bb,cc);appendTriangle(rails,aa,cc,dd);
                if(i%3===0){const e=[a[0]+.07,a[1],a[2]],f=[a[0]-.07,a[1],a[2]],g=[a[0]-.07,a[1],a[2]+1.08],h=[a[0]+.07,a[1],a[2]+1.08];appendTriangle(rails,e,f,g);appendTriangle(rails,e,g,h);}
            }
        }
        queue(route,'surface',top,pavement);queue(route,'fascia',fascia,stone);queue(route,'rails',rails,metal);
    }
    const retaining=[];
    const terrainEdges=plan.terrainEdges.filter(e=>!ribbons.some(({route,samples})=>samples.some(p=>p[0]>e.start-route.width/2/R&&p[0]<e.end+route.width/2/R&&Math.abs(p[1]-e.z)<route.width/2+.5&&p[2]<e.top-.1&&p[2]+2.1>e.bottom)));
    for(const e of terrainEdges) {
        const a=[e.start*R,e.z-e.width/2,e.top],b=[e.end*R,e.z-e.width/2,e.top],c=[e.end*R,e.z+e.width/2,e.top],d=[e.start*R,e.z+e.width/2,e.top],lo=p=>[p[0],p[1],e.bottom];
        for(const [p,q] of [[a,b],[b,c],[c,d],[d,a]]){appendTriangle(retaining,p,q,lo(q));appendTriangle(retaining,p,lo(q),lo(p));}
        appendTriangle(retaining,a,b,c);appendTriangle(retaining,a,c,d);appendTriangle(retaining,lo(a),lo(c),lo(b));appendTriangle(retaining,lo(a),lo(d),lo(c));
    }
    queue({id:'settlement-circulation-terrain-edges',deckId:null},'retaining-walls',retaining,stone);
    for(const [key,b] of batches) {
        // Bounded buffers also keep broad-phase collider registration manageable.
        const chunk=90000;for(let start=0;start<b.positions.length;start+=chunk){
            register({id:`settlement-circulation-batch-${key}-${start/chunk}`,deckId:b.deckId},b.kind,geometry(b.positions.slice(start,start+chunk)),b.material);
            meshes.at(-1).userData.routeIds=[...b.routeIds];
        }
    }
    const stats={retainingProfiles:terrainEdges.length,routes:ribbons.length,inputRoutes:additionalRoutes.length,reroutedRoutes:new Set(diagnostics.filter(d=>d.status==='rerouted'&&ribbons.some(r=>r.route.id===d.routeId)).map(d=>d.routeId)).size,rejectedRoutes:diagnostics.filter(d=>d.status==='rejected').length,existingFloorRoutes:ribbons.filter(r=>r.route.supportAssetId).length,coverageCells:coverage.length,meshes:meshes.length,colliderIds:[...ids],triangles:ids.reduce((n,id)=>n+(characterColliders.colliders.get(id)?.length || 0),0)};
    let disposed=false;
    return {group,plan:{...plan,summary:{...plan.summary,acceptedRoutes:ribbons.length,rejectedRoutes:diagnostics.filter(d=>d.status==='rejected').length},terrainEdges,routes:ribbons.map(r=>r.route),reservations:ribbons.map(({route:r})=>({routeId:r.id,width:r.width,points:r.points.map(p=>[...p]),widthProfile:r.widthProfile?.map(p=>[...p]) || null,clearanceHeight:2.1,noVegetation:true})),diagnostics},stats,meshes,dispose(){if(disposed)return;disposed=true;ids.forEach(id=>characterColliders.remove(id));group.removeFromParent();meshes.forEach(m=>m.geometry.dispose());[pavement,stone,metal].forEach(m=>m.dispose());}};
}
