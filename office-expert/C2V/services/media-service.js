(() => {
  'use strict';

  const GLOBAL_KEY = '__annotationHarnessMediaServiceV1';
  const COMPAT_KEY = '__gtMapperMediaServiceV1';
  const CYLE_KEY = '__cyleMediaServiceV1';
  const root = globalThis.__cyleServicesV1 || (
    globalThis.__cyleServicesV1 = {}
  );
  const existing = globalThis[GLOBAL_KEY] || globalThis[CYLE_KEY] || root.media;
  if (existing) {
    globalThis[GLOBAL_KEY] = existing;
    globalThis[COMPAT_KEY] = existing;
    globalThis[CYLE_KEY] = existing;
    root.media = existing;
    root.MediaService = existing;
    return;
  }

  const DEFAULT_ASPECT_RATIO = 16 / 9;
  const MIN_SCALE = 1;
  const MAX_SCALE = 3;
  const FIT_MODES = Object.freeze(['contain', 'cover']);

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positiveNumber(value, fallback = 0) {
    const number = finiteNumber(value);
    return number > 0 ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
  }

  function round(value, precision = 6) {
    const factor = 10 ** Math.max(0, Math.min(9, precision));
    return Math.round(finiteNumber(value) * factor) / factor;
  }

  function normalizeFitMode(value) {
    return value === 'cover' ? 'cover' : 'contain';
  }

  function normalizeScale(value) {
    return round(clamp(value, MIN_SCALE, MAX_SCALE), 3);
  }

  function dimensionsOf(source) {
    const candidate = source?.media || source?.element || source?.video || source;
    const metadata = source?.metadata || candidate?.metadata || {};
    const width = positiveNumber(
      candidate?.videoWidth
      || candidate?.naturalWidth
      || source?.videoWidth
      || source?.width
      || metadata.width
      || metadata.videoWidth
    );
    const height = positiveNumber(
      candidate?.videoHeight
      || candidate?.naturalHeight
      || source?.videoHeight
      || source?.height
      || metadata.height
      || metadata.videoHeight
    );
    return {
      width,
      height,
      ratio: width > 0 && height > 0 ? width / height : 0
    };
  }

  function chooseAspectRatio(sources, options = {}) {
    const list = Array.isArray(sources)
      ? sources.filter(Boolean)
      : sources
        ? [sources]
        : [];
    const fallbackRatio = positiveNumber(
      options.fallbackRatio,
      DEFAULT_ASPECT_RATIO
    );
    const requested = options.main ?? options.mainId ?? options.mainIndex;
    let main = null;
    let sourceIndex = -1;

    if (typeof requested === 'function') {
      sourceIndex = list.findIndex((source, index) => requested(source, index));
    } else if (typeof requested === 'number' && Number.isInteger(requested)) {
      sourceIndex = requested >= 0 && requested < list.length ? requested : -1;
    } else if (requested && typeof requested === 'object') {
      sourceIndex = list.indexOf(requested);
      if (sourceIndex < 0) main = requested;
    } else if (requested !== undefined && requested !== null) {
      sourceIndex = list.findIndex((source) => (
        String(source?.id ?? source?.key ?? source?.slotId ?? '') === String(requested)
      ));
    }

    if (!main && sourceIndex >= 0) main = list[sourceIndex];
    if (!main) {
      sourceIndex = list.findIndex((source) => (
        source?.isMain === true
        || source?.isMaster === true
        || source?.main === true
        || source?.master === true
        || source?.role === 'main'
        || source?.role === 'master'
      ));
      if (sourceIndex >= 0) main = list[sourceIndex];
    }
    if (!main && list.length) {
      sourceIndex = 0;
      main = list[0];
    }

    const dimensions = dimensionsOf(main);
    const usesFallback = !(dimensions.ratio > 0);
    return Object.freeze({
      ratio: usesFallback ? fallbackRatio : dimensions.ratio,
      width: dimensions.width,
      height: dimensions.height,
      source: main || null,
      sourceIndex,
      sourceKind: usesFallback ? 'fallback-16:9' : 'main-view',
      usesFallback
    });
  }

  function calculateFit(options = {}) {
    const mediaWidth = positiveNumber(
      options.mediaWidth ?? options.width ?? dimensionsOf(options.media).width
    );
    const mediaHeight = positiveNumber(
      options.mediaHeight ?? options.height ?? dimensionsOf(options.media).height
    );
    const viewportWidth = positiveNumber(
      options.viewportWidth ?? options.containerWidth
    );
    const viewportHeight = positiveNumber(
      options.viewportHeight ?? options.containerHeight
    );
    const fit = normalizeFitMode(options.fit ?? options.objectFit);
    const scale = normalizeScale(options.scale ?? 1);
    const ratio = mediaWidth > 0 && mediaHeight > 0
      ? mediaWidth / mediaHeight
      : positiveNumber(options.aspectRatio, DEFAULT_ASPECT_RATIO);
    const safeMediaWidth = mediaWidth || ratio;
    const safeMediaHeight = mediaHeight || 1;

    if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
      return Object.freeze({
        fit,
        scale,
        viewportWidth,
        viewportHeight,
        mediaWidth,
        mediaHeight,
        aspectRatio: ratio,
        baseWidth: 0,
        baseHeight: 0,
        renderedWidth: 0,
        renderedHeight: 0,
        overflowX: 0,
        overflowY: 0,
        maxPanX: 0,
        maxPanY: 0
      });
    }

    const containFactor = Math.min(
      viewportWidth / safeMediaWidth,
      viewportHeight / safeMediaHeight
    );
    const coverFactor = Math.max(
      viewportWidth / safeMediaWidth,
      viewportHeight / safeMediaHeight
    );
    const fitFactor = fit === 'cover' ? coverFactor : containFactor;
    const baseWidth = safeMediaWidth * fitFactor;
    const baseHeight = safeMediaHeight * fitFactor;
    const renderedWidth = baseWidth * scale;
    const renderedHeight = baseHeight * scale;
    const overflowX = Math.max(0, renderedWidth - viewportWidth);
    const overflowY = Math.max(0, renderedHeight - viewportHeight);

    return Object.freeze({
      fit,
      scale,
      viewportWidth,
      viewportHeight,
      mediaWidth,
      mediaHeight,
      aspectRatio: ratio,
      fitFactor,
      baseWidth,
      baseHeight,
      renderedWidth,
      renderedHeight,
      overflowX,
      overflowY,
      maxPanX: overflowX / 2,
      maxPanY: overflowY / 2
    });
  }

  function constrainPan(options = {}) {
    const fit = calculateFit(options);
    const panX = clamp(options.panX ?? options.x ?? 0, -fit.maxPanX, fit.maxPanX);
    const panY = clamp(options.panY ?? options.y ?? 0, -fit.maxPanY, fit.maxPanY);
    return Object.freeze({
      x: round(panX, 3),
      y: round(panY, 3),
      panX: round(panX, 3),
      panY: round(panY, 3),
      maxPanX: fit.maxPanX,
      maxPanY: fit.maxPanY,
      fit
    });
  }

  function createViewState(options = {}) {
    const scale = normalizeScale(options.scale ?? 1);
    const fit = normalizeFitMode(options.fit ?? options.objectFit);
    const pan = constrainPan({ ...options, fit, scale });
    return Object.freeze({
      fit,
      scale,
      panX: scale <= 1 ? 0 : pan.panX,
      panY: scale <= 1 ? 0 : pan.panY,
      maxPanX: pan.maxPanX,
      maxPanY: pan.maxPanY,
      transform: (
        `translate3d(${scale <= 1 ? 0 : pan.panX}px, `
        + `${scale <= 1 ? 0 : pan.panY}px, 0) scale(${scale})`
      ),
      geometry: pan.fit
    });
  }

  function applyViewState(element, options = {}) {
    if (!element?.style) throw new TypeError('需要可设置 style 的媒体元素');
    const state = createViewState(options);
    element.style.objectFit = state.fit;
    element.style.transformOrigin = '50% 50%';
    element.style.transform = state.transform;
    element.style.cursor = state.scale > 1 ? 'grab' : '';
    return state;
  }

  function floatingMetrics(options = {}) {
    if (typeof options === 'number') options = { width: options };
    const width = positiveNumber(options.width ?? options.outerWidth);
    const ratio = positiveNumber(
      options.aspectRatio ?? options.ratio,
      DEFAULT_ASPECT_RATIO
    );
    const horizontalChrome = Math.max(
      0,
      finiteNumber(options.horizontalChrome ?? options.horizontalPadding)
    );
    const mediaWidth = Math.max(0, width - horizontalChrome);
    const mediaHeight = mediaWidth / ratio;
    const fixedHeight = [
      options.headerHeight,
      options.toolbarHeight,
      options.controlsHeight,
      options.footerHeight,
      options.verticalPadding,
      options.borderHeight
    ].reduce((sum, value) => sum + Math.max(0, finiteNumber(value)), 0);
    const naturalHeight = mediaHeight + fixedHeight;
    const minimum = Math.max(0, finiteNumber(options.minHeight));
    const maximum = positiveNumber(options.maxHeight, Infinity);
    const height = clamp(naturalHeight, minimum, maximum);
    return Object.freeze({
      width,
      height: round(height, 3),
      mediaWidth: round(mediaWidth, 3),
      mediaHeight: round(mediaHeight, 3),
      fixedHeight: round(fixedHeight, 3),
      aspectRatio: ratio
    });
  }

  function calculateFloatingHeight(widthOrOptions, maybeOptions = {}) {
    const options = typeof widthOrOptions === 'number'
      ? { ...maybeOptions, width: widthOrOptions }
      : widthOrOptions || {};
    return floatingMetrics(options).height;
  }

  function mediaTarget(value) {
    return value?.media || value?.element || value?.adapter || value;
  }

  function readMediaTime(target) {
    if (typeof target?.getCurrentTime === 'function') {
      return Math.max(0, finiteNumber(target.getCurrentTime()));
    }
    return Math.max(0, finiteNumber(target?.currentTime));
  }

  function readMediaDuration(target) {
    const value = typeof target?.getDuration === 'function'
      ? target.getDuration()
      : target?.duration;
    return positiveNumber(value, Infinity);
  }

  function readMediaPaused(target) {
    if (typeof target?.isPaused === 'function') return Boolean(target.isPaused());
    return target?.paused !== false;
  }

  function seekMedia(target, seconds) {
    if (typeof target?.seek === 'function') return target.seek(seconds);
    if (!target || !('currentTime' in target)) return undefined;
    target.currentTime = seconds;
    return undefined;
  }

  function playMedia(target) {
    return typeof target?.play === 'function' ? target.play() : undefined;
  }

  function pauseMedia(target) {
    return typeof target?.pause === 'function' ? target.pause() : undefined;
  }

  function createCoordinator(options = {}) {
    const entries = new Map();
    const listeners = new Set();
    const toleranceSeconds = positiveNumber(options.toleranceSeconds, 0.035);
    const configuredDuration = positiveNumber(options.durationSeconds, Infinity);
    const autoBind = options.autoBind !== false;
    let counter = 0;
    let destroyed = false;
    let operation = 0;
    let masterId = '';
    let globalTime = Math.max(0, finiteNumber(options.initialTime));
    let playing = false;
    let playbackRange = null;
    let generation = 0;
    let guardTimer = null;
    let guardGeneration = 0;
    const frameRequests = new Map();
    const pendingSeeks = new Set();

    function assertActive() {
      if (destroyed) throw new Error('媒体协调器已销毁');
    }

    function snapshot(reason = 'snapshot', sourceId = '') {
      return Object.freeze({
        reason,
        sourceId,
        currentTime: globalTime,
        playing,
        masterId,
        playbackRange: playbackRange ? Object.freeze({ ...playbackRange }) : null,
        media: Object.freeze([...entries.values()].map((entry) => Object.freeze({
          id: entry.id,
          offsetSeconds: entry.offsetSeconds,
          enabled: entry.enabled,
          currentTime: readMediaTime(entry.target),
          paused: readMediaPaused(entry.target),
          duration: readMediaDuration(entry.target)
        })))
      });
    }

    function emit(reason, sourceId = '') {
      const state = snapshot(reason, sourceId);
      listeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          globalThis.console?.error?.('Media Service subscriber failed', error);
        }
      });
      options.onStateChange?.(state);
      return state;
    }

    function groupDuration() {
      if (Number.isFinite(configuredDuration)) return configuredDuration;
      const master = entries.get(masterId);
      if (master) {
        const duration = readMediaDuration(master.target) - master.offsetSeconds;
        if (Number.isFinite(duration)) return Math.max(0, duration);
      }
      const durations = [...entries.values()].map((entry) => (
        readMediaDuration(entry.target) - entry.offsetSeconds
      )).filter(Number.isFinite);
      return durations.length ? Math.max(0, ...durations) : Infinity;
    }

    function clampGlobalTime(value) {
      return clamp(value, 0, groupDuration());
    }

    function localTime(entry, value = globalTime) {
      return clamp(
        value + entry.offsetSeconds,
        0,
        readMediaDuration(entry.target)
      );
    }

    function suppress(entry, milliseconds = 160) {
      entry.suppressUntil = Date.now() + milliseconds;
    }

    function isSuppressed(entry) {
      return Date.now() <= entry.suppressUntil || operation > 0;
    }

    async function run(action) {
      operation += 1;
      try {
        return await action();
      } finally {
        operation -= 1;
      }
    }

    function cancelGuard() {
      guardGeneration += 1;
      clearTimeout(guardTimer);
      guardTimer = null;
      frameRequests.forEach((id, target) => target.cancelVideoFrameCallback?.(id));
      frameRequests.clear();
    }

    function invalidatePlayback() {
      generation += 1;
      cancelGuard();
      [...pendingSeeks].forEach((cancel) => cancel());
      return generation;
    }

    function pauseTargets() {
      playing = false;
      const tasks = [];
      entries.forEach((entry) => {
        if (!entry.enabled) return;
        suppress(entry);
        // Pause immediately: a microtask or a queued command can cross a frame boundary.
        try { tasks.push(Promise.resolve(pauseMedia(entry.target))); }
        catch (error) { tasks.push(Promise.reject(error)); }
      });
      return Promise.allSettled(tasks);
    }

    function safeRangeEnd(entry) {
      const target = entry.target;
      const timebase = target.cyleTimebase || target.timebase || {};
      const fps = positiveNumber(timebase.fps || target.fps, 30);
      const end = localTime(entry, playbackRange.end);
      const start = localTime(entry, playbackRange.start);
      const model = globalThis.__gtMapperGtTimeModelV1;
      let safe = (Math.ceil(end * fps - 1e-7) - 1) / fps;
      let frameDuration = 1 / fps;
      if (timebase.frameTiming && model?.usToFrame && model?.frameToUs) {
        let frame = model.usToFrame(Math.round(end * 1e6), timebase);
        let frameTime = model.frameToUs(frame, timebase) / 1e6;
        while (frame > 0 && frameTime >= end - 1e-7) {
          frameTime = model.frameToUs(--frame, timebase) / 1e6;
        }
        if (Number.isFinite(frameTime)) {
          safe = frameTime;
          frameDuration = positiveNumber(model.frameToUs(frame + 1, timebase) / 1e6 - safe, frameDuration);
        }
      }
      return { time: Math.max(start, Math.min(end - 1e-7, safe)), frameDuration };
    }

    function ownsRangeBoundary(entry) {
      if (!entry.enabled || !playbackRange) return false;
      const localEnd = playbackRange.end + entry.offsetSeconds;
      // A shorter follower may finish naturally while the master still has content.
      return localEnd > 0 && localEnd <= readMediaDuration(entry.target) + 1e-7;
    }

    function rangeGuardLead(entry, endpoint) {
      // At high speed one compositor update can skip several source frames.
      // Reserve display/scheduler time, then seek the exact final in-range frame.
      const budget = Math.max(endpoint.frameDuration, 0.035 * positiveNumber(entry.target.playbackRate, 1));
      const playableSpan = Math.max(0, endpoint.time - localTime(entry, playbackRange.start));
      return Math.min(budget, playableSpan / 2);
    }

    function stopAtRangeEnd(token) {
      if (token !== generation || !playbackRange || playbackRange.stopped || destroyed) return false;
      const terminalTimes = [...entries.values()].filter((entry) => entry.enabled)
        .map((entry) => ({ entry, time: safeRangeEnd(entry).time }));
      playbackRange.stopped = true;
      invalidatePlayback();
      pauseTargets();
      const master = terminalTimes.find(({ entry }) => entry.id === masterId) || terminalTimes[0];
      globalTime = master ? Math.max(playbackRange.start, master.time - master.entry.offsetSeconds) : playbackRange.start;
      terminalTimes.forEach(({ entry, time }) => {
        suppress(entry);
        // Keep the last frame inside the selected half-open interval on screen.
        try { Promise.resolve(seekMedia(entry.target, time)).catch(() => {}); } catch (_) { /* detached media */ }
      });
      emit('range-end');
      return true;
    }

    function checkRangeBoundary(token, frameEntry, frameTime) {
      if (token !== generation || !playbackRange || !playing || destroyed) return false;
      for (const entry of entries.values()) {
        if (!ownsRangeBoundary(entry) || readMediaPaused(entry.target)) continue;
        const endpoint = safeRangeEnd(entry);
        const lead = rangeGuardLead(entry, endpoint);
        const time = frameEntry === entry ? Math.max(readMediaTime(entry.target), frameTime) : readMediaTime(entry.target);
        if (time >= endpoint.time - lead) return stopAtRangeEnd(token);
      }
      return false;
    }

    function armRangeGuard(token = generation) {
      cancelGuard();
      if (!playbackRange || !playing || destroyed || token !== generation) return;
      const guardToken = guardGeneration;
      const valid = () => token === generation && guardToken === guardGeneration && playing && playbackRange && !destroyed;
      const tick = () => {
        if (!valid() || checkRangeBoundary(token)) return;
        let delay = 20;
        entries.forEach((entry) => {
          if (!ownsRangeBoundary(entry) || readMediaPaused(entry.target)) return;
          const endpoint = safeRangeEnd(entry);
          const rate = positiveNumber(entry.target.playbackRate, 1);
          delay = Math.min(delay, (endpoint.time - rangeGuardLead(entry, endpoint) - readMediaTime(entry.target)) / rate * 1000);
        });
        guardTimer = setTimeout(tick, Math.max(1, delay));
      };
      entries.forEach((entry) => {
        const target = entry.target;
        if (!ownsRangeBoundary(entry) || typeof target.requestVideoFrameCallback !== 'function') return;
        const frame = (_now, metadata) => {
          frameRequests.delete(target);
          if (!valid() || checkRangeBoundary(token, entry, finiteNumber(metadata?.mediaTime))) return;
          frameRequests.set(target, target.requestVideoFrameCallback(frame));
        };
        frameRequests.set(target, target.requestVideoFrameCallback(frame));
      });
      tick();
    }

    function seekEntry(entry, seconds, token, waitForSeek) {
      const target = entry.target;
      suppress(entry);
      if (!waitForSeek || typeof target.addEventListener !== 'function' || !('seeking' in target)) {
        try { return Promise.resolve(seekMedia(target, seconds)).then(() => token === generation); }
        catch (error) { return Promise.reject(error); }
      }
      return new Promise((resolve) => {
        let timer;
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          target.removeEventListener('seeked', onSeeked);
          target.removeEventListener('error', onError);
          pendingSeeks.delete(cancel);
          resolve(ok && token === generation);
        };
        const onSeeked = () => { if (!target.seeking && Math.abs(readMediaTime(target) - seconds) < 0.002) finish(true); };
        const onError = () => finish(false);
        const cancel = () => finish(false);
        pendingSeeks.add(cancel);
        target.addEventListener('seeked', onSeeked);
        target.addEventListener('error', onError);
        timer = setTimeout(() => finish(false), positiveNumber(options.seekTimeoutMs, 3000));
        try {
          Promise.resolve(seekMedia(target, seconds)).catch(onError);
          onSeeked();
        } catch (_) { finish(false); }
      });
    }

    async function seekTargets(value, seekOptions, token) {
      const tasks = [];
      const results = await run(async () => {
        entries.forEach((entry) => {
          if (!entry.enabled || entry.id === seekOptions.sourceId) return;
          const target = localTime(entry, value);
          if (entry.target.seeking || seekOptions.force !== false || Math.abs(readMediaTime(entry.target) - target) > toleranceSeconds) {
            tasks.push(seekEntry(entry, target, token, seekOptions.waitForSeek));
          }
        });
        return Promise.allSettled(tasks);
      });
      return token === generation && results.every((result) => result.status === 'fulfilled' && result.value !== false);
    }

    function clearRange(clearOptions = {}) {
      assertActive();
      invalidatePlayback();
      playbackRange = null;
      if (clearOptions.pause) pauseTargets();
      return emit('range-clear');
    }

    function reachedMediaEnd(entry) {
      const duration = readMediaDuration(entry.target);
      return entry.target.ended === true || (Number.isFinite(duration)
        && readMediaTime(entry.target) >= duration - 1e-7);
    }

    function finishContinuous(entry) {
      if (!playing || playbackRange || !entry.enabled || entry.id !== masterId) return;
      globalTime = clampGlobalTime(readMediaTime(entry.target) - entry.offsetSeconds);
      invalidatePlayback();
      pauseTargets();
      emit('ended', entry.id);
    }

    function bindEntry(entry) {
      const target = entry.target;
      if (!autoBind || entry.autoBind === false || typeof target?.addEventListener !== 'function') return;
      const onPlay = () => {
        if (entry.enabled && !isSuppressed(entry)) api.playContinuous(entry.id);
      };
      const onPause = () => {
        if (!entry.enabled || !playing) return;
        // Native playback sends pause before ended. A shorter follower finishing
        // naturally must not pause the master or erase its remaining content.
        if (reachedMediaEnd(entry)) {
          if (!playbackRange) finishContinuous(entry);
          return;
        }
        if (!isSuppressed(entry)) api.pause(entry.id);
      };
      const onSeeking = () => {
        if (!isSuppressed(entry)) {
          api.seek(readMediaTime(target) - entry.offsetSeconds, {
            sourceId: entry.id
          });
        }
      };
      const onTimeUpdate = () => {
        if (checkRangeBoundary(generation)) return;
        if (
          !isSuppressed(entry)
          && playing
          && (!masterId || entry.id === masterId)
        ) {
          api.syncFrom(entry.id);
        }
      };
      const onRateChange = () => armRangeGuard();
      const onEnded = () => {
        if (!entry.enabled || !playing) return;
        if (ownsRangeBoundary(entry)) stopAtRangeEnd(generation);
        else finishContinuous(entry);
      };
      const bindings = [
        ['play', onPlay],
        ['pause', onPause],
        ['seeking', onSeeking],
        ['timeupdate', onTimeUpdate],
        ['ratechange', onRateChange],
        ['cyle-metadata', onRateChange],
        ['ended', onEnded]
      ];
      bindings.forEach(([type, listener]) => target.addEventListener(type, listener));
      entry.unbind = () => {
        bindings.forEach(([type, listener]) => target.removeEventListener(type, listener));
      };
    }

    function add(value, entryOptions = {}) {
      assertActive();
      const target = mediaTarget(value);
      if (!target) throw new TypeError('媒体条目缺少 element/media/adapter');
      const id = String(
        entryOptions.id
        ?? value?.id
        ?? `media-${++counter}`
      );
      if (!id) throw new TypeError('媒体条目 id 不能为空');
      if (entries.has(id)) remove(id);
      const entry = {
        id,
        target,
        offsetSeconds: finiteNumber(
          entryOptions.offsetSeconds ?? value?.offsetSeconds
        ),
        enabled: (entryOptions.enabled ?? value?.enabled) !== false,
        autoBind: entryOptions.autoBind !== false,
        suppressUntil: 0,
        unbind: null
      };
      entries.set(id, entry);
      if (!masterId || entryOptions.master === true || value?.master === true) {
        if (masterId && masterId !== id && playbackRange) clearRange({ pause: true });
        masterId = id;
      }
      bindEntry(entry);
      if (playbackRange && playing) armRangeGuard();
      emit('add', id);
      return id;
    }

    function remove(id) {
      const key = String(id);
      const entry = entries.get(key);
      if (!entry) return false;
      if (playbackRange) clearRange({ pause: true });
      entry.unbind?.();
      entries.delete(key);
      if (masterId === key) masterId = entries.keys().next().value || '';
      emit('remove', key);
      return true;
    }

    async function seek(value, seekOptions = {}) {
      assertActive();
      const sourceId = String(seekOptions.sourceId || '');
      const token = invalidatePlayback();
      const nextTime = clampGlobalTime(value);
      if (playbackRange && (nextTime < playbackRange.start || nextTime >= playbackRange.end)) playbackRange = null;
      else if (playbackRange) playbackRange.stopped = false;
      globalTime = nextTime;
      await seekTargets(nextTime, { ...seekOptions, sourceId, waitForSeek: Boolean(playbackRange) }, token);
      if (token !== generation || destroyed) return globalTime;
      if (playing && playbackRange) armRangeGuard(token);
      emit('seek', sourceId);
      return globalTime;
    }

    async function play(sourceId = '', restartRange = false, playOptions = {}) {
      assertActive();
      const token = invalidatePlayback();
      const source = entries.get(String(sourceId));
      if (source) {
        globalTime = clampGlobalTime(
          readMediaTime(source.target) - source.offsetSeconds
        );
      }
      if (playbackRange) {
        const master = entries.get(masterId);
        const safeEnd = master ? safeRangeEnd(master).time - master.offsetSeconds : playbackRange.end;
        if (restartRange || playbackRange.stopped || globalTime < playbackRange.start || globalTime >= safeEnd - 0.004) {
          globalTime = playbackRange.start;
        }
        playbackRange.stopped = false;
      }
      if (playbackRange) pauseTargets();
      const ready = await seekTargets(globalTime, {
        sourceId: playbackRange || source?.target.seeking ? '' : source?.id || '',
        force: playOptions.continuous !== true,
        waitForSeek: Boolean(playbackRange) || playOptions.continuous === true
      }, token);
      if (token !== generation || destroyed) return snapshot('play-cancelled');
      if (!ready) return emit('seek-failed', source?.id || '');
      playing = true;
      const tasks = [];
      await run(async () => {
        entries.forEach((entry) => {
          if (!entry.enabled) return;
          if (playbackRange && playbackRange.start + entry.offsetSeconds >= readMediaDuration(entry.target)) return;
          if (entry.id !== masterId && localTime(entry) >= readMediaDuration(entry.target)) return;
          suppress(entry);
          try { tasks.push(Promise.resolve(playMedia(entry.target))); }
          catch (error) { tasks.push(Promise.reject(error)); }
        });
        armRangeGuard(token);
        await Promise.allSettled(tasks);
      });
      if (token !== generation || destroyed) return snapshot('play-cancelled');
      if (entries.size && [...entries.values()].filter((entry) => entry.enabled).every((entry) => readMediaPaused(entry.target))) {
        playing = false;
        cancelGuard();
      }
      return emit('play', source?.id || '');
    }

    function playContinuous(sourceId = '') {
      assertActive();
      // Read the actual playhead rather than the last timeupdate snapshot.
      // Clearing the old guard must never restart its selected interval.
      playbackRange = null;
      return play(sourceId || masterId, false, { continuous: true });
    }

    function playRange(range) {
      assertActive();
      const start = Number(range?.start);
      const end = Number(range?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        throw new RangeError('子任务播放范围必须包含有效的开始和结束时间');
      }
      const boundedEnd = clampGlobalTime(end);
      if (boundedEnd <= start) throw new RangeError('子任务播放范围超出视频时长');
      playbackRange = { start, end: boundedEnd, stopped: false };
      return play('', true);
    }

    async function pause(sourceId = '') {
      assertActive();
      const token = invalidatePlayback();
      const source = entries.get(String(sourceId || masterId));
      if (source) {
        globalTime = clampGlobalTime(
          readMediaTime(source.target) - source.offsetSeconds
        );
      }
      await pauseTargets();
      return token === generation && !destroyed ? emit('pause', source?.id || '') : snapshot('pause-cancelled');
    }

    async function syncFrom(id, syncOptions = {}) {
      assertActive();
      const source = entries.get(String(id || masterId));
      if (!source || !source.enabled) return snapshot('sync-skipped', String(id));
      if (checkRangeBoundary(generation)) return snapshot('range-end', source.id);
      const token = generation;
      globalTime = clampGlobalTime(
        readMediaTime(source.target) - source.offsetSeconds
      );
      const tasks = [];
      await run(async () => {
        entries.forEach((entry) => {
          if (!entry.enabled || entry === source) return;
          const target = localTime(entry);
          if (
            syncOptions.force === true
            || Math.abs(readMediaTime(entry.target) - target) > toleranceSeconds
          ) {
            suppress(entry);
            tasks.push(Promise.resolve().then(() => {
              if (token === generation && !destroyed) return seekMedia(entry.target, target);
              return undefined;
            }));
          }
        });
        await Promise.allSettled(tasks);
      });
      return token === generation && !destroyed ? emit('sync', source.id) : snapshot('sync-cancelled', source.id);
    }

    const api = Object.freeze({
      add,
      register: add,
      remove,
      unregister: remove,
      has: (id) => entries.has(String(id)),
      ids: () => [...entries.keys()],
      setMaster(id) {
        assertActive();
        const key = String(id);
        if (!entries.has(key)) throw new Error(`未注册媒体：${key}`);
        if (masterId !== key && playbackRange) clearRange({ pause: true });
        masterId = key;
        return emit('master', key);
      },
      setOffset(id, seconds) {
        assertActive();
        const entry = entries.get(String(id));
        if (!entry) throw new Error(`未注册媒体：${id}`);
        if (playbackRange) clearRange({ pause: true });
        entry.offsetSeconds = finiteNumber(seconds);
        emit('offset', entry.id);
        return entry.offsetSeconds;
      },
      setEnabled(id, enabled) {
        assertActive();
        const entry = entries.get(String(id));
        if (!entry) throw new Error(`未注册媒体：${id}`);
        if (playbackRange && entry.enabled !== Boolean(enabled)) clearRange({ pause: true });
        entry.enabled = Boolean(enabled);
        emit('enabled', entry.id);
        return entry.enabled;
      },
      play,
      playContinuous,
      playRange,
      clearRange,
      pause,
      async toggle(sourceId = '') {
        return playing ? pause(sourceId) : play(sourceId);
      },
      async toggleContinuous(sourceId = '') {
        return playing ? pause(sourceId) : playContinuous(sourceId);
      },
      seek,
      syncFrom,
      sync: () => syncFrom(masterId),
      getState: () => snapshot(),
      get currentTime() {
        return globalTime;
      },
      get playing() {
        return playing;
      },
      subscribe(listener, subscribeOptions = {}) {
        if (typeof listener !== 'function') {
          throw new TypeError('订阅者必须是函数');
        }
        listeners.add(listener);
        if (subscribeOptions.emitCurrent !== false) listener(snapshot());
        return () => listeners.delete(listener);
      },
      destroy() {
        if (destroyed) return;
        invalidatePlayback();
        pauseTargets();
        playbackRange = null;
        entries.forEach((entry) => entry.unbind?.());
        entries.clear();
        listeners.clear();
        destroyed = true;
        playing = false;
      }
    });

    (options.media || options.items || []).forEach((item) => add(item, item));
    if (options.masterId && entries.has(String(options.masterId))) {
      masterId = String(options.masterId);
    }
    return api;
  }

  function sourceUrl(source) {
    if (typeof source === 'string') return source.trim();
    return String(
      source?.url
      || source?.currentSrc
      || source?.src
      || source?.downloadUrl
      || source?.metadata?.url
      || source?.attachments?.[0]?.url
      || ''
    ).trim();
  }

  function embeddedMetadata(source) {
    const candidate = source?.media || source?.element || source?.video || source || {};
    const metadata = source?.metadata || candidate?.metadata || {};
    const dimensions = dimensionsOf(source);
    const fps = positiveNumber(
      source?.fps
      || candidate?.fps
      || metadata.fps
      || source?.attachments?.[0]?.fps
    );
    const durationSeconds = positiveNumber(
      source?.durationSeconds
      || candidate?.duration
      || metadata.durationSeconds
      || metadata.duration
    );
    const totalFrames = Math.max(
      0,
      Math.round(finiteNumber(
        source?.totalFrames
        || candidate?.totalFrames
        || metadata.totalFrames
        || (fps > 0 && durationSeconds > 0 ? fps * durationSeconds : 0)
      ))
    );
    return {
      url: sourceUrl(source),
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: dimensions.ratio || 0,
      fps,
      durationSeconds,
      totalFrames,
      frameTiming: source?.frameTiming || metadata.frameTiming || null
    };
  }

  function sendRuntimeMessage(message, messenger) {
    if (typeof messenger === 'function') {
      return Promise.resolve().then(() => messenger(message));
    }
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.sendMessage) {
      return Promise.reject(new Error('当前环境没有 chrome.runtime.sendMessage'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      try {
        const possiblePromise = runtime.sendMessage(message, (response) => {
          const lastError = runtime.lastError;
          if (lastError) {
            finish(reject, new Error(lastError.message));
          } else {
            finish(resolve, response);
          }
        });
        if (possiblePromise?.then) {
          possiblePromise.then(
            (response) => finish(resolve, response),
            (error) => finish(reject, error)
          );
        }
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  function withTimeout(promise, milliseconds) {
    const timeout = positiveNumber(milliseconds, 12000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`媒体元数据请求超时（${timeout}ms）`)),
        timeout
      );
      Promise.resolve(promise).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function adaptMetadataResponse(response, base = {}) {
    const payload = response?.metadata || response?.data || response || {};
    const fps = positiveNumber(payload.fps, positiveNumber(base.fps));
    const durationSeconds = positiveNumber(
      payload.durationSeconds ?? payload.duration,
      positiveNumber(base.durationSeconds)
    );
    const totalFrames = Math.max(
      0,
      Math.round(finiteNumber(
        payload.totalFrames,
        base.totalFrames || (fps > 0 && durationSeconds > 0
          ? fps * durationSeconds
          : 0)
      ))
    );
    const width = positiveNumber(
      payload.width ?? payload.videoWidth,
      positiveNumber(base.width)
    );
    const height = positiveNumber(
      payload.height ?? payload.videoHeight,
      positiveNumber(base.height)
    );
    const ok = response?.ok !== false && (
      fps > 0
      || durationSeconds > 0
      || width > 0
      || height > 0
      || Boolean(payload.frameTiming || base.frameTiming)
    );
    return Object.freeze({
      ok,
      url: String(payload.url || base.url || ''),
      fps,
      durationSeconds,
      totalFrames,
      width,
      height,
      aspectRatio: width > 0 && height > 0
        ? width / height
        : positiveNumber(base.aspectRatio),
      frameTiming: payload.frameTiming || base.frameTiming || null,
      source: response?.ok === false ? 'embedded' : 'detector',
      error: response?.ok === false
        ? String(response.error || '未读取到媒体元数据')
        : ''
    });
  }

  async function requestMetadata(source, options = {}) {
    const base = embeddedMetadata(source);
    const url = options.url || base.url;
    const needsDetector = options.force === true || !(
      base.fps > 0
      && base.durationSeconds > 0
      && base.totalFrames > 0
    );
    if (
      options.detectFps === false
      || !needsDetector
      || !/^https?:\/\//i.test(url)
    ) {
      return adaptMetadataResponse({ ok: true, ...base }, base);
    }
    try {
      const response = await withTimeout(
        sendRuntimeMessage({
          type: options.messageType || 'DETECT_VIDEO_FPS',
          payload: { url }
        }, options.sendMessage || options.messenger),
        options.timeoutMs
      );
      return adaptMetadataResponse(response, { ...base, url });
    } catch (error) {
      const fallback = adaptMetadataResponse(
        { ok: false, error: error?.message || String(error) },
        { ...base, url }
      );
      if (options.throwOnError && !fallback.ok) throw error;
      return fallback;
    }
  }

  // One playback owner for public materials. Tool lifecycles never own its videos.
  const workspace = { enabled: false, coordinator: createCoordinator(), timebases: new Map() };
  const service = Object.freeze({
    workspace,
    version: 1,
    constants: Object.freeze({
      DEFAULT_ASPECT_RATIO,
      MIN_SCALE,
      MAX_SCALE,
      FIT_MODES
    }),
    dimensionsOf,
    chooseAspectRatio,
    resolveAspectRatio: chooseAspectRatio,
    normalizeFitMode,
    normalizeScale,
    calculateFit,
    constrainPan,
    createViewState,
    applyViewState,
    floatingMetrics,
    calculateFloatingHeight,
    createCoordinator,
    createSyncGroup: createCoordinator,
    embeddedMetadata,
    adaptMetadataResponse,
    sendRuntimeMessage,
    requestMetadata,
    requestFpsMetadata: requestMetadata
  });

  globalThis[GLOBAL_KEY] = service;
  globalThis[COMPAT_KEY] = service;
  globalThis[CYLE_KEY] = service;
  root.media = service;
  root.MediaService = service;
})();
