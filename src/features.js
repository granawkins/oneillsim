import * as THREE from 'three';

const SURFACE_RADIUS = 649.8;

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

export function createWorldFeatures(habitatGroup) {
    // River and ground textures now handled by editor system
    createTown(habitatGroup, new THREE.Vector3(400, -500, 0), 40);
    createTown(habitatGroup, new THREE.Vector3(-450, -470, -15), 30);
}
