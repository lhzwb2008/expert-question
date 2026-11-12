(() => {
  'use strict';
  const KEY = '__cyleVideoControlsV1';
  if (globalThis[KEY]) return;
  const rates = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
  const instances = new WeakMap();
  const el = (tag, className, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const formatTime = (value) => {
    const seconds = Math.max(0, Number(value) || 0);
    const minutes = Math.floor(seconds / 60);
    const rest = (seconds % 60).toFixed(1).padStart(4, '0');
    return `${minutes}:${rest}`;
  };
  function createRateSelect({ value = 1, onChange } = {}) {
    const label = el('label', 'cyle-video-rate', '倍速');
    const select = el('select', 'cyle-video-rate-select');
    select.setAttribute('aria-label', '播放倍速');
    rates.forEach((rate) => select.add(new Option(`${rate}×`, String(rate))));
    select.value = String(value);
    select.addEventListener('change', () => onChange?.(Number(select.value)));
    label.append(select);
    return label;
  }
  function attach(video, options = {}) {
    instances.get(video)?.dispose();
    video.controls = false;
    const target = options.fullscreenTarget || video.parentElement;
    target?.classList.add('cyle-video-surface');
    const element = el('div', 'cyle-video-controls');
    if (options.referenceLayout) element.classList.add('is-pet-player');
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', '视频播放控制');
    const seekRow = el('div', 'cyle-video-seek-row');
    const progress = el('input', 'cyle-video-progress');
    progress.type = 'range';
    progress.min = '0';
    progress.max = '0';
    progress.step = '0.001';
    progress.value = '0';
    progress.setAttribute('aria-label', '视频进度');
    const time = el('output', 'cyle-video-time');
    seekRow.append(progress, time);
    const actions = el('div', 'cyle-video-actions');
    const status = el('span', 'cyle-video-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    let disposed = false;
    let scrubbing = false;
    const cleanups = [];
    const listen = (node, event, callback) => {
      node.addEventListener(event, callback);
      cleanups.push(() => node.removeEventListener(event, callback));
    };
    const run = (callback) => {
      if (disposed) return;
      status.hidden = true;
      try {
        Promise.resolve(callback()).catch((error) => {
          if (disposed || error?.name === 'AbortError') return;
          status.textContent = error?.message || '播放操作失败，请重试';
          status.hidden = false;
        });
      } catch (error) {
        status.textContent = error?.message || '播放操作失败，请重试';
        status.hidden = false;
      }
    };
    const button = (label, callback, icon) => {
      const node = el('button', 'cyle-video-button');
      node.type = 'button';
      node.title = label;
      node.setAttribute('aria-label', label);
      const icons = globalThis.__gtmLucideIconsV1;
      if (icon && icons?.has(icon)) node.append(icons.create(icon));
      else node.textContent = label;
      listen(node, 'click', () => run(callback));
      return node;
    };
    const seek = (value) => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const seconds = Math.max(0, Math.min(video.duration, Number(value) || 0));
      return options.onSeek ? options.onSeek(seconds) : (video.currentTime = seconds);
    };
    const toggle = () => options.onToggle ? options.onToggle() : (
      video.paused || video.ended ? video.play() : video.pause()
    );
    const play = button('播放', toggle, 'Play');
    const steps = el('span', 'cyle-video-frame-actions');
    if (options.showFrameSteps === false) steps.classList.add('cyle-video-fullscreen-only');
    const step = (delta) => {
      if (options.onStep) return options.onStep(delta);
      video.pause();
      const fps = Number(options.getFps?.());
      if (!(fps > 0)) return;
      return seek(video.currentTime + delta / fps);
    };
    const previous = button('上一帧', () => step(-1), 'SkipBack');
    const next = button('下一帧', () => step(1), 'SkipForward');
    steps.append(previous, next);
    const rate = createRateSelect({
      value: video.playbackRate,
      onChange: (value) => run(() => {
        if (options.onRateChange) return options.onRateChange(value);
        video.playbackRate = value;
      })
    });
    if (options.showRate === false) rate.classList.add('cyle-video-fullscreen-only');
    const mute = button('静音', () => { video.muted = !video.muted; });
    const volume = el('input', 'cyle-video-volume');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '1';
    volume.step = '0.05';
    volume.setAttribute('aria-label', '视频音量');
    listen(volume, 'input', () => {
      video.volume = Number(volume.value);
      video.muted = video.volume === 0;
    });
    const fullscreen = button('视频全屏', () => {
      if (document.fullscreenElement === target) return document.exitFullscreen();
      return target?.requestFullscreen?.();
    }, 'Maximize2');
    fullscreen.hidden = !target?.requestFullscreen;
    actions.append(play, steps, rate, mute, volume, fullscreen);
    const sync = options.onSync ? button('同步', options.onSync) : null;
    if (sync) { sync.title = '同步播放 / 暂停所有视频'; actions.insertBefore(sync, steps); }
    const loop = options.onLoop ? button('循环', () => { options.onLoop(); refresh(); }) : null;
    if (loop) { loop.title = '循环当前段'; actions.insertBefore(loop, steps); }
    if (options.referenceLayout) {
      steps.replaceChildren(previous, play, next);
      if (loop) {
        loop.classList.add('cyle-video-loop');
        const icons = globalThis.__gtmLucideIconsV1;
        if (icons?.has('RefreshCw')) loop.prepend(icons.create('RefreshCw'));
      }
      actions.prepend(steps);
    }
    const more = el('details', 'cyle-video-more');
    const menu = el('div', 'cyle-video-menu');
    more.append(el('summary', '', '更多'), menu);
    const extras = [];
    const reflow = () => {
      if (disposed || options.compact === false) return;
      if (options.immersive) { more.hidden = true; return; }
      const width = globalThis.__cyleScaleV1.logicalWidth(target);
      const compact = width < 460;
      for (const node of [sync, mute, volume, options.compactRate ? rate : null].filter(Boolean)) {
        const inMenu = options.referenceLayout ? (node === rate ? width < 300 : true) : compact;
        const parent = inMenu ? menu : actions;
        if (node.parentElement !== parent) parent.insertBefore(node, inMenu ? null : (node === sync ? (loop || steps) : more));
      }
      for (const { node, inline } of extras) {
        const parent = inline && width >= 960 ? actions : menu;
        if (node.parentElement !== parent) parent.insertBefore(node, parent === actions ? more : null);
      }
      more.hidden = !menu.childElementCount;
    };
    if (options.compact !== false) actions.insertBefore(more, fullscreen);
    const resizeObserver = options.compact !== false ? new ResizeObserver(reflow) : null;
    if (resizeObserver && target) resizeObserver.observe(target);
    cleanups.push(() => resizeObserver?.disconnect());
    element.append(seekRow, actions, status);
    // Keep media keyboard actions from also triggering the workbench shortcuts.
    listen(element, 'keydown', (event) => event.stopPropagation());
    listen(element, 'pointerdown', (event) => event.stopPropagation());
    listen(progress, 'input', () => {
      scrubbing = true;
      progress.style.setProperty('--cyle-progress', `${Math.max(0,Math.min(100,Number(progress.value)/Number(progress.max)*100 || 0))}%`);
      time.textContent = `${formatTime(progress.value)} / ${formatTime(video.duration)}`;
    });
    listen(progress, 'change', () => {
      scrubbing = false;
      run(() => seek(progress.value));
      refresh();
    });
    listen(progress, 'pointercancel', () => { scrubbing = false; refresh(); });
    function refresh() {
      if (disposed) return;
      if (loop) loop.setAttribute('aria-pressed', String(Boolean(options.isLooping?.())));
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      progress.disabled = duration <= 0;
      const canStep = Boolean(options.onStep) || Number(options.getFps?.()) > 0;
      previous.disabled = next.disabled = duration <= 0 || !canStep;
      previous.title = canStep ? '上一帧' : '未读取到 FPS，请在视频 GT 或 Chains 工作区逐帧查看';
      next.title = canStep ? '下一帧' : previous.title;
      progress.max = String(duration);
      if (!scrubbing) {
        progress.value = String(Math.min(duration, video.currentTime || 0));
        time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
      }
      progress.setAttribute('aria-valuetext', time.textContent);
      progress.style.setProperty('--cyle-progress', `${Math.max(0,Math.min(100,Number(progress.value)/duration*100 || 0))}%`);
      const label = video.paused || video.ended ? '播放' : '暂停';
      if (play.title !== label) {
        play.title = label;
        play.setAttribute('aria-label', label);
        const icons = globalThis.__gtmLucideIconsV1;
        if (icons) play.replaceChildren(icons.create(label === '播放' ? 'Play' : 'Pause'));
        else play.textContent = label;
      }
      mute.textContent = video.muted || video.volume === 0 ? '开启声音' : '静音';
      mute.title = mute.textContent;
      mute.setAttribute('aria-label', mute.textContent);
      if (options.immersive) {
        const icons = globalThis.__gtmLucideIconsV1;
        if (icons) mute.replaceChildren(icons.create(video.muted || video.volume === 0 ? 'VolumeX' : 'Volume2'));
      }
      mute.setAttribute('aria-pressed', String(video.muted));
      volume.value = String(video.muted ? 0 : video.volume);
      const rateSelect = rate.querySelector('select');
      if (![...rateSelect.options].some((option) => Number(option.value) === video.playbackRate)) {
        rateSelect.add(new Option(`${video.playbackRate}×`, String(video.playbackRate)));
      }
      rateSelect.value = String(video.playbackRate);
      const full = document.fullscreenElement === target;
      fullscreen.title = full ? '退出视频全屏' : '视频全屏';
      fullscreen.setAttribute('aria-label', fullscreen.title);
      fullscreen.setAttribute('aria-pressed', String(full));
    }
    for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'play',
      'pause', 'ended', 'ratechange', 'volumechange', 'emptied', 'seeked']) {
      listen(video, event, refresh);
    }
    if (target) listen(target, 'fullscreenchange', refresh);
    if (options.immersive && target) {
      target.classList.add('cyle-immersive-player', 'is-controls-external');
      let zoom = 1, panX = 0, panY = 0;
      const viewport = video.parentElement;
      viewport.tabIndex = 0;
      viewport.setAttribute('aria-label', '视频画面；双指捏合或 Ctrl/Command 加滚轮缩放，放大后拖动查看，Ctrl/Command 加减号缩放，Ctrl/Command 0 恢复');
      viewport.title = '点击播放 / 暂停 · 双指捏合 / Ctrl/Cmd + 滚轮缩放 · 放大后拖动 · Ctrl/Cmd + / − · Ctrl/Cmd 0 恢复';
      const geometry = () => {
        if (video.videoWidth && video.videoHeight) target.style.setProperty('--video-ratio', `${video.videoWidth} / ${video.videoHeight}`);
      };
      listen(video, 'loadedmetadata', geometry); geometry();
      steps.replaceChildren(previous, next);
      menu.append(steps);
      actions.insertBefore(rate, fullscreen);
      play.remove();
      const sound = el('div', 'cyle-video-sound');
      const volumePanel = el('div', 'cyle-video-volume-panel');
      volumePanel.append(volume); sound.append(mute, volumePanel);
      actions.insertBefore(sound, rate);
      sound.title = '音量 · 点击图标静音 / 开声';
      const releaseSoundFocus = () => {
        if (sound.contains(document.activeElement)) document.activeElement.blur();
      };
      listen(sound, 'pointerleave', event => {
        // Do not interrupt an active slider drag; release its focus on pointerup.
        if (!event.buttons) releaseSoundFocus();
      });
      listen(volume, 'pointerup', () => {
        if (!sound.matches(':hover')) releaseSoundFocus();
      });
      listen(volume, 'pointercancel', releaseSoundFocus);
      element.insertBefore(seekRow, actions);
      const transform = () => {
        const maxX = viewport.clientWidth * (zoom - 1) / 2, maxY = viewport.clientHeight * (zoom - 1) / 2;
        panX = Math.max(-maxX, Math.min(maxX, panX)); panY = Math.max(-maxY, Math.min(maxY, panY));
        video.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        viewport.style.cursor = zoom > 1 ? 'grab' : '';

      };

      transform();
      const changeZoom = value => { zoom = Math.max(1, Math.min(4, value)); transform(); };
      const wheel = event => {
        // Chromium reports trackpad pinch as a wheel event with ctrlKey.
        // Leave ordinary wheel / two-finger scrolling entirely to the page.
        if (!event.deltaY || !(event.ctrlKey || event.metaKey)) return;
        event.preventDefault(); event.stopPropagation();
        viewport.focus({ preventScroll:true });
        changeZoom(zoom * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)));
      };
      viewport.addEventListener('wheel', wheel, { passive:false });
      cleanups.push(() => viewport.removeEventListener('wheel', wheel));
      listen(viewport, 'keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || !['+', '=', '-', '0'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === '0') { panX = panY = 0; changeZoom(1); }
        else changeZoom(zoom + (event.key === '-' ? -0.25 : 0.25));
      });
      let drag = null, moved = false;
      listen(viewport, 'click', event => {
        if (moved) { moved = false; return; }
        event.stopPropagation(); run(toggle);
      });
      listen(viewport, 'keydown', event => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault(); event.stopPropagation(); run(toggle);
      });
      listen(viewport, 'pointerdown', event => {
        moved = false;
        viewport.focus({ preventScroll:true });
        if (zoom <= 1 || event.button !== 0) return;
        event.preventDefault(); viewport.setPointerCapture(event.pointerId);
        drag = { x:event.clientX, y:event.clientY, panX, panY, scale:viewport.getBoundingClientRect().width/Math.max(1,viewport.offsetWidth) };
      });
      listen(viewport, 'pointermove', event => {
        if (!drag) return;
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) moved = true;
        panX = drag.panX + (event.clientX - drag.x)/drag.scale; panY = drag.panY + (event.clientY - drag.y)/drag.scale; transform();
      });
      for (const event of ['pointerup','pointercancel','lostpointercapture']) listen(viewport, event, () => { drag = null; });
      cleanups.push(() => { video.style.transform = ''; });
    }
    const api = {
      element,
      refresh,
      addSettings: options.compact === false ? null : (node, { inline = false } = {}) => {
        extras.push({ node, inline }); menu.append(node); reflow();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        cleanups.forEach((cleanup) => cleanup());
        element.remove();
        instances.delete(video);
      }
    };
    instances.set(video, api);
    refresh();
    reflow();
    return api;
  }
  // One pointer controller for all floating workspaces. Update once per paint,
  // keep the opposite corner fixed, and persist only at the end of a gesture.
  function bindFloating({ element, header, enabled, apply, persist }) {
    let gesture = null, frame = 0, pending = null;
    const handles = ['nw', 'ne', 'sw', 'se'].map(corner => {
      const handle = el('div', `cyle-floating-resize is-${corner}`);
      handle.dataset.corner = corner; handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-label', `调整浮窗大小 ${corner}`);
      element.append(handle); return handle;
    });
    element.classList.add('cyle-floating-window');
    const geometry = () => {
      const rect = element.getBoundingClientRect();
      const scale = rect.width / Math.max(1, element.offsetWidth);
      return { left: rect.left / scale, top: rect.top / scale,
        width: rect.width / scale, height: rect.height / scale, scale,
        viewportWidth: innerWidth / scale, viewportHeight: innerHeight / scale };
    };
    const flush = () => {
      frame = 0;
      if (!gesture || !pending) return;
      const { start, corner, x, y } = gesture;
      const dx = (pending.clientX - x) / start.parentScale, dy = (pending.clientY - y) / start.parentScale;
      const gap = 8 / start.parentScale;
      let next;
      if (!corner) {
        next = { ...start, left: Math.max(gap, Math.min(start.viewportWidth - start.width - gap, start.left + dx)),
          top: Math.max(gap, Math.min(start.viewportHeight - start.height - gap, start.top + dy)) };
      } else {
        const west = corner.includes('w'), north = corner.includes('n');
        const anchorX = west ? start.left + start.width : start.left;
        const anchorY = north ? start.top + start.height : start.top;
        const maxWidth = west ? anchorX - gap : start.viewportWidth - anchorX - gap;
        const maxHeight = north ? anchorY - gap : start.viewportHeight - anchorY - gap;
        next = globalThis.__cyleScaleV1.resize(start, corner, dx, dy, { maxWidth, maxHeight });
      }
      if (Math.abs(dx) + Math.abs(dy) > 0.1) gesture.changed = true;
      pending = null; apply(next);
      globalThis.__cyleScaleV1.surface(element).apply(next);
    };
    const move = event => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      pending = event;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const finish = (event, save = true) => {
      if (!gesture || (event?.pointerId != null && event.pointerId !== gesture.pointerId)) return;
      if (event?.type === 'pointerup') pending = event;
      if (frame) cancelAnimationFrame(frame);
      flush();
      const old = gesture; gesture = null;
      element.classList.remove('is-floating-dragging', 'is-floating-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      if (old.target.hasPointerCapture?.(old.pointerId)) old.target.releasePointerCapture(old.pointerId);
      if (old.changed && save) persist?.();
    };
    const start = event => {
      if (event.button !== 0 || !enabled() || document.fullscreenElement === element) return;
      const corner = event.currentTarget.dataset.corner || '';
      if (!corner && event.target.closest('button,input,select,a,details')) return;
      finish();
      event.preventDefault(); event.stopPropagation();
      const rect = { ...geometry(), ...globalThis.__cyleScaleV1.surface(element).state };
      // Coordinate conversion belongs to the host; content scale is independent.
      rect.parentScale = geometry().scale;
      rect.scale = globalThis.__cyleScaleV1.surface(element).state.scale || 1;
      gesture = { start: rect, corner, x: event.clientX, y: event.clientY,
        pointerId: event.pointerId, target: event.currentTarget, changed: false };
      element.parentElement?.append(element);
      element.classList.add(corner ? 'is-floating-resizing' : 'is-floating-dragging');
      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      window.addEventListener('blur', finish);
    };
    header?.addEventListener('pointerdown', start);
    handles.forEach(handle => {
      handle.addEventListener('pointerdown', start);
      handle.addEventListener('lostpointercapture', finish);
    });
    header?.addEventListener('lostpointercapture', finish);
    return {
      get active() { return Boolean(gesture); },
      cancel() { finish(); },
      dispose() {
        finish(null, false);
        header?.removeEventListener('pointerdown', start);
        header?.removeEventListener('lostpointercapture', finish);
        handles.forEach(handle => handle.remove());
        element.classList.remove('cyle-floating-window');
        globalThis.__cyleScaleV1.dispose(element);
      }
    };
  }
  globalThis[KEY] = Object.freeze({
    attach, createRateSelect, rates, bindFloating,
    dispose(video) { instances.get(video)?.dispose(); }
  });
})();
