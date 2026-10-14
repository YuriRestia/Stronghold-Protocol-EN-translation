// server/match/simMeter.js — (fork) how much of the main thread the server's own battle simulation takes.
//
// Every server-run simulation goes through one of three places, and each of them reports its wall-clock time here:
//   headless   normal / 联防 fields the server steps to their end in slices (fields.js HeadlessJob: bot seats, takeovers,
//              SP_VERIFY re-simulation)
//   rehearsal  a bot's layout rehearsal before it places (bot.js createRehearsal)
//   prep       a bot's shop decisions and layout planning, stepped in slices (match/prep.js drive)
//   boss       boss fields the server paces in real time (fields.js HeadlessPacer)
//   runner     the legacy server-run mode and boss rounds with no connected human (fields.js FieldRunner)
// The meter keeps the current minute and the one before it: milliseconds, slices (callbacks) and the longest single
// slice per kind, plus the longest burst (slices that followed each other with less than BURST_GAP_MS between them:
// the loop never got back to its sockets in between), so `/healthz?traffic=1` (routes.js healthReport `sim`) shows whether the simulation is what blocks the
// loop and whether a slice overruns its budget. One meter per process (every match reports to it); nothing is stored.

export const SIM_KINDS = Object.freeze(['headless', 'rehearsal', 'prep', 'boss', 'runner']);
/** slices separated by less than this much non-simulation time count as one burst */
export const BURST_GAP_MS = 10;
export const WINDOW_MS = 60_000;

const emptyKind = () => ({ ms: 0, slices: 0, maxSliceMs: 0 });

/**
 * Two consecutive windows of `windowMs` (`now`: the one still filling, `last`: the one before it, null before the first
 * roll). `add(fn)` mutates the current bucket; `roll(at)` moves on when the window is over — more than one window
 * without an add leaves `last` empty, as it was.
 * @template T
 */
export class MinuteWindow {
  /** @param {() => T} fresh a new empty bucket @param {{ now?: () => number, windowMs?: number }} [opts] */
  constructor(fresh, { now = Date.now, windowMs = WINDOW_MS } = {}) {
    this.fresh = fresh;
    this.now = now;
    this.windowMs = windowMs;
    this.startedAt = now();
    /** @type {T} */ this.cur = fresh();
    /** @type {T | null} */ this.last = null;
    this.lastSec = 0;
  }

  /** Move the windows on if the current one is over. @param {number} [at] */
  roll(at = this.now()) {
    const elapsed = at - this.startedAt;
    if (elapsed < this.windowMs) return;
    const windows = Math.floor(elapsed / this.windowMs);
    this.last = windows === 1 ? this.cur : this.fresh();
    this.lastSec = Math.round(this.windowMs / 1000);
    this.cur = this.fresh();
    this.startedAt += windows * this.windowMs;
  }

  /** @param {(bucket: T) => void} fn */
  add(fn) {
    this.roll();
    fn(this.cur);
  }

  /** `{ last, now }` with the seconds each covers. @param {(bucket: T) => object} [view] */
  snapshot(view = (b) => /** @type {any} */ (b)) {
    const at = this.now();
    this.roll(at);
    return {
      windowSec: Math.round(this.windowMs / 1000),
      last: this.last ? { sec: this.lastSec, ...view(this.last) } : null,
      now: { sec: Math.round((at - this.startedAt) / 1000), ...view(this.cur) },
    };
  }
}

/** @param {{ now?: () => number, windowMs?: number }} [opts] */
export function createSimMeter(opts = {}) {
  const now = opts.now || Date.now;
  const fresh = () => ({ ...Object.fromEntries(SIM_KINDS.map((k) => [k, emptyKind()])), maxBurstMs: 0, maxBurstSlices: 0 });
  const w = new MinuteWindow(fresh, opts);
  /** the burst in progress: when its last slice ended, its simulation ms and slices so far */
  const burst = { endAt: -Infinity, ms: 0, slices: 0 };
  return {
    /**
     * One slice of simulation finished.
     * @param {'headless' | 'rehearsal' | 'prep' | 'boss' | 'runner'} kind
     * @param {number} ms wall-clock milliseconds it took
     */
    add(kind, ms) {
      if (!(ms >= 0) || !SIM_KINDS.includes(kind)) return;
      const at = now();
      if (at - ms - burst.endAt < BURST_GAP_MS) { burst.ms += ms; burst.slices++; } else { burst.ms = ms; burst.slices = 1; }
      burst.endAt = at;
      w.add((b) => {
        const k = b[kind]; k.ms += ms; k.slices++; if (ms > k.maxSliceMs) k.maxSliceMs = ms;
        if (burst.ms > b.maxBurstMs) b.maxBurstMs = burst.ms;
        if (burst.slices > b.maxBurstSlices) b.maxBurstSlices = burst.slices;
      });
    },
    /** The `sim` object of /healthz?traffic=1: per kind and in total, for the current and the previous minute. */
    snapshot() {
      return w.snapshot((b) => {
        const total = emptyKind();
        const kinds = {};
        for (const k of SIM_KINDS) {
          const v = b[k];
          kinds[k] = { ms: Math.round(v.ms), slices: v.slices, maxSliceMs: Math.round(v.maxSliceMs) };
          total.ms += v.ms; total.slices += v.slices; if (v.maxSliceMs > total.maxSliceMs) total.maxSliceMs = v.maxSliceMs;
        }
        return { ms: Math.round(total.ms), slices: total.slices, maxSliceMs: Math.round(total.maxSliceMs), maxBurstMs: Math.round(b.maxBurstMs), maxBurstSlices: b.maxBurstSlices, ...kinds };
      });
    },
  };
}

/** The process-wide meter every match reports to. */
export const simMeter = createSimMeter();
