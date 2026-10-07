// test/content/op_lessng.test.js — the 自选 operator kit of 止颂 (char_4011_lessng, 6★ 无畏者; kit
// server/sim/content/kits/ops/op-lessng.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, DRE-X
// “沉锋之束” or DRE-Y “苦修者的抗压训练” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json
// (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_lessng.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deploymentOf } from '../../server/sim/content/items/battle.js';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { DUEL_KEY, OATH_KEY, PAIN_KEY, REBORN_KEY } from '../../server/sim/content/kits/ops/op-lessng.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const LESSNG = 'char_4011_lessng';
const FORMS = BACKUPS.units[LESSNG].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const DREX = 'uniequip_002_lessng', DREY = 'uniequip_003_lessng';
const S1 = 'skchr_lessng_1', S2 = 'skchr_lessng_2', S3 = 'skchr_lessng_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const talentOf = (u, i) => u.def.raw.talents.find((t) => t.index === i)?.bb ?? {};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, DREX, DREY].map((m) => [t, true, m]))];
/** A plain ally (no kit, no damage modifiers) for friendly-damage checks. */
const PLAIN = chessRec({ id: 'test_plain_a', name: '测试', skill: null });

/** A battle with 止颂 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: { test_plain_a: PLAIN } }, timeLimit: 600, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: LESSNG, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
/** 止颂 on row 9 with a walker blocked by her. */
function blocked(o = {}) {
  const r = field({ row: 9, ...o });
  const w = r.h.spawn('enemy_walk', { routeIndex: 0 });
  assert.ok(r.h.runUntil(() => w.blockedBy === r.u, 30), 'the walker reaches her');
  return { ...r, w };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const noSp = (h, u) => h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });   // 阻回: the MANUAL skill stays off
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

test('止颂 in every 自选 form: his operator kit (all three skills authored), the form\'s stats + module attributes, 1-1, blocks 1, melee ground-only, 1.5 s, 莱塔尼亚, no 特质', () => {
  assert.equal(OPERATOR_KITS[LESSNG], KITS[LESSNG]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [LESSNG, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.base.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.sub, u.base.bat, u.dmgType], [1, 'melee', false, 'fearless', 1.5, 'phys'], `${label(f)}: 无畏者`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.raw.nationId], [['emptyShip'], [], 'leithanien'], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      done(h);
    }
  }
  // E2 Lv1 2798 / 866 / 232, E2 Lv60 3384 / 984 / 262; DRE-X +230 / +17 / +17 → +400 / +30 / +30; DRE-Y +300 / +55 → +450 / +80
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2798, 866, 3384, 984]);
  assert.deepEqual([modOf(5, DREX).attr, modOf(6, DREX).attr, modOf(5, DREY).attr, modOf(6, DREY).attr],
    [{ maxHp: 230, atk: 17, def: 17 }, { maxHp: 400, atk: 30, def: 30 }, { maxHp: 300, atk: 55 }, { maxHp: 450, atk: 80 }]);
});

test('a 自选 pick: 止颂 is offered at tiers 5 and 6 and a roster with him passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(LESSNG));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(LESSNG), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: LESSNG, skillIndex: 1, uniEquipId: DREY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: LESSNG, skillIndex: 1, uniEquipId: DREY } } });
});

test('T1 苦痛专注: while he blocks, physical / arts damage from anyone but an enemy he blocks — 无来源, allies, himself included — ×0.65 (DRE-Y stage 3: ×0.6); none while not blocking, none on true damage', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const y3 = elite && mod === DREY && tier === 6;
    const cut = talentOf(field({ tier, elite, mod }).u, 0).damage_resistance;
    assert.equal(cut, y3 ? 0.4 : 0.35, `${label(f)}: the talent of the form`);
    const { h, u, w } = blocked({ tier, elite, mod, others: [{ uid: 2, chessId: 'test_plain_a', row: 11, col: 3 }] });
    const ally = h.unit(2);
    const other = h.spawn('enemy_dummy', { pos: [11, 8] });
    const hit = (src, d) => { u.hp = u.s.maxHp; return h.b.dealDamage(src, u, d); };   // (full HP: the return value is the HP removed)
    const arts = (src) => hit(src, { amount: 1000, type: 'arts' });
    approx(arts(other), 1000 * (1 - cut), `${label(f)}: an enemy he does not block`);
    approx(arts(w), 1000, `${label(f)}: the enemy he blocks`);
    approx(arts(null), 1000 * (1 - cut), `${label(f)}: 无来源`);
    approx(arts(ally), 1000 * (1 - cut), `${label(f)}: an ally`);
    approx(arts(u), 1000 * (1 - cut), `${label(f)}: himself`);
    approx(hit(other, { amount: 1000, type: 'true' }), 1000, `${label(f)}: true damage`);
    approx(hit(other, { amount: 2000, type: 'phys' }), (2000 - u.s.def) * (1 - cut), `${label(f)}: physical`);
    u.hp = u.s.maxHp;
    h.b.releaseBlocked(u);
    h.b.kill(w, null);
    h.step();
    assert.equal(u.blocking.length, 0);
    approx(arts(other), 1000, `${label(f)}: not while he blocks nobody`);
    done(h);
  }
});

test('T2 痛楚砺刃: any damage aimed at him (a dodged one too) ⇒ ATK +16 % (DRE-X stage 3: +24 %) for 15 s, refreshed, never stacked', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod });
    const t = talentOf(u, 1);
    const x3 = elite && mod === DREX && tier === 6;
    assert.deepEqual([t.atk, t.add_atk_duration], [x3 ? 0.24 : 0.16, 15], `${label(f)}: the talent of the form`);
    const e = h.spawn('enemy_dummy', { pos: [11, 8] });
    assert.equal(u.findBuff(PAIN_KEY), null);
    h.b.addBuff(u, { key: 'test:dodge', mods: { dodgePhys: 1 } });
    assert.equal(h.b.dealDamage(e, u, { amount: 500, type: 'phys' }), 0, `${label(f)}: dodged`);
    assert.deepEqual(u.findBuff(PAIN_KEY)?.mods, { atkPct: t.atk }, `${label(f)}: still triggered`);
    approx(u.s.atk, u.base.atk * (1 + t.atk), `${label(f)}: ATK +${t.atk * 100} %`);
    h.b.removeBuff(u, 'test:dodge');
    h.run(10);
    h.b.dealDamage(e, u, { amount: 100, type: 'arts' });
    h.b.dealDamage(null, u, { amount: 100, type: 'true' });
    approx(u.findBuff(PAIN_KEY).timeLeft, 15, `${label(f)}: refreshed to 15 s`, 0.01);
    approx(u.s.atk, u.base.atk * (1 + t.atk), `${label(f)}: not stacked`);
    h.run(15.1);
    assert.equal(u.findBuff(PAIN_KEY), null, `${label(f)}: gone 15 s after the last hit`);
    done(h);
  }
});

test('S1 强力击·γ型 (AUTO, attack SP 3, data DEFAULT): the next attack at 205 % / 225 % ATK (× DRE-X 115 % on a blocked target)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, DREX], [5, true, DREY]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u, w } = blocked({ tier, elite, mod, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.skillType, sk.bb.atk_scale], ['DEFAULT', 'attack', 3, 'AUTO', elite ? 2.25 : 2.05], `T${tier}`);
    const scale = mod === DREX ? modOf(tier, DREX).traitOverride.bb.atk_scale : 1;
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => atkHits(h, u).some((c) => c.dmg.isSkill && c.t > t0), 20), `T${tier}: cast`);
    const hits = atkHits(h, u).filter((c) => c.t > t0 && c.target === w);
    const sk1 = hits.find((c) => c.dmg.isSkill);
    approx(sk1.amount, u.s.atk * sk.bb.atk_scale * scale, `T${tier}: ${sk.bb.atk_scale * 100} %`);
    for (const c of hits.filter((x) => !x.dmg.isSkill)) approx(c.amount, u.s.atk * scale, `T${tier}: plain attacks`);
    done(h);
  }
});

test('S2 虔修对决 (PASSIVE, 部署后): for 18 / 21 s from every deployment ATK +25 / 35 %, two strikes per attack and 苦痛专注 ×2; then single strikes', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, DREY], [6, true, DREX]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.skillType, sk.spType, sk.duration, sk.bb.atk, sk.bb.talent_scale], ['PASSIVE', 'ON_DEPLOY', elite ? 21 : 18, elite ? 0.35 : 0.25, 2], `T${tier}`);
    const { h, u, w } = blocked({ tier, elite, mod, skill: 1 });
    const cut = talentOf(u, 0).damage_resistance;
    assert.ok(h.b.time < sk.duration, 'the walker arrived inside the window');
    assert.deepEqual(u.findBuff(DUEL_KEY)?.mods, { atkPct: sk.bb.atk }, `T${tier}: ATK +${sk.bb.atk * 100} %`);
    const other = h.spawn('enemy_dummy', { pos: [11, 8] });
    approx(h.b.dealDamage(other, u, { amount: 1000, type: 'arts' }), 1000 * (1 - cut * 2), `T${tier}: 苦痛专注 ×2`);
    const t0 = h.b.time;
    h.runUntil(() => !u.findBuff(DUEL_KEY), 30);
    approx(h.b.time, sk.duration, `T${tier}: the window ends ${sk.duration} s after the deployment`, 0.05);
    const inWin = new Map();
    for (const c of atkHits(h, u).filter((x) => x.t > t0)) inWin.set(c.dmg.attackId, (inWin.get(c.dmg.attackId) ?? 0) + 1);
    assert.ok(inWin.size >= 2 && [...inWin.values()].every((n) => n === 2), `T${tier}: two strikes per attack (${[...inWin.values()]})`);
    const t1 = h.b.time;
    h.run(5);
    const after = new Map();
    for (const c of atkHits(h, u).filter((x) => x.t > t1)) after.set(c.dmg.attackId, (after.get(c.dmg.attackId) ?? 0) + 1);
    assert.ok(after.size >= 2 && [...after.values()].every((n) => n === 1), `T${tier}: single strikes after`);
    approx(u.s.atk, u.base.atk * (1 + (u.findBuff(PAIN_KEY) ? talentOf(u, 1).atk : 0)), `T${tier}: ATK back`);
    approx(h.b.dealDamage(other, u, { amount: 1000, type: 'arts' }), 1000 * (1 - cut), `T${tier}: 苦痛专注 ×1`);
    // a redeploy restarts the window
    h.b.retreat(u);
    h.b.redeploy(u);
    h.step();
    approx(u.findBuff(DUEL_KEY)?.timeLeft ?? 0, sk.duration, `T${tier}: again for ${sk.duration} s`, 0.05);
    assert.equal(w.alive, true);
    done(h);
  }
});

test('S3 苦修破誓 (MANUAL, data DEFAULT): 20 s, max HP +65 / 80 %, a blocked target at 160 % / 180 % ATK (× DRE-X), no 异常状态 while it runs; then all back', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, DREX], [5, true, DREY]]) {
    const sk = skillOf(tier, elite, S3);
    const b = sk.bb;
    assert.deepEqual([sk.duration, b.max_hp, b['lessng_s3[atk_scale].atk_scale'], b.magical_value, sk.skillType], [20, elite ? 0.8 : 0.65, elite ? 1.8 : 1.6, 600, 'MANUAL'], `T${tier}`);
    const { h, u, w } = blocked({ tier, elite, mod, skill: 2 });
    assert.equal(u.skill.rule, 'DEFAULT');
    const unb = h.spawn('enemy_dummy', { pos: [9, 5] });   // on his tile beside the walker: he blocks only one
    const hp0 = u.hp, max0 = u.s.maxHp;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    approx(u.skill.timeLeft, 20, `T${tier}: 20 s`, 0.05);
    approx(u.s.maxHp, max0 * (1 + b.max_hp), `T${tier}: max HP +${b.max_hp * 100} %`);
    approx(u.hp / u.s.maxHp, hp0 / max0, `T${tier}: ratio kept`);
    for (const st of ['stun', 'cold', 'freeze', 'sleep', 'silence', 'fear']) assert.equal(h.b.applyStatus(u, st, { duration: 3, source: w }), false, `T${tier}: immune to ${st}`);
    const scale = mod === DREX ? modOf(tier, DREX).traitOverride.bb.atk_scale : 1;
    const t0 = h.b.time;
    h.run(6);
    const hits = atkHits(h, u).filter((c) => c.t > t0);
    assert.ok(hits.length >= 3);
    for (const c of hits) {
      if (c.target === w) approx(c.amount, u.s.atk * b['lessng_s3[atk_scale].atk_scale'] * scale, `T${tier}: blocked ×${b['lessng_s3[atk_scale].atk_scale']}`);
      else approx(c.amount, unb.blockedBy ? u.s.atk * b['lessng_s3[atk_scale].atk_scale'] * scale : u.s.atk, `T${tier}: the other target`);
    }
    h.runUntil(() => !u.skill.active, 20);
    h.step();
    assert.equal(u.findBuff(OATH_KEY), null);
    approx(u.s.maxHp, max0, `T${tier}: max HP back`);
    assert.equal(h.b.applyStatus(u, 'stun', { duration: 0.5, source: w }), true, `T${tier}: stuns land again`);
    done(h);
  }
});

test('S3 苦修破誓 cast under a 异常状态: 600 arts to himself first (苦痛专注 applies while he blocks; may knock him out), every 异常状态 cleansed, then the HP; 沉默 does not hold the cast back, 晕眩 does (no attack)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, DREX]]) {
    const cut = 0.35;
    // cold: he still attacks, the basic strategy casts; he blocks ⇒ 600 × 0.65
    {
      const { h, u, w } = blocked({ tier, elite, mod, skill: 2 });
      h.b.applyStatus(u, 'cold', { duration: 20, source: w });
      const hp0 = u.hp, max0 = u.s.maxHp;
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 5), `T${tier}: cast while cold`);
      const self = h.hooksOf('damaged').filter((c) => c.source === u && c.target === u);
      assert.equal(self.length, 1, `T${tier}: one self hit`);
      assert.deepEqual([self[0].type, Math.round(self[0].amount)], ['arts', Math.round(600 * (1 - cut))], `T${tier}: 600 arts ×0.65`);
      assert.ok(!u.buffs.some((x) => x.status === 'cold'), `T${tier}: cold cleansed`);
      approx(u.hp, (hp0 - 600 * (1 - cut)) / max0 * u.s.maxHp, `T${tier}: the HP buff after the damage (ratio of the hurt HP)`);
      assert.ok(u.findBuff(PAIN_KEY), `T${tier}: 痛楚砺刃 saw it`);
      done(h);
    }
    // 沉默: the engine's basic strategy refuses a silenced cast — this skill "可以无视异常状态开启"
    {
      const { h, u } = field({ tier, elite, mod, skill: 2 });
      h.spawn('enemy_dummy', { pos: [10, 6] });
      h.b.applyStatus(u, 'silence', { duration: 20, source: null });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 5), `T${tier}: cast while silenced`);
      assert.equal(h.hooksOf('skillStart').find((c) => c.unit === u)?.reason, 'abnormal');
      assert.equal(Math.round(h.hooksOf('damaged').find((c) => c.source === u && c.target === u)?.amount), 600, `T${tier}: 600 arts (he blocks nobody)`);
      assert.ok(!u.s.flags.silence, `T${tier}: silence cleansed`);
      done(h);
    }
    // 晕眩: no attack ⇒ no cast until it ends (then no abnormal state, no self damage)
    {
      const { h, u } = field({ tier, elite, mod, skill: 2 });
      h.spawn('enemy_dummy', { pos: [10, 6] });
      h.b.applyStatus(u, 'stun', { duration: 3, source: null });
      u.skill.gainSp(999);
      h.run(2.5);
      assert.equal(u.skill.activations, 0, `T${tier}: not while stunned`);
      assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: once the stun ends`);
      assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.target === u).length, 0, `T${tier}: no self damage`);
      done(h);
    }
    // the self damage may knock him out (可致死)
    {
      const { h, u } = field({ tier, elite, mod, skill: 2 });
      h.spawn('enemy_dummy', { pos: [10, 6] });
      h.b.applyStatus(u, 'cold', { duration: 20, source: null });
      u.hp = 300;
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => !u.alive, 5), `T${tier}: knocked out by his own 600`);
      assert.equal(u.findBuff(OATH_KEY), null);
      done(h);
    }
  }
});

test('DRE-X “沉锋之束”: his attacks ×115 % on a target blocked by anyone (another operator\'s too), ×1 on an unblocked one — stages 1 and 3; none without it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 6 }] });
    noSp(h, u);
    const yak = h.unit(2);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });   // blocked by 角峰, on his front tile
    h.step();
    assert.equal(e.blockedBy, yak);
    const x = elite && mod === DREX;
    if (x) assert.equal(u.def.raw.trait.bb.atk_scale, 1.15, label(f));
    h.run(6);
    const hits = atkHits(h, u).filter((c) => c.target === e);
    assert.ok(hits.length >= 3, label(f));
    for (const c of hits) approx(c.amount, u.s.atk * (x ? 1.15 : 1), `${label(f)}: ×${x ? 1.15 : 1}`);
    h.b.releaseBlocked(yak);
    h.b.retreat(yak);
    h.step();
    assert.ok(!e.blockedBy);
    const t0 = h.b.time;
    h.run(4);
    for (const c of atkHits(h, u).filter((y) => y.t > t0)) approx(c.amount, u.s.atk, `${label(f)}: unblocked ×1`);
    done(h);
  }
});

test('DRE-Y “苦修者的抗压训练”: the first lethal hit of a deployment ⇒ max HP ×0.4, ASPD +30, full HP (once; again after a redeploy; not while a 不死 holds him); stage 3: 12 % of DEF ignored on the enemy he blocks', () => {
  for (const tier of [5, 6]) {
    const { h, u } = field({ tier, elite: true, mod: DREY });
    const tb = u.def.raw.trait.bb;
    assert.deepEqual([tb.attack_speed, tb.max_hp, tb.hp_ratio, tb.value], [30, 0.4, 1, 0.6], `T${tier}: trait bb`);
    const e = h.spawn('enemy_dummy', { pos: [11, 8] });
    const max0 = u.s.maxHp, aspd0 = u.s.aspd;
    h.b.dealDamage(e, u, { amount: 1e7, type: 'true' });
    assert.ok(u.alive, `T${tier}: not knocked out`);
    approx(u.s.maxHp, max0 * 0.4, `T${tier}: max HP ×0.4`);
    approx(u.hp, u.s.maxHp, `T${tier}: full HP of the new max`);
    assert.equal(u.s.aspd, aspd0 + 30, `T${tier}: ASPD +30`);
    assert.ok(u.findBuff(REBORN_KEY));
    h.b.dealDamage(e, u, { amount: 1e7, type: 'true' });
    assert.ok(!u.alive, `T${tier}: once per deployment`);
    h.b.redeploy(u);
    h.step();
    approx(u.s.maxHp, max0, `T${tier}: a new deployment: max HP back`);
    h.b.dealDamage(e, u, { amount: 1e7, type: 'true' });
    assert.ok(u.alive, `T${tier}: again after the redeploy`);
    done(h);
    // a running 不死 (坚固维式重锤's window) holds him instead: the module is not used
    const r = field({ tier, elite: true, mod: DREY });
    r.u.mem.undyingAt = deploymentOf(r.u);
    r.u.mem.undyingUntil = r.h.b.time + 5;
    const hammer = r.h.b.on('fatal', (c) => { if (c.unit === r.u && !c.prevented) c.prevented = true; }, { priority: -99 });
    const f = r.h.spawn('enemy_dummy', { pos: [11, 8] });
    r.h.b.dealDamage(f, r.u, { amount: 1e7, type: 'true' });
    assert.ok(r.u.alive && r.u.hp < 2 && !r.u.findBuff(REBORN_KEY), `T${tier}: held by the 不死, the module untouched`);
    r.h.b.off(hammer);
    r.u.mem.undyingUntil = 0;
    r.h.b.dealDamage(f, r.u, { amount: 1e7, type: 'true' });
    assert.ok(r.u.alive && r.u.findBuff(REBORN_KEY), `T${tier}: the module afterwards`);
    done(r.h);
  }
  // stage 3's hidden part: 无视目标12%的防御力 on the enemy he blocks (none at stage 1, none on an unblocked enemy)
  for (const tier of [5, 6]) {
    const ENEMY_DEF = 1000;
    const h = makeBattle({
      defs: { enemies: { enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0, def: ENEMY_DEF }), enemy_dummy: dummy('enemy_dummy', { def: ENEMY_DEF }) } },
      timeLimit: 600, autoFinish: false, seed: 5, flags: { dpPerSec: 0 }, hooks: ['damaged'], captureNoisy: true,
      units: [{ uid: 1, diy: { slot: SLOT[tier], charId: LESSNG, skillIndex: 2, uniEquipId: DREY }, elite: true, row: 9, col: 5 }],
    });
    h.step();
    const u = h.unit(1);
    noSp(h, u);
    const w = h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => w.blockedBy === u, 30));
    const t0 = h.b.time;
    h.run(6);
    const pen = tier === 6 ? 0.12 : 0;
    const hits = atkHits(h, u).filter((c) => c.t > t0 && c.target === w);
    assert.ok(hits.length >= 3);
    for (const c of hits) approx(c.amount, Math.max(u.s.atk - ENEMY_DEF * (1 - pen), u.s.atk * 0.05), `T${tier}: DEF ×${1 - pen}`);
    done(h);
  }
});
