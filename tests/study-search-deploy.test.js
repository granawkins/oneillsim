import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production service loads shared application secrets without storing a credential in its unit', async () => {
  const unit = await readFile(path.join(projectRoot, 'oneillsim.service'), 'utf8');
  assert.match(unit, /^EnvironmentFile=\/home\/granawkins\/.env$/m);
  assert.doesNotMatch(unit, /^Environment=OPENROUTER_API_KEY=/m);
});
