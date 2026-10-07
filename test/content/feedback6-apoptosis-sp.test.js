// PR #262 (#261 its closed duplicate): an operator's 凋亡 burst — PRTS 元素 "立即获得等时长的阻回、静默，该阻回、静默持续期间
// 每秒损失1点技力并受到100点无来源法术持续伤害" — drains the official 技力, stored charges included: PRTS 技能 可充能 "当持有者
// 的技力流失时，充能次数也会实时降低". The drain took only the SP towards the next charge, so a full skill (sp = cost with
// every charge stored) kept all its charges — a one-charge skill stayed ready through the whole burst. An active timed
// skill is left alone (its SP was spent at the cast; Skill.setSpTotal leaves it too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const SNOW = 'chess_char_3_11_b'; // 精锐 雪猎: S2 风雪连弩, MANUAL, 可充能2次, 14 SP per charge

function arena(units, defs = {}) {
  const h = makeBattle({ defs, units, autoFinish: false, timeLimit: 120, hooks: ['spGain', 'damaged'] });
  h.step();
  return h;
}
const burst = (h, u) => {
  h.b.dealDamage(null, u, { type: 'element', element: 'apoptosis', amount: u.gaugeMax });
  assert.ok(u.findBuff('apoptosisBurst'), '凋亡 bursts');
};

test('PR #262: 凋亡 drains a charge skill\'s stored charges — 精锐 雪猎 with both charges loses one at the first second and is empty after 15', REAL, () => {
  const h = arena([{ chessId: SNOW, row: 10, col: 4 }]);
  const u = h.unit(SNOW), sk = u.skill;
  assert.equal(sk.maxCharges, 2);
  const cost = sk.spCost;
  sk.setSpTotal(2 * cost);
  assert.deepEqual([sk.charges, sk.sp, sk.spTotal], [2, cost, 2 * cost], 'both charges stored');
  burst(h, u);
  h.run(1.01);
  assert.deepEqual([sk.charges, sk.sp, sk.spTotal], [1, cost - 1, 2 * cost - 1], 'one second: −1 技力, the second charge goes');
  assert.equal(sk.ready, true, 'one charge left');
  h.run(14);
  // (the burst ends with its 15th second: the time SP of the ticks since then is back)
  assert.equal(sk.charges, 0, '15 seconds: −15 技力 — the last charge gone too');
  assert.ok(Math.abs(sk.spTotal - (2 * cost - 15)) < 0.1, `${sk.spTotal} ≈ ${2 * cost - 15}`);
  assert.equal(sk.ready, false);
  assert.equal(sk.activations, 0, '静默: no cast through the burst');
  assert.ok(!u.findBuff('apoptosisBurst'), 'the burst is over');
  checkInvariants(h.b);
});

test('PR #262: a full one-charge skill is no longer ready after the first second of 凋亡; an active timed skill keeps its state', () => {
  const op = chessRec({ id: 't_apo', stats: { maxHp: 1e5, spRecovery: 0 }, skill: { spCost: 20, initSp: 0, duration: 30, durationType: 'NONE' } });
  const h = arena([{ chessId: 't_apo', row: 10, col: 4, uid: 1 }, { chessId: 't_apo', row: 10, col: 6, uid: 2 }], { chess: { t_apo: op } });
  const a = h.unit(1), b = h.unit(2);
  a.skill.setSpTotal(20);
  assert.equal(a.skill.ready, true);
  burst(h, a);
  h.run(1.01);
  assert.deepEqual([a.skill.charges, a.skill.sp, a.skill.ready], [0, 19, false], 'the ready charge is part of the 技力 it loses');
  h.run(14);
  assert.equal(a.skill.spTotal, 5, '−15 技力 in all');
  assert.equal(h.hooksOf('spGain').length, 0, 'the drain is no SP gain (no spGain hook)');
  // a running timed skill: its SP was spent at the cast — nothing to drain, and it runs on (the burst silences new casts only)
  b.skill.setSpTotal(20);
  assert.ok(b.skill.activate('test'));
  const before = [b.skill.active, b.skill.charges, b.skill.sp];
  burst(h, b);
  h.run(3);
  assert.deepEqual([b.skill.active, b.skill.charges, b.skill.sp], before);
  checkInvariants(h.b);
});
