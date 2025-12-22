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
import {
    onMouseMove as editorMouseMove,
    onClick as editorClick,
    onDelete as editorDelete,
    onArrowLeft,
    onArrowRight,
    onRotateScroll,
    onScaleUp,
    onScaleDown,
    onToggleGrid,
    setEditorVisible,
    toggleEditorEnabled,
    isEditorEnabled,
    saveWorld,
    editorState
} from '../editor/index.js';

// Track if R key is held for rotation mode
let rKeyHeld = false;

// Check if we're in editor input mode (free cursor, no pointer lock)
function isEditorInputMode() {
    return getCurrentMode() === CameraMode.PLANNER && isEditorEnabled();
}

export function setupInput() {
    const overlay = document.getElementById('overlay');
    overlay.addEventListener('click', () => {
        // Don't request pointer lock in editor mode
        if (!isEditorInputMode()) {
            document.body.requestPointerLock();
        }
    });

    const crosshair = document.getElementById('crosshair');
    document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === document.body;
        // In editor mode, show different UI state
        if (isEditorInputMode()) {
            overlay.querySelector('span').textContent = 'Editor Mode - ESC to exit';
            overlay.style.alignItems = 'flex-start';
            overlay.style.paddingTop = '5vh';
            crosshair.style.display = 'none';  // No crosshair in editor mode
        } else {
            overlay.querySelector('span').textContent = locked ? 'Escape to Exit' : 'Click to Enter';
            overlay.style.alignItems = locked ? 'flex-start' : 'center';
            overlay.style.paddingTop = locked ? '5vh' : '0';
            crosshair.style.display = locked ? 'block' : 'none';
        }
    });

    // WASD movement - works regardless of pointer lock
    const onKey = (val) => (e) => {
        // In editor mode, check if we should handle WASD
        if (isEditorInputMode() || document.pointerLockElement === document.body) {
            switch (e.code) {
                case 'KeyW': moveState.forward = val; break;
                case 'KeyS': if (!e.ctrlKey) moveState.backward = val; break;
                case 'KeyA': moveState.left = val; break;
                case 'KeyD': moveState.right = val; break;
            }
        }
    };
    document.addEventListener('keydown', onKey(true));
    document.addEventListener('keyup', onKey(false));

    // Mode switching and jump
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Tab') {
            e.preventDefault();
            cycleMode();
            // Update editor visibility based on new mode
            setEditorVisible(getCurrentMode() === CameraMode.PLANNER);
        }
        if (e.code === 'Space' && getCurrentMode() === CameraMode.HUMAN && humanState.isGrounded) {
            e.preventDefault();
            humanState.radialVelocity = -JUMP_VELOCITY;
            humanState.isGrounded = false;
        }

        // Toggle editor mode with E
        if (e.code === 'KeyE') {
            const wasEnabled = isEditorEnabled();
            toggleEditorEnabled();
            setEditorVisible(getCurrentMode() === CameraMode.PLANNER);

            // When entering editor mode in planner view, exit pointer lock for free cursor
            if (!wasEnabled && isEditorEnabled() && getCurrentMode() === CameraMode.PLANNER) {
                if (document.pointerLockElement === document.body) {
                    document.exitPointerLock();
                }
                // Update overlay text
                overlay.querySelector('span').textContent = 'Editor Mode - ESC to exit';
            }
        }

        // Editor controls (planner mode only, when editor is enabled)
        if (isEditorInputMode()) {
            switch (e.code) {
                case 'ArrowLeft':
                    e.preventDefault();
                    onArrowLeft();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    onArrowRight();
                    break;
                case 'KeyR':
                    rKeyHeld = true;
                    break;
                case 'KeyG':
                    onToggleGrid();
                    break;
                case 'Equal': // + key
                case 'NumpadAdd':
                    onScaleUp();
                    break;
                case 'Minus':
                case 'NumpadSubtract':
                    onScaleDown();
                    break;
                case 'Delete':
                case 'Backspace':
                    e.preventDefault();
                    editorDelete();
                    break;
            }
        }

        // Save world (Ctrl+S in planner mode with editor enabled)
        if (e.code === 'KeyS' && e.ctrlKey && isEditorInputMode()) {
            e.preventDefault();
            saveWorld();
        }
    });

    // Track R key release
    document.addEventListener('keyup', (e) => {
        if (e.code === 'KeyR') {
            rKeyHeld = false;
        }
    });

    // Mouse movement for look control
    document.addEventListener('mousemove', (e) => {
        if (isEditorInputMode()) {
            // Editor mode: free cursor, right-click drag to pan camera
            if (editorState.isDragging) {
                // Drag to pan camera - use delta from last position
                const deltaX = e.clientX - editorState.lastMouseX;
                const deltaY = e.clientY - editorState.lastMouseY;

                setYaw(yaw - deltaX * MOUSE_SENSITIVITY);
                const newPitch = pitch - deltaY * MOUSE_SENSITIVITY;
                setPitch(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newPitch)));
                camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
            }

            // Track last mouse position for drag delta calculation
            editorState.lastMouseX = e.clientX;
            editorState.lastMouseY = e.clientY;

            // Always update editor preview for placement highlight
            editorMouseMove(e);
        } else if (document.pointerLockElement === document.body) {
            // Normal pointer lock mode
            setYaw(yaw - e.movementX * MOUSE_SENSITIVITY);
            const newPitch = pitch - e.movementY * MOUSE_SENSITIVITY;
            setPitch(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newPitch)));
            camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

            // Update editor preview in planner mode when editor is enabled
            if (getCurrentMode() === CameraMode.PLANNER && isEditorEnabled()) {
                editorMouseMove(e);
            }
        }
    });

    // Mouse down for editor mode
    document.addEventListener('mousedown', (e) => {
        if (isEditorInputMode()) {
            if (e.button === 0) {
                // Left click - place asset
                editorClick(e);
            } else if (e.button === 2) {
                // Right click - start camera drag
                editorState.lastMouseX = e.clientX;
                editorState.lastMouseY = e.clientY;
                editorState.isDragging = true;
            }
        } else if (document.pointerLockElement === document.body &&
            getCurrentMode() === CameraMode.PLANNER &&
            isEditorEnabled() &&
            e.button === 0) {
            editorClick(e);
        }
    });

    // Mouse up for editor mode
    document.addEventListener('mouseup', (e) => {
        if (isEditorInputMode() && e.button === 2) {
            // Right click released - stop camera drag
            editorState.isDragging = false;
        }
    });

    // Prevent context menu in editor mode
    document.addEventListener('contextmenu', (e) => {
        if (isEditorInputMode()) {
            e.preventDefault();
        }
    });

    // Scroll wheel for zoom and mode transitions
    document.addEventListener('wheel', (e) => {
        // Allow scroll in editor mode or when pointer locked
        if (!isEditorInputMode() && document.pointerLockElement !== document.body) return;
        if (transitionState.active) return;  // Don't zoom during transitions
        e.preventDefault();

        const currentMode = getCurrentMode();

        // R + scroll adjusts rotation in editor mode
        if (isEditorInputMode() && rKeyHeld) {
            onRotateScroll(e.deltaY > 0 ? 1 : -1);
            return;
        }

        // Horizontal scroll changes asset selection in planner mode when editor is enabled
        if (currentMode === CameraMode.PLANNER && isEditorEnabled() && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            if (e.deltaX > 0) {
                onArrowRight();
            } else if (e.deltaX < 0) {
                onArrowLeft();
            }
            return;
        }

        const zoomingOut = e.deltaY > 0;

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
