(() => {
  'use strict';

  const REGISTRY_KEY = '__gtMapperCanvasToolRegistryV1';
  if (globalThis[REGISTRY_KEY]) return;

  const definitions = new Map();

  function normalize(definition = {}) {
    const id = String(definition.id || '').trim();
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
      throw new Error('画布工具 id 必须是稳定的英文标识');
    }
    if (typeof definition.create !== 'function') {
      throw new Error(`画布工具 ${id} 缺少 create(context)`);
    }
    return Object.freeze({
      id,
      key: `tool:${id}`,
      title: String(definition.title || id),
      description: String(definition.description || ''),
      badge: String(definition.badge || '工具'),
      keywords: Array.isArray(definition.keywords)
        ? definition.keywords.map(String)
        : [],
      defaultWidth: Math.max(560, Number(definition.defaultWidth) || 960),
      defaultHeight: Math.max(420, Number(definition.defaultHeight) || 760),
      minimumWidth: Math.max(360, Number(definition.minimumWidth) || 560),
      minimumHeight: Math.max(260, Number(definition.minimumHeight) || 420),
      autoHeight: Boolean(definition.autoHeight),
      manifest: definition.manifest || null,
      create: definition.create
    });
  }

  const registry = Object.freeze({
    register(definition) {
      const normalized = normalize(definition);
      if (definitions.has(normalized.id)) {
        throw new Error(`画布工具已注册：${normalized.id}`);
      }
      definitions.set(normalized.id, normalized);
      return normalized;
    },
    get(id) {
      return definitions.get(String(id || '')) || null;
    },
    list() {
      return [...definitions.values()];
    }
  });

  globalThis[REGISTRY_KEY] = registry;
})();
