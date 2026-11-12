(() => {
  'use strict';

  const ISOLATION_KEY = '__cyleBlockIsolationV1';
  if (globalThis[ISOLATION_KEY]) return;

  const sdk = globalThis.__cyleBlockSdkV1;
  if (!sdk) throw new Error('Cyle Block SDK 未加载');

  function isolationError(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'CyleBlockIsolationError';
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function withTimeout(task, timeoutMs, label) {
    let timer = 0;
    return Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(isolationError(
          'LIFECYCLE_TIMEOUT',
          `${label} 超过 ${timeoutMs}ms，已停止等待`
        )), timeoutMs);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function safeClass(value) {
    return String(value || '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  }

  const SHADOW_BASE_CSS = `
    :host { display:block; width:100%; min-width:0; min-height:100%; color:inherit; }
    *, *::before, *::after { box-sizing:border-box; }
    .cyle-block-surface { width:100%; min-width:0; min-height:100%; }
    .cyle-block-error-boundary {
      min-height:220px; display:grid; place-content:center; justify-items:center;
      gap:10px; padding:28px; color:#98a6b3; background:#18222c;
      border:1px dashed #744752; border-radius:7px; text-align:center;
      font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    }
    .cyle-block-error-boundary strong { color:#ed727b; font-size:14px; }
    .cyle-block-error-boundary p { max-width:560px; margin:0; color:#edf1f4; font-size:11px; }
    .cyle-block-error-boundary small { color:#6f7f8d; }
    .cyle-block-error-boundary button {
      min-height:31px; padding:0 12px; cursor:pointer; color:#151b22;
      background:#ef9848; border:1px solid #ef9848; border-radius:5px; font-weight:750;
    }
  `;

  class IsolatedBlockInstance {
    constructor({ manifest, context, factory, onFailure }) {
      this.manifest = manifest?.sdk ? manifest : sdk.validateManifest(manifest);
      sdk.assertCompatible(this.manifest);
      if (typeof factory !== 'function') {
        throw isolationError(
          'MISSING_FACTORY',
          `积木 ${this.manifest.name} 缺少工厂`
        );
      }
      this.hostContext = context || {};
      this.factory = factory;
      this.onFailure = onFailure;
      this.instance = null;
      this.row = null;
      this.active = false;
      this.disposed = false;
      this.startPromise = null;
      this.failureCount = 0;
      this.lastError = null;
      this.scopedContext = null;
      this.state = 'created';
      this.scope = document.createElement('section');
      this.scope.className = [
        'cyle-block-scope',
        `cyle-block-${safeClass(this.manifest.id)}`
      ].join(' ');
      this.scope.dataset.cyleBlockId = this.manifest.id;
      this.scope.dataset.cyleBlockVersion = this.manifest.version;
      this.scope.dataset.cyleIsolation = this.manifest.isolation.mode;
      this.mountRoot = this.manifest.isolation.mode === 'shadow'
        ? this.scope.attachShadow({ mode: 'open' })
        : this.scope;
      if (this.mountRoot !== this.scope) {
        const style = document.createElement('style');
        style.textContent = SHADOW_BASE_CSS;
        this.mountRoot.append(style);
      }
      this.surface = document.createElement('div');
      this.surface.className = 'cyle-block-surface';
      this.mountRoot.append(this.surface);
      this.hostContext.root.replaceChildren(this.scope);
    }

    emit(type, detail = {}) {
      const payload = Object.freeze({
        type,
        blockId: this.manifest.id,
        blockName: this.manifest.name,
        state: this.state,
        failureCount: this.failureCount,
        timestamp: Date.now(),
        ...detail
      });
      if (type === 'block:isolated-error') {
        try {
          this.onFailure?.(payload);
        } catch (_error) {}
      }
      document.dispatchEvent(new CustomEvent('cyle-block-isolation:event', {
        detail: payload
      }));
    }

    renderBoundary(error) {
      if (this.disposed) return;
      this.surface.replaceChildren();
      const boundary = document.createElement('section');
      boundary.className = 'cyle-block-error-boundary';
      const title = document.createElement('strong');
      title.textContent = `${this.manifest.name} 已隔离`;
      const message = document.createElement('p');
      message.textContent = error?.message || String(error || '未知异常');
      const meta = document.createElement('small');
      meta.textContent = this.failureCount >= this.manifest.isolation.maxFailures
        ? `连续失败 ${this.failureCount} 次，已熔断`
        : `异常未影响 Cyle 其他积木（${this.failureCount}/${this.manifest.isolation.maxFailures}）`;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '重新装配';
      retry.disabled = this.failureCount >= this.manifest.isolation.maxFailures;
      retry.addEventListener('click', () => {
        this.reset().catch(() => {});
      });
      boundary.append(title, message, meta, retry);
      this.surface.append(boundary);
    }

    fail(error, phase) {
      const normalized = error instanceof Error
        ? error
        : isolationError('BLOCK_FAILURE', String(error));
      this.failureCount += 1;
      this.lastError = normalized;
      const previous = this.instance;
      this.instance = null;
      try {
        previous?.setActive?.(false);
        previous?.dispose?.();
      } catch (_error) {}
      this.scopedContext?.lifecycle?.dispose?.();
      this.scopedContext = null;
      this.state = this.failureCount >= this.manifest.isolation.maxFailures
        ? 'tripped'
        : 'error';
      this.renderBoundary(normalized);
      this.emit('block:isolated-error', {
        phase,
        code: normalized.code || 'BLOCK_FAILURE',
        error: normalized.message
      });
      return normalized;
    }

    playbackRange(options) {
      try { return this.instance?.playbackRange?.(options) || null; }
      catch (_) { return null; }
    }

    async invoke(method, args = [], {
      allowMissing = true,
      propagate = false
    } = {}) {
      if (this.disposed) return undefined;
      const action = this.instance?.[method];
      if (typeof action !== 'function') {
        if (allowMissing) return undefined;
        throw isolationError(
          'MISSING_LIFECYCLE',
          `积木 ${this.manifest.name} 缺少 ${method}()`
        );
      }
      try {
        return await withTimeout(
          () => action.apply(this.instance, args),
          this.manifest.isolation.lifecycleTimeoutMs,
          `${this.manifest.name}.${method}()`
        );
      } catch (error) {
        if (propagate) throw error;
        this.fail(error, method);
        return undefined;
      }
    }

    async start() {
      if (this.disposed) return null;
      if (this.instance) return this;
      if (this.startPromise) return this.startPromise;
      if (this.state === 'tripped') {
        throw isolationError(
          'CIRCUIT_OPEN',
          `${this.manifest.name} 已熔断，请重新打开工作台后再试`
        );
      }
      this.state = 'starting';
      this.startPromise = withTimeout(async () => {
        this.surface.replaceChildren();
        const context = sdk.createScopedContext(this.manifest, {
          ...this.hostContext,
          root: this.surface
        });
        this.scopedContext = context;
        const instance = await this.factory(context);
        this.instance = sdk.validateInstance(instance, this.manifest);
        this.state = 'ready';
        this.lastError = null;
        if (this.row) {
          await this.invoke('setRow', [this.row], {
            allowMissing: false,
            propagate: true
          });
        }
        await this.invoke('setActive', [this.active], {
          allowMissing: false,
          propagate: true
        });
        this.failureCount = 0;
        this.emit('block:isolation-ready');
        return this;
      }, this.manifest.isolation.lifecycleTimeoutMs, `${this.manifest.name}.create()`)
        .catch((error) => {
          this.instance = null;
          throw this.fail(error, 'create');
        })
        .finally(() => {
          this.startPromise = null;
        });
      return this.startPromise;
    }

    async setRow(row) {
      this.row = row;
      if (!this.instance) return undefined;
      return this.invoke('setRow', [row]);
    }

    setActive(active) {
      this.active = Boolean(active);
      if (this.instance) this.invoke('setActive', [this.active]);
    }

    handleNativeMessage(message, sender) {
      if (this.instance) {
        this.invoke('handleNativeMessage', [message, sender]);
      }
    }

    handleViewportResize() {
      if (this.instance) this.invoke('handleViewportResize');
    }

    async reset() {
      if (this.disposed) return null;
      const previous = this.instance;
      this.instance = null;
      if (previous?.dispose) {
        await withTimeout(
          () => previous.dispose(),
          this.manifest.isolation.lifecycleTimeoutMs,
          `${this.manifest.name}.dispose()`
        ).catch(() => {});
      }
      this.scopedContext?.lifecycle?.dispose?.();
      this.scopedContext = null;
      this.lastError = null;
      this.state = 'created';
      return this.start();
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.state = 'disposed';
      const previous = this.instance;
      this.instance = null;
      try {
        previous?.setActive?.(false);
        previous?.dispose?.();
      } catch (_error) {}
      this.scopedContext?.lifecycle?.dispose?.();
      this.scopedContext = null;
      this.scope.remove();
    }

    getDiagnostics() {
      return Object.freeze({
        blockId: this.manifest.id,
        state: this.state,
        failureCount: this.failureCount,
        maxFailures: this.manifest.isolation.maxFailures,
        error: this.lastError?.message || '',
        permissions: [...this.manifest.permissions],
        isolation: this.manifest.isolation
      });
    }
  }

  globalThis[ISOLATION_KEY] = Object.freeze({
    apiVersion: 1,
    create(options) {
      return new IsolatedBlockInstance(options);
    },
    withTimeout,
    createError: isolationError
  });
})();
