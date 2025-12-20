import { initScene, scene, camera, renderer, habitatGroup, cameraAnchor } from './scene.js';
import { createSunRing, createAmbientLight, setLightIntensity } from './lighting.js';
import { createCylinder } from './cylinder.js';
import { createStars, updateStars } from './stars.js';
import { createWorldFeatures } from './features.js';
import { setupControls, updateMovement, isPointerLocked } from './controls.js';
import { createTorus, setInnerTorusVisible } from './torus.js';

const ROTATION_SPEED = Math.PI / 1800; // 1 RPM at 60fps

function init() {
    const sceneObjects = initScene();

    createSunRing(sceneObjects.habitatGroup);
    createAmbientLight(sceneObjects.scene);
    createCylinder(sceneObjects.habitatGroup);
    createStars(sceneObjects.scene);
    createWorldFeatures(sceneObjects.habitatGroup);
    createTorus(sceneObjects.habitatGroup);

    setupControls(sceneObjects.camera, sceneObjects.cameraAnchor, sceneObjects.scene, sceneObjects.habitatGroup);

    // Prevent info panel from triggering three.js pointer lock
    const ui = document.getElementById('ui');
    ui.addEventListener('mousedown', (e) => e.stopPropagation());
    ui.addEventListener('mouseup', (e) => e.stopPropagation());
    ui.addEventListener('click', (e) => e.stopPropagation());

    const lightSlider = document.getElementById('light-slider');
    lightSlider.addEventListener('input', (e) => {
        setLightIntensity(parseFloat(e.target.value));
    });

    const torusToggle = document.getElementById('torus-toggle');
    torusToggle.addEventListener('change', (e) => {
        setInnerTorusVisible(e.target.checked);
    });

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
