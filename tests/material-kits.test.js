import test from 'node:test';
import assert from 'node:assert/strict';
import {materialKitKey} from '../src/editor/material-kits.js';
test('explicit compatible pools retain old kits and isolate district atlases', () => {
  assert.equal(materialKitKey('TorusBench_A'),'street');
  assert.equal(materialKitKey('TorusApartment_TerraceA'),'residential');
  for (const suffix of ['Housing5A','Housing4A','Housing2A','SchoolA','ClinicA','HallA','ShopsA','OfficesA','WorkshopA','StorageA','RecreationA','CommunityA']) assert.equal(materialKitKey(`TorusDistrict_${suffix}`),'district-buildings');
  assert.equal(materialKitKey('TorusHome_ModA'),null);
  assert.equal(materialKitKey('TorusDistrict_MadeUp'),null);
});
test('generated landscape names require catalog membership and exact identity', () => {
  for (const suffix of ['ParkA','TreeA','Path01','Terrace01']) {
    const name=`TorusDistrict_${suffix}`;
    assert.equal(materialKitKey(name),null);
    assert.equal(materialKitKey(name,[name]),'district-landscape');
  }
  for (const name of ['TorusDistrict_Path01_extra','TorusDistrict_Unknown','TorusDistrict_ParkAA']) assert.equal(materialKitKey(name,[name]),null);
});
