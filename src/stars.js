import * as THREE from 'three';

let skybox = null;

export function createStars(scene) {
    const loader = new THREE.CubeTextureLoader();
    loader.setPath('/assets/skybox/');

    // Order: +X (right), -X (left), +Y (up), -Y (down), +Z (front), -Z (back)
    // Swapped left/right and front/back for 180° rotation
    skybox = loader.load([
        'skybox_left.png',
        'skybox_right.png',
        'skybox_up.png',
        'skybox_down.png',
        'skybox_front.png',
        'skybox_back.png'
    ]);

    scene.background = skybox;
    return skybox;
}

export function updateStars() {
    // Skybox is static, no update needed
}

export function getStars() {
    return skybox;
}
