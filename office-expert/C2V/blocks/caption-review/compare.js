(() => {
  "use strict";
  const el = (tag, text = "", className = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  };
  // Each editor resolves its own selection; the public-card highlight is only UI focus.
  class ModelColumn extends globalThis.__cyleHumanEvaluationV1 {
    constructor(context, model) {
      super(context);
      this.model = model;
      this.columnIndex = model.columns[0];
      this.minimumTimelineWidth = 0;
    }
    focusHumanEvidence(items, scrollToResult = true) {
      this.compareHost?.activateModel(this.columnIndex);
      super.focusHumanEvidence(items, scrollToResult);
      if (items[0]) this.compareHost?.syncEvidenceSelection(this, items[0]);
    }
    renderTimeline() {
      super.renderTimeline();
      this.body.append(this.pickHint);
    }
    layout() {
      super.layout();
      this.compareHost?.scheduleLayout();
    }
    renderDetails() {
      super.renderDetails();
      this.compareHost?.scheduleLayout();
    }
    getModelSelection() {
      return this.row
        ? {
            tableKey: this.row.tableKey,
            rowIndex: this.row.rowIndex,
            columnIndex: this.columnIndex,
          }
        : null;
    }
    writeHumanResult() {
      if (this.active === false) return;
      return super.writeHumanResult();
    }
    async renderHumanPage(...args) {
      const revision = this.revision;
      await super.renderHumanPage(...args);
      if (revision !== this.revision) return;
      const style = el("style");
      style.textContent = `
        .timeline{display:none}.page{height:auto;overflow:visible}.result-list{overflow:visible;flex:none}.human-footer{position:static}
        @container model-editor (max-width:420px){
          .human-annotation-main{display:block;position:relative}
          .human-judgment{display:inline-block;margin-bottom:4px}
          .human-annotation-content{display:block;width:100%}
          .human-row-actions{position:absolute;right:0;top:0}
          .human-time-tags,.human-add{margin-left:0}
          .human-footer{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
          .human-footer span{min-height:28px;font-size:11px;line-height:14px}
          .human-footer button{justify-self:end}
        }
      `;
      this.body.append(style);
    }
    renderTabs() {
      this.view = "all";
      this.tabBar.replaceChildren();
      this.tabBar.hidden = true;
    }
  }
  class ModelCompare {
    constructor(context) {
      this.context = context;
      this.root = context.root;
      this.root.style.height = "100%";
      this.models = [];
      this.selected = new Set();
      this.columns = new Map();
      this.request = 0;
      this.active = true;
      this.needsRefresh = true;
      const style = el("style");
      style.textContent = `
        :host{display:block;height:100%;color:var(--pet-text);font:13px/1.5 Inter,"PingFang SC",sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}
        .comparison{height:100%;display:flex;flex-direction:column;min-height:0}.model-tabs{display:flex;gap:6px;padding:8px 10px;overflow-x:auto;flex-shrink:0;border-bottom:1px solid var(--pet-border)}
        button{font:inherit;cursor:pointer;color:var(--pet-text);background:var(--pet-raised);border:1px solid var(--pet-border);border-radius:5px;padding:5px 8px}button:disabled{opacity:.45;cursor:default}button:focus-visible{outline:2px solid var(--pet-accent);outline-offset:2px}
        .model-tabs button{position:relative;white-space:nowrap;font-size:12px;border-radius:8px;padding:8px 13px;border:1px solid var(--pet-border);background:var(--pet-raised);color:var(--pet-muted);transition:background .15s,border-color .15s,box-shadow .15s}
        .model-tabs button::after{content:"";position:absolute;inset:3px;border:1px dashed color-mix(in srgb,var(--model-color) 40%,var(--pet-border));border-radius:5px;pointer-events:none}
        .model-tabs button:hover:not(:disabled){background:color-mix(in srgb,var(--model-color) 12%,var(--pet-raised));border-color:var(--model-color);color:var(--pet-text)}
        .model-tabs button[aria-pressed=true]{background:color-mix(in srgb,var(--model-color) 23%,var(--pet-raised));border-color:var(--model-color);color:var(--pet-text);font-weight:650;box-shadow:none}
        .model-tabs button[aria-pressed=true]::after{border-color:color-mix(in srgb,var(--model-color) 75%,var(--pet-text))}
        .model-tabs button.is-current{background:color-mix(in srgb,var(--model-color) 36%,var(--pet-raised));box-shadow:0 0 0 1px var(--model-color)}

        .shared-timeline button[aria-pressed=true]{outline:0;background:transparent;text-decoration:underline;text-underline-offset:3px}.shared-timeline button:focus:not(:focus-visible){outline:0}.evidence-choices{flex:none;border-bottom:1px solid var(--pet-border);max-height:70px;overflow:auto}.evidence-choices button{font-size:11px;padding:3px 6px}
        .comparison-columns{display:grid;flex:1;min-height:0;min-width:0;overflow:auto;overflow-anchor:none;align-items:start;gap:0}.model-column{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--pet-border)}.model-column:last-child{border-right:0}
        .model-editor{min-height:0;min-width:0;overflow:visible;container-type:inline-size;container-name:model-editor}.comparison-message{font-size:12px;padding:12px;color:var(--pet-muted)}
      `;
      this.body = el("section", "", "comparison");
      this.tabs = el("nav", "", "model-tabs");
      this.tabs.setAttribute("aria-label", "比对模型");
      this.grid = el("div", "", "comparison-columns");
      this.message = el("p", "", "comparison-message");
      this.message.hidden = true;
      this.timeline = el("div", "", "shared-timeline");
      this.timeline.tabIndex = 0;
      this.timeline.addEventListener("click", event => event.stopPropagation());
      this.timeline.style.cssText = "flex:none;overflow-x:auto;background:var(--pet-canvas);position:relative";
      this.choices = el("div", "", "evidence-choices");
      this.choices.hidden = true;
      this.body.append(this.tabs, this.timeline, this.choices, this.message, this.grid);
      this.zoom = 1;
      this.timeline.addEventListener("wheel", event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        this.zoom = Math.max(1, Math.min(16, this.zoom * Math.exp(-event.deltaY * .008)));
        this.renderSharedTimeline();
      }, {passive:false});
      this.timeline.addEventListener("keydown", event => {
        if (!(event.ctrlKey || event.metaKey) || !["+","=","-","0"].includes(event.key)) return;
        event.preventDefault();
        this.zoom = event.key === "0" ? 1 : Math.max(1, Math.min(16, this.zoom * (event.key === "-" ? .8 : 1.25)));
        this.renderSharedTimeline();
      });
      this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
      this.resizeObserver.observe(this.grid);
      this.root.replaceChildren(style, this.body);
      this.modelListener = () => {
        if (!this.active || this.loading) return;
        const selection = globalThis.__cyleSelectedModelVideoV1;
        if (
          selection?.tableKey !== this.row?.tableKey ||
          selection.rowIndex !== this.row?.rowIndex
        )
          return;
        const model = this.models.find((m) =>
          m.columns.includes(selection.columnIndex),
        );
        if (!model) return;
        if (!this.selected.has(model.id)) {
          this.selected.add(model.id);
          this.renderColumns();
        }
        const record = this.columns.get(model.id);
        if (record && record.editor.columnIndex !== selection.columnIndex) {
          record.editor.commitEvidencePick();
          record.editor.columnIndex = selection.columnIndex;
          record.editor.update();
        }
        this.renderTabs();
        this.highlightFocus();
      };
      document.addEventListener(
        "cyle:model-video-selected",
        this.modelListener,
      );
    }
    setRow(row) {
      this.choices.hidden = true;
      this.selectedTime = null;
      this.row = row;
      this.needsRefresh = true;
      if (this.active) return this.update();
    }
    async update() {
      const request = ++this.request,
        row = this.row;
      this.loading = true;
      this.body.inert = true;
      for (const { editor } of this.columns.values()) {
        editor.commitEvidencePick();
        editor.setActive(false);
        // Invalidate in-flight rendering and submissions before loading the next row.
        editor.revision++;
      }
      try {
        const M = globalThis.__cyleFieldMappingV1,
          mapping = row ? await M.load(row) : null;
        if (request !== this.request || row !== this.row) return;
        const table = row ? M.key(row) : "";
        if (table !== this.table) {
          this.table = table;
          this.selected.clear();
          this.initialized = false;
          this.clearColumns();
        }
        const models = new Map();
        for (const item of mapping ? M.read(row, mapping) : []) {
          const field = mapping.fields.find((f) => f.id === item.id),
            entity = mapping.entities?.find((e) => e.id === field.entityId);
          if (entity?.type !== "model") continue;
          if (!models.has(entity.id))
            models.set(entity.id, {
              id: entity.id,
              name: entity.name,
              columns: [],
              humanColumns: [],
            });
          if (
            field.role === "产物" ||
            field.label.endsWith(" · 产物") ||
            /视频链接|图片链接|模型回答|模型结果/.test(item.source.header)
          )
            models.get(entity.id).columns.push(item.source.index);
          if (field.role === "人评" || /[-_]人评$/.test(item.source.header))
            models.get(entity.id).humanColumns.push(item.source.index);
        }
        this.models = [...models.values()];
        this.selected = new Set(
          [...this.selected].filter((id) =>
            this.models.some((m) => m.id === id && m.columns.length),
          ),
        );
        if (!this.initialized) {
          const globalSelection = globalThis.__cyleSelectedModelVideoV1;
          const selection =
            row && globalSelection?.tableKey === row.tableKey &&
            globalSelection.rowIndex === row.rowIndex
              ? globalSelection
              : null;
          const initial =
            this.models.find((m) =>
              m.columns.includes(selection?.columnIndex),
            ) || this.models.find((m) => m.columns.length);
          if (initial) this.selected.add(initial.id);
          this.initialized = true;
        }
        this.needsRefresh = false;
        this.message.textContent = "";
        this.message.hidden = true;
        this.renderTabs();
        await this.renderColumns(true);
      } catch (error) {
        if (request === this.request) {
          this.clearColumns();
          this.models = [];
          this.renderTabs();
          this.message.textContent = error.message;
          this.message.hidden = false;
        }
      } finally {
        if (request === this.request) {
          this.loading = false;
          this.body.inert = false;
        }
      }
    }
    renderTabs() {
      this.tabs.replaceChildren();
      for (const model of this.models) {
        const tab = el("button", model.name);
        tab.style.setProperty("--model-color", this.modelColor(model.id));
        tab.type = "button";
        tab.dataset.modelId = model.id;
        tab.setAttribute("aria-pressed", String(this.selected.has(model.id)));
        tab.disabled = !model.columns.length;
        tab.title = tab.disabled
          ? "请在组装中关联此模型的回答列"
          : this.selected.has(model.id)
            ? "点击关闭此列"
            : "点击打开此列";
        tab.addEventListener("click", () => this.toggleModel(model));
        this.tabs.append(tab);
      }
    }
    toggleModel(model) {
      if (!model.columns.length) return;
      if (this.selected.has(model.id)) this.selected.delete(model.id);
      else this.selected.add(model.id);
      this.renderTabs();
      this.renderColumns();
    }
    async renderColumns(refresh = false) {
      const selected = this.models.filter((m) => this.selected.has(m.id));
      for (const [id, record] of this.columns) {
        if (!this.selected.has(id)) {
          record.editor.dispose();
          this.resizeObserver.unobserve(record.node.querySelector(".model-editor"));
          record.node.remove();
          this.columns.delete(id);
        }
      }
      const updates = [];
      for (const [index, model] of selected.entries()) {
        let record = this.columns.get(model.id),
          created = false;
        if (!record) {
          const node = el("section", "", "model-column");
          node.dataset.compareModel = model.id;
          node.dataset.modelName = model.name;
          const host = el("div", "", "model-editor"),
            shadow = host.attachShadow({ mode: "open" }),
            root = el("div");
          root.style.height = "auto";
          shadow.append(root);
          node.append(host);
          const editor = new ModelColumn({ ...this.context, root }, model);
          editor.compareHost = this;
          editor.setActive(false);
          record = { node, editor };
          this.columns.set(model.id, record);
          this.resizeObserver.observe(host);
          created = true;
          const focus = () => {
            this.activateModel(record.editor.columnIndex);
          };
          node.addEventListener("pointerdown", focus);
          node.addEventListener("focusin", focus);
        }
        record.node.dataset.modelName = model.name;
        record.node.style.borderTop = `2px solid ${this.modelColor(model.id)}`;
        record.editor.model = model;
        if (!model.columns.includes(record.editor.columnIndex))
          record.editor.columnIndex = model.columns[0];
        // Retain mounted columns when only another model is toggled.
        if (this.grid.children[index] !== record.node)
          this.grid.insertBefore(
            record.node,
            this.grid.children[index] || null,
          );
        if (created || refresh) {
          record.editor.setActive(false);
          record.editor.setRow(this.row);
          updates.push(record.editor.setActive(this.active));
        }
      }
      this.grid.style.gridTemplateColumns = `repeat(${Math.max(1, selected.length)}, minmax(0, 1fr))`;
      this.message.hidden = selected.length > 0;
      if (!selected.length)
        this.message.textContent = this.models.length
          ? "点击上方模型名称，选择要同时显示的模型。"
          : "请先在组装中关联模型回答列。";
      this.highlightFocus();
      await Promise.all(updates);
      this.scheduleLayout();
    }
    modelColor(id) {
      const colors = ["#b09acb", "#67acb0", "#c6a06b", "#c68fa5", "#8aa5cb", "#9eae77"];
      return colors[Math.max(0, this.models.findIndex(m => m.id === id)) % colors.length];
    }
    scheduleLayout() {
      if (this.layoutFrame || !this.active) return;
      this.layoutFrame = requestAnimationFrame(() => {
        this.layoutFrame = 0;
        this.alignCriteria();
        this.renderSharedTimeline();
      });
    }
    alignCriteria() {
      const scrollTop = this.grid.scrollTop;
      // Measure natural heights, then give matching stable IDs the same row height.
      const rows = new Map();
      for (const {editor} of this.columns.values()) {
        for (const card of editor.details?.querySelectorAll(".human-card") || []) {
          const key = `${editor.template?.id}/${card.dataset.criterionId}`;
          card.style.minHeight = "";
          if (!rows.has(key)) rows.set(key, []);
          rows.get(key).push(card);
        }
      }
      // Group headings must also occupy equal space when names wrap.
      const headings = new Map();
      for (const {editor} of this.columns.values())
        for (const section of editor.details?.querySelectorAll(".human-group") || []) {
          const heading = section.querySelector("h3");
          if (!heading) continue;
          const key = `${editor.template?.id}/${section.querySelector("[data-criterion-id]")?.dataset.criterionId}`;
          heading.style.minHeight = "";
          if (!headings.has(key)) headings.set(key, []);
          headings.get(key).push(heading);
        }
      // Read all natural heights before applying any alignment. Intermediate
      // collapsed rows must neither become scroll anchors nor clamp our position.
      const sizes = [...rows.values(), ...headings.values()].map(nodes => ({
        nodes, height: Math.max(...nodes.map(node => node.offsetHeight)),
      }));
      for (const {nodes, height} of sizes)
        for (const node of nodes) node.style.minHeight = `${height}px`;
      this.grid.scrollTop = scrollTop;
    }
    renderSharedTimeline() {
      this.timeline.replaceChildren();
      const records = this.models.map(model => this.columns.get(model.id)).filter(Boolean);
      if (!records.length) return;
      const extent = Math.max(1, ...records.map(({editor}) => editor.extent || 0));
      const width = Math.max(300, this.timeline.clientWidth) * this.zoom;
      const plot = el("div");
      plot.style.cssText = `position:relative;width:${width}px;height:${76+records.length*18}px`;
      const x = time => 12 + Math.min(1, time / extent) * (width - 24);
      for (let i=0;i<=5;i++) {
        const tick = el("span", `${Math.round(extent*i/5)}s`);
        tick.style.cssText = `position:absolute;left:${x(extent*i/5)}px;top:3px;font-size:11px;transform:translateX(${i===0?0:i===5?-100:-50}%)`;
        plot.append(tick);
      }
      for (const top of [28,60]) {
        const line = el("div");
        line.style.cssText = `position:absolute;top:${top}px;left:0;right:0;border-top:1px solid var(--pet-border)`;
        plot.append(line);
      }
      const occupied = [], numbers = [], marks = new Map();
      this.timeline.append(plot);
      records.forEach(({editor}) => {
        const groups = new Map();
        for (const node of editor.data?.nodes || []) {
          const key = String(node.start);
          if (!groups.has(key)) groups.set(key, {...node, items:[], spans:[]});
          groups.get(key).items.push(...node.items);
          groups.get(key).spans.push(node);
        }
        for (const node of groups.values()) {
          const scores = [...new Set(node.items.map(i => i.result?.tier_ceiling))];
          for (const span of node.spans) {
            const key = `${span.start}:${span.end}`;
            if (!marks.has(key)) marks.set(key, {start:span.start,end:span.end,scores:new Set()});
            for (const item of span.items) marks.get(key).scores.add(item.result?.tier_ceiling ?? null);
          }
          const number = el("button", String(node.items.length));
          number.dataset.time = String(node.start);
          number.dataset.selectionKey = `${editor.model.id}:${node.start}`;
          number.setAttribute("aria-pressed", String(number.dataset.selectionKey === this.selectedTime));
          number.style.cssText = `position:absolute;left:${x(node.start)}px;top:64px;transform:translateX(-50%);color:${this.modelColor(editor.model.id)};border:0;background:transparent;padding:0 3px;font-size:11px;line-height:17px`;
          number.title = `${editor.model.name} · ${node.start}s${node.end>node.start?`–${node.end}s`:""} · ${node.items.length} 条标注 · 分数 ${scores.map(s=>s ?? "未评分").join(" / ")}`;
          number.addEventListener("click", () => {
            this.selectedTime = number.dataset.selectionKey;
            this.timeline.querySelectorAll("[data-selection-key]").forEach(n=>n.setAttribute("aria-pressed",String(n===number)));
            this.activateModel(editor.columnIndex);
            editor.focusHumanEvidence(node.items, false);
            editor.seek(node.start);
            this.showEvidenceChoices(editor, node.items);
          });
          plot.append(number);
          numbers.push({number, position:x(node.start)});
        }
      });
      // Pack the actual label widths, in time order. Only overlapping labels
      // need another row; the model identity does not reserve vertical space.
      numbers.sort((a,b)=>a.position-b.position);
      for (const {number,position} of numbers) {
        const half = number.offsetWidth / 2;
        let lane = 0;
        while (occupied[lane] !== undefined && occupied[lane] + 2 > position-half) lane++;
        occupied[lane] = position+half;
        number.style.top = `${64+lane*20}px`;
      }
      // All models share the exact time coordinate. Mixed scores divide the
      // mark vertically instead of shifting a timestamp left or right.
      for (const {start,end,scores} of marks.values()) {
        const ordered = [...scores].sort((a,b)=>(a ?? 0)-(b ?? 0));
        ordered.forEach((score,index) => {
          const mark = el("div");
          const range = end > start;
          mark.dataset.time = String(start);
          mark.dataset.evidenceMark = "true";
          mark.style.cssText = `position:absolute;left:${x(start)}px;top:${28+index*32/ordered.length}px;height:${32/ordered.length}px;width:${range?Math.max(2,x(end)-x(start)):2}px;${range?"":"transform:translateX(-50%);"}background:${globalThis.__cyleEvaluationTimelineV1.scoreColor(score)};opacity:${range?.25:1};pointer-events:none`;
          plot.append(mark);
        });
      }
      plot.style.height = `${72+Math.max(1,occupied.length)*20}px`;
      const cursor = el("div", "", "shared-cursor");
      cursor.style.cssText = "position:absolute;top:23px;height:37px;width:14px;transform:translateX(-50%);pointer-events:none;z-index:2";
      const stem = el("div"), tip = el("div");
      stem.style.cssText = "position:absolute;left:6px;top:6px;bottom:0;width:2px;background:#f5ad52";
      tip.style.cssText = "position:absolute;left:1px;top:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #f5ad52";
      cursor.append(stem,tip);
      plot.append(cursor);
      cancelAnimationFrame(this.clockFrame);
      const clock = () => {
        if (!this.active) return;
        const editor = this.focusedEditor();
        cursor.style.left = `${x(editor?.video?.currentTime || 0)}px`;
        this.clockFrame = requestAnimationFrame(clock);
      };
      clock();
      let gesture;
      const time = event => {
        const rect = plot.getBoundingClientRect();
        const scale = rect.width / width || 1;
        return Math.max(0, Math.min(extent, ((event.clientX - rect.left) / scale - 12) / (width - 24) * extent));
      };
      plot.addEventListener("pointerdown", event => {
        if (event.button || event.target.closest("button")) return;
        const editor = this.focusedEditor();
        if (!editor) return;
        event.preventDefault();
        gesture = {editor,start:time(event)};
        plot.setPointerCapture(event.pointerId);
        editor.seek(gesture.start);
      });
      plot.addEventListener("pointermove", event => { if (gesture) gesture.editor.seek(time(event)); });
      plot.addEventListener("pointerup", event => {
        if (!gesture) return;
        const {editor,start} = gesture, end = time(event);
        gesture = null;
        if (editor.pendingEvidence) editor.placeEvidence(Math.min(start,end),Math.max(start,end));
      });
      plot.addEventListener("pointercancel", () => { gesture = null; });
      this.timeline.append(plot);
    }
    syncEvidenceSelection(editor, item) {
      this.selectedTime = `${editor.model.id}:${item.evidence.start}`;
      const buttons = this.timeline.querySelectorAll("[data-selection-key]");
      for (const button of buttons) {
        const selected = button.dataset.selectionKey === this.selectedTime;
        button.setAttribute("aria-pressed", String(selected));
        if (selected) {
          const x = parseFloat(button.style.left);
          if (x < this.timeline.scrollLeft || x > this.timeline.scrollLeft + this.timeline.clientWidth)
            this.timeline.scrollLeft = Math.max(0, x-this.timeline.clientWidth/2);
        }
      }

    }
    focusedEditor() {
      return [...this.columns.values()].map(r=>r.editor).find(e=>e.pendingEvidence) ||
        [...this.columns.values()].map(r=>r.editor).find(e=>e.columnIndex===globalThis.__cyleSelectedModelVideoV1?.columnIndex) ||
        this.columns.values().next().value?.editor;
    }
    showEvidenceChoices(editor, items) {
      const choices = this.choices;
      choices.replaceChildren();
      choices.hidden = false;
      choices.style.cssText = "display:flex;gap:6px;padding:4px 10px;flex-wrap:wrap";
      for (const item of items) {
        const button = el("button", `${item.criterionId} · ${item.evidence.text || item.evidence.annotationId || "标注"}`);
        button.addEventListener("click", () => {
          editor.focusHumanEvidence([item],false);
          const card = [...editor.details.querySelectorAll(".human-card")].find(n=>n.dataset.criterionId===item.criterionId);
          if (card) {
            const bounds = this.grid.getBoundingClientRect();
            const scale = bounds.height / this.grid.offsetHeight || 1;
            this.grid.scrollTop += (card.getBoundingClientRect().top - bounds.top) / scale;
          }
        });
        choices.append(button);
      }
      // Keep feedback outside the ruler so video/layout updates cannot erase it.
      choices.querySelector("button")?.click();
    }
    revealVideo(columnIndex) {
      if (!this.row || columnIndex == null) return;
      document.dispatchEvent(new CustomEvent("cyle:reveal-model-video", {
        detail: {tableKey:this.row.tableKey, rowIndex:this.row.rowIndex, columnIndex},
      }));
    }
    activateModel(columnIndex) {
      if (!this.row) return;
      this.revealVideo(columnIndex);
      for (const {editor} of this.columns.values()) {
        if (editor.columnIndex === columnIndex) continue;
        editor.selectedEvidence = new Set();
        editor.selectedCriterionId = null;
        editor.selectedKey = null;
        editor.markHumanSelection?.();
      }
      const current = globalThis.__cyleSelectedModelVideoV1;
      if (
        current?.tableKey === this.row.tableKey &&
        current.rowIndex === this.row.rowIndex &&
        current.columnIndex === columnIndex
      ) {
        this.highlightFocus();
        return;
      }
      globalThis.__cyleSelectedModelVideoV1 = {
        tableKey: this.row.tableKey,
        rowIndex: this.row.rowIndex,
        columnIndex,
      };
      for (const card of document.querySelectorAll(".cyle-public-card"))
        card.classList.toggle(
          "is-model-selected",
          card.dataset.cardKey === `column:${columnIndex}`,
        );
      document.dispatchEvent(new CustomEvent("cyle:model-video-selected"));
      this.highlightFocus();
    }
    highlightFocus() {
      const selection = globalThis.__cyleSelectedModelVideoV1;
      for (const tab of this.tabs.querySelectorAll("button[data-model-id]")) {
        const model = this.models.find(model => model.id === tab.dataset.modelId);
        const current = this.selected.has(model?.id) && selection?.tableKey === this.row?.tableKey && selection?.rowIndex === this.row?.rowIndex && model?.columns.includes(selection?.columnIndex);
        tab.classList.toggle("is-current", Boolean(current));
        if (current) tab.setAttribute("aria-current", "true");
        else tab.removeAttribute("aria-current");
      }
      for (const record of this.columns.values())
        record.node.classList.toggle(
          "is-focused",
          selection?.tableKey === this.row?.tableKey &&
            selection.rowIndex === this.row?.rowIndex &&
            record.editor.model.columns.includes(selection.columnIndex),
        );
    }
    setActive(active) {
      this.active = active;
      if (!active) {
        this.request++;
        this.loading = false;
        this.needsRefresh = true;
        for (const record of this.columns.values())
          record.editor.setActive(false);
      } else if (this.needsRefresh) return this.update();
      else
        return Promise.all(
          [...this.columns.values()].map(({ editor }) => editor.setActive(true)),
        );
    }
    async openDraftContext(target) {
      if (target.workspace === "caption-review" && target.kind !== "人评")
        throw new Error(
          "旧 Caption 草稿仍可预览和导出，不能套用到新的人评比对页面。",
        );
      await this.update();
      const model = this.models.find((m) =>
        m.humanColumns.includes(target.columnIndex),
      );
      if (!model || !model.columns.length)
        throw new Error("请先关联此草稿对应的模型回答列。");
      this.selected.add(model.id);
      this.renderTabs();
      await this.renderColumns();
      const editor = this.columns.get(model.id).editor;
      if (model.columns.includes(target.videoColumnIndex))
        editor.columnIndex = target.videoColumnIndex;
      await editor.openDraftContext(target);
    }
    clearColumns() {
      for (const record of this.columns.values()) {
        this.resizeObserver.unobserve(record.node.querySelector('.model-editor'));
        record.editor.dispose();
      }
      cancelAnimationFrame(this.clockFrame);
      this.timeline.replaceChildren();
      this.choices.replaceChildren();
      this.choices.hidden = true;
      this.selectedTime = null;
      this.columns.clear();
      this.grid.replaceChildren();
    }
    dispose() {
      this.request++;
      this.active = false;
      document.removeEventListener(
        "cyle:model-video-selected",
        this.modelListener,
      );
      cancelAnimationFrame(this.layoutFrame);
      cancelAnimationFrame(this.clockFrame);
      this.resizeObserver.disconnect();
      this.clearColumns();
    }
  }
  globalThis.__cyleModelCompareV1 = ModelCompare;
})();
