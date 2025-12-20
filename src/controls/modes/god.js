import * as THREE from 'three';
import { GOD_MOVE_SPEED } from '../constants.js';
import {
    setYaw,
    setPitch,
    camera,
    cameraAnchor,
    moveState
} from '../state.js';

export function setupGodMode() {
    // Get the camera's world quaternion before changing anything
    const worldQuat = new THREE.Quaternion();
    camera.getWorldQuaternion(worldQuat);

    // Reset anchor rotation for free flying
    cameraAnchor.rotation.set(0, 0, 0);

    // Apply the preserved world quaternion directly to the camera
    camera.quaternion.copy(worldQuat);

    // Extract yaw/pitch from the world quaternion for mouse look continuity
    // We need to decompose the quaternion into YXZ euler angles
    const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
    setYaw(euler.y);
    setPitch(euler.x);
}

export function updateGodMode() {
    // Free flying - WASD moves in the direction you're looking
    const direction = new THREE.Vector3();
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    if (moveState.forward) direction.add(front);
    if (moveState.backward) direction.sub(front);
    if (moveState.right) direction.add(right);
    if (moveState.left) direction.sub(right);

    if (direction.length() > 0) {
        direction.normalize().multiplyScalar(GOD_MOVE_SPEED);
        cameraAnchor.position.add(direction);
    }
}
