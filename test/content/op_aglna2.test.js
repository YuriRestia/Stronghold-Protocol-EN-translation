// test/content/op_aglna2.test.js — the 自选 operator kit of 予愿安洁莉娜 (char_1015_aglna2, 6★ 巡空者; kit
// server/sim/content/kits/ops/op-aglna2.js) and of her S3 marker “一会儿见！” (token_10071_aglna2_agairp), fielded the
// production way (a DIY slot + its `diy` pick, simdata getDiy) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4)
// and elite (E2 Lv60, rank 7) — she has no module. Numbers from data/backups.json; the fidelity checklist of kits/README.md.
// The engine's 缚地 status her S2 brings: test/sim/feedback5-groundbind.test.js.
// Run: node --test test/content/op_aglna2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { canTargetAlly } from '../../server/sim/targeting.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const AGL = 'char_1015_aglna2';
const MARKER = 'token_10071_aglna2_agairp';
const FORMS = BACKUPS.units[AGL].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const S1 = 'skchr_aglna2_1', S2 = 'skchr_aglna2_2', S3 = 'skchr_aglna2_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_heavy: dummy('enemy_heavy', { mass: 4 }), enemy_heavier: dummy('enemy_heavier', { mass: 5 }),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_flyheavy: dummy('enemy_flyheavy', { motion: 'FLY', mass: 4 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0, atk: 100 }),
  enemy_flywalk: enemyRec({ key: 'enemy_flywalk', hp: 1e9, speed: 0.6, mass: 0, motion: 'FLY', atk: 100 }),
};
const FORMS_ALL = [[5, false], [6, false], [5, true], [6, true]];
const label = ([tier, elite]) => `T${tier} ${elite ? 'elite' : 'normal'}`;
const ANY_ATK = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const extras = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && (c.dmg?.tags || []).includes('aglna2:extra'));

/** 予愿安洁莉娜 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, skill = 0, row = 10, col = 4, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'deploy', 'dodge'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: AGL, skillIndex: skill }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('予愿安洁莉娜 in every 自选 form: her operator kit (all three skills authored), the form\'s stats, 2-2, melee physical that hits air units, blocks 2, 叙拉古, no 特质; S1 a timed deployment skill, S2 / S3 the data\'s ACTIVE_RANGE', () => {
  assert.equal(OPERATOR_KITS[AGL], KITS[AGL]);
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, skill });
      const form = formOf(tier, elite);
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [AGL, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp, form.stats.atk, form.stats.def], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [2, 'melee', 'phys', true, 1.5], `${label(f)}: 巡空者`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['siracusaShip'], []], `${label(f)}: bonds / 特质`);
      if (skill === 0) {
        assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.active], ['NEVER', 'duration', true], `${label(f)}: S1 runs from the deployment`);
        assert.deepEqual(u.liveRangeGrid, form.skills[0].rangeGrid, `${label(f)}: 3-6 while it runs`);
      } else {
        assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
        assert.equal(u.skill.rule, 'ACTIVE_RANGE');
        assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 2-2`);
        assert.ok(!u.s.flags.liftoff && !u.s.flags.blockFly, `${label(f)}: on the ground`);
      }
      done(h);
    }
  }
  // E2 Lv1 1884 / 661 / 410, E2 Lv60 2216 / 772 / 483
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.atk, FORMS['2/60/7/3'].stats.atk], [1884, 661, 772, 772]);
  assert.deepEqual(FORMS['2/60/7/3'].modules ?? [], []);
});

test('a 自选 pick: 予愿安洁莉娜 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(AGL));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(AGL), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: AGL, skillIndex: 2, uniEquipId: null } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: AGL, skillIndex: 2, uniEquipId: null } } });
});

test('trait 巡空者: on the ground she blocks ground enemies, not flyers; airborne (起飞) she blocks flyers, not ground enemies, and no ground enemy selects her; taking off releases the ground enemies, landing the flyers', () => {
  for (const f of [[5, false], [6, true]]) {
    const [tier, elite] = f;
    const { h, u } = field({ tier, elite, skill: 1, row: 9, col: 4 });
    u.skill.spCostMul = 1000;   // (no cast of its own: the test takes off below)
    const w = h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => w.blockedBy === u, 30), `${label(f)}: blocks the walker on the ground`);
    const fl = h.spawn('enemy_flywalk', { routeIndex: 2 });
    assert.ok(h.runUntil(() => fl.x < u.x - 1, 30), `${label(f)}: the flyer passes`);
    assert.notEqual(fl.blockedBy, u, `${label(f)}: no air block on the ground`);
    h.b.kill(fl, null);
    // S2: take off (the walker walks on)
    assert.ok(u.skill.activate('test', { free: true }));
    assert.ok(u.s.flags.liftoff && u.s.flags.blockFly, `${label(f)}: airborne`);
    assert.equal(w.blockedBy, null, `${label(f)}: the ground enemy released`);
    assert.equal(canTargetAlly(w, u, true), false, `${label(f)}: 对地规避`);
    const fl2 = h.spawn('enemy_flywalk', { routeIndex: 2 });
    assert.ok(h.runUntil(() => fl2.blockedBy === u, 30), `${label(f)}: blocks a flyer airborne`);
    assert.equal(canTargetAlly(fl2, u, true), true, `${label(f)}: flyers still select her`);
    u.skill.end('test');
    assert.equal(fl2.blockedBy, null, `${label(f)}: landing releases the flyer`);
    assert.ok(!u.s.flags.liftoff, `${label(f)}: landed`);
    done(h);
  }
});

test('T1 飘浮大地之上: every damage she outputs adds ATK × 45 % arts on a target of weight ≤ 3, else × 30 % — dodged hits too, never on itself; airborne, every enemy of her range is 失重 (weight −1, not with another 失重), gone when she lands', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    const t0 = formOf(tier, elite).talents[0].bb;
    assert.deepEqual([t0.atk_scale_lo, t0.atk_scale_hi, t0.mass_level], [0.3, 0.45, 3], label(f));
    // on the ground (S3 picked, not cast): weight 0 ⇒ 45 %, weight 4 ⇒ 30 %
    {
      const { h, u } = field({ tier, elite, skill: 2 });
      u.skill.sp = 0;
      const a = h.spawn('enemy_dummy', { pos: [10, 5] });
      assert.ok(h.runUntil(() => ANY_ATK(h, u).length > 0, 3));
      const hit = ANY_ATK(h, u)[0];
      const ex = extras(h, u).filter((c) => c.target === a);
      assert.equal(ex.length, 1, `${label(f)}: one addition per damage`);
      approx(ex[0].amount, u.s.atk * 0.45, `${label(f)}: weight 0`, 1e-6);
      assert.equal(ex[0].type, 'arts');
      approx(hit.amount, u.s.atk, `${label(f)}: her attack 100 %`, 1e-6);
      h.b.kill(a, null);
      const heavy = h.spawn('enemy_heavy', { pos: [10, 5] });
      assert.ok(h.runUntil(() => extras(h, u).some((c) => c.target === heavy), 3));
      approx(extras(h, u).find((c) => c.target === heavy).amount, u.s.atk * 0.3, `${label(f)}: weight 4 ⇒ 30 %`, 1e-6);
      // a dodged hit still adds it
      h.b.addBuff(heavy, { key: 'test:dodge', mods: { dodgePhys: 1 } });
      const n0 = extras(h, u).length, d0 = h.hooksOf('dodge').length;
      assert.ok(h.runUntil(() => h.hooksOf('dodge').length > d0, 3), 'dodged');
      assert.equal(extras(h, u).length, n0 + 1, `${label(f)}: an output, dodged or not`);
      done(h);
    }
    // airborne (S1): 失重 in range — the weight-4 enemy counts as 3 ⇒ 45 %
    {
      const { h, u } = field({ tier, elite, skill: 0 });
      const heavy = h.spawn('enemy_heavy', { pos: [11, 6] });
      const far = h.spawn('enemy_heavy', { pos: [10, 8] });
      const marked = h.spawn('enemy_dummy', { pos: [9, 5] });
      h.b.addBuff(marked, { key: 'other:weightless', status: 'weightless', mods: { massFlat: -1 } });
      h.step();
      assert.equal(heavy.weight, 3, `${label(f)}: 失重 in her range`);
      assert.equal(far.weight, 4, `${label(f)}: not outside it`);
      assert.equal(marked.buffs.filter((b) => b.status === 'weightless').length, 1, `${label(f)}: 同名效果不可叠加`);
      const k0 = extras(h, u).length;
      assert.ok(h.runUntil(() => extras(h, u).slice(k0).some((c) => c.target === heavy), 3));
      approx(extras(h, u).slice(k0).find((c) => c.target === heavy).amount, u.s.atk * 0.45, `${label(f)}: weight 3 (失重) ⇒ 45 %`, 1e-6);
      u.skill.end('test');
      h.step();
      assert.equal(heavy.weight, 4, `${label(f)}: 失重 gone when she lands`);
      done(h);
    }
  }
});

test('T2 天穹间的舞步: while she is on the field every airborne allied operator (her included) has ATK +18 % and, while it blocks, 生命回复速度 +10 % max HP (hpRegenRatio — no heal, 禁疗 does not stop it); none on the ground', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    const t1 = formOf(tier, elite).talents[1].bb;
    assert.deepEqual([t1.atk, t1.hp_recovery_per_sec_by_max_hp_ratio], [0.18, 0.1], label(f));
    const others = [{ uid: 2, chessId: 'chess_char_1_02_a', row: 12, col: 3 }];
    const { h, u } = field({ tier, elite, skill: 0, row: 9, col: 4, others });
    const yak = h.unit(2);
    h.run(0.3);
    assert.deepEqual(u.findBuff('talent:aglna2:dance')?.mods, { atkPct: 0.18 }, `${label(f)}: airborne, not blocking`);
    approx(u.s.atk, u.base.atk * (1 + skillOf(tier, elite, S1).bb.atk + 0.18), `${label(f)}: ATK`);
    assert.equal(yak.findBuff('talent:aglna2:dance'), null, `${label(f)}: 角峰 on the ground: none`);
    h.b.addBuff(u, { key: 'test:healFree', flags: { noHeal: true, healFree: true } });
    const fl = h.spawn('enemy_flywalk', { routeIndex: 2 });
    assert.ok(h.runUntil(() => fl.blockedBy === u, 30), 'she blocks a flyer');
    h.run(0.3);
    assert.deepEqual(u.findBuff('talent:aglna2:dance')?.mods, { atkPct: 0.18, hpRegenRatio: 0.1 }, `${label(f)}: blocking`);
    approx(u.s.hpRegen, 0.1 * u.s.maxHp, `${label(f)}: 10 % max HP / s as 生命回复速度`);
    u.hp = u.s.maxHp / 2;
    const hp0 = u.hp;
    h.run(1);
    approx(u.hp - hp0, 0.1 * u.s.maxHp, `${label(f)}: regenerated under 禁疗`, 0.05);
    done(h);
  }
  // S3 picked, before its cast: on the ground — no buff
  const { h, u } = field({ tier: 6, elite: true, skill: 2 });
  h.run(1);
  assert.equal(u.findBuff('talent:aglna2:dance'), null);
  done(h);
});

test('S1 极速送达 (被动 ON_DEPLOY): at each deployment she takes off for 56 s — range 3-6, ATK +75 % / +100 %, 2 targets at once — then lands', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.skillType, sk.spType, sk.duration, sk.bb.atk, sk.bb['attack@max_target'], sk.rangeId], ['PASSIVE', 'ON_DEPLOY', 56, elite ? 1 : 0.75, 2, '3-6'], label(f));
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.ok(u.skill.active && u.s.flags.liftoff, `${label(f)}: airborne from the deployment`);
    approx(u.skill.timeLeft, 56 - 1 / 30, `${label(f)}: 56 s`, 1e-3);
    const a = h.spawn('enemy_dummy', { pos: [9, 6] });
    const b = h.spawn('enemy_dummy', { pos: [11, 5] });
    assert.ok(h.runUntil(() => ANY_ATK(h, u).length >= 2, 3));
    const first = ANY_ATK(h, u)[0];
    const same = ANY_ATK(h, u).filter((c) => c.dmg.attackId === first.dmg.attackId);
    assert.deepEqual(same.map((c) => c.target).sort((x, y) => x.id - y.id), [a, b].sort((x, y) => x.id - y.id), `${label(f)}: two targets`);
    h.runUntil(() => !u.skill.active, 60);
    assert.ok(!u.s.flags.liftoff && !u.s.flags.blockFly, `${label(f)}: landed`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)}: 2-2`);
    h.run(0.4);   // (her T2 lapses within one refresh)
    approx(u.s.atk, u.base.atk, `${label(f)}: ATK back`);
    // a redeployment takes off again
    h.b.retreat(u);
    h.b.redeploy(u, { free: true });
    assert.ok(u.skill.active && u.s.flags.liftoff, `${label(f)}: again at the next deployment`);
    done(h);
  }
});

test('S2 重力自定义 (MANUAL, data ACTIVE_RANGE on 3-10): takes off; 2.5 s 吟唱 (no attack, 无敌, control statuses refused) while the sweep (3.0 wide, 1.3 thick, 6 tiles/s, 4 tiles ahead) 浮空s ground enemies 10 / 12 s and 缚地s flyers 20 / 22 s; then ATK +105 % / +135 %, interval −0.6 / −0.8 s, arts, 4 / 5 targets, range 3-10; 22 s', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.bb['attack@max_target'], sk.bb.chant_duration, sk.bb.buff_duration_levitate, sk.bb.buff_duration_ground_bound, sk.spCost, sk.initSp, sk.rangeId],
      [22, elite ? 1.35 : 1.05, elite ? -0.8 : -0.6, elite ? 5 : 4, 2.5, elite ? 12 : 10, elite ? 22 : 20, elite ? 29 : 32, elite ? 20 : 17, '3-10'], label(f));
    assert.deepEqual(sk.trigger.customRangeGrid, sk.rangeGrid);
    const { h, u } = field({ tier, elite, skill: 1 });
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `${label(f)}: no enemy, no cast`);
    const g = h.spawn('enemy_dummy', { pos: [10, 8] });        // 4 ahead: swept
    const heavy = h.spawn('enemy_heavier', { pos: [11, 7] });  // swept, weight 5 − her 失重 1 = 4: half
    const fl = h.spawn('enemy_fly', { pos: [9, 6] });           // swept flyer
    const far = h.spawn('enemy_dummy', { pos: [10, 9] });       // 5 ahead: not swept
    const wide = h.spawn('enemy_dummy', { pos: [12, 6] });      // 2 aside: not swept
    assert.ok(h.runUntil(() => u.skill.active, 1), `${label(f)}: cast with an enemy in 3-10 (none in her 2-2)`);
    assert.ok(u.s.flags.liftoff, `${label(f)}: airborne`);
    assert.ok(u.s.flags.disarm && u.s.flags.invulnerable, `${label(f)}: 吟唱`);
    assert.equal(h.b.applyStatus(u, 'stun', { duration: 3, source: g }), false, `${label(f)}: control statuses refused while gliding`);
    h.run(1);
    const st = (e, k) => h.hooksOf('statusApplied').find((c) => c.target === e && c.status === k);
    approx(st(g, 'levitate')?.duration, sk.bb.buff_duration_levitate, `${label(f)}: 浮空`);
    approx(st(heavy, 'levitate')?.duration, sk.bb.buff_duration_levitate / 2, `${label(f)}: halved on weight > 3`);
    approx(st(fl, 'groundbind')?.duration, sk.bb.buff_duration_ground_bound, `${label(f)}: 缚地`);
    assert.ok(!st(far, 'levitate') && !st(wide, 'levitate'), `${label(f)}: outside the sweep`);
    assert.equal(fl.isFlying, false, `${label(f)}: a 缚地 flyer is a ground unit`);
    assert.equal(ANY_ATK(h, u).length, 0, `${label(f)}: no attack while gliding`);
    h.run(1.6);
    assert.ok(!u.s.flags.disarm && !u.s.flags.invulnerable, `${label(f)}: the 吟唱 over at 2.5 s`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `${label(f)}: 3-10`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk + 0.18), `${label(f)}: ATK (+18 % of her T2)`);
    approx(u.s.interval, (1.5 + sk.bb.base_attack_time) * 100 / u.s.aspd, `${label(f)}: interval`);
    for (const p of [[9, 7], [11, 5], [9, 8], [11, 8]]) h.spawn('enemy_dummy', { pos: p });
    const n0 = ANY_ATK(h, u).length;
    assert.ok(h.runUntil(() => ANY_ATK(h, u).length > n0, 3));
    const a1 = ANY_ATK(h, u)[n0];
    const one = ANY_ATK(h, u).filter((c) => c.dmg.attackId === a1.dmg.attackId);
    assert.equal(one.length, sk.bb['attack@max_target'], `${label(f)}: ${sk.bb['attack@max_target']} targets`);
    assert.ok(one.every((c) => c.type === 'arts'), `${label(f)}: arts`);
    h.runUntil(() => !u.skill.active, 30);
    approx(h.hooksOf('skillEnd').at(-1).t - h.hooksOf('skillStart').at(-1).t, 22, `${label(f)}: 22 s from the cast`, 0.01);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)}: 2-2 back`);
    assert.ok(!u.s.flags.liftoff, `${label(f)}: landed`);
    done(h);
  }
});

test('S3 酸橙的心事 (MANUAL, data ACTIVE_RANGE on 3-9): 30 / 31 bullets, ATK +20 % / +30 %, 对空庇护 55 % / 60 %, range 3-9 + the 8 around her; each attack 275 % / 305 % on ≤ 3 ground enemies and flyers up to 4; flyers in range ×0.6 speed', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.bb['attack@trigger_time'], sk.bb.atk, sk.bb.damage_resistance, sk.bb['attack@atk_scale'], sk.bb['attack@max_target'], sk.bb['attack@max_walk_target'], sk.bb.move_speed, sk.bbStr['attack@attack_range_id'], sk.spCost, sk.initSp],
      [elite ? 31 : 30, elite ? 0.3 : 0.2, elite ? 0.6 : 0.55, elite ? 3.05 : 2.75, 4, 3, -0.4, 'x-4', elite ? 36 : 42, elite ? 22 : 19], label(f));
    const { h, u } = field({ tier, elite, skill: 2 });
    u.skill.gainSp(999);
    const grounds = [[10, 8], [10, 5], [11, 6], [9, 6]].map((p) => h.spawn('enemy_dummy', { pos: p }));
    assert.ok(h.runUntil(() => u.skill.active, 1), `${label(f)}: cast with an enemy in 3-9`);
    assert.equal(u.skill.ammoMax, sk.bb['attack@trigger_time'], `${label(f)}: bullets`);
    const range = u.liveRangeGrid.map((p) => p.join(',')).sort();
    for (const p of [...sk.rangeGrid, [1, -1], [0, -1], [-1, -1]]) assert.ok(range.includes(p.join(',')), `${label(f)}: ${p} in her range`);
    h.run(0.25);   // (her T2 refreshes every 0.2 s)
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk + 0.18), `${label(f)}: ATK`);
    // 对空庇护
    const flyer = h.spawn('enemy_fly', { pos: [12, 4] });
    const taken = h.b.dealDamage(flyer, u, { amount: 1000, type: 'arts' });
    approx(taken, 1000 * (1 - sk.bb.damage_resistance), `${label(f)}: from an air unit`, 1e-6);
    assert.equal(h.b.dealDamage(grounds[0], u, { amount: 1000, type: 'arts' }), 0, `${label(f)}: a ground enemy cannot select her (对地规避)`);
    approx(h.b.dealDamage(grounds[0], u, { amount: 1000, type: 'arts', ignoreSelect: true }), 1000, `${label(f)}: a ground source's that reaches her: not reduced`, 1e-6);
    h.b.kill(flyer, null);
    // ≤ 3 ground + flyers to 4 (she blocks nothing meanwhile: the flyers are on tiles she may not take)
    const f1 = h.spawn('enemy_fly', { pos: [10, 7] }), f2 = h.spawn('enemy_fly', { pos: [11, 7] });
    h.b.addBuff(f1, { key: 'test:ub', flags: { unblockable: true } });
    h.b.addBuff(f2, { key: 'test:ub', flags: { unblockable: true } });
    const n0 = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack).length;
    assert.ok(h.runUntil(() => ANY_ATK(h, u).length > n0, 3));
    const a1 = ANY_ATK(h, u)[n0];
    const one = ANY_ATK(h, u).filter((c) => c.dmg.attackId === a1.dmg.attackId);
    assert.equal(one.filter((c) => !c.target.isFlying).length, 3, `${label(f)}: 3 ground`);
    assert.equal(one.filter((c) => c.target.isFlying).length, 1, `${label(f)}: + 1 flyer`);
    for (const c of one) approx(c.amount, u.s.atk * sk.bb['attack@atk_scale'], `${label(f)}: ${sk.bb['attack@atk_scale']} × ATK`, 1e-6);
    const used = ANY_ATK(h, u).map((c) => c.dmg.attackId).filter((x, i, a) => a.indexOf(x) === i).length;
    assert.equal(u.skill.ammoLeft, sk.bb['attack@trigger_time'] - used, `${label(f)}: one bullet per attack`);
    // flyers of her range ×0.6
    approx(f1.s.moveSpeed, f1.base.moveSpeed * 0.6, `${label(f)}: flyer slowed`);
    approx(grounds[0].s.moveSpeed, grounds[0].base.moveSpeed, `${label(f)}: ground enemies not`);
    u.skill.addAmmo(0);
    h.runUntil(() => !u.skill.active, 120);
    assert.equal(h.hooksOf('skillEnd').at(-1).reason, 'ammo', `${label(f)}: ends with its bullets`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)}: 2-2 back`);
    done(h);
  }
});

test('S3 move: blocking nothing, she flies (2 tiles/s, 无敌, disarmed) to the tile of an unblocked flyer she can block inside the original 3-9, lands there by a 【移动】 (the skill and its bullets kept) and blocks it; “一会儿见！” marks her deployment tile; her range stays that 3-9 + the 8 around her; at the end she goes back and the marker leaves', () => {
  for (const f of [[5, false], [6, true]]) {
    const [tier, elite] = f;
    const { h, u } = field({ tier, elite, skill: 2 });
    u.skill.gainSp(999);
    const fl = h.spawn('enemy_fly', { pos: [11, 7] });
    assert.ok(h.runUntil(() => u.skill.active, 1), `${label(f)}: cast`);
    const ammo0 = u.skill.ammoLeft;
    assert.ok(h.runUntil(() => !!u.findBuff('aglna2:move'), 0.5), `${label(f)}: the flight starts`);
    assert.ok(u.s.flags.invulnerable && u.s.flags.disarm, `${label(f)}: 无敌, disarmed in flight`);
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => u.tileR === 11 && u.tileC === 7, 5), `${label(f)}: on the flyer's tile`);
    approx(h.b.time - t0, Math.hypot(1, 3) / 2, `${label(f)}: at 2 tiles/s`, 0.05);
    assert.ok(u.skill.active && u.skill.ammoLeft <= ammo0, `${label(f)}: the skill kept`);
    assert.ok(h.runUntil(() => fl.blockedBy === u, 1), `${label(f)}: she blocks it`);
    const m = h.b.allyUnits.find((t) => t.kind === 'token' && t.defId === MARKER && t.alive);
    assert.ok(m, `${label(f)}: the marker`);
    assert.deepEqual([m.tileR, m.tileC], [10, 4], `${label(f)}: on her deployment tile`);
    assert.ok(m.s.flags.invulnerable && m.s.flags.untargetable && m.s.flags.isolated && m.s.flags.noBlock, `${label(f)}: 无敌, 孤立, unselectable, blocks nothing`);
    // her range: the 3-9 of (10, 4) facing RIGHT + the 8 around her new tile (11, 7)
    const keys = new Set(u.rangeKeys);
    assert.ok(keys.has(12 * 21 + 4) && keys.has(9 * 21 + 5), `${label(f)}: the anchored 3-9 ((12, 4), (9, 5))`);
    assert.ok(keys.has(12 * 21 + 8) && keys.has(11 * 21 + 8), `${label(f)}: the 8 around her ((12, 8), (11, 8))`);
    assert.ok(!keys.has(11 * 21 + 10), `${label(f)}: no 3-9 around her new tile ((11, 10))`);
    u.skill.end('test');
    assert.deepEqual([u.tileR, u.tileC], [10, 4], `${label(f)}: back home at the end`);
    assert.ok(!m.alive, `${label(f)}: the marker left`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)}: 2-2`);
    assert.equal(u.extraRangeKeys, null);
    done(h);
  }
  // blocking something, she stays
  {
    const { h, u } = field({ tier: 5, skill: 2 });
    u.skill.gainSp(999);
    const fl = h.spawn('enemy_fly', { pos: [11, 7] });
    assert.ok(h.runUntil(() => fl.blockedBy === u, 5), 'she flew to it and blocks it');
    const at = [u.tileR, u.tileC];
    h.spawn('enemy_fly', { pos: [9, 6] });
    h.run(2);
    assert.deepEqual([u.tileR, u.tileC], at, 'no move while blocking');
    done(h);
  }
});
