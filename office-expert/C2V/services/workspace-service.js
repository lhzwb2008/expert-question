(() => {
  'use strict';

  const globalObject = globalThis;
  const root = globalObject.__cyleServicesV1 || (
    globalObject.__cyleServicesV1 = {}
  );
  if (root.workspaces?.apiVersion === 1) {
    globalObject.__cyleWorkspaceServiceV1 = root.workspaces;
    return;
  }

  const storage = globalObject.__cyleStorageServiceV1;
  if (!storage?.create) throw new Error('Workspace Service 需要 Storage Service');

  const store = storage.create({
    namespace: 'workspace-profiles'
  });
  const SCOPE = 'workspace';
  const NAMESPACE = 'profiles';
  const SCHEMA_VERSION = 1;
  const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
  const FIELD_MODES = new Set([
    'preserve',
    'all',
    'nonempty',
    'media',
    'selected'
  ]);

  const BUILT_INS = Object.freeze([
    Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id: 'viewer',
      name: '表格查看',
      description: '查看字段与媒体，不加载专业积木。',
      icon: 'Columns3',
      tools: Object.freeze([]),
      fields: Object.freeze({ mode: 'preserve', keys: Object.freeze([]) }),
      layout: Object.freeze({ autoArrange: false, snap: true, zoom: 1 }),
      builtin: true
    }),
    Object.freeze({schemaVersion: SCHEMA_VERSION, id:'machine-eval', name:'机器评估', description:'查看当前模型机评', icon:'FileText', tools:Object.freeze(['machine-eval']), fields:Object.freeze({mode:'preserve',keys:Object.freeze([])}), layout:Object.freeze({autoArrange:false,snap:true,zoom:1}), builtin:true}),
    Object.freeze({schemaVersion: SCHEMA_VERSION, id:'human-eval', name:'人工评估', description:'当前模型的人工评估页面', icon:'FileText', tools:Object.freeze(['human-eval']), fields:Object.freeze({mode:'preserve',keys:Object.freeze([])}), layout:Object.freeze({autoArrange:false,snap:true,zoom:1}), builtin:true}),
    Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id: 'caption-review',
      name: '多模型比对',
      description: '按模型切换人评结果、时间标注与编辑。',
      icon: 'Columns3',
      tools: Object.freeze(['caption-review']),
      fields: Object.freeze({ mode: 'preserve', keys: Object.freeze([]) }),
      layout: Object.freeze({ autoArrange: false, snap: true, zoom: 1 }),
      builtin: true
    }),
  ]);

  function workspaceError(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'CyleWorkspaceError';
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function safeId(value) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    return normalized || `workspace-${Date.now().toString(36)}`;
  }

  function uniqueStrings(value) {
    return [...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )];
  }

  function normalize(input = {}, options = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const name = String(source.name || '').trim();
    if (!name) throw workspaceError('INVALID_NAME', '工作区名称不能为空');
    const requestedId = String(source.id || '').trim();
    const id = safeId(requestedId || `workspace-${Date.now().toString(36)}`);
    if (!ID_PATTERN.test(id)) {
      throw workspaceError('INVALID_ID', '工作区 id 不是稳定英文标识');
    }
    const availableTools = options.availableTools
      ? new Set(options.availableTools.map(String))
      : null;
    const tools = uniqueStrings(source.tools).filter(id => !['video-gt', 'chains-time'].includes(id));
    const missingTools = availableTools
      ? tools.filter((toolId) => !availableTools.has(toolId))
      : [];
    if (missingTools.length && options.allowMissingTools !== true) {
      throw workspaceError(
        'UNKNOWN_TOOL',
        `工作区引用了未知积木：${missingTools.join('、')}`,
        { missingTools }
      );
    }
    const mode = FIELD_MODES.has(source.fields?.mode)
      ? source.fields.mode
      : 'preserve';
    const zoom = Math.min(
      1.5,
      Math.max(0.5, Number(source.layout?.zoom) || 1)
    );
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id,
      name,
      description: String(source.description || '').trim(),
      icon: String(source.icon || 'Boxes').trim() || 'Boxes',
      tools: Object.freeze(tools),
      fields: Object.freeze({
        mode,
        keys: Object.freeze(uniqueStrings(source.fields?.keys))
      }),
      layout: Object.freeze({
        autoArrange: Boolean(source.layout?.autoArrange),
        snap: source.layout?.snap !== false,
        zoom
      }),
      builtin: Boolean(source.builtin),
      missingTools: Object.freeze(missingTools),
      createdAt: source.createdAt || null,
      updatedAt: source.updatedAt || null
    });
  }

  function cloneWorkspace(workspace) {
    return structuredClone(workspace);
  }

  async function list(options = {}) {
    const records = await store.listRecords({
      scope: SCOPE,
      namespace: NAMESPACE,
      includeExpired: false
    });
    const custom = records.flatMap((record) => {
      try {
        return [normalize(record.value, {
          availableTools: options.availableTools,
          allowMissingTools: true
        })];
      } catch (_error) {
        return [];
      }
    });
    return [
      ...BUILT_INS.map(cloneWorkspace),
      ...custom.map(cloneWorkspace)
    ];
  }

  async function get(id, options = {}) {
    const key = String(id || '');
    const builtin = BUILT_INS.find((workspace) => workspace.id === key);
    if (builtin) return cloneWorkspace(builtin);
    const record = await store.readRecord({
      scope: SCOPE,
      namespace: NAMESPACE,
      id: key
    });
    return record
      ? cloneWorkspace(normalize(record.value, {
        availableTools: options.availableTools,
        allowMissingTools: true
      }))
      : null;
  }

  async function save(input, options = {}) {
    const normalized = normalize(input, options);
    if (BUILT_INS.some(({ id }) => id === normalized.id)) {
      throw workspaceError(
        'BUILTIN_READ_ONLY',
        '内置工作区不能覆盖，请先复制为自定义工作区'
      );
    }
    const existing = await store.readRecord({
      scope: SCOPE,
      namespace: NAMESPACE,
      id: normalized.id
    });
    const now = new Date().toISOString();
    const value = normalize({
      ...normalized,
      builtin: false,
      createdAt: existing?.value?.createdAt || normalized.createdAt || now,
      updatedAt: now
    }, options);
    const record = await store.writeRecord({
      scope: SCOPE,
      namespace: NAMESPACE,
      id: value.id,
      value,
      expectedRevision: options.expectedRevision ?? existing?.revision ?? 0,
      metadata: {
        type: 'cyle-workspace',
        schemaVersion: SCHEMA_VERSION
      }
    });
    return {
      workspace: cloneWorkspace(value),
      revision: record.revision
    };
  }

  async function duplicate(id, options = {}) {
    const source = await get(id, options);
    if (!source) throw workspaceError('NOT_FOUND', '找不到要复制的工作区');
    const suffix = Math.random().toString(36).slice(2, 6);
    return save({
      ...source,
      id: `workspace-${Date.now().toString(36)}-${suffix}`,
      name: `${source.name} 副本`,
      builtin: false,
      createdAt: null,
      updatedAt: null
    }, options);
  }

  async function remove(id) {
    const key = String(id || '');
    if (BUILT_INS.some((workspace) => workspace.id === key)) {
      throw workspaceError('BUILTIN_READ_ONLY', '内置工作区不能删除');
    }
    return store.deleteRecord({
      scope: SCOPE,
      namespace: NAMESPACE,
      id: key
    });
  }

  function exportWorkspace(input) {
    const workspace = normalize(input, { allowMissingTools: true });
    return JSON.stringify({
      format: 'cyle-workspace',
      version: 1,
      workspace: {
        ...workspace,
        builtin: false,
        missingTools: undefined
      }
    }, null, 2);
  }

  async function importWorkspace(source, options = {}) {
    let parsed;
    try {
      parsed = typeof source === 'string' ? JSON.parse(source) : source;
    } catch (error) {
      throw workspaceError('INVALID_JSON', `工作区 JSON 无效：${error.message}`);
    }
    if (parsed?.format !== 'cyle-workspace' || parsed?.version !== 1) {
      throw workspaceError('INVALID_FORMAT', '不是 Cyle Workspace v1 文件');
    }
    const workspace = {
      ...parsed.workspace,
      id: options.keepId
        ? parsed.workspace?.id
        : `workspace-${Date.now().toString(36)}`
    };
    return save(workspace, options);
  }

  const api = Object.freeze({
    apiVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    builtins: BUILT_INS.map(cloneWorkspace),
    normalize,
    list,
    get,
    save,
    duplicate,
    delete: remove,
    export: exportWorkspace,
    import: importWorkspace,
    createError: workspaceError
  });

  root.workspaces = api;
  root.WorkspaceService = api;
  globalObject.__cyleWorkspaceServiceV1 = api;
})();
