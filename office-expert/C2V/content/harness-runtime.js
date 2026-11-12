(() => {
  'use strict';

  const HARNESS_KEY = '__annotationHarnessV1';
  if (globalThis[HARNESS_KEY]) return;
  const sdk = globalThis.__cyleBlockSdkV1;
  const isolation = globalThis.__cyleBlockIsolationV1;
  if (!sdk || !isolation) {
    throw new Error('Cyle Block SDK 或 Isolation Runtime 未加载');
  }

  const blocks = new Map();
  const capabilities = new Map();
  const listeners = new Set();

  function normalizeId(value, label = 'id') {
    const id = String(value || '').trim();
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
      throw new Error(`${label} 必须是稳定的英文标识`);
    }
    return id;
  }

  function publicBlock(record) {
    return Object.freeze({
      id: record.manifest.id,
      name: record.manifest.name,
      version: record.manifest.version,
      kind: record.manifest.kind,
      description: record.manifest.description,
      sdk: record.manifest.sdk,
      requires: [...record.manifest.requires],
      provides: [...record.manifest.provides],
      permissions: [...record.manifest.permissions],
      isolation: record.manifest.isolation,
      activationEvents: [...record.manifest.activationEvents],
      state: record.state,
      error: record.error,
      loadedAt: record.loadedAt,
      loadDurationMs: record.loadDurationMs
    });
  }

  function emit(type, record, detail = {}) {
    const event = Object.freeze({
      type,
      block: publicBlock(record),
      timestamp: Date.now(),
      ...detail
    });
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (_error) {}
    });
    document.dispatchEvent(new CustomEvent('annotation-harness:event', {
      detail: event
    }));
  }

  function registerBlock(definition = {}) {
    const manifest = sdk.validateManifest(definition);
    sdk.assertCompatible(manifest);
    const id = normalizeId(manifest.id, '积木 id');
    if (blocks.has(id)) throw new Error(`积木已注册：${id}`);
    if (typeof definition.isReady !== 'function') {
      throw new Error(`积木 ${id} 缺少 isReady()`);
    }
    const record = {
      manifest,
      isReady: definition.isReady,
      state: definition.isReady() ? 'ready' : 'registered',
      error: '',
      promise: null,
      loadedAt: 0,
      loadDurationMs: 0
    };
    blocks.set(id, record);
    emit('block:registered', record);
    return publicBlock(record);
  }

  async function activateBlock(id, reason = 'api') {
    const record = blocks.get(String(id || ''));
    if (!record) throw new Error(`未知积木：${id}`);
    if (record.isReady()) {
      record.state = 'ready';
      return publicBlock(record);
    }
    if (record.promise) return record.promise;

    const missing = record.manifest.requires.filter((capability) => (
      !capabilities.has(capability)
    ));
    if (missing.length) {
      throw new Error(`积木 ${record.manifest.name} 缺少能力：${missing.join('、')}`);
    }

    record.state = 'loading';
    record.error = '';
    const startedAt = performance.now();
    emit('block:loading', record, { reason });
    record.promise = chrome.runtime.sendMessage({
      type: 'HARNESS_LOAD_BLOCK',
      blockId: record.manifest.id
    }).then((response) => {
      if (!response?.ok) {
        throw new Error(response?.error || `积木 ${record.manifest.name} 加载失败`);
      }
      if (!record.isReady()) {
        throw new Error(`积木 ${record.manifest.name} 已注入，但未完成注册`);
      }
      record.state = 'ready';
      record.loadedAt = Date.now();
      record.loadDurationMs = Math.round(performance.now() - startedAt);
      record.manifest.provides.forEach((capability) => {
        if (!capabilities.has(capability)) {
          capabilities.set(capability, {
            provider: record.manifest.id,
            value: true
          });
        }
      });
      emit('block:ready', record, {
        reason,
        durationMs: record.loadDurationMs
      });
      return publicBlock(record);
    }).catch((error) => {
      record.state = 'error';
      record.error = error.message || String(error);
      emit('block:error', record, { reason, error: record.error });
      throw error;
    }).finally(() => {
      record.promise = null;
    });
    return record.promise;
  }

  function provideCapability(id, value, provider = 'harness') {
    const capabilityId = normalizeId(id, '能力 id');
    capabilities.set(capabilityId, { provider, value });
    return () => {
      const current = capabilities.get(capabilityId);
      if (current?.provider === provider && current?.value === value) {
        capabilities.delete(capabilityId);
      }
    };
  }

  class LazyToolInstance {
    constructor({ blockId, context, factory }) {
      this.blockId = blockId;
      this.context = context;
      this.factory = factory;
      this.instance = null;
      this.row = null;
      this.active = false;
      this.disposed = false;
      this.loadPromise = null;
      this.renderPlaceholder();
    }

    renderPlaceholder(error = '') {
      if (this.disposed || this.instance) return;
      this.context.root.replaceChildren();
      const shell = document.createElement('section');
      shell.className = 'gtm-harness-lazy-block';
      const mark = document.createElement('span');
      mark.className = 'gtm-harness-lazy-block-mark';
      mark.textContent = error ? '!' : '◫';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      const manifest = blocks.get(this.blockId)?.manifest;
      title.textContent = error
        ? `${manifest?.name || this.blockId} 加载失败`
        : `${manifest?.name || this.blockId} 尚未加载`;
      const description = document.createElement('span');
      description.textContent = error || '显示此积木时按需加载，不占用页面启动资源。';
      copy.append(title, description);
      shell.append(mark, copy);
      if (error) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = '重试';
        retry.addEventListener('click', () => this.ensureLoaded('retry'));
        shell.append(retry);
      }
      this.context.root.append(shell);
    }

    async ensureLoaded(reason = 'visible') {
      if (this.instance || this.disposed) return this.instance;
      if (this.loadPromise) return this.loadPromise;
      this.context.root.querySelector('span:last-child')?.replaceChildren(
        document.createTextNode('正在装配积木…')
      );
      this.loadPromise = activateBlock(this.blockId, reason)
        .then(async () => {
          if (this.disposed) return null;
          this.context.root.replaceChildren();
          const manifest = blocks.get(this.blockId)?.manifest;
          this.instance = isolation.create({
            manifest,
            context: this.context,
            factory: this.factory,
            onFailure: ({ error }) => {
              this.context.onNotice?.(
                `${manifest.name} 已隔离：${error}`,
                true
              );
            }
          });
          await this.instance.setRow(this.row);
          this.instance.setActive(this.active);
          await this.instance.start();
          return this.instance;
        })
        .catch((error) => {
          this.renderPlaceholder(error.message || String(error));
          this.context.onNotice?.(
            `${blocks.get(this.blockId)?.manifest.name || this.blockId}：${error.message}`,
            true
          );
          throw error;
        })
        .finally(() => {
          this.loadPromise = null;
        });
      return this.loadPromise;
    }

    async setRow(row) {
      this.row = row;
      if (this.instance) return this.instance.setRow?.(row);
      if (this.active) {
        await this.ensureLoaded('row-context');
      }
      return undefined;
    }

    setActive(active) {
      this.active = Boolean(active);
      if (this.instance) {
        this.instance.setActive?.(this.active);
      } else if (this.active) {
        this.ensureLoaded('tool-visible').catch(() => {});
      }
    }

    handleNativeMessage(message, sender) {
      this.instance?.handleNativeMessage?.(message, sender);
    }

    async flushDrafts() {
      return this.instance?.invoke('flushDrafts', [], { propagate: true });
    }

    playbackRange(options) {
      return this.instance?.playbackRange(options) || null;
    }

    async openDraftContext(target) {
      const instance = await this.ensureLoaded('draft-center');
      return instance?.invoke('openDraftContext', [target], { allowMissing: false, propagate: true });
    }

    handleViewportResize() {
      this.instance?.handleViewportResize?.();
    }

    dispose() {
      this.disposed = true;
      this.instance?.setActive?.(false);
      this.instance?.dispose?.();
      this.instance = null;
      this.context.root.replaceChildren();
    }
  }

  [
    'context.current-row',
    'write.cell',
    'draft.local',
    'media.native-video',
    'surface.canvas',
    'service.storage',
    'service.drafts',
    'service.writeback',
    'service.media',
    'service.timeline',
    'service.host',
    'service.workspaces',
    'lifecycle.dispose'
  ].forEach((id) => provideCapability(id, true));

  globalThis[HARNESS_KEY] = Object.freeze({
    version: '1.1.0',
    sdk,
    isolation,
    services: Object.freeze({
      storage: globalThis.__cyleServicesV1?.storage,
      drafts: globalThis.__cyleServicesV1?.drafts,
      writeback: globalThis.__cyleServicesV1?.writeback,
      media: globalThis.__cyleServicesV1?.media,
      timeline: globalThis.__cyleServicesV1?.timeline,
      host: globalThis.__cyleServicesV1?.host,
      workspaces: globalThis.__cyleServicesV1?.workspaces,
      legacyStorage: globalThis.__cyleServicesV1?.legacyStorage
    }),
    registerBlock,
    activateBlock,
    createLazyTool(options) {
      return new LazyToolInstance(options);
    },
    provideCapability,
    getCapability(id) {
      return capabilities.get(String(id || ''))?.value;
    },
    listBlocks() {
      return [...blocks.values()].map(publicBlock);
    },
    getDiagnostics() {
      return Object.freeze({
        version: '1.1.0',
        sdkVersion: sdk.version,
        blocks: [...blocks.values()].map(publicBlock),
        capabilities: [...capabilities.entries()].map(([id, value]) => ({
          id,
          provider: value.provider
        }))
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
