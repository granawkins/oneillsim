import { initScene, scene, camera, renderer, habitatGroup, cameraAnchor } from './scene.js';
import { createSunRing, createAmbientLight, setLightIntensity } from './lighting.js';
import { GROUND_RADIUS, createCylinder, getGroundMesh } from './cylinder.js';
import { parseCameraPreset, cameraPoseFromPreset } from './camera-presets.js';
import { createStars, updateStars } from './stars.js';
import { setupControls, updateMovement, isPointerLocked } from './controls/index.js';
import { createTorus, setInnerTorusVisible } from './torus.js';
import { initEditor, updateEditor, isEditorEnabled, loadWorld, saveWorld } from './editor/index.js';
import { CameraMode, getCurrentMode, setCurrentMode, plannerState, humanState, setYaw, setPitch } from './controls/state.js';
import { PLAYER_RADIUS } from './controls/constants.js';

const ROTATION_SPEED = Math.PI / 1800; // 1 RPM at 60fps
let captureMode = false;
let captureRingRotation = 0;

function applyUrlView() {
    const params = new URLSearchParams(window.location.search);
    captureMode = params.get('capture') === '1';
    document.documentElement.classList.toggle('capture-mode', captureMode);
    try {
        const preset = parseCameraPreset(params, GROUND_RADIUS);
        const pose = cameraPoseFromPreset(preset, GROUND_RADIUS, PLAYER_RADIUS);
        const mode = preset.mode === 'planner' ? CameraMode.PLANNER : CameraMode.HUMAN;
        setCurrentMode(mode);
        plannerState.theta = preset.theta;
        plannerState.z = preset.z;
        plannerState.height = preset.height;
        humanState.currentRadius = PLAYER_RADIUS;
        humanState.radialVelocity = 0;
        humanState.isGrounded = true;
        cameraAnchor.position.set(...pose.position);
        cameraAnchor.rotation.set(0, 0, pose.anchorRotationZ);
        setYaw(preset.yaw);
        setPitch(preset.pitch);
        camera.rotation.set(pose.cameraRotation.pitch, pose.cameraRotation.yaw, pose.cameraRotation.roll, pose.cameraRotation.order);
        captureRingRotation = pose.ringRotation;
        habitatGroup.rotation.z = captureRingRotation;
        window.__oneillSimView = { ...preset, position: pose.position, anchorRotationZ: pose.anchorRotationZ };
        return preset;
    } catch (error) {
        window.__oneillSimPresetError = String(error);
        console.warn('Ignoring invalid URL camera preset:', error);
        return null;
    }
}

window.__oneillSimReady = false;

async function init() {
    const sceneObjects = initScene();

    createSunRing(sceneObjects.habitatGroup);
    createAmbientLight(sceneObjects.scene);
    createCylinder(sceneObjects.habitatGroup);
    createStars(sceneObjects.scene);
    createTorus(sceneObjects.habitatGroup);

    setupControls(sceneObjects.camera, sceneObjects.cameraAnchor, sceneObjects.scene, sceneObjects.habitatGroup);
    applyUrlView();

    // Initialize editor
    await initEditor(sceneObjects.camera, sceneObjects.habitatGroup, getGroundMesh());

    // Load world state from world.json
    try {
        const response = await fetch('world.json');
        if (response.ok) {
            const worldData = await response.json();
            await loadWorld(worldData);
        }
    } catch (e) {
        // Use defaults if world.json fails to load
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

    window.__oneillSimReady = true;
    window.dispatchEvent(new Event('oneill-sim-ready'));
    animate();
}

function animate() {
    requestAnimationFrame(animate);

    if (captureMode) {
        habitatGroup.rotation.z = captureRingRotation;
    } else {
        habitatGroup.rotation.z += ROTATION_SPEED;
    }
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

window.onload = () => {
    init().catch((error) => {
        window.__oneillSimError = String(error);
        console.error('Oneill Sim initialization failed:', error);
    });
};

// Expose save function to console
window.saveWorld = saveWorld;
