import * as THREE from 'three';
import {
    GROUND_RADIUS,
    PLANNER_MIN_HEIGHT,
    PLANNER_DEFAULT_HEIGHT,
    MOVE_SPEED,
    Z_LIMIT
} from '../constants.js';
import {
    yaw,
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

    // Keep current yaw/pitch - don't reset camera orientation
    // This preserves facing direction when transitioning from human mode
}

export function updatePlannerMode() {
    // Use same direction-based movement as human mode
    const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat);

    const direction = new THREE.Vector3();
    if (moveState.forward) direction.add(forward);
    if (moveState.backward) direction.sub(forward);
    if (moveState.right) direction.add(right);
    if (moveState.left) direction.sub(right);

    if (direction.length() > 0) {
        direction.normalize().multiplyScalar(MOVE_SPEED);
        direction.applyQuaternion(cameraAnchor.quaternion);
        cameraAnchor.position.add(direction);
    }

    // Get current angle and constrain to planner height
    const angle = Math.atan2(cameraAnchor.position.y, cameraAnchor.position.x);
    const radius = GROUND_RADIUS - plannerState.height;
    cameraAnchor.position.x = radius * Math.cos(angle);
    cameraAnchor.position.y = radius * Math.sin(angle);

    // Constrain Z position
    if (Math.abs(cameraAnchor.position.z) > Z_LIMIT) {
        cameraAnchor.position.z = Math.sign(cameraAnchor.position.z) * Z_LIMIT;
    }

    // Update plannerState to track position for transitions
    plannerState.theta = angle;
    plannerState.z = cameraAnchor.position.z;

    // Orient to match surface (feet toward center)
    cameraAnchor.rotation.set(0, 0, angle - Math.PI / 2 + Math.PI);
}
