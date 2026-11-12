const MIN_FRAME_RATE = 1;
const MAX_FRAME_RATE = 240;

export function normalizeDetectedFps(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value < MIN_FRAME_RATE || value > MAX_FRAME_RATE) {
    return null;
  }
  return value;
}
