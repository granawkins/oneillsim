// Browser-independent placement policy. worldTransform is habitatGroup-local,
// despite its persisted name; do not convert through the rotating scene matrix.
export const UNIT_QUATERNION_TOLERANCE = 1e-6;

export function validateWorldTransform(transform) {
    const finiteArray = (value, length) => Array.isArray(value)
        && value.length === length
        && Array.from(value).every(component => typeof component === 'number' && Number.isFinite(component));
    if (!transform || typeof transform !== 'object'
        || !finiteArray(transform.position, 3)
        || !finiteArray(transform.quaternion, 4)) {
        throw new TypeError('worldTransform requires finite position[3] and quaternion[4] numeric arrays');
    }
    if (Math.abs(Math.hypot(...transform.quaternion) - 1) > UNIT_QUATERNION_TOLERANCE) {
        throw new TypeError('worldTransform quaternion must be unit length (tolerance 1e-6)');
    }
    return transform;
}

export function isExteriorPlacement(surface) {
    return surface?.deckId === 'exterior-structures';
}

// Keep the existing surface orientation implementation as the fallback callback.
// Callers retain their legacy elevation/rotation/scale defaults; free transforms
// replace BOTH surface orientation and yaw, preserving authored components exactly.
export function applyPlacementTransform(object, {
    theta, z, elevation = 0, rotation = 0, scale = 4.0, surface = null
}, orientToSurface) {
    const free = surface != null && Object.prototype.hasOwnProperty.call(surface, 'worldTransform');
    if (free) {
        const transform = validateWorldTransform(surface.worldTransform);
        object.position.fromArray(transform.position);
        object.quaternion.fromArray(transform.quaternion);
    } else {
        orientToSurface(object, theta, z, elevation);
        object.rotateY(rotation);
    }
    object.scale.setScalar(scale);
    if (surface) {
        object.userData.surface = surface;
        if (surface.deckId) object.userData.deckId = surface.deckId;
        if (free) object.userData.worldTransform = surface.worldTransform;
    }
    object.userData.exterior = isExteriorPlacement(surface);
    return free;
}
