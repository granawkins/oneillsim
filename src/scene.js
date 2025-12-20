import * as THREE from 'three';

export let scene;
export let camera;
export let renderer;
export let habitatGroup;
export let cameraAnchor;

export function initScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 5000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    habitatGroup = new THREE.Group();
    scene.add(habitatGroup);

    cameraAnchor = new THREE.Group();
    habitatGroup.add(cameraAnchor);
    cameraAnchor.add(camera);
    // Position at ground level (649.8) minus 2m camera height = 647.8
    cameraAnchor.position.set(0, 647.8, 0);
    // Set initial rotation to match surface orientation (feet toward center)
    cameraAnchor.rotation.z = Math.PI;
    // Set initial camera look direction (90 degrees right)
    camera.quaternion.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YXZ'));

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, habitatGroup, cameraAnchor };
}
