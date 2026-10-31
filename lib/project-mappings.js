import fs from 'node:fs';

/** Register device-local project choices without rewriting shared Session headers. */
export function bindProjectMappings(ctx, engine) {
  const registrations = new Map();
  const service = name => (typeof ctx.get === 'function' ? ctx.get(name) : ctx[name]);
  async function refresh() {
    const cfg = engine.loadConfig();
    const desired = new Map();
    for (const workspace of engine.workspaces()) {
      const directory = engine.workspaceRealPathOf(workspace, cfg);
      if (directory && fs.existsSync(directory))
        desired.set(workspace.id, { roots: [workspace.path], directory: fs.realpathSync(directory) });
    }
    const owner = service('workingDirectory');
    if (desired.size && typeof owner?.registerProjectMapping !== 'function')
      throw new Error('当前宿主不支持跨目录接续，请使用支持项目映射的 DSH Private。');
    let changed = false;
    for (const [id, current] of registrations) {
      if (JSON.stringify(desired.get(id)) === current.signature) continue;
      await current.dispose();
      registrations.delete(id);
      changed = true;
    }
    for (const [id, mapping] of desired) {
      if (registrations.has(id)) continue;
      const dispose = owner.registerProjectMapping(mapping);
      registrations.set(id, { signature: JSON.stringify(mapping), dispose });
      changed = true;
    }
    // Imported Session headers also need indexing when mappings did not change.
    const registry = service('workspaceRegistry');
    if (registry?.refreshSessionPaths) await registry.refreshSessionPaths();
    return changed;
  }
  async function dispose() {
    for (const current of registrations.values()) await current.dispose();
    registrations.clear();
  }
  return { refresh, dispose };
}
