// public/dev/frame-stats.js — the frame figures of the battle perf page (battle-perf.js), free of the DOM so the Node
// tests can import them (test/perfbench.test.js).

/** `v` rounded to `d` decimals; null for NaN / ±Infinity (a figure the report shows as missing, not as 0). */
export const round = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/**
 * Average fps, frame-time percentiles (ms) and the share (%) of frames over `stutterMs`, from a sample's frame times.
 * Every figure is null without a frame time (perf.sample() always records one, but an empty run must not divide by 0).
 * @param {number[]} deltas frame times in ms (sorted in place)
 * @param {number} stutterMs a frame over this counts as a stutter frame
 */
export function frameFigures(deltas, stutterMs) {
  if (!deltas.length) return { fps: null, p50: null, p95: null, p99: null, over33: null };
  deltas.sort((a, b) => a - b);
  const pick = (p) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))];
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return {
    fps: avg > 0 ? round(1000 / avg) : null, p50: round(pick(0.5)), p95: round(pick(0.95)), p99: round(pick(0.99)),
    over33: round((deltas.filter((x) => x > stutterMs).length / deltas.length) * 100),
  };
}
