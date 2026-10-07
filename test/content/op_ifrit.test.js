// test/content/op_ifrit.test.js — the 自选 operator kit of 伊芙利特 (char_134_ifrit, 6★ 轰击术师; kit
// server/sim/content/kits/ops/op-ifrit.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, BLA-X
// “同熔” or BLA-D “热成形记忆” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of
// that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_ifrit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const IFRIT = 'char_134_ifrit';
const FORMS = BACKUPS.units[IFRIT].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const BLAX = 'uniequip_002_ifrit', BLAD = 'uniequip_003_ifrit';
const S1 = 'skchr_ifrit_1', S2 = 'skchr_ifrit_2', S3 = 'skchr_ifrit_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_res: dummy('enemy_res', { res: 50 }), enemy_def: dummy('enemy_def', { def: 300 }),
  enemy_hitter: dummy('enemy_hitter', { atk: 1000, range: 0, bat: 1 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, BLAX, BLAD].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 伊芙利特 as uid 1 at (row, col) facing RIGHT (her line: that row, col … col + 5), plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, others = [], seed = 5, flags = {} } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, ...flags }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'spGain'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: IFRIT, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const tagged = (h, u, tag) => h.hooksOf('damaged').filter((c) => (c.source === u || c.credit === u) && c.dmg?.tags?.includes(tag));
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('伊芙利特 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 5-1 line, 轰击术师 (every enemy of the line, air too, arts, instant), no 特质', () => {
  assert.equal(OPERATOR_KITS[IFRIT], KITS[IFRIT]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [IFRIT, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 100 + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.allInRange, u.profile.projectile, u.base.bat], ['ranged', 'arts', true, true, 'beam', 2.9], `${label(f)}: 轰击术师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 5-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [BACKUPS.diy.operators[IFRIT].bonds, []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: enemies target her`);
      done(h);
    }
  }
  // E2 Lv1 1276 / 757, E2 Lv60 1544 / 855; BLA-X +50 ATK +5 ASPD → +72 / +7, BLA-D +120 HP +45 ATK → +200 / +70
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1276, 757, 1544, 855]);
  assert.deepEqual([modOf(5, BLAX).attr, modOf(6, BLAX).attr, modOf(5, BLAD).attr, modOf(6, BLAD).attr], [{ atk: 50, aspd: 5 }, { atk: 72, aspd: 7 }, { maxHp: 120, atk: 45 }, { maxHp: 200, atk: 70 }]);
});

test('a 自选 pick: 伊芙利特 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(IFRIT));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(IFRIT), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: IFRIT, skillIndex: 2, uniEquipId: BLAD } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: IFRIT, skillIndex: 2, uniEquipId: BLAD } } });
});

test('trait 轰击术师: one attack strikes every enemy of her 5-1 line at once — ground and air, the same damage near and far (no module) — and nothing off the line', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const { h, u } = field({ tier, elite, skill: 0 });
    const near = h.spawn('enemy_dummy', { pos: [10, 5] }), far = h.spawn('enemy_dummy', { pos: [10, 9] });
    const fly = h.spawn('enemy_fly', { pos: [10, 7] }), off = h.spawn('enemy_dummy', { pos: [11, 5] }), behind = h.spawn('enemy_dummy', { pos: [10, 3] });
    assert.ok(h.runUntil(() => atkHits(h, u).length > 0, 4), `T${tier}: she attacks`);
    const first = atkHits(h, u);
    const hit = first.filter((c) => c.dmg.attackId === first[0].dmg.attackId);
    assert.deepEqual(hit.map((c) => c.target.id).sort(), [near, far, fly].map((e) => e.id).sort(), `T${tier}: her line, air included`);
    for (const c of hit) { approx(c.amount, u.s.atk, `T${tier}: 100 % ATK at any distance`); assert.equal(c.type, 'arts'); }
    for (const e of [off, behind]) assert.ok(!hit.some((c) => c.target === e), `T${tier}: off the line`);
    done(h);
  }
});

test('S1 狂热 (MANUAL, data DEFAULT, 20 s): ATK +10 % / +20 %, ASPD +58 / +67; all back after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.atk, sk.bb.attack_speed, u.skill.spCost], ['DEFAULT', 20, elite ? 0.2 : 0.1, elite ? 67 : 58, elite ? 44 : 47], `T${tier}`);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: cast on her attack`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    assert.equal(u.s.aspd, 100 + sk.bb.attack_speed, `T${tier}: ASPD`);
    approx(u.skill.timeLeft, 20, `T${tier}: 20 s`, 0.01);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: 5-1 while it runs`);
    h.runUntil(() => !u.skill.active, 25);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    assert.equal(u.s.aspd, 100, `T${tier}: ASPD back`);
    done(h);
  }
});

test('S2 炎爆 (AUTO, 2 / 3 charges, data DEFAULT): the next attack hits her whole line for 160 % / 190 %, DEF −100 / −200 for 3 s and the 灼伤 (33 % of her current ATK per s, 3 ticks, no dodge) on every enemy hit — the burn ticks on after she leaves', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.maxCharges, u.skill.spCost, sk.bb.atk_scale, sk.bb.def, sk.bb['burn.atk_scale'], sk.bb.duration],
      ['DEFAULT', 'charges', elite ? 3 : 2, 8, elite ? 1.9 : 1.6, elite ? -200 : -100, 0.33, 3.01], `T${tier}`);
    const a = h.spawn('enemy_def', { pos: [10, 6] }), b = h.spawn('enemy_fly', { pos: [10, 8] }), off = h.spawn('enemy_dummy', { pos: [11, 6] });
    u.skill.gainSp(999);
    const n0 = atkHits(h, u).length;
    assert.ok(h.runUntil(() => u.skill.activations === 1 && atkHits(h, u).length > n0, 4), `T${tier}: cast on her next attack`);
    const hits = atkHits(h, u).slice(n0);
    const t0 = h.b.time;
    for (const c of hits) assert.equal(c.dmg.isSkill, true);
    approx(hits.find((c) => c.target === b).amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % on the flyer`);
    approx(a.s.def, 300 + sk.bb.def < 0 ? 0 : 300 + sk.bb.def, `T${tier}: DEF cut`);
    assert.equal(off.findBuff('ifrit:pyroDef'), null, `T${tier}: off the line`);
    assert.ok(a.findBuff('ifrit:pyroBurn') && b.findBuff('ifrit:pyroBurn'), `T${tier}: both burn`);
    // the burn: 3 ticks of 33 % of her current ATK; she leaves the field after the first one
    h.runUntil(() => tagged(h, u, 'ifrit:burn').filter((c) => c.target === b).length >= 1, 2);
    const atkNow = u.s.atk;
    h.b.retreat(u);
    h.run(3);
    const burns = tagged(h, u, 'ifrit:burn').filter((c) => c.target === b);
    assert.equal(burns.length, 3, `T${tier}: 3 ticks`);
    approx(burns[0].amount, atkNow * 0.33, `T${tier}: 33 % ATK arts`);
    for (const c of burns) { assert.deepEqual([c.type, c.dmg.canDodge], ['arts', false]); assert.ok(c.t - t0 <= 3.05, `T${tier}: within 3 s`); }
    assert.equal(a.findBuff('ifrit:pyroDef'), null, `T${tier}: DEF cut over after 3 s`);
    done(h);
  }
});

test('S3 灼地 (MANUAL, data DEFAULT, 20 s, 维持技能状态): no normal attack; from the Begin clip\'s event (0.4 s) every second each ground enemy of her line takes 90 % / 110 % ATK arts and RES −7 / −10 for 1 s; she loses 2 % max HP per s; 20 ticks; a stun ends it at once', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.atk_scale, sk.bb.magic_resistance, sk.bb.hp_ratio], ['DEFAULT', 20, elite ? 1.1 : 0.9, elite ? -10 : -7, 0.02], `T${tier}`);
    const g = h.spawn('enemy_res', { pos: [10, 6] }), fly = h.spawn('enemy_fly', { pos: [10, 7] }), off = h.spawn('enemy_res', { pos: [11, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast`);
    const n0 = atkHits(h, u).length, hp0 = u.hp, cast = h.hooksOf('skillStart').at(-1).t;
    h.run(1.02);
    // RES 50 × 0.56 (精神融解) − 7 / −10: (50 − cut) × 0.56
    approx(g.s.res, (50 + sk.bb.magic_resistance) * 0.56, `T${tier}: RES cut + 精神融解`, 1e-9);
    approx(off.s.res, 50, `T${tier}: off the line`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: 5-1 while it runs`);
    const ticks = () => tagged(h, u, 'ifrit:scorch').filter((c) => c.type === 'arts');
    assert.equal(ticks().length, 1, `T${tier}: one tick after 1 s`);
    approx(ticks()[0].t - cast, 0.4, `T${tier}: the first tick at the Begin clip's attack event`, 0.05);
    approx(ticks()[0].amount, u.s.atk * sk.bb.atk_scale * (1 - (50 + sk.bb.magic_resistance) * 0.56 / 100), `T${tier}: ${sk.bb.atk_scale * 100} % ATK arts`);
    assert.ok(!ticks().some((c) => c.target === fly || c.target === off), `T${tier}: ground enemies of her line only`);
    approx(hp0 - u.hp, u.s.maxHp * 0.02, `T${tier}: 2 % max HP`);
    h.runUntil(() => !u.skill.active, 25);
    assert.equal(ticks().length, 20, `T${tier}: 20 ticks`);
    const endT = h.hooksOf('skillEnd').at(-1).t;
    assert.equal(atkHits(h, u).filter((c) => c.t < endT).length, n0, `T${tier}: no normal attack meanwhile`);
    // a second cast, cut short by a stun
    u.hp = u.s.maxHp;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 6), `T${tier}: cast again`);
    h.run(2.5);
    h.b.applyStatus(u, 'stun', { duration: 1, force: true });
    h.step();
    assert.equal(u.skill.active, false, `T${tier}: the stun ends 灼地`);
    assert.equal(h.hooksOf('skillEnd').at(-1).reason, 'interrupted');
    done(h);
  }
});

test('T1 精神融解: RES ×0.56 on every enemy of her line (gone once it leaves), none off it; BLA-D stage 3: her attacks and 灼地 ticks on an enemy in its 灼燃 burst add 50 % ATK 元素伤害 (a 持续伤害)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const t0 = u.def.raw.talents.find((t) => t.index === 0);
    assert.equal(t0.bb.magic_resistance, -0.44, label(f));
    const on = h.spawn('enemy_res', { pos: [10, 7] }), off = h.spawn('enemy_res', { pos: [11, 7] });
    h.run(0.3);
    approx(on.s.res, 28, `${label(f)}: 50 → 28`);
    approx(off.s.res, 50, `${label(f)}: off the line`);
    h.b.retreat(u);
    h.run(0.6);
    approx(on.s.res, 50, `${label(f)}: gone with her`);
    done(h);
  }
  for (const [tier, mod, extra] of [[6, BLAD, 0.5], [5, BLAD, 0], [6, BLAX, 0], [6, null, 0]]) {
    const { h, u } = field({ tier, elite: true, mod, skill: 2 });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const calm = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.b.addBuff(e, { key: 'burnBurst', duration: 60, flags: { burstLock: true } });
    const n0 = atkHits(h, u).length;
    h.runUntil(() => atkHits(h, u).length > n0, 4);
    h.step();
    const el = () => tagged(h, u, 'ifrit:meltdown');
    assert.equal(el().length, extra ? 1 : 0, `T${tier} ${mod}: the extra hit on her attack`);
    if (extra) {
      approx(el()[0].amount, u.s.atk * extra, 'T6 BLA-D: 50 % ATK');
      assert.deepEqual([el()[0].type, el()[0].dmg.element, el()[0].dmg.tags.includes('dot'), el()[0].target], ['elemental', 'burn', true, e]);
      assert.match(u.def.raw.talents.find((t) => t.index === 0).desc, /灼燃损伤.*爆发期间.*50%的元素伤害/);
    }
    // the 灼地 ticks are attacks of hers too (the equip adds it to every ability family)
    u.skill.gainSp(999);
    h.runUntil(() => u.skill.active, 4);
    h.run(2.5);
    const onTicks = el().filter((c) => c.t > h.hooksOf('skillStart').at(-1).t);
    assert.equal(onTicks.length, extra ? 3 : 0, `T${tier} ${mod}: one per 灼地 tick (0.4 / 1.4 / 2.4 s)`);
    assert.ok(!el().some((c) => c.target === calm), `T${tier} ${mod}: none on an enemy outside a burst`);
    done(h);
  }
});

test('T2 莱茵回路: +2 SP every 5.5 s of a deployment; BLA-X stage 3: a 30 % roll for +5 SP more each 5.5 s (none in any other form)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, seed: 21 });
    const dice = elite && tier === 6 && mod === BLAX;
    const t1 = u.def.raw.talents.find((t) => t.index === 1).bb;
    assert.deepEqual([t1.sp, t1.interval, t1['ifrit_e_002[dice_sp].prob'] ?? 0, t1['ifrit_e_002[dice_sp].sp'] ?? 0], [2, 5.5, dice ? 0.3 : 0, dice ? 5 : 0], label(f));
    const gains = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'talent');
    for (let i = 0; i < 60; i++) { u.skill.sp = 0; h.run(5.5); }
    const g = gains();
    const twos = g.filter((c) => c.amount === 2).length, fives = g.filter((c) => c.amount === 5).length;
    assert.ok(twos >= 59 && twos <= 60, `${label(f)}: ${twos} gifts of 2 SP in 330 s`);
    if (dice) assert.ok(fives >= 9 && fives <= 30, `${label(f)}: ${fives} / 60 rolls of +5 ≈ 30 %`);
    else assert.equal(fives, 0, `${label(f)}: no roll`);
    done(h);
  }
});

test('BLA-X “同熔” (stages 1 and 3): ×(1 + 0.1 × d / 4) by the distance to the target, capped at 4 tiles — on her attacks, the 灼伤 while she stands and the 灼地 ticks; none without it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const blax = elite && mod === BLAX;
    if (blax) assert.deepEqual(u.def.raw.trait.bb, { min_dist: 0, max_dist: 4, damage_scale: 0.1 }, label(f));
    const at = [5, 6, 8, 9].map((c) => h.spawn('enemy_dummy', { pos: [10, c] }));
    const n0 = atkHits(h, u).length;
    h.runUntil(() => atkHits(h, u).length >= n0 + 4, 4);
    const hits = atkHits(h, u).slice(n0, n0 + 4);
    for (const [i, d] of [[0, 1], [1, 2], [2, 4], [3, 5]]) {
      const c = hits.find((x) => x.target === at[i]);
      approx(c.amount, u.s.atk * (blax ? 1 + 0.1 * Math.min(1, d / 4) : 1), `${label(f)}: d = ${d}`);
    }
    done(h);
  }
  // the 灼伤 while she stands and after she left; the 灼地 tick
  for (const [skill, tag] of [[1, 'ifrit:burn'], [2, 'ifrit:scorch']]) {
    const { h, u } = field({ tier: 6, elite: true, mod: BLAX, skill });
    const e = h.spawn('enemy_dummy', { pos: [10, 8] });   // 4 tiles: ×1.1
    u.skill.gainSp(999);
    h.runUntil(() => tagged(h, u, tag).filter((c) => c.type === 'arts').length >= 1, 6);
    const c = tagged(h, u, tag).find((x) => x.type === 'arts' && x.target === e);
    const scale = skill === 1 ? 0.33 : skillOf(6, true, S3).bb.atk_scale;
    approx(c.amount, u.s.atk * scale * 1.1, `${tag}: ×1.1 at 4 tiles`);
    if (skill === 1) {
      h.b.retreat(u);
      h.run(2.1);
      const after = tagged(h, u, tag).filter((x) => x.target === e).at(-1);
      approx(after.amount, u.s.atk * scale, '灼伤 after she left: no module effect');
    }
    done(h);
  }
});

test('BLA-D “热成形记忆” (stages 1 and 3): every arts damage she deals while on the field attaches 8 % of it as 灼燃损伤 — her attacks and the 灼伤 — and no 元素损伤 without it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const blad = elite && mod === BLAD;
    if (blad) assert.equal(u.def.raw.trait.bb.ep_damage_ratio, 0.08, label(f));
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    u.skill.gainSp(999);
    h.runUntil(() => tagged(h, u, 'ifrit:burn').length >= 2, 6);
    const arts = h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && c.type === 'arts').reduce((s, c) => s + c.amount, 0);
    approx(e.elem.burn, blad ? arts * 0.08 : 0, `${label(f)}: 8 % of ${Math.round(arts)} arts damage as 灼燃损伤`);
    done(h);
  }
});
