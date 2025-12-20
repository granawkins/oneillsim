import * as THREE from 'three';
import {
    MOUSE_SENSITIVITY,
    JUMP_VELOCITY,
    PLANNER_MIN_HEIGHT,
    PLANNER_MAX_HEIGHT,
    PLANNER_ZOOM_SPEED
} from './constants.js';
import {
    CameraMode,
    getCurrentMode,
    yaw,
    pitch,
    setYaw,
    setPitch,
    camera,
    moveState,
    humanState,
    plannerState
} from './state.js';
import { cycleMode, switchToMode } from './transitions.js';

export function setupInput() {
    const overlay = document.getElementById('overlay');
    overlay.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    const crosshair = document.getElementById('crosshair');
    document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === document.body;
        overlay.querySelector('span').textContent = locked ? 'Escape to Exit' : 'Click to Enter';
        overlay.style.alignItems = locked ? 'flex-start' : 'center';
        overlay.style.paddingTop = locked ? '5vh' : '0';
        crosshair.style.display = locked ? 'block' : 'none';
    });

    // WASD movement
    const onKey = (val) => (e) => {
        switch (e.code) {
            case 'KeyW': moveState.forward = val; break;
            case 'KeyS': moveState.backward = val; break;
            case 'KeyA': moveState.left = val; break;
            case 'KeyD': moveState.right = val; break;
        }
    };
    document.addEventListener('keydown', onKey(true));
    document.addEventListener('keyup', onKey(false));

    // Mode switching and jump
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Tab') {
            e.preventDefault();
            cycleMode();
        }
        if (e.code === 'Space' && getCurrentMode() === CameraMode.HUMAN && humanState.isGrounded) {
            e.preventDefault();
            humanState.radialVelocity = -JUMP_VELOCITY;
            humanState.isGrounded = false;
        }
    });

    // Mouse movement for look control
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body) {
            // First-person look for all modes
            setYaw(yaw - e.movementX * MOUSE_SENSITIVITY);
            const newPitch = pitch - e.movementY * MOUSE_SENSITIVITY;
            setPitch(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newPitch)));
            camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        }
    });

    // Scroll wheel for zoom and mode transitions
    document.addEventListener('wheel', (e) => {
        if (document.pointerLockElement !== document.body) return;
        e.preventDefault();

        const zoomingOut = e.deltaY > 0;
        const currentMode = getCurrentMode();

        if (currentMode === CameraMode.HUMAN) {
            // Zoom out from human → planner
            if (zoomingOut) {
                plannerState.height = PLANNER_MIN_HEIGHT;
                switchToMode(CameraMode.PLANNER);
            }
        } else if (currentMode === CameraMode.PLANNER) {
            plannerState.height += zoomingOut ? PLANNER_ZOOM_SPEED : -PLANNER_ZOOM_SPEED;

            // Zoom in past min → human
            if (plannerState.height < PLANNER_MIN_HEIGHT) {
                plannerState.height = PLANNER_MIN_HEIGHT;
                switchToMode(CameraMode.HUMAN);
            }
            // Zoom out past max → god
            else if (plannerState.height > PLANNER_MAX_HEIGHT) {
                plannerState.height = PLANNER_MAX_HEIGHT;
                switchToMode(CameraMode.GOD);
            }
        } else if (currentMode === CameraMode.GOD) {
            // Zoom in from god → planner
            if (!zoomingOut) {
                plannerState.height = PLANNER_MAX_HEIGHT;
                switchToMode(CameraMode.PLANNER);
            }
        }
    }, { passive: false });
}

export function isPointerLocked() {
    return document.pointerLockElement === document.body;
}
