// test/helpers/perf.js — the speed benchmarks (ms/tick bars, DESIGN §11) are skipped in a plain `npm test`: under the
// full suite's parallel load they miss their bars on a dev machine although the sim is well within them alone.
// Run them on their own with `npm run test:perf` (SP_PERF=1).
//
//   import { PERF } from '../helpers/perf.js';
//   test('benchmark: …', PERF, () => { … });

/** node:test options of a benchmark: skipped (with the way to run it) unless SP_PERF=1. */
export const PERF = process.env.SP_PERF === '1' ? {} : { skip: 'benchmark: run with `npm run test:perf`' };
