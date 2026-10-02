import { parseCameraPreset } from './camera-presets.js';

const SNAPSHOT_ASSETS = new Set(['TorusHome_ModA']);

function numberParam(params, name, fallback, min, max, integer = false) {
    if (!params.has(name)) return fallback;
    const value = Number(params.get(name));
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        throw new RangeError(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
    }
    return value;
}

function pageSearchForGame(params, groundRadius) {
    const preset = parseCameraPreset(params, groundRadius);
    const pageParams = new URLSearchParams({
        capture: '1',
        theta: String(preset.thetaDegrees),
        z: String(preset.z),
        yaw: String(preset.yawDegrees),
        pitch: String(preset.pitchDegrees),
        mode: preset.mode,
        height: String(preset.height),
        ringRotation: String(preset.ringRotationDegrees),
    });
    return { preset, pageSearch: pageParams.toString() };
}

function pageSearchForAsset(params) {
    const asset = params.get('asset') || 'TorusHome_ModA';
    if (!SNAPSHOT_ASSETS.has(asset)) throw new RangeError(`asset must be one of: ${[...SNAPSHOT_ASSETS].join(', ')}`);
    const azimuth = numberParam(params, 'azimuth', 38, -180, 180);
    const elevation = numberParam(params, 'elevation', 22, -10, 75);
    const distance = numberParam(params, 'distance', 17, 7, 45);
    const modelRotation = numberParam(params, 'modelRotation', 0, -3600, 3600);
    const pageParams = new URLSearchParams({
        capture: '1',
        asset,
        azimuth: String(azimuth),
        elevation: String(elevation),
        distance: String(distance),
        modelRotation: String(modelRotation),
        autoRotate: '0',
    });
    return { asset, pageSearch: pageParams.toString() };
}

/** Validate and canonicalize a public snapshot request. */
export function parseSnapshotOptions(input, groundRadius = 830) {
    const params = input instanceof URLSearchParams
        ? input
        : new URLSearchParams(typeof input === 'string' ? input : '');
    const scene = params.get('scene') || 'game';
    if (scene !== 'game' && scene !== 'asset') throw new RangeError('scene must be game or asset');

    const width = numberParam(params, 'imageWidth', 1280, 320, 1920, true);
    const height = numberParam(params, 'imageHeight', 720, 240, 1200, true);
    if (width * height > 2_304_000) throw new RangeError('image dimensions exceed the snapshot pixel limit');
    const viewport = { width, height };

    if (scene === 'asset') {
        const assetOptions = pageSearchForAsset(params);
        return {
            scene,
            asset: assetOptions.asset,
            viewport,
            pagePath: '/assets/',
            pageSearch: assetOptions.pageSearch,
        };
    }

    const gameOptions = pageSearchForGame(params, groundRadius);
    return {
        scene,
        camera: gameOptions.preset,
        viewport,
        pagePath: '/',
        pageSearch: gameOptions.pageSearch,
    };
}
