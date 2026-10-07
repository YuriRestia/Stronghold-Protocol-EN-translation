// test/content/op_typhon.test.js — the 自选 operator kit of 提丰 (char_2012_typhon, 6★ 攻城手; kit
// server/sim/content/kits/ops/op-typhon.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, SIE-X
// 自然的包容, SIE-Y 冰原的影子 or ISW-A 提丰特限证章 at stage 1 (tier 5) / 3 (tier 6). Every number is read back from
// data/backups.json (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_typhon.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const TYPHON = 'char_2012_typhon';
const FORMS = BACKUPS.units[TYPHON].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SIEX = 'uniequip_002_typhon', SIEY = 'uniequip_003_typhon', ISWA = 'uniequip_004_typhon';
const S1 = 'skcom_quickattack[3]', S2 = 'skchr_typhon_2', S3 = 'skchr_typhon_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_light: dummy('enemy_light', { mass: 1 }), enemy_mid: dummy('enemy_mid', { mass: 2 }), enemy_heavy: dummy('enemy_heavy', { mass: 3 }),
  enemy_plate: dummy('enemy_plate', { mass: 1, def: 600 }), enemy_fly: dummy('enemy_fly', { mass: 1, motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.8, mass: 3 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SIEX, SIEY, ISWA].map((m) => [t, true, m]))];

/** A battle with 提丰 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 3, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: TYPHON, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
const atkHits = (h, u) => hitsBy(h, u).filter((c) => c.dmg?.isAttack);
const rainHits = (h, u) => hitsBy(h, u).filter((c) => c.dmg?.tags?.includes('typhon:rain'));
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

test('提丰 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes (SIE-Y ASPD), 4-3 range, ranged physical arrows that hit air, heaviest first, no 特质', () => {
  assert.equal(OPERATOR_KITS[TYPHON], KITS[TYPHON]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [TYPHON, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 100 + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.priority, u.base.bat], [1, 'ranged', 'phys', true, 'heaviest', 2.4], `${label(f)}: 攻城手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 4-3`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [BACKUPS.diy.operators[TYPHON].bonds, []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // E2 Lv1 1310 / 901 / 92, E2 Lv60 1570 / 1019 / 106; SIE-X +120 HP / +60 ATK → +210 / +90, SIE-Y +70 ATK / +5 ASPD → +94 / +7,
  // ISW-A +100 / +70 → +150 / +90
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1310, 901, 1570, 1019]);
  assert.deepEqual([modOf(5, SIEX).attr, modOf(6, SIEX).attr, modOf(5, SIEY).attr, modOf(6, SIEY).attr, modOf(5, ISWA).attr, modOf(6, ISWA).attr],
    [{ maxHp: 120, atk: 60 }, { maxHp: 210, atk: 90 }, { atk: 70, aspd: 5 }, { atk: 94, aspd: 7 }, { maxHp: 100, atk: 70 }, { maxHp: 150, atk: 90 }]);
});

test('a 自选 pick: 提丰 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks (ISW-A, a 集成战略 module, is refused)', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(TYPHON));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(TYPHON), `tier ${t}`);
  assert.equal(validateDiyPicks({ [SLOT[6]]: { charId: TYPHON, skillIndex: 1, uniEquipId: ISWA } }, { data, kitted: KITTED_CHARS }).error, 'BAD_TARGET',
    'a 集成战略 module (ISW-A) is not a 自选 choice (shared/diy.js, W5K)');
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: TYPHON, skillIndex: 1, uniEquipId: SIEX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: TYPHON, skillIndex: 1, uniEquipId: SIEX } } });
});

test('trait 攻城手: the heaviest enemy of her range first; a flyer is a target', () => {
  const { h, u } = field({ tier: 6, elite: true });
  const light = h.spawn('enemy_light', { pos: [10, 5] }), heavy = h.spawn('enemy_heavy', { pos: [9, 6] });
  h.run(3);
  assert.equal(atkHits(h, u)[0].target, heavy);
  h.b.kill(heavy, null);
  h.b.kill(light, null);
  const fly = h.spawn('enemy_fly', { pos: [11, 5] });
  h.run(3);
  assert.ok(atkHits(h, u).some((c) => c.target === fly), '可对空');
  done(h);
});

test('S1 迅捷打击·γ型 (MANUAL, data DEFAULT): ATK +27 % / +34 %, ASPD +25 / +35 for 35 s; SP 42 / 39 from 5 / 10', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.spCost, u.skill.initSp, sk.duration, sk.bb.atk, sk.bb.attack_speed],
      ['DEFAULT', 'duration', elite ? 39 : 42, elite ? 10 : 5, 35, elite ? 0.34 : 0.27, elite ? 35 : 25], `T${tier}`);
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    h.spawn('enemy_light', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 4));
    approx(u.skill.timeLeft, 35, `T${tier}: 35 s`, 0.01);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    assert.equal(u.s.aspd, 100 + sk.bb.attack_speed, `T${tier}: ASPD`);
    h.runUntil(() => !u.skill.active, 36);
    assert.deepEqual([u.s.atk, u.s.aspd], [u.base.atk, 100], `T${tier}: back`);
    done(h);
  }
});

test('S2 冰原秩序: ATK +26 % / +35 %, two arrows per attack — two enemies when there are two, both at a lone one — each with 40 % to stun 1 s; 20 s on the first cast of a deployment, then 持续时间无限 until she leaves (a redeploy counts again)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1, seed: 9 });
    assert.deepEqual([u.skill.rule, u.skill.kind, sk.duration, sk.bb.first_duration, sk.bb.atk, sk.bb['attack@prob'], sk.bb['attack@stun'], u.skill.spCost, u.skill.initSp],
      ['DEFAULT', 'toggle', 20, 20, elite ? 0.35 : 0.26, 0.4, 1, elite ? 51 : 53, elite ? 40 : 37], `T${tier}`);
    const lone = h.spawn('enemy_light', { pos: [10, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast`);
    const t0 = h.b.time;
    approx(u.skill.timeLeft, 20, `T${tier}: first cast 20 s`, 0.05);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    h.run(5);
    const s2 = atkHits(h, u).filter((c) => c.dmg.isSkill);
    const byAttack = Map.groupBy(s2, (c) => c.dmg.attackId);
    assert.ok(byAttack.size >= 2, `T${tier}: attacks`);
    for (const list of byAttack.values()) assert.deepEqual(list.map((c) => c.target), [lone, lone], `T${tier}: both arrows at the lone enemy`);
    const other = h.spawn('enemy_mid', { pos: [11, 6] });
    h.run(5);
    const later = atkHits(h, u).filter((c) => c.dmg.isSkill && c.t > h.b.time - 4.5);
    for (const list of Map.groupBy(later, (c) => c.dmg.attackId).values()) {
      assert.deepEqual(list.map((c) => c.target).sort((a, b) => a.id - b.id), [lone, other].sort((a, b) => a.id - b.id), `T${tier}: two different enemies`);
    }
    assert.ok(h.runUntil(() => !u.skill.active, 15), `T${tier}: the first cast ends`);
    approx(h.b.time - t0, 20, `T${tier}: after 20 s`, 0.05);
    // the second cast never ends
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: second cast`);
    assert.equal(u.skill.timeLeft, Infinity, `T${tier}: 持续时间无限`);
    h.run(120);
    assert.ok(u.skill.active, `T${tier}: still on after 120 s`);
    // the stun: 40 % of the arrows, 1 s
    const all = atkHits(h, u).filter((c) => c.dmg.isSkill);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun');
    assert.ok(all.length > 100, `T${tier}: ${all.length} arrows`);
    assert.ok(stuns.length / all.length > 0.32 && stuns.length / all.length < 0.48, `T${tier}: ${stuns.length} / ${all.length} stuns ≈ 40 %`);
    for (const c of stuns) approx(c.duration, 1, `T${tier}: 1 s`);
    // a redeploy counts its casts again
    h.b.retreat(u);
    h.b.redeploy(u);
    assert.ok(!u.skill.active && u.deployed, `T${tier}: back on the field, skill off`);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast after the redeploy`);
    approx(u.skill.timeLeft, 20, `T${tier}: the first cast of this deployment — 20 s again`, 0.05);
    done(h);
  }
});

test('S3 “永恒狩猎”: 7 / 8 rounds, attack interval 2.4 + 3.1 s; the mark on the heaviest enemy of her own range; range 全场 but attacks only with an enemy in the mark area (radius 1.3); each round 4 arrows 0.1 s apart on random enemies of the area, 145 % / 160 % ATK physical skill hits (no attack), 0.4 s stun once they land', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, seed: 7 });
    assert.deepEqual([u.skill.rule, u.skill.kind, sk.durationType, sk.bb['attack@s3_trigger_time'], sk.bb.base_attack_time, sk.bb['attack@s3_atk_scale'], sk.bb['attack@s3_max_hit_num'], sk.bb['attack@s3_stun'], u.skill.spCost, u.skill.initSp],
      ['DEFAULT', 'ammo', 'AMMO', elite ? 8 : 7, 3.1, elite ? 1.6 : 1.45, 4, 0.4, elite ? 43 : 47, 25], `T${tier}`);
    const marked = h.spawn('enemy_heavy', { pos: [10, 6] }), near = h.spawn('enemy_light', { pos: [11, 6] });
    const away = h.spawn('enemy_mid', { pos: [9, 5] });   // in her range, 1.4+ tiles from the mark: never hit
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast`);
    const t0 = h.b.time;
    assert.equal(u.mem.typhonMark.target, marked, `T${tier}: the heaviest of her range is marked`);
    assert.ok(u.liveRangeGrid.length >= 400, `T${tier}: the card shows 全场`);
    approx(u.s.interval, 2.4 + 3.1, `T${tier}: interval 5.5 s`);
    assert.ok(h.runUntil(() => !u.skill.active, 60), `T${tier}: ammo spent`);
    h.run(0.5);
    const rain = rainHits(h, u);
    assert.equal(atkHits(h, u).filter((c) => c.t >= t0 - 0.05).length, 0, `T${tier}: the round itself deals nothing`);
    assert.equal(rain.length, sk.bb['attack@s3_trigger_time'] * 4, `T${tier}: ${rain.length} arrows (rounds × 4)`);
    assert.ok(rain.every((c) => c.target === marked || c.target === near), `T${tier}: the area only`);
    assert.ok(rain.some((c) => c.target === near) && rain.some((c) => c.target === marked), `T${tier}: random among the area`);
    assert.ok(rain.every((c) => c.type === 'phys' && c.dmg.isSkill && !c.dmg.isAttack), `T${tier}: physical skill hits, no attack`);
    const rounds = Map.groupBy(rain, (c) => Math.round((c.t - t0) / 5.5));
    assert.equal(rounds.size, sk.bb['attack@s3_trigger_time'], `T${tier}: one round per bullet`);
    for (const list of rounds.values()) list.forEach((c, i) => i && approx(c.t - list[i - 1].t, 0.1, `T${tier}: 0.1 s apart`, 0.05));
    // amounts: ATK × s3_atk_scale (DEF 0), the first hit on each enemy ×1.7 (重如沼泥)
    const firsts = new Set([marked, near].map((e) => rain.find((c) => c.target === e)));
    for (const c of rain) approx(c.amount, u.s.atk * sk.bb['attack@s3_atk_scale'] * (firsts.has(c) ? 1.7 : 1), `T${tier}: s3_atk_scale`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun');
    assert.equal(stuns.length, rain.length, `T${tier}: a stun per landed arrow`);
    for (const c of stuns) approx(c.duration, 0.4, `T${tier}: 0.4 s`);
    assert.ok(!hitsBy(h, u).some((c) => c.target === away), `T${tier}: outside the mark area`);
    assert.ok(u.liveRangeGrid.length < 20, `T${tier}: own range back`);
    done(h);
  }
});

test('S3 “永恒狩猎”: no enemy in the mark area ⇒ no attack and no bullet spent; the mark follows its enemy and stays where it left the field', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2, seed: 3 });
  const walker = h.spawn('enemy_walk', { routeIndex: 0 });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 30), 'cast once the walker is in her range');
  assert.equal(u.mem.typhonMark.target, walker);
  const x0 = u.mem.typhonMark.x;
  h.run(1);
  assert.notEqual(u.mem.typhonMark.x, x0, 'the mark moves with its enemy');
  const ammo = u.skill.ammoLeft;
  h.b.kill(walker, null);
  const spot = [u.mem.typhonMark.x, u.mem.typhonMark.y];
  h.run(12);
  assert.equal(u.skill.ammoLeft, ammo, 'nothing in the area: no round');
  assert.deepEqual([u.mem.typhonMark.x, u.mem.typhonMark.y], spot, 'the mark stays');
  const later = h.spawn('enemy_light', { pos: [Math.round(spot[1]), Math.round(spot[0])] });
  assert.ok(h.runUntil(() => rainHits(h, u).some((c) => c.target === later), 12), 'an enemy at the old spot is hit');
  assert.equal(u.skill.ammoLeft, ammo - 1);
  done(h);
});

test('T1 锐如兽牙: each attack adds 10 % (SIE-X stage 3: 12 %) DEF ignore up to 5 stacks, applied to that attack already; all gone 8 s (10 s) after her last attack', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [5, true, SIEX], [6, true, SIEX]]) {
    const t0 = formOf(tier, elite).talents.find((t) => t.index === 0).bb;
    const tc = mod ? modOf(tier, mod).talentChanges.find((t) => t.talentIndex === 0 && !t.hidden)?.bb : null;
    const per = tc?.def_penetrate ?? t0.def_penetrate, dur = tc?.duration ?? t0.duration;
    assert.deepEqual([per, dur, tc?.max_stack_cnt ?? t0.max_stack_cnt], tier === 6 && mod === SIEX ? [0.12, 10, 5] : [0.1, 8, 5], label([tier, elite, mod]));
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const e = h.spawn('enemy_plate', { pos: [10, 6] });
    h.run(16);
    const list = atkHits(h, u).filter((c) => c.target === e);
    assert.ok(list.length >= 6, `${label([tier, elite, mod])}: ${list.length} attacks`);
    list.forEach((c, i) => approx(c.amount, u.s.atk - 600 * (1 - per * Math.min(5, i + 1)), `${label([tier, elite, mod])}: attack ${i + 1}`));
    h.b.kill(e, null);
    const last = list.at(-1).t;
    h.run(last + dur - 1 - h.b.time);
    assert.equal(u.findBuff('talent:typhon:fang')?.stacks, 5, `${label([tier, elite, mod])}: still there ${dur - 1} s after the last attack`);
    h.run(1.5);
    assert.equal(u.findBuff('talent:typhon:fang'), null, `${label([tier, elite, mod])}: lost after ${dur} s without an attack`);
    done(h);
  }
});

test('T2 重如沼泥: while her skill runs, the first damage on each enemy deals ×1.7 and 停顿 3 s (SIE-Y stage 3: the first two, ×2.3); not outside a skill; a new cast clears the marks', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [5, true, SIEY], [6, true, SIEY], [6, true, ISWA]]) {
    const t1 = formOf(tier, elite).talents.find((t) => t.index === 1).bb;
    const tc = mod === SIEY && tier === 6 ? modOf(tier, SIEY).talentChanges.find((t) => t.talentIndex === 1).bb : null;
    const n = tc?.max_stack_cnt ?? 1, scale = tc?.atk_scale ?? t1.atk_scale;
    assert.deepEqual([scale, tc?.sluggish ?? t1.sluggish], [tier === 6 && mod === SIEY ? 2.3 : 1.7, 3], label([tier, elite, mod]));
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const a = h.spawn('enemy_light', { pos: [10, 5] });
    const far = (d) => (mod === SIEY ? 1 + 0.12 * (d - 1) / 3.5 : 1);
    h.run(5);
    assert.ok(atkHits(h, u).length && atkHits(h, u).every((c) => c.target === a), `${label([tier, elite, mod])}: attacks`);
    for (const c of atkHits(h, u)) approx(c.amount, u.s.atk * far(2), `${label([tier, elite, mod])}: no skill, no bonus`);
    assert.equal(h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'sluggish').length, 0);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4));
    const t0 = h.b.time;
    h.run(8);
    const during = atkHits(h, u).filter((c) => c.t >= t0 - 0.05);
    assert.ok(during.length > n + 1, `${label([tier, elite, mod])}: attacks during S1`);
    during.forEach((c, i) => approx(c.amount, u.s.atk * far(2) * (i < n ? scale : 1), `${label([tier, elite, mod])}: hit ${i + 1}`));
    const slows = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'sluggish');
    assert.equal(slows.length, n, `${label([tier, elite, mod])}: 停顿 with the marked hits`);
    for (const c of slows) approx(c.duration, 3, '3 s');
    // a second enemy gets its own first hit; a new cast clears the marks
    u.skill.end('test');
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 5));
    const t1s = h.b.time;
    h.run(3);
    const again = atkHits(h, u).filter((c) => c.t >= t1s - 0.05);
    approx(again[0].amount, u.s.atk * far(2) * scale, `${label([tier, elite, mod])}: marks cleared by the new cast`);
    done(h);
  }
});

test('SIE-X 自然的包容: ×1.15 on her attacks against 重量等级 ≥ 3, nothing below; the S3 arrow rain (no attack) is not raised', () => {
  for (const [tier, mod] of [[5, SIEX], [6, SIEX], [6, null], [6, ISWA]]) {
    const xs = mod === SIEX ? 1.15 : 1;
    if (mod === SIEX) assert.deepEqual(modOf(tier, SIEX).talentChanges.find((t) => t.hidden).bb, { atk_scale: 1.15, value: 3 });
    const { h, u } = field({ tier, elite: true, mod, skill: 0 });
    const heavy = h.spawn('enemy_heavy', { pos: [10, 5] });
    h.run(4);
    const mid = h.spawn('enemy_mid', { pos: [10, 6] });
    h.b.kill(heavy, null);
    h.run(4);
    for (const c of atkHits(h, u)) approx(c.amount, u.s.atk * (c.target.weight >= 3 ? xs : 1), `T${tier} ${mod}: ${c.target.defId}`);
    assert.ok(atkHits(h, u).some((c) => c.target === mid) && atkHits(h, u).some((c) => c.target.weight >= 3));
    done(h);
  }
  // S3: rain hits on a weight-3 enemy are s3_atk_scale × ATK (× 1.7 the first)
  const { h, u } = field({ tier: 6, elite: true, mod: SIEX, skill: 2 });
  h.spawn('enemy_heavy', { pos: [10, 6] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 4));
  h.run(7);
  const rain = rainHits(h, u);
  rain.forEach((c, i) => approx(c.amount, u.s.atk * 1.6 * (i === 0 ? 1.7 : 1), `rain ${i + 1}: no ×1.15`));
  done(h);
});

test('SIE-Y 冰原的影子: her attack damage rises with the distance, linearly 1 → 4.5 tiles, at most +12 % (stages 1 and 3); the S3 rain is not raised', () => {
  for (const tier of [5, 6]) {
    assert.deepEqual(modOf(tier, SIEY).traitOverride.bb, { max_dist: 4.5, min_dist: 1, damage_scale: 0.12 });
    for (const [r, c] of [[10, 5], [10, 7], [11, 6]]) {
      const { h, u } = field({ tier, elite: true, mod: SIEY, skill: 0 });
      const e = h.spawn('enemy_light', { pos: [r, c] });
      h.run(3);
      const d = Math.hypot(c - 3, r - 10);
      approx(atkHits(h, u).find((x) => x.target === e).amount, u.s.atk * (1 + 0.12 * (d - 1) / 3.5), `T${tier}: ${d.toFixed(2)} tiles`);
      done(h);
    }
  }
  const { h, u } = field({ tier: 6, elite: true, mod: SIEY, skill: 2 });
  h.spawn('enemy_light', { pos: [10, 7] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 4));
  h.run(7);
  const n = modOf(6, SIEY).talentChanges.find((t) => t.talentIndex === 1).bb.max_stack_cnt;
  rainHits(h, u).forEach((c, i) => approx(c.amount, u.s.atk * 1.6 * (i < n ? 2.3 : 1), `rain ${i + 1}: no distance bonus`));
  done(h);
});

test('ISW-A 提丰特限证章: only its HP / ATK — the 集成战略 trait (damage_scale 1.4 on heavy enemies) and arrow-rain mark do nothing here', () => {
  for (const tier of [5, 6]) {
    const m = modOf(tier, ISWA);
    assert.match(m.traitOverride.moduleDesc, /^在集成战略中/);
    assert.ok(m.talentChanges.some((t) => t.bb.damage_scale === 1.4), 'the data carries the IS part');
    const { h, u } = field({ tier, elite: true, mod: ISWA, skill: 0 });
    const heavy = h.spawn('enemy_heavy', { pos: [10, 5] });
    h.run(8);
    for (const c of atkHits(h, u).filter((x) => x.target === heavy)) approx(c.amount, u.s.atk, `T${tier}: ×1 on a weight-3 enemy`);
    h.run(30);
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && !c.dmg.isAttack).length, 0, `T${tier}: no arrow rain of its own`);
    done(h);
  }
});
