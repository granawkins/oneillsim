import * as THREE from 'three';
import { GOD_MOVE_SPEED, GOD_ENTRY_SPEED, GOD_ACCELERATION } from '../constants.js';
import {
    setYaw,
    setPitch,
    camera,
    cameraAnchor,
    moveState,
    godState
} from '../state.js';

export function setupGodMode() {
    // Get camera's world forward direction before changing anything
    const worldForward = new THREE.Vector3();
    camera.getWorldDirection(worldForward);

    // Reset anchor rotation for free flying
    cameraAnchor.rotation.set(0, 0, 0);

    // Calculate yaw and pitch from world forward direction
    // This gives us a no-roll representation - important because mouse look
    // also uses no-roll, so there won't be a snap when you first move

    // Pitch: angle above/below horizontal
    const newPitch = Math.asin(Math.max(-1, Math.min(1, worldForward.y)));

    // Yaw: horizontal angle
    let newYaw;
    const horizLen = Math.sqrt(worldForward.x * worldForward.x + worldForward.z * worldForward.z);
    if (horizLen < 0.001) {
        // Looking straight up or down - yaw is arbitrary
        newYaw = 0;
    } else {
        newYaw = Math.atan2(worldForward.x, -worldForward.z);
    }

    setYaw(newYaw);
    setPitch(newPitch);

    // Build quaternion from yaw/pitch (no roll) - matches what mouse handler does
    camera.quaternion.setFromEuler(new THREE.Euler(newPitch, newYaw, 0, 'YXZ'));
}

export function updateGodMode() {
    // Ease-in: gradually increase speed multiplier when entering god mode
    if (godState.speedMultiplier < 1) {
        godState.speedMultiplier = Math.min(1, godState.speedMultiplier + GOD_ACCELERATION);
    }

    const direction = new THREE.Vector3();
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    // Check if user is actively moving with WASD
    const userMoving = moveState.forward || moveState.backward || moveState.left || moveState.right;

    if (userMoving) {
        // User is actively controlling - use WASD input
        if (moveState.forward) direction.add(front);
        if (moveState.backward) direction.sub(front);
        if (moveState.right) direction.add(right);
        if (moveState.left) direction.sub(right);
    } else if (godState.speedMultiplier < 1) {
        // Still in ease-in phase and no user input - continue momentum from entry
        // Move in the entry direction (forward or backward based on zoom direction)
        direction.addScaledVector(front, godState.entryDirection);
    }

    if (direction.length() > 0) {
        // Apply speed with ease-in multiplier for entry momentum
        const currentSpeed = userMoving
            ? GOD_MOVE_SPEED
            : GOD_ENTRY_SPEED * godState.speedMultiplier;

        direction.normalize().multiplyScalar(currentSpeed);
        cameraAnchor.position.add(direction);
    }
}
