import * as THREE from 'three';

const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

const MOVE_SPEED = 1.2;
const MOUSE_SENSITIVITY = 0.002;
const GROUND_RADIUS = 649.8;
const CAMERA_HEIGHT = 2;
const PLAYER_RADIUS = GROUND_RADIUS - CAMERA_HEIGHT;
const JUMP_VELOCITY = 0.4;
const GRAVITY = 0.015;

// Jump state
let radialVelocity = 0;
let currentRadius = PLAYER_RADIUS;
let isGrounded = true;

let yaw = -Math.PI / 2;  // Start facing 90 degrees right
let pitch = 0;
let camera = null;
let cameraAnchor = null;
let scene = null;
let habitatGroup = null;
let godMode = false;

// Transition state
const TRANSITION_SPEED = 0.08;
let transitioning = false;
let targetPosition = new THREE.Vector3();
let targetRotationZ = 0;

export function setupControls(cam, anchor, scn, habitat) {
    camera = cam;
    cameraAnchor = anchor;
    scene = scn;
    habitatGroup = habitat;

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

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Tab') {
            e.preventDefault();
            toggleGodMode();
        }
        if (e.code === 'Space' && isGrounded && !godMode) {
            e.preventDefault();
            radialVelocity = -JUMP_VELOCITY;
            isGrounded = false;
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

function toggleGodMode() {
    if (transitioning) return; // Don't toggle during transition

    godMode = !godMode;
    transitioning = true;

    if (godMode) {
        // Get world position before re-parenting
        const worldPos = new THREE.Vector3();
        cameraAnchor.getWorldPosition(worldPos);

        // Move camera out of rotating habitat into scene
        habitatGroup.remove(cameraAnchor);
        scene.add(cameraAnchor);

        // Set world position, keep current rotation for now
        cameraAnchor.position.copy(worldPos);

        // Target: same position, but rotation zeroed out
        targetPosition.copy(worldPos);
        targetRotationZ = 0;
    } else {
        // Get world position
        const worldPos = new THREE.Vector3();
        cameraAnchor.getWorldPosition(worldPos);

        // Move back into habitat
        scene.remove(cameraAnchor);
        habitatGroup.add(cameraAnchor);

        // Convert world position to habitat local position
        habitatGroup.worldToLocal(worldPos);
        cameraAnchor.position.copy(worldPos);

        // Calculate target position on surface
        const dist = Math.sqrt(worldPos.x ** 2 + worldPos.y ** 2);
        const ratio = PLAYER_RADIUS / dist;
        targetPosition.set(worldPos.x * ratio, worldPos.y * ratio, worldPos.z);

        // Calculate target rotation for surface orientation
        const angle = Math.atan2(targetPosition.y, targetPosition.x);
        targetRotationZ = angle - Math.PI / 2 + Math.PI;
    }
}

export function updateMovement() {
    if (!cameraAnchor || !camera) return;

    // Handle smooth transition
    if (transitioning) {
        cameraAnchor.position.lerp(targetPosition, TRANSITION_SPEED);
        cameraAnchor.rotation.z += (targetRotationZ - cameraAnchor.rotation.z) * TRANSITION_SPEED;

        // Check if transition is complete
        const posDist = cameraAnchor.position.distanceTo(targetPosition);
        const rotDist = Math.abs(targetRotationZ - cameraAnchor.rotation.z);
        if (posDist < 0.1 && rotDist < 0.01) {
            cameraAnchor.position.copy(targetPosition);
            cameraAnchor.rotation.z = targetRotationZ;
            transitioning = false;
        }
        return; // No movement during transition
    }

    if (godMode) {
        // God mode: free flying in world space
        // Use world quaternion to account for any anchor rotation
        const worldQuat = new THREE.Quaternion();
        camera.getWorldQuaternion(worldQuat);

        const direction = new THREE.Vector3();
        const front = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat);

        if (moveState.forward) direction.add(front);
        if (moveState.backward) direction.sub(front);
        if (moveState.right) direction.add(right);
        if (moveState.left) direction.sub(right);

        if (direction.length() > 0) {
            direction.normalize().multiplyScalar(MOVE_SPEED * 5);
            cameraAnchor.position.add(direction);
        }
    } else {
        // Human mode: walking on ring surface
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
            direction.normalize().multiplyScalar(MOVE_SPEED);
            direction.applyQuaternion(cameraAnchor.quaternion);
            cameraAnchor.position.add(direction);
        }

        // Apply jump physics
        if (!isGrounded) {
            radialVelocity += GRAVITY;
            currentRadius += radialVelocity;

            if (currentRadius >= PLAYER_RADIUS) {
                currentRadius = PLAYER_RADIUS;
                radialVelocity = 0;
                isGrounded = true;
            }
        }

        // Constrain to current radius (ground or mid-jump)
        const distFromCenter = Math.sqrt(cameraAnchor.position.x ** 2 + cameraAnchor.position.y ** 2);
        const ratio = currentRadius / distFromCenter;
        cameraAnchor.position.x *= ratio;
        cameraAnchor.position.y *= ratio;

        // Constrain Z position
        if (Math.abs(cameraAnchor.position.z) > 60) {
            cameraAnchor.position.z = Math.sign(cameraAnchor.position.z) * 60;
        }
    }
}

export function isPointerLocked() {
    return document.pointerLockElement === document.body;
}
