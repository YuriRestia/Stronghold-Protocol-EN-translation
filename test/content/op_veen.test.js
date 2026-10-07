// test/content/op_veen.test.js — the 自选 operator kit of 维伊 (char_4226_veen, 6★ 秘术师; kit
// server/sim/content/kits/ops/op-veen.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or MSC-Y
// “军械库” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of that slot
// status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_veen.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const VEEN = 'char_4226_veen';
const FORMS = BACKUPS.units[VEEN].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const MSCY = 'uniequip_002_veen';
const S1 = 'skchr_veen_1', S2 = 'skchr_veen_2', S3 = 'skchr_veen_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const talentOf = (tier, elite, mod, i) => {
  const m = elite ? modOf(tier, mod) : null;
  return m?.talentChanges.find((t) => t.talentIndex === i)?.bb ?? formOf(tier, elite).talents.find((t) => t.index === i).bb;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, MSCY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'attack', 'ammoUsed'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: VEEN, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const warTicks = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && (c.dmg?.tags || []).includes('veenWar'));
const stored = (u) => ({ s: u.trait.veen?.s ?? 0, t: u.trait.veen?.t ?? 0 });
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Run until she holds `t` 转置能量 and `s` stored energies (no enemy on the field). */
function storeUp(h, u, t, s) {
  assert.ok(h.runUntil(() => stored(u).t === t && stored(u).s === s, 60), `stores up to ${t}/${s}`);
}

test('维伊 in every 自选 form: her operator kit (all three skills authored), stats + MSC-Y attributes, 3-14 range, ranged arts every 3 s that hits air units, targetable by ground enemies, 空 bond, no 特质', () => {
  assert.equal(OPERATOR_KITS[VEEN], KITS[VEEN]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [VEEN, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat, u.base.cost], [1, 'ranged', 'arts', true, 3, 24], `${label(f)}: 秘术师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-14`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual([FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.atk, FORMS['2/60/7/1'].trait.bb], [1142, 1320, { times: 9, merge_cnt: 3 }]);
  assert.deepEqual([modOf(5, MSCY).attr, modOf(6, MSCY).attr], [{ maxHp: 80, atk: 85 }, { maxHp: 190, atk: 120 }]);
});

test('a 自选 pick: 维伊 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(VEEN));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(VEEN), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: VEEN, skillIndex: 1, uniEquipId: MSCY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: VEEN, skillIndex: 1, uniEquipId: MSCY } } });
});

test('trait + T1: with no target her attack check stores one energy (an attack action: the interval restarts — PRTS 分支特性信息), 3 merge into a 转置能量, at most 3 of those (then she stops); ATK +12 % while she holds one, ASPD +15 while she holds none; MSC-Y: ASPD +30 while she holds any energy', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t0 = talentOf(tier, elite, mod, 0);
    assert.deepEqual(t0, { atk: 0.12, attack_speed: 15 }, label(f));
    const msc = elite && mod === MSCY ? 30 : 0;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    u.skill.sp = 0;
    assert.deepEqual(stored(u), { s: 1, t: 0 }, `${label(f)}: her first attack check (at deployment) stores at once`);
    approx(u.s.aspd, 100 + 15 + msc, `${label(f)}: no 转置能量: ASPD +15 (MSC-Y +30 while holding)`);
    approx(u.s.atk, u.base.atk, `${label(f)}: no ATK bonus`);
    const t1 = h.b.time;
    h.runUntil(() => stored(u).s === 2, 10);
    approx(h.b.time - t1, 3 * 100 / 115, `${label(f)}: the next one an attack interval later (set at the store, before MSC-Y)`, 0.03);
    const t2 = h.b.time;
    h.runUntil(() => stored(u).t === 1, 10);
    approx(h.b.time - t2, 3 * 100 / (115 + msc), `${label(f)}: then at the interval of ASPD ${115 + msc}`, 0.03);
    storeUp(h, u, 1, 0);
    approx(u.s.aspd, 100 + msc, `${label(f)}: a 转置能量: the ASPD +15 goes`);
    approx(u.s.atk, u.base.atk * 1.12, `${label(f)}: ATK +12 %`);
    storeUp(h, u, 3, 0);
    h.run(30);
    assert.deepEqual(stored(u), { s: 0, t: 3 }, `${label(f)}: no more storing at 3 转置能量`);
    done(h);
  }
});

test('the volley: 转置能量 first (300 % ATK each), the main attack (100 %), then the stored energies (100 %) — one target, all landing together, each with the ATK it left with (+12 % while a 转置能量 was held)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const { h, u } = field({ tier, elite, skill: 1 });
    u.skill.sp = 0;
    storeUp(h, u, 1, 2);
    const atk = u.s.atk;
    approx(atk, u.base.atk * 1.12, `T${tier}: holding a 转置能量`);
    const e = h.spawn('enemy_fly', { pos: [10, 7] });
    const a0 = atkHits(h, u).length;
    h.runUntil(() => atkHits(h, u).length > a0, 4);
    h.step();
    const hits = atkHits(h, u).slice(a0);
    assert.deepEqual(hits.map((c) => Math.round(c.amount / atk * 100) / 100), [3, 1, 1, 1], `T${tier}: 300 % + 100 % + 2 × 100 % at the cached ATK`);
    assert.ok(hits.every((c) => c.target === e && c.t === hits[0].t && c.dmg.attackId === hits[0].dmg.attackId && c.type === 'arts'), `T${tier}: one attack, one target (a flyer), together`);
    assert.deepEqual(stored(u), { s: 0, t: 0 }, `T${tier}: spent`);
    h.run(0.2);
    approx(u.s.atk, u.base.atk, `T${tier}: the ATK bonus gone after the volley`);
    done(h);
  }
});

test('T2 战争技艺: each hit adds a stack (a 转置能量 3) of 90 arts / s for 5 s, at most 3 (MSC-Y stage 3: 120 / s, at most 4); she never targets a marked enemy — with only marked ones in range she stores energy', () => {
  for (const f of [[5, false, null], [5, true, MSCY], [6, true, MSCY]]) {
    const [tier, elite, mod] = f;
    const t1 = talentOf(tier, elite, mod, 1);
    const s3m = elite && mod === MSCY && tier === 6;
    assert.deepEqual(t1, s3m ? { 'attack@duration': 5, 'attack@value': 120, 'attack@max_stack_cnt': 4 } : { 'attack@duration': 5, 'attack@value': 90, 'attack@max_stack_cnt': 3 }, label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    u.skill.sp = 0;
    h.run(3.1);
    u.trait.veen = null;   // (start the check with nothing stored)
    const a = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.runUntil(() => atkHits(h, u).length > 0, 4);
    h.step();
    const war = a.findBuff(`veen:war:${u.id}`);
    assert.ok(war && war.stacks === 1, `${label(f)}: 1 stack`);
    h.run(1.02);
    const ticks = warTicks(h, u, a);
    assert.equal(ticks.length, 1, `${label(f)}: a tick per second`);
    approx(ticks[0].amount, t1['attack@value'], `${label(f)}: ${t1['attack@value']} arts`);
    // marked: not targeted — she stores instead while it is her only enemy in range
    const n0 = atkHits(h, u).length;
    h.run(2.9);
    assert.equal(atkHits(h, u).length, n0, `${label(f)}: no attack on a marked enemy`);
    assert.ok(stored(u).s >= 1, `${label(f)}: her next attack check stored an energy instead`);
    // another enemy: targeted at once; the mark lapses 5 s after the last stack
    const b = h.spawn('enemy_dummy', { pos: [9, 7] });
    h.runUntil(() => atkHits(h, u).length > n0, 4);
    assert.ok(atkHits(h, u).slice(n0).every((c) => c.target === b), `${label(f)}: the unmarked one`);
    assert.ok(h.runUntil(() => !a.findBuff(`veen:war:${u.id}`), 6), `${label(f)}: 5 s`);
    assert.equal(warTicks(h, u, a).length, 5, `${label(f)}: 5 ticks`);
    done(h);
  }
  // a 转置能量 gives 3 stacks; the cap
  for (const [tier, mod, cap] of [[6, null, 3], [6, MSCY, 4]]) {
    const { h, u } = field({ tier, elite: true, mod, skill: 0 });
    u.skill.sp = 0;
    storeUp(h, u, 2, 0);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.runUntil(() => atkHits(h, u).length >= 3, 4);
    h.step();
    assert.equal(e.findBuff(`veen:war:${u.id}`).stacks, cap, `T6 ${mod ?? 'none'}: 2 × 3 + 1 stacks capped at ${cap}`);
    h.run(1.02);
    approx(warTicks(h, u, e)[0].amount, talentOf(6, true, mod, 1)['attack@value'] * cap, `${cap} stacks`);
    done(h);
  }
});

test('S1 “自呼号生发” (AUTO): ASPD +60 / +75 for 18 s, cast as soon as its SP is full (31 / 29 from 7 / 9) — no enemy needed', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spCost, sk.initSp, sk.duration, sk.bb.attack_speed], ['SP_FULL', elite ? 29 : 31, elite ? 9 : 7, 18, elite ? 75 : 60], `T${tier}`);
    h.run(sk.spCost - sk.initSp - 0.5);
    assert.equal(u.skill.activations, 0);
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: at full SP, no enemy`);
    const base = u.s.aspd - sk.bb.attack_speed;
    assert.ok(base === 115 || base === 100, `T${tier}: +${sk.bb.attack_speed} on top of ${base}`);
    approx(u.skill.timeLeft, 18, `T${tier}: 18 s`, 0.01);
    done(h);
  }
});

test('S2 “以鲜血洗去” (MANUAL, data DEFAULT): 28 s, attack interval 3.0 − 0.5 s; each released shot +9 % / +11 % ATK and +6 / +7 ASPD (a 转置能量 3 stacks), at most 8 / 9 — later shots of a volley carry the stacks of the earlier ones', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const b = sk.bb;
    const per = b['attack@veen_s_2_buff[stack].atk'], perAs = b['attack@veen_s_2_buff[stack].attack_speed'], max = b['attack@veen_s_2_buff[stack].max_stack_cnt'];
    assert.deepEqual([sk.duration, b.base_attack_time, per, perAs, max], [28, -0.5, elite ? 0.11 : 0.09, elite ? 7 : 6, elite ? 9 : 8], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.equal(u.skill.rule, 'DEFAULT');
    u.skill.sp = 0;
    storeUp(h, u, 1, 1);
    const base = u.base.atk;
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast as she attacks`);
    h.step(2);
    approx(u.s.interval, 2.5 * 100 / u.s.aspd, `T${tier}: base interval 2.5 s`);
    const hits = atkHits(h, u);
    h.runUntil(() => atkHits(h, u).length >= 3, 4);
    const v = atkHits(h, u).slice(0, 3);
    // 转置能量 (0 stacks, +12 %), main (3 stacks), stored (4 stacks) — every one +12 % (a 转置能量 was held)
    approx(v[0].amount, base * (1 + 0.12) * 3, `T${tier}: 转置能量 before any stack`);
    approx(v[1].amount, base * (1 + 0.12 + 3 * per), `T${tier}: the main shot after 3`);
    approx(v[2].amount, base * (1 + 0.12 + 4 * per), `T${tier}: the stored one after 4`);
    assert.ok(hits.length <= 3);
    approx(u.s.aspd, 100 + 15 + 5 * perAs, `T${tier}: 5 stacks of ASPD (and T1's +15 again)`);
    h.run(25);
    assert.equal(u.findBuff('veen:s2stack').mods.atkPct, per * max, `T${tier}: at most ${max}`);
    h.runUntil(() => !u.skill.active, 10);
    assert.equal(u.findBuff('veen:s2stack'), null, `T${tier}: gone with the skill`);
    void e;
    done(h);
  }
});

test('S3 “用赤铁铭记” (MANUAL, data DEFAULT): 18 / 21 bullets, ASPD +110 / +140; an attack spends 1 bullet per stored energy and 3 per 转置能量 (none without), its stored shots deal nothing and its main hit bounces that many times — every 0.5 s within 1.7 tiles, a new enemy first — for 130 % / 140 % of the cached ATK, each with a 战争技艺 stack', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const b = sk.bb;
    assert.deepEqual([b['attack@trigger_time'], b.attack_speed, b['attack@bounce_atk_scale'], b['attack@base_atk_scale']], [elite ? 21 : 18, elite ? 140 : 110, elite ? 1.4 : 1.3, 1], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.equal(u.skill.rule, 'DEFAULT');
    u.skill.sp = 0;
    storeUp(h, u, 1, 1);
    const atk = u.s.atk;
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    const near = h.spawn('enemy_fly', { pos: [10, 8.2] });
    const far = h.spawn('enemy_dummy', { pos: [10, 12] });   // out of her range and 3.8 from the target
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast as she attacks`);
    assert.deepEqual([u.skill.kind, u.skill.ammoMax], ['ammo', b['attack@trigger_time']], `T${tier}`);
    approx(u.s.aspd, 100 + b.attack_speed + 15, `T${tier}: ASPD (+ T1's 15: the volley spent the 转置能量)`, 1e-9);
    h.run(2.2);
    // the first attack: 1 + 3 = 4 bullets, the main hit then 4 bounces (e ↔ near: a new enemy first, then back)
    assert.equal(u.skill.ammoLeft, b['attack@trigger_time'] - 4, `T${tier}: 4 bullets`);
    assert.equal(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length, 4);
    const hits = atkHits(h, u);
    const id = hits[0].dmg.attackId;
    const of = hits.filter((c) => c.dmg.attackId === id);
    assert.equal(of.length, 5, `T${tier}: main + 4 bounces, no stored-shot damage`);
    approx(of[0].amount, atk * b['attack@base_atk_scale'], `T${tier}: the main hit`);
    assert.deepEqual(of.map((c) => c.target.id), [e.id, near.id, e.id, near.id, e.id], `T${tier}: a new enemy first, then between them`);
    for (const c of of.slice(1)) approx(c.amount, atk * b['attack@bounce_atk_scale'], `T${tier}: bounce at the cached ATK`);
    for (let i = 2; i < of.length; i++) approx(of[i].t - of[i - 1].t, 0.5, `T${tier}: 0.5 s apart`, 0.08);
    assert.ok(!of.some((c) => c.target === far), `T${tier}: 1.7 tiles at most`);
    assert.equal(near.findBuff(`veen:war:${u.id}`).stacks, 2, `T${tier}: a 战争技艺 stack per bounce`);
    // attacks without stored energy spend nothing; the skill ends when the bullets run out
    const left = u.skill.ammoLeft;
    h.run(1.5);
    assert.ok(u.skill.ammoLeft <= left);
    h.runUntil(() => !u.skill.active, 300);
    assert.equal(u.skill.ammoLeft, 0, `T${tier}: ended out of bullets`);
    assert.equal(h.hooksOf('skillEnd').filter((c) => c.unit === u)[0].reason, 'ammo');
    done(h);
  }
});
