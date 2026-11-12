(() => {
  "use strict";
  if (globalThis.__cyleHumanRubricV1) return;
  const KEY = "cyleHumanRubricConfigV1";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const object = (x) =>
    x !== null && typeof x === "object" && !Array.isArray(x);
  const text = (x) => typeof x === "string" && x.trim().length > 0;
  function validate(config) {
    const errors = [];
    const add = (message, path, position = {}) =>
      errors.push({ message, path, ...position });
    if (!object(config))
      return [{ message: "配置必须是 JSON 对象", path: "$" }];
    if (config.schema !== "human-rubric/1")
      add("schema 必须为 human-rubric/1", "schema");
    for (const key of ["name", "version"])
      if (!text(config[key])) add(`${key} 不能为空`, key);
    if (!Array.isArray(config.templates) || !config.templates.length) {
      add("至少需要一个题目类型", "templates");
      return errors;
    }
    const templateIds = new Set(),
      matches = new Set();
    config.templates.forEach((t, ti) => {
      const pos = { ti },
        path = `templates[${ti}]`;
      if (!object(t)) {
        add("题目类型必须是对象", path, pos);
        return;
      }
      for (const key of ["id", "name", "question_type"])
        if (!text(t[key]))
          add(`题目类型 ${key} 不能为空`, `${path}.${key}`, pos);
      if (text(t.id)) {
        if (templateIds.has(t.id.trim()))
          add(`题目类型 ID 重复：${t.id}`, `${path}.id`, pos);
        templateIds.add(t.id.trim());
      }
      if (text(t.question_type)) {
        if (matches.has(t.question_type.trim()))
          add(`匹配值重复：${t.question_type}`, `${path}.question_type`, pos);
        matches.add(t.question_type.trim());
      }
      if (!Array.isArray(t.dimension_groups) || !t.dimension_groups.length) {
        add("至少需要一个维度分组", `${path}.dimension_groups`, pos);
        return;
      }
      const groupIds = new Set(),
        criterionIds = new Set();
      t.dimension_groups.forEach((g, gi) => {
        const pos = { ti, gi },
          gp = `${path}.dimension_groups[${gi}]`;
        if (!object(g)) {
          add("维度分组必须是对象", gp, pos);
          return;
        }
        for (const key of ["id", "name"])
          if (!text(g[key])) add(`分组 ${key} 不能为空`, `${gp}.${key}`, pos);
        if (groupIds.has(g.id)) add(`分组 ID 重复：${g.id}`, `${gp}.id`, pos);
        groupIds.add(g.id);
        if (
          typeof g.weight !== "number" ||
          !Number.isFinite(g.weight) ||
          g.weight <= 0
        )
          add("分组权重必须是正数", `${gp}.weight`, pos);
        if (!Array.isArray(g.criteria) || !g.criteria.length) {
          add("分组中至少需要一个维度", `${gp}.criteria`, pos);
          return;
        }
        g.criteria.forEach((c, ci) => {
          const pos = { ti, gi, ci },
            cp = `${gp}.criteria[${ci}]`;
          if (!object(c)) {
            add("维度必须是对象", cp, pos);
            return;
          }
          for (const key of ["id", "title", "definition", "scoring_rules"])
            if (!text(c[key])) add(`维度 ${key} 不能为空`, `${cp}.${key}`, pos);
          if (criterionIds.has(c.id))
            add(`当前题目类型内维度 ID 重复：${c.id}`, `${cp}.id`, pos);
          criterionIds.add(c.id);
          if (typeof c.enabled !== "boolean")
            add("启用状态必须是 true 或 false", `${cp}.enabled`, pos);
          if (
            typeof c.weight !== "number" ||
            !Number.isFinite(c.weight) ||
            c.weight <= 0
          )
            add("维度权重必须是正数", `${cp}.weight`, pos);
          if (
            !Array.isArray(c.score_values) ||
            !c.score_values.length ||
            c.score_values.some(
              (v) => !Number.isInteger(v) || v < 1 || v > 5,
            ) ||
            new Set(c.score_values).size !== c.score_values.length
          )
            add(
              "可用分数须为不重复的 1–5 整数，且至少选择一项",
              `${cp}.score_values`,
              pos,
            );
        });
      });
    });
    return errors;
  }
  function assertValid(config) {
    const errors = validate(config);
    if (errors.length) {
      const error = new Error(
        errors.map((e) => `${e.path}：${e.message}`).join("\n"),
      );
      error.issues = errors;
      throw error;
    }
    return config;
  }
  async function defaults() {
    const response = await chrome.runtime.sendMessage({
      type: "GET_HUMAN_RUBRIC_DEFAULT",
    });
    if (!response?.ok)
      throw new Error(response?.error || "默认评分配置读取失败");
    return clone(assertValid(response.config));
  }
  async function load(store = chrome.storage.local) {
    const saved = (await store.get(KEY))[KEY];
    return saved ? clone(assertValid(saved)) : defaults();
  }
  async function save(config, store = chrome.storage.local) {
    const copy = clone(assertValid(config));
    await store.set({ [KEY]: copy });
    globalThis.document?.dispatchEvent(
      new CustomEvent("cyle:human-rubric-saved"),
    );
    return copy;
  }
  function parse(source) {
    let config;
    try {
      config = JSON.parse(source);
    } catch (e) {
      throw new Error(`JSON 格式错误：${e.message}`);
    }
    return clone(assertValid(config));
  }
  globalThis.__cyleHumanRubricV1 = Object.freeze({
    KEY,
    clone,
    validate,
    assertValid,
    defaults,
    load,
    save,
    parse,
  });
})();
