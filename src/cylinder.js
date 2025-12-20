import * as THREE from 'three';

export const CYLINDER_RADIUS = 650;
export const CYLINDER_LENGTH = 130;

export function createCylinder(habitatGroup) {
    // Hull
    const geometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, CYLINDER_LENGTH, 64, 1, true);
    const material = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        side: THREE.BackSide,
        roughness: 1.0
    });
    const hull = new THREE.Mesh(geometry, material);
    hull.rotation.x = Math.PI / 2;
    habitatGroup.add(hull);

    // Ground layer
    const groundGeo = new THREE.CylinderGeometry(CYLINDER_RADIUS - 0.2, CYLINDER_RADIUS - 0.2, CYLINDER_LENGTH, 64, 1, true);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d4a28, side: THREE.BackSide, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = Math.PI / 2;
    habitatGroup.add(ground);

    return { hull, ground };
}
