import * as THREE from 'three';
import {
    CameraMode,
    MODE_ORDER,
    getCurrentMode,
    setCurrentMode,
    transitioning,
    cameraAnchor,
    scene,
    habitatGroup
} from './state.js';
import { setupHumanMode } from './modes/human.js';
import { setupPlannerMode } from './modes/planner.js';
import { setupGodMode } from './modes/god.js';

export function cycleMode() {
    if (transitioning) return;

    const currentIndex = MODE_ORDER.indexOf(getCurrentMode());
    const nextIndex = (currentIndex + 1) % MODE_ORDER.length;
    const nextMode = MODE_ORDER[nextIndex];

    switchToMode(nextMode);
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
