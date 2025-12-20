import * as THREE from 'three';

let pointLights = [];
let ambientLight = null;
const BASE_POINT_INTENSITY = 20;
const BASE_AMBIENT_INTENSITY = 25;

export function createSunRing(habitatGroup) {
    const ringRadius = 650 - 65; // 65m above ground surface (toward center)
    const ringZ = 20; // above the river

    // Add point lights around the ring (no visible geometry)
    const lightCount = 12;
    pointLights = [];
    for (let i = 0; i < lightCount; i++) {
        const angle = (i / lightCount) * Math.PI * 2;
        const pLight = new THREE.PointLight(0xfff8e0, BASE_POINT_INTENSITY, 500, 1);
        pLight.position.set(
            ringRadius * Math.cos(angle),
            ringRadius * Math.sin(angle),
            ringZ
        );
        habitatGroup.add(pLight);
        pointLights.push(pLight);
    }
}

export function createAmbientLight(scene) {
    ambientLight = new THREE.AmbientLight(0x404040, BASE_AMBIENT_INTENSITY);
    scene.add(ambientLight);
    return ambientLight;
}

export function setLightIntensity(multiplier) {
    pointLights.forEach(light => {
        light.intensity = BASE_POINT_INTENSITY * multiplier;
    });
    if (ambientLight) {
        ambientLight.intensity = BASE_AMBIENT_INTENSITY * multiplier;
    }
}
