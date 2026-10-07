// test/content/op_chyue.test.js — the 自选 operator kit of 重岳 (char_2024_chyue, 6★ 斗士; kit
// server/sim/content/kits/ops/op-chyue.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, FGT-X
// “自晦及明” or FGT-Y “朔” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of
// that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_chyue.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHYUE = 'char_2024_chyue';
const FORMS = BACKUPS.units[CHYUE].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const FGTX = 'uniequip_002_chyue', FGTY = 'uniequip_003_chyue';
const S1 = 'skchr_chyue_1', S2 = 'skchr_chyue_2', S3 = 'skchr_chyue_3';
const X6 = [[2, 0], [1, 0], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, 0], [-2, 0]];
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_frail: dummy('enemy_frail', { hp: 100 }), enemy_mid: dummy('enemy_mid', { hp: 3000 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, FGTX, FGTY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const markOf = (u, e) => e.findBuff(`talent:chyue:mark#${u.id}`);

/** A battle with 重岳 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: CHYUE, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.target?.side === 'enemy');
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('重岳 in every 自选 form: his operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 1, melee ground-only, 炎, no 特质; FGT-X 15 % physical dodge, FGT-Y +10 ASPD above 50 % HP', () => {
  assert.equal(OPERATOR_KITS[CHYUE], KITS[CHYUE]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [CHYUE, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [1, 'melee', false, 'phys', 0.78], `${label(f)}: 斗士`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: ground enemies target him`);
      assert.equal(u.s.dodgePhys, elite && mod === FGTX ? 0.15 : 0, `${label(f)}: FGT-X 物理闪避`);
      assert.equal(u.s.aspd, elite && mod === FGTY ? 110 : 100, `${label(f)}: FGT-Y at full HP`);
      if (elite && mod === FGTY) {
        u.hp = u.s.maxHp * 0.5;
        h.step();
        assert.equal(u.s.aspd, 100, `${label(f)}: FGT-Y off at 50 % (not above)`);
      }
      done(h);
    }
  }
  // the numbers of the forms (zh_CN, full potential): E2 Lv1 2160 / 501 / 304, E2 Lv60 2475 / 576 / 343; FGT-X +210 / +25 / +20 →
  // +260 / +45 / +30, FGT-Y +52 / +25 → +75 / +35 ATK / DEF
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2160, 501, 2475, 576]);
  assert.deepEqual([modOf(5, FGTX).attr, modOf(6, FGTX).attr, modOf(5, FGTY).attr, modOf(6, FGTY).attr],
    [{ maxHp: 210, atk: 25, def: 20 }, { maxHp: 260, atk: 45, def: 30 }, { atk: 52, def: 25 }, { atk: 75, def: 35 }]);
  assert.deepEqual([modOf(5, FGTX).traitOverride.bb, modOf(6, FGTY).traitOverride.bb], [{ prob: 0.15 }, { attack_speed: 10, hp_ratio: 0.5 }]);
});

test('a 自选 pick: 重岳 is offered at tiers 5 and 6 (he has a kit) and a roster with him passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(CHYUE));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(CHYUE), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: CHYUE, skillIndex: 0, uniEquipId: FGTX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: CHYUE, skillIndex: 0, uniEquipId: FGTX } } });
});

test('S1 冲盈 (MANUAL, attack SP 5 / 4, 3 charges, data DEFAULT): 250 % / 290 % ATK on the attack target; from a full stack (蓄力) every charge goes and it strikes 3 times', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, u.skill.maxCharges, sk.initSp, sk.bb.atk_scale, sk.bb.times],
      ['DEFAULT', 'attack', elite ? 4 : 5, 3, 0, elite ? 2.9 : 2.5, 3], `T${tier}`);
    // a full stack: 蓄力
    u.skill.gainSp(999);
    assert.equal(u.skill.charges, 3);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const fly = h.spawn('enemy_fly', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `T${tier}: cast`);
    h.step();
    const strike = hitsBy(h, u).filter((c) => c.dmg.isSkill);
    assert.equal(strike.length, 3, `T${tier}: three strikes`);
    for (const c of strike) {
      assert.equal(c.target, e, `T${tier}: the ground target`);
      approx(c.dmg.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} %`);
      assert.ok(c.dmg.mul === 1 || Math.abs(c.dmg.mul - 1.7) < 1e-9, `T${tier}: ×1 or ×1.7 (止戈)`);
      approx(c.amount, c.dmg.amount * c.dmg.mul, `T${tier}: physical, DEF 0`);
    }
    assert.deepEqual([u.skill.charges, u.skill.sp], [0, 0], `T${tier}: every charge spent`);
    assert.ok(!hitsBy(h, u).some((c) => c.target === fly), `T${tier}: never the flyer`);
    // one charge: one strike
    u.skill.gainSp(u.skill.spCost);
    assert.equal(u.skill.charges, 1);
    const n0 = hitsBy(h, u).filter((c) => c.dmg.isSkill).length;
    assert.ok(h.runUntil(() => u.skill.activations === 2, 4), `T${tier}: second cast`);
    h.step();
    assert.equal(hitsBy(h, u).filter((c) => c.dmg.isSkill).length - n0, 1, `T${tier}: one strike`);
    done(h);
  }
});

test('S1 冲盈: exact damage — 290 % ATK per strike, ×1.7 on a 止戈-marked target; the strike rolls no 止戈 and gives no attack SP', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 0 });
  const sk = skillOf(6, true, S1);
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  u.skill.gainSp(u.skill.spCost);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 3));
  h.step();
  const c = hitsBy(h, u).find((x) => x.dmg.isSkill);
  approx(c.amount, u.s.atk * sk.bb.atk_scale, '290 % (no mark yet)');
  assert.equal(markOf(u, e), null, 'the skill strike marks nothing');
  assert.equal(u.skill.sp, 0, 'no attack SP for the strike');
  h.b.addBuff(e, { key: `talent:chyue:mark#${u.id}`, duration: 2.5 });
  u.skill.gainSp(u.skill.spCost);
  assert.ok(h.runUntil(() => u.skill.activations === 2, 4));
  h.step();
  const c2 = hitsBy(h, u).filter((x) => x.dmg.isSkill)[1];
  approx(c2.amount, u.s.atk * sk.bb.atk_scale * 1.7, '×1.7 on the marked target');
  done(h);
});

test('S2 拂尘 (MANUAL, 2 charges, data SKILL_RANGE x-4): ≤ 4 enemies around (air too; his marked ones first, then the one he blocks) take 290 % / 350 %; the marked ground ones 浮空 2 s; 0.5 s later every 浮空 enemy around loses it, takes 410 % / 480 % and is marked', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1, row: 9 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, u.skill.maxCharges, sk.initSp, sk.rangeId, sk.bb.max_target, sk.bb.atk_scale, sk.bb.atk_scale_down],
      ['SKILL_RANGE', 'time', elite ? 11 : 12, 2, elite ? 7 : 6, 'x-4', 4, elite ? 3.5 : 2.9, elite ? 4.8 : 4.1], `T${tier}`);
    const blocked = h.spawn('enemy_dummy', { pos: [9, 5] });
    const m1 = h.spawn('enemy_dummy', { pos: [10, 6] });
    const m2 = h.spawn('enemy_dummy', { pos: [10, 4] });
    const flyM = h.spawn('enemy_fly', { pos: [8, 6] });
    const plain1 = h.spawn('enemy_dummy', { pos: [8, 4] });
    const plain2 = h.spawn('enemy_dummy', { pos: [9, 6] });
    const outside = h.spawn('enemy_dummy', { pos: [9, 7] });
    const lifted = h.spawn('enemy_dummy', { pos: [10, 5] });   // 浮空 by another source, not marked
    h.step();
    assert.equal(blocked.blockedBy, u);
    for (const e of [m1, m2, flyM]) h.b.addBuff(e, { key: `talent:chyue:mark#${u.id}`, duration: 9 });
    h.b.applyStatus(lifted, 'levitate', { duration: 5, source: null });
    assert.ok(lifted.isFlying);
    u.skill.gainSp(sk.spCost);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 2), `T${tier}: cast`);
    const t0 = h.b.time;
    const first = hitsBy(h, u).filter((c) => c.dmg.isSkill);
    const hitSet = new Set(first.map((c) => c.target));
    assert.equal(first.length, 4, `T${tier}: four targets`);
    assert.deepEqual([m1, m2, flyM, blocked].map((e) => hitSet.has(e)), [true, true, true, true], `T${tier}: the marked (flyer included), then the blocked one`);
    assert.ok(![plain1, plain2, outside].some((e) => hitSet.has(e)), `T${tier}: no room for the rest`);
    for (const c of first) approx(c.amount, u.s.atk * sk.bb.atk_scale * (markOf(u, c.target) ? 1.7 : 1), `T${tier}: ${sk.bb.atk_scale * 100} %`);
    assert.deepEqual([m1, m2, flyM, blocked].map((e) => !!e.s.flags.levitate), [true, true, false, false], `T${tier}: the marked ground ones 浮空 (not a flyer, not the unmarked)`);
    approx(m1.findBuff('levitate').timeLeft, 2, `T${tier}: 2 s`, 0.05);
    assert.equal(blocked.blockedBy, u, 'still blocked');
    h.run(0.4);
    assert.equal(hitsBy(h, u).filter((c) => c.dmg.isSkill).length, 4, `T${tier}: nothing yet`);
    h.runUntil(() => h.b.time >= t0 + 0.5 - 1e-9, 0.3);
    h.step();
    const second = hitsBy(h, u).filter((c) => c.dmg.isSkill).slice(4);
    assert.deepEqual(new Set(second.map((c) => c.target)), new Set([m1, m2, lifted]), `T${tier}: every 浮空 enemy around (the other source's too)`);
    for (const c of second) approx(c.amount, u.s.atk * sk.bb.atk_scale_down * (c.target === lifted ? 1 : 1.7), `T${tier}: ${sk.bb.atk_scale_down * 100} % (its own mark comes after the damage)`);
    for (const e of [m1, m2, lifted]) {
      assert.ok(!e.s.flags.levitate, `T${tier}: 浮空 over`);
      approx(markOf(u, e).timeLeft, 2.5, `T${tier}: marked 2.5 s`, 0.1);
    }
    done(h);
  }
});

test('S3 我无 (MANUAL, attack SP 11 / 10, data DEFAULT): its strike hits the target and the ground enemies within 0.8 for 240 % / 300 %; the 5th cast turns him — x-6, double normal hits, +1 SP per attack (阻回 ignored), a self-cast the moment SP is full, the strike lands twice; a redeploy undoes it', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, seed: 9 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.initSp, sk.bb.atk_scale, sk.bb.cast_cnt], ['DEFAULT', 'attack', elite ? 10 : 11, 0, elite ? 3 : 2.4, 5], `T${tier}`);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const near = h.spawn('enemy_dummy', { pos: [10.6, 6.4] });
    const fly = h.spawn('enemy_fly', { pos: [10, 6] });
    const far = h.spawn('enemy_dummy', { pos: [11, 7] });
    const strikes = () => hitsBy(h, u).filter((c) => c.dmg.isSkill);
    for (let n = 1; n <= 5; n++) {
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.activations === n, 5), `T${tier}: cast ${n} (3 s apart: the automatic-operation cooldown)`);
      h.step();
      assert.equal(u.mem.chyueAwake, n === 5, `T${tier}: transformed after the 5th cast only`);
    }
    const pre = strikes();
    assert.equal(pre.length, 10, `T${tier}: each of the five strikes hits the target and the one within 0.8`);
    assert.deepEqual(new Set(pre.map((c) => c.target)), new Set([e, near]), `T${tier}: not the flyer, not the one 1.4 away`);
    for (const c of pre) {
      approx(c.dmg.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} %`);
      approx(c.amount, c.dmg.amount * c.dmg.mul, `T${tier}: physical (×1.7 on a marked one)`);
    }
    assert.deepEqual(u.liveRangeGrid, X6, `T${tier}: x-6`);
    assert.ok(!hitsBy(h, u).some((c) => c.target === fly || c.target === far), `T${tier}: never the flyer / far one before`);
    // transformed: two hits per normal attack, 2 SP per attack (阻回 does not stop the extra one)
    const n0 = hitsBy(h, u).length;
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true }, duration: 30 });
    const sp0 = u.skill.sp;
    h.runUntil(() => hitsBy(h, u).length > n0, 3);
    h.step();
    const plain = hitsBy(h, u).slice(n0).filter((c) => !c.dmg.isSkill);
    assert.ok(plain.length >= 1 && plain.length % 2 === 0, `T${tier}: double hits`);
    assert.equal(new Set(plain.map((c) => c.dmg.attackId)).size, plain.length / 2, `T${tier}: two per attack`);
    approx(u.skill.sp - sp0, plain.length / 2, `T${tier}: +1 SP per attack under 阻回`);
    h.b.removeBuff(u, 'test:noSp');
    // the self-cast: it fires the moment its SP is full (no 3 s operation cooldown), the strike twice
    const c6 = u.skill.activations;
    const s0 = strikes().length;
    u.skill.gainSp(999);
    h.step();
    assert.equal(u.skill.activations, c6 + 1, `T${tier}: cast at once`);
    const twice = strikes().slice(s0);
    assert.equal(twice.filter((c) => c.target === e).length, 2, `T${tier}: the strike lands twice on its target`);
    assert.equal(twice.filter((c) => c.target === near).length, 2, `T${tier}: and twice around it`);
    assert.ok(far.alive && !twice.some((c) => c.target === far || c.target === fly));
    // a redeploy starts untransformed
    h.b.kill(u, e);
    h.b.redeploy(u);
    h.step();
    assert.deepEqual([u.mem.chyueAwake, u.mem.chyueCasts], [false, 0], `T${tier}: reset`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: 1-1 again`);
    done(h);
  }
});

test('T1 止戈: each normal-attack damage instance rolls 25 % to mark its target for 2.5 s (not that instance), every damage of his to a marked target ×1.7 — FGT-Y stage 3 ×1.8 at 23 % (stage 1 ×1.7)', () => {
  for (const f of [[5, false, null], [5, true, FGTY], [6, true, FGTY]]) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, seed: 21 });
    const t0 = u.def.raw.talents.find((t) => t.index === 0).bb;
    // full potential: 25 % / ×1.7; FGT-Y stage 3: ×1.8, its blackboard keeps prob 0.23 (its text reads 25%（+2%）)
    const y3 = tier === 6 && mod === FGTY;
    const [prob, scale] = y3 ? [0.23, 1.8] : [0.25, 1.7];
    assert.deepEqual([t0.prob, t0.damage_scale, t0.up_duration], [prob, scale, 2.5], label(f));
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    let marked = 0, plainHits = 0, prevMarked = false;
    h.b.on('hit', (c) => { if (c.source === u && c.target === e && c.dmg.isAttack && !c.dmg.isSkill) prevMarked = !!markOf(u, e); }, { priority: 100 });
    const amounts = [];
    h.b.on('damaged', (c) => {
      if (c.source !== u || c.target !== e || c.dmg.isSkill) return;
      plainHits++;
      amounts.push([c.amount, prevMarked]);
      if (!prevMarked && markOf(u, e)) marked++;
    });
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true }, duration: Infinity });   // keep S1 off: plain attacks only
    h.run(400);
    const unmarkedHits = amounts.filter(([, m]) => !m).length;
    const rate = marked / unmarkedHits;
    assert.ok(rate > prob - 0.05 && rate < prob + 0.05, `${label(f)}: ${marked} / ${unmarkedHits} ≈ ${prob * 100} %`);
    for (const [amt, m] of amounts.slice(0, 50)) approx(amt, u.s.atk * (m ? scale : 1), `${label(f)}: ×${scale} while marked`);
    assert.ok(plainHits > 400);
    done(h);
  }
});

test('T2 万象为宾: a skill kill gives 3 SP when the skill ends (阻回 ignored; FGT-X stage 3: 4, and 1 when it killed nobody — stage 1: 3 / 0); a normal-attack kill gives nothing; S2\'s second segment is judged on its own', () => {
  for (const f of [[5, true, null], [5, true, FGTX], [6, true, FGTX]]) {
    const [tier, elite, mod] = f;
    const x3 = tier === 6 && mod === FGTX;
    const { h, u } = field({ tier, elite, mod, skill: 1, row: 9 });
    const t1 = u.def.raw.talents.find((t) => t.index === 1).bb;
    assert.equal(t1.sp, x3 ? 4 : 3, label(f));
    const s2 = skillOf(tier, elite, S2);
    // a cast that kills: +sp at its end; the second segment (no 浮空 enemy) gives the unkill part alone
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true }, duration: Infinity });
    const frail = h.spawn('enemy_frail', { pos: [10, 6] });
    u.skill.sp = 0;
    u.skill.addCharge(1);
    const sp0 = u.skill.sp;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 2), label(f));
    assert.ok(!frail.alive, `${label(f)}: killed by the skill`);
    approx(u.skill.sp - sp0, x3 ? 4 : 3, `${label(f)}: +${x3 ? 4 : 3} under 阻回`);
    h.run(1.05);
    approx(u.skill.sp - sp0, (x3 ? 4 : 3) + (x3 ? 1 : 0), `${label(f)}: the second segment killed nobody: +${x3 ? 1 : 0}`);
    // a cast that kills nobody
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const sp1 = u.skill.sp;
    u.skill.addCharge(1);
    h.run(3.5);
    assert.equal(u.skill.activations, 2, label(f));
    approx(u.skill.sp - sp1, x3 ? 2 : 0, `${label(f)}: no kill: ${x3 ? '1 + 1' : 'nothing'}`);
    assert.ok(e.alive);
    assert.ok(s2.spCost > 0);
    done(h);
  }
  // a normal-attack kill gives nothing; S2's second segment killing gives its own SP
  const { h, u } = field({ tier: 6, elite: true, mod: FGTX, skill: 1, row: 9 });
  h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true }, duration: Infinity });
  u.skill.sp = 0;
  const weak = h.spawn('enemy_frail', { pos: [9, 6] });
  h.runUntil(() => !weak.alive, 3);
  assert.equal(u.skill.sp, 0, 'a normal-attack kill: nothing (and 阻回 blocks the attack SP: time SP anyway)');
  const tough = h.spawn('enemy_dummy', { pos: [10, 6] });
  const late = h.spawn('enemy_mid', { pos: [10, 5] });      // survives segment 1 (350 %), not segment 2 (+480 %)
  h.b.applyStatus(late, 'levitate', { duration: 5, source: null });
  h.b.addBuff(tough, { key: `talent:chyue:mark#${u.id}`, duration: 9 });
  u.skill.addCharge(1);
  const sp0 = u.skill.sp;
  assert.ok(h.runUntil(() => u.skill.activations === 1, 2));
  approx(u.skill.sp - sp0, 1, 'segment 1 killed nobody: +1');
  h.run(1.05);
  assert.ok(!late.alive, 'the second segment killed the 浮空 one');
  approx(u.skill.sp - sp0, 1 + 4, 'segment 2 killed: +4');
  done(h);
});
