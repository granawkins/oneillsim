import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createCapacityGround} from './capacity-ground.js';
import {createInteriorPlan,interiorFloorLedger,housingLevelShape} from './interior-plan.js';
import {landscapeGeometry} from './interior-landscape.js';
import {createInteriorMetreUVs,INTERIOR_MATERIAL_FAMILIES} from './interior-materials.js';
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
export function createInteriorRuntime({habitatGroup,colliderWorld,controller,world,ground,textureLibrary=null}){
 if(world.settlementDesign?.version!==2)return null;
 const plan=createInteriorPlan(),group=new THREE.Group();group.name='inhabited-garden';group.userData.capacityInterior=true;habitatGroup.add(group);
 const colors={ivory:0xe3dfcf,cream:0xcfc5af,glass:0x536f70,rail:0x788d82,path:0xd5ceb4,green:0x789757,darkgreen:0x466e4c,water:0x598c91,belt:0x467c7c,beltReverse:0x467c7c,gold:0xc5ad70,earth:0x8e9b68,stone:0x92927d,sage:0x8f9e84,clay:0xb0927c,meadow:0x8eaa69,grove:0x6f8b53};
 const materials=Object.fromEntries(Object.entries(colors).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,vertexColors:true,roughness:k==='glass'?.32:.86,metalness:k==='glass'?.15:0,side:THREE.DoubleSide})]));
 textureLibrary?.applyPalette(materials);
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
  const pale=b.category==='housing'?(b.facadeRhythm===2?'cream':'ivory'):'cream',accent=b.palette==='water'?'sage':b.palette==='orchard'?'clay':'earth';
  if(b.base<0){
   for(let k=0;k<=Math.ceil(b.width/15);k++)for(const side of [-1,1]){const z=b.z+side*(b.depth/2-.7),bottom=-Math.sqrt(65*65-z*z)+.4;solid(b.id+'-hull-pier-'+k+'-'+side,b.theta+(-b.width/2+1+k*(b.width-2)/Math.ceil(b.width/15))/R,z,bottom,.7,.7,b.base-bottom,'cream');}
  }
  if(b.base>0){
   // A continuous masonry retaining plinth, not a forest of thin stilts.
   solid(b.id+'-foundation-plinth',b.theta,b.z,0,b.width+.6,b.depth+.6,b.base,'stone');
   // Broad front stair reaches the SAME .24 m finished floor as the house.
   const side=Math.sign(b.z),front=b.z-side*b.depth/2,n=Math.ceil((b.base+.24)/.15);
   for(let j=0;j<n;j++)solid(b.id+'-entry-step-'+j,b.theta+(-b.width/2+3+(j+.5)*.3)/R,front-side*2,0,.32,2.4,(b.base+.24)*(j+1)/n,'path');
   // Low horizontal courses break up the earthbound retaining wall silhouette.
   for(let h=1.2;h<b.base;h+=1.2)solid('plinth-course',b.theta,front-side*.32,h,b.width,.08,.08,'earth',false);
  }
  for(let level=0;level<b.levels;level++){
   const h=b.base+level*b.storey,{width,depth,theta,z}=housingLevelShape(b,level),residential=b.category==='housing';
   solid(b.id+'-floor-'+level,theta,z,h,width,depth,.24,pale);
   solid(b.id+'-rear-'+level,theta,z+Math.sign(b.z||1)*(depth/2-.15),h+.24,width,.3,b.storey-.24,pale);
   for(const side of [-1,1])solid(b.id+'-end-'+level,theta+side*(width/2-.15)/R,z,h+.24,.3,depth,b.storey-.24,pale);
   const front=z-Math.sign(b.z||1)*depth/2,bays=Math.floor(width/4);
   for(let k=0;k<bays;k++){
    const t=theta+(-width/2+2+k*4)/R,shutter=residential&&(k+b.facadeRhythm)%4===0;
    // Recess-sized paired openings and stacked muted shutters create vertical
    // household groups instead of black continuous office-building stripes.
    solid(shutter?'house-shutter':'window',t,front+.25*Math.sign(b.z||1),h+.85,shutter?2.6:2.35,.16,1.65,shutter?accent:'glass',false);
    solid('mullion',t+1.8/R,front,h+.24,.18,.25,b.storey-.24,pale,false);
    if(residential)solid('garden-side-window',t,z+Math.sign(b.z)*(depth/2+.015),h+.85,2.15,.06,1.65,(k+b.facadeRhythm)%5===0?accent:'glass',false);
   }
   solid(b.id+'-balcony-'+level,theta,front-Math.sign(b.z||1)*.8,h,width,1.8,.22,pale);
   solid('balcony-rail',theta,front-Math.sign(b.z||1)*1.6,h+.9,width,.12,.12,'rail',false);
   for(const side of [-1,1]){
    solid('terrace-planter',theta+side*(width/2-2.8)/R,front-Math.sign(b.z||1)*.8,h+.22,3.8,.7,.5,'cream',false);
    solid('terrace-planting',theta+side*(width/2-2.8)/R,front-Math.sign(b.z||1)*.8,h+.72,3.5,.6,.3,'darkgreen',false);
    if(residential){
     // The previously single 10 m ribbon on every gable made all towers identical.
     // Small vertically aligned end openings leave substantial white wall around them.
     const count=Math.max(2,Math.floor(depth/4));
     for(let k=0;k<count;k++)solid('end-window',theta+side*(width/2+.015)/R,z+(k-(count-1)/2)*3.3,h+.85,.06,1.4,1.8,k===0&&b.facadeRhythm===1?accent:'glass',false);
    }else solid('end-window',theta+side*(width/2+.015)/R,z,h+1,.06,depth*.65,1.45,'glass',false);
   }
  }
  const roof=b.base+b.levels*b.storey,{width,depth,theta,z}=housingLevelShape(b,b.levels-1);
  solid(b.id+'-roof',theta,z,roof,width,depth,.25,pale);
  solid('roof-garden',theta,z,roof+.25,width-1.8,depth-2,.18,'green',false);
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
    if(h>1)for(const dz of [-1,1])solid('gallery-rail',t,a[1]+dz*(route.width/2-.08),h+1.05,w,.12,.13,'rail',false);
    if(route.supports&&j%6===0&&h>.5)for(const dz of [-1,1])solid(`interior-pier-${route.id}-${index}-${dz}`,t,a[1]+dz*1.4,0,.5,.5,h-.18,'cream');
   }
  }
 }
 // Arrival gardens frame the spoke with offset water courts and broad crossings.
 for(const court of plan.courts){
  solid(`interior-arrival-court-${court.id}`,court.theta,court.z,0,court.width,court.depth,.16,'path');
  solid(`interior-arrival-crossing-${court.id}`,court.theta,court.z/2,0,3,Math.abs(court.z),.16,'path');
  // Planted court edges enclose the gathering room while preserving a broad aisle.
  if(court.kind==='grove')for(const side of [-1,1])solid(`interior-court-bed-${court.id}-${side}`,court.theta+side*6/R,court.z,.16,4,16,.06,'darkgreen');
  else for(const side of [-1,1])solid(`interior-court-bed-${court.id}-${side}`,court.theta+side*8/R,court.z-5,.16,4,5,.06,'green');
 }
 // Park crosswalks meet both contour walks at grade, without aerial stilt bridges.
 // Each bank has its own park rhythm; do not flatten one hill with the other
 // bank's old mirrored full-width crossing. These link the contour walk to the toe.
 for(const hill of plan.hills)for(const side of [-1,1])solid(`interior-park-crossing-${hill.id}-${side}`,hill.theta+side*(hill.width/2+3)/R,hill.side*32,0,4,46,.16,'path');
 // Smooth curved landforms and their meandering 3 m summit walks share the
 // exact rendered triangles with collision. No stair-stack green wall strips.
 for(const hill of plan.hills){
  for(const path of [false,true]){
   const color=path?'path':['green','meadow','grove'][hill.groveStyle],geometry=landscapeGeometry(hill,{path}),key=`${hill.id}:${color}`;
   batches.set(key,{color,geometries:[geometry]});
   const root=new THREE.Group();root.add(new THREE.Mesh(geometry,materials[color]));root.name=`interior-landscape-${hill.id}-${path?'walk':'earth'}`;group.add(root);colliders.push({id:root.name,object:root});
  }
  // Flat toe apron ties the summit walk to the transverse ground crosswalk.
  for(const side of [-1,1])solid(`interior-park-apron-${hill.id}-${side}`,hill.theta+side*(hill.width/2+3)/R,hill.z,0,6,4,.16,'path');
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
 for(const [key,{color,geometries}]of batches){let geometry=mergeGeometries(geometries);if(textureLibrary&&INTERIOR_MATERIAL_FAMILIES[color]){const source=geometry;geometry=createInteriorMetreUVs(source,{surface:plan.hills.some(h=>key.startsWith(h.id+':'))?'top':'auto'});source.dispose();}const mesh=new THREE.Mesh(geometry,materials[color]);mesh.name='interior-batch-'+key;group.add(mesh);}
 const originalGroundGeometry=ground?.geometry;let metreGroundGeometry=null;
 if(textureLibrary&&ground){ground.updateMatrix();metreGroundGeometry=createInteriorMetreUVs(originalGroundGeometry,{matrix:ground.matrix,surface:'top'});ground.geometry=metreGroundGeometry;textureLibrary.apply(ground.material,'grass');}
 const groundRuntime=ground?createCapacityGround({ground,habitatGroup,plans:[{districts:plan.districts,groundPhysicsDistrictIds:plan.districts.filter(d=>d.kind==='residential').map(d=>d.id),groundOpenings}],colliderWorld,controller}):null;
 const previousGroundColor=ground?.material?.color?.clone();
 // Harmonize the plain with planted slopes instead of dark-green cutout bands.
 if(previousGroundColor)ground.material.color.setHex(0x536b3d);
 const previousVelocity=controller.surfaceVelocity;controller.surfaceVelocity=(position,grounded)=>conveyorVelocity(position,grounded);
 return {group,plan,ready:textureLibrary?.ready??Promise.resolve(),ground:groundRuntime,update(dt){const phase=dt*18*8/(TAU*R/160);materials.belt.map.offset.x-=phase;materials.beltReverse.map.offset.x+=phase;},ledger:interiorFloorLedger(plan),stats:{buildings:plan.buildings.length,physicalSolids:colliders.length,renderBatches:batches.size},dispose(){groundRuntime?.dispose();if(metreGroundGeometry){if(ground.geometry===metreGroundGeometry)ground.geometry=originalGroundGeometry;metreGroundGeometry.dispose();}textureLibrary?.dispose();if(previousGroundColor)ground.material.color.copy(previousGroundColor);controller.surfaceVelocity=previousVelocity;for(const c of colliders)colliderWorld.remove(c.id);group.removeFromParent();group.traverse(o=>o.geometry?.dispose());for(const m of Object.values(materials))m.dispose();}};
}
