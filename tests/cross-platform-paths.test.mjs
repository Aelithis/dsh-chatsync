import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SyncEngine, isDesktopHostProcess } from '../lib/sync.js';
import { normPath } from '../lib/engine/registry.js';

test('foreign roots and absent projects wait for a local selection without guessing', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'chatsync-paths-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const engine = new SyncEngine(home, { autoRepo: false });
  const foreign = process.platform === 'win32' ? '/Volumes/example/project' : 'D:\\Users\\example\\project';
  assert.equal(engine.workspacePathOf(foreign, {}), null);
  assert.equal(engine.workspacePathOf(path.join(home, 'missing'), {}), null);
  assert.equal(engine.workspacePathOf(home, {}), home);
  assert.equal(
    engine.workspacePathOf('D:\\Users\\example\\project', { workspaceBase: home }),
    path.join(home, 'project'),
  );
  const result = await engine.syncWorkspace({ id: 'example', path: foreign }, {});
  assert.match(result.error, /选择本机目录/);
  engine.setLocalWorkspacePath('example', path.join(home, 'chosen'));
  assert.equal(engine.workspaceRealPathOf({ id: 'example', path: foreign }, {}), path.join(home, 'chosen'));
  assert.throws(() => engine.setLocalWorkspacePath('example', 'relative'), /完整目录/);
});

test('path equality follows source filesystem syntax', () => {
  assert.equal(normPath('C:/Project'), normPath('c:\\project'));
  assert.notEqual(normPath('/work/Project'), normPath('/work/project'));
  assert.notEqual(normPath('/work/project'), normPath('C:\\work\\project'));
});

test('Mac desktop supports exit worker detection but automatic restart stays unavailable', () => {
  const argv = [
    'DSH Private',
    '/app/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js',
    '/tmp/private/profiles/desktop',
  ];
  assert.equal(isDesktopHostProcess(argv, 'darwin'), true);
  if (process.platform !== 'win32') assert.equal(new SyncEngine('/unused').desktopRestartAvailable(), false);
});
