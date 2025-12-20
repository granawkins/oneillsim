import * as THREE from 'three';

let sunRingMesh = null;

export function createSunRing(habitatGroup) {
    const ringRadius = 650 - 65; // 65m above ground surface (toward center)
    const ringZ = 20; // above the river

    // Visible ring geometry
    const ringGeo = new THREE.TorusGeometry(ringRadius, 3, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
    sunRingMesh = new THREE.Mesh(ringGeo, ringMat);
    sunRingMesh.position.z = ringZ;
    habitatGroup.add(sunRingMesh);

    // Add point lights around the ring
    const lightCount = 12;
    for (let i = 0; i < lightCount; i++) {
        const angle = (i / lightCount) * Math.PI * 2;
        const pLight = new THREE.PointLight(0xfff8e0, 50, 500, 1);
        pLight.position.set(
            ringRadius * Math.cos(angle),
            ringRadius * Math.sin(angle),
            ringZ
        );
        habitatGroup.add(pLight);
    }

    return sunRingMesh;
}

export function createAmbientLight(scene) {
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    return ambientLight;
}

export function toggleSunRing() {
    if (sunRingMesh) {
        sunRingMesh.visible = !sunRingMesh.visible;
    }
}

export function getSunRingMesh() {
    return sunRingMesh;
}
