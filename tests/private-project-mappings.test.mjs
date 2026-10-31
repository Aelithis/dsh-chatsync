import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bindProjectMappings } from '../lib/project-mappings.js';

test('local choices register shared roots, refresh memberships and release old mappings', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatsync-mapping-'));
  try {
    const calls = [];
    let refreshes = 0;
    let directory = root;
    const engine = {
      loadConfig: () => ({}),
      workspaces: () => [{ id: 'project-a', path: 'D:\\共享项目\\示例' }],
      workspaceRealPathOf: () => directory,
    };
    const ctx = {
      workingDirectory: {
        registerProjectMapping(mapping) {
          calls.push(mapping);
          return async () => calls.push('disposed');
        },
      },
      workspaceRegistry: {
        async refreshSessionPaths() {
          refreshes++;
        },
      },
    };
    const binding = bindProjectMappings(ctx, engine);
    await binding.refresh();
    await binding.refresh();
    assert.deepEqual(calls, [{ roots: ['D:\\共享项目\\示例'], directory: fs.realpathSync(root) }]);
    assert.equal(refreshes, 2);
    directory = null;
    await binding.refresh();
    assert.equal(calls.at(-1), 'disposed');
    await binding.dispose();
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});

test('an old host cannot claim mapped project continuation', async () => {
  const binding = bindProjectMappings(
    {},
    {
      loadConfig: () => ({}),
      workspaces: () => [{ id: 'project-a', path: 'D:\\project' }],
      workspaceRealPathOf: () => os.tmpdir(),
    },
  );
  await assert.rejects(binding.refresh(), /不支持跨目录接续/);
});
