// test/content/op_mgllan.test.js — the 自选 operator kit of 麦哲伦 (char_248_mgllan, 6★ 召唤师; kit
// server/sim/content/kits/ops/op-mgllan.js, the summon deck of kits/shared/summoner.js) and of her drones 龙腾.F / .L / .A,
// fielded the production way (a DIY slot + its `diy` pick, simdata getDiy; the drone as the placed hand piece of her player)
// in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, SUM-X
// 专业无人机操作模块 or SUM-Y 教学用龙腾无人机 at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity
// checklist of kits/README.md.
// Run: node --test test/content/op_mgllan.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { canTargetAlly } from '../../server/sim/targeting.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const MG = 'char_248_mgllan';
const FORMS = BACKUPS.units[MG].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SUMX = 'uniequip_002_mgllan', SUMY = 'uniequip_003_mgllan';
const S1 = 'skchr_mgllan_1', S2 = 'skchr_mgllan_2', S3 = 'skchr_mgllan_3';
const F = 'token_10005_mgllan_drone1', L = 'token_10005_mgllan_drone2', A = 'token_10005_mgllan_drone3';
const DRONE_OF = [F, L, A];
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** A drone's variant of a form, with the pick's skill / module (getDiyToken). */
const tokOf = (tok, tier, elite, skill, mod) => {
  let v = BACKUPS.tokens[tok].variants[`${MG}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_archer: dummy('enemy_archer', { range: 3, atk: 100 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SUMX, SUMY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 麦哲伦 as uid 1 at (row, col) facing RIGHT; `drones` = [[tokenId, row, col, dir?]] placed pieces (uid 10 +). */
function field({ tier = 5, elite = false, mod = null, skill = 0, drones = [], row = 10, col = 4, seed = 5, dp = 99 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: dp }, captureNoisy: true,
    hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'attack'],
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: MG, skillIndex: skill, uniEquipId: mod }, elite, row, col },
      ...drones.map(([tokenId, r, c, dir], i) => ({ uid: 10 + i, kind: 'token', tokenId, ownerUid: 1, row: r, col: c, dir: dir ?? 'RIGHT' }))],
  });
  h.step();
  const u = h.unit(1);
  return { h, u, ds: h.b.allyUnits.filter((a) => a.kind === 'token'), deck: u.mem.summonDeck };
}
const from = (h, src) => h.hooksOf('damaged').filter((c) => c.source === src && c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('麦哲伦 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 3-1, ranged arts, hits air, blocks 1, ground-targetable, the data triggers (DEFAULT), 协防, no 特质', () => {
  assert.equal(OPERATOR_KITS[MG], KITS[MG]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [MG, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [1, 'ranged', 'arts', true, 1.6], `${label(f)}: 召唤师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-1`);
      assert.deepEqual([u.skill.rule, form.skills[skill].trigger.rule], ['DEFAULT', 'DEFAULT'], `${label(f)}: the data's trigger`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 871 / 426 / 116, E2 Lv60 1025 / 470 / 132; SUM-X +100 / +30 → +150 / +50 HP /
  // ATK, SUM-Y +25 / +25 → +40 / +40 ATK / DEF
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [871, 426, 1025, 470]);
  assert.deepEqual([modOf(5, SUMX).attr, modOf(6, SUMX).attr, modOf(5, SUMY).attr, modOf(6, SUMY).attr], [{ maxHp: 100, atk: 30 }, { maxHp: 150, atk: 50 }, { atk: 25, def: 25 }, { atk: 40, def: 40 }]);
});

test('麦哲伦\'s skills in every form: the data\'s SP (time SP, spCost, initSp, charges) and her 3-1 range while each runs (none changes it)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const sk = formOf(tier, elite).skills[skill];
      const { h, u } = field({ tier, elite, mod, skill });
      assert.deepEqual([u.skill.spType, u.skill.spCost, u.skill.maxCharges], ['time', sk.spCost, sk.maxChargeTime], `${label(f)} S${skill + 1}: SP`);
      assert.ok(Math.abs(u.skill.sp - sk.initSp) < 0.1, `${label(f)} S${skill + 1}: initSp ${sk.initSp} (${u.skill.sp})`);
      h.spawn('enemy_dummy', { pos: [10, 5] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.activations > 0, 3), `${label(f)} S${skill + 1}: cast with an enemy in her range`);
      assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)} S${skill + 1}: 3-1 while it runs`);
      done(h);
    }
  }
});

test('a 自选 pick: 麦哲伦 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks with either module', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(MG));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(MG), `tier ${t}`);
  for (const uniEquipId of [SUMX, SUMY, null]) {
    assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: MG, skillIndex: 2, uniEquipId } }, { data, kitted: KITTED_CHARS }),
      { ok: true, picks: { [SLOT[6]]: { charId: MG, skillIndex: 2, uniEquipId } } });
  }
});

test('T1 支援无人机·龙腾: her skill\'s drone is her piece (the others are not hers to field); the deck — 5 held at her deployment, cap 5 (8 with SUM-Y, which adds 3 on the card), at most 3 standing (4 at SUM-Y stage 3); every drone holds 禁疗, blocks nothing, has its data and no skill', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const tok = DRONE_OF[skill];
      const { h, u, ds, deck } = field({ tier, elite, mod, skill, drones: [[tok, 11, 6]] });
      const d = ds[0], v = tokOf(tok, tier, elite, skill, mod);
      const y = elite && mod === SUMY;
      assert.ok(h.b.producesToken(u, tok) && DRONE_OF.filter((x) => x !== tok).every((x) => !h.b.producesToken(u, x)), `${label(f)} S${skill + 1}: only ${tok}`);
      assert.deepEqual([deck.charge, deck.cap, deck.held, deck.maxDeployed], [5, y ? 8 : 5, y ? 8 : 5, y && tier === 6 ? 4 : 3], `${label(f)} S${skill + 1}: deck`);
      assert.deepEqual([d.alive, d.ownerUnit, d.kit.skill, d.skill.noSkill || !d.kit.skill], [true, u, null, true], `${label(f)}: deployed, hers, no skill`);
      assert.deepEqual([d.base.maxHp, d.base.atk, d.base.def, d.base.cost, d.base.respawnTime, d.base.bat], [v.stats.maxHp, v.stats.atk, v.stats.def, v.stats.cost, v.stats.respawnTime, v.stats.bat], `${label(f)}: drone stats`);
      assert.deepEqual([d.s.blockCnt, !!d.s.flags.noHeal], [0, true], `${label(f)}: no block, 禁疗`);
      assert.deepEqual(d.liveRangeGrid, v.rangeGrid, `${label(f)}: drone range`);
      if (tok === F) assert.deepEqual([d.profile.noAttack, d.base.atk], [true, 0], '龙腾.F: no attack (ATK 0)');
      if (tok === L) assert.deepEqual([d.profile.attack, d.profile.dmgType, d.profile.canHitFly, d.liveRangeGrid], ['melee', 'arts', false, [[0, 0]]], '龙腾.L: melee arts on its tile');
      if (tok === A) assert.deepEqual([d.profile.attack, d.profile.dmgType, d.profile.canHitFly, d.profile.splashRadius], ['ranged', 'phys', true, 0.75], '龙腾.A: shells, air too, blast 0.75');
      done(h);
    }
  }
  // the SUM-Y drones: F 2 / L 4 / A 5 DP ("部署费用-1 / -3"); stage 3 F 2100 HP / 250 DEF, L ATK 515, A ATK 749, ASPD +3
  assert.deepEqual([F, L, A].map((t, i) => tokOf(t, 5, true, i, SUMY).stats.cost), [2, 4, 5]);
  assert.deepEqual([tokOf(F, 6, true, 0, SUMY).stats.maxHp, tokOf(F, 6, true, 0, SUMY).stats.def, tokOf(L, 6, true, 1, SUMY).stats.atk, tokOf(A, 6, true, 2, SUMY).stats.atk, tokOf(A, 6, true, 2, SUMY).stats.aspd], [2100, 250, 515, 749, 103]);
});

test('the deck: a knocked-out drone comes back on its tile its redeploy time (10 s) later, paying its cost and using one held; with none held it stays off; the drones leave with her and come back after her next deployment (+5 held)', () => {
  const { h, u, ds, deck } = field({ tier: 6, elite: true, mod: SUMX, skill: 2, drones: [[A, 11, 6], [A, 9, 6]] });
  const [d1, d2] = ds;
  const p = h.b.players[0];
  h.b.kill(d1, null);
  assert.deepEqual([d1.alive, d1.removed], [false, false], 'the piece stays');
  h.run(9.5);
  assert.equal(d1.alive, false, 'not before 10 s');
  const dp0 = p.dp;
  assert.ok(h.runUntil(() => d1.alive, 1), 'back after 10 s');
  assert.deepEqual([d1.tileR, d1.tileC, deck.held], [11, 6, 4], 'on its tile, one held used');
  approx(dp0 - p.dp, d1.base.cost, 'its cost paid');
  // none held: it stays off
  deck.held = 0;
  h.b.kill(d1, null);
  h.run(15);
  assert.equal(d1.alive, false, 'none held');
  deck.held = 2;
  assert.ok(h.runUntil(() => d1.alive, 1), 'back once one is held');
  // she leaves: her drones go with her (no knock-down); back after her redeployment
  h.b.retreat(u);
  h.step();
  assert.deepEqual([d1.alive, d2.alive], [false, false], 'withdrawn with her');
  assert.ok(h.hooksOf('death').filter((c) => c.unit === d1 || c.unit === d2).slice(-2).every((c) => c.reason === 'retreat'), 'withdrawn, not knocked out');
  h.run(20);
  assert.deepEqual([d1.alive, d2.alive], [false, false], 'never while she is off the field');
  deck.held = 0;
  assert.ok(h.b.redeploy(u), 'she comes back');
  assert.ok(h.runUntil(() => d1.alive && d2.alive, 1), 'her drones follow');
  assert.equal(deck.held, 3, '+5 at her deployment, two used');
  done(h);
});

test('T2 光学折射配件: a drone is 隐匿 for 22 s (28 s with SUM-X stage 3) from each deployment — no ranged enemy targets it meanwhile; SUM-X stage 3: 麦哲伦 beside a drone inside that window is 隐匿 too (not two tiles away, not at stage 1)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [5, true, SUMX], [6, true, SUMX], [6, true, SUMY]]) {
    const x3 = elite && mod === SUMX && tier === 6;
    const want = x3 ? 28 : 22;
    const { h, u, ds } = field({ tier, elite, mod, skill: 1, drones: [[L, 10, 5], [L, 11, 7]] });
    const [near, far] = ds;
    assert.equal(tokOf(L, tier, elite, 1, mod).talents.find((t) => t.bb.hidden_duration != null).bb.hidden_duration, want, `${label([tier, elite, mod])}: data`);
    const archer = h.spawn('enemy_archer', { pos: [11, 9] });
    assert.ok(near.s.flags.stealth && far.s.flags.stealth, '隐匿 at deployment');
    assert.ok(!canTargetAlly(archer, far, true), 'a ranged enemy cannot target it');
    assert.equal(!!u.s.flags.stealth, x3, `${label([tier, elite, mod])}: her own 隐匿 beside the drone`);
    h.run(want - 0.5);
    assert.ok(near.s.flags.stealth, 'still 隐匿');
    assert.equal(!!u.s.flags.stealth, x3, 'hers still');
    h.run(1);
    assert.ok(!near.s.flags.stealth && !far.s.flags.stealth, `over after ${want} s`);
    assert.ok(canTargetAlly(archer, far, true), 'targetable again');
    assert.ok(!u.s.flags.stealth, 'hers over with it');
    // a new deployment: a new window
    h.b.kill(far, null);
    h.runUntil(() => far.alive, 12);
    assert.ok(far.s.flags.stealth, 'again at its next deployment');
    done(h);
  }
  // her 隐匿 needs the drone on one of her four neighbouring tiles
  const { h, u } = field({ tier: 6, elite: true, mod: SUMX, skill: 1, drones: [[L, 10, 6]] });
  assert.ok(!u.s.flags.stealth, 'two tiles away: no');
  done(h);
});

test('S1 高效制冷模块: passive — every 3 s from her deployment 停顿 0.8 / 0.9 s on every enemy of her 3-1 and her 龙腾.F\'s x-4 (air units too), none elsewhere; running (15 s) — 束缚 1.9 / 2.2 s every 3 s from the cast instead; it ends recalling her drones', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SUMY]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u, ds, deck } = field({ tier, elite, mod, skill: 0, row: 10, col: 3, drones: [[F, 11, 8]] });
    const d = ds[0];
    assert.deepEqual([sk.bb['attack@interval'], sk.bb['attack@sluggish'], sk.bb['attack@frozen_duration'], sk.duration], [3, elite ? 0.9 : 0.8, elite ? 2.2 : 1.9, 15]);
    const at = (pos, key = 'enemy_dummy') => h.spawn(key, { pos });
    const her = at([10, 5]), fly = at([11, 4], 'enemy_fly'), droneE = at([12, 9]), out = at([9, 9]);
    const st = (status) => h.hooksOf('statusApplied').filter((c) => c.status === status);
    h.run(2.9);
    assert.equal(st('sluggish').length, 0, 'nothing before 3 s');
    h.run(0.2);
    const first = st('sluggish');
    assert.deepEqual(new Set(first.map((c) => c.target)), new Set([her, fly, droneE]), 'her range + the drone\'s x-4');
    for (const c of first) approx(c.duration, sk.bb['attack@sluggish'], 'duration');
    assert.equal(first.find((c) => c.target === droneE).source, d, 'the drone\'s own area');
    assert.ok(!first.some((c) => c.target === out), 'outside: untouched');
    h.run(3);
    assert.equal(st('sluggish').length, 6, 'again 3 s later');
    // the cast: 束缚 every 3 s instead
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast on an attack');
    const t0 = h.b.time, n0 = st('sluggish').length;
    h.run(2.9);
    assert.equal(st('bind').length, 0, 'no 束缚 before 3 s into it');
    h.run(0.2);
    assert.deepEqual(new Set(st('bind').map((c) => c.target)), new Set([her, fly, droneE]), '束缚 on the same areas');
    for (const c of st('bind')) approx(c.duration, sk.bb['attack@frozen_duration'], '束缚 duration');
    h.runUntil(() => !u.skill.active, 15);
    assert.equal(st('sluggish').length, n0, 'no 停顿 while it runs');
    approx(h.b.time - t0, 15, '15 s', 0.01);
    // 技能结束时回收所有无人机
    h.step();
    assert.deepEqual([d.alive, d.removed, deck.held], [false, false, deck.cap], 'recalled (+1 held, at most the cap)');
    assert.ok(h.runUntil(() => d.alive, 10.5), 'back on its tile 10 s later');
    done(h);
  }
});

test('S2 激光开采模块: she and her drones ASPD +80 / +100 for 15 s; a 龙腾.L strikes every enemy on its tile while it runs (one at a time otherwise); recalled at the end', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SUMX]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u, ds } = field({ tier, elite, mod, skill: 1, row: 10, col: 3, drones: [[L, 10, 6]] });
    const d = ds[0];
    const a = h.spawn('enemy_dummy', { pos: [10, 6] }), b = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.run(3);
    const before = from(h, d);
    assert.ok(before.length >= 2, 'it attacks');
    assert.ok(new Set(before.map((c) => c.dmg.attackId)).size === before.length, 'one target per attack');
    for (const c of before) assert.deepEqual([c.type, Math.abs(c.amount - Math.max(d.s.atk * 0.05, d.s.atk * (1 - c.target.s.res / 100))) < 1e-6], ['arts', true], 'arts');
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    assert.deepEqual(d.findBuff('mgllan:s2:drone')?.mods, { aspd: sk.bb.attack_speed }, 'the drone\'s bonus');
    assert.equal(u.s.aspd, 100 + sk.bb.attack_speed, 'her ASPD');
    assert.equal(d.s.aspd, 100 + sk.bb.attack_speed, 'the drone\'s');
    const n0 = from(h, d).length;
    h.run(3);
    const during = from(h, d).slice(n0);
    const byAttack = new Map();
    for (const c of during) byAttack.set(c.dmg.attackId, [...(byAttack.get(c.dmg.attackId) ?? []), c.target]);
    assert.ok([...byAttack.values()].every((ts) => ts.length === 2 && ts.includes(a) && ts.includes(b)), '群体: both enemies of its tile each attack');
    // knocked out during it: back 10 s later, still inside the 15 s — with the skill's ASPD
    h.b.kill(d, null);
    assert.ok(h.runUntil(() => d.alive, 10.5) && u.skill.active, 'back while it runs');
    assert.equal(d.s.aspd, 100 + sk.bb.attack_speed, 'a drone deployed during it takes its ASPD');
    h.runUntil(() => !u.skill.active, 15);
    h.step();
    assert.deepEqual([d.alive, u.s.aspd], [false, 100], 'recalled; her ASPD back');
    assert.ok(h.runUntil(() => d.alive, 10.5), 'back');
    assert.equal(d.findBuff('mgllan:s2:drone'), null, 'no bonus after it');
    done(h);
  }
});

test('S3 武装打击模块: she and her drones ATK +80 % / +100 % for 15 s; a 龙腾.A\'s blast radius 0.75 → 1.25 while it runs; recalled at the end', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SUMY]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u, ds } = field({ tier, elite, mod, skill: 2, row: 10, col: 3, drones: [[A, 10, 5]] });
    const d = ds[0];
    const main = h.spawn('enemy_dummy', { pos: [10, 7] }), side = h.spawn('enemy_dummy', { pos: [10, 8] });
    const close = h.spawn('enemy_fly', { pos: [10.6, 7] });
    h.spawn('enemy_dummy', { pos: [11, 4] });   // hers (outside the drone's range)
    h.run(5);
    const before = from(h, d);
    assert.ok(before.some((c) => c.target === main) && before.some((c) => c.target === close), 'its target and a flyer 0.6 away');
    assert.ok(!before.some((c) => c.target === side), 'one 1.0 away: outside 0.75');
    for (const c of before.filter((x) => x.target === main)) approx(c.amount, d.s.atk, 'phys (DEF 0)');
    const atk0 = u.s.atk, datk0 = d.s.atk;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    approx(u.s.atk, atk0 * (1 + sk.bb.atk) / 1, 'her ATK +', 1e-9);
    approx(d.s.atk, datk0 * (1 + sk.bb.atk), 'the drone\'s ATK +');
    assert.equal(d.profile.splashRadius, 1.25, 'blast 1.25');
    const n0 = from(h, d).length;
    h.run(5);
    assert.ok(from(h, d).slice(n0).some((c) => c.target === side), 'now 1.0 away too');
    h.runUntil(() => !u.skill.active, 15);
    h.step();
    assert.equal(d.alive, false, 'recalled');
    assert.ok(h.runUntil(() => d.alive, 10.5), 'back');
    assert.deepEqual([d.profile.splashRadius, d.s.atk], [0.75, datk0], 'blast and ATK back');
    done(h);
  }
});

test('the recall triggers each drone\'s own skill: a stunned or silenced drone stays (PRTS 备注 "技能无法触发的场合不会产生效果"); none when she leaves the field with the skill running (her drones go with her)', () => {
  const { h, u, ds } = field({ tier: 6, elite: true, mod: SUMX, skill: 2, row: 10, col: 3, drones: [[A, 10, 5], [A, 11, 5], [A, 9, 5]] });
  const [ok, stunned, silenced] = ds;
  h.spawn('enemy_dummy', { pos: [10, 5] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
  u.skill.timeLeft = 0.2;
  h.b.applyStatus(stunned, 'stun', { duration: 5, force: true });
  h.b.applyStatus(silenced, 'silence', { duration: 5, force: true });
  h.runUntil(() => !u.skill.active, 1);
  h.step();
  assert.deepEqual([ok.alive, stunned.alive, silenced.alive], [false, true, true], 'only the free one');
  // her leaving with the skill on: withdrawn with her, no recall (no +1 held)
  const { h: h2, u: u2, ds: ds2, deck } = field({ tier: 5, elite: false, skill: 2, row: 10, col: 3, drones: [[A, 10, 5]] });
  h2.spawn('enemy_dummy', { pos: [10, 5] });
  u2.skill.gainSp(999);
  h2.runUntil(() => u2.skill.active, 3);
  deck.held = 2;
  h2.b.kill(u2, null);
  h2.step();
  assert.deepEqual([ds2[0].alive, deck.held], [false, 2], 'gone with her, nothing held more');
  done(h);
  done(h2);
});

test('modules: SUM-X\'s trait (首个召唤物部署时不消耗部署位) is a prep deploy-cap rule — the deck is the same as without it; SUM-Y\'s +3 held on the card and cap 8 hold through her redeployment (+5, at most 8)', () => {
  const { h, deck } = field({ tier: 6, elite: true, mod: SUMX, skill: 0 });
  assert.deepEqual([deck.held, deck.cap, deck.maxDeployed], [5, 5, 3], 'SUM-X: the base deck');
  assert.equal(formOf(6, true).modules.find((m) => m.uniEquipId === SUMX).traitOverride.bb.cnt, 1, 'its trait blackboard (unused)');
  done(h);
  const { h: h2, u, deck: d2 } = field({ tier: 5, elite: true, mod: SUMY, skill: 0 });
  assert.deepEqual([d2.held, d2.cap, d2.maxDeployed], [8, 8, 3], 'SUM-Y stage 1: 3 + 5 held, cap 8, 3 standing');
  d2.held = 1;
  h2.b.retreat(u);
  h2.b.redeploy(u);
  assert.equal(d2.held, 6, '+5 at her next deployment');
  h2.b.retreat(u);
  h2.b.redeploy(u);
  assert.equal(d2.held, 8, 'at most 8');
  done(h2);
});
