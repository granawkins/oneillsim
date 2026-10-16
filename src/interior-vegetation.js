import * as THREE from 'three';
import {createInteriorPlan} from './interior-plan.js';
import {landscapeHeight,landscapePathZ} from './interior-landscape.js';
import {createVegetationPrototypes,VEGETATION_KINDS} from './interior-vegetation-prototypes.js';

const R=830,TAU=Math.PI*2,activeRoots=new WeakMap();
const arc=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b))*R;
export const INTERIOR_VEGETATION_SEED='inhabited-woodland-v1';
function hash(text) {let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed) {let a=hash(seed);return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function distanceSegment(x,z,a,b) {const dx=(b[0]-a[0])*R,dz=b[1]-a[1],px=arc(x,a[0]),pz=z-a[1],f=THREE.MathUtils.clamp((px*dx+pz*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(px-f*dx,pz-f*dz);}

// Conservative FULL silhouette clearances, not just trunk-center tests.
export function vegetationReservation(plan,hill,x,z,radius=0) {
  const theta=hill.theta+x/R,pathZ=landscapePathZ(hill,x);
  if(Math.abs(x)+radius>hill.width/2-7||Math.abs(z-hill.z)+radius>hill.depth/2-1)return 'park-edge-and-apron';
  if(Math.abs(z)<13+radius)return 'central-promenade-and-conveyors';
  // 3m summit ribbon + 1m margin, multiplied by a slope bound for perpendicular clearance.
  const slope=TAU*Math.abs(hill.pathBend||0)/hill.width+2*TAU*Math.abs(hill.pathRipple||0)/hill.width;
  if(Math.abs(z-pathZ)<(2.5+radius)*Math.sqrt(1+slope*slope))return 'summit-walk';
  // Keep a continuous transverse grass crossing at the summit and a broad open
  // meadow on the quieter bank. These are NOT sparse random holes in a forest.
  if(Math.abs(x)<3+radius)return 'transverse-vista';
  const quiet=hill.groveStyle===1?-1:1,meadowZ=hill.z+quiet*9;
  if((x/(hill.width*.28+radius))**2+((z-meadowZ)/(7+radius))**2<1)return 'open-meadow';
  for(const b of plan.buildings||[]) {
    // Subsurface service rooms do not consume the surface park, but portals do.
    if(b.base<0)continue;
    if(Math.abs(arc(theta,b.theta))<b.width/2+4+radius&&Math.abs(z-b.z)<b.depth/2+4+radius)return 'building-and-entry';
  }
  for(const p of plan.paths||[])for(let i=1;i<p.points.length;i++)if(distanceSegment(theta,z,p.points[i-1],p.points[i])<p.width/2+1+radius)return 'gallery';
  for(const c of plan.courts||[]) {
    if(Math.abs(arc(theta,c.theta))<c.width/2+2+radius&&Math.abs(z-c.z)<c.depth/2+2+radius)return 'court';
    if(Math.abs(arc(theta,c.theta))<2.5+radius&&z*Math.sign(c.z)>=-radius&&Math.abs(z)<Math.abs(c.z)+radius)return 'court-entry';
  }
  for(const h of plan.hills||[])for(const side of [-1,1]) {
    const dx=Math.abs(arc(theta,h.theta+side*(h.width/2+3)/R));
    if(dx<3+radius&&Math.abs(z-h.side*32)<24+radius)return 'transverse-path';
    if(dx<4+radius&&Math.abs(z-h.z)<3+radius)return 'summit-apron';
  }
  for(const d of (plan.districts||[]).filter(d=>d.kind==='residential'))if(arc(theta,d.start)>0&&arc(theta,d.start)<100+radius&&Math.abs(z+36)<4+radius)return 'civic-descent';
  return null;
}

function savedObstacles(world,hill) {
  // Existing authored OBJ placements stay untouched. Reserve their roots/solid
  // footprints, excluding roofs and exterior transform specimens explicitly.
  return (world?.assets||[]).filter(a=>!a[7]?.worldTransform&&Math.abs(arc(a[2],hill.theta))<hill.width/2+10&&Math.abs(a[3]-hill.z)<hill.depth/2+8&&Math.abs((a[7]?.height||0)+.05-landscapeHeight(hill,arc(a[2],hill.theta),a[3]))<2)
    .map(a=>({x:arc(a[2],hill.theta),z:a[3],radius:a[7]?.collisionMode==='none'?.45:Math.max(.8,a[4]*.5)}));
}

export function generateInteriorVegetation({plan=createInteriorPlan(),world,seed=INTERIOR_VEGETATION_SEED}={}) {
  const placements=[];
  for(const hill of [...plan.hills].sort((a,b)=>a.id.localeCompare(b.id))) {
    const occupied=savedObstacles(world,hill),trees=[];
    // Spatially coherent woodland lobes, different on each authored grove bank.
    const density=(x,z)=>{
      const u=x/hill.width,v=z-hill.z,main=hill.groveStyle===1?1:-1;
      const lobe=(cx,cz,wx,wz)=>Math.exp(-(((u-cx)/wx)**2)-((v-cz)/wz)**2);
      return Math.min(1,lobe(-.25,main*12,.24,7)+lobe(.29,main*10,.22,8)+.8*lobe(.36,-main*12,.16,6));
    };
    function candidate(kind,x,z,rng,serial) {
      const spec=VEGETATION_KINDS[kind],scale=spec.tree?.84+rng()*.28:.72+rng()*.5,radius=spec.radius*scale;
      if(vegetationReservation(plan,hill,x,z,radius))return;
      if(occupied.some(o=>Math.hypot(o.x-x,o.z-z)<o.radius+(spec.tree?1.3:.45)))return;
      if(trees.some(o=>Math.hypot(o.x-x,o.z-z)<(spec.tree?4.5:.7)))return;
      const p={id:`interior-vegetation-${hill.id}-${serial}`,hillId:hill.id,districtId:hill.districtId,kind,x,z,theta:hill.theta+x/R,height:landscapeHeight(hill,x,z),scale,yaw:rng()*TAU,radius,blocking:!!spec.tree};
      placements.push(p);if(spec.tree)trees.push(p);
    }
    for(const [layer,step] of [['tree',5.4],['understory',1.85]]) {
      const rng=random(seed+':'+hill.id+':'+layer);let serial=0;
      for(let x0=-hill.width/2+step/2;x0<hill.width/2;x0+=step)for(let z0=hill.z-hill.depth/2+step/2;z0<hill.z+hill.depth/2;z0+=step) {
        const x=x0+(rng()-.5)*step*.84,z=z0+(rng()-.5)*step*.84,d=density(x,z),pick=rng();serial++;
        if(pick>(layer==='tree'?.68*d:.13+.8*d))continue;
        const r=rng(),kind=layer==='tree'?(['fruit','birch','cedar'][(hill.groveStyle+(r<.48?0:r<.8?1:2))%3]):(d>.5?(r<.3?'shrub':r<.67?'fern':r<.9?'grass':'tallflower'):(r<.66?'grass':r<.86?'tallflower':'fern'));
        candidate(kind,x,z,rng,layer+'-'+serial);
      }
    }
  }
  return placements;
}

function placementMatrix(p) {
  const c=Math.cos(p.theta),s=Math.sin(p.theta),basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(-s,c,0),new THREE.Vector3(-c,-s,0),new THREE.Vector3(0,0,1));
  const q=new THREE.Quaternion().setFromRotationMatrix(basis).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw));
  return new THREE.Matrix4().compose(new THREE.Vector3((R-p.height)*c,(R-p.height)*s,p.z),q,new THREE.Vector3(p.scale,p.scale,p.scale));
}

/** Additive scenery only: never mutates world, plan, saved OBJ trees or catalogs. */
export function createInteriorVegetation({habitatGroup,colliderWorld,plan=createInteriorPlan(),world,seed=INTERIOR_VEGETATION_SEED}) {
  if(!habitatGroup?.isObject3D)throw new TypeError('createInteriorVegetation requires habitatGroup');
  if(typeof colliderWorld?.setObject!=='function'||typeof colliderWorld?.remove!=='function')throw new TypeError('createInteriorVegetation requires colliderWorld for physical trunks');
  if(activeRoots.has(habitatGroup))throw new Error('Interior vegetation already registered for this habitat; dispose first');
  const placements=generateInteriorVegetation({plan,world,seed});
  for(const p of placements)if(p.blocking&&colliderWorld?.colliders?.has(p.id))throw new Error('Existing collider ID '+p.id);
  const group=new THREE.Group();group.name='interior-vegetation';group.userData.capacityInterior=true;
  // Nest beneath the existing runtime root when present; fallback is marked for
  // the same reversible exterior culling policy. Rotation inherited exactly once.
  (habitatGroup.children.find(o=>o.name==='inhabited-garden')||habitatGroup).add(group);
  const prototypes=createVegetationPrototypes(),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});
  const batches=new Map(),colliderIds=[],collisionGeometry=new Map();
  const stats={seed,plants:placements.length,trees:0,understory:0,byKind:{},renderBatches:0,drawCallsUpperBound:0,triangles:0,prototypeTriangles:{},collisionTriangles:0};
  let disposed=false;
  function dispose() {
    if(disposed)return;disposed=true;
    for(const id of colliderIds)colliderWorld.remove(id);
    group.removeFromParent();group.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
    for(const p of Object.values(prototypes))p.geometry.dispose();
    for(const g of collisionGeometry.values())g.dispose();material.dispose();activeRoots.delete(habitatGroup);
  }
  try {
    for(const [kind,p] of Object.entries(prototypes))stats.prototypeTriangles[kind]=p.triangles;
    for(const p of placements) {
      const key=p.hillId+':'+p.kind;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(p);
      stats.byKind[p.kind]=(stats.byKind[p.kind]||0)+1;stats[p.blocking?'trees':'understory']++;
      if(p.blocking&&colliderWorld) {
        const spec=VEGETATION_KINDS[p.kind];
        if(!collisionGeometry.has(p.kind)) {
          // Six-sided tapered trunk matches the rendered leader; no leaf solids,
          // fictitious canopy AABB, or InstancedMesh collision traversal.
          const lean=p.kind==='birch'?.12:0,delta=new THREE.Vector3(lean,spec.trunkHeight,0);
          const g=new THREE.CylinderGeometry(spec.trunkRadius*.45,spec.trunkRadius,delta.length(),6,1);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()));g.translate(lean/2,spec.trunkHeight/2,0);collisionGeometry.set(p.kind,g);
        }
        const mesh=new THREE.Mesh(collisionGeometry.get(p.kind),material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(placementMatrix(p));group.add(mesh);group.updateWorldMatrix(true,true);
        colliderIds.push(p.id);colliderWorld.setObject(p.id,mesh,habitatGroup);mesh.removeFromParent();
      }
    }
    for(const [key,items] of batches) {
      const {geometry,triangles}=prototypes[items[0].kind],mesh=new THREE.InstancedMesh(geometry,material,items.length);mesh.name=key;mesh.userData.interiorVegetation=true;mesh.userData.collision=false;
      items.forEach((p,i)=>mesh.setMatrixAt(i,placementMatrix(p)));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.frustumCulled=true;group.add(mesh);
      stats.triangles+=triangles*items.length;
    }
    stats.renderBatches=batches.size;stats.drawCallsUpperBound=batches.size;stats.collisionTriangles=colliderIds.reduce((n,id)=>n+colliderWorld.colliders.get(id).length,0);
    activeRoots.set(habitatGroup,group);
    return {group,placements,stats,dispose};
  } catch(error) {dispose();throw error;}
}
