(() => {
  "use strict";
  const el = (tag, text = "", cls = "") => {
    const n = document.createElement(tag);
    n.textContent = text;
    n.className = cls;
    return n;
  };
  const button = (text, action) => {
    const n = el("button", text);
    n.type = "button";
    n.addEventListener("click", action);
    return n;
  };
  const scoreLabel = (answer) =>
    answer?.status === "excluded"
      ? "剔除"
      : answer?.score == null
        ? "未评分"
        : `${answer.score} 分`;
  const judgment = (value) =>
    value === true ? "符合" : value === false ? "不符合" : "未判定";
  class HumanReviewList extends globalThis.__cyleHumanTimelineV1 {
    refreshList() {
      const top = this.details.scrollTop;
      this.renderDetails();
      this.details.scrollTop = top;
    }
    textEditor(node, value, label, commit, onFinish = null) {
      const start = () => {
        if (node.querySelector("textarea")) return;
        const input = el("textarea");
        input.value = value;
        input.setAttribute("aria-label", label);
        node.replaceChildren(input);
        const state = this.humanState;
        const apply = (value) => {
          if (this.humanState === state) commit(value);
        };
        input.addEventListener("input", () => apply(input.value));
        let done = false;
        const finish = (cancel) => {
          if (done) return;
          done = true;
          apply(cancel ? value : input.value);
          const next = cancel ? value : input.value;
          if (this.humanState === state) onFinish?.(value, next);
          value = next;
          node.textContent = next || "双击填写说明";
          if (node.classList.contains('human-note') && !next.trim()) node.remove();
        };
        input.addEventListener("blur", () => finish(false));
        input.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            finish(true);
          } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter")
            finish(false);
        });
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      };
      node.tabIndex = 0;
      node.title = "双击编辑";
      node.addEventListener("dblclick", start);
      node.addEventListener("keydown", (e) => {
        if (e.target === node && e.key === "Enter") {
          e.preventDefault();
          start();
        }
      });
      return start;
    }
    inferAnnotationTimes(criterionId, annotation, before, after) {
      if (before === after) return;
      const old = new Map();
      for (const t of HumanReviewList.times(before)) { const key = `${t.start}/${t.end}`; old.set(key, (old.get(key) || 0) + 1); }
      const answer = this.answer(criterionId), evidence = [...(answer.evidence || [])];
      for (const t of HumanReviewList.times(after)) {
        const key = `${t.start}/${t.end}`;
        if (old.get(key)) { old.set(key, old.get(key) - 1); continue; }
        if (evidence.some(e => e.annotationId === annotation.id && e.start === t.start && e.end === t.end)) continue;
        evidence.push({...t,id:crypto.randomUUID(),annotationId:annotation.id,kind:t.start === t.end ? 'point' : 'range'});
      }
      if (evidence.length !== (answer.evidence || []).length) {
        this.editAnswer(criterionId, {evidence});
        annotation.time_source = 'text';
        const state = this.humanState;
        setTimeout(() => { if (this.humanState === state) { this.refreshList(); this.layout(); } }, 0);
      }
    }
    static times(text) {
      const number = String.raw`\d+(?:\.\d+)?`;
      const seconds = String.raw`(?:秒|seconds?(?![a-z])|secs?(?![a-z])|s(?![a-z]))`;
      const minutes = String.raw`(?:分钟|分|minutes?(?![a-z])|mins?(?![a-z])|m(?![a-z]))`;
      const standaloneMinutes = String.raw`(?:分钟|minutes?(?![a-z])|mins?(?![a-z])|m(?![a-z]))`;
      // Match mixed-unit compounds as a whole before standalone units.
      // Bare “分” remains excluded because it also denotes a review score.
      const token = String.raw`(?:\d{1,2}[:：]\d{2}(?:[:：]\d{2})?(?:\.\d+)?|${number}\s*${minutes}\s*${number}\s*${seconds}|${number}\s*${standaloneMinutes}|${number}\s*${seconds})`;
      const minutePattern = new RegExp(String.raw`^(${number})\s*${minutes}(?:\s*(${number})\s*${seconds})?$`, 'i');
      const parse = value => {
        const parts = value.trim().replaceAll('：', ':');
        if (parts.includes(':')) return parts.split(':').reduce((a,b) => a * 60 + Number(b),0);
        const compound = parts.match(minutePattern);
        return compound ? Number(compound[1])*60+Number(compound[2]||0) : parseFloat(parts);
      };
      const result = [], re = new RegExp(`(${token})(?:\\s*(?:-|–|—|~|～|至|到)\\s*(${token}|\\d+(?:\\.\\d+)?))?`, 'gi');
      for (const m of String(text).matchAll(re)) {
        const start = parse(m[1]), end = m[2] ? parse(m[2]) : start;
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) result.push({start,end});
      }
      // Shared unit ranges, such as 55–60s or 55到60秒.
      for (const m of String(text).matchAll(/(\d+(?:\.\d+)?)\s*[-–—~～至到]\s*(\d+(?:\.\d+)?)\s*(?:秒|s\b)/gi)) {
        const start=Number(m[1]),end=Number(m[2]);
        if(end>=start) { const i=result.findIndex(t=>t.start===end&&t.end===end);if(i>=0)result.splice(i,1);result.push({start,end}); }
      }
      return result;
    }
    menu(label, options, cls = "") {
      const menu = el("details", "", `human-menu ${cls}`),
        summary = el("summary", label);
      menu.append(summary);
      const list = el("div", "", "human-menu-options");
      for (const option of options) {
        const b = button(option.label, () => {
          menu.open = false;
          option.run();
        });
        if (option.score != null)
          b.style.color = globalThis.__cyleEvaluationTimelineV1.scoreColor(
            option.score,
          );
        if (option.color) b.style.color = option.color;
        list.append(b);
      }
      menu.append(list);
      menu.addEventListener("toggle", () => {
        if (menu.open) {
          this.hideRubricTip();
          list.style.top = "";
          list.style.bottom = "";
          const bounds = this.details.getBoundingClientRect(),
            position = list.getBoundingClientRect();
          if (
            position.bottom > bounds.bottom &&
            summary.getBoundingClientRect().top - position.height >= bounds.top
          ) {
            list.style.top = "auto";
            list.style.bottom = "100%";
          }
          this.details.querySelectorAll(".human-menu[open]").forEach((n) => {
            if (n !== menu) n.open = false;
          });
        }
      });
      return menu;
    }
    addAnnotation(criterionId) {
      const annotations = [
        ...(this.answer(criterionId)?.annotations || []),
        { id: crypto.randomUUID(), correct: null, text: "" },
      ];
      this.editAnswer(criterionId, { annotations });
      this.refreshList();
      const node = [
        ...this.details.querySelectorAll("[data-annotation-id]"),
      ].find((n) => n.dataset.annotationId === annotations.at(-1).id);
      node
        ?.querySelector(".human-annotation-text")
        ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    }
    selectReviewResult(event, criterionId, annotationId = null) {
      if (event.target.closest('button,summary,a,input,textarea,select') || this.pendingEvidence || !window.getSelection()?.isCollapsed) return;
      event.stopPropagation();
      const items = this.evidenceEntries(criterionId)
        .filter(e => !annotationId || e.annotationId === annotationId)
        .map(evidence => ({criterionId,evidence,id:evidence.id}));
      if (!items.length) {
        this.selectedEvidence = new Set();
        this.selectedCriterionId = criterionId;
        this.markHumanSelection();
        return;
      }
      const item = this.cycleNodeItem({key:`result:${criterionId}/${annotationId || ''}`},items);
      this.focusHumanEvidence([item], false);
    }
    renderAnnotation(criterion, annotation, { readonly = false } = {}) {
      const item = el("div", "", "human-annotation");
      item.dataset.annotationId = annotation.id;
      if (!readonly) item.addEventListener('click', event => this.selectReviewResult(event, criterion.id, annotation.id));
      const row = el("div", "", "human-annotation-main");
      if (readonly)
        row.append(el("span", judgment(annotation.correct), "human-judgment"));
      else {
        const menu = this.menu(
          judgment(annotation.correct),
          [true, false, null].map((value) => ({
            label: judgment(value),
            color: value === true ? "var(--pet-green)" : value === false ? "var(--pet-red)" : "var(--pet-muted)",
            run: () => {
              annotation.correct = value;
              this.editAnswer(criterion.id, {
                annotations: this.answer(criterion.id).annotations,
              });
              this.refreshList();
            },
          })),
          "human-judgment",
        );
        menu.dataset.judgment = String(annotation.correct);
        row.append(menu);
      }
      const content = el("div", "", "human-annotation-content"),
        text = el(
          "div",
          annotation.text || "双击填写说明",
          "human-annotation-text",
        );
      content.append(text);
      const actions = el("div", "", "human-row-actions");
      if (!readonly) {
        const edit = this.textEditor(
          text,
          annotation.text,
          `${criterion.id} ${annotation.id} 标注说明`,
          (value) => {
            annotation.text = value;
            this.editAnswer(criterion.id, {
              annotations: this.answer(criterion.id).annotations,
            });
          },
          (before, after) => this.inferAnnotationTimes(criterion.id, annotation, before, after),
        );
        actions.append(
          button("编辑", edit),
          button("删除", () => {
            this.editAnswer(criterion.id, {
              annotations: this.answer(criterion.id).annotations.filter(
                (a) => a.id !== annotation.id,
              ),
              evidence: (this.answer(criterion.id).evidence || []).filter(
                (e) => e.annotationId !== annotation.id,
              ),
            });
            this.refreshList();
            this.layout();
          }),
        );
      }
      row.append(content, actions);
      item.append(row);
      const times = el("div", "", "human-time-tags");
      const evidence = readonly
        ? (annotation.times || []).map((t, i) => ({ ...t, id: `history-${i}` }))
        : this.evidenceEntries(criterion.id).filter(
            (e) => e.annotationId === annotation.id,
          );
      for (const e of evidence) {
        const label =
          globalThis.__cyleEvaluationTimelineV1.format(e.start) +
          (e.end === e.start
            ? ""
            : `–${globalThis.__cyleEvaluationTimelineV1.format(e.end)}`);
        const tag = button(label, () => {
          if (readonly) this.seek(e.start);
          else
            this.focusHumanEvidence([
              { criterionId: criterion.id, evidence: e },
            ]);
        });
        tag.dataset.evidenceId = e.id;
        tag.className = "human-time-tag";
        tag.title = readonly ? "定位视频" : "单击定位视频，双击修改时间";
        if (!readonly)
          tag.addEventListener("dblclick", () =>
            this.beginEvidencePick(criterion.id, e.id, annotation.id),
          );
        times.append(tag);
        if (!readonly) {
          const edit = button("修改", () =>
            this.beginEvidencePick(criterion.id, e.id, annotation.id),
          );
          edit.className = "human-time-edit";
          times.append(edit);
          const remove = button("×", () => {
            this.editAnswer(criterion.id, {
              evidence: this.answer(criterion.id).evidence.filter(
                (x) => x.id !== e.id,
              ),
            });
            this.refreshList();
            this.layout();
          });
          remove.className = "human-time-edit";
          remove.setAttribute("aria-label", `删除时间 ${e.id}`);
          times.append(remove);
        }
      }
      if (evidence.length && annotation.time_source === "text")
        times.append(el("span", "待核对", "human-prefill-hint"));
      if (!readonly) {
        const add = button("+ 标注时间", () =>
          this.beginEvidencePick(criterion.id, null, annotation.id),
        );
        add.className = "human-add-time";
        times.append(add);
      }
      if (evidence.length || !readonly) item.append(times);
      return item;
    }
    renderDetails() {
      if (!this.details) return;
      this.details.inert = Boolean(this.humanState?.submitting);
      this.hideRubricTip();
      this.details.replaceChildren();
      if (this.prefillError) {
        this.details.append(el("p", this.prefillError, "warning"));
        this.renderRaw();
        return;
      }
      if (this.humanState?.conflict) {
        this.details.append(
          el(
            "p",
            "题目、人评目标或原人评内容已变化，旧草稿仅供核对，暂不覆盖当前人评。",
            "warning",
          ),
        );
        const old = el("details");
        old.append(
          el("summary", "查看旧人评草稿"),
          el("pre", JSON.stringify(this.humanState.answers, null, 2)),
        );
        this.details.append(old);
        const resume = el('button', '导出旧草稿并采用表格当前值');
        resume.type='button';
        resume.addEventListener('click',()=>this.adoptCurrentHumanResult());
        this.details.append(resume);
        this.renderRaw();
        return;
      }
      if (!this.template) {
        this.details.append(el("p", "选择评估模板后显示对应维度。", "empty"));
        return;
      }
      if (!this.humanSources.length)
        this.details.append(
          el("p", "当前模型未绑定人评列，请在“组装”中配置。", "warning"),
        );
      for (const group of this.groups.filter(
        (g) => this.view === "all" || this.view === `group:${g.id}`,
      )) {
        const section = el("section", "", "human-group");
        section.append(el("h3", group.name));
        for (const criterion of group.criteria) {
          const answer = this.answer(criterion.id),
            card = el("article", "", "human-card");
          card.dataset.criterionId = criterion.id;
          card.addEventListener('click', event => this.selectReviewResult(event, criterion.id));
          const header = el("header"),
            heading = el("h4"),
            title = el(
              "span",
              `${criterion.id} · ${criterion.title}`,
              "human-title",
            );
          title.tabIndex = 0;
          this.bindRubricTip(title, criterion.definition);
          heading.append(title);
          const options = criterion.score_values.map((score) => ({
            label: `${score} 分`,
            score,
            run: () => {
              this.editAnswer(criterion.id, { score, status: "scored" });
              this.refreshList();
              this.layout();
            },
          }));
          options.push(
            {
              label: "剔除",
              run: () => {
                this.editAnswer(criterion.id, {
                  score: null,
                  status: "excluded",
                });
                this.refreshList();
                this.layout();
              },
            },
            {
              label: "清除评分",
              run: () => {
                this.editAnswer(criterion.id, {
                  score: null,
                  status: "unscored",
                });
                this.refreshList();
                this.layout();
              },
            },
          );
          const score = this.menu(scoreLabel(answer), options, "human-score");
          score.style.setProperty(
            "--score-color",
            globalThis.__cyleEvaluationTimelineV1.scoreColor(answer?.score),
          );
          score.setAttribute("aria-label", `${criterion.id} 评分`);
          this.bindRubricTip(
            score.querySelector("summary"),
            criterion.scoring_rules,
          );
          const more = this.menu("⋯", [
            {
              label: "编辑评分备注",
              run: () => {
                this.noteOpen = criterion.id;
                this.refreshList();
                this.details
                  .querySelector(
                    `[data-criterion-id="${CSS.escape(criterion.id)}"] .human-note`,
                  )
                  ?.dispatchEvent(
                    new MouseEvent("dblclick", { bubbles: true }),
                  );
              },
            },
          ]);
          more.setAttribute("aria-label", `${criterion.id} 操作`);
          header.append(heading, score, more);
          card.append(header);
          if (
            answer?.score != null &&
            !criterion.score_values.includes(answer.score)
          )
            card.append(
              el(
                "div",
                `原评分 ${answer.score} · 当前 rubric 不提供此分值，保留待核对`,
                "human-prefill-hint",
              ),
            );
          for (const annotation of answer?.annotations || [])
            card.append(this.renderAnnotation(criterion, annotation));
          const add = button("+ 添加标注", () =>
            this.addAnnotation(criterion.id),
          );
          add.className = "human-add";
          card.append(add);
          if (answer?.note || this.noteOpen === criterion.id) {
            const note = el(
              "div",
              answer?.note || "双击填写评分备注",
              "human-note",
            );
            this.textEditor(
              note,
              answer?.note || "",
              `${criterion.id} 评分备注`,
              (value) => {
                this.editAnswer(criterion.id, { note: value });
                this.noteOpen = null;
              },
            );
            card.append(note);
          }
          section.append(card);
        }
        this.details.append(section);
      }
      if (!this.groups.length)
        this.details.append(
          el("p", "此模板没有启用的评估维度，请在组装中编辑。", "empty"),
        );
      this.renderHistory();
      this.renderRaw();
      this.details.scrollTop = 0;
      this.markHumanSelection();
    }
    renderHistory() {
      const source = this.sourceResult;
      if (!source || this.view !== "all") return;
      const active = new Set(
        this.groups.flatMap((g) => g.criteria.map((c) => c.id)),
      );
      const lookup = new Map(
        this.template.dimension_groups.flatMap((g) =>
          g.criteria.map((c) => [c.id, c.title]),
        ),
      );
      const history = source.criteria
        .filter((c) => !active.has(c.id))
        .map((c) => ({ ...c, name: lookup.get(c.id) || c.id }));
      if (source.overall)
        history.push({ ...source.overall, id: "overall", name: "整体表现" });
      if (!history.length) return;
      const fold = el("details", "", "human-history");
      fold.append(
        el("summary", `历史标注（${history.length} 项，不参与当前评分）`),
      );
      for (const c of history) {
        const block = el("section");
        block.append(el("h4", `${c.name} · ${scoreLabel(c)}`));
        if (c.note) block.append(el("p", c.note));
        for (const a of c.annotations || [])
          block.append(this.renderAnnotation(c, a, { readonly: true }));
        fold.append(block);
      }
      this.details.append(fold);
    }
    renderRaw() {
      for (const item of this.humanSources.filter((item) =>
        String(item.cell.rawValue ?? item.cell.value ?? "").trim(),
      )) {
        const fold = el("details", "", "human-original");
        fold.append(el("summary", `已有人工评估原文 · ${item.source.header}`));
        const pre = el(
          "pre",
          String(item.cell.rawValue ?? item.cell.value ?? ""),
        );
        pre.setAttribute("aria-label", "人工评估原值");
        fold.append(pre);
        this.details.append(fold);
      }
    }
  }
  globalThis.__cyleHumanReviewListV1 = HumanReviewList;
})();
