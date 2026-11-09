// `npm run test:perf` — the speed benchmarks that a plain `npm test` skips (test/helpers/perf.js), on their own so the
// rest of the suite does not load the machine: SP_PERF=1 node --test <the benchmark tests>, (fork) the bot prep CPU guard
// (test/match/bot-smarter.test.js) among them.
//
// (fork) With RENDER_E2E=1 (Chrome and the downloaded assets, as those files need) it then runs the browser files that
// hold speed bars — fps floors, per-frame JS budgets, 4× throttled scenes — whole and one at a time, with SP_PERF=1: the
// browser suite (tools/browser-suite.mjs) runs them side by side, where only their functional checks hold.
import { spawnSync } from 'node:child_process';
import { BROWSER_PERF_FILES } from './browser-suite.mjs';

const run = (args) => spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, SP_PERF: '1' } }).status ?? 1;

let status = run([
  '--test', '--test-concurrency=1', '--test-name-pattern=^(benchmark|performance):',
  'test/sim/perf.test.js', 'test/sim/robustness.test.js',
  // (fork) the bot prep CPU guard (a late-round 4-bot prep under 300 ms of CPU), load-sensitive like the benchmarks
  'test/match/bot-smarter.test.js',
]);
if (process.env.RENDER_E2E === '1') {
  // whole files: a floor can sit inside a functional test (board3d's per-view fps), so no name pattern
  const browser = run(['--test', '--test-concurrency=1', ...BROWSER_PERF_FILES]);
  status = status || browser;
} else {
  console.log(`(the browser speed bars need RENDER_E2E=1 and Chrome: ${BROWSER_PERF_FILES.join(', ')})`);
}
process.exit(status);
