import * as THREE from 'three';
const R=830;
// Authored park landform, not a historical dimensional claim. The cosine skirt
// meets the plain with zero slope on all four sides; there are no stacked steps.
export function landscapeHeight(hill,x,z){
 const u=2*x/hill.width,v=2*(z-hill.z)/hill.depth;
 if(Math.abs(u)>=1||Math.abs(v)>=1)return 0;
 // A restrained asymmetrical shoulder, while retaining the summit and smooth toe.
 return hill.height*Math.cos(u*Math.PI/2)**2*Math.cos(v*Math.PI/2)**2*(1+(hill.skew||0)*u*Math.sin(Math.PI*v));
}
export function landscapePathZ(hill,x){const f=x/hill.width+.5;return hill.z+(hill.pathBend??2.5)*Math.sin(2*Math.PI*f)+(hill.pathRipple||0)*Math.sin(4*Math.PI*f);}
export function landscapeGeometry(hill,{path=false}={}){
 const nx=Math.ceil(hill.width/2),nz=path?2:Math.ceil(hill.depth/1.25),vertices=[],colors=[],uvs=[],indices=[];
 for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
  const x=-hill.width/2+hill.width*i/nx;
  const z=path?landscapePathZ(hill,x)+(j/nz-.5)*3:hill.z-hill.depth/2+hill.depth*j/nz;
  // Ease the walk into the .16 m toe apron without a descending curb/drop.
  const toe=THREE.MathUtils.clamp((Math.abs(x)-hill.width/2+6)/6,0,1);
  const h=landscapeHeight(hill,x,z)+(path?.055+.105*toe*toe*(3-2*toe):0),t=hill.theta+x/R;
  vertices.push((R-h)*Math.cos(t),(R-h)*Math.sin(t),z);uvs.push(i/nx,j/nz);
  const tone=path?1:.9+.1*Math.cos(x*.09)*Math.sin(z*.17);colors.push(tone,tone,tone);
 }
 for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const a=i*(nz+1)+j,b=a+nz+1;indices.push(a,a+1,b,b,a+1,b+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
