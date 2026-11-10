// test/content/feedback5-we2-area-triggers.test.js — 0.2.0 WE2 #16: kit-side larger-range triggers where no data range can
// carry the area (a MANUAL skill whose effect reaches farther than the operator's own range casts as soon as an enemy is
// inside that larger area):
//   * 谬因 S2 临界瞬爆 — the beam's unbounded path (O1's report): content trigger range = the path she would fire along now,
//     on top of the official row [ATTACK_RANGE_ENEMY, SKILL_RANGE_ENEMY] (data SEARCH);
//   * 薇薇安娜 S3 “明灭” — from its second cast of a deployment on 3-2 (O11's report): the official list
//     [COMBAT_OR_ATTACK, SKILL_RANGE_ENEMY] = [DEFAULT, SKILL_RANGE 1-1]; once the first cast ended the kit points the
//     list's SKILL_RANGE at the 3-2 (op-vvana.js skillRangeTo), the data's 1-1 again at her next deployment.
// Run: node --test test/content/feedback5-we2-area-triggers.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

/** `charId` as uid 1 at (row, col) facing RIGHT with skill `skill`. */
function field(charId, { skill, row, col, tier = 5, seed = 5 }) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpInit: 99, dpPerSec: 0, dpMax: 999, startOpCooldown: 0 }, hooks: ['skillStart', 'skillEnd'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId, skillIndex: skill, uniEquipId: null }, elite: false, row, col }],
  });
  h.step();
  return { h, u: h.unit(1) };
}

test('#16 谬因 S2: an enemy on the beam\'s line beyond her own 6 tiles casts it (data SEARCH alone would wait); one off the line does not', () => {
  // her own range (9, 2) … (9, 7); the beam reaches the end of the row
  {
    const { h, u } = field('char_4229_aphris', { skill: 1, row: 9, col: 2 });
    assert.deepEqual(u.skill.rules, ['SEARCH']);
    assert.equal(u.skill.triggerRanges.length, 1, 'the beam path is a content trigger range');
    h.spawn('enemy_dummy', { pos: [10, 12] });   // off the line
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, 'off the line: no cast');
    h.spawn('enemy_dummy', { pos: [9, 13] });    // on the line, far beyond (9, 7)
    assert.ok(h.runUntil(() => u.skill.activations === 1, 1), 'on the beam\'s line: cast');
    done(h);
  }
  // a flyer on the line too (the beam hits air units)
  {
    const { h, u } = field('char_4229_aphris', { skill: 1, row: 9, col: 2 });
    h.spawn('enemy_fly', { pos: [9, 14] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 1));
    done(h);
  }
  // S1 / S3 get no such range
  for (const skill of [0, 2]) {
    const { h, u } = field('char_4229_aphris', { skill, row: 9, col: 2 });
    assert.equal(u.skill.triggerRanges.length, 0, `S${skill + 1}`);
    done(h);
  }
});

test('#16 薇薇安娜 S3: the first cast of a deployment by the data\'s list [DEFAULT, SKILL_RANGE 1-1]; once it ended, an enemy on the 3-2 beyond her own reach casts the next one (the list\'s SKILL_RANGE on 3-2); a redeploy goes back to the 1-1', () => {
  const { h, u } = field('char_4098_vvana', { skill: 2, row: 10, col: 3 });
  const dataGrid = [[0, 0], [0, 1]];
  const listGrid = () => u.skill.alsoRules.map((e) => [e.rule, e.grid]);
  assert.deepEqual(u.skill.rules, ['DEFAULT', 'SKILL_RANGE']);
  assert.deepEqual(listGrid(), [['SKILL_RANGE', dataGrid]], 'the official list: COMBAT_OR_ATTACK, SKILL_RANGE_ENEMY on the data\'s 1-1');
  // (10, 6): on her 3-2 (cols 3–6), outside her own 1-1 (cols 3–4)
  const far = h.spawn('enemy_dummy', { pos: [10, 6] });
  u.skill.gainSp(999);
  h.run(2);
  assert.equal(u.skill.activations, 0, 'first cast: the list reads her own 1-1 — the far enemy does not cast it');
  // an enemy in her own range: the first cast; then let it run out
  const near = h.spawn('enemy_dummy', { pos: [10, 4] });
  assert.ok(h.runUntil(() => u.skill.activations === 1, 3), 'first cast');
  assert.ok(h.runUntil(() => !u.skill.active, 30), 'it ends');
  assert.deepEqual(listGrid(), [['SKILL_RANGE', [[0, 0], [0, 1], [0, 2], [0, 3]]]], 'from now on the list\'s SKILL_RANGE reads the 3-2');
  assert.deepEqual(u.skill.rules, ['DEFAULT', 'SKILL_RANGE']);
  h.b.kill(near, null);
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations === 2, 4), 'the far enemy alone casts the second one');
  void far;
  // a redeploy: the count and the rule start again
  assert.ok(h.runUntil(() => !u.skill.active, 40));
  h.b.retreat(u, { reason: 'retreat' });
  h.step();
  assert.ok(h.b.redeploy(u, { free: true }));
  h.step();
  assert.deepEqual(u.skill.rules, ['DEFAULT', 'SKILL_RANGE']);
  assert.deepEqual(listGrid(), [['SKILL_RANGE', dataGrid]], 'the next deployment: the data\'s 1-1');
  done(h);
});
