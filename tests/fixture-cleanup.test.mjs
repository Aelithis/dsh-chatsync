import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { removeFixture } from './helpers/fixture-cleanup.mjs';

test('fixture teardown removes readonly Git objects, preserves junction targets and refuses other roots', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatsync-cleanup-test-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'chatsync-cleanup-outside-'));
  t.after(() => {
    removeFixture(root);
    removeFixture(outside);
  });
  const git = args => execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'ignore' });
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'fixture']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(root, 'note.txt'), 'synthetic readonly Git fixture');
  git(['add', '.']);
  git(['commit', '-m', 'fixture']);
  fs.writeFileSync(path.join(outside, 'original.txt'), 'outside stays unchanged');
  fs.symlinkSync(outside, path.join(root, 'chatsync-linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => removeFixture(os.tmpdir()), /non-fixture/);
  assert.throws(() => removeFixture(process.cwd()), /non-fixture/);
  assert.throws(() => removeFixture(path.join(root, 'chatsync-linked')), /root link/);
  removeFixture(root);
  assert.equal(fs.existsSync(root), false);
  assert.equal(fs.readFileSync(path.join(outside, 'original.txt'), 'utf8'), 'outside stays unchanged');
});

test('fixture teardown accepts an enumerated Git maintenance lock disappearing before lstat', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatsync-cleanup-race-'));
  t.after(() => removeFixture(root));
  const objects = path.join(fs.realpathSync(root), '.git', 'objects');
  const lock = path.join(objects, 'maintenance.lock');
  fs.mkdirSync(objects, { recursive: true });
  fs.writeFileSync(lock, 'synthetic maintenance lock');
  const cleanupFs = process.versions.electron ? createRequire(import.meta.url)('original-fs') : fs;
  const readdir = cleanupFs.readdirSync;
  let removedAfterEnumeration = false;
  t.mock.method(cleanupFs, 'readdirSync', (directory, options) => {
    const entries = readdir(directory, options);
    if (directory === objects && !removedAfterEnumeration) {
      assert.equal(
        entries.some(entry => entry.name === 'maintenance.lock'),
        true,
      );
      fs.unlinkSync(lock);
      removedAfterEnumeration = true;
    }
    return entries;
  });
  assert.doesNotThrow(() => {
    removeFixture(root);
  });
  assert.equal(removedAfterEnumeration, true);
  assert.equal(fs.existsSync(root), false);
});
