// Ground picking via raycasting
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let groundMesh = null;
let camera = null;
let usePointerLock = true;  // If true, raycast from center; if false, from mouse position

// Per-frame cache to avoid multiple raycasts
let cachedIntersection = null;

// Initialize with ground mesh reference
export function initRaycaster(ground, cam) {
    groundMesh = ground;
    camera = cam;
}

// Invalidate cache (call at start of each frame or on mouse move)
export function invalidateRaycastCache() {
    cachedIntersection = null;
}

// Set whether to use pointer lock mode (center) or free cursor mode
export function setPointerLockMode(pointerLocked) {
    usePointerLock = pointerLocked;
}

// Update mouse position for free cursor mode
export function updateMousePosition(event) {
    if (event && !usePointerLock) {
        // Convert to normalized device coordinates (-1 to +1)
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
}

// Get ground intersection point in world coordinates
export function getGroundIntersection() {
    if (!groundMesh || !camera) {
        return null;
    }

    // Return cached result if available (same frame)
    if (cachedIntersection !== null) {
        return cachedIntersection ? cachedIntersection.clone() : null;
    }

    // Update matrices before raycasting (required for rotating habitat)
    groundMesh.updateMatrixWorld(true);

    if (usePointerLock) {
        // Pointer lock mode: raycast from camera center (0, 0)
        const origin = new THREE.Vector3();
        const direction = new THREE.Vector3();
        camera.getWorldPosition(origin);
        camera.getWorldDirection(direction);
        raycaster.set(origin, direction);
    } else {
        // Free cursor mode: raycast from mouse position
        raycaster.setFromCamera(mouse, camera);
    }

    const intersects = raycaster.intersectObject(groundMesh, false);

    if (intersects.length > 0) {
        cachedIntersection = intersects[0].point.clone();
        return cachedIntersection.clone();
    }

    cachedIntersection = false;  // Mark as "checked but no hit"
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
