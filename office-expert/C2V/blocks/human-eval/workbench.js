(() => {
  "use strict";
  const el = (tag, text = "", cls = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = cls;
    return node;
  };
  const raw = (cell) => {
    const value = cell?.rawValue ?? cell?.value ?? "";
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  };
  const sorted = (items) =>
    [...items].sort((a, b) =>
      a.id.localeCompare(b.id, "zh-CN", { numeric: true }),
    );
  const button = (text, action) => {
    const node = el("button", text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  const DRAFT_SOURCE_POLICY = "human-target/1";
  const sameHumanBaseline = (before, after) => {
    if (before === after) return true;
    try {
      const left = JSON.parse(before), right = JSON.parse(after);
      return left?.schema === "human-eval/1"
        && right?.schema === "human-eval/1"
        && globalThis.__cyleWritebackServiceV1.valuesEqual(left, right);
    } catch {
      return false;
    }
  };

  class HumanEvaluation extends globalThis.__cyleHumanReviewListV1 {
    constructor(context) {
      super(context);
      this.writeCell = context.onWrite;
      const shared=globalThis.__cyleHumanReviewStateV1 ||= {sessions:new Map(),templateChoices:new Map()};
      this.sessions = shared.sessions;
      this.templateChoices = shared.templateChoices;
      this.commits = shared.commits ||= new Map();
      this.commitQueues = shared.commitQueues ||= new Map();
      this.rubricChanged = () => {
        this.needsRefresh = true;
        if (this.active !== false) this.update();
      };
      document.addEventListener("cyle:human-rubric-saved", this.rubricChanged);
      this.closeReviewMenus = event => {
        const path = event.composedPath();
        this.details?.querySelectorAll('.human-menu[open]').forEach(menu => {
          if (!path.includes(menu)) menu.open = false;
        });
      };
      document.addEventListener('pointerdown', this.closeReviewMenus, true);
      document.addEventListener('focusin', this.closeReviewMenus, true);
      this.root.addEventListener('pointerdown', this.closeReviewMenus, true);
      this.root.addEventListener('focusin', this.closeReviewMenus, true);
      this.evidenceBlur = (event) => {
        if (event.type === "click") this.evidencePointerDown = false;
        if (
          !this.pendingEvidence ||
          (event.type === "keyup" && event.key !== "Tab")
        )
          return;
        if (event.type === "focusin" && this.evidencePointerDown) return;
        const path = event.composedPath();
        if (path.includes(this.scroll) || path.includes(this.pickHint)) return;
        this.commitEvidencePick();
      };
      // Pointer focus precedes click: defer confirmation to click so hiding the
      // selection hint cannot move the clicked button before pointerup.
      this.evidencePointer = (event) => {
        this.evidencePointerDown = event.type === "pointerdown";
      };
      for (const type of ["pointerdown", "pointerup", "pointercancel"])
        document.addEventListener(type, this.evidencePointer, true);
      document.addEventListener("focusin", this.evidenceBlur, true);
      this.root.addEventListener("focusin", this.evidenceBlur, true);
      document.addEventListener("click", this.evidenceBlur, true);
      document.addEventListener("keyup", this.evidenceBlur, true);
    }
    setActive(active) {
      // Refresh the view on activation so both workspaces see the same draft.
      if(active&&this.active===false)this.needsRefresh=true;
      return super.setActive(active);
    }
    get selectionHint() {
      return "点击左侧“模型回答”中的视频框，进入对应模型的人工评估。";
    }

    async openDraftContext(target) {
      const M = globalThis.__cyleFieldMappingV1,
        mapping = await M.load(this.row);
      const mapped = M.read(this.row, mapping);
      const human = mapping.fields.find(
        (f) =>
          f.source?.index === target.columnIndex &&
          f.source.header === target.header,
      );
      if (!human) throw new Error("人评列映射已变化，请先核对组装配置。");
      const owner = (f) => f.entityId || f.label.split(" · ")[0];
      const videos = mapped.filter((item) => {
        const field = mapping.fields.find((f) => f.id === item.id);
        return (
          owner(field) === owner(human) &&
          (field.role === "产物" ||
            field.label.endsWith(" · 产物") ||
            /视频链接/.test(item.source.header))
        );
      });
      const video =
        videos.find((item) => item.source.index === target.videoColumnIndex) ||
        (videos.length === 1 ? videos[0] : null);
      if (!video)
        throw new Error("无法确定此草稿对应的模型视频，请先核对映射。");
      const identity = mapped.find((item) => item.isIdentity);
      const key = JSON.stringify([
        M.key(this.row),
        this.row.rowIndex,
        identity ? raw(identity.cell) : "",
      ]);
      if (target.templateId) this.templateChoices.set(key, target.templateId);
      globalThis.__cyleSelectedModelVideoV1 = {
        tableKey: this.row.tableKey,
        rowIndex: this.row.rowIndex,
        columnIndex: video.source.index,
      };
      for (const card of document.querySelectorAll(".cyle-public-card"))
        card.classList.toggle(
          "is-model-selected",
          card.dataset.cardKey === `column:${video.source.index}`,
        );
      await this.update();
      document.dispatchEvent(new CustomEvent("cyle:model-video-selected"));
    }

    update() {
      this.commitEvidencePick();
      return super.update();
    }

    async renderHumanPage(fields, mapping, model) {
      this.hideRubricTip();
      const revision = this.revision,
        row = this.row;
      const M = globalThis.__cyleFieldMappingV1,
        D = globalThis.__cyleDraftServiceV1;
      const rubric = await globalThis.__cyleHumanRubricV1.load();
      if (revision !== this.revision) return;
      this.humanSources = fields.filter((item) => {
        const field = mapping.fields.find((f) => f.id === item.id);
        return field?.role
          ? field.role === "人评"
          : /人评/.test(field?.label || item.source.header);
      });
      const mapped = M.read(row, mapping);
      const identity = mapped.find((item) => item.isIdentity);
      // Related model fields may be refreshed while an evaluator is working.
      // Only the question ID is a write dependency; the target has its own CAS.
      this.writeContext = {row, model, identity, dependencies: mapped.filter(item => item.isIdentity)};
      this.questionKey = JSON.stringify([
        M.key(row),
        row.rowIndex,
        identity ? raw(identity.cell) : "",
      ]);
      // Existing mapped tags supply type values; never assume a physical column number.
      const tagValues = mapped
        .filter((item) => {
          const field = mapping.fields.find((f) => f.id === item.id);
          if (Object.hasOwn(mapping, "questionTypeFieldId"))
            return item.id === mapping.questionTypeFieldId;
          return (
            field.entityId === "tags" ||
            ["一级场景", "题目类型", "题型"].includes(field.role || field.label)
          );
        })
        .flatMap((item) => {
          const value = item.cell.value ?? item.cell.rawValue;
          return (Array.isArray(value) ? value : [value])
            .filter((v) => typeof v === "string")
            .map((v) => v.trim());
        });
      const matches = rubric.templates.filter((t) =>
        tagValues.includes(t.question_type.trim()),
      );
      const chosen = this.templateChoices.get(this.questionKey);
      this.template =
        rubric.templates.find((t) => t.id === chosen) ||
        (matches.length === 1 ? matches[0] : null);
      this.sourceResult = null;
      this.prefillError = "";
      let prefilled = null;
      try {
        const documents = this.humanSources
          .map((item) =>
            globalThis.__cyleHumanResultV1.parse(raw(item.cell), {
              caseId: identity ? raw(identity.cell) : null,
              modelNames: [
                model.name,
                ...fields.map((item) => item.source.header),
              ],
              rubricId: this.template?.id,
            }),
          )
          .filter(Boolean);
        if (documents.length > 1)
          throw new Error(
            "当前模型绑定了多份人评 JSON，请在组装中保留一个人评来源。",
          );
        prefilled = documents[0] || null;
        this.sourceResult = prefilled?.result || null;
        if (!this.template && prefilled)
          this.template =
            rubric.templates.find((t) => t.id === prefilled.result.rubric_id) ||
            null;
      } catch (error) {
        this.prefillError = error.message;
      }
      this.groups = this.template
        ? sorted(this.template.dimension_groups)
            .map((g) => ({
              ...g,
              criteria: sorted(g.criteria.filter((c) => c.enabled)),
            }))
            .filter((g) => g.criteria.length)
        : [];
      const previousState = this.humanState;
      this.humanState = null;
      if (this.template) {
        const descriptor = {
          namespace: "human-eval-form",
          id: JSON.stringify([
            this.questionKey,
            model.id,
            this.humanSources.map((s) => s.source),
            this.template.id,
          ]),
          sourceValue: {
            human: this.humanSources.map((s) => ({
              source: s.source,
              value: raw(s.cell),
            })),
          },
        };
        this.targetDraftId = descriptor.id;
        let receipt = this.commits.get(this.targetDraftId);
        try {
          const record = await globalThis.__cyleStorageServiceV1.readRecord({scope:'record',namespace:'human-eval-commit',id:this.targetDraftId});
          if (record && (!receipt || record.updatedAt > receipt.updatedAt)) receipt = record;
        } catch { /* A local backup outage must not prevent the form opening. */ }
        if (revision !== this.revision) return;
        if (prefilled)
          descriptor.id += `:${globalThis.__cyleStorageServiceV1.fingerprint(prefilled.result)}`;
        if (previousState?.pendingWriteValue && previousState.context.tableKey === row.tableKey
          && previousState.context.rowIndex === row.rowIndex && previousState.context.modelId === model.id
          && previousState.context.templateId === this.template.id && this.humanSources.length === 1
          && previousState.context.columnIndex === this.humanSources[0].source.index
          && previousState.context.header === this.humanSources[0].source.header
          && sameHumanBaseline(previousState.pendingWriteValue,raw(this.humanSources[0].cell))) {
          // A lost bridge response must not turn an already-applied write into
          // a permanent conflict when the evaluator refreshes to check it.
          void this.recordHumanCommit(previousState,prefilled?.result || null);
          if (revision !== this.revision) return;
          receipt = this.commits.get(this.targetDraftId);
          const hasLaterEdits = prefilled && !sameHumanBaseline(
            JSON.stringify(globalThis.__cyleHumanResultV1.serialize(prefilled.result,previousState.answers)),
            raw(this.humanSources[0].cell));
          for (const [key,session] of this.sessions) if (session===previousState) this.sessions.delete(key);
          previousState.dirty=!!hasLaterEdits;
          if (hasLaterEdits) {
            // The last request was applied, but edits made after its response
            // failed still belong to the evaluator. Rebase them onto that value.
            const saved = await D.readDraft(descriptor);
            if (revision !== this.revision) return;
            const fork = saved.found && !saved.value?.submitted;
            Object.assign(previousState,{
              descriptor,revision:fork ? 0 : saved.draft?.revision || 0,
              sourceFingerprint:fork ? null : saved.draft?.sourceFingerprint ?? null,
              rebaseSource:!fork && saved.conflict,conflict:false,pendingWriteValue:null,
              backupDescriptor:fork ? {...descriptor,id:`${descriptor.id}:recovery:${globalThis.__cyleWritebackServiceV1.createOperationId('draft')}`} : null,
              backupRecord:null
            });
            this.sessions.set(descriptor.id,previousState);
          }
        }
        let state = this.sessions.get(descriptor.id);
        if (
          !state &&
          previousState?.dirty &&
          previousState.context.tableKey === row.tableKey &&
          previousState.context.rowIndex === row.rowIndex &&
          previousState.context.modelId === model.id &&
          previousState.context.templateId === this.template.id
        ) {
          state = previousState;
          state.conflict = true;
        }
        if (!state) {
          const saved = await D.readDraft(descriptor);
          if (revision !== this.revision) return;
          const context = {
            ...D.captureContext(
              row,
              this.humanSources[0]?.source.index ?? -1,
              this.humanSources[0]?.source.header || "",
              "human-eval",
            ),
            modelId: model.id,
            videoColumnIndex: this.getModelSelection()?.columnIndex,
            templateId: this.template.id,
          };
          const retired = saved.value?.submitted === true || (receipt
            && receipt.value.resultFingerprint === globalThis.__cyleStorageServiceV1.fingerprint(prefilled?.result || null)
            && saved.draft?.updatedAt <= receipt.updatedAt);
          // A verified write can reformat the same human JSON without changing
          // its result-derived draft ID. Rebase that backup (and legacy drafts
          // that included video URLs) only against the same target and content.
          // Retain the stored revision/fingerprint for concurrent-draft checks.
          const rebaseSource = saved.conflict
            && [undefined, DRAFT_SOURCE_POLICY].includes(saved.value?.sourcePolicy)
            && saved.draft?.metadata?.kind === "human-eval-form"
            && this.humanSources.length === 1
            && sameHumanBaseline(saved.value.baselineText, raw(this.humanSources[0].cell))
            && saved.value.templateId === this.template.id
            && ["tableKey", "sheetId", "sheetIndex", "rowIndex", "columnIndex", "header", "modelId", "templateId"]
              .every(key => saved.value.context?.[key] === context[key]);
          state = {
            descriptor,
            answers: globalThis.__cyleHumanResultV1.normalizeAnswers(
              (!retired && saved.value?.answers) || prefilled?.answers || [],
            ),
            revision: saved.draft?.revision || 0,
            conflict: saved.conflict && !rebaseSource && !retired,
            rebaseSource: rebaseSource || (retired && saved.conflict),
            sourceFingerprint: saved.draft?.sourceFingerprint ?? null,
            dirty: false,
            context,
          };
          this.sessions.set(descriptor.id, state);
        }
        if (JSON.stringify(state.descriptor.sourceValue) !== JSON.stringify(descriptor.sourceValue)) {
          const before = state.descriptor.sourceValue.human, after = descriptor.sourceValue.human;
          if (!state.conflict && before.length === 1 && after.length === 1
            && JSON.stringify(before[0].source) === JSON.stringify(after[0].source)
            && sameHumanBaseline(before[0].value, after[0].value)) {
            state.descriptor = descriptor;
            state.rebaseSource = true;
          } else state.conflict = true;
        }
        state.targetDraftId = this.targetDraftId;
        this.humanState = state;
      }
      this.data = globalThis.__cyleEvaluationTimelineV1.build(null, null);
      this.metadata = new WeakMap();
      this.allItems = [];
      this.untimedItems = [];
      this.categories = new Map();
      this.scoreFilter = "";
      if (!this.groups.some((g) => `group:${g.id}` === this.view))
        this.view = "all";
      this.renderTimeline();
      this.scoreBar.hidden = true;
      const style = el("style");
      style.textContent =
        `
        .human-toolbar{display:flex;align-items:center;gap:10px;padding:8px 12px;flex-wrap:wrap;border-bottom:1px solid var(--pet-border);font-size:12px}
        .human-toolbar select{max-width:260px;padding:6px 8px;background:var(--pet-input);color:var(--pet-text);border:1px solid var(--pet-border);border-radius:6px;font:inherit}
        .human-group>h3{font-size:12px;color:var(--pet-muted);margin:22px 0 8px;font-weight:600}.human-card{border:0;border-radius:0;overflow:visible;padding:12px 0 18px;border-bottom:1px solid var(--pet-border);margin:0;background:transparent}
        .human-card>header{padding:0;background:transparent;display:flex;gap:8px;align-items:center;margin-bottom:10px}.human-card h4{font-size:13px;margin:0;flex:1;color:var(--pet-text);font-weight:600}.human-meta{font-size:11px;color:var(--pet-muted)}
        .human-title{cursor:help}.human-rubric-tip{position:fixed;inset:auto;margin:0;box-sizing:border-box;max-height:300px;overflow:auto;padding:14px 16px;border:1px solid var(--pet-border);border-radius:8px;background:var(--pet-raised);color:var(--pet-text);white-space:pre-wrap;line-height:1.7;font-size:12px;font-family:inherit;box-shadow:0 6px 24px #0005}.human-time-preview{position:absolute;top:32px;height:28px;border:1px dashed var(--pet-accent);background:var(--pet-soft);pointer-events:none;z-index:6}
        .human-menu{position:relative;margin:0;padding:0}.human-menu summary{cursor:pointer;list-style:none;font-size:12px;padding:4px 7px;border-radius:5px}.human-menu summary::-webkit-details-marker{display:none}.human-menu summary:hover{background:var(--pet-raised)}.human-menu-options{position:absolute;right:0;top:100%;min-width:104px;z-index:8;display:flex;flex-direction:column;padding:5px;background:var(--pet-raised);border:1px solid var(--pet-border);border-radius:7px;box-shadow:0 4px 16px #0003}.human-menu-options button{color:var(--pet-text);border:0;background:transparent;text-align:left;white-space:nowrap;font-size:12px}.human-menu-options button:hover{background:var(--pet-soft)}
        .human-score summary{color:var(--score-color);font-weight:600;background:color-mix(in srgb,var(--score-color) 8%,transparent);white-space:nowrap}.human-score summary::after{content:' ▾';font-size:9px;opacity:.6}
        .human-annotation{padding:9px 10px;margin:2px 0;border-radius:5px}.human-annotation-main{display:flex;gap:10px;align-items:flex-start}.human-annotation-content{flex:1;min-width:0}.human-annotation-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;font-size:13px;min-height:22px}.human-annotation-text:empty{color:var(--pet-muted)}
        .human-judgment{flex-shrink:0;color:var(--pet-muted);font-size:11px}.human-judgment summary{font-size:11px;padding:3px 6px}.human-judgment .human-menu-options{left:0;right:auto}.human-judgment[data-judgment=true]{color:var(--pet-green)}.human-judgment[data-judgment=false]{color:var(--pet-red)}
        .human-row-actions{display:flex;gap:3px;opacity:0;flex-shrink:0}.human-row-actions button,.human-add{font-size:11px;border:0;background:transparent;color:var(--pet-muted);padding:4px 6px}.human-annotation:hover .human-row-actions,.human-annotation:focus-within .human-row-actions{opacity:1}.human-row-actions button:hover,.human-add:hover{color:var(--pet-accent)}
        .human-time-tags{display:flex;align-items:center;gap:5px;margin:5px 0 0 54px;flex-wrap:wrap}.human-time-tag{font-size:11px;background:var(--pet-raised);border:0;color:var(--pet-muted);padding:3px 7px}.human-time-edit{display:none;font-size:10px;padding:2px 4px;border:0;background:transparent;color:var(--pet-muted);opacity:0}.human-annotation:hover .human-time-edit,.human-annotation:focus-within .human-time-edit{display:inline-block;opacity:1}.human-time-tag.is-selected{color:var(--pet-accent);background:color-mix(in srgb,var(--pet-accent) 10%,transparent)}.human-annotation.is-evidence-selected{background:transparent}
        .human-card.is-evidence-selected{outline:0;box-shadow:inset 2px 0 color-mix(in srgb,var(--pet-accent) 65%,transparent);background:color-mix(in srgb,var(--pet-accent) 4%,transparent);border-radius:6px}.human-card{padding-left:10px;padding-right:10px}.human-annotation-text{cursor:pointer}.human-prefill-hint{font-size:10px;color:var(--pet-muted);padding:3px 8px}.human-note{white-space:pre-wrap;font-size:12px;color:var(--pet-muted);margin:8px 10px;padding-left:9px;border-left:2px solid var(--pet-border)}.human-add{margin:6px 0 0 54px}
        .human-annotation textarea,.human-note textarea{box-sizing:border-box;width:100%;min-height:80px;resize:vertical;padding:8px;font:inherit;line-height:1.7;background:var(--pet-input);color:var(--pet-text);border:1px solid var(--pet-border);border-radius:5px}.human-history{margin:18px 0;color:var(--pet-muted)}.human-history section{margin:14px 0}.human-history p{white-space:pre-wrap}
        .human-pick{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--pet-soft);font-size:12px;flex-wrap:wrap}.human-pick-target{font-weight:600}.human-pick output{font-variant-numeric:tabular-nums}.human-pick-help{font-size:11px;color:var(--pet-muted);flex:1}.human-annotation.is-editing-time{outline:1px solid var(--pet-accent);background:var(--pet-soft)}.human-add-time{background:transparent;border:0;color:var(--pet-muted);font-size:11px;padding:3px 5px}.human-add-time:hover{color:var(--pet-accent)}
        @media(hover:none){.human-row-actions{opacity:1}.human-time-edit{display:inline-block;opacity:1}}@media(max-width:650px){.human-annotation-main{flex-wrap:wrap}.human-row-actions{margin-left:54px}.human-time-tags{margin-left:0}}
        .human-footer{flex-shrink:0}.human-footer span{flex:1;font-size:12px;color:var(--pet-muted)}.human-original{margin:12px 0}.human-original pre{white-space:pre-wrap;overflow-wrap:anywhere}

      ` + globalThis.__cyleComposerStylesV1;
      this.body.append(style);
      if (!this.template) {
        const toolbar = el("div", "", "human-toolbar");
        const label = el("label", "评估模板 "),
          select = el("select");
        select.setAttribute("aria-label", "人评评估模板");
        const empty = el(
          "option",
          matches.length > 1
            ? "题目 tag 匹配多个模板，请选择"
            : "未匹配模板，请选择",
        );
        empty.value = "";
        select.append(empty);
        for (const template of rubric.templates) {
          const option = el("option", template.name);
          option.value = template.id;
          select.append(option);
        }
        select.value = this.template?.id || "";
        select.addEventListener("change", () => {
          this.templateChoices.set(this.questionKey, select.value);
          this.update();
        });
        label.append(select);
        toolbar.append(label);
        this.body.append(toolbar);
      }
      this.tabBar = el("nav", "", "evaluation-tabs");
      this.tabBar.setAttribute("aria-label", "人评子栏目");
      this.body.append(this.tabBar);
      this.renderTabs();
      this.details = el("div", "", "result-list");
      this.body.append(this.details);
      this.footer = el("footer", "", "human-footer");
      this.saveStatus = el("span");
      this.saveStatus.setAttribute("role", "status");
      this.submitElapsed = el('span','','human-submit-elapsed');
      this.submitElapsed.style.flex='0 0 auto';
      this.submitElapsed.style.whiteSpace='nowrap';
      this.submitElapsed.setAttribute('aria-hidden','true');
      this.submitElapsed.hidden=true;
      this.saveButton = button("回写飞书表格", () => this.writeHumanResult());
      this.saveButton.setAttribute('aria-label','回写飞书表格');
      this.saveButton.className = "primary";
      this.footer.append(this.saveStatus, this.submitElapsed, button("导出草稿", () => this.exportHumanDraft()), this.saveButton);
      this.body.append(this.footer);
      // Keep typing shortcuts inside the editor, rather than navigating the sheet.
      for (const event of ["keydown", "keyup", "keypress"])
        this.details.addEventListener(event, (e) => e.stopPropagation());
      this.bindVideo();
      this.layout();
      this.renderDetails();
      this.updateSaveStatus();
      this.body.dataset.humanSource = this.humanSources
        .map((item) => item.source.index)
        .join(",");
    }

    renderTabs() {
      this.tabBar.replaceChildren();
      for (const [id, label] of [
        ["all", "全部"],
        ...this.groups.map((g) => [
          `group:${g.id}`,
          `${g.name}（${g.criteria.length}）`,
        ]),
      ]) {
        const tab = button(label, () => {
          this.commitEvidencePick();
          this.view = id;
          this.layout();
          this.renderTabs();
          this.renderDetails();
        });
        tab.dataset.view = id;
        tab.setAttribute("aria-pressed", String(this.view === id));
        this.tabBar.append(tab);
      }
    }
    answer(id) {
      return this.humanState?.answers.find((a) => a.criterionId === id);
    }
    editAnswer(id, patch) {
      if (this.humanState?.submitting) return;
      let answer = this.answer(id);
      if (!answer) {
        answer = {
          criterionId: id,
          status: "unscored",
          score: null,
          note: "",
          annotations: [],
          evidence: [],
        };
        this.humanState.answers.push(answer);
      }
      if (patch.evidence) {
        for (const annotation of answer.annotations || []) {
          const before = JSON.stringify(
            (answer.evidence || []).filter(
              (e) => e.annotationId === annotation.id,
            ),
          );
          const after = JSON.stringify(
            patch.evidence.filter((e) => e.annotationId === annotation.id),
          );
          if (before !== after) annotation.time_source = "manual";
        }
      }
      Object.assign(answer, patch);
      this.humanState.dirty = true;
      this.updateSaveStatus();
    }
    updateSaveStatus() {
      const state = this.humanState;
      const caption=state?.submitting ? '提交中…' : '回写飞书表格';
      if(this.saveButton.textContent!==caption)this.saveButton.textContent=caption;
      this.saveButton.setAttribute('aria-busy',String(!!state?.submitting));
      if (this.submitElapsed) {
        this.submitElapsed.hidden=!state?.submitting;
        if (state?.submitting) {
          const elapsed=`已等待 ${Math.floor((Date.now()-state.submitStartedAt)/1000)} 秒`;
          if(this.submitElapsed.textContent!==elapsed)this.submitElapsed.textContent=elapsed;
        }
      }
      this.saveButton.disabled =
        !state ||
        state.saving ||
        state.submitting ||
        state.conflict ||
        !!this.prefillError ||
        !this.humanSources.length;
      const status = !state
        ? "请选择评估模板"
        : state.conflict
          ? "题目、人评目标或原人评内容已变化，保留旧草稿，暂不覆盖"
          : state.submitting
            ? state.submitPhase==='backup' ? '正在备份草稿…'
              : Date.now()-state.submitStartedAt >= 8000
                ? '仍在等待飞书回读确认，请勿重复提交…'
                : '正在写入飞书并等待回读确认…'
          : state.saving
            ? "正在备份草稿…"
            : state.dirty
              ? "有未提交修改 · 回写前自动备份草稿"
              : "修改后可回写当前模型的人评列";
      if(this.saveStatus.textContent!==status)this.saveStatus.textContent=status;
    }
    async writeHumanResult() {
      this.details?.querySelector('textarea')?.blur();
      this.commitEvidencePick();
      const state = this.humanState, context = this.writeContext;
      if (!state || state.saving || state.submitting || state.conflict || this.prefillError || !this.template) return;
      const fail = message => { this.saveStatus.textContent = message; };
      if (this.humanSources.length !== 1) return fail('请在组装中为当前模型保留唯一的人评回写列。');
      const target = this.humanSources[0].cell;
      if (target.formula) return fail('人评目标列是公式，不能覆盖。');
      if (!context.identity || !raw(context.identity.cell).trim()) return fail('请先映射有效的题目 ID，再回写人评。');
      if (raw(target).trim() && !this.sourceResult) return fail('原人评内容不是可识别的 human-eval/1，已保留原文，不能直接覆盖。');
      const snapshot = structuredClone(state.answers);
      const base = this.sourceResult || {schema:'human-eval/1',case_id:raw(context.identity.cell),model:context.model.name,rubric_id:this.template.id,criteria:[]};
      let value;
      try {
        const result=globalThis.__cyleHumanResultV1.serialize(base,snapshot);
        value=JSON.stringify(result,null,2);
        globalThis.__cyleHumanResultV1.parse(value,{caseId:raw(context.identity.cell),rubricId:this.template.id});
      } catch(error) { return fail(error.message); }
      const expectedValue=raw(target), row=context.row, revision=this.revision;
      const expectedDependencies=context.dependencies.map(item=>({index:item.source.index,header:item.source.header,baseline:raw(item.cell)}));
      state.submitting=true;
      state.submitStartedAt=Date.now();state.submitPhase='backup';
      state.submitTimer=setInterval(()=>{
        if(this.humanState===state && state.submitting)this.updateSaveStatus();
      },500);
      this.details.inert=true;this.updateSaveStatus();
      try {
        const backedUp = await this.saveHumanDraft();
        if (!backedUp && !state.backupError) return;
        const backupWarning = backedUp ? '' : `（本机备份失败，当前副本可导出：${state.backupError.message}）`;
        if (this.humanState !== state || this.revision !== revision || this.contextKey() !== this.currentContext) throw new Error('题目或模型已切换，草稿已保留，请回到原模型提交。');
        state.submitPhase='write';this.updateSaveStatus();
        state.pendingWriteValue=value;
        const response=await this.writeCell({row,cell:target,value,expectedValue,expectedDependencies});
        const actual = typeof response?.actualValue === 'string' ? JSON.parse(response.actualValue) : response?.actualValue;
        if (response?.verified !== true || !globalThis.__cyleWritebackServiceV1.valuesEqual(actual,JSON.parse(value))) throw new Error('写入未通过回读确认，草稿已保留，请刷新核对后重试。');
        Object.assign(target,{value,rawValue:value,displayValue:value});
        const cell=row.cells.find(c=>c.columnIndex===target.columnIndex);
        if(cell)Object.assign(cell,{value,rawValue:value,displayValue:value});
        const result=JSON.parse(value);
        const archiveRequest=state.backupRecord ? {
          ...(state.backupDescriptor || state.descriptor),expectedRevision:state.revision,
          expectedStoredSourceFingerprint:state.sourceFingerprint,
          kind:'human-eval-form',value:{...state.backupRecord.value,submitted:true}
        } : null;
        // Publish the in-memory receipt before releasing the form. Persistence
        // and archiving are deliberately outside the completion path.
        void this.recordHumanCommit(state,result);
        if(archiveRequest)void globalThis.__cyleDraftServiceV1.saveDraft(archiveRequest)
          .catch(()=>{/* Keep the existing backup if a newer revision won. */});
        state.dirty=false;state.conflict=false;
        state.pendingWriteValue=null;
        for(const [key,session] of this.sessions) if(session===state || (
          session.context.tableKey===state.context.tableKey && session.context.rowIndex===state.context.rowIndex
          && session.context.modelId===state.context.modelId && session.context.templateId===state.context.templateId
          && session.context.columnIndex===state.context.columnIndex)) this.sessions.delete(key);
        state.submitting=false;
        const completed={
          descriptor:{namespace:state.descriptor.namespace,
            id:`${state.targetDraftId}:${globalThis.__cyleStorageServiceV1.fingerprint(result)}`,
            sourceValue:{human:state.descriptor.sourceValue.human.map(h=>({source:h.source,value}))}},
          targetDraftId:state.targetDraftId,context:state.context,
          answers:globalThis.__cyleHumanResultV1.parse(value).answers,
          revision:0,sourceFingerprint:null,dirty:false,conflict:false
        };
        this.sessions.set(completed.descriptor.id,completed);
        if(this.humanState===state && this.revision===revision && this.row.tableKey===row.tableKey && this.row.rowIndex===row.rowIndex){
          const current=this.row.cells.find(c=>c.columnIndex===target.columnIndex);
          if(current)Object.assign(current,{value,rawValue:value,displayValue:value});
          this.humanState=completed;this.sourceResult=result;
          this.selectedEvidence=new Set();
          this.layout();this.refreshList();this.updateSaveStatus();
          this.saveStatus.textContent='已回写飞书表格，并通过回读校验' + backupWarning;
          this.saveStatus.title='已确认飞书页面内的单元格内容；云端保存由飞书同步，刷新后可再次核对。';
          this.submitElapsed.hidden=false;
          this.submitElapsed.textContent=`用时 ${((Date.now()-state.submitStartedAt)/1000).toFixed(1)} 秒`;
        }
      } catch(error) {
        state.dirty=true;
        if(this.humanState===state) fail(`${error.message}（${state.backupError ? '当前修改保留在本页，可导出草稿' : '本地草稿已保留'}）`);
      } finally {
        clearInterval(state.submitTimer);state.submitTimer=null;
        state.submitting=false;state.saving=false;
        if(this.humanState===state){
          this.details.inert=false;this.saveButton.disabled=!!state.conflict;
          this.saveButton.textContent='回写飞书表格';this.saveButton.setAttribute('aria-busy','false');
          this.submitElapsed.hidden=true;
        }
      }
    }

    async saveHumanDraft() {
      this.commitEvidencePick();
      const state = this.humanState;
      if (state) state.backupError = null;
      if (
        !state ||
        state.saving ||
        state.conflict ||
        this.prefillError ||
        !this.humanSources.length
      )
        return false;
      const invalid = this.groups
        .flatMap((g) => g.criteria)
        .find((c) => {
          const score = this.answer(c.id)?.score;
          return (
            score != null &&
            !c.score_values.includes(score) &&
            this.sourceResult?.criteria.find((item) => item.id === c.id)
              ?.score !== score
          );
        });
      if (invalid) {
        this.saveStatus.textContent = `${invalid.id} 的原分数不在当前 rubric 可用分数中，请重新选择。`;
        return false;
      }
      const revision = this.revision;
      state.saving = true;
      this.updateSaveStatus();
      const snapshot = structuredClone(state.answers);
      try {
        const request = {
          ...(state.backupDescriptor || state.descriptor),
          expectedRevision: state.revision,
          expectedStoredSourceFingerprint: state.sourceFingerprint,
          allowSourceChange: state.rebaseSource === true,
          kind: "human-eval-form",
          value: {
            sourcePolicy: DRAFT_SOURCE_POLICY,
            context: state.context,
            templateId: this.template.id,
            baselineText: this.humanSources
              .map((item) => raw(item.cell))
              .join("\n"),
            answers: snapshot,
          },
        };
        let saved;
        try { saved = await globalThis.__cyleDraftServiceV1.saveDraft(request); }
        catch (error) {
          if (!['REVISION_CONFLICT','SOURCE_CONFLICT'].includes(error.code)) throw error;
          // Preserve the other tab's backup and save this edit as a new copy.
          const id = `${state.descriptor.id}:recovery:${globalThis.__cyleWritebackServiceV1.createOperationId('draft')}`;
          saved = await globalThis.__cyleDraftServiceV1.saveDraft({...request,id,expectedRevision:0,expectedStoredSourceFingerprint:null});
          state.backupDescriptor = {...state.descriptor,id};
        }
        state.backupRecord = saved;
        state.revision = saved.revision;
        state.sourceFingerprint = saved.sourceFingerprint;
        state.rebaseSource = false;
        state.dirty =
          JSON.stringify(state.answers) !== JSON.stringify(snapshot);
        if (revision === this.revision)
          this.saveStatus.textContent = state.dirty
            ? "草稿已保存，仍有新修改"
            : "草稿已保存在本机，未回填飞书";
        return true;
      } catch (error) {
        state.backupError = {code:error.code,message:error.message};
        this.recoveryDraft = {context:state.context,answers:snapshot,baselineText:this.humanSources.map(item=>raw(item.cell)).join('\n')};
        if (revision === this.revision)
          this.saveStatus.textContent = error.message;
        return false;
      } finally {
        state.saving = false;
        if (this.humanState === state) {
          if (state.submitting || revision !== this.revision) this.updateSaveStatus();
          else this.saveButton.disabled = state.conflict;
        }
      }
    }

    recordHumanCommit(state, result) {
      const record = {updatedAt:new Date().toISOString(),value:{resultFingerprint:globalThis.__cyleStorageServiceV1.fingerprint(result)}};
      // Use the submitted context even if the evaluator switched rows meanwhile.
      const targetId = state.targetDraftId;
      this.commits.set(targetId,record);
      const previous=this.commitQueues.get(targetId) || Promise.resolve();
      const task=previous.catch(()=>{}).then(async()=>{
        await globalThis.__cyleStorageServiceV1.writeRecord({scope:'record',namespace:'human-eval-commit',id:targetId,value:record.value,updatedAt:record.updatedAt});
      }).catch(()=>{/* The receipt remains available in memory. */});
      this.commitQueues.set(targetId,task);
      void task.finally(()=>{if(this.commitQueues.get(targetId)===task)this.commitQueues.delete(targetId);});
      return task;
    }

    exportHumanDraft(useRecovery = false) {
      const draft = (useRecovery && this.recoveryDraft) || {context:this.humanState?.context,answers:this.humanState?.answers,baselineText:this.humanSources?.map(item=>raw(item.cell)).join('\n')};
      const url = URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
      const link = el('a'); link.href=url;link.download='C2V-human-draft.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }

    async adoptCurrentHumanResult() {
      const state = this.humanState;
      if (!state || state.submitting || this.prefillError) return;
      this.recoveryDraft = {context:state.context,answers:structuredClone(state.answers),baselineText:state.descriptor.sourceValue.human.map(h=>h.value).join('\n')};
      this.exportHumanDraft(true);
      void this.recordHumanCommit(state,this.sourceResult);
      for (const [key,session] of this.sessions) if (session===state) this.sessions.delete(key);
      state.dirty=false;
      await this.update();
    }

    bindRubricTip(target, text) {
      target.addEventListener("pointerenter", () =>
        this.showRubricTip(target, text),
      );
      target.addEventListener("pointerleave", () => this.scheduleHideTip());
      target.addEventListener("focus", () => this.showRubricTip(target, text));
      target.addEventListener("blur", () => this.hideRubricTip());
    }
    showRubricTip(target, text) {
      clearTimeout(this.tipTimer);
      if (!this.rubricTip?.isConnected) {
        this.rubricTip = el("div", "", "human-rubric-tip");
        this.rubricTip.id = "human-rubric-tip";
        this.rubricTip.setAttribute("popover", "manual");
        this.rubricTip.setAttribute("role", "tooltip");
        this.rubricTip.addEventListener("pointerenter", () =>
          clearTimeout(this.tipTimer),
        );
        this.rubricTip.addEventListener("pointerleave", () =>
          this.scheduleHideTip(),
        );
        this.body.append(this.rubricTip);
      }
      this.tipTarget?.removeAttribute("aria-describedby");
      this.tipTarget = target;
      target.setAttribute("aria-describedby", this.rubricTip.id);
      this.rubricTip.textContent = text;
      this.rubricTip.showPopover();
      const rect = target.getBoundingClientRect(),
        width = Math.min(440, window.innerWidth - 24);
      this.rubricTip.style.width = `${width}px`;
      this.rubricTip.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      const height = this.rubricTip.getBoundingClientRect().height;
      this.rubricTip.style.top = `${rect.bottom + height + 8 < window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8)}px`;
    }
    scheduleHideTip() {
      clearTimeout(this.tipTimer);
      this.tipTimer = setTimeout(() => this.hideRubricTip(), 180);
    }
    hideRubricTip() {
      clearTimeout(this.tipTimer);
      if (
        this.rubricTip?.isConnected &&
        this.rubricTip.matches(":popover-open")
      )
        this.rubricTip.hidePopover();
      this.tipTarget?.removeAttribute("aria-describedby");
    }

    dispose() {
      clearInterval(this.humanState?.submitTimer);
      this.commitEvidencePick();
      for (const type of ["pointerdown", "pointerup", "pointercancel"])
        document.removeEventListener(type, this.evidencePointer, true);
      document.removeEventListener('pointerdown', this.closeReviewMenus, true);
      document.removeEventListener('focusin', this.closeReviewMenus, true);
      this.root.removeEventListener('pointerdown', this.closeReviewMenus, true);
      this.root.removeEventListener('focusin', this.closeReviewMenus, true);
      document.removeEventListener("focusin", this.evidenceBlur, true);
      this.root.removeEventListener("focusin", this.evidenceBlur, true);
      document.removeEventListener("click", this.evidenceBlur, true);
      document.removeEventListener("keyup", this.evidenceBlur, true);
      this.hideRubricTip();
      document.removeEventListener(
        "cyle:human-rubric-saved",
        this.rubricChanged,
      );
      super.dispose();
    }
  }
  globalThis.__cyleHumanEvaluationV1 = HumanEvaluation;
})();
