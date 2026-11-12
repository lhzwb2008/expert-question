import { readFpsFromMoov, locateMoov } from './mp4-frame-rate.js';

const HEAD_BYTES = 256 * 1024; // enough for a front-loaded moov in most files
const MAX_MOOV_BYTES = 8 * 1024 * 1024; // guard against pathological metadata
const TAIL_BYTES = 1.5 * 1024 * 1024; // covers a trailing moov (progressive MP4)

export function videoFetchCredentials(url) {
  try {
    return /(?:^|\.)feishu\.cn$|(?:^|\.)larksuite\.com$|(?:^|\.)larkoffice\.com$/.test(
      new URL(url).hostname
    ) ? 'include' : 'omit';
  } catch (_error) {
    return 'omit';
  }
}

async function fetchRange(url, start, end) {
  // end is inclusive per HTTP Range semantics; omit for open-ended tail.
  const range = end === undefined
    ? Number(start) < 0
      ? `bytes=${start}`
      : `bytes=${start}-`
    : `bytes=${start}-${end}`;
  const response = await fetch(url, {
    credentials: videoFetchCredentials(url),
    redirect: 'follow',
    headers: { Range: range }
  });
  if (!response.ok) throw new Error(`range fetch failed (${response.status})`);
  const supportsRange = response.status === 206;
  if (!supportsRange && Number(start) < 0) {
    try {
      await response.body?.cancel?.();
    } catch (_error) {}
    return { buffer: new ArrayBuffer(0), supportsRange: false };
  }
  const requestedBytes = end === undefined
    ? HEAD_BYTES
    : Math.max(1, Number(end) - Number(start) + 1);
  let buffer;
  if (!supportsRange && response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (size < requestedBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = requestedBytes - size;
        const chunk = value.byteLength > remaining
          ? value.subarray(0, remaining)
          : value;
        chunks.push(chunk);
        size += chunk.byteLength;
      }
    } finally {
      try {
        await reader.cancel();
      } catch (_error) {}
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    });
    buffer = joined.buffer;
  } else {
    buffer = await response.arrayBuffer();
  }
  return { buffer, supportsRange };
}

// Reads the real frame rate from an MP4/QuickTime container by pulling only the
// bytes needed for the `moov` box. Falls back through progressively broader
// fetches, and finally returns null so the caller keeps its current fps.
// Returns { fps, totalFrames, durationSeconds } or null.
async function readFpsViaRange(url) {
  const head = await fetchRange(url, 0, HEAD_BYTES - 1);
  const located = locateMoov(head.buffer);

  if (located && located.complete) {
    return readFpsFromMoov(head.buffer);
  }

  // moov present but truncated: fetch exactly the box if the size is sane.
  if (located && located.size > 0 && located.size <= MAX_MOOV_BYTES && head.supportsRange) {
    const box = await fetchRange(url, located.start, located.start + located.size - 1);
    return readFpsFromMoov(box.buffer);
  }

  // No moov near the front (common for progressively written files): the box
  // usually sits at the tail, so probe the end of the file.
  if (head.supportsRange) {
    const tail = await fetchRange(url, -Math.trunc(TAIL_BYTES));
    const meta = readFpsFromMoov(tail.buffer);
    if (meta?.fps) return meta;
  }

  return null;
}

// Detects a video's frame rate and total frame count from container metadata.
// It only reads bounded byte ranges and never downloads the full video merely
// to inspect metadata.
// Returns { fps, totalFrames, durationSeconds } or null.
// The optional videoEl lets callers reuse an already-loaded blob object URL.
export async function detectVideoFps(url, _videoEl) {
  if (!url || typeof fetch !== 'function') return null;
  try {
    const meta = await readFpsViaRange(url);
    if (meta?.fps) return meta;
  } catch (_error) {
    // fall through to a full fetch
  }
  // Avoid silently downloading an arbitrarily large video only to inspect its
  // metadata. A source without usable ranges can still be played normally.
  return null;
}

