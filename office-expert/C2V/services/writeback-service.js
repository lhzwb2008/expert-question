(() => {
  'use strict';

  const globalObject = globalThis;
  const root = globalObject.__cyleServicesV1 || (
    globalObject.__cyleServicesV1 = {}
  );
  if (root.writeback?.apiVersion === 1) {
    globalObject.__cyleWritebackServiceV1 = root.writeback;
    return;
  }

  const API_VERSION = 1;
  let sequence = 0;

  const hasOwn = (value, key) => (
    Object.prototype.hasOwnProperty.call(value || {}, key)
  );

  function createError(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'CyleWritebackError';
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function createOperationId(prefix = 'cyle-write') {
    const safePrefix = String(prefix || 'cyle-write')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      || 'cyle-write';
    const uuid = globalObject.crypto?.randomUUID?.();
    if (uuid) return `${safePrefix}-${uuid}`;
    sequence += 1;
    return `${safePrefix}-${Date.now()}-${sequence}-${
      Math.random().toString(16).slice(2)
    }`;
  }

  function canonicalize(value, seen = new WeakSet()) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value !== 'object') {
      if (typeof value === 'number' && Number.isNaN(value)) return 'number:NaN';
      return `${typeof value}:${JSON.stringify(value)}`;
    }
    if (value instanceof Date) return `date:${value.toISOString()}`;
    if (seen.has(value)) throw createError(
      'UNCOMPARABLE_VALUE',
      '无法比较循环引用值'
    );
    seen.add(value);
    const result = Array.isArray(value)
      ? `[${value.map((item) => canonicalize(item, seen)).join(',')}]`
      : `{${Object.keys(value).sort().map((key) => (
        `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`
      )).join(',')}}`;
    seen.delete(value);
    return result;
  }

  function defaultEquals(left, right) {
    if (Object.is(left, right)) return true;
    if (
      (left === null || left === undefined || left === '')
      && (right === null || right === undefined || right === '')
    ) return true;
    if (
      (typeof left === 'object' && left !== null)
      || (typeof right === 'object' && right !== null)
    ) {
      try {
        return canonicalize(left) === canonicalize(right);
      } catch (_error) {
        return false;
      }
    }
    return String(left ?? '') === String(right ?? '');
  }

  function normalizeReadResult(result) {
    if (
      result
      && typeof result === 'object'
      && hasOwn(result, 'ok')
      && result.ok === false
    ) {
      throw createError(
        'READ_FAILED',
        result.error || result.message || '回读失败',
        { response: result }
      );
    }
    if (result && typeof result === 'object') {
      if (hasOwn(result, 'value')) return result.value;
      if (hasOwn(result, 'actualValue')) return result.actualValue;
      if (hasOwn(result, 'currentValue')) return result.currentValue;
      if (hasOwn(result, 'rawValue')) return result.rawValue;
      if (hasOwn(result, 'displayValue')) return result.displayValue;
    }
    return result;
  }

  function normalizeWriteResult(result) {
    if (result === undefined || result === null) return { ok: true };
    if (result === false) return { ok: false, error: '写入接口返回失败' };
    if (result === true) return { ok: true };
    if (typeof result === 'object') {
      return hasOwn(result, 'ok') ? result : { ok: true, ...result };
    }
    return { ok: true, value: result };
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => {
      globalObject.setTimeout(resolve, Math.max(0, milliseconds));
    });
  }

  function createChromeMessageWriter(messageType = 'WRITE_SHEET_CELL') {
    return async (payload) => {
      const sendMessage = globalObject.chrome?.runtime?.sendMessage;
      if (typeof sendMessage !== 'function') {
        throw createError(
          'WRITE_UNAVAILABLE',
          'chrome.runtime.sendMessage 不可用'
        );
      }
      return sendMessage.call(globalObject.chrome.runtime, {
        type: messageType,
        payload
      });
    };
  }

  function createChromeMessageReader(messageType = 'READ_SHEET_ROW_BY_KEY') {
    return async (payload) => {
      const sendMessage = globalObject.chrome?.runtime?.sendMessage;
      if (typeof sendMessage !== 'function') {
        throw createError(
          'READ_UNAVAILABLE',
          'chrome.runtime.sendMessage 不可用'
        );
      }
      return sendMessage.call(globalObject.chrome.runtime, {
        type: messageType,
        payload
      });
    };
  }

  function createWritebackService(options = {}) {
    const write = options.write || options.writer || null;
    const read = options.read || options.reader || null;
    const equals = typeof options.equals === 'function'
      ? options.equals
      : defaultEquals;
    const defaultRetries = Number.isInteger(options.verifyRetries)
      ? Math.max(0, options.verifyRetries)
      : 2;
    const defaultDelayMs = Number.isFinite(Number(options.verifyDelayMs))
      ? Math.max(0, Number(options.verifyDelayMs))
      : 100;
    const inFlight = new Map();
    const completed = new Map();
    const completedTtlMs = Number.isFinite(Number(options.completedTtlMs))
      ? Math.max(0, Number(options.completedTtlMs))
      : 120000;

    function operationSignature(input) {
      return canonicalize({
        target: input.target || null,
        value: input.value,
        expectedValue: input.expectedValue
      });
    }

    function createResult(base, patch = {}) {
      return {
        ok: false,
        status: 'failed',
        operationId: base.operationId,
        startedAt: base.startedAt,
        finishedAt: new Date().toISOString(),
        target: base.target,
        expectedValue: base.expectedValue,
        requestedValue: base.value,
        beforeValue: base.beforeValue,
        actualValue: base.actualValue,
        conflict: false,
        written: false,
        committed: false,
        verified: false,
        unchanged: false,
        attempts: base.attempts || 0,
        ...patch
      };
    }

    async function run(input = {}) {
      if (!hasOwn(input, 'expectedValue')) {
        return createResult({
          ...input,
          operationId: input.operationId || createOperationId(),
          startedAt: new Date().toISOString()
        }, {
          status: 'invalid',
          errorCode: 'EXPECTED_VALUE_REQUIRED',
          error: '写回必须提供 expectedValue'
        });
      }
      if (!hasOwn(input, 'value')) {
        return createResult({
          ...input,
          operationId: input.operationId || createOperationId(),
          startedAt: new Date().toISOString()
        }, {
          status: 'invalid',
          errorCode: 'VALUE_REQUIRED',
          error: '写回必须提供 value'
        });
      }

      const operationId = String(
        input.operationId || createOperationId(input.operationPrefix)
      ).trim();
      if (!operationId) {
        throw createError('INVALID_OPERATION_ID', 'operationId 不能为空');
      }
      const signature = operationSignature(input);
      const existing = inFlight.get(operationId) || completed.get(operationId);
      if (existing) {
        if (existing.signature !== signature) {
          return createResult({
            ...input,
            operationId,
            startedAt: new Date().toISOString()
          }, {
            status: 'operation-conflict',
            conflict: true,
            errorCode: 'OPERATION_ID_CONFLICT',
            error: 'operationId 已被用于不同的写回内容'
          });
        }
        return existing.promise;
      }

      const record = { signature, promise: null, timer: 0 };
      record.promise = (async () => {
        const startedAt = new Date().toISOString();
        const base = {
          operationId,
          startedAt,
          target: input.target || null,
          expectedValue: input.expectedValue,
          value: input.value,
          beforeValue: undefined,
          actualValue: undefined,
          attempts: 0
        };
        const writer = input.write || input.writer || write;
        const reader = input.read || input.reader || read;
        const comparator = typeof input.equals === 'function'
          ? input.equals
          : equals;
        if (typeof writer !== 'function') {
          return createResult(base, {
            status: 'write-unavailable',
            errorCode: 'WRITE_UNAVAILABLE',
            error: '未配置写入函数'
          });
        }

        try {
          if (typeof reader === 'function' && input.preflight !== false) {
            base.beforeValue = normalizeReadResult(await reader({
              operationId,
              phase: 'preflight',
              target: input.target,
              ...input.readPayload
            }));
            if (!comparator(base.beforeValue, input.expectedValue)) {
              return createResult(base, {
                status: 'conflict',
                conflict: true,
                errorCode: 'EXPECTED_VALUE_CONFLICT',
                error: '原值已变化，已阻止写回',
                beforeValue: base.beforeValue,
                actualValue: base.beforeValue
              });
            }
          }

          const writePayload = {
            ...(input.payload || input.writePayload || {}),
            ...(input.target || {}),
            operationId,
            value: input.value,
            expectedValue: input.expectedValue
          };
          const writeResponse = normalizeWriteResult(await writer(writePayload));
          if (writeResponse.ok === false) {
            return createResult(base, {
              status: writeResponse.conflict ? 'conflict' : 'write-failed',
              conflict: writeResponse.conflict === true,
              errorCode: writeResponse.code
                || (writeResponse.conflict
                  ? 'EXPECTED_VALUE_CONFLICT'
                  : 'WRITE_FAILED'),
              error: writeResponse.error
                || writeResponse.message
                || '写回失败',
              response: writeResponse,
              actualValue: writeResponse.actualValue
            });
          }

          base.beforeValue = hasOwn(writeResponse, 'previousValue')
            ? writeResponse.previousValue
            : base.beforeValue;
          const adapterVerified = writeResponse.verified === true
            && hasOwn(writeResponse, 'actualValue')
            && comparator(writeResponse.actualValue, input.value);
          if (adapterVerified && input.forceReadback !== true) {
            return createResult(base, {
              ok: true,
              status: writeResponse.unchanged ? 'unchanged' : 'verified',
              written: writeResponse.committed !== false,
              committed: writeResponse.committed !== false,
              verified: true,
              unchanged: writeResponse.unchanged === true,
              actualValue: writeResponse.actualValue,
              response: writeResponse
            });
          }

          if (typeof reader !== 'function') {
            if (input.requireReadback === true) {
              return createResult(base, {
                status: 'verification-unavailable',
                written: true,
                committed: writeResponse.committed !== false,
                errorCode: 'READBACK_UNAVAILABLE',
                error: '写入已提交，但未配置回读函数，无法确认结果',
                response: writeResponse
              });
            }
            return createResult(base, {
              ok: true,
              status: 'written-unverified',
              written: true,
              committed: writeResponse.committed !== false,
              verified: false,
              unchanged: writeResponse.unchanged === true,
              actualValue: writeResponse.actualValue,
              response: writeResponse
            });
          }

          const retries = Number.isInteger(input.verifyRetries)
            ? Math.max(0, input.verifyRetries)
            : defaultRetries;
          const delayMs = Number.isFinite(Number(input.verifyDelayMs))
            ? Math.max(0, Number(input.verifyDelayMs))
            : defaultDelayMs;
          let lastReadError = null;
          for (let attempt = 0; attempt <= retries; attempt += 1) {
            if (attempt > 0 && delayMs > 0) await sleep(delayMs);
            base.attempts = attempt + 1;
            try {
              base.actualValue = normalizeReadResult(await reader({
                operationId,
                phase: 'verify',
                attempt: attempt + 1,
                target: input.target,
                ...(input.readPayload || {})
              }));
              lastReadError = null;
              if (comparator(base.actualValue, input.value)) {
                return createResult(base, {
                  ok: true,
                  status: writeResponse.unchanged ? 'unchanged' : 'verified',
                  written: writeResponse.committed !== false,
                  committed: writeResponse.committed !== false,
                  verified: true,
                  unchanged: writeResponse.unchanged === true,
                  actualValue: base.actualValue,
                  response: writeResponse
                });
              }
            } catch (readError) {
              lastReadError = readError;
            }
          }
          return createResult(base, {
            status: 'verification-failed',
            written: true,
            committed: writeResponse.committed !== false,
            verified: false,
            errorCode: 'READBACK_MISMATCH',
            error: lastReadError?.message
              || '写入已提交，但回读值与目标值不一致',
            actualValue: base.actualValue,
            response: writeResponse
          });
        } catch (caught) {
          return createResult(base, {
            status: caught?.code === 'EXPECTED_VALUE_CONFLICT'
              ? 'conflict'
              : 'failed',
            conflict: caught?.code === 'EXPECTED_VALUE_CONFLICT',
            errorCode: caught?.code || 'WRITEBACK_ERROR',
            error: caught?.message || String(caught),
            cause: caught
          });
        }
      })();

      inFlight.set(operationId, record);
      const result = await record.promise;
      inFlight.delete(operationId);
      completed.set(operationId, record);
      if (completedTtlMs === 0) {
        completed.delete(operationId);
      } else {
        record.timer = globalObject.setTimeout(() => {
          if (completed.get(operationId) === record) {
            completed.delete(operationId);
          }
        }, completedTtlMs);
      }
      return result;
    }

    async function writeOrThrow(input = {}) {
      const result = await run(input);
      if (!result.ok) {
        throw createError(
          result.errorCode || 'WRITEBACK_FAILED',
          result.error || '写回失败',
          { result }
        );
      }
      return result;
    }

    function forgetOperation(operationId) {
      const key = String(operationId || '');
      const completedRecord = completed.get(key);
      if (completedRecord?.timer) {
        globalObject.clearTimeout(completedRecord.timer);
      }
      const removed = completed.delete(key);
      return { removed, operationId: key };
    }

    function clearCompleted() {
      for (const record of completed.values()) {
        if (record.timer) globalObject.clearTimeout(record.timer);
      }
      const removed = completed.size;
      completed.clear();
      return { removed };
    }

    return Object.freeze({
      apiVersion: API_VERSION,
      createOperationId,
      valuesEqual: equals,
      execute: run,
      write: run,
      writeAndVerify: run,
      writeOrThrow,
      forgetOperation,
      clearCompleted,
      get pendingCount() {
        return inFlight.size;
      },
      get completedCount() {
        return completed.size;
      }
    });
  }

  const defaultService = createWritebackService();
  const api = Object.freeze({
    apiVersion: API_VERSION,
    create: createWritebackService,
    createWritebackService,
    createOperationId,
    valuesEqual: defaultEquals,
    createChromeMessageWriter,
    createChromeMessageReader,
    default: defaultService,
    execute: (...args) => defaultService.execute(...args),
    write: (...args) => defaultService.write(...args),
    writeAndVerify: (...args) => defaultService.writeAndVerify(...args),
    writeOrThrow: (...args) => defaultService.writeOrThrow(...args),
    forgetOperation: (...args) => defaultService.forgetOperation(...args),
    clearCompleted: (...args) => defaultService.clearCompleted(...args)
  });

  root.writeback = api;
  root.WritebackService = api;
  globalObject.__cyleWritebackServiceV1 = api;
})();
