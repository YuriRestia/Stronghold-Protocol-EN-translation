// test/sim/hud-readouts.test.js — the optional b.snap lists behind the HP-bar readouts (R22-HUD; PR #303 and #378 by
// @IceCodeNew, PR #383 by @Convey123): `ammo` (a running ammo skill's rounds — 隐现's S2 holds 14 in the data), `wolves`
// (伺夜's 狼群 count) and, in test/content/op_hsgma2.test.js, `neg` (斩业星熊's 我执 pool). All three are display only: the
// nine-field unit tuples are unchanged and no sim state reads them. The client side is test/render/hud-readouts.test.js.
// Run: node --test test/sim/hud-readouts.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { unitInfo, unitTuple } from '../../server/sim/snapshot.js';

const DUMMY = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } };
const INSIDE = 'chess_char_1_01_a';   // 隐现: the chess skill index 1 is skchr_inside_2 (AMMO, attack@trigger_time 14)

test('隐现 S2: b.snap `ammo` carries the whole rounds left and the 14-round magazine of the data; the tuple keeps its SP fraction', () => {
  const h = makeBattle({
    defs: DUMMY, timeLimit: 200, seed: 7,
    units: [{ chessId: INSIDE, row: 10, col: 3 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 5] }],
  });
  const u = h.unit(INSIDE);
  const row = () => (h.b.snapshot().ammo || []).find((e) => e[0] === u.id);
  assert.equal(h.b.snapshot().ammo, undefined, 'no skill running: no list at all');
  assert.equal(unitInfo(u).ammoSkill, true, 'UnitInfo says the skill is an ammo magazine from the first appearance');
  assert.ok(h.runUntil(() => u.skill.active, 80));
  assert.equal(u.skill.kind, 'ammo');
  assert.equal(u.skill.ammoMax, 14, 'skill_table skchr_inside_2 attack@trigger_time at the chess skill level');
  // the activation tick already fired the first round
  assert.deepEqual(row(), [u.id, 13, 14]);
  const [, , , , , sp, spMax] = unitTuple(u, h.b.time);
  assert.ok(Math.abs(sp / spMax - 13 / 14) < 0.01, 'the 9-field tuple still runs the SP bar on the same fraction');
  assert.equal(h.b.snapshot().units.find((t) => t[0] === u.id).length, 9, 'the tuple is not widened');
  // every attack spends one round
  const before = u.skill.ammoLeft;
  assert.ok(h.runUntil(() => u.skill.ammoLeft < before, 10));
  assert.deepEqual(row(), [u.id, u.skill.ammoLeft, 14]);
  // a refill above the magazine raises it (拉特兰's extras, 逃犯引渡手续, refills: the activation's real total)
  u.skill.addAmmo(20);
  assert.deepEqual(row(), [u.id, u.skill.ammoLeft, u.skill.ammoMax]);
  assert.ok(u.skill.ammoMax > 14 && row()[1] === row()[2], 'full again at the new mark');
  // the skill ends with its last round: the list goes, the plain SP bar is back
  assert.ok(h.runUntil(() => !u.skill.active, 60));
  assert.equal(h.b.snapshot().ammo, undefined);
  checkInvariants(h.b);
  assert.deepEqual(h.b.errors, []);
});

test('ammo rows: whole numbers (a fractional count rounds up), allies only, living deployed units only; an operator without an ammo skill is no ammoSkill', () => {
  const h = makeBattle({
    defs: DUMMY, timeLimit: 200, seed: 7,
    units: [{ chessId: INSIDE, row: 10, col: 3 }, { chessId: 'chess_char_1_02_a', row: 11, col: 3 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 5] }],
  });
  const u = h.unit(INSIDE);
  h.run(0.5);
  assert.equal(unitInfo(h.unit('chess_char_1_02_a')).ammoSkill, undefined, 'a duration skill is not a magazine');
  assert.equal(unitInfo(h.enemy('enemy_dummy')).ammoSkill, undefined);
  assert.ok(h.runUntil(() => u.skill.active, 80));
  u.skill.ammoLeft = 6.2;                    // (a kit that spends a share of a round)
  const e = h.b.snapshot().ammo.find((r) => r[0] === u.id);
  assert.deepEqual(e, [u.id, 7, 14]);
  assert.ok(Number.isInteger(e[1]) && Number.isInteger(e[2]));
  u.deployed = false;                        // off the field: no row (the unit is not in the snapshot either)
  assert.equal(h.b.snapshot().ammo, undefined);
  u.deployed = true;
});

for (const placed of [false, true]) {
  test(`伺夜's ${placed ? 'placed' : 'automatic'} pack: b.snap \`wolves\` follows the 狼影 count (2 of 3, +1 per 25 s, one lost per lethal hit) and goes with the pack`, () => {
    const units = [{ chessId: 'chess_char_3_19_a', row: 12, col: 3, uid: 1 }];
    if (placed) units.push({ kind: 'token', tokenId: 'token_10028_vigil_wolf', ownerUid: 1, row: 11, col: 5, uid: 2 });
    const h = makeBattle({
      units, timeLimit: 120,
      defs: { enemies: { enemy_d: enemyRec({ key: 'enemy_d', hp: 1e9, speed: 0, atk: 0 }) } },
      enemies: [{ key: 'enemy_d', pos: [1, 1] }],
    });
    h.run(0.2);
    const w = h.b.allyUnits.find((u) => u.defId === 'token_10028_vigil_wolf');
    const count = () => (h.b.snapshot().wolves || []).find((e) => e[0] === w.id);
    assert.deepEqual(count(), [w.id, 2, 3], '初始两只, at most 3 (the talent text)');
    assert.equal(h.b.snapshot().wolves.length, 1, 'only the pack has the row: 伺夜 herself does not');
    h.run(25);
    assert.deepEqual(count(), [w.id, 3, 3], '+1 every 25 s');
    for (const left of [2, 1]) {
      h.b.dealDamage(null, w, { amount: 1e9, type: 'true' });
      assert.deepEqual(count(), [w.id, left, 3], 'a lethal hit spends one 狼影 and refills the HP');
    }
    h.b.dealDamage(null, w, { amount: 1e9, type: 'true' });
    assert.equal(w.alive, false, 'the last 狼影: 战术点形态 (the pack is out of the fight)');
    assert.equal(count(), undefined, 'a pack in that form shows no pips');
    h.run(26);
    assert.deepEqual(count(), [w.id, 1, 3], 'back after the 狼影 interval with one 狼影');
    h.b.retreat(h.unit('chess_char_3_19_a'), { reason: 'expired', permanent: true });
    assert.equal(h.b.snapshot().wolves, undefined, 'the pack leaves with its owner');
    assert.deepEqual(h.b.errors, []);
  });
}
