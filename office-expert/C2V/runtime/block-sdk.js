(() => {
  'use strict';

  const SDK_KEY = '__cyleBlockSdkV1';
  if (globalThis[SDK_KEY]) return;

  const SDK_VERSION = '1.0.0';
  const HOST_API_VERSION = '1.0.0';
  const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
  const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
  const ALLOWED_KINDS = new Set([
    'editor',
    'viewer',
    'validator',
    'assistant',
    'tool'
  ]);
  const ALLOWED_PERMISSIONS = new Set([
    'context.read',
    'data.write',
    'storage.local',
    'media.native',
    'service.storage',
    'service.drafts',
    'service.writeback',
    'service.media',
    'service.timeline',
    'service.host'
  ]);
  const CAPABILITY_PERMISSIONS = Object.freeze({
    'context.current-row': 'context.read',
    'write.cell': 'data.write',
    'draft.local': 'storage.local',
    'media.native-video': 'media.native',
    'service.storage': 'service.storage',
    'service.drafts': 'service.drafts',
    'service.writeback': 'service.writeback',
    'service.media': 'service.media',
    'service.timeline': 'service.timeline'
  });

  function sdkError(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'CyleBlockSdkError';
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function requireId(value, label = 'id') {
    const id = String(value || '').trim();
    if (!ID_PATTERN.test(id)) {
      throw sdkError(
        'INVALID_ID',
        `${label} 必须以字母或数字开头，并且只能包含英文、数字、点、横线或下划线`
      );
    }
    return id;
  }

  function parseSemver(value, label = 'version') {
    const text = String(value || '').trim();
    const match = text.match(SEMVER_PATTERN);
    if (!match) {
      throw sdkError('INVALID_VERSION', `${label} 必须使用 x.y.z 语义化版本`);
    }
    return Object.freeze({
      text,
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      prerelease: match[4] || ''
    });
  }

  function compareVersions(left, right) {
    const a = typeof left === 'string' ? parseSemver(left) : left;
    const b = typeof right === 'string' ? parseSemver(right) : right;
    return (
      a.major - b.major
      || a.minor - b.minor
      || a.patch - b.patch
      || (
        a.prerelease === b.prerelease
          ? 0
          : !a.prerelease
            ? 1
            : !b.prerelease
              ? -1
              : a.prerelease.localeCompare(b.prerelease)
      )
    );
  }

  function normalizeStringList(value, label, { ids = false } = {}) {
    const source = Array.isArray(value) ? value : [];
    const unique = [];
    const seen = new Set();
    source.forEach((item, index) => {
      const normalized = ids
        ? requireId(item, `${label}[${index}]`)
        : String(item || '').trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      unique.push(normalized);
    });
    return unique;
  }

  function normalizeSdkRange(value = {}) {
    const source = typeof value === 'string' ? { min: value } : value || {};
    const min = parseSemver(source.min || '1.0.0', 'sdk.min').text;
    const maxExclusive = parseSemver(
      source.maxExclusive || '2.0.0',
      'sdk.maxExclusive'
    ).text;
    if (compareVersions(min, maxExclusive) >= 0) {
      throw sdkError(
        'INVALID_SDK_RANGE',
        'sdk.min 必须小于 sdk.maxExclusive'
      );
    }
    return Object.freeze({ min, maxExclusive });
  }

  function derivePermissions(requires = []) {
    return normalizeStringList(
      requires.map((capability) => CAPABILITY_PERMISSIONS[capability]).filter(Boolean),
      'permissions',
      { ids: true }
    );
  }

  function normalizePermissions(value, requires) {
    const requested = normalizeStringList(
      Array.isArray(value) ? value : derivePermissions(requires),
      'permissions',
      { ids: true }
    );
    requested.forEach((permission) => {
      if (!ALLOWED_PERMISSIONS.has(permission)) {
        throw sdkError(
          'UNKNOWN_PERMISSION',
          `积木声明了未知权限：${permission}`,
          { permission }
        );
      }
    });
    const required = derivePermissions(requires);
    required.forEach((permission) => {
      if (!requested.includes(permission)) {
        throw sdkError(
          'MISSING_PERMISSION',
          `能力依赖需要权限 ${permission}，但清单未声明`,
          { permission }
        );
      }
    });
    return requested;
  }

  function normalizeTool(value = {}) {
    return Object.freeze({
      title: String(value.title || '').trim(),
      badge: String(value.badge || '积木').trim(),
      keywords: Object.freeze(normalizeStringList(value.keywords, 'tool.keywords')),
      defaultWidth: Math.max(560, Number(value.defaultWidth) || 960),
      defaultHeight: Math.max(420, Number(value.defaultHeight) || 760),
      minimumWidth: Math.max(360, Number(value.minimumWidth) || 560),
      minimumHeight: Math.max(260, Number(value.minimumHeight) || 420),
      autoHeight: Boolean(value.autoHeight)
    });
  }

  function normalizeIsolation(value = {}) {
    const mode = String(value.mode || 'scoped');
    if (!['shadow', 'scoped', 'trusted'].includes(mode)) {
      throw sdkError(
        'INVALID_ISOLATION_MODE',
        `不支持的隔离模式：${mode}`
      );
    }
    return Object.freeze({
      mode,
      lifecycleTimeoutMs: Math.min(
        30000,
        Math.max(500, Number(value.lifecycleTimeoutMs) || 10000)
      ),
      maxFailures: Math.min(
        10,
        Math.max(1, Number(value.maxFailures) || 3)
      ),
      styleScope: value.styleScope !== false
    });
  }

  function validateManifest(input = {}) {
    const id = requireId(input.id, '积木 id');
    const version = parseSemver(input.version || '1.0.0', '积木 version').text;
    const kind = String(input.kind || 'tool').trim();
    if (!ALLOWED_KINDS.has(kind)) {
      throw sdkError('INVALID_KIND', `不支持的积木类型：${kind}`);
    }
    const requires = normalizeStringList(input.requires, 'requires', { ids: true });
    const provides = normalizeStringList(input.provides, 'provides', { ids: true });
    const permissions = normalizePermissions(input.permissions, requires);
    const files = normalizeStringList(input.files, 'files');
    const readyGlobals = normalizeStringList(input.readyGlobals, 'readyGlobals');
    const factoryGlobal = String(input.factoryGlobal || '').trim();
    if (files.some((file) => (
      file.startsWith('/')
      || file.includes('..')
      || !/^[a-z0-9_./-]+\.js$/i.test(file)
    ))) {
      throw sdkError('INVALID_ENTRY_FILE', `积木 ${id} 包含不安全的入口文件`);
    }
    if (files.length && (!readyGlobals.length || !factoryGlobal)) {
      throw sdkError(
        'INCOMPLETE_ENTRY',
        `积木 ${id} 需要同时声明 readyGlobals 和 factoryGlobal`
      );
    }
    const manifest = {
      id,
      name: String(input.name || id).trim(),
      version,
      kind,
      description: String(input.description || '').trim(),
      sdk: normalizeSdkRange(input.sdk),
      requires: Object.freeze(requires),
      provides: Object.freeze(provides),
      permissions: Object.freeze(permissions),
      activationEvents: Object.freeze(
        normalizeStringList(input.activationEvents, 'activationEvents')
      ),
      files: Object.freeze(files),
      readyGlobals: Object.freeze(readyGlobals),
      factoryGlobal,
      isolation: normalizeIsolation(input.isolation),
      tool: normalizeTool(input.tool)
    };
    if (!manifest.name) {
      throw sdkError('INVALID_NAME', `积木 ${id} 缺少名称`);
    }
    if (!manifest.tool.title) {
      manifest.tool = Object.freeze({
        ...manifest.tool,
        title: manifest.name
      });
    }
    return Object.freeze(manifest);
  }

  function assertCompatible(manifest, version = SDK_VERSION) {
    const normalized = manifest?.sdk ? manifest : validateManifest(manifest);
    if (
      compareVersions(version, normalized.sdk.min) < 0
      || compareVersions(version, normalized.sdk.maxExclusive) >= 0
    ) {
      throw sdkError(
        'SDK_INCOMPATIBLE',
        `积木 ${normalized.name} 需要 SDK ${normalized.sdk.min}～${normalized.sdk.maxExclusive}，当前为 ${version}`,
        {
          blockId: normalized.id,
          sdkVersion: version,
          required: normalized.sdk
        }
      );
    }
    return true;
  }

  function validateInstance(instance, manifest) {
    if (!instance || typeof instance !== 'object') {
      throw sdkError(
        'INVALID_INSTANCE',
        `积木 ${manifest?.name || ''} 没有返回实例`
      );
    }
    ['setRow', 'setActive', 'dispose'].forEach((method) => {
      if (typeof instance[method] !== 'function') {
        throw sdkError(
          'INVALID_LIFECYCLE',
          `积木 ${manifest?.name || manifest?.id || ''} 缺少 ${method}()`,
          { method }
        );
      }
    });
    return instance;
  }

  function hasPermission(manifest, permission) {
    return Boolean(manifest?.permissions?.includes(permission));
  }

  function denied(permission, action) {
    return () => {
      throw sdkError(
        'PERMISSION_DENIED',
        `积木没有 ${permission} 权限，无法${action}`,
        { permission }
      );
    };
  }

  function createLifecycleScope() {
    const disposers = new Set();
    let disposed = false;
    function register(disposer) {
      if (typeof disposer !== 'function') return () => {};
      if (disposed) {
        try {
          disposer();
        } catch (_error) {}
        return () => {};
      }
      disposers.add(disposer);
      return () => {
        if (!disposers.delete(disposer)) return;
        try {
          disposer();
        } catch (_error) {}
      };
    }
    return Object.freeze({
      listen(target, type, listener, options) {
        if (!target?.addEventListener || typeof listener !== 'function') {
          throw sdkError(
            'INVALID_LISTENER',
            'lifecycle.listen 需要 EventTarget 和监听函数'
          );
        }
        target.addEventListener(type, listener, options);
        return register(() => target.removeEventListener(type, listener, options));
      },
      timeout(callback, delay = 0) {
        const timer = globalThis.setTimeout(callback, Math.max(0, Number(delay) || 0));
        register(() => globalThis.clearTimeout(timer));
        return timer;
      },
      interval(callback, delay = 0) {
        const timer = globalThis.setInterval(callback, Math.max(1, Number(delay) || 1));
        register(() => globalThis.clearInterval(timer));
        return timer;
      },
      onDispose(disposer) {
        return register(disposer);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        [...disposers].reverse().forEach((disposer) => {
          try {
            disposer();
          } catch (_error) {}
        });
        disposers.clear();
      },
      get disposed() {
        return disposed;
      },
      get size() {
        return disposers.size;
      }
    });
  }

  function createHostProxy(service, manifest) {
    if (!service) return undefined;
    const canRead = hasPermission(manifest, 'context.read');
    const canWrite = hasPermission(manifest, 'data.write');
    const canUseMedia = hasPermission(manifest, 'media.native');
    const allowType = (type) => {
      const messageType = String(type || '');
      if (
        [
          'READ_ACTIVE_ROW',
          'READ_SHEET_ROW_BY_KEY',
          'READ_QUESTION_NAVIGATION',
          'GET_ACTIVE_POSITION',
          'SELECT_ROW',
          'RESOLVE_ATTACHMENT_URL'
        ].includes(messageType)
      ) return canRead;
      if (['WRITE_ACTIVE_ROW_CELL', 'WRITE_SHEET_CELL'].includes(messageType)) {
        return canWrite;
      }
      if (
        messageType === 'DETECT_VIDEO_FPS'
        || messageType.startsWith('NATIVE_VIDEO_')
        || messageType.endsWith('_NATIVE_VIDEO')
        || messageType.includes('_NATIVE_VIDEO_')
      ) return canUseMedia;
      return false;
    };
    const assertType = (type) => {
      if (!allowType(type)) {
        throw sdkError(
          'PERMISSION_DENIED',
          `积木无权调用 Host 消息：${String(type || '')}`,
          { type: String(type || '') }
        );
      }
    };
    return Object.freeze({
      apiVersion: service.apiVersion,
      send(message) {
        assertType(message?.type);
        return service.send(message);
      },
      request(type, payload) {
        assertType(type);
        return service.request(type, payload);
      },
      readActiveRow: canRead
        ? () => service.readActiveRow()
        : denied('context.read', '读取当前行'),
      readRowByKey: canRead
        ? (payload) => service.readRowByKey(payload)
        : denied('context.read', '读取指定行'),
      questionNavigation: canRead
        ? (payload) => service.questionNavigation(payload)
        : denied('context.read', '读取题号导航'),
      selectRow: canRead
        ? (payload) => service.selectRow(payload)
        : denied('context.read', '切换当前行'),
      resolveAttachment: canRead
        ? (fileToken) => service.resolveAttachment(fileToken)
        : denied('context.read', '解析附件'),
      detectVideoMetadata: canUseMedia
        ? (url) => service.detectVideoMetadata(url)
        : denied('media.native', '探测视频元数据'),
      nativeVideoCommand: canUseMedia
        ? (type, payload) => service.nativeVideoCommand(type, payload)
        : denied('media.native', '操作原生视频')
    });
  }

  function createScopedContext(manifestInput, hostContext = {}) {
    const manifest = manifestInput?.sdk
      ? manifestInput
      : validateManifest(manifestInput);
    assertCompatible(manifest);
    const services = hostContext.services || {};
    const serviceRules = {
      storage: ['service.storage', 'storage.local'],
      drafts: ['service.drafts', 'storage.local'],
      writeback: ['service.writeback', 'data.write'],
      media: ['service.media', 'media.native'],
      timeline: ['service.timeline'],
      host: ['service.host', 'context.read', 'data.write', 'media.native'],
      legacyStorage: ['storage.local']
    };
    const scopedServices = Object.fromEntries(
      Object.entries(serviceRules).flatMap(([name, permissions]) => (
        permissions.some((permission) => hasPermission(manifest, permission))
        && services[name]
          ? [[name, services[name]]]
          : []
      ))
    );
    if (scopedServices.host) {
      scopedServices.host = createHostProxy(scopedServices.host, manifest);
    }
    const lifecycle = createLifecycleScope();
    return Object.freeze({
      root: hostContext.root,
      manifest,
      sdkVersion: SDK_VERSION,
      getRow: hasPermission(manifest, 'context.read')
        ? hostContext.getRow
        : denied('context.read', '读取当前行'),
      onNotice: typeof hostContext.onNotice === 'function'
        ? hostContext.onNotice
        : () => {},
      onWrite: hasPermission(manifest, 'data.write')
        ? hostContext.onWrite
        : denied('data.write', '写回数据'),
      onOpenNativeVideo: hasPermission(manifest, 'media.native')
        ? hostContext.onOpenNativeVideo
        : denied('media.native', '打开原生视频'),
      services: Object.freeze(scopedServices),
      ui: Object.freeze({
        scaleSurface(element) {
          if (!globalThis.__cyleScaleV1) throw sdkError('UI_UNAVAILABLE', '缩放服务尚未加载');
          const surface = globalThis.__cyleScaleV1.surface(element);
          lifecycle.onDispose(() => globalThis.__cyleScaleV1.dispose(element));
          return surface;
        },
        // The shell scales every standard tool card automatically. Use this
        // only for a plugin's own additional resizable surface.
        bindScale(options) {
          if (!globalThis.__cyleScaleV1) throw sdkError('UI_UNAVAILABLE', '缩放服务尚未加载');
          const binding = globalThis.__cyleScaleV1.bindCorner(options);
          lifecycle.onDispose(() => { binding.dispose(); globalThis.__cyleScaleV1.dispose(options.element); });
          return binding;
        }
      }),
      lifecycle,
      hasPermission: (permission) => hasPermission(manifest, permission)
    });
  }

  function defineBlock(input = {}) {
    const manifest = validateManifest(input.manifest || input);
    assertCompatible(manifest);
    if (typeof input.create !== 'function') {
      throw sdkError('MISSING_FACTORY', `积木 ${manifest.name} 缺少 create(context)`);
    }
    return Object.freeze({
      manifest,
      create: input.create
    });
  }

  globalThis[SDK_KEY] = Object.freeze({
    apiVersion: 1,
    version: SDK_VERSION,
    hostApiVersion: HOST_API_VERSION,
    permissions: Object.freeze([...ALLOWED_PERMISSIONS]),
    validateManifest,
    assertCompatible,
    validateInstance,
    createScopedContext,
    createLifecycleScope,
    defineBlock,
    compareVersions,
    createError: sdkError
  });
})();
