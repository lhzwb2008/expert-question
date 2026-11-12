(() => {
  'use strict';
  const KEY = '__cyleScaleV1';
  if (globalThis[KEY]) return;
  const surfaces = new WeakMap();
  const MIN_SCALE = 0.75;
  const MAX_SCALE = 2;
  const number = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

  function measure(element) {
    const rect = element.getBoundingClientRect();
    const parentScale = rect.width / Math.max(1, element.offsetWidth);
    return { width: element.offsetWidth, height: element.offsetHeight, parentScale,
      left: Number.parseFloat(element.style.left) || 0, top: Number.parseFloat(element.style.top) || 0 };
  }

  function resize(start, corner, dx, dy, { minWidth = 0, minHeight = 0, maxWidth = Infinity, maxHeight = Infinity } = {}) {
    const slope = start.height / start.width;
    const west = corner.includes('w'), north = corner.includes('n');
    const baseWidth = number(start.baseWidth, start.width / number(start.scale, 1));
    const baseHeight = number(start.baseHeight, start.height / number(start.scale, 1));
    const maximum = Math.max(1, Math.min(maxWidth, maxHeight / slope, baseWidth * MAX_SCALE));
    const minimum = Math.min(maximum, Math.max(minWidth, minHeight / slope, baseWidth * MIN_SCALE));
    const delta = ((west ? -dx : dx) + slope * (north ? -dy : dy)) / (1 + slope * slope);
    const width = Math.max(minimum, Math.min(maximum, start.width + delta));
    const height = width * slope;
    return { left: west ? start.left + start.width - width : start.left,
      top: north ? start.top + start.height - height : start.top,
      width, height, baseWidth, baseHeight, scale: width / baseWidth };
  }

  function surface(element) {
    if (surfaces.has(element)) return surfaces.get(element);
    let body = null, state = null, savedStyle = {}, fullscreenListener;
    const restoreFullscreen = () => {
      if (!body || !state) return;
      const full = document.fullscreenElement;
      const selfFullscreen = full === element;
      const nestedFullscreen = full && element.contains(full);
      body.style.zoom = nestedFullscreen || selfFullscreen ? '1' : String(state.scale);
      body.style.width = selfFullscreen ? '100%' : `${state.baseWidth - state.borderX}px`;
      body.style.height = selfFullscreen ? '100%' : `${state.baseHeight - state.borderY}px`;
    };
    const api = {
      get state() { return state ? { scale: state.scale, baseWidth: state.baseWidth, baseHeight: state.baseHeight } : {}; },
      get body() { return body; },
      apply(layout) {
        if (!(Number(layout.baseWidth) > 0)) return;
        if (!body) {
          const style = getComputedStyle(element);
          body = document.createElement('div');
          body.className = 'cyle-scale-body';
          Object.assign(body.style, { display: style.display === 'none' ? 'flex' : style.display, flexDirection: style.flexDirection,
            gap: style.gap, alignItems: style.alignItems, justifyContent: style.justifyContent,
            gridTemplateColumns: style.gridTemplateColumns, padding: style.padding,
            boxSizing: 'border-box', flex: 'none', minWidth: '0', minHeight: '0', transformOrigin: '0 0' });
          savedStyle = { padding: element.style.padding, minWidth: element.style.minWidth, minHeight: element.style.minHeight };
          const children = [...element.childNodes].filter(node => !node.matches?.('.cyle-floating-resize,.gtm-inspector-card-size-handle'));
          element.prepend(body);
          const playing = [...element.querySelectorAll('video')].filter(video => !video.paused);
          children.forEach(node => {
            if (body.moveBefore && node.isConnected) body.moveBefore(node, null);
            else body.append(node);
          });
          playing.forEach(video => { if (video.paused) video.play().catch(() => {}); });
          Object.assign(element.style, { padding: '0', minWidth: '0', minHeight: '0' });
          element.classList.add('cyle-scaled-surface');
          fullscreenListener = restoreFullscreen;
          document.addEventListener('fullscreenchange', fullscreenListener);
        }
        const style = getComputedStyle(element);
        state = { scale: number(layout.scale, 1), baseWidth: layout.baseWidth, baseHeight: layout.baseHeight,
          borderX: parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth),
          borderY: parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) };
        element.dataset.cyleScale = String(state.scale);
        restoreFullscreen();
      },
      // Edge resizing reflows the logical surface at its current text scale.
      reflow(width, height) {
        if (!state) return {};
        api.apply({ ...state, baseWidth: width / state.scale, baseHeight: height / state.scale });
        return api.state;
      },
      reset() {
        if (!body) return;
        [...body.childNodes].forEach(node => {
          if (element.moveBefore && node.isConnected) element.moveBefore(node, body);
          else element.insertBefore(node, body);
        });
        body.remove(); body = null; state = null;
        Object.assign(element.style, savedStyle);
        element.classList.remove('cyle-scaled-surface');
        delete element.dataset.cyleScale;
        document.removeEventListener('fullscreenchange', fullscreenListener);
      },
      dispose() { api.reset(); surfaces.delete(element); }
    };
    surfaces.set(element, api);
    return api;
  }

  function bindCorner({ element, handle, corner, enabled = () => true, bounds = () => ({}), onStart, apply, persist }) {
    let drag = null, pending, frame = 0;
    const flush = () => {
      frame = 0;
      if (!drag || !pending) return;
      const event = pending; pending = null;
      const dx = (event.clientX - drag.x) / drag.start.parentScale;
      const dy = (event.clientY - drag.y) / drag.start.parentScale;
      if (Math.abs(dx) + Math.abs(dy) < 0.1) return;
      drag.layout = resize(drag.start, corner, dx, dy, bounds(drag.start));
      apply(drag.layout);
      surface(element).apply(drag.layout);
    };
    const move = event => {
      if (!drag || drag.id !== event.pointerId) return;
      pending = event;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const finish = event => {
      if (!drag || (event?.pointerId != null && drag.id !== event.pointerId)) return;
      if (event?.type === 'pointerup') pending = event;
      if (frame) cancelAnimationFrame(frame);
      flush();
      const previous = drag; drag = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      if (handle.hasPointerCapture?.(previous.id)) handle.releasePointerCapture(previous.id);
      element.classList.remove('is-resizing-card');
      if (previous.layout) persist?.(previous.layout);
    };
    const start = event => {
      if (event.button !== 0 || !enabled()) return;
      event.preventDefault(); event.stopPropagation(); onStart?.();
      drag = { start: { ...measure(element), ...surface(element).state }, id: event.pointerId, x: event.clientX, y: event.clientY };
      element.classList.add('is-resizing-card');
      handle.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      window.addEventListener('blur', finish);
    };
    handle.addEventListener('pointerdown', start);
    handle.addEventListener('lostpointercapture', finish);
    return { dispose() { finish(); handle.removeEventListener('pointerdown', start); handle.removeEventListener('lostpointercapture', finish); } };
  }
  globalThis[KEY] = Object.freeze({ surface, measure, resize, bindCorner, minimum: MIN_SCALE, maximum: MAX_SCALE,
    serialize(layout) {
      return layout?.baseWidth > 0 && layout?.baseHeight > 0
        ? { scale: layout.scale, baseWidth: layout.baseWidth, baseHeight: layout.baseHeight } : {};
    },
    fit(layout, viewportWidth, viewportHeight) {
      const scale = Math.min(Math.max(MIN_SCALE, number(layout.width, layout.baseWidth) / layout.baseWidth),
        MAX_SCALE, Math.max(1, viewportWidth - 16) / layout.baseWidth,
        Math.max(1, viewportHeight - 16) / layout.baseHeight);
      const width = layout.baseWidth * scale, height = layout.baseHeight * scale;
      return { ...layout, scale, width, height,
        left: Math.max(8, Math.min(Number(layout.left) || 8, viewportWidth - width - 8)),
        top: Math.max(8, Math.min(Number(layout.top) || 8, viewportHeight - height - 8)) };
    },
    logicalWidth(element) { return element.matches(':fullscreen') ? element.clientWidth : surfaces.get(element)?.state.baseWidth || element.clientWidth; },
    dispose(element) { surfaces.get(element)?.dispose(); } });
})();
