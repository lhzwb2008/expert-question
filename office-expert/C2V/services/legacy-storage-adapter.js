(() => {
  'use strict';

  const GLOBAL_KEY = '__cyleLegacyStorageAdapterV1';
  if (globalThis[GLOBAL_KEY]) return;

  const MIGRATED_MARKER = 'cyle:migration:v1-objects';
  const LEGACY_KEYS = new Set([
    'gtMapperInspectorPreferencesV1',
    'gtMapperGtWorkbenchDraftsV1',
    'gtMapperGtWorkbenchSettingsV1',
    'gtMapperChainTimeDraftsV1',
    'gtMapperChainTimeSettingsV1'
  ]);
  const DRAFT_NAMESPACES = Object.freeze({
    gtMapperGtWorkbenchDraftsV1: 'video-gt',
    gtMapperChainTimeDraftsV1: 'chains-time'
  });
  const DRAFT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const draftSnapshots = new WeakMap();
  const draftWrites = new Map();

  function nativeArea() {
    return globalThis.chrome?.storage?.local || null;
  }

  function call(area, method, ...args) {
    if (!area?.[method]) return Promise.reject(new Error('storage unavailable'));
    try {
      const result = area[method](...args);
      if (result?.then) return result;
      return new Promise((resolve, reject) => {
        area[method](...args, (value) => {
          const error = globalThis.chrome?.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve(value);
        });
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function normalizeKeys(keys) {
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys;
    if (keys && typeof keys === 'object') return Object.keys(keys);
    return [];
  }

  async function migrateOnce() {
    const area = nativeArea();
    if (!area) return { migrated: 0 };
    const marker = await call(area, 'get', MIGRATED_MARKER);
    if (marker?.[MIGRATED_MARKER]) return { migrated: 0 };
    const legacy = await call(area, 'get', [...LEGACY_KEYS]);
    const storage = globalThis.__cyleStorageServiceV1;
    let migrated = 0;
    if (storage?.writeRecord) {
      for (const key of LEGACY_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(legacy || {}, key)) continue;
        if (DRAFT_NAMESPACES[key] && rootDrafts()?.saveDraft) {
          for (const [id, value] of Object.entries(legacy[key] || {})) {
            await rootDrafts().saveDraft({
              id,
              namespace: DRAFT_NAMESPACES[key],
              value,
              sourceValue: value?.baselineText ?? '',
              allowSourceChange: true,
              updatedAt: value?.updatedAt,
              ttlMs: DRAFT_TTL_MS,
              metadata: { migratedFrom: key }
            });
            migrated += 1;
          }
          continue;
        }
        await storage.writeRecord({
          scope: 'legacy-object',
          namespace: 'v1',
          id: key,
          value: legacy[key],
          metadata: { migratedFrom: key }
        });
        migrated += 1;
      }
    }
    await call(area, 'set', { [MIGRATED_MARKER]: true });
    return { migrated };
  }

  function rootDrafts() {
    return globalThis.__cyleDraftServiceV1
      || globalThis.__cyleServicesV1?.drafts;
  }

  async function readDraftObject(key) {
    const namespace = DRAFT_NAMESPACES[key];
    const drafts = rootDrafts();
    if (!namespace || !drafts?.listDrafts) return null;
    const records = await drafts.listDrafts({
      namespace,
      includeExpired: false,
      cleanupExpired: true
    });
    return Object.fromEntries(records.map((record) => [
      record.id,
      record.value
    ]));
  }

  async function commitDraftObject(key, value = {}) {
    const namespace = DRAFT_NAMESPACES[key];
    const drafts = rootDrafts();
    if (!namespace || !drafts?.listDrafts) return false;
    const source = value && typeof value === 'object' ? value : {};
    const next = structuredClone(source);
    const baseline = draftSnapshots.get(source) || {};
    const existing = await drafts.listDrafts({
      namespace,
      includeExpired: true
    });
    const nextIds = new Set(Object.keys(next));
    for (const record of existing) {
      if (!nextIds.has(record.id) && Object.prototype.hasOwnProperty.call(baseline, record.id)
        && JSON.stringify(record.value) === JSON.stringify(baseline[record.id])) {
        await drafts.deleteDraft({
          id: record.id,
          namespace
        }).catch(() => {});
      }
    }
    for (const [id, draft] of Object.entries(next)) {
      if (Object.prototype.hasOwnProperty.call(baseline, id) && JSON.stringify(baseline[id]) === JSON.stringify(draft)) continue;
      await drafts.saveDraft({
        id,
        namespace,
        value: draft,
        sourceValue: draft?.baselineText ?? '',
        allowSourceChange: true,
        updatedAt: draft?.updatedAt,
        ttlMs: DRAFT_TTL_MS,
        metadata: { compatibilityKey: key }
      });
    }
    draftSnapshots.set(source, next);
    return true;
  }

  async function writeDraftObject(key, value) {
    if (!DRAFT_NAMESPACES[key]) return false;
    const queued = (draftWrites.get(key) || Promise.resolve()).catch(() => {}).then(() => commitDraftObject(key, value));
    draftWrites.set(key, queued);return queued;
  }

  async function get(keys) {
    await migrateOnce().catch(() => {});
    const area = nativeArea();
    const result = await call(area, 'get', keys);
    const storage = globalThis.__cyleStorageServiceV1;
    for (const key of normalizeKeys(keys)) {
      if (DRAFT_NAMESPACES[key]) {
        const drafts = await readDraftObject(key);
        if (drafts !== null) { result[key] = drafts; continue; }
      }
      if (
        Object.prototype.hasOwnProperty.call(result || {}, key)
        && result[key] !== undefined
      ) continue;
      const draftObject = await readDraftObject(key);
      if (draftObject && Object.keys(draftObject).length) {
        result[key] = draftObject;
        continue;
      }
      if (!LEGACY_KEYS.has(key) || !storage?.readRecord) continue;
      const record = await storage.readRecord({
        scope: 'legacy-object',
        namespace: 'v1',
        id: key
      });
      if (record) result[key] = record.value;
    }
    for (const key of normalizeKeys(keys)) {
      if (DRAFT_NAMESPACES[key] && result?.[key] && typeof result[key] === 'object') draftSnapshots.set(result[key], structuredClone(result[key]));
    }
    return result || {};
  }

  async function set(values = {}) {
    await migrateOnce().catch(() => {});
    const area = nativeArea();
    const storage = globalThis.__cyleStorageServiceV1;
    const ordinary = {};
    for (const [key, value] of Object.entries(values)) {
      if (await writeDraftObject(key, value)) continue;
      if (LEGACY_KEYS.has(key) && storage?.writeRecord) {
        const existing = await storage.readRecord({
          scope: 'legacy-object',
          namespace: 'v1',
          id: key
        }, { keepExpired: true });
        await storage.writeRecord({
          scope: 'legacy-object',
          namespace: 'v1',
          id: key,
          value,
          ...(existing ? { expectedRevision: existing.revision } : {}),
          metadata: { compatibilityKey: key }
        });
      } else {
        ordinary[key] = value;
      }
    }
    if (Object.keys(ordinary).length) await call(area, 'set', ordinary);
  }

  async function remove(keys) {
    const area = nativeArea();
    const storage = globalThis.__cyleStorageServiceV1;
    for (const key of normalizeKeys(keys)) {
      if (DRAFT_NAMESPACES[key] && rootDrafts()?.listDrafts) {
        const records = await rootDrafts().listDrafts({
          namespace: DRAFT_NAMESPACES[key],
          includeExpired: true
        });
        for (const record of records) {
          await rootDrafts().deleteDraft({
            id: record.id,
            namespace: DRAFT_NAMESPACES[key]
          }).catch(() => {});
        }
      }
      if (LEGACY_KEYS.has(key) && storage?.deleteRecord) {
        await storage.deleteRecord({
          scope: 'legacy-object',
          namespace: 'v1',
          id: key
        }).catch(() => {});
      }
    }
    await call(area, 'remove', keys);
  }

  const service = Object.freeze({
    apiVersion: 1,
    legacyKeys: Object.freeze([...LEGACY_KEYS]),
    draftNamespaces: DRAFT_NAMESPACES,
    migrateOnce,
    get,
    set,
    remove,
    native: nativeArea
  });
  globalThis[GLOBAL_KEY] = service;
  globalThis.__cyleServicesV1 ||= {};
  globalThis.__cyleServicesV1.legacyStorage = service;
})();
