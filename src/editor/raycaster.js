// Ground picking via raycasting
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();

let groundMesh = null;
let camera = null;

// Initialize with ground mesh reference
export function initRaycaster(ground, cam) {
    groundMesh = ground;
    camera = cam;
}

// Update mouse position - not needed in pointer lock mode
export function updateMousePosition(event) {
    // In pointer lock mode, we always use center of screen
}

// Get ground intersection point in world coordinates
// In pointer lock mode, the crosshair is at center (0, 0)
export function getGroundIntersection() {
    if (!groundMesh || !camera) {
        return null;
    }

    // Update matrices before raycasting
    camera.updateMatrixWorld(true);
    groundMesh.updateMatrixWorld(true);

    // Get camera world position and direction
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();

    camera.getWorldPosition(origin);
    camera.getWorldDirection(direction);

    // Set ray directly from camera position and direction
    raycaster.set(origin, direction);

    const intersects = raycaster.intersectObject(groundMesh, false);

    if (intersects.length > 0) {
        return intersects[0].point.clone();
    }

    return null;
}

let habitatGroupRef = null;

// Set habitat group reference for coordinate conversion
export function setHabitatGroup(group) {
    habitatGroupRef = group;
}

// Convert world point to surface coordinates (theta, z)
// This accounts for the habitat's rotation
export function worldToSurface(point) {
    // Convert world point to habitat-local coordinates
    let localPoint = point.clone();
    if (habitatGroupRef) {
        habitatGroupRef.updateMatrixWorld(true);
        habitatGroupRef.worldToLocal(localPoint);
    }

    // Now calculate theta and z in local space
    const theta = Math.atan2(localPoint.y, localPoint.x);
    const z = localPoint.z;
    return { theta, z };
}

// Convert surface coordinates to world point
export function surfaceToWorld(theta, z, radius = 649.5) {
    return new THREE.Vector3(
        radius * Math.cos(theta),
        radius * Math.sin(theta),
        z
    );
}

// Get surface coordinates from current mouse position
export function getSurfacePosition() {
    const point = getGroundIntersection();
    if (!point) return null;
    return worldToSurface(point);
}
