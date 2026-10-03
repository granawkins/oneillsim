import test from 'node:test';
import assert from 'node:assert/strict';
import { assetGroups, assetTypes, findModelType } from '../src/asset-library.js';

test('library types have stable unique slugs and models share a type reference set', () => {
  assert.equal(new Set(assetTypes.map(type => type.slug)).size, assetTypes.length);
  const variants = assetTypes.flatMap(type => type.variants);
  assert.equal(new Set(variants.map(variant => variant.id)).size, variants.length);
  assert.ok(assetGroups.every(group => group.types.length));
  assert.ok(assetTypes.every(type => /^[a-z0-9-]+$/.test(type.slug)));
  assert.equal(findModelType('TorusHome_ModA').slug, 'houses');
  assert.ok(findModelType('TorusHome_ModA').references.length > 0);
  assert.equal(findModelType('does-not-exist'), undefined);
});
