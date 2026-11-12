(() => {
  'use strict';

  const globalObject = globalThis;
  const root = globalObject.__cyleServicesV1 || (
    globalObject.__cyleServicesV1 = {}
  );
  if (root.storage?.apiVersion === 1) {
    globalObject.__cyleStorageServiceV1 = root.storage;
    return;
  }

  const API_VERSION = 1;
  const DEFAULT_SCHEMA_VERSION = 2;
  const DEFAULT_PREFIX = 'cyle';
  const DEFAULT_NAMESPACE = 'default';
  const FALLBACK_QUOTA_BYTES = 10 * 1024 * 1024;
  const locks = new Map();

  const hasOwn = (value, key) => (
    Object.prototype.hasOwnProperty.call(value || {}, key)
  );

  function createError(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'CyleStorageError';
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function requireText(value, label) {
    const result = String(value ?? '').trim();
    if (!result) {
      throw createError('INVALID_ARGUMENT', `${label} 不能为空`);
    }
    return result;
  }

  function parseDate(value, label, allowNull = true) {
    if ((value === null || value === undefined || value === '') && allowNull) {
      return null;
    }
    const timestamp = value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : Date.parse(String(value));
    if (!Number.isFinite(timestamp)) {
      throw createError('INVALID_ARGUMENT', `${label} 不是有效时间`);
    }
    return new Date(timestamp).toISOString();
  }

  function encodeSegment(value) {
    return encodeURIComponent(requireText(value, '存储 key 片段'));
  }

  function decodeSegment(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  }

  function canonicalize(value, seen = new WeakSet()) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const type = typeof value;
    if (type === 'string') return `string:${JSON.stringify(value)}`;
    if (type === 'boolean') return `boolean:${value}`;
    if (type === 'number') {
      if (Number.isNaN(value)) return 'number:NaN';
      if (value === Infinity) return 'number:Infinity';
      if (value === -Infinity) return 'number:-Infinity';
      if (Object.is(value, -0)) return 'number:-0';
      return `number:${value}`;
    }
    if (type === 'bigint') return `bigint:${value.toString()}`;
    if (type === 'symbol') return `symbol:${String(value.description || '')}`;
    if (type === 'function') return `function:${String(value)}`;
    if (value instanceof Date) return `date:${value.toISOString()}`;
    if (seen.has(value)) {
      throw createError('UNSERIALIZABLE_VALUE', '无法为循环引用计算指纹');
    }
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      result = `array:[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
    } else {
      const keys = Object.keys(value).sort();
      result = `object:{${keys.map((key) => (
        `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`
      )).join(',')}}`;
    }
    seen.delete(value);
    return result;
  }

  function fingerprint(value) {
    const input = canonicalize(value);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
      second ^= second >>> 13;
    }
    const left = (first >>> 0).toString(16).padStart(8, '0');
    const right = (second >>> 0).toString(16).padStart(8, '0');
    return `fp1-${left}${right}`;
  }

  function assertStorable(value) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new TypeError('顶层值不能为 undefined');
      }
    } catch (error) {
      throw createError(
        'UNSERIALIZABLE_VALUE',
        `数据无法写入 chrome.storage.local：${error.message}`,
        { cause: error }
      );
    }
  }

  function byteLength(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(text || '').byteLength;
    }
    return unescape(encodeURIComponent(text || '')).length;
  }

  function getDefaultArea() {
    const area = globalObject.chrome?.storage?.local;
    if (!area) {
      throw createError(
        'STORAGE_UNAVAILABLE',
        'chrome.storage.local 不可用，请确认扩展拥有 storage 权限'
      );
    }
    return area;
  }

  function callStorage(area, method, ...args) {
    if (!area || typeof area[method] !== 'function') {
      return Promise.reject(createError(
        'STORAGE_UNAVAILABLE',
        `chrome.storage.local.${method} 不可用`
      ));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        handler(value);
      };
      const callback = (result) => {
        const runtimeError = globalObject.chrome?.runtime?.lastError;
        if (runtimeError) {
          finish(
            reject,
            createError('STORAGE_ERROR', runtimeError.message || String(runtimeError))
          );
          return;
        }
        finish(resolve, result);
      };
      try {
        const returned = area[method](...args, callback);
        if (returned && typeof returned.then === 'function') {
          returned.then(
            (result) => finish(resolve, result),
            (error) => finish(
              reject,
              createError(
                'STORAGE_ERROR',
                error?.message || String(error),
                { cause: error }
              )
            )
          );
        }
      } catch (error) {
        finish(
          reject,
          createError(
            'STORAGE_ERROR',
            error?.message || String(error),
            { cause: error }
          )
        );
      }
    });
  }

  function runExclusive(key, task) {
    const previous = locks.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    locks.set(key, current);
    return current.finally(() => {
      if (locks.get(key) === current) locks.delete(key);
    });
  }

  function createStorageService(options = {}) {
    const schemaVersion = Number.isInteger(options.schemaVersion)
      && options.schemaVersion > 0
      ? options.schemaVersion
      : DEFAULT_SCHEMA_VERSION;
    const prefix = requireText(options.prefix || DEFAULT_PREFIX, 'prefix');
    const defaultNamespace = requireText(
      options.namespace || DEFAULT_NAMESPACE,
      'namespace'
    );
    const area = options.area || null;

    const storageArea = () => area || getDefaultArea();
    // Content scripts in different tabs cannot share the in-memory lock above.
    // Route mutations to the single extension worker; explicit test stores and
    // the worker itself continue to use the local implementation.
    async function workerMutation(method, input) {
      if (area || typeof globalObject.document === 'undefined'
        || typeof globalObject.chrome?.runtime?.getManifest !== 'function') return null;
      const response = await globalObject.chrome.runtime.sendMessage({
        type: 'CYLE_STORAGE_MUTATE', method, input,
        options: { prefix, namespace: defaultNamespace, schemaVersion }
      });
      if (!response?.ok) throw createError(response?.code || 'STORAGE_ERROR', response?.error || '本机备份服务不可用');
      return response.result;
    }

    function keyFor(input, fallbackScope = 'record') {
      const descriptor = typeof input === 'object' && input !== null
        ? input
        : { id: input };
      const scope = descriptor.scope || fallbackScope;
      const namespace = descriptor.namespace || defaultNamespace;
      const id = descriptor.id ?? descriptor.key;
      return [
        prefix,
        `v${schemaVersion}`,
        encodeSegment(scope),
        encodeSegment(namespace),
        encodeSegment(id)
      ].join(':');
    }

    function parseKey(storageKey) {
      const parts = String(storageKey || '').split(':');
      if (
        parts.length < 5
        || parts[0] !== prefix
        || parts[1] !== `v${schemaVersion}`
      ) {
        return null;
      }
      return {
        storageKey,
        schemaVersion,
        scope: decodeSegment(parts[2]),
        namespace: decodeSegment(parts[3]),
        id: decodeSegment(parts.slice(4).join(':'))
      };
    }

    function resolveStorageKey(input, fallbackScope = 'record') {
      if (
        typeof input === 'string'
        && input.startsWith(`${prefix}:v${schemaVersion}:`)
      ) {
        return input;
      }
      return keyFor(input, fallbackScope);
    }

    async function getRaw(storageKey) {
      const result = await callStorage(storageArea(), 'get', storageKey);
      return result?.[storageKey] ?? null;
    }

    async function readRecord(input, options = {}) {
      const storageKey = resolveStorageKey(input, options.scope || 'record');
      const record = await getRaw(storageKey);
      if (!record || typeof record !== 'object') return null;
      const expiresAt = record.expiresAt ? Date.parse(record.expiresAt) : NaN;
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        if (options.keepExpired !== true) {
          await callStorage(storageArea(), 'remove', storageKey);
          return null;
        }
      }
      return { ...record, storageKey };
    }

    async function writeRecord(input = {}) {
      const remote = await workerMutation('writeRecord', input);
      if (remote) return remote;
      const scope = input.scope || 'record';
      const namespace = input.namespace || defaultNamespace;
      const id = input.id ?? input.key;
      const storageKey = keyFor({ scope, namespace, id }, scope);
      if (!hasOwn(input, 'value') && !hasOwn(input, 'data')) {
        throw createError('INVALID_ARGUMENT', 'writeRecord 缺少 value');
      }
      const value = hasOwn(input, 'value') ? input.value : input.data;
      assertStorable(value);

      return runExclusive(storageKey, async () => {
        const existing = await getRaw(storageKey);
        if (hasOwn(input, 'expectedRevision')) {
          const actualRevision = Number(existing?.revision || 0);
          if (actualRevision !== Number(input.expectedRevision)) {
            throw createError(
              'REVISION_CONFLICT',
              '记录 revision 已变化，已阻止覆盖',
              {
                expectedRevision: Number(input.expectedRevision),
                actualRevision,
                currentRecord: existing ? { ...existing, storageKey } : null
              }
            );
          }
        }
        if (hasOwn(input, 'expectedSourceFingerprint')) {
          const expected = input.expectedSourceFingerprint ?? null;
          const actual = existing?.sourceFingerprint ?? null;
          if (expected !== actual) {
            throw createError(
              'SOURCE_CONFLICT',
              '记录 sourceFingerprint 已变化，已阻止覆盖',
              {
                expectedSourceFingerprint: expected,
                actualSourceFingerprint: actual,
                currentRecord: existing ? { ...existing, storageKey } : null
              }
            );
          }
        }

        const now = new Date().toISOString();
        const updatedAt = input.updatedAt
          ? parseDate(input.updatedAt, 'updatedAt', false)
          : now;
        const ttlMs = Number(input.ttlMs);
        const expiresAt = input.expiresAt
          ? parseDate(input.expiresAt, 'expiresAt', false)
          : Number.isFinite(ttlMs) && ttlMs > 0
            ? new Date(Date.parse(updatedAt) + ttlMs).toISOString()
            : null;
        const sourceFingerprint = hasOwn(input, 'sourceFingerprint')
          ? (input.sourceFingerprint === null
            ? null
            : requireText(input.sourceFingerprint, 'sourceFingerprint'))
          : existing?.sourceFingerprint ?? null;
        const revision = Math.max(0, Number(existing?.revision) || 0) + 1;
        const record = {
          schemaVersion,
          revision,
          updatedAt,
          sourceFingerprint,
          scope: requireText(scope, 'scope'),
          namespace: requireText(namespace, 'namespace'),
          id: requireText(id, 'id'),
          value
        };
        const createdAt = existing?.createdAt || input.createdAt || updatedAt;
        record.createdAt = parseDate(createdAt, 'createdAt', false);
        if (expiresAt) record.expiresAt = expiresAt;
        if (input.metadata && typeof input.metadata === 'object') {
          assertStorable(input.metadata);
          record.metadata = input.metadata;
        } else if (existing?.metadata) {
          record.metadata = existing.metadata;
        }
        assertStorable(record);
        await callStorage(storageArea(), 'set', { [storageKey]: record });
        return { ...record, storageKey };
      });
    }

    async function deleteRecord(input, options = {}) {
      const remote = await workerMutation('deleteRecord', { input, options });
      if (remote) return remote;
      const storageKey = resolveStorageKey(input, options.scope || 'record');
      return runExclusive(storageKey, async () => {
        const existing = await getRaw(storageKey);
        if (!existing) return { deleted: false, storageKey, record: null };
        if (
          hasOwn(options, 'expectedRevision')
          && Number(existing.revision || 0) !== Number(options.expectedRevision)
        ) {
          throw createError(
            'REVISION_CONFLICT',
            '记录 revision 已变化，已阻止删除',
            {
              expectedRevision: Number(options.expectedRevision),
              actualRevision: Number(existing.revision || 0),
              currentRecord: { ...existing, storageKey }
            }
          );
        }
        await callStorage(storageArea(), 'remove', storageKey);
        return {
          deleted: true,
          storageKey,
          record: { ...existing, storageKey }
        };
      });
    }

    async function listRecords(options = {}) {
      const all = await callStorage(storageArea(), 'get', null);
      const requestedNow = Number(options.now);
      const now = Number.isFinite(requestedNow) ? requestedNow : Date.now();
      const records = [];
      const expiredKeys = [];
      for (const [storageKey, value] of Object.entries(all || {})) {
        const descriptor = parseKey(storageKey);
        if (!descriptor || !value || typeof value !== 'object') continue;
        if (options.scope && descriptor.scope !== options.scope) continue;
        if (
          options.namespace
          && descriptor.namespace !== options.namespace
        ) continue;
        if (
          options.idPrefix
          && !descriptor.id.startsWith(String(options.idPrefix))
        ) continue;
        const expiry = value.expiresAt ? Date.parse(value.expiresAt) : NaN;
        const expired = Number.isFinite(expiry) && expiry <= now;
        if (expired && options.includeExpired !== true) {
          if (options.cleanupExpired === true) expiredKeys.push(storageKey);
          continue;
        }
        records.push({
          ...value,
          ...descriptor,
          expired
        });
      }
      if (expiredKeys.length) {
        await callStorage(storageArea(), 'remove', expiredKeys);
      }
      records.sort((left, right) => (
        Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0)
        || String(left.storageKey).localeCompare(String(right.storageKey))
      ));
      const offset = Math.max(0, Number(options.offset) || 0);
      const limit = Number.isFinite(Number(options.limit))
        ? Math.max(0, Number(options.limit))
        : records.length;
      return records.slice(offset, offset + limit);
    }

    async function cleanupExpired(options = {}) {
      const records = await listRecords({
        ...options,
        includeExpired: true,
        cleanupExpired: false
      });
      const requestedNow = Number(options.now);
      const now = Number.isFinite(requestedNow) ? requestedNow : Date.now();
      const limit = Number.isFinite(Number(options.limit))
        ? Math.max(0, Number(options.limit))
        : records.length;
      const expired = records.filter((record) => {
        const timestamp = record.expiresAt
          ? Date.parse(record.expiresAt)
          : NaN;
        return Number.isFinite(timestamp) && timestamp <= now;
      }).slice(0, limit);
      if (expired.length) {
        await callStorage(
          storageArea(),
          'remove',
          expired.map(({ storageKey }) => storageKey)
        );
      }
      return {
        removed: expired.length,
        storageKeys: expired.map(({ storageKey }) => storageKey),
        records: expired
      };
    }

    async function getCapacityStats(options = {}) {
      const all = await callStorage(storageArea(), 'get', null);
      const serviceEntries = Object.entries(all || {}).filter(([key, value]) => {
        const parsed = parseKey(key);
        if (!parsed) return false;
        if (options.scope && parsed.scope !== options.scope) return false;
        if (options.namespace && parsed.namespace !== options.namespace) {
          return false;
        }
        return Boolean(value);
      });
      const serviceKeys = serviceEntries.map(([key]) => key);
      let totalBytes;
      let serviceBytes;
      if (typeof storageArea().getBytesInUse === 'function') {
        [totalBytes, serviceBytes] = await Promise.all([
          callStorage(storageArea(), 'getBytesInUse', null),
          serviceKeys.length
            ? callStorage(storageArea(), 'getBytesInUse', serviceKeys)
            : Promise.resolve(0)
        ]);
      } else {
        totalBytes = byteLength(all || {});
        serviceBytes = byteLength(Object.fromEntries(serviceEntries));
      }
      const quotaBytes = Number(
        options.quotaBytes
        || storageArea().QUOTA_BYTES
        || FALLBACK_QUOTA_BYTES
      );
      const expiredCount = serviceEntries.reduce((count, [, record]) => {
        const expiry = record?.expiresAt ? Date.parse(record.expiresAt) : NaN;
        return count + (
          Number.isFinite(expiry) && expiry <= Date.now() ? 1 : 0
        );
      }, 0);
      return {
        schemaVersion,
        quotaBytes,
        totalBytes: Number(totalBytes) || 0,
        serviceBytes: Number(serviceBytes) || 0,
        remainingBytes: Math.max(0, quotaBytes - (Number(totalBytes) || 0)),
        percentUsed: quotaBytes > 0
          ? Math.min(100, ((Number(totalBytes) || 0) / quotaBytes) * 100)
          : null,
        itemCount: serviceEntries.length,
        expiredCount
      };
    }

    async function importLegacyV1(options = {}) {
      const keys = options.legacyKeys || (
        options.legacyKey ? [options.legacyKey] : []
      );
      if (!keys.length && !options.legacyObject) {
        throw createError(
          'INVALID_ARGUMENT',
          'importLegacyV1 需要 legacyKey、legacyKeys 或 legacyObject'
        );
      }
      const sources = options.legacyObject
        ? [{
          key: options.legacyKey || 'inline-v1',
          value: options.legacyObject
        }]
        : await Promise.all(keys.map(async (key) => {
          const result = await callStorage(storageArea(), 'get', key);
          return { key, value: result?.[key] };
        }));
      const summary = {
        imported: 0,
        skipped: 0,
        failed: 0,
        sources: [],
        records: [],
        errors: []
      };

      for (const source of sources) {
        let container = source.value;
        if (container?.schemaVersion === 1) {
          container = container.drafts
            || container.records
            || container.items
            || container.data
            || container.value;
        }
        const entries = container && typeof container === 'object'
          ? Object.entries(container)
          : [];
        const sourceSummary = {
          legacyKey: source.key,
          entries: entries.length,
          imported: 0,
          skipped: 0,
          failed: 0
        };
        for (const [legacyId, legacyValue] of entries) {
          try {
            const mapped = typeof options.transform === 'function'
              ? await options.transform({
                legacyKey: source.key,
                legacyId,
                value: legacyValue
              })
              : {
                id: legacyId,
                value: legacyValue,
                sourceFingerprint: legacyValue?.sourceFingerprint || (
                  hasOwn(legacyValue, 'baselineText')
                    ? fingerprint(legacyValue.baselineText)
                    : hasOwn(legacyValue, 'originalValue')
                      ? fingerprint(legacyValue.originalValue)
                      : null
                ),
                updatedAt: legacyValue?.updatedAt,
                expiresAt: legacyValue?.expiresAt
              };
            if (mapped === null || mapped === false) {
              summary.skipped += 1;
              sourceSummary.skipped += 1;
              continue;
            }
            const descriptor = {
              scope: mapped.scope || options.scope || 'draft',
              namespace: mapped.namespace
                || options.namespace
                || source.key,
              id: mapped.id ?? mapped.key ?? legacyId
            };
            const existing = await readRecord(descriptor, {
              scope: descriptor.scope,
              keepExpired: true
            });
            if (existing && options.overwrite !== true) {
              summary.skipped += 1;
              sourceSummary.skipped += 1;
              continue;
            }
            const record = await writeRecord({
              ...descriptor,
              value: hasOwn(mapped, 'value') ? mapped.value : legacyValue,
              sourceFingerprint: mapped.sourceFingerprint ?? null,
              updatedAt: mapped.updatedAt || new Date().toISOString(),
              createdAt: mapped.createdAt,
              expiresAt: mapped.expiresAt,
              ttlMs: mapped.ttlMs,
              metadata: {
                ...(mapped.metadata || {}),
                migratedFrom: source.key,
                migratedFromSchemaVersion: 1,
                migratedAt: new Date().toISOString()
              },
              ...(existing ? { expectedRevision: existing.revision } : {})
            });
            summary.imported += 1;
            sourceSummary.imported += 1;
            summary.records.push(record);
          } catch (error) {
            summary.failed += 1;
            sourceSummary.failed += 1;
            summary.errors.push({
              legacyKey: source.key,
              legacyId,
              code: error?.code || 'IMPORT_ERROR',
              message: error?.message || String(error)
            });
          }
        }
        if (
          options.removeLegacy === true
          && source.key !== 'inline-v1'
          && sourceSummary.failed === 0
        ) {
          await callStorage(storageArea(), 'remove', source.key);
          sourceSummary.removedLegacy = true;
        }
        summary.sources.push(sourceSummary);
      }
      return summary;
    }

    return Object.freeze({
      apiVersion: API_VERSION,
      schemaVersion,
      prefix,
      namespace: defaultNamespace,
      keyFor,
      parseKey,
      fingerprint,
      readRecord,
      writeRecord,
      deleteRecord,
      listRecords,
      cleanupExpired,
      getCapacityStats,
      importLegacyV1
    });
  }

  const defaultService = createStorageService();
  const api = Object.freeze({
    apiVersion: API_VERSION,
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    create: createStorageService,
    createStorageService,
    fingerprint,
    createFingerprint: fingerprint,
    createError,
    default: defaultService,
    keyFor: (...args) => defaultService.keyFor(...args),
    readRecord: (...args) => defaultService.readRecord(...args),
    writeRecord: (...args) => defaultService.writeRecord(...args),
    deleteRecord: (...args) => defaultService.deleteRecord(...args),
    listRecords: (...args) => defaultService.listRecords(...args),
    cleanupExpired: (...args) => defaultService.cleanupExpired(...args),
    getCapacityStats: (...args) => defaultService.getCapacityStats(...args),
    importLegacyV1: (...args) => defaultService.importLegacyV1(...args)
  });

  root.storage = api;
  root.StorageService = api;
  globalObject.__cyleStorageServiceV1 = api;
})();
