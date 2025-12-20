import * as THREE from 'three';
import {
    MOVE_SPEED,
    GROUND_RADIUS,
    PLANNER_MIN_HEIGHT,
    PLANNER_DEFAULT_HEIGHT,
    PLANNER_MOVE_SPEED,
    Z_LIMIT
} from '../constants.js';
import {
    yaw,
    setYaw,
    setPitch,
    camera,
    cameraAnchor,
    moveState,
    plannerState
} from '../state.js';

export function setupPlannerMode() {
    // Get current position to determine theta and z
    const pos = cameraAnchor.position;
    plannerState.theta = Math.atan2(pos.y, pos.x);
    plannerState.z = pos.z;
    // Keep current height if already set, otherwise use default
    if (plannerState.height < PLANNER_MIN_HEIGHT) {
        plannerState.height = PLANNER_DEFAULT_HEIGHT;
    }

    // Position at planner height
    const radius = GROUND_RADIUS - plannerState.height;
    cameraAnchor.position.x = radius * Math.cos(plannerState.theta);
    cameraAnchor.position.y = radius * Math.sin(plannerState.theta);
    cameraAnchor.position.z = plannerState.z;

    // Orient anchor to match surface (same as human mode)
    cameraAnchor.rotation.set(0, 0, plannerState.theta - Math.PI / 2 + Math.PI);

    // Look tangent to the ring (same direction as human mode - along the river)
    setYaw(-Math.PI / 2);
    setPitch(0);
    camera.quaternion.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YXZ'));
}

export function updatePlannerMode() {
    // Check if facing more forward or backward along the ring
    // yaw = -PI/2 is forward, yaw = PI/2 is backward
    const facingForward = Math.sin(yaw) <= 0;
    const thetaDir = facingForward ? 1 : -1;
    const zDir = facingForward ? 1 : -1;

    // W/S move in the direction you're facing along the ring
    if (moveState.forward) {
        plannerState.theta += PLANNER_MOVE_SPEED * thetaDir;
    }
    if (moveState.backward) {
        plannerState.theta -= PLANNER_MOVE_SPEED * thetaDir;
    }

    // A/D move along the Z axis (perpendicular to ring direction)
    if (moveState.right) {
        plannerState.z += MOVE_SPEED * zDir;
    }
    if (moveState.left) {
        plannerState.z -= MOVE_SPEED * zDir;
    }

    // Constrain Z position
    if (Math.abs(plannerState.z) > Z_LIMIT) {
        plannerState.z = Math.sign(plannerState.z) * Z_LIMIT;
    }

    // Update position using current height
    const radius = GROUND_RADIUS - plannerState.height;
    cameraAnchor.position.x = radius * Math.cos(plannerState.theta);
    cameraAnchor.position.y = radius * Math.sin(plannerState.theta);
    cameraAnchor.position.z = plannerState.z;

    // Orient to match surface (feet toward center)
    cameraAnchor.rotation.set(0, 0, plannerState.theta - Math.PI / 2 + Math.PI);
}
