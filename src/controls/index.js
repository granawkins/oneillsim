import {
    CameraMode,
    getCurrentMode,
    setRefs,
    cameraAnchor,
    camera,
    transitionState,
    plannerState
} from './state.js';
import { setupInput, isPointerLocked } from './input.js';
import { updateTransition } from './transitions.js';
import { updateHumanMode } from './modes/human.js';
import { updatePlannerMode } from './modes/planner.js';
import { updateGodMode } from './modes/god.js';

export function setupControls(cam, anchor, scn, habitat) {
    setRefs(cam, anchor, scn, habitat);

    // Initialize planner state from current camera position
    const pos = anchor.position;
    plannerState.theta = Math.atan2(pos.y, pos.x);
    plannerState.z = pos.z;

    setupInput();
}

export function updateMovement() {
    if (!cameraAnchor || !camera) return;

    // Handle animated transitions (god → planner)
    if (transitionState.active) {
        updateTransition();
        return;
    }

    // Update based on current mode
    const currentMode = getCurrentMode();
    switch (currentMode) {
        case CameraMode.HUMAN:
            updateHumanMode();
            break;
        case CameraMode.PLANNER:
            updatePlannerMode();
            break;
        case CameraMode.GOD:
            updateGodMode();
            break;
    }
}

export { isPointerLocked, getCurrentMode, CameraMode };
