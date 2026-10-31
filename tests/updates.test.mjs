import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('private fork has no automatic update module, route or client entry', () => {
  assert.equal(fs.existsSync(new URL('../lib/updates.js', import.meta.url)), false);
  for (const file of [
    'lib/index.js',
    'lib/http/sync-routes.js',
    'src/client/10-api.js',
    'src/client/30-sync-state.js',
    'src/client/31-startup-and-review.js',
    'src/client/54-section.js',
  ]) {
    const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /createUpdateChecker|api\/update|UpdateNotice|loadUpdate/);
  }
});
