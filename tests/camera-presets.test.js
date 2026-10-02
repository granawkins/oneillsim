import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCameraPreset, cameraPoseFromPreset } from '../src/camera-presets.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('Cartesian plan coordinates locate the view on the ring and accept a 10-degree upward pitch', () => {
    const preset = parseCameraPreset('?x=0&y=830&z=12&yaw=0&pitch=10', 830);
    close(preset.theta, Math.PI / 2);
    assert.equal(preset.z, 12);
    close(preset.yaw, 0);
    close(preset.pitch, Math.PI / 18);
    assert.equal(preset.mode, 'human');
});

test('planner mode uses explicit height and ring angle in degrees', () => {
    const preset = parseCameraPreset('?theta=30&z=-5&mode=planner&height=75&yaw=180&ringRotation=15', 830);
    close(preset.theta, Math.PI / 6);
    close(preset.yaw, Math.PI);
    close(preset.ringRotation, Math.PI / 12);
    assert.equal(preset.height, 75);
    assert.equal(preset.mode, 'planner');
});

test('incomplete or off-ring Cartesian coordinates are rejected', () => {
    assert.throws(() => parseCameraPreset('?x=830', 830), /x and y/);
    assert.throws(() => parseCameraPreset('?x=100&y=100', 830), /ground radius/);
});

test('camera pose maps the preset to the curved ground radius and pitch', () => {
    const preset = parseCameraPreset('?x=0&y=830&z=12&yaw=0&pitch=10', 830);
    const pose = cameraPoseFromPreset(preset, 830, 828);
    close(pose.position[0], 0);
    close(pose.position[1], 828);
    assert.equal(pose.position[2], 12);
    close(pose.anchorRotationZ, Math.PI);
    close(pose.cameraRotation.pitch, Math.PI / 18);
    close(pose.cameraRotation.yaw, 0);
});

test('planner pose places the camera at the requested height above the ground radius', () => {
    const preset = parseCameraPreset('?theta=30&z=-5&mode=planner&height=75', 830);
    const pose = cameraPoseFromPreset(preset, 830, 828);
    close(pose.position[0], 755 * Math.cos(Math.PI / 6));
    close(pose.position[1], 755 * Math.sin(Math.PI / 6));
    assert.equal(pose.position[2], -5);
    close(pose.anchorRotationZ, 2 * Math.PI / 3);
});

test('invalid view modes, heights, and pitches are rejected', () => {
    assert.throws(() => parseCameraPreset('?mode=god', 830), /mode/);
    assert.throws(() => parseCameraPreset('?mode=planner&height=300', 830), /height/);
    assert.throws(() => parseCameraPreset('?pitch=90', 830), /pitch/);
});
