/* ---------- 侧栏入口与页面 ---------- */
let sidebarBinding = null,
  preferenceLoad = null;
let pluginPreferences = { config: null, saving: false, error: '' };
const preferenceListeners = new Set();
function publishPreferences(patch) {
  pluginPreferences = { ...pluginPreferences, ...patch };
  for (const listener of preferenceListeners) listener(pluginPreferences);
}
function acceptPreferences(data) {
  if (!data?.ok || !data.config) throw new Error(data?.error || '无法读取插件设置');
  sidebarBinding?.(data.config.showSidebarSync !== false);
  publishPreferences({ config: data.config });
}
function loadPluginPreferences() {
  if (preferenceLoad) return preferenceLoad;
  publishPreferences({ error: '' });
  preferenceLoad = API.config()
    .then(acceptPreferences)
    .catch(error => {
      if (!pluginPreferences.config) sidebarBinding?.(true);
      publishPreferences({ error: error.message || '无法读取插件设置' });
    })
    .finally(() => {
      preferenceLoad = null;
    });
  return preferenceLoad;
}
function usePluginPreferences() {
  const [state, setState] = useState(pluginPreferences);
  useEffect(() => {
    preferenceListeners.add(setState);
    setState(pluginPreferences);
    if (!pluginPreferences.config) loadPluginPreferences();
    return () => preferenceListeners.delete(setState);
  }, []);
  return state;
}
function pluginPreferenceEnabled(config, key) {
  if (key === 'automatic') return config.automatic ?? config.enabled !== false;
  return config[key] !== false;
}
async function togglePluginPreference(key) {
  if (!pluginPreferences.config || pluginPreferences.saving) return;
  const next = !pluginPreferenceEnabled(pluginPreferences.config, key);
  publishPreferences({ saving: true, error: '' });
  try {
    const data = await API.saveConfig({ [key]: next });
    acceptPreferences(data);
    if (pluginPreferenceEnabled(data.config, key) !== next) publishPreferences({ error: '宿主配置固定了此选项。' });
  } catch (error) {
    try {
      acceptPreferences(await API.config());
      publishPreferences({ error: error.message || '保存失败，请重试' });
    } catch {
      publishPreferences({ config: null, error: '保存状态未知，请重新读取。' });
    }
  } finally {
    publishPreferences({ saving: false });
  }
}
function SidebarVisibilityProvider() {
  usePluginPreferences();
  return null;
}
function PluginPreferences({ view } = {}) {
  const { config, saving, error } = usePluginPreferences();
  if (view === 'summary') return null;
  return e(
    'div',
    { className: 'dss-plugin-prefs' },
    ...[
      ['showSidebarSync', '侧边栏显示同步', '关闭后仍可从「设置 → 同步」打开。'],
      ['automatic', '自动同步', '按同步设置中的选项，在启动或退出 DSH 时自动同步。关闭后仍可手动同步。'],
    ].map(([key, label, description]) => {
      const checked = Boolean(config && pluginPreferenceEnabled(config, key));
      const descriptionId = 'dss-plugin-preference-' + key;
      return e(
        'div',
        { className: 'dss-rowline', key },
        e('div', { className: 'dss-rowtext' }, e('span', null, label), e('small', { id: descriptionId }, description)),
        e(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-label': label,
            'aria-describedby': descriptionId,
            'aria-checked': checked,
            disabled: !config || saving,
            className: 'dss-switch' + (checked ? ' dss-switch-on' : ''),
            onClick: () => togglePluginPreference(key),
          },
          e('span', { className: 'dss-switch-knob' }),
        ),
      );
    }),
    error ? e('p', { role: 'alert', className: 'dss-err' }, error) : null,
    !config && error ? pill('重新读取', loadPluginPreferences) : null,
  );
}

function useSidebarPreference() {
  const state = usePluginPreferences();
  return {
    value: state.config ? state.config.showSidebarSync !== false : null,
    loading: !state.config,
    saving: state.saving,
    error: state.error,
  };
}
function loadSidebarPreference() {
  return loadPluginPreferences();
}
function toggleSidebarPreference() {
  return togglePluginPreference('showSidebarSync');
}
function SidebarVisibilityToggle() {
  const state = useSidebarPreference();
  return e(
    'div',
    { className: 'dss-sidebar-pref' },
    e('span', null, '侧边栏显示同步'),
    e(
      'button',
      {
        type: 'button',
        role: 'switch',
        'aria-label': '在侧边栏显示同步',
        'aria-checked': state.value === true,
        'aria-busy': state.loading || state.saving,
        disabled: state.value === null || state.saving,
        className: 'dss-switch' + (state.value === true ? ' dss-switch-on' : ''),
        onClick: toggleSidebarPreference,
      },
      e('span', { className: 'dss-switch-knob' }),
    ),
    state.error ? e('span', { role: 'alert', className: 'dss-err' }, state.error) : null,
    state.value === null && state.error
      ? e(
          'button',
          { type: 'button', className: 'dss-pill', disabled: state.loading, onClick: loadSidebarPreference },
          '重新读取',
        )
      : null,
  );
}

function SidebarSyncIcon(props = {}) {
  const { busy, progress, status } = useSync();
  const title = busy ? progress?.label || '同步中…' : status?.lastOk === false ? '同步需要处理，点击查看' : '打开同步';
  return e(
    'span',
    { className: 'dss-nav-progress', title, 'aria-label': title },
    e(SyncIcon, { spin: busy, size: props.size || 16 }),
  );
}
function SyncPanel() {
  return e('div', { className: 'dss-panel' }, e(Section));
}
let repairNavigation = null,
  repairRequest = { mode: 'all', sequence: 0 };
const repairListeners = new Set();
function openRepairPage(request = {}) {
  if (!repairNavigation) throw new Error('处理页面尚未就绪，请稍后重试');
  repairRequest = { ...request, sequence: repairRequest.sequence + 1 };
  repairNavigation.selectPanel('dsh-sync-repair');
  for (const listener of repairListeners) listener(repairRequest);
}
function RepairPage() {
  const [request, setRequest] = useState(repairRequest);
  const { busy, refresh } = useSync();
  useEffect(() => {
    repairListeners.add(setRequest);
    return () => repairListeners.delete(setRequest);
  }, []);
  const grouping = request.mode === 'grouping';
  return e(
    'main',
    {
      id: 'dss-repair-page',
      className: 'dss-panel',
      'aria-label': grouping ? '处理未分组会话' : '修复会话问题（实验性）',
    },
    e(
      'div',
      { className: 'dss-wrap' },
      e('style', null, STYLE),
      e(
        'header',
        { className: 'dss-repair-heading' },
        e('h1', null, grouping ? '处理未分组会话' : '修复会话问题（实验性）'),
        e(
          'button',
          { type: 'button', className: 'dss-pill', onClick: () => repairNavigation.selectPanel('dsh-sync') },
          '返回同步',
        ),
      ),
      e(DataHealth, {
        key: request.sequence,
        expanded: true,
        grouping,
        initialIssueKey: request.initialIssueKey,
        busy,
        onVerified: refresh,
      }),
    ),
  );
}

function recoveryFileInfo(record) {
  const file = record.path.replace(/\\/g, '/');
  if (typeof record.sessionTitle === 'string')
    return {
      name:
        '会话「' +
        (record.sessionTitle || '未命名') +
        '」' +
        (/^storages\/session_projcache\//.test(file) ? '的列表信息' : ''),
      location: '',
    };
  const project = record.kind === 'ws' || record.kind === 'restore-backup';
  const title =
    record.guide?.title ||
    (/^storages\/sync-meta\/.+\.vmap\.json$/.test(file) ? '同步内部账本' : project ? '项目文件' : '用途待确认');
  return {
    name: file.split('/').pop() + '（' + title + '）',
    location: '文件地址：' + (project ? file : '.dsh/' + file),
  };
}
