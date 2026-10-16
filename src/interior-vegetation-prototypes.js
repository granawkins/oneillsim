import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Handmade reusable silhouettes; all dimensions are metres, root feet y=0.
// One opaque vertex-colour material, no alpha cards, downloads or per-frame work.
export const VEGETATION_KINDS = Object.freeze({
  fruit: {tree:true, radius:3.6, height:7.7, trunkRadius:.24, trunkHeight:3.1},
  birch: {tree:true, radius:2, height:9.5, trunkRadius:.17, trunkHeight:6.4},
  cedar: {tree:true, radius:2.7, height:8.9, trunkRadius:.26, trunkHeight:7.7},
  shrub: {radius:1, height:1.3}, fern: {radius:.85, height:.8},
  grass: {radius:.55, height:.75}, tallflower: {radius:.55, height:1.45},
});

export function createVegetationPrototypes() {
  const prototypes = {};
  for (const [kind,spec] of Object.entries(VEGETATION_KINDS)) {
    const pieces=[];
    function part(g,color,position=[0,0,0],scale=[1,1,1],quaternion=null) {
      g.scale(...scale); if(quaternion)g.applyQuaternion(quaternion); g.translate(...position);
      const p=g.attributes.position,n=g.attributes.normal,c=[],base=new THREE.Color(color);
      // Fixed facet variation and darker leaf undersides give depth at walking height.
      for(let i=0;i<p.count;i++) { const k=.85+.12*Math.sin(p.getX(i)*7+p.getY(i)*3)+.09*Math.max(0,n.getY(i));c.push(base.r*k,base.g*k,base.b*k); }
      g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
      g.deleteAttribute('uv'); const expanded=g.index?g.toNonIndexed():g; if(expanded!==g)g.dispose();pieces.push(expanded);
    }
    function limb(a,b,r0,r1,color) {
      const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);
      part(new THREE.CylinderGeometry(r1,r0,d.length(),6,1),color,A.clone().add(B).multiplyScalar(.5).toArray(),[1,1,1],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
    }
    const leaf=(p,s,color)=>part(new THREE.IcosahedronGeometry(1,0),color,p,s);
    const bloom=(p,s,color)=>part(new THREE.OctahedronGeometry(1,0),color,p,s);
    // Folded, pointed three-dimensional leaves/fronds, not crossed billboards.
    function blade(a,b,width,color) {
      const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),side=new THREE.Vector3(-d.z,0,d.x).normalize().multiplyScalar(width),m=A.clone().lerp(B,.55),ridge=m.clone().add(new THREE.Vector3(0,width*.25,0));
      const v=[...A.toArray(),...m.clone().add(side).toArray(),...ridge.toArray(),...A.toArray(),...ridge.toArray(),...m.clone().sub(side).toArray(),...ridge.toArray(),...m.clone().add(side).toArray(),...B.toArray(),...m.clone().sub(side).toArray(),...ridge.toArray(),...B.toArray()];
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();part(g,color);
    }
    if(spec.tree)limb([0,0,0],[kind==='birch'?.12:0,spec.trunkHeight,0],spec.trunkRadius,spec.trunkRadius*.45,kind==='birch'?0xc6c6ad:0x6e5a3e);
    if(kind==='fruit') {
      // Low spreading fork, five individually offset rounded fruit-tree crowns.
      const crowns=[[-1.8,4.5,.2],[1.7,4.8,.4],[-.3,5.8,-1.3],[.1,4.8,1.5],[.4,6.1,.1]];
      crowns.forEach((p,i)=>{limb([0,2.3+i*.1,0],p,.13,.055,0x756142);leaf(p,[i===4?1.8:1.65,1.45,1.6],[0x58783d,0x68894a,0x72944f][i%3]);});
      for(let i=0;i<9;i++){const a=i*2.4;leaf([Math.sin(a)*1.9,4.3+(i%3)*.65,Math.cos(a)*1.7],[.12,.14,.12],0xc39d50);}
    } else if(kind==='birch') {
      // Fine pale leader with black bark marks, upright separated leaf sprays.
      for(let i=0;i<7;i++)part(new THREE.BoxGeometry(.25,.07,.23),0x625f50,[.025+i*.012,1+i*.65,0]);
      for(let i=0;i<6;i++){const a=i*2.4,p=[Math.sin(a)*(i===5?.2:.85),4.6+i*.6,Math.cos(a)*.7];limb([.08,3.4+i*.4,0],p,.07,.025,0xb5b7a0);leaf(p,[.95,1.45,.9],i%2?0x8aab5d:0x759849);}
    } else if(kind==='cedar') {
      // Narrow spire above broad, asymmetrical horizontal whorls with exposed boughs.
      for(let i=0;i<6;i++){const y=2.7+i*.95,r=2.55-i*.36;for(let j=0;j<3;j++){const a=j*Math.PI*2/3+i*.65;limb([0,y+.2,0],[Math.sin(a)*r*.85,y-.15,Math.cos(a)*r*.85],.075,.02,0x68583e);}part(new THREE.ConeGeometry(r,1.9,9,1),i%2?0x4a7158:0x3d654d,[Math.sin(i)*.12,y+.3,Math.cos(i)*.12],[1,1,.87]);}
    } else if(kind==='shrub') {
      limb([0,0,0],[0,.45,0],.055,.025,0x6e6548);
      for(let i=0;i<5;i++){const a=i*2.4;leaf([Math.sin(a)*.47,.5+(i%2)*.2,Math.cos(a)*.43],[.55,.58,.52],i%2?0x608348:0x517647);}
    } else if(kind==='fern') {
      for(let i=0;i<7;i++){const a=i*Math.PI*2/7,tip=[Math.sin(a)*.78,.48+(i%2)*.22,Math.cos(a)*.78];blade([0,0,0],tip,.04,0x527b46);for(let j=1;j<=4;j++){const f=j/5,p=tip.map(v=>v*f);for(const s of [-1,1])blade(p,[p[0]+Math.sin(a+s*1.15)*.27*(1-f*.5),p[1]+.06,p[2]+Math.cos(a+s*1.15)*.27*(1-f*.5)],.065,0x648d50);}}
    } else if(kind==='grass') {
      for(let i=0;i<9;i++){const a=i*2.4,h=.4+(i%4)*.11;blade([Math.sin(a)*.1,0,Math.cos(a)*.1],[Math.sin(a)*.48,h,Math.cos(a)*.48],.045,i%2?0x8c9e5b:0x758e48);}
    } else if(kind==='tallflower') {
      for(let i=0;i<3;i++){const a=i*2.4,x=Math.sin(a)*.24,z=Math.cos(a)*.24,h=1.05+i*.16;limb([x,0,z],[x,h,z],.018,.012,0x678146);for(const s of [-1,1])blade([x,h*.4,z],[x+s*.28,h*.67,z+.12],.08,0x658b4f);bloom([x,h,z],[.085,.08,.085],0xb89944);for(let j=0;j<5;j++){const b=j*Math.PI*2/5;bloom([x+Math.sin(b)*.11,h-.02,z+Math.cos(b)*.11],[.09,.045,.09],i===1?0xb2a1ba:0xd9c880);}}
    }
    const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
    prototypes[kind]={geometry,spec,triangles:geometry.attributes.position.count/3};
  }
  return prototypes;
}
