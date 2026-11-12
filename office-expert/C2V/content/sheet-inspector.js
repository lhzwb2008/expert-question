(() => {
  'use strict';

  const EXTENSION_NAME = globalThis.chrome?.runtime?.getManifest?.().name || 'C2V';

  const INSPECTOR_KEY = '__gtMapperSheetInspectorV1';
  const ROOT_ID = 'gtm-sheet-inspector-root';
  const STORAGE_KEY = 'gtMapperInspectorPreferencesV1';
  const SELECTION_EVENT = '__gt_mapper_selection_changed_v8';
  const ROW_QUESTION_HEADER = '__gtm_auto_row_question__';
  const CANVAS_GAP = 12;
  const CANVAS_PADDING = 12;
  const CANVAS_GRID = 12;
  const CANVAS_SNAP_DISTANCE = 8;
  const CARD_MIN_WIDTH = 260;
  const CARD_MIN_HEIGHT = 120;
  const CARD_DEFAULT_WIDTH = 420;
  const CARD_WIDE_WIDTH = 700;
  const FIELD_CARD_SIZE_PRESETS = Object.freeze({
    compact: Object.freeze({ label: '紧凑', width: 420, height: 240 }),
    standard: Object.freeze({ label: '标准', width: 640, height: 380 }),
    large: Object.freeze({ label: '大号', width: 900, height: 560 })
  });
  const TEXT_MARK_COLORS = Object.freeze([
    { id: 'red', label: '红色', value: '#d43b45' },
    { id: 'orange', label: '橙色', value: '#c96712' },
    { id: 'green', label: '绿色', value: '#18815d' },
    { id: 'blue', label: '蓝色', value: '#1769c2' },
    { id: 'purple', label: '紫色', value: '#7a45b8' }
  ]);
  const MEDIA_TYPES = new Set([
    'video',
    'image',
    'audio',
    'file',
    'attachments',
    'media-link'
  ]);
  const VIDEO_MIME_BY_EXTENSION = Object.freeze({
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    qt: 'video/quicktime',
    webm: 'video/webm',
    ogv: 'video/ogg',
    ogg: 'video/ogg',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    flv: 'video/x-flv',
    wmv: 'video/x-ms-wmv',
    asf: 'video/x-ms-asf',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2',
    ts: 'video/mp2t',
    mts: 'video/mp2t',
    m2ts: 'video/mp2t',
    vob: 'video/mpeg',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    mpe: 'video/mpeg',
    m1v: 'video/mpeg',
    m2v: 'video/mpeg',
    f4v: 'video/mp4',
    rm: 'application/vnd.rn-realmedia',
    rmvb: 'application/vnd.rn-realmedia-vbr',
    divx: 'video/divx',
    mxf: 'application/mxf',
    mod: 'video/mpeg',
    tod: 'video/mpeg',
    dat: 'video/mpeg',
    amv: 'video/x-amv',
    m3u8: 'application/vnd.apple.mpegurl',
    mpd: 'application/dash+xml'
  });

  if (globalThis[INSPECTOR_KEY]) return;

  function storageArea() {
    return globalThis.__cyleLegacyStorageAdapterV1
      || globalThis.chrome?.storage?.local;
  }

  const state = {
    open: false,
    minimized: false,
    loading: false,
    live: true,
    row: null,
    error: '',
    query: '',
    view: 'inspector',
    visibleColumns: null,
    layout: null,
    visibilityByTable: {},
    tableViews: {},
    cardLayoutByTable: {},
    columnsPaneHiddenByTable: {},
    textMarksByCell: {},
    workspaceRecipeByTable: {},
    workspaceProfiles: [],
    workspaceComposer: null,
    annotationOpenCards: new Set(),
    textSelection: null,
    cellEditors: new Map(),
    openDropdownKey: '',
    dropdownSavingKeys: new Set(),
    toolInstances: new Map(),
    rowRevision: 0,
    draggedColumnIndex: -1,
    layoutHistoryTableKey: '',
    layoutUndoStack: [],
    layoutRedoStack: [],
    refreshTimer: 0,
    refreshPending: false,
    requestToken: 0,
    root: null,
    panel: null,
    petMascot: null,
    body: null,
    title: null,
    subtitle: null,
    status: null,
    search: null,
    columnList: null,
    cards: null,
    liveButton: null,
    minimizeButton: null,
    fullscreenButton: null,
    fullscreen: false,
    fullscreenRestoreLayout: null,
    columnsPane: null,
    columnsToggleButton: null,
    layoutUndoButton: null,
    layoutRedoButton: null,
    canvasSizer: null,
    canvas: null,
    canvasZoomSelect: null,
    canvasSnapButton: null,
    workspaceManageButton: null,
    harnessStatusButton: null,
    columnCountLabel: null,
    modeTabs: null,
    taskPanel: null,
    taskSheetLabel: null,
    taskRowLabel: null,
    taskQuestionLabel: null,
    taskWorkspaceLabel: null,
    taskBlocksLabel: null,
    taskProgressBar: null,
    taskProgressLabel: null,
    taskStorageLabel: null,
    taskPanelToggleButton: null,
    commandPalette: null,
    commandPaletteInput: null,
    commandPaletteList: null,
    panelResizeObserver: null,
    harnessUnsubscribe: null,
    canvasResizeObserver: null,
    canvasZCounter: 1,
    refreshButton: null,
    questionHeaderSelect: null,
    questionValueInput: null,
    questionPreviousButton: null,
    questionNextButton: null,
    questionPositionLabel: null,
    questionSearching: false,
    questionInputDirty: false,
    questionNavigationItems: [],
    questionNavigationKey: '',
    questionNavigationToken: 0,
    questionHeaderByTable: {}
  };

  function element(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = text;
    return node;
  }

  function iconNode(name, {
    size = 16,
    strokeWidth = 1.9,
    className = '',
    label = ''
  } = {}) {
    const api = globalThis.__gtmLucideIconsV1;
    if (api?.create) {
      return api.create(name, { size, strokeWidth, className, label });
    }
    const fallback = element('span', `gtm-icon-fallback ${className}`.trim());
    fallback.dataset.icon = name;
    fallback.setAttribute('aria-hidden', label ? 'false' : 'true');
    if (label) fallback.setAttribute('aria-label', label);
    return fallback;
  }

  function setButtonVisual(button, iconName, text = '') {
    if (!button) return button;
    button.replaceChildren(iconNode(iconName, {
      size: button.classList.contains('gtm-inspector-icon-button') ? 17 : 15
    }));
    if (text) {
      button.append(element('span', 'gtm-button-label', text));
    }
    return button;
  }

  function makeCommandButton(label, iconName, action, className = '') {
    const button = element(
      'button',
      `gtm-inspector-command-button ${className}`.trim()
    );
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    setButtonVisual(button, iconName, label);
    button.addEventListener('click', action);
    return button;
  }

  function makeLabeledValue(label, className = '') {
    const row = element(
      'div',
      `gtm-inspector-task-meta-row ${className}`.trim()
    );
    const term = element('span', 'gtm-inspector-task-meta-label', label);
    const value = element('strong', 'gtm-inspector-task-meta-value', '—');
    row.append(term, value);
    return { row, value };
  }

  function buildTaskPanel() {
    const panel = element('aside', 'gtm-inspector-task-panel');
    const header = element('div', 'gtm-inspector-task-panel-header');
    const heading = element('div', 'gtm-inspector-task-panel-heading');
    heading.append(
      iconNode('ListChecks', { size: 17 }),
      element('strong', '', '任务信息')
    );
    const closeButton = makeIconButton(
      '收起任务信息',
      'PanelLeftClose',
      () => toggleTaskPanel(true)
    );
    closeButton.classList.add('is-on-light');
    header.append(heading, closeButton);

    const identity = element('section', 'gtm-inspector-task-section');
    identity.append(element('h3', '', '当前上下文'));
    const sheet = makeLabeledValue('表格');
    const row = makeLabeledValue('行');
    const question = makeLabeledValue('题号');
    const workspace = makeLabeledValue('工作区');
    identity.append(sheet.row, row.row, question.row, workspace.row);

    const progress = element(
      'section',
      'gtm-inspector-task-section gtm-inspector-task-progress'
    );
    const progressHeading = element('div', 'gtm-inspector-task-progress-heading');
    const progressTitle = element('h3', '', '处理进度');
    const progressLabel = element('strong', '', '0 / 0');
    progressHeading.append(progressTitle, progressLabel);
    const progressTrack = element('div', 'gtm-inspector-progress-track');
    const progressBar = element('span', 'gtm-inspector-progress-value');
    progressTrack.append(progressBar);
    progress.append(progressHeading, progressTrack);

    const modules = element('section', 'gtm-inspector-task-section');
    modules.append(element('h3', '', '积木状态'));
    const blocks = element('div', 'gtm-inspector-task-blocks', '尚未装配');
    modules.append(blocks);

    const storageSection = element('section', 'gtm-inspector-task-section');
    const storageHeading = element('div', 'gtm-inspector-task-progress-heading');
    storageHeading.append(element('h3', '', '本地草稿'));
    const cleanupButton = element(
      'button',
      'gtm-inspector-task-storage-action',
      '清理过期'
    );
    cleanupButton.type = 'button';
    const storageLabel = element(
      'div',
      'gtm-inspector-task-storage',
      '正在统计…'
    );
    cleanupButton.addEventListener('click', async () => {
      const drafts = globalThis.__cyleDraftServiceV1;
      if (!drafts?.cleanupExpired) return;
      const result = await drafts.cleanupExpired({ namespace: null });
      renderStatus(`已清理 ${result.deleted || result.removed || 0} 条过期草稿`, 'success');
      updateStorageStatus();
    });
    storageHeading.append(cleanupButton);
    const draftCenterButton = element('button', 'gtm-inspector-task-storage-action', '打开草稿中心');
    draftCenterButton.type = 'button';draftCenterButton.addEventListener('click', openDraftCenter);
    storageSection.append(storageHeading, storageLabel, draftCenterButton);

    const shortcuts = element('section', 'gtm-inspector-task-section');
    shortcuts.append(
      element('h3', '', '快捷操作'),
      element('div', 'gtm-inspector-shortcut-row', 'Alt + Shift + G'),
      element('div', 'gtm-inspector-shortcut-row', 'Ctrl / ⌘ + K')
    );

    panel.append(header, identity, progress, modules, storageSection, shortcuts);
    return {
      panel,
      sheet: sheet.value,
      row: row.value,
      question: question.value,
      workspace: workspace.value,
      blocks,
      storageLabel,
      progressBar,
      progressLabel
    };
  }

  async function updateStorageStatus() {
    if (!state.taskStorageLabel) return;
    const drafts = globalThis.__cyleDraftServiceV1;
    if (!drafts?.listDrafts || !drafts?.getCapacityStats) {
      state.taskStorageLabel.textContent = '存储服务不可用';
      return;
    }
    try {
      const records = await drafts.listUnifiedDrafts();
      const pending = records.filter(d => d.status === '待写回' || d.status === '旧草稿待核对');
      const conflicts = records.filter(d => d.status === '冲突副本');
      const kilobytes = new Blob([JSON.stringify(records.map(d => d.value))]).size / 1024;
      state.taskStorageLabel.textContent = [
        `${pending.length} 条待写回 / 待核对`,
        conflicts.length ? `${conflicts.length} 条冲突副本` : '',
        `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`,
        records.some(d => d.expired) ? '含过期草稿' : ''
      ].filter(Boolean).join(' · ');
    } catch (error) {
      state.taskStorageLabel.textContent = `统计失败：${error.message}`;
    }
  }

  const DRAFT_RETURN_KEY = 'cyle-draft-center-return';
  function sameDraftDocument(target) {
    const current = state.row?.tableKey || state.row?.sheetId || '';
    return Boolean(target?.tableKey && (target.tableKey === current ||
      (target.tableKey.startsWith('/') && target.tableKey.split('::')[0] === current.split('::')[0])));
  }

  function draftDocumentUrl(target) {
    try {
      const path = target.tableKey?.split('::')[0];
      const url = new URL(target.url || path, location.href);
      if (url.protocol !== 'https:' || !/(^|\.)(larkoffice\.com|feishu\.cn|larksuite\.com)$/.test(url.hostname) || !/^\/(sheets|wiki)\//.test(url.pathname)) return '';
      if (target.sheetId) url.searchParams.set('sheet', target.sheetId);
      return url.href;
    } catch { return ''; }
  }

  async function flushWorkbenchDrafts() {
    for (const record of state.toolInstances.values()) await record.instance?.flushDrafts?.();
  }

  async function returnToDraft(entry) {
    const target = { ...entry.target, kind: entry.kind };
    if (!Number.isInteger(target.rowIndex) || target.rowIndex < 0 || !Number.isInteger(target.columnIndex) || target.columnIndex < 0) throw new Error('旧草稿缺少定位信息，请先导出核对');
    if (state.loading || state.navigatingDraft) throw new Error('表格正在读取，请稍后重试');
    await flushWorkbenchDrafts();
    if (!sameDraftDocument(target)) {
      const url = draftDocumentUrl(target);
      if (!url) throw new Error('旧草稿未保存可用链接，请先打开对应表格，再从草稿中心定位');
      await storageArea().set({ [DRAFT_RETURN_KEY]: { target, kind: entry.kind, savedAt: Date.now() } });
      const link = element('a');link.href = url;link.target = '_blank';link.rel = 'noopener noreferrer';link.click();
      state.draftCenter?.message.replaceChildren(document.createTextNode(`已打开目标表格；在新页面打开 ${EXTENSION_NAME} 后会定位到此草稿。`));
      return;
    }
    state.navigatingDraft = true;
    try {
      const selected = await chrome.runtime.sendMessage({ type: 'SELECT_ROW', payload: { sheetId: target.sheetId || state.row.sheetId, sheetIndex: target.sheetIndex ?? state.row.sheetIndex, row: target.rowIndex } });
      if (!selected?.ok) throw new Error(selected?.error || '无法定位草稿所在行');
      await refreshRow();
      if (state.row?.rowIndex !== target.rowIndex || !sameDraftDocument(target) || (target.sheetId && target.sheetId !== state.row.sheetId)) throw new Error('表格未切换到目标行，未恢复草稿，请重试');
      if (!['caption-review', 'human-eval'].includes(target.workspace)) throw new Error('此草稿对应的旧工具已移除，草稿仍可在草稿中心查看和导出。');
      const workspace = target.workspace;
      await applyWorkspaceRecipe(workspace);
      const blockId = workspace;
      const record = state.toolInstances.get(blockId);
      if (!record) throw new Error('对应编辑器尚未装配');
      await record.loadPromise;
      if(workspace==='human-eval'){state.publicCategory='answer';updatePublicCategory();}
      await record.instance.openDraftContext(target);
      state.draftCenter?.dialog.close();
      renderStatus(`已返回第 ${target.rowIndex + 1} 行 · ${target.header || '草稿编辑列'}；源数据变化时仍会进行冲突检查`, 'success');
    } finally { state.navigatingDraft = false; }
  }

  async function restoreDraftReturn() {
    if (state.navigatingDraft || !state.row) return;
    const pending = (await storageArea().get(DRAFT_RETURN_KEY))[DRAFT_RETURN_KEY];
    if (!pending || Date.now() - pending.savedAt > 86400000 || !sameDraftDocument(pending.target)) return;
    // Consume the navigation intent once; failures remain recoverable from the center.
    await storageArea().remove(DRAFT_RETURN_KEY);
    try { await returnToDraft(pending); } catch (error) { renderStatus(error.message, 'error'); }
  }

  function exportDraftEntries(entries) {
    const bundle = { format: 'cyle-draft-backup', version: 1, exportedAt: new Date().toISOString(), drafts: entries.map(d => ({ namespace: d.namespace, id: d.storageId, target: d.target, status: d.status, value: d.value })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = element('a');link.href = url;link.download = `${EXTENSION_NAME}-草稿备份-${new Date().toISOString().slice(0,10)}.json`;link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function renderDraftCenter() {
    const center = state.draftCenter;if (!center) return;
    const openIds = new Set([...center.list.querySelectorAll('details[open]')].map(n => n.dataset.draftId));
    const query = center.search.value.trim().toLowerCase();
    center.filtered = center.entries.filter(entry => {
      if (center.scope.value === 'current' && entry.target.tableKey !== currentTableKey()) return false;
      if (center.kind.value && entry.kind !== center.kind.value) return false;
      if (center.status.value && entry.status !== center.status.value) return false;
      return !query || [entry.target.workbookName, entry.target.sheetName, entry.target.tableKey, entry.target.header, entry.target.rowIndex + 1, entry.kind, entry.status].join(' ').toLowerCase().includes(query);
    });
    center.list.replaceChildren();center.count.textContent = `${center.filtered.length} 条 / 共 ${center.entries.length} 条`;
    center.exportButton.disabled = !center.filtered.length;
    for (const entry of center.filtered) {
      const target = entry.target, card = element('article', 'gtm-draft-entry');
      const heading = element('div', 'gtm-draft-entry-heading');
      heading.append(element('strong', '', `${entry.kind} · ${Number.isInteger(target.rowIndex) ? `第 ${target.rowIndex + 1} 行` : '行号未知'}`), element('span', 'gtm-draft-badge', entry.status));
      card.append(heading, element('div', 'gtm-draft-context', [target.workbookName, target.sheetName || target.tableKey || '旧草稿', target.header || (target.columnIndex >= 0 ? `第 ${target.columnIndex + 1} 列` : '')].filter(Boolean).join(' / ')));
      const when = new Date(entry.updatedAt);card.append(element('div', 'gtm-draft-context', `保存时间：${Number.isNaN(when.getTime()) ? '未知' : when.toLocaleString()}`));
      const actions = element('div', 'gtm-draft-actions');
      const navigate = element('button', '', sameDraftDocument(target) ? '返回对应行' : '打开表格并定位');navigate.type = 'button';
      navigate.disabled = entry.expired || !Number.isInteger(target.rowIndex);
      navigate.addEventListener('click', async () => { navigate.disabled = true;try { await returnToDraft(entry); } catch (error) { center.message.textContent = error.message; } finally { navigate.disabled = entry.expired; } });
      const download = element('button', '', '导出这条');download.type = 'button';download.addEventListener('click', () => exportDraftEntries([entry]));actions.append(navigate, download);card.append(actions);
      const preview = element('details', 'gtm-draft-preview');preview.dataset.draftId = entry.id;preview.open = openIds.has(entry.id);
      preview.append(element('summary', '', '预览原值与草稿'));
      for (const change of entry.changes) {
        const section = element('section');section.append(element('strong', '', change.header || `第 ${Number(change.columnIndex) + 1} 列`));
        const diff = element('div', 'gtm-draft-diff');
        for (const [label, text] of [['保存时原值', change.before], [change.representation, change.after]]) { const side = element('div');side.append(element('span', '', label), element('pre', '', text || '（空）'));diff.append(side); }
        section.append(diff);preview.append(section);
      }
      if (Object.keys(entry.value.pendingReasons || {}).length) preview.append(element('strong', '', '尚未判定的理由'), element('pre', '', JSON.stringify(entry.value.pendingReasons, null, 2)));
      if (!entry.changes.length && !Object.keys(entry.value.pendingReasons || {}).length) preview.append(element('p', '', '此快照没有待写回内容。'));
      card.append(preview);center.list.append(card);
    }
    if (!center.filtered.length) center.list.append(element('p', '', '没有匹配的草稿。'));
  }

  async function reloadDraftCenter() {
    const center = state.draftCenter;if (!center) return;
    try { center.entries = await globalThis.__cyleDraftServiceV1.listUnifiedDrafts();renderDraftCenter();center.message.textContent = '草稿保存在当前浏览器；导出文件可在下载记录中找到。返回编辑器后检查源数据冲突，预览不代表已写回。';updateStorageStatus(); }
    catch (error) { center.message.textContent = `读取草稿失败：${error.message}`; }
  }

  async function openDraftCenter() {
    if (!state.draftCenter) {
      const dialog = element('dialog', 'gtm-draft-center');dialog.setAttribute('aria-label', '草稿中心');
      const title = element('header');title.append(element('h2', '', '草稿中心'));
      const close = element('button', '', '关闭');close.type = 'button';close.addEventListener('click', () => dialog.close());title.append(close);
      const controls = element('div', 'gtm-draft-filters'), search = element('input');search.type = 'search';search.placeholder = '搜索表格、列名或行号';search.setAttribute('aria-label', '搜索草稿');
      const select = (label, options) => { const node = element('select');node.setAttribute('aria-label', label);options.forEach(([value, text]) => node.add(new Option(text, value)));node.addEventListener('change', renderDraftCenter);return node; };
      const scope = select('草稿范围', [['all','全部表格'],['current','当前工作表']]);
      const kind = select('草稿类型', [['','全部类型'],['GT','GT'],['人评','人评'],['评审','评审'],['Chains','Chains'],['粗粒度','粗粒度']]);
      const status = select('草稿状态', [['','全部状态'],['待写回','待写回'],['本地草稿','本地草稿'],['冲突副本','冲突副本'],['旧草稿待核对','旧草稿待核对'],['未修改快照','未修改快照'],['已过期','已过期']]);
      search.addEventListener('input', renderDraftCenter);controls.append(search, scope, kind, status);
      const toolbar = element('div', 'gtm-draft-actions'), count = element('span'), refresh = element('button', '', '刷新草稿'), exportButton = element('button', '', '导出当前筛选');
      refresh.type = exportButton.type = 'button';refresh.addEventListener('click', reloadDraftCenter);exportButton.addEventListener('click', () => exportDraftEntries(state.draftCenter.filtered));toolbar.append(count, refresh, exportButton);
      const message = element('p', 'gtm-draft-message');message.setAttribute('role', 'status');const list = element('div', 'gtm-draft-list');
      dialog.append(title, controls, toolbar, message, list);state.draftCenter = { dialog, search, scope, kind, status, list, message, count, exportButton, entries: [], filtered: [] };
    }
    const center = state.draftCenter;(document.fullscreenElement || state.root).append(center.dialog);
    if (!center.dialog.open) center.dialog.showModal();center.message.textContent = '正在保存当前修改并读取草稿…';
    try { await flushWorkbenchDrafts();await reloadDraftCenter(); } catch (error) { center.message.textContent = error.message; }
    center.search.focus();
  }

  function toggleTaskPanel(forceHidden = null) {
    if (!state.taskPanel || !state.content) return;
    const hidden = forceHidden === null
      ? !state.taskPanel.hidden
      : Boolean(forceHidden);
    state.taskPanel.hidden = hidden;
    state.content.classList.toggle('is-task-panel-hidden', hidden);
    if (state.taskPanelToggleButton) {
      state.taskPanelToggleButton.classList.toggle('is-active', hidden);
      state.taskPanelToggleButton.title = hidden
        ? '显示任务信息'
        : '隐藏任务信息';
    }
    requestAnimationFrame(() => updateCanvasBounds());
  }

  function updateTaskPanel() {
    if (!state.taskPanel) return;
    const recipe = currentWorkspaceRecipe();
    const questionColumn = questionColumns(state.row)[0] || null;
    const questionValue = state.row
      ? questionCellValue(questionColumn, state.row)
      : '';
    if (state.taskSheetLabel) {
      state.taskSheetLabel.textContent = state.row?.sheetName
        || `Sheet ${state.row?.sheetNumber || '—'}`;
    }
    if (state.taskRowLabel) {
      state.taskRowLabel.textContent = state.row?.rowNumber
        ? `第 ${state.row.rowNumber} 行`
        : '—';
    }
    if (state.taskQuestionLabel) {
      state.taskQuestionLabel.textContent = questionValue || '未识别';
    }
    if (state.taskWorkspaceLabel) {
      state.taskWorkspaceLabel.textContent = recipe.label;
    }
    const diagnostics = globalThis.__annotationHarnessV1?.getDiagnostics?.();
    const blocks = diagnostics?.blocks || [];
    if (state.taskBlocksLabel) {
      state.taskBlocksLabel.replaceChildren();
      if (!blocks.length) {
        state.taskBlocksLabel.textContent = '当前没有注册积木';
      } else {
        blocks.forEach((block) => {
          const item = element(
            'div',
            `gtm-inspector-task-block is-${block.state}`
          );
          item.append(
            iconNode(
              block.state === 'ready' ? 'CheckCircle2' : 'Circle',
              { size: 14 }
            ),
            element('span', '', block.name),
            element(
              'small',
              '',
              block.state === 'ready'
                ? '已装配'
                : block.state === 'loading'
                  ? '装配中'
                  : block.state === 'error'
                    ? '异常'
                    : '按需'
            )
          );
          state.taskBlocksLabel.append(item);
        });
      }
    }
    const total = state.questionNavigationItems.length;
    const currentValue = safeText(state.questionValueInput?.value).trim();
    const index = state.questionNavigationItems.findIndex(({ value }) => (
      safeText(value).trim() === currentValue
    ));
    const current = total ? Math.max(1, index + 1) : 0;
    const percent = total ? Math.min(100, Math.max(0, current / total * 100)) : 0;
    if (state.taskProgressLabel) {
      state.taskProgressLabel.textContent = `${current} / ${total}`;
    }
    if (state.taskProgressBar) {
      state.taskProgressBar.style.width = `${percent}%`;
    }
    updateStorageStatus();
  }

  function commandDefinitions() {
    return [
      { id: 'draft.center', label: '打开草稿中心', hint: 'GT / 评审 / 冲突副本', icon: 'FileText', run: openDraftCenter },
      {
        id: 'workspace.viewer',
        label: '切换到表格查看',
        hint: '工作区',
        icon: 'Columns3',
        run: () => applyWorkspaceRecipe('viewer')
      },
      {
        id: 'layout.auto',
        label: '自动整理画布',
        hint: '布局',
        icon: 'LayoutGrid',
        run: autoArrangeCards
      },
      {
        id: 'layout.fit',
        label: '适应全部组件',
        hint: '布局',
        icon: 'Scan',
        run: fitCanvasToViewport
      },
      {
        id: 'layout.reset',
        label: '重置当前布局',
        hint: '布局',
        icon: 'RotateCcw',
        run: resetCardLayout
      },
      {
        id: 'columns.media',
        label: '只显示媒体字段',
        hint: '字段',
        icon: 'Video',
        run: () => {
          selectColumns('media');
          renderColumns();
          renderCards();
          renderSummaryStatus();
        }
      },
      {
        id: 'data.refresh',
        label: '重新读取当前行',
        hint: '数据',
        icon: 'RefreshCw',
        run: refreshRow
      }
    ];
  }

  function renderCommandPalette(query = '') {
    if (!state.commandPaletteList) return;
    const normalized = safeText(query).trim().toLowerCase();
    const commands = commandDefinitions().filter(({ id }) => !state.pageTools || !id.startsWith('layout.')).filter(({ label, hint, id }) => (
      !normalized
      || `${label} ${hint} ${id}`.toLowerCase().includes(normalized)
    ));
    state.commandPaletteList.replaceChildren();
    commands.forEach((command, index) => {
      const button = element(
        'button',
        `gtm-inspector-command-item${index === 0 ? ' is-selected' : ''}`
      );
      button.type = 'button';
      button.dataset.commandId = command.id;
      button.append(
        iconNode(command.icon, { size: 17 }),
        element('span', '', command.label),
        element('small', '', command.hint)
      );
      button.addEventListener('click', () => {
        closeCommandPalette();
        command.run();
      });
      state.commandPaletteList.append(button);
    });
    if (!commands.length) {
      state.commandPaletteList.append(
        element('div', 'gtm-inspector-command-empty', '没有匹配的命令')
      );
    }
  }

  function openCommandPalette() {
    if (!state.commandPalette) return;
    state.commandPalette.hidden = false;
    state.commandPaletteInput.value = '';
    renderCommandPalette();
    requestAnimationFrame(() => state.commandPaletteInput?.focus());
  }

  function closeCommandPalette() {
    if (state.commandPalette) state.commandPalette.hidden = true;
  }

  function buildCommandPalette() {
    const palette = element('div', 'gtm-inspector-command-palette');
    palette.hidden = true;
    const surface = element('section', 'gtm-inspector-command-surface');
    surface.setAttribute('role', 'dialog');
    surface.setAttribute('aria-label', '命令面板');
    const searchRow = element('div', 'gtm-inspector-command-search');
    const input = element('input');
    input.type = 'search';
    input.placeholder = '输入命令、工作区或字段操作…';
    input.setAttribute('aria-label', '搜索命令');
    searchRow.append(
      iconNode('Search', { size: 18 }),
      input,
      element('kbd', '', 'Esc')
    );
    const list = element('div', 'gtm-inspector-command-list');
    const footer = element(
      'footer',
      'gtm-inspector-command-footer',
      '点击执行 · Ctrl / ⌘ + K 打开'
    );
    input.addEventListener('input', () => renderCommandPalette(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCommandPalette();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        list.querySelector('.gtm-inspector-command-item')?.click();
      }
    });
    palette.addEventListener('pointerdown', (event) => {
      if (event.target === palette) closeCommandPalette();
    });
    surface.append(searchRow, list, footer);
    palette.append(surface);
    return { palette, input, list };
  }

  function safeText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function normalizedQuestionHeader(header) {
    return safeText(header)
      .trim()
      .toLowerCase()
      .replace(/[\s_.\-()（）:：/\\]+/g, '');
  }

  function questionCellValue(column, row = state.row) {
    if (!column) return '';
    if (column.syntheticRowQuestion) {
      const rowIndex = Number(row?.rowIndex);
      return Number.isInteger(rowIndex) && rowIndex >= 1
        ? String(rowIndex)
        : '';
    }
    const cell = row?.cells?.find(({ columnIndex }) => (
      Number(columnIndex) === Number(column.columnIndex)
    ));
    const candidate = [
      cell?.rawValue,
      cell?.value,
      cell?.displayValue
    ].find((value) => (
      value !== null
      && value !== undefined
      && typeof value !== 'object'
      && safeText(value).trim()
    ));
    return safeText(candidate).trim();
  }

  function looksLikeQuestionIdentifier(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    const source = safeText(value).trim();
    if (!source || source.length > 160 || /\r|\n/.test(source)) return false;
    if (/^\d+$/.test(source)) return true;
    if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(source)) {
      return true;
    }
    return (
      !/\s/.test(source)
      && /^[\p{L}\d][\p{L}\d._:/-]*\d[\p{L}\d._:/-]*$/u.test(source)
    );
  }

  function questionHeaderScore(header, column = {}, row = state.row) {
    const source = safeText(header).trim();
    if (!source) return -Infinity;
    const normalized = normalizedQuestionHeader(source);
    if (/^(?:题号|题目编号|题目序号|题目id|questionid|questionno|questionnumber)$/.test(normalized)) {
      return 160;
    }
    if (/^(?:任务编号|任务id|任务序号|taskid|taskno|tasknumber)$/.test(normalized)) {
      return 150;
    }
    if (/^(?:样本编号|样本id|sampleid|sampleno|samplenumber)$/.test(normalized)) {
      return 145;
    }
    if (/^(?:记录编号|记录id|数据编号|数据id|案例编号|案例id|recordid|itemid|episodeid|clipid|videoid|caseid|caseno|rowid)$/.test(normalized)) {
      return 140;
    }
    if (/^(?:子任务编号|子任务id|subtaskid|subtaskno|stepid|eventid)$/.test(normalized)) {
      return 135;
    }
    if (/^(?:编号|序号|id|uuid|guid|index|no|number)$/.test(normalized)) {
      return 120;
    }
    if (/(?:题号|题目编号|题目id|questionid|questionno)/.test(normalized)) {
      return 110;
    }
    if (/(?:任务编号|任务id|taskid|taskno|样本编号|样本id|sampleid)/.test(normalized)) {
      return 100;
    }
    if (/(?:recordid|episodeid|clipid|videoid|uuid|guid|编号|序号)$/.test(normalized)) {
      return 90;
    }
    if (
      safeText(state.questionHeaderByTable[currentTableKey()]).trim()
      === source
    ) {
      return 80;
    }
    const columnIndex = Number(column.columnIndex);
    const value = questionCellValue(column, row);
    const contentHeader = /prompt|instruction|描述|说明|任务内容|annotation|segment|chain|gt|答案|视频|素材|附件|备注|状态|日期|时间/i;
    if (
      Number.isInteger(columnIndex)
      && columnIndex >= 0
      && columnIndex < 6
      && !contentHeader.test(source)
      && looksLikeQuestionIdentifier(value)
    ) {
      return 30 - columnIndex;
    }
    return -Infinity;
  }

  function questionColumns(row = state.row) {
    const ranked = (row?.columns || [])
      .map((column) => ({
        ...column,
        score: questionHeaderScore(column.header, column, row)
      }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) => (
        right.score - left.score
        || left.columnIndex - right.columnIndex
      ));
    if (ranked.length) return ranked;
    return [{
      key: ROW_QUESTION_HEADER,
      columnIndex: -1,
      columnNumber: '',
      columnLetter: '',
      header: ROW_QUESTION_HEADER,
      label: '按行自动题号',
      score: 1,
      syntheticRowQuestion: true
    }];
  }

  function updateQuestionSearchControls({
    forceQuestionValue = false
  } = {}) {
    const select = state.questionHeaderSelect;
    if (!select) return;
    const previous = select.value;
    const columns = questionColumns();
    const saved = safeText(
      state.questionHeaderByTable[currentTableKey()]
    ).trim();
    select.replaceChildren();
    if (!columns.length) {
      select.add(new Option('未识别到题号', ''));
      select.disabled = true;
    } else {
      columns.forEach((column) => select.add(new Option(
        column.syntheticRowQuestion
          ? '按行自动题号'
          : `${column.columnLetter || column.columnNumber} · ${column.header}`,
        safeText(column.header)
      )));
      const preferred = [state.questionIdentityHeader, saved, previous].find((header) => (
        columns.some((column) => column.header === header)
      ));
      select.value = preferred || safeText(columns[0].header);
      state.questionHeaderByTable[currentTableKey()] = select.value;
      select.disabled = false;
    }
    if (state.questionValueInput) {
      state.questionValueInput.disabled = !columns.length || state.questionSearching;
    }
    state.questionValueDisplay?.setAttribute('aria-busy',String(state.questionSearching));
    syncCurrentQuestionValue({ force: forceQuestionValue });
    updateQuestionNavigationControls();
  }

  function selectedQuestionColumn() {
    const header = safeText(state.questionHeaderSelect?.value).trim();
    return questionColumns().find((column) => column.header === header) || null;
  }

  function currentQuestionValue() {
    return questionCellValue(selectedQuestionColumn());
  }

  function syncCurrentQuestionValue({ force = false } = {}) {
    const input = state.questionValueInput;
    if (!input) return '';
    const value = currentQuestionValue();
    if (force || !state.questionInputDirty) {
      input.value = value;
      state.questionInputDirty = false;
    }
    input.placeholder = value ? '输入其他题号' : '输入题号';
    input.title = '输入题号，Enter 或点击外部跳转，Esc 取消';
    if (state.questionValueDisplay) state.questionValueDisplay.textContent = value || '选择题目';
    input.classList.toggle(
      'has-current-question',
      Boolean(value) && !state.questionInputDirty
    );
    return value;
  }

  function questionNavigationCacheKey() {
    return [
      currentTableKey(),
      safeText(state.questionHeaderSelect?.value).trim(),
      state.questionFilters?.signature() || ''
    ].join('::');
  }

  function updateQuestionNavigationControls() {
    const items = state.questionFilters?.filter(state.questionNavigationItems) || state.questionNavigationItems;
    const selected = selectedQuestionColumn();
    if (selected?.syntheticRowQuestion) {
      const rowIndex = Number(state.row?.rowIndex);
      const enabled = (
        Number.isInteger(rowIndex)
        && rowIndex >= 1
        && !state.questionSearching
      );
      if (state.questionPreviousButton) {
        state.questionPreviousButton.disabled = !enabled || rowIndex <= 1;
      }
      if (state.questionNextButton) {
        state.questionNextButton.disabled = !enabled;
      }
      if (state.questionPositionLabel) {
        state.questionPositionLabel.textContent = enabled
          ? `第 ${rowIndex} 题`
          : '—';
      }
      updateTaskPanel();
      return;
    }
    const currentIndex = items.findIndex(({ rowIndex }) => (
      Number(rowIndex) === Number(state.row?.rowIndex)
    ));
    const enabled = (
      Boolean(selectedQuestionColumn())
      && !state.questionSearching
      && items.length > 0
    );
    if (state.questionPreviousButton) {
      state.questionPreviousButton.disabled = !enabled || currentIndex === 0;
    }
    if (state.questionNextButton) {
      state.questionNextButton.disabled = (
        !enabled
        || currentIndex >= items.length - 1
      );
    }
    if (state.questionPositionLabel) {
      state.questionPositionLabel.textContent = currentIndex >= 0
        ? `${currentIndex + 1} / ${items.length}`
        : `— / ${items.length || '—'}`;
    }
    updateTaskPanel();
  }

  async function loadQuestionNavigation({ force = false } = {}) {
    const filterRow = state.row;
    try { await state.questionFilters?.setRow(filterRow); }
    catch (error) { await state.questionFilters?.setRow(null); renderStatus(error.message, 'error'); return false; }
    if (state.row !== filterRow) return false;
    const keyHeader = safeText(state.questionHeaderSelect?.value).trim();
    if (!state.row || !keyHeader) {
      state.questionNavigationItems = [];
      state.questionNavigationKey = '';
      updateQuestionNavigationControls();
      return false;
    }
    if (keyHeader === ROW_QUESTION_HEADER) {
      state.questionNavigationItems = [];
      state.questionNavigationKey = questionNavigationCacheKey();
      updateQuestionNavigationControls();
      return true;
    }
    const cacheKey = questionNavigationCacheKey();
    if (
      !force
      && state.questionNavigationKey === cacheKey
      && state.questionNavigationItems.length
    ) {
      updateQuestionNavigationControls();
      return true;
    }
    const token = ++state.questionNavigationToken;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'READ_QUESTION_NAVIGATION',
        payload: {
          sheetId: state.row.sheetId,
          sheetIndex: state.row.sheetIndex,
          keyHeader,
          rowIndex: state.row.rowIndex,
          filterColumns: state.questionFilters?.columns() || []
        }
      });
      if (token !== state.questionNavigationToken) return false;
      if (!response?.ok) throw new Error(
        response?.error || '读取题号顺序失败'
      );
      state.questionNavigationItems = Array.isArray(response.items)
        ? response.items
        : [];
      state.questionNavigationKey = cacheKey;
      state.questionFilters?.receive(state.questionNavigationItems);
      updateQuestionNavigationControls();
      return true;
    } catch (error) {
      if (token !== state.questionNavigationToken) return false;
      state.questionNavigationItems = [];
      state.questionFilters?.receive([]);
      state.questionNavigationKey = '';
      updateQuestionNavigationControls();
      renderStatus(error.message || '读取题号顺序失败', 'warning');
      return false;
    }
  }

  async function selectQuestionNavigationItem(item, directionLabel = '') {
    if (!item || state.questionSearching) return false;
    state.questionSearching = true;
    updateQuestionSearchControls();
    renderStatus(
      `正在切换到${directionLabel || '题号'} ${item.keyValue}…`,
      'loading'
    );
    try {
      const selected = await chrome.runtime.sendMessage({
        type: 'SELECT_ROW',
        payload: {
          sheetId: state.row?.sheetId,
          sheetIndex: state.row?.sheetIndex,
          row: Number(item.rowIndex)
        }
      });
      if (!selected?.ok) throw new Error(
        selected?.error || '无法定位目标题目'
      );
      clearTimeout(state.refreshTimer);
      state.refreshPending = false;
      await refreshRow();
      renderStatus(
        `已切换到${directionLabel || '题号'} ${item.keyValue}`,
        'success'
      );
      return true;
    } catch (error) {
      renderStatus(error.message || '切换题目失败', 'error');
      return false;
    } finally {
      state.questionSearching = false;
      updateQuestionSearchControls();
    }
  }

  async function navigateQuestion(direction) {
    if (state.questionSearching) return;
    if (selectedQuestionColumn()?.syntheticRowQuestion) {
      const targetRow = Number(state.row?.rowIndex) + Number(direction);
      if (!Number.isInteger(targetRow) || targetRow < 1) {
        renderStatus('已经是第一题', 'warning');
        return;
      }
      await selectQuestionNavigationItem(
        { rowIndex: targetRow, keyValue: String(targetRow) },
        direction < 0 ? '上一题' : '下一题'
      );
      return;
    }
    if (!state.questionNavigationItems.length) {
      await loadQuestionNavigation({ force: true });
    }
    const items = state.questionFilters?.filter(state.questionNavigationItems) || state.questionNavigationItems;
    const currentIndex = items.findIndex(({ rowIndex }) => (
      Number(rowIndex) === Number(state.row?.rowIndex)
    ));
    const targetIndex = currentIndex >= 0 ? currentIndex + Number(direction)
      : direction > 0 ? items.findIndex(item => item.rowIndex > state.row.rowIndex)
        : items.findLastIndex(item => item.rowIndex < state.row.rowIndex);
    if (
      targetIndex < 0
      || targetIndex >= items.length
    ) {
      renderStatus(direction < 0 ? '已经是第一题' : '已经是最后一题', 'warning');
      return;
    }
    await selectQuestionNavigationItem(
      items[targetIndex],
      direction < 0 ? '上一题' : '下一题'
    );
  }

  async function searchTableQuestion() {
    if (state.questionSearching) return;
    const keyHeader = safeText(state.questionHeaderSelect?.value).trim();
    const keyValue = safeText(state.questionValueInput?.value).trim();
    if (!keyHeader) {
      renderStatus('当前表格未识别到“题号”字段', 'warning');
      return;
    }
    if (!keyValue) {
      if(state.questionJumpError){state.questionJumpError.hidden=false;state.questionJumpError.textContent='请输入题目号';}
      renderStatus('请输入题目号', 'warning');
      state.questionValueInput?.focus();
      return;
    }
    state.questionSearching = true;
    updateQuestionSearchControls();
    const syntheticRowQuestion = keyHeader === ROW_QUESTION_HEADER;
    renderStatus(
      syntheticRowQuestion
        ? `正在切换到第 ${keyValue} 题…`
        : `正在查找 ${keyHeader}=${keyValue}…`,
      'loading'
    );
    try {
      let response = null;
      let targetRow;
      if (syntheticRowQuestion) {
        targetRow = Number(keyValue);
        if (!Number.isInteger(targetRow) || targetRow < 1) {
          throw new Error('题号必须是大于 0 的整数');
        }
      } else {
        response = await chrome.runtime.sendMessage({
          type: 'READ_SHEET_ROW_BY_KEY',
          payload: {
            sheetId: state.row?.sheetId,
            sheetIndex: state.row?.sheetIndex,
            keyHeader,
            keyValue
          }
        });
        if (!response?.ok) throw new Error(response?.error || '未找到对应题号');
        targetRow = Number(response.rowIndex);
      }
      const selected = await chrome.runtime.sendMessage({
        type: 'SELECT_ROW',
        payload: {
          sheetId: response?.sheetId || state.row?.sheetId,
          sheetIndex: response?.sheetIndex ?? state.row?.sheetIndex,
          row: targetRow
        }
      });
      if (!selected?.ok) {
        throw new Error(selected?.error || '已找到题号，但无法定位表格行');
      }
      clearTimeout(state.refreshTimer);
      state.refreshPending = false;
      await refreshRow();
      state.questionInputDirty = false;
      syncCurrentQuestionValue({ force: true });
      renderStatus(
        syntheticRowQuestion
          ? `已切换到第 ${targetRow} 题`
          : `已定位 ${keyHeader}=${keyValue} · 第 ${targetRow + 1} 行`,
        'success'
      );
      return true;
    } catch (error) {
      if(state.questionJumpError){state.questionJumpError.hidden=false;state.questionJumpError.textContent=error.message || '未找到该题号';}
      renderStatus(error.message || '按题号查找失败', 'error');
      state.questionValueInput?.focus();
      state.questionValueInput?.select();
      return false;
    } finally {
      state.questionSearching = false;
      updateQuestionSearchControls();
    }
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
  }

  function extensionFromSource(url = '', fileName = '') {
    const source = safeText(fileName || url).split(/[?#]/)[0];
    return source.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
  }

  function videoMimeType(url = '', fileName = '', declaredMime = '') {
    const mime = safeText(declaredMime).toLowerCase();
    if (mime.startsWith('video/') || mime.includes('mpegurl') || mime.includes('dash+xml')) {
      return mime;
    }
    return VIDEO_MIME_BY_EXTENSION[extensionFromSource(url, fileName)] || mime;
  }

  function videoSupport(url = '', fileName = '', declaredMime = '') {
    const extension = extensionFromSource(url, fileName);
    const mimeType = videoMimeType(url, fileName, declaredMime);
    const probe = document.createElement('video');
    const result = mimeType ? probe.canPlayType?.(mimeType) || '' : '';
    const streamingManifest = ['m3u8', 'mpd'].includes(extension);
    return {
      extension,
      mimeType,
      supported: result === 'probably' || result === 'maybe',
      streamingManifest,
      supportText: result === 'probably'
        ? '浏览器支持'
        : result === 'maybe'
          ? '浏览器可能支持'
          : streamingManifest
            ? '需要浏览器或服务器支持流媒体协议'
            : '浏览器可能无法解码，可使用飞书播放器或下载'
    };
  }

  function displayType(type) {
    return ({
      text: '文本',
      number: '数字',
      boolean: '布尔',
      date: '日期',
      json: 'JSON',
      formula: '公式',
      link: '链接',
      'media-link': '媒体链接',
      'rich-text': '富文本',
      image: '图片',
      video: '视频',
      audio: '音频',
      file: '附件',
      attachments: '多附件'
    })[type] || type || '未知';
  }

  function columnKey(columnIndex) {
    return `column:${Number(columnIndex)}`;
  }

  function currentTableKey() {
    return safeText(state.row?.tableKey || state.row?.sheetId || 'unknown');
  }

  function rowIdentity(row = state.row) {
    return `${row?.tableKey || row?.sheetId || 'unknown'}::${row?.rowIndex ?? ''}`;
  }

  function canvasToolDefinitions() {
    return globalThis.__gtMapperCanvasToolRegistryV1?.list?.() || [];
  }

  function workspaceService() {
    return globalThis.__cyleWorkspaceServiceV1;
  }

  function builtinWorkspaceProfiles() {
    return (workspaceService()?.builtins || []).map((workspace) => ({
      ...workspace,
      label: workspace.name,
      description: workspace.description
    }));
  }

  async function refreshWorkspaceProfiles({
    selectId = state.workspaceRecipeByTable[currentTableKey()]
  } = {}) {
    const service = workspaceService();
    if (!service?.list) {
      state.workspaceProfiles = builtinWorkspaceProfiles();
      renderWorkspaceNavigation(selectId);
      return state.workspaceProfiles;
    }
    try {
      state.workspaceProfiles = await service.list({
        availableTools: canvasToolDefinitions().map(({ id }) => id)
      });
    } catch (_error) {
      state.workspaceProfiles = builtinWorkspaceProfiles();
    }
    renderWorkspaceNavigation(selectId);
    return state.workspaceProfiles;
  }

  function workspaceProfiles() {
    const profiles = state.workspaceProfiles.length
      ? state.workspaceProfiles
      : builtinWorkspaceProfiles();
    return profiles.some(({ id }) => id === 'custom')
      ? profiles
      : [
        ...profiles,
        {
          id: 'custom',
          name: '自由组合',
          label: '自由组合',
          description: '保留当前手工选择的字段与积木。',
          icon: 'Boxes',
          tools: null,
          fields: { mode: 'preserve', keys: [] },
          layout: { autoArrange: false, snap: true, zoom: 1 },
          builtin: true
        }
      ];
  }

  function renderWorkspaceNavigation(preferredId = '') {
    const profiles = workspaceProfiles();
    if (state.modeTabs && state.workspaceManageButton) {
      state.modeTabs.querySelectorAll(
        '.gtm-inspector-mode-tab[data-workspace-id]'
      ).forEach((tab) => tab.remove());
      const quickIds = ['viewer', 'machine-eval', 'human-eval', 'caption-review'];
      quickIds.forEach((id) => {
        const workspace = profiles.find((item) => item.id === id);
        if (!workspace) return;
        const tab = element('button', 'gtm-inspector-mode-tab');
        tab.type = 'button';
        tab.dataset.recipeId = workspace.id;
        tab.dataset.workspaceId = workspace.id;
        tab.append(
          iconNode(workspace.icon || 'Boxes', { size: 15 }),
          element('span', '', workspace.name || workspace.label)
        );
        tab.addEventListener('click', () => applyWorkspaceRecipe(workspace.id));
        state.modeTabs.insertBefore(tab, state.workspaceManageButton);
      });
    }
    syncWorkspaceNavigation();
  }

  function syncWorkspaceNavigation() {
    const activeId = currentWorkspaceRecipe().id;
    state.modeTabs?.querySelectorAll(
      '.gtm-inspector-mode-tab[data-workspace-id]'
    ).forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.workspaceId === activeId);
    });
  }

  function openWorkspaceComposer() {
    const composerApi = globalThis.__cyleWorkspaceComposerV1;
    if (!composerApi?.create) {
      renderStatus('工作区装配器尚未加载', 'error');
      return;
    }
    if (!state.workspaceComposer) {
      state.workspaceComposer = composerApi.create({
        root: state.root,
        getRow: () => state.error ? null : state.row,
        getReadError: () => state.error,
        onMappingApply: applyFieldMapping,
        onNotice: (message, isError = false) => (
          renderStatus(message, isError ? 'error' : 'success')
        )
      });
    }
    state.workspaceComposer.open().catch((error) => {
      renderStatus(`打开装配器失败：${error.message}`, 'error');
    });
  }

  function toolKey(toolOrId) {
    const id = typeof toolOrId === 'object' ? toolOrId?.id : toolOrId;
    return `tool:${String(id || '')}`;
  }

  function normalizeLayoutKey(value) {
    const source = String(value ?? '');
    if (source.startsWith('tool:') || source.startsWith('column:')) return source;
    const number = Number(source);
    return Number.isInteger(number) && number >= 0 ? columnKey(number) : source;
  }

  function cardKeyFor(item) {
    if (typeof item === 'string' || typeof item === 'number') {
      return normalizeLayoutKey(item);
    }
    return item?.cardKey
      || (item?.itemKind === 'tool'
        ? toolKey(item.toolId || item.id)
        : columnKey(item?.columnIndex));
  }

  function toolCardItem(definition) {
    return {
      itemKind: 'tool',
      toolId: definition.id,
      cardKey: definition.key || toolKey(definition),
      header: definition.title,
      definition
    };
  }

  function canvasCardItems() {
    return [
      ...(state.row?.cells || []).map((cell) => ({
        ...cell,
        itemKind: 'column',
        cardKey: columnKey(cell.columnIndex)
      })),
      ...canvasToolDefinitions().map(toolCardItem)
    ];
  }

  function ensureToolInstance(definition) {
    const existing = state.toolInstances.get(definition.id);
    if (existing) return existing;
    const root = element('div', 'gtm-canvas-tool-host');
    const record = {
      definition,
      root,
      instance: null,
      lastRevision: -1,
      loadPromise: null
    };
    const services = globalThis.__cyleServicesV1 || {};
    record.instance = definition.create({
      root,
      getRow: () => state.row,
      onNotice: (message, isError = false) => {
        renderStatus(message, isError ? 'error' : 'success');
      },
      onWrite: writeGtCell,
      onOpenNativeVideo: openNativeVideo,
      services: Object.freeze({
        storage: services.storage,
        drafts: services.drafts,
        writeback: services.writeback,
        media: services.media,
        timeline: services.timeline,
        host: services.host,
        legacyStorage: services.legacyStorage
      })
    });
    state.toolInstances.set(definition.id, record);
    return record;
  }

  function syncToolRecord(record) {
    if (!state.row || record.lastRevision === state.rowRevision) {
      return record.loadPromise || Promise.resolve();
    }
    record.lastRevision = state.rowRevision;
    record.loadPromise = Promise.resolve(record.instance?.setRow?.(state.row))
      .catch((error) => {
        renderStatus(`${record.definition.title}：${error.message}`, 'error');
      })
      .finally(() => {
        record.loadPromise = null;
      });
    return record.loadPromise;
  }

  function setCanvasToolsActive() {
    const visible = state.visibleColumns || new Set();
    state.toolInstances.forEach((record) => {
      const active = Boolean(
        state.open
        && !state.minimized
        && visible.has(record.definition.key || toolKey(record.definition))
        && record.root.isConnected
        && (!state.pageTools || state.activePageTool === record.definition.id)
      );
      record.instance?.setActive?.(active);
    });
  }

  function deactivateCanvasTools() {
    globalThis.__cyleMediaServiceV1.workspace.coordinator.pause();
    state.toolInstances.forEach(({ instance }) => instance?.setActive?.(false));
  }

  function disposeCanvasTools() {
    state.toolInstances.forEach(({ instance, root }) => {
      try {
        instance?.setActive?.(false);
        instance?.dispose?.();
      } catch (_error) {}
      root?.remove?.();
    });
    state.toolInstances.clear();
  }

  function legacyTextMarkKey(cell, row = state.row) {
    return `${rowIdentity(row)}::column:${Number(cell?.columnIndex)}`;
  }

  function cellIdentityText(cell) {
    const value = cell?.rawValue ?? cell?.value ?? cell?.displayValue;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (_error) {
        return safeText(cell?.displayValue);
      }
    }
    return safeText(value);
  }

  function columnIdentity(cell, row = state.row) {
    const column = row?.columns?.find(({ columnIndex }) => (
      Number(columnIndex) === Number(cell?.columnIndex)
    ));
    const header = safeText(
      column?.header
      || cell?.header
      || cell?.columnLetter
      || `column-${Number(cell?.columnIndex)}`
    ).trim().toLowerCase();
    const duplicateIndex = Number(column?.duplicateIndex) || 1;
    return `${textFingerprint(header)}:${duplicateIndex}`;
  }

  function stableRowMarkIdentity(row = state.row, excludedColumnIndex = -1) {
    const cells = Array.isArray(row?.cells) ? row.cells : [];
    const identityPattern = /(^|[\s_.-])(?:id|uuid|guid|key|record|task|item|sample|video)(?:[\s_.-]|$)|编号|唯一标识|任务ID|记录ID/i;
    const identifiers = cells
      .filter((cell) => (
        Number(cell?.columnIndex) !== Number(excludedColumnIndex)
        && identityPattern.test(safeText(cell?.header))
        && cellIdentityText(cell).trim()
      ))
      .map((cell) => [
        columnIdentity(cell, row),
        cellIdentityText(cell)
      ]);
    const evidence = identifiers.length
      ? identifiers
      : cells
        .filter((cell) => (
          Number(cell?.columnIndex) !== Number(excludedColumnIndex)
          && cellIdentityText(cell).trim()
        ))
        .map((cell) => [
          columnIdentity(cell, row),
          cellIdentityText(cell)
        ])
        .sort(([left], [right]) => left.localeCompare(right));
    if (!evidence.length) return `position:${row?.rowIndex ?? ''}`;
    return `content:${textFingerprint(JSON.stringify(evidence))}`;
  }

  function textMarkKey(cell, row = state.row) {
    const table = safeText(row?.tableKey || row?.sheetId || 'unknown');
    const rowKey = stableRowMarkIdentity(row, cell?.columnIndex);
    return `${table}::mark-v2:${rowKey}::column:${columnIdentity(cell, row)}`;
  }

  function textFingerprint(text) {
    const source = safeText(text);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${source.length}:${(hash >>> 0).toString(16)}`;
  }

  function markableCell(cell) {
    return Boolean(cell) && ![
      'date',
      'image',
      'video',
      'audio',
      'file',
      'attachments',
      'link',
      'media-link'
    ].includes(cell.type);
  }

  function rebaseTextMarks(marks, beforeText, afterText) {
    const before = safeText(beforeText);
    const after = safeText(afterText);
    if (before === after) return normalizeTextMarks(marks || []);
    let prefix = 0;
    while (
      prefix < before.length
      && prefix < after.length
      && before[prefix] === after[prefix]
    ) prefix += 1;
    let suffix = 0;
    while (
      suffix < before.length - prefix
      && suffix < after.length - prefix
      && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) suffix += 1;
    const oldEnd = before.length - suffix;
    const newEnd = after.length - suffix;
    const delta = newEnd - oldEnd;
    const rebased = [];
    (marks || []).forEach((mark) => {
      if (mark.end <= prefix) {
        rebased.push({ ...mark });
        return;
      }
      if (mark.start >= oldEnd) {
        rebased.push({
          ...mark,
          start: mark.start + delta,
          end: mark.end + delta
        });
        return;
      }
      if (oldEnd === prefix && mark.start <= prefix && mark.end >= prefix) {
        rebased.push({ ...mark, end: mark.end + delta });
        return;
      }
      if (mark.start < prefix) {
        rebased.push({ ...mark, end: prefix });
      }
      if (mark.end > oldEnd) {
        rebased.push({
          ...mark,
          start: newEnd,
          end: mark.end + delta
        });
      }
    });
    return normalizeTextMarks(rebased).filter((mark) => (
      mark.start >= 0
      && mark.end <= after.length
      && mark.end > mark.start
    ));
  }

  function displayTextForCell(cell) {
    if (cell?.type === 'json') {
      try {
        return JSON.stringify(
          JSON.parse(cell.displayValue || cell.rawValue || ''),
          null,
          2
        );
      } catch (_error) {}
    }
    if (cell?.formula) {
      return safeText(cell.displayValue || cell.rawValue || '计算结果为空');
    }
    return safeText(cell?.displayValue || cell?.rawValue || '空单元格');
  }

  function dateEditorValue(cell) {
    const display = safeText(cell?.displayValue || cell?.value).trim();
    const patterns = [
      /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
      /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})[时:](\d{1,2})(?:[分:](\d{1,2}))?)?/,
      /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    ];
    for (let index = 0; index < patterns.length; index += 1) {
      const match = display.match(patterns[index]);
      if (!match) continue;
      const [year, month, day] = index < 2
        ? [match[1], match[2], match[3]]
        : [match[3], match[1], match[2]];
      const timeOffset = index < 2 ? 4 : 4;
      const hour = match[timeOffset] || '';
      const minute = match[timeOffset + 1] || '';
      const second = match[timeOffset + 2] || '';
      const iso = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const time = hour
        ? `T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}${
          second ? `:${second.padStart(2, '0')}` : ''
        }`
        : '';
      const parsed = new Date(`${iso}${time || 'T00:00:00'}Z`);
      if (
        !Number.isNaN(parsed.getTime())
        && parsed.getUTCFullYear() === Number(year)
        && parsed.getUTCMonth() + 1 === Number(month)
        && parsed.getUTCDate() === Number(day)
      ) return `${iso}${time}`;
    }
    const serial = Number(cell?.rawValue);
    if (Number.isFinite(serial) && serial >= 1) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
    return '';
  }

  function dateSerialValue(value) {
    const match = safeText(value).trim().match(
      /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
    const parsed = new Date(timestamp);
    if (
      Number.isNaN(timestamp)
      || parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() + 1 !== month
      || parsed.getUTCDate() !== day
    ) return null;
    const serial = (timestamp - Date.UTC(1899, 11, 30)) / 86400000;
    return String(Number(serial.toFixed(10)));
  }

  function dateEditorInputType(cell) {
    return /(?:[ T]\d{1,2}:\d{2}|\d{1,2}[时:]\d{1,2})/.test(
      safeText(cell?.displayValue || cell?.value)
    ) ? 'datetime-local' : 'date';
  }

  function storedTextMarks(cell, text) {
    const key = textMarkKey(cell);
    const legacyKey = legacyTextMarkKey(cell);
    let saved = state.textMarksByCell[key];
    const fingerprint = textFingerprint(text);
    if (
      !saved
      && state.textMarksByCell[legacyKey]?.fingerprint === fingerprint
    ) {
      saved = state.textMarksByCell[legacyKey];
      state.textMarksByCell[key] = saved;
      delete state.textMarksByCell[legacyKey];
      savePreferences();
    }
    if (!saved || saved.fingerprint !== fingerprint || !Array.isArray(saved.marks)) {
      if (saved) {
        delete state.textMarksByCell[key];
        savePreferences();
      }
      return [];
    }
    return saved.marks
      .map((mark) => ({
        start: Math.max(0, Math.min(text.length, Number(mark.start) || 0)),
        end: Math.max(0, Math.min(text.length, Number(mark.end) || 0)),
        color: safeText(mark.color)
      }))
      .filter(({ start, end, color }) => end > start && color);
  }

  function normalizeTextMarks(marks) {
    const sorted = marks
      .filter(({ start, end, color }) => end > start && color)
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const result = [];
    sorted.forEach((mark) => {
      const previous = result.at(-1);
      if (
        previous
        && previous.color === mark.color
        && mark.start <= previous.end
      ) {
        previous.end = Math.max(previous.end, mark.end);
      } else {
        result.push({ ...mark });
      }
    });
    return result.slice(-120);
  }

  function applyTextMarkRange(marks, textLength, start, end, color = '') {
    const lower = Math.max(0, Math.min(textLength, Math.min(start, end)));
    const upper = Math.max(0, Math.min(textLength, Math.max(start, end)));
    if (upper <= lower) return null;
    const next = [];
    marks.forEach((mark) => {
      if (mark.end <= lower || mark.start >= upper) {
        next.push(mark);
        return;
      }
      if (mark.start < lower) next.push({ ...mark, end: lower });
      if (mark.end > upper) next.push({ ...mark, start: upper });
    });
    if (color) next.push({ start: lower, end: upper, color });
    return normalizeTextMarks(next);
  }

  function setTextMark(cell, text, start, end, color = '') {
    const key = textMarkKey(cell);
    const marks = applyTextMarkRange(
      storedTextMarks(cell, text),
      text.length,
      start,
      end,
      color
    );
    if (!marks) {
      renderStatus('请先在字段内容中选中文字', 'warning');
      return false;
    }
    if (marks.length) {
      state.textMarksByCell[key] = {
        fingerprint: textFingerprint(text),
        marks
      };
    } else {
      delete state.textMarksByCell[key];
    }
    savePreferences();
    renderCards();
    renderStatus(
      color ? '已保存本地文字标色，不会修改飞书内容' : '已清除选中文字的颜色',
      'success'
    );
    return true;
  }

  function clearCellTextMarks(cell) {
    const key = textMarkKey(cell);
    if (!state.textMarksByCell[key]) {
      renderStatus('当前字段没有文字标色', 'warning');
      return;
    }
    delete state.textMarksByCell[key];
    if (state.textSelection?.key === key) state.textSelection = null;
    savePreferences();
    renderCards();
    renderStatus('已清空当前字段的本地文字标色', 'success');
  }

  function jsonSyntaxRanges(text) {
    const ranges = [];
    const pattern = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let match;
    while ((match = pattern.exec(text))) {
      const token = match[0];
      let type = 'number';
      if (token.startsWith('"')) {
        type = /^\s*:/.test(text.slice(pattern.lastIndex))
          ? 'key'
          : 'string';
      } else if (/^(?:true|false)$/.test(token)) {
        type = 'boolean';
      } else if (token === 'null') {
        type = 'null';
      }
      ranges.push({
        start: match.index,
        end: match.index + token.length,
        type
      });
    }
    return ranges;
  }

  function appendHighlightedText(
    container,
    cell,
    text,
    isJson = false,
    customMarks = null,
    trackSelection = true
  ) {
    const marks = Array.isArray(customMarks)
      ? normalizeTextMarks(customMarks)
      : storedTextMarks(cell, text);
    const syntax = isJson ? jsonSyntaxRanges(text) : [];
    const links = [];
    if (!isJson && container.classList.contains('gtm-inspector-text-value')) {
      for (const match of text.matchAll(/https?:\/\/[^\s<>"'`，。；！？、（）【】]+/gi)) {
        let url = match[0].replace(/[.,;:!?]+$/, '');
        for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
          while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
        }
        try {
          if (new URL(url).hostname) links.push({start:match.index,end:match.index + url.length,url});
        } catch {}
      }
    }
    const boundaries = new Set([0, text.length]);
    marks.forEach(({ start, end }) => {
      boundaries.add(start);
      boundaries.add(end);
    });
    [...syntax, ...links].forEach(({ start, end }) => {
      boundaries.add(start);
      boundaries.add(end);
    });
    const points = [...boundaries].sort((left, right) => left - right);
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (end <= start) continue;
      const value = text.slice(start, end);
      const mark = marks.find((item) => item.start <= start && item.end >= end);
      const token = syntax.find((item) => item.start <= start && item.end >= end);
      const link = links.find(item => item.start <= start && item.end >= end);
      if (link) {
        const anchor = createLink(link.url, value);
        anchor.classList.add('cyle-inline-text-link');
        if (mark) { anchor.classList.add('gtm-inspector-user-mark'); anchor.style.color = mark.color; }
        container.append(anchor);
      } else if (mark || token) {
        const span = element(
          'span',
          mark
            ? 'gtm-inspector-user-mark'
            : `gtm-inspector-json-${token.type}`,
          value
        );
        if (mark) span.style.color = mark.color;
        container.append(span);
      } else {
        container.append(document.createTextNode(value));
      }
    }
    if (!trackSelection) return;
    container.dataset.markKey = textMarkKey(cell);
    container.dataset.textFingerprint = textFingerprint(text);
    const rememberSelection = () => {
      queueMicrotask(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        if (
          !container.contains(range.startContainer)
          || !container.contains(range.endContainer)
        ) return;
        const startRange = document.createRange();
        startRange.selectNodeContents(container);
        startRange.setEnd(range.startContainer, range.startOffset);
        const endRange = document.createRange();
        endRange.selectNodeContents(container);
        endRange.setEnd(range.endContainer, range.endOffset);
        const start = startRange.toString().length;
        const end = endRange.toString().length;
        if (end <= start) return;
        state.textSelection = {
          key: textMarkKey(cell),
          fingerprint: textFingerprint(text),
          start,
          end
        };
      });
    };
    container.addEventListener('mouseup', rememberSelection);
    container.addEventListener('keyup', rememberSelection);
  }

  function selectedTextRange(cell, text) {
    const selection = state.textSelection;
    return (
      selection
      && selection.key === textMarkKey(cell)
      && selection.fingerprint === textFingerprint(text)
    ) ? selection : null;
  }

  function makeTextMarkToolbar(cell, text) {
    const toolbar = element('div', 'gtm-inspector-mark-toolbar');
    toolbar.append(element(
      'span',
      'gtm-inspector-mark-hint',
      '先选中文字，再点颜色'
    ));
    TEXT_MARK_COLORS.forEach(({ label, value }) => {
      const button = element('button', 'gtm-inspector-mark-color');
      button.type = 'button';
      button.title = `标为${label}`;
      button.setAttribute('aria-label', `标为${label}`);
      button.style.setProperty('--gtm-mark-color', value);
      button.addEventListener('click', () => {
        const selection = selectedTextRange(cell, text);
        if (!selection) {
          renderStatus('请先在当前字段内容中选中文字', 'warning');
          return;
        }
        setTextMark(cell, text, selection.start, selection.end, value);
      });
      toolbar.append(button);
    });
    const clearSelection = element(
      'button',
      'gtm-inspector-mark-action',
      '清除选区'
    );
    clearSelection.type = 'button';
    clearSelection.addEventListener('click', () => {
      const selection = selectedTextRange(cell, text);
      if (!selection) {
        renderStatus('请先选中需要清除颜色的文字', 'warning');
        return;
      }
      setTextMark(cell, text, selection.start, selection.end, '');
    });
    const clearAll = element(
      'button',
      'gtm-inspector-mark-action',
      '清空标色'
    );
    clearAll.type = 'button';
    clearAll.addEventListener('click', () => clearCellTextMarks(cell));
    const done = element('button', 'gtm-inspector-mark-action', '完成');
    done.type = 'button';
    done.addEventListener('click', () => {
      state.annotationOpenCards.delete(textMarkKey(cell));
      renderCards();
    });
    toolbar.append(clearSelection, clearAll, done);
    return toolbar;
  }

  function tableCardLayout() {
    const key = currentTableKey();
    const saved = state.cardLayoutByTable[key];
    const layout = saved && typeof saved === 'object'
      ? saved
      : { order: [], cards: {} };
    if (!Array.isArray(layout.order)) layout.order = [];
    if (!layout.cards || typeof layout.cards !== 'object') layout.cards = {};
    if (!Number.isFinite(Number(layout.zoom))) layout.zoom = 1;
    layout.zoom = Math.min(1.5, Math.max(0.5, Number(layout.zoom)));
    if (typeof layout.snap !== 'boolean') layout.snap = true;
    state.cardLayoutByTable[key] = layout;
    return layout;
  }

  function ensureLayoutHistory() {
    const key = currentTableKey();
    if (state.layoutHistoryTableKey === key) return;
    state.layoutHistoryTableKey = key;
    state.layoutUndoStack = [];
    state.layoutRedoStack = [];
    updateLayoutHistoryButtons();
  }

  function layoutSnapshot() {
    return {
      cardLayout: structuredClone(tableCardLayout()),
      visibleColumns: [...(state.visibleColumns || [])],
      columnsPaneHidden: columnsPaneHidden()
    };
  }

  function restoreLayoutSnapshot(snapshot) {
    const key = currentTableKey();
    state.cardLayoutByTable[key] = structuredClone(snapshot.cardLayout);
    state.visibleColumns = new Set(snapshot.visibleColumns || []);
    state.visibilityByTable[key] = [...state.visibleColumns];
    state.columnsPaneHiddenByTable[key] = Boolean(snapshot.columnsPaneHidden);
    reconcileCardLayout();
    applyColumnsPaneVisibility();
    renderColumns();
    renderCards();
    renderSummaryStatus();
    savePreferences();
    updateLayoutHistoryButtons();
  }

  function recordLayoutMutation(label, mutation) {
    ensureLayoutHistory();
    const before = layoutSnapshot();
    mutation();
    return commitLayoutHistory(label, before);
  }

  function commitLayoutHistory(label, before) {
    const after = layoutSnapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) {
      updateLayoutHistoryButtons();
      return false;
    }
    state.layoutUndoStack.push({ label, state: before });
    if (state.layoutUndoStack.length > 50) state.layoutUndoStack.shift();
    state.layoutRedoStack = [];
    savePreferences();
    updateLayoutHistoryButtons();
    return true;
  }

  function undoLayout() {
    ensureLayoutHistory();
    const entry = state.layoutUndoStack.pop();
    if (!entry) {
      renderStatus('没有可撤销的布局操作', 'warning');
      updateLayoutHistoryButtons();
      return false;
    }
    state.layoutRedoStack.push({
      label: entry.label,
      state: layoutSnapshot()
    });
    restoreLayoutSnapshot(entry.state);
    renderStatus(`已撤销布局：${entry.label}`, 'success');
    return true;
  }

  function redoLayout() {
    ensureLayoutHistory();
    const entry = state.layoutRedoStack.pop();
    if (!entry) {
      renderStatus('没有可重做的布局操作', 'warning');
      updateLayoutHistoryButtons();
      return false;
    }
    state.layoutUndoStack.push({
      label: entry.label,
      state: layoutSnapshot()
    });
    restoreLayoutSnapshot(entry.state);
    renderStatus(`已重做布局：${entry.label}`, 'success');
    return true;
  }

  function updateLayoutHistoryButtons() {
    const undo = state.layoutUndoStack.at(-1);
    const redo = state.layoutRedoStack.at(-1);
    if (state.layoutUndoButton) {
      state.layoutUndoButton.disabled = !undo;
      state.layoutUndoButton.title = undo
        ? `撤销“${undo.label}”`
        : '没有可撤销的布局操作';
    }
    if (state.layoutRedoButton) {
      state.layoutRedoButton.disabled = !redo;
      state.layoutRedoButton.title = redo
        ? `重做“${redo.label}”`
        : '没有可重做的布局操作';
    }
    updateCanvasControls();
  }

  function reconcileCardLayout() {
    if (!state.row) return;
    const layout = tableCardLayout();
    const legacyCards = {};
    Object.entries(layout.cards).forEach(([rawKey, value]) => {
      legacyCards[normalizeLayoutKey(rawKey)] = value;
    });
    layout.cards = legacyCards;
    const available = [
      ...state.row.columns.map(({ columnIndex }) => columnKey(columnIndex)),
      ...canvasToolDefinitions().map(({ key, id }) => key || toolKey(id))
    ];
    const allowed = new Set(available);
    const normalizedOrder = layout.order.map(normalizeLayoutKey);
    layout.order = [
      ...normalizedOrder.filter((key) => allowed.has(key)),
      ...available.filter((key) => !normalizedOrder.includes(key))
    ];
    Object.keys(layout.cards).forEach((key) => {
      if (!allowed.has(key)) delete layout.cards[key];
    });
  }

  function persistCardLayout() {
    reconcileCardLayout();
    savePreferences();
  }

  function columnsPaneHidden() {
    return Boolean(state.columnsPaneHiddenByTable[currentTableKey()]);
  }

  function applyColumnsPaneVisibility() {
    if (!state.columnsPane || !state.content) return;
    const hidden = columnsPaneHidden();
    state.columnsPane.hidden = hidden;
    state.content.classList.toggle('is-columns-hidden', hidden);
    if (state.columnsToggleButton) {
      setButtonVisual(
        state.columnsToggleButton,
        hidden ? 'PanelLeftOpen' : 'PanelLeftClose',
        hidden ? '展开组件库' : '收起组件库'
      );
      state.columnsToggleButton.classList.toggle('is-active', hidden);
      state.columnsToggleButton.title = hidden ? '展开组件库' : '收起组件库';
    }
    requestAnimationFrame(() => updateCanvasBounds());
  }

  function toggleColumnsPane(forceHidden = null) {
    const key = currentTableKey();
    recordLayoutMutation(
      forceHidden === true || (forceHidden === null && !columnsPaneHidden())
        ? '隐藏列栏'
        : '显示列栏',
      () => {
        state.columnsPaneHiddenByTable[key] = forceHidden === null
          ? !columnsPaneHidden()
          : Boolean(forceHidden);
      }
    );
    applyColumnsPaneVisibility();
  }

  function defaultCardSpan(cell) {
    if (cell?.itemKind === 'tool') return 12;
    if (
      cell?.type === 'json'
      || MEDIA_TYPES.has(cell?.type)
      || safeText(cell?.displayValue || cell?.rawValue).length > 240
    ) return 12;
    return 6;
  }

  function canvasZoom() {
    return tableCardLayout().zoom || 1;
  }

  function canvasSnapEnabled() {
    return tableCardLayout().snap !== false;
  }

  function logicalCanvasViewportWidth() {
    return Math.max(
      CARD_MIN_WIDTH + CANVAS_PADDING * 2,
      (state.cards?.clientWidth || 720) / canvasZoom()
    );
  }

  function defaultCardWidth(cell, availableWidth = logicalCanvasViewportWidth()) {
    const usable = Math.max(CARD_MIN_WIDTH, availableWidth - CANVAS_PADDING * 2);
    if (cell?.itemKind === 'tool') {
      const minimum = Number(cell.definition?.minimumWidth) || 560;
      const preferred = Number(cell.definition?.defaultWidth) || 960;
      return Math.max(
        minimum,
        Math.min(preferred, Math.max(minimum, usable))
      );
    }
    const preferred = (
      cell?.type === 'json'
      || MEDIA_TYPES.has(cell?.type)
      || safeText(cell?.displayValue || cell?.rawValue).length > 240
    ) ? CARD_WIDE_WIDTH : CARD_DEFAULT_WIDTH;
    return Math.min(usable, Math.max(CARD_MIN_WIDTH, preferred));
  }

  function cardLayoutFor(cell, availableWidth = logicalCanvasViewportWidth()) {
    const layout = tableCardLayout();
    const key = cardKeyFor(cell);
    const saved = layout.cards[key] || {};
    const minimumWidth = saved.baseWidth > 0 ? 1 : cell?.itemKind === 'tool'
      ? Number(cell.definition?.minimumWidth) || 560
      : CARD_MIN_WIDTH;
    const minimumHeight = saved.baseHeight > 0 ? 1 : cell?.itemKind === 'tool'
      ? Number(cell.definition?.minimumHeight) || 420
      : CARD_MIN_HEIGHT;
    const autoHeight = Boolean(
      cell?.itemKind === 'tool'
      && cell.definition?.autoHeight
      && saved.userSizedHeight !== true
    );
    const hasStoredContentHeight = Object.prototype.hasOwnProperty.call(
      saved,
      'contentHeight'
    ) || Number(saved.height) > 0;
    const storedContentHeight = Number(
      saved.contentHeight || Math.max(0, Number(saved.height) - 58)
    );
    const legacySpan = [3, 4, 6, 8, 9, 12].includes(Number(saved.span))
      ? Number(saved.span)
      : defaultCardSpan(cell);
    const legacyWidth = Math.max(
      CARD_MIN_WIDTH,
      (availableWidth - CANVAS_PADDING * 2 + CANVAS_GAP)
        * legacySpan / 12
        - CANVAS_GAP
    );
    const width = Number(saved.width);
    const savedCardHeight = Number(saved.cardHeight);
    const hasStoredCardHeight = !autoHeight && Object.prototype.hasOwnProperty.call(
      saved,
      'cardHeight'
    );
    const x = Number(saved.x);
    const y = Number(saved.y);
    return {
      scale: saved.scale, baseWidth: saved.baseWidth, baseHeight: saved.baseHeight,
      displayScale: saved.displayScale,
      width: Number.isFinite(width) && width >= minimumWidth
        ? width
        : layout.mode === 'canvas'
          ? defaultCardWidth(cell, availableWidth)
          : Math.min(availableWidth - CANVAS_PADDING * 2, legacyWidth),
      x: Number.isFinite(x) && x >= 0 ? x : null,
      y: Number.isFinite(y) && y >= 0 ? y : null,
      placed: Number.isFinite(x) && x >= 0 && Number.isFinite(y) && y >= 0,
      cardHeight: hasStoredCardHeight
        ? (
          Number.isFinite(savedCardHeight) && savedCardHeight > 0
            ? Math.max(minimumHeight, savedCardHeight)
            : 0
        )
        : hasStoredContentHeight
          ? Math.max(minimumHeight, storedContentHeight + 61)
          : autoHeight
            ? 0
            : (
            cell?.itemKind === 'tool'
              ? Math.max(
                Number(cell.definition?.minimumHeight) || 420,
                Number(cell.definition?.defaultHeight) || 760
              )
              : safeText(cell?.displayValue || cell?.rawValue).length > 1200
                ? 420
                : 0
            ),
      z: Number.isFinite(Number(saved.z)) ? Number(saved.z) : 0
    };
  }

  function setCardLayout(cardKey, changes, label = '调整卡片') {
    const layout = tableCardLayout();
    const key = cardKeyFor(cardKey);
    recordLayoutMutation(label, () => {
      layout.cards[key] = {
        ...(layout.cards[key] || {}),
        ...changes
      };
      delete layout.cards[key].height;
      delete layout.cards[key].contentHeight;
      if ('width' in changes || 'cardHeight' in changes) {
        delete layout.cards[key].scale;
        delete layout.cards[key].baseWidth;
        delete layout.cards[key].baseHeight;
        delete layout.cards[key].displayScale;
      }
    });
  }

  function fieldCardDisplayScale(width, height = 0) {
    const numericWidth = Number(width) || 0;
    const numericHeight = Number(height) || 0;
    if (numericWidth >= 820 || numericHeight >= 500) return 'large';
    if (numericWidth >= 500 || numericHeight >= 300) return 'medium';
    return 'compact';
  }

  function syncFieldCardDisplayScale(card, item = null) {
    if (card?.dataset.cyleScale) return;
    if (!card || item?.itemKind === 'tool' || card.classList.contains('is-tool-card')) {
      return;
    }
    const width = Number.parseFloat(card.style.width) || card.offsetWidth;
    const height = Number.parseFloat(card.style.height) || card.offsetHeight;
    card.dataset.displayScale = fieldCardDisplayScale(width, height);
  }

  function closestFieldCardSizePreset(layout = {}) {
    const width = Number(layout.width) || CARD_DEFAULT_WIDTH;
    const height = Number(layout.cardHeight) || 0;
    return Object.entries(FIELD_CARD_SIZE_PRESETS)
      .map(([id, preset]) => ({
        id,
        distance: Math.abs(width - preset.width)
          + (height ? Math.abs(height - preset.height) * 0.35 : 0)
      }))
      .sort((left, right) => left.distance - right.distance)[0]?.id
      || 'standard';
  }

  function migrateCardLayoutToCanvas(cells, availableWidth) {
    const layout = tableCardLayout();
    let changed = layout.mode !== 'canvas';
    cells.forEach((cell) => {
      const key = cardKeyFor(cell);
      const saved = layout.cards[key] || {};
      const span = [3, 4, 6, 8, 9, 12].includes(Number(saved.span))
        ? Number(saved.span)
        : defaultCardSpan(cell);
      const legacyWidth = Math.max(
        CARD_MIN_WIDTH,
        (availableWidth - CANVAS_PADDING * 2 + CANVAS_GAP)
          * span / 12
          - CANVAS_GAP
      );
      const autoHeight = Boolean(
        cell?.itemKind === 'tool'
        && cell.definition?.autoHeight
        && saved.userSizedHeight !== true
      );
      const migratedHeight = autoHeight
        ? 0
        : Number(saved.cardHeight) > 0
        ? Number(saved.cardHeight)
        : Number(saved.height) > 0
          ? Number(saved.height)
          : cell?.itemKind === 'tool'
            ? Number(cell.definition?.defaultHeight) || 760
            : 0;
      const migrated = {
        ...saved,
        width: Number(saved.width) >= CARD_MIN_WIDTH
          ? Number(saved.width)
          : cell?.itemKind === 'tool'
            ? defaultCardWidth(cell, availableWidth)
            : Math.min(
              Math.max(CARD_MIN_WIDTH, availableWidth - CANVAS_PADDING * 2),
              legacyWidth
            )
      };
      if (migratedHeight > 0) {
        migrated.cardHeight = Math.max(CARD_MIN_HEIGHT, migratedHeight);
      } else if (autoHeight) {
        migrated.cardHeight = 0;
      }
      delete migrated.span;
      delete migrated.height;
      delete migrated.contentHeight;
      if (JSON.stringify(saved) !== JSON.stringify(migrated)) changed = true;
      layout.cards[key] = migrated;
    });
    layout.mode = 'canvas';
    if (!Number.isFinite(Number(layout.zoom))) layout.zoom = 1;
    if (typeof layout.snap !== 'boolean') layout.snap = true;
    if (changed) savePreferences();
    return changed;
  }

  function updateCanvasControls() {
    if (!state.row) return;
    const layout = tableCardLayout();
    if (state.canvasZoomSelect) {
      const percent = String(Math.round((layout.zoom || 1) * 100));
      const custom = state.canvasZoomSelect.querySelector(
        'option[data-custom-zoom]'
      );
      if (![...state.canvasZoomSelect.options].some(({ value }) => (
        value === percent
      ))) {
        custom?.remove();
        const option = new Option(`${percent}%`, percent);
        option.dataset.customZoom = 'true';
        state.canvasZoomSelect.add(option);
      } else if (custom?.value !== percent) {
        custom?.remove();
      }
      state.canvasZoomSelect.value = percent;
    }
    if (state.canvasSnapButton) {
      const enabled = layout.snap !== false;
      setButtonVisual(
        state.canvasSnapButton,
        'Magnet',
        enabled ? '磁吸开启' : '磁吸关闭'
      );
      state.canvasSnapButton.classList.toggle('is-active', enabled);
      state.canvasSnapButton.title = enabled
        ? '拖动时自动对齐；按住 Alt 可临时关闭'
        : '拖动时不自动对齐';
    }
  }

  function canvasPoint(clientX, clientY) {
    const rect = state.cards.getBoundingClientRect();
    const zoom = canvasZoom();
    return {
      x: (clientX - rect.left + state.cards.scrollLeft) / zoom,
      y: (clientY - rect.top + state.cards.scrollTop) / zoom
    };
  }

  function setCanvasGuide(axis, value = null) {
    const guide = state.canvas?.querySelector(
      `.gtm-inspector-canvas-guide.is-${axis}`
    );
    if (!guide) return;
    guide.hidden = !Number.isFinite(value);
    if (Number.isFinite(value)) {
      guide.style[axis === 'vertical' ? 'left' : 'top'] = `${Math.round(value)}px`;
    }
  }

  function clearCanvasGuides() {
    setCanvasGuide('vertical');
    setCanvasGuide('horizontal');
  }

  function bindCanvasPanning(canvas) {
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target !== canvas) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = state.cards.scrollLeft;
      const startTop = state.cards.scrollTop;
      state.cards.classList.add('is-panning');
      const move = (moveEvent) => {
        state.cards.scrollLeft = startLeft - (moveEvent.clientX - startX);
        state.cards.scrollTop = startTop - (moveEvent.clientY - startY);
      };
      const stop = () => {
        state.cards.classList.remove('is-panning');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  }

  function nearestSnap(value, candidates) {
    let result = null;
    let distance = CANVAS_SNAP_DISTANCE + 1;
    candidates.forEach((candidate) => {
      const nextDistance = Math.abs(candidate.value - value);
      if (nextDistance <= CANVAS_SNAP_DISTANCE && nextDistance < distance) {
        result = candidate;
        distance = nextDistance;
      }
    });
    return result;
  }

  function snapCardPosition(rawX, rawY, width, height, activeCard, bypass = false) {
    const layout = tableCardLayout();
    if (layout.snap === false || bypass) {
      clearCanvasGuides();
      return {
        x: Math.max(0, rawX),
        y: Math.max(0, rawY)
      };
    }
    let x = Math.round(rawX / CANVAS_GRID) * CANVAS_GRID;
    let y = Math.round(rawY / CANVAS_GRID) * CANVAS_GRID;
    const vertical = [{ value: CANVAS_PADDING, guide: CANVAS_PADDING }];
    const horizontal = [{ value: CANVAS_PADDING, guide: CANVAS_PADDING }];
    state.canvas?.querySelectorAll('.gtm-inspector-card').forEach((other) => {
      if (other === activeCard) return;
      const otherX = Number.parseFloat(other.style.left) || 0;
      const otherY = Number.parseFloat(other.style.top) || 0;
      const otherWidth = other.offsetWidth;
      const otherHeight = other.offsetHeight;
      const left = otherX;
      const right = otherX + otherWidth;
      const centerX = otherX + otherWidth / 2;
      const top = otherY;
      const bottom = otherY + otherHeight;
      const centerY = otherY + otherHeight / 2;
      vertical.push(
        { value: left, guide: left },
        { value: right - width, guide: right },
        { value: right + CANVAS_GAP, guide: right },
        { value: left - width - CANVAS_GAP, guide: left },
        { value: centerX - width / 2, guide: centerX }
      );
      horizontal.push(
        { value: top, guide: top },
        { value: bottom - height, guide: bottom },
        { value: bottom + CANVAS_GAP, guide: bottom },
        { value: top - height - CANVAS_GAP, guide: top },
        { value: centerY - height / 2, guide: centerY }
      );
    });
    const snappedX = nearestSnap(rawX, vertical);
    const snappedY = nearestSnap(rawY, horizontal);
    if (snappedX) x = snappedX.value;
    if (snappedY) y = snappedY.value;
    setCanvasGuide('vertical', snappedX?.guide);
    setCanvasGuide('horizontal', snappedY?.guide);
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y))
    };
  }

  function snapCardWidth(rawWidth, activeCard, bypass = false) {
    const minimumWidth = Number(activeCard?.dataset?.minWidth) || CARD_MIN_WIDTH;
    const width = Math.max(minimumWidth, rawWidth);
    if (!canvasSnapEnabled() || bypass) {
      setCanvasGuide('vertical');
      return Math.round(width);
    }
    const x = Number.parseFloat(activeCard.style.left) || 0;
    const right = x + width;
    const candidates = [];
    state.canvas?.querySelectorAll('.gtm-inspector-card').forEach((other) => {
      if (other === activeCard) return;
      const otherX = Number.parseFloat(other.style.left) || 0;
      const otherRight = otherX + other.offsetWidth;
      candidates.push(
        { value: otherX, guide: otherX },
        { value: otherRight, guide: otherRight },
        { value: otherX - CANVAS_GAP, guide: otherX },
        { value: otherRight + CANVAS_GAP, guide: otherRight }
      );
    });
    const snapped = nearestSnap(right, candidates);
    setCanvasGuide('vertical', snapped?.guide);
    return snapped && snapped.value - x >= minimumWidth
      ? Math.round(snapped.value - x)
      : Math.max(
        minimumWidth,
        Math.round(width / CANVAS_GRID) * CANVAS_GRID
      );
  }

  function updateCanvasBounds(extra = {}) {
    if (!state.canvas || !state.canvasSizer || !state.cards) return;
    const viewportWidth = logicalCanvasViewportWidth();
    let width = viewportWidth;
    let height = Math.max(420, state.cards.clientHeight / canvasZoom());
    state.canvas.querySelectorAll('.gtm-inspector-card').forEach((card) => {
      width = Math.max(
        width,
        (Number.parseFloat(card.style.left) || 0)
          + card.offsetWidth
          + CANVAS_PADDING
      );
      height = Math.max(
        height,
        (Number.parseFloat(card.style.top) || 0)
          + card.offsetHeight
          + CANVAS_PADDING
      );
    });
    width = Math.max(width, Number(extra.right) || 0);
    height = Math.max(height, Number(extra.bottom) || 0);
    const zoom = canvasZoom();
    state.canvas.style.width = `${Math.ceil(width)}px`;
    state.canvas.style.height = `${Math.ceil(height)}px`;
    state.canvas.style.minWidth = `${Math.ceil(width)}px`;
    state.canvas.style.minHeight = `${Math.ceil(height)}px`;
    state.canvas.style.transform = `scale(${zoom})`;
    state.canvasSizer.style.width = `${Math.ceil(width * zoom)}px`;
    state.canvasSizer.style.height = `${Math.ceil(height * zoom)}px`;
  }

  function placeUnpositionedCards(entries) {
    const layout = tableCardLayout();
    const placed = entries.filter(({ cardLayout }) => cardLayout.placed);
    const pending = entries.filter(({ cardLayout }) => !cardLayout.placed);
    if (!pending.length) return false;
    const availableWidth = logicalCanvasViewportWidth();
    let x = CANVAS_PADDING;
    let y = placed.length
      ? Math.max(...placed.map(({ card, cardLayout }) => (
        cardLayout.y + card.offsetHeight
      ))) + CANVAS_GAP
      : CANVAS_PADDING;
    let rowHeight = 0;
    pending.forEach(({ cell, card, cardLayout }) => {
      const width = cardLayout.width;
      if (
        x > CANVAS_PADDING
        && x + width > Math.max(availableWidth - CANVAS_PADDING, CARD_MIN_WIDTH)
      ) {
        x = CANVAS_PADDING;
        y += rowHeight + CANVAS_GAP;
        rowHeight = 0;
      }
      const key = cardKeyFor(cell);
      layout.cards[key] = {
        ...(layout.cards[key] || {}),
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width)
      };
      card.style.left = `${Math.round(x)}px`;
      card.style.top = `${Math.round(y)}px`;
      rowHeight = Math.max(rowHeight, card.offsetHeight);
      x += width + CANVAS_GAP;
    });
    savePreferences();
    return true;
  }

  function autoArrangeCards() {
    if (!state.canvas) return;
    recordLayoutMutation('自动整理画布', () => {
      const layout = tableCardLayout();
      let x = CANVAS_PADDING;
      let y = CANVAS_PADDING;
      let rowHeight = 0;
      const availableWidth = logicalCanvasViewportWidth();
      state.canvas.querySelectorAll('.gtm-inspector-card').forEach((card) => {
        const key = normalizeLayoutKey(card.dataset.cardKey);
        const saved = layout.cards[key] || {};
        const width = Math.max(
          CARD_MIN_WIDTH,
          Number(saved.width) || card.offsetWidth || CARD_DEFAULT_WIDTH
        );
        if (
          x > CANVAS_PADDING
          && x + width > Math.max(availableWidth - CANVAS_PADDING, CARD_MIN_WIDTH)
        ) {
          x = CANVAS_PADDING;
          y += rowHeight + CANVAS_GAP;
          rowHeight = 0;
        }
        layout.cards[key] = {
          ...saved,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width)
        };
        x += width + CANVAS_GAP;
        rowHeight = Math.max(rowHeight, card.offsetHeight);
      });
    });
    renderCards();
    state.cards.scrollLeft = 0;
    state.cards.scrollTop = 0;
    renderStatus('已自动整理当前画布，可撤销', 'success');
  }

  function setCanvasZoom(zoom) {
    const next = Math.min(1.5, Math.max(0.5, Number(zoom) || 1));
    recordLayoutMutation('调整画布缩放', () => {
      tableCardLayout().zoom = next;
    });
    renderCards();
    renderSummaryStatus();
  }

  function fitCanvasToViewport() {
    if (!state.canvas || !state.cards) return;
    let contentWidth = CARD_MIN_WIDTH + CANVAS_PADDING * 2;
    let contentHeight = 240;
    state.canvas.querySelectorAll('.gtm-inspector-card').forEach((card) => {
      contentWidth = Math.max(
        contentWidth,
        (Number.parseFloat(card.style.left) || 0)
          + card.offsetWidth
          + CANVAS_PADDING
      );
      contentHeight = Math.max(
        contentHeight,
        (Number.parseFloat(card.style.top) || 0)
          + card.offsetHeight
          + CANVAS_PADDING
      );
    });
    const target = Math.min(
      1.5,
      Math.max(
        0.5,
        Math.min(
          (state.cards.clientWidth - 8) / contentWidth,
          (state.cards.clientHeight - 8) / contentHeight
        )
      )
    );
    setCanvasZoom(target);
  }

  function toggleCanvasSnap() {
    recordLayoutMutation(
      canvasSnapEnabled() ? '关闭画布磁吸' : '开启画布磁吸',
      () => {
        tableCardLayout().snap = !canvasSnapEnabled();
      }
    );
    updateCanvasControls();
    renderSummaryStatus();
  }

  function resetCardLayout() {
    if (!state.row) return;
    recordLayoutMutation('重置卡片布局', () => {
      state.cardLayoutByTable[currentTableKey()] = {
        mode: 'canvas',
        order: [],
        cards: {},
        zoom: 1,
        snap: true
      };
    });
    state.cards.scrollLeft = 0;
    state.cards.scrollTop = 0;
    renderCards();
    renderStatus('当前表格已恢复自由画布的默认布局', 'success');
  }

  async function loadPreferences() {
    try {
      const result = await storageArea().get(STORAGE_KEY);
      const saved = result?.[STORAGE_KEY] || {};
      state.layout = saved.layout || null;
      state.theme = saved.theme === 'light' ? 'light' : 'dark';
      state.floatPreferences = normalizeFloatPreferences(saved.floatPreferences);
      state.publicMaterialsHidden = false; // Restored per table after the current sheet is known.
      state.visibilityByTable = saved.visibilityByTable || {};
      state.cardLayoutByTable = saved.cardLayoutByTable || {};
      state.columnsPaneHiddenByTable = saved.columnsPaneHiddenByTable || {};
      state.textMarksByCell = saved.textMarksByCell || {};
      state.questionHeaderByTable = saved.questionHeaderByTable || {};
      state.workspaceRecipeByTable = saved.workspaceRecipeByTable || {};
      state.tableViews = saved.tableViews || {};
      state.live = saved.live !== false;
      if (state.layout && Number(state.layout.shellVersion) !== 2) {
        state.layout = {
          ...state.layout,
          width: Math.max(1180, Number(state.layout.width) || 0),
          height: Math.max(700, Number(state.layout.height) || 0),
          shellVersion: 2
        };
      }
    } catch (_error) {
      state.layout = null;
      state.visibilityByTable = {};
      state.cardLayoutByTable = {};
      state.columnsPaneHiddenByTable = {};
      state.textMarksByCell = {};
      state.questionHeaderByTable = {};
      state.workspaceRecipeByTable = {};
    }
  }

  async function savePreferences() {
    try {
      await storageArea().set({
        [STORAGE_KEY]: {
          live: state.live,
          theme: state.theme === 'light' ? 'light' : 'dark',
          floatPreferences: normalizeFloatPreferences(state.floatPreferences),
          publicMaterialsHidden: Boolean(state.publicMaterialsHidden),
          layout: state.layout,
          visibilityByTable: state.visibilityByTable,
          cardLayoutByTable: state.cardLayoutByTable,
          columnsPaneHiddenByTable: state.columnsPaneHiddenByTable,
          textMarksByCell: state.textMarksByCell,
          questionHeaderByTable: state.questionHeaderByTable,
          tableViews: state.tableViews,
          workspaceRecipeByTable: state.workspaceRecipeByTable
        }
      });
    } catch (_error) {
      // The inspector remains usable when storage is unavailable.
    }
  }

  function panelLayoutRect() {
    const rect = state.panel.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const scaleX = rootRect.width / state.root.clientWidth || 1;
    const scaleY = rootRect.height / state.root.clientHeight || 1;
    return { left: rect.left / scaleX, top: rect.top / scaleY,
      width: rect.width / scaleX, height: rect.height / scaleY };
  }

  function saveLayout() {
    if (
      !state.panel?.isConnected
      || state.minimized
      || state.fullscreen
    ) return;
    const rect = panelLayoutRect();
    state.layout = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      shellVersion: 2
    };
    savePreferences();
  }

  function applyLayout() {
    if (!state.panel) return;
    if (state.fullscreen) {
      state.panel.style.left = '0px';
      state.panel.style.top = '0px';
      state.panel.style.width = 'auto';
      state.panel.style.height = 'auto';
      return;
    }
    // Layout values use CSS coordinates, which can differ from client pixels
    // when the host document is zoomed. The fixed root measures that space.
    const viewportWidth = state.root.clientWidth || window.innerWidth;
    const viewportHeight = state.root.clientHeight || window.innerHeight;
    const layout = state.layout;
    if (!layout) {
      const gap = 18;
      const width = Math.min(1360, Math.max(0, viewportWidth - gap * 2));
      const height = Math.min(860, Math.max(0, viewportHeight - gap * 2));
      state.panel.style.left = `${gap}px`;
      state.panel.style.top = `${gap}px`;
      state.panel.style.width = `${width}px`;
      state.panel.style.height = `${height}px`;
      return;
    }
    const maxWidth = Math.max(0, viewportWidth - 16);
    const maxHeight = Math.max(0, viewportHeight - 16);
    const width = Math.min(
      Math.max(Math.min(360, maxWidth), Number(layout.width) || 580),
      maxWidth
    );
    const height = Math.min(
      Math.max(Math.min(250, maxHeight), Number(layout.height) || 680),
      maxHeight
    );
    const left = Math.min(
      Math.max(8, Number(layout.left) || 8),
      Math.max(8, viewportWidth - width - 8)
    );
    const top = Math.min(
      Math.max(8, Number(layout.top) || 8),
      Math.max(8, viewportHeight - height - 8)
    );
    state.panel.style.left = `${left}px`;
    state.panel.style.top = `${top}px`;
    state.panel.style.width = `${width}px`;
    state.panel.style.height = `${height}px`;
  }

  function dockPanel(mode) {
    if (!state.panel) return;
    if (state.fullscreen) exitFullscreen({ restore: false });
    const gap = 12;
    state.minimized = false;
    state.panel.classList.remove('is-minimized');
    setButtonVisual(state.minimizeButton, 'Minimize2');
    const maxWidth = Math.max(320, window.innerWidth - gap * 2);
    const maxHeight = Math.max(220, window.innerHeight - gap * 2);
    const width = Math.min(
      Math.max(Math.min(360, maxWidth), state.panel.offsetWidth || 580),
      maxWidth
    );
    const height = Math.min(
      Math.max(Math.min(250, maxHeight), state.panel.offsetHeight || 680),
      maxHeight
    );
    state.panel.style.width = `${width}px`;
    state.panel.style.height = `${height}px`;
    if (mode === 'left') {
      state.panel.style.left = `${gap}px`;
      state.panel.style.top = `${gap}px`;
      state.panel.style.height = `${maxHeight}px`;
    } else {
      state.panel.style.left = `${Math.max(gap, window.innerWidth - width - gap)}px`;
      state.panel.style.top = `${gap}px`;
      state.panel.style.height = `${maxHeight}px`;
    }
    saveLayout();
  }

  function bindDragging(handle) {
    handle.addEventListener('pointerdown', (event) => {
      if (
        event.button !== 0
        || state.fullscreen
        || event.target.closest('button, input')
      ) return;
      const rect = state.panel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      try {
        handle.setPointerCapture?.(event.pointerId);
      } catch (_error) {
        // Pointer capture may be unavailable for synthetic or embedded events.
      }
      state.panel.classList.add('is-dragging');

      const move = (moveEvent) => {
        const maxLeft = Math.max(0, window.innerWidth - state.panel.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - 44);
        state.panel.style.left = `${Math.min(maxLeft, Math.max(0, moveEvent.clientX - offsetX))}px`;
        state.panel.style.top = `${Math.min(maxTop, Math.max(0, moveEvent.clientY - offsetY))}px`;
      };
      const stop = () => {
        state.panel.classList.remove('is-dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        saveLayout();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  }

  function bindResizing(panel) {
    const directions = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
    directions.forEach((direction) => {
      const handle = element(
        'div',
        `gtm-inspector-resize-handle is-${direction}`
      );
      handle.dataset.direction = direction;
      handle.setAttribute('aria-hidden', 'true');
      handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || state.minimized || state.fullscreen) return;
        event.preventDefault();
        event.stopPropagation();
        const startRect = panel.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const minimumWidth = Math.min(360, Math.max(280, window.innerWidth - 16));
        const minimumHeight = Math.min(250, Math.max(190, window.innerHeight - 16));
        try {
          handle.setPointerCapture?.(event.pointerId);
        } catch (_error) {
          // Continue with window-level listeners when pointer capture is unavailable.
        }
        panel.classList.add('is-resizing');

        const move = (moveEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          let left = startRect.left;
          let top = startRect.top;
          let width = startRect.width;
          let height = startRect.height;

          if (direction.includes('e')) {
            width = Math.min(
              window.innerWidth - startRect.left,
              Math.max(minimumWidth, startRect.width + deltaX)
            );
          }
          if (direction.includes('s')) {
            height = Math.min(
              window.innerHeight - startRect.top,
              Math.max(minimumHeight, startRect.height + deltaY)
            );
          }
          if (direction.includes('w')) {
            const right = startRect.right;
            left = Math.max(0, Math.min(
              right - minimumWidth,
              startRect.left + deltaX
            ));
            width = right - left;
          }
          if (direction.includes('n')) {
            const bottom = startRect.bottom;
            top = Math.max(0, Math.min(
              bottom - minimumHeight,
              startRect.top + deltaY
            ));
            height = bottom - top;
          }

          panel.style.left = `${Math.round(left)}px`;
          panel.style.top = `${Math.round(top)}px`;
          panel.style.width = `${Math.round(width)}px`;
          panel.style.height = `${Math.round(height)}px`;
        };
        const stop = () => {
          panel.classList.remove('is-resizing');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', stop);
          window.removeEventListener('pointercancel', stop);
          saveLayout();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
      });
      panel.append(handle);
    });
  }

  function makeIconButton(label, iconName, action, text = '') {
    const button = element('button', 'gtm-inspector-icon-button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    setButtonVisual(button, iconName, text);
    button.addEventListener('click', action);
    return button;
  }

  function updateFullscreenButton() {
    if (!state.fullscreenButton) return;
    setButtonVisual(
      state.fullscreenButton,
      state.fullscreen ? 'Minimize2' : 'Maximize2'
    );
    state.fullscreenButton.title = state.fullscreen
      ? '退出全屏'
      : '一键全屏';
    state.fullscreenButton.setAttribute(
      'aria-label',
      state.fullscreen ? '退出全屏' : '一键全屏'
    );
  }

  function enterFullscreen() {
    if (!state.panel || state.fullscreen) return;
    const rect = panelLayoutRect();
    const restore = state.minimized && state.layout
      ? state.layout
      : {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
    state.fullscreenRestoreLayout = {
      left: Math.round(Number(restore.left) || rect.left),
      top: Math.round(Number(restore.top) || rect.top),
      width: Math.round(Number(restore.width) || rect.width),
      height: Math.round(Number(restore.height) || rect.height)
    };
    state.fullscreen = true;
    state.minimized = false;
    state.panel.classList.remove('is-minimized');
    state.panel.classList.add('is-fullscreen');
    setButtonVisual(state.minimizeButton, 'Minimize2');
    state.minimizeButton.title = '最小化';
    state.minimizeButton.setAttribute('aria-label', '最小化');
    applyLayout();
    setCanvasToolsActive();
    updateFullscreenButton();
    requestAnimationFrame(() => updateCanvasBounds());
  }

  function exitFullscreen({ restore = true } = {}) {
    if (!state.panel || !state.fullscreen) return;
    state.fullscreen = false;
    state.panel.classList.remove('is-fullscreen');
    if (restore && state.fullscreenRestoreLayout) {
      state.layout = { ...state.fullscreenRestoreLayout };
      applyLayout();
    }
    state.fullscreenRestoreLayout = null;
    updateFullscreenButton();
    requestAnimationFrame(() => updateCanvasBounds());
  }

  function toggleFullscreen() {
    if (state.fullscreen) exitFullscreen();
    else enterFullscreen();
  }

  async function applyFieldMapping(config, row = state.row) {
    const mapping = globalThis.__cyleFieldMappingV1;
    if (!row || state.error || mapping.key(row) !== mapping.key(state.row)) throw new Error('请先刷新当前工作表');
    const fields = mapping.read(row, config);
    state.publicGroups = mapping.publicGroups(row, config);
    state.publicMappingError = "";
    const tools = [...(state.visibleColumns || [])].filter(key => String(key).startsWith('tool:'));
    state.visibleColumns = new Set([...tools, ...fields.map(field => columnKey(field.source.index))]);
    persistVisibility();
    render();
    renderStatus(`已按映射显示 ${new Set(fields.map(field => field.source.index)).size} 个源列`, 'success');
  }

  function createInspector() {
    if (state.root?.isConnected) return;
    state.petMascot?.dispose();
    const root = element('div', '', '');
    root.id = ROOT_ID;
    root.hidden = true;

    const panel = element('section', 'gtm-inspector-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `${EXTENSION_NAME} 标注工作台`);

    const header = element('header', 'gtm-inspector-header');
    const heading = element('div', 'gtm-inspector-heading');
    const brandMark = element('span', 'gtm-inspector-brand-mark');
    brandMark.classList.add('cyle-pet-mascot');
    brandMark.setAttribute('aria-hidden', 'true');
    const headingCopy = element('div', 'gtm-inspector-heading-copy');
    const eyebrow = element(
      'span',
      'gtm-inspector-eyebrow',
      '陪你把每一帧看清楚'
    );
    const title = element('strong', 'gtm-inspector-title', EXTENSION_NAME);
    const subtitle = element(
      'span',
      'gtm-inspector-subtitle',
      '视频标注工作台'
    );
    headingCopy.append(eyebrow, title, subtitle);
    heading.append(brandMark, headingCopy);
    const petMotto = element('div', 'cyle-pet-motto');
    petMotto.setAttribute('aria-hidden', 'true');
    heading.append(petMotto);

    const actions = element('div', 'gtm-inspector-header-actions');
    const left = makeIconButton(
      '停靠到左侧',
      'PanelLeftOpen',
      () => dockPanel('left')
    );
    const right = makeIconButton(
      '停靠到右侧',
      'PanelLeftClose',
      () => dockPanel('right')
    );
    left.classList.add('is-dock-control');
    right.classList.add('is-dock-control');
    const fullscreen = makeIconButton('一键全屏', 'Maximize2', () => {
      toggleFullscreen();
    });
    fullscreen.classList.add('is-fullscreen-control');
    const live = makeIconButton('切换自动跟随选区', 'RefreshCw', () => {
      state.live = !state.live;
      renderLiveState();
      renderSummaryStatus();
      savePreferences();
    });
    live.classList.add('is-live-control');
    const refresh = makeIconButton(
      '重新读取当前行',
      'RotateCcw',
      async () => { await refreshRow(); await loadQuestionNavigation({force:true}); }
    );
    refresh.classList.add('is-refresh-control');
    const minimize = makeIconButton(
      '最小化',
      'Minimize2',
      () => toggleMinimized()
    );
    minimize.classList.add('is-minimize-control');
    const close = makeIconButton(
      '关闭检查器',
      'X',
      () => setOpen(false)
    );
    close.classList.add('is-close-control');
    const themes = element('div', 'cyle-theme-switch');
    themes.setAttribute('role', 'group'); themes.setAttribute('aria-label', '宠物主题');
    const applyTheme = value => {
      state.theme = value === 'light' ? 'light' : 'dark';
      root.dataset.cyleTheme = state.theme;
      themes.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.theme === state.theme)));
      brandMark.title = state.theme === 'dark' ? '墨团 · 黑色绒面' : '绒绒 · 奶白织物';
      petMotto.textContent = state.theme === 'dark' ? '专注每一帧\n让世界更清晰  🐾' : '温柔地看见\n让细节更有温度  🐾';
    };
    for (const [value, label] of [['dark', '黑'], ['light', '白']]) {
      const choice = element('button', '', label);
      choice.type = 'button';
      choice.addEventListener('click', () => { applyTheme(value); savePreferences(); });
      choice.dataset.theme = value;
      choice.setAttribute('aria-label', value === 'dark' ? '黑色宠物主题' : '白色宠物主题');
      themes.append(choice);
    }
    const assetUrl = file => chrome.runtime.getURL ? chrome.runtime.getURL(file) : new URL(`../${file}`, document.baseURI).href;
    root.style.setProperty('--cyle-pet-dark', `url("${assetUrl('assets/themes/motuan.webp')}")`);
    root.style.setProperty('--cyle-pet-light', `url("${assetUrl('assets/themes/rongrong.png')}")`);
    root.style.setProperty('--cyle-pet-dark-ledge', `url("${assetUrl('assets/themes/motuan-ledge.png')}")`);
    root.style.setProperty('--cyle-pet-light-ledge', `url("${assetUrl('assets/themes/rongrong-ledge.png')}")`);
    root.style.setProperty('--cyle-woven', `url("${assetUrl('assets/themes/woven.svg')}")`);
    root.style.setProperty('--cyle-velvet', `url("${assetUrl('assets/themes/velvet.png')}")`);
    root.style.setProperty('--cyle-cotton', `url("${assetUrl('assets/themes/cotton.png')}")`);
    root.style.setProperty('--cyle-fox-corner', `url("${assetUrl('assets/themes/fox-corner.png')}")`);
    root.style.setProperty('--cyle-gingham-corner', `url("${assetUrl('assets/themes/gingham-corner.png')}")`);
    applyTheme(state.theme);
    actions.append(themes, left, right, fullscreen, live, refresh, minimize, close);

    const body = element('div', 'gtm-inspector-body');
    const modeTabs = element('nav', 'gtm-inspector-mode-tabs');
    const workspaceManage = makeCommandButton(
      '组装工作区',
      'Settings',
      openWorkspaceComposer,
      'is-workspace-manage'
    );
    workspaceManage.querySelector('.gtm-button-label')?.remove();
    modeTabs.append(workspaceManage);

    header.append(heading, modeTabs, actions);

    const inspectorWorkspace = element('div', 'gtm-inspector-workspace');
    const toolbar = element('div', 'gtm-inspector-toolbar');
    const questionSearch = element('section', 'gtm-inspector-question-search');
    const questionHeading = element('strong', '', '题号');
    const questionHeaderSelect = element(
      'select',
      'gtm-inspector-question-header-select'
    );
    questionHeaderSelect.setAttribute('aria-label', '题号字段');
    const questionValueInput = element(
      'input',
      'gtm-inspector-question-value'
    );
    questionValueInput.type = 'search';
    questionValueInput.placeholder = '输入题号';
    questionValueInput.autocomplete = 'off';
    questionValueInput.setAttribute('aria-label', '表格题号');
    questionHeaderSelect.hidden = true;
    questionHeading.hidden = true;
    const questionValueDisplay = element('span', 'gtm-inspector-question-display');
    questionValueDisplay.tabIndex = 0;
    questionValueDisplay.setAttribute('role','button');
    questionValueDisplay.setAttribute('aria-label','编辑题目号');
    questionValueDisplay.title = '双击编辑题目号';
    const questionJumpError = element('span','gtm-inspector-question-error');
    questionJumpError.setAttribute('role','status');questionJumpError.hidden = true;
    questionValueInput.hidden = true;
    const endQuestionEdit = async cancel => {
      if (!state.questionEditing || state.questionSearching) return;
      state.questionEditing = false;
      if (cancel || questionValueInput.value.trim() === currentQuestionValue()) {
        state.questionInputDirty = false;syncCurrentQuestionValue({force:true});
      } else if (!await searchTableQuestion()) {
        state.questionEditing = true;questionValueInput.focus();return;
      }
      questionValueInput.hidden = true;questionValueDisplay.hidden = false;questionJumpError.hidden = true;
    };
    const beginQuestionEdit = () => {
      if (state.questionSearching) return;
      state.questionEditing = true;questionJumpError.hidden = true;
      questionValueDisplay.hidden = true;questionValueInput.hidden = false;
      questionValueInput.focus();questionValueInput.select();
    };
    questionValueDisplay.addEventListener('pointerdown',event=>event.stopPropagation());
    questionValueDisplay.addEventListener('dblclick',beginQuestionEdit);
    questionValueDisplay.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();beginQuestionEdit();}});
    questionValueInput.addEventListener('blur',()=>endQuestionEdit(false));
    const questionPreviousButton = element(
      'button',
      'gtm-inspector-question-nav-button'
    );
    questionPreviousButton.type = 'button';
    questionPreviousButton.title = '上一题';
    questionPreviousButton.setAttribute('aria-label', '上一题');
    setButtonVisual(questionPreviousButton, 'ChevronLeft');
    questionPreviousButton.addEventListener('click', () => navigateQuestion(-1));
    const questionPositionLabel = element(
      'span',
      'gtm-inspector-question-position',
      '— / —'
    );
    questionPositionLabel.setAttribute('aria-live', 'polite');
    const questionNextButton = element(
      'button',
      'gtm-inspector-question-nav-button'
    );
    questionNextButton.type = 'button';
    questionNextButton.title = '下一题';
    questionNextButton.setAttribute('aria-label', '下一题');
    setButtonVisual(questionNextButton, 'ChevronRight');
    questionNextButton.addEventListener('click', () => navigateQuestion(1));
    questionHeaderSelect.addEventListener('change', () => {
      state.questionNavigationItems = [];
      state.questionNavigationKey = '';
      state.questionInputDirty = false;
      state.questionHeaderByTable[currentTableKey()] = (
        questionHeaderSelect.value
      );
      syncCurrentQuestionValue({ force: true });
      savePreferences();
      loadQuestionNavigation({ force: true });
    });
    questionValueInput.addEventListener('input', () => {
      state.questionInputDirty = true;
      questionValueInput.classList.remove('has-current-question');
    });
    questionValueInput.addEventListener('keydown', (event) => {
      if (!['Enter','Escape'].includes(event.key)) return;
      event.preventDefault();event.stopPropagation();
      endQuestionEdit(event.key === 'Escape');
    });
    questionSearch.append(
      questionHeading,
      questionHeaderSelect,
      questionValueInput,
      questionValueDisplay,
      questionJumpError,
      questionPreviousButton,
      questionPositionLabel,
      questionNextButton
    );
    state.questionFilters = globalThis.__cyleQuestionFiltersV1?.create({
      parent: questionSearch,
      getRow: () => state.error ? null : state.row,
      onChange: updateQuestionNavigationControls,
      onRefresh: async () => { await refreshRow(); await loadQuestionNavigation({ force: true }); },
      onWrite: writeGtCell
    });
    const search = element('input', 'gtm-inspector-search');
    search.type = 'search';
    search.placeholder = '搜索字段或积木';
    search.setAttribute('aria-label', '搜索表格内容');
    search.addEventListener('input', () => {
      state.query = search.value.trim().toLowerCase();
      renderColumns();
      renderCards();
    });

    const commandTrigger = makeCommandButton(
      '命令面板',
      'Search',
      openCommandPalette,
      'is-command-trigger'
    );
    commandTrigger.querySelector('.gtm-button-label')?.replaceChildren(
      document.createTextNode('命令')
    );
    commandTrigger.append(element('kbd', '', '⌘K'));

    const presetBar = element('div', 'gtm-inspector-presets');
    const columnsToggle = makeCommandButton(
      '收起组件库',
      'PanelLeftClose',
      () => toggleColumnsPane(),
      'is-compact'
    );
    const undoLayoutButton = makeCommandButton(
      '撤销布局',
      'Undo2',
      () => undoLayout(),
      'is-compact'
    );
    undoLayoutButton.disabled = true;
    const redoLayoutButton = makeCommandButton(
      '重做布局',
      'Redo2',
      () => redoLayout(),
      'is-compact'
    );
    redoLayoutButton.disabled = true;
    const arrangeCanvas = makeCommandButton(
      '自动整理',
      'LayoutGrid',
      () => autoArrangeCards(),
      'is-compact'
    );
    arrangeCanvas.title = '保留卡片尺寸，自动排列当前显示的卡片';
    const snapCanvas = makeCommandButton(
      '磁吸',
      'Magnet',
      () => toggleCanvasSnap(),
      'is-compact'
    );
    const zoomLabel = element('label', 'gtm-inspector-canvas-zoom');
    zoomLabel.append(iconNode('Scan', { size: 14 }));
    const zoomSelect = element('select', 'gtm-inspector-canvas-zoom-select');
    [
      [50, '50%'],
      [67, '67%'],
      [75, '75%'],
      [85, '85%'],
      [100, '100%'],
      [125, '125%'],
      [150, '150%']
    ].forEach(([value, label]) => {
      zoomSelect.add(new Option(label, String(value)));
    });
    zoomSelect.addEventListener('change', () => {
      setCanvasZoom(Number(zoomSelect.value) / 100);
    });
    zoomLabel.append(zoomSelect);
    const fitCanvas = makeCommandButton(
      '适应全部',
      'Scan',
      () => fitCanvasToViewport(),
      'is-compact'
    );
    fitCanvas.title = '缩放到能看到整个画布宽度';
    const taskPanelToggle = makeCommandButton(
      '任务信息',
      'ListChecks',
      () => toggleTaskPanel(),
      'is-compact'
    );
    presetBar.append(
      columnsToggle,
      undoLayoutButton,
      redoLayoutButton,
      arrangeCanvas,
      snapCanvas,
      zoomLabel,
      fitCanvas,
      taskPanelToggle
    );
    toolbar.append(questionSearch, presetBar,
      makeCommandButton('草稿中心', 'FileText', openDraftCenter), commandTrigger);

    const content = element('div', 'gtm-inspector-content');
    const columnsPane = element('aside', 'gtm-inspector-columns');
    const columnsHeading = element('div', 'gtm-inspector-pane-heading');
    const columnsTitle = element('div', 'gtm-inspector-pane-title');
    const columnCount = element('span', 'gtm-inspector-pane-count', '0');
    columnsTitle.append(
      iconNode('Boxes', { size: 16 }),
      element('strong', '', '组件库'),
      columnCount
    );
    columnsHeading.append(
      columnsTitle,
      makeIconButton(
        '隐藏显示列面板',
        'PanelLeftClose',
        () => toggleColumnsPane(true)
      )
    );
    const columnSearch = element('label', 'gtm-inspector-column-search');
    columnSearch.append(iconNode('Search', { size: 15 }), search);
    const columnPresets = element('div', 'gtm-inspector-column-presets');
    [
      ['全部', 'Layers3', 'all'],
      ['非空', 'ListChecks', 'nonempty'],
      ['媒体', 'Video', 'media'],
      ['清空', 'X', 'none']
    ].forEach(([label, icon, mode]) => {
      const button = makeCommandButton(
        label,
        icon,
        () => {
          selectColumns(mode);
          renderColumns();
          renderCards();
          renderSummaryStatus();
        },
        'is-filter'
      );
      columnPresets.append(button);
    });
    const columnList = element('div', 'gtm-inspector-column-list');
    columnsPane.append(
      columnsHeading,
      columnSearch,
      columnPresets,
      columnList
    );
    const cardsPane = element('main', 'gtm-inspector-cards');
    cardsPane.title = '拖动空白处平移画布；拖动卡片标题移动；按住 Alt 临时关闭磁吸';
    const taskPanelView = buildTaskPanel();
    content.append(columnsPane, cardsPane, taskPanelView.panel);

    inspectorWorkspace.append(toolbar, content);
    header.append(toolbar);
    const status = element('footer', 'gtm-inspector-status', '点击扩展图标开始');
    const commandPaletteView = buildCommandPalette();
    body.append(inspectorWorkspace, status);
    panel.append(header, body);
    root.append(panel, commandPaletteView.palette);
    document.documentElement.append(root);

    state.root = root;
    state.panel = panel;
    state.petMascot = globalThis.__cylePetMascotV1?.create({ root, panel, element: brandMark, assetUrl });
    state.body = body;
    state.title = title;
    state.subtitle = subtitle;
    state.status = status;
    state.search = search;
    state.columnList = columnList;
    state.cards = cardsPane;
    root.classList.add('cyle-page-shell');
    cardsPane.title = '';
    globalThis.__cyleMediaServiceV1.workspace.enabled = true;
    state.content = content;
    state.liveButton = live;
    state.refreshButton = refresh;
    state.questionHeaderSelect = questionHeaderSelect;
    state.questionValueInput = questionValueInput;
    state.questionValueDisplay = questionValueDisplay;
    state.questionJumpError = questionJumpError;
    state.questionPreviousButton = questionPreviousButton;
    state.questionNextButton = questionNextButton;
    state.questionPositionLabel = questionPositionLabel;
    state.minimizeButton = minimize;
    state.fullscreenButton = fullscreen;
    state.columnsPane = columnsPane;
    state.columnsToggleButton = columnsToggle;
    state.layoutUndoButton = undoLayoutButton;
    state.layoutRedoButton = redoLayoutButton;
    state.canvasZoomSelect = zoomSelect;
    state.canvasSnapButton = snapCanvas;
    state.workspaceManageButton = workspaceManage;
    state.columnCountLabel = columnCount;
    state.modeTabs = modeTabs;
    state.taskPanel = taskPanelView.panel;
    state.taskSheetLabel = taskPanelView.sheet;
    state.taskRowLabel = taskPanelView.row;
    state.taskQuestionLabel = taskPanelView.question;
    state.taskWorkspaceLabel = taskPanelView.workspace;
    state.taskBlocksLabel = taskPanelView.blocks;
    state.taskStorageLabel = taskPanelView.storageLabel;
    state.taskProgressBar = taskPanelView.progressBar;
    state.taskProgressLabel = taskPanelView.progressLabel;
    state.taskPanelToggleButton = taskPanelToggle;
    state.commandPalette = commandPaletteView.palette;
    state.commandPaletteInput = commandPaletteView.input;
    state.commandPaletteList = commandPaletteView.list;
    state.inspectorWorkspace = inspectorWorkspace;

    bindDragging(header);
    bindResizing(panel);
    applyLayout();
    renderLiveState();
    updateFullscreenButton();
    applyColumnsPaneVisibility();
    updateLayoutHistoryButtons();
    updateHarnessStatus();
    refreshWorkspaceProfiles();
    renderPageWorkspace();

    state.harnessUnsubscribe = globalThis.__annotationHarnessV1?.subscribe?.(() => {
      updateHarnessStatus();
      if (state.row) renderColumns();
    });

    if (typeof ResizeObserver === 'function') {
      let resizeTimer = 0;
      state.panelResizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          saveLayout();
          updateCanvasBounds();
        }, 180);
      });
      state.panelResizeObserver.observe(panel);
    }
  }

  async function writeGtCell({ row, cell, value, expectedValue, expectedDependencies = [], dropdownSelection = false }) {
    const targetRow = row || state.row;
    if (!targetRow || !cell) throw new Error('写回目标单元格无效');
    const payload = {
      expectedTableKey: targetRow.tableKey,
      sourceFrameId: targetRow.sourceFrameId,
      sheetId: targetRow.sheetId,
      sheetIndex: targetRow.sheetIndex,
      row: targetRow.rowIndex,
      col: cell.columnIndex,
      value,
      expectedHeader: cell.header || '',
      expectedValue,
      expectedDependencies,
      valueType: dropdownSelection ? 'dropdown' : cell.type || 'text',
      dropdownSelection
    };
    const writeback = globalThis.__cyleWritebackServiceV1;
    let response;
    if (writeback?.create) {
      const service = writeback.create({
        write: writeback.createChromeMessageWriter('WRITE_SHEET_CELL'),
        equals: (left, right) => (
          safeText(left).replace(/\r\n?/g, '\n')
            === safeText(right).replace(/\r\n?/g, '\n')
          || jsonEquivalent(left, right)
        )
      });
      const result = await service.writeAndVerify({
        operationId: writeback.createOperationId('cyle-cell'),
        target: payload,
        payload,
        value,
        expectedValue,
        preflight: false,
        requireReadback: true
      });
      if (!result.ok) throw new Error(result.error || '写回飞书失败');
      response = result.response || {
        ok: result.ok,
        verified: result.verified,
        actualValue: result.actualValue
      };
    } else {
      response = await chrome.runtime.sendMessage({
        type: 'WRITE_SHEET_CELL',
        payload: {
          ...payload,
          operationId: globalThis.crypto?.randomUUID?.()
            || `cyle-write-${Date.now()}-${Math.random().toString(36).slice(2)}`
        }
      });
      if (!response?.ok) throw new Error(response?.error || '写回飞书失败');
    }
    const hasActualValue = Object.prototype.hasOwnProperty.call(
      response,
      'actualValue'
    );
    const actualValue = safeText(response.actualValue).replace(/\r\n?/g, '\n');
    const expectedWrite = safeText(value).replace(/\r\n?/g, '\n');
    const valueConfirmed = hasActualValue && (
      actualValue === expectedWrite
      || jsonEquivalent(actualValue, expectedWrite)
    );
    if (response.verified !== true || !valueConfirmed) {
      throw new Error('飞书未确认内容已写入并通过回读校验');
    }
    const index = Number(cell.columnIndex);
    if (index >= 0 && Array.isArray(targetRow.values)) {
      targetRow.values[index] = value;
    }
    return response;
  }

  function toggleMinimized() {
    const restoreFullscreen = state.minimized && state.fullscreenBeforeMinimize;
    if (!state.minimized) state.fullscreenBeforeMinimize = state.fullscreen;
    if (!state.minimized && state.fullscreen) exitFullscreen();
    if (!state.minimized) saveLayout();
    state.minimized = !state.minimized;
    if (state.minimized) state.workspaceComposer?.mappingEditor?.close();
    if (state.minimized) globalThis.__cyleMediaServiceV1.workspace.coordinator.pause();
    state.panel.classList.toggle('is-minimized', state.minimized);
    setButtonVisual(
      state.minimizeButton,
      state.minimized ? 'Maximize2' : 'Minimize2'
    );
    state.minimizeButton.title = state.minimized ? '展开' : '最小化';
    state.minimizeButton.setAttribute('aria-label', state.minimizeButton.title);
    if (!state.minimized) applyLayout();
    if (restoreFullscreen) { state.fullscreenBeforeMinimize = false; enterFullscreen(); }
    setCanvasToolsActive();
  }

  function renderLiveState() {
    if (!state.liveButton) return;
    state.liveButton.disabled = false;
    state.liveButton.classList.toggle('is-active', state.live);
    state.liveButton.textContent = '跟随';
    state.liveButton.setAttribute('role','switch');
    state.liveButton.setAttribute('aria-label','自动跟随飞书选区');
    state.liveButton.setAttribute('aria-checked',String(state.live));
    state.liveButton.title = state.live
      ? '已自动跟随选区，点击暂停'
      : '已暂停跟随，点击恢复';
  }

  function updateHarnessStatus() {
    const diagnostics = globalThis.__annotationHarnessV1?.getDiagnostics?.();
    const blocks = diagnostics?.blocks || [];
    const ready = blocks.filter(({ state }) => state === 'ready').length;
    const loading = blocks.filter(({ state }) => state === 'loading').length;
    const failed = blocks.filter(({ state }) => state === 'error').length;
    if (state.harnessStatusButton) {
      state.harnessStatusButton.textContent = loading
        ? `装配中 ${loading}`
        : failed
          ? `积木异常 ${failed}`
          : `积木 ${ready}/${blocks.length}`;
      state.harnessStatusButton.classList.toggle('is-active', ready > 0);
      state.harnessStatusButton.classList.toggle('has-error', failed > 0);
      state.harnessStatusButton.title = blocks.map((block) => (
        `${block.name}：${block.state}`
      )).join('\n') || '当前没有注册积木';
    }
    updateTaskPanel();
  }

  async function setOpen(open) {
    await preferencesReady;
    createInspector();
    state.open = Boolean(open);
    state.root.hidden = !state.open;
    if (!state.open) {
      rememberTableView();
      state.questionFilters?.close();
      state.workspaceComposer?.mappingEditor?.close();
      deactivateCanvasTools();
      state.root.querySelectorAll('.gtm-inspector-video').forEach((video) => video.pause());
    }
    if (state.open) {
      applyLayout();
      await refreshRow();
    }
  }

  function normalizeRow(response) {
    const headers = Array.isArray(response.headers) ? response.headers : [];
    const columns = Array.isArray(response.columns)
      ? response.columns
      : headers.map((header, columnIndex) => ({
        key: columnKey(columnIndex),
        columnIndex,
        columnNumber: columnIndex + 1,
        columnLetter: '',
        header,
        label: header || `第 ${columnIndex + 1} 列`,
        duplicateIndex: 1,
        duplicateCount: 1,
        duplicate: false
      }));
    const cells = Array.isArray(response.cells)
      ? response.cells
      : (response.values || []).map((value, columnIndex) => ({
        key: `cell:${response.rowIndex}:${columnIndex}`,
        rowIndex: response.rowIndex,
        rowNumber: response.rowNumber,
        columnIndex,
        columnNumber: columnIndex + 1,
        columnLetter: columns[columnIndex]?.columnLetter || '',
        header: headers[columnIndex] || '',
        type: 'text',
        value: safeText(value),
        displayValue: safeText(value),
        rawValue: safeText(value),
        formula: '',
        url: '',
        metadata: null,
        attachments: [],
        dropdownOptions: [],
        isEmpty: !safeText(value).trim()
      }));
    return { ...response, headers, columns, cells };
  }

  function tableViewKey(row = state.row) {
    return row ? globalThis.__cyleFieldMappingV1.key(row) : '';
  }

  function rememberTableView() {
    if (!state.row || state.restoringTableView || state.loading) return;
    const selected = globalThis.__cyleSelectedModelVideoV1;
    const previous = state.tableViews[tableViewKey()] || {};
    const cell = selected?.tableKey === state.row.tableKey && selected.rowIndex === state.row.rowIndex
      ? state.row.cells.find(c => c.columnIndex === selected.columnIndex) : null;
    state.tableViews[tableViewKey()] = {
      page: state.activePageTool || 'human-eval',
      category: state.publicCategory || 'stem',
      hidden: Boolean(state.publicMaterialsHidden),
      width: state.sidebarWidth || null,
      model: cell ? {index:cell.columnIndex,header:cell.header} : previous.model || null,
    };
    savePreferences();
  }

  function restoreTableView(tableChanged, rowChanged) {
    const key = tableViewKey(), saved = state.tableViews[key];
    state.restoringTableView = true;
    try {
      const answers = state.row.cells.filter(cell => state.publicGroups?.get(cell.columnIndex)?.has('answer') &&
        (cell.url || cell.attachments?.length || [cell.value,cell.rawValue,cell.displayValue].some(v => v != null && String(v).trim())));
      if (tableChanged) {
        const definitions = canvasToolDefinitions();
        const legacyPage = currentWorkspaceRecipe().tools?.[0];
        const preferred = saved?.page || legacyPage || 'human-eval';
        state.activePageTool = definitions.some(d=>d.id===preferred) ? preferred : 'human-eval';
        state.visibleColumns.add(toolKey(state.activePageTool));
        state.publicCategory = ['stem','answer','media','document'].includes(saved?.category) ? saved.category : answers.length ? 'answer' : 'stem';
        state.publicMaterialsHidden = saved?.hidden === true;
        state.sidebarWidth = Number.isFinite(saved?.width) && saved.width >= 240 ? saved.width : null;
        state.applySidebarWidth?.(state.sidebarWidth, false);
        applyPublicMaterialsVisibility();
      }
      if(state.publicCategory==='answer' && !answers.length) state.publicCategory='stem';
      const selected=globalThis.__cyleSelectedModelVideoV1;
      const valid=selected?.tableKey===state.row.tableKey && selected.rowIndex===state.row.rowIndex && answers.some(c=>c.columnIndex===selected.columnIndex);
      if (tableChanged || rowChanged || !valid) {
        const exact=answers.find(c=>c.columnIndex===saved?.model?.index && c.header===saved.model.header);
        const sameHeader=answers.filter(c=>c.header===saved?.model?.header);
        const model=exact || (sameHeader.length===1?sameHeader[0]:null) || answers[0];
        globalThis.__cyleSelectedModelVideoV1 = model ? {tableKey:state.row.tableKey,rowIndex:state.row.rowIndex,columnIndex:model.columnIndex} : null;
        state.notifyInitialModel = true;
      }
      const model=state.row.cells.find(c=>c.columnIndex===globalThis.__cyleSelectedModelVideoV1?.columnIndex);
      state.tableViews[key]={page:state.activePageTool,category:state.publicCategory,hidden:state.publicMaterialsHidden,width:state.sidebarWidth,model:model?{index:model.columnIndex,header:model.header}:null};
      savePreferences();
    } finally { state.restoringTableView=false; }
  }

  function restoreVisibility() {
    const columns = state.row?.columns || [];
    const saved = state.visibilityByTable[currentTableKey()];
    if (Array.isArray(saved)) {
      const available = new Set([
        ...columns.map(({ columnIndex }) => columnKey(columnIndex)),
        ...canvasToolDefinitions().map(({ key, id }) => key || toolKey(id))
      ]);
      state.visibleColumns = new Set(saved.filter((key) => available.has(key)));
      return;
    }
    const candidates = (state.row?.cells || [])
      .filter(({ isEmpty }) => !isEmpty)
      .map((cell) => {
        const textLength = safeText(
          cell.displayValue ?? cell.rawValue ?? cell.value
        ).length;
        const media = MEDIA_TYPES.has(cell.type);
        const structured = cell.type === 'json' || Boolean(cell.formula);
        return {
          cell,
          score: (
            media ? 1000 : 0
          ) + (
            structured ? 500 : 0
          ) + Math.min(300, textLength)
        };
      })
      .sort((left, right) => (
        right.score - left.score
        || left.cell.columnIndex - right.cell.columnIndex
      ))
      .slice(0, 4)
      .map(({ cell }) => columnKey(cell.columnIndex));
    state.visibleColumns = new Set([...candidates, toolKey('human-eval')]);
    state.visibilityByTable[currentTableKey()] = [...state.visibleColumns];
    state.workspaceRecipeByTable[currentTableKey()] = 'human-eval';
    savePreferences();
  }

  function persistVisibility() {
    state.visibilityByTable[currentTableKey()] = [...(state.visibleColumns || [])];
    savePreferences();
  }

  function currentWorkspaceRecipe() {
    const id = state.workspaceRecipeByTable[currentTableKey()] || 'custom';
    const profiles = workspaceProfiles();
    const found = profiles.find((workspace) => workspace.id === id);
    if (found) {
      return {
        ...found,
        label: found.name || found.label,
        description: found.description || ''
      };
    }
    return {
      id: 'custom',
      name: '自由组合',
      label: '自由组合',
      description: '自行选择字段和工具积木。',
      tools: null,
      fields: { mode: 'preserve', keys: [] },
      layout: { autoArrange: false, snap: true, zoom: 1 },
      builtin: true
    };
  }

  async function applyWorkspaceRecipe(recipeId) {
    const profile = workspaceProfiles().find(({ id }) => id === recipeId)
      || (recipeId === 'custom' ? currentWorkspaceRecipe() : null);
    const recipe = profile
      ? {
        ...profile,
        label: profile.name || profile.label || profile.id,
        description: profile.description || ''
      }
      : null;
    if (!recipe || !state.row) return;
    const before = layoutSnapshot();
    const toolKeys = new Set(
      canvasToolDefinitions().map(({ key, id }) => key || toolKey(id))
    );
    const visibleFields = [...(state.visibleColumns || [])].filter(
      (key) => !toolKeys.has(key)
    );
    const fields = recipe.fields || { mode: 'preserve', keys: [] };
    let nextFields = visibleFields;
    if (fields.mode === 'all') {
      nextFields = state.row.columns.map(({ columnIndex }) => (
        columnKey(columnIndex)
      ));
    } else if (fields.mode === 'nonempty') {
      nextFields = state.row.cells
        .filter(({ isEmpty }) => !isEmpty)
        .map(({ columnIndex }) => columnKey(columnIndex));
    } else if (fields.mode === 'media') {
      nextFields = state.row.cells
        .filter(({ type, isEmpty }) => !isEmpty && MEDIA_TYPES.has(type))
        .map(({ columnIndex }) => columnKey(columnIndex));
    } else if (fields.mode === 'selected') {
      const allowed = new Set(
        state.row.columns.map(({ columnIndex }) => columnKey(columnIndex))
      );
      nextFields = (fields.keys || []).filter((key) => allowed.has(key));
    }
    const recipeTools = Array.isArray(recipe.tools) ? recipe.tools : null;
    const nextVisible = recipeTools === null
      ? [...(state.visibleColumns || [])]
      : [...nextFields, ...recipeTools.map(toolKey)];
    // Public materials belong to the row, never to a tool recipe.
    state.visibleColumns = new Set([...visibleFields, ...nextVisible.filter(key => toolKeys.has(key))]);
    state.visibilityByTable[currentTableKey()] = [...state.visibleColumns];
    state.activePageTool = recipeTools?.[0] || state.activePageTool;
    rememberTableView();
    state.workspaceRecipeByTable[currentTableKey()] = recipe.id;
    if (recipe.layout) {
      tableCardLayout().snap = recipe.layout.snap !== false;
      tableCardLayout().zoom = Math.min(
        1.5,
        Math.max(0.5, Number(recipe.layout.zoom) || 1)
      );
    }
    if (
      fields.mode === 'selected'
      || Array.isArray(recipeTools) && recipeTools.length
    ) {
      const preferredOrder = [
        ...(fields.mode === 'selected' ? nextFields : []),
        ...(recipeTools || []).map(toolKey)
      ];
      const currentOrder = tableCardLayout().order || [];
      tableCardLayout().order = [
        ...preferredOrder,
        ...currentOrder.filter((key) => !preferredOrder.includes(key))
      ];
    }
    reconcileCardLayout();
    commitLayoutHistory(`切换到${recipe.label}`, before);
    syncWorkspaceNavigation();
    renderColumns();
    renderCards();
    if (!state.pageTools && recipe.layout?.autoArrange) {
      requestAnimationFrame(() => autoArrangeCards());
    }
    renderSummaryStatus();
    updateTaskPanel();
    if (Array.isArray(recipeTools) && recipeTools.length) {
      const primaryTool = canvasToolDefinitions().find(({ id }) => (
        id === recipeTools[0]
      ));
      if (primaryTool) {
        requestAnimationFrame(() => focusCanvasTool(primaryTool));
      }
    }
    savePreferences();
    renderStatus(`已切换到“${recipe.label}”：${recipe.description}`, 'success');
  }

  function setColumnVisible(columnIndex, visible, label = '') {
    recordLayoutMutation(
      label || (visible ? '显示卡片' : '隐藏卡片'),
      () => {
        const key = columnKey(columnIndex);
        if (visible) {
          state.visibleColumns.add(key);
          const cell = state.row?.cells?.find((item) => (
            Number(item.columnIndex) === Number(columnIndex)
          ));
          const layout = tableCardLayout();
          const saved = layout.cards[key] || {};
          const zoom = canvasZoom();
          const viewportLeft = (state.cards?.scrollLeft || 0) / zoom;
          const viewportTop = (state.cards?.scrollTop || 0) / zoom;
          const viewportWidth = (state.cards?.clientWidth || 720) / zoom;
          const viewportHeight = (state.cards?.clientHeight || 520) / zoom;
          const width = Number(saved.width) >= CARD_MIN_WIDTH
            ? Number(saved.width)
            : defaultCardWidth(cell, viewportWidth);
          const height = Math.max(
            CARD_MIN_HEIGHT,
            Number(saved.cardHeight) || 220
          );
          const x = Number(saved.x);
          const y = Number(saved.y);
          const visibleInViewport = (
            Number.isFinite(x)
            && Number.isFinite(y)
            && x + width > viewportLeft + 24
            && x < viewportLeft + viewportWidth - 24
            && y + height > viewportTop + 24
            && y < viewportTop + viewportHeight - 24
          );
          const cascade = Math.min(
            84,
            [...state.visibleColumns].filter((item) => item !== key).length * 18
          );
          layout.cards[key] = {
            ...saved,
            ...(!visibleInViewport ? {
              x: Math.max(
                CANVAS_PADDING,
                Math.round(viewportLeft + CANVAS_PADDING + cascade)
              ),
              y: Math.max(
                CANVAS_PADDING,
                Math.round(viewportTop + CANVAS_PADDING + cascade)
              )
            } : {}),
            width: Math.round(width),
            z: ++state.canvasZCounter
          };
        } else {
          state.visibleColumns.delete(key);
        }
        state.visibilityByTable[currentTableKey()] = [...state.visibleColumns];
      }
    );
  }

  function focusCanvasColumn(columnIndex) {
    const key = columnKey(columnIndex);
    if (state.pageFields) {
      state.pageFields.get(key)?.card.scrollIntoView({ block: 'nearest' });
      return;
    }
    requestAnimationFrame(() => {
      const card = state.canvas?.querySelector(
        `.gtm-inspector-card[data-card-key="${CSS.escape(key)}"]`
      );
      if (!card || !state.cards) return;
      const zoom = canvasZoom();
      const left = (Number.parseFloat(card.style.left) || 0) * zoom;
      const top = (Number.parseFloat(card.style.top) || 0) * zoom;
      const right = left + card.offsetWidth * zoom;
      const bottom = top + card.offsetHeight * zoom;
      const viewLeft = state.cards.scrollLeft;
      const viewTop = state.cards.scrollTop;
      const viewRight = viewLeft + state.cards.clientWidth;
      const viewBottom = viewTop + state.cards.clientHeight;
      if (
        left < viewLeft
        || right > viewRight
        || top < viewTop
        || bottom > viewBottom
      ) {
        state.cards.scrollTo({
          left: Math.max(0, left - 16),
          top: Math.max(0, top - 16),
          behavior: 'smooth'
        });
      }
      card.classList.add('is-located');
      setTimeout(() => card.classList.remove('is-located'), 900);
    });
  }

  async function refreshRow() {
    await preferencesReady;
    if (!state.open) return;
    if (state.loading) {
      state.refreshPending = true;
      return;
    }
    state.refreshPending = false;
    const token = ++state.requestToken;
    state.loading = true;
    state.error = '';
    renderStatus('正在读取当前行…', 'loading');
    state.panel?.classList.add('is-loading');
    try {
      let response = await chrome.runtime.sendMessage({ type: 'READ_ACTIVE_ROW' });
      if (
        !response?.ok
        && /Receiving end does not exist|Could not establish connection/i.test(
          response?.error || ''
        )
      ) {
        await new Promise((resolve) => setTimeout(resolve, 180));
        response = await chrome.runtime.sendMessage({ type: 'READ_ACTIVE_ROW' });
      }
      if (token !== state.requestToken) return;
      if (!response?.ok) throw new Error(response?.error || '读取当前行失败');
      const previousTable = currentTableKey();
      const previousRow = state.row;
      const previousColumns = state.row?.headers?.join('\u0001') || '';
      const nextRow = normalizeRow(response);
      if (previousRow && rowIdentity(previousRow) !== rowIdentity(nextRow)) {
        state.openDropdownKey = '';
      }
      if (
        previousRow
        && rowIdentity(previousRow) === rowIdentity(nextRow)
        && hasEditorsForRow(previousRow)
      ) {
        nextRow.cells.forEach((cell) => {
          const editor = state.cellEditors.get(
            editorKeyFor(previousRow, cell.columnIndex)
          );
          if (!editor) return;
          const previousCell = previousRow.cells.find(({ columnIndex }) => (
            columnIndex === cell.columnIndex
          ));
          if (previousCell) Object.assign(cell, previousCell);
        });
      }
      let publicConfig = null;
      state.questionIdentityHeader = "";
      try {
        publicConfig = await globalThis.__cyleFieldMappingV1.load(nextRow);
        state.publicGroups = publicConfig ? globalThis.__cyleFieldMappingV1.publicGroups(nextRow, publicConfig) : new Map();
        state.publicMappingError = publicConfig ? '' : '请先在组装中保存题库映射。';
        state.questionIdentityHeader = publicConfig ? globalThis.__cyleFieldMappingV1.read(nextRow,publicConfig).find(f=>f.isIdentity)?.source.header : '';
      } catch (error) { state.publicGroups = new Map(); state.publicMappingError = error.message; }
      if (token !== state.requestToken) return;
      if (!previousRow || rowIdentity(previousRow) !== rowIdentity(nextRow)) globalThis.__cyleSelectedModelVideoV1 = null;
      state.row = nextRow;
      state.workspaceComposer?.setRow();
      state.rowRevision += 1;
      updateQuestionSearchControls({
        forceQuestionValue: (
          !previousRow
          || rowIdentity(previousRow) !== rowIdentity(nextRow)
        )
      });
      const nextTable = currentTableKey();
      const nextColumns = state.row.headers.join('\u0001');
      ensureLayoutHistory();
      if (
        !state.visibleColumns
        || previousTable !== nextTable
        || previousColumns !== nextColumns
      ) {
        restoreVisibility();
      }
      restoreTableView(!previousRow || previousTable !== nextTable, !previousRow || rowIdentity(previousRow) !== rowIdentity(nextRow));
      if (publicConfig && !state.publicMappingError) {
        const tools = [...(state.visibleColumns || [])].filter(key => String(key).startsWith('tool:'));
        state.visibleColumns = new Set([...tools, ...state.publicGroups.keys()].map(key => typeof key === 'number' ? columnKey(key) : key));
      }
      reconcileCardLayout();
      applyColumnsPaneVisibility();
      updateHarnessStatus();
      render();
      if (state.notifyInitialModel) {
        state.notifyInitialModel = false;
        document.dispatchEvent(new CustomEvent('cyle:model-video-selected'));
      }
      loadQuestionNavigation();
    } catch (error) {
      if (token !== state.requestToken) return;
      state.questionFilters?.setRow(null);
      state.error = error.message || '读取当前行失败';
      state.workspaceComposer?.setRow();
      renderError(state.error);
    } finally {
      if (token === state.requestToken) {
          state.loading = false;
          state.panel?.classList.remove('is-loading');
          if (!state.error) restoreDraftReturn().catch(() => {});
        if (state.refreshPending && state.open) {
          state.refreshPending = false;
          clearTimeout(state.refreshTimer);
          state.refreshTimer = setTimeout(() => refreshRow(), 40);
        }
      }
    }
  }

  function scheduleRefresh() {
    if (!state.open || !state.live) return;
    if (state.loading) {
      state.refreshPending = true;
      return;
    }
    clearTimeout(state.refreshTimer);
    state.refreshPending = true;
    state.refreshTimer = setTimeout(() => refreshRow(), 160);
  }

  function selectColumns(mode) {
    if (!state.row) return;
    const columns = state.row.columns || [];
    const cells = state.row.cells || [];
    const label = {
      all: '显示全部列',
      none: '隐藏全部列',
      media: '只显示媒体列',
      nonempty: '只显示非空列'
    }[mode] || '批量调整显示列';
    recordLayoutMutation(label, () => {
      const selectedTools = [...(state.visibleColumns || [])].filter((key) => (
        String(key).startsWith('tool:')
      ));
      if (mode === 'all') {
        state.visibleColumns = new Set(
          [
            ...selectedTools,
            ...columns.map(({ columnIndex }) => columnKey(columnIndex))
          ]
        );
      } else if (mode === 'none') {
        state.visibleColumns = new Set(selectedTools);
      } else if (mode === 'media') {
        state.visibleColumns = new Set(
          [
            ...selectedTools,
            ...cells
              .filter(({ type }) => MEDIA_TYPES.has(type))
              .map(({ columnIndex }) => columnKey(columnIndex))
          ]
        );
      } else {
        state.visibleColumns = new Set(
          [
            ...selectedTools,
            ...cells
              .filter(({ isEmpty }) => !isEmpty)
              .map(({ columnIndex }) => columnKey(columnIndex))
          ]
        );
      }
      state.visibilityByTable[currentTableKey()] = [...state.visibleColumns];
    });
    renderColumns();
    renderCards();
    renderSummaryStatus();
  }

  function columnMatchesQuery(column, cell) {
    if (!state.query) return true;
    return [
      column.header,
      column.label,
      column.columnLetter,
      column.columnNumber,
      cell?.displayValue,
      cell?.rawValue,
      cell?.formula,
      cell?.type
    ].some((value) => safeText(value).toLowerCase().includes(state.query));
  }

  function toolMatchesQuery(definition) {
    if (!state.query) return true;
    return [
      definition.title,
      definition.description,
      definition.badge,
      ...(definition.keywords || [])
    ].some((value) => safeText(value).toLowerCase().includes(state.query));
  }

  function setToolVisible(definition, visible) {
    const key = definition.key || toolKey(definition);
    const visibleToolCount = canvasToolDefinitions().filter(({ key: itemKey, id }) => (
      state.visibleColumns?.has(itemKey || toolKey(id))
    )).length;
    recordLayoutMutation(
      `${visible ? '添加' : '隐藏'}工具 ${definition.title}`,
      () => {
        if (visible) {
          state.visibleColumns.add(key);
          const layout = tableCardLayout();
          const saved = layout.cards[key] || {};
          if (!Number.isFinite(Number(saved.x)) || !Number.isFinite(Number(saved.y))) {
            const zoom = canvasZoom();
            const cascadeOffset = Math.min(108, visibleToolCount * 36);
            layout.cards[key] = {
              ...saved,
              x: Math.max(
                CANVAS_PADDING,
                Math.round(
                  (state.cards?.scrollLeft || 0) / zoom
                  + CANVAS_PADDING
                  + cascadeOffset
                )
              ),
              y: Math.max(
                CANVAS_PADDING,
                Math.round(
                  (state.cards?.scrollTop || 0) / zoom
                  + CANVAS_PADDING
                  + cascadeOffset
                )
              ),
              width: Math.max(
                Number(definition.minimumWidth) || 560,
                Number(definition.defaultWidth) || 960
              ),
              cardHeight: definition.autoHeight
                ? 0
                : Math.max(
                  Number(definition.minimumHeight) || 420,
                  Number(saved.cardHeight) || Number(definition.defaultHeight) || 760
                ),
              userSizedHeight: false,
              z: ++state.canvasZCounter
            };
          }
        } else {
          state.visibleColumns.delete(key);
        }
        state.visibilityByTable[currentTableKey()] = [...state.visibleColumns];
      }
    );
    state.workspaceRecipeByTable[currentTableKey()] = 'custom';
    savePreferences();
    if (!visible) {
      state.toolInstances.get(definition.id)?.instance?.setActive?.(false);
    }
  }

  function focusCanvasTool(definition) {
    state.activePageTool = definition.id;
    rememberTableView();
    if (state.pageTools) {
      state.visibleColumns.add(definition.key || toolKey(definition));
      renderCards();
      return;
    }
    const key = definition.key || toolKey(definition);
    if (!state.visibleColumns?.has(key)) {
      setToolVisible(definition, true);
      renderColumns();
      renderCards();
    }
    requestAnimationFrame(() => {
      const card = state.canvas?.querySelector(
        `.gtm-inspector-card[data-card-key="${CSS.escape(key)}"]`
      );
      if (!card || !state.cards) return;
      setCardLayout(
        key,
        { z: ++state.canvasZCounter },
        `定位工具 ${definition.title}`
      );
      card.style.zIndex = String(state.canvasZCounter);
      const zoom = canvasZoom();
      state.cards.scrollTo({
        left: Math.max(0, (Number.parseFloat(card.style.left) || 0) * zoom - 16),
        top: Math.max(0, (Number.parseFloat(card.style.top) || 0) * zoom - 16),
        behavior: 'smooth'
      });
      card.classList.add('is-located');
      setTimeout(() => card.classList.remove('is-located'), 900);
    });
  }

  function renderColumns() {
    if (!state.columnList) return;
    state.columnList.replaceChildren();
    if (!state.row) return;
    const tools = canvasToolDefinitions().filter(toolMatchesQuery);
    if (tools.length) {
      state.columnList.append(element(
        'div',
        'gtm-inspector-list-section-title',
        '工具组件'
      ));
      tools.forEach((definition) => {
        const key = definition.key || toolKey(definition);
        const option = element(
          'div',
          'gtm-inspector-column-option gtm-inspector-tool-option'
        );
        const input = element('input');
        input.type = 'checkbox';
        input.checked = state.visibleColumns?.has(key) || false;
        input.setAttribute('aria-label', `显示或隐藏 ${definition.title}`);
        input.addEventListener('change', () => {
          setToolVisible(definition, input.checked);
          renderCards();
          renderSummaryStatus();
          if (input.checked) focusCanvasTool(definition);
        });
        const icon = element('span', 'gtm-inspector-tool-icon');
        icon.append(iconNode('Box', { size: 15 }));
        const nameButton = element(
          'button',
          'gtm-inspector-tool-name',
          definition.title
        );
        nameButton.type = 'button';
        nameButton.title = '点击添加或定位到画布中的工具';
        nameButton.addEventListener('click', () => focusCanvasTool(definition));
        const description = element(
          'span',
          'gtm-inspector-column-type',
          definition.description
        );
        const block = globalThis.__annotationHarnessV1?.listBlocks?.()
          .find(({ id }) => id === definition.id);
        const stateLabel = element(
          'span',
          `gtm-inspector-block-state is-${block?.state || 'registered'}`,
          block?.state === 'ready'
            ? '已装配'
            : block?.state === 'loading'
              ? '装配中'
              : block?.state === 'error'
                ? '异常'
                : '按需'
        );
        option.append(input, icon, nameButton, description, stateLabel);
        state.columnList.append(option);
      });
    }
    state.columnList.append(element(
      'div',
      'gtm-inspector-list-section-title is-table-fields',
      '表格字段'
    ));
    const cellsByColumn = new Map(
      state.row.cells.map((cell) => [cell.columnIndex, cell])
    );
    let visibleCount = 0;
    state.row.columns.forEach((column) => {
      const cell = cellsByColumn.get(column.columnIndex);
      if (!columnMatchesQuery(column, cell)) return;
      visibleCount += 1;
      const label = element('label', 'gtm-inspector-column-option');
      const input = element('input');
      input.type = 'checkbox';
      input.checked = state.visibleColumns?.has(columnKey(column.columnIndex)) || false;
      input.setAttribute(
        'aria-label',
        `显示或隐藏 ${column.header || column.columnLetter}`
      );
      input.addEventListener('change', () => {
        setColumnVisible(
          column.columnIndex,
          input.checked,
          `${input.checked ? '显示' : '隐藏'} ${column.header || column.columnLetter}`
        );
        renderCards();
        renderSummaryStatus();
        if (input.checked) focusCanvasColumn(column.columnIndex);
      });
      const coordinate = element(
        'span',
        'gtm-inspector-column-coordinate',
        column.columnLetter || String(column.columnNumber)
      );
      const name = element(
        'span',
        'gtm-inspector-column-name',
        column.header || `第 ${column.columnNumber} 列`
      );
      if (column.duplicate) {
        name.textContent += ` · 同名 ${column.duplicateIndex}/${column.duplicateCount}`;
        label.classList.add('has-duplicate');
      }
      const type = element(
        'span',
        'gtm-inspector-column-type',
        isDropdownCell(cell) ? '下拉选项' : displayType(cell?.type)
      );
      if (cell?.isEmpty) label.classList.add('is-empty');
      label.append(input, coordinate, name, type);
      state.columnList.append(label);
    });
    if (!visibleCount) {
      state.columnList.append(element('div', 'gtm-inspector-empty-small', '没有匹配的列'));
    }
    if (state.columnCountLabel) {
      state.columnCountLabel.textContent = String(
        visibleCount + tools.length
      );
    }
  }

  function createLink(url, label = '打开链接') {
    const anchor = element('a', 'gtm-inspector-link', label);
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function editableCell(cell) {
    if (!cell || cell.formula || Array.isArray(cell.attachments) && cell.attachments.length) {
      return false;
    }
    if (isPeopleCell(cell)) return false;
    if (cell.dropdownMultiple === true) return false;
    // Some Feishu dropdown chips are exposed as rich text, but only allow this
    // path when the underlying value is already a scalar, not a rich object.
    if (cell.type === 'rich-text' && !cell.url && fieldDropdownOptions(cell).length
      && originalCellText(cell) === safeText(cell.displayValue)) return true;
    return ['text', 'number', 'boolean', 'date', 'json']
      .includes(cell.type);
  }

  function fieldDropdownOptions(cell) {
    return fieldDropdownItems(cell).map(({ value }) => value);
  }

  function fieldDropdownItems(cell) {
    const items = Array.isArray(cell?.dropdownItems)
      ? cell.dropdownItems
      : (cell?.dropdownOptions || []).map((value) => ({
        value,
        label: value,
        backgroundColor: '',
        textColor: ''
      }));
    const seen = new Set();
    return items.flatMap((item) => {
      const value = safeText(item?.value ?? item?.label);
      const label = safeText(item?.label ?? item?.value);
      if (!value || !label || seen.has(value)) return [];
      seen.add(value);
      return [{
        value,
        label,
        backgroundColor: safeText(item?.backgroundColor),
        textColor: safeText(item?.textColor)
      }];
    });
  }

  function isPeopleCell(cell) {
    if (!cell) return false;
    if (cell.dropdownKind === 'people') return true;
    const header = safeText(cell.header).trim();
    if (
      /(?:姓名|人名|人员|负责人|标注人|审核人|联系人|成员|员工|assignee|owner|contact|member)/i
        .test(header)
    ) return true;
    const source = safeText(cell.rawValue || cell.value);
    return Boolean(
      /"(?:userId|user_id|openId|open_id|employeeId|avatarUrl|email)"\s*:/.test(source)
    );
  }

  function isDropdownCell(cell) {
    return editableCell(cell)
      && cell.dropdownMultiple !== true
      && cell.dropdownKind !== 'people'
      && fieldDropdownItems(cell).length > 0;
  }

  function editorKey(cell) {
    return editorKeyFor(state.row, cell.columnIndex);
  }

  function editorKeyFor(row, columnIndex) {
    return `${rowIdentity(row)}::cell:${Number(columnIndex)}`;
  }

  function hasEditorsForRow(row = state.row) {
    const prefix = `${rowIdentity(row)}::cell:`;
    return [...state.cellEditors.keys()].some((key) => key.startsWith(prefix));
  }

  function originalCellText(cell) {
    return safeText(cell?.rawValue ?? cell?.value ?? cell?.displayValue);
  }

  function formattedEditorValue(cell, value = originalCellText(cell)) {
    if (cell.type === 'date') return dateEditorValue(cell);
    if (cell.type !== 'json') return safeText(value);
    try {
      return JSON.stringify(JSON.parse(safeText(value)), null, 2);
    } catch (_error) {
      return safeText(value);
    }
  }

  function jsonEquivalent(left, right) {
    try {
      return JSON.stringify(JSON.parse(safeText(left)))
        === JSON.stringify(JSON.parse(safeText(right)));
    } catch (_error) {
      return safeText(left) === safeText(right);
    }
  }

  function startCellEditor(cell) {
    if (!editableCell(cell)) return;
    const value = isDropdownCell(cell) ? originalCellText(cell) : formattedEditorValue(cell);
    const layout = tableCardLayout();
    const layoutKey = columnKey(cell.columnIndex);
    layout.cards[layoutKey] = {
      ...(layout.cards[layoutKey] || {}),
      z: ++state.canvasZCounter
    };
    savePreferences();
    state.cellEditors.set(editorKey(cell), {
      baseline: originalCellText(cell),
      value,
      displayBaseline: cell.type === 'date'
        ? dateEditorValue(cell)
        : safeText(value),
      marks: storedTextMarks(cell, displayTextForCell(cell))
    });
    renderCards();
  }

  function cancelCellEditor(cell) {
    state.cellEditors.delete(editorKey(cell));
    renderCards();
  }

  function persistEditorMarks(cell, text, editor, row = state.row) {
    const key = textMarkKey(cell, row);
    const marks = normalizeTextMarks(editor?.marks || []).filter(
      ({ start, end }) => start >= 0 && end <= text.length && end > start
    );
    if (marks.length) {
      state.textMarksByCell[key] = {
        fingerprint: textFingerprint(text),
        marks
      };
    } else {
      delete state.textMarksByCell[key];
    }
    state.annotationOpenCards.delete(key);
    if (state.textSelection?.key === key) state.textSelection = null;
    savePreferences();
  }

  async function saveCellEditor(cell, editor) {
    if (!editor || !state.row || editor.saving) return;
    if (state.cellEditors.get(editorKey(cell)) !== editor) return;
    let value = safeText(editor.value);
    let displayValue = value;
    const dropdown = isDropdownCell(cell);
    if (dropdown && cell.dropdownMultiple) {
      renderStatus('多选字段请在飞书原表修改，避免丢失已选项', 'warning');
      return;
    }
    if (dropdown && value !== editor.baseline
      && !fieldDropdownOptions(cell).includes(value)
      && !(value === '' && cell.dropdownAllowBlank !== false)) {
      renderStatus('请从当前字段的飞书下拉选项中选择', 'error');
      return;
    }
    if (!dropdown && cell.type === 'json') {
      try {
        value = JSON.stringify(JSON.parse(value), null, 2);
        if (value !== editor.value) {
          editor.marks = rebaseTextMarks(editor.marks, editor.value, value);
        }
      } catch (error) {
        renderStatus(`JSON 无法保存：${error.message}`, 'error');
        return;
      }
    }
    if (!dropdown && cell.type === 'boolean' && !/^(?:true|false)$/i.test(value.trim())) {
      renderStatus('布尔值只能填写 true 或 false', 'error');
      return;
    }
    if (!dropdown && cell.type === 'number' && value.trim() && !Number.isFinite(Number(value))) {
      renderStatus('数字列必须填写有效数字', 'error');
      return;
    }
    if (!dropdown && cell.type === 'date') {
      const serial = dateSerialValue(value);
      if (serial === null) {
        renderStatus('日期必须是有效的日期或日期时间', 'error');
        return;
      }
      displayValue = value;
      value = serial;
    }
    const unchanged = !dropdown && cell.type === 'json'
      ? jsonEquivalent(value, editor.baseline)
      : value === editor.baseline;
    if (unchanged) {
      persistEditorMarks(
        cell,
        cell.type === 'date' ? displayValue : formattedEditorValue(cell, value),
        editor
      );
      state.cellEditors.delete(editorKey(cell));
      renderCards();
      renderStatus(
        `${cell.header || cell.columnLetter} 内容未变，本地文字颜色已保存`,
        'success'
      );
      return;
    }
    const targetRow = state.row;
    const targetIdentity = rowIdentity(targetRow);
    const targetEditorKey = editorKeyFor(targetRow, cell.columnIndex);
    editor.saving = true;
    renderCards();
    try {
      await writeGtCell({
        row: targetRow,
        cell,
        value,
        expectedValue: editor.baseline,
        dropdownSelection: dropdown
      });
      persistEditorMarks(
        cell,
        cell.type === 'date' ? displayValue : value,
        editor,
        targetRow
      );
      if (rowIdentity(state.row) === targetIdentity) {
        const currentCell = state.row.cells.find(({ columnIndex }) => (
          columnIndex === cell.columnIndex
        )) || cell;
        currentCell.value = cell.type === 'date' ? displayValue : value;
        currentCell.rawValue = value;
        currentCell.displayValue = cell.type === 'date' ? displayValue : value;
        currentCell.isEmpty = !value.trim();
        if (Array.isArray(state.row.values)) {
          state.row.values[cell.columnIndex] = (
            cell.type === 'date' ? displayValue : value
          );
        }
      }
      if (rowIdentity(state.row) === targetIdentity) state.rowRevision += 1;
      if (state.cellEditors.get(targetEditorKey) === editor) {
        state.cellEditors.delete(targetEditorKey);
      }
      renderCards();
      renderColumns();
      renderSummaryStatus();
      renderStatus(`已写回 ${cell.columnLetter}${targetRow.rowNumber} · ${cell.header}`, 'success');
    } catch (error) {
      editor.saving = false;
      renderCards();
      renderStatus(error.message || '写回单元格失败', 'error');
    }
  }

  function appendCellEditor(container, cell, editor) {
    if (isDropdownCell(cell)) {
      appendDropdownField(container, cell, editor);
      return;
    }
    const workspace = element('div', 'gtm-inspector-editor-workspace');
    const textarea = element(
      cell.type === 'date' ? 'input' : 'textarea',
      `gtm-inspector-cell-editor${cell.type === 'date' ? ' is-date' : ''}`
    );
    if (cell.type === 'date') {
      textarea.type = dateEditorInputType(cell);
      if (textarea.type === 'datetime-local') textarea.step = '1';
    }
    textarea.value = safeText(editor.value);
    textarea.disabled = Boolean(editor.saving);
    textarea.spellcheck = false;
    textarea.addEventListener('input', () => {
      if (editor.value !== textarea.value) {
        editor.marks = rebaseTextMarks(
          editor.marks,
          editor.value,
          textarea.value
        );
      }
      editor.value = textarea.value;
      renderEditorColorPreview(preview, cell, editor);
    });
    const rememberEditorSelection = () => {
      editor.selectionStart = textarea.selectionStart;
      editor.selectionEnd = textarea.selectionEnd;
    };
    textarea.addEventListener('select', rememberEditorSelection);
    textarea.addEventListener('keyup', rememberEditorSelection);
    textarea.addEventListener('mouseup', rememberEditorSelection);
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelCellEditor(cell);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveCellEditor(cell, editor);
      }
    });
    const editorMarks = element('div', 'gtm-inspector-editor-mark-toolbar');
    editorMarks.append(element(
      'span',
      'gtm-inspector-mark-hint',
      '选中文字后标色'
    ));
    TEXT_MARK_COLORS.forEach(({ label, value }) => {
      const color = element('button', 'gtm-inspector-mark-color');
      color.type = 'button';
      color.title = `标为${label}`;
      color.setAttribute('aria-label', `标为${label}`);
      color.style.setProperty('--gtm-mark-color', value);
      color.addEventListener('mousedown', (event) => event.preventDefault());
      color.addEventListener('click', () => {
        const next = applyTextMarkRange(
          editor.marks || [],
          textarea.value.length,
          Number.isFinite(editor.selectionStart)
            ? editor.selectionStart
            : textarea.selectionStart,
          Number.isFinite(editor.selectionEnd)
            ? editor.selectionEnd
            : textarea.selectionEnd,
          value
        );
        if (!next) {
          renderStatus('请先在编辑框中选中文字', 'warning');
          return;
        }
        editor.marks = next;
        renderEditorColorPreview(preview, cell, editor);
        textarea.focus();
      });
      editorMarks.append(color);
    });
    const clearColor = element(
      'button',
      'gtm-inspector-mark-action',
      '清除选区'
    );
    clearColor.type = 'button';
    clearColor.addEventListener('mousedown', (event) => event.preventDefault());
    clearColor.addEventListener('click', () => {
      const next = applyTextMarkRange(
        editor.marks || [],
        textarea.value.length,
        Number.isFinite(editor.selectionStart)
          ? editor.selectionStart
          : textarea.selectionStart,
        Number.isFinite(editor.selectionEnd)
          ? editor.selectionEnd
          : textarea.selectionEnd,
        ''
      );
      if (!next) {
        renderStatus('请先在编辑框中选中文字', 'warning');
        return;
      }
      editor.marks = next;
      renderEditorColorPreview(preview, cell, editor);
      textarea.focus();
    });
    const clearAll = element(
      'button',
      'gtm-inspector-mark-action',
      '清空标色'
    );
    clearAll.type = 'button';
    clearAll.addEventListener('click', () => {
      editor.marks = [];
      renderEditorColorPreview(preview, cell, editor);
    });
    editorMarks.append(clearColor, clearAll);
    const preview = element('pre', 'gtm-inspector-editor-color-preview');
    renderEditorColorPreview(preview, cell, editor);
    const actions = element('div', 'gtm-inspector-cell-editor-actions');
    const cancel = element('button', 'gtm-inspector-secondary-button', '取消');
    cancel.type = 'button';
    cancel.disabled = Boolean(editor.saving);
    cancel.addEventListener('click', () => cancelCellEditor(cell));
    const save = element(
      'button',
      'gtm-inspector-primary-button',
      editor.saving ? '正在写回…' : '保存到飞书'
    );
    save.type = 'button';
    save.disabled = Boolean(editor.saving);
    save.addEventListener('click', () => saveCellEditor(cell, editor));
    actions.append(
      element('span', 'gtm-inspector-editor-hint', 'Ctrl+Enter 保存 · Esc 取消'),
      cancel,
      save
    );
    if (cell.type === 'date') {
      workspace.append(textarea, actions);
    } else {
      workspace.append(editorMarks, textarea, preview, actions);
    }
    container.append(workspace);
  }

  function appendDropdownField(container, cell, editor = null) {
    const targetRow = state.row;
    const key = editorKeyFor(targetRow, cell.columnIndex);
    const items = fieldDropdownItems(cell);
    const current = originalCellText(cell);
    const selected = items.find((item) => (
      item.value === current || item.label === current
    )) || {
      value: current,
      label: current || '未选择',
      backgroundColor: '',
      textColor: ''
    };
    const open = state.openDropdownKey === key;
    const saving = state.dropdownSavingKeys.has(key);
    const workspace = element('div', 'gtm-inspector-dropdown-field');
    const trigger = element('button', 'gtm-inspector-choice-trigger');
    trigger.type = 'button';
    trigger.disabled = saving;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute(
      'aria-label',
      `${cell.header || cell.columnLetter} · 当前 ${selected.label}`
    );
    const chip = makeChoiceChip(selected, current && !items.some((item) => (
      item.value === current || item.label === current
    )));
    trigger.append(
      chip,
      element('span', 'gtm-inspector-choice-arrow', saving ? '写回中…' : '▾')
    );
    trigger.addEventListener('click', () => {
      if (saving) return;
      state.openDropdownKey = open ? '' : key;
      renderCards();
    });
    workspace.append(trigger);

    if (open) {
      const panel = element('div', 'gtm-inspector-choice-panel');
      const search = element('input', 'gtm-inspector-choice-search');
      search.type = 'search';
      search.placeholder = '查找选项';
      search.autocomplete = 'off';
      search.setAttribute('aria-label', `${cell.header || cell.columnLetter} · 查找选项`);
      const list = element('div', 'gtm-inspector-choice-list');
      list.setAttribute('role', 'listbox');
      const empty = element('div', 'gtm-inspector-choice-empty', '没有匹配的选项');
      empty.hidden = true;
      const buttons = items.map((item) => {
        const option = element('button', 'gtm-inspector-choice-option');
        option.type = 'button';
        option.dataset.searchText = `${item.label}\n${item.value}`.toLowerCase();
        option.setAttribute('role', 'option');
        option.setAttribute(
          'aria-selected',
          String(item.value === current || item.label === current)
        );
        if (item.value === current || item.label === current) {
          option.classList.add('is-selected');
        }
        option.append(makeChoiceChip(item));
        option.addEventListener('click', () => {
          commitDropdownChoice(targetRow, cell, item);
        });
        list.append(option);
        return option;
      });
      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();
        let visible = 0;
        buttons.forEach((button) => {
          button.hidden = Boolean(
            query && !button.dataset.searchText.includes(query)
          );
          if (!button.hidden) visible += 1;
        });
        empty.hidden = visible > 0;
      });
      search.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        state.openDropdownKey = '';
        renderCards();
      });
      panel.append(search, list, empty);
      workspace.append(panel);
      requestAnimationFrame(() => search.focus());
    }
    container.append(workspace);
  }

  function choiceFallbackStyle(value) {
    const palette = [
      ['#dfe9ff', '#315da8'],
      ['#ffe6c7', '#a65b13'],
      ['#d9f2fa', '#176b83'],
      ['#e9e0ff', '#6542a5'],
      ['#dff3e8', '#277452'],
      ['#ffe0e5', '#a33d4d']
    ];
    let hash = 0;
    for (const char of safeText(value)) {
      hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
    }
    return palette[Math.abs(hash) % palette.length];
  }

  function makeChoiceChip(item, legacy = false) {
    const chip = element(
      'span',
      `gtm-inspector-choice-chip${legacy ? ' is-legacy' : ''}`,
      item.label || item.value || '未选择'
    );
    const [fallbackBackground, fallbackText] = choiceFallbackStyle(
      item.value || item.label
    );
    chip.style.setProperty(
      '--gtm-choice-bg',
      item.backgroundColor || fallbackBackground
    );
    chip.style.setProperty(
      '--gtm-choice-text',
      item.textColor || fallbackText
    );
    return chip;
  }

  async function commitDropdownChoice(targetRow, cell, item) {
    const key = editorKeyFor(targetRow, cell.columnIndex);
    if (
      state.dropdownSavingKeys.has(key)
      || rowIdentity(state.row) !== rowIdentity(targetRow)
    ) return;
    const baseline = originalCellText(cell);
    const value = safeText(item.value);
    if (value === baseline) {
      state.openDropdownKey = '';
      renderCards();
      return;
    }
    state.dropdownSavingKeys.add(key);
    renderCards();
    try {
      await writeGtCell({
        row: targetRow,
        cell,
        value,
        expectedValue: baseline,
        dropdownSelection: true
      });
      if (rowIdentity(state.row) === rowIdentity(targetRow)) {
        const currentCell = state.row.cells.find(({ columnIndex }) => (
          columnIndex === cell.columnIndex
        )) || cell;
        currentCell.value = value;
        currentCell.rawValue = value;
        currentCell.displayValue = item.label || value;
        currentCell.isEmpty = !value;
        if (Array.isArray(state.row.values)) {
          state.row.values[cell.columnIndex] = value;
        }
        state.rowRevision += 1;
      }
      state.openDropdownKey = '';
      renderCards();
      renderColumns();
      renderSummaryStatus();
      renderStatus(
        `已写回 ${cell.columnLetter}${targetRow.rowNumber} · ${cell.header}`,
        'success'
      );
    } catch (error) {
      // The row object is not mutated before verified success, so rendering
      // here restores the original chip while keeping the option panel open.
      state.openDropdownKey = key;
      renderCards();
      renderStatus(error.message || '写回下拉字段失败', 'error');
    } finally {
      state.dropdownSavingKeys.delete(key);
      renderCards();
    }
  }

  function renderEditorColorPreview(preview, cell, editor) {
    if (!preview) return;
    preview.replaceChildren();
    const text = safeText(editor.value);
    appendHighlightedText(
      preview,
      cell,
      text,
      cell.type === 'json',
      editor.marks || [],
      false
    );
    preview.hidden = !(editor.marks || []).length;
  }

  function createVideoPlayer({
    url,
    fileName = '',
    mimeType = '',
    fps = 0,
    nativeCell = null
  }) {
    const wrapper = element('div', 'gtm-inspector-video-wrap');
    const support = videoSupport(url, fileName, mimeType);
    const video = element('video', 'gtm-inspector-video');
    video.controls = false;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = url;
    video.cyleTimebase = { fps: Number(fps) || Number(nativeCell?.metadata?.fps) || 0, frameTiming: null };
    video.addEventListener('loadedmetadata', async () => {
      const source = video.currentSrc || video.src;
      const result = await globalThis.__cyleMediaServiceV1.requestMetadata({ url: source, fps: video.cyleTimebase.fps, durationSeconds: video.duration });
      if (!video.isConnected || source !== (video.currentSrc || video.src)) return;
      video.cyleTimebase = { fps: Number(result.fps) || video.cyleTimebase.fps, frameTiming: result.frameTiming || null };
      video.dispatchEvent(new Event('cyle-metadata'));
    });
    if (support.mimeType) video.type = support.mimeType;

    const fallback = element('div', 'gtm-inspector-video-fallback');
    const message = element(
      'span',
      'gtm-inspector-video-support',
      [
        support.extension ? support.extension.toUpperCase() : '未知格式',
        support.supportText
      ].join(' · ')
    );
    fallback.append(message);
    if (nativeCell) {
      const nativeButton = element(
        'button',
        'gtm-inspector-primary-button',
        '使用飞书播放器'
      );
      nativeButton.type = 'button';
      nativeButton.addEventListener('click', () => {
        openNativeVideo(nativeCell).catch(() => {});
      });
      fallback.append(nativeButton);
    }
    if (url) fallback.append(createLink(url, '打开或下载原文件'));

    const showFallback = (force = false) => {
      fallback.classList.toggle('is-visible', force || !support.supported);
    };
    video.addEventListener('loadedmetadata', () => {
      if (support.supported) fallback.classList.remove('is-visible');
    });
    video.addEventListener('canplay', () => fallback.classList.remove('is-visible'));
    video.addEventListener('error', () => showFallback(true));
    showFallback(false);
    const viewport = element('div', 'cyle-video-viewport');
    viewport.append(video);
    const controls = globalThis.__cyleVideoControlsV1.attach(video, {
      fullscreenTarget: wrapper,
      compactRate: true,
      referenceLayout: true,
      immersive: true,
      showRate: true,
      showFrameSteps: true,
      getFps: () => video.cyleTimebase.fps,
      onToggle: () => {
        return video.paused ? video.play() : video.pause();
      },
      onStep: delta => {
        const fps = Number(video.cyleTimebase.fps);
        if (!(fps > 0)) throw new Error('尚未识别 FPS，请在“更多”中填写视频帧率后逐帧查看');
        video.pause();
        const model = globalThis.__gtMapperGtTimeModelV1;
        const time = model ? model.frameToUs(model.usToFrame(video.currentTime * 1e6, video.cyleTimebase) + delta, video.cyleTimebase) / 1e6
          : video.currentTime + delta / fps;
        const target = Math.max(0, Math.min(video.duration, time));
        return (video.currentTime = target);
      }
    });
    video.cyleControls = controls;
    video.addEventListener('cyle-metadata', () => controls.refresh());
    wrapper.append(viewport, controls.element, fallback);
    if (nativeCell?.metadata?.fileToken) {
      chrome.runtime.sendMessage({ type: 'RESOLVE_ATTACHMENT_URL', payload: { fileToken: nativeCell.metadata.fileToken } })
        .then(response => {
          if (video.isConnected && response?.ok && /^https?:\/\//i.test(response.url || '')) video.src = response.url;
        }).catch(() => showFallback(true));
    }
    return wrapper;
  }

  async function openNativeVideo(cell, options = {}) {
    const targetRow = options.row || state.row;
    if (!targetRow) throw new Error('请先读取当前行');
    const sessionId = options.sessionId || `inspector:${targetRow.sheetId}:${targetRow.rowIndex}:${cell.columnIndex}:${Date.now()}`;
    let publicNative;
    if (!options.sessionId && state.pageTools) {
      const coordinator = globalThis.__cyleMediaServiceV1.workspace.coordinator;
      state.publicNativeSessions ||= new Map();
      state.publicNativeSessions.forEach((record, previousId) => {
        if (record.cell.columnIndex !== cell.columnIndex) return;
        record.adapter.pause(); coordinator.remove(record.id); state.publicNativeSessions.delete(previousId);
      });
      const adapter = new EventTarget();
      Object.assign(adapter, { currentTime: coordinator.currentTime, duration: Infinity, paused: true });
      publicNative = { adapter, id: `native:${sessionId}`, target: {}, cell };
      const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload: { sessionId, ...publicNative.target, ...payload } });
      adapter.seek = seconds => { adapter.currentTime = seconds; return send('SEEK_NATIVE_VIDEO', { mediaTime: seconds }); };
      adapter.play = () => send('PLAY_NATIVE_VIDEO');
      adapter.pause = () => send('PAUSE_NATIVE_VIDEO');
      state.publicNativeSessions.set(sessionId, publicNative);
      coordinator.add(adapter, { id: publicNative.id, master: true, autoBind: false });
      state.pageFields.get(columnKey(cell.columnIndex))?.mediaIds.forEach(id => coordinator.setEnabled(id, false));
    }
    const response = await chrome.runtime.sendMessage({
      type: 'OPEN_NATIVE_VIDEO',
      payload: {
        sessionId,
        sheetId: targetRow.sheetId,
        sheetIndex: targetRow.sheetIndex,
        row: targetRow.rowIndex,
        col: cell.columnIndex,
        fileToken: cell.metadata?.fileToken || '',
        fileName: cell.metadata?.fileName || cell.header || '',
        url: cell.url || '',
        fps: Number(options.fps) || 0,
        playbackRate: Number(options.playbackRate) || 1,
        fpsLocked: options.fpsLocked !== undefined
          ? Boolean(options.fpsLocked)
          : Number(options.fps) > 0,
        frameTiming: options.frameTiming || null,
        totalFrames: Math.max(0, Math.round(Number(options.totalFrames) || 0))
      }
    });
    if (!response?.ok) {
      if (publicNative) {
        globalThis.__cyleMediaServiceV1.workspace.coordinator.remove(publicNative.id);
        state.publicNativeSessions.delete(sessionId);
        state.pageFields.get(columnKey(cell.columnIndex))?.mediaIds.forEach(id => globalThis.__cyleMediaServiceV1.workspace.coordinator.setEnabled(id, true));
      }
      const error = new Error(response?.error || '打开飞书播放器失败');
      renderStatus(error.message, 'error');
      throw error;
    }
    renderStatus('已在飞书中打开视频', 'success');
    return response;
  }

  function attachPublicImageViewer(image) {
    const viewport = element('div', 'cyle-image-viewport');
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', `${image.alt}；双指捏合或 Ctrl/Cmd 加滚轮缩放，放大后拖动，Ctrl/Cmd 0 恢复`);
    viewport.title = '双指捏合 / Ctrl/Cmd + 滚轮缩放 · 放大后拖动 · Ctrl/Cmd 0 恢复';
    image.before(viewport); viewport.append(image); image.draggable = false;
    const canvas = element('div', 'cyle-image-canvas');
    image.before(canvas); canvas.append(image);
    const scroller = image.closest('.cyle-public-list') || viewport;
    let zoom = 1, drag = null;
    const scale = (next, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) => {
      const old = zoom; zoom = Math.max(1, Math.min(5, next));
      const left = (viewport.scrollLeft + x) * zoom / old - x;
      const top = scroller.scrollTop + y * (zoom / old - 1);
      canvas.style.width = `${zoom * 100}%`;
      viewport.style.cursor = zoom > 1 ? 'grab' : '';
      viewport.scrollLeft = left; scroller.scrollTop = top;
    };
    viewport.addEventListener('wheel', event => {
      if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
      event.preventDefault(); event.stopPropagation(); viewport.focus({preventScroll:true});
      const rect = viewport.getBoundingClientRect();
      const ratio = rect.width / Math.max(1, viewport.offsetWidth);
      scale(zoom * Math.exp(-event.deltaY * 0.01), (event.clientX - rect.left) / ratio, (event.clientY - rect.top) / ratio);
    }, {passive:false});
    viewport.addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || !['+','=','-','0'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      scale(event.key === '0' ? 1 : zoom + (event.key === '-' ? -0.25 : 0.25));
    });
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      viewport.focus({preventScroll:true});
      if (zoom <= 1) return;
      event.preventDefault(); viewport.setPointerCapture(event.pointerId);
      drag = {x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:scroller.scrollTop,ratio:viewport.getBoundingClientRect().width/Math.max(1,viewport.offsetWidth)};
    });
    viewport.addEventListener('pointermove', event => {
      if (!drag) return;
      viewport.scrollLeft = drag.left + (drag.x - event.clientX) / drag.ratio;
      scroller.scrollTop = drag.top + (drag.y - event.clientY) / drag.ratio;
    });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) viewport.addEventListener(name, () => { drag = null; });
  }

  function appendAttachment(container, attachment, cell) {
    const box = element('div', 'gtm-inspector-attachment');
    const kind = attachment?.kind || 'file';
    box.dataset.materialKind = kind;
    const name = element(
      'strong',
      'gtm-inspector-attachment-name',
      attachment?.fileName || cell.header || '附件'
    );
    const detail = [
      attachment?.mimeType,
      formatBytes(attachment?.size)
    ].filter(Boolean).join(' · ');
    box.append(name);
    if (detail) box.append(element('span', 'gtm-inspector-attachment-detail', detail));

    const url = kind === 'video' || kind === 'audio' || kind === 'image'
      ? attachment?.downloadUrl || cell.url || attachment?.thumbUrl || ''
      : attachment?.thumbUrl || attachment?.downloadUrl || cell.url || '';
    if (kind === 'image' && url) {
      const image = element('img', 'gtm-inspector-image');
      image.alt = attachment?.fileName || cell.header || '图片';
      image.loading = 'lazy';
      image.src = url;
      const fallbackUrl = attachment?.thumbUrl || attachment?.downloadUrl;
      if (fallbackUrl && fallbackUrl !== url) {
        image.addEventListener('error', () => {
          if (image.src !== fallbackUrl) image.src = fallbackUrl;
        }, { once:true });
      }
      box.append(image);
    } else if (kind === 'video') {
      const nativeCell = attachment?.fileToken
        || attachment?.source === 'feishu-attachment'
        ? cell
        : null;
      if (url || nativeCell) {
        box.append(createVideoPlayer({
          url,
          fileName: attachment?.fileName || cell.header || '',
          mimeType: attachment?.mimeType || '',
          fps: attachment?.fps || cell.metadata?.fps,
          nativeCell: nativeCell ? { ...nativeCell, metadata: { ...nativeCell.metadata, fileToken: attachment.fileToken || nativeCell.metadata?.fileToken } } : null
        }));
      } else if (nativeCell) {
        const button = element('button', 'gtm-inspector-primary-button', '在飞书中打开视频');
        button.type = 'button';
        button.addEventListener('click', () => {
          openNativeVideo(cell).catch(() => {});
        });
        box.append(button);
      }
    } else if (kind === 'audio' && url) {
      const audio = element('audio', 'gtm-inspector-audio');
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = url;
      box.append(audio);
    }
    if (kind === 'file') {
      const openUrl = attachment?.previewUrl || attachment?.webUrl || attachment?.downloadUrl || cell.url;
      if (openUrl) box.append(createLink(openUrl, '新标签页打开'));
    } else if (attachment?.downloadUrl) {
      box.append(createLink(attachment.downloadUrl, '打开或下载'));
    } else if (url && kind !== 'image') {
      box.append(createLink(url));
    }
    container.append(box);
  }

  function appendCellContent(container, cell) {
    if (isDropdownCell(cell)) {
      appendDropdownField(container, cell);
      return;
    }
    const attachments = Array.isArray(cell.attachments) ? cell.attachments : [];
    if (attachments.length) {
      attachments.forEach((attachment) => appendAttachment(container, attachment, cell));
      return;
    }
    const prose = displayTextForCell(cell);
    if (!cell.formula && cell.type !== 'json' && cell.url && prose.includes(cell.url) && prose.trim() !== cell.url && prose.replace(cell.url, '').trim() !== '') {
      const text = element('pre', 'gtm-inspector-text-value');
      appendHighlightedText(text, cell, prose, false);
      container.append(text);
      return;
    }
    if (cell.type === 'image' && cell.url) {
      const image = element('img', 'gtm-inspector-image');
      image.alt = cell.header || '图片';
      image.loading = 'lazy';
      image.src = cell.url;
      container.append(image, createLink(cell.url));
      return;
    }
    if (cell.type === 'video' && (cell.url || cell.metadata?.fileToken)) {
      container.append(createVideoPlayer({
        url: cell.url,
        fileName: cell.metadata?.fileName || cell.displayValue || cell.header || '',
        mimeType: cell.metadata?.mimeType || '',
        fps: cell.metadata?.fps,
        nativeCell: cell.metadata?.fileToken ? cell : null
      }));
      return;
    }
    if (cell.type === 'audio' && cell.url) {
      const audio = element('audio', 'gtm-inspector-audio');
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = cell.url;
      container.append(audio, createLink(cell.url));
      return;
    }
    if (['link', 'media-link'].includes(cell.type) && cell.url) {
      container.append(createLink(cell.url, cell.displayValue || cell.url));
      if (cell.type === 'media-link') {
        const preview = element('button', 'gtm-inspector-secondary-button', '尝试视频预览');
        preview.type = 'button';
        preview.addEventListener('click', () => {
          preview.remove();
          container.prepend(createVideoPlayer({
            url: cell.url,
            fileName: cell.displayValue || cell.header || '',
            mimeType: cell.metadata?.mimeType || '',
            nativeCell: cell.metadata?.fileToken ? cell : null
          }));
        });
        container.append(preview);
      }
      return;
    }
    if (cell.type === 'json') {
      const pre = element('pre', 'gtm-inspector-code');
      const text = displayTextForCell(cell);
      appendHighlightedText(pre, cell, text, true);
      container.append(pre);
      return;
    }
    if (cell.formula) {
      const value = element(
        'div',
        'gtm-inspector-text-value'
      );
      appendHighlightedText(value, cell, displayTextForCell(cell), false);
      const formula = element('code', 'gtm-inspector-formula', cell.formula);
      container.append(value, formula);
      return;
    }
    const pre = element('pre', 'gtm-inspector-text-value');
    appendHighlightedText(pre, cell, displayTextForCell(cell), false);
    container.append(pre);
  }

  function bindCardMove(card, header, cell) {
    header.addEventListener('pointerdown', (event) => {
      if (
        event.button !== 0
        || event.target.closest(
          'button, input, select, textarea, a, label, details, summary'
        )
      ) return;
      event.preventDefault();
      event.stopPropagation();
      ensureLayoutHistory();
      const before = layoutSnapshot();
      const zoom = globalThis.__cyleScaleV1.measure(card).parentScale;
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = Number.parseFloat(card.style.left) || 0;
      const originY = Number.parseFloat(card.style.top) || 0;
      let x = originX;
      let y = originY;
      let moved = false;
      const z = ++state.canvasZCounter;
      card.style.zIndex = String(z);
      card.classList.add('is-moving-card');
      const move = (moveEvent) => {
        moved = true;
        const snapped = snapCardPosition(
          originX + (moveEvent.clientX - startX) / zoom,
          originY + (moveEvent.clientY - startY) / zoom,
          card.offsetWidth,
          card.offsetHeight,
          card,
          moveEvent.altKey
        );
        x = snapped.x;
        y = snapped.y;
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        updateCanvasBounds({
          right: x + card.offsetWidth + CANVAS_PADDING,
          bottom: y + card.offsetHeight + CANVAS_PADDING
        });
      };
      const stop = () => {
        card.classList.remove('is-moving-card');
        clearCanvasGuides();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        if (!moved) {
          card.style.zIndex = String(
            Number(tableCardLayout().cards[cardKeyFor(cell)]?.z) || 0
          );
          return;
        }
        const key = cardKeyFor(cell);
        const layout = tableCardLayout();
        layout.cards[key] = {
          ...(layout.cards[key] || {}),
          x: Math.round(x),
          y: Math.round(y),
          z
        };
        commitLayoutHistory(
          `移动 ${cell.header || cell.definition?.title || cell.columnLetter}`,
          before
        );
        updateCanvasBounds();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  }

  function bindCardResize(card, cell, handle, direction) {
    if (direction.length === 2) {
      handle.title = '等比缩放组件：文字、按钮和内容一起缩放';
      let before;
      globalThis.__cyleScaleV1.bindCorner({
        element: card, handle, corner: direction,
        onStart: () => { ensureLayoutHistory(); before = layoutSnapshot(); },
        bounds: start => ({
          maxWidth: direction.includes('w') ? start.left + start.width : Infinity,
          maxHeight: direction.includes('n') ? start.top + start.height : Infinity
        }),
        apply: layout => {
          Object.assign(card.style, { left: `${layout.left}px`, top: `${layout.top}px`,
            width: `${layout.width}px`, height: `${layout.height}px` });
          card.classList.add('has-fixed-size');
          updateCanvasBounds({ right: layout.left + layout.width + CANVAS_PADDING,
            bottom: layout.top + layout.height + CANVAS_PADDING });
        },
        persist: resized => {
          const key = cardKeyFor(cell), layout = tableCardLayout();
          layout.cards[key] = { ...(layout.cards[key] || {}), x: resized.left, y: resized.top,
            width: resized.width, cardHeight: resized.height, userSizedHeight: true,
            scale: resized.scale, baseWidth: resized.baseWidth, baseHeight: resized.baseHeight,
            displayScale: card.dataset.displayScale };
          commitLayoutHistory(`缩放 ${cell.header || cell.definition?.title || cell.columnLetter}`, before);
          const autoSize = card.querySelector('.gtm-inspector-auto-size');
          if (autoSize) autoSize.hidden = false;
          updateCanvasBounds();
        }
      });
      return;
    }
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      ensureLayoutHistory();
      const before = layoutSnapshot();
      const zoom = globalThis.__cyleScaleV1.measure(card).parentScale;
      const pointerX = event.clientX;
      const pointerY = event.clientY;
      const startLeft = Number.parseFloat(card.style.left) || 0;
      const startTop = Number.parseFloat(card.style.top) || 0;
      const startWidth = card.offsetWidth;
      const startHeight = card.offsetHeight;
      const startRight = startLeft + startWidth;
      const startBottom = startTop + startHeight;
      const minimumWidth = Number(card.dataset.minWidth) || CARD_MIN_WIDTH;
      const minimumHeight = Number(card.dataset.minHeight) || CARD_MIN_HEIGHT;
      let left = startLeft;
      let top = startTop;
      let width = startWidth;
      let height = Math.max(minimumHeight, startHeight);
      let moved = false;
      const resizesWidth = direction.includes('e') || direction.includes('w');
      const resizesHeight = direction.includes('n') || direction.includes('s');
      handle.classList.add('is-dragging');
      card.classList.add('is-resizing-card');
      const move = (moveEvent) => {
        moved = true;
        const deltaX = (moveEvent.clientX - pointerX) / zoom;
        const deltaY = (moveEvent.clientY - pointerY) / zoom;
        if (direction.includes('e')) {
          width = snapCardWidth(
            Math.max(minimumWidth, startWidth + deltaX),
            card,
            moveEvent.altKey
          );
        }
        if (direction.includes('w')) {
          const maximumLeft = startRight - minimumWidth;
          const rawLeft = Math.min(maximumLeft, Math.max(0, startLeft + deltaX));
          const snappedLeft = moveEvent.altKey || !canvasSnapEnabled()
            ? Math.round(rawLeft)
            : Math.round(rawLeft / CANVAS_GRID) * CANVAS_GRID;
          left = Math.min(maximumLeft, Math.max(0, snappedLeft));
          width = Math.max(minimumWidth, Math.round(startRight - left));
        }
        if (direction.includes('s')) {
          const rawHeight = Math.max(minimumHeight, startHeight + deltaY);
          height = moveEvent.altKey || !canvasSnapEnabled()
            ? Math.round(rawHeight)
            : Math.max(
              minimumHeight,
              Math.round(rawHeight / CANVAS_GRID) * CANVAS_GRID
            );
        }
        if (direction.includes('n')) {
          const maximumTop = startBottom - minimumHeight;
          const rawTop = Math.min(maximumTop, Math.max(0, startTop + deltaY));
          const snappedTop = moveEvent.altKey || !canvasSnapEnabled()
            ? Math.round(rawTop)
            : Math.round(rawTop / CANVAS_GRID) * CANVAS_GRID;
          top = Math.min(maximumTop, Math.max(0, snappedTop));
          height = Math.max(minimumHeight, Math.round(startBottom - top));
        }
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
        if (resizesWidth) card.style.width = `${width}px`;
        if (resizesHeight) {
          card.style.height = `${height}px`;
          card.classList.add('has-fixed-size');
        }
        syncFieldCardDisplayScale(card, cell);
        globalThis.__cyleScaleV1.surface(card).reflow(width, height);
        updateCanvasBounds({
          right: left + width + CANVAS_PADDING,
          bottom: top + height + CANVAS_PADDING
        });
      };
      const stop = () => {
        handle.classList.remove('is-dragging');
        card.classList.remove('is-resizing-card');
        clearCanvasGuides();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        if (!moved) {
          return;
        }
        const key = cardKeyFor(cell);
        const layout = tableCardLayout();
        layout.cards[key] = {
          ...(layout.cards[key] || {}),
          ...globalThis.__cyleScaleV1.surface(card).state,
          x: Math.round(left),
          y: Math.round(top),
          ...(resizesWidth ? { width: Math.round(width) } : {}),
          ...(resizesHeight
            ? {
              cardHeight: Math.round(height),
              userSizedHeight: true
            }
            : {})
        };
        delete layout.cards[key].span;
        delete layout.cards[key].height;
        delete layout.cards[key].contentHeight;
        commitLayoutHistory(
          `缩放 ${cell.header || cell.definition?.title || cell.columnLetter}`,
          before
        );
        const autoSize = card.querySelector('.gtm-inspector-auto-size');
        if (autoSize) autoSize.hidden = !resizesHeight;
        updateCanvasBounds();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  }

  function renderLegacyCards() {
    if (!state.cards) return;
    state.cards.querySelectorAll('.gtm-inspector-card').forEach(card => globalThis.__cyleScaleV1.dispose(card));
    const previousScroll = {
      left: state.cards.scrollLeft,
      top: state.cards.scrollTop
    };
    const contentScrollByColumn = new Map(
      [...state.cards.querySelectorAll('.gtm-inspector-card')].map((card) => [
        card.dataset.columnIndex,
        {
          left: card.querySelector('.gtm-inspector-card-content')?.scrollLeft || 0,
          top: card.querySelector('.gtm-inspector-card-content')?.scrollTop || 0
        }
      ])
    );
    state.canvasResizeObserver?.disconnect();
    state.canvasResizeObserver = null;
    state.cards.replaceChildren();
    state.canvas = null;
    state.canvasSizer = null;
    if (!state.row) return;
    reconcileCardLayout();
    const columnsByIndex = new Map(
      state.row.columns.map((column) => [column.columnIndex, column])
    );
    const cellsByIndex = new Map(
      state.row.cells.map((cell) => [cell.columnIndex, cell])
    );
    const cells = tableCardLayout().order
      .map((columnIndex) => cellsByIndex.get(Number(columnIndex)))
      .filter(Boolean)
      .filter((cell) => {
      const column = columnsByIndex.get(cell.columnIndex);
      return state.visibleColumns?.has(columnKey(cell.columnIndex))
        && columnMatchesQuery(column || {}, cell);
      });
    if (!cells.length) {
      const empty = element(
        'div',
        'gtm-inspector-empty',
        state.visibleColumns?.size
          ? '没有匹配当前搜索的内容'
          : '当前没有显示任何列，可从左侧勾选'
      );
      state.cards.append(empty);
      return;
    }
    const availableWidth = logicalCanvasViewportWidth();
    migrateCardLayoutToCanvas(state.row.cells, availableWidth);
    const canvasSizer = element('div', 'gtm-inspector-canvas-sizer');
    const canvas = element('div', 'gtm-inspector-canvas');
    const verticalGuide = element(
      'div',
      'gtm-inspector-canvas-guide is-vertical'
    );
    const horizontalGuide = element(
      'div',
      'gtm-inspector-canvas-guide is-horizontal'
    );
    verticalGuide.hidden = true;
    horizontalGuide.hidden = true;
    canvas.append(verticalGuide, horizontalGuide);
    bindCanvasPanning(canvas);
    canvasSizer.append(canvas);
    state.cards.append(canvasSizer);
    state.canvasSizer = canvasSizer;
    state.canvas = canvas;
    const entries = [];
    cells.forEach((cell) => {
      const column = columnsByIndex.get(cell.columnIndex) || {};
      const card = element('article', 'gtm-inspector-card');
      card.dataset.columnIndex = String(cell.columnIndex);
      const layout = cardLayoutFor(cell, availableWidth);
      card.style.width = `${Math.round(layout.width)}px`;
      if (layout.cardHeight) {
        card.style.height = `${Math.round(layout.cardHeight)}px`;
        card.classList.add('has-fixed-size');
      }
      card.style.left = `${Math.round(layout.x || 0)}px`;
      card.style.top = `${Math.round(layout.y || 0)}px`;
      card.style.zIndex = String(layout.z || 0);
      state.canvasZCounter = Math.max(state.canvasZCounter, layout.z || 0);
      if (cell.isEmpty) card.classList.add('is-empty');
      const header = element('header', 'gtm-inspector-card-header');
      header.title = '拖动标题栏可将卡片放到画布任意位置';
      const titleWrap = element('div', 'gtm-inspector-card-title-wrap');
      const coordinate = element(
        'span',
        'gtm-inspector-cell-coordinate',
        `${cell.columnLetter || column.columnLetter || cell.columnNumber}${state.row.rowNumber}`
      );
      const title = element(
        'strong',
        'gtm-inspector-card-title',
        column.header || `第 ${cell.columnNumber} 列`
      );
      if (column.duplicate) {
        title.textContent += ` · 同名 ${column.duplicateIndex}/${column.duplicateCount}`;
      }
      const badge = element(
        'span',
        `gtm-inspector-type is-${cell.type}`,
        displayType(cell.type)
      );
      const cardActions = element('div', 'gtm-inspector-card-actions');
      if (editableCell(cell)) {
        const edit = element(
          'button',
          'gtm-inspector-card-action',
          state.cellEditors.has(editorKey(cell)) ? '编辑中' : '编辑'
        );
        edit.type = 'button';
        edit.disabled = state.cellEditors.has(editorKey(cell));
        edit.addEventListener('click', () => startCellEditor(cell));
        cardActions.append(edit);
      }
      if (markableCell(cell) && !state.cellEditors.has(editorKey(cell))) {
        const mark = element(
          'button',
          'gtm-inspector-card-action',
          '标色'
        );
        mark.type = 'button';
        mark.title = '给选中的文字添加本地颜色批注';
        mark.addEventListener('click', () => {
          const key = textMarkKey(cell);
          if (state.annotationOpenCards.has(key)) {
            state.annotationOpenCards.delete(key);
          } else {
            state.annotationOpenCards.add(key);
          }
          renderCards();
        });
        cardActions.append(mark);
      }
      const hide = element('button', 'gtm-inspector-card-action', '隐藏');
      hide.type = 'button';
      hide.addEventListener('click', () => {
        setColumnVisible(
          cell.columnIndex,
          false,
          `隐藏 ${cell.header || cell.columnLetter}`
        );
        renderColumns();
        renderCards();
        renderSummaryStatus();
      });
      const bringFront = element(
        'button',
        'gtm-inspector-card-action',
        '置顶'
      );
      bringFront.type = 'button';
      bringFront.title = '将这张卡片放到其他卡片上方';
      bringFront.addEventListener('click', () => {
        setCardLayout(
          cell.columnIndex,
          { z: ++state.canvasZCounter },
          `置顶 ${cell.header || cell.columnLetter}`
        );
        renderCards();
      });
      const autoSize = element(
        'button',
        'gtm-inspector-card-action gtm-inspector-auto-size',
        '自适应'
      );
      autoSize.type = 'button';
      autoSize.hidden = !layout.cardHeight;
      autoSize.title = '取消固定高度，恢复由内容决定组件高度';
      autoSize.addEventListener('click', () => {
        setCardLayout(
          cell.columnIndex,
          { cardHeight: 0 },
          `恢复 ${cell.header || cell.columnLetter} 自适应高度`
        );
        renderCards();
      });
      cardActions.append(autoSize);
      cardActions.append(bringFront, hide);
      titleWrap.append(coordinate, title);
      header.append(titleWrap, cardActions, badge);
      const content = element('div', 'gtm-inspector-card-content');
      const editor = state.cellEditors.get(editorKey(cell));
      if (editor) appendCellEditor(content, cell, editor);
      else {
        appendCellContent(content, cell);
        if (
          markableCell(cell)
          && state.annotationOpenCards.has(textMarkKey(cell))
        ) {
          content.prepend(makeTextMarkToolbar(
            cell,
            displayTextForCell(cell)
          ));
        }
      }
      bindCardMove(card, header, cell);
      card.append(header, content);
      [
        ['n', '从上边调整组件高度'],
        ['e', '从右边调整组件宽度'],
        ['s', '从下边调整组件高度'],
        ['w', '从左边调整组件宽度'],
        ['ne', '从右上角调整组件大小'],
        ['nw', '从左上角调整组件大小'],
        ['se', '从右下角调整组件大小'],
        ['sw', '从左下角调整组件大小']
      ].forEach(([direction, label]) => {
        const handle = element(
          'div',
          `gtm-inspector-card-size-handle is-${direction}`
        );
        handle.title = label;
        handle.dataset.direction = direction;
        bindCardResize(card, cell, handle, direction);
        card.append(handle);
      });
      canvas.append(card);
      globalThis.__cyleScaleV1.surface(card).apply(layout);
      const previousContentScroll = contentScrollByColumn.get(
        String(cell.columnIndex)
      );
      if (previousContentScroll) {
        content.scrollLeft = previousContentScroll.left;
        content.scrollTop = previousContentScroll.top;
      }
      entries.push({ cell, card, cardLayout: layout });
    });
    placeUnpositionedCards(entries);
    updateCanvasBounds();
    state.cards.scrollLeft = previousScroll.left;
    state.cards.scrollTop = previousScroll.top;
    if (typeof ResizeObserver === 'function') {
      let resizeTimer = 0;
      state.canvasResizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => updateCanvasBounds(), 30);
      });
      entries.forEach(({ card }) => state.canvasResizeObserver.observe(card));
    }
    updateCanvasControls();
  }

  function normalizeFloatPreferences(value = {}) {
    return { size: ['small','standard','large'].includes(value?.size) ? value.size : 'standard',
      locked: value?.locked === true, showInfo: value?.showInfo !== false };
  }

  function fitVideoFloat(record, width, height = null) {
    const card = record.card;
    globalThis.__cyleScaleV1.dispose(card);
    const video = card.querySelector('video'), viewport = card.querySelector('.cyle-video-viewport');
    const measure = globalThis.__cyleScaleV1.measure(card), scale = measure.parentScale || 1;
    const maxWidth = Math.max(100, innerWidth / scale - 16), maxHeight = Math.max(100, innerHeight / scale - 16);
    let w = Math.min(maxWidth, Math.max(Math.min(280, maxWidth), width));
    if (height == null && viewport) {
      const ratio = video?.videoWidth && video?.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
      const extraWidth = Math.max(0, card.offsetWidth - viewport.offsetWidth);
      const extraHeight = Math.max(0, card.offsetHeight - viewport.offsetHeight);
      height = (w - extraWidth) / ratio + extraHeight;
      if (height > maxHeight) { height = maxHeight; w = Math.max(100, (height - extraHeight) * ratio + extraWidth); }
    }
    const h = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), height || 360));
    Object.assign(card.style, { width:`${w}px`, height:`${h}px`,
      left:`${Math.max(8, Math.min(parseFloat(card.style.left) || 8, maxWidth + 8 - w))}px`,
      top:`${Math.max(8, Math.min(parseFloat(card.style.top) || 8, maxHeight + 8 - h))}px` });
  }

  function bindVideoFloatResize(record, handle) {
    let drag = null;
    const move = event => {
      if (!drag || event.pointerId !== drag.id) return;
      record.freeVideoSize = true;
      fitVideoFloat(record, drag.width + (event.clientX - drag.x) / drag.scale,
        drag.height + (event.clientY - drag.y) / drag.scale);
    };
    const finish = event => {
      if (!drag || (event?.pointerId != null && event.pointerId !== drag.id)) return;
      if (event?.type === 'pointerup') move(event);
      const id = drag.id; drag = null;
      if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish);
    };
    const start = event => {
      if (!record.floating || !record.card.classList.contains('is-video-float') || record.card.classList.contains('is-position-locked') || record.card.classList.contains('is-collapsed') || event.button !== 0) return;
      event.preventDefault();event.stopPropagation();
      const m = globalThis.__cyleScaleV1.measure(record.card);
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:m.width,height:m.height,scale:m.parentScale||1};
      handle.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);
      window.addEventListener('pointercancel',finish);window.addEventListener('blur',finish);
    };
    handle.addEventListener('pointerdown',start);
    return {dispose(){finish();handle.removeEventListener('pointerdown',start);}};
  }

  function sizePublicFloat(record, currentWidth = null) {
    const { card } = record;
    const prefs = normalizeFloatPreferences(state.floatPreferences);
    const width = currentWidth || { small:480, standard:640, large:800 }[prefs.size];
    if (card.classList.contains('is-video-float')) {
      card.classList.remove('is-collapsed');record.freeVideoSize=false;
      fitVideoFloat(record,width);return;
    }
    const rect = card.getBoundingClientRect();
    let layout = globalThis.__cyleScaleV1.fit({ baseWidth:640, baseHeight:560, width,
      left:rect.left || Math.max(8, innerWidth-width-30), top:rect.top || 90 }, innerWidth, innerHeight);
    card.classList.remove('is-collapsed');
    Object.assign(card.style, { left:`${layout.left}px`, top:`${layout.top}px`, width:`${layout.width}px`, height:`${layout.height}px` });
    const surface = globalThis.__cyleScaleV1.surface(card);
    surface.apply(layout);
    if (card.classList.contains('is-video-float') && surface.body) {
      // Measure natural content at the logical width, then preserve that ratio
      // when fitting and dragging the floating window.
      surface.body.style.height = 'auto';
      const style = getComputedStyle(card);
      const baseHeight = Math.ceil(surface.body.offsetHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth));
      layout = globalThis.__cyleScaleV1.fit({ ...layout, baseHeight, width }, innerWidth, innerHeight);
      Object.assign(card.style, { left:`${layout.left}px`, top:`${layout.top}px`, width:`${layout.width}px`, height:`${layout.height}px` });
      surface.apply(layout);
    }
  }

  function togglePublicFloatCollapse(record) {
    const { card } = record;
    record.floatSettings.hidden = true;
    record.floatSettingsButton.setAttribute('aria-expanded','false');
    if (!record.floating) { card.classList.toggle('is-collapsed');return; }
    if (card.classList.contains('is-collapsed')) {
      card.classList.remove('is-collapsed');
      const layout = record.expandedFloatLayout;
      if (layout) {
        Object.assign(card.style,{width:`${layout.width}px`,height:`${layout.height}px`});
        if (!card.classList.contains('is-video-float')) globalThis.__cyleScaleV1.surface(card).apply(layout);
        state.pageResize?.();
      }
    } else {
      record.expandedFloatLayout = { width:parseFloat(card.style.width),height:parseFloat(card.style.height),
        ...globalThis.__cyleScaleV1.surface(card).state };
      globalThis.__cyleScaleV1.dispose(card);
      card.classList.add('is-collapsed');
    }
  }

  function applyPublicFloatPreferences(resize = false) {
    const prefs = normalizeFloatPreferences(state.floatPreferences);
    state.pageFields?.forEach(record => {
      const isVideo = record.cell.type === 'video' || record.cell.attachments?.some(item => item.kind === 'video');
      record.card.classList.toggle('is-video-float', Boolean(isVideo));
      record.card.classList.toggle('is-position-locked', prefs.locked);
      record.card.classList.toggle('is-file-info-hidden', !prefs.showInfo);
      if (record.floatSettingsButton) record.floatSettingsButton.hidden = !record.floating;
      if (record.floatSettings) {
        record.floatSettings.querySelector('[data-pref=size]').value = prefs.size;
        record.floatSettings.querySelector('[data-pref=locked]').checked = prefs.locked;
        const fileInfo = record.floatSettings.querySelector('[data-pref=showInfo]');
        fileInfo.checked = prefs.showInfo;
        fileInfo.closest('label').hidden = !record.content.querySelector('.gtm-inspector-attachment-name,.gtm-inspector-attachment-detail');
        if (!record.floating) { record.floatSettings.hidden = true; record.floatSettingsButton.setAttribute('aria-expanded','false'); }
      }
      if (resize && record.floating) sizePublicFloat(record);
      updatePublicFloatCaption(record);
    });
  }

  function updatePublicFloatCaption(record) {
    if (!record.floatCaption || !record.floating) return;
    if(record.card.classList.contains('is-video-float')) {record.floatCaption.textContent='';return;}
    const range = state.toolInstances.get(state.activePageTool)?.instance?.playbackRange?.();
    const locked = normalizeFloatPreferences(state.floatPreferences).locked;
    const text = range && Number.isFinite(range.start) && range.end > range.start
      ? `当前子任务 ${Number(range.start.toFixed(3))}–${Number(range.end.toFixed(3))}s`
      : '未选择子任务';
    record.floatCaption.textContent = record.card.classList.contains('is-video-float') ? `${text}${locked ? ' · 位置已锁定' : ''}` : locked ? '位置已锁定' : '拖动标题栏移动 · 右下角缩放';
    record.floatCaption.title = locked ? '在浮窗设置中解锁移动和缩放' : '拖动标题栏移动 · 拖动右下角等比缩放';
  }

  function updatePublicCategory() {
    if (!state.pageFields) return;
    const category = ['stem','answer','media','document'].includes(state.publicCategory) ? state.publicCategory : 'stem';
    state.publicCategory = category;
    let matches = 0;
    state.pageFields.forEach(record => {
      const selected = state.publicGroups?.get(record.cell.columnIndex)?.has(category) || false;
      if (selected) matches++;
      record.card.hidden = !selected && !record.floating;
      record.placeholder.hidden = !selected || !record.floating;
      // Sidebar filters must not hide or restyle an independent floating card.
      if (record.floating) return;
      record.card.classList.toggle('is-media-card', category === 'media' || category === 'answer');
      record.content.querySelectorAll('[data-material-kind]').forEach(attachment => {
        const kind = attachment.dataset.materialKind;
        attachment.hidden = category === 'media' ? !['video','image','audio'].includes(kind)
          : category === 'document' ? ['video','image','audio'].includes(kind) : false;
      });
    });
    state.publicCategoryTabs?.querySelectorAll('button').forEach(tab => {
      const active = tab.dataset.category === category;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    if (state.publicCategoryEmpty) {
      state.publicCategoryEmpty.hidden = matches > 0;
      state.publicCategoryEmpty.textContent = state.publicMappingError || `当前题目没有映射的${{stem:'题目资料',answer:'模型回答',media:'题干图片、视频或音频',document:'题干文档'}[category]}。`;
    }
  }

  document.addEventListener('cyle:reveal-model-video', event => {
    const selection = event.detail;
    if (!selection || selection.tableKey !== state.row?.tableKey || selection.rowIndex !== state.row?.rowIndex) return;
    const record = state.pageFields?.get(columnKey(selection.columnIndex));
    if (!record) return;
    if (record.floating) {
      record.card.hidden = false;
      record.content.querySelectorAll('[data-material-kind]').forEach(item => { item.hidden = false; });
      if (record.card.classList.contains('is-collapsed')) togglePublicFloatCollapse(record);
      record.card.style.zIndex = String(++state.canvasZCounter + 100);
      return;
    }
    if (state.publicMaterialsHidden || state.publicCategory !== 'answer') return;
    if (record.card.classList.contains('is-collapsed')) togglePublicFloatCollapse(record);
    const list = state.pageFieldList;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    const scale = bounds.height / list.offsetHeight || 1;
    // Scroll only the material list, in its own logical pixels (workbench can be scaled).
    list.scrollTop += (record.card.getBoundingClientRect().top - bounds.top) / scale;
  });

  function applyPublicMaterialsVisibility() {
    const hidden = Boolean(state.publicMaterialsHidden);
    state.cards?.classList.toggle('is-public-materials-hidden', hidden);
    if (state.publicMaterialsToggle) {
      state.publicMaterialsToggle.textContent = '';
      state.publicMaterialsToggle.title = hidden ? '展开资料' : '收起资料';
      state.publicMaterialsToggle.setAttribute('aria-label', state.publicMaterialsToggle.title);
      state.publicMaterialsToggle.setAttribute('aria-expanded', String(!hidden));
    }
  }

  function renderPageWorkspace() {
    if (!state.cards) return;
    // A first read may fail before the persistent panes exist. The error must
    // not become a third grid item when a later read succeeds. Keep mounted
    // panes intact so recovering from a transient failure preserves editors.
    state.cards.querySelectorAll(':scope > .gtm-inspector-error').forEach(node => node.remove());
    const playback = globalThis.__cyleMediaServiceV1.workspace.coordinator;
    const button = (label, action) => {
      const node = element('button', 'gtm-inspector-card-action', label);
      node.type = 'button'; node.addEventListener('click', action); return node;
    };
    if (!state.pageTools) {
      state.pageFields = new Map();
      const materials = element('aside', 'cyle-public-materials');
      const heading = element('header', 'cyle-public-heading');
      heading.title = '公共资料 · 所有工具共用，切换工具不会改变资料选择';
      state.publicCategoryTabs = element('nav', 'cyle-public-categories');
      state.publicCategoryTabs.setAttribute('aria-label', '公共资料分类');
      [['stem','题干'],['answer','模型回答'],['media','媒体'],['document','文档']].forEach(([key,label]) => {
        const tab = button(label, () => { state.publicCategory = key; updatePublicCategory(); rememberTableView(); });
        tab.dataset.category = key;
        state.publicCategoryTabs.append(tab);
      });
      const chooseFields = button('组装', openWorkspaceComposer);
      chooseFields.classList.add('cyle-public-choose-fields');
      heading.append(element('strong', '', '资料'), state.publicCategoryTabs, chooseFields);
      state.pageFieldList = element('div', 'cyle-public-list');
      state.publicCategoryEmpty = element('div', 'cyle-public-category-empty');
      state.pageFieldList.append(state.publicCategoryEmpty);
      materials.append(heading, state.pageFieldList);
      const divider = element('div', 'cyle-sidebar-divider');
      divider.tabIndex = 0; divider.setAttribute('role', 'separator');
      divider.setAttribute('aria-orientation', 'vertical');
      divider.setAttribute('aria-label', '调整视频侧栏宽度');
      divider.title = '拖动调整宽度 · 双击恢复 · 方向键微调';
      const setWidth = (value, persist = true) => {
        if (value == null) { state.sidebarWidth=null;state.cards.style.removeProperty('--cyle-sidebar-width');divider.setAttribute('aria-valuenow',materials.offsetWidth);if(persist)rememberTableView();return; }
        const max = Math.max(240, state.cards.clientWidth - 440);
        const width = Math.max(240, Math.min(max, value));
        state.cards.style.setProperty('--cyle-sidebar-width', `${width}px`);
        divider.setAttribute('aria-valuenow', Math.round(width));
        state.sidebarWidth=width;
        if(persist)rememberTableView();
      };
      state.applySidebarWidth = setWidth;
      setWidth(state.sidebarWidth, false);
      divider.addEventListener('dblclick', () => {
        setWidth(null);
      });
      divider.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault(); setWidth(materials.offsetWidth + (event.key === 'ArrowRight' ? 20 : -20));
      });
      divider.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); divider.setPointerCapture(event.pointerId);
        const x = event.clientX, width = materials.offsetWidth;
        const scale = materials.getBoundingClientRect().width / Math.max(1,width);
        const move = e => setWidth(width + (e.clientX - x) / scale, false);
        const end = () => { setWidth(materials.offsetWidth); divider.removeEventListener('pointermove', move); divider.removeEventListener('pointerup', end); divider.removeEventListener('pointercancel', end); divider.removeEventListener('lostpointercapture', end); };
        divider.addEventListener('pointermove', move); divider.addEventListener('pointerup', end); divider.addEventListener('pointercancel', end); divider.addEventListener('lostpointercapture', end);
      });
      materials.append(divider);
      state.pageTools = element('section', 'cyle-tool-pages');
      state.publicMaterialsToggle = button('', () => {
        state.publicMaterialsHidden = !state.publicMaterialsHidden;
        applyPublicMaterialsVisibility();rememberTableView();savePreferences();
      });
      state.publicMaterialsToggle.classList.add('cyle-public-toggle');
      state.modeTabs.append(state.publicMaterialsToggle);
      state.pageTools.append(state.modeTabs);
      applyPublicMaterialsVisibility();
      state.pageToolBody = element('div', 'cyle-tool-page-body');
      state.pageTools.append(state.pageToolBody);
      state.cards.append(materials, state.pageTools);
      toggleColumnsPane(true);
      state.pageResize = () => state.pageFields.forEach(record => {
        if (!record.floating) return;
        if(record.card.classList.contains('is-video-float')&&!record.card.classList.contains('is-collapsed')) {
          fitVideoFloat(record,record.card.offsetWidth,record.freeVideoSize?record.card.offsetHeight:null);return;
        }
        const rect = record.card.getBoundingClientRect();
        const surface = globalThis.__cyleScaleV1.surface(record.card);
        if (surface.state?.baseWidth) {
          const fit = globalThis.__cyleScaleV1.fit({ ...surface.state, width: rect.width, left: rect.left, top: rect.top }, innerWidth, innerHeight);
          Object.assign(record.card.style, { width: `${fit.width}px`, height: `${fit.height}px`, left: `${fit.left}px`, top: `${fit.top}px` });
          surface.apply(fit);
          return;
        }
        record.card.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`;
        record.card.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - rect.height - 8))}px`;
        record.card.style.maxWidth = 'calc(100vw - 16px)';
        record.card.style.maxHeight = 'calc(100dvh - 16px)';
      });
      window.addEventListener('resize', state.pageResize);
    }
    if (!state.row) {
      state.pageToolBody.replaceChildren(element('div', 'gtm-inspector-error', state.error || '请先选中数据行，正在读取表格…'));
      return;
    }
    state.pageToolBody.querySelectorAll(':scope > .gtm-inspector-error').forEach(node => node.remove());
    const rowKey = `${currentTableKey()}:${state.row.rowIndex}`;
    const changedRow = state.pageRowKey !== rowKey;
    if (changedRow) {
      playback.clearRange({ pause: true });
      playback.ids().forEach(id => playback.remove(id));
      globalThis.__cyleMediaServiceV1.workspace.timebases.clear();
      state.publicNativeSessions?.clear();
      playback.seek(0);
      state.pageRowKey = rowKey;
    }
    const disposeMedia = record => {
      state.publicNativeSessions?.forEach((native, sessionId) => {
        if (native.cell.columnIndex !== record.cell.columnIndex) return;
        native.adapter.pause(); playback.remove(native.id); state.publicNativeSessions.delete(sessionId);
      });
      (record.mediaIds || []).forEach(id => playback.remove(id));
      (record.mediaIds || []).forEach(id => globalThis.__cyleMediaServiceV1.workspace.timebases.delete(id));
      record.content.querySelectorAll('video').forEach(video => {
        video.pause(); globalThis.__cyleVideoControlsV1.dispose(video);
      });
      record.mediaIds = [];
    };
    const keys = new Set(state.row.cells.map(cell => columnKey(cell.columnIndex)));
    state.pageFields.forEach((record, key) => {
      if (keys.has(key) && state.visibleColumns.has(key)) return;
      disposeMedia(record); record.resize?.dispose();
      globalThis.__cyleScaleV1.dispose(record.card);
      record.placeholder.remove(); record.card.remove(); state.pageFields.delete(key);
    });
    state.row.cells.forEach(cell => {
      const key = columnKey(cell.columnIndex);
      if (!state.visibleColumns.has(key)) return;
      let record = state.pageFields.get(key);
      if (!record) {
        const card = element('article', 'cyle-public-card');
        card.dataset.cardKey = key;
        const header = element('header', 'cyle-public-card-header');
        const title = element('strong');
        const content = element('div', 'cyle-public-card-content');
        const placeholder = element('div', 'cyle-public-placeholder'); placeholder.hidden = true;
        record = { card, header, title, content, placeholder, cell, floating: false, mediaIds: [] };
        card.addEventListener('pointerdown', () => {
          if (!state.publicGroups?.get(record.cell.columnIndex)?.has('answer')) return;
          globalThis.__cyleSelectedModelVideoV1 = {tableKey:state.row.tableKey, rowIndex:state.row.rowIndex, columnIndex:record.cell.columnIndex};
          state.pageFields.forEach(item => item.card.classList.toggle('is-model-selected', item === record));
          document.dispatchEvent(new CustomEvent('cyle:model-video-selected'));
        });
        const dock = () => {
          record.floating = false;
          globalThis.__cyleScaleV1.dispose(card);
          card.classList.remove('is-floating', 'is-collapsed');
          card.removeAttribute('style'); placeholder.hidden = true;
          float.textContent = '浮出';
          applyPublicFloatPreferences();
          updatePublicCategory();
        };
        const float = button('浮出', () => {
          if (record.floating) { dock(); return; }
          record.floating = true;
          placeholder.hidden = false;
          card.classList.remove('is-collapsed');
          card.classList.add('is-floating');
          Object.assign(card.style, { left: `${Math.max(8, innerWidth - 580)}px`, top: '110px',
            width: `${Math.min(540, innerWidth - 16)}px`, height: `${Math.min(480, innerHeight - 126)}px`, zIndex: String(++state.canvasZCounter + 100) });
          float.textContent = '归位';
          applyPublicFloatPreferences();
          sizePublicFloat(record);
          updatePublicCategory();
        });
        placeholder.append(element('span', '', '资料已浮出'), button('归位', dock));
        const edit = button('编辑', () => startCellEditor(record.cell));
        record.edit = edit;
        const settingsButton = button('⚙', () => {
          if (card.classList.contains('is-collapsed')) togglePublicFloatCollapse(record);
          settings.hidden = !settings.hidden;
          settingsButton.setAttribute('aria-expanded', String(!settings.hidden));
          if (!settings.hidden) settings.querySelector('select').focus();
        });
        settingsButton.classList.add('cyle-float-settings-button');
        settingsButton.setAttribute('aria-label','浮窗设置');settingsButton.setAttribute('aria-expanded','false');settingsButton.hidden = true;
        const settings = element('section', 'cyle-float-settings');settings.hidden = true;
        settings.setAttribute('role','dialog');settings.setAttribute('aria-label','浮窗设置');
        const settingsHeading = element('header');
        const closeSettings = () => { settings.hidden = true;settingsButton.setAttribute('aria-expanded','false');settingsButton.focus(); };
        settingsHeading.append(element('strong','','浮窗设置'),button('关闭设置',closeSettings));
        const appearance = element('div','cyle-float-pref-row');
        appearance.append(element('span','','外观'),element('span','cyle-float-follow-theme','跟随皮肤'));
        const sizeRow = element('label','cyle-float-pref-row','窗口大小');
        const size = element('select');size.dataset.pref = 'size';size.setAttribute('aria-label','浮窗大小');
        [['small','小'],['standard','标准'],['large','大']].forEach(([value,label]) => size.add(new Option(label,value)));
        sizeRow.append(size);
        const change = (key, value) => {
          state.floatPreferences = { ...normalizeFloatPreferences(state.floatPreferences), [key]:value };
          applyPublicFloatPreferences(key === 'size');savePreferences();
        };
        size.addEventListener('change', () => change('size',size.value));
        const toggle = (key,label) => {
          const row = element('label','cyle-float-pref-row',label);
          const input = element('input','cyle-float-switch');input.type='checkbox';input.dataset.pref=key;input.setAttribute('role','switch');
          input.addEventListener('change', () => change(key,input.checked));row.append(input);return row;
        };
        settings.append(settingsHeading,appearance,sizeRow,toggle('locked','锁定位置'),toggle('showInfo','显示文件信息'),
          element('p','cyle-float-settings-help','所有公共资料浮窗共用设置；锁定后不可拖动或缩放。'),button('恢复默认',() => {
            state.floatPreferences = normalizeFloatPreferences();applyPublicFloatPreferences(true);savePreferences();
          }));
        settings.addEventListener('keydown',event => { event.stopPropagation();if(event.key==='Escape') {event.preventDefault();closeSettings();} });
        settings.addEventListener('pointerdown',event => event.stopPropagation());
        record.floatSettings = settings;record.floatSettingsButton = settingsButton;
        header.append(title, edit, settingsButton, button('收起 / 展开', () => togglePublicFloatCollapse(record)), float);
        card.append(header, content);
        record.floatCaption = element('div','cyle-float-caption');
        card.append(record.floatCaption);
        card.append(settings);
        const handle = element('div', 'cyle-public-resize cyle-floating-resize'); handle.title = '拖动等比缩放内容与字号';
        card.append(handle);
        const uniformResize = globalThis.__cyleScaleV1.bindCorner({ element: card, handle, corner: 'se',
          enabled: () => record.floating && !card.classList.contains('is-video-float') && !card.classList.contains('is-position-locked'),
          bounds: () => ({ minWidth: 280, minHeight: 180, maxWidth: innerWidth - 16, maxHeight: innerHeight - 16 }),
          apply: layout => Object.assign(card.style, { width: `${layout.width}px`, height: `${layout.height}px` }),
          persist: () => state.pageResize() });
        const videoResize=bindVideoFloatResize(record,handle);
        record.resize={dispose(){uniformResize.dispose();videoResize.dispose();}};
        const resetVideoRatio=event=>{
          if(!record.floating||!card.classList.contains('is-video-float')||card.classList.contains('is-position-locked')||event.target.closest('button,input,select'))return;
          event.preventDefault();sizePublicFloat(record,card.offsetWidth);
        };
        header.addEventListener('dblclick',resetVideoRatio);handle.addEventListener('dblclick',resetVideoRatio);
        handle.title='视频：自由调整宽高；双击标题或此角恢复比例';
        header.title='拖动移动；双击恢复视频比例';
        header.addEventListener('pointerdown', event => {
          if (!record.floating || card.classList.contains('is-position-locked') || event.button !== 0 || event.target.closest('button,input,select')) return;
          event.preventDefault(); header.setPointerCapture(event.pointerId);
          const rect = card.getBoundingClientRect(), x = event.clientX, y = event.clientY;
          card.style.zIndex = String(++state.canvasZCounter + 100);
          const move = e => {
            card.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, rect.left + e.clientX - x))}px`;
            card.style.top = `${Math.max(8, Math.min(innerHeight - 40, rect.top + e.clientY - y))}px`;
          };
          const finish = () => { header.removeEventListener('pointermove', move); header.removeEventListener('pointerup', finish); header.removeEventListener('pointercancel', finish); };
          header.addEventListener('pointermove', move); header.addEventListener('pointerup', finish); header.addEventListener('pointercancel', finish);
        });
        state.pageFieldList.append(placeholder, card);
        state.pageFields.set(key, record);
      }
      record.cell = cell;
      record.card.classList.toggle('is-model-selected', globalThis.__cyleSelectedModelVideoV1?.tableKey === state.row.tableKey && globalThis.__cyleSelectedModelVideoV1?.rowIndex === state.row.rowIndex && globalThis.__cyleSelectedModelVideoV1?.columnIndex === cell.columnIndex);
      record.title.textContent = `${cell.columnLetter || ''} · ${cell.header || '未命名字段'} · 第 ${state.row.rowNumber} 行`;
      record.placeholder.firstChild.textContent = `${cell.header || key} · 第 ${state.row.rowNumber} 行 · 已浮出`;
      record.edit.hidden = !editableCell(cell) || isDropdownCell(cell);
      const editor = state.cellEditors.get(editorKey(cell));
      record.edit.disabled = Boolean(editor);
      record.edit.textContent = editor ? '编辑中' : '编辑';
      const signature = JSON.stringify([rowKey, cell, Boolean(editor), Boolean(editor?.saving)]);
      if (record.signature === signature) return;
      record.signature = signature;
      disposeMedia(record);
      record.content.replaceChildren();
      if (editor) appendCellEditor(record.content, cell, editor);
      else appendCellContent(record.content, cell);
      const images = record.content.querySelectorAll('img.gtm-inspector-image');
      record.card.classList.toggle('has-image-material', images.length > 0);
      images.forEach(image => {
        const attachment = image.closest('.gtm-inspector-attachment');
        if (images.length === 1 && attachment) {
          const name = attachment.querySelector('.gtm-inspector-attachment-name');
          if (name) { image.title = name.textContent; name.hidden = true; }
        }
        attachPublicImageViewer(image);
      });
      record.content.querySelectorAll('video').forEach((video, index) => {
        const id = `${key}:${index}`;
        video.addEventListener('timeupdate', () => updatePublicFloatCaption(record));
        video.addEventListener('loadedmetadata', () => { if (record.floating && !record.freeVideoSize && !record.card.classList.contains('is-collapsed')) sizePublicFloat(record, record.card.offsetWidth); });
        playback.add(video, { id, offsetSeconds: 0, autoBind: false }); record.mediaIds.push(id);
        const updateMetadata = () => {
          if (!playback.has(id)) return;
          globalThis.__cyleMediaServiceV1.workspace.timebases.set(id, video.cyleTimebase);
          playback.setMaster(playback.getState().masterId);
        };
        video.addEventListener('cyle-metadata', updateMetadata); updateMetadata();
        const options = element('div', 'cyle-public-media-options');
        const fps = element('input'); fps.type = 'number'; fps.min = '0.001'; fps.step = '0.001';
        fps.setAttribute('aria-label', `${cell.header} FPS`); fps.placeholder = '帧率';
        fps.value = video.cyleTimebase.fps || '';
        video.addEventListener('cyle-metadata', () => { fps.value = video.cyleTimebase.fps || ''; });
        fps.addEventListener('change', () => {
          if (!(Number(fps.value) > 0)) { fps.value = video.cyleTimebase.fps || ''; return; }
          video.cyleTimebase = { fps: Number(fps.value), frameTiming: null };
          video.dispatchEvent(new Event('cyle-metadata'));
        });
        options.append(element('span', '', '独立播放 · FPS'), fps);
        video.cyleControls.addSettings(options);
        const wrapper = video.closest('.gtm-inspector-video-wrap');
        const download = [...(wrapper?.parentElement?.children || [])].find(node => node.tagName === 'A' && node.textContent === '打开或下载');
        if (download) video.cyleControls.addSettings(download);
      });
    });
    applyPublicFloatPreferences();
    updatePublicCategory();
    const definitions = canvasToolDefinitions();
    if (!definitions.some(def => def.id === state.activePageTool)) state.activePageTool = '';
    state.activePageTool ||= definitions.find(def => state.visibleColumns.has(def.key || toolKey(def)))?.id || definitions[0]?.id;
    definitions.forEach(definition => {
      if (['machine-eval', 'human-eval', 'caption-review'].includes(definition.id)) return;
      let tab = state.modeTabs.querySelector(`[data-page-tool="${CSS.escape(definition.id)}"]`);
      if (!tab) {
        tab = button(definition.title, () => focusCanvasTool(definition));
        tab.dataset.pageTool = definition.id;
        state.modeTabs.insertBefore(tab, state.workspaceManageButton);
      }
      tab.classList.toggle('is-active', definition.id === state.activePageTool);
    });
    state.modeTabs.querySelectorAll('[data-recipe-id]').forEach(tab => {
      const recipe = workspaceProfiles().find(profile => profile.id === tab.dataset.recipeId);
      tab.classList.toggle('is-active', Boolean(recipe?.tools?.includes(state.activePageTool)));
    });
    definitions.forEach(definition => {
      const active = definition.id === state.activePageTool;
      if (!active && !state.toolInstances.has(definition.id)) return;
      const record = ensureToolInstance(definition);
      if (!record.page) {
        record.page = element('article', 'gtm-inspector-card cyle-tool-page has-fixed-size');
        record.page.dataset.toolId = definition.id;
        const content = element('div', 'gtm-inspector-card-content is-tool-content');
        content.append(record.root); record.page.append(content); state.pageToolBody.append(record.page);
      }
      record.page.hidden = !active;
      if (active) { state.visibleColumns.add(definition.key || toolKey(definition)); syncToolRecord(record); }
    });
    setCanvasToolsActive();
  }

  function renderCards() {
    return renderPageWorkspace();
  }

  function renderLegacyCards() {
    if (!state.cards) return;
    state.cards.querySelectorAll('.gtm-inspector-card').forEach(card => globalThis.__cyleScaleV1.dispose(card));
    state.cards.querySelectorAll('.gtm-inspector-video').forEach((video) => {
      video.pause();
      globalThis.__cyleVideoControlsV1.dispose(video);
    });
    const previousScroll = {
      left: state.cards.scrollLeft,
      top: state.cards.scrollTop
    };
    const contentScrollByKey = new Map(
      [...state.cards.querySelectorAll('.gtm-inspector-card')].map((card) => [
        card.dataset.cardKey,
        {
          left: card.querySelector('.gtm-inspector-card-content')?.scrollLeft || 0,
          top: card.querySelector('.gtm-inspector-card-content')?.scrollTop || 0
        }
      ])
    );
    state.canvasResizeObserver?.disconnect();
    state.canvasResizeObserver = null;
    state.cards.replaceChildren();
    state.canvas = null;
    state.canvasSizer = null;
    if (!state.row) return;

    reconcileCardLayout();
    const columnsByIndex = new Map(
      state.row.columns.map((column) => [column.columnIndex, column])
    );
    const itemsByKey = new Map(
      canvasCardItems().map((item) => [cardKeyFor(item), item])
    );
    const items = tableCardLayout().order
      .map((key) => itemsByKey.get(normalizeLayoutKey(key)))
      .filter(Boolean)
      .filter((item) => {
        const key = cardKeyFor(item);
        if (!state.visibleColumns?.has(key)) return false;
        if (item.itemKind === 'tool') {
          return toolMatchesQuery(item.definition);
        }
        return columnMatchesQuery(
          columnsByIndex.get(item.columnIndex) || {},
          item
        );
      });

    if (!items.length) {
      const empty = element(
        'div',
        'gtm-inspector-empty',
        state.visibleColumns?.size
          ? '没有匹配当前搜索的内容'
          : '当前没有显示任何字段或工具，可从左侧勾选'
      );
      state.cards.append(empty);
      setCanvasToolsActive();
      return;
    }

    const availableWidth = logicalCanvasViewportWidth();
    migrateCardLayoutToCanvas(canvasCardItems(), availableWidth);
    const canvasSizer = element('div', 'gtm-inspector-canvas-sizer');
    const canvas = element('div', 'gtm-inspector-canvas');
    const verticalGuide = element(
      'div',
      'gtm-inspector-canvas-guide is-vertical'
    );
    const horizontalGuide = element(
      'div',
      'gtm-inspector-canvas-guide is-horizontal'
    );
    verticalGuide.hidden = true;
    horizontalGuide.hidden = true;
    canvas.append(verticalGuide, horizontalGuide);
    bindCanvasPanning(canvas);
    canvasSizer.append(canvas);
    state.cards.append(canvasSizer);
    state.canvasSizer = canvasSizer;
    state.canvas = canvas;
    const entries = [];

    items.forEach((item) => {
      const isTool = item.itemKind === 'tool';
      const definition = item.definition;
      const column = isTool
        ? {}
        : columnsByIndex.get(item.columnIndex) || {};
      const key = cardKeyFor(item);
      const card = element(
        'article',
        `gtm-inspector-card${isTool ? ' is-tool-card' : ''}`
      );
      card.dataset.cardKey = key;
      if (!isTool) card.dataset.columnIndex = String(item.columnIndex);
      if (isTool) {
        card.dataset.toolId = definition.id;
        card.dataset.minWidth = String(definition.minimumWidth || 560);
        card.dataset.minHeight = String(definition.minimumHeight || 420);
        card.style.minWidth = `${definition.minimumWidth || 560}px`;
        card.style.minHeight = `${definition.minimumHeight || 420}px`;
      }
      const layout = cardLayoutFor(item, availableWidth);
      card.style.width = `${Math.round(layout.width)}px`;
      if (layout.cardHeight) {
        card.style.height = `${Math.round(layout.cardHeight)}px`;
        card.classList.add('has-fixed-size');
      }
      if (!isTool) {
        card.dataset.displayScale = layout.displayScale || fieldCardDisplayScale(
          layout.width,
          layout.cardHeight
        );
      }
      card.style.left = `${Math.round(layout.x || 0)}px`;
      card.style.top = `${Math.round(layout.y || 0)}px`;
      card.style.zIndex = String(layout.z || 0);
      state.canvasZCounter = Math.max(state.canvasZCounter, layout.z || 0);
      if (!isTool && item.isEmpty) card.classList.add('is-empty');
      if (
        !isTool
        && state.openDropdownKey === editorKeyFor(state.row, item.columnIndex)
      ) {
        card.classList.add('has-open-choice');
        const openZ = ++state.canvasZCounter;
        card.style.zIndex = String(openZ);
        tableCardLayout().cards[key] = {
          ...(tableCardLayout().cards[key] || {}),
          z: openZ
        };
      }

      const header = element('header', 'gtm-inspector-card-header');
      header.title = '拖动标题栏可将组件放到画布任意位置';
      const titleWrap = element('div', 'gtm-inspector-card-title-wrap');
      const coordinate = element(
        'span',
        'gtm-inspector-cell-coordinate',
        isTool
          ? '◈'
          : `${item.columnLetter || column.columnLetter || item.columnNumber}${state.row.rowNumber}`
      );
      const title = element(
        'strong',
        'gtm-inspector-card-title',
        isTool
          ? definition.title
          : column.header || `第 ${item.columnNumber} 列`
      );
      if (!isTool && column.duplicate) {
        title.textContent += ` · 同名 ${column.duplicateIndex}/${column.duplicateCount}`;
      }
      const badge = element(
        'span',
        `gtm-inspector-type ${isTool ? 'is-tool' : `is-${item.type}`}`,
        isTool ? definition.badge : isDropdownCell(item) ? '下拉选项' : displayType(item.type)
      );
      const cardActions = element('div', 'gtm-inspector-card-actions');
      const overflowActions = [];

      if (!isTool && editableCell(item) && !isDropdownCell(item)) {
        const edit = element(
          'button',
          'gtm-inspector-card-action',
          state.cellEditors.has(editorKey(item)) ? '编辑中' : '编辑'
        );
        edit.type = 'button';
        edit.disabled = state.cellEditors.has(editorKey(item));
        edit.addEventListener('click', () => startCellEditor(item));
        cardActions.append(edit);
      }
      if (
        !isTool
        && !isDropdownCell(item)
        && markableCell(item)
        && !state.cellEditors.has(editorKey(item))
      ) {
        const mark = element(
          'button',
          'gtm-inspector-card-action',
          '标色'
        );
        mark.type = 'button';
        mark.title = '给选中的文字添加本地颜色批注';
        mark.addEventListener('click', () => {
          const markKey = textMarkKey(item);
          if (state.annotationOpenCards.has(markKey)) {
            state.annotationOpenCards.delete(markKey);
          } else {
            state.annotationOpenCards.add(markKey);
          }
          renderCards();
        });
        overflowActions.push(mark);
      }

      const autoSize = element(
        'button',
        'gtm-inspector-card-action gtm-inspector-auto-size',
        '自适应'
      );
      autoSize.type = 'button';
      autoSize.hidden = !layout.cardHeight;
      autoSize.title = '取消固定高度，恢复由内容决定组件高度';
      autoSize.addEventListener('click', () => {
        setCardLayout(
          key,
          { cardHeight: 0, userSizedHeight: false },
          `恢复 ${isTool ? definition.title : item.header || item.columnLetter} 自适应高度`
        );
        renderCards();
      });

      const bringFront = element(
        'button',
        'gtm-inspector-card-action',
        '置顶'
      );
      bringFront.type = 'button';
      bringFront.title = '将这个组件放到其他组件上方';
      bringFront.addEventListener('click', () => {
        setCardLayout(
          key,
          { z: ++state.canvasZCounter },
          `置顶 ${isTool ? definition.title : item.header || item.columnLetter}`
        );
        card.style.zIndex = String(state.canvasZCounter);
      });

      const hide = element('button', 'gtm-inspector-card-action', '隐藏');
      hide.type = 'button';
      hide.addEventListener('click', () => {
        if (isTool) {
          setToolVisible(definition, false);
        } else {
          setColumnVisible(
            item.columnIndex,
            false,
            `隐藏 ${item.header || item.columnLetter}`
          );
        }
        renderColumns();
        renderCards();
        renderSummaryStatus();
      });
      titleWrap.append(coordinate, title);
      if (isTool) {
        cardActions.append(autoSize, bringFront, hide);
        header.append(titleWrap, cardActions, badge);
      } else {
        header.classList.add('is-field-header');
        const headingRow = element('div', 'gtm-inspector-card-heading-row');
        headingRow.append(titleWrap, badge);

        const sizeField = element('label', 'gtm-inspector-card-size-field');
        sizeField.append(element('span', '', '显示大小'));
        const sizeSelect = element(
          'select',
          'gtm-inspector-card-size-select'
        );
        sizeSelect.setAttribute(
          'aria-label',
          `${item.header || item.columnLetter} 显示大小`
        );
        Object.entries(FIELD_CARD_SIZE_PRESETS).forEach(([id, preset]) => {
          sizeSelect.add(new Option(preset.label, id));
        });
        sizeSelect.value = closestFieldCardSizePreset(layout);
        sizeSelect.addEventListener('change', () => {
          const preset = FIELD_CARD_SIZE_PRESETS[sizeSelect.value];
          if (!preset) return;
          setCardLayout(
            key,
            {
              width: preset.width,
              cardHeight: preset.height,
              userSizedHeight: true
            },
            `将 ${item.header || item.columnLetter} 调整为${preset.label}显示`
          );
          renderCards();
        });
        sizeField.append(sizeSelect);
        cardActions.append(sizeField);

        const more = element('details', 'gtm-inspector-card-more');
        const moreSummary = element(
          'summary',
          'gtm-inspector-card-more-summary',
          '更多'
        );
        moreSummary.title = '标色、置顶、恢复自适应或隐藏';
        const moreMenu = element('div', 'gtm-inspector-card-more-menu');
        hide.classList.add('is-danger');
        moreMenu.append(...overflowActions, autoSize, bringFront, hide);
        more.append(moreSummary, moreMenu);
        more.addEventListener('toggle', () => {
          if (!more.open) return;
          const z = ++state.canvasZCounter;
          card.style.zIndex = String(z);
          tableCardLayout().cards[key] = {
            ...(tableCardLayout().cards[key] || {}),
            z
          };
          savePreferences();
        });
        cardActions.append(more);
        header.append(headingRow, cardActions);
      }

      const content = element(
        'div',
        `gtm-inspector-card-content${isTool ? ' is-tool-content' : ''}`
      );
      if (isTool) {
        try {
          const record = ensureToolInstance(definition);
          content.append(record.root);
          syncToolRecord(record);
        } catch (error) {
          content.append(element(
            'div',
            'gtm-inspector-error',
            `${definition.title} 加载失败：${error.message}`
          ));
        }
      } else {
        const editor = state.cellEditors.get(editorKey(item));
        if (editor) appendCellEditor(content, item, editor);
        else {
          appendCellContent(content, item);
          if (
            markableCell(item)
            && state.annotationOpenCards.has(textMarkKey(item))
          ) {
            content.prepend(makeTextMarkToolbar(
              item,
              displayTextForCell(item)
            ));
          }
        }
      }

      bindCardMove(card, header, item);
      card.append(header, content);
      [
        ['n', '从上边调整组件高度'],
        ['e', '从右边调整组件宽度'],
        ['s', '从下边调整组件高度'],
        ['w', '从左边调整组件宽度'],
        ['ne', '从右上角调整组件大小'],
        ['nw', '从左上角调整组件大小'],
        ['se', '从右下角调整组件大小'],
        ['sw', '从左下角调整组件大小']
      ].forEach(([direction, label]) => {
        const handle = element(
          'div',
          `gtm-inspector-card-size-handle is-${direction}`
        );
        handle.title = label;
        handle.dataset.direction = direction;
        bindCardResize(card, item, handle, direction);
        card.append(handle);
      });
      canvas.append(card);
      globalThis.__cyleScaleV1.surface(card).apply(layout);
      const previousContentScroll = contentScrollByKey.get(key);
      if (previousContentScroll) {
        content.scrollLeft = previousContentScroll.left;
        content.scrollTop = previousContentScroll.top;
      }
      entries.push({ cell: item, card, cardLayout: layout });
    });

    placeUnpositionedCards(entries);
    updateCanvasBounds();
    state.cards.scrollLeft = previousScroll.left;
    state.cards.scrollTop = previousScroll.top;
    if (typeof ResizeObserver === 'function') {
      let resizeTimer = 0;
      state.canvasResizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => updateCanvasBounds(), 30);
      });
      entries.forEach(({ card }) => state.canvasResizeObserver.observe(card));
    }
    setCanvasToolsActive();
    updateCanvasControls();
  }

  function renderStatus(message, kind = '') {
    if (!state.status) return;
    state.status.textContent = message;
    state.status.dataset.kind = kind;
  }

  function renderSummaryStatus() {
    if (!state.row) return;
    const duplicateCount = state.row.columns.filter(({ duplicate }) => duplicate).length;
    const visibleTools = canvasToolDefinitions().filter(({ key, id }) => (
      state.visibleColumns?.has(key || toolKey(id))
    )).length;
    const visibleFields = [...(state.visibleColumns || [])].filter((key) => (
      String(key).startsWith('column:')
    )).length;
    renderStatus([
      `已显示 ${visibleFields}/${state.row.columns.length} 列`,
      visibleTools ? `${visibleTools} 个工具` : '',
      '公共资料跨工具保留 · 页面布局',
      duplicateCount ? `检测到 ${duplicateCount} 个重复表头列` : '',
      state.live ? '自动跟随选区' : '已暂停跟随'
    ].filter(Boolean).join(' · '), duplicateCount ? 'warning' : 'success');
    updateTaskPanel();
  }

  function renderError(message) {
    deactivateCanvasTools();
    state.title.textContent = EXTENSION_NAME;
    state.subtitle.textContent = '读取失败';
    state.columnList.replaceChildren();
    // Keep the mounted editors/drafts available after a transient read failure.
    if (!state.row) {
      renderPageWorkspace();
      state.pageToolBody.replaceChildren(element('div', 'gtm-inspector-error', message));
    }
    renderStatus(message, 'error');
  }

  function render() {
    if (!state.row) return;
    state.title.textContent = EXTENSION_NAME;
    state.subtitle.textContent = [
      state.row.workbookName || '飞书表格',
      state.row.sheetName || `Sheet ${state.row.sheetNumber}`,
      `第 ${state.row.rowNumber} 行`,
      `${state.row.columns.length} 列`
    ].join(' · ');
    renderColumns();
    renderCards();
    renderSummaryStatus();
    updateTaskPanel();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GTM_INSPECTOR_PING') {
      sendResponse?.({ ok: true, open: state.open });
      return undefined;
    }
    if (['NATIVE_VIDEO_STATE', 'NATIVE_VIDEO_CLOSED'].includes(message?.type)) {
      const payload = message.payload || {};
      const native = state.publicNativeSessions?.get(payload.sessionId);
      if (native) {
        const coordinator = globalThis.__cyleMediaServiceV1.workspace.coordinator;
        if (message.type === 'NATIVE_VIDEO_CLOSED') {
          coordinator.remove(native.id); state.publicNativeSessions.delete(payload.sessionId);
          state.pageFields.get(columnKey(native.cell.columnIndex))?.mediaIds.forEach(id => coordinator.setEnabled(id, true));
          coordinator.seek(coordinator.currentTime);
        } else {
          native.target = { ...message.sourceTarget, playerId: payload.playerId };
          globalThis.__cyleMediaServiceV1.workspace.timebases.set(native.id, { fps: Number(payload.fps) || 0, frameTiming: null });
          const wasPaused = native.adapter.paused;
          Object.assign(native.adapter, { currentTime: Number(payload.mediaTime) || 0, duration: Number(payload.duration) || Infinity, paused: payload.paused !== false });
          const reason = payload.reason === 'seeking' || payload.reason === 'seeked' ? 'seeking'
            : wasPaused !== native.adapter.paused ? (native.adapter.paused ? 'pause' : 'play') : 'timeupdate';
          native.adapter.dispatchEvent(new Event(reason));
        }
      }
      state.toolInstances.forEach(({ instance }) => {
        instance?.handleNativeMessage?.(message, _sender);
      });
      return undefined;
    }
    if (message?.type === 'GTM_INSPECTOR_SELECTION_CHANGED') {
      scheduleRefresh();
      return undefined;
    }
    if (message?.type === 'GTM_INSPECTOR_TOGGLE') {
      setOpen(!state.open)
        .then(() => sendResponse?.({ ok: true, open: state.open }))
        .catch((error) => sendResponse?.({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === 'GTM_INSPECTOR_SHOW') {
      setOpen(true)
        .then(() => sendResponse?.({ ok: true, open: true }))
        .catch((error) => sendResponse?.({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === 'GTM_INSPECTOR_HIDE') {
      setOpen(false).then(() => sendResponse?.({ ok: true, open: false }));
      return true;
    }
    if (message?.type === 'GTM_INSPECTOR_REFRESH') {
      refreshRow()
        .then(() => sendResponse?.({ ok: true }))
        .catch((error) => sendResponse?.({ ok: false, error: error.message }));
      return true;
    }
    return undefined;
  });

  document.addEventListener('cyle:model-video-selected', rememberTableView);
  document.addEventListener(SELECTION_EVENT, scheduleRefresh);
  window.addEventListener('keydown', (event) => {
    if (
      (event.ctrlKey || event.metaKey)
      && event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      if (state.commandPalette?.hidden === false) closeCommandPalette();
      else openCommandPalette();
      return;
    }
    if (
      event.key === 'Escape'
      && state.commandPalette?.hidden === false
    ) {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (
      event.key === 'Escape'
      && state.fullscreen
      && !event.target.closest?.('input, textarea, select')
    ) {
      event.preventDefault();
      exitFullscreen();
    }
  });
  window.addEventListener('resize', () => {
    if (state.open && !state.minimized) {
      applyLayout();
      updateCanvasBounds();
    }
    state.toolInstances.forEach(({ instance }) => (
      instance?.handleViewportResize?.()
    ));
  });
  window.addEventListener('pagehide', () => {
    state.petMascot?.dispose();
    deactivateCanvasTools();
    disposeCanvasTools();
    state.panelResizeObserver?.disconnect?.();
    state.panelResizeObserver = null;
    state.harnessUnsubscribe?.();
    state.harnessUnsubscribe = null;
  });

  const draftStorageChanged = () => {
    clearTimeout(state.draftCenterTimer);
    state.draftCenterTimer = setTimeout(() => {
      if (state.draftCenter?.dialog.open) reloadDraftCenter();
      else if (state.open) updateStorageStatus();
    }, 400);
  };
  chrome.storage?.onChanged?.addListener(draftStorageChanged);

  const preferencesReady = loadPreferences().then(() => {
    renderLiveState();
    globalThis.__cyleDraftServiceV1?.cleanupExpired?.({
      namespace: null
    }).catch(() => {});
  });

  globalThis[INSPECTOR_KEY] = {
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen(!state.open),
    refresh: refreshRow,
    dispose() {
      state.petMascot?.dispose();
      state.petMascot = null;
      document.removeEventListener('cyle:model-video-selected', rememberTableView);
      state.questionFilters?.dispose();
      state.workspaceComposer?.mappingEditor?.dispose();
      clearTimeout(state.draftCenterTimer);
      chrome.storage?.onChanged?.removeListener(draftStorageChanged);
      state.draftCenter?.dialog.remove();
      clearTimeout(state.refreshTimer);
      state.refreshTimer = 0;
      disposeCanvasTools();
      globalThis.__cyleMediaServiceV1.workspace.coordinator.pause();
      globalThis.__cyleMediaServiceV1.workspace.coordinator.ids().forEach(id => globalThis.__cyleMediaServiceV1.workspace.coordinator.remove(id));
      state.publicNativeSessions?.clear();
      state.pageFields?.forEach(record => {
        record.resize?.dispose();
        record.content.querySelectorAll('video').forEach(video => globalThis.__cyleVideoControlsV1.dispose(video));
        globalThis.__cyleScaleV1.dispose(record.card);
      });
      window.removeEventListener('resize', state.pageResize);
      state.cards?.querySelectorAll('.gtm-inspector-card').forEach(card => globalThis.__cyleScaleV1.dispose(card));
      state.canvasResizeObserver?.disconnect?.();
      state.panelResizeObserver?.disconnect?.();
      state.harnessUnsubscribe?.();
      state.workspaceComposer?.dispose?.();
      state.workspaceComposer = null;
      state.root?.remove?.();
      state.open = false;
    },
    async readMappedFields() {
      if (!state.row || state.error) throw new Error('请先读取当前行');
      const mapping = globalThis.__cyleFieldMappingV1;
      return mapping.read(state.row, await mapping.load(state.row));
    },
    identifyQuestion(row) {
      const normalized = normalizeRow(row || {});
      const column = questionColumns(normalized)[0] || null;
      return {
        header: column?.syntheticRowQuestion
          ? ''
          : safeText(column?.header).trim(),
        value: questionCellValue(column, normalized),
        automaticRowNumber: Boolean(column?.syntheticRowQuestion)
      };
    },
    get open() {
      return state.open;
    }
  };
})();

