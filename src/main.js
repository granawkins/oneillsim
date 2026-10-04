import {configureTerraces} from './terrace-surfaces.js';
import {createTerraces} from './terraces.js';
import {initTerraceControls} from './terrace-controls.js';
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
import {createSettlementCirculation} from './settlement-circulation.js';
import {createSettlementPresentation} from './settlement-rendering.js';
import {initSettlementTour} from './settlement-tour.js';
import {createSettlementLandscapePresentation} from './settlement-lookdev.js';

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
window.__oneillSimFirstFrame = false;

async function init() {
    document.querySelector('#overlay span').textContent = 'Loading settlement…';
    const worldResponse=await fetch('world.json');
    const worldData=worldResponse.ok ? await worldResponse.json() : {};
    configureTerraces(worldData.terraces);
    const sceneObjects = initScene();

    createSunRing(sceneObjects.habitatGroup);
    createAmbientLight(sceneObjects.scene);
    createCylinder(sceneObjects.habitatGroup);
    createTerraces(sceneObjects.habitatGroup);
    if(worldData.settlementDesign?.version===1){
        const circulation=createSettlementCirculation(sceneObjects.habitatGroup,worldData,worldData.settlementDesign.routes);
        createSettlementPresentation({renderer:sceneObjects.renderer,exposure:1});
        window.__oneillSettlement={circulation,design:worldData.settlementDesign};
    }
    createStars(sceneObjects.scene);
    createTorus(sceneObjects.habitatGroup);

    applyUrlView();
    setLightIntensity(3);
    setInnerTorusVisible(false);
    // Render the habitat while models download. Input and editing remain
    // disabled until the complete world is loaded; capture readiness is unchanged.
    animate();

    // Initialize editor
    await initEditor(sceneObjects.camera, sceneObjects.habitatGroup, getGroundMesh());

    await loadWorld(worldData);
    if(worldData.settlementDesign?.version===1){
        window.__oneillSettlement.palette=createSettlementLandscapePresentation(sceneObjects.habitatGroup);
    }
    initTerraceControls(sceneObjects.habitatGroup);
    setupControls(sceneObjects.camera, sceneObjects.cameraAnchor, sceneObjects.scene, sceneObjects.habitatGroup);
    if(worldData.settlementDesign?.version===1){
        initSettlementTour(worldData.settlementDesign,{defaultVisit:window.location.search.length===0});
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
    document.querySelector('#overlay span').textContent = 'Click to Enter';
    window.dispatchEvent(new Event('oneill-sim-ready'));
}

let previousFrameTime = null;
function animate(time = performance.now()) {
    requestAnimationFrame(animate);
    const deltaSeconds = previousFrameTime === null ? 0 : Math.max(0, (time - previousFrameTime) / 1000);
    previousFrameTime = time;

    if (captureMode) {
        habitatGroup.rotation.z = captureRingRotation;
    } else if (window.__oneillSimReady) {
        habitatGroup.rotation.z += ROTATION_SPEED;
    }
    updateStars();

    // Human gravity runs even when unlocked or idle; capture-only poses remain
    // frozen. Planner/god retain their existing input and camera workflows.
    const inEditorMode = getCurrentMode() === CameraMode.PLANNER && isEditorEnabled();
    const humanPhysics = getCurrentMode() === CameraMode.HUMAN && !captureMode;
    if (window.__oneillSimReady && (humanPhysics || isPointerLocked() || inEditorMode)) {
        updateMovement(deltaSeconds);

        // Update editor preview in planner mode
        if (getCurrentMode() === CameraMode.PLANNER) {
            updateEditor();
        }
    }

    // Render one early habitat frame. Repeatedly drawing an unbatched loading
    // scene competes with OBJ/atlas decoding on software WebGL; input is still
    // gated by readiness, so retain the frame until the complete world is ready.
    if(window.__oneillSimReady || !window.__oneillSimFirstFrame){
        renderer.render(scene, camera);
        window.__oneillSimFirstFrame = true;
    }
}

window.onload = () => {
    init().catch((error) => {
        window.__oneillSimError = String(error);
        console.error('Oneill Sim initialization failed:', error);
    });
};

// Expose save function to console
window.saveWorld = () => {
    if (!window.__oneillSimReady) throw new Error('Settlement is still loading; saving is disabled');
    return saveWorld();
};
