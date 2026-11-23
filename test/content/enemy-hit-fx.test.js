// (fork) Enemy VFX audit, S rows: enemy skill blows the kit deals itself (no 'atk' event), sent as fx 'tick' with the
// skill plan's attack hit key — the Corrupted Knight's charged hammer, 'Armor of the Empire''s multi-hit — and the
// knights' TriggerRage glow (a b.snap fxs row, STATE_BUFFS). Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

/** Three operators (a defender blocking route 0) and enemy `key` spawned on route 0. */
function field(key) {
  const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_3_01_a', row: 10, col: 4 },
    { uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 6 }, { uid: 3, chessId: 'chess_char_2_01_a', row: 11, col: 5 }] });
  h.b.start(); h.step();
  return { h, e: h.spawn(key, { route: 0 }) };
}
const ticksOf = (h, id) => h.events.filter((ev) => ev[0] === 'fx' && ev[1] === 'tick' && ev[4]?.id === id).map((ev) => ev[4]);

test("Corrupted Knight: its charged hammer sends its two hit rows' ticks on the blocker", () => {
  const { h, e } = field('enemy_1513_dekght');
  assert.ok(h.runUntil(() => { h.step(0); return ticksOf(h, e.id).length > 0; }, 90), 'a charged blow came');
  const blocker = h.unit(2);
  assert.deepEqual(ticksOf(h, e.id).slice(0, 2).map((t) => [t.on, t.skill, t.key]), [
    [blocker.id, 'dekght:charge', 'dekght_skill_01_hit'], [blocker.id, 'dekght:charge', 'dekght_skill_01_range']]);
  checkInvariants(h.b);
});

test("Corrupted Knight / Withered Knight: the one left rages, showing dekght[trigger_rage] on itself", () => {
  const { h, e } = field('enemy_1513_dekght');
  const partner = h.spawn('enemy_1513_dekght_2', { route: 0 });
  h.step();
  assert.equal((fxStateView(e, h.b.time) || []).filter((r) => r[0] === 'dekght[trigger_rage]').length, 0, 'no rage yet');
  h.b.kill(partner, null);
  h.step();
  assert.deepEqual((fxStateView(e, h.b.time) || []).filter((r) => r[0] === 'dekght[trigger_rage]'), [['dekght[trigger_rage]', null, null]]);
  assert.equal(STATE_BUFFS['dekght[trigger_rage]'], true);
  checkInvariants(h.b);
});

test("'Armor of the Empire': its MultiCombat blow sends one tick of its hit row on the target", () => {
  const { h, e } = field('enemy_10027_vtsk');
  assert.ok(h.runUntil(() => { h.step(0); return ticksOf(h, e.id).length > 0; }, 120), 'a multi-hit came');
  const [t] = ticksOf(h, e.id);
  assert.deepEqual([t.skill, t.key], ['vtsk:multi', 'enemy_vtsk_skill_02_hit_01']);
  assert.ok(h.b.allyUnits.some((u) => u.id === t.on), 'on an operator');
  checkInvariants(h.b);
});
