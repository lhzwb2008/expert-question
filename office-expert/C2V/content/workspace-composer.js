(() => {
  'use strict';

  const COMPOSER_KEY = '__cyleWorkspaceComposerV1';
  if (globalThis[COMPOSER_KEY]) return;

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function icon(name, size = 15) {
    return globalThis.__gtmLucideIconsV1?.create?.(name, { size })
      || el('span', '', '·');
  }

  function button(label, iconName, action, className = '') {
    const node = el('button', `cyle-composer-button ${className}`.trim());
    node.type = 'button';
    node.title = label;
    node.append(icon(iconName), el('span', '', label));
    node.addEventListener('click', (event) => {
      try {
        Promise.resolve(action(event)).catch((error) => {
          node.dispatchEvent(new CustomEvent('cyle-composer-action-error', {
            bubbles: true,
            detail: { error }
          }));
        });
      } catch (error) {
        node.dispatchEvent(new CustomEvent('cyle-composer-action-error', {
          bubbles: true,
          detail: { error }
        }));
      }
    });
    return node;
  }

  class WorkspaceComposer {
    constructor({ root, getRow, getReadError, onMappingApply, onNotice }) {
      this.root = root;
      this.getRow = getRow;
      this.getReadError = getReadError;
      this.onMappingApply = onMappingApply;
      this.onNotice = onNotice;
      this.build();
    }

    build() {
      const overlay = el('div', 'cyle-workspace-composer');
      overlay.hidden = true;
      const dialog = el('section', 'cyle-workspace-composer-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', '工作区装配器');

      const header = el('header', 'cyle-workspace-composer-header');
      const heading = el('div', 'cyle-workspace-composer-heading');
      heading.append(
        icon('Boxes', 18),
        el('div', '', ''),
      );
      heading.lastElementChild.append(
        el('strong', '', '工作区装配器'),
        el('span', '', '题库字段映射与人评评估维度，统一在此配置')
      );
      const close = button('关闭', 'X', () => this.close(), 'is-icon');
      header.append(heading, close);

      overlay.addEventListener('pointerdown', (event) => {
        if (event.target === overlay) this.close();
      });
      overlay.addEventListener('cyle-composer-action-error', (event) => {
        const error = event.detail?.error;
        this.onNotice?.(
          error?.message || String(error || '工作区操作失败'),
          true
        );
      });

      dialog.style.gridTemplateRows='auto auto minmax(0,1fr)';
      dialog.style.setProperty('--composer-columns','210px minmax(0,1fr) minmax(0,1fr)');
      dialog.style.setProperty('--composer-pane-padding','18px 16px');
      const tabs = el('nav', 'cyle-workspace-composer-header cyle-composer-tabs');
      const mappingPane = el('div');
      mappingPane.style.cssText='flex:1;min-height:0;overflow:hidden;padding:0';
      this.mappingNotice = el('p', 'gtm-draft-message');
      this.mappingNotice.setAttribute('role', 'status');
      this.mappingNotice.style.padding='16px';
      this.mappingContent = el('div');
      this.mappingContent.style.height='100%';
      mappingPane.append(this.mappingNotice, this.mappingContent);
      const rubricPane = el('div');
      rubricPane.hidden=true;rubricPane.style.cssText='min-height:0;overflow:hidden';
      const rubricTab = button('人评评估维度', 'FileText', () => this.showRubric());
      const mappingTab = button('题库映射', 'Settings', () => this.showMapping());
      tabs.append(mappingTab, rubricTab);
      dialog.append(header, tabs, mappingPane, rubricPane);
      this.rubricPane=rubricPane;this.rubricTab=rubricTab;
      this.mappingPane=mappingPane;
      this.mappingTab=mappingTab;
      overlay.append(dialog);
      this.root.append(overlay);

      Object.assign(this, { overlay, dialog });
    }

    async open() {
      this.overlay.hidden = false;
      await this.showMapping();
    }

    selectPane(name) {
      for (const [key, pane, tab] of [
        ['mapping', this.mappingPane, this.mappingTab],
        ['rubric', this.rubricPane, this.rubricTab]
      ]) {
        pane.hidden = key !== name;
        tab.classList.toggle('is-primary', key === name);
      }
    }

    async showRubric() {
      this.selectPane('rubric');
      this.rubricEditor ||= globalThis.__cyleHumanRubricEditorV1.create(this.rubricPane);
      await this.rubricEditor.open();
    }

    async showMapping({ select = true } = {}) {
      if (select) this.selectPane('mapping');
      const row = this.getRow?.();
      const error = this.getReadError?.();
      this.mappingNotice.textContent = row ? '' : error
        ? `当前表格读取失败：${error}。请刷新工作台后重试。`
        : '请先在表格中选中数据行，再打开组装。';
      this.mappingNotice.hidden = Boolean(row);
      this.mappingContent.hidden = !row;
      if (!row) { this.mappingEditor?.setRow(null); return; }
      if (!this.mappingEditor) {
        this.mappingEditor=globalThis.__cyleFieldMappingPanelV1.create({
          embedded:true,parent:this.mappingContent,getRow:this.getRow,
          onApply:async(config,row)=>{await this.onMappingApply?.(config,row);}
        });
      }
      if (!this.mappingEditor.isOpen) await this.mappingEditor.open();
      else this.mappingEditor.setRow(row);
    }

    setRow() {
      if (this.overlay.hidden) return;
      this.showMapping({ select: false }).catch(error => this.onNotice?.(error.message, true));
    }

    close() {
      this.mappingEditor?.close();
      this.overlay.hidden = true;
    }

    dispose() {
      this.mappingEditor?.dispose();
      this.rubricEditor?.dispose();
      this.overlay.remove();
    }
  }

  globalThis[COMPOSER_KEY] = Object.freeze({
    apiVersion: 1,
    create(options) {
      return new WorkspaceComposer(options);
    }
  });
})();
