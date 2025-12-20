import * as THREE from 'three';
import {
    MOUSE_SENSITIVITY,
    JUMP_VELOCITY,
    PLANNER_MIN_HEIGHT,
    PLANNER_MAX_HEIGHT,
    PLANNER_ZOOM_HEIGHT_SPEED,
    PLANNER_ZOOM_THETA_SPEED,
    GROUND_RADIUS
} from './constants.js';
import {
    CameraMode,
    getCurrentMode,
    yaw,
    pitch,
    setYaw,
    setPitch,
    camera,
    cameraAnchor,
    moveState,
    humanState,
    plannerState,
    godState,
    transitionState
} from './state.js';
import { cycleMode, switchToMode, startGodTransition, startPlannerTransition } from './transitions.js';

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
        if (transitionState.active) return;  // Don't zoom during transitions
        e.preventDefault();

        const zoomingOut = e.deltaY > 0;
        const currentMode = getCurrentMode();

        // Determine facing direction for theta movement
        // yaw = -PI/2 is forward, yaw = PI/2 is backward
        const facingForward = Math.sin(yaw) <= 0;
        const thetaSign = facingForward ? 1 : -1;

        if (currentMode === CameraMode.HUMAN) {
            // Zoom out from human → planner
            if (zoomingOut) {
                plannerState.height = PLANNER_MIN_HEIGHT;
                switchToMode(CameraMode.PLANNER);
            }
        } else if (currentMode === CameraMode.PLANNER) {
            // Zoom changes height AND moves along theta (up+back or down+forward)
            if (zoomingOut) {
                plannerState.height += PLANNER_ZOOM_HEIGHT_SPEED;
                plannerState.theta -= PLANNER_ZOOM_THETA_SPEED * thetaSign;  // backward
            } else {
                plannerState.height -= PLANNER_ZOOM_HEIGHT_SPEED;
                plannerState.theta += PLANNER_ZOOM_THETA_SPEED * thetaSign;  // forward
            }

            // Update cameraAnchor position immediately so transitions capture correct position
            const radius = GROUND_RADIUS - plannerState.height;
            cameraAnchor.position.x = radius * Math.cos(plannerState.theta);
            cameraAnchor.position.y = radius * Math.sin(plannerState.theta);
            cameraAnchor.position.z = plannerState.z;
            cameraAnchor.rotation.set(0, 0, plannerState.theta - Math.PI / 2 + Math.PI);

            // Zoom in past min → human
            if (plannerState.height < PLANNER_MIN_HEIGHT) {
                plannerState.height = PLANNER_MIN_HEIGHT;
                switchToMode(CameraMode.HUMAN);
            }
            // Zoom out past max → god (with ease-in)
            else if (plannerState.height > PLANNER_MAX_HEIGHT) {
                plannerState.height = PLANNER_MAX_HEIGHT;
                // Update position with clamped height before transitioning
                const clampedRadius = GROUND_RADIUS - PLANNER_MAX_HEIGHT;
                cameraAnchor.position.x = clampedRadius * Math.cos(plannerState.theta);
                cameraAnchor.position.y = clampedRadius * Math.sin(plannerState.theta);
                godState.entryDirection = -thetaSign;  // continuing backward
                startGodTransition();
            }
        } else if (currentMode === CameraMode.GOD) {
            // Zoom in from god → planner (animated transition)
            if (!zoomingOut) {
                startPlannerTransition();
            }
        }
    }, { passive: false });
}

export function isPointerLocked() {
    return document.pointerLockElement === document.body;
}
