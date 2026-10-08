// `npm run test:perf` — the speed benchmarks that a plain `npm test` skips (test/helpers/perf.js), on their own so the
// rest of the suite does not load the machine: SP_PERF=1 node --test <the benchmark tests>.
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, [
  '--test', '--test-concurrency=1', '--test-name-pattern=^(benchmark|performance):',
  'test/sim/perf.test.js', 'test/sim/robustness.test.js',
], { stdio: 'inherit', env: { ...process.env, SP_PERF: '1' } });
process.exit(r.status ?? 1);
