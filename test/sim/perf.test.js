// Performance: a normal battle with ~70 enemies + 10 operators must average < 0.5 ms per tick (DESIGN §11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../server/sim/Battle.js';
import { getDefaultSource, spawnsFromTemplate } from '../../server/sim/simdata.js';
import { PERF } from '../helpers/perf.js';

const ds = getDefaultSource();
const quiet = { error() {}, warn() {} };
const LINEUP = [
  ['chess_char_1_02_a', 9, 7], ['chess_char_2_09_a', 9, 4], ['chess_char_4_09_a', 12, 5], ['chess_char_3_08_a', 12, 7],
  ['chess_char_1_01_a', 10, 4], ['chess_char_1_03_a', 11, 4], ['chess_char_2_02_a', 12, 4], ['chess_char_2_14_a', 10, 5],
  ['chess_char_5_12_a', 11, 5], ['chess_char_6_13_a', 9, 8],
];

function build(spawns, routes, timeLimit, seed = 7) {
  return new Battle({
    seed, kind: 'normal', stageId: 'act2autochess_m01', routes, spawns, timeLimit, logger: quiet, quiet: true,
    players: [{ playerId: 'p', units: LINEUP.map(([chessId, row, col], i) => ({ uid: i + 1, kind: 'chess', chessId, row, col, abs: true })) }],
  });
}

test('benchmark: 70-enemy wave (h05) + 10 operators < 0.5 ms/tick average', PERF, () => {
  const tpl = ds.getWave('act1autochess_h05');
  const { routes, spawns, maxPlayTime } = spawnsFromTemplate(tpl, { mods: { hpMul: 3 } });
  // warm-up (JIT)
  for (let i = 0; i < 2; i++) { const w = build(spawns, routes, maxPlayTime, i + 100); while (!w.finished) w.step(); }
  const b = build(spawns, routes, maxPlayTime);
  let n = 0, maxAlive = 0;
  const t0 = performance.now();
  while (!b.finished) {
    b.step();
    n++;
    if (n % 3 === 0) { b.snapshot(); b.drainEvents(); }
    if (b.enemies.length > maxAlive) maxAlive = b.enemies.length;
  }
  const avg = (performance.now() - t0) / n;
  // eslint-disable-next-line no-console
  console.log(`bench wave: ${n} ticks, total ${b.total} enemies, peak ${maxAlive} alive, avg ${(avg * 1000).toFixed(1)} µs/tick, reason ${b.reason}`);
  assert.ok(b.total >= 60);
  assert.ok(avg < 0.5, `avg ${avg} ms/tick`);
});

test('benchmark: worst case — 70 enemies alive at once + 10 operators < 0.5 ms/tick', PERF, () => {
  const tpl = ds.getWave('act1autochess_h05');
  const { routes } = spawnsFromTemplate(tpl);
  const keys = ['enemy_1422_lrsldr', 'enemy_1427_lrnazg', 'enemy_1005_yokai', 'enemy_1042_frostd', 'enemy_1425_lrcmra', 'enemy_1040_bombd'];
  const spawns = [];
  for (let i = 0; i < 70; i++) spawns.push({ time: (i % 10) * 0.2, enemyKey: keys[i % keys.length], routeIndex: i % routes.length, mods: { hpMul: 10 } });
  for (let i = 0; i < 2; i++) { const w = build(spawns, routes, 20, 50 + i); while (!w.finished) w.step(); }
  const b = build(spawns, routes, 60);
  let n = 0;
  const t0 = performance.now();
  while (!b.finished && b.time < 40) { b.step(); n++; if (n % 3 === 0) { b.snapshot(); b.drainEvents(); } }
  const avg = (performance.now() - t0) / n;
  // eslint-disable-next-line no-console
  console.log(`bench worst: ${n} ticks, ${b.enemies.length} alive at end, avg ${(avg * 1000).toFixed(1)} µs/tick`);
  assert.ok(avg < 0.5, `avg ${avg} ms/tick`);
});
