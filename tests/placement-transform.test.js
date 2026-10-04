import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { applyPlacementTransform, validateWorldTransform, isExteriorPlacement, UNIT_QUATERNION_TOLERANCE } from '../src/editor/placement-transform.js';
import { orientToSurface, initPlacement, loadPlacedAssets, removeAsset } from '../src/editor/placement.js';
import { editorState, importWorldState, exportWorldState, GROUND_RADIUS } from '../src/editor/state.js';
import { characterColliders } from '../src/physics/collider-world.js';
import { completedModels } from '../src/completed-models.js';
import { BUILDINGS, PLANTS } from '../src/editor/catalog.js';
import { materialKitKey } from '../src/editor/material-kits.js';

const freeSurface = () => ({
    deckId: 'exterior-structures', height: 0,
    worldTransform: { position: [1050, -150, 220], quaternion: [0, 0.6, 0, -0.8] }
});
const neverSurface = () => { throw new Error('free placement must not orient to surface'); };

test('free Object3D transform is exact, local, ignores yaw/unknown fields and retains scale', () => {
    const object = new THREE.Object3D(), habitat = new THREE.Group(), surface = freeSurface();
    habitat.rotation.z = 1.2;
    habitat.add(object);
    surface.worldTransform.scale = 999;
    surface.worldTransform.futureField = 'preserved';
    assert.equal(applyPlacementTransform(object, { theta: 1, z: -30, rotation: 2, scale: 4, surface }, neverSurface), true);
    assert.deepEqual(object.position.toArray(), surface.worldTransform.position);
    assert.deepEqual(object.quaternion.toArray(), surface.worldTransform.quaternion);
    assert.equal(object.quaternion.length(), 1);
    assert.deepEqual(object.scale.toArray(), [4, 4, 4]);
    assert.equal(object.userData.surface, surface);
    assert.equal(object.userData.worldTransform, surface.worldTransform);
    assert.equal(object.userData.exterior, true);
    assert.equal(object.userData.deckId, 'exterior-structures');
    habitat.updateMatrixWorld(true);
    assert.notDeepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), object.position.toArray());
    assert.equal(isExteriorPlacement({ deckId: 'residential-a' }), false);
    assert.equal(isExteriorPlacement(null), false);
});

test('legacy surface transforms retain bit-for-bit position, quaternion and defaults', () => {
    for (const theta of [0, 0.73, Math.PI, 2 * Math.PI]) {
        for (const elevation of [0, -48, 20]) {
            const expected = new THREE.Object3D(), actual = new THREE.Object3D();
            // Independent copy of the original surface arithmetic/basis convention.
            const radius = elevation ? GROUND_RADIUS - elevation - .05 : GROUND_RADIUS - .3;
            expected.position.copy(new THREE.Vector3(radius * Math.cos(theta), radius * Math.sin(theta), -12));
            const up = new THREE.Vector3(-Math.cos(theta), -Math.sin(theta), 0);
            const forward = new THREE.Vector3(0, 0, 1);
            const right = new THREE.Vector3().crossVectors(up, forward).normalize();
            expected.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
            expected.rotateY(.34);
            expected.scale.setScalar(4);
            assert.equal(applyPlacementTransform(actual, { theta, z: -12, elevation, rotation: .34 }, orientToSurface), false);
            assert.deepEqual(actual.position.toArray(), expected.position.toArray());
            assert.deepEqual(actual.quaternion.toArray(), expected.quaternion.toArray());
            assert.deepEqual(actual.scale.toArray(), expected.scale.toArray());
        }
    }
});

test('malformed explicit transforms reject without coercion, fallback, normalization or object mutation', () => {
    const valid = freeSurface().worldTransform;
    const malformed = [null, undefined, false, 1, [], {},
        ...[[1, 2], [1, 2, 3, 4], ['1', 2, 3], [NaN, 2, 3], [Infinity, 2, 3], [null, 2, 3], Array(3), new Float32Array([1, 2, 3])].map(position => ({ ...valid, position })),
        ...[[0, 0, 0], [0, 0, 0, 1, 2], [0, 0, 0, 0], [0, 0, 0, 2], [0, 0, 0, '1'], [0, 0, NaN, 1], [0, 0, Infinity, 1], Array(4)].map(quaternion => ({ ...valid, quaternion }))
    ];
    for (const worldTransform of malformed) {
        const object = new THREE.Object3D();
        object.position.set(1, 2, 3);
        const before = object.matrix.clone();
        assert.throws(() => applyPlacementTransform(object, { surface: { worldTransform } }, neverSurface), TypeError);
        assert.deepEqual(object.position.toArray(), [1, 2, 3]);
        assert.deepEqual(object.quaternion.toArray(), [0, 0, 0, 1]);
        assert.deepEqual(object.matrix.elements, before.elements);
        assert.deepEqual(object.userData, {});
    }
});

test('unit-norm tolerance has bounded acceptance and never repairs components', () => {
    for (const delta of [-UNIT_QUATERNION_TOLERANCE / 2, 0, UNIT_QUATERNION_TOLERANCE / 2]) {
        const worldTransform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1 + delta] };
        const object = new THREE.Object3D();
        assert.equal(validateWorldTransform(worldTransform), worldTransform);
        applyPlacementTransform(object, { surface: { worldTransform } }, neverSurface);
        assert.deepEqual(object.quaternion.toArray(), worldTransform.quaternion);
    }
    for (const delta of [-UNIT_QUATERNION_TOLERANCE * 2, UNIT_QUATERNION_TOLERANCE * 2]) {
        assert.throws(() => validateWorldTransform({ position: [0, 0, 0], quaternion: [0, 0, 0, 1 + delta] }), /unit length/);
    }
});

test('all nine actual exterior OBJ fixtures, including Hub, are loader-allowed and structure pooled', async () => {
    const models = completedModels.filter(model => model.materialKit === 'structure');
    assert.equal(models.length, 9);
    assert.ok(models.some(model => model.id === 'TorusStructure_HubA'));
    for (const model of models) {
        assert.ok(BUILDINGS.includes(model.id), model.id);
        assert.equal(materialKitKey(model.id, [...BUILDINGS, ...PLANTS]), 'structure', model.id);
        const object = new OBJLoader().parse(await fs.readFile(new URL(`../assets/${model.directory}/${model.id}.obj`, import.meta.url), 'utf8'));
        assert.ok(object.children.length > 0, model.id);
        const surface = freeSurface();
        applyPlacementTransform(object, { surface }, neverSurface);
        assert.deepEqual(object.position.toArray(), surface.worldTransform.position);
        assert.deepEqual(object.quaternion.toArray(), surface.worldTransform.quaternion);
        assert.deepEqual(object.scale.toArray(), [4, 4, 4]);
        assert.ok(new THREE.Box3().setFromObject(object).isEmpty() === false, model.id);
    }
});

test('authored exterior compact records keep null blockout and raw transform through JSON reload/export', () => {
    const previous = { ...editorState };
    const surface = freeSurface();
    surface.futureMetadata = { unchanged: true };
    const record = ['asset_92001', 0, 0, 0, 4, 0, null, surface];
    try {
        importWorldState({ version: 4, assetTypes: ['TorusStructure_HubA'], assets: [record] });
        assert.equal(editorState.placedAssets[0].surface, surface);
        const serialized = JSON.parse(JSON.stringify(exportWorldState()));
        assert.deepEqual(serialized.assets[0], record);
        assert.equal(serialized.assets[0][6], null);
        importWorldState(serialized);
        assert.deepEqual(exportWorldState().assets[0], record);
    } finally {
        Object.assign(editorState, previous);
    }
});

test('runtime load, scene membership, collider exclusion, removal and compact export/import preserve raw surface', async () => {
    const habitat = new THREE.Group(), surface = freeSurface();
    surface.futureMetadata = { unchanged: true };
    const blockout = { width: 2, height: 2, depth: 2, color: 0xffffff };
    const records = [
        ['asset_91001', 0, .7, 12, 4, 1.5, blockout, surface],
        ['asset_91002', 0, .8, 13, 4, .25, blockout, { deckId: 'legacy-deck', height: -12 }]
    ];
    const previous = { ...editorState };
    initPlacement(habitat);
    try {
        importWorldState({ version: 4, assetTypes: ['fixture-blockout'], assets: records });
        assert.equal(editorState.placedAssets[0].surface, surface);
        await loadPlacedAssets(editorState.placedAssets);
        assert.equal(habitat.children.length, 2);
        const exterior = habitat.children.find(child => child.userData.assetId === 'asset_91001');
        assert.deepEqual(exterior.position.toArray(), surface.worldTransform.position);
        assert.deepEqual(exterior.quaternion.toArray(), surface.worldTransform.quaternion);
        assert.equal(exterior.userData.exterior, true);
        assert.equal(characterColliders.colliders.has('asset_91001'), false);
        assert.equal(characterColliders.colliders.has('asset_91002'), true);
        const exported = JSON.parse(JSON.stringify(exportWorldState()));
        assert.deepEqual(exported.assets, records);
        importWorldState(exported);
        assert.deepEqual(editorState.placedAssets[0].surface, surface);
        assert.equal(removeAsset('asset_91001'), true);
        assert.equal(habitat.children.length, 1);
        assert.equal(editorState.placedAssets.some(asset => asset.id === 'asset_91001'), false);
        assert.equal(removeAsset('asset_91002'), true);
        assert.equal(characterColliders.colliders.has('asset_91002'), false);
    } finally {
        for (const record of records) removeAsset(record[0]);
        Object.assign(editorState, previous);
        initPlacement(null);
    }
});
