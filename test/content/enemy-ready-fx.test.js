// (fork) Enemy VFX audit, S rows: an enemy skill's ready glow (the official ReadyEnemySkillEffect) — the sim's
// b.snap fxs row 'ready:<prefabKey>' (enemies/helpers.js readyProbe) holds while the next attack is its Nth one and goes
// with that attack: Defense Crusher, Dockworker, Armorless Union Cleanup Squad. Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { fxStateView } from '../../server/sim/snapshot.js';

/** Three operators and enemy `key` held beside the defender, with HP for two cycles. */
function field(key) {
  const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_3_01_a', row: 10, col: 4 },
    { uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 6 }, { uid: 3, chessId: 'chess_char_2_01_a', row: 11, col: 5 }] });
  h.b.start(); h.step();
  h.b.enemyOverrides = { ...h.b.enemyOverrides, [key]: { stats: { maxHp: 1e8 } } };   // it lives through two cycles
  // held on the defender's tile (its stun lifts the block: a walking one would leave)
  return { h, e: h.spawn(key, { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 } }) };
}
const ready = (h, e, buff) => (fxStateView(e, h.b.time) || []).some((r) => r[0] === buff && r[1] === null);

for (const [key, buff, nth] of [['enemy_1045_hammer', 'ready:stuncombat', 3], ['enemy_1160_hvyslr', 'ready:stuncombat', 4],
  ['enemy_1183_mlasrt', 'ready:PowerAttack', 4]]) {
  test(`${key}: '${buff}' shows before its attack #${nth} and goes with it, then comes back`, () => {
    const { h, e } = field(key);
    assert.equal(ready(h, e, buff), false, 'not ready at first');
    assert.ok(h.runUntil(() => e.stats.attacks >= nth - 1, 90), `${nth - 1} attacks`);
    assert.equal(ready(h, e, buff), true, 'ready before the Nth');
    assert.ok(h.runUntil(() => e.stats.attacks >= nth, 30), 'the Nth attack');
    assert.equal(ready(h, e, buff), false, 'gone with it');
    assert.ok(h.runUntil(() => e.stats.attacks >= 2 * nth - 1, 60));
    assert.equal(ready(h, e, buff), true, 'ready again');
    checkInvariants(h.b);
  });
}

test("Dockworker: its ready-hit stun shows 'stun' (src: the Dockworker) on the target while the stun lasts", () => {
  const { h, e } = field('enemy_1160_hvyslr');
  const t = h.unit(2);
  const stunRow = () => (fxStateView(t, h.b.time) || []).filter((r) => r[0] === 'stun');
  assert.deepEqual(stunRow(), [], 'none at first');
  assert.ok(h.runUntil(() => stunRow().length > 0, 90), 'its Nth attack stunned');
  assert.deepEqual(stunRow(), [['stun', e.id, null]]);
  assert.ok(t.s.flags.stun, 'the target is stunned');
  assert.ok(h.runUntil(() => !t.s.flags.stun, 30), 'the stun ends');
  h.step();
  assert.deepEqual(stunRow(), [], 'gone with it');
  checkInvariants(h.b);
});

test("Defense Crusher: its stun shows no 'stun' row (its record has no such official mark)", () => {
  const { h, e } = field('enemy_1045_hammer');
  const t = h.unit(2);
  assert.ok(h.runUntil(() => t.s.flags.stun, 90), 'it stunned');
  assert.equal((fxStateView(t, h.b.time) || []).filter((r) => r[0] === 'stun' && r[1] === e.id).length, 0);
});
