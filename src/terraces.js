import * as THREE from 'three';
import { characterColliders } from './physics/collider-world.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {getTerraces,selectDeck,selectedDeckId,deckContains} from './terrace-surfaces.js';
export const terraceMeshes=[];
export function terraceGeometry(start,end,zMin,zMax,height,endHeight=height,thickness=.4) {
 const points=[];const point=(theta,z,h)=>[(830-h)*Math.cos(theta),(830-h)*Math.sin(theta),z];
 const quad=(a,b,c,d)=>points.push(...a,...b,...c,...a,...c,...d);
 const count=Math.max(1,Math.ceil((end-start)*830/6));
 for(let i=0;i<count;i++) {
  const a=start+(end-start)*i/count,b=start+(end-start)*(i+1)/count;
  const ha=height+(endHeight-height)*i/count,hb=height+(endHeight-height)*(i+1)/count;
  quad(point(a,zMin,ha),point(b,zMin,hb),point(b,zMax,hb),point(a,zMax,ha));
  for(const z of [zMin,zMax])quad(point(a,z,ha),point(b,z,hb),point(b,z,hb-thickness),point(a,z,ha-thickness));
  quad(point(a,zMin,ha-thickness),point(a,zMax,ha-thickness),point(b,zMax,hb-thickness),point(b,zMin,hb-thickness));
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.computeVertexNormals();return g;
}
export function createTerraces(habitat) {
 const {decks,stairs}=getTerraces();
 function add(geometry,deckId,color,stairId=null){const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:1}));mesh.userData={deckId,stairId,terrace:true};terraceMeshes.push(mesh);habitat.add(mesh);characterColliders.setObject(mesh,mesh,habitat);}
 for(const d of decks){
  const cuts=stairs.filter(s=>s.upper===d.id);
  const boundaries=[...new Set([d.start,d.end,...cuts.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
  for(const [lo,hi] of d.bands){
   const zs=[...new Set([lo,hi,...cuts.flatMap(s=>[s.z-s.width/2,s.z+s.width/2]).filter(z=>z>lo&&z<hi)])].sort((a,b)=>a-b);
   for(let i=0;i<boundaries.length-1;i++)for(let j=0;j<zs.length-1;j++)if(deckContains(d,(boundaries[i]+boundaries[i+1])/2,(zs[j]+zs[j+1])/2))add(terraceGeometry(boundaries[i],boundaries[i+1],zs[j],zs[j+1],d.height),d.id,d.color);
  }
 }
 for(const s of stairs){
  const upper=decks.find(d=>d.id===s.upper),lower=decks.find(d=>d.id===s.lower);
  const count=Math.ceil((upper.height-lower.height)/.15);
  const steps=[];
  for(let i=0;i<count;i++){
   const a=s.start+(s.end-s.start)*i/count,b=s.start+(s.end-s.start)*(i+1)/count,h=upper.height+(lower.height-upper.height)*i/count;
   steps.push(terraceGeometry(a,b,s.z-s.width/2,s.z+s.width/2,h,h,.2));
  }
  add(mergeGeometries(steps),s.upper,'#d6c99d',s.id);
  steps.forEach(g=>g.dispose());
 }
}
export function setTerraceView(id,habitat){
 selectDeck(id);
 habitat.traverse(object=>{
  if(object.userData?.deckId)object.visible=!id||object.userData.deckId===id;
 });
}
export function terracePickMeshes(){return terraceMeshes.filter(m=>!selectedDeckId||m.userData.deckId===selectedDeckId);}
