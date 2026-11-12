(() => {
  'use strict';

  const globalObject = globalThis;
  const root = globalObject.__cyleServicesV1 || (
    globalObject.__cyleServicesV1 = {}
  );
  if (root.drafts?.apiVersion === 1) {
    globalObject.__cyleDraftServiceV1 = root.drafts;
    return;
  }

  const API_VERSION = 1;
  const DRAFT_SCHEMA_VERSION = 2;
  const DEFAULT_NAMESPACE = 'annotation';
  const DEFAULT_LEGACY_KEYS = Object.freeze([
    'gtMapperGtWorkbenchDraftsV1',
    'gtMapperChainTimeDraftsV1'
  ]);

  const hasOwn = (value, key) => (
    Object.prototype.hasOwnProperty.call(value || {}, key)
  );

  function error(code, message, details = {}) {
    const storageFactory = root.storage;
    if (typeof storageFactory?.createError === 'function') {
      return storageFactory.createError(code, message, details);
    }
    const result = new Error(message);
    result.name = 'CyleDraftError';
    result.code = code;
    Object.assign(result, details);
    return result;
  }

  function requireText(value, label) {
    const result = String(value ?? '').trim();
    if (!result) throw error('INVALID_ARGUMENT', `${label} 不能为空`);
    return result;
  }

  function resolveStorage(explicitStorage) {
    const resolved = explicitStorage
      || root.storage?.default
      || root.storage;
    if (
      !resolved
      || typeof resolved.writeRecord !== 'function'
      || typeof resolved.readRecord !== 'function'
    ) {
      throw error(
        'STORAGE_SERVICE_UNAVAILABLE',
        '请先加载 services/storage-service.js'
      );
    }
    return resolved;
  }

  function resolveFingerprint(storage, input, names = {}) {
    const fingerprintKey = names.fingerprintKey || 'sourceFingerprint';
    const valueKey = names.valueKey || 'sourceValue';
    if (hasOwn(input, fingerprintKey)) {
      const value = input[fingerprintKey];
      return value === null ? null : requireText(value, fingerprintKey);
    }
    if (hasOwn(input, valueKey)) {
      return storage.fingerprint(input[valueKey]);
    }
    return undefined;
  }

  function normalizeDescriptor(input, options = {}, defaultNamespace) {
    const source = input && typeof input === 'object'
      ? { ...input, ...options }
      : { ...options, id: input };
    return {
      source,
      id: requireText(source.id ?? source.key ?? source.draftKey, 'draft id'),
      namespace: requireText(
        source.namespace || defaultNamespace,
        'namespace'
      )
    };
  }

  function composeDraftId(parts) {
    if (typeof parts === 'string') return requireText(parts, 'draft id');
    if (Array.isArray(parts)) {
      return parts.map((part) => encodeURIComponent(
        requireText(part, 'draft id 片段')
      )).join('/');
    }
    if (!parts || typeof parts !== 'object') {
      throw error('INVALID_ARGUMENT', 'composeDraftId 需要字符串、数组或对象');
    }
    return Object.keys(parts)
      .sort()
      .map((key) => (
        `${encodeURIComponent(key)}=${encodeURIComponent(
          requireText(parts[key], `draft id.${key}`)
        )}`
      ))
      .join('&');
  }

  function createDraftService(options = {}) {
    const explicitStorage = options.storage || null;
    const defaultNamespace = requireText(
      options.namespace || DEFAULT_NAMESPACE,
      'namespace'
    );
    const defaultTtlMs = Number.isFinite(Number(options.defaultTtlMs))
      && Number(options.defaultTtlMs) > 0
      ? Number(options.defaultTtlMs)
      : null;
    const storage = () => resolveStorage(explicitStorage);

    function keyFor(input, keyOptions = {}) {
      const descriptor = normalizeDescriptor(
        input,
        keyOptions,
        defaultNamespace
      );
      return storage().keyFor({
        scope: 'draft',
        namespace: descriptor.namespace,
        id: descriptor.id
      });
    }

    function inspectSource(record, input = {}) {
      const store = storage();
      const currentFingerprint = resolveFingerprint(store, input, {
        fingerprintKey: 'sourceFingerprint',
        valueKey: 'sourceValue'
      });
      const savedFingerprint = record?.sourceFingerprint ?? null;
      const checked = currentFingerprint !== undefined;
      const conflict = checked
        && savedFingerprint !== null
        && currentFingerprint !== savedFingerprint;
      return {
        checked,
        conflict,
        savedFingerprint,
        currentFingerprint: currentFingerprint ?? null,
        reason: conflict
          ? 'SOURCE_CHANGED'
          : checked && savedFingerprint === null
            ? 'SOURCE_FINGERPRINT_MISSING'
            : null
      };
    }

    async function saveDraft(input = {}) {
      const descriptor = normalizeDescriptor(
        input,
        {},
        defaultNamespace
      );
      const store = storage();
      if (!hasOwn(input, 'value') && !hasOwn(input, 'data')) {
        throw error('INVALID_ARGUMENT', 'saveDraft 缺少 value 或 data');
      }
      const value = hasOwn(input, 'value') ? input.value : input.data;
      const sourceFingerprint = resolveFingerprint(store, input);
      const existing = await store.readRecord({
        scope: 'draft',
        namespace: descriptor.namespace,
        id: descriptor.id
      }, { keepExpired: true });

      if (
        existing
        && sourceFingerprint !== undefined
        && existing.sourceFingerprint !== null
        && existing.sourceFingerprint !== sourceFingerprint
        && input.allowSourceChange !== true
      ) {
        throw error(
          'SOURCE_CONFLICT',
          '草稿对应的原值已变化，旧草稿未被覆盖',
          {
            id: descriptor.id,
            namespace: descriptor.namespace,
            savedFingerprint: existing.sourceFingerprint,
            currentFingerprint: sourceFingerprint,
            currentDraft: existing
          }
        );
      }

      if (
        hasOwn(input, 'expectedOriginalValue')
        || hasOwn(input, 'expectedOriginalFingerprint')
      ) {
        const expectedFingerprint = hasOwn(input, 'expectedOriginalFingerprint')
          ? input.expectedOriginalFingerprint
          : store.fingerprint(input.expectedOriginalValue);
        const actualFingerprint = sourceFingerprint
          ?? existing?.sourceFingerprint
          ?? null;
        if (expectedFingerprint !== actualFingerprint) {
          throw error(
            'SOURCE_CONFLICT',
            '保存时的原值与预期不一致，已阻止覆盖',
            {
              expectedFingerprint,
              actualFingerprint,
              currentDraft: existing
            }
          );
        }
      }

      const record = await store.writeRecord({
        scope: 'draft',
        namespace: descriptor.namespace,
        id: descriptor.id,
        value,
        sourceFingerprint: sourceFingerprint !== undefined
          ? sourceFingerprint
          : existing?.sourceFingerprint ?? null,
        ...(hasOwn(input, 'expectedRevision')
          ? { expectedRevision: input.expectedRevision }
          : {}),
        ...(hasOwn(input, 'expectedStoredSourceFingerprint')
          ? {
            expectedSourceFingerprint:
              input.expectedStoredSourceFingerprint
          }
          : {}),
        updatedAt: input.updatedAt,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        ttlMs: hasOwn(input, 'ttlMs') ? input.ttlMs : defaultTtlMs,
        metadata: {
          kind: input.kind || 'annotation-draft',
          ...(input.metadata || {})
        }
      });
      return {
        ok: true,
        id: descriptor.id,
        namespace: descriptor.namespace,
        key: record.storageKey,
        schemaVersion: record.schemaVersion,
        revision: record.revision,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt || null,
        sourceFingerprint: record.sourceFingerprint,
        value: record.value,
        metadata: record.metadata || {}
      };
    }

    async function readDraft(input, readOptions = {}) {
      const descriptor = normalizeDescriptor(
        input,
        readOptions,
        defaultNamespace
      );
      const store = storage();
      const record = await store.readRecord({
        scope: 'draft',
        namespace: descriptor.namespace,
        id: descriptor.id
      }, {
        keepExpired: descriptor.source.keepExpired === true
      });
      if (!record) {
        return {
          ok: true,
          found: false,
          conflict: false,
          id: descriptor.id,
          namespace: descriptor.namespace,
          key: keyFor(descriptor.id, {
            namespace: descriptor.namespace
          }),
          draft: null,
          value: undefined
        };
      }
      const source = inspectSource(record, descriptor.source);
      if (source.conflict && descriptor.source.rejectOnConflict === true) {
        throw error(
          'SOURCE_CONFLICT',
          '草稿原值与当前原值不一致，未自动恢复草稿',
          {
            id: descriptor.id,
            namespace: descriptor.namespace,
            ...source,
            currentDraft: record
          }
        );
      }
      const draft = {
        id: descriptor.id,
        namespace: descriptor.namespace,
        key: record.storageKey,
        schemaVersion: record.schemaVersion,
        revision: record.revision,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt || null,
        sourceFingerprint: record.sourceFingerprint,
        value: record.value,
        metadata: record.metadata || {}
      };
      return {
        ok: true,
        found: true,
        conflict: source.conflict,
        source,
        id: descriptor.id,
        namespace: descriptor.namespace,
        key: record.storageKey,
        draft,
        value: record.value
      };
    }

    async function getDraftValue(input, options = {}) {
      const result = await readDraft(input, options);
      if (!result.found || result.conflict) return undefined;
      return result.value;
    }

    async function deleteDraft(input, deleteOptions = {}) {
      const descriptor = normalizeDescriptor(
        input,
        deleteOptions,
        defaultNamespace
      );
      const result = await storage().deleteRecord({
        scope: 'draft',
        namespace: descriptor.namespace,
        id: descriptor.id
      }, {
        ...(hasOwn(descriptor.source, 'expectedRevision')
          ? { expectedRevision: descriptor.source.expectedRevision }
          : {})
      });
      return {
        ok: true,
        deleted: result.deleted,
        id: descriptor.id,
        namespace: descriptor.namespace,
        key: result.storageKey,
        revision: result.record?.revision ?? null
      };
    }

    async function listDrafts(listOptions = {}) {
      const namespace = hasOwn(listOptions, 'namespace')
        ? listOptions.namespace
        : defaultNamespace;
      const records = await storage().listRecords({
        scope: 'draft',
        namespace,
        idPrefix: listOptions.idPrefix,
        includeExpired: listOptions.includeExpired === true,
        cleanupExpired: listOptions.cleanupExpired === true,
        offset: listOptions.offset,
        limit: listOptions.limit
      });
      return records.map((record) => ({
        id: record.id,
        namespace: record.namespace,
        key: record.storageKey,
        schemaVersion: record.schemaVersion,
        revision: record.revision,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt || null,
        expired: record.expired === true,
        sourceFingerprint: record.sourceFingerprint,
        value: record.value,
        metadata: record.metadata || {}
      }));
    }

    async function cleanupExpired(cleanupOptions = {}) {
      const request = {
        scope: 'draft',
        ...(hasOwn(cleanupOptions, 'namespace')
          ? { namespace: cleanupOptions.namespace }
          : { namespace: defaultNamespace })
      };
      if (hasOwn(cleanupOptions, 'now')) request.now = cleanupOptions.now;
      if (hasOwn(cleanupOptions, 'limit')) {
        request.limit = cleanupOptions.limit;
      }
      return storage().cleanupExpired(request);
    }

    async function getCapacityStats(statsOptions = {}) {
      return storage().getCapacityStats({
        scope: 'draft',
        ...(hasOwn(statsOptions, 'namespace')
          ? { namespace: statsOptions.namespace }
          : {}),
        quotaBytes: statsOptions.quotaBytes
      });
    }

    async function importLegacyV1(importOptions = {}) {
      const keys = importOptions.legacyKeys || (
        importOptions.legacyKey
          ? [importOptions.legacyKey]
          : DEFAULT_LEGACY_KEYS
      );
      return storage().importLegacyV1({
        legacyKeys: keys,
        legacyObject: importOptions.legacyObject,
        legacyKey: importOptions.legacyKey,
        scope: 'draft',
        namespace: importOptions.namespace,
        overwrite: importOptions.overwrite === true,
        removeLegacy: importOptions.removeLegacy === true,
        transform: async (entry) => {
          const source = entry.value && typeof entry.value === 'object'
            ? entry.value
            : { value: entry.value };
          const custom = typeof importOptions.transform === 'function'
            ? await importOptions.transform(entry)
            : null;
          if (custom === false) return false;
          if (custom && typeof custom === 'object') return custom;
          const sourceValue = hasOwn(source, 'baselineText')
            ? source.baselineText
            : hasOwn(source, 'originalValue')
              ? source.originalValue
              : undefined;
          return {
            id: entry.legacyId,
            namespace: importOptions.namespace || entry.legacyKey,
            value: source,
            sourceFingerprint: hasOwn(source, 'sourceFingerprint')
              ? source.sourceFingerprint
              : sourceValue !== undefined
                ? storage().fingerprint(sourceValue)
                : null,
            updatedAt: source.updatedAt,
            expiresAt: source.expiresAt,
            metadata: {
              kind: source.kind || 'legacy-v1-draft',
              legacyKey: entry.legacyKey
            }
          };
        }
      });
    }

    return Object.freeze({
      apiVersion: API_VERSION,
      schemaVersion: DRAFT_SCHEMA_VERSION,
      namespace: defaultNamespace,
      keyFor,
      composeDraftId,
      inspectSource,
      saveDraft,
      readDraft,
      getDraftValue,
      deleteDraft,
      listDrafts,
      cleanupExpired,
      getCapacityStats,
      importLegacyV1
    });
  }

  const defaultService = createDraftService();
  function captureContext(row, columnIndex, header = '', workspace = 'video-gt') {
    return {
      tableKey: row?.tableKey || row?.sheetId || '', sheetId: row?.sheetId || '',
      sheetIndex: row?.sheetIndex ?? 0, rowIndex: row?.rowIndex,
      columnIndex, header, workspace, sheetName: row?.sheetName || '',
      workbookName: row?.workbookName || '', url: row?.pageUrl || globalObject.location?.href || ''
    };
  }

  function legacyContext(id, caption = false) {
    const match = caption
      ? id.match(/^cyle-caption-draft:(.*):(\d+):(\d+):(-?\d+)(?::conflict:\d+)?$/)
      : id.match(/^(.*)::(\d+)::(gt|chain|gt-reference|coarse):(-?\d+)$/);
    if (!match) return null;
    const tableKey = match[1], parts = tableKey.split('::');
    return {
      tableKey, sheetId: parts[1] || '',
      sheetIndex: caption ? Number(match[2]) : Number(parts[2] || 0),
      rowIndex: Number(match[caption ? 3 : 2]), columnIndex: Number(match[4]),
      workspace: caption ? 'caption-review' : match[3] === 'gt' ? 'video-gt' : 'chains-review',
      kind: caption ? '评审' : ({ gt: 'GT', chain: 'Chains', 'gt-reference': 'GT', coarse: '粗粒度' })[match[3]]
    };
  }

  function catalogEntry(record, caption = false) {
    const value = record.value || {}, inferred = legacyContext(record.id, caption);
    const target = { ...inferred, ...value.context };
    if(record.namespace==='human-eval-form')return {
      id:`${record.namespace}:${record.id}`,storageId:record.id,namespace:record.namespace,
      kind:'人评',target:{...target,templateId:value.templateId},
      status:record.expired?'已过期':value.submitted===true?'已提交备份':'本地草稿',updatedAt:record.updatedAt||'',expired:record.expired===true,value,
      changes:[{columnIndex:target.columnIndex,header:target.header,before:value.baselineText??'未记录原文',after:JSON.stringify(value.answers||[],null,2),representation:'人评草稿（未回填）'}]
    };
    const archived = caption && /:conflict:\d+$/.test(record.id);
    return {
      id: `${record.namespace}:${record.id}`, storageId: record.id, namespace: record.namespace,
      kind: inferred?.kind || (caption ? '评审' : record.namespace), target,
      status: archived ? '冲突副本' : value.hasEdits === false ? '未修改快照' : record.expired ? '已过期' : caption && value.hasEdits === undefined ? '旧草稿待核对' : '待写回',
      updatedAt: value.savedAt || value.updatedAt || record.updatedAt || '',
      expired: record.expired === true, value,
      changes: caption
        ? (value.docs || []).filter(d => d.changed !== false).map(d => ({ columnIndex: d.index, header: d.header, before: d.baseline, after: typeof d.rawText === 'string' ? d.rawText : d.events ? JSON.stringify(d.events, null, 2) : JSON.stringify(d.items, null, 2), representation: d.events ? '编辑后的片段（写回时保留原格式）' : '草稿内容' }))
        : [{ columnIndex: target.columnIndex, header: target.header, before: value.baselineText || '', after: value.text || '', representation: '草稿内容' }]
    };
  }

  async function listUnifiedDrafts() {
    const adapter = globalObject.__cyleLegacyStorageAdapterV1;
    if (adapter) await adapter.get([]); // Finish the existing legacy migration before listing.
    const [records, local] = await Promise.all([
      defaultService.listDrafts({ namespace: null, includeExpired: true }),
      adapter ? adapter.get(null) : globalObject.chrome?.storage?.local?.get(null) || {}
    ]);
    const entries = records.map(record => catalogEntry(record));
    for (const [id, value] of Object.entries(local || {})) {
      if (id.startsWith('cyle-caption-draft:') && value && typeof value === 'object') {
        entries.push(catalogEntry({ id, value, namespace: 'caption-review' }, true));
      }
    }
    return entries.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.id.localeCompare(b.id));
  }

  const api = Object.freeze({
    apiVersion: API_VERSION,
    schemaVersion: DRAFT_SCHEMA_VERSION,
    legacyKeys: DEFAULT_LEGACY_KEYS,
    create: createDraftService,
    createDraftService,
    captureContext,
    listUnifiedDrafts,
    composeDraftId,
    default: defaultService,
    keyFor: (...args) => defaultService.keyFor(...args),
    inspectSource: (...args) => defaultService.inspectSource(...args),
    saveDraft: (...args) => defaultService.saveDraft(...args),
    readDraft: (...args) => defaultService.readDraft(...args),
    getDraftValue: (...args) => defaultService.getDraftValue(...args),
    deleteDraft: (...args) => defaultService.deleteDraft(...args),
    listDrafts: (...args) => defaultService.listDrafts(...args),
    cleanupExpired: (...args) => defaultService.cleanupExpired(...args),
    getCapacityStats: (...args) => defaultService.getCapacityStats(...args),
    importLegacyV1: (...args) => defaultService.importLegacyV1(...args)
  });

  root.drafts = api;
  root.DraftService = api;
  globalObject.__cyleDraftServiceV1 = api;
})();
