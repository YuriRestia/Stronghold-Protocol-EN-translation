// test/content/op_shu.test.js — the 自选 operator kit of 黍 (char_2025_shu, 6★ 守护者; kit
// server/sim/content/kits/ops/op-shu.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or GUA-X
// “钦天司时” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of that slot
// status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_shu.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { COLS } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const SHU = 'char_2025_shu';
const FORMS = BACKUPS.units[SHU].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const GUAX = 'uniequip_002_shu';
const S1 = 'skchr_shu_1', S2 = 'skchr_shu_2', S3 = 'skchr_shu_3';
const FARM = 'talent:shu:farm';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 1, mass: 0 }),
};
const ally = (id, o = {}) => chessRec({ id, skill: null, ...o, stats: { maxHp: 10000, atk: 0, def: 0, blockCnt: 0, respawnTime: 5, ...(o.stats || {}) } });
const ALLIES = {
  t_a: ally('t_a'), t_b: ally('t_b'), t_c: ally('t_c'), t_d: ally('t_d'),
  t_war: ally('t_war', { profession: 'WARRIOR' }), t_war2: ally('t_war2', { profession: 'WARRIOR' }), t_war3: ally('t_war3', { profession: 'WARRIOR' }),
  t_med: ally('t_med', { profession: 'MEDIC' }),
  t_sp: chessRec({ id: 't_sp', profession: 'WARRIOR', stats: { maxHp: 10000, atk: 0, def: 0, blockCnt: 0 },
    skill: { skillId: 'sk_t_sp', spType: 'INCREASE_WHEN_ATTACK', spCost: 99, initSp: 0, duration: 5 } }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, GUAX].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 黍 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5, enemies = [] } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: ALLIES }, timeLimit: 900, autoFinish: false, seed, enemies,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: SHU, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const healsBy = (h, u, f = () => true) => h.hooksOf('heal').filter((c) => c.source === u && !c.opts?.regen && f(c));
const sownOf = (u) => u.mem.shuSown ?? new Set();
const key = (r, c) => r * COLS + c;
/** GUA-X on this form: ×heal_scale on a target at or below hp_ratio. */
const guax = (u, ratio) => (u.def.raw.trait.bb.heal_scale && ratio <= u.def.raw.trait.bb.hp_ratio + 1e-9 ? u.def.raw.trait.bb.heal_scale : 1);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('黍 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, range 0-1, blocks 3, melee ground-only, 炎, no 特质; triggers (S3: TRY_SEARCH_ALLY_SKILL → SKILL_RANGE + allies on x-2)', () => {
  assert.equal(OPERATOR_KITS[SHU], KITS[SHU]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [SHU, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 10], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [3, 'melee', 'phys', false, 1.2], `${label(f)}: 守护者`);
      assert.deepEqual(u.liveRangeGrid, [[0, 0]], `${label(f)}: 0-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      const sk = form.skills[skill];
      if (skill === 0) assert.deepEqual([u.skill.rule, sk.trigger.rawRule, sk.skillType, u.skill.triggerAllies, u.skill.triggerHpAtMost], ['DEFAULT', 'DEFAULT', 'AUTO', true, 0.5], `${label(f)}: S1`);
      if (skill === 1) assert.deepEqual([u.skill.rule, sk.trigger.rawRule, sk.skillType, u.skill.triggerAllies], ['DEFAULT', 'TAKE_DAMAGE', 'MANUAL', false], `${label(f)}: S2 (the 重装 exception)`);
      if (skill === 2) {
        assert.deepEqual([sk.trigger.rule, sk.trigger.rawRule, sk.trigger.allies, sk.trigger.customRangeGrid, sk.skillType], ['SKILL_RANGE', 'TRY_SEARCH_ALLY_SKILL', true, sk.rangeGrid, 'MANUAL'], `${label(f)}: S3 data rule (build-data TRIGGER_ALLY_RULES)`);
        assert.deepEqual([u.skill.rule, u.skill.triggerAllies, u.skill.triggerGrid], ['SKILL_RANGE', true, sk.rangeGrid], `${label(f)}: S3 engine rule`);
      }
      done(h);
    }
  }
  // zh_CN numbers: E2 Lv1 2513 / 417 / 493, E2 Lv60 3110 / 475 / 565; GUA-X +160/+30/+30 → +270/+50/+50
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2513, 417, 3110, 475]);
  assert.deepEqual([modOf(5, GUAX).attr, modOf(6, GUAX).attr], [{ maxHp: 160, atk: 30, def: 30 }, { maxHp: 270, atk: 50, def: 50 }]);
});

test('a 自选 pick: 黍 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(SHU));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(SHU), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: SHU, skillIndex: 2, uniEquipId: GUAX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: SHU, skillIndex: 2, uniEquipId: GUAX } } });
});

test('S1 化被草木 (AUTO, DEFAULT + an ally of x-4 at ≤ half HP): her attack heals the lowest such ally for 130 % / 150 % ATK instead (×1.15 GUA-X); 1 / 2 charges; nothing for allies above half or outside x-4', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, GUAX]]) {
    const sk = skillOf(tier, elite, S1);
    const others = [{ uid: 2, chessId: 't_a', row: 11, col: 4 }, { uid: 3, chessId: 't_b', row: 9, col: 5 }, { uid: 4, chessId: 't_c', row: 12, col: 5 }];
    const { h, u } = field({ tier, elite, mod, skill: 0, others });
    assert.deepEqual([sk.bb.heal_scale, sk.maxChargeTime, sk.spCost, sk.rangeId], elite ? [1.5, 2, 5, 'x-4'] : [1.3, 1, 5, 'x-4'], `T${tier}`);
    const [a, b, c] = [h.unit(2), h.unit(3), h.unit(4)];
    const e = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC] });
    u.skill.gainSp(999, 'init');
    a.hp = a.s.maxHp * 0.6; b.hp = b.s.maxHp * 0.55; c.hp = c.s.maxHp * 0.1;
    h.run(3);
    assert.equal(u.skill.activations, 0, `T${tier}: nobody of x-4 at ≤ half (the one at 10 % is outside)`);
    assert.ok(h.hooksOf('damaged').some((x) => x.source === u && x.target === e), `T${tier}: she attacks meanwhile`);
    a.hp = a.s.maxHp * 0.3; b.hp = b.s.maxHp * 0.45;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `T${tier}: cast at her attack`);
    const first = healsBy(h, u)[0];
    assert.equal(first.target, a, `T${tier}: the lowest`);
    approx(first.amount, u.s.atk * sk.bb.heal_scale * guax(u, 0.3), `T${tier}: ${sk.bb.heal_scale * 100} % ATK`, 1e-3);
    const t0 = h.hooksOf('skillStart').find((x) => x.unit === u).t;
    assert.ok(!h.hooksOf('damaged').some((x) => x.source === u && x.target === e && Math.abs(x.t - t0) < 1e-9), `T${tier}: that attack was the heal`);
    assert.ok(sownOf(u).has(key(a.tileR, a.tileC)), `T${tier}: the heal sowed`);
    if (elite) {
      a.hp = a.s.maxHp;
      assert.ok(h.runUntil(() => u.skill.activations === 2, 5), 'the second charge on the next attack');
      assert.equal(healsBy(h, u)[1].target, b, 'the ally still at ≤ half');
    }
    done(h);
  }
});

test('S2 嘉禾盈仓 (data DEFAULT: casts at her attack on an enemy): 25 s, her attacks heal up to 2 injured allies of x-1 for ATK (+60 % / +90 %), block 3 + 1, interval 1.2 + 1.3 s, range x-1 meanwhile; T1 ×1.3 / ×1.4', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, GUAX]]) {
    const sk = skillOf(tier, elite, S2);
    const others = [{ uid: 2, chessId: 't_a', row: 10, col: 7 }, { uid: 3, chessId: 't_b', row: 12, col: 5 }, { uid: 4, chessId: 't_c', row: 9, col: 4 }, { uid: 5, chessId: 't_d', row: 12, col: 7 }];
    const { h, u } = field({ tier, elite, mod, skill: 1, others });
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.block_cnt, sk.bb.base_attack_time, sk.bb['attack@max_target'], sk.bb.extra_extend_scale, sk.rangeId], elite ? [25, 0.9, 1, 1.3, 2, 1.4, 'x-1'] : [25, 0.6, 1, 1.3, 2, 1.3, 'x-1'], `T${tier}`);
    const [a, b, c, d] = [h.unit(2), h.unit(3), h.unit(4), h.unit(5)];
    u.skill.gainSp(999, 'init');
    a.hp = a.s.maxHp * 0.4; b.hp = b.s.maxHp * 0.7; c.hp = c.s.maxHp * 0.9; d.hp = d.s.maxHp * 0.2;
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: injured allies alone do not cast it`);
    const e = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast at her attack`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: x-1 while it runs`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    assert.equal(u.s.blockCnt, 4, `T${tier}: block 3 + 1`);
    approx(u.s.bat, 2.5, `T${tier}: base attack time 1.2 + 1.3 s`);   // (T2: four WARRIOR here ⇒ ASPD +12 on top)
    const t0 = h.hooksOf('skillStart').find((x) => x.unit === u).t;
    assert.ok(h.runUntil(() => healsBy(h, u, (x) => x.t >= t0 - 1e-9).length >= 2, 4), `T${tier}: a heal attack (the cast's own attack)`);
    const hs = healsBy(h, u, (x) => x.t >= t0 - 1e-9);
    assert.deepEqual(hs.slice(0, 2).map((x) => x.target.id).sort(), [a.id, b.id].sort(), `T${tier}: the two lowest of x-1 (the one at 20 % is outside)`);
    for (const x of hs.slice(0, 2)) approx(x.amount, u.s.atk * guax(u, x.target === a ? 0.4 : 0.7), `T${tier}: ATK`, 1e-3);
    assert.ok(!h.hooksOf('damaged').some((x) => x.source === u && x.target === e && x.t > t0 + 0.01), `T${tier}: no attack on the enemy`);
    // T1 on her sown tiles ×extra_extend_scale while it runs
    h.run(0.3);
    const fb = a.findBuff(FARM);
    assert.ok(fb, `T${tier}: the healed ally stands on a sown tile`);
    const t0b = u.def.raw.talents.find((t) => t.index === 0).bb;
    approx(fb.mods.hpRegen, t0b.hp_recovery_per_sec * sk.bb.extra_extend_scale, `T${tier}: regeneration ×${sk.bb.extra_extend_scale}`);
    approx(a.findBuff('protect').data.value, t0b.damage_resistance * sk.bb.extra_extend_scale, `T${tier}: 庇护 ×${sk.bb.extra_extend_scale}`);
    assert.ok(h.runUntil(() => !u.skill.active, sk.duration + 1), `T${tier}: ends`);
    h.run(0.6);
    assert.deepEqual(u.liveRangeGrid, [[0, 0]], `T${tier}: back to 0-1`);
    approx(a.findBuff(FARM).mods.hpRegen, t0b.hp_recovery_per_sec, `T${tier}: regeneration back to ×1`);
    approx(u.s.bat, 1.2, `T${tier}: attack time back`);
    done(h);
  }
});

test('S3 离离枯荣 (SKILL_RANGE + an injured ally of x-2 — no enemy needed, an enemy alone does not cast it): range x-2, ATK +22 % / +34 %, every attack on an enemy also heals the most injured other ally for ATK; with no enemy her attack heals (herself included)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, GUAX]]) {
    const sk = skillOf(tier, elite, S3);
    const others = [{ uid: 2, chessId: 't_a', row: 12, col: 5 }, { uid: 3, chessId: 't_b', row: 12, col: 9 }];
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.e_atk, sk.bb.e_attack_speed, sk.bb.max_distance, sk.rangeId], elite ? [30, 0.34, 0.2, 20, 3, 'x-2'] : [30, 0.22, 0.15, 15, 4, 'x-2'], `T${tier}`);
    const [a, far] = [h.unit(2), h.unit(3)];
    u.skill.gainSp(999, 'init');
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    far.hp = far.s.maxHp * 0.2;
    h.run(3);
    assert.equal(u.skill.activations, 0, `T${tier}: an enemy and an injured ally outside x-2 do not cast it`);
    a.hp = a.s.maxHp * 0.6;
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: cast for the injured ally of x-2`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: x-2 while it runs`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    const t0 = h.hooksOf('skillStart').find((x) => x.unit === u).t;
    assert.ok(h.runUntil(() => h.hooksOf('damaged').some((x) => x.source === u && x.target === e && x.t > t0), 3), `T${tier}: she strikes the enemy 2 tiles ahead`);
    h.step();
    const hit = h.hooksOf('damaged').find((x) => x.source === u && x.target === e && x.t > t0);
    assert.deepEqual([hit.type, hit.dmg.isAttack], ['phys', true]);
    const hh = healsBy(h, u, (x) => x.t >= hit.t - 1e-9);
    assert.equal(hh[0]?.target, a, `T${tier}: the attack heals the injured ally`);
    approx(hh[0].amount, u.s.atk, `T${tier}: for ATK`, 1e-3);
    // she alone injured: an enemy attack heals nobody; with no enemy her attack heals her
    a.hp = a.s.maxHp;
    u.hp = u.s.maxHp * 0.7;
    const n0 = healsBy(h, u).length;
    h.run(3);
    assert.equal(healsBy(h, u).length, n0, `T${tier}: the attack-heal is for the others`);
    h.b.kill(e, u);
    assert.ok(h.runUntil(() => healsBy(h, u).length > n0, 3), `T${tier}: no enemy: a heal attack`);
    assert.equal(healsBy(h, u)[n0].target, u, `T${tier}: on herself`);
    assert.ok(h.hooksOf('attack').some((x) => x.attacker === u && x.targets[0] === u), `T${tier}: an attack (ASPD / 缴械 count)`);
    assert.ok(h.runUntil(() => !u.skill.active, sk.duration), `T${tier}: ends`);
    assert.deepEqual(u.liveRangeGrid, [[0, 0]], `T${tier}: back to 0-1`);
    done(h);
  }
});

test('S3 离离枯荣: a ground enemy on a sown tile ⇒ the operators of her range ATK +15 % / +20 % and ASPD +15 / +20 (no summon); a ground enemy entering a sown tile is put back there once it is max_distance (4 / 3) tiles away — until the skill ends', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const others = [{ uid: 2, chessId: 't_a', row: 11, col: 7 }, { uid: 3, chessId: 'chess_char_3_19_a', row: 12, col: 3 },
      { uid: 4, kind: 'token', tokenId: 'token_10028_vigil_wolf', ownerUid: 3, row: 11, col: 4 }];
    const { h, u } = field({ tier, elite, skill: 2, others });
    const a = h.unit(2), wolf = h.unit(4);
    // sow row 9 cols 6-8 around (9, 7) with a heal of hers (an ally there for the moment)
    h.b.relocate(a, 9, 7);
    h.b.heal(u, a, 1);
    h.b.relocate(a, 11, 7);
    for (const [r, c] of [[9, 6], [9, 7], [9, 8], [10, 7]]) assert.ok(sownOf(u).has(key(r, c)), `T${tier}: ${r},${c} sown`);
    a.hp = a.s.maxHp * 0.5;
    u.skill.gainSp(999, 'init');
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: cast`);
    h.step();
    assert.equal(a.findBuff('skill:shu:harvest'), null, `T${tier}: no enemy on a sown tile yet`);
    const w = h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => sownOf(u).has(key(Math.round(w.y), Math.round(w.x))), 15), `T${tier}: it reaches the sown tiles`);
    h.step(2);
    const hb = a.findBuff('skill:shu:harvest');
    assert.ok(hb, `T${tier}: an operator of her range`);
    assert.deepEqual(hb.mods, { atkPct: sk.bb.e_atk, aspd: sk.bb.e_attack_speed }, `T${tier}: +${sk.bb.e_atk * 100} % / +${sk.bb.e_attack_speed}`);
    assert.ok(u.findBuff('skill:shu:harvest'), `T${tier}: herself`);
    assert.equal(wolf.findBuff('skill:shu:harvest'), null, `T${tier}: not a summon`);
    const mark = u.mem.shuMarks.get(w.id);
    assert.deepEqual([mark.r, mark.c], [9, 8], `T${tier}: marked with the first sown tile it entered`);
    let farthest = 8, ported = false;
    for (let i = 0; i < 600 && !ported; i++) {
      h.step();
      const c = Math.round(w.x);
      if (c < farthest) farthest = c;
      if (c === 8 && farthest < 8) ported = true;
    }
    assert.ok(ported, `T${tier}: put back on its sown tile`);
    // the tile at max_distance is never seen after a tick: it is put back the tick it enters it
    assert.equal(farthest, 8 - sk.bb.max_distance + 1, `T${tier}: on entering the tile ${sk.bb.max_distance} tiles away`);
    assert.ok(h.eventsOf('fx').some((x) => x[1] === 'teleport'), `T${tier}: teleport fx`);
    // after the skill: no more teleports
    u.skill.end('test');
    h.step();
    assert.equal(u.mem.shuMarks, null, `T${tier}: the marks end with the skill`);
    let reachedGoal = false;
    for (let i = 0; i < 900 && !reachedGoal; i++) { h.step(); if (!w.alive || Math.round(w.x) <= 8 - sk.bb.max_distance - 1) reachedGoal = true; }
    assert.ok(reachedGoal, `T${tier}: it walks on`);
    done(h);
  }
});

test('T1 百谷长青: her heals sow the healed unit\'s tile and the 4 next to it (walkable / deployable tiles only); units on them regenerate 75 / s (85 GUA-X stage 3) and take 12 % (17 %) 庇护 — a 无法被治疗 unit and summons too; all gone when she leaves; GUA-X stage 3 sows her tile at the deployment', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const others = [{ uid: 2, chessId: 't_a', row: 9, col: 5 }, { uid: 3, chessId: 't_b', row: 12, col: 9 }, { uid: 4, chessId: 'chess_char_3_19_a', row: 12, col: 3 },
      { uid: 5, kind: 'token', tokenId: 'token_10028_vigil_wolf', ownerUid: 4, row: 10, col: 6 }];
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    const t0 = u.def.raw.talents.find((t) => t.index === 0);
    const x3 = elite && mod === GUAX && tier === 6;
    assert.deepEqual([t0.bb.hp_recovery_per_sec, t0.bb.damage_resistance, t0.bbStr?.born_range_id ?? null], x3 ? [85, 0.17, '0-1'] : [75, 0.12, null], label(f));
    assert.equal(sownOf(u).has(key(10, 5)), x3, `${label(f)}: her own tile sown at the deployment (GUA-X stage 3 only)`);
    const [a, b, wolf] = [h.unit(2), h.unit(3), h.unit(5)];
    a.hp = a.s.maxHp * 0.5;
    h.b.heal(u, a, 100);
    const s = sownOf(u);
    for (const [r, c] of [[9, 5], [10, 5], [9, 4], [9, 6]]) assert.ok(s.has(key(r, c)), `${label(f)}: ${r},${c}`);
    assert.ok(!s.has(key(8, 5)), `${label(f)}: 8,5 is no walkable / deployable tile (A)`);
    h.run(0.3);
    assert.deepEqual(a.findBuff(FARM)?.mods, { hpRegen: t0.bb.hp_recovery_per_sec }, `${label(f)}: 生命回复速度`);
    approx(a.findBuff('protect').data.value, t0.bb.damage_resistance, `${label(f)}: 庇护`);
    approx(a.s.physTakenMul, 1 - t0.bb.damage_resistance, `${label(f)}: physical ×${1 - t0.bb.damage_resistance}`);
    // a 无法被治疗 / 禁疗 unit still regenerates (an hpRegen attribute, no heal); a unit off the tiles gets nothing
    h.b.addBuff(a, { key: 'test:noheal', flags: { noHeal: true, healFree: true } });
    a.hp = a.s.maxHp * 0.5;
    const hp0 = a.hp;
    h.run(1);
    approx(a.hp - hp0, t0.bb.hp_recovery_per_sec, `${label(f)}: +${t0.bb.hp_recovery_per_sec} HP in 1 s`, 0.05);
    assert.equal(b.findBuff(FARM), null, `${label(f)}: off the tiles`);
    // a summon (the 禁疗 wolf: no heal of hers reaches it) on a tile her heal of a neighbour sowed
    h.b.relocate(b, 10, 7);
    b.hp = b.s.maxHp * 0.5;
    h.b.heal(u, b, 1);
    assert.ok(sownOf(u).has(key(wolf.tileR, wolf.tileC)), `${label(f)}: the wolf's tile sown`);
    h.run(0.3);
    assert.ok(wolf.findBuff(FARM), `${label(f)}: a summon on a sown tile`);
    // she leaves: every tile is cleared
    h.b.retreat(u);
    h.step();
    assert.equal(a.findBuff(FARM), null, `${label(f)}: cleared at once`);
    assert.equal(sownOf(u).size, 0, `${label(f)}: no sown tile left`);
    h.run(0.5);
    assert.equal(a.findBuff('protect'), null, `${label(f)}: 庇护 gone`);
    done(h);
  }
});

test('T2 天有四时: with her deployed, 3 professions on the field ⇒ every operator max HP +12 %, 3 operators of one profession ⇒ ASPD +12; 4 【岁】 in her squad ⇒ its operators ATK +12 % and 1 SP every 4 s, deployed or not', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const t1 = formOf(tier, elite).talents.find((t) => t.index === 1).bb;
    assert.deepEqual(t1, { max_hp: 0.12, attack_speed: 12, atk: 0.12, interval: 4, sp: 1 });
    // 黍 (TANK) + 2 WARRIOR + 1 MEDIC: three professions; no three of one
    {
      const others = [{ uid: 2, chessId: 't_war', row: 12, col: 3 }, { uid: 3, chessId: 't_war2', row: 12, col: 5 }, { uid: 4, chessId: 't_med', row: 12, col: 7 }];
      const { h, u } = field({ tier, elite, skill: 1, others });
      h.run(0.3);
      for (const x of [u, h.unit(2), h.unit(3), h.unit(4)]) {
        assert.deepEqual(x.findBuff('talent:shu:seasons:hp')?.mods, { hpPct: t1.max_hp }, `T${tier}: max HP +12 % (${x.defId})`);
        assert.equal(x.findBuff('talent:shu:seasons:aspd'), null, `T${tier}: no three of one`);
      }
      assert.equal(u.findBuff('talent:shu:sui'), null, `T${tier}: one 【岁】 only`);
      h.b.retreat(u);
      h.run(0.5);
      assert.equal(h.unit(2).findBuff('talent:shu:seasons:hp'), null, `T${tier}: only while she is deployed`);
      done(h);
    }
    // three WARRIOR: ASPD +12 (two professions only)
    {
      const others = [{ uid: 2, chessId: 't_war', row: 12, col: 3 }, { uid: 3, chessId: 't_war2', row: 12, col: 5 }, { uid: 4, chessId: 't_war3', row: 12, col: 7 }];
      const { h, u } = field({ tier, elite, skill: 1, others });
      h.run(0.3);
      for (const x of [u, h.unit(2)]) {
        assert.deepEqual(x.findBuff('talent:shu:seasons:aspd')?.mods, { aspd: t1.attack_speed }, `T${tier}: ASPD +12`);
        assert.equal(x.findBuff('talent:shu:seasons:hp'), null, `T${tier}: two professions`);
      }
      done(h);
    }
    // four 【岁】: 黍, 重岳 (自选), 夕, 余 — and an operator whose SP comes only from gifts
    {
      const others = [{ uid: 2, diy: { slot: 6, charId: 'char_2024_chyue', skillIndex: 0 }, row: 12, col: 3 },
        { uid: 3, chessId: 'chess_char_5_12_a', row: 9, col: 3 }, { uid: 4, chessId: 'chess_char_6_03_a', row: 11, col: 3 },
        { uid: 5, chessId: 't_sp', row: 12, col: 8 }];
      const { h, u } = field({ tier, elite, skill: 1, others });
      h.step();
      const sp = h.unit(5);
      for (const x of [u, h.unit(2), h.unit(3), h.unit(4), sp]) assert.deepEqual(x.findBuff('talent:shu:sui')?.mods, { atkPct: t1.atk }, `T${tier}: ATK +12 % (${x.defId})`);
      assert.equal(sp.skill.sp, 0);
      h.run(3.9);
      assert.equal(sp.skill.sp, 0, `T${tier}: nothing before 4 s`);
      h.run(0.2);
      assert.equal(sp.skill.sp, t1.sp, `T${tier}: +1 SP at 4 s`);
      h.b.retreat(u);
      h.run(4);
      assert.equal(sp.skill.sp, 2 * t1.sp, `T${tier}: on without her deployed`);
      done(h);
    }
  }
});

test('GUA-X “钦天司时”: her heals ×1.15 on a target at or below 50 % HP (stages 1 and 3), never above, never a regen tick; none without the module', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: 't_a', row: 12, col: 9 }] });
    const a = h.unit(2);
    const on = elite && mod === GUAX;
    if (on) assert.deepEqual(u.def.raw.trait.bb, { heal_scale: 1.15, hp_ratio: 0.5 }, label(f));
    a.hp = a.s.maxHp * 0.5;
    approx(h.b.heal(u, a, 1000), on ? 1150 : 1000, `${label(f)}: at 50 %`);
    a.hp = a.s.maxHp * 0.51;
    approx(h.b.heal(u, a, 1000), 1000, `${label(f)}: above 50 %`);
    done(h);
  }
});
