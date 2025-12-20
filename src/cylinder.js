import * as THREE from 'three';

export const CYLINDER_RADIUS = 650;
export const CYLINDER_LENGTH = 130;
export const GROUND_RADIUS = 649.8;

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
