import { initScene, scene, camera, renderer, habitatGroup, cameraAnchor } from './scene.js';
import { createSunRing, createAmbientLight } from './lighting.js';
import { createCylinder } from './cylinder.js';
import { createStars, updateStars } from './stars.js';
import { createWorldFeatures } from './features.js';
import { setupControls, updateMovement, isPointerLocked } from './controls.js';

const ROTATION_SPEED = Math.PI / 1800; // 1 RPM at 60fps

function init() {
    const sceneObjects = initScene();

    createSunRing(sceneObjects.habitatGroup);
    createAmbientLight(sceneObjects.scene);
    createCylinder(sceneObjects.habitatGroup);
    createStars(sceneObjects.scene);
    createWorldFeatures(sceneObjects.habitatGroup);

    setupControls(sceneObjects.camera, sceneObjects.cameraAnchor);

    animate();
}

function animate() {
    requestAnimationFrame(animate);

    habitatGroup.rotation.z += ROTATION_SPEED;
    updateStars();

    if (isPointerLocked()) {
        updateMovement();
    }

    renderer.render(scene, camera);
}

window.onload = init;
