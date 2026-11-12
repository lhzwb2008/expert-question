(function () {
  'use strict';

  const CONTROLLER_KEY = '__gtMapperNativeVideoControllerV1';
  const VIDEO_MARKER = 'gtMapperNativeVideo';
  const BIG_STEP_FRAMES = 15;
  const DEFAULT_FPS = 30;
  const FPS_SAMPLE_TARGET = 20;
  const FPS_SAMPLE_LIMIT = 90;
  const MAX_INTERVAL_SPREAD = 0.08;
  const MIN_FPS = 1;
  const MAX_FPS = 240;
  const INTERVAL_END_TOLERANCE = 0.008;
  const INTERVAL_GUARD_DELAY = 25;
  const COMMON_FRAME_RATES = Object.freeze([
    24000 / 1001,
    24,
    25,
    30000 / 1001,
    30,
    48,
    50,
    60000 / 1001,
    60,
    120000 / 1001,
    120
  ]);

  if (globalThis[CONTROLLER_KEY]) return;

  let session = null;
  let activeRecord = null;
  let scanScheduled = false;
  let activationBarrier = Promise.resolve();
  const records = new Map();
  const timingTickCache = new WeakMap();
  let playerSequence = 0;

  function isVisible(element) {
    if (!element?.isConnected) return false;
    if (element.closest?.('#gtm-sheet-inspector-root')) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 80
      && rect.height > 45
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0
    );
  }

  function visibleArea(video) {
    if (!isVisible(video)) return 0;
    const rect = video.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function formatFrame(frame, fps) {
    const rate = Math.max(1, Math.round(fps));
    const index = Math.max(0, Math.round(frame));
    const hours = Math.floor(index / (rate * 3600));
    const minutes = Math.floor((index % (rate * 3600)) / (rate * 60));
    const seconds = Math.floor((index % (rate * 60)) / rate);
    const secondFrame = (index % rate) + 1;
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(secondFrame)}`;
  }

  function displayFps(fps) {
    return Math.round(Number(fps) * 1000) / 1000;
  }

  function percentile(sorted, ratio) {
    if (!sorted.length) return NaN;
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.round((sorted.length - 1) * ratio))
    );
    return sorted[index];
  }

  function normalizeDetectedFps(value) {
    const fps = Number(value);
    if (!(fps >= MIN_FPS && fps <= MAX_FPS)) return 0;
    const nearest = COMMON_FRAME_RATES.reduce((best, candidate) => (
      Math.abs(candidate - fps) < Math.abs(best - fps) ? candidate : best
    ), COMMON_FRAME_RATES[0]);
    const normalized = Math.abs(nearest - fps) / nearest <= 0.004
      ? nearest
      : fps;
    return displayFps(normalized);
  }

  function frameRateEstimate(deltas) {
    const sorted = deltas
      .filter((delta) => Number.isFinite(delta) && delta > 0 && delta < 1)
      .sort((left, right) => left - right);
    if (!sorted.length) {
      return { fps: 0, stable: false, spread: Infinity };
    }
    const median = percentile(sorted, 0.5);
    const low = percentile(sorted, 0.1);
    const high = percentile(sorted, 0.9);
    const spread = median > 0 ? (high - low) / median : Infinity;
    return {
      fps: normalizeDetectedFps(1 / median),
      stable: sorted.length >= FPS_SAMPLE_TARGET
        && Number.isFinite(spread)
        && spread <= MAX_INTERVAL_SPREAD,
      spread
    };
  }

  function videoSource(video) {
    return String(video?.currentSrc || video?.src || '');
  }

  function comparableUrl(value) {
    const source = String(value || '');
    if (!source) return { raw: '', path: '' };
    try {
      const url = new URL(source, location.href);
      return {
        raw: url.href,
        path: `${url.origin}${url.pathname}`
      };
    } catch (_error) {
      return { raw: source, path: source.split(/[?#]/, 1)[0] };
    }
  }

  function sourceMatchesSession(video, targetSession = session) {
    if (!video || !targetSession || targetSession.auto) return false;
    const source = comparableUrl(videoSource(video));
    const expected = comparableUrl(targetSession.url);
    if (
      expected.raw
      && (
        source.raw === expected.raw
        || source.path === expected.path
      )
    ) return true;
    const token = String(targetSession.fileToken || '').trim();
    return Boolean(token && source.raw.includes(token));
  }

  function resetRecordForSource(record, source = videoSource(record?.video)) {
    if (!record || record.sourceSignature === source) return false;
    cancelIntervalPlayback(record, true);
    record.sourceSignature = source;
    record.fps = 0;
    record.estimatedFps = DEFAULT_FPS;
    record.fpsSource = 'unknown';
    record.totalFrames = 0;
    record.frameTiming = null;
    record.fpsLocked = false;
    record.frameDeltas.length = 0;
    record.lastMediaTime = null;
    record.intendedFrame = null;
    record.lastPublishedFrame = null;
    record.lastPublishedAt = 0;
    return true;
  }

  function trustedFps(record) {
    const fps = Number(record?.fps) || 0;
    return record?.fpsLocked && fps >= MIN_FPS && fps <= MAX_FPS
      ? fps
      : 0;
  }

  function estimatedFps(record) {
    const fps = Number(record?.estimatedFps) || 0;
    return fps >= MIN_FPS && fps <= MAX_FPS ? fps : DEFAULT_FPS;
  }

  function shouldTrustProvidedFps(payload, rawFps) {
    if (!(rawFps >= MIN_FPS && rawFps <= MAX_FPS)) return false;
    if (payload?.fpsLocked === true) return true;
    if (payload?.fpsLocked === false) return false;
    if (payload?.frameTiming) return true;
    // Legacy callers did not label confidence. Their fallback is exactly 30,
    // so keep that ambiguous value as an estimate while accepting other
    // legacy values as measured/configured FPS.
    return Math.abs(rawFps - DEFAULT_FPS) > 1e-9;
  }

  function totalFrames(record) {
    if (Number.isInteger(record.totalFrames) && record.totalFrames > 0) {
      return record.totalFrames;
    }
    const timingFrames = timingTotalFrames(record.frameTiming);
    if (timingFrames > 0) return timingFrames;
    const fps = trustedFps(record);
    if (
      Number.isFinite(record.video.duration)
      && record.video.duration > 0
      && fps > 0
    ) {
      return Math.max(1, Math.round(record.video.duration * fps));
    }
    return 0;
  }

  function timingTotalFrames(timing) {
    if (
      !Number.isFinite(Number(timing?.timescale))
      || Number(timing.timescale) <= 0
      || !Array.isArray(timing?.runs)
    ) return 0;
    return Math.max(0, Math.round(Number(timing.totalFrames) || 0));
  }

  function timingTicks(timing) {
    const total = timingTotalFrames(timing);
    if (!total) return null;
    const cached = timingTickCache.get(timing);
    if (cached) return cached;
    const decodeTicks = [];
    let tick = 0;
    for (const run of timing.runs) {
      const count = Math.max(0, Math.round(Number(run.count) || 0));
      const delta = Math.max(0, Number(run.delta) || 0);
      for (let index = 0; index < count && decodeTicks.length < total; index += 1) {
        decodeTicks.push(tick);
        tick += delta;
      }
    }
    const offsets = [];
    for (const run of timing.compositionRuns || []) {
      const count = Math.max(0, Math.round(Number(run.count) || 0));
      const offset = Number(run.offset) || 0;
      for (let index = 0; index < count && offsets.length < total; index += 1) {
        offsets.push(offset);
      }
    }
    const presentationTicks = decodeTicks.map(
      (decodeTick, index) => decodeTick + (offsets[index] || 0)
    );
    if (offsets.length) presentationTicks.sort((left, right) => left - right);
    const origin = presentationTicks[0] || 0;
    const normalized = presentationTicks.map((value) => value - origin);
    timingTickCache.set(timing, normalized);
    return normalized;
  }

  function frameTime(record, frame) {
    const timing = record.frameTiming;
    const ticks = timingTicks(timing);
    if (!ticks?.length) {
      return Math.max(0, Number(frame) || 0) / trustedFps(record);
    }
    const target = Math.min(
      ticks.length - 1,
      Math.max(0, Math.round(Number(frame) || 0))
    );
    return ticks[target] / Number(timing.timescale);
  }

  function mediaFrame(record, mediaTime) {
    const timing = record.frameTiming;
    const ticks = timingTicks(timing);
    if (!ticks?.length) {
      return Math.max(
        0,
        Math.round((Number(mediaTime) || 0) * trustedFps(record))
      );
    }
    const targetTicks = Math.max(0, Number(mediaTime) || 0)
      * Number(timing.timescale);
    let low = 0;
    let high = ticks.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (ticks[middle] < targetTicks) low = middle + 1;
      else high = middle;
    }
    if (low === 0) return 0;
    const previous = low - 1;
    return Math.abs(ticks[low] - targetTicks)
      < Math.abs(targetTicks - ticks[previous])
      ? low
      : previous;
  }

  function currentFrame(record, mediaTime = record.video.currentTime) {
    if (!trustedFps(record) && !timingTotalFrames(record.frameTiming)) return null;
    return mediaFrame(record, mediaTime);
  }

  function estimatedFrame(record, mediaTime = record.video.currentTime) {
    return Math.max(
      0,
      Math.round((Number(mediaTime) || 0) * estimatedFps(record))
    );
  }

  function cancelIntervalPlayback(record, pause = false, { notify = true } = {}) {
    if (!record) return false;
    const interval = record.intervalPlayback;
    const shouldNotify = Boolean(
      interval
      && !interval.ended
      && !interval.error
      && notify
    );
    if (record.intervalGuardTimer !== null) {
      clearTimeout(record.intervalGuardTimer);
      record.intervalGuardTimer = null;
    }
    record.intervalPlayback = null;
    record.playbackCommandGeneration += 1;
    if (pause && interval && !record.video.paused) record.video.pause();
    if (shouldNotify) {
      publish(record, 'interval-cancelled', undefined, interval, {
        intervalCancelled: true
      });
    }
    return Boolean(interval);
  }

  function failIntervalPlayback(record, interval, error) {
    if (record.intervalPlayback !== interval || interval.ended || interval.error) return;
    if (record.intervalGuardTimer !== null) {
      clearTimeout(record.intervalGuardTimer);
      record.intervalGuardTimer = null;
    }
    interval.error = error;
    record.video.pause();
    render(record);
    publish(record, 'interval-error');
  }

  function enforceIntervalPlayback(record, mediaTime = record.video.currentTime) {
    const interval = record.intervalPlayback;
    if (!interval || interval.ended || interval.error) return false;
    if (
      record !== activeRecord
      || !record.video.isConnected
      || session?.sessionId !== interval.sessionId
      || videoSource(record.video) !== interval.source
    ) {
      cancelIntervalPlayback(record, true);
      return true;
    }
    if (
      Number.isFinite(record.video.duration)
      && record.video.duration > 0
      && interval.end > record.video.duration + 1e-6
    ) {
      failIntervalPlayback(record, interval, '播放区间超出视频时长');
      return true;
    }
    // A start seek may still report a previously displayed frame. Wait until
    // the seek settles before comparing its timestamp with the interval end.
    if (record.video.seeking) return false;
    const position = Math.max(
      Number(mediaTime) || 0,
      Number(record.video.currentTime) || 0
    );
    if (position < interval.end - INTERVAL_END_TOLERANCE) return false;
    if (record.intervalGuardTimer !== null) {
      clearTimeout(record.intervalGuardTimer);
      record.intervalGuardTimer = null;
    }
    // Mark completion before pause()/seek events can publish another state.
    interval.ended = true;
    record.intendedFrame = null;
    record.video.pause();
    try {
      interval.seekTarget = interval.end;
      record.video.currentTime = interval.end;
    } catch (_error) {
      interval.ended = false;
      failIntervalPlayback(record, interval, '原生播放器无法定位到区间终点');
      return true;
    }
    render(record);
    publish(record, 'interval-ended', interval.end);
    return true;
  }

  function scheduleIntervalGuard(record) {
    if (record.intervalGuardTimer !== null) clearTimeout(record.intervalGuardTimer);
    record.intervalGuardTimer = null;
    const interval = record.intervalPlayback;
    if (!interval || interval.ended || interval.error) return;
    const rate = Math.max(0.01, Math.abs(Number(record.video.playbackRate) || 1));
    const remaining = Math.max(0, interval.end - (Number(record.video.currentTime) || 0));
    const delay = Math.min(INTERVAL_GUARD_DELAY, Math.max(4, remaining * 1000 / rate - 4));
    record.intervalGuardTimer = setTimeout(() => {
      record.intervalGuardTimer = null;
      if (!enforceIntervalPlayback(record)) scheduleIntervalGuard(record);
    }, delay);
  }

  function validatePlaybackInterval(record, rawInterval) {
    if (!rawInterval || typeof rawInterval !== 'object' || Array.isArray(rawInterval)) {
      throw new Error('播放区间格式无效');
    }
    const id = String(rawInterval.id ?? '').trim();
    const start = rawInterval.start;
    const end = rawInterval.end;
    if (
      !id
      || typeof start !== 'number'
      || typeof end !== 'number'
      || !Number.isFinite(start)
      || !Number.isFinite(end)
      || start < 0
      || end <= start
    ) throw new Error('播放区间需要有效标识与起止时间');
    const duration = record.video.duration;
    if (
      Number.isFinite(duration)
      && duration > 0
      && (start >= duration || end > duration + 1e-6)
    ) {
      throw new Error('播放区间超出视频时长');
    }
    return {
      id,
      start,
      end: Number.isFinite(duration) && duration > 0 ? Math.min(end, duration) : end,
      sessionId: session?.sessionId,
      source: videoSource(record.video),
      ended: false,
      error: ''
    };
  }

  function publish(
    record,
    reason,
    mediaTime,
    intervalState = record.intervalPlayback,
    extraPayload = {}
  ) {
    if (!session || record !== activeRecord) return;
    const frame = currentFrame(record, mediaTime);
    const knownFps = trustedFps(record);
    const temporaryFps = knownFps || estimatedFps(record);
    const now = performance.now();
    if (
      reason === 'frame'
      && frame === record.lastPublishedFrame
      && now - record.lastPublishedAt < 80
    ) {
      return;
    }
    record.lastPublishedFrame = frame;
    record.lastPublishedAt = now;
    chrome.runtime.sendMessage({
      type: 'NATIVE_VIDEO_STATE',
      payload: {
        sessionId: session.sessionId,
        playerId: record.playerId,
        sheetId: session.sheetId,
        row: session.row,
        col: session.col,
        reason,
        frame,
        estimatedFrame: frame ?? estimatedFrame(record, mediaTime),
        mediaTime: Number.isFinite(Number(mediaTime))
          ? Number(mediaTime)
          : Number(record.video.currentTime) || 0,
        duration: Number.isFinite(record.video.duration)
          ? record.video.duration
          : 0,
        fps: knownFps,
        fpsKnown: Boolean(knownFps),
        fpsLocked: Boolean(knownFps && record.fpsLocked),
        fpsSource: knownFps ? record.fpsSource : 'unknown',
        estimatedFps: knownFps ? knownFps : temporaryFps,
        totalFrames: totalFrames(record),
        sourceUrl: String(record.video.currentSrc || record.video.src || ''),
        paused: record.video.paused,
        playbackRate: record.video.playbackRate,
        readyState: record.video.readyState,
        intervalPlayback: Boolean(intervalState),
        intervalId: intervalState?.id || '',
        intervalEnded: Boolean(intervalState?.ended),
        intervalError: intervalState?.error || '',
        ...extraPayload
      }
    }).catch(() => {});
  }

  function render(record, forcedFrame = null) {
    const fps = trustedFps(record);
    if (!fps && !timingTotalFrames(record.frameTiming)) {
      const temporaryFps = estimatedFps(record);
      const frame = estimatedFrame(record);
      const estimatedTotal = Number.isFinite(record.video.duration)
        && record.video.duration > 0
        ? Math.max(1, Math.round(record.video.duration * temporaryFps))
        : 0;
      const text = [
        `约 ${formatFrame(frame, temporaryFps)}`,
        `${frame + 1}/${estimatedTotal || '-'}`,
        `FPS 检测中（临时 ${displayFps(temporaryFps)}fps）`
      ].join(' · ');
      if (record.counter.textContent !== text) record.counter.textContent = text;
      if (!record.previous.disabled) record.previous.disabled = true;
      if (!record.next.disabled) record.next.disabled = true;
      return;
    }
    if (record.previous.disabled) record.previous.disabled = false;
    if (record.next.disabled) record.next.disabled = false;
    const frame = Number.isFinite(forcedFrame)
      ? forcedFrame
      : currentFrame(record);
    const total = totalFrames(record);
    const visibleFrame = total ? Math.min(total - 1, frame) : frame;
    const text = fps
      ? [
        formatFrame(visibleFrame, fps),
        `${visibleFrame + 1}/${total || '-'}`,
        `${displayFps(fps)}fps`
      ].join(' · ')
      : `第 ${visibleFrame + 1}/${total || '-'} 帧 · 精确帧时序`;
    if (record.counter.textContent !== text) record.counter.textContent = text;
  }

  function setFrame(record, frame) {
    cancelIntervalPlayback(record);
    if (
      !record
      || (!trustedFps(record) && !timingTotalFrames(record.frameTiming))
    ) {
      return null;
    }
    const total = totalFrames(record);
    const targetFrame = Math.max(
      0,
      Math.min(Math.round(Number(frame) || 0), total ? total - 1 : Infinity)
    );
    record.intendedFrame = targetFrame;
    record.video.pause();
    render(record, targetFrame);
    try {
      const targetTime = frameTime(record, targetFrame);
      record.video.currentTime = targetTime;
      publish(record, 'seek-requested', targetTime);
      return targetFrame;
    } catch (_error) {
      record.intendedFrame = null;
      render(record);
      return null;
    }
  }

  function stepFrame(record, delta) {
    const base = Number.isFinite(record.intendedFrame)
      ? record.intendedFrame
      : currentFrame(record);
    if (!Number.isFinite(base)) return;
    setFrame(record, base + delta);
  }

  function requestFrameUpdates(record) {
    if (typeof record.video.requestVideoFrameCallback !== 'function') return;
    const generation = ++record.frameLoopGeneration;
    const tick = (_now, metadata) => {
      if (
        generation !== record.frameLoopGeneration
        || !record.video.isConnected
        || record.video.paused
      ) return;
      const mediaTime = Number.isFinite(metadata?.mediaTime)
        ? metadata.mediaTime
        : record.video.currentTime;
      if (enforceIntervalPlayback(record, mediaTime)) return;
      if (
        !record.fpsLocked
        && !record.video.seeking
        && Number.isFinite(record.lastMediaTime)
        && mediaTime > record.lastMediaTime
      ) {
        const delta = mediaTime - record.lastMediaTime;
        if (delta > 0 && delta < 1) {
          record.frameDeltas.push(delta);
          if (record.frameDeltas.length > FPS_SAMPLE_LIMIT) {
            record.frameDeltas.splice(
              0,
              record.frameDeltas.length - FPS_SAMPLE_LIMIT
            );
          }
          const estimate = frameRateEstimate(record.frameDeltas);
          if (estimate.fps) record.estimatedFps = estimate.fps;
          if (record.frameDeltas.length >= FPS_SAMPLE_TARGET) {
            const detected = estimate.fps;
            if (detected && estimate.stable) {
              record.fps = detected;
              record.estimatedFps = detected;
              record.fpsSource = 'detected';
              record.totalFrames = Number.isFinite(record.video.duration)
                ? Math.max(1, Math.round(record.video.duration * detected))
                : 0;
              record.fpsLocked = true;
              render(record);
              publish(record, 'fps-detected', mediaTime);
            } else if (!detected) {
              record.frameDeltas.splice(
                0,
                Math.max(1, Math.floor(record.frameDeltas.length / 2))
              );
            }
          }
        }
      }
      record.lastMediaTime = mediaTime;
      record.intendedFrame = null;
      render(record);
      publish(record, 'frame', mediaTime);
      record.video.requestVideoFrameCallback(tick);
    };
    record.video.requestVideoFrameCallback(tick);
  }

  function makeButton(className, label, text, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `gt-native-frame-button ${className}`;
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    ['pointerdown', 'pointerup', 'dblclick'].forEach((name) => {
      button.addEventListener(name, (event) => event.stopPropagation());
    });
    return button;
  }

  function attach(video) {
    if (records.has(video)) {
      const record = records.get(video);
      resetRecordForSource(record);
      return record;
    }
    const host = video.parentElement;
    if (!host) return null;
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.classList.add('gt-native-video-host');

    const counter = document.createElement('div');
    counter.className = 'gt-native-frame-counter';
    const record = {
      playerId: `gt-player-${
        globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${++playerSequence}-${Math.random().toString(36).slice(2)}`
      }`,
      video,
      host,
      counter,
      fps: 0,
      estimatedFps: DEFAULT_FPS,
      fpsSource: 'unknown',
      sourceSignature: videoSource(video),
      totalFrames: 0,
      frameTiming: null,
      fpsLocked: false,
      frameDeltas: [],
      lastMediaTime: null,
      frameLoopGeneration: 0,
      intendedFrame: null,
      lastPublishedFrame: null,
      lastPublishedAt: 0,
      intervalPlayback: null,
      intervalGuardTimer: null,
      playbackCommandGeneration: 0
    };
    const previous = makeButton(
      'is-previous',
      '上一帧',
      '‹',
      () => stepFrame(record, -1)
    );
    const next = makeButton(
      'is-next',
      '下一帧',
      '›',
      () => stepFrame(record, 1)
    );
    record.previous = previous;
    record.next = next;
    host.append(counter, previous, next);
    video.dataset[VIDEO_MARKER] = 'true';

    video.addEventListener('loadedmetadata', () => {
      resetRecordForSource(record);
      render(record);
      publish(record, 'metadata');
    });
    video.addEventListener('durationchange', () => {
      if (enforceIntervalPlayback(record)) return;
      render(record);
      publish(record, 'duration');
    });
    video.addEventListener('emptied', () => cancelIntervalPlayback(record, true));
    video.addEventListener('play', () => {
      // A queued play event can arrive after a short interval has already
      // stopped. Only a currently playing element represents a new play.
      if (video.paused) return;
      resetRecordForSource(record);
      if (record.intervalPlayback?.ended || record.intervalPlayback?.error) {
        cancelIntervalPlayback(record);
      }
      record.intendedFrame = null;
      record.lastMediaTime = null;
      publish(record, 'play');
      requestFrameUpdates(record);
      scheduleIntervalGuard(record);
    });
    video.addEventListener('pause', () => {
      record.frameLoopGeneration += 1;
      if (
        video.paused
        && record.intervalPlayback
        && !record.intervalPlayback.ended
        && !record.intervalPlayback.error
        && !enforceIntervalPlayback(record)
      ) {
        if (cancelIntervalPlayback(record)) return;
      }
      publish(record, 'pause');
    });
    video.addEventListener('seeking', () => {
      const interval = record.intervalPlayback;
      if (interval && !interval.error
        && (!Number.isFinite(interval.seekTarget)
          || Math.abs(video.currentTime - interval.seekTarget) > 1e-6)) {
        cancelIntervalPlayback(record, true);
      }
      render(record, record.intendedFrame);
    });
    video.addEventListener('seeked', () => {
      if (record.intervalPlayback) record.intervalPlayback.seekTarget = NaN;
      record.intendedFrame = null;
      if (enforceIntervalPlayback(record)) return;
      render(record);
      publish(record, 'seeked');
    });
    video.addEventListener('timeupdate', () => {
      if (enforceIntervalPlayback(record)) return;
      if (record.intendedFrame === null) render(record);
      if (typeof video.requestVideoFrameCallback !== 'function' && !video.paused) {
        publish(record, 'frame');
      }
    });
    video.addEventListener('ratechange', () => {
      scheduleIntervalGuard(record);
      publish(record, 'ratechange');
    });
    video.addEventListener('ended', () => {
      if (enforceIntervalPlayback(record)) return;
      const interval = record.intervalPlayback;
      if (interval && !interval.ended && !interval.error) {
        failIntervalPlayback(record, interval, '视频在播放区间终点之前结束');
      }
    });
    video.addEventListener('error', () => {
      const interval = record.intervalPlayback;
      if (interval && !interval.ended && !interval.error) {
        failIntervalPlayback(
          record,
          interval,
          record.video.error?.message || '原生视频播放失败'
        );
      }
    });
    render(record);
    records.set(video, record);
    if (!video.paused && !video.ended) {
      record.lastMediaTime = null;
      requestFrameUpdates(record);
    }
    return record;
  }

  function ensureAutoSession() {
    if (session) return session;
    session = {
      sessionId: 'auto',
      sheetId: '',
      row: -1,
      col: -1,
      fps: 0,
      fpsLocked: false,
      auto: true
    };
    return session;
  }

  function notifyClosed(record, reason, targetSession = session, replacement = null) {
    const sessionId = targetSession?.sessionId;
    if (!record || !sessionId) return Promise.resolve();
    return chrome.runtime.sendMessage({
      type: 'NATIVE_VIDEO_CLOSED',
      payload: {
        sessionId,
        playerId: record.playerId,
        reason,
        replacementPlayerId: replacement?.playerId || ''
      }
    }).catch(() => {});
  }

  function queueClosed(record, reason, targetSession = session, replacement = null) {
    activationBarrier = Promise.resolve(activationBarrier).then(
      () => notifyClosed(record, reason, targetSession, replacement),
      () => notifyClosed(record, reason, targetSession, replacement)
    );
    return activationBarrier;
  }

  function queueReady(record, expectedSessionId) {
    const barrier = activationBarrier;
    Promise.resolve(barrier).then(() => {
      if (
        record === activeRecord
        && session?.sessionId === expectedSessionId
      ) {
        publish(record, 'ready');
      }
    });
  }

  function chooseActiveVideo() {
    let candidates = [...document.querySelectorAll('video')]
      .map((video) => ({
        video,
        area: visibleArea(video),
        matchesTarget: sourceMatchesSession(video)
      }))
      .filter(({ area }) => area > 0)
      .sort((left, right) => (
        Number(right.matchesTarget) - Number(left.matchesTarget)
        || right.area - left.area
      ));
    if (
      session
      && !session.auto
      && !activeRecord
      && session.preparedVideos instanceof Map
    ) {
      candidates = candidates.filter(({ video }) => (
        !session.preparedVideos.has(video)
        || session.preparedVideos.get(video)
          !== String(video.currentSrc || video.src || '')
        || (
          String(session.url || '')
          && String(video.currentSrc || video.src || '') === String(session.url)
        )
      ));
    }
    if (candidates.some(({ matchesTarget }) => matchesTarget)) {
      candidates = candidates.filter(({ matchesTarget }) => matchesTarget);
    }
    const candidate = candidates[0]?.video;
    if (!candidate) {
      if (activeRecord && !isVisible(activeRecord.video)) {
        const closedRecord = activeRecord;
        const closedSession = session;
        cancelIntervalPlayback(closedRecord, true);
        activeRecord = null;
        queueClosed(
          closedRecord,
          'video-hidden',
          closedSession
        );
        if (session?.auto) session = null;
      }
      return;
    }
    const previous = activeRecord;
    const wasAuto = session?.auto;
    if (!session) ensureAutoSession();
    const nextRecord = attach(candidate);
    if (!nextRecord) return;
    activeRecord = nextRecord;
    if (session && !session.auto) session.preparedVideos = null;
    if (previous && previous !== activeRecord) {
      cancelIntervalPlayback(previous, true);
      queueClosed(
        previous,
        'active-video-changed',
        session,
        activeRecord
      );
    }
    const sessionFps = Number(session?.fps) || 0;
    const sessionFpsLocked = shouldTrustProvidedFps(session, sessionFps);
    if (sessionFps > 0 && sessionFpsLocked) {
      activeRecord.fps = sessionFps;
      activeRecord.estimatedFps = sessionFps;
      activeRecord.fpsSource = 'provided';
      activeRecord.fpsLocked = true;
    } else if (sessionFps > 0 && !activeRecord.fpsLocked) {
      activeRecord.estimatedFps = sessionFps;
    }
    const sessionTotalFrames = Math.max(
      0,
      Math.round(Number(session?.totalFrames) || 0)
    );
    if (
      sessionTotalFrames > 0
      && (sessionFpsLocked || session?.frameTiming)
    ) {
      activeRecord.totalFrames = sessionTotalFrames;
    }
    if (session?.frameTiming) activeRecord.frameTiming = session.frameTiming;
    if (session?.ratePlayerId !== activeRecord.playerId) {
      const rate = Number(session?.playbackRate);
      if (Number.isFinite(rate) && rate >= 0.25 && rate <= 4) {
        activeRecord.video.playbackRate = rate;
      }
      if (session) session.ratePlayerId = activeRecord.playerId;
    }
    render(activeRecord);
    if (activeRecord !== previous || wasAuto !== session?.auto) {
      queueReady(activeRecord, session.sessionId);
    }
  }

  function scan() {
    scanScheduled = false;
    for (const [video, record] of records) {
      if (video.isConnected) continue;
      cancelIntervalPlayback(record, true);
      record.frameLoopGeneration += 1;
      record.counter.remove();
      record.previous.remove();
      record.next.remove();
      records.delete(video);
      if (record === activeRecord) {
        const closedSession = session;
        activeRecord = null;
        queueClosed(
          record,
          'video-removed',
          closedSession
        );
      }
    }
    chooseActiveVideo();
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scan);
  }

  function onKeyDown(event) {
    if (!activeRecord || !activeRecord.host.matches(':hover')) return;
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const focused = document.activeElement;
    if (
      focused
      && (
        focused.matches('input, textarea, select')
        || focused.isContentEditable
      )
    ) {
      return;
    }
    const delta = event.shiftKey ? BIG_STEP_FRAMES : 1;
    stepFrame(activeRecord, event.key === 'ArrowLeft' ? -delta : delta);
    event.preventDefault();
    event.stopPropagation();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'NATIVE_VIDEO_PREPARE') {
      const previousRecord = activeRecord;
      const previousSession = session;
      cancelIntervalPlayback(previousRecord, true);
      const nextSession = {
        ...message.payload,
        preparedVideos: new Map(
          [...document.querySelectorAll('video')]
            .filter(isVisible)
            .map((video) => [
              video,
              String(video.currentSrc || video.src || '')
            ])
        )
      };
      const preparedFps = Number(nextSession.fps) || 0;
      nextSession.fpsLocked = shouldTrustProvidedFps(
        nextSession,
        preparedFps
      );
      session = nextSession;
      activeRecord = null;
      if (previousRecord) {
        queueClosed(
          previousRecord,
          'session-replaced',
          previousSession
        );
      }
      scheduleScan();
      sendResponse?.({ ok: true });
      return;
    }
    if (message?.type === 'SET_NATIVE_VIDEO_FPS') {
      const targetId = message.payload?.sessionId;
      if (session && targetId && session.sessionId !== targetId && targetId !== 'auto') {
        sendResponse?.({ ok: false, error: '原生播放器会话不匹配' });
        return;
      }
      if (!session) ensureAutoSession();
      const rawFps = Number(message.payload.fps) || 0;
      // SET_NATIVE_VIDEO_FPS is an explicit configuration command. Legacy
      // callers do not send fpsLocked, so accept their value unless they
      // explicitly mark it as an unlocked estimate.
      const shouldLockFps = (
        rawFps >= MIN_FPS
        && rawFps <= MAX_FPS
        && message.payload?.fpsLocked !== false
      );
      session.fps = shouldLockFps ? rawFps : 0;
      session.fpsLocked = shouldLockFps;
      session.estimatedFps = rawFps > 0 ? rawFps : DEFAULT_FPS;
      session.totalFrames = Math.max(
        0,
        Math.round(Number(message.payload.totalFrames) || 0)
      );
      session.frameTiming = message.payload.frameTiming || null;
      chooseActiveVideo();
      const targetPlayerId = String(message.payload?.playerId || '');
      if (
        targetPlayerId
        && activeRecord?.playerId !== targetPlayerId
      ) {
        sendResponse?.({ ok: false, error: '原生播放器实例不匹配' });
        return;
      }
      if (activeRecord) {
        activeRecord.fps = session.fps;
        activeRecord.estimatedFps = session.estimatedFps;
        activeRecord.fpsSource = shouldLockFps ? 'provided' : 'unknown';
        activeRecord.totalFrames = session.totalFrames;
        activeRecord.frameTiming = session.frameTiming;
        activeRecord.fpsLocked = shouldLockFps;
        activeRecord.frameDeltas.length = 0;
        render(activeRecord);
        publish(activeRecord, 'fps');
      }
      sendResponse?.({
        ok: Boolean(activeRecord),
        playerId: activeRecord?.playerId || ''
      });
      return;
    }
    if (message?.type === 'SEEK_NATIVE_VIDEO') {
      const targetId = message.payload?.sessionId;
      if (session && targetId && session.sessionId !== targetId && targetId !== 'auto') {
        sendResponse?.({ ok: false, error: '原生播放器会话不匹配' });
        return;
      }
      if (!session) ensureAutoSession();
      chooseActiveVideo();
      if (!activeRecord?.video) {
        sendResponse?.({ ok: false, error: '未找到活动的原生播放器' });
        return;
      }
      const targetPlayerId = String(message.payload?.playerId || '');
      if (
        targetPlayerId
        && activeRecord?.playerId !== targetPlayerId
      ) {
        sendResponse?.({ ok: false, error: '原生播放器实例不匹配' });
        return;
      }
      let actualFrame;
      let seekSucceeded = false;
      cancelIntervalPlayback(activeRecord);
      if (Number.isFinite(Number(message.payload?.mediaTime))) {
        const mediaTime = Math.max(0, Number(message.payload.mediaTime));
        activeRecord.video.pause();
        try {
          activeRecord.video.currentTime = Math.min(
            mediaTime,
            Number.isFinite(activeRecord.video.duration)
              ? activeRecord.video.duration
              : mediaTime
          );
          actualFrame = currentFrame(activeRecord, mediaTime);
          seekSucceeded = true;
          publish(activeRecord, 'seek-requested', mediaTime);
        } catch (_error) {
          actualFrame = null;
        }
      } else {
        actualFrame = setFrame(activeRecord, message.payload.frame);
      }
      const ok = Number.isFinite(Number(message.payload?.mediaTime))
        ? seekSucceeded
        : Number.isInteger(actualFrame);
      sendResponse?.({
        ok,
        playerId: activeRecord?.playerId || '',
        actualFrame: Number.isInteger(actualFrame) ? actualFrame : null,
        actualMediaTime: Number(activeRecord?.video?.currentTime) || 0
      });
      return;
    }
    if (['PLAY_NATIVE_VIDEO', 'PAUSE_NATIVE_VIDEO', 'SET_NATIVE_VIDEO_RATE'].includes(message?.type)) {
      const targetId = message.payload?.sessionId;
      if (session && targetId && session.sessionId !== targetId && targetId !== 'auto') {
        sendResponse?.({ ok: false, error: '原生播放器会话不匹配' });
        return;
      }
      chooseActiveVideo();
      const targetPlayerId = String(message.payload?.playerId || '');
      if (targetPlayerId && activeRecord?.playerId !== targetPlayerId) {
        sendResponse?.({ ok: false, error: '原生播放器实例不匹配' });
        return;
      }
      if (!activeRecord?.video) {
        sendResponse?.({ ok: false, error: '未找到活动的原生播放器' });
        return;
      }
      if (message.type === 'SET_NATIVE_VIDEO_RATE') {
        const rate = Number(message.payload?.playbackRate);
        if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
          sendResponse?.({ ok: false, error: '播放倍速应在 0.25 到 4 之间' });
          return;
        }
        try {
          activeRecord.video.playbackRate = rate;
          if (session) session.playbackRate = rate;
          scheduleIntervalGuard(activeRecord);
          sendResponse?.({ ok: true, playerId: activeRecord.playerId, playbackRate: rate });
        } catch (error) {
          sendResponse?.({ ok: false, error: error.message });
        }
        return;
      }
      if (message.type === 'PLAY_NATIVE_VIDEO') {
        const record = activeRecord;
        const expectedSessionId = session?.sessionId;
        let interval = null;
        try {
          if (message.payload?.interval !== undefined) {
            interval = validatePlaybackInterval(record, message.payload.interval);
          }
        } catch (error) {
          sendResponse?.({ ok: false, intervalPlayback: true, error: error.message });
          return;
        }
        cancelIntervalPlayback(record);
        const generation = record.playbackCommandGeneration;
        const isCurrentCommand = () => (
          generation === record.playbackCommandGeneration
          && record === activeRecord
          && session?.sessionId === expectedSessionId
          && record.video.isConnected
          && videoSource(record.video) === (interval?.source || record.sourceSignature)
        );
        try {
          if (interval) {
            record.video.pause();
            record.intervalPlayback = interval;
            record.intendedFrame = null;
            interval.seekTarget = interval.start;
            record.video.currentTime = interval.start;
            publish(record, 'interval-start', interval.start);
          }
          Promise.resolve(record.video.play())
            .then(() => {
              if (!isCurrentCommand()) {
                sendResponse?.({ ok: false, intervalPlayback: true, error: '播放请求已取消' });
                return;
              }
              if (interval?.error) {
                sendResponse?.({ ok: false, intervalPlayback: true, error: interval.error });
                return;
              }
              enforceIntervalPlayback(record);
              scheduleIntervalGuard(record);
              sendResponse?.({
                ok: !interval?.error,
                playerId: record.playerId,
                intervalPlayback: true,
                intervalId: interval?.id || '',
                intervalEnded: Boolean(interval?.ended),
                ...(interval?.error ? { error: interval.error } : {})
              });
            })
            .catch((error) => {
              // Reaching a short interval's endpoint can pause the element
              // before its pending play promise resolves (AbortError).
              if (interval?.ended && isCurrentCommand()) {
                sendResponse?.({
                  ok: true,
                  playerId: record.playerId,
                  intervalPlayback: true,
                  intervalId: interval.id,
                  intervalEnded: true
                });
                return;
              }
              const detail = error?.message || '原生播放器无法开始播放';
              if (interval && isCurrentCommand()) failIntervalPlayback(record, interval, detail);
              sendResponse?.({ ok: false, intervalPlayback: true, error: detail });
            });
          scheduleIntervalGuard(record);
        } catch (error) {
          const detail = error?.message || '原生播放器无法开始播放';
          if (interval) failIntervalPlayback(record, interval, detail);
          sendResponse?.({ ok: false, intervalPlayback: true, error: detail });
          return;
        }
        return true;
      }
      cancelIntervalPlayback(activeRecord);
      activeRecord.video.pause();
      sendResponse?.({
        ok: true,
        playerId: activeRecord.playerId
      });
    }
  });

  document.addEventListener('keydown', onKeyDown, true);
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  globalThis[CONTROLLER_KEY] = {
    scan,
    get session() {
      return session;
    }
  };
})();
