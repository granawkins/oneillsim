import { initScene, scene, camera, renderer, habitatGroup, cameraAnchor } from './scene.js';
import { createSunRing, createAmbientLight, setLightIntensity } from './lighting.js';
import { createCylinder, getGroundMesh } from './cylinder.js';
import { createStars, updateStars } from './stars.js';
import { createWorldFeatures } from './features.js';
import { setupControls, updateMovement, isPointerLocked } from './controls/index.js';
import { createTorus, setInnerTorusVisible } from './torus.js';
import { initEditor, updateEditor, isEditorEnabled, loadWorld } from './editor/index.js';
import { CameraMode, getCurrentMode } from './controls/state.js';

const ROTATION_SPEED = Math.PI / 1800; // 1 RPM at 60fps

async function init() {
    const sceneObjects = initScene();

    createSunRing(sceneObjects.habitatGroup);
    createAmbientLight(sceneObjects.scene);
    createCylinder(sceneObjects.habitatGroup);
    createStars(sceneObjects.scene);
    createWorldFeatures(sceneObjects.habitatGroup);
    createTorus(sceneObjects.habitatGroup);

    setupControls(sceneObjects.camera, sceneObjects.cameraAnchor, sceneObjects.scene, sceneObjects.habitatGroup);

    // Initialize editor
    await initEditor(sceneObjects.camera, sceneObjects.habitatGroup, getGroundMesh());

    // Load world state from world.json
    try {
        const response = await fetch('/world.json');
        if (response.ok) {
            const worldData = await response.json();
            await loadWorld(worldData);
            console.log('Loaded world.json');
        }
    } catch (e) {
        console.warn('Could not load world.json, using defaults');
    }

    // Prevent info panel from triggering three.js pointer lock
    const ui = document.getElementById('ui');
    ui.addEventListener('mousedown', (e) => e.stopPropagation());
    ui.addEventListener('mouseup', (e) => e.stopPropagation());
    ui.addEventListener('click', (e) => e.stopPropagation());

    const lightSlider = document.getElementById('light-slider');
    lightSlider.addEventListener('input', (e) => {
        setLightIntensity(parseFloat(e.target.value));
    });
    setLightIntensity(3); // Initialize at 3x brightness

    const torusToggle = document.getElementById('torus-toggle');
    torusToggle.addEventListener('change', (e) => {
        setInnerTorusVisible(e.target.checked);
    });

    // Initialize torus toggle as false
    setInnerTorusVisible(false);

    animate();
}

function animate() {
    requestAnimationFrame(animate);

    habitatGroup.rotation.z += ROTATION_SPEED;
    updateStars();

    // Update movement when pointer locked OR in editor mode (planner + editor enabled)
    const inEditorMode = getCurrentMode() === CameraMode.PLANNER && isEditorEnabled();
    if (isPointerLocked() || inEditorMode) {
        updateMovement();

        // Update editor preview in planner mode
        if (getCurrentMode() === CameraMode.PLANNER) {
            updateEditor();
        }
    }

    renderer.render(scene, camera);
}

window.onload = init;
