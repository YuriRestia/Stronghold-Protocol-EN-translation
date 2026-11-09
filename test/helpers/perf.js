// test/helpers/perf.js — the speed benchmarks (ms/tick bars, DESIGN §11) are skipped in a plain `npm test`: under the
// full suite's parallel load they miss their bars on a dev machine although the sim is well within them alone.
// Run them on their own with `npm run test:perf` (SP_PERF=1).
//
//   import { PERF } from '../helpers/perf.js';
//   test('benchmark: …', PERF, () => { … });

/** node:test options of a benchmark: skipped (with the way to run it) unless SP_PERF=1. */
export const PERF = process.env.SP_PERF === '1' ? {} : { skip: 'benchmark: run with `npm run test:perf`' };

/**
 * (fork) SP_PERF=1: the run is `npm run test:perf`, alone on the machine. A browser test's speed bar (an fps floor, a
 * per-frame JS budget) is checked only then; the browser suite runs its files side by side, where Chrome's frame rate
 * follows the machine's load, not the code. Outside it the same test still checks that frames are drawn at all.
 *
 *   if (PERF_ON) assert.ok(st.fps > 30, `fps ${st.fps}`); else assert.ok(st.fps > 0, `frames drawn (fps ${st.fps})`);
 */
export const PERF_ON = process.env.SP_PERF === '1';
