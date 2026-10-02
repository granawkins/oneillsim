const toRadians = (degrees) => degrees * Math.PI / 180;

function readNumber(params, name, fallback, min, max) {
    if (!params.has(name)) return fallback;
    const value = Number(params.get(name));
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(`${name} must be a finite number between ${min} and ${max}`);
    }
    return value;
}

/**
 * Parse a reproducible view of the habitat surface.
 * x/y are plan-view metres on the modeled ground circle; theta is degrees.
 * yaw/pitch are local camera degrees; positive pitch looks upward.
 */
export function parseCameraPreset(input, groundRadius = 830) {
    const params = input instanceof URLSearchParams
        ? input
        : new URLSearchParams(typeof input === 'string' ? input : '');
    const hasX = params.has('x');
    const hasY = params.has('y');
    if (hasX !== hasY) throw new TypeError('x and y must be provided together');

    let thetaDegrees = 90;
    if (hasX && hasY) {
        const x = readNumber(params, 'x', 0, -groundRadius * 2, groundRadius * 2);
        const y = readNumber(params, 'y', 0, -groundRadius * 2, groundRadius * 2);
        const radius = Math.hypot(x, y);
        if (Math.abs(radius - groundRadius) > 1) {
            throw new RangeError(`x and y must lie on the modeled ground radius (${groundRadius} m)`);
        }
        thetaDegrees = Math.atan2(y, x) * 180 / Math.PI;
    } else {
        thetaDegrees = readNumber(params, 'theta', thetaDegrees, -3600, 3600);
    }

    const z = readNumber(params, 'z', 0, -60, 60);
    const yawDegrees = readNumber(params, 'yaw', -90, -3600, 3600);
    const pitchDegrees = readNumber(params, 'pitch', 0, -89, 89);
    const mode = params.get('mode') || 'human';
    if (mode !== 'human' && mode !== 'planner') {
        throw new RangeError('mode must be human or planner');
    }
    const height = readNumber(params, 'height', 50, 10, 200);
    const ringRotationDegrees = readNumber(params, 'ringRotation', 0, -3600, 3600);

    const theta = toRadians(thetaDegrees);
    return {
        mode,
        theta,
        thetaDegrees,
        z,
        yaw: toRadians(yawDegrees),
        yawDegrees,
        pitch: toRadians(pitchDegrees),
        pitchDegrees,
        height,
        ringRotation: toRadians(ringRotationDegrees),
        ringRotationDegrees,
        capture: params.get('capture') === '1',
        x: groundRadius * Math.cos(theta),
        y: groundRadius * Math.sin(theta),
    };
}

/** Calculate the deterministic world pose for a parsed camera preset. */
export function cameraPoseFromPreset(preset, groundRadius = 830, humanRadius = groundRadius - 2) {
    const radius = preset.mode === 'planner' ? groundRadius - preset.height : humanRadius;
    return {
        position: [radius * Math.cos(preset.theta), radius * Math.sin(preset.theta), preset.z],
        anchorRotationZ: preset.theta + Math.PI / 2,
        cameraRotation: { pitch: preset.pitch, yaw: preset.yaw, roll: 0, order: 'YXZ' },
        ringRotation: preset.ringRotation,
    };
}
