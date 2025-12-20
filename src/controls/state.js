import * as THREE from 'three';
import { PLAYER_RADIUS, PLANNER_DEFAULT_HEIGHT } from './constants.js';

// Camera mode enum
export const CameraMode = {
    HUMAN: 'human',
    PLANNER: 'planner',
    GOD: 'god'
};

export const MODE_ORDER = [CameraMode.HUMAN, CameraMode.PLANNER, CameraMode.GOD];

// Current mode
let currentMode = CameraMode.HUMAN;

export function getCurrentMode() {
    return currentMode;
}

export function setCurrentMode(mode) {
    currentMode = mode;
}

// Input state
export const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

// Camera orientation (shared across modes)
export let yaw = -Math.PI / 2;  // Start facing 90 degrees right
export let pitch = 0;

export function setYaw(value) {
    yaw = value;
}

export function setPitch(value) {
    pitch = value;
}

// Scene references
export let camera = null;
export let cameraAnchor = null;
export let scene = null;
export let habitatGroup = null;

export function setRefs(cam, anchor, scn, habitat) {
    camera = cam;
    cameraAnchor = anchor;
    scene = scn;
    habitatGroup = habitat;
}

// Human mode state
export const humanState = {
    radialVelocity: 0,
    currentRadius: PLAYER_RADIUS,
    isGrounded: true
};

// Planner mode state
export const plannerState = {
    theta: 0,     // angle around the ring (in XY plane)
    z: 0,         // position along the ring axis
    height: PLANNER_DEFAULT_HEIGHT  // height above ground
};

// God mode state
export const godState = {
    speedMultiplier: 0,  // 0 to 1, for ease-in when entering
    entryDirection: 1    // 1 = forward (zoom in), -1 = backward (zoom out)
};

// Transition state for animated mode switches
export const transitionState = {
    active: false,
    from: null,           // CameraMode we're coming from
    to: null,             // CameraMode we're going to
    startTime: 0,         // timestamp when transition started
    duration: 0,          // how long the transition should take
    startPosition: new THREE.Vector3(),
    startQuaternion: new THREE.Quaternion(),
    targetPosition: new THREE.Vector3(),
    targetQuaternion: new THREE.Quaternion(),
    // For planner target calculation
    targetTheta: 0,
    targetZ: 0,
    targetHeight: 0
};

export function startTransition(from, to, duration) {
    transitionState.active = true;
    transitionState.from = from;
    transitionState.to = to;
    transitionState.startTime = performance.now();
    transitionState.duration = duration;
}

export function endTransition() {
    transitionState.active = false;
    transitionState.from = null;
    transitionState.to = null;
}
