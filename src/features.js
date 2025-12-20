import * as THREE from 'three';
import { CYLINDER_LENGTH } from './cylinder.js';

const SURFACE_RADIUS = 649.8;

export function createRiver(habitatGroup) {
    const riverGeo = new THREE.CylinderGeometry(SURFACE_RADIUS - 0.3, SURFACE_RADIUS - 0.3, 15, 64, 1, true);
    const riverMat = new THREE.MeshStandardMaterial({
        color: 0x2a6099,
        side: THREE.BackSide,
        metalness: 0.4,
        roughness: 0.3
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.rotation.x = Math.PI / 2;
    river.position.z = 20;
    habitatGroup.add(river);
    return river;
}

export function createTown(habitatGroup, center, count) {
    const radius = 649.5;
    const houseBaseGeo = new THREE.BoxGeometry(8, 6, 8);
    const houseRoofGeo = new THREE.ConeGeometry(7, 4, 4);

    for (let i = 0; i < count; i++) {
        const offsetTheta = (Math.random() - 0.5) * 0.4;
        const offsetZ = (Math.random() - 0.5) * 60;
        const baseAngle = Math.atan2(center.y, center.x);
        const theta = baseAngle + offsetTheta;
        const z = center.z + offsetZ;

        const group = new THREE.Group();
        const base = new THREE.Mesh(houseBaseGeo, new THREE.MeshStandardMaterial({ color: 0xd4c4a8 }));
        const roof = new THREE.Mesh(houseRoofGeo, new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
        base.position.y = 3;
        roof.position.y = 8;
        group.add(base, roof);

        group.position.set(radius * Math.cos(theta), radius * Math.sin(theta), z);
        group.lookAt(0, 0, z);
        group.rotateX(Math.PI / 2);
        habitatGroup.add(group);
    }
}

export function createForest(habitatGroup, count) {
    const radius = 649.5;
    const length = CYLINDER_LENGTH - 10;
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 8);
    const leavesGeo = new THREE.SphereGeometry(4, 8, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 });

    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        // Bias z toward edges (endcaps): invert squared random so trees cluster at high |z|
        const edgeBias = 1 - Math.pow(Math.random(), 2);
        const z = Math.sign(Math.random() - 0.5) * edgeBias * (length / 2);

        const group = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        const leaves = new THREE.Mesh(leavesGeo, leafMat);
        trunk.position.y = 4;
        leaves.position.y = 10;
        group.add(trunk, leaves);

        group.position.set(radius * Math.cos(theta), radius * Math.sin(theta), z);
        group.lookAt(0, 0, z);
        group.rotateX(Math.PI / 2);
        habitatGroup.add(group);
    }
}

export function createWorldFeatures(habitatGroup) {
    createRiver(habitatGroup);
    createTown(habitatGroup, new THREE.Vector3(400, -500, 0), 40);
    createTown(habitatGroup, new THREE.Vector3(-450, -470, -15), 30);
    createForest(habitatGroup, 1000);
}
