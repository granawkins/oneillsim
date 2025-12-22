import * as THREE from 'three';
import {
    HUMAN_MOVE_SPEED,
    PLAYER_RADIUS,
    GRAVITY,
    Z_LIMIT
} from '../constants.js';
import {
    yaw,
    cameraAnchor,
    moveState,
    humanState
} from '../state.js';

export function setupHumanMode() {
    // Snap to ground level at current position
    const pos = cameraAnchor.position;
    const angle = Math.atan2(pos.y, pos.x);

    humanState.currentRadius = PLAYER_RADIUS;
    humanState.isGrounded = true;
    humanState.radialVelocity = 0;

    // Position on ground
    cameraAnchor.position.x = PLAYER_RADIUS * Math.cos(angle);
    cameraAnchor.position.y = PLAYER_RADIUS * Math.sin(angle);

    // Orient feet toward center
    cameraAnchor.rotation.set(0, 0, angle - Math.PI / 2 + Math.PI);

    // Keep current yaw/pitch - don't reset camera orientation
    // This preserves facing direction when transitioning from planner mode
}

export function updateHumanMode() {
    // Walking on ring surface
    const currentPos = new THREE.Vector2(cameraAnchor.position.x, cameraAnchor.position.y);
    const angle = Math.atan2(currentPos.y, currentPos.x);
    cameraAnchor.rotation.z = angle - Math.PI / 2 + Math.PI;

    const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat);

    const direction = new THREE.Vector3();
    if (moveState.forward) direction.add(forward);
    if (moveState.backward) direction.sub(forward);
    if (moveState.right) direction.add(right);
    if (moveState.left) direction.sub(right);

    if (direction.length() > 0) {
        direction.normalize().multiplyScalar(HUMAN_MOVE_SPEED);
        direction.applyQuaternion(cameraAnchor.quaternion);
        cameraAnchor.position.add(direction);
    }

    // Apply jump physics
    if (!humanState.isGrounded) {
        humanState.radialVelocity += GRAVITY;
        humanState.currentRadius += humanState.radialVelocity;

        if (humanState.currentRadius >= PLAYER_RADIUS) {
            humanState.currentRadius = PLAYER_RADIUS;
            humanState.radialVelocity = 0;
            humanState.isGrounded = true;
        }
    }

    // Constrain to current radius (ground or mid-jump)
    const distFromCenter = Math.sqrt(cameraAnchor.position.x ** 2 + cameraAnchor.position.y ** 2);
    const ratio = humanState.currentRadius / distFromCenter;
    cameraAnchor.position.x *= ratio;
    cameraAnchor.position.y *= ratio;

    // Constrain Z position
    if (Math.abs(cameraAnchor.position.z) > Z_LIMIT) {
        cameraAnchor.position.z = Math.sign(cameraAnchor.position.z) * Z_LIMIT;
    }
}
