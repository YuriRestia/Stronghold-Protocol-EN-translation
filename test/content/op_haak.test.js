// test/content/op_haak.test.js — the 自选 operator kit of 阿 (char_225_haak, 6★ 怪杰; kit
// server/sim/content/kits/ops/op-haak.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, GEE-X
// 什锦果味医用箱 or GEE-Y 毒医残章 at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the
// form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_haak.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const HAAK = 'char_225_haak';
const FORMS = BACKUPS.units[HAAK].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const GX = 'uniequip_002_haak', GY = 'uniequip_003_haak';
const S1 = 'skchr_haak_1', S2 = 'skchr_haak_2', S3 = 'skchr_haak_3';
const YAK = 'chess_char_1_02_a', TEXAS = 'chess_char_1_08_a', LISKAM = 'chess_char_1_20_a';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The talents a form fights with: the module's changes composed (index 0 / 1). */
const talentOf = (tier, elite, mod, i) => {
  const base = formOf(tier, elite).talents.find((t) => t.index === i)?.bb ?? {};
  const ch = (elite ? modOf(tier, mod)?.talentChanges ?? [] : []).find((t) => t.talentIndex === i)?.bb ?? {};
  return { ...base, ...ch };
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, GX, GY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 阿 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'heal', 'spGain'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: HAAK, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Keep him from casting (no SP). */
function noSkill(h, u) {
  u.skill.charges = 0; u.skill.sp = 0;
  h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
}

test('阿 in every 自选 form: his operator kit (all three skills authored), the form\'s stats + module attributes, 3-3, blocks 1, ranged physical arrows that hit air units, the 怪杰 drain, 炎, no 特质, the data triggers', () => {
  assert.equal(OPERATOR_KITS[HAAK], KITS[HAAK]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [HAAK, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd, u.base.respawnTime],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def, 100 + (m?.attr.aspd ?? 0), 66 + (m?.attr.respawnTime ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.projectile, u.profile.hpDrain], [1, 'ranged', 'phys', true, 'arrow', 0.01], `${label(f)}: 怪杰`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-3`);
      assert.equal(form.rangeId, '3-3');
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      assert.deepEqual([u.skill.kind, u.skill.rule, form.skills[skill].trigger.rule], ['duration', 'DEFAULT', 'DEFAULT'], `${label(f)}: S${skill + 1} trigger (data)`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 1777 / 583 / 121, E2 Lv60 2047 / 663 / 142; GEE-X +135 / +37 → +240 / +57 HP / ATK,
  // GEE-Y +43 / +3 → +75 / +5 ATK / ASPD and respawn −15
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1777, 583, 2047, 663]);
  assert.deepEqual([modOf(5, GX).attr, modOf(6, GX).attr, modOf(5, GY).attr, modOf(6, GY).attr],
    [{ maxHp: 135, atk: 37 }, { maxHp: 240, atk: 57 }, { atk: 43, aspd: 3, respawnTime: -15 }, { atk: 75, aspd: 5, respawnTime: -15 }]);
});

test('a 自选 pick: 阿 is offered at tiers 5 and 6 (he has a kit) and a roster with him passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(HAAK));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(HAAK), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: HAAK, skillIndex: 2, uniEquipId: GY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: HAAK, skillIndex: 2, uniEquipId: GY } } });
});

test('trait 怪杰: 1 % of his max HP lost every second (a 流失, never below 1 HP); he shoots an air unit in his range', () => {
  for (const f of [[5, false, null], [6, true, GX]]) {
    const { h, u } = field({ tier: f[0], elite: f[1], mod: f[2], skill: 0 });
    noSkill(h, u);
    assert.deepEqual(u.def.traitBb, { hp_ratio: 0.01 }, label(f));
    h.run(3.05);
    approx(u.hp, u.s.maxHp * (1 - 0.03), `${label(f)}: three ticks of 1 %`, 1e-6);
    u.hp = 5;
    h.run(10);
    assert.equal(u.hp, 1, `${label(f)}: not lethal — 1 HP kept`);
    assert.ok(u.alive);
    u.hp = u.s.maxHp;
    const fly = h.spawn('enemy_fly', { pos: [10, 6] });
    h.run(3);
    assert.ok(atkHits(h, u).some((c) => c.target === fly && c.type === 'phys'), `${label(f)}: physical arrows at the flyer`);
    done(h);
  }
});

test('GEE-X “什锦果味医用箱” (stages 1 and 3): SP recovery +0.25/s while his HP ratio is at least 80 %, none below; no such bonus without it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const gx = elite && mod === GX;
    if (gx) {
      assert.equal(modOf(tier, GX).traitOverride.moduleDesc, '生命值高于80%时，技力自然回复速度+0.25/秒');
      assert.deepEqual(modOf(tier, GX).talentChanges.find((t) => t.talentIndex === -1).bb, { sp_recovery_per_sec: 0.25 });
    }
    h.step();
    assert.equal(u.s.spRecovery, gx ? 1.25 : 1, `${label(f)}: full HP`);
    const sp0 = u.skill.sp;
    h.run(2);
    approx(u.skill.sp - sp0, 2 * (gx ? 1.25 : 1), `${label(f)}: SP over 2 s`, 0.02);
    u.hp = u.s.maxHp * 0.79;
    h.step();
    assert.equal(u.s.spRecovery, 1, `${label(f)}: below 80 %`);
    u.hp = u.s.maxHp * 0.8;
    h.step();
    assert.equal(u.s.spRecovery, gx ? 1.25 : 1, `${label(f)}: at 80 %`);
    done(h);
  }
});

test('T1 混合药物射击: every attack on an enemy rolls one of four with equal weight — heal 15 % max HP (×T2), that attack ×1.5, 停顿 1.4 s, 晕眩 1 s; GEE-X stage 3: 20 % / ×1.65 / 1.6 s / 1.2 s and 30 % all four at once', () => {
  for (const f of [[5, false, null], [6, true, null], [5, true, GX], [6, true, GX], [6, true, GY]]) {
    const [tier, elite, mod] = f;
    const t0 = talentOf(tier, elite, mod, 0), t1 = talentOf(tier, elite, mod, 1);
    const x3 = elite && mod === GX && tier === 6;
    assert.deepEqual([t0.hp_ratio, t0.atk_scale, t0.sluggish, t0.stun, t0.prob ?? 0], x3 ? [0.2, 1.65, 1.6, 1.2, 0.3] : [0.15, 1.5, 1.4, 1, 0], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, seed: 7 });
    noSkill(h, u);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.run(400);
    const hits = atkHits(h, u).filter((c) => c.target === e);
    const n = hits.length;
    assert.ok(n > 250, `${label(f)}: ${n} attacks`);
    const atk = u.s.atk;
    const boosted = hits.filter((c) => Math.abs(c.amount - atk * t0.atk_scale) < 1e-6);
    assert.equal(boosted.length + hits.filter((c) => Math.abs(c.amount - atk) < 1e-6).length, n, `${label(f)}: ×1 or ×${t0.atk_scale}`);
    const st = h.hooksOf('statusApplied').filter((c) => c.source === u && c.target === e);
    const slug = st.filter((c) => c.status === 'sluggish'), stun = st.filter((c) => c.status === 'stun');
    for (const c of slug) approx(c.duration, t0.sluggish, `${label(f)}: 停顿`);
    for (const c of stun) approx(c.duration, t0.stun, `${label(f)}: 晕眩`);
    const heals = h.hooksOf('heal').filter((c) => c.source === u && c.target === u && !c.opts?.regen);
    for (const c of heals.slice(0, 5)) approx(c.amount, u.s.maxHp * t0.hp_ratio * t1.heal_scale, `${label(f)}: heal ${t0.hp_ratio * 100} % × ${t1.heal_scale}`, 1e-6);
    const share = x3 ? 0.3 + 0.7 / 4 : 0.25;
    for (const [what, list] of [['×atk', boosted], ['停顿', slug], ['晕眩', stun], ['heal', heals]]) {
      assert.ok(Math.abs(list.length / n - share) < 0.07, `${label(f)}: ${what} ${list.length} / ${n} ≈ ${share}`);
    }
    // all four at once: only GEE-X stage 3 — the boosted attacks that also stun, slow and heal in the same tick
    const at = (list) => new Set(list.map((c) => c.t.toFixed(4)));
    const sS = at(slug), sT = at(stun), sH = at(heals);
    const four = boosted.filter((c) => sS.has(c.t.toFixed(4)) && sT.has(c.t.toFixed(4)) && sH.has(c.t.toFixed(4))).length;
    if (x3) assert.ok(Math.abs(four / n - 0.3) < 0.07, `${label(f)}: all four ${four} / ${n} ≈ 30 %`);
    else assert.equal(four, 0, `${label(f)}: never two at once`);
    done(h);
  }
});

test('T2 药剂扩散: healing he receives ×1.25 (GEE-Y stage 3: ×1.3); GEE-Y stage 3 heals one ally of his range at each deployment for 150 % ATK — the straight line ahead first, never a 禁疗 one', () => {
  const others = [{ uid: 2, chessId: YAK, row: 10, col: 6 }, { uid: 3, chessId: TEXAS, row: 11, col: 4 }, { uid: 4, chessId: LISKAM, row: 10, col: 5 }];
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t1 = talentOf(tier, elite, mod, 1);
    const y3 = elite && mod === GY && tier === 6;
    assert.deepEqual([t1.heal_scale, t1['healinrange.heal_scale'] ?? 0], y3 ? [1.3, 1.5] : [1.25, 0], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, others });
    assert.equal(u.s.healingTakenMul, t1.heal_scale, `${label(f)}: ×${t1.heal_scale}`);
    const yak = h.unit(2), texas = h.unit(3), liskam = h.unit(4);
    // 雷蛇 on the line ahead is 禁疗 here: 角峰, two tiles ahead on the same line, beats 德克萨斯 beside him (nearer)
    h.b.addBuff(liskam, { key: 'test:noHeal', flags: { noHeal: true } });
    for (const a of [yak, texas, liskam]) a.hp = 100;
    h.b.kill(u, null);
    const n0 = h.hooksOf('heal').length;
    assert.ok(h.b.redeploy(u, { free: true }), 'redeployed');
    const heals = h.hooksOf('heal').slice(n0).filter((c) => c.source === u && c.target !== u);
    if (y3) {
      assert.deepEqual(heals.map((c) => c.target.uid), [2], `${label(f)}: 角峰, ahead on his line`);
      approx(heals[0].amount, u.s.atk * 1.5, `${label(f)}: 150 % ATK`);
    } else assert.equal(heals.length, 0, `${label(f)}: no deploy heal`);
    done(h);
  }
});

test('S1 快速射击 (MANUAL, data DEFAULT): ASPD +50 / +70 for 23 / 26 s, then back', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, GY]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.duration, sk.spCost, sk.initSp, sk.bb.attack_speed], [elite ? 26 : 23, 30, elite ? 17 : 16, elite ? 70 : 50]);
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const aspd0 = u.s.aspd;
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, 'no enemy, no cast');
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast with an enemy in his range');
    approx(u.skill.timeLeft, sk.duration, 'duration', 0.02);
    assert.equal(u.s.aspd, aspd0 + sk.bb.attack_speed, 'ASPD');
    h.runUntil(() => !u.skill.active, sk.duration + 1);
    assert.equal(u.s.aspd, aspd0, 'back');
    done(h);
  }
});

test('S2 爆发剂·γ型 (MANUAL, data DEFAULT, 30 s): 15 physical hits of 500 attack power on the ally of his range ahead (DEF applies, 5 % floor, 受击回复 SP), then max HP / DEF +40 % / +50 % on both for 30 s; the line ahead beats a nearer side ally', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, GX]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.duration, sk.spCost, sk.bb.damage, sk.bb.max_hp, sk.bb.def], [30, elite ? 34 : 37, 500, elite ? 0.5 : 0.4, elite ? 0.5 : 0.4]);
    assert.match(sk.desc, /攻击15次/);
    // 雷蛇 three tiles ahead on his line (DEF 489: 25 per hit, 5 %), 德克萨斯 diagonal-adjacent (nearer)
    const others = [{ uid: 2, chessId: LISKAM, row: 10, col: 7 }, { uid: 3, chessId: TEXAS, row: 11, col: 5 }];
    const { h, u } = field({ tier, elite, mod, skill: 1, others });
    const liskam = h.unit(2), texas = h.unit(3);
    assert.equal(liskam.skill.spType, 'hurt');
    liskam.skill.sp = 0;
    const hp0 = liskam.hp, max0 = liskam.s.maxHp, def0 = liskam.s.def;
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [9, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    const shots = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('haak:stim'));
    assert.equal(shots.length, 15, '15 hits');
    assert.ok(shots.every((c) => c.target === liskam && c.type === 'phys' && c.dmg.isSkill), '雷蛇, physical skill damage');
    for (const c of shots) approx(c.amount, Math.max(500 - def0, 25), 'max(500 − DEF, 5 %)');
    // 受击回复: +1 SP per hit (雷蛇's own 战术防御 "受到攻击时…回复…1点技力" answers each hit too)
    assert.equal(h.hooksOf('spGain').filter((c) => c.unit === liskam && c.reason === 'hurt').length, 15, '受击回复: +1 SP per hit');
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.target === texas).length, 0, '德克萨斯 untouched');
    const mods = { hpPct: sk.bb.max_hp, defPct: sk.bb.def };
    assert.deepEqual(u.findBuff('haak:s2:self')?.mods, mods, 'himself');
    assert.deepEqual(liskam.findBuff(`haak:s2:${u.id}`)?.mods, mods, 'the target');
    approx(liskam.findBuff(`haak:s2:${u.id}`).timeLeft, 30, 'for the skill duration', 0.02);
    approx(liskam.s.maxHp, max0 * (1 + sk.bb.max_hp), 'max HP');
    approx(liskam.hp, (hp0 - 15 * Math.max(500 - def0, 25)) * (1 + sk.bb.max_hp), 'the HP ratio kept');
    h.run(30.1);
    assert.ok(!u.findBuff('haak:s2:self') && !liskam.findBuff(`haak:s2:${u.id}`), 'gone after 30 s');
    done(h);
  }
});

test('爆发剂 edge cases: a low-DEF ally can be knocked out by the volley (he still gets his part); with no ally in his range the cast does nothing', () => {
  {
    const { h, u } = field({ tier: 5, skill: 1, others: [{ uid: 2, chessId: TEXAS, row: 10, col: 5 }] });
    const texas = h.unit(2);
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [9, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3));
    const shots = h.hooksOf('damaged').filter((c) => c.source === u && c.target === texas);
    assert.ok(!texas.alive && shots.length < 15, `德克萨斯 (DEF 260) knocked out after ${shots.length} hits`);
    assert.ok(u.findBuff('haak:s2:self'), 'his own part');
    done(h);
  }
  {
    const { h, u } = field({ tier: 6, elite: true, skill: 2, others: [{ uid: 2, chessId: YAK, row: 10, col: 3 }] });   // behind him
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast: the DEFAULT rule needs an enemy only');
    assert.equal(h.hooksOf('damaged').filter((c) => c.dmg?.tags?.includes('haak:stim')).length, 0, 'no volley');
    assert.equal(u.findBuff('haak:s3:self'), null, 'no buff');
    done(h);
  }
});

test('S3 爆发剂·榴莲味 (MANUAL, data DEFAULT, 20 s): the same volley, then ATK +30 % / +35 % and ASPD +30 / +35 on both for 20 s', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, GY]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.spCost, sk.bb.damage, sk.bb.atk, sk.bb.attack_speed], [20, elite ? 41 : 44, 500, elite ? 0.35 : 0.3, elite ? 35 : 30]);
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: YAK, row: 9, col: 5 }] });
    const yak = h.unit(2);
    const atk0 = yak.s.atk, aspd0 = yak.s.aspd, myAtk = u.s.atk, myAspd = u.s.aspd;
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.target === yak && c.dmg?.tags?.includes('haak:stim')).length, 15, '角峰 (beside, ahead diagonal) takes the volley');
    approx(yak.s.atk, atk0 * (1 + sk.bb.atk), 'its ATK');
    assert.equal(yak.s.aspd, aspd0 + sk.bb.attack_speed, 'its ASPD');
    approx(u.s.atk, myAtk * (1 + sk.bb.atk), 'his ATK');
    assert.equal(u.s.aspd, myAspd + sk.bb.attack_speed, 'his ASPD');
    approx(u.findBuff('haak:s3:self').timeLeft, 20, '20 s', 0.02);
    done(h);
  }
});
