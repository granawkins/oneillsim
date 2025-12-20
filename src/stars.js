import * as THREE from 'three';

let stars = null;

export function createStars(scene) {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 10000;
    const posArray = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 5000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2 });
    stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    return stars;
}

export function updateStars() {
    if (stars) {
        stars.rotation.y += 0.00005;
    }
}

export function getStars() {
    return stars;
}
