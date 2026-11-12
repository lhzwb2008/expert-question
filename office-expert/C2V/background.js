import './runtime/block-sdk.js';
import './runtime/block-catalog.js';
import './services/storage-service.js';
import { buildTableKey } from './runtime/table-identity.js';
import { detectVideoFps } from './runtime/video-frame-rate.js';

const EXTENSION_NAME = chrome.runtime.getManifest?.().name || 'C2V';

const PAGE_BRIDGE_FILES = [
  'page-adapters/feishu-sheet.js',
  'page-bridge.js'
];
const CONTENT_BRIDGE_FILES = [
  'content.js'
];
const INSPECTOR_SHELL_FILES = [
  'content/lucide-icons.js',
  'runtime/block-sdk.js',
  'runtime/block-catalog.js',
  'services/storage-service.js',
  'services/workspace-service.js',
  'services/draft-service.js',
  'services/writeback-service.js',
  'services/media-service.js',
  'content/scale-controller.js',
  'content/video-controls.js',
  'services/timeline-service.js',
  'services/host-service.js',
  'services/legacy-storage-adapter.js',
  'runtime/block-isolation.js',
  'content/harness-runtime.js',
  'content/canvas-tool-registry.js',
  'content/builtin-canvas-tools.js',
  'content/composer-styles.js',
  'services/human-rubric-service.js',
  'content/human-rubric-editor.js',
  'content/workspace-composer.js',
  'services/field-mapping-service.js',
  'content/field-mapping-panel.js',
  'content/question-filters.js',
  'content/pet-mascot.js',
  'content/sheet-inspector.js'
];
const INSPECTOR_SHELL_CSS = [
  'content/sheet-inspector.css',
  'content/workbench-v2.css',
  'content/video-controls.css',
  'content/pet-themes.css',
  'content/pet-couture.css'
];
const HARNESS_BLOCKS = Object.freeze(Object.fromEntries(
  (globalThis.__annotationHarnessBlockCatalogV1 || []).map(({ id, files }) => [
    id,
    Object.freeze([...files])
  ])
));
const bridgeFrames = new Map();
const nativeVideoWaiters = new Map();

async function setActionStatus(tabId, {
  badge = '',
  color = '#ef4444',
  title = `打开 ${EXTENSION_NAME}`
} = {}) {
  if (!Number.isInteger(tabId)) return;
  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text: String(badge || '') }),
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
    chrome.action.setTitle({ tabId, title })
  ]);
}

async function ensureInspectorShell(tabId) {
  const sendPing = () => chrome.tabs.sendMessage(
    tabId,
    { type: 'GTM_INSPECTOR_PING' },
    { frameId: 0 }
  );
  try {
    const response = await sendPing();
    if (response?.ok) return;
  } catch (_error) {}
  await Promise.all([
    chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'ISOLATED',
      files: INSPECTOR_SHELL_FILES
    }),
    chrome.scripting.insertCSS({
      target: { tabId, frameIds: [0] },
      files: INSPECTOR_SHELL_CSS
    })
  ]);
}

function waitForNativeVideo(sessionId, timeoutMs = 9000) {
  nativeVideoWaiters.get(sessionId)?.(null);
  let timer;
  let settled = false;
  let finish;
  const promise = new Promise((resolve) => {
    finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (nativeVideoWaiters.get(sessionId) === finish) {
        nativeVideoWaiters.delete(sessionId);
      }
      resolve(value);
    };
    nativeVideoWaiters.set(sessionId, finish);
    timer = setTimeout(() => finish(null), timeoutMs);
  });
  return {
    promise,
    cancel: () => finish?.(null)
  };
}

function resolveNativeVideoWaiter(message, sender) {
  if (message?.type !== 'NATIVE_VIDEO_STATE') return;
  const sessionId = String(message.payload?.sessionId || '');
  const finish = nativeVideoWaiters.get(sessionId);
  if (!finish) return;
  finish({
    ...message.payload,
    sourceTarget: {
      tabId: sender.tab?.id,
      frameId: sender.frameId
    }
  });
}

function isSupportedSheetTab(tab) {
  if (!tab?.id || !tab.url) return false;
  try {
    const url = new URL(tab.url);
    return /(?:^|\.)feishu\.cn$|(?:^|\.)larksuite\.com$|(?:^|\.)larkoffice\.com$|(?:^|\.)byted\.org$|(?:^|\.)bytedance\.com$|(?:^|\.)volces\.com$/.test(url.hostname);
  } catch (_error) {
    return false;
  }
}

async function getActiveSheetTab(preferredTabId = null) {
  if (Number.isInteger(preferredTabId)) {
    try {
      const preferred = await chrome.tabs.get(preferredTabId);
      if (isSupportedSheetTab(preferred)) return preferred;
    } catch (_error) {}
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs.find(isSupportedSheetTab);
  if (!tab?.id) {
    throw new Error('请先打开飞书电子表格，或带 sheet 参数的 Wiki 表格页面');
  }
  return tab;
}

async function findSpreadFrame(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'MAIN',
    func: () => {
      const spread = window.spread;
      let host = null;
      try {
        host = spread?.getHost?.() || spread?._host || null;
      } catch (_error) {}
      const rect = host?.getBoundingClientRect?.();
      const style = host ? getComputedStyle(host) : null;
      const hostVisible = Boolean(
        rect
        && rect.width > 80
        && rect.height > 45
        && style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && Number(style?.opacity || 1) > 0
      );
      const active = document.activeElement;
      return {
        hasSpread: Boolean(spread?.sheets?.length),
        href: location.href,
        hasFocus: document.hasFocus(),
        focusWithin: Boolean(host && active && host.contains(active)),
        hostVisible,
        hostArea: hostVisible ? rect.width * rect.height : 0
      };
    }
  });
  const candidates = results.filter(({ result }) => result?.hasSpread);
  if (!candidates.length) {
    throw new Error('当前页面未检测到飞书电子表格，请打开包含表格的页面');
  }
  const visible = candidates.filter(({ result }) => result.hostVisible);
  const focusWithin = candidates.filter(({ result }) => result.focusWithin);
  const focusedFrames = candidates.filter(({ result }) => result.hasFocus);
  const found = focusWithin.length === 1
    ? focusWithin[0]
    : focusedFrames.length === 1
      ? focusedFrames[0]
      : visible.length === 1
        ? visible[0]
        : candidates.length === 1
          ? candidates[0]
          : null;
  if (!found) {
    throw new Error('当前页面同时检测到多个飞书表格，请先点击要操作的表格后重试');
  }
  return {
    frameId: found.frameId ?? 0,
    frameUrl: found.result?.href || ''
  };
}

async function ensureBridge(tabId, force = false) {
  const frame = await findSpreadFrame(tabId);
  const cached = bridgeFrames.get(tabId);
  if (
    !force
    && cached
    && cached.frameId === frame.frameId
    && cached.frameUrl === frame.frameUrl
  ) return cached;
  await Promise.all([
    chrome.scripting.executeScript({
      target: { tabId, frameIds: [frame.frameId] },
      world: 'MAIN',
      files: PAGE_BRIDGE_FILES
    }),
    chrome.scripting.executeScript({
      target: { tabId, frameIds: [frame.frameId] },
      world: 'ISOLATED',
      files: CONTENT_BRIDGE_FILES
    })
  ]);
  bridgeFrames.set(tabId, frame);
  return frame;
}

async function toggleInspector(tabId) {
  if (!Number.isInteger(tabId)) {
    throw new Error('当前标签页不可用');
  }
  const tab = await chrome.tabs.get(tabId);
  if (!isSupportedSheetTab(tab)) {
    throw new Error('请先打开飞书电子表格，或带表格的 Wiki 页面');
  }
  await ensureInspectorShell(tabId);
  const response = await chrome.tabs.sendMessage(
    tabId,
    { type: 'GTM_INSPECTOR_TOGGLE' },
    { frameId: 0 }
  );
  if (!response?.ok) {
    throw new Error(response?.error || `无法打开 ${EXTENSION_NAME}`);
  }
  await setActionStatus(tabId);
  return response;
}

async function loadHarnessBlock(message, sender) {
  const blockId = String(message?.blockId || '');
  const files = HARNESS_BLOCKS[blockId];
  if (!files) throw new Error(`未知 Harness 积木：${blockId}`);
  const tabId = sender.tab?.id;
  const frameId = sender.frameId ?? 0;
  if (!Number.isInteger(tabId)) throw new Error('无法确定积木加载目标页面');
  await ensureBridge(tabId);

  await Promise.all([
    chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: 'ISOLATED',
      files
    }),
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'ISOLATED',
      files: ['content/native-video-controller.js']
    }),
    chrome.scripting.insertCSS({
      target: { tabId, allFrames: true },
      files: ['content/native-video-controller.css']
    })
  ]);
  return { ok: true, blockId, files };
}

async function forwardToSheet(message, preferredTabId = null) {
  const tab = await getActiveSheetTab(preferredTabId);
  let response;
  let frameId = 0;
  let frameUrl = '';
  const canRetry = ![
    'WRITE_ACTIVE_ROW_CELL',
    'WRITE_SHEET_CELL',
    'RESOLVE_ATTACHMENT_URL'
  ].includes(message?.type);
  const attempts = canRetry ? 8 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    ({ frameId, frameUrl } = await ensureBridge(tab.id, attempt > 0));
    if (['WRITE_ACTIVE_ROW_CELL', 'WRITE_SHEET_CELL'].includes(message?.type)) {
      const target = message.payload || {};
      if (target.expectedTableKey && target.expectedTableKey !== buildTableKey(frameUrl || tab.url, target.sheetIndex, target.sheetId)) {
        return { ok: false, error: '当前文档已切换，请重新读取目标表格后再回写' };
      }
      if (Number.isInteger(target.sourceFrameId) && target.sourceFrameId !== frameId) {
        return { ok: false, error: '表格所在页面已切换，请重新读取目标表格后再回写' };
      }
    }
    try {
      response = await chrome.tabs.sendMessage(tab.id, message, { frameId });
    } catch (error) {
      response = { ok: false, error: error.message };
    }
    if (response?.ok) {
      return [
        'READ_ACTIVE_ROW',
        'READ_SHEET_ROW_BY_KEY',
        'READ_QUESTION_NAVIGATION',
        'GET_ACTIVE_POSITION',
        'SELECT_ROW'
      ].includes(message.type)
        ? {
          ...response,
          tableKey: buildTableKey(
            frameUrl || tab.url,
            response.sheetIndex,
            response.sheetId
          ),
          sourceFrameId: frameId,
          sourcePageType: new URL(tab.url).pathname.startsWith('/wiki/') ? 'wiki' : 'sheet'
        }
        : response;
    }
    if (!/未检测到|尚未就绪|超时|Receiving end does not exist/.test(response?.error || '')) {
      return response;
    }
    bridgeFrames.delete(tab.id);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return response || { ok: false, error: '飞书表格尚未就绪，请稍后重试' };
}

async function broadcastNativeVideo(message, preferredTabId = null) {
  const tab = await getActiveSheetTab(preferredTabId);
  const frame = await ensureBridge(tab.id);
  const frameIds = [...new Set([0, frame.frameId])];
  const results = await Promise.allSettled(
    frameIds.map((frameId) => chrome.tabs.sendMessage(
      tab.id,
      message,
      { frameId }
    ))
  );
  const failure = results.find(({ status, reason }) => (
    status === 'rejected'
    && !/Receiving end does not exist/.test(reason?.message || '')
  ));
  if (failure?.status === 'rejected') throw failure.reason;
  return { ok: true };
}

async function sendNativeVideoCommand(message, preferredTabId = null) {
  const rawTabId = message.payload?.tabId;
  const rawFrameId = message.payload?.frameId;
  const requestedTabId = rawTabId === null || rawTabId === undefined
    ? NaN
    : Number(rawTabId);
  const requestedFrameId = rawFrameId === null || rawFrameId === undefined
    ? NaN
    : Number(rawFrameId);
  let tabId;
  let frameId;
  if (Number.isInteger(requestedTabId) && Number.isInteger(requestedFrameId)) {
    tabId = requestedTabId;
    frameId = requestedFrameId;
  } else {
    const tab = await getActiveSheetTab(preferredTabId);
    const frame = await ensureBridge(tab.id);
    tabId = tab.id;
    frameId = frame.frameId;
  }
  const response = await chrome.tabs.sendMessage(
    tabId,
    message,
    { frameId }
  );
  if (!response?.ok) {
    throw new Error(response?.error || '目标原生播放器未执行命令');
  }
  return response;
}

async function openNativeVideo(message, preferredTabId = null) {
  const sessionId = String(message.payload?.sessionId || '');
  const waiter = sessionId ? waitForNativeVideo(sessionId) : null;
  try {
    await broadcastNativeVideo({
      type: 'NATIVE_VIDEO_PREPARE',
      payload: message.payload
    }, preferredTabId);
    const sheetPromise = forwardToSheet(message, preferredTabId)
      .catch((error) => ({ ok: false, error: error.message }));
    if (!waiter) return sheetPromise;
    const first = await Promise.race([
      sheetPromise.then((result) => ({ type: 'sheet', result })),
      waiter.promise.then((result) => ({ type: 'native', result }))
    ]);
    if (first.type === 'native' && first.result) {
      return {
        ok: true,
        opened: true,
        playerId: first.result.playerId || '',
        sourceTarget: first.result.sourceTarget
      };
    }
    if (first.result?.ok) {
      waiter.cancel();
      return first.result;
    }
    const native = await waiter.promise;
    if (native) {
      return {
        ok: true,
        opened: true,
        playerId: native.playerId || '',
        sourceTarget: native.sourceTarget
      };
    }
    return first.result;
  } catch (error) {
    waiter?.cancel();
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CYLE_STORAGE_MUTATE') {
    if (sender.id !== chrome.runtime.id || !['writeRecord', 'deleteRecord'].includes(message.method)) {
      sendResponse({ ok: false, code: 'INVALID_ARGUMENT', error: '无效的本机存储请求' });
      return;
    }
    const store = globalThis.__cyleStorageServiceV1.create(message.options || {});
    const task = message.method === 'deleteRecord'
      ? store.deleteRecord(message.input?.input, message.input?.options)
      : store.writeRecord(message.input);
    task.then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, code: error.code, error: error.message }));
    return true;
  }
  if (message?.type === 'GET_HUMAN_RUBRIC_DEFAULT') {
    fetch(chrome.runtime.getURL('docs/config-drafts/human-rubric.v1.json'))
      .then(response => { if (!response.ok) throw new Error('默认评分配置读取失败'); return response.json(); })
      .then(config => sendResponse({ok:true,config}))
      .catch(error => sendResponse({ok:false,error:error.message}));
    return true;
  }
  if (message?.type === 'HARNESS_LOAD_BLOCK') {
    loadHarnessBlock(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (['NATIVE_VIDEO_STATE', 'NATIVE_VIDEO_CLOSED'].includes(message?.type)) {
    resolveNativeVideoWaiter(message, sender);
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(
        sender.tab.id,
        {
          ...message,
          sourceTarget: {
            tabId: sender.tab.id,
            frameId: sender.frameId
          }
        },
        { frameId: 0 }
      ).catch(() => {});
    }
    return;
  }
  if (message?.type === 'SHEET_SELECTION_CHANGED') {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(
        sender.tab.id,
        {
          type: 'GTM_INSPECTOR_SELECTION_CHANGED',
          position: message.position
        },
        { frameId: 0 }
      ).catch(() => {});
    }
    return;
  }
  if (message?.type === 'OPEN_NATIVE_VIDEO') {
    openNativeVideo(message, sender.tab?.id)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'DETECT_VIDEO_FPS') {
    const url = String(message.payload?.url || '');
    if (!/^https?:\/\//i.test(url)) {
      sendResponse({ ok: false, error: '视频地址无效' });
      return;
    }
    detectVideoFps(url)
      .then((meta) => sendResponse(
        meta?.fps
          ? { ok: true, ...meta }
          : { ok: false, error: '未从视频容器中读取到帧率' }
      ))
      .catch((error) => sendResponse({
        ok: false,
        error: error.message || '视频帧率探测失败'
      }));
    return true;
  }
  if ([
    'SET_NATIVE_VIDEO_FPS',
    'SEEK_NATIVE_VIDEO',
    'PLAY_NATIVE_VIDEO',
    'PAUSE_NATIVE_VIDEO',
    'SET_NATIVE_VIDEO_RATE'
  ].includes(message?.type)) {
    sendNativeVideoCommand(message, sender.tab?.id)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (![
    'READ_ACTIVE_ROW',
    'READ_SHEET_ROW_BY_KEY',
    'READ_QUESTION_NAVIGATION',
    'GET_ACTIVE_POSITION',
    'SELECT_ROW',
    'WRITE_ACTIVE_ROW_CELL',
    'WRITE_SHEET_CELL',
    'RESOLVE_ATTACHMENT_URL'
  ].includes(message?.type)) return;

  forwardToSheet(message, sender.tab?.id)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.action.onClicked.addListener((tab) => {
  toggleInspector(tab?.id).catch((error) => {
    setActionStatus(tab?.id, {
      badge: '!',
      title: `${EXTENSION_NAME}：${error.message || '打开失败'}`
    });
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-inspector') return;
  getActiveSheetTab()
    .then((tab) => toggleInspector(tab.id))
    .catch((error) => {
      getActiveSheetTab()
        .then((tab) => setActionStatus(tab.id, {
          badge: '!',
          title: `${EXTENSION_NAME}：${error.message || '打开失败'}`
        }))
        .catch(() => {});
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  bridgeFrames.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    bridgeFrames.delete(tabId);
    setActionStatus(tabId);
  }
});
