// server/http/loopStats.js — (fork) how late the event loop runs: the wait a player's message sees before the main
// thread gets to it.
//
// Two readings of the same thread, per minute (the current minute and the one before, server/match/simMeter.js
// MinuteWindow):
//   delay   node:perf_hooks monitorEventLoopDelay — mean / p50 / p99 / max of the loop's lateness beyond the sampling
//           resolution (10 ms), in ms: an idle loop reads about 0;
//   stalls  a 10 ms interval that notes every time it fires late: how many times by 50 / 100 / 250 / 1000 ms, and the
//           longest, so one long block is visible even when the percentiles hide it.
// `snapshot()` is the `loop` object of GET /healthz?traffic=1 (routes.js healthReport). The timers are unref'd and
// `stop()` clears them. A few microseconds per tick; nothing is stored.

import { monitorEventLoopDelay } from 'node:perf_hooks';
import { MinuteWindow } from '../match/simMeter.js';

export const STALL_STEPS = Object.freeze([50, 100, 250, 1000]);
const TICK_MS = 10;

const freshStalls = () => ({ ge50: 0, ge100: 0, ge250: 0, ge1000: 0, worstMs: 0 });
const freshDelay = () => ({ samples: 0, meanMs: 0, p50Ms: 0, p99Ms: 0, maxMs: 0 });

/**
 * @param {{ now?: () => number, windowMs?: number, tickMs?: number, resolution?: number }} [opts]
 */
export function createLoopStats({ now = Date.now, windowMs, tickMs = TICK_MS, resolution = 10 } = {}) {
  const stalls = new MinuteWindow(freshStalls, { now, windowMs });
  const delays = new MinuteWindow(freshDelay, { now, windowMs });
  const h = monitorEventLoopDelay({ resolution });
  h.enable();

  // the histogram is per window: fold it into the current bucket just before the window rolls, then reset
  // the histogram measures the sampling timer's lateness, which includes the resolution itself: report what is beyond it
  const ms = (v) => (Number.isFinite(v) ? Math.max(0, v / 1e6 - resolution) : 0);
  const fold = () => {
    if (h.count === 0) return;
    delays.cur.samples = h.count;
    delays.cur.meanMs = ms(h.mean);
    delays.cur.p50Ms = ms(h.percentile(50));
    delays.cur.p99Ms = ms(h.percentile(99));
    delays.cur.maxMs = ms(h.max);
  };
  const rollBoth = () => {
    const at = now();
    if (at - delays.startedAt >= delays.windowMs) { fold(); h.reset(); }
    delays.roll(at);
    stalls.roll(at);
  };

  let last = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const timer = setInterval(() => {
    const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const late = t - last - tickMs;
    last = t;
    rollBoth();
    if (late >= STALL_STEPS[0]) {
      stalls.add((b) => {
        if (late >= 50) b.ge50++;
        if (late >= 100) b.ge100++;
        if (late >= 250) b.ge250++;
        if (late >= 1000) b.ge1000++;
        if (late > b.worstMs) b.worstMs = late;
      });
    }
  }, tickMs);
  timer.unref?.();

  const round = (v) => Math.round(v * 10) / 10;
  const viewDelay = (b) => ({ samples: b.samples, meanMs: round(b.meanMs), p50Ms: round(b.p50Ms), p99Ms: round(b.p99Ms), maxMs: round(b.maxMs) });
  const viewStalls = (b) => ({ ge50: b.ge50, ge100: b.ge100, ge250: b.ge250, ge1000: b.ge1000, worstMs: Math.round(b.worstMs) });

  return {
    /** The `loop` object of /healthz?traffic=1. */
    snapshot() {
      rollBoth();
      fold();
      const d = delays.snapshot(viewDelay);
      const s = stalls.snapshot(viewStalls);
      return { windowSec: d.windowSec, delay: { last: d.last, now: d.now }, stalls: { last: s.last, now: s.now } };
    },
    stop() { clearInterval(timer); h.disable(); },
  };
}
