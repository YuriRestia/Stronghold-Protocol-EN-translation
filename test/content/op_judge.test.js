// test/content/op_judge.test.js — the 自选 operator kit of 斥罪 (char_4065_judge, 6★ 不屈者; kit
// server/sim/content/kits/ops/op-judge.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, UNY-X
// “通往未来的荆棘之路” or UNY-Y “无罪” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json
// (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_judge.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const JUDGE = 'char_4065_judge';
const FORMS = BACKUPS.units[JUDGE].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const UNYX = 'uniequip_002_judge', UNYY = 'uniequip_003_judge';
const S1 = 'skchr_judge_1', S2 = 'skchr_judge_2', S3 = 'skchr_judge_3';
const BARRIER = 'talent:judge:barrier';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_frail: dummy('enemy_frail', { hp: 10 }),
};
const ALLIES = { t_mate: chessRec({ id: 't_mate', skill: null, stats: { maxHp: 10000, atk: 0, def: 0, blockCnt: 0 } }),
  t_medic: chessRec({ id: 't_medic', profession: 'MEDIC', skill: null, stats: { maxHp: 10000, atk: 500, def: 0, blockCnt: 0 } }) };
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, UNYX, UNYY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 斥罪 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5, setup = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: ALLIES }, timeLimit: 900, autoFinish: false, seed, setup,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied', 'kill'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: JUDGE, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const barrier = (u) => u.findBuff(BARRIER)?.shield ?? 0;
const t0Of = (u) => u.def.raw.talents.find((t) => t.index === 0).bb;
const t1Of = (u) => u.def.raw.talents.find((t) => t.index === 1).bb;
const thorns = (h, u, target = null) => h.hooksOf('damaged').filter((c) => c.source === u && (c.dmg?.tags ?? []).includes('judge:thorns') && (!target || c.target === target));
/** Knock an enemy out with damage credited to her. */
function killOne(h, u) {
  const e = h.spawn('enemy_frail', { pos: [12, 9] });
  h.b.dealDamage(u, e, { amount: 1e6, type: 'true' });
  assert.ok(!e.alive, 'knocked out');
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('斥罪 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 3, melee ground-only, 叙拉古, no 特质; 不屈者: no heal from others; triggers from the data', () => {
  assert.equal(OPERATOR_KITS[JUDGE], KITS[JUDGE]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill, others: [{ uid: 2, chessId: 't_medic', row: 11, col: 5 }] });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [JUDGE, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.noHeal, u.base.bat], [3, 'melee', 'phys', false, true, 1.6], `${label(f)}: 不屈者`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['siracusaShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      const sk = form.skills[skill];
      if (skill === 0) assert.deepEqual([u.skill.rule, sk.trigger.rawRule, sk.skillType, u.skill.maxCharges], ['DEFAULT', 'DEFAULT', 'AUTO', 2], `${label(f)}: S1 AUTO`);
      else assert.deepEqual([u.skill.rule, sk.trigger.rawRule, sk.skillType], ['DEFAULT', 'TAKE_DAMAGE', 'MANUAL'], `${label(f)}: S${skill + 1} trigger (the 重装 exception)`);
      assert.equal(u.skill.spType, skill === 2 ? 'hurt' : 'time', `${label(f)}: SP type`);
      // 无法被友方角色治疗: a heal from another unit does nothing
      u.hp = u.s.maxHp * 0.5;
      assert.equal(h.b.heal(h.unit(2), u, 500), 0, `${label(f)}: no heal from others`);
      done(h);
    }
  }
  // zh_CN numbers (full potential): E2 Lv1 2960 / 711 / 474, E2 Lv60 3686 / 839 / 568; UNY-X +150/+35/+15 → +300/+50/+33, UNY-Y +60/+48 → +85/+70
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2960, 711, 3686, 839]);
  assert.deepEqual([modOf(5, UNYX).attr, modOf(6, UNYX).attr, modOf(5, UNYY).attr, modOf(6, UNYY).attr],
    [{ maxHp: 150, atk: 35, def: 15 }, { maxHp: 300, atk: 50, def: 33 }, { atk: 60, def: 48 }, { atk: 85, def: 70 }]);
});

test('a 自选 pick: 斥罪 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(JUDGE));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(JUDGE), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: JUDGE, skillIndex: 0, uniEquipId: UNYY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: JUDGE, skillIndex: 0, uniEquipId: UNYY } } });
});

test('T1 律法卫士: barrier 55 % max HP at every deployment (75 % UNY-X stage 3), +10 % per enemy she knocks out (12 %), never past 300 % of the current max HP; it absorbs before HP', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const t0 = t0Of(u);
    const x3 = elite && mod === UNYX && tier === 6;
    assert.deepEqual([t0.born_hp_ratio, t0.kill_hp_ratio, t0.max_hp_ratio], x3 ? [0.75, 0.12, 3] : [0.55, 0.1, 3], label(f));
    approx(barrier(u), u.s.maxHp * t0.born_hp_ratio, `${label(f)}: at the deployment`);
    killOne(h, u);
    approx(barrier(u), u.s.maxHp * (t0.born_hp_ratio + t0.kill_hp_ratio), `${label(f)}: +1 kill`);
    // it absorbs: HP untouched until it runs out
    const hp0 = u.hp, e = h.spawn('enemy_dummy', { pos: [12, 9] });
    h.b.dealDamage(e, u, { amount: 300, type: 'true' });
    assert.equal(u.hp, hp0, `${label(f)}: absorbed`);
    approx(barrier(u), u.s.maxHp * (t0.born_hp_ratio + t0.kill_hp_ratio) - 300, `${label(f)}: −300`);
    // the cap: 300 % of the current max HP
    u.findBuff(BARRIER).shield = u.s.maxHp * 2.95;
    killOne(h, u);
    approx(barrier(u), u.s.maxHp * 3, `${label(f)}: capped`);
    killOne(h, u);
    approx(barrier(u), u.s.maxHp * 3, `${label(f)}: no gain at the cap`);
    // a max-HP change keeps the barrier; the cap follows the current max HP
    h.b.addBuff(u, { key: 'test:hp', mods: { hpPct: -0.5 } });
    const kept = barrier(u);
    killOne(h, u);
    assert.equal(barrier(u), kept, `${label(f)}: above the new cap: no gain, no cut`);
    h.b.removeBuff(u, 'test:hp');
    // a new deployment: a new barrier
    h.b.retreat(u);
    h.b.redeploy(u);
    h.step();
    approx(barrier(u), u.s.maxHp * t0.born_hp_ratio, `${label(f)}: again at the redeployment`);
    done(h);
  }
});

test('T2 荆棘环身: while she holds barrier, every damage from an enemy deals 53 % ATK arts back (61 % UNY-Y stage 3) — the hit that breaks it too; none without barrier, for a 流失, a 无来源 hit or an ally', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: 't_mate', row: 12, col: 3 }] });
    const t1 = t1Of(u);
    assert.equal(t1.atk_scale, elite && mod === UNYY && tier === 6 ? 0.61 : 0.53, label(f));
    const e = h.spawn('enemy_dummy', { pos: [12, 9] });
    h.b.dealDamage(e, u, { amount: 100, type: 'phys' });
    const t = thorns(h, u, e);
    assert.equal(t.length, 1, `${label(f)}: one reflection`);
    approx(t[0].amount, u.s.atk * t1.atk_scale, `${label(f)}: ${t1.atk_scale * 100} % ATK`);
    assert.deepEqual([t[0].type, t[0].dmg.isAttack, t[0].dmg.canDodge], ['arts', false, false], `${label(f)}: arts, not an attack, undodgeable`);
    h.b.loseHp(u, 50, { source: e });
    h.b.dealDamage(e, u, { amount: 50, type: 'true', sourceless: true });
    h.b.dealDamage(h.unit(2), u, { amount: 50, type: 'true' });
    assert.equal(thorns(h, u).length, 1, `${label(f)}: no reflection for a 流失, a 无来源 hit or an ally`);
    // the breaking hit still reflects; then none
    u.findBuff(BARRIER).shield = 10;
    h.b.dealDamage(e, u, { amount: 200, type: 'true' });
    assert.equal(barrier(u), 0, `${label(f)}: broken`);
    assert.equal(thorns(h, u).length, 2, `${label(f)}: the breaking hit reflects`);
    h.b.dealDamage(e, u, { amount: 50, type: 'true' });
    assert.equal(thorns(h, u).length, 2, `${label(f)}: no barrier, no thorns`);
    done(h);
  }
});

test('S1 一锤定音 (AUTO, data DEFAULT): the next attack adds 160 % / 180 % ATK arts; every cast spends all the SP; 蓄力 (twice the cost) also stuns 3 s and raises all her damage ×1.8 (thorns included), and reaching it restarts her attack cycle', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    let probe = null;
    const { h, u } = field({ tier, elite, skill: 0, setup: (b) => {
      // during her 蓄力 attack an enemy hits her: the reflection carries the ×1.8
      b.on('hit', (c) => {
        if (!probe || probe.done || c.source !== probe.u || !c.dmg?.isAttack) return;
        probe.done = true;
        b.dealDamage(probe.e, probe.u, { amount: 10, type: 'true' });
      });
    } });
    assert.deepEqual([sk.spCost, sk.initSp, sk.maxChargeTime, sk.bb.atk_scale_2, sk.bb['judge_s_1_enhance_checker.atk_scale'], sk.bb.stun], elite ? [4, 0, 2, 1.8, 1.8, 3] : [5, 0, 2, 1.6, 1.8, 3], `T${tier}`);
    // one charge: a plain cast
    u.skill.gainSp(sk.spCost, 'init');
    assert.equal(u.skill.charges, 1);
    const e = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC + 1] });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `T${tier}: cast at her attack`);
    assert.deepEqual([u.skill.charges, u.skill.sp], [0, 0], `T${tier}: all SP spent`);
    const hits = () => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
    h.step(2);
    const gavel = hits().filter((c) => (c.dmg?.tags ?? []).includes('judge:gavel'));
    assert.equal(gavel.length, 1, `T${tier}: one arts rider`);
    approx(gavel[0].amount, u.s.atk * sk.bb.atk_scale_2, `T${tier}: ${sk.bb.atk_scale_2 * 100} % ATK arts`);
    assert.deepEqual([gavel[0].type, gavel[0].dmg.isSkill], ['arts', true]);
    assert.ok(!h.hooksOf('statusApplied').some((c) => c.target === e && c.status === 'stun'), `T${tier}: no stun without 蓄力`);
    // 蓄力: the SP runs on to twice the cost; the attack cycle restarts the moment it gets there
    h.b.kill(e, u);
    h.step(2);
    u.atkCd = 1.2;
    u.skill.setSpTotal(2 * sk.spCost - 0.02);
    assert.equal(u.skill.charges, 1);
    assert.ok(h.runUntil(() => u.skill.charges === 2, 1), `T${tier}: the stack fills`);
    h.step();
    assert.equal(u.atkCd, 0, `T${tier}: attack cycle restarted`);
    const e2 = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC + 1] });
    probe = { u, e: e2, done: false };
    assert.ok(h.runUntil(() => u.skill.activations === 2, 1), `T${tier}: 蓄力 cast`);
    assert.deepEqual([u.skill.charges, u.skill.sp], [0, 0], `T${tier}: all SP spent`);
    h.step(2);
    const all = h.hooksOf('damaged').filter((c) => c.source === u && c.target === e2);
    const phys = all.find((c) => c.dmg?.isAttack);
    const rider = all.find((c) => (c.dmg?.tags ?? []).includes('judge:gavel'));
    approx(phys.amount, u.s.atk * 1.8, `T${tier}: the attack ×1.8`);
    approx(rider.amount, u.s.atk * sk.bb.atk_scale_2 * 1.8, `T${tier}: the rider ×1.8`);
    const th = thorns(h, u, e2);
    assert.ok(th.length >= 1, `T${tier}: a reflection during the attack`);
    approx(th[0].amount, u.s.atk * t1Of(u).atk_scale * 1.8, `T${tier}: thorns ×1.8`);
    const st = h.hooksOf('statusApplied').find((c) => c.target === e2 && c.status === 'stun' && c.source === u);
    assert.ok(st, `T${tier}: stun`);
    approx(st.duration, sk.bb.stun, `T${tier}: ${sk.bb.stun} s`);
    assert.equal(u.s.atkScaleMul, 1, `T${tier}: ×1.8 gone after the attack`);
    done(h);
  }
});

test('S2 坚心苦修 (data DEFAULT): 20 s without attacks, 40 % / 50 % 庇护, 90 % / 110 % ATK arts to every ground enemy on her x-4 at 0.9 s and every second after (20 pulses), barrier gains ×1.6 / ×1.8 meanwhile', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([sk.duration, sk.bb.damage_resistance, sk.bb.atk_scale, sk.bb.shield_scale, sk.rangeId], elite ? [20, 0.5, 1.1, 0.8, 'x-4'] : [20, 0.4, 0.9, 0.6, 'x-4'], `T${tier}`);
    u.skill.gainSp(999, 'init');
    const inside = [h.spawn('enemy_dummy', { pos: [10, 6] }), h.spawn('enemy_dummy', { pos: [11, 4] }), h.spawn('enemy_dummy', { pos: [9, 5] })];
    const fly = h.spawn('enemy_fly', { pos: [9, 6] }), out = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in range`);
    const t0 = h.hooksOf('skillStart').find((c) => c.unit === u).t;
    const pb = u.findBuff('protect');
    approx(pb.data.value, sk.bb.damage_resistance, `T${tier}: 庇护`);
    const n0 = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack).length;
    // the barrier gain of a kill ×(1 + shield_scale)
    const b0 = barrier(u);
    killOne(h, u);
    approx(barrier(u) - b0, u.s.maxHp * t0Of(u).kill_hp_ratio * (1 + sk.bb.shield_scale), `T${tier}: kill barrier ×${1 + sk.bb.shield_scale}`);
    assert.ok(h.runUntil(() => !u.skill.active, sk.duration + 1), `T${tier}: ends`);
    const pulses = h.hooksOf('damaged').filter((c) => c.source === u && (c.dmg?.tags ?? []).includes('judge:atonement'));
    const times = [...new Set(pulses.map((c) => Math.round((c.t - t0) * 100) / 100))];
    assert.equal(times.length, 20, `T${tier}: 20 pulses`);
    approx(times[0], 0.9, `T${tier}: first at 0.9 s`, 0.05);
    approx(times[1] - times[0], 1, `T${tier}: then every second`, 0.05);
    for (const e of inside) assert.equal(pulses.filter((c) => c.target === e).length, 20, `T${tier}: ${e.tileR},${e.tileC} hit 20 times`);
    for (const c of pulses.slice(0, 3)) {
      approx(c.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
      assert.deepEqual([c.type, c.dmg.isSkill, c.dmg.isAttack], ['arts', true, false]);
    }
    assert.ok(!pulses.some((c) => c.target === fly || c.target === out), `T${tier}: no flyer, nothing outside x-4`);
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack && c.t > t0 + 0.01 && c.t < t0 + sk.duration - 0.01).length - n0, 0, `T${tier}: no attack while it runs`);
    assert.equal(u.findBuff('protect'), null, `T${tier}: 庇护 gone`);
    done(h);
  }
});

test('S3 披荆斩棘 (data DEFAULT, 受击回复 27 / 24 SP — absorbed hits count): barrier +70 % / +100 % max HP (to the cap), 30 s ATK +260 % / +320 %, interval 1.6 + 0.9 s, taunt +1', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([sk.duration, sk.bb.hp_ratio, sk.bb.atk, sk.bb.base_attack_time, sk.bb.taunt_level, sk.spCost, sk.initSp, sk.spType], elite ? [30, 1, 3.2, 0.9, 1, 24, 0, 'INCREASE_WHEN_TAKEN_DAMAGE'] : [30, 0.7, 2.6, 0.9, 1, 27, 0, 'INCREASE_WHEN_TAKEN_DAMAGE'], `T${tier}`);
    const src = h.spawn('enemy_dummy', { pos: [12, 9] });
    for (let i = 0; i < sk.spCost - 1; i++) h.b.dealDamage(src, u, { amount: 1, type: 'true' });
    assert.equal(u.skill.sp, sk.spCost - 1, `T${tier}: one SP per hit, the barrier absorbing`);
    assert.equal(u.hp, u.s.maxHp, `T${tier}: HP untouched`);
    h.b.dealDamage(src, u, { amount: 1, type: 'true' });
    assert.ok(u.skill.ready, `T${tier}: ready`);
    h.run(1);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy in range, no cast`);
    const b0 = barrier(u);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in range`);
    approx(barrier(u), Math.min(u.s.maxHp * 3, b0 + u.s.maxHp * sk.bb.hp_ratio), `T${tier}: +${sk.bb.hp_ratio * 100} % max HP`, 1e-3);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.interval, 2.5, `T${tier}: 1.6 + 0.9 s`);
    assert.equal(u.s.taunt, 1, `T${tier}: taunt +1`);
    // the cap holds for the skill's barrier too
    h.b.retreat(u);
    h.b.redeploy(u);
    h.step();
    u.findBuff(BARRIER).shield = u.s.maxHp * 2.5;
    u.skill.gainSp(999, 'init');
    assert.ok(h.runUntil(() => u.skill.active, 5));
    approx(barrier(u), u.s.maxHp * 3, `T${tier}: capped at 300 %`);
    assert.ok(h.runUntil(() => !u.skill.active, sk.duration + 1));
    approx(u.s.interval, 1.6, `T${tier}: interval back`);
    assert.equal(u.s.taunt, 0, `T${tier}: taunt back`);
    done(h);
  }
});

test('UNY-X “通往未来的荆棘之路”: damage from an enemy she blocks ×0.85 (stages 1 and 3); UNY-Y “无罪”: ATK / DEF +8 % with no allied operator on the 8 tiles around her (a summon does not count)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const others = [{ uid: 2, chessId: 't_mate', row: 12, col: 8 }, { uid: 3, chessId: 'chess_char_3_19_a', row: 12, col: 3 },
      { uid: 4, kind: 'token', tokenId: 'token_10028_vigil_wolf', ownerUid: 3, row: 11, col: 6 }];
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    const x = elite && mod === UNYX, y = elite && mod === UNYY;
    if (x) assert.equal(u.def.raw.trait.bb.damage_scale, 0.85, label(f));
    if (y) assert.deepEqual(u.def.raw.trait.bb, { atk: 0.08, def: 0.08 }, label(f));
    u.findBuff(BARRIER).shield = 0;
    const blocked = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC] });
    assert.ok(h.runUntil(() => blocked.blockedBy === u, 1));
    const free = h.spawn('enemy_dummy', { pos: [12, 9] });
    const take = (src) => { u.hp = u.s.maxHp; return h.b.dealDamage(src, u, { amount: 500, type: 'true' }); };
    approx(take(blocked), x ? 425 : 500, `${label(f)}: from the blocked enemy`);
    approx(take(free), 500, `${label(f)}: from another`);
    // the wolf (a summon) is on the 8 around her: still alone
    h.step(2);
    assert.equal(!!u.findBuff('trait:judge:alone'), y, `${label(f)}: alone (a summon next to her)`);
    if (y) approx(u.s.atk, u.base.atk * 1.08, `${label(f)}: ATK +8 %`);
    h.b.relocate(h.unit(2), 9, 4);   // an operator on her diagonal
    h.step(2);
    assert.equal(u.findBuff('trait:judge:alone'), null, `${label(f)}: not alone`);
    done(h);
  }
});
