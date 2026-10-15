import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createCapacityGround} from './capacity-ground.js';
import {createInteriorPlan,interiorFloorLedger} from './interior-plan.js';
const R=830,TAU=2*Math.PI;
export function interiorPoint(theta,z,height){return new THREE.Vector3((R-height)*Math.cos(theta),(R-height)*Math.sin(theta),z);}
// A curved solid has the same bottom surface in renderer and collision. Long
// galleries never become tangent boards floating above the toroidal ground.
export function curvedSolid(theta,z,height,width,depth,thickness){
 const g=new THREE.BoxGeometry(width,thickness,depth,Math.max(1,Math.ceil(width/4)),1,1),p=g.attributes.position,normals=g.attributes.normal,colors=[];
 for(let i=0;i<p.count;i++){const shade=normals.getY(i)>.5?1:normals.getY(i)<-.5?.42:Math.abs(normals.getX(i))>.5?.57:.77;colors.push(shade,shade,shade);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 for(let i=0;i<p.count;i++){const t=theta+p.getX(i)/R,h=height+p.getY(i)+thickness/2;p.setXYZ(i,(R-h)*Math.cos(t),(R-h)*Math.sin(t),z+p.getZ(i));}
 g.computeVertexNormals();return g;
}
export function conveyorHeight(){
 // One continuous level clears the retained .31 m spoke thresholds. Avoid
 // descending ramp facets repeatedly releasing capsule contact at belt speed.
 return .36;
}
export function conveyorVelocity(position,grounded){
 const h=R-Math.hypot(position.x,position.y),theta=Math.atan2(position.y,position.x);
 // Capsule support follows the chordal rendered deck through the shallow
 // threshold ramp; allow its sub-step grounding tolerance, not other levels.
 if(!grounded||Math.abs(h-conveyorHeight(theta))>.06)return new THREE.Vector3();
 const lane=position.z>=3&&position.z<=7?1:position.z>=-7&&position.z<=-3?-1:0;
 return new THREE.Vector3(-Math.sin(theta),Math.cos(theta),0).multiplyScalar(lane*18);
}
export function createInteriorRuntime({habitatGroup,colliderWorld,controller,world,ground}){
 if(world.settlementDesign?.version!==2)return null;
 const plan=createInteriorPlan(),group=new THREE.Group();group.name='inhabited-garden';group.userData.capacityInterior=true;habitatGroup.add(group);
 const colors={ivory:0xdedbc7,cream:0xcabfa2,glass:0x31565b,rail:0x788d82,path:0xd5ceb4,green:0x789757,darkgreen:0x466e4c,water:0x598c91,belt:0x467c7c,beltReverse:0x467c7c,gold:0xc5ad70,earth:0x8e9b68};
 const materials=Object.fromEntries(Object.entries(colors).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,vertexColors:true,roughness:k==='glass'?.32:.86,metalness:k==='glass'?.15:0,side:THREE.DoubleSide})]));
 for(const key of ['belt','beltReverse']){const pixels=new Uint8Array(32*4);for(let i=0;i<32;i++){const v=i<2?165:240;pixels.set([v,v,v,255],i*4);}const texture=new THREE.DataTexture(pixels,32,1);texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(8,1);texture.needsUpdate=true;materials[key].map=texture;}
 const batches=new Map(),colliders=[],objects=[];
 function solid(id,theta,z,height,width,depth,thickness,color='ivory',physical=true){
  if(!(width>0&&depth>0&&thickness>0))throw Error('Invalid interior solid '+id);
  const geometry=curvedSolid(theta,z,height,width,depth,thickness);
  if(id.startsWith('interior-belt-')||id==='dash'){
   const p=geometry.attributes.position;
   for(let j=0;j<p.count;j++){const x=p.getX(j),y=p.getY(j),r=Math.hypot(x,y),lift=conveyorHeight(Math.atan2(y,x))-.16;p.setXYZ(j,x*(r-lift)/r,y*(r-lift)/r,p.getZ(j));}
   geometry.computeVertexNormals();
  }
  const cell=Math.floor((((theta%TAU)+TAU)%TAU)*R/110),key=`${cell}:${color}`;
  if(!batches.has(key))batches.set(key,{color,geometries:[]});batches.get(key).geometries.push(geometry);
  if(physical){const mesh=new THREE.Mesh(geometry,materials[color]);const root=new THREE.Group();root.add(mesh);root.name=id;group.add(root);objects.push(root);colliders.push({id,object:root});}
 }
 // Continuous garden promenade + separated counter-running step-on belts.
 for(let i=0;i<160;i++){
  const a=i*TAU/160,b=(i+1)*TAU/160,theta=(a+b)/2,w=(b-a)*R+.015;
  for(const z of [-5,5]){
   solid(`interior-belt-${i}-${z}`,theta,z,0,w,4,.16,z>0?'belt':'beltReverse');
   // Small flush brass dashes suggest direction without trip obstacles.
   for(let j=0;j<4;j++)solid('dash',a+(j+.5)*(b-a)/4,z,.162,1.8,.12,.012,'gold',false);
  }
  solid(`interior-promenade-${i}`,theta,0,0,w,5,.16,'path');
  const d=plan.districts.find(d=>theta>=d.start&&theta<d.end);
  if(d?.kind==='agricultural')for(const z of [-7,0,7])solid(`interior-viaduct-pier-${i}-${z}`,theta,z,-39.9,1,1,39.9,'cream');
 }
 for(const b of plan.buildings){
  const pale=b.category==='housing'?(Number(b.id.split('-').at(-1))%4===0?'cream':'ivory'):'cream';
  if(b.base<0){
   for(let k=0;k<=Math.ceil(b.width/15);k++)for(const side of [-1,1]){const z=b.z+side*(b.depth/2-.7),bottom=-Math.sqrt(65*65-z*z)+.4;solid(b.id+'-hull-pier-'+k+'-'+side,b.theta+(-b.width/2+1+k*(b.width-2)/Math.ceil(b.width/15))/R,z,bottom,.7,.7,b.base-bottom,'cream');}
  }
  if(b.base>0){
   solid(b.id+'-podium',b.theta,b.z,b.base-.3,b.width,b.depth,.3,pale);
   for(let k=0;k<=Math.ceil(b.width/5);k++)for(const side of [-1,1])solid(b.id+'-foundation-'+k+'-'+side,b.theta+(-b.width/2+.5+k*(b.width-1)/Math.ceil(b.width/5))/R,b.z+side*(b.depth/2-.7),0,.55,.55,b.base-.3,'cream');
  }
  for(let level=0;level<b.levels;level++){
   const h=b.base+level*b.storey,depth=b.depth-(b.setback||0)*level,z=b.z+Math.sign(b.z||1)*(b.setback||0)*level/2;
   solid(b.id+'-floor-'+level,b.theta,z,h,b.width,depth,.24,pale);
   solid(b.id+'-rear-'+level,b.theta,z+Math.sign(b.z||1)*(depth/2-.15),h+.24,b.width,.3,b.storey-.24,pale);
   for(const side of [-1,1])solid(b.id+'-end-'+level,b.theta+side*(b.width/2-.15)/R,z,h+.24,.3,depth,b.storey-.24,pale);
   const front=z-Math.sign(b.z||1)*depth/2;
   for(let k=0;k<Math.floor(b.width/4);k++){
    const t=b.theta+(-b.width/2+2+k*4)/R;
    solid('window',t,front+.25*Math.sign(b.z||1),h+.85,3.35,.16,1.8,'glass',false);
    solid('mullion',t+1.8/R,front,h+.24,.18,.25,b.storey-.24,pale,false);
   }
   solid(b.id+'-balcony-'+level,b.theta,front-Math.sign(b.z||1)*.8,h,b.width,1.8,.22,pale);
   solid('balcony-rail',b.theta,front-Math.sign(b.z||1)*1.6,h+.9,b.width,.12,.12,'rail',false);
   for(const side of [-1,1]){
    solid('terrace-planter',b.theta+side*(b.width/2-2.8)/R,front-Math.sign(b.z||1)*.8,h+.22,3.8,.7,.5,'cream',false);
    solid('terrace-planting',b.theta+side*(b.width/2-2.8)/R,front-Math.sign(b.z||1)*.8,h+.72,3.5,.6,.3,'darkgreen',false);
    solid('end-window',b.theta+side*(b.width/2+.015)/R,z,h+1,.06,depth*.65,1.45,'glass',false);
   }
  }
  const roof=b.base+b.levels*b.storey,depth=b.depth-(b.setback||0)*(b.levels-1),z=b.z+Math.sign(b.z||1)*(b.setback||0)*(b.levels-1)/2;
  solid(b.id+'-roof',b.theta,z,roof,b.width,depth,.25,pale);
  solid('roof-garden',b.theta,z,roof+.25,b.width-1.8,depth-2,.18,'green',false);
 }
 // Subsurface civic street: narrow stair portals, real ceiling, and floor stairs.
 const groundOpenings=[];
 for(const d of plan.districts.filter(d=>d.kind==='residential')){
  groundOpenings.push({thetaStart:d.start+4/830,thetaEnd:d.start+11/830,zMin:-38,zMax:-34});
  const count=282,drop=42.16;
  for(let j=0;j<count;j++){
   const x=4.5+(j+.5)*.3,h=.16-drop*(j+1)/count;
   solid(`interior-descent-${d.id}-${j}`,d.start+x/R,-36,h-.24,.32,4,.24,'path');
   if(j%30===0)solid(`interior-descent-support-${d.id}-${j}`,d.start+x/R,-36,-42.3,.5,.5,Math.max(.1,h+42.06),'cream');
  }
  solid(`interior-lower-return-${d.id}`,d.start+55/R,-36,-42.24,74,4,.24,'path');
  solid(`interior-lower-crossing-${d.id}`,d.start+20/R,-18,-42.24,4,36,.24,'path');
  solid(`interior-civic-street-${d.id}`,d.start+480/R,0,-42,920,8,.24,'path');
  // The .24 m building floor and civic street share their exact height.
  solid(`interior-civic-entry-${d.id}`,d.start+20/R,-2,-42.24,4,4,.48,'path');
 }
 for(const b of plan.buildings.filter(b=>b.base<0&&b.levels>1)){
  const rise=(b.levels-1)*b.storey,n=Math.ceil(rise/.15),run=n*.3;
  for(let j=0;j<n;j++)solid(`interior-civic-stair-${b.id}-${j}`,b.theta-b.width/2/R+(2+(j+.5)*.3)/R,Math.sign(b.z)*1.1,b.base+.24+rise*(j+1)/n-.2,.32,1.8,.2,'path');
 }
 // Elevated galleries with continuous grade at ends, pier supports and railings.
 for(const route of plan.paths){
  let index=0;
  for(let s=1;s<route.points.length;s++){
   const a=route.points[s-1],b=route.points[s],length=(b[0]-a[0])*R,n=Math.ceil(length/3);
   for(let j=0;j<n;j++){
    const f=(j+.5)/n,t=THREE.MathUtils.lerp(a[0],b[0],f),h=THREE.MathUtils.lerp(a[2],b[2],f),w=length/n+.02;
    solid(`interior-gallery-${route.id}-${index++}`,t,a[1],h-.18,w,route.width,.18,'path');
    for(const dz of [-1,1])solid('gallery-rail',t,a[1]+dz*1.92,h+1.05,w,.12,.13,'rail',false);
    if(j%6===0&&h>.5)for(const dz of [-1,1])solid(`interior-pier-${route.id}-${index}-${dz}`,t,a[1]+dz*1.4,0,.5,.5,h-.18,'cream');
   }
  }
 }
 // Arrival gardens frame the spoke with offset water courts and broad crossings.
 for(const d of plan.districts.filter(d=>d.kind==='residential')){
  solid(`interior-arrival-court-${d.id}-west`,d.center-4/R,-23,0,22,18,.16,'path');
  solid(`interior-arrival-court-${d.id}-east`,d.center+8/R,25,0,20,16,.16,'path');
  for(const offset of [-21,21])solid(`interior-arrival-crossing-${d.id}-${offset}`,d.center+offset/R,0,0,3,64,.16,'path');
 }
 // Low bridges join the two contour galleries in the spoke neighborhood.
 for(const d of plan.districts.filter(d=>d.kind==='residential'))for(const offset of [-120,110]){
  const t=d.center+offset/R;
  solid(`interior-crossbridge-${d.id}-${offset}`,t,0,9,4,74,.24,'path');
  for(const z of [-30,-12,12,30])solid(`interior-crosspier-${d.id}-${offset}-${z}`,t,z,0,.7,.7,9,'cream');
 }
 // Hills are curved planted earth volumes; never support invisible airborne homes.
 for(const hill of plan.hills){
  const n=40;
  for(let i=0;i<n;i++){
   const x=(i+.5)/n*hill.width-hill.width/2,h=hill.height*Math.sin(Math.PI*(i+.5)/n)**2;
   // Only the outside verge: buildings have their own exact footings.
   for(let band=0;band<4;band++){const z=Math.sign(hill.z)*(54.5+band*1.7),rise=h*Math.sin(Math.PI*(band+.5)/4);solid(`interior-hill-${hill.id}-${i}-${band}`,hill.theta+x/R,z,0,hill.width/n+.03,1.72,Math.max(.1,rise),'green');}
  }
 }
 // Farm entry ramps join ground promenade to the retained original stair chain.
 for(const d of plan.districts.filter(d=>d.kind==='agricultural')){
  solid(`interior-farm-apron-${d.id}`,d.start+8/R,25,0,6,50,.16,'path');
  for(let j=0;j<50;j++)solid(`interior-farm-ramp-${d.id}-${j}`,d.start+(10+j*2)/R,50,j*.1,2.04,4,.2,'path');
 }
 // Register exact original solid geometry, then merge render meshes by material
 // and spatial cell. Collision does not depend on render-batch visibility.
 group.updateMatrixWorld(true);
 for(const c of colliders){colliderWorld.setObject(c.id,c.object,habitatGroup);c.object.removeFromParent();}
 for(const [key,{color,geometries}]of batches){const mesh=new THREE.Mesh(mergeGeometries(geometries),materials[color]);mesh.name='interior-batch-'+key;group.add(mesh);}
 const groundRuntime=ground?createCapacityGround({ground,habitatGroup,plans:[{districts:plan.districts,groundPhysicsDistrictIds:plan.districts.filter(d=>d.kind==='residential').map(d=>d.id),groundOpenings}],colliderWorld,controller}):null;
 const previousVelocity=controller.surfaceVelocity;controller.surfaceVelocity=(position,grounded)=>conveyorVelocity(position,grounded);
 return {group,plan,ground:groundRuntime,update(dt){const phase=dt*18*8/(TAU*R/160);materials.belt.map.offset.x-=phase;materials.beltReverse.map.offset.x+=phase;},ledger:interiorFloorLedger(plan),stats:{buildings:plan.buildings.length,physicalSolids:colliders.length,renderBatches:batches.size},dispose(){groundRuntime?.dispose();controller.surfaceVelocity=previousVelocity;for(const c of colliders)colliderWorld.remove(c.id);group.removeFromParent();group.traverse(o=>o.geometry?.dispose());for(const m of Object.values(materials))m.dispose();}};
}
