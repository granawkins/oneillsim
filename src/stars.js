import * as THREE from 'three';

let skybox = null;

export function createStars(scene) {
    const loader = new THREE.CubeTextureLoader();
    loader.setPath('assets/skybox/');

    // Order: +X (right), -X (left), +Y (up), -Y (down), +Z (front), -Z (back)
    // Swapped left/right and front/back for 180° rotation
    skybox = loader.load([
        'skybox_left.1024.3614f89fcde9.webp',
        'skybox_right.1024.87638bd2fa52.webp',
        'skybox_up.1024.177459cf719b.webp',
        'skybox_down.1024.3ff2b586ea1d.webp',
        'skybox_front.1024.8d5ed5a68602.webp',
        'skybox_back.1024.0b066171d9a8.webp'
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
