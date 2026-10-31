import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SyncEngine } from '../lib/sync.js';
import { applyScopeFile } from '../lib/scope.js';

function fixture(t) {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'chatsync-scope-race-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const target = path.join(home, 'settings.yaml');
  fs.writeFileSync(target, 'old');
  return {
    engine: new SyncEngine(home),
    target,
    change: { file: 'settings.yaml', target, before: Buffer.from('old'), after: Buffer.from('remote') },
  };
}
test('save after initial check is retained and import stops', t => {
  const { engine, target, change } = fixture(t);
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (from === target) fs.writeFileSync(target, 'latest');
    return rename(from, to);
  };
  try {
    assert.throws(() => applyScopeFile(engine, change), /文件已变化/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(target, 'utf8'), 'latest');
  assert.ok(
    engine.recovery.list().some(r => r.retainedOriginal && fs.readFileSync(r.retainedOriginal, 'utf8') === 'latest'),
  );
});
test('rollback preserves a save made after import, including the rollback check window', t => {
  const { engine, target, change } = fixture(t);
  const rollback = applyScopeFile(engine, change);
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (from === target) fs.writeFileSync(target, 'new save');
    return rename(from, to);
  };
  try {
    rollback();
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(target, 'utf8'), 'new save');
});
test('rollback restores the old file when no independent save occurred', t => {
  const { engine, target, change } = fixture(t);
  applyScopeFile(engine, change)();
  assert.equal(fs.readFileSync(target, 'utf8'), 'old');
});
