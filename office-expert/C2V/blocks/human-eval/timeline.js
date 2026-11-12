(() => {
  "use strict";
  const el = (tag, text = "", cls = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = cls;
    return node;
  };
  const button = (text, action) => {
    const node = el("button", text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  // Human evidence editing reuses the shared ruler, video clock and zoom.
  class HumanTimeline extends globalThis.__cyleMachineEvaluationV1 {
    renderTimeline() {
      super.renderTimeline();
      this.pendingEvidence = null;
      this.evidenceGesture = null;
      this.selectedEvidence = new Set();
      this.pickHint = el("div", "", "human-pick");
      this.pickHint.hidden = true;
      this.scroll.parentElement.append(this.pickHint);
      const timeAt = (event) => {
        const rect = this.track.getBoundingClientRect();
        const x = ((event.clientX - rect.left) * this.plotWidth) / rect.width;
        return Math.min(
          this.extent,
          Math.round(
            Math.max(0, Math.min(1, (x - 10) / (this.plotWidth - 20))) *
              this.extent *
              1000,
          ) / 1000,
        );
      };
      this.track.addEventListener(
        "pointerdown",
        (event) => {
          if (!this.pendingEvidence || event.button !== 0) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.track.classList.add("is-seeking");
          this.evidenceGesture = {
            pointerId: event.pointerId,
            start: timeAt(event),
            x: event.clientX,
          };
          this.track.setPointerCapture(event.pointerId);
          this.seek(this.evidenceGesture.start);
        },
        true,
      );
      this.track.addEventListener(
        "pointermove",
        (event) => {
          if (this.evidenceGesture?.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const time = timeAt(event);
          this.seek(time);
          this.track.querySelector(".human-time-preview")?.remove();
          const preview = el("div", "", "human-time-preview");
          preview.style.cssText = `left:${this.timeX(Math.min(time, this.evidenceGesture.start))}px;width:${Math.max(2, Math.abs(this.timeX(time) - this.timeX(this.evidenceGesture.start)))}px`;
          this.track.append(preview);
        },
        true,
      );
      this.track.addEventListener(
        "pointerup",
        (event) => {
          const gesture = this.evidenceGesture;
          if (gesture?.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.track.releasePointerCapture(event.pointerId);
          this.evidenceGesture = null;
          this.track.classList.remove("is-seeking");
          this.evidencePointerDown = false;
          const end =
            Math.abs(event.clientX - gesture.x) < 4
              ? gesture.start
              : timeAt(event);
          this.placeEvidence(
            Math.min(gesture.start, end),
            Math.max(gesture.start, end),
          );
        },
        true,
      );
      this.track.addEventListener("pointercancel", () =>
        this.cancelEvidencePick(),
      );
      this.body.addEventListener(
        "keydown",
        (event) => {
          if (this.pendingEvidence && ['ArrowLeft','ArrowRight'].includes(event.key) && !event.target.closest('input,textarea')) {
            event.preventDefault(); event.stopImmediatePropagation();
            const pending=this.pendingEvidence;
            const base=pending.preview || this.answer(pending.criterionId)?.evidence?.find(e=>e.id===pending.evidenceId);
            const start=base?.start ?? (Number(this.video?.currentTime)||0);
            const end=base?.end ?? start;
            const delta=event.key==='ArrowLeft' ? -0.1 : 0.1;
            const next=Math.max(0,Math.min(this.video.duration-(end-start),Math.round((start+delta)*10)/10));
            this.placeEvidence(next,Math.round((next+end-start)*1000)/1000);
            return;
          }
          if (
            event.key === "Enter" &&
            this.pendingEvidence &&
            event.target === this.scroll
          ) {
            event.preventDefault();
            event.stopPropagation();
            this.commitEvidencePick();
            return;
          }
          if (event.key === "Escape") {
            this.hideRubricTip();
            if (this.pendingEvidence) {
              event.preventDefault();
              event.stopPropagation();
              this.cancelEvidencePick();
            }
          }
        },
        true,
      );
    }
    setActive(active) {
      if (!active) {
        this.commitEvidencePick();
        this.hideRubricTip();
      }
      return super.setActive(active);
    }
    beginEvidencePick(criterionId, evidenceId = null, annotationId = null) {
      if (this.humanState?.submitting) return;
      if (
        !this.video ||
        this.video.readyState < 1 ||
        !Number.isFinite(this.video.duration) ||
        this.video.duration <= 0
      ) {
        this.saveStatus.textContent =
          "请等待当前模型视频加载后再添加时间标注。";
        return;
      }
      this.commitEvidencePick();
      this.pendingEvidence = {
        criterionId,
        evidenceId,
        state: this.humanState,
        annotationId:
          annotationId ||
          this.answer(criterionId)?.evidence?.find((e) => e.id === evidenceId)
            ?.annotationId,
      };
      this.pickHint.hidden = false;
      const criterion = this.groups
        .flatMap((group) => group.criteria)
        .find((c) => c.id === criterionId);
      const annotation = this.answer(criterionId)?.annotations?.find(
        (a) => a.id === this.pendingEvidence.annotationId,
      );
      const target = el(
        "span",
        `${evidenceId ? "修改" : "添加"}时间 · ${criterionId} · ${annotation?.text?.slice(0, 28) || criterion?.title || "未填写说明"}`,
        "human-pick-target",
      );
      target.title = annotation?.text || "";
      this.pickTime = el(
        "output",
        evidenceId
          ? this.formatEvidence(
              this.answer(criterionId).evidence.find(
                (e) => e.id === evidenceId,
              ),
            )
          : "尚未选取",
      );
      this.finishPick = button("完成", () => this.commitEvidencePick());
      this.finishPick.disabled = !evidenceId;
      this.pickHint.replaceChildren(
        target,
        this.pickTime,
        el("span", "点击选点，拖动选片段；可反复调整", "human-pick-help"),
        this.finishPick,
        button("取消", () => this.cancelEvidencePick()),
      );
      this.selectedEvidence = new Set(evidenceId ? [evidenceId] : []);
      this.markHumanSelection();
      this.track.style.cursor = "crosshair";
      this.scroll.focus({ preventScroll: true });
    }
    formatEvidence(evidence) {
      const format = globalThis.__cyleEvaluationTimelineV1.format;
      return evidence.start === evidence.end
        ? format(evidence.start)
        : `${format(evidence.start)} — ${format(evidence.end)}`;
    }
    cancelEvidencePick(refresh = true) {
      const hadPreview = !!this.pendingEvidence?.preview;
      if (
        this.evidenceGesture &&
        this.track?.hasPointerCapture(this.evidenceGesture.pointerId)
      )
        this.track.releasePointerCapture(this.evidenceGesture.pointerId);
      this.pendingEvidence = null;
      this.evidenceGesture = null;
      if (this.pickHint) this.pickHint.hidden = true;
      if (this.track) {
        this.track.classList.remove("is-seeking");
        this.track.style.cursor = "";
        this.track.querySelector(".human-time-preview")?.remove();
      }
      if (refresh && hadPreview && this.details) this.refreshEvidence();
      this.markHumanSelection();
    }
    placeEvidence(start, end) {
      const pending = this.pendingEvidence;
      if (
        !pending ||
        this.contextKey() !== this.currentContext ||
        !this.video ||
        this.video.readyState < 1 ||
        end > this.video.duration
      )
        return;
      const evidence = {
        id: pending.evidenceId || pending.preview?.id || crypto.randomUUID(),
        annotationId: pending.annotationId,
        kind: start === end ? "point" : "range",
        start,
        end,
      };
      pending.preview = evidence;
      this.pickTime.textContent = this.formatEvidence(evidence);
      this.finishPick.disabled = false;
      this.selectedEvidence = new Set([evidence.id]);
      this.refreshEvidence();
      this.focusHumanEvidence([{ criterionId: pending.criterionId, evidence }]);
      this.seek(end);
    }
    commitEvidencePick() {
      const pending = this.pendingEvidence;
      if (!pending) return;
      if (pending.preview) {
        const state = pending.state;
        let answer = state.answers.find(
          (a) => a.criterionId === pending.criterionId,
        );
        if (!answer) {
          answer = { criterionId: pending.criterionId, score: null, note: "" };
          state.answers.push(answer);
        }
        answer.annotations ||= [];
        if (!pending.preview.annotationId) {
          pending.preview.annotationId = crypto.randomUUID();
          answer.annotations.push({
            id: pending.preview.annotationId,
            correct: null,
            text: "",
          });
        }
        const annotation = answer.annotations.find(
          (a) => a.id === pending.preview.annotationId,
        );
        if (annotation) annotation.time_source = "manual";
        const previous = answer.evidence || [];
        answer.evidence = pending.evidenceId
          ? previous.map((e) =>
              e.id === pending.evidenceId ? pending.preview : e,
            )
          : [...previous, pending.preview];
        state.dirty = true;
      }
      this.cancelEvidencePick(false);
      if (this.humanState === pending.state && this.saveStatus)
        this.updateSaveStatus();
    }
    evidenceEntries(criterionId) {
      const entries = this.answer(criterionId)?.evidence || [],
        pending = this.pendingEvidence;
      if (pending?.criterionId !== criterionId || !pending.preview)
        return entries;
      return pending.evidenceId
        ? entries.map((e) =>
            e.id === pending.evidenceId ? pending.preview : e,
          )
        : [...entries, pending.preview];
    }
    refreshEvidence() {
      const scrollTop = this.details.scrollTop;
      this.layout();
      this.renderDetails();
      this.details.scrollTop = scrollTop;
    }
    visibleEvidence(all = false) {
      if (this.humanState?.conflict) return [];
      return (this.groups || [])
        .filter(
          (g) => all || this.view === "all" || this.view === `group:${g.id}`,
        )
        .flatMap((g) =>
          g.criteria.flatMap((c) =>
            this.evidenceEntries(c.id).map((evidence) => ({
              criterionId: c.id,
              evidence,
            })),
          ),
        );
    }
    // Convert human evidence to the shared ruler's node contract. Rendering,
    // grouping, colors, cursor and marker geometry all stay in the machine base.
    layout() {
      if (!this.data || !this.track) return;
      const groupByCriterion = new Map(
        (this.groups || []).flatMap((g) =>
          g.criteria.map((c) => [c.id, `group:${g.id}`]),
        ),
      );
      this.categories = new Map(
        (this.groups || []).map((g) => [`group:${g.id}`, { name: g.name }]),
      );
      this.data.nodes = this.visibleEvidence(true).map((item) => ({
        key: `${item.evidence.start}:${item.evidence.end}`,
        start: item.evidence.start,
        end: item.evidence.end,
        items: [
          {
            ...item,
            id: `${item.criterionId}/${item.evidence.annotationId || item.evidence.id}`,
            dimension: groupByCriterion.get(item.criterionId),
            result: { tier_ceiling: this.answer(item.criterionId)?.score },
          },
        ],
      }));
      super.layout();
      this.scroll.hidden = !this.video;
      if (!this.video) {
        this.timelineNote.hidden = false;
        this.timelineNote.textContent = "暂无模型视频，时间标签保留在标注中。";
      }
      for (const { marker, node } of this.buttons || []) {
        marker.classList.add("human-time-mark");
        marker.dataset.evidenceIds = JSON.stringify(
          node.items.map((item) => item.evidence.id),
        );
      }
      for (const {evidence} of this.visibleEvidence()) {
        if (evidence.end <= evidence.start) continue;
        const band=el('div','','time-range-band');
        band.style.left=`${this.timeX(evidence.start)}px`;band.style.width=`${this.timeX(evidence.end)-this.timeX(evidence.start)}px`;
        this.track.prepend(band);
      }
      this.markHumanSelection();
    }
    classify(item) {
      return { dimension: item.dimension };
    }
    matches(item) {
      return this.view === "all" || item.dimension === this.view;
    }
    focusNode(node) {
      this.selectedKey = node.key;
      const item = this.cycleNodeItem(node, node.items);
      if (item) this.focusHumanEvidence([item]);
    }
    markHumanSelection() {
      if (!this.selectedEvidence) return;
      let selectedKey = null;
      for (const { marker, stem, node } of this.buttons || []) {
        const selected = node.items.some((item) =>
          this.selectedEvidence.has(item.evidence.id),
        );
        if (selected) selectedKey ||= node.key;
        marker.classList.toggle("selected", selected);
        stem.setAttribute("stroke-width", selected ? "3" : "2");
      }
      this.selectedKey = selectedKey;
      for (const row of this.details?.querySelectorAll("[data-evidence-id]") ||
        [])
        row.classList.toggle(
          "is-selected",
          this.selectedEvidence.has(row.dataset.evidenceId),
        );
      for (const item of this.details?.querySelectorAll(".human-annotation") ||
        [])
        item.classList.toggle(
          "is-editing-time",
          item.dataset.annotationId === this.pendingEvidence?.annotationId &&
            item.closest(".human-card")?.dataset.criterionId ===
              this.pendingEvidence?.criterionId,
        );
      for (const item of this.details?.querySelectorAll(".human-annotation") ||
        [])
        item.classList.toggle(
          "is-evidence-selected",
          !!item.querySelector("[data-evidence-id].is-selected"),
        );
      for (const card of this.details?.querySelectorAll(".human-card") || [])
        card.classList.toggle(
          "is-evidence-selected",
          (!this.selectedEvidence.size && card.dataset.criterionId === this.selectedCriterionId) || !!card.querySelector("[data-evidence-id].is-selected"),
        );
    }
    focusHumanEvidence(items, scrollToResult = true) {
      this.selectedCriterionId = items[0]?.criterionId;
      this.selectedKey =
        this.displayNodes?.find((node) =>
          node.items.some((item) =>
            items.some((selected) => selected.evidence.id === item.evidence.id),
          ),
        )?.key || null;
      this.selectedEvidence = new Set(items.map((i) => i.evidence.id));
      this.markHumanSelection();
      const row = [...this.details.querySelectorAll("[data-evidence-id]")].find(
        (n) => this.selectedEvidence.has(n.dataset.evidenceId),
      );
      if (row && scrollToResult) {
        const target = row.closest(".human-annotation") || row;
        const a = target.getBoundingClientRect(),
          b = this.details.getBoundingClientRect();
        if (a.top < b.top || a.bottom > b.bottom)
          this.details.scrollTop += a.top - b.top - 12;
      }
      const x = this.timeX(items[0].evidence.start);
      if (x < this.scroll.scrollLeft + 16 || x > this.scroll.scrollLeft + this.scroll.clientWidth - 16)
        this.scroll.scrollLeft = Math.max(0,x - this.scroll.clientWidth / 2);
      this.seek(items[0].evidence.start);
    }
  }
  globalThis.__cyleHumanTimelineV1 = HumanTimeline;
})();
