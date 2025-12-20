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

// Transition state (for future use)
export let transitioning = false;
export let transitionFrom = null;
export let transitionTo = null;
export const targetPosition = new THREE.Vector3();
export const targetRotation = new THREE.Euler();

export function setTransitioning(value) {
    transitioning = value;
}

export function setTransitionFrom(value) {
    transitionFrom = value;
}

export function setTransitionTo(value) {
    transitionTo = value;
}
