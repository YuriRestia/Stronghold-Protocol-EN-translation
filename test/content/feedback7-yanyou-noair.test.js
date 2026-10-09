// test/content/feedback7-yanyou-noair.test.js — 炎佑 is a flying ally (PRTS “炎佑” 行动方式 飞行): the enemy effects PRTS marks
// 不可对空 never reach it (community report: 炎祐好像吃到了不该吃到的地面伤害). The death blasts of 高能源石虫 / 冰爆源石虫 /
// 卷心籽 ("…无视迷彩，不可对空"), 水遁忍者's 漩涡形态 ("每秒对半径1.0范围内的所有我方单位造成…（无视迷彩，不可对空）"), “萨科塔昂首”'s
// 祈祷邀约 ("令全场我方单位（不可对空，无视迷彩）获得15s【受邀祈祷】"), 鼎沸's pulses ("攻击范围内的所有我方单位每秒受到…（不可对空）")
// and the attack of “斩胄之剑” / “破胄之锤” ("普通攻击对攻击范围内的所有我方单位造成…物理普通伤害，不可对空") took it until 0.2.1; a
// ground operator in reach still does.
// Run: node --test test/content/feedback7-yanyou-noair.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { spawnYanyou } from '../../server/sim/content/tokens.js';

/** 角峰 on (10,5), the 炎佑 dragon moved onto (10,6). */
function field(seed = 4) {
  const h = makeBattle({ timeLimit: 60, autoFinish: false, seed, hooks: ['damaged'], captureNoisy: true,
    units: [{ uid: 1, chessId: 'chess_char_1_02_a', row: 10, col: 5 }] });
  h.step();
  const dragon = spawnYanyou(h.b, 'p1', { count: 1 })[0];
  assert.ok(dragon && dragon.isFlying, 'a flying ally');
  assert.ok(h.b.relocate(dragon, 10, 6));
  return { h, dragon, op: h.unit(1) };
}
const still = (e) => { e.base.moveSpeed = 0; e.s.moveSpeed = 0; };
const tough = (e) => { e.base.maxHp = 1e9; e.s.maxHp = 1e9; e.hp = 1e9; };
/** Damage `src` dealt to `t` other than its normal attacks. */
const taken = (h, t, src) => h.hooksOf('damaged').filter((c) => c.target === t && c.source === src && !c.dmg?.isAttack).reduce((s, c) => s + c.amount, 0);

for (const [name, key, prep] of [
  ['高能源石虫', 'enemy_1021_bslime', null],
  ['冰爆源石虫', 'enemy_1067_snslime', null],
  ['卷心籽 (ignited)', 'enemy_10065_ftzlc', (e) => { e.mem.ab.ignited = true; }],
]) {
  test(`${name}'s death blast (不可对空) spares 炎佑 and still hits a ground operator`, () => {
    const { h, dragon, op } = field();
    const e = h.spawn(key, { pos: [10, 6] });
    still(e);
    if (prep) prep(e);
    h.step();
    const hp0 = dragon.hp;
    h.b.dealDamage(null, e, { amount: e.hp + 10, type: 'true', tags: ['test'] });
    h.run(0.3);
    assert.equal(e.alive, false);
    assert.ok(taken(h, op, e) > 0, 'the ground operator is hit');
    assert.equal(taken(h, dragon, e), 0, 'the flyer is not');
    assert.equal(dragon.hp, hp0);
    if (key === 'enemy_1067_snslime') {
      assert.ok(op.findBuff('cold'), '寒冷 on the ground operator');
      assert.equal(dragon.findBuff('cold'), null, 'no 寒冷 on the flyer');
    }
    checkInvariants(h.b);
  });
}

test('水遁忍者\'s 漩涡形态 (不可对空) hits the ground operator beside it, never 炎佑', () => {
  const { h, dragon, op } = field(6);
  const e = h.spawn('enemy_10116_ymgtop', { pos: [10, 6] });
  still(e);
  tough(e);
  assert.ok(h.runUntil(() => taken(h, op, e) > 0, 40), 'the vortex reached the operator');
  h.run(3);
  assert.equal(taken(h, dragon, e), 0);
  checkInvariants(h.b);
});

test('“萨科塔昂首”\'s 祈祷邀约 (不可对空) slows the ground operator, not 炎佑', () => {
  const { h, dragon, op } = field(7);
  const e = h.spawn('enemy_10085_hllevi_2', { pos: [10, 8] });
  still(e);
  tough(e);
  assert.ok(h.runUntil(() => !!op.findBuff('ab:roar'), 40), 'the ground operator is invited');
  assert.equal(dragon.findBuff('ab:roar'), null);
  checkInvariants(h.b);
});

for (const [name, key] of [['鼎沸', 'enemy_10054_cjhot'], ['“斩胄之剑”', 'enemy_9014_acstma'], ['“破胄之锤”', 'enemy_9015_acstmb']]) {
  test(`${name} (不可对空) hits the ground operator beside it, never 炎佑`, () => {
    const { h, dragon, op } = field(8);
    const e = h.spawn(key, { pos: [10, 6] });
    still(e);
    tough(e);
    h.run(12);
    const dealt = (t) => h.hooksOf('damaged').filter((c) => c.target === t && c.source === e).reduce((s, c) => s + c.amount, 0);
    assert.ok(dealt(op) > 0, 'the ground operator is hit');
    assert.equal(dealt(dragon), 0, 'the flyer is not');
    checkInvariants(h.b);
  });
}
