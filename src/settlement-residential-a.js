// Residential A: garden rooms, not a new parcel allocation.
// Geometry/masks measured from existing authored OBJ/asset manifests at scale 4.
// Source: SP-413 figs. 5-5/5-7; all specific planting and furniture is interpretation.
// Never reads or writes live world state; no baseline replacement is authorized.
// The immutable geometry snapshot is validated against the real OBJ in the tests.

const R = 830, END = 1.3441640209389165;
const TREE='TorusNature_TreeA', SHRUB='TorusNature_ShrubA', FLOWERS='TorusNature_FlowersA';
const BENCH='TorusBench_A', TABLE='TorusTable_A', PLANTER='TorusPlanter_A', POND='TorusNature_PondA';
const CLEARANCE=.35;
export function decodeResidentialARecord(a, world) {
  if (!Array.isArray(a)) return a;
  return {id:a[0],type:world.assetTypes[a[1]],theta:a[2],z:a[3],scale:a[4],rotation:a[5],blockout:a[6],surface:a[7]};
}
function overlap(a,b,pad=0) {
  return a.min[0]<b.max[0]+pad && a.max[0]>b.min[0]-pad &&
    a.min[2]<b.max[2]+pad && a.max[2]>b.min[2]-pad;
}
function globalBox(p,b) {
  const r=R-p.surface.height;
  return {min:[p.theta+b.min[0]/r,p.surface.height+b.min[1],p.z+b.min[2]],
    max:[p.theta+b.max[0]/r,p.surface.height+b.max[1],p.z+b.max[2]]};
}
// Bounds include the canopy, not just trunk or saved placement origin.
export function residentialAPlacedBounds(p) {
  const b=residentialAGeometry.props[p.type];
  const c=Math.cos(p.rotation),s=Math.sin(p.rotation), r=R-p.surface.height;
  const vs=[];
  for(const x of [b.min[0],b.max[0]]) for(const y of [b.min[1],b.max[1]])
    for(const z of [b.min[2],b.max[2]]) {
      const X=x*c+z*s, Z=z*c-x*s;
      vs.push([p.theta+Math.atan2(X,r-y),R-Math.hypot(X,r-y),p.z+Z]);
    }
  const result={min:[0,1,2].map(i=>Math.min(...vs.map(v=>v[i]))),max:[0,1,2].map(i=>Math.max(...vs.map(v=>v[i])))};
  result.max[1]=p.surface.height+b.max[1]; // interior X=0 is the highest radial point
  return result;
}
function within(a,b,margin=0) {return a.min[0]>=b.min[0]+margin && a.max[0]<=b.max[0]-margin &&
  a.min[2]>=b.min[2]+margin && a.max[2]<=b.max[2]-margin;}
function pointDistance(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
function hitsRoute(box,route) {
  if(box.max[1]<route.points[0][2]-.1 || box.min[1]>route.points[0][2]+2.2)return false;
  const r=R-route.points[0][2], x=(box.min[0]+box.max[0])*r/2,z=(box.min[2]+box.max[2])/2;
  const radius=Math.hypot((box.max[0]-box.min[0])*r/2,(box.max[2]-box.min[2])/2);
  return route.points.slice(1).some((v,i)=>{
    const a=route.points[i], half=route.width/2+CLEARANCE;
    if(a[1]===v[1])return box.min[0]<Math.max(a[0],v[0])+half/r && box.max[0]>Math.min(a[0],v[0])-half/r && box.min[2]<v[1]+half && box.max[2]>v[1]-half;
    if(a[0]===v[0])return box.min[0]<v[0]+half/r && box.max[0]>v[0]-half/r && box.min[2]<Math.max(a[1],v[1])+half && box.max[2]>Math.min(a[1],v[1])-half;
    return pointDistance(x,z,[a[0]*r,a[1]],[v[0]*r,v[1]])<half+radius;
  });
}
function masks(p,spec) {
  const r=R-p.surface.height, box=(x1,x2,z1,z2)=>globalBox(p,{min:[x1,0,z1],max:[x2,3,z2]});
  const result=[];
  for(const m of spec.masks.clearRoutes||[]) {
    if(m.zRange)result.push(box(-spec.width/2,spec.width/2,...m.zRange));
    if(m.xRange)result.push(box(...m.xRange,-spec.depth/2,spec.depth/2));
    for(const stripe of m.intrinsicXStripes||[])result.push(box(...stripe,-spec.depth/2,spec.depth/2));
    if(m.perimeterClearance) {
      const q=m.perimeterClearance;
      result.push(box(-spec.width/2,-spec.width/2+q,-spec.depth/2,spec.depth/2),
        box(spec.width/2-q,spec.width/2,-spec.depth/2,spec.depth/2),
        box(-spec.width/2,spec.width/2,-spec.depth/2,-spec.depth/2+q),
        box(-spec.width/2,spec.width/2,spec.depth/2-q,spec.depth/2));
    }
  }
  // Unlike caller footprints the mask's first coordinate is angle; padding is metres.
  return result.map(b=>({min:[b.min[0]-CLEARANCE/r,b.min[1],b.min[2]-CLEARANCE],
    max:[b.max[0]+CLEARANCE/r,b.max[1],b.max[2]+CLEARANCE]}));
}
/**
 * Pure additive authoring. `routes` reserve existing public floors, not invented
 * walkable slabs: [[theta,z,canonicalHeight]], width in metres and deckId.
 * The parent circulation builder can join the four terrace arrival points.
 * Every supportAssetId identifies an actual continuous curved OBJ floor.
 */
export function buildResidentialA(world) {
  if(!world || !Array.isArray(world.assets))throw new TypeError('A saved immutable world is required');
  const baseline=world.assets.map(a=>decodeResidentialARecord(a,world));
  const originals=baseline.filter(a=>/^residential-a-\d+$/.test(a.id));
  if(originals.length!==297)throw new Error('Residential A requires all 297 conserved parcel records');
  const byId=new Map(baseline.map(a=>[a.id,a]));
  const additions=[],routes=[],landmarks=[],occupied=[],blocked=[];
  const decks=world.terraces?.decks||[];
  const route=(id,deckId,width,points,extra={})=>{const a={id:'settlement-residential-a-route-'+id,deckId,width,points,...extra};routes.push(a);return a;};
  // Separate park promenades remain continuously traversable with original crosswalks.
  for(const p of originals) {
    const spec=residentialAGeometry.kit[p.type];
    if(!spec)throw new Error('Unrecognized conserved Residential A asset '+p.type);
    const r=R-p.surface.height;
    if(spec.category==='terrace' && spec.width>=2 && spec.depth>=2) {
      route(`${p.id}-crossing-x`,p.surface.deckId,2,
        [[p.theta-spec.width/2/r,p.z,p.surface.height+spec.height],[p.theta+spec.width/2/r,p.z,p.surface.height+spec.height]],{supportAssetId:p.id,role:'retained-room-crossing'});
      route(`${p.id}-crossing-z`,p.surface.deckId,2,
        [[p.theta,p.z-spec.depth/2,p.surface.height+spec.height],[p.theta,p.z+spec.depth/2,p.surface.height+spec.height]],{supportAssetId:p.id,role:'retained-room-crossing'});
    }
    if(spec.category==='park') {
      for(const [j,z] of [0,-11.95,11.95].entries())route(`${p.id}-long-${j}`,p.surface.deckId,j===0?4:2.1,
        [[p.theta-spec.width/2/r,z,p.surface.height+spec.height],[p.theta+spec.width/2/r,z,p.surface.height+spec.height]],{supportAssetId:p.id});
      for(const [j,[a,b]] of spec.masks.clearRoutes.find(m=>m.intrinsicXStripes).intrinsicXStripes.entries())
        route(`${p.id}-cross-${j}`,p.surface.deckId,b-a,[[p.theta+(a+b)/2/r,-13,p.surface.height+spec.height],
          [p.theta+(a+b)/2/r,13,p.surface.height+spec.height]],{supportAssetId:p.id});
    }
  }
  // Continuous clear inner lips of the two upper shelves. Never use building roofs.
  for(const [deckId,h,z,width] of [['residential-a-middle',-32,33,2.4],['residential-a-outer',-12,49,1.8]])
    for(const sign of [-1,1])route(`${deckId}-${sign}`,deckId,width,[[.012,z*sign,h],[END-.012,z*sign,h]],
      {role:'terrace-edge-public-route',connectionPoints:[[.012,z*sign,h],[END-.012,z*sign,h]]});
  // Reserve the whole spoke landing and its arrival apron, not just the 2 m marker.
  blocked.push({min:[.6720820104694583-16/878,-48,-14],max:[.6720820104694583+16/878,-25,14]});
  for(const p of baseline) {
    if(p.surface?.worldTransform)continue;
    const spec=residentialAGeometry.kit[p.type];
    if(spec) {
      if(['park','terrace','circulation'].includes(spec.category)) {
        for(const o of spec.masks.obstacles||[])blocked.push(globalBox(p,{min:o.boundsIntrinsic[0],max:o.boundsIntrinsic[1]}));
      } else {
        const b=globalBox(p,spec.bounds);
        // Keep facade entrances, internal stair access and all four building edges free.
        if(spec.category!=='trees') {b.min[0]-=1.5/(R-p.surface.height);b.max[0]+=1.5/(R-p.surface.height);b.min[2]-=1.5;b.max[2]+=1.5;}
        blocked.push(b);
      }
    } else if(residentialAGeometry.props[p.type])blocked.push(residentialAPlacedBounds(p));
    else if(p.theta>=0&&p.theta<END&&p.blockout&&p.surface)blocked.push(globalBox(p,{min:[-p.blockout.width/2,0,-p.blockout.depth/2],max:[p.blockout.width/2,p.blockout.height,p.blockout.depth/2]}));
  }
  let candidates=0;
  const tryPlace=(p,spec,role,k,type,x,z,yaw=0)=>{
    candidates++;
    const id=`settlement-residential-a-${p.id.slice(14)}-${role}-${String(k).padStart(3,'0')}`;
    if(byId.has(id))return; // Additive rerun is idempotent; baseline still conserved.
    const anchor=p.surface.height+spec.height;
    const item={id,type,theta:p.theta+x/(R-p.surface.height),z:p.z+z,scale:4,rotation:yaw,
      surface:{deckId:p.surface.deckId,height:anchor-.05,anchorHeight:anchor,supportAssetId:p.id},
      design:{district:'residential-a',room:p.id,role,interpretation:true}};
    const b=residentialAPlacedBounds(item), floor=globalBox(p,{min:[-spec.width/2,0,-spec.depth/2],max:[spec.width/2,0,spec.depth/2]});
    if(!within(b,floor))return;
    const d=decks.find(a=>a.id===p.surface.deckId);
    if(!d||b.min[0]<d.start+.002||b.max[0]>d.end-.002||!d.bands.some(([a,c])=>b.min[2]>=a&&b.max[2]<=c))return;
    // The entire bounding volume, including roots/crowns, fits the 65 m tube.
    if(Math.max(...[b.min[1],b.max[1]].flatMap(h=>[b.min[2],b.max[2]].map(z=>Math.hypot(h,z))))>=64.8)return;
    if(masks(p,spec).some(m=>overlap(b,m)))return;
    if(routes.some(a=>hitsRoute(b,a)))return;
    if(blocked.some(a=>overlap(b,a)&&b.min[1]<a.max[1]+.25&&b.max[1]>a.min[1]-.1))return;
    if(occupied.some(a=>overlap(b,a)&&b.min[1]<a.max[1]+.15&&b.max[1]>a.min[1]-.1))return;
    // No taller planting through an overlapping deck or beneath an opaque slab.
    for(const slab of decks)if(slab.height>anchor+.1&&slab.height<b.max[1]+2.2&&
      b.max[0]>slab.start&&b.min[0]<slab.end&&slab.bands.some(([a,c])=>b.max[2]>a&&b.min[2]<c))return;
    // Existing structural stair flights receive a generous landing/approach apron.
    for(const stair of world.terraces?.stairs||[])if(b.max[0]>stair.start-4/(R-anchor)&&b.min[0]<stair.end+4/(R-anchor)&&
      b.max[2]>stair.z-stair.width/2-2&&b.min[2]<stair.z+stair.width/2+2)return;
    additions.push(item);occupied.push(b);
  };
  for(const p of originals) {
    const spec=residentialAGeometry.kit[p.type];
    if(spec.category==='park') {
      // Four irregular water/sitting rooms, offset from straight sightlines.
      const east=p.theta>.7, phase=east?.85:0;
      const waterRooms=east?[[-224,6.1],[-102,-6.4],[84,6.2],[233,-6.0]]:[[-208,-6.1],[-74,6.4],[68,-6.2],[212,6.0]];
      for(const [j,[x,z]] of waterRooms.entries()) {
        tryPlace(p,spec,'water-garden',j,POND,x,z,0);
        tryPlace(p,spec,'water-seat',j,BENCH,x+6.2,z,Math.PI/2);
        tryPlace(p,spec,'water-table',j,TABLE,x+6.2,z+2.0,.15);
      }
      // Authored sinuous ribbons are short clusters, not rows. The central lawn,
      // three original promenades and every baked-in crosswalk remain untouched.
      for(let j=0;j<48;j++) {
        const x=-274+j*11.48, sign=j%3===0?-1:1;
        const z=sign*(4.4+1.15*Math.sin(j*.71+phase));
        tryPlace(p,spec,'flower-ribbon',j,FLOWERS,x,z,.20*Math.sin(j));
        tryPlace(p,spec,'flower-companion',j,FLOWERS,x+3.7,z+sign*.55,-.3);
        if(j%3===1)tryPlace(p,spec,'shrub-island',j,SHRUB,x+5.3,sign*8.0,.12);
        if(j%5===2)tryPlace(p,spec,'reading-seat',j,BENCH,x+1.1,-sign*4.1,sign>0?0:Math.PI);
      }
      for(let j=0;j<18;j++) {
        const x=-270+j*31.7+3.8*Math.sin(j*1.9+phase),sign=(j+(east?1:0))%2===0?1:-1;
        tryPlace(p,spec,'shade-copse',j,TREE,x,sign*7.15,.12*Math.sin(j));
        tryPlace(p,spec,'copse-understory',j,SHRUB,x+4.4,sign*7.6,.2);
      }
      landmarks.push({id:`settlement-residential-a-${p.id}-garden`,name:p.theta<.7?'West water-and-reading garden':'East blossom garden',
        deckId:p.surface.deckId,position:[p.theta,0,p.surface.height+spec.height],
        role:'open-lawn-and-framed-vista',source:'SP-413 figs. 5-5 / 5-7; detailed gardens are authored interpretation',
        description:'Open central lawn and long axial view; asymmetric shade copses and small waterside sitting rooms between retained crosswalks.'});
    } else if(spec.category==='terrace'&&spec.depth>=6&&spec.width>=12) {
      const seed=Number(p.id.split('-').at(-1)), sign=seed%3===0?-1:1;
      // Room furniture is concentrated in opposite corners, keeping a generous
      // central crossing, existing inbuilt furniture, doors and perimeter path.
      tryPlace(p,spec,'conversation-seat',0,BENCH,-spec.width*.27,sign*(spec.depth/2-2.1),sign>0?Math.PI:0);
      tryPlace(p,spec,'conversation-table',0,TABLE,-spec.width*.27+3.1,sign*(spec.depth/2-2.1),.12);
      tryPlace(p,spec,'terrace-planter',0,PLANTER,spec.width*.34,-sign*(spec.depth/2-2.0),0);
      for(let j=0;j<Math.ceil(spec.width/12);j++) {
        const x=-spec.width/2+4.2+j*11.7;
        const z=-sign*(spec.depth/2-2.35)+.25*Math.sin(j+seed);
        tryPlace(p,spec,'edge-blossom',j,FLOWERS,x,z,.18*Math.sin(seed+j));
        if(spec.depth>=10&&j%2===0)tryPlace(p,spec,'edge-shrub',j,SHRUB,x+4.0,z,-.12);
      }
      if(spec.width>=30&&spec.depth>=14) {
        tryPlace(p,spec,'terrace-shade',0,TREE,-sign*spec.width*.32,sign*(spec.depth/2-4.8),0);
        if(seed%4===0)landmarks.push({id:`settlement-residential-a-${p.id}-room`,name:'Terrace garden room',deckId:p.surface.deckId,
          position:[p.theta,p.z,p.surface.height+spec.height],role:'conversation-and-view',
          viewTargets:originals.filter(a=>/School|Clinic|Hall/.test(a.type)).map(a=>a.id),
          description:'Clear central crossing frames civic facades; low flower/shrub islands soften the shelf without planting unsupported roofs.'});
      }
    }
  }
  const inventory={};for(const a of additions)inventory[a.type]=(inventory[a.type]||0)+1;
  return {additions,replacements:[],decks:[],stairs:[],routes,landmarks,summary:{district:'residential-a',
    conservedParcels:297,addedInstances:additions.length,inventory,authoredCandidates:candidates,
    enrichedSupportParcels:new Set(additions.map(a=>a.surface.supportAssetId)).size,
    inventoryRationale:{
      [TREE]:'Broad canopy trees only on garden/broad terrace floors; clustered shade and layered views supplement 56 conserved fruit trees.',
      [SHRUB]:'Low irregular understory islands soften slab edges without blocking civic windows or public crossings.',
      [FLOWERS]:'Warm flower ribbons trace asymmetric arcs and small corner gardens; no central lawn fill or uniformly spaced tree avenues.',
      [BENCH]:'Inward-facing conversation corners, reading places and water-edge seats; existing integrated benches remain unchanged.',
      [TABLE]:'Small public gathering rooms, paired with nearby seating rather than furnishing every narrow circulation shelf.',
      [PLANTER]:'Small planted terrace-edge boxes soften architecture while maintaining conserved facade and circulation aprons.',
      [POND]:'Distinct quiet static water rooms between retained crosswalks; full pond geometry sits on existing park floors.'
    },
    sourceFacts:['SP-413 figs. 5-5 and 5-7 depict planted pedestrian terraces, grouped homes and framed views.',
      'Existing parcel allocations, curved floors, built-in stairs, source IDs and fruit trees are conserved.'],
    interpretation:['Existing native-kit models at their intended scale; water gardens are static visual amenities, not swimming/fluid systems.',
      'Layered shrub/flower accents and clustered shade trees replace no existing objects; narrow terraces and center lawns remain empty.',
      'Furniture on verified landscape floors only, not guessed roofs. Public routes are reservation metadata on existing support, not new rendered paving.',
      'Tree crowns, facade aprons, existing decoration, deck headroom and the complete tube envelope are conservatively reserved.'],
    integrationNotes:['Parent owns physical basin/terrace connections and full-scene renderer/gameplay verification.',
      'Preserve 4 m central and 2.1 m side garden promenades plus all original crosswalks; join terrace connectionPoints without intruding into gardens.',
      'No objects reach the planned height-0 overhead ring promenade.']}};
}

export const residentialAGeometry = {
  "kit": {
    "TorusDistrict_Housing5A": {
      "category": "housing",
      "width": 43.79296875,
      "depth": 16,
      "height": 15,
      "elevation": -48,
      "bounds": {
        "min": [
          -21.89648439335107,
          -1.7978891264647245e-08,
          -8.0
        ],
        "max": [
          21.89648439335107,
          15.000000019485924,
          8.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_Housing4A": {
      "category": "housing",
      "width": 50.049107142857146,
      "depth": 14,
      "height": 12,
      "elevation": -32,
      "bounds": {
        "min": [
          -25.02455359178631,
          -1.2386067282932345e-08,
          -7.0
        ],
        "max": [
          25.024553590308003,
          12.000000018906462,
          7.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_Housing2A": {
      "category": "housing",
      "width": 70.06875,
      "depth": 10,
      "height": 6,
      "elevation": -12,
      "bounds": {
        "min": [
          -35.034375015942366,
          -1.2315581443544943e-08,
          -5.0
        ],
        "max": [
          35.034375015942366,
          6.00000001820456,
          5.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_SchoolA": {
      "category": "schools",
      "width": 39.67857142857143,
      "depth": 14,
      "height": 11.4,
      "elevation": -32,
      "bounds": {
        "min": [
          -19.83928573413237,
          -1.6669673641445115e-08,
          -7.0
        ],
        "max": [
          19.839285723951157,
          11.40000001943281,
          7.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_ClinicA": {
      "category": "hospital",
      "width": 35.71071428571428,
      "depth": 14,
      "height": 5,
      "elevation": -32,
      "bounds": {
        "min": [
          -17.855357160679613,
          -1.912439984153025e-08,
          -7.0
        ],
        "max": [
          17.855357160679613,
          5.000000010299686,
          7.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_HallA": {
      "category": "assembly",
      "width": 78.1171875,
      "depth": 16,
      "height": 10,
      "elevation": -48,
      "bounds": {
        "min": [
          -39.05859376682102,
          -1.3439034773909952e-08,
          -8.0
        ],
        "max": [
          39.05859376662932,
          10.000000018551077,
          8.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_ShopsA": {
      "category": "shops",
      "width": 127.765,
      "depth": 30,
      "height": 8,
      "elevation": -61.5,
      "bounds": {
        "min": [
          -63.88250001273504,
          -1.818386863305932e-08,
          -15.0
        ],
        "max": [
          63.88249999213926,
          8.000000018499122,
          15.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_OfficesA": {
      "category": "offices",
      "width": 37.03333333333333,
      "depth": 30,
      "height": 12,
      "elevation": -61.5,
      "bounds": {
        "min": [
          -18.516666684547936,
          0.0,
          -15.0
        ],
        "max": [
          18.516666680839002,
          12.000000015255068,
          15.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_WorkshopA": {
      "category": "industry",
      "width": 222.2,
      "depth": 30,
      "height": 12,
      "elevation": -61.5,
      "bounds": {
        "min": [
          -111.10000001803678,
          -1.7030060917022638e-08,
          -15.0
        ],
        "max": [
          111.100000015223,
          12.00000001681201,
          15.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_StorageA": {
      "category": "storage",
      "width": 138.875,
      "depth": 30,
      "height": 12.8,
      "elevation": -61.5,
      "bounds": {
        "min": [
          -69.43750001894199,
          -1.9100866666121874e-08,
          -15.0
        ],
        "max": [
          69.43750001841214,
          12.800000019345589,
          15.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_RecreationA": {
      "category": "recreation",
      "width": 111.1,
      "depth": 30,
      "height": 3,
      "elevation": -61.5,
      "bounds": {
        "min": [
          -55.55000001863896,
          -1.4127977010502946e-08,
          -15.0
        ],
        "max": [
          55.55000001863896,
          3.0000000192883363,
          15.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_CommunityA": {
      "category": "miscellaneous",
      "width": 107.39666666666666,
      "depth": 30,
      "height": 11.399999999999999,
      "elevation": -61.5,
      "bounds": {
        "min": [
          -53.698333351989355,
          -1.9592675926105585e-08,
          -15.0
        ],
        "max": [
          53.69833333639681,
          11.40000001593694,
          15.0
        ]
      },
      "masks": {}
    },
    "TorusDistrict_Path01": {
      "category": "circulation",
      "width": 44.58058563729617,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -22.290292818648084,
          0,
          -8.0
        ],
        "max": [
          22.290292818648084,
          0.06,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Path02": {
      "category": "circulation",
      "width": 45.260762809593245,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -22.630381404796623,
          0,
          -8.0
        ],
        "max": [
          22.630381404796623,
          0.06,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Path03": {
      "category": "circulation",
      "width": 65.81783146207749,
      "depth": 14,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -32.908915731038746,
          0,
          -7.0
        ],
        "max": [
          32.908915731038746,
          0.06,
          7.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Path04": {
      "category": "circulation",
      "width": 74.22463228843688,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -37.11231614421844,
          0,
          -8.0
        ],
        "max": [
          37.11231614421844,
          0.06,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Path05": {
      "category": "circulation",
      "width": 124.51907118976555,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -62.25953559488278,
          0,
          -3.0
        ],
        "max": [
          62.25953559488278,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Path06": {
      "category": "circulation",
      "width": 124.51907118976555,
      "depth": 14,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -62.25953559488278,
          0,
          -7.0
        ],
        "max": [
          62.25953559488278,
          0.06,
          7.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Path07": {
      "category": "circulation",
      "width": 269.4670816891705,
      "depth": 4,
      "height": 0.06,
      "elevation": -12,
      "bounds": {
        "min": [
          -134.73354084458526,
          0,
          -2.0
        ],
        "max": [
          134.73354084458526,
          0.06,
          2.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Path08": {
      "category": "circulation",
      "width": 269.4670816891705,
      "depth": 10,
      "height": 0.06,
      "elevation": -12,
      "bounds": {
        "min": [
          -134.73354084458526,
          0,
          -5.0
        ],
        "max": [
          134.73354084458526,
          0.06,
          5.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_ParkA": {
      "category": "park",
      "width": 578.0880051921844,
      "depth": 28.827790665643978,
      "height": 0.12,
      "elevation": -48,
      "bounds": {
        "min": [
          -289.0440025960922,
          0,
          -14.413895332821989
        ],
        "max": [
          289.0440025960922,
          1.02,
          14.413895332821989
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -2,
              2
            ],
            "clearWidth": 4
          },
          {
            "axis": "x",
            "zRange": [
              -13,
              -10.9
            ],
            "clearWidth": 2.1
          },
          {
            "axis": "x",
            "zRange": [
              10.9,
              13
            ],
            "clearWidth": 2.1
          },
          {
            "axis": "z",
            "intrinsicXStripes": [
              [
                -289.0440025960922,
                -285.05718876718055
              ],
              [
                -245.18905047806442,
                -241.20223664915278
              ],
              [
                -193.36047070221338,
                -189.37365687330177
              ],
              [
                -145.518704755274,
                -141.53189092636237
              ],
              [
                -95.68353189387878,
                -91.69671806496717
              ],
              [
                -49.83517286139519,
                -45.848359032483586
              ],
              [
                -1.993406914455818,
                1.993406914455818
              ],
              [
                45.848359032483586,
                49.83517286139522
              ],
              [
                91.69671806496717,
                95.68353189387881
              ],
              [
                141.5318909263624,
                145.51870475527403
              ],
              [
                189.3736568733018,
                193.36047070221338
              ],
              [
                241.20223664915278,
                245.18905047806442
              ],
              [
                285.05718876718055,
                289.0440025960922
              ]
            ],
            "clearWidth": 3.9868138289116164,
            "treeReserveCapsuleClearance": 0.35
          }
        ],
        "obstacles": [
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -265.32641616539456,
                0.12,
                -6.8
              ],
              [
                -262.32641616539456,
                1.02,
                -6.15
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -262.2264161653946,
                0.12,
                -6.75
              ],
              [
                -259.82641616539456,
                0.76,
                -5.65
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -265.32641616539456,
                0.12,
                5.6000000000000005
              ],
              [
                -262.32641616539456,
                1.02,
                6.25
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -262.2264161653946,
                0.12,
                5.65
              ],
              [
                -259.82641616539456,
                0.76,
                6.75
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -121.8011183245764,
                0.12,
                -6.8
              ],
              [
                -118.8011183245764,
                1.02,
                -6.15
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -118.70111832457638,
                0.12,
                -6.75
              ],
              [
                -116.3011183245764,
                0.76,
                -5.65
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -121.8011183245764,
                0.12,
                5.6000000000000005
              ],
              [
                -118.8011183245764,
                1.02,
                6.25
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -118.70111832457638,
                0.12,
                5.65
              ],
              [
                -116.3011183245764,
                0.76,
                6.75
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                21.724179516241794,
                0.12,
                -6.8
              ],
              [
                24.724179516241794,
                1.02,
                -6.15
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                24.82417951624179,
                0.12,
                -6.75
              ],
              [
                27.224179516241794,
                0.76,
                -5.65
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                21.724179516241794,
                0.12,
                5.6000000000000005
              ],
              [
                24.724179516241794,
                1.02,
                6.25
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                24.82417951624179,
                0.12,
                5.65
              ],
              [
                27.224179516241794,
                0.76,
                6.75
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                165.24947735706002,
                0.12,
                -6.8
              ],
              [
                168.24947735706002,
                1.02,
                -6.15
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                168.34947735706,
                0.12,
                -6.75
              ],
              [
                170.74947735706002,
                0.76,
                -5.65
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                165.24947735706002,
                0.12,
                5.6000000000000005
              ],
              [
                168.24947735706002,
                1.02,
                6.25
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                168.34947735706,
                0.12,
                5.65
              ],
              [
                170.74947735706002,
                0.76,
                6.75
              ]
            ]
          }
        ],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace01": {
      "category": "terrace",
      "width": 0.6801771722970216,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -0.3400885861485108,
          0,
          -8.0
        ],
        "max": [
          0.3400885861485108,
          0.06,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -0.3400885861485108,
              0.3400885861485108
            ],
            "clearWidth": 0.6801771722970216
          },
          {
            "perimeterClearance": 0.3400885861485108
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace02": {
      "category": "terrace",
      "width": 19.7519668730622,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -9.8759834365311,
          0,
          -8.0
        ],
        "max": [
          9.8759834365311,
          0.06,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace03": {
      "category": "terrace",
      "width": 21.554930281528414,
      "depth": 10,
      "height": 0.06,
      "elevation": -12,
      "bounds": {
        "min": [
          -10.777465140764207,
          0,
          -5.0
        ],
        "max": [
          10.777465140764207,
          0.06,
          5.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace04": {
      "category": "terrace",
      "width": 23.999999999999773,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -11.999999999999886,
          0,
          -8.0
        ],
        "max": [
          11.999999999999886,
          0.06,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace05": {
      "category": "terrace",
      "width": 32.90891573103886,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -16.45445786551943,
          0,
          -3.0
        ],
        "max": [
          16.45445786551943,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace06": {
      "category": "terrace",
      "width": 32.90891573103886,
      "depth": 14,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -16.45445786551943,
          0,
          -7.0
        ],
        "max": [
          16.45445786551943,
          0.96,
          7.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -9.177228932759714,
                0.06,
                -5.3999999999999995
              ],
              [
                -7.277228932759715,
                0.96,
                -4.75
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -12.727228932759715,
                0.06,
                -5.35
              ],
              [
                -10.327228932759716,
                0.7,
                -4.25
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                7.277228932759715,
                0.06,
                4.2
              ],
              [
                9.177228932759714,
                0.96,
                4.85
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                10.327228932759716,
                0.06,
                4.25
              ],
              [
                12.727228932759715,
                0.7,
                5.35
              ]
            ]
          }
        ],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace07": {
      "category": "terrace",
      "width": 35.71071428571429,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -17.855357142857144,
          0,
          -3.0
        ],
        "max": [
          17.855357142857144,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace08": {
      "category": "terrace",
      "width": 37.11231614421838,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -18.55615807210919,
          0,
          -8.0
        ],
        "max": [
          18.55615807210919,
          0.96,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -10.228079036054595,
                0.06,
                -6.3999999999999995
              ],
              [
                -8.328079036054596,
                0.96,
                -5.75
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -13.778079036054596,
                0.06,
                -6.35
              ],
              [
                -11.378079036054597,
                0.7,
                -5.25
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                8.328079036054596,
                0.06,
                5.2
              ],
              [
                10.228079036054595,
                0.96,
                5.85
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                11.378079036054597,
                0.06,
                5.25
              ],
              [
                13.778079036054596,
                0.7,
                6.35
              ]
            ]
          }
        ],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace09": {
      "category": "terrace",
      "width": 39.678571428571445,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -19.839285714285722,
          0,
          -3.0
        ],
        "max": [
          19.839285714285722,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace10": {
      "category": "terrace",
      "width": 42.346537622991875,
      "depth": 2,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -21.173268811495937,
          0,
          -1.0
        ],
        "max": [
          21.173268811495937,
          0.06,
          1.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.0
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace11": {
      "category": "terrace",
      "width": 43.10986056305683,
      "depth": 4,
      "height": 0.06,
      "elevation": -12,
      "bounds": {
        "min": [
          -21.554930281528414,
          0,
          -2.0
        ],
        "max": [
          21.554930281528414,
          0.06,
          2.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace12": {
      "category": "terrace",
      "width": 43.10986056305683,
      "depth": 10,
      "height": 0.06,
      "elevation": -12,
      "bounds": {
        "min": [
          -21.554930281528414,
          0,
          -5.0
        ],
        "max": [
          21.554930281528414,
          0.96,
          5.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -11.727465140764206,
                0.06,
                -3.4
              ],
              [
                -9.827465140764208,
                0.96,
                -2.75
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -15.277465140764207,
                0.06,
                -3.3499999999999996
              ],
              [
                -12.877465140764208,
                0.7,
                -2.25
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                9.827465140764208,
                0.06,
                2.1999999999999997
              ],
              [
                11.727465140764206,
                0.96,
                2.8499999999999996
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                12.877465140764208,
                0.06,
                2.25
              ],
              [
                15.277465140764207,
                0.7,
                3.3499999999999996
              ]
            ]
          }
        ],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace13": {
      "category": "terrace",
      "width": 45.260762809593245,
      "depth": 2,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -22.630381404796623,
          0,
          -1.0
        ],
        "max": [
          22.630381404796623,
          0.06,
          1.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.0
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace14": {
      "category": "terrace",
      "width": 45.26076280959319,
      "depth": 16,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -22.630381404796594,
          0,
          -8.0
        ],
        "max": [
          22.630381404796594,
          0.96,
          8.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -12.265190702398296,
                0.06,
                -6.3999999999999995
              ],
              [
                -10.365190702398298,
                0.96,
                -5.75
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -15.815190702398297,
                0.06,
                -6.35
              ],
              [
                -13.415190702398299,
                0.7,
                -5.25
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                10.365190702398298,
                0.06,
                5.2
              ],
              [
                12.265190702398296,
                0.96,
                5.85
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                13.415190702398299,
                0.06,
                5.25
              ],
              [
                15.815190702398297,
                0.7,
                6.35
              ]
            ]
          }
        ],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace15": {
      "category": "terrace",
      "width": 47.82971159823336,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -23.91485579911668,
          0,
          -3.0
        ],
        "max": [
          23.91485579911668,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace16": {
      "category": "terrace",
      "width": 47.82971159823336,
      "depth": 14,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -23.91485579911668,
          0,
          -7.0
        ],
        "max": [
          23.91485579911668,
          0.96,
          7.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -12.90742789955834,
                0.06,
                -5.3999999999999995
              ],
              [
                -11.00742789955834,
                0.96,
                -4.75
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -16.45742789955834,
                0.06,
                -5.35
              ],
              [
                -14.057427899558341,
                0.7,
                -4.25
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                11.00742789955834,
                0.06,
                4.2
              ],
              [
                12.90742789955834,
                0.96,
                4.85
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                14.057427899558341,
                0.06,
                4.25
              ],
              [
                16.45742789955834,
                0.7,
                5.35
              ]
            ]
          }
        ],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace17": {
      "category": "terrace",
      "width": 49.813640169661994,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -24.906820084830997,
          0,
          -3.0
        ],
        "max": [
          24.906820084830997,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace18": {
      "category": "terrace",
      "width": 49.813640169661994,
      "depth": 14,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -24.906820084830997,
          0,
          -7.0
        ],
        "max": [
          24.906820084830997,
          0.96,
          7.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                -13.403410042415498,
                0.06,
                -5.3999999999999995
              ],
              [
                -11.5034100424155,
                0.96,
                -4.75
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                -16.9534100424155,
                0.06,
                -5.35
              ],
              [
                -14.5534100424155,
                0.7,
                -4.25
              ]
            ]
          },
          {
            "kind": "bench",
            "boundsIntrinsic": [
              [
                11.5034100424155,
                0.06,
                4.2
              ],
              [
                13.403410042415498,
                0.96,
                4.85
              ]
            ]
          },
          {
            "kind": "planted-bed",
            "boundsIntrinsic": [
              [
                14.5534100424155,
                0.06,
                4.25
              ],
              [
                16.9534100424155,
                0.7,
                5.35
              ]
            ]
          }
        ],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace19": {
      "category": "terrace",
      "width": 50.04910714285717,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -25.024553571428584,
          0,
          -3.0
        ],
        "max": [
          25.024553571428584,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace20": {
      "category": "terrace",
      "width": 65.81783146207749,
      "depth": 6,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -32.908915731038746,
          0,
          -3.0
        ],
        "max": [
          32.908915731038746,
          0.06,
          3.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace21": {
      "category": "terrace",
      "width": 70.06875000000002,
      "depth": 4,
      "height": 0.06,
      "elevation": -12,
      "bounds": {
        "min": [
          -35.03437500000001,
          0,
          -2.0
        ],
        "max": [
          35.03437500000001,
          0.06,
          2.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.2
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace22": {
      "category": "terrace",
      "width": 74.22463228843688,
      "depth": 1.5861046671780112,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -37.11231614421844,
          0,
          -0.7930523335890056
        ],
        "max": [
          37.11231614421844,
          0.06,
          0.7930523335890056
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -0.7930523335890056,
              0.7930523335890056
            ],
            "clearWidth": 1.5861046671780112
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 0.7930523335890056
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace23": {
      "category": "terrace",
      "width": 74.22463228843688,
      "depth": 2,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -37.11231614421844,
          0,
          -1.0
        ],
        "max": [
          37.11231614421844,
          0.06,
          1.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.0
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace24": {
      "category": "terrace",
      "width": 78.1171875,
      "depth": 1.5861046671780112,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -39.05859375,
          0,
          -0.7930523335890056
        ],
        "max": [
          39.05859375,
          0.06,
          0.7930523335890056
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -0.7930523335890056,
              0.7930523335890056
            ],
            "clearWidth": 1.5861046671780112
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 0.7930523335890056
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace25": {
      "category": "terrace",
      "width": 78.1171875,
      "depth": 2,
      "height": 0.06,
      "elevation": -48,
      "bounds": {
        "min": [
          -39.05859375,
          0,
          -1.0
        ],
        "max": [
          39.05859375,
          0.06,
          1.0
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 1.0
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace26": {
      "category": "terrace",
      "width": 124.51907118976555,
      "depth": 1,
      "height": 0.06,
      "elevation": -32,
      "bounds": {
        "min": [
          -62.25953559488278,
          0,
          -0.5
        ],
        "max": [
          62.25953559488278,
          0.06,
          0.5
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -0.5,
              0.5
            ],
            "clearWidth": 1
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 0.5
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_Terrace27": {
      "category": "terrace",
      "width": 269.4670816891705,
      "depth": 1,
      "height": 0.06,
      "elevation": -12,
      "bounds": {
        "min": [
          -134.73354084458526,
          0,
          -0.5
        ],
        "max": [
          134.73354084458526,
          0.06,
          0.5
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [
          {
            "axis": "x",
            "zRange": [
              -0.5,
              0.5
            ],
            "clearWidth": 1
          },
          {
            "axis": "z",
            "xRange": [
              -1.0,
              1.0
            ],
            "clearWidth": 2
          },
          {
            "perimeterClearance": 0.5
          }
        ],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    },
    "TorusDistrict_TreeA": {
      "category": "trees",
      "width": 3,
      "depth": 3,
      "height": 4,
      "elevation": -48,
      "bounds": {
        "min": [
          -1.4206893820416095,
          0.0,
          -1.0627842023172838
        ],
        "max": [
          1.4206893820416095,
          4.0,
          1.0618931288576072
        ]
      },
      "masks": {
        "surface": "Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.",
        "clearRoutes": [],
        "obstacles": [],
        "raisedDecorationIsInterpretation": true,
        "capsuleTesting": "Geometric clear-route validation only; gameplay controller not exercised on unregistered kit."
      }
    }
  },
  "props": {
    "TorusNature_TreeA": {
      "min": [
        -2.849988,
        0.0,
        -2.114176
      ],
      "max": [
        2.595112,
        6.289752,
        2.236144
      ]
    },
    "TorusNature_ShrubA": {
      "min": [
        -1.349996,
        0.0,
        -0.942828
      ],
      "max": [
        1.46196,
        1.609036,
        1.183868
      ]
    },
    "TorusNature_FlowersA": {
      "min": [
        -1.269076,
        0.0,
        -0.688164
      ],
      "max": [
        1.354228,
        0.735,
        0.688164
      ]
    },
    "TorusNature_PondA": {
      "min": [
        -3.903116,
        0.0,
        -2.517524
      ],
      "max": [
        3.765688,
        0.865108,
        2.520864
      ]
    },
    "TorusBench_A": {
      "min": [
        -0.9,
        0.0,
        -0.3
      ],
      "max": [
        0.9,
        1.01,
        0.3
      ]
    },
    "TorusTable_A": {
      "min": [
        -0.82,
        0.0,
        -0.495
      ],
      "max": [
        0.82,
        0.76,
        0.495
      ]
    },
    "TorusPlanter_A": {
      "min": [
        -0.77,
        0.0,
        -0.415
      ],
      "max": [
        0.77,
        1.3,
        0.415
      ]
    }
  }
};
