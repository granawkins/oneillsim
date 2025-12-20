import * as THREE from 'three';
import { toggleSunRing } from './lighting.js';

const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
};

const MOVE_SPEED = 1.2;
const MOUSE_SENSITIVITY = 0.002;

let yaw = 0;
let pitch = 0;
let camera = null;
let cameraAnchor = null;

export function setupControls(cam, anchor) {
    camera = cam;
    cameraAnchor = anchor;

    const overlay = document.getElementById('overlay');
    overlay.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        overlay.style.display = document.pointerLockElement === document.body ? 'none' : 'flex';
    });

    const onKey = (val) => (e) => {
        switch (e.code) {
            case 'KeyW': moveState.forward = val; break;
            case 'KeyS': moveState.backward = val; break;
            case 'KeyA': moveState.left = val; break;
            case 'KeyD': moveState.right = val; break;
            case 'Space': moveState.up = val; break;
            case 'ShiftLeft': moveState.down = val; break;
        }
    };
    document.addEventListener('keydown', onKey(true));
    document.addEventListener('keyup', onKey(false));

    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyL') {
            toggleSunRing();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body) {
            yaw -= e.movementX * MOUSE_SENSITIVITY;
            pitch -= e.movementY * MOUSE_SENSITIVITY;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
            camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        }
    });
}

export function updateMovement() {
    if (!cameraAnchor || !camera) return;

    const currentPos = new THREE.Vector2(cameraAnchor.position.x, cameraAnchor.position.y);
    const angle = Math.atan2(currentPos.y, currentPos.x);

    cameraAnchor.rotation.z = angle - Math.PI / 2 + Math.PI;

    const direction = new THREE.Vector3();
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    if (moveState.forward) direction.add(front);
    if (moveState.backward) direction.sub(front);
    if (moveState.right) direction.add(right);
    if (moveState.left) direction.sub(right);
    if (moveState.up) direction.add(up);
    if (moveState.down) direction.sub(up);

    if (direction.length() > 0) {
        direction.normalize().multiplyScalar(MOVE_SPEED);
        direction.applyQuaternion(cameraAnchor.quaternion);
        cameraAnchor.position.add(direction);
    }

    // Boundary constraints
    const distFromCenter = Math.sqrt(cameraAnchor.position.x ** 2 + cameraAnchor.position.y ** 2);
    if (distFromCenter > 648) {
        const ratio = 648 / distFromCenter;
        cameraAnchor.position.x *= ratio;
        cameraAnchor.position.y *= ratio;
    } else if (distFromCenter < 3) {
        cameraAnchor.position.x = 3.1;
    }

    if (Math.abs(cameraAnchor.position.z) > 60) {
        cameraAnchor.position.z = Math.sign(cameraAnchor.position.z) * 60;
    }
}

export function isPointerLocked() {
    return document.pointerLockElement === document.body;
}
