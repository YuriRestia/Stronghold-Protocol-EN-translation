// #440: special targeting (a summon-blocked remote target her attacks select) opens her skills, without extending S2 links.
// Since 2026-11-10 her S1 / S2 follow the official CASTER row (ATTACK_RANGE_ENEMY or SKILL_RANGE_ENEMY: SEARCH — the
// client polls the attack trigger's Search every 0.2 s, AutoChessBattleTrigger), so such a target opens the skill at once,
// not at her next attack as the basic strategy's DEFAULT did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { COLS } from '../../server/sim/constants.js';

function field(skillIndex, kind = 'unite') {
  const h = makeBattle({ kind, timeLimit: 90, autoFinish: false, seed: 5,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['skillStart', 'damaged'], captureNoisy: true,
    defs: { enemies: { weak: enemyRec({ key: 'weak', hp: 100, speed: 0, mass: 0 }),
      walker: enemyRec({ key: 'walker', hp: 1e9, speed: 0.5, mass: 0 }) } },
    units: [{ uid: 1, elite: true, row: 10, col: 3,
      diy: { slot: 'chess_char_6_diy1_a', charId: 'char_450_necras', skillIndex, uniEquipId: null } }],
  });
  h.step();
  const u = h.unit(1);u.skill.sp = 0;
  const weak = h.spawn('weak', { pos: [10, 6] });h.step();h.b.kill(weak, null);h.run(0.2);
  const summon = u.mem.necras.skels.find((s) => s.alive);assert.ok(summon);
  const e = h.spawn('walker', { pos: [10, 9] });
  assert.ok(h.runUntil(() => e.blockedBy === summon, 20));h.step(3);
  const key = Math.round(e.y) * COLS + Math.round(e.x);
  assert.ok(!u.baseRangeKeys.includes(key) && u.extraRangeKeys.includes(key));
  return { h, u, e, summon };
}
function done(h) { checkInvariants(h.b);assert.deepEqual(h.b.errors, []); }
for (const kind of ['normal', 'unite']) for (const skillIndex of [0, 1]) {
  test(`Necras S${skillIndex + 1} starts at once against a summon-blocked remote target, before her next attack (${kind})`, () => {
    const { h, u, e } = field(skillIndex, kind);
    assert.deepEqual(u.skill.rules, ['SEARCH'], 'the CASTER row: no 技能范围, so the attack range');
    u.skill.gainSp(999);u.atkCd = 0.7;
    h.run(0.3);assert.equal(u.skill.activations, 1, 'the remote target in her attack trigger opens it with her attack still cooling down');
    assert.ok(u.atkCd > 0, 'cast between attacks');
    h.run(0.6);assert.equal(u.skill.activations, 1, 'one cast');
    if (skillIndex === 1) assert.ok(!u.mem.necrasLinks?.some((l) => l.e === e), 'remote trigger does not extend S2 effect range');
    done(h);
  });
}
test('remote Necras trigger needs a selectable enemy and the owning summon', () => {
  const { h, u, e, summon } = field(1);
  e.base.moveSpeed = 0;e.markDirty();
  h.b.applyStatus(e, 'sleep', { duration: 5 });u.skill.gainSp(999);u.atkCd = 0;
  h.run(1);assert.equal(u.skill.activations, 0, 'a sleeping remote target cannot open it');
  h.b.retreat(summon, { reason: 'test' });
  h.run(5);assert.equal(u.skill.activations, 0, 'expired block does not retain an extra trigger');
  done(h);
});
