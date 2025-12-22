import * as THREE from 'three';
import {
    GROUND_RADIUS,
    PLANNER_MAX_HEIGHT,
    TRANSITION_DURATION
} from './constants.js';
import {
    CameraMode,
    getCurrentMode,
    setCurrentMode,
    transitionState,
    startTransition,
    endTransition,
    cameraAnchor,
    camera,
    scene,
    habitatGroup,
    plannerState,
    godState,
    setYaw,
    setPitch
} from './state.js';
import { setupHumanMode } from './modes/human.js';
import { setupPlannerMode } from './modes/planner.js';
import { setupGodMode } from './modes/god.js';
import { setEditorVisible } from '../editor/index.js';

// Easing function: ease-in-out cubic
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function switchToMode(newMode) {
    const currentMode = getCurrentMode();
    if (newMode === currentMode) return;

    const oldMode = currentMode;
    setCurrentMode(newMode);

    // Handle parenting changes
    if (oldMode === CameraMode.GOD) {
        // Coming from god mode: move camera back into habitat
        const worldPos = new THREE.Vector3();
        cameraAnchor.getWorldPosition(worldPos);
        scene.remove(cameraAnchor);
        habitatGroup.add(cameraAnchor);
        habitatGroup.worldToLocal(worldPos);
        cameraAnchor.position.copy(worldPos);
    }

    if (newMode === CameraMode.GOD) {
        // Going to god mode: move camera out of habitat into scene
        const worldPos = new THREE.Vector3();
        cameraAnchor.getWorldPosition(worldPos);
        habitatGroup.remove(cameraAnchor);
        scene.add(cameraAnchor);
        cameraAnchor.position.copy(worldPos);
    }

    // Setup the new mode
    setupMode(newMode);

    // Update editor visibility
    setEditorVisible(newMode === CameraMode.PLANNER);
}

function setupMode(mode) {
    switch (mode) {
        case CameraMode.HUMAN:
            setupHumanMode();
            break;
        case CameraMode.PLANNER:
            setupPlannerMode();
            break;
        case CameraMode.GOD:
            setupGodMode();
            break;
    }
}

// Start transition from planner to god mode (instant switch with ease-in movement)
export function startGodTransition() {
    // Reset god mode speed multiplier for ease-in
    godState.speedMultiplier = 0;

    // Do the actual mode switch
    switchToMode(CameraMode.GOD);
}

// Start animated transition from god to planner mode
export function startPlannerTransition() {
    if (transitionState.active) return;

    // Use the last stored planner position (where user left off)
    transitionState.targetTheta = plannerState.theta;
    transitionState.targetZ = plannerState.z;
    transitionState.targetHeight = plannerState.height;

    // Calculate target position in habitat-local space
    const targetRadius = GROUND_RADIUS - transitionState.targetHeight;
    const localTargetPos = new THREE.Vector3(
        targetRadius * Math.cos(transitionState.targetTheta),
        targetRadius * Math.sin(transitionState.targetTheta),
        transitionState.targetZ
    );

    // Convert target to world space for interpolation
    transitionState.targetPosition.copy(localTargetPos);
    habitatGroup.localToWorld(transitionState.targetPosition);

    // Calculate target quaternion (planner orientation in world space)
    // First, the anchor rotation in local space
    const anchorRotZ = transitionState.targetTheta - Math.PI / 2 + Math.PI;
    const localAnchorQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, anchorRotZ)
    );
    // Combine with habitat rotation to get world quaternion
    const habitatQuat = new THREE.Quaternion();
    habitatGroup.getWorldQuaternion(habitatQuat);
    transitionState.targetQuaternion.multiplyQuaternions(habitatQuat, localAnchorQuat);

    // Store start position/quaternion
    transitionState.startPosition.copy(cameraAnchor.position);
    cameraAnchor.getWorldQuaternion(transitionState.startQuaternion);

    // Start the transition
    startTransition(CameraMode.GOD, CameraMode.PLANNER, TRANSITION_DURATION);
}

// Update function called each frame during transitions
export function updateTransition() {
    if (!transitionState.active) return false;

    const elapsed = performance.now() - transitionState.startTime;
    const progress = Math.min(elapsed / transitionState.duration, 1);
    const easedProgress = easeInOutCubic(progress);

    if (transitionState.to === CameraMode.PLANNER) {
        // Animate from god to planner
        // Interpolate position
        cameraAnchor.position.lerpVectors(
            transitionState.startPosition,
            transitionState.targetPosition,
            easedProgress
        );

        // Interpolate rotation
        const currentQuat = new THREE.Quaternion();
        currentQuat.slerpQuaternions(
            transitionState.startQuaternion,
            transitionState.targetQuaternion,
            easedProgress
        );
        cameraAnchor.quaternion.copy(currentQuat);

        // Keep camera looking forward during transition
        // Gradually reset to planner look direction
        const targetCameraYaw = -Math.PI / 2;
        const targetCameraPitch = 0;

        // Get current camera euler
        const camEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');

        // Lerp toward target
        const newYaw = camEuler.y + (targetCameraYaw - camEuler.y) * easedProgress;
        const newPitch = camEuler.x + (targetCameraPitch - camEuler.x) * easedProgress;

        camera.quaternion.setFromEuler(new THREE.Euler(newPitch, newYaw, 0, 'YXZ'));
    }

    // Check if transition is complete
    if (progress >= 1) {
        finishTransition();
        return false;
    }

    return true;  // Still transitioning
}

function finishTransition() {
    const targetMode = transitionState.to;

    if (targetMode === CameraMode.PLANNER) {
        // Move camera back into habitat
        const worldPos = new THREE.Vector3();
        cameraAnchor.getWorldPosition(worldPos);
        scene.remove(cameraAnchor);
        habitatGroup.add(cameraAnchor);
        habitatGroup.worldToLocal(worldPos);
        cameraAnchor.position.copy(worldPos);

        // Set planner state from transition targets
        plannerState.theta = transitionState.targetTheta;
        plannerState.z = transitionState.targetZ;
        plannerState.height = transitionState.targetHeight;

        // Finalize planner mode setup
        setCurrentMode(CameraMode.PLANNER);
        setupPlannerMode();

        // Show editor in planner mode
        setEditorVisible(true);
    }

    endTransition();
}
