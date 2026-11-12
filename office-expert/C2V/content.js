(() => {
  const CONTENT_KEY = '__gtMapperContentBridgeV8';
  const REQUEST_EVENT = '__gt_mapper_request_v8';
  const RESPONSE_EVENT = '__gt_mapper_response_v8';
  const SELECTION_EVENT = '__gt_mapper_selection_changed_v8';

  if (globalThis[CONTENT_KEY]) return;
  globalThis[CONTENT_KEY] = true;
  let requestSequence = 0;

  document.addEventListener(SELECTION_EVENT, (event) => {
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({
        type: 'SHEET_SELECTION_CHANGED',
        position: event.detail
      }).catch(() => {});
    } catch (_error) {}
  });

  function callPageBridge(action, payload = {}) {
    return new Promise((resolve) => {
      const requestId = (
        action === 'writeCell'
        && payload?.operationId
      ) ? String(payload.operationId) : `gtm_${Date.now()}_${++requestSequence}`;
      const timeoutMs = action === 'resolveAttachmentUrl'
        ? 35000
        : action === 'openNativeVideo'
          ? 8000
        : action === 'readSheetRowByKey'
          ? 10000
        : action === 'readQuestionNavigation'
          ? 10000
        : action === 'writeCell'
            ? 12000
          : 3000;
      const timeout = window.setTimeout(() => {
        document.removeEventListener(RESPONSE_EVENT, handleResponse);
        resolve({ ok: false, error: '飞书页面桥接超时' });
      }, timeoutMs);

      function handleResponse(event) {
        if (event.detail?.requestId !== requestId) return;
        window.clearTimeout(timeout);
        document.removeEventListener(RESPONSE_EVENT, handleResponse);
        resolve(event.detail.result);
      }

      document.addEventListener(RESPONSE_EVENT, handleResponse);
      document.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
        detail: { requestId, action, payload }
      }));
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'READ_ACTIVE_ROW') {
      callPageBridge('readActiveRow').then(sendResponse);
      return true;
    }
    if (message?.type === 'READ_SHEET_ROW_BY_KEY') {
      callPageBridge('readSheetRowByKey', message.payload).then(sendResponse);
      return true;
    }
    if (message?.type === 'READ_QUESTION_NAVIGATION') {
      callPageBridge('readQuestionNavigation', message.payload).then(sendResponse);
      return true;
    }
    if (message?.type === 'GET_ACTIVE_POSITION') {
      callPageBridge('getActivePosition').then(sendResponse);
      return true;
    }
    if (message?.type === 'SELECT_ROW') {
      callPageBridge('selectRow', message.payload).then(sendResponse);
      return true;
    }
    if (
      message?.type === 'WRITE_ACTIVE_ROW_CELL'
      || message?.type === 'WRITE_SHEET_CELL'
    ) {
      const payload = {
        ...(message.payload || {}),
        operationId: String(
          message.payload?.operationId
          || globalThis.crypto?.randomUUID?.()
          || `sheet-write-${Date.now()}-${++requestSequence}`
        )
      };
      callPageBridge('writeCell', payload).then(sendResponse);
      return true;
    }
    if (message?.type === 'RESOLVE_ATTACHMENT_URL') {
      callPageBridge('resolveAttachmentUrl', message.payload).then(sendResponse);
      return true;
    }
    if (message?.type === 'OPEN_NATIVE_VIDEO') {
      callPageBridge('openNativeVideo', message.payload).then(sendResponse);
      return true;
    }
  });
})();
