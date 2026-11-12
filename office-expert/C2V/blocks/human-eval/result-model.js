(() => {
  "use strict";
  const clone = (value) => structuredClone(value);
  const key = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[–—]/g, "-");
  function normalizeAnswers(answers = []) {
    return clone(answers).map((answer) => {
      answer.status ||= answer.score == null ? "unscored" : "scored";
      answer.annotations ||= [];
      answer.evidence ||= [];
      if (answer.evidence.some((e) => !e.annotationId)) {
        const id = "unlinked";
        if (!answer.annotations.some((a) => a.id === id))
          answer.annotations.push({ id, correct: null, text: "" });
        answer.evidence.forEach((e) => {
          e.annotationId ||= id;
        });
      }
      return answer;
    });
  }
  function parse(text, { caseId, modelNames = [], rubricId } = {}) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
    if (data?.schema !== "human-eval/1") return null;
    const fail = (message) => {
      throw new Error(`人评 JSON：${message}`);
    };
    if (caseId && data.case_id !== caseId) fail("题目 ID 与当前行不一致。");
    if (!data.model || !data.rubric_id || !Array.isArray(data.criteria))
      fail("缺少模型、rubric 或维度信息。");
    if (
      modelNames.length &&
      !modelNames.some(
        (name) =>
          key(name) === key(data.model) ||
          key(name).startsWith(key(data.model) + " ") ||
          key(name).startsWith(key(data.model) + "-"),
      )
    )
      fail("模型与当前映射不一致。");
    if (rubricId && data.rubric_id !== rubricId)
      fail("rubric 与当前题目类型不一致。");
    const ids = new Set();
    const answers = data.criteria.map((c) => {
      if (typeof c.id !== "string" || !c.id || ids.has(c.id))
        fail("维度 ID 为空或重复。");
      ids.add(c.id);
      if (
        !["scored", "unscored", "excluded"].includes(c.status) ||
        !(
          c.score === null ||
          (Number.isInteger(c.score) && c.score >= 1 && c.score <= 5)
        )
      )
        fail(`${c.id} 的分数或状态无效。`);
      if ((c.status === "scored") !== (c.score !== null))
        fail(`${c.id} 的分数与状态不一致。`);
      if (typeof c.note !== "string" || !Array.isArray(c.annotations))
        fail(`${c.id} 的备注或标注格式错误。`);
      const annotations = [],
        evidence = [],
        annotationIds = new Set();
      for (const a of c.annotations) {
        if (
          typeof a.id !== "string" ||
          !a.id ||
          annotationIds.has(a.id) ||
          typeof a.text !== "string" ||
          ![true, false, null].includes(a.correct) ||
          !Array.isArray(a.times)
        )
          fail(`${c.id} 的标注条目格式错误。`);
        annotationIds.add(a.id);
        const { times, ...rest } = clone(a);
        annotations.push(rest);
        times.forEach((t, index) => {
          if (
            !Number.isFinite(t.start) ||
            !Number.isFinite(t.end) ||
            t.start < 0 ||
            t.end < t.start
          )
            fail(`${c.id} 的时间范围无效。`);
          evidence.push({
            ...t,
            id: `${c.id}/${a.id}/${index}`,
            annotationId: a.id,
            kind: t.start === t.end ? "point" : "range",
          });
        });
      }
      return {
        criterionId: c.id,
        status: c.status,
        score: c.score,
        note: c.note,
        annotations,
        evidence,
      };
    });
    return { result: clone(data), answers };
  }
  function serialize(result, answers) {
    const out = clone(result);
    const existing = new Map(out.criteria.map((c) => [c.id, c]));
    for (const answer of normalizeAnswers(answers)) {
      existing.set(answer.criterionId, {
        ...existing.get(answer.criterionId),
        id: answer.criterionId,
        status: answer.status,
        score: answer.score,
        note: answer.note || "",
        annotations: answer.annotations.map((a) => ({
          ...a,
          times: answer.evidence
            .filter((e) => e.annotationId === a.id)
            .map(({ start, end }) => ({ start, end })),
        })),
      });
    }
    out.criteria = [...existing.values()];
    return out;
  }
  globalThis.__cyleHumanResultV1 = Object.freeze({
    parse,
    serialize,
    normalizeAnswers,
  });
})();
