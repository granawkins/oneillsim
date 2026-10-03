import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshotOptions } from '../src/snapshot-options.js';

test('game snapshot validates coordinates and creates a deterministic capture URL', () => {
    const options = parseSnapshotOptions(new URLSearchParams(
        'scene=game&x=0&y=830&z=3&yaw=0&pitch=10&mode=human&imageWidth=1280&imageHeight=720'
    ));
    assert.equal(options.scene, 'game');
    assert.equal(options.pagePath, '/');
    assert.deepEqual(options.viewport, { width: 1280, height: 720 });
    const pageParams = new URLSearchParams(options.pageSearch);
    assert.equal(pageParams.get('capture'), '1');
    assert.equal(pageParams.get('mode'), 'human');
    assert.equal(pageParams.get('pitch'), '10');
    assert.equal(pageParams.get('theta'), '90');
});

test('asset snapshot accepts a registered model and explicit camera angle', () => {
    const options = parseSnapshotOptions(new URLSearchParams(
        'scene=asset&asset=TorusHome_ModA&azimuth=12&elevation=16&distance=18'
    ));
    assert.equal(options.pagePath, '/assets/houses/');
    const pageParams = new URLSearchParams(options.pageSearch);
    assert.equal(pageParams.get('capture'), '1');
    assert.equal(pageParams.get('asset'), 'TorusHome_ModA');
    assert.equal(pageParams.get('azimuth'), '12');
    assert.equal(new URLSearchParams(parseSnapshotOptions(new URLSearchParams('scene=asset')).pageSearch).get('distance'), '17', 'the default inspection frame should include the whole house');
});

test('snapshot endpoint rejects unknown assets, invalid viewpoints, and oversized images', () => {
    assert.throws(() => parseSnapshotOptions(new URLSearchParams('scene=asset&asset=old-model')), /asset/);
    assert.throws(() => parseSnapshotOptions(new URLSearchParams('scene=game&x=100&y=100')), /ground radius/);
    assert.throws(() => parseSnapshotOptions(new URLSearchParams('scene=asset&imageWidth=5000')), /imageWidth/);
});
