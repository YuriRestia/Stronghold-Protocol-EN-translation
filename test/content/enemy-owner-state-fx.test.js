// (fork) Enemy VFX audit, S rows: an enemy skill's buff whose moment the client never sees, signalled by the sim (b.snap
// fxs → render/vfx/skills.js STATE_BUFFS, from the enemy's skill plan): 'Armor Cleaver''s dizzy loop while it is shot
// down (its [special_stun]), Sarkaz Absurdist Tyrant Captain's AOEDamage hits on the target of its splashing first
// attack. Display only.
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
const rows = (u, buff, t) => (fxStateView(u, t) || []).filter((r) => r[0] === buff);

test("'Armor Cleaver': shot down, it shows acstma_s_1 (its dizzy loop) for as long as it is downed", () => {
  const { h, e } = field('enemy_9014_acstma');
  assert.ok(h.runUntil(() => e.buffs.some((b) => b.key === 'boss:downed'), 60), 'it was shot down');
  assert.deepEqual(rows(e, 'acstma_s_1', h.b.time), [['acstma_s_1', null, null]]);
  assert.ok(h.runUntil(() => !e.alive || !e.buffs.some((b) => b.key === 'boss:downed'), 30));
  if (e.alive) assert.deepEqual(rows(e, 'acstma_s_1', h.b.time), [], 'gone with the downed state');
  checkInvariants(h.b);
});

test('Sarkaz Absurdist Tyrant Captain: its splashing first attack shows enemy_wdrrl[AOE_attack] on its target for 0.7 s', () => {
  const { h, e } = field('enemy_1320_wdrrl_2');
  const marked = () => h.b.allyUnits.find((u) => rows(u, 'enemy_wdrrl[AOE_attack]', h.b.time).length);
  assert.ok(h.runUntil(() => !!marked(), 60), 'its first attack splashed');
  const u = marked(), t0 = h.b.time;
  assert.deepEqual(rows(u, 'enemy_wdrrl[AOE_attack]', t0), [['enemy_wdrrl[AOE_attack]', e.id, null]]);
  assert.deepEqual(rows(u, 'enemy_wdrrl[AOE_attack]', t0 + 0.71), [], 'over after the template\'s 0.7 s');
  checkInvariants(h.b);
});

test('the client plays these buffs as state rows', () => {
  for (const k of ['acstma_s_1', 'acstmb_s_1', 'enemy_wdrrl[AOE_attack]']) assert.equal(STATE_BUFFS[k], true, k);
});
