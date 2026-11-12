(() => {
  const BRIDGE_KEY = '__gtMapperBridgeV8';
  const REQUEST_EVENT = '__gt_mapper_request_v8';
  const RESPONSE_EVENT = '__gt_mapper_response_v8';
  const SELECTION_EVENT = '__gt_mapper_selection_changed_v8';

  if (window[BRIDGE_KEY]) return;
  window[BRIDGE_KEY] = true;

  const adapter = window.__gtMapperFeishuSheetAdapterV5;
  if (!adapter) throw new Error('飞书表格页面适配器未加载');

  let selectionFrame = 0;
  let lastSelectionKey = '';
  const writeOperations = new Map();

  function publishSelection() {
    selectionFrame = 0;
    try {
      const position = adapter.getActivePosition();
      const key = `${position.sheetIndex}:${position.rowIndex}:${position.colIndex}`;
      if (key === lastSelectionKey) return;
      lastSelectionKey = key;
      document.dispatchEvent(new CustomEvent(SELECTION_EVENT, {
        detail: position
      }));
    } catch (_error) {}
  }

  function scheduleSelectionPublish() {
    if (selectionFrame) cancelAnimationFrame(selectionFrame);
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = requestAnimationFrame(publishSelection);
    });
  }

  function bindSelectionEvents() {
    adapter.bindSelectionChanged(scheduleSelectionPublish);
  }

  function runWriteOperation(payload = {}) {
    const operationId = String(payload.operationId || '');
    if (!operationId) {
      return Promise.resolve({
        ok: false,
        error: '写回缺少操作标识，已阻止不安全写入'
      });
    }
    const signature = JSON.stringify({
      sheetId: payload.sheetId ?? '',
      sheetIndex: payload.sheetIndex ?? null,
      row: payload.row ?? null,
      col: payload.col ?? null,
      value: payload.value ?? '',
      expectedHeader: payload.expectedHeader ?? '',
      expectedValue: payload.expectedValue ?? '',
      expectedDependencies: payload.expectedDependencies ?? [],
      valueType: payload.valueType ?? '',
      dropdownSelection: payload.dropdownSelection === true
    });
    const existing = writeOperations.get(operationId);
    if (existing) {
      if (existing.signature !== signature) {
        return Promise.resolve({
          ok: false,
          error: '写回操作标识被用于不同内容，已阻止冲突写入'
        });
      }
      return existing.promise;
    }
    const record = {
      promise: Promise.resolve().then(() => adapter.writeCell(payload)),
      signature,
      completedAt: 0
    };
    writeOperations.set(operationId, record);
    const scheduleCleanup = () => {
      record.completedAt = Date.now();
      window.setTimeout(() => {
        if (writeOperations.get(operationId) === record) {
          writeOperations.delete(operationId);
        }
      }, 120000);
    };
    record.promise.then(scheduleCleanup, scheduleCleanup);
    return record.promise;
  }

  document.addEventListener('pointerup', scheduleSelectionPublish, true);
  document.addEventListener('keyup', (event) => {
    if (
      event.key.startsWith('Arrow')
      || ['Enter', 'Tab', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)
    ) {
      scheduleSelectionPublish();
    }
  }, true);
  bindSelectionEvents();
  window.setInterval(bindSelectionEvents, 1500);

  document.addEventListener(REQUEST_EVENT, async (event) => {
    const { requestId, action, payload } = event.detail || {};
    let result;
    try {
      result = action === 'readActiveRow'
        ? adapter.readActiveRow()
        : action === 'readSheetRowByKey'
          ? adapter.readSheetRowByKey(payload)
        : action === 'readQuestionNavigation'
          ? adapter.readQuestionNavigation(payload)
        : action === 'getActivePosition'
          ? adapter.getActivePosition()
          : action === 'selectRow'
              ? adapter.selectRow(payload)
              : action === 'writeCell'
              ? await runWriteOperation(payload)
              : action === 'openNativeVideo'
                ? await adapter.openNativeVideo(payload)
              : action === 'resolveAttachmentUrl'
                ? await adapter.resolveAttachmentUrl(payload)
              : { ok: false, error: `未知操作：${action}` };
    } catch (error) {
      result = { ok: false, error: error.message };
    }

    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: { requestId, result }
    }));
  });
})();
