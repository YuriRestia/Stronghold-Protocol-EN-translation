// test/sim/feedback5-cb3-pins.test.js — community reports of 2026-10-06 that this tree already answers (stream CB3; they pass
// on the parent commit — nothing changed for them), pinned:
//   item 2 「敌人在干员铃兰技能范围内没有开技能，在攻击范围才开」 — 铃兰's default S3 狐火渺然 ("攻击范围扩大") was on the basic
//     strategy up to 0.1.4 (DEFAULT: an enemy in her own 2-tile range); the live client's official list
//     [COMBAT_OR_ATTACK, SKILL_RANGE_ENEMY] (official-skill-triggers.json) casts it with an enemy inside its skill range y-8
//     (3 tiles ahead): DEFAULT, then SKILL_RANGE on y-8.
//   item 16.1 「突袭转职玛恩纳…攻击范围里有怪的时候即使长时间没攻击也不会突袭」 — the bond text itself: "干员10秒内未进行攻击或技能
//     就绪时，若范围内没有敌人，则…再部署": a 解放者 never attacks with his skill off, so his 10 s are always met, and an enemy in
//     his range is the one thing that holds the jump — as for every member.
//   item 16.4 「归鲨被吃的时候不是变替身而是进了再部署」 — an 阿戈尔 devour mark on 归溟幽灵鲨 switches her to her 替身 (normal, 联防,
//     boss fields); never a knock-out (a sweep of 400 random chains on this tree and v0.1.2–v0.1.4: 0).
//   item 46 「荒芜拉普兰德开技能之后好像没有普攻了…叙拉古恐惧概率不高」 — during her default S3 every drone is out chasing (PRTS
//     技能流程), so she makes no attack of her own; her attacks come back when it ends. 叙拉古 6's proc is PRTS's pseudo-random
//     rule: 0.139 % per 普通伤害 attempt, +0.139 % per miss, shared by the player's members (3 % on average).
// Run: node --test test/sim/feedback5-cb3-pins.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { prdConstant } from '../../server/sim/content/bonds/core.js';

const ds = getDefaultSource();
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, atk: 0, ...o });

test('item 2 — 铃兰 S3 狐火渺然: DEFAULT + SKILL_RANGE on its y-8; casts with an enemy 3 tiles ahead (outside her own range), not 4', () => {
  for (const id of ['chess_char_5_10_a', 'chess_char_5_10_b']) {
    const rec = ds.rawChess(id);
    const s3 = rec.skills.find((s) => s.skillId === 'skchr_lisa_3');
    assert.deepEqual([rec.skill.skillId, s3.trigger.rule, s3.trigger.rawRule, s3.trigger.official], ['skchr_lisa_3', 'DEFAULT', 'COMBAT_OR_ATTACK', ['COMBAT_OR_ATTACK', 'SKILL_RANGE_ENEMY']], `${id}: her default S3`);
    assert.deepEqual(s3.trigger.also.map((e) => e.rule), ['SKILL_RANGE'], `${id}: the skill-range entry`);
    assert.ok(!rec.rangeGrid.some(([r, c]) => r === 0 && c === 3) && s3.trigger.also[0].customRangeGrid.some(([r, c]) => r === 0 && c === 3), `${id}: 3 ahead is in y-8 only`);
    const casts = (pos) => {
      const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, defs: { enemies: { enemy_pin: dummy('enemy_pin') } }, units: [{ chessId: id, row: 10, col: 4 }] });
      h.step();
      const u = h.unit(id);
      u.skill.gainSp(999, 'test');
      h.spawn('enemy_pin', { pos });
      h.run(3);
      checkInvariants(h.b);
      return u.skill.activations;
    };
    assert.equal(casts([10, 7]), 1, `${id}: 3 tiles ahead`);
    assert.equal(casts([10, 8]), 0, `${id}: not 4 tiles ahead`);
  }
});

test('item 16.1 — a 突袭 玛恩纳 (变形同构体 + 突袭手雷): no jump while an enemy stays in his range ("若范围内没有敌人"); at once when none is', () => {
  const h = makeBattle({
    seed: 5, autoFinish: false, timeLimit: 120, hooks: ['deploy'], bonds: { raidShip: { count: 3, active: true, tier: 1, layers: 1 } },
    defs: { enemies: { enemy_pin: dummy('enemy_pin') } },
    units: [{ chessId: 'chess_char_5_19_a', row: 10, col: 4, items: ['chess_item_6_09_e_a', 'chess_item_3_11_e_a'] }],
  });
  h.step();
  const u = h.unit('chess_char_5_19_a');
  const near = h.spawn('enemy_pin', { pos: [10, 5] });
  h.spawn('enemy_pin', { pos: [12, 8] });
  const jumps = () => h.hooksOf('deploy').filter((c) => c.unit === u && !c.initial).length;
  h.run(20);
  assert.equal(u.lastAttackAt, -Infinity, 'a 解放者 makes no attack with his skill off (his 10 s are met)');
  assert.equal(jumps(), 0, 'an enemy in his range: no jump');
  h.b.kill(near, null);
  assert.ok(h.runUntil(() => jumps() > 0, 1), 'none in range: he jumps at once');
  checkInvariants(h.b);
});

test('item 16.4 — 归溟幽灵鲨 devoured by an 阿戈尔 (normal, 联防, boss): her 替身 at full HP, never knocked out', () => {
  for (const kind of ['normal', 'unite', 'boss']) {
    for (const g of ['chess_char_5_13_a', 'chess_char_5_13_b']) {
      const row = kind === 'boss' ? 2 : 10;
      const h = makeBattle({
        kind, seed: 4, autoFinish: false, timeLimit: 60, captureNoisy: true, hooks: ['damaged', 'death'],
        bonds: { egirShip: { count: 2, active: true, tier: 1, layers: 0 } },
        players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: 'chess_char_2_07_a', row: kind === 'boss' ? 9 : 10, col: 4 }, { uid: 2, kind: 'chess', chessId: g, row: kind === 'boss' ? 9 : 10, col: 5 }], bonds: { egirShip: { count: 2, active: true, tier: 1, layers: 0 } } }],
      });
      h.step();
      const u = h.unit(g);
      assert.equal(u.tileR, row, `${kind}: on the field`);
      assert.equal(h.hooksOf('damaged').filter((c) => c.target === u && (c.dmg?.tags || []).includes('bond:egir:devour')).length, 1, `${kind} ${g}: one devour mark`);
      assert.ok(u.alive && u.trait.doll && u.form === 'doll', `${kind} ${g}: her 替身`);
      assert.ok(Math.abs(u.hp - u.s.maxHp) < 1e-6, `${kind} ${g}: at full HP`);
      assert.equal(h.hooksOf('death').filter((c) => c.unit === u).length, 0, `${kind} ${g}: no knock-out`);
      checkInvariants(h.b);
    }
  }
});

test('item 46 — 荒芜拉普兰德 S3: no attack of her own while her drones are out (they hit), attacks again after; 叙拉古 6 = PRTS\'s 0.139 % pseudo-random', () => {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120, captureNoisy: true, hooks: ['attack', 'damaged', 'skillStart', 'skillEnd'],
    defs: { enemies: { enemy_pin: dummy('enemy_pin', { atk: 50 }) } }, units: [{ chessId: 'chess_char_6_18_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_pin', pos: [10, 4] }],
  });
  const u = () => h.unit('chess_char_6_18_a');
  assert.ok(h.runUntil(() => u().skill.active, 60), 'S3 cast');
  const t0 = h.b.time;
  const attacks = () => h.hooksOf('attack').filter((c) => c.attacker === u()).length;
  assert.ok(h.runUntil(() => !u().skill.active, 45), 'S3 over');
  const t1 = h.hooksOf('skillEnd').filter((c) => c.unit === u()).at(-1).t;
  const n0 = attacks();
  // (the tick that ends the skill already attacks again: strictly inside the window)
  assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u() && c.t > t0 + 1e-9 && c.t < t1 - 1e-9).length, 0, 'no attack of her own during S3');
  assert.ok(h.hooksOf('damaged').some((c) => c.source === u() && c.t > t0 && (c.dmg.tags || []).includes('droneAttack')), 'her drones hit');
  h.run(5);
  assert.ok(attacks() > n0, 'her attacks resume after the skill');
  checkInvariants(h.b);
  const c = prdConstant(0.03);
  assert.ok(Math.abs(c - 0.00139) < 0.00001, `叙拉古 6 PRD constant ${c} ≈ PRTS 0.139 %`);
  assert.ok(Math.ceil(1 / c) <= 722, 'a proc by the 722nd attempt at the latest (PRTS: 720 with the rounded 0.139 %)');
});
