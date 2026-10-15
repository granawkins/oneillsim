// User-directed opaque district partitions, not a claimed SP-413 detail.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {districts,settlementRadius,tubeRadius} from './settlement-plan.js';

export const BOUNDARY_SPEC=Object.freeze({radius:settlementRadius,tubeRadius,thickness:.6,
  headHeight:4.2,segments:256,shellOverlap:.015});
export const BOUNDARY_PORTALS=Object.freeze([
  Object.freeze({id:'reverse-belt',zMin:-7.4,zMax:-2.7,floor:.36,ceiling:4.2}),
  Object.freeze({id:'promenade',zMin:-2.5,zMax:2.5,floor:.16,ceiling:4.2}),
  Object.freeze({id:'forward-belt',zMin:2.7,zMax:7.4,floor:.36,ceiling:4.2})
]);
export function createBoundaryPlan(){
  return districts.map((district,i)=>({id:`interior-boundary-${district.id}`,theta:district.start,
    before:districts[(i+districts.length-1)%districts.length].id,after:district.id,
    portals:BOUNDARY_PORTALS,thickness:BOUNDARY_SPEC.thickness}));
}
export function boundaryPoint(theta,z,height){
  return new THREE.Vector3((settlementRadius-height)*Math.cos(theta),(settlementRadius-height)*Math.sin(theta),z);
}
// Extrusion local (x,y,z) = (tube-axis,height,angular arc). Wrapping both
// faces keeps the partition inside its exact toroidal cross-section at any angle.
function wrap(geometry,theta){
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const axis=p.getX(i),h=p.getY(i),t=theta+(p.getZ(i)-BOUNDARY_SPEC.thickness/2)/settlementRadius;
    p.setXYZ(i,(settlementRadius-h)*Math.cos(t),(settlementRadius-h)*Math.sin(t),axis);
  }
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function createBoundaryGeometry(theta){
  const shape=new THREE.Shape(),n=BOUNDARY_SPEC.segments;
  // Circumscribe the analytic tube, rather than leave polygon/chord peepholes.
  // The tiny hidden overlap is intentional, and does not change exterior meshes.
  const radius=tubeRadius/Math.cos(Math.PI/n)+BOUNDARY_SPEC.shellOverlap;
  for(let i=0;i<n;i++){
    const a=i*2*Math.PI/n,z=radius*Math.cos(a),h=radius*Math.sin(a);
    if(i===0)shape.moveTo(z,h);else shape.lineTo(z,h);
  }
  shape.closePath();
  for(const portal of BOUNDARY_PORTALS){
    const hole=new THREE.Path();hole.moveTo(portal.zMin,portal.floor);
    hole.lineTo(portal.zMin,portal.ceiling);hole.lineTo(portal.zMax,portal.ceiling);
    hole.lineTo(portal.zMax,portal.floor);hole.closePath();shape.holes.push(hole);
  }
  return wrap(new THREE.ExtrudeGeometry(shape,{depth:BOUNDARY_SPEC.thickness,bevelEnabled:false,steps:1,curveSegments:1}),theta);
}
// Frame bands are real solid returns outside the actual clear opening. They do
// not put a decorative panel, glass plane, sill or collider across either belt.
function frameGeometry(boundary){
  const parts=[];
  for(const p of boundary.portals){
    for(const z of [p.zMin-.09,p.zMax+.09]){
      const g=new THREE.BoxGeometry(.18,p.ceiling-p.floor+.2,BOUNDARY_SPEC.thickness+.1);
      g.translate(z,(p.floor+p.ceiling)/2,BOUNDARY_SPEC.thickness/2);parts.push(wrap(g,boundary.theta));
    }
    const g=new THREE.BoxGeometry(p.zMax-p.zMin+.36,.22,BOUNDARY_SPEC.thickness+.1);
    g.translate((p.zMin+p.zMax)/2,p.ceiling+.11,BOUNDARY_SPEC.thickness/2);parts.push(wrap(g,boundary.theta));
  }
  const merged=mergeGeometries(parts);for(const g of parts)g.dispose();return merged;
}
/**
 * Mount after createInteriorRuntime has built the continuous surface decks.
 * Does not mutate world, terraces, ground policy, controller, belts or ledger.
 * Caller owns lifecycle and can parent the root to its interior visibility root.
 */
export function createInteriorBoundaries({habitatGroup,colliderWorld,parent=habitatGroup}){
  if(!habitatGroup?.isObject3D||!parent?.isObject3D||!colliderWorld?.setObject)
    throw new TypeError('createInteriorBoundaries requires habitatGroup and colliderWorld');
  const group=new THREE.Group();group.name='interior-district-boundaries';group.userData.capacityInterior=true;
  const wallMaterial=new THREE.MeshStandardMaterial({name:'opaque-district-partition',color:0xc8c6b4,
    roughness:.9,side:THREE.DoubleSide,transparent:false,opacity:1});
  const frameMaterial=new THREE.MeshStandardMaterial({name:'district-portal-frame',color:0x65887f,
    roughness:.7,side:THREE.DoubleSide,transparent:false,opacity:1});
  const plan=createBoundaryPlan(),registered=[];parent.add(group);
  let triangles=0;
  for(const boundary of plan){
    const root=new THREE.Group();root.name=boundary.id;root.userData.boundary=boundary;
    const wall=new THREE.Mesh(createBoundaryGeometry(boundary.theta),wallMaterial);wall.name=boundary.id+'-opaque-wall';
    const frame=new THREE.Mesh(frameGeometry(boundary),frameMaterial);frame.name=boundary.id+'-doorway-frames';
    root.add(wall,frame);group.add(root);
    for(const mesh of [wall,frame])triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
    group.updateWorldMatrix(true,true);colliderWorld.setObject(boundary.id,root,habitatGroup);registered.push(boundary.id);
  }
  let disposed=false;
  return {group,plan,stats:{partitions:plan.length,portals:plan.length*BOUNDARY_PORTALS.length,renderMeshes:plan.length*2,triangles},
    dispose(){if(disposed)return;disposed=true;for(const id of registered)colliderWorld.remove(id);
      group.removeFromParent();group.traverse(o=>o.geometry?.dispose());wallMaterial.dispose();frameMaterial.dispose();}
  };
}
