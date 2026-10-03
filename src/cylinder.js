import * as THREE from 'three';
import {inTerraceSector} from './terrace-surfaces.js';

// SP-413 single-torus baseline: major radius 830 m, minor radius 65 m.
export const TORUS_MAJOR_RADIUS = 830;
export const TUBE_RADIUS = 65;
// Legacy name retained for the torus module; this is the tube-centerline radius.
export const CYLINDER_RADIUS = TORUS_MAJOR_RADIUS;
export const CYLINDER_LENGTH = 2 * TUBE_RADIUS;
// Model the ground sheet at the torus tube centerline so it sits centered in the curved body.
export const GROUND_RADIUS = TORUS_MAJOR_RADIUS;

// Store reference to ground for raycasting
let groundMesh = null;

export function createCylinder(habitatGroup) {
    // Ground layer - the visible grass surface and raycasting target
    // Very high segment count for full coverage and reliable raycasting
    const groundGeo = new THREE.CylinderGeometry(GROUND_RADIUS, GROUND_RADIUS, CYLINDER_LENGTH, 612, 64, true);
    // Open the agricultural sector so lower terraces are visible and pickable.
    const positions=groundGeo.attributes.position, indices=groundGeo.index.array, kept=[];
    for(let i=0;i<indices.length;i+=3){
        let x=0,y=0; for(let j=0;j<3;j++){x+=positions.getX(indices[i+j]);y-=positions.getZ(indices[i+j]);}
        if(!inTerraceSector(Math.atan2(y,x))) kept.push(indices[i],indices[i+1],indices[i+2]);
    }
    groundGeo.setIndex(kept);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x1a3318, // Default grass green
        side: THREE.DoubleSide,
        roughness: 1.0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = Math.PI / 2;
    ground.name = 'ground';
    habitatGroup.add(ground);

    groundMesh = ground;

    return { ground };
}

export function getGroundMesh() {
    return groundMesh;
}
