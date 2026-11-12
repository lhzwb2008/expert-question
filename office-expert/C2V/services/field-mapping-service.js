(() => {
  "use strict";
  if (globalThis.__cyleFieldMappingV1) return;
  const groups = ["题目与素材", "评分结果", "人员与状态", "评分标准"];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function letter(index) {
    let out = "";
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
      out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    return out;
  }
  function key(row) {
    if (!row?.tableKey || !row.sheetId) throw new Error("请先读取工作表。");
    return `cyleFieldMappingV1:${globalThis.location?.origin || ""}:${row.tableKey.split("::")[0]}::${row.sheetId}`;
  }
  const source = (row, index) =>
    index < 0 ? null : { index, header: row.headers[index] };
  const valid = (row, ref) =>
    ref &&
    Number.isInteger(ref.index) &&
    ref.index >= 0 &&
    ref.index < row.headers.length &&
    row.headers[ref.index] === ref.header;
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .toLowerCase();
  const tagNames = new Set([
    "一级场景",
    "二级场景",
    "题型",
    "标签",
    "tag",
    "tags",
    "参考素材类型(多选)",
    "技术栈",
    "分镜",
    "标准解法提供方式",
    "画幅要求(prompt口径)",
    "分辨率要求(prompt口径)",
    "视频时长(秒)",
  ]);
  const identityNames = new Set([
    "题目id",
    "case id",
    "case_id",
    "caseid",
    "question id",
    "question_id",
  ]);
  const stemNames = new Set([
    "题干",
    "问题描述",
    "参考答案",
    "来源",
    "参考文档要点(详细版)",
    "标准解题步骤及关键核验点",
  ]);
  const fixedEntities = () => [
    { id: "question", name: "题目题干", type: "fixed" },
    { id: "tags", name: "题目 tag", type: "fixed" },
  ];
  const modelRole = (role) =>
    /^(?:视频|图片|模型回答|模型结果|产物)/.test(role)
      ? "产物"
      : /^rubric/i.test(role)
        ? "rubric"
        : /^(?:机评|机器评估)/.test(role)
          ? "机评"
          : "人评";
  const roleGroup = (role) =>
    role === "产物" ? groups[0] : role === "rubric" ? groups[3] : groups[1];
  function describe(header) {
    const name = String(header || "").trim(),
      n = normalize(name);
    if (!name || name === "标注结果") return null;
    if (identityNames.has(n))
      return { entityId: "tags", role: "题目ID", group: groups[0] };
    if (["题目类型", "question type", "question_type"].includes(n))
      return { entityId: "tags", role: "题目类型", group: groups[0] };
    if (tagNames.has(n) || /^标签[-_ :：]/.test(n))
      return { entityId: "tags", role: name, group: groups[0] };
    if (["prompt", "题干", "问题描述"].includes(n))
      return { entityId: "question", role: "Prompt", group: groups[0] };
    if (
      stemNames.has(n) ||
      /^prompt(?:$|\s|\()/.test(n) ||
      /^参考(?:素材|材料)\s*\d*$/.test(n)
    )
      return { entityId: "question", role: name, group: groups[0] };
    const model = name.match(
      /^(.*?)\s*(?:[-_·:：]\s*|\s+)(视频(?:链接|地址|结果)?|图片(?:链接|地址)?|模型回答|模型结果|产物|rubrics?|机评(?:结果)?|机器评估(?:结果)?|人评(?:结果)?|人工评估(?:结果)?)$/i,
    );
    if (model?.[1].trim()) {
      const entity = {
          id: `model:${normalize(model[1])}`,
          name: model[1].trim(),
          type: "model",
        },
        role = modelRole(normalize(model[2]));
      return { entity, entityId: entity.id, role, group: roleGroup(role) };
    }
    let work = name.match(
      /^(.+?)(?:\s*[-_·:：]\s*|\s+)(人员|标注同学|质检同学|状态|标注状态|质检状态|备注|标注备注|质检备注|评分结果)$/,
    );
    work ||= name.match(/^(.+组(?:\s*\d+)?)(人员|状态|备注)$/);
    if (!work) {
      const simple = name.match(/^(标注|质检)(同学|人员|状态|备注)$/);
      if (simple) work = [name, `${simple[1]}组`, simple[2]];
    }
    if (work) {
      const entity = {
        id: `work:${normalize(work[1])}`,
        name: work[1].trim(),
        type: "work",
      };
      const role = /同学|人员/.test(work[2])
        ? "人员"
        : /状态/.test(work[2])
          ? "状态"
          : /备注/.test(work[2])
            ? "备注"
            : "评分结果";
      return {
        entity,
        entityId: entity.id,
        role,
        group: role === "评分结果" ? groups[1] : groups[2],
      };
    }
    return null;
  }
  function candidates(row) {
    const counts = new Map();
    row.headers.forEach((h) =>
      counts.set(normalize(h), (counts.get(normalize(h)) || 0) + 1),
    );
    const found = row.headers.flatMap((header, index) => {
      const info = describe(header);
      return info && counts.get(normalize(header)) === 1
        ? [{ ...info, source: source(row, index) }]
        : [];
    });
    const roles = new Map(),
      meaning = (c) => `${c.entityId}:${normalize(c.role)}`;
    for (const c of found)
      roles.set(meaning(c), (roles.get(meaning(c)) || 0) + 1);
    // Different aliases can still compete for the same single-valued role.
    return found.filter(
      (c) => c.role === "产物" || roles.get(meaning(c)) === 1,
    );
  }
  function upgrade(input, row) {
    const config = clone(input);
    config.entities ||= [];
    for (const fixed of fixedEntities())
      if (!config.entities.some((e) => e.id === fixed.id))
        config.entities.push(fixed);
    config.fields = (config.fields || []).filter(
      (f) =>
        f.source?.header !== "标注结果" &&
        f.label !== "已有人工标注（多模型汇总）",
    );
    // Migrate legacy labels, not table-specific model/header exceptions.
    for (const field of config.fields) {
      if (field.id === config.identityFieldId) field.role = "题目ID";
      if (field.id === config.questionTypeFieldId) field.role = "题目类型";
      if (
        field.entityId &&
        config.entities.some((e) => e.id === field.entityId)
      )
        continue;
      const parts = field.label.split(" · ");
      if (parts.length > 1) {
        const type = field.group === groups[2] ? "work" : "model",
          name = parts[0];
        let entity = config.entities.find(
          (e) => e.type === type && normalize(e.name) === normalize(name),
        );
        if (!entity) {
          entity = { id: field.entityId || name, name, type };
          config.entities.push(entity);
        }
        field.entityId = entity.id;
        field.role ||= parts.slice(1).join(" · ");
      } else {
        const info = describe(field.label);
        field.entityId =
          field.id === config.identityFieldId
            ? "tags"
            : info?.entityId || "question";
        field.role ||= info?.role || field.label;
      }
    }
    config.fields = config.fields.filter(
      (f) =>
        f.source ||
        f.unresolvedSource ||
        !/^field-\d+$/.test(f.id) ||
        input.entities?.some((e) => e.id === f.entityId),
    );
    config.entities = config.entities.filter(
      (e) =>
        e.type === "fixed" || config.fields.some((f) => f.entityId === e.id),
    );
    return config;
  }
  function entityName(entity, config) {
    if (entity?.type !== "model") return entity?.name;
    const names = new Set(
      config.fields
        .filter((f) => f.entityId === entity.id && f.source)
        .map((f) => describe(f.source.header)?.entity)
        .filter((e) => e?.type === "model")
        .map((e) => normalize(e.name)),
    );
    return names.size === 1 ? [...names][0] : entity.name;
  }
  function roleKey(field, config) {
    const entity = config.entities?.find((e) => e.id === field.entityId);
    return `${entity?.type || "fixed"}:${normalize(entityName(entity, config) || field.entityId)}:${normalize(field.role || field.label)}`;
  }
  function setSpecialFields(config) {
    const identities = config.fields.filter(
      (f) => f.source && f.role === "题目ID",
    );
    if (!config.identityFieldId && identities.length === 1)
      config.identityFieldId = identities[0].id;
    if (!Object.hasOwn(config, "questionTypeFieldId")) {
      const direct = config.fields.filter(
        (f) => f.source && f.role === "题目类型",
      );
      const fallback = config.fields.filter(
        (f) => f.source && normalize(f.source.header) === "一级场景",
      );
      const choices = direct.length ? direct : fallback;
      config.questionTypeFieldId = choices.length === 1 ? choices[0].id : "";
    }
  }
  function reconcile(row, input, { suggest = false } = {}) {
    if (input.table !== key(row))
      throw new Error("映射属于其他工作表，请重新打开当前表的映射设置。");
    const config = upgrade(input, row),
      stats = { kept: 0, repaired: 0, added: 0 },
      issues = [];
    const detected = candidates(row);
    const used = new Set(
      config.fields
        .filter((f) => valid(row, f.source))
        .map((f) => f.source.index),
    );
    const entities = config.entities;
    const relocated = new Map();
    const candidateKey = (candidate) =>
      candidate.entity
        ? `${candidate.entity.type}:${normalize(candidate.entity.name)}:${normalize(candidate.role)}`
        : roleKey(candidate, { entities: fixedEntities() });
    function entityFor(candidate) {
      if (!candidate.entity)
        return entities.find((e) => e.id === candidate.entityId);
      const matches = entities.filter(
        (e) =>
          e.type === candidate.entity.type &&
          normalize(entityName(e, config)) === normalize(candidate.entity.name),
      );
      if (matches.length > 1) {
        issues.push(`${candidate.source.header} 可归属多个项目，请手动确认`);
        return null;
      }
      let entity = matches[0];
      if (!entity) {
        entity = clone(candidate.entity);
        entities.push(entity);
      }
      return entity;
    }
    for (const field of config.fields) {
      if (valid(row, field.source)) {
        stats.kept++;
        delete field.unresolvedSource;
        delete field.mappingIssue;
        continue;
      }
      const previous = field.source || field.unresolvedSource;
      field.source = null;
      const previousKey = previous ? JSON.stringify(previous) : null;
      if (previousKey && relocated.has(previousKey)) {
        field.source = clone(relocated.get(previousKey));
        stats.repaired++;
        delete field.unresolvedSource;
        delete field.mappingIssue;
        continue;
      }

      if (!previous && !suggest) continue;
      let matches = previous
        ? row.headers.flatMap((h, i) =>
            normalize(h) === normalize(previous.header) ? [source(row, i)] : [],
          )
        : [];
      if (matches.length === 0 && suggest) {
        matches = detected
          .filter((c) => candidateKey(c) === roleKey(field, config))
          .map((c) => c.source);
      }
      if (matches.length === 1 && !used.has(matches[0].index)) {
        field.source = matches[0];
        used.add(field.source.index);
        stats.repaired++;
        if (previousKey) relocated.set(previousKey, field.source);
        delete field.unresolvedSource;
        delete field.mappingIssue;
      } else if (previous) {
        field.unresolvedSource = previous;
        field.mappingIssue =
          matches.length > 1
            ? "存在同名列，请手动确认"
            : matches.length
              ? "候选列已关联其他项目"
              : "未找到原列，请手动确认";
        issues.push(field.mappingIssue);
      }
    }
    if (suggest)
      for (const candidate of detected) {
        if (used.has(candidate.source.index)) continue;
        if (
          candidate.role !== "产物" &&
          config.fields.some(
            (f) =>
              valid(row, f.source) &&
              roleKey(f, config) === candidateKey(candidate),
          )
        )
          continue;
        const entity = entityFor(candidate),
          role = candidate.role;
        if (!entity) continue;
        const id = `auto:${candidate.source.index}:${normalize(role)}`;
        config.fields.push({
          id: config.fields.some((f) => f.id === id)
            ? `${id}:${config.fields.length}`
            : id,
          entityId: entity.id,
          role,
          group: candidate.group,
          label:
            entity.type === "fixed"
              ? candidate.source.header
              : `${entity.name} · ${role}`,
          source: candidate.source,
        });
        used.add(candidate.source.index);
        stats.added++;
      }
    config.headers = [...row.headers];
    setSpecialFields(config);
    const unassigned = row.headers.flatMap((header, index) =>
      header && header !== "标注结果" && !used.has(index)
        ? [{ index, header }]
        : [],
    );
    return { config, stats, issues, unassigned };
  }
  function defaults(row) {
    return reconcile(
      row,
      {
        version: 1,
        table: key(row),
        headers: [...row.headers],
        fields: [],
        entities: fixedEntities(),
      },
      { suggest: true },
    ).config;
  }
  function autoMap(row, draft) {
    return reconcile(row, draft || defaults(row), { suggest: true });
  }
  async function load(row, store = chrome.storage.local) {
    const saved = (await store.get(key(row)))[key(row)];
    return saved ? reconcile(row, saved).config : null;
  }
  function read(row, config) {
    if (
      config?.version !== 1 ||
      config.table !== key(row) ||
      !Array.isArray(config.fields)
    )
      throw new Error("尚未配置此工作表的映射，请打开映射设置。");
    return config.fields
      .filter((field) => field.source)
      .map((field) => {
        if (!valid(row, field.source))
          throw new Error(`${field.label} 的源列已变化，请重新选择。`);
        const cell = row.cells.find(
          (cell) => cell.columnIndex === field.source.index,
        );
        if (!cell) throw new Error(`${field.label} 的单元格未读取，请刷新。`);
        return {
          isIdentity: field.id === config.identityFieldId,
          id: field.id,
          group: field.group,
          label: field.label,
          source: field.source,
          cell,
          value: cell.value,
        };
      });
  }
  async function save(row, draft, store = chrome.storage.local) {
    const config = upgrade(draft, row);
    config.headers = [...row.headers];
    config.table = key(row);
    if (
      !config.fields.every(
        (f) =>
          typeof f.label === "string" &&
          f.label.trim() &&
          groups.includes(f.group),
      )
    )
      throw new Error("请填写业务字段名称和分组。");
    if (!read(row, config).length) throw new Error("请至少绑定一个源列。");
    await store.set({ [key(row)]: config });
    return config;
  }
  function publicGroups(row, config) {
    const result = new Map();
    const tags = new Set([
      "题目ID",
      "一级场景",
      "二级场景",
      "题型",
      "参考素材类型（多选）",
      "技术栈",
      "分镜",
      "标准解法提供方式",
      "画幅要求（Prompt口径）",
      "分辨率要求（Prompt口径）",
      "视频时长（秒）",
    ]);
    for (const item of read(row, config)) {
      const field = config.fields.find((f) => f.id === item.id),
        entity = config.entities?.find((e) => e.id === field.entityId);
      const role = field.role || field.label.split(" · ").at(-1);
      const model =
        entity?.type === "model" ||
        (!entity &&
          field.label.includes(" · ") &&
          field.group !== "人员与状态");
      const answer =
        model &&
        (role === "产物" ||
          /视频链接|图片链接|模型回答|模型结果/.test(item.source.header));
      const stem =
        !item.isIdentity &&
        (entity?.id === "question" ||
          (!entity &&
            !tags.has(field.label) &&
            field.group === "题目与素材" &&
            !model));
      if (!answer && !stem) continue;
      if (stem && !answer) {
        const c = item.cell;
        const hasValue = [c.value, c.rawValue, c.displayValue].some(
          (value) =>
            value !== null &&
            value !== undefined &&
            (typeof value !== "string" || value.trim() !== ""),
        );
        const hasMaterial = Boolean(
          c.attachments?.length ||
            c.url ||
            c.metadata?.fileToken ||
            c.metadata?.imageToken ||
            c.metadata?.downloadUrl ||
            c.metadata?.thumbUrl,
        );
        const hasRichContent = [
          ...(c.rich_text || []),
          ...(c.segments || []),
        ].some(
          (part) =>
            part.fileToken ||
            part.image_token ||
            part.attachment_token ||
            part.mention_token ||
            String(part.text || "").trim(),
        );
        if (!hasValue && !hasMaterial && !hasRichContent) continue;
      }
      const categories = result.get(item.source.index) || new Set();
      result.set(item.source.index, categories);
      if (answer) {
        categories.add("answer");
        continue;
      }
      categories.add("stem");
      const c = item.cell,
        attachments = c.attachments || [];
      const kinds = new Set(attachments.map((a) => a.kind || "file"));
      if (c.type) kinds.add(c.type);
      if (kinds.has("image") || kinds.has("video") || kinds.has("audio"))
        categories.add("media");
      const fileNames = [
        c.metadata?.fileName,
        c.url,
        c.displayValue,
        ...attachments.map((a) => a.fileName || a.name),
      ]
        .filter(Boolean)
        .join(" ");
      if (
        attachments.some((a) => a.kind === "file") ||
        c.type === "file" ||
        /\.(?:pdf|docx?|csv|pptx|md)(?:[?#\s]|$)/i.test(fileNames)
      )
        categories.add("document");
    }
    return result;
  }
  globalThis.__cyleFieldMappingV1 = Object.freeze({
    groups,
    clone,
    letter,
    key,
    source,
    valid,
    defaults,
    autoMap,
    reconcile,
    describe,
    load,
    read,
    save,
    publicGroups,
  });
})();
