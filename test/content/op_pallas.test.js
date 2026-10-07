// test/content/op_pallas.test.js — the 自选 operator kit of 帕拉斯 (char_485_pallas, 6★ 教官; kit
// server/sim/content/kits/ops/op-pallas.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, INS-X
// “故乡的山岩” or INS-Y “赫里亚之辉” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the
// form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_pallas.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { PEAK_KEY, holderKey } from '../../server/sim/content/kits/ops/op-pallas.js';
import { diyPool, validateDiyPicks, diyRecord } from '../../shared/diy.js';
import { positionClass } from '../../server/match/board.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const PALLAS = 'char_485_pallas';
const FORMS = BACKUPS.units[PALLAS].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const INSX = 'uniequip_002_pallas', INSY = 'uniequip_003_pallas';
const S1 = 'skchr_pallas_1', S2 = 'skchr_pallas_2', S3 = 'skchr_pallas_3';
/** The unit form of a slot (tier, normal / elite). */
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** A talent of the composed record the unit fights with (module changes applied). */
const talentOf = (u, i) => u.def.raw.talents.find((t) => t.index === i)?.bb ?? {};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }) };
/** A 米诺斯 operator of no kit (帕拉斯 is the only one of the data): a plain melee record with nationId minos. */
const MINOS_OP = { ...chessRec({ id: 'test_minos_a', name: '米诺斯测试', stats: { maxHp: 2000, atk: 500, def: 200, blockCnt: 1 }, skill: null }), nationId: 'minos' };
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, INSX, INSY].map((m) => [t, true, m]))];

/** A battle with 帕拉斯 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5, rows = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: { test_minos_a: MINOS_OP } }, timeLimit: 600, autoFinish: false, seed,
    ...(rows ? { stageId: undefined, flat: { rows } } : {}),
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: PALLAS, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
/** The instructor scale of a form (trait bb atk_scale; INS-X's override). */
const traitScale = (tier, elite, mod) => (elite && mod ? modOf(tier, mod).traitOverride.bb.atk_scale : formOf(tier, elite).trait.bb.atk_scale);

test('帕拉斯 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 2-2, blocks 2, melee ground-only, 教官 ×1.2 (INS-X ×1.3), 米诺斯, no 特质', () => {
  assert.equal(OPERATOR_KITS[PALLAS], KITS[PALLAS]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [PALLAS, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), form.stats.aspd + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.sub, u.base.bat, u.dmgType], [2, 'melee', false, 'instructor', 1.05, 'phys'], `${label(f)}: 教官`);
      approx(u.profile.unblockedScale, traitScale(tier, elite, mod), `${label(f)}: 教官 scale`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 2-2`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.raw.nationId], [['emptyShip'], [], 'minos'], `${label(f)}: bonds / 特质 / nation`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN, full potential: ATK +25): E2 Lv1 1413 / 602 / 382, E2 Lv60 1778 / 675 / 430; INS-X +150 HP
  // +55 ATK → +210 / +83, trait 130 %; INS-Y +40 ATK +3 ASPD → +60 / +5
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/1/4/0'].stats.def, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1413, 602, 382, 1778, 675]);
  assert.deepEqual([modOf(5, INSX).attr, modOf(6, INSX).attr, modOf(5, INSY).attr, modOf(6, INSY).attr], [{ maxHp: 150, atk: 55 }, { maxHp: 210, atk: 83 }, { atk: 40, aspd: 3 }, { atk: 60, aspd: 5 }]);
  assert.deepEqual([formOf(5, false).trait.bb.atk_scale, modOf(5, INSX).traitOverride.bb.atk_scale, modOf(6, INSY).traitOverride.bb.atk_scale], [1.2, 1.3, 1.2]);
});

test('a 自选 pick: 帕拉斯 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(PALLAS));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(PALLAS), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: PALLAS, skillIndex: 2, uniEquipId: INSY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: PALLAS, skillIndex: 2, uniEquipId: INSY } } });
});

test('trait 教官: her attack ×1.2 (INS-X ×1.3) on an enemy she does not block, ×1 on the one she blocks; flyers are out of her reach', () => {
  for (const f of [[5, false, null], [5, true, INSX], [6, true, INSX], [6, true, INSY]]) {
    const [tier, elite, mod] = f;
    const scale = traitScale(tier, elite, mod);
    const noSp = (h, u) => h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });   // (阻回: S3 stays off)
    {
      const { h, u } = field({ tier, elite, mod, skill: 2 });
      noSp(h, u);
      const e = h.spawn('enemy_dummy', { pos: [10, 7] });
      const fly = h.spawn('enemy_fly', { pos: [10, 6] });
      h.run(6);
      const hits = atkHits(h, u);
      assert.ok(hits.length >= 3, `${label(f)}: she attacks (${hits.length})`);
      for (const c of hits) {
        assert.equal(c.target, e, `${label(f)}: only the ground dummy`);
        approx(c.amount, u.s.atk * scale, `${label(f)}: unblocked ×${scale}`);
        assert.equal(c.type, 'phys');
      }
      assert.ok(!h.hooksOf('damaged').some((c) => c.target === fly), `${label(f)}: no anti-air`);
      done(h);
    }
    {
      const { h, u } = field({ tier, elite, mod, skill: 2, row: 9 });
      noSp(h, u);
      const w = h.spawn('enemy_walk', { routeIndex: 0 });
      assert.ok(h.runUntil(() => w.blockedBy === u, 30), `${label(f)}: the walker reaches her`);
      const t0 = h.b.time;
      h.run(6);
      const hits = atkHits(h, u).filter((c) => c.t > t0);
      assert.ok(hits.length >= 3, `${label(f)}: she attacks the enemy she blocks`);
      for (const c of hits) approx(c.amount, u.s.atk, `${label(f)}: blocked ×1`);
      done(h);
    }
  }
});

test('T1 英雄的诞生: while she is deployed, every 米诺斯 operator (her too) ATK +25 % above 80 % HP (INS-X stage 3: above 50 %, +30 %) — one 精力充沛, not for others, gone when she leaves', () => {
  const others = [{ uid: 2, chessId: 'test_minos_a', row: 11, col: 3 }, { uid: 3, chessId: 'chess_char_1_02_a', row: 12, col: 7 }];
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    h.step();
    const minos = h.unit(2), yak = h.unit(3);
    const t = talentOf(u, 0);
    const x3 = elite && mod === INSX && tier === 6;
    assert.deepEqual([t['peak_performance.hp_ratio'], t['peak_performance.atk']], x3 ? [0.5, 0.3] : [0.8, 0.25], `${label(f)}: the talent of the form`);
    const v = t['peak_performance.atk'], thr = t['peak_performance.hp_ratio'];
    for (const a of [u, minos]) {
      assert.deepEqual(a.findBuff(PEAK_KEY)?.mods, { atkPct: v }, `${label(f)}: ${a.name}`);
      approx(a.s.atk, a.base.atk * (1 + v), `${label(f)}: ${a.name} ATK`);
    }
    assert.equal(yak.findBuff(PEAK_KEY), null, `${label(f)}: 角峰 (谢拉格) gets nothing`);
    // the HP condition, re-read every tick: strictly above hp_ratio
    minos.hp = minos.s.maxHp * thr;
    h.step();
    assert.equal(minos.findBuff(PEAK_KEY), null, `${label(f)}: at ${thr * 100} % HP`);
    minos.hp = minos.s.maxHp * 0.6;
    h.step();
    assert.equal(!!minos.findBuff(PEAK_KEY), x3, `${label(f)}: at 60 % HP`);
    minos.hp = minos.s.maxHp;
    h.step();
    assert.ok(minos.findBuff(PEAK_KEY), `${label(f)}: back above`);
    h.b.retreat(u);
    h.step();
    assert.equal(minos.findBuff(PEAK_KEY), null, `${label(f)}: gone once she leaves the field`);
    done(h);
  }
});

test('T2 女神的振奋: every damage instance she deals heals her and the ally on the tile in front 45 HP (INS-Y stage 3: 65, and every 米诺斯 operator — her too — 40 more), through 禁疗, not a 不成为治疗目标 ally, not the one behind', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const others = [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 6 }, { uid: 3, chessId: 'test_minos_a', row: 10, col: 4 }];
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    const front = h.unit(2), behind = h.unit(3);
    const t = talentOf(u, 1);
    const y3 = elite && mod === INSY && tier === 6;
    assert.deepEqual([t.value, t['pallas_e_t_2.value']], y3 ? [65, 40] : [45, undefined], `${label(f)}: the talent of the form`);
    for (const a of [u, front, behind]) a.hp = a.s.maxHp * 0.5;
    h.b.addBuff(front, { key: 'test:healFree', flags: { healFree: true } });   // 禁疗: the heal ignores it
    h.spawn('enemy_dummy', { pos: [10, 7] });
    h.run(5);
    const out = h.hooksOf('damaged').filter((c) => c.source === u && c.target.side === 'enemy');
    assert.ok(out.length >= 3, `${label(f)}: ${out.length} damage instances`);
    const heals = (a, amount) => h.hooksOf('heal').filter((c) => c.source === u && c.target === a && Math.abs(c.amount - amount) < 1e-6).length;
    assert.equal(heals(u, t.value), out.length, `${label(f)}: herself ${t.value} per instance`);
    assert.equal(heals(front, t.value), out.length, `${label(f)}: the ally in front (禁疗 too)`);
    assert.equal(heals(behind, t.value), 0, `${label(f)}: not the ally behind`);
    const extra = (a) => h.hooksOf('heal').filter((c) => c.source === u && c.target === a && c.opts?.tags?.includes('module')).length;
    assert.deepEqual([extra(u), extra(behind), extra(front)], y3 ? [out.length, out.length, 0] : [0, 0, 0], `${label(f)}: the 米诺斯 extra (INS-Y stage 3): her and the 米诺斯 operator behind`);
    if (y3) assert.ok(h.hooksOf('heal').filter((c) => c.opts?.tags?.includes('module')).every((c) => Math.abs(c.amount - 40) < 1e-6), `${label(f)}: 40 each`);
    assert.ok(front.hp > front.s.maxHp * 0.5, `${label(f)}: the front ally gained HP`);
    // 不成为其他角色的治疗目标 (noHeal): not healed
    const n = h.hooksOf('heal').length;
    h.b.addBuff(front, { key: 'test:noHeal', flags: { noHeal: true } });
    const hp = front.hp;
    h.run(3);
    assert.equal(front.hp, hp, `${label(f)}: no heal reaches a noHeal ally`);
    assert.ok(h.hooksOf('heal').length > n, `${label(f)}: she still heals herself`);
    done(h);
  }
});

test('S1 胜利的连击 (AUTO, attack SP 3, data DEFAULT): the next attack strikes twice for 125 % / 145 % ATK, each ×the 教官 scale, and heals twice', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, INSX], [5, true, INSY]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.initSp, sk.skillType, sk.bb.atk_scale], ['DEFAULT', 'attack', 3, 0, 'AUTO', elite ? 1.45 : 1.25], `T${tier}`);
    h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.activations === 1 && atkHits(h, u).some((c) => c.dmg.isSkill), 20), `T${tier}: cast on her 4th attack`);
    const sk1 = atkHits(h, u).filter((c) => c.dmg.isSkill);
    const id = sk1[0].dmg.attackId;
    const strikes = sk1.filter((c) => c.dmg.attackId === id);
    assert.equal(strikes.length, 2, `T${tier}: two strikes`);
    for (const c of strikes) approx(c.amount, u.s.atk * sk.bb.atk_scale * traitScale(tier, elite, mod), `T${tier}: ${sk.bb.atk_scale * 100} % × 教官`);
    assert.equal(atkHits(h, u).filter((c) => c.dmg.attackId < id).length, 3, `T${tier}: after 3 plain attacks`);
    assert.equal(h.hooksOf('heal').filter((c) => c.source === u && c.target === u).length, atkHits(h, u).length, `T${tier}: one 女神的振奋 per strike`);
    done(h);
  }
});

test('S2 信念的长鞭 (MANUAL, data ACTIVE_RANGE on her range + 1 forward): 20 / 22 s, range 2-2 + 1 tile forward, ATK +35 / 50 %, each attack 60 / 70 % to stun 0.2 s; all back after', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, INSY]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, mod, skill: 1, seed: 9 });
    // 「攻击范围向前延伸一格」 is an attack-range change (tools/build-data.mjs ATTACK_RANGE_CHANGE): the owner's ACTIVE_RANGE rule
    assert.deepEqual([u.skill.rule, sk.trigger.rawRule, sk.duration, sk.bb.atk, sk.bb.ability_range_forward_extend, sk.bb['attack@buff_prob'], sk.bb['attack@stun']],
      ['ACTIVE_RANGE', 'DEFAULT', elite ? 22 : 20, elite ? 0.5 : 0.35, 1, elite ? 0.7 : 0.6, 0.2], `T${tier}`);
    const far = h.spawn('enemy_dummy', { pos: [10, 8] });   // 3 tiles ahead: only in the extended range
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast for an enemy only in the extended range (ACTIVE_RANGE)`);
    const near = h.spawn('enemy_dummy', { pos: [10, 7] });
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.01);
    assert.deepEqual(u.liveRangeGrid, [[0, 0], [0, 1], [0, 2], [0, 3]], `T${tier}: one tile more forward`);
    const v = talentOf(u, 0)['peak_performance.atk'];
    approx(u.s.atk, u.base.atk * (1 + v + sk.bb.atk), `T${tier}: ATK +${sk.bb.atk * 100} %`);
    h.b.kill(near, null);
    const n0 = atkHits(h, u).length;
    u.skill.extend(300);
    h.run(150);
    const hits = atkHits(h, u).slice(n0);
    assert.ok(hits.length > 100 && hits.every((c) => c.target === far), `T${tier}: the far dummy is hit (${hits.length})`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun' && c.target === far);
    const r = stuns.length / hits.length;
    assert.ok(Math.abs(r - sk.bb['attack@buff_prob']) < 0.08, `T${tier}: ${stuns.length} / ${hits.length} stuns ≈ ${sk.bb['attack@buff_prob']}`);
    for (const c of stuns) approx(c.duration, 0.2, `T${tier}: stun 0.2 s`);
    h.runUntil(() => !u.skill.active, 200);
    h.step();
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 2-2`);
    approx(u.s.atk, u.base.atk * (1 + v), `T${tier}: ATK back`);
    done(h);
  }
});

test('S3 英勇的祝福 (MANUAL, data DEFAULT): 30 s, ATK +55 / 70 %, three targets; the operator on the low-ground tile in front holds 精力充沛 +35 / 40 % (> 80 % HP), DEF +20 / 25 %, block +1 — else she does, and it moves on deploy / retreat', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, INSX], [6, true, INSY]]) {
    const sk = skillOf(tier, elite, S3);
    const b = sk.bb;
    assert.deepEqual([sk.duration, b.atk, b['attack@max_target'], b['attack@peak_performance.atk'], b['attack@peak_performance.hp_ratio'], b['attack@def'], b['attack@block_cnt']],
      [30, elite ? 0.7 : 0.55, 3, elite ? 0.4 : 0.35, 0.8, elite ? 0.25 : 0.2, 1], `T${tier}`);
    const v1 = (u) => talentOf(u, 0)['peak_performance.atk'];
    // (a) 角峰 (an operator on a road tile) in front: it holds
    {
      const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 6 }] });
      const yak = h.unit(2);
      assert.equal(u.skill.rule, 'DEFAULT', `T${tier}: data DEFAULT`);
      for (const pos of [[10, 5], [10, 6], [10, 7]]) h.spawn('enemy_dummy', { pos });   // three enemies on her 2-2
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
      h.step();
      approx(u.skill.timeLeft, 30, `T${tier}: 30 s`, 0.1);
      assert.deepEqual(yak.findBuff(holderKey(u))?.mods, { defPct: b['attack@def'], blockCnt: 1 }, `T${tier}: 角峰 holds`);
      assert.equal(yak.s.blockCnt, yak.base.blockCnt + 1, `T${tier}: 角峰 block +1`);
      approx(yak.s.def, yak.base.def * (1 + b['attack@def']), `T${tier}: 角峰 DEF`);
      assert.deepEqual(yak.findBuff(PEAK_KEY)?.mods, { atkPct: b['attack@peak_performance.atk'] }, `T${tier}: 角峰 精力充沛`);
      assert.equal(u.findBuff(holderKey(u)), null, `T${tier}: not her`);
      assert.equal(u.s.blockCnt, 2);
      approx(u.s.atk, u.base.atk * (1 + v1(u) + b.atk), `T${tier}: her ATK +${b.atk * 100} % (+ her own T1)`);
      yak.hp = yak.s.maxHp * 0.8;
      h.step();
      assert.equal(yak.findBuff(PEAK_KEY), null, `T${tier}: 角峰 at 80 % HP: no 精力充沛`);
      // three targets per attack
      const t0 = h.b.time;
      h.run(4);
      const per = new Map();
      for (const c of atkHits(h, u).filter((x) => x.t > t0)) per.set(c.dmg.attackId, (per.get(c.dmg.attackId) ?? new Set()).add(c.target));
      assert.ok(per.size >= 2 && [...per.values()].every((s) => s.size === 3), `T${tier}: three targets per attack`);
      // 角峰 leaves ⇒ she holds at once (同类取最高: her 精力充沛 is the higher of T1 and S3); a new operator in front takes it back
      h.b.retreat(yak);
      h.step();
      assert.deepEqual(u.findBuff(holderKey(u))?.mods, { defPct: b['attack@def'], blockCnt: 1 }, `T${tier}: passed to her`);
      assert.equal(u.s.blockCnt, 3, `T${tier}: her block +1`);
      assert.deepEqual(u.findBuff(PEAK_KEY)?.mods, { atkPct: Math.max(v1(u), b['attack@peak_performance.atk']) }, `T${tier}: one 精力充沛, the highest`);
      approx(u.s.atk, u.base.atk * (1 + b.atk + Math.max(v1(u), b['attack@peak_performance.atk'])), `T${tier}: her ATK`);
      h.b.redeploy(yak, { free: true });
      h.step();
      assert.ok(yak.findBuff(holderKey(u)) && !u.findBuff(holderKey(u)), `T${tier}: back to the redeployed 角峰`);
      h.runUntil(() => !u.skill.active, 40);
      h.step();
      assert.ok(!yak.findBuff(holderKey(u)) && !u.findBuff(holderKey(u)) && yak.s.blockCnt === yak.base.blockCnt, `T${tier}: gone at the end`);
      assert.deepEqual(u.findBuff(PEAK_KEY)?.mods, { atkPct: v1(u) }, `T${tier}: her T1 only`);
      done(h);
    }
    // (b) the tile in front is high ground (a ranged operator on it): she holds (the empty tile: (a) after the retreat)
    {
      const rows = { 10: '##hrrrhrrrfrrrrrrrf##' };   // (10,6) = 高台 'h'
      const { h, u } = field({ tier, elite, mod, skill: 2, rows, others: [{ uid: 2, chessId: 'chess_char_1_01_a', row: 10, col: 6 }] });
      const sniper = h.unit(2);
      assert.equal(h.b.grid.isLow(10, 6), false);
      h.spawn('enemy_dummy', { pos: [10, 7] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 3));
      h.step();
      assert.ok(u.findBuff(holderKey(u)) && !sniper.findBuff(holderKey(u)), `T${tier}: an operator on a 高台 in front does not hold it`);
      done(h);
    }
  }
});

test('INS-Y 「可以额外部署在远程位」: the data carries it (hidden buildable_type 2); a placement rule of the prep, not of the battle — a 帕拉斯 piece stays on melee tiles (owner\'s decision of 2026-10-04, shared/highGround.js)', () => {
  for (const tier of [5, 6]) {
    const m = modOf(tier, INSY);
    assert.equal(m.traitOverride.moduleDesc, '可以额外部署在远程位');
    assert.deepEqual(m.talentChanges.find((t) => t.talentIndex === -1)?.bb, { buildable_type: 2 });
    const rec = diyRecord(SLOT[tier], { charId: PALLAS, skillIndex: 0, uniEquipId: INSY }, { elite: true, data: { chess: CHESS, backups: BACKUPS } });
    assert.equal(positionClass(rec, INSY), 'melee', `T${tier}: placement unchanged`);
    const { h, u } = field({ tier, elite: true, mod: INSY, skill: 2 });
    assert.equal(u.def.position, 'MELEE');
    done(h);
  }
});
