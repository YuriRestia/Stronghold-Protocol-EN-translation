// test/content/feedback5-wv-sources.test.js — 0.2.0 WV #4: the questions settled by the sources with no rule change, pinned.
//   * 忍冬 — PRTS's "无法选中被自身阻挡而没有位于技能范围内的敌人" is the 备注 of S2 坠刃拷问 (技能范围 3-12; WE1 read it as S3's): its
//     kit selects on the skill range only, so an enemy she blocks off that range is never one of its targets. S3 has no such
//     note (its client selector is the standard 「同时攻击阻挡的所有敌人」 one).
//   * 深靛 S1 灯塔守卫者 — PRTS 深靛 S1 备注 "该技能的"每次攻击的攻击倍率"会实时应用在特性积攒的"攻击能量"抛射物上" (the client's
//     ChargeAttackS1 reads the same `atk_scale`): an energy she stored lands with S1's attack@atk_scale × ATK, not the
//     branch's general 100 % (PRTS 分支特性信息 秘术师 "由储存能量形成的弹道造成攻击力100%的法术普通伤害").
//   (阿 S2 / S3 — no ally condition in the data: no skillTriggerDataList row for him or 怪杰, the skill prefab casts with no
//   target and keeps the SP spent — is pinned by test/content/op_haak.test.js "爆发剂 edge cases".)
// Run: node --test test/content/feedback5-wv-sources.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
const skillIndexOf = (id, skillId) => ds.rawChess(id).skills.find((s) => s.skillId === skillId).index;

test('#4 忍冬 S2 坠刃拷问 (PRTS 备注 "无法选中被自身阻挡而没有位于技能范围内的敌人"): an enemy she blocks off her 3-12 is never hit; the one inside is', () => {
  for (const id of ['chess_char_3_18_a', 'chess_char_3_18_b']) {
    const h = makeBattle({
      seed: 3, autoFinish: false, timeLimit: 60, hooks: ['damaged'], captureNoisy: true, defs: { enemies: { e: dummy('e') } },
      units: [{ chessId: id, row: 10, col: 5, skillIndex: skillIndexOf(id, 'skchr_vulpis_2') }],
    });
    h.step();
    const u = h.unit(id);
    const behind = h.spawn('e', { pos: [10, 4] });
    behind.x = 4.4;   // in contact (0.6 < 0.71) but on the tile behind her: off the 3-12
    h.step();
    assert.equal(behind.blockedBy, u, `${id}: she blocks it`);
    const inside = h.spawn('e', { pos: [10, 7] });
    h.step();
    assert.ok(u.skill.activate('test', { free: true }), `${id}: cast`);
    h.step();
    const hit = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('vulpisTorture'));
    assert.ok(hit.some((c) => c.target === inside), `${id}: the enemy inside the 3-12`);
    assert.ok(!hit.some((c) => c.target === behind), `${id}: not the blocked one off the skill range`);
    done(h);
  }
});

test('#4 深靛 S1 灯塔守卫者 (PRTS 备注): the energies she stored land with S1\'s attack@atk_scale × ATK, like its main hit', () => {
  const id = 'chess_char_1_17_a';
  const r = ds.rawChess(id);
  const rec = { ...r, talents: r.talents.map((t) => ({ ...t, bb: { ...t.bb, prob: 0 } })) };   // no random 柔光缚目 bind
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120, hooks: ['damaged', 'skillStart'], captureNoisy: true,
    defs: { chess: { [id]: rec }, enemies: { e: dummy('e') } },
    units: [{ chessId: id, row: 10, col: 4, skillIndex: skillIndexOf(id, 'skchr_indigo_1') }],
  });
  h.step();
  const u = h.unit(id);
  const scale = ds.getChess(id, { skillIndex: skillIndexOf(id, 'skchr_indigo_1') }).skill.bb['attack@atk_scale'];
  assert.ok(scale > 0 && scale < 1, 'S1 strikes below 100 %');
  assert.ok(h.runUntil(() => u.trait.stored === 3, 15), 'three energies stored with no target');
  u.skill.gainSp(999);
  h.spawn('e', { pos: [10, 6] });
  assert.ok(h.runUntil(() => u.skill.active, u.s.interval + 1), 'S1 cast as soon as an enemy is in her range (official SEARCH row, no attack needed)');
  assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source === u && c.dmg.isAttack), 4), 'the S1 attack lands');
  h.run(1);
  const first = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.isAttack);
  const id0 = first[0].dmg.attackId;
  const volley = first.filter((c) => c.dmg.attackId === id0);
  assert.equal(volley.length, 1 + 3, 'the S1 attack + its 3 energies');
  for (const c of volley) approx(c.amount, u.s.atk * scale, 'S1\'s 攻击倍率 on each');
  done(h);
});
