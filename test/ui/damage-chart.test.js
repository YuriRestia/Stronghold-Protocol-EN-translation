// The damage chart's numbers (ui/gameLogic/damage.js) and the round log (ui/damageLog.js): copies of one operator add to
// one bar, a summon counts for its summoner, each round keeps its last reading after the runner drops its battle, a new
// match clears the log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupDamage, totalDamage, damageKey, rowsTotal, sameRows } from '../../public/js/ui/gameLogic/damage.js';
import { createDamageLog } from '../../public/js/ui/damageLog.js';
import { createStore, initialState } from '../../public/js/store.js';

const op = (defId, dmg, extra = {}) => ({ kind: 'op', defId, dmg, ...extra });

test('groupDamage: copies and the elite form share a bar, summons count for their summoner, most damage first', () => {
  const rows = groupDamage([
    op('chess_char_1_01_a', 100),
    op('chess_char_1_01_b', 250),
    op('chess_char_2_03_a', 400),
    { kind: 'token', defId: 'token_x', dmg: 50, by: { kind: 'op', defId: 'chess_char_1_01_a' } },
    { kind: 'token', defId: 'token_free', dmg: 7 },
    op('chess_char_3_02_a', 0),
  ]);
  assert.deepEqual(rows.map((r) => [r.key, r.dmg]), [
    ['chess_char_1_01_a', 400], ['chess_char_2_03_a', 400], ['token:token_free', 7], ['chess_char_3_02_a', 0],
  ]);
  assert.equal(rows[0].defId, 'chess_char_1_01_b', 'the bar draws the elite copy');
  assert.equal(rows[2].kind, 'token');
  assert.equal(rowsTotal(rows), 807);
});

test('groupDamage: two 自选 slots holding different operators are two bars; a 补位 stand-in keeps its mark', () => {
  const rows = groupDamage([
    op('chess_diy_1_a', 10, { diy: { charId: 'char_a' } }),
    op('chess_diy_1_a', 20, { diy: { charId: 'char_b' } }),
    op('chess_diy_1_b', 5, { diy: { charId: 'char_a' } }),
    op('chess_char_4_01_a', 30, { standInFor: 'char_z' }),
  ]);
  assert.deepEqual(rows.map((r) => [r.key, r.dmg]), [['chess_char_4_01_a', 30], ['chess_diy_1_a|char_b', 20], ['chess_diy_1_a|char_a', 15]]);
  assert.equal(rows[0].standInFor, 'char_z');
  assert.deepEqual(rows[2].diy, { charId: 'char_a' });
  assert.equal(damageKey(null), null);
  assert.deepEqual(groupDamage(null), []);
  assert.deepEqual(groupDamage([null, { kind: 'op' }, op('chess_char_1_01_a', NaN)]).map((r) => r.dmg), [0]);
});

test('totalDamage: one bar per operator over the match, split into its rounds in round order', () => {
  const rows = totalDamage({
    2: groupDamage([op('chess_char_1_01_a', 100), op('chess_char_2_03_a', 30)]),
    1: groupDamage([op('chess_char_1_01_a', 40)]),
    3: groupDamage([op('chess_char_2_03_a', 500), op('chess_char_1_01_b', 0)]),
  });
  assert.deepEqual(rows.map((r) => [r.key, r.dmg]), [['chess_char_2_03_a', 530], ['chess_char_1_01_a', 140]]);
  assert.deepEqual(rows[0].parts, [{ round: 2, dmg: 30 }, { round: 3, dmg: 500 }]);
  assert.deepEqual(rows[1].parts, [{ round: 1, dmg: 40 }, { round: 2, dmg: 100 }], 'a round without damage has no segment');
  assert.equal(rows[1].defId, 'chess_char_1_01_b');
  assert.deepEqual(totalDamage(null), []);
});

test('sameRows compares the bars', () => {
  const a = groupDamage([op('chess_char_1_01_a', 1)]);
  assert.ok(sameRows(a, groupDamage([op('chess_char_1_01_a', 1)])));
  assert.ok(!sameRows(a, groupDamage([op('chess_char_1_01_a', 2)])));
  assert.ok(!sameRows(a, undefined));
});

function logRig() {
  const store = createStore(initialState);
  let units = null;
  const resultFns = [];
  const runner = { damageUnits: (id) => (id === 'p_0' ? units : null), on: (t, fn) => { if (t === 'result') resultFns.push(fn); return () => {}; } };
  const ivs = [];
  const log = createDamageLog({ runner, store, setIv: (fn) => { ivs.push(fn); return ivs.length; }, clearIv: () => {} });
  const phase = (p, round) => store.set({ me: { ...store.get().me, playerId: 'p_0' }, match: { ...store.get().match, public: { phase: p, round } } });
  return { store, log, phase, setUnits: (u) => { units = u; }, result: () => resultFns.forEach((fn) => fn()) };
}

test('damageLog: live readings in combat, the last reading kept once the battle is dropped, every round in the history', () => {
  const r = logRig();
  r.phase('PREP', 1);
  assert.equal(r.log.get().round, null);
  r.phase('COMBAT', 1);
  assert.equal(r.log.get().round, 1);
  r.setUnits([op('chess_char_1_01_a', 50)]);
  r.log.poll();
  assert.equal(r.log.get().history[1][0].dmg, 50);
  r.setUnits([op('chess_char_1_01_a', 120)]);
  r.result(); // the battle ended between two readings
  assert.equal(r.log.get().history[1][0].dmg, 120);
  r.phase('SETTLE', 1);
  assert.equal(r.log.get().round, 1, 'SETTLE still shows the round just fought');
  r.setUnits(null); // the runner drops the battle in the next prep
  r.phase('PREP', 2);
  assert.equal(r.log.get().round, null);
  assert.equal(r.log.get().history[1][0].dmg, 120, 'the round keeps its last reading');
  r.phase('COMBAT', 2);
  r.setUnits([op('chess_char_2_03_a', 9)]);
  r.log.poll();
  assert.deepEqual(Object.keys(r.log.get().history), ['1', '2']);
  r.phase('RESULT', 2);
  assert.equal(r.log.get().round, null);
  assert.equal(Object.keys(r.log.get().history).length, 2, 'the result screen still has the match');
});

test('damageLog: a new match (its briefing, or a rejoin into an earlier round) clears the log; notifies on change only', () => {
  const r = logRig();
  let calls = 0;
  r.log.subscribe(() => { calls++; });
  r.phase('COMBAT', 3);
  r.setUnits([op('chess_char_1_01_a', 5)]);
  r.log.poll();
  const n = calls;
  r.log.poll();
  assert.equal(calls, n, 'the same reading: no notification');
  r.phase('PREP', 4);
  r.phase('COMBAT', 1);
  assert.deepEqual(r.log.get().history, {}, 'an earlier round than the log holds: a new match');
  r.log.poll();
  assert.ok(r.log.get().history[1]);
  r.phase('INFO_CHECK', 0);
  assert.deepEqual(r.log.get().history, {});
});
