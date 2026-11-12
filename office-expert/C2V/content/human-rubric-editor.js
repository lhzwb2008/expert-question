(() => {
  "use strict";
  if (globalThis.__cyleHumanRubricEditorV1) return;
  const el = (tag, text = "", cls = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = cls;
    return node;
  };
  const button = (label, fn) => {
    const b = el("button", label);
    b.type = "button";
    b.addEventListener("click", () =>
      Promise.resolve()
        .then(fn)
        .catch((e) =>
          b.dispatchEvent(
            new CustomEvent("rubric-error", {
              bubbles: true,
              composed: true,
              detail: e,
            }),
          ),
        ),
    );
    return b;
  };
  // Sort the view while retaining source indices for editing and deletion.
  const byId = (items) =>
    items
      .map((value, index) => ({ value, index }))
      .sort((a, b) =>
        String(a.value.id).localeCompare(String(b.value.id), "zh-CN", {
          numeric: true,
        }),
      );
  class Editor {
    constructor(parent) {
      this.service = globalThis.__cyleHumanRubricV1;
      this.ti = 0;
      this.gi = null;
      this.ci = null;
      this.dirty = false;
      this.advanced = false;
      this.busy = false;
      this.pending = false;
      this.host = el("div", "", "cyle-human-rubric-editor");
      this.host.style.height = "100%";
      this.root = this.host.attachShadow({ mode: "open" });
      parent.append(this.host);
      const style = el("style");
      style.textContent = `
        :host {
          display: block;
          font:
            13px/1.5 Inter,
            "Microsoft YaHei",
            "PingFang SC",
            system-ui,
            sans-serif;
          color: var(--pet-text, #eef2f5);
          color-scheme: var(--pet-scheme, dark);
        }
        * {
          box-sizing: border-box;
        }
        [hidden] {
          display: none !important;
        }
        .shell {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--pet-surface);
        }
        .columns {
          display: grid;
          grid-template-columns: var(
            --composer-columns,
            210px minmax(0, 1fr) minmax(0, 1fr)
          );
          border-top: 1px solid var(--pet-border);
          flex: 1;
          min-height: 0;
        }
        .pane {
          padding: var(--composer-pane-padding, 18px 16px);
          min-width: 0;
          min-height: 0;
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--pet-border) transparent;
        }
        .pane + .pane {
          border-left: 1px solid var(--pet-border);
        }
        main.pane {
          background: transparent;
        }
        h3 {
          font-size: 13px;
          font-weight: 650;
          margin: 0 0 16px;
        }
        h4 {
          font-size: 12px;
          margin: 0 0 8px;
          color: var(--pet-muted);
        }
        button,
        input,
        textarea {
          font: inherit;
          color: inherit;
          border: 1px solid var(--pet-border);
          border-radius: 6px;
          padding: 6px 9px;
          min-height: 32px;
          min-width: 0;
        }
        button {
          cursor: pointer;
          background: var(--pet-raised);
        }
        button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        button:focus-visible,
        input:focus-visible,
        textarea:focus-visible,
        summary:focus-visible {
          outline: 2px solid var(--pet-accent);
          outline-offset: 2px;
        }
        input,
        textarea {
          width: 100%;
          background: var(--pet-input);
        }
        input[type="checkbox"] {
          width: auto;
          accent-color: var(--pet-accent);
        }
        textarea {
          min-height: 120px;
          resize: none;
          overflow: hidden;
          line-height: 1.8;
        }
        label {
          display: block;
          margin: 0 0 16px;
        }
        label:last-child {
          margin-bottom: 0;
        }
        label > span {
          display: block;
          font-size: 12px;
          color: var(--pet-muted);
          margin-bottom: 6px;
        }
        .inline {
          display: flex;
          gap: 16px;
        }
        .inline label {
          flex: 1;
          margin-bottom: 0;
        }
        .check {
          display: flex;
          gap: 8px;
          align-items: center;
          margin: 0;
        }
        .check span {
          margin: 0;
        }
        .row {
          position: relative;
          display: flex;
          align-items: center;
          margin-bottom: 3px;
          border-radius: 6px;
        }
        .row:has(.active) {
          background: var(--pet-soft);
          box-shadow: inset 3px 0 var(--pet-accent);
        }
        .item {
          flex: 1;
          min-width: 0;
          text-align: left;
          border: 0;
          background: transparent;
          padding: 6px 9px;
          min-height: 36px;
          font-size: 12px;
          overflow-wrap: break-word;
        }
        .item.active {
          font-weight: 650;
        }
        .row:hover {
          background: var(--pet-raised);
        }
        .row:has(.active):hover {
          background: var(--pet-soft);
        }
        .off {
          color: var(--pet-muted);
        }
        .row > .icon {
          min-height: 26px;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--pet-muted);
          opacity: 0.55;
          flex-shrink: 0;
        }
        .row:hover > .icon,
        .row:focus-within > .icon {
          opacity: 1;
        }
        .group {
          margin: 0 0 20px;
        }
        .group > .row > .item {
          font-size: 12px;
          font-weight: 600;
          color: var(--pet-muted);
          padding-bottom: 8px;
        }
        .criteria {
          padding: 0;
        }
        .pane > button,
        .group > button {
          background: transparent;
          border: 0;
          color: var(--pet-muted);
          font-size: 12px;
          padding: 7px 12px;
        }
        .pane > button:hover,
        .group > button:hover {
          color: var(--pet-accent);
          background: var(--pet-soft);
        }
        .detail-heading {
          margin-bottom: 20px;
        }
        .breadcrumb {
          font-size: 11px;
          color: var(--pet-muted);
          margin-bottom: 6px;
        }
        .detail-heading h2 {
          font-size: 13px;
          font-weight: 600;
          margin: 0;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }
        .section {
          padding: 0 0 18px;
          margin-bottom: 18px;
          border-bottom: 1px solid var(--pet-border);
        }
        .section-title {
          font-size: 12px;
          font-weight: 600;
          margin: 0 0 14px;
        }
        .section .inline {
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .scores {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .scores button {
          min-width: 40px;
          background: var(--pet-input);
        }
        .scores button[aria-pressed="true"] {
          background: var(--pet-soft);
          border-color: var(--pet-accent);
          color: var(--pet-accent);
          font-weight: 600;
        }
        .help,
        .status {
          color: var(--pet-muted);
          font-size: 11px;
          white-space: pre-wrap;
        }
        .status:empty {
          display: none;
        }
        .status {
          margin: 8px 16px;
          max-height: 100px;
          overflow: auto;
        }
        .footer > button:not(.primary) {
          background: var(--pet-raised);
        }
        .grow {
          flex: 1;
        }
        .empty {
          padding: 30px 0;
          color: var(--pet-muted);
        }
        .raw {
          height: 360px;
          min-height: 240px;
          overflow: auto;
          font:
            12px/1.6 ui-monospace,
            monospace;
        }
        .pane > button {
          margin-top: 12px;
          border-top: 1px solid var(--pet-border);
          border-radius: 0;
          padding-top: 16px;
        }
        .criteria .row {
          border-bottom: 1px solid
            color-mix(in srgb, var(--pet-border) 40%, transparent);
          border-radius: 0;
          min-height: 38px;
        }
        .criteria .item {
          font-weight: 400;
        }
        .criteria .active {
          font-weight: 500;
        }
        .inline input {
          font-size: 12px;
        }
        @media (max-width: 800px) {
          .columns {
            grid-template-columns: 160px minmax(0, 1fr) minmax(0, 1fr);
          }
          .pane {
            padding: 12px 10px;
          }
        }
        @media (max-width: 650px) {
          .columns {
            gap: 8px;
            padding: 8px 0;
          }
          .inline {
            flex-direction: column;
            align-items: stretch !important;
          }
          .inline label {
            width: 100%;
          }
        }
      `;
      style.textContent += globalThis.__cyleComposerStylesV1;
      this.shell = el("div", "", "shell");
      this.status = el("div", "", "status");
      this.status.setAttribute("role", "status");
      this.columns = el("div", "", "columns");
      this.left = el("aside", "", "pane");
      this.middle = el("aside", "", "pane");
      this.detail = el("main", "", "pane");
      this.columns.append(this.left, this.middle, this.detail);
      this.footer = el("footer", "", "footer");
      this.shell.append(this.status, this.columns, this.footer);
      this.root.append(style, this.shell);
      this.resizeObserver = new ResizeObserver(() => this.fitText());
      this.resizeObserver.observe(this.detail);
      this.host.addEventListener("rubric-error", (e) =>
        this.showError(e.detail),
      );
      for (const type of ["keydown", "keyup", "keypress"])
        this.host.addEventListener(type, (e) => e.stopPropagation());
    }
    async open() {
      if (this.draft) return;
      if (this.pending) return;
      this.pending = true;
      this.status.textContent = "正在读取本地评分配置…";
      try {
        this.saved = await this.service.load();
        this.draft = this.service.clone(this.saved);
        this.status.textContent = "";
        this.render();
      } catch (e) {
        this.status.textContent = e.message;
        this.left.replaceChildren(button("重试", () => this.open()));
      } finally {
        this.pending = false;
      }
    }
    changed(refreshLists = true) {
      this.dirty = true;
      this.saveState.textContent = "未保存";
      this.status.replaceChildren();
      if (refreshLists) this.renderLists();
      const heading = this.detail.querySelector("h2");
      if (heading)
        heading.textContent =
          this.criterion?.title || this.group?.name || "题目类型设置";
    }
    get template() {
      return this.draft.templates[this.ti];
    }
    get group() {
      return this.template?.dimension_groups[this.gi];
    }
    get criterion() {
      return this.group?.criteria[this.ci];
    }
    select(ti, gi = null, ci = null) {
      this.ti = ti;
      this.gi = gi;
      this.ci = ci;
      this.advanced = false;
      this.renderLists();
      this.renderDetail();
    }
    render() {
      this.renderLists();
      this.renderDetail();
      this.renderFooter();
      this.lock();
    }
    row(
      label,
      active,
      choose,
      list,
      index,
      remove,
      off = false,
      rename = null,
    ) {
      const row = el("div", "", "row");
      const pick = button(label, () => {
        clearTimeout(this.selectionTimer);
        this.selectionTimer = setTimeout(choose, 220);
      });
      pick.className = "item" + (active ? " active" : "") + (off ? " off" : "");
      row.append(pick);
      pick.title = rename ? "双击修改名称" : label;
      if (rename)
        pick.addEventListener("dblclick", () => {
          clearTimeout(this.selectionTimer);
          const input = el("input");
          input.value = list[index].name ?? list[index].title;
          input.setAttribute("aria-label", "编辑项目名称");
          row.replaceChild(input, pick);
          input.focus();
          input.select();
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            const value = input.value.trim();
            if (!value) {
              this.showError(new Error("名称不能为空"));
              this.renderLists();
              return;
            }
            rename(value);
            this.changed();
            this.renderDetail();
          };
          input.addEventListener("blur", finish);
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finish();
            }
            if (e.key === "Escape") {
              done = true;
              this.renderLists();
            }
          });
        });
      const del = button("×", () => {
        clearTimeout(this.selectionTimer);
        list.splice(index, 1);
        remove();
        this.changed();
        this.renderDetail();
      });
      del.className = "icon";
      del.setAttribute("aria-label", `删除 ${label}`);
      row.append(del);
      return row;
    }
    renderLists() {
      clearTimeout(this.selectionTimer);
      if (!this.draft) return;
      this.left.replaceChildren(el("h3", "题目类型"));
      this.draft.templates.forEach((t, i) =>
        this.left.append(
          this.row(
            t.name || "未命名类型",
            this.ti === i,
            () => this.select(i),
            this.draft.templates,
            i,
            () => {
              this.ti = Math.min(i, this.draft.templates.length - 1);
              this.gi = this.ci = null;
            },
            false,
            (value) => {
              t.name = value;
            },
          ),
        ),
      );
      this.left.append(
        button("新增题目类型", () => {
          this.draft.templates.push({
            id: "type-" + crypto.randomUUID().slice(0, 8),
            name: "新题目类型",
            question_type: "",
            dimension_groups: [],
          });
          this.select(this.draft.templates.length - 1);
          this.changed();
        }),
      );
      this.middle.replaceChildren(el("h3", "评估维度"));
      if (!this.template) return;
      byId(this.template.dimension_groups).forEach(
        ({ value: g, index: gi }) => {
          const section = el("section", "", "group");
          section.append(
            this.row(
              `${g.name || "未命名分组"} · 权重 ${g.weight}`,
              this.gi === gi && this.ci === null,
              () => this.select(this.ti, gi),
              this.template.dimension_groups,
              gi,
              () => {
                this.gi = this.ci = null;
              },
              false,
              (value) => {
                g.name = value;
              },
            ),
          );
          const list = el("div", "", "criteria");
          byId(g.criteria).forEach(({ value: c, index: ci }) =>
            list.append(
              this.row(
                `${c.id} ${c.title || "未命名维度"}${c.enabled ? "" : " · 已停用"}`,
                this.gi === gi && this.ci === ci,
                () => this.select(this.ti, gi, ci),
                g.criteria,
                ci,
                () => {
                  this.gi = gi;
                  this.ci = null;
                },
                !c.enabled,
                (value) => {
                  c.title = value;
                },
              ),
            ),
          );
          section.append(
            list,
            button("增加维度", () => {
              const ids = new Set(
                this.template.dimension_groups.flatMap((x) =>
                  x.criteria.map((c) => c.id),
                ),
              );
              let n = 1;
              while (ids.has(`${g.id}.${n}`)) n++;
              g.criteria.push({
                id: `${g.id}.${n}`,
                title: "新维度",
                enabled: true,
                weight: 1,
                definition: "",
                scoring_rules: "",
                score_values: [1, 3, 5],
              });
              this.select(this.ti, gi, g.criteria.length - 1);
              this.changed();
            }),
          );
          this.middle.append(section);
        },
      );
      this.middle.append(
        button("新增分组", () => {
          let n = 1;
          while (this.template.dimension_groups.some((g) => g.id === String(n)))
            n++;
          this.template.dimension_groups.push({
            id: String(n),
            name: "新分组",
            weight: 1,
            criteria: [],
          });
          this.select(this.ti, this.template.dimension_groups.length - 1);
          this.changed();
        }),
      );
    }
    field(label, object, key, type = "text") {
      const wrap = el("label");
      wrap.append(el("span", label));
      const input = el(type === "textarea" ? "textarea" : "input");
      if (type !== "textarea") input.type = type;
      input.setAttribute("aria-label", label);
      input.value = object[key] ?? "";
      if (type === "number") {
        input.min = "0";
        input.step = "any";
      }
      input.addEventListener("input", () => {
        object[key] =
          type === "number"
            ? input.value === ""
              ? null
              : Number(input.value)
            : input.value;
        this.changed(["id", "name", "title", "weight"].includes(key));
        if (type === "textarea") this.fitText();
      });
      wrap.append(input);
      return wrap;
    }
    renderDetail() {
      this.detail.replaceChildren();
      if (this.advanced) {
        this.renderRaw();
        return;
      }
      if (!this.template) {
        this.detail.append(el("p", "先新增一个题目类型。", "empty"));
        return;
      }
      const c = this.criterion,
        g = this.group,
        t = this.template;
      const heading = el("header", "", "detail-heading");
      heading.append(
        el("div", c ? `${t.name} / ${g.name}` : t.name, "breadcrumb"),
        el("h2", c ? c.title : g ? g.name : "题目类型设置"),
      );
      this.detail.append(heading);
      const section = (title, ...nodes) => {
        const card = el("section", "", "section");
        card.append(el("div", title, "section-title"), ...nodes);
        this.detail.append(card);
        return card;
      };
      if (c) {
        const basic = el("div", "", "inline");
        basic.append(
          this.field("维度 ID", c, "id"),
          this.field("组内权重", c, "weight", "number"),
        );
        const toggle = el("label", "", "check"),
          enabled = el("input");
        enabled.type = "checkbox";
        enabled.checked = c.enabled;
        enabled.setAttribute("aria-label", "启用此维度");
        enabled.addEventListener("change", () => {
          c.enabled = enabled.checked;
          this.changed();
        });
        toggle.append(enabled, el("span", "启用此维度"));
        section("基本信息", this.field("维度名称", c, "title"), basic, toggle);
        section(
          "定义",
          this.field("定义与验收关注点", c, "definition", "textarea"),
        );
        const scores = el("div", "", "scores");
        for (let n = 1; n <= 5; n++) {
          const b = button(`${n} 分`, () => {
            c.score_values = c.score_values.includes(n)
              ? c.score_values.filter((v) => v !== n)
              : [...c.score_values, n].sort((a, b) => a - b);
            this.changed(false);
            b.setAttribute("aria-pressed", String(c.score_values.includes(n)));
          });
          b.setAttribute("aria-label", `允许 ${n} 分`);
          b.setAttribute("aria-pressed", String(c.score_values.includes(n)));
          scores.append(b);
        }
        section(
          "评分设置",
          el("h4", "可用分数"),
          scores,
          this.field("评分标准", c, "scoring_rules", "textarea"),
        );
      } else if (g) {
        section(
          "分组设置",
          this.field("分组名称", g, "name"),
          this.field("分组 ID", g, "id"),
          this.field("分组权重", g, "weight", "number"),
        );
      } else {
        section(
          "类型设置",
          this.field("显示名称", t, "name"),
          this.field("题目类型匹配值", t, "question_type"),
          this.field("模板 ID", t, "id"),
        );
      }
      this.detail.scrollTop = 0;
      requestAnimationFrame(() => this.fitText());
    }
    fitText() {
      if (!this.detail.clientWidth) return;
      this.detail.querySelectorAll("textarea:not(.raw)").forEach((area) => {
        area.style.height = "auto";
        area.style.height = `${area.scrollHeight + 2}px`;
      });
    }
    renderFooter() {
      this.footer.replaceChildren();
      const file = el("input");
      file.type = "file";
      file.accept = ".json,application/json";
      file.hidden = true;
      file.addEventListener("change", async () => {
        try {
          if (file.files[0]) {
            if (file.files[0].size > 2 * 1024 * 1024)
              throw new Error("配置文件超过 2 MB");
            this.importText(await file.files[0].text());
          }
        } catch (e) {
          this.showError(e, false);
        }
        file.value = "";
      });
      this.footer.append(
        file,
        button("导入 JSON", () => file.click()),
        button("导出 JSON", () => this.export()),
        button("恢复默认", async () => {
          this.busy = true;
          this.lock();
          try {
            this.replaceDraft(
              await this.service.defaults(),
              true,
              "默认配置已放入草稿，保存后生效。",
            );
          } finally {
            this.busy = false;
            this.lock();
          }
        }),
        button("高级 JSON", () => {
          this.advanced = !this.advanced;
          this.renderDetail();
        }),
      );
      this.saveState = el(
        "span",
        this.dirty ? "未保存" : `已保存 · ${this.draft.version}`,
        "help",
      );
      this.footer.append(
        this.saveState,
        el("span", "", "grow"),
        button("取消修改", () => {
          this.replaceDraft(this.saved, false);
        }),
      );
      const save = button("保存配置", () => this.save());
      save.className = "primary";
      this.footer.append(save);
    }
    renderRaw() {
      this.detail.append(
        el("h3", "高级 JSON 编辑"),
        el(
          "p",
          "应用到草稿不会立即生效；校验通过后仍需点击“保存配置”。",
          "help",
        ),
      );
      const area = el("textarea", "", "raw");
      area.setAttribute("aria-label", "配置 JSON");
      area.spellcheck = false;
      area.value = this.rawText ?? JSON.stringify(this.draft, null, 2);
      area.addEventListener("input", () => (this.rawText = area.value));
      this.detail.append(
        area,
        button("应用 JSON 到草稿", () => {
          try {
            this.importText(area.value);
          } catch (e) {
            this.showError(e, false);
          }
        }),
        button("返回表单", () => {
          this.advanced = false;
          this.renderDetail();
        }),
      );
    }
    replaceDraft(config, dirty, message = "") {
      clearTimeout(this.selectionTimer);
      this.draft = this.service.clone(config);
      this.ti = 0;
      this.gi = this.ci = null;
      this.rawText = null;
      this.advanced = false;
      this.dirty = dirty;
      this.status.textContent = message;
      this.render();
    }
    importText(text) {
      this.replaceDraft(
        this.service.parse(text),
        true,
        "配置已导入草稿，保存后生效。",
      );
    }
    export() {
      this.service.assertValid(this.draft);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(this.draft, null, 2) + "\n"], {
          type: "application/json",
        }),
      );
      const a = el("a");
      a.href = url;
      a.download = "human-rubric.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    showError(error, navigate = true) {
      this.status.replaceChildren();
      const issues = error.issues || [
        { message: error.message || String(error), path: "" },
      ];
      for (const issue of issues) {
        const b = button(`${issue.path}：${issue.message}`, () => {
          if (navigate && issue.ti !== undefined)
            this.select(issue.ti, issue.gi ?? null, issue.ci ?? null);
        });
        b.style.cssText =
          "display:block;border:0;background:transparent;color:var(--pet-red,#ff9aa2);font-size:11px;text-align:left";
        this.status.append(b);
      }
    }
    lock() {
      // All editor controls are normally enabled; only pending I/O locks them.
      this.root.querySelectorAll("input,textarea,button").forEach((control) => {
        control.disabled = this.busy;
      });
    }
    async save() {
      if (this.busy) return;
      if (this.rawText != null) {
        this.showError(new Error("请先应用高级 JSON 到草稿，或取消修改。"));
        return;
      }
      const issues = this.service.validate(this.draft);
      if (issues.length) {
        this.showError({ issues });
        return;
      }
      this.busy = true;
      this.lock();
      try {
        this.saved = await this.service.save(this.draft);
        this.draft = this.service.clone(this.saved);
        this.dirty = false;
        this.rawText = null;
        this.status.textContent = "评分配置已保存在本机。";
        this.saveState.textContent = `已保存 · ${this.saved.version}`;
        this.renderDetail();
      } finally {
        this.busy = false;
        this.lock();
      }
    }
    dispose() {
      clearTimeout(this.selectionTimer);
      this.resizeObserver.disconnect();
      this.host.remove();
    }
  }
  globalThis.__cyleHumanRubricEditorV1 = Object.freeze({
    create: (parent) => new Editor(parent),
  });
})();
