// test/content/op_poca.test.js — the 自选 operator kit of 早露 (char_197_poca, 6★ 攻城手; kit
// server/sim/content/kits/ops/op-poca.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in every
// form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, SIE-X
// 攻城器械训练装置 or SIE-Y “心” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form
// of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_poca.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const POCA = 'char_197_poca';
const FORMS = BACKUPS.units[POCA].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SIEX = 'uniequip_002_poca', SIEY = 'uniequip_003_poca';
const S1 = 'skcom_atk_up[3]', S2 = 'skchr_poca_2', S3 = 'skchr_poca_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_light: dummy('enemy_light', { mass: 1 }), enemy_mid: dummy('enemy_mid', { mass: 2 }), enemy_heavy: dummy('enemy_heavy', { mass: 3 }),
  enemy_armor: dummy('enemy_armor', { mass: 3, def: 600 }), enemy_plate: dummy('enemy_plate', { mass: 2, def: 600 }),
  enemy_fly: dummy('enemy_fly', { mass: 1, motion: 'FLY' }), enemy_hfly: dummy('enemy_hfly', { mass: 4, motion: 'FLY' }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SIEX, SIEY].map((m) => [t, true, m]))];
/** 学生楷模: she is a 【乌萨斯学生自治团】 operator herself — her ATK always carries the talent's +atk. */
const studentAtk = (tier, elite, mod) => (elite && mod === SIEY && tier === 6 ? 0.14 : 0.1);

/** A battle with 早露 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 3, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: POCA, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
const atkHits = (h, u) => hitsBy(h, u).filter((c) => c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

test('早露 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 4-3 range without her tile, ranged physical arrows that hit air, heaviest first, block 1, no 特质', () => {
  assert.equal(OPERATOR_KITS[POCA], KITS[POCA]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [POCA, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.groundOnly, u.profile.priority, u.base.bat],
        [1, 'ranged', 'phys', true, false, 'heaviest', 2.4], `${label(f)}: 攻城手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 4-3`);
      assert.ok(!u.liveRangeGrid.some(([r, c]) => r === 0 && c === 0), `${label(f)}: PRTS 攻城手 "攻击范围不包含自身所在地块"`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [BACKUPS.diy.operators[POCA].bonds, []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 1351 / 890 / 100, E2 Lv60 1619 / 1007 / 115; SIE-X +60 / +30 → +90 / +45,
  // SIE-Y +70 / +20 → +100 / +30 ATK / DEF
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1351, 890, 1619, 1007]);
  assert.deepEqual([modOf(5, SIEX).attr, modOf(6, SIEX).attr, modOf(5, SIEY).attr, modOf(6, SIEY).attr], [{ atk: 60, def: 30 }, { atk: 90, def: 45 }, { atk: 70, def: 20 }, { atk: 100, def: 30 }]);
});

test('a 自选 pick: 早露 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(POCA));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(POCA), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: POCA, skillIndex: 2, uniEquipId: SIEY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: POCA, skillIndex: 2, uniEquipId: SIEY } } });
});

test('trait 攻城手 "优先攻击重量最重的敌人": the heaviest enemy of her range first, wherever it stands; a lighter one only once it is heavier (失重 moves it down); flyers are targets too', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const { h, u } = field({ tier, elite, skill: 0 });
    const light = h.spawn('enemy_light', { pos: [10, 5] }), heavy = h.spawn('enemy_heavy', { pos: [11, 7] });
    const n0 = atkHits(h, u).length;
    assert.ok(h.runUntil(() => atkHits(h, u).length > n0, 4), `T${tier}: an attack`);
    assert.equal(atkHits(h, u).at(-1).target, heavy, `T${tier}: weight 3 before weight 1 (the nearer one)`);
    h.b.addBuff(heavy, { key: 'test:weightless', mods: { massFlat: -3 } });
    const n1 = atkHits(h, u).length;
    assert.ok(h.runUntil(() => atkHits(h, u).length > n1, 4));
    assert.equal(atkHits(h, u).at(-1).target, light, `T${tier}: 失重 to 0 — now the light one first`);
    const fly = h.spawn('enemy_hfly', { pos: [9, 6] });
    const n2 = atkHits(h, u).length;
    assert.ok(h.runUntil(() => atkHits(h, u).length > n2, 4));
    assert.equal(atkHits(h, u).at(-1).target, fly, `T${tier}: a weight-4 flyer first (可对空)`);
    done(h);
  }
});

test('S1 攻击力强化·γ型 (MANUAL, data DEFAULT): ATK +45 % / +60 % for 30 s, SP 37 / 35 from 5 / 10; cast with an enemy in her range at her attack', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.spType, u.skill.spCost, u.skill.initSp, sk.duration, sk.bb.atk],
      ['DEFAULT', 'duration', 'time', elite ? 35 : 37, elite ? 10 : 5, 30, elite ? 0.6 : 0.45], `T${tier}`);
    const st = studentAtk(tier, elite, null);
    approx(u.s.atk, u.base.atk * (1 + st), `T${tier}: 学生楷模 only`);
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    h.spawn('enemy_light', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast`);
    approx(u.skill.timeLeft, 30, `T${tier}: 30 s`, 0.01);
    approx(u.s.atk, u.base.atk * (1 + st + sk.bb.atk), `T${tier}: ATK +${sk.bb.atk * 100} %`);
    h.runUntil(() => !u.skill.active, 31);
    approx(u.s.atk, u.base.atk * (1 + st), `T${tier}: back`);
    done(h);
  }
});

test('S2 分裂射击 (60 s): ATK +45 % / +60 % and two targets per attack (attack@max_target 2) — the two heaviest; a lone enemy gets one arrow', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.atk, sk.bb['attack@max_target'], u.skill.spCost, u.skill.initSp], ['DEFAULT', 60, elite ? 0.6 : 0.45, 2, 80, elite ? 45 : 42], `T${tier}`);
    const lone = h.spawn('enemy_light', { pos: [10, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4));
    approx(u.skill.timeLeft, 60, `T${tier}: 60 s`, 0.05);
    approx(u.s.atk, u.base.atk * (1 + studentAtk(tier, elite, null) + sk.bb.atk), `T${tier}: ATK`);
    h.run(0.6);
    const n0 = atkHits(h, u).length;
    h.run(2.5);
    const one = atkHits(h, u).slice(n0);
    assert.ok(one.length >= 1 && one.every((c) => c.target === lone), `T${tier}: one target, one arrow per attack`);
    const mid = h.spawn('enemy_mid', { pos: [11, 6] }), heavy = h.spawn('enemy_heavy', { pos: [9, 5] });
    h.run(0.5);
    const n1 = atkHits(h, u).length;
    h.run(2.5);
    const ids = atkHits(h, u).slice(n1).map((c) => c.dmg.attackId);
    const first = atkHits(h, u).slice(n1).filter((c) => c.dmg.attackId === ids[0]);
    assert.deepEqual(first.map((c) => c.target).sort((a, b) => a.id - b.id), [mid, heavy].sort((a, b) => a.id - b.id), `T${tier}: the two heaviest (weights 3, 2), not the light one`);
    done(h);
  }
});

test('S3 雪崩击 (6 / 7 s): harpoons link the 3 heaviest enemies of her range (a flyer too), 束缚 them, and strike each every second — 6 / 7 strikes at ATK +10 % (attacks), no other attack; the binds end with it', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.max_target, sk.bb.hit_interval, sk.bb.hit_duration, sk.bb.atk, u.skill.spCost, u.skill.initSp],
      ['DEFAULT', elite ? 7 : 6, 3, 1, elite ? 7 : 6, 0.1, elite ? 34 : 37, elite ? 12 : 11], `T${tier}`);
    const light = h.spawn('enemy_light', { pos: [10, 5] }), mid = h.spawn('enemy_mid', { pos: [10, 6] });
    const heavy = h.spawn('enemy_heavy', { pos: [11, 6] }), hfly = h.spawn('enemy_hfly', { pos: [9, 6] });
    const outside = h.spawn('enemy_heavy', { pos: [10, 9] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast`);
    const t0 = h.b.time;
    const linked = [mid, heavy, hfly];
    for (const e of linked) assert.equal(e.findBuff('bind')?.source, u, `T${tier}: ${e.defId} bound`);
    assert.equal(light.findBuff('bind'), null, `T${tier}: the 4th heaviest is not linked`);
    assert.equal(outside.findBuff('bind'), null, `T${tier}: out of range`);
    approx(u.s.atk, u.base.atk * (1 + studentAtk(tier, elite, null) + 0.1), `T${tier}: ATK +10 %`);
    assert.ok(h.runUntil(() => !u.skill.active, 10), `T${tier}: ends`);
    approx(h.b.time - t0, sk.duration, `T${tier}: ${sk.duration} s`, 0.02);
    const hits = hitsBy(h, u);
    for (const e of linked) {
      const on = hits.filter((c) => c.target === e);
      assert.equal(on.length, sk.duration, `T${tier}: ${on.length} strikes on ${e.defId}`);
      assert.ok(on.every((c) => c.dmg.isAttack && c.dmg.isSkill && c.type === 'phys'), `T${tier}: physical skill attacks`);
      on.forEach((c, i) => i && approx(c.t - on[i - 1].t, 1, `T${tier}: one a second`, 0.02));
    }
    assert.ok(!hits.some((c) => c.target === light || c.target === outside), `T${tier}: nobody else is hit`);
    for (const e of linked) assert.equal(e.findBuff('bind'), null, `T${tier}: unbound at the end`);
    // the strikes are instant along the links
    assert.ok(h.eventsOf('atk').filter((ev) => ev[1] === u.id).some((ev) => ev[3] === 'beam'));
    done(h);
  }
});

test('S3 雪崩击 (PRTS 备注): a link breaks when its enemy is knocked out or vanishes, the skill ends at once when none is left; a stun / silence on her breaks every link', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    // all links lost ⇒ the skill ends early
    {
      const { h, u } = field({ tier, elite, skill: 2 });
      const a = h.spawn('enemy_heavy', { pos: [10, 6] }), b = h.spawn('enemy_mid', { pos: [11, 6] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 4));
      h.run(1.2);
      h.b.kill(a, null);
      h.step();
      assert.ok(u.skill.active, `T${tier}: one link left`);
      b.hidden = true; // 消失
      h.step();
      assert.ok(!u.skill.active, `T${tier}: no link left ⇒ ends at once`);
      b.hidden = false;
      assert.equal(b.findBuff('bind'), null, `T${tier}: its bind went with the link`);
      done(h);
    }
    for (const status of ['stun', 'silence']) {
      const { h, u } = field({ tier, elite, skill: 2 });
      const a = h.spawn('enemy_heavy', { pos: [10, 6] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 4));
      h.run(1.5);
      h.b.applyStatus(u, status, { duration: 2, source: null });
      h.step();
      assert.ok(!u.skill.active, `T${tier}: ${status} breaks the links`);
      assert.equal(a.findBuff('bind'), null, `T${tier}: ${status}: unbound`);
      done(h);
    }
  }
});

test('T1 深入骨髓: her damage ignores 60 % of the DEF of an enemy of 重量等级 ≥ 3 (exact numbers), none below; the S3 strikes too', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const t0 = formOf(tier, elite).talents.find((t) => t.index === 0);
    assert.deepEqual([t0.bb.value, t0.bb.def_penetrate], [3, 0.6], `T${tier}: data`);
    for (const skill of [0, 2]) {
      const { h, u } = field({ tier, elite, skill });
      const armor = h.spawn('enemy_armor', { pos: [10, 6] }), plate = h.spawn('enemy_plate', { pos: [11, 6] });
      if (skill === 2) { u.skill.gainSp(999); assert.ok(h.runUntil(() => u.skill.active, 4)); h.run(2.2); } else h.run(12);
      const on = (e) => atkHits(h, u).filter((c) => c.target === e);
      assert.ok(on(armor).length, `T${tier} S${skill + 1}: hit the weight-3 one`);
      for (const c of on(armor)) approx(c.amount, u.s.atk - 600 * (1 - 0.6), `T${tier} S${skill + 1}: weight 3, DEF 600 × 40 %`);
      if (skill === 2) {
        assert.ok(on(plate).length, `T${tier}: S3 links the weight-2 one too`);
        for (const c of on(plate)) approx(c.amount, u.s.atk - 600, `T${tier} S3: weight 2, full DEF`);
      }
      done(h);
    }
  }
});

test('T2 学生楷模: every 【乌萨斯学生自治团】 operator of her team — her and 古米, deployed or not — ATK +10 %, nobody else; SIE-Y stage 3: +14 % and +15 % per student in skill (≤ +45 %), re-read every 0.3 s', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const others = [{ uid: 2, chessId: 'chess_char_1_10_a', row: 12, col: 3 }, { uid: 3, chessId: 'chess_char_1_02_a', row: 12, col: 6 }];
    const { h, u } = field({ tier, elite, mod, skill: 0, others });
    const gummy = h.unit(2), yak = h.unit(3);
    const v = studentAtk(tier, elite, mod);
    for (const a of [u, gummy]) assert.deepEqual(a.findBuff('talent:poca:students')?.mods, { atkPct: v }, `${label(f)}: ${a.def.charId}`);
    assert.equal(yak.findBuff('talent:poca:students'), null, `${label(f)}: 角峰 is no student`);
    h.b.retreat(u);
    h.run(0.5);
    assert.ok(gummy.findBuff('talent:poca:students'), `${label(f)}: 编入队伍时 — still there with her off the field`);
    assert.ok(u.findBuff('talent:poca:students'), `${label(f)}: kept through her retreat`);
    assert.equal(!!gummy.findBuff('talent:poca:studentSkills'), false, `${label(f)}: nobody in skill`);
    done(h);
  }
  // SIE-Y stage 3: the extra +15 % per student operator on the field whose skill runs, at most +45 %
  const t6 = formOf(6, true).modules.find((m) => m.uniEquipId === SIEY).talentChanges;
  assert.deepEqual([t6.find((t) => t.talentIndex === 1).bb.atk, t6.find((t) => t.talentIndex === -1).bb], [0.14, { init_atk: 0.15, max_atk: 0.45 }]);
  const others = [
    { uid: 2, chessId: 'chess_char_1_10_a', row: 12, col: 3, skillIndex: 1 }, { uid: 3, chessId: 'chess_char_1_10_b', row: 12, col: 5, skillIndex: 1 },
    { uid: 4, diy: { slot: 'chess_char_6_diy2_a', charId: 'char_1051_headb2', skillIndex: 0 }, row: 11, col: 8 },
    { uid: 5, chessId: 'chess_char_1_02_a', row: 12, col: 7 },
  ];
  const { h, u } = field({ tier: 6, elite: true, mod: SIEY, skill: 0, others });
  const team = [u, h.unit(2), h.unit(3), h.unit(4)];
  assert.ok(team.every((a) => a && a.deployed), 'four students on the field');
  const drive = (a) => a.findBuff('talent:poca:studentSkills')?.mods.atkPct ?? 0;
  const cast = (a) => { a.skill.gainSp(999); a.skill.activate('test'); assert.ok(a.skill.active, `${a.def.charId} in skill`); };
  cast(u);
  h.step(); // at once: 每次开启技能时
  for (const a of team) approx(drive(a), 0.15, `one in skill: ${a.def.charId}`);
  assert.equal(drive(h.unit(5)), 0, '角峰 gets nothing');
  approx(u.s.atk, u.base.atk * (1 + 0.14 + 0.15 + skillOf(6, true, S1).bb.atk), 'her ATK: +14 % +15 % (and her S1)');
  cast(h.unit(2));
  h.step();
  approx(drive(h.unit(4)), 0.3, 'two in skill');
  cast(h.unit(3));
  cast(h.unit(4));
  h.step();
  approx(drive(u), 0.45, 'four in skill: capped at +45 %');
  u.skill.end('test');
  h.run(0.35); // the 0.3 s re-read
  approx(drive(h.unit(2)), 0.45, 'three in skill');
  for (const a of team.slice(1)) a.skill.end('test');
  h.run(0.35);
  assert.equal(drive(u), 0, 'nobody in skill');
  done(h);
});

test('SIE-X 攻城器械训练装置: ×1.15 on her attacks against 重量等级 ≥ 3 (normal attacks, S3 strikes), nothing below; stage 3 深入骨髓 adds a 60 % ATK physical hit on such enemies (with the DEF ignore)', () => {
  for (const [tier, mod] of [[5, null], [5, SIEX], [6, SIEX], [6, SIEY], [6, null]]) {
    const xs = mod === SIEX ? 1.15 : 1;
    const extra = mod === SIEX && tier === 6 ? 0.6 : 0;
    if (mod === SIEX) assert.deepEqual(modOf(tier, SIEX).talentChanges.find((t) => t.hidden).bb, { atk_scale: 1.15, value: 3 }, `T${tier}: data`);
    for (const skill of [0, 2]) {
      const { h, u } = field({ tier, elite: true, mod, skill });
      const heavy = h.spawn('enemy_heavy', { pos: [10, 5] }), mid = h.spawn('enemy_mid', { pos: [10, 6] });
      if (skill === 2) { u.skill.gainSp(999); assert.ok(h.runUntil(() => u.skill.active, 4)); h.run(2.2); } else h.run(12);
      const main = atkHits(h, u);
      const onH = main.filter((c) => c.target === heavy), onM = main.filter((c) => c.target === mid);
      // (SIE-Y's own distance factor: 2 / 3 tiles)
      const far = (d) => (mod === SIEY ? 1 + 0.12 * (d - 1) / 3.5 : 1);
      assert.ok(onH.length, `T${tier} ${mod} S${skill + 1}: hits the heavy one`);
      for (const c of onH) approx(c.amount, u.s.atk * xs * far(2), `T${tier} ${mod} S${skill + 1}: ×${xs} on weight 3`);
      for (const c of onM) approx(c.amount, u.s.atk * far(3), `T${tier} ${mod} S${skill + 1}: ×1 on weight 2`);
      const ex = hitsBy(h, u).filter((c) => c.dmg.tags?.includes('poca:extra'));
      if (extra) {
        assert.equal(ex.length, onH.length, `T${tier}: one extra hit per attack hit on the heavy one`);
        assert.ok(ex.every((c) => c.target === heavy && c.type === 'phys' && !c.dmg.isAttack), `T${tier}: physical, not an attack`);
        for (const c of ex) approx(c.amount, u.s.atk * extra, `T${tier}: 60 % ATK`);
      } else assert.equal(ex.length, 0, `T${tier} ${mod}: no extra hit`);
      done(h);
    }
  }
  // the extra hit gets 深入骨髓's 物理穿透 too: weight 3, DEF 600
  const { h, u } = field({ tier: 6, elite: true, mod: SIEX, skill: 0 });
  const armor = h.spawn('enemy_armor', { pos: [10, 6] });
  h.run(6);
  const ex = hitsBy(h, u).filter((c) => c.target === armor && c.dmg.tags?.includes('poca:extra'));
  assert.ok(ex.length);
  for (const c of ex) approx(c.amount, u.s.atk * 0.6 - 600 * 0.4, 'extra hit: DEF 600 × 40 %');
  done(h);
});

test('SIE-Y “心”: her attack damage rises with the distance, linearly from 1 tile to 4.5 (at most +12 %), stages 1 and 3; nothing without it', () => {
  for (const [tier, mod] of [[5, SIEY], [6, SIEY], [6, SIEX], [5, null]]) {
    const tb = mod === SIEY ? modOf(tier, SIEY).traitOverride.bb : {};
    if (mod === SIEY) assert.deepEqual(tb, { max_dist: 4.5, min_dist: 1, damage_scale: 0.12 }, `T${tier}: data`);
    for (const [r, c] of [[10, 5], [10, 6], [10, 7], [11, 6], [12, 5]]) {
      const { h, u } = field({ tier, elite: true, mod, skill: 0 });
      const e = h.spawn('enemy_light', { pos: [r, c] });
      h.run(3);
      const hit = atkHits(h, u).find((x) => x.target === e);
      assert.ok(hit, `T${tier} ${mod}: hit at ${r},${c}`);
      const d = Math.hypot(c - 3, r - 10);
      const want = mod === SIEY ? 1 + 0.12 * Math.max(0, Math.min(1, (d - 1) / 3.5)) : 1;
      approx(hit.amount, u.s.atk * want, `T${tier} ${mod}: ${d.toFixed(2)} tiles ×${want.toFixed(4)}`);
      done(h);
    }
  }
});
