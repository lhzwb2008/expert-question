import { normalizeDetectedFps } from './frame-rate.js';

// Reads a video track's real frame rate straight from an MP4/QuickTime
// container so the correct frame count is available the moment metadata loads,
// without waiting for playback. It walks the box tree to the video track's
// media header (mdhd → timescale) and time-to-sample table (stts) and derives
// fps = timescale × sampleCount / mediaDurationTicks. The full finite Number
// precision is retained; normalization only rejects implausible rates.

const CONTAINER_BOXES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl'
]);

function readType(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

// Iterates the boxes contained in [start, end), invoking visit(type, payloadStart, payloadEnd).
function walkBoxes(view, start, end, visit) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = readType(view, offset + 4);
    let headerSize = 8;
    if (size === 1) {
      // 64-bit largesize; JS numbers safely cover realistic file sizes.
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset; // box extends to the end of the range
    }
    if (size < headerSize) break;
    const payloadStart = offset + headerSize;
    const payloadEnd = Math.min(offset + size, end);
    visit(type, payloadStart, payloadEnd);
    offset += size;
  }
}

function readMdhdMetadata(view, start) {
  const version = view.getUint8(start);
  const timescaleOffset = version === 1 ? start + 4 + 16 : start + 4 + 8;
  const timescale = view.getUint32(timescaleOffset);
  let duration;
  if (version === 1) {
    const high = view.getUint32(timescaleOffset + 4);
    const low = view.getUint32(timescaleOffset + 8);
    duration = high * 2 ** 32 + low;
  } else {
    duration = view.getUint32(timescaleOffset + 4);
  }
  return { timescale, duration };
}

function readSttsMetadata(view, start) {
  // version(1) flags(3) entry_count(4), then entry_count × {count(4), delta(4)}.
  const entryCount = view.getUint32(start + 4);
  let samples = 0;
  let ticks = 0;
  let cursor = start + 8;
  const runs = [];
  for (let index = 0; index < entryCount; index += 1) {
    const count = view.getUint32(cursor);
    const delta = view.getUint32(cursor + 4);
    if (count > 0 && delta > 0) runs.push({ count, delta });
    samples += count;
    ticks += count * delta;
    cursor += 8;
  }
  return { samples, ticks, runs };
}

function readCttsMetadata(view, start) {
  const version = view.getUint8(start);
  const entryCount = view.getUint32(start + 4);
  let cursor = start + 8;
  const runs = [];
  for (let index = 0; index < entryCount; index += 1) {
    const count = view.getUint32(cursor);
    const offset = version === 1
      ? view.getInt32(cursor + 4)
      : view.getUint32(cursor + 4);
    if (count > 0) runs.push({ count, offset });
    cursor += 8;
  }
  return runs;
}

function readHandlerType(view, start) {
  // version(1) flags(3) pre_defined(4) handler_type(4).
  return readType(view, start + 8);
}

// Parses a buffer that contains a full `moov` box (or the whole file) and
// returns the video track's metadata: fps (average frame rate), totalFrames
// (exact sample count from stts), and durationSeconds (from mdhd). Returns null
// when it cannot be derived. All three values are container-authoritative:
// durationSeconds = totalFrames / fps for CFR, and is consistent with stts/mdhd.
export function readFpsFromMoov(buffer) {
  const view = buffer instanceof DataView
    ? buffer
    : new DataView(buffer.buffer ?? buffer);
  const end = view.byteLength;
  let moovStart = -1;
  let moovEnd = -1;
  walkBoxes(view, 0, end, (type, payloadStart, payloadEnd) => {
    if (type === 'moov' && moovStart === -1) {
      moovStart = payloadStart;
      moovEnd = payloadEnd;
    }
  });
  // The buffer may already be the moov payload with no enclosing header.
  if (moovStart === -1) {
    moovStart = 0;
    moovEnd = end;
  }

  let best = null;
  walkBoxes(view, moovStart, moovEnd, (type, trakStart, trakEnd) => {
    if (type !== 'trak') return;
    let handler = '';
    let mdhd = null;
    let stts = null;
    let ctts = null;
    const descend = (from, to) => {
      walkBoxes(view, from, to, (childType, childStart, childEnd) => {
        if (childType === 'hdlr') handler = readHandlerType(view, childStart);
        else if (childType === 'mdhd') mdhd = readMdhdMetadata(view, childStart);
        else if (childType === 'stts') stts = readSttsMetadata(view, childStart);
        else if (childType === 'ctts') ctts = readCttsMetadata(view, childStart);
        else if (CONTAINER_BOXES.has(childType)) descend(childStart, childEnd);
      });
    };
    descend(trakStart, trakEnd);
    if (handler !== 'vide' || !mdhd?.timescale || !stts || !stts.samples || !stts.ticks) {
      return;
    }
    const fps = (mdhd.timescale * stts.samples) / stts.ticks;
    if (!Number.isFinite(fps) || fps <= 0) return;
    const durationSeconds = mdhd.duration > 0 ? mdhd.duration / mdhd.timescale : null;
    best = {
      fps: normalizeDetectedFps(fps),
      totalFrames: stts.samples,
      durationSeconds: durationSeconds != null
        ? Math.round(durationSeconds * 1000) / 1000
        : null,
      frameTiming: {
        timescale: mdhd.timescale,
        totalFrames: stts.samples,
        durationTicks: stts.ticks,
        runs: stts.runs,
        ...(ctts?.length ? { compositionRuns: ctts } : {})
      }
    };
  });

  return best;
}

// Locates the top-level `moov` box in an already-fetched head chunk. Returns
// its byte range and whether the chunk holds it in full, so a caller can decide
// to parse immediately or fetch the exact remaining bytes.
export function locateMoov(buffer) {
  const view = buffer instanceof DataView
    ? buffer
    : new DataView(buffer.buffer ?? buffer);
  const end = view.byteLength;
  let offset = 0;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = readType(view, offset + 4);
    let headerSize = 8;
    if (size === 1) {
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    }
    if (type === 'moov') {
      return {
        start: offset,
        size: size || 0,
        complete: size > 0 && offset + size <= end
      };
    }
    if (!size || size < headerSize) break;
    offset += size;
  }
  return null;
}
