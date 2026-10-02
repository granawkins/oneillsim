import * as THREE from 'three';

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
    const groundGeo = new THREE.CylinderGeometry(GROUND_RADIUS, GROUND_RADIUS, CYLINDER_LENGTH, 512, 64, true);
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
