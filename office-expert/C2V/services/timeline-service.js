(() => {
  'use strict';

  const GLOBAL_KEY = '__cyleTimelineServiceV1';
  const HARNESS_KEY = '__annotationHarnessTimelineServiceV1';
  const COMPAT_KEY = '__gtMapperTimelineServiceV1';
  const root = globalThis.__cyleServicesV1 || (
    globalThis.__cyleServicesV1 = {}
  );
  const existing = (
    globalThis[GLOBAL_KEY]
    || globalThis[HARNESS_KEY]
    || root.timeline
  );
  if (existing) {
    globalThis[GLOBAL_KEY] = existing;
    globalThis[HARNESS_KEY] = existing;
    globalThis[COMPAT_KEY] = existing;
    root.timeline = existing;
    root.TimelineService = existing;
    return;
  }

  const EPSILON = 1e-6;
  const MODES = Object.freeze([
    'seconds',
    'milliseconds',
    'frames',
    'clock-ms',
    'clock-frame',
    'timecode'
  ]);

  function clone(value) {
    return structuredClone(value);
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positiveFps(value) {
    const rate = finite(
      value && typeof value === 'object' ? value.fps : value,
      NaN
    );
    return rate > 0 ? rate : NaN;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
  }

  function rounded(value, precision = 9) {
    const factor = 10 ** Math.max(0, Math.min(9, precision));
    return Math.round(finite(value) * factor) / factor;
  }

  function pad(value, width = 2) {
    return String(Math.max(0, Math.trunc(value))).padStart(width, '0');
  }

  function requireNonNegative(value, label) {
    const number = finite(value, NaN);
    if (!(number >= 0)) throw new RangeError(`${label}必须是非负有限数`);
    return number;
  }

  function frameToSeconds(frame, fpsValue) {
    const rate = positiveFps(fpsValue);
    const value = finite(frame, NaN);
    return (
      rate > 0
      && Number.isInteger(value)
      && value >= 0
    ) ? rounded(value / rate) : NaN;
  }

  function secondsToFrame(seconds, fpsValue, rounding = 'round') {
    const rate = positiveFps(fpsValue);
    const value = finite(seconds, NaN);
    if (!(rate > 0) || !(value >= 0)) return NaN;
    const method = ['floor', 'ceil', 'round'].includes(rounding)
      ? rounding
      : 'round';
    return Math[method](value * rate);
  }

  function secondsToMilliseconds(seconds, rounding = 'round') {
    const value = finite(seconds, NaN);
    if (!(value >= 0)) return NaN;
    const method = ['floor', 'ceil', 'round'].includes(rounding)
      ? rounding
      : 'round';
    return Math[method](value * 1000);
  }

  function millisecondsToSeconds(milliseconds) {
    const value = finite(milliseconds, NaN);
    return value >= 0 ? rounded(value / 1000) : NaN;
  }

  function frameToMilliseconds(frame, fpsValue, rounding = 'round') {
    return secondsToMilliseconds(
      frameToSeconds(frame, fpsValue),
      rounding
    );
  }

  function millisecondsToFrame(milliseconds, fpsValue, rounding = 'round') {
    return secondsToFrame(
      millisecondsToSeconds(milliseconds),
      fpsValue,
      rounding
    );
  }

  function frameToTimecode(frame, fpsValue) {
    const rate = positiveFps(fpsValue);
    const value = finite(frame, NaN);
    if (!(rate > 0) || !Number.isInteger(value) || value < 0) return '';
    const nominal = Math.max(1, Math.round(rate));
    const framePart = value % nominal;
    const totalSeconds = Math.floor(value / nominal);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(
      framePart,
      Math.max(2, String(nominal - 1).length)
    )}`;
  }

  function parseTimecode(value, fpsValue) {
    const rate = positiveFps(fpsValue);
    const source = String(value ?? '').trim();
    if (!(rate > 0)) {
      return Object.freeze({
        valid: false,
        value: source,
        error: '解析帧时码需要有效 FPS'
      });
    }
    const match = source.match(/^(\d+):([0-5]\d):([0-5]\d)[:;](\d+)$/);
    if (!match) {
      return Object.freeze({
        valid: false,
        value: source,
        error: '帧时码必须为 HH:MM:SS:FF'
      });
    }
    const nominal = Math.max(1, Math.round(rate));
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const frame = Number(match[4]);
    if (frame >= nominal) {
      return Object.freeze({
        valid: false,
        value: source,
        error: `时码帧位必须在 00 至 ${pad(nominal - 1)} 之间`
      });
    }
    const frames = (
      ((hours * 60 + minutes) * 60 + seconds) * nominal
      + frame
    );
    return Object.freeze({
      valid: true,
      value: source,
      fps: rate,
      nominalFps: nominal,
      hours,
      minutes,
      seconds,
      frame,
      frames,
      totalSeconds: frameToSeconds(frames, rate),
      milliseconds: frameToMilliseconds(frames, rate)
    });
  }

  function timecodeToFrame(value, fpsValue) {
    const parsed = parseTimecode(value, fpsValue);
    return parsed.valid ? parsed.frames : NaN;
  }

  function timecodeToSeconds(value, fpsValue) {
    return frameToSeconds(timecodeToFrame(value, fpsValue), fpsValue);
  }

  function secondsToTimecode(seconds, fpsValue, rounding = 'round') {
    return frameToTimecode(
      secondsToFrame(seconds, fpsValue, rounding),
      fpsValue
    );
  }

  function timecodeToMilliseconds(value, fpsValue) {
    return frameToMilliseconds(timecodeToFrame(value, fpsValue), fpsValue);
  }

  function millisecondsToTimecode(milliseconds, fpsValue, rounding = 'round') {
    return frameToTimecode(
      millisecondsToFrame(milliseconds, fpsValue, rounding),
      fpsValue
    );
  }

  function parseClockMilliseconds(value) {
    const source = String(value ?? '').trim();
    const match = source.match(/^(\d+):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?$/);
    if (!match) return NaN;
    const base = (
      Number(match[1]) * 3600
      + Number(match[2]) * 60
      + Number(match[3])
    );
    return rounded(base + Number(`0.${match[4] || '0'}`));
  }

  function parseClock(value, fpsValue = 0) {
    return positiveFps(fpsValue) > 0
      ? timecodeToSeconds(value, fpsValue)
      : parseClockMilliseconds(value);
  }

  function formatClock(seconds, options = {}) {
    if (options.frames === true || options.mode === 'clock-frame') {
      return secondsToTimecode(
        seconds,
        options.fps,
        options.rounding
      );
    }
    const value = finite(seconds, NaN);
    if (!(value >= 0)) return '';
    const totalMs = Math.round(value * 1000);
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const wholeSeconds = Math.floor((totalMs % 60000) / 1000);
    const milliseconds = totalMs % 1000;
    return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)}.${pad(
      milliseconds,
      3
    )}`;
  }

  function normalizeMode(value) {
    const source = String(value || 'seconds').toLowerCase();
    const aliases = {
      s: 'seconds',
      sec: 'seconds',
      second: 'seconds',
      seconds: 'seconds',
      ms: 'milliseconds',
      millisecond: 'milliseconds',
      milliseconds: 'milliseconds',
      frame: 'frames',
      frames: 'frames',
      timecode: 'clock-frame',
      'clock-frame': 'clock-frame',
      'clock-ms': 'clock-ms'
    };
    return aliases[source] || '';
  }

  function parseTime(value, mode = 'seconds', fpsValue = 0) {
    const normalized = normalizeMode(mode);
    if (normalized === 'milliseconds') return millisecondsToSeconds(value);
    if (normalized === 'frames') return frameToSeconds(value, fpsValue);
    if (normalized === 'clock-ms') return parseClockMilliseconds(value);
    if (normalized === 'clock-frame') return timecodeToSeconds(value, fpsValue);
    const seconds = finite(value, NaN);
    return seconds >= 0 ? seconds : NaN;
  }

  function encodeTime(seconds, mode = 'seconds', fpsValue = 0) {
    const normalized = normalizeMode(mode);
    if (normalized === 'milliseconds') return secondsToMilliseconds(seconds);
    if (normalized === 'frames') return secondsToFrame(seconds, fpsValue);
    if (normalized === 'clock-ms') return formatClock(seconds);
    if (normalized === 'clock-frame') {
      return secondsToTimecode(seconds, fpsValue);
    }
    const value = finite(seconds, NaN);
    return value >= 0 ? rounded(value, 6) : NaN;
  }

  function convert(value, fromMode, toMode, options = {}) {
    return encodeTime(
      parseTime(value, fromMode, options.fps),
      toMode,
      options.fps
    );
  }

  function segmentStart(segment) {
    if (segment?.startSeconds !== undefined) {
      return finite(segment.startSeconds, NaN);
    }
    if (segment?.startMs !== undefined) {
      return millisecondsToSeconds(segment.startMs);
    }
    return finite(segment?.start, NaN);
  }

  function segmentEnd(segment) {
    if (segment?.endSeconds !== undefined) {
      return finite(segment.endSeconds, NaN);
    }
    if (segment?.endMs !== undefined) {
      return millisecondsToSeconds(segment.endMs);
    }
    return finite(segment?.end, NaN);
  }

  function normalizeSegment(segment, index = 0, options = {}) {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
      throw new TypeError(`第 ${index + 1} 个 segment 必须是对象`);
    }
    const fps = positiveFps(options.fps);
    let start = segmentStart(segment);
    let end = segmentEnd(segment);
    if (!Number.isFinite(start) && segment.startFrame !== undefined && fps > 0) {
      start = frameToSeconds(segment.startFrame, fps);
    }
    if (!Number.isFinite(end) && segment.endFrame !== undefined && fps > 0) {
      end = frameToSeconds(segment.endFrame, fps);
    }
    const id = String(segment.id ?? segment.key ?? `segment-${index + 1}`);
    if (!id) throw new TypeError(`第 ${index + 1} 个 segment id 不能为空`);
    return {
      ...clone(segment),
      id,
      start: Number.isFinite(start) ? rounded(start) : NaN,
      end: Number.isFinite(end) ? rounded(end) : NaN,
      startSeconds: Number.isFinite(start) ? rounded(start) : NaN,
      endSeconds: Number.isFinite(end) ? rounded(end) : NaN
    };
  }

  function normalizeSegments(value, options = {}) {
    if (!Array.isArray(value)) throw new TypeError('segments 必须是数组');
    const ids = new Set();
    const result = value.map((segment, index) => {
      const normalized = normalizeSegment(segment, index, options);
      if (ids.has(normalized.id)) {
        throw new Error(`segment id 重复：${normalized.id}`);
      }
      ids.add(normalized.id);
      return normalized;
    });
    if (options.sort === true) {
      result.sort((left, right) => (
        left.startSeconds - right.startSeconds
        || left.endSeconds - right.endSeconds
      ));
    }
    return result;
  }

  function issue(code, message, details = {}) {
    return Object.freeze({ code, severity: 'error', message, ...details });
  }

  function validateSeek(value, options = {}) {
    const seconds = options.mode
      ? parseTime(value, options.mode, options.fps)
      : finite(value, NaN);
    const duration = finite(options.durationSeconds, Infinity);
    const issues = [];
    if (!(seconds >= 0)) {
      issues.push(issue('INVALID_SEEK', 'seek 必须是非负有限时间'));
    } else if (Number.isFinite(duration) && seconds > duration) {
      issues.push(issue(
        'SEEK_AFTER_END',
        'seek 超出时间轴时长',
        { durationSeconds: duration }
      ));
    }
    return Object.freeze({
      valid: issues.length === 0,
      seconds,
      clampedSeconds: Number.isFinite(seconds)
        ? clamp(seconds, 0, duration)
        : 0,
      issues: Object.freeze(issues)
    });
  }

  function validateContinuity(value = [], options = {}) {
    const issues = [];
    const tolerance = Math.max(
      0,
      finite(options.toleranceSeconds ?? options.tolerance, EPSILON)
    );
    const duration = finite(options.durationSeconds, Infinity);
    const requireContinuity = options.requireContinuity !== false;
    const segments = Array.isArray(value) ? value : [];
    const ids = new Set();

    segments.forEach((source, index) => {
      const segment = normalizeSegment(source, index, options);
      const start = segment.startSeconds;
      const end = segment.endSeconds;
      if (ids.has(segment.id)) {
        issues.push(issue(
          'DUPLICATE_ID',
          `segment id 重复：${segment.id}`,
          { index, segmentId: segment.id }
        ));
      }
      ids.add(segment.id);
      if (!Number.isFinite(start)) {
        issues.push(issue(
          'INVALID_START',
          `第 ${index + 1} 段开始时间无效`,
          { index, segmentId: segment.id }
        ));
      }
      if (!Number.isFinite(end)) {
        issues.push(issue(
          'INVALID_END',
          `第 ${index + 1} 段结束时间无效`,
          { index, segmentId: segment.id }
        ));
      }
      if (Number.isFinite(start) && start < -tolerance) {
        issues.push(issue(
          'BEFORE_START',
          `第 ${index + 1} 段开始时间小于 0`,
          { index, segmentId: segment.id, start }
        ));
      }
      if (
        Number.isFinite(start)
        && Number.isFinite(end)
        && end < start - tolerance
      ) {
        issues.push(issue(
          'REVERSED_RANGE',
          `第 ${index + 1} 段时间倒序`,
          { index, segmentId: segment.id, start, end }
        ));
      }
      if (
        Number.isFinite(duration)
        && Number.isFinite(end)
        && end > duration + tolerance
      ) {
        issues.push(issue(
          'AFTER_END',
          `第 ${index + 1} 段超出时间轴时长`,
          { index, segmentId: segment.id, end, durationSeconds: duration }
        ));
      }
      if (index === 0) return;
      const previous = normalizeSegment(segments[index - 1], index - 1, options);
      if (
        !Number.isFinite(previous.endSeconds)
        || !Number.isFinite(start)
      ) return;
      const delta = start - previous.endSeconds;
      if (delta < -tolerance) {
        issues.push(issue(
          'OVERLAP',
          `第 ${index} 段与第 ${index + 1} 段重叠`,
          {
            index,
            previousId: previous.id,
            segmentId: segment.id,
            deltaSeconds: delta
          }
        ));
      } else if (requireContinuity && delta > tolerance) {
        issues.push(issue(
          'GAP',
          `第 ${index} 段与第 ${index + 1} 段之间存在空隙`,
          {
            index,
            previousId: previous.id,
            segmentId: segment.id,
            deltaSeconds: delta
          }
        ));
      }
    });

    if (
      options.requireStartAtZero === true
      && segments.length
      && Math.abs(segmentStart(segments[0])) > tolerance
    ) {
      issues.push(issue('START_GAP', '第一段必须从 0 秒开始'));
    }
    if (
      options.requireEndAtDuration === true
      && segments.length
      && Number.isFinite(duration)
      && Math.abs(segmentEnd(segments.at(-1)) - duration) > tolerance
    ) {
      issues.push(issue('END_GAP', '最后一段必须结束于时间轴末尾'));
    }
    return issues;
  }

  function validateSegments(segments = [], options = {}) {
    let normalized = [];
    let issues = [];
    try {
      normalized = normalizeSegments(segments, options);
      issues = validateContinuity(normalized, options);
    } catch (error) {
      issues = [issue('INVALID_SEGMENTS', error.message)];
    }
    if (options.allowEmpty === false && normalized.length === 0) {
      issues.push(issue('EMPTY_SEGMENTS', '时间轴至少需要一个 segment'));
    }
    return Object.freeze({
      valid: issues.length === 0,
      issues: Object.freeze(issues),
      segments: Object.freeze(clone(normalized))
    });
  }

  function createCursor(options = {}) {
    const listeners = new Set();
    let duration = finite(options.durationSeconds, Infinity);
    if (!(duration >= 0)) duration = Infinity;
    let cursor = clamp(
      finite(options.cursor ?? options.initialSeconds, 0),
      0,
      duration
    );
    let revision = 0;
    let disposed = false;

    function snapshot(reason = 'snapshot', source = '') {
      const fps = positiveFps(options.fps);
      return Object.freeze({
        reason,
        source,
        revision,
        seconds: cursor,
        milliseconds: secondsToMilliseconds(cursor),
        frame: fps > 0 ? secondsToFrame(cursor, fps) : null,
        timecode: fps > 0 ? secondsToTimecode(cursor, fps) : '',
        durationSeconds: duration
      });
    }

    function emit(reason, source) {
      const state = snapshot(reason, source);
      listeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          globalThis.console?.error?.('Timeline cursor subscriber failed', error);
        }
      });
      options.onChange?.(state);
      return state;
    }

    const api = Object.freeze({
      seek(value, seekOptions = {}) {
        if (disposed) throw new Error('游标已销毁');
        const result = validateSeek(value, {
          fps: options.fps,
          durationSeconds: duration,
          ...seekOptions
        });
        if (!result.valid && seekOptions.clamp === false) {
          const error = new RangeError(result.issues[0]?.message || 'seek 无效');
          error.issues = result.issues;
          throw error;
        }
        const changed = cursor !== result.clampedSeconds;
        cursor = rounded(result.clampedSeconds);
        if (changed || seekOptions.force === true) {
          revision += 1;
          emit(seekOptions.reason || 'seek', seekOptions.source || '');
        }
        return cursor;
      },
      get() {
        return cursor;
      },
      getState() {
        return snapshot();
      },
      setDuration(value) {
        duration = requireNonNegative(value, '时间轴时长');
        cursor = clamp(cursor, 0, duration);
        revision += 1;
        return emit('duration', '');
      },
      subscribe(listener, subscribeOptions = {}) {
        if (typeof listener !== 'function') {
          throw new TypeError('订阅者必须是函数');
        }
        if (disposed) throw new Error('游标已销毁');
        listeners.add(listener);
        if (subscribeOptions.emitCurrent !== false) listener(snapshot());
        return () => listeners.delete(listener);
      },
      dispose() {
        disposed = true;
        listeners.clear();
      },
      destroy() {
        api.dispose();
      }
    });
    return api;
  }

  function createTimeline(options = {}) {
    const listeners = new Set();
    const cursorListeners = new Set();
    const fps = positiveFps(options.fps);
    let duration = finite(options.durationSeconds, Infinity);
    if (!(duration >= 0)) duration = Infinity;
    let revision = 0;
    let disposed = false;
    let idCounter = 0;
    let segments = normalizeSegments(options.segments || [], {
      fps,
      sort: options.sort === true
    });
    const cursor = createCursor({
      cursor: options.cursor ?? options.initialSeconds,
      durationSeconds: duration,
      fps
    });

    function assertActive() {
      if (disposed) throw new Error('时间轴已销毁');
    }

    function nextId() {
      let id;
      do {
        idCounter += 1;
        id = `segment-${idCounter}`;
      } while (segments.some((segment) => segment.id === id));
      return id;
    }

    function activeSegment(seconds = cursor.get()) {
      const index = segments.findIndex((segment, segmentIndex) => (
        seconds >= segment.startSeconds
        && (
          seconds < segment.endSeconds
          || (
            segmentIndex === segments.length - 1
            && seconds <= segment.endSeconds
          )
        )
      ));
      return index >= 0 ? clone(segments[index]) : null;
    }

    function snapshot(reason = 'snapshot', source = '') {
      return Object.freeze({
        reason,
        source,
        revision,
        cursor: cursor.get(),
        cursorState: cursor.getState(),
        durationSeconds: duration,
        fps: fps > 0 ? fps : 0,
        segments: clone(segments),
        active: activeSegment(),
        validation: validateSegments(segments, {
          fps,
          durationSeconds: duration,
          requireContinuity: options.requireContinuity !== false,
          toleranceSeconds: options.toleranceSeconds
        })
      });
    }

    function emit(reason, source = '') {
      const state = snapshot(reason, source);
      listeners.forEach((listener) => {
        try {
          listener({ type: reason, ...state });
        } catch (error) {
          globalThis.console?.error?.('Timeline subscriber failed', error);
        }
      });
      options.onChange?.(state);
      return state;
    }

    function commit(next, reason, source = '') {
      segments = normalizeSegments(next, { fps });
      revision += 1;
      emit(reason, source);
      return clone(segments);
    }

    const unsubscribeCursor = cursor.subscribe((state) => {
      cursorListeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          globalThis.console?.error?.('Timeline cursor subscriber failed', error);
        }
      });
      if (state.reason !== 'snapshot') emit(`cursor:${state.reason}`, state.source);
    }, { emitCurrent: false });

    const api = Object.freeze({
      seek(value, seekOptions = {}) {
        assertActive();
        return cursor.seek(value, { fps, ...seekOptions });
      },
      getCursor() {
        return cursor.get();
      },
      getCursorState() {
        return cursor.getState();
      },
      subscribeCursor(listener, subscribeOptions = {}) {
        if (typeof listener !== 'function') {
          throw new TypeError('订阅者必须是函数');
        }
        assertActive();
        cursorListeners.add(listener);
        if (subscribeOptions.emitCurrent !== false) {
          listener(cursor.getState());
        }
        return () => cursorListeners.delete(listener);
      },
      setSegments(next, setOptions = {}) {
        assertActive();
        const normalized = normalizeSegments(next || [], {
          fps,
          sort: setOptions.sort === true
        });
        if (setOptions.validate === true) {
          const result = validateSegments(normalized, {
            fps,
            durationSeconds: duration,
            requireContinuity: options.requireContinuity !== false,
            ...setOptions
          });
          if (!result.valid) {
            const error = new Error(result.issues[0]?.message || 'segments 无效');
            error.issues = result.issues;
            throw error;
          }
        }
        return commit(normalized, setOptions.reason || 'segments', '');
      },
      replaceSegments(next, setOptions = {}) {
        return api.setSegments(next, setOptions);
      },
      getSegments() {
        return clone(segments);
      },
      addSegment(segment, addOptions = {}) {
        assertActive();
        const normalized = normalizeSegment({
          ...segment,
          id: segment?.id ?? segment?.key ?? nextId()
        }, segments.length, { fps });
        if (segments.some(({ id }) => id === normalized.id)) {
          throw new Error(`segment id 重复：${normalized.id}`);
        }
        const next = [...segments];
        const index = Number.isInteger(addOptions.index)
          ? clamp(addOptions.index, 0, next.length)
          : next.length;
        next.splice(index, 0, normalized);
        if (addOptions.sort === true) {
          next.sort((left, right) => left.startSeconds - right.startSeconds);
        }
        commit(next, 'segment:add', normalized.id);
        return clone(normalized);
      },
      updateSegment(id, patch, updateOptions = {}) {
        assertActive();
        const key = String(id);
        const index = segments.findIndex((segment) => segment.id === key);
        if (index < 0) throw new Error(`找不到 segment：${key}`);
        const changes = typeof patch === 'function'
          ? patch(clone(segments[index]))
          : patch;
        if (!changes || typeof changes !== 'object') {
          throw new TypeError('segment 更新必须是对象或返回对象的函数');
        }
        const normalized = normalizeSegment(
          { ...segments[index], ...changes },
          index,
          { fps }
        );
        if (
          normalized.id !== key
          && segments.some((segment) => segment.id === normalized.id)
        ) {
          throw new Error(`segment id 重复：${normalized.id}`);
        }
        const next = [...segments];
        next[index] = normalized;
        if (updateOptions.sort === true) {
          next.sort((left, right) => left.startSeconds - right.startSeconds);
        }
        commit(next, 'segment:update', normalized.id);
        return clone(normalized);
      },
      removeSegment(id) {
        assertActive();
        const key = String(id);
        const index = segments.findIndex((segment) => segment.id === key);
        if (index < 0) return false;
        const next = [...segments];
        next.splice(index, 1);
        commit(next, 'segment:remove', key);
        return true;
      },
      setBoundary(id, boundary, value, boundaryOptions = {}) {
        assertActive();
        const key = String(id);
        const index = segments.findIndex((segment) => segment.id === key);
        if (index < 0) throw new Error(`找不到 segment：${key}`);
        if (!['start', 'end'].includes(boundary)) {
          throw new RangeError('boundary 必须是 start 或 end');
        }
        const seconds = boundaryOptions.mode
          ? parseTime(value, boundaryOptions.mode, fps)
          : requireNonNegative(value, '边界时间');
        if (!(seconds >= 0)) throw new RangeError('边界时间无效');
        const next = clone(segments);
        next[index][boundary] = rounded(seconds);
        next[index][`${boundary}Seconds`] = rounded(seconds);
        if (boundaryOptions.linkAdjacent !== false) {
          if (boundary === 'start' && index > 0) {
            next[index - 1].end = rounded(seconds);
            next[index - 1].endSeconds = rounded(seconds);
          }
          if (boundary === 'end' && index < next.length - 1) {
            next[index + 1].start = rounded(seconds);
            next[index + 1].startSeconds = rounded(seconds);
          }
        }
        return commit(next, `boundary:${boundary}`, key);
      },
      splitSegment(id, value, splitOptions = {}) {
        assertActive();
        const key = String(id);
        const index = segments.findIndex((segment) => segment.id === key);
        if (index < 0) throw new Error(`找不到 segment：${key}`);
        const seconds = splitOptions.mode
          ? parseTime(value, splitOptions.mode, fps)
          : requireNonNegative(value, '拆分时间');
        const current = segments[index];
        if (!(seconds > current.startSeconds && seconds < current.endSeconds)) {
          throw new RangeError('拆分位置必须位于 segment 内部');
        }
        const secondId = String(splitOptions.id || nextId());
        if (segments.some((segment) => segment.id === secondId)) {
          throw new Error(`segment id 重复：${secondId}`);
        }
        const first = {
          ...clone(current),
          end: rounded(seconds),
          endSeconds: rounded(seconds)
        };
        const second = {
          ...clone(current),
          ...clone(splitOptions.patch || {}),
          id: secondId,
          start: rounded(seconds),
          startSeconds: rounded(seconds)
        };
        const next = clone(segments);
        next.splice(index, 1, first, second);
        commit(next, 'segment:split', key);
        return Object.freeze([clone(first), clone(second)]);
      },
      activeSegment,
      segmentAt(value, findOptions = {}) {
        const seconds = findOptions.mode
          ? parseTime(value, findOptions.mode, fps)
          : finite(value, NaN);
        return Number.isFinite(seconds) ? activeSegment(seconds) : null;
      },
      validate(validationOptions = {}) {
        return validateContinuity(segments, {
          fps,
          durationSeconds: duration,
          requireContinuity: options.requireContinuity !== false,
          toleranceSeconds: options.toleranceSeconds,
          ...validationOptions
        });
      },
      validateSegments(validationOptions = {}) {
        return validateSegments(segments, {
          fps,
          durationSeconds: duration,
          requireContinuity: options.requireContinuity !== false,
          toleranceSeconds: options.toleranceSeconds,
          ...validationOptions
        });
      },
      setDuration(value) {
        assertActive();
        duration = requireNonNegative(value, '时间轴时长');
        cursor.setDuration(duration);
        revision += 1;
        return emit('duration');
      },
      subscribe(listener, subscribeOptions = {}) {
        if (typeof listener !== 'function') {
          throw new TypeError('订阅者必须是函数');
        }
        assertActive();
        listeners.add(listener);
        if (subscribeOptions.emitCurrent !== false) {
          listener({ type: 'snapshot', ...snapshot() });
        }
        return () => listeners.delete(listener);
      },
      snapshot() {
        return snapshot();
      },
      getState() {
        return snapshot();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        unsubscribeCursor();
        cursor.dispose();
        listeners.clear();
        cursorListeners.clear();
      },
      destroy() {
        api.dispose();
      }
    });
    return api;
  }

  const service = Object.freeze({
    apiVersion: 1,
    modes: MODES,
    parseTime,
    encodeTime,
    convert,
    frameToSeconds,
    framesToSeconds: frameToSeconds,
    secondsToFrame,
    secondsToFrames: secondsToFrame,
    secondsToMilliseconds,
    millisecondsToSeconds,
    frameToMilliseconds,
    framesToMilliseconds: frameToMilliseconds,
    millisecondsToFrame,
    millisecondsToFrames: millisecondsToFrame,
    frameToTimecode,
    framesToTimecode: frameToTimecode,
    timecodeToFrame,
    timecodeToFrames: timecodeToFrame,
    secondsToTimecode,
    timecodeToSeconds,
    millisecondsToTimecode,
    timecodeToMilliseconds,
    parseTimecode,
    parseClock,
    formatClock,
    normalizeSegment,
    normalizeSegments,
    validateSeek,
    validateContinuity,
    validateSegments,
    createCursor,
    create: createTimeline,
    createTimeline,
    createStore: createTimeline,
    clamp
  });

  root.timeline = service;
  root.TimelineService = service;
  globalThis[GLOBAL_KEY] = service;
  globalThis[HARNESS_KEY] = service;
  globalThis[COMPAT_KEY] = service;
})();
