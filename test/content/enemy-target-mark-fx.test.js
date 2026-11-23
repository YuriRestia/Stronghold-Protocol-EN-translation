// (fork) Enemy VFX audit, S rows: official marks an enemy leaves on the operators it hits — OpFor: Quagmire's parasite
// glow on its host and Degenbrecher's second-form SP-clear mark (b.snap fxs rows, STATE_BUFFS + the talents'
// targetRows). Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

/** Three operators (a defender on [9, 6]) and enemy `key` held on the defender's tile with HP to spare. */
function field(key, hp = 1e8) {
  const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_3_01_a', row: 10, col: 4 },
    { uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 6 }, { uid: 3, chessId: 'chess_char_2_01_a', row: 11, col: 5 }] });
  h.b.start(); h.step();
  h.b.enemyOverrides = { ...h.b.enemyOverrides, [key]: { stats: { maxHp: hp } } };
  return { h, e: h.spawn(key, { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 } }) };
}
const rows = (h, u, buff) => (fxStateView(u, h.b.time) || []).filter((r) => r[0] === buff);

test("OpFor: Quagmire: its host shows 'enemy_acelem[to_parasitic]' (src: it) while it clings, and loses it when it dies", () => {
  const { h, e } = field('enemy_9007_acelem');
  const host = h.unit(2);
  assert.ok(h.runUntil(() => rows(h, host, 'enemy_acelem[to_parasitic]').length > 0, 10), 'it latched on');
  assert.deepEqual(rows(h, host, 'enemy_acelem[to_parasitic]'), [['enemy_acelem[to_parasitic]', e.id, null]]);
  assert.equal(STATE_BUFFS['enemy_acelem[to_parasitic]'], true);
  h.b.kill(e, null);
  h.step();
  assert.deepEqual(rows(h, host, 'enemy_acelem[to_parasitic]'), [], 'gone with it');
  checkInvariants(h.b);
});

test("Degenbrecher: no SP-clear mark in its first form; in its second, each operator it disarms shows 'enemy_blkswb_s[effect]' while disarmed", () => {
  const { h, e } = field('enemy_1525_blkswb', 1e6);
  for (const a of e.mem.ab.list) if (a.id === 'blink' || a.id === 'blink2') a.cond = () => false;   // it stays to fight
  const ops = [1, 2, 3].map((n) => h.unit(n));
  h.b.loseHp(e, e.s.maxHp * 0.3);
  h.b.dealDamage(null, e, { amount: 1, type: 'true' });
  assert.ok(ops.every((u) => rows(h, u, 'enemy_blkswb_s[effect]').length === 0), 'first form: none');
  h.b.kill(e, null);
  assert.ok(h.runUntil(() => e.form === 'form2', 30), 'its second form');
  h.run(5);
  h.b.loseHp(e, e.s.maxHp * 0.3);
  h.b.dealDamage(null, e, { amount: 1, type: 'true' });
  const marked = ops.filter((u) => u.s.flags.disarm);
  assert.ok(marked.length > 0, 'someone disarmed');
  for (const u of ops) assert.deepEqual(rows(h, u, 'enemy_blkswb_s[effect]'), u.s.flags.disarm ? [['enemy_blkswb_s[effect]', e.id, null]] : []);
  assert.equal(STATE_BUFFS['enemy_blkswb_s[effect]'], true);
  assert.ok(h.runUntil(() => !marked[0].s.flags.disarm, 30), 'the disarm ends');
  h.step();
  assert.deepEqual(rows(h, marked[0], 'enemy_blkswb_s[effect]'), [], 'gone with it');
  checkInvariants(h.b);
});
