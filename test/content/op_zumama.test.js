// test/content/op_zumama.test.js — the 自选 operator kit of 森蚺 (char_416_zumama, 6★ 决战者; kit
// server/sim/content/kits/ops/op-zumama.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, HES-X
// “祖玛玛的工具箱”, HES-Y “小小的丑东西” or RA-A 森蚺特限证章 at stage 1 (tier 5) / 3 (tier 6). Every number is read back from
// data/backups.json (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_zumama.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ZUMAMA = 'char_416_zumama';
const FORMS = BACKUPS.units[ZUMAMA].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const HESX = 'uniequip_002_zumama', HESY = 'uniequip_003_zumama', RAA = 'uniequip_004_zumama';
const S1 = 'skchr_zumama_1', S2 = 'skchr_zumama_2', S3 = 'skchr_zumama_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_tough: dummy('enemy_tough', { immunities: { stun: true } }),
  enemy_frail: dummy('enemy_frail', { hp: 10 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, HESX, HESY, RAA].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 森蚺 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 1, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ZUMAMA, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
/** An enemy she blocks: a still dummy put on her own tile (blocked on the next tick). */
function blockOne(h, u, key = 'enemy_dummy') {
  const e = h.spawn(key, { pos: [u.tileR, u.tileC] });
  assert.ok(h.runUntil(() => e.blockedBy === u, 1), 'blocked');
  return e;
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('森蚺 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 1, melee ground-only, 萨尔贡, no 特质; triggers from the data', () => {
  assert.equal(OPERATOR_KITS[ZUMAMA], KITS[ZUMAMA]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ZUMAMA, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [1, 'melee', 'phys', false, 1.6], `${label(f)}: 决战者`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['sargonShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      // the 重装 exception (the owner's decision of 2026-10-05): S2 / S3 cast in range (DEFAULT), the official TAKE_DAMAGE kept
      const sk = form.skills[skill];
      if (skill === 0) assert.deepEqual([u.skill.kind, sk.skillType, u.skill.spCost], ['passive', 'PASSIVE', 0], `${label(f)}: S1 passive`);
      else assert.deepEqual([u.skill.rule, sk.trigger.rule, sk.trigger.rawRule, sk.skillType], ['DEFAULT', 'DEFAULT', 'TAKE_DAMAGE', 'MANUAL'], `${label(f)}: S${skill + 1} trigger`);
      done(h);
    }
  }
  // zh_CN numbers (full potential): E2 Lv1 3440 / 835 / 519, E2 Lv60 4121 / 949 / 601; HES-X +80/+70 → +105/+85 ATK/DEF, HES-Y +70/+80 →
  // +85/+110, RA-A +280/+80 → +380/+130 HP/ATK
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [3440, 835, 4121, 949]);
  assert.deepEqual([modOf(5, HESX).attr, modOf(6, HESX).attr, modOf(5, HESY).attr, modOf(6, HESY).attr, modOf(5, RAA).attr, modOf(6, RAA).attr],
    [{ atk: 80, def: 70 }, { atk: 105, def: 85 }, { atk: 70, def: 80 }, { atk: 85, def: 110 }, { maxHp: 280, atk: 80 }, { maxHp: 380, atk: 130 }]);
});

test('a 自选 pick: 森蚺 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(ZUMAMA));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(ZUMAMA), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: ZUMAMA, skillIndex: 2, uniEquipId: HESX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: ZUMAMA, skillIndex: 2, uniEquipId: HESX } } });
});

test('S1 轻型挂斧 (PASSIVE): ATK / DEF +14 % / +18 % from every deployment, no SP', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([sk.bb.atk, sk.bb.def], elite ? [0.18, 0.18] : [0.14, 0.14], `T${tier}`);
    assert.ok(u.skill.active, `T${tier}: on from the deployment`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.def, u.base.def * (1 + sk.bb.def), `T${tier}: DEF`);
    h.b.retreat(u);
    h.b.redeploy(u);
    h.step();
    assert.ok(u.skill.active, `T${tier}: on again after a redeploy`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK again`);
    done(h);
  }
});

test('S2 震慑劈砍 (data DEFAULT: casts with the enemy she blocks): 16 / 17 s, ATK +100 % / +130 %, interval 1.6 + 0.4 s, every enemy she blocks stunned past 抵抗 while it lasts; a stun immunity holds; all gone after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.spCost, sk.initSp], elite ? [17, 1.3, 0.4, 32, 12] : [16, 1, 0.4, 35, 11], `T${tier}`);
    u.skill.gainSp(999, 'init');
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    const e = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC] });
    h.b.applyStatus(e, 'resist', { duration: 999, value: 0.5 });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast once she blocks it`);
    assert.equal(e.blockedBy, u);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.01);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.interval, 2.0, `T${tier}: 1.6 + 0.4 s`);
    h.step(2);
    assert.ok(e.s.flags.stun, `T${tier}: the blocked enemy is stunned`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.status === 'stun' && c.target === e && c.source === u);
    assert.ok(stuns.length > 0 && stuns.every((c) => Math.abs(c.duration - 0.1) < 1e-9), `T${tier}: 抵抗 does not shorten it`);
    h.run(5);
    assert.ok(e.s.flags.stun && u.skill.active, `T${tier}: still stunned while blocked`);
    // a new blockee mid-skill: the first one falls, a stun-immune one and a plain one come in turn
    h.b.kill(e, u);
    const tough = h.spawn('enemy_tough', { pos: [u.tileR, u.tileC] });
    assert.ok(h.runUntil(() => tough.blockedBy === u, 1));
    h.step(3);
    assert.ok(!tough.s.flags.stun, `T${tier}: 晕眩 immunity`);
    h.b.kill(tough, u);
    const late = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC] });
    assert.ok(h.runUntil(() => late.blockedBy === u, 1));
    h.step(2);
    assert.ok(late.s.flags.stun, `T${tier}: an enemy blocked mid-skill is stunned too`);
    assert.ok(h.runUntil(() => !u.skill.active, sk.duration), `T${tier}: ends`);
    h.run(0.15);
    assert.ok(!late.s.flags.stun, `T${tier}: the stun ends with the skill`);
    approx(u.s.interval, 1.6, `T${tier}: interval back`);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    // the stunned enemies fought nobody meanwhile: her normal attacks hit them (physical, ground)
    assert.ok(atkHits(h, u).some((c) => c.target === late && c.type === 'phys'), `T${tier}: she keeps attacking`);
    done(h);
  }
});

test('S3 钢铁意志 (data DEFAULT): 31 / 32 s, ATK +140 % / +170 %, DEF +90 % / +120 %, block 1 + 2, 生命回复速度 3 % max HP / s (禁疗-proof); 5 s self-stun after, blocking nobody meanwhile', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, HESX]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.def, sk.bb.block_cnt, sk.bb.hp_recovery_per_sec_by_max_hp_ratio, sk.bb.stun], elite ? [32, 1.7, 1.2, 2, 0.03, 5] : [31, 1.4, 0.9, 2, 0.03, 5], `T${tier}`);
    u.skill.gainSp(999, 'init');
    const e = blockOne(h, u);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with the enemy she blocks`);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.05);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.def, u.base.def * (1 + sk.bb.def), `T${tier}: DEF`);
    assert.equal(u.s.blockCnt, 3, `T${tier}: block 1 + 2`);
    approx(u.s.hpRegen, u.s.maxHp * 0.03, `T${tier}: 3 % max HP / s`);
    // 生命回复速度, no heal: 禁疗 and 无法被治疗 do not stop it
    h.b.addBuff(u, { key: 'test:healFree', flags: { healFree: true, noHeal: true } });
    u.hp = u.s.maxHp * 0.5;
    const hp0 = u.hp;
    h.run(1);
    approx(u.hp - hp0, u.s.maxHp * 0.03, `T${tier}: +3 % in 1 s under 禁疗`, 0.05);
    h.b.removeBuff(u, 'test:healFree');
    assert.ok(h.runUntil(() => !u.skill.active, sk.duration + 1), `T${tier}: ends`);
    const st = h.hooksOf('statusApplied').find((c) => c.status === 'stun' && c.target === u);
    assert.ok(st, `T${tier}: self-stun`);
    approx(st.duration, sk.bb.stun, `T${tier}: ${sk.bb.stun} s`);
    h.step(2);
    assert.ok(u.s.flags.stun && u.blocking.length === 0 && e.blockedBy !== u, `T${tier}: stunned, blocking nobody`);
    assert.equal(u.s.blockCnt, 1, `T${tier}: block back to 1`);
    h.run(sk.bb.stun + 0.2);
    assert.ok(!u.s.flags.stun, `T${tier}: the stun is over`);
    done(h);
  }
});

test('T1 勇冠三军: above half HP every hit ×1.17 as an 攻击力倍率 (×1.25 with HES-Y stage 3), at or below half 22 % 庇护 (30 %) on physical / arts damage only — checked every 0.1 s', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const t0 = u.def.raw.talents.find((t) => t.index === 0).bb;
    const y3 = elite && mod === HESY && tier === 6;
    assert.deepEqual([t0.hp_ratio, t0.atk_scale, t0.damage_resistance], y3 ? [0.5, 1.25, 0.3] : [0.5, 1.17, 0.22], label(f));
    const e = h.spawn('enemy_dummy', { pos: [u.tileR, u.tileC + 1] });   // in her 1-1, not blocked: no SP, no cast
    h.run(0.2);
    assert.equal(u.s.atkScaleMul, t0.atk_scale, `${label(f)}: above half`);
    const n0 = atkHits(h, u).length;
    assert.ok(h.runUntil(() => atkHits(h, u).length > n0, 3));
    const hit = atkHits(h, u)[n0];
    approx(hit.amount, u.s.atk * t0.atk_scale, `${label(f)}: ×${t0.atk_scale} on a 0-DEF target`);
    // half HP: 庇护, no ×1.17
    u.hp = u.s.maxHp * 0.5;
    h.run(0.14);
    assert.equal(u.s.atkScaleMul, 1, `${label(f)}: at half: no bonus`);
    const pb = u.findBuff('protect');
    assert.ok(pb, `${label(f)}: 庇护`);
    approx(pb.data.value, t0.damage_resistance, `${label(f)}: ${t0.damage_resistance * 100} %`);
    const hit1 = (amount, type) => { u.hp = u.s.maxHp * 0.5; return h.b.dealDamage(e, u, { amount, type }); };
    approx(hit1(400, 'arts'), 400 * (1 - t0.damage_resistance), `${label(f)}: arts`);
    approx(hit1(300, 'true'), 300, `${label(f)}: true untouched`);
    approx(hit1(u.s.def + 400, 'phys'), 400 * (1 - t0.damage_resistance), `${label(f)}: physical`);
    // back above half: the bonus within one check, the 庇护 gone
    u.hp = u.s.maxHp * 0.9;
    h.run(0.25);
    assert.equal(u.s.atkScaleMul, t0.atk_scale, `${label(f)}: above half again`);
    assert.equal(u.findBuff('protect'), null, `${label(f)}: no 庇护`);
    done(h);
  }
});

test('trait 决战者: no module ⇒ 阻回 (no SP of any kind, gifts too) unless she blocks; HES-X ×0.2 / HES-Y ×0.001 / RA-A ×0 SP recovery unblocked (gifts land); T2 愈战愈勇 +0.2 / s blocking (HES-X stage 3 +0.55; RA-A stays +0.2); HES-Y ATK / DEF +15 % blocking', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const form = formOf(tier, elite);
    const m = elite ? modOf(tier, mod) : null;
    const ratio = m ? m.traitOverride.bb.sp_recover_ratio : null;
    const t2 = elite && mod === HESX && tier === 6 ? 0.55 : 0.2;
    assert.equal(ratio, { [HESX]: -0.8, [HESY]: -0.999, [RAA]: -1 }[mod] ?? null, label(f));
    const init = skillOf(tier, elite, S2).initSp;
    assert.ok(u.skill.sp >= init && u.skill.sp < init + 0.05, `${label(f)}: initSp at the deployment despite 阻回 (${u.skill.sp})`);
    // unblocked
    h.run(0.2);
    const sp0 = u.skill.sp;
    h.run(5);
    const unblocked = u.skill.sp - sp0;
    if (ratio == null) {
      assert.ok(u.s.flags.noSp, `${label(f)}: 阻回`);
      approx(unblocked, 0, `${label(f)}: no SP`);
      assert.equal(u.skill.gainSp(3, 'talent'), 0, `${label(f)}: a gift refused`);
    } else {
      assert.ok(!u.s.flags.noSp, `${label(f)}: no 阻回 with a module`);
      approx(u.s.spRecovery, 1 + ratio, `${label(f)}: ×${1 + ratio}`);
      approx(unblocked, 5 * (1 + ratio), `${label(f)}: ${5 * (1 + ratio)} SP in 5 s`, 1e-3);
      approx(u.skill.gainSp(3, 'talent'), 3, `${label(f)}: a gift lands`);
    }
    assert.equal(u.findBuff('trait:zumama:block'), null, `${label(f)}: nothing blocked`);
    // blocking: full SP recovery + T2
    u.skill.sp = 0;
    blockOne(h, u);
    h.step();
    approx(u.s.spRecovery, 1 + t2, `${label(f)}: 1 + ${t2} / s blocking`);
    const sp1 = u.skill.sp;
    h.run(5);
    approx(u.skill.sp - sp1, 5 * (1 + t2), `${label(f)}: SP while blocking`, 1e-3);
    if (elite && mod === HESY) {
      assert.deepEqual(u.findBuff('trait:zumama:block')?.mods, { atkPct: 0.15, defPct: 0.15 }, `${label(f)}: HES-Y`);
    } else assert.equal(u.findBuff('trait:zumama:block'), null, `${label(f)}: no ATK / DEF trait`);
    if (elite && mod === RAA && tier === 6) {
      // the composed record carries the 生息演算-only 0.4 / s; the kit reads 愈战愈勇 from talentsBase
      assert.equal(u.def.raw.talents.find((t) => t.index === 1).bb.sp_recovery_per_sec, 0.4, 'the sandbox part is in the record');
      assert.equal(u.def.raw.talentsBase.find((t) => t.index === 1).bb.sp_recovery_per_sec, 0.2);
    }
    assert.equal(form.trait.desc, '只有阻挡敌人时才能够回复技力');
    done(h);
  }
});

test('RA-A 森蚺特限证章: only its attributes and its trait ratio apply here — no 生息演算 parts (S2 block stays 1, no 物理脆弱, no attraction)', () => {
  for (const tier of [5, 6]) {
    const { h, u } = field({ tier, elite: true, mod: RAA, skill: 1, row: 9, col: 5 });
    const m = modOf(tier, RAA);
    assert.match(m.traitOverride.moduleDesc, /生息演算/);
    u.skill.gainSp(999, 'init');
    const far = h.spawn('enemy_dummy', { pos: [12, 9] });
    const e = blockOne(h, u);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    assert.equal(u.s.blockCnt, 1, `T${tier}: no 技能期间阻挡数+2`);
    approx(e.s.physTakenMul, 1, `T${tier}: no 物理脆弱`);
    approx(far.x, 9, `T${tier}: nobody pulled`);
    done(h);
  }
});
