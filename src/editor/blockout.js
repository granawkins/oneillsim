import * as THREE from 'three';
// Each block owns its resources so the editor's existing deletion path can dispose them.
export function createBlockout(spec) {
 const group=new THREE.Group();
 const material=new THREE.MeshStandardMaterial({color:spec.color,roughness:1});
 // Subdivide long landscape strips so they follow the habitat rather than float above it.
 const radius=830-(spec.elevation || 0);
 const pieces=Math.ceil(spec.width/12);
 for(let i=0;i<pieces;i++) {
  const x=(i+.5)*spec.width/pieces-spec.width/2;
  const angle=x/radius;
  const geometry=new THREE.BoxGeometry(spec.width/pieces,spec.height,spec.depth);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(radius*Math.sin(angle),radius*(1-Math.cos(angle))+spec.height/2+(spec.deck||0),0);
  mesh.rotation.z=angle;
  group.add(mesh);
 }
 group.name=spec.name;
 return group;
}
