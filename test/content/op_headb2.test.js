// test/content/op_headb2.test.js — the 自选 operator kit of 怒潮凛冬 (char_1051_headb2, 6★ 撼地者; kit
// server/sim/content/kits/ops/op-headb2.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in every
// form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or HAM-X 迟到的勋章 at
// stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of that slot status); the
// fidelity checklist of kits/README.md item by item. The 高台 of 汹涌怒火 are HIGH tiles of the field rect: the tests put
// forbidden blocks ('#') next to the lane of the flat stage.
// Run: node --test test/content/op_headb2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ZIMA = 'char_1051_headb2';
const FORMS = BACKUPS.units[ZIMA].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const HAMX = 'uniequip_002_headb2';
const S1 = 'skchr_headb2_1', S2 = 'skchr_headb2_2', S3 = 'skchr_headb2_3';
const TIDE = 'talent:headb2:tide';
/** The Skill_3 clip of the battle skeleton (30 fps): OnAttack at frames 33 / 84 / 133 / 182 / 233, 277 frames long. */
const HAMMER_T = [33, 84, 133, 182, 233].map((f) => f / 30), SKILL3_T = 277 / 30;
/** Row 11 of the flat stage with one 高台 at (11, 7) — diagonal to the tile ahead of her (10, 6) — or a row of four. */
const ONE_HIGH = { 11: '##hrrrr#rrfrrrrrrrf##' };
const FOUR_HIGH = { 11: '##hrrrr####rrrrrrrf##' };
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, HAMX].map((m) => [t, true, m]))];

/** A battle with 怒潮凛冬 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5, rows = null, noSp = false } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed, flat: rows ? { rows } : undefined,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'spGain', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ZIMA, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  const u = h.unit(1);
  if (noSp) h.b.on('spGain', (c) => { if (c.unit === u) c.amount = 0; });
  return { h, u };
}
const dmgOn = (h, e, pred = () => true) => h.hooksOf('damaged').filter((c) => c.target === e && pred(c));
const highland = (c) => (c.dmg?.tags ?? []).includes('headb2Highland');
const hammerHit = (c) => (c.dmg?.tags ?? []).includes('headb2Hammer');
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const t0Of = (u) => u.def.raw.talents.find((t) => t.index === 0).bb;

test('怒潮凛冬 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + HAM-X attributes, 1-1, blocks 2, melee physical ground-only with the 撼地者 splash, no bond, no 特质', () => {
  assert.equal(OPERATOR_KITS[ZIMA], KITS[ZIMA]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ZIMA, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [2, 'melee', 'phys', false, 1.8], `${label(f)}: 撼地者`);
      assert.deepEqual([u.profile.splashRadius, u.profile.splashScale, u.profile.splashOthersOnly], [1, 0.5, true], `${label(f)}: the trait splash`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // zh_CN (full potential: ATK +40): E2 Lv1 2301 / 1100 / 346, E2 Lv60 2731 / 1234 / 387; HAM-X +250 / +63 / +21 →
  // +380 / +83 / +30
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2301, 1100, 2731, 1234]);
  assert.deepEqual([modOf(5, HAMX).attr, modOf(6, HAMX).attr], [{ maxHp: 250, atk: 63, def: 21 }, { maxHp: 380, atk: 83, def: 30 }]);
});

test('a 自选 pick: 怒潮凛冬 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(ZIMA));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(ZIMA), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: ZIMA, skillIndex: 2, uniEquipId: HAMX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: ZIMA, skillIndex: 2, uniEquipId: HAMX } } });
});

test('trait + T1 汹涌怒火 + HAM-X: the target takes ATK, the others within 1.0 the 50 % splash ×1.24 (HAM-X stage 3 ×1.4) — not flyers; with 3 enemies in the splash range HAM-X lifts the attack to 115 %', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, noSp: true });
    const ds = t0Of(u).damage_scale;
    assert.equal(ds, elite && tier === 6 && mod === HAMX ? 1.4 : 1.24, `${label(f)}: damage_scale`);
    const a = h.spawn('enemy_dummy', { pos: [10, 6] });
    const c = h.spawn('enemy_dummy', { pos: [9, 6] });
    const fly = h.spawn('enemy_fly', { pos: [11, 6] });
    h.run(0.1);
    const ma = dmgOn(h, a), mc = dmgOn(h, c);
    assert.ok(ma.length === 1 && mc.length === 1, `${label(f)}: one attack (${ma.length} / ${mc.length})`);
    approx(ma[0].amount, u.s.atk, `${label(f)}: the target 100 % (no ×${ds})`);
    approx(mc[0].amount, u.s.atk * 0.5 * ds, `${label(f)}: splash 50 % × ${ds}`);
    assert.deepEqual([mc[0].dmg.isSplash, mc[0].type], [true, 'phys']);
    assert.equal(dmgOn(h, fly).length, 0, `${label(f)}: no flyer`);
    // a third enemy in the splash range: HAM-X ×1.15 on the attack
    h.spawn('enemy_dummy', { pos: [10, 7] });
    h.run(u.s.interval);
    const hx = elite && mod === HAMX ? 1.15 : 1;
    const ma2 = dmgOn(h, a).slice(1), mc2 = dmgOn(h, c).slice(1);
    assert.ok(ma2.length >= 1 && mc2.length >= 1, `${label(f)}: the next attack`);
    approx(ma2[0].amount, u.s.atk * hx, `${label(f)}: the target ×${hx}`);
    approx(mc2[0].amount, u.s.atk * 0.5 * ds * hx, `${label(f)}: the splash ×${hx}`);
    done(h);
  }
});

test('T1 汹涌怒火 高台: every 高台 the 1.0 circle around her target touches hits the ground enemies of its x-5 0.1 s later — 27 % ATK physical 溅射 (no dodge, 无来源, 远程途径) + 停顿 0.5 s; HAM-X: ×1.15 with 3 there', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, noSp: true, rows: ONE_HIGH });
    const t0 = t0Of(u);
    assert.deepEqual([t0['attack@splash_atk_scale'], t0['attack@sluggish']], [0.27, 0.5], label(f));
    assert.equal(h.b.grid.tile(11, 7).height, 'HIGH');
    const a = h.spawn('enemy_dummy', { pos: [10, 6] });
    const b = h.spawn('enemy_dummy', { pos: [12, 7] });        // only on (11, 7)'s x-5
    const far = h.spawn('enemy_dummy', { pos: [12, 9] });      // on no 高台's x-5
    const fly = h.spawn('enemy_fly', { pos: [11, 8] });         // an air unit on the x-5
    h.step();
    const atkT = h.b.time, atk = u.s.atk;
    assert.equal(dmgOn(h, a).length, 1, `${label(f)}: her attack`);
    h.run(0.05);
    assert.equal(dmgOn(h, b).length, 0, `${label(f)}: not before 0.1 s`);
    h.run(0.1);
    const hb = dmgOn(h, b);
    assert.equal(hb.length, 1, `${label(f)}: the 高台 splash`);
    const d = hb[0];
    approx(d.t - atkT, 0.1, `${label(f)}: 0.1 s after the attack`, 0.4);
    approx(d.amount, atk * 0.27, `${label(f)}: 27 % ATK`);
    assert.deepEqual([d.type, d.source, d.credit, d.dmg.isSplash, d.dmg.canDodge, d.dmg.sourceless, d.dmg.isProjectile], ['phys', null, u, true, false, true, true], `${label(f)}: physical 溅射, 无来源 credited to her, 远程途径`);
    const st = h.hooksOf('statusApplied').filter((s) => s.target === b && s.status === 'sluggish');
    assert.ok(st.length === 1 && Math.abs(st[0].duration - 0.5) < 1e-9, `${label(f)}: 停顿 0.5 s`);
    assert.ok(dmgOn(h, far).length === 0 && dmgOn(h, fly).length === 0, `${label(f)}: off the x-5 / air: nothing`);
    assert.equal(dmgOn(h, a, highland).length, 0, `${label(f)}: the target is diagonal to the 高台 — not on its x-5`);
    // three ground enemies on the x-5: HAM-X ×1.15 on that splash
    h.spawn('enemy_dummy', { pos: [11, 6] });
    h.spawn('enemy_dummy', { pos: [11, 8] });
    const n0 = dmgOn(h, b, highland).length;
    h.run(u.s.interval + 0.2);
    const next = dmgOn(h, b, highland).slice(n0);
    assert.ok(next.length >= 1, `${label(f)}: the next attack's 高台 splash`);
    approx(next[0].amount, u.s.atk * 0.27 * (elite && mod === HAMX ? 1.15 : 1), `${label(f)}: ×${elite && mod === HAMX ? 1.15 : 1} with 3 on the x-5`);
    done(h);
  }
});

test('S2 绝不罢休\'s passive: +1 SP per 高台 that triggers 汹涌怒火 (none without one, none while the skill runs)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.equal(sk.bb.sp_per_highland, 1);
    const { h, u } = field({ tier, elite, skill: 1, rows: FOUR_HIGH, seed: 9 });
    h.spawn('enemy_dummy', { pos: [10, 6] });               // (11, 7) only
    const talentSp = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'talent');
    const attacks = () => h.hooksOf('attack').filter((c) => c.attacker === u).length;
    h.run(5);
    assert.ok(attacks() >= 2 && talentSp().length === attacks(), `T${tier}: ${talentSp().length} SP gifts for ${attacks()} attacks (one 高台 each)`);
    assert.ok(talentSp().every((c) => c.amount === 1));
    assert.ok(h.runUntil(() => u.skill.active, 60), `T${tier}: S2 casts`);
    const n = talentSp().length;
    h.run(5);
    assert.equal(talentSp().length, n, `T${tier}: none while it runs`);
    done(h);
  }
  // no 高台 around her target: no gift
  const { h, u } = field({ tier: 5, skill: 1, seed: 9 });
  h.spawn('enemy_dummy', { pos: [10, 6] });
  h.run(5);
  assert.equal(h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'talent').length, 0);
  done(h);
});

test('T2 万众巨潮: while a skill of hers runs every operator of the field ATK / DEF +18 % — 【乌萨斯学生自治团】 (her, 古米) +36 % — and nothing before or after it', () => {
  for (const [tier, elite, skill] of [[5, false, 0], [6, true, 1]]) {
    const others = [{ uid: 2, chessId: 'chess_char_1_10_a', row: 11, col: 3 }, { uid: 3, chessId: 'chess_char_1_08_a', row: 12, col: 3 }];
    const { h, u } = field({ tier, elite, skill, others });
    const gummy = h.unit(2), texas = h.unit(3);
    const t1 = u.def.raw.talents.find((t) => t.index === 1).bb;
    assert.deepEqual([t1.atk, t1.def, t1.scale_bonus], [0.18, 0.18, 2]);
    h.run(0.5);
    for (const o of [u, gummy, texas]) assert.equal(o.findBuff(TIDE), null, `T${tier}: nothing before her skill (${o.def.charId})`);
    u.skill.gainSp(999);
    if (skill === 0) { h.spawn('enemy_dummy', { pos: [10, 6] }); assert.ok(h.runUntil(() => u.skill.active, 3)); } else assert.ok(h.runUntil(() => u.skill.active, 1), 'S2 at full SP');
    for (const [o, v] of [[u, 0.36], [gummy, 0.36], [texas, 0.18]]) {
      const m = o.findBuff(TIDE)?.mods;
      assert.ok(m, `T${tier}: ${o.def.charId} in her skill`);
      approx(m.atkPct, v, `T${tier}: ${o.def.charId} ATK`);
      approx(m.defPct, v, `T${tier}: ${o.def.charId} DEF`);
    }
    h.run(3);
    assert.ok(texas.findBuff(TIDE), `T${tier}: kept while it runs`);
    u.skill.end('test');
    for (const o of [u, gummy, texas]) assert.equal(o.findBuff(TIDE), null, `T${tier}: gone at its end (${o.def.charId})`);
    done(h);
  }
});

test('S1 誓不低头 (MANUAL, DEFAULT): 30 s, ATK +32 % / 39 %, ASPD +35 / 40 (her own 万众巨潮 +36 % on top); all back after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.atk, sk.bb.attack_speed], ['DEFAULT', 30, elite ? 0.39 : 0.32, elite ? 40 : 35], `T${tier}`);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in range`);
    approx(u.skill.timeLeft, 30, `T${tier}: 30 s`, 0.01);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk + 0.36), `T${tier}: ATK`);
    approx(u.s.aspd, 100 + sk.bb.attack_speed, `T${tier}: ASPD`);
    h.runUntil(() => !u.skill.active, 40);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    done(h);
  }
});

test('S2 绝不罢休 (AUTO, SP_FULL — a self buff): at full SP with no enemy, 2-5, ATK +60 / 75 %, DEF +40 / 50 % for 16 s; the second cast of a deployment doubles them for good; a redeploy counts again', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.rule, sk.skillType, sk.duration, sk.spCost, sk.initSp, sk.rangeId], ['SP_FULL', 'AUTO', 16, elite ? 53 : 57, elite ? 24 : 20, '2-5'], `T${tier}`);
    h.run(sk.spCost - sk.initSp - 0.5);
    assert.equal(u.skill.activations, 0, `T${tier}: not before full SP`);
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: at full SP, no enemy on the field`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 2-5 while it runs`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk + 0.36), `T${tier}: ATK (+ her 万众巨潮)`);
    approx(u.s.def, u.base.def * (1 + sk.bb.def + 0.36), `T${tier}: DEF`);
    h.run(15.9);
    assert.ok(u.skill.active, `T${tier}: 16 s`);
    h.run(0.2);
    assert.ok(!u.skill.active, `T${tier}: over after 16 s`);
    assert.deepEqual(u.liveRangeGrid, [[0, 0], [0, 1]], `T${tier}: 1-1 again`);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: the second cast`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb['headb2_s_2[second].atk'] + 0.36), `T${tier}: ATK doubled`);
    approx(u.s.def, u.base.def * (1 + sk.bb['headb2_s_2[second].def'] + 0.36), `T${tier}: DEF doubled`);
    h.run(200);
    assert.ok(u.skill.active, `T${tier}: 持续时间无限`);
    h.b.retreat(u);
    h.b.redeploy(u);
    h.step();
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1));
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk + 0.36), `T${tier}: a new deployment's first cast`);
    done(h);
  }
});

test('S3 无可抵挡 (MANUAL, data CUSTOM_RANGE): five hammers on the Skill_3 clip\'s attack events (1.1 … 7.77 s), no normal attack, 9.23 s; the target ahead atk_scale × ATK, the others within 1.5 the splash; ATK +atk_base, +30 % per hammer; 高台 ×3.5 with 束缚, spreading k − 1 steps (0.1 s, then 0.125 s a step)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, HAMX]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, mod, skill: 2, rows: FOUR_HIGH, seed: 17 });
    assert.deepEqual([u.skill.rule, sk.bb.atk_scale, sk.bb.atk_step, sk.bb.splash_atk_scale_bonus, sk.bb.unmovable, sk.bb.atk_base],
      ['CUSTOM_RANGE', elite ? 2.1 : 1.9, 0.3, 3.5, elite ? 1.5 : 1, elite ? 0.8 : 0.65], `T${tier}`);
    const ds = t0Of(u).damage_scale;
    // the 高台 at (11, 7)…(11, 10); a dummy on each one's own x-5 tile below it
    const under = [7, 8, 9, 10].map((c) => h.spawn('enemy_dummy', { pos: [12, c] }));
    const side = h.spawn('enemy_dummy', { pos: [9, 7] });     // in the hammer's 1.5, not the 1.0 of the trait
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `T${tier}: nothing in the trigger grid`);
    const main = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: an enemy in the trigger grid`);
    const t0 = h.hooksOf('skillStart').find((c) => c.unit === u).t;
    approx(u.skill.timeLeft, SKILL3_T - (h.b.time - t0), `T${tier}: the clip's 277 frames`, 0.01);
    h.runUntil(() => !u.skill.active, 12);
    approx(h.b.time - t0, SKILL3_T, `T${tier}: over with the clip`, 0.02);
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u && c.t > t0 && c.t < t0 + SKILL3_T - 0.1).length, 0, `T${tier}: no normal attack`);
    const atkK = (k) => u.base.atk * (1 + sk.bb.atk_base + 0.36 + sk.bb.atk_step * (k - 1));
    const mh = dmgOn(h, main, (c) => c.t >= t0 && hammerHit(c));
    assert.equal(mh.length, 5, `T${tier}: five hammers on the target ahead`);
    mh.forEach((c, i) => { approx(c.t - t0, HAMMER_T[i], `T${tier}: hammer ${i + 1} at ${HAMMER_T[i].toFixed(3)} s`, 0.02); approx(c.amount, atkK(i + 1) * sk.bb.atk_scale, `T${tier}: hammer ${i + 1} ${sk.bb.atk_scale * 100} %`); });
    const sh = dmgOn(h, side, (c) => c.t >= t0 && hammerHit(c));
    assert.equal(sh.length, 5, `T${tier}: the splash within 1.5`);
    sh.forEach((c, i) => approx(c.amount, atkK(i + 1) * sk.bb.atk_scale * 0.5 * ds, `T${tier}: splash ${i + 1}`));
    // the 高台 rounds: hammer k reaches k − 1 steps along the row
    const counts = under.map((e) => dmgOn(h, e, (c) => c.t >= t0 && highland(c)).length);
    assert.deepEqual(counts, [5, 4, 3, 2], `T${tier}: (11, 7) every hammer, (11, 8) from the 2nd, (11, 9) the 3rd, (11, 10) the 4th`);
    const first = dmgOn(h, under[0], (c) => c.t >= t0 && highland(c));
    first.forEach((c, i) => approx(c.amount, atkK(i + 1) * 0.27 * 3.5, `T${tier}: 高台 ×3.5 at hammer ${i + 1}`));
    const last = dmgOn(h, under[3], (c) => c.t >= t0 && highland(c));
    approx(last[0].t - (t0 + HAMMER_T[3]), 0.1 + 3 * 0.125, `T${tier}: 0.1 s, then three spread steps of 0.125 s after the 4th hammer`, 0.03);
    const binds = h.hooksOf('statusApplied').filter((s) => s.target === under[0] && s.status === 'bind' && s.t >= t0);
    assert.ok(binds.length === 5 && binds.every((s) => Math.abs(s.duration - sk.bb.unmovable) < 1e-9), `T${tier}: 束缚 ${sk.bb.unmovable} s (${binds.length})`);
    assert.equal(h.hooksOf('statusApplied').filter((s) => s.target === under[0] && s.status === 'sluggish' && s.t >= t0).length, 0, `T${tier}: no 停顿 in the skill`);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    done(h);
  }
});

test('S3: leaving the field stops the 高台 spread at once; a hammer due while she is stunned is lost', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2, rows: FOUR_HIGH, seed: 17 });
  const under = [7, 8, 9, 10].map((c) => h.spawn('enemy_dummy', { pos: [12, c] }));
  h.spawn('enemy_dummy', { pos: [10, 6] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 1));
  const t0 = h.hooksOf('skillStart').find((c) => c.unit === u).t;
  h.run(HAMMER_T[3] + 0.15 - (h.b.time - t0));   // the 4th hammer: (11, 7) at +0.1, (11, 8) due at +0.225
  h.b.retreat(u);
  h.run(2);
  const counts = under.map((e) => dmgOn(h, e, (c) => c.t >= t0 && highland(c)).length);
  assert.deepEqual(counts, [4, 2, 1, 0], 'the 4th round stopped after its first step: (11, 8) / (11, 9) / (11, 10) keep the earlier rounds only');
  done(h);
  // stunned through the 1st hammer (1.1 s)
  const s = field({ tier: 5, skill: 2, seed: 17 });
  const main = s.h.spawn('enemy_dummy', { pos: [10, 6] });
  s.u.skill.gainSp(999);
  assert.ok(s.h.runUntil(() => s.u.skill.active, 1));
  s.h.run(1.0);
  s.h.b.applyStatus(s.u, 'stun', { duration: 1.5, source: null });
  s.h.runUntil(() => !s.u.skill.active, 12);
  assert.equal(dmgOn(s.h, main, hammerHit).length, 4, 'four hammers landed');
  done(s.h);
});
