// test/content/op_chen.test.js — the 自选 operator kit of 陈 (char_010_chen, 6★ 剑豪; kit
// server/sim/content/kits/ops/op-chen.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in every
// form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, SWO-X “罗德岛制式剑”
// or SWO-Y “往昔时光” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of that
// slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_chen.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHEN = 'char_010_chen';
const FORMS = BACKUPS.units[CHEN].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SWOX = 'uniequip_002_chen', SWOY = 'uniequip_003_chen';
const S1 = 'skchr_chen_1', S2 = 'skchr_chen_2', S3 = 'skchr_chen_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_def: dummy('enemy_def', { def: 300 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }), enemy_weak: dummy('enemy_weak', { hp: 1000 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SWOX, SWOY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
/** The SWO-X multiplier of her skill damage in a form. */
const skillMulOf = (elite, mod) => (elite && mod === SWOX ? 1.1 : 1);

/** A battle with 陈 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5, startOpCooldown } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, ...(startOpCooldown != null ? { startOpCooldown } : null) },
    hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: CHEN, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('陈 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 2, two hits per attack, melee ground-only, 炎 (yanShip), no 特质', () => {
  assert.equal(OPERATOR_KITS[CHEN], KITS[CHEN]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [CHEN, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 100 + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.hits, u.profile.dmgType, u.base.bat], [2, 'melee', false, 2, 'phys', 1.3], `${label(f)}: 剑豪`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      assert.deepEqual(u.def.raw.tokens, [], `${label(f)}: no summons`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN, full potential): E2 Lv1 2188 / 492 / 288, E2 Lv60 2647 / 585 / 330; SWO-X +50 ATK +5 ASPD → +80 / +7,
  // SWO-Y +52 / +28 → +85 / +42 ATK / DEF
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2188, 492, 2647, 585]);
  assert.deepEqual([modOf(5, SWOX).attr, modOf(6, SWOX).attr, modOf(5, SWOY).attr, modOf(6, SWOY).attr], [{ atk: 50, aspd: 5 }, { atk: 80, aspd: 7 }, { atk: 52, def: 28 }, { atk: 85, def: 42 }]);
});

test('a 自选 pick: 陈 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(CHEN));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(CHEN), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: CHEN, skillIndex: 2, uniEquipId: SWOX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: CHEN, skillIndex: 2, uniEquipId: SWOX } } });
});

test('剑豪 trait: a normal attack is two physical hits of 100 % ATK on her target (one attack id); she gains 1 attack SP per attack', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SWOY]]) {
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const sp0 = u.skill.sp;
    assert.ok(h.runUntil(() => hitsBy(h, u).length >= 2, 3), 'she attacks');
    const [a, b] = hitsBy(h, u);
    assert.deepEqual([a.target, b.target, a.dmg.attackId === b.dmg.attackId, a.type, a.dmg.isAttack, a.dmg.isSkill], [e, e, true, 'phys', true, false]);
    approx(a.amount, u.s.atk, 'hit 1'); approx(b.amount, u.s.atk, 'hit 2');
    approx(u.skill.sp, sp0 + 1, 'one SP per attack (not per hit)');
    done(h);
  }
});

test('S1 鞘击 (AUTO, attack SP 6 / 5, data DEFAULT): the next attack is ONE strike of 230 % / 260 % ATK physical that stuns its target 1.25 / 1.5 s; then two-hit attacks again', () => {
  for (const [tier, elite, mod] of [[5, false, null], [5, true, SWOX], [6, true, SWOX], [6, true, SWOY]]) {
    const sk = skillOf(tier, elite, S1), mul = skillMulOf(elite, mod), lb = `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.initSp, sk.bb.atk_scale, sk.bb.stun], ['DEFAULT', 'attack', elite ? 5 : 6, 0, elite ? 2.6 : 2.3, elite ? 1.5 : 1.25], lb);
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.activations === 1 && hitsBy(h, u).length > 0, 3), `${lb}: cast on her next attack`);
    h.step();
    const first = hitsBy(h, u);
    assert.equal(first.filter((c) => c.dmg.attackId === first[0].dmg.attackId).length, 1, `${lb}: one strike, not two`);
    assert.deepEqual([first[0].target, first[0].type, first[0].dmg.isSkill], [e, 'phys', true], lb);
    approx(first[0].amount, u.s.atk * sk.bb.atk_scale * mul, `${lb}: ${sk.bb.atk_scale * 100} % ATK${mul > 1 ? ' × 1.1 (SWO-X)' : ''}`);
    const stun = h.hooksOf('statusApplied').find((c) => c.source === u && c.status === 'stun');
    assert.ok(stun && stun.target === e, `${lb}: the target is stunned`);
    approx(stun.duration, sk.bb.stun, `${lb}: stun ${sk.bb.stun} s`);
    const n0 = hitsBy(h, u).length;
    assert.ok(h.runUntil(() => hitsBy(h, u).length >= n0 + 2, 4), `${lb}: next attack`);
    const next = hitsBy(h, u).slice(n0);
    assert.deepEqual([next[0].dmg.isSkill, next[1].dmg.attackId === next[0].dmg.attackId], [false, true], `${lb}: two plain hits again`);
    done(h);
  }
});

test('S2 赤霄·拔刀 (MANUAL, data SKILL_RANGE on 3-12): cast with an enemy in the skill range (no attack needed); up to 5 / 6 enemies there — flyers too — each take 370 % / 410 % ATK arts, then the same physical; nothing outside', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [6, true, SWOX]]) {
    const sk = skillOf(tier, elite, S2), mul = skillMulOf(elite, mod), lb = `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, u.skill.sp, sk.bb.atk_scale, sk.bb.max_target, sk.rangeId],
      ['SKILL_RANGE', 'attack', elite ? 25 : 26, elite ? 14 : 12, elite ? 4.1 : 3.7, elite ? 6 : 5, '3-12'], lb);
    assert.deepEqual(u.skill.triggerGrid, sk.rangeGrid, `${lb}: the trigger grid is the skill range`);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `${lb}: nobody in range`);
    // 3 tiles ahead: inside 3-12, outside her 1-1 — she cannot attack it
    const far = h.spawn('enemy_dummy', { pos: [10, 8] });
    const out1 = h.spawn('enemy_dummy', { pos: [10, 9] }), out2 = h.spawn('enemy_dummy', { pos: [10, 4] });
    const fly = h.spawn('enemy_fly', { pos: [9, 6] });
    const more = [[11, 6], [10, 7], [9, 5]].map((pos) => h.spawn('enemy_dummy', { pos }));
    assert.ok(h.runUntil(() => u.skill.activations === 1, 1), `${lb}: cast`);
    const hit = hitsBy(h, u);
    const victims = [...new Set(hit.map((c) => c.target))];
    assert.equal(victims.length, Math.min(sk.bb.max_target, 5), `${lb}: every enemy of the skill range up to ${sk.bb.max_target}`);
    for (const e of [far, fly, ...more]) {
      const mine = hit.filter((c) => c.target === e);
      assert.deepEqual(mine.map((c) => c.type), ['arts', 'phys'], `${lb}: ${e.tileR},${e.tileC} arts then physical`);
      for (const c of mine) { approx(c.amount, u.s.atk * sk.bb.atk_scale * mul, `${lb}: ${sk.bb.atk_scale * 100} %`); assert.equal(c.dmg.isSkill, true); }
    }
    for (const e of [out1, out2]) assert.ok(!hit.some((c) => c.target === e), `${lb}: ${e.tileR},${e.tileC} outside 3-12`);
    assert.ok(!h.hooksOf('attack').some((c) => c.attacker === u), `${lb}: no attack — nobody stood in her 1-1`);
    done(h);
  }
  // more enemies than max_target: exactly max_target are cut
  const sk = skillOf(5, false, S2);
  const { h, u } = field({ tier: 5, skill: 1 });
  u.skill.gainSp(999);
  for (const pos of [[11, 5], [11, 6], [10, 6], [10, 7], [10, 8], [9, 5], [9, 6]]) h.spawn('enemy_dummy', { pos });
  assert.ok(h.runUntil(() => u.skill.activations === 1, 1));
  assert.equal(new Set(hitsBy(h, u).filter((c) => c.dmg.isSkill).map((c) => c.target)).size, sk.bb.max_target, `${sk.bb.max_target} of 7`);
  done(h);
});

test('S3 赤霄·绝影 (MANUAL, data SKILL_RANGE on x-1): not opened with only a flyer in range; then 10 slashes of 230 % / 260 % ATK on the nearest ground enemy at the skeleton\'s times, the last stunning 2.5 / 3 s; 2.933 s, invulnerable, unable to block, stun immune', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [6, true, SWOX]]) {
    const sk = skillOf(tier, elite, S3), mul = skillMulOf(elite, mod), lb = `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
    const { h, u } = field({ tier, elite, mod, skill: 2, row: 10, col: 5 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, u.skill.sp, sk.bb.atk_scale, sk.bb.times, sk.bb.stun, sk.rangeId],
      ['SKILL_RANGE', 'attack', elite ? 36 : 38, 10, elite ? 2.6 : 2.3, 10, elite ? 3 : 2.5, 'x-1'], lb);
    assert.deepEqual(u.skill.triggerGrid, sk.rangeGrid, `${lb}: the trigger grid is the skill range`);
    u.skill.gainSp(999);
    const fly = h.spawn('enemy_fly', { pos: [10, 6] });
    h.run(1.5);
    assert.equal(u.skill.activations, 0, `${lb}: a flyer alone in x-1 does not open it (不可对空), the skill stays ready`);
    assert.equal(u.skill.charges, 1, lb);
    const near = h.spawn('enemy_dummy', { pos: [9, 6] }); // √2 away
    const farther = h.spawn('enemy_dummy', { pos: [10, 7] }); // 2 away
    assert.ok(h.runUntil(() => u.skill.active, 1), `${lb}: opened with a ground enemy in range`);
    const t0 = u.skill.lastStart;
    assert.deepEqual([!!u.s.flags.invulnerable, !!u.s.flags.noBlock], [true, true], `${lb}: 无敌, 无法阻挡`);
    assert.equal(h.b.applyStatus(u, 'stun', { duration: 2, source: near }), false, `${lb}: 眩晕免疫`);
    assert.equal(h.b.applyStatus(u, 'freeze', { duration: 2, source: near }), false, `${lb}: 冻结免疫`);
    const n0 = hitsBy(h, u).length;
    h.runUntil(() => !u.skill.active, 4);
    const end = h.hooksOf('skillEnd').find((c) => c.unit === u);
    assert.deepEqual([end.reason, Math.round((end.t - t0) * 30)], ['duration', 88], `${lb}: the Skill_3 clip (2.933 s = 88 ticks)`);
    const slashes = hitsBy(h, u).slice(n0);
    assert.equal(slashes.length, 10, `${lb}: 10 slashes`);
    assert.ok(slashes.every((c) => c.target === near && c.type === 'phys' && c.dmg.isSkill), `${lb}: all on the nearest ground enemy`);
    for (const c of slashes) approx(c.amount, u.s.atk * sk.bb.atk_scale * mul, `${lb}: ${sk.bb.atk_scale * 100} %`);
    const at = slashes.map((c) => Math.round((c.t - t0) * 30));
    assert.deepEqual(at, [18, 24, 30, 36, 42, 48, 54, 60, 66, 85], `${lb}: 0.6 … 2.2 s, 2.833 s (ticks)`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun');
    assert.equal(stuns.length, 1, `${lb}: the last slash stuns`);
    assert.deepEqual([stuns[0].target, stuns[0].duration], [near, sk.bb.stun], lb);
    assert.ok(!hitsBy(h, u).some((c) => c.target === fly || c.target === farther), `${lb}: nobody else`);
    assert.deepEqual([!!u.s.flags.invulnerable, !!u.s.flags.noBlock], [false, false], `${lb}: back to normal`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${lb}: her range stays 1-1`);
    done(h);
  }
});

test('S3: no normal attack and no SP while it runs; a slain target is replaced by the next nearest; with no target left in x-1 it ends at once', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2 });
  u.skill.gainSp(999);
  const weak = h.spawn('enemy_weak', { pos: [10, 6] });
  const next = h.spawn('enemy_dummy', { pos: [11, 6] });
  assert.ok(h.runUntil(() => u.skill.active, 1));
  const n0 = hitsBy(h, u).length;
  h.runUntil(() => !u.skill.active, 4);
  const hits = hitsBy(h, u).slice(n0);
  assert.ok(!weak.alive, 'the first target fell');
  assert.ok(hits.length === 10 && hits.every((c) => c.dmg.isSkill), 'ten slashes, no normal attack');
  assert.ok(hits.some((c) => c.target === next) && hits[hits.length - 1].target === next, 'the rest on the next nearest');
  assert.ok(!h.hooksOf('attack').some((c) => c.attacker === u && c.t > u.skill.lastStart && c.t < u.skill.lastStart + 2.9), 'no attack meanwhile');
  done(h);
  // the only target dies at the first slash: the skill ends right there (no 2.9 s)
  const r = field({ tier: 5, skill: 2 });
  r.u.skill.gainSp(999);
  r.h.spawn('enemy_weak', { pos: [10, 6] });
  assert.ok(r.h.runUntil(() => r.u.skill.active, 1));
  const t0 = r.u.skill.lastStart;
  r.h.runUntil(() => !r.u.skill.active, 4);
  const early = r.h.hooksOf('skillEnd').find((c) => c.unit === r.u);
  assert.deepEqual([early.reason, Math.round((early.t - t0) * 30)], ['noTarget', 19], 'ended the tick after the first slash felled it');
  assert.equal(r.u.skill.sp, 0, 'SP spent');
  done(r.h);
  // the 10th slash fells the only target: the slashes are done, so the clip runs out (only "未到10次之前" ends it early)
  const z = field({ tier: 5, skill: 2 });
  const slash = z.u.s.atk * skillOf(5, false, S3).bb.atk_scale;
  const tenth = z.h.spawn('enemy_dummy', { pos: [10, 6] });
  tenth.hp = 9.5 * slash;
  z.u.skill.gainSp(999);
  assert.ok(z.h.runUntil(() => z.u.skill.active, 1));
  const z0 = z.u.skill.lastStart;
  z.h.runUntil(() => !z.u.skill.active, 4);
  assert.ok(!tenth.alive, 'felled by the 10th slash');
  assert.equal(hitsBy(z.h, z.u).length, 10);
  const zEnd = z.h.hooksOf('skillEnd').find((c) => c.unit === z.u);
  assert.deepEqual([zEnd.reason, Math.round((zEnd.t - z0) * 30)], ['duration', 88], 'the clip runs out');
  done(z.h);
  // a walker she blocked walks on while she slashes (无法阻挡)
  const w = field({ tier: 6, elite: true, skill: 2, row: 9, col: 5 });
  w.h.spawn('enemy_walk', { routeIndex: 0 });
  assert.ok(w.h.runUntil(() => w.u.blocking.length > 0, 30), 'blocked');
  const walker = w.u.blocking[0];
  w.u.skill.gainSp(999);
  assert.ok(w.h.runUntil(() => w.u.skill.active, 2));
  w.h.step();
  assert.equal(walker.blockedBy, null, 'released');
  done(w.h);
});

test('T1 呵斥: every 4 s on the field (3 s with SWO-X stage 3) every attack / hurt SP ally gets 1 SP — her too, not time SP; SWO-X stage 3: +1 more for her; nothing once she left', () => {
  const others = [{ uid: 2, chessId: 'chess_char_1_09_a', row: 12, col: 3 }, { uid: 3, chessId: 'chess_char_1_12_a', row: 12, col: 5 }, { uid: 4, chessId: 'chess_char_1_02_a', row: 12, col: 7 }];
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const x3 = elite && mod === SWOX && tier === 6;
    const t0 = formOf(tier, elite).talents[0].bb;
    const iv = x3 ? 3 : 4;
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    if (!x3) assert.deepEqual(u.def.raw.talents.find((t) => t.index === 0).bb, t0, label(f));
    const [snipe, guard, tank] = [h.unit(2), h.unit(3), h.unit(4)];
    assert.deepEqual([snipe.skill.spType, guard.skill.spType, tank.skill.spType], ['attack', 'hurt', 'time']);
    const sp = () => [u.skill.sp, snipe.skill.sp, guard.skill.sp];
    const base = sp();
    h.run(iv - 0.1 - h.b.time);
    assert.deepEqual(sp(), base, `${label(f)}: nothing before ${iv} s`);
    h.run(0.2);
    assert.deepEqual(sp(), [base[0] + (x3 ? 2 : 1), base[1] + 1, base[2] + 1], `${label(f)}: +1 each at ${iv} s${x3 ? ', +2 for her' : ''}`);
    approx(tank.skill.sp, Math.min(tank.skill.spCost, 0 + h.b.time), `${label(f)}: the time-SP 角峰 only recovers with time`, 0.05);
    h.run(iv);
    assert.deepEqual(sp(), [base[0] + (x3 ? 4 : 2), base[1] + 2, base[2] + 2], `${label(f)}: again at ${2 * iv} s`);
    h.b.retreat(u);
    const off = [snipe.skill.sp, guard.skill.sp];
    h.run(3 * iv);
    assert.deepEqual([snipe.skill.sp, guard.skill.sp], off, `${label(f)}: nothing once she left`);
    done(h);
  }
  // SWO-X stage 3 is the module's text: 每3秒…，自身额外回复1点技力
  assert.match(modOf(6, SWOX).talentChanges.find((t) => !t.hidden).desc, /每3秒回复全场友方角色1点攻击\/受击技力，自身额外回复1点技力/);
});

test('T2 持刀格斗术: ATK +6 %, DEF +6 %, 物理闪避 13 %; SWO-Y stage 3: +16 % / +16 % / 21 %', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const y3 = elite && mod === SWOY && tier === 6;
    const [a, d, p] = y3 ? [0.16, 0.16, 0.21] : [0.06, 0.06, 0.13];
    assert.deepEqual(u.findBuff('talent:chen:knife')?.mods, { atkPct: a, defPct: d, dodgePhys: p }, label(f));
    approx(u.s.atk, u.base.atk * (1 + a), `${label(f)}: ATK`);
    approx(u.s.def, u.base.def * (1 + d), `${label(f)}: DEF`);
    approx(u.s.dodgePhys, p, `${label(f)}: 物理闪避`);
    done(h);
  }
});

test('modules: SWO-X skill damage ×1.1 during her skill (PRTS 修正 技能期间), normal attacks unchanged; SWO-Y ignores 70 DEF on every hit (stages 1 and 3); none without', () => {
  for (const f of FORMS_ALL.filter(([, elite]) => elite)) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    h.spawn('enemy_def', { pos: [10, 6] });
    assert.ok(h.runUntil(() => hitsBy(h, u).length >= 2, 3));
    const pen = mod === SWOY ? 70 : 0;
    approx(hitsBy(h, u)[0].amount, u.s.atk - (300 - pen), `${label(f)}: a normal hit vs DEF 300`);
    if (mod === SWOY) assert.deepEqual(u.def.raw.trait.bb, { def_penetrate_fixed: 70 });
    if (mod === SWOX) assert.deepEqual(u.def.raw.trait.bb, { damage_scale: 1.1, value: 0.1 });
    // S2 on the same target
    u.skill.gainSp(999);
    const n0 = hitsBy(h, u).length;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4));
    const cut = hitsBy(h, u).slice(n0).filter((c) => c.dmg.isSkill && c.type === 'phys')[0];
    const sk = skillOf(tier, elite, S2);
    approx(cut.amount, (u.s.atk * sk.bb.atk_scale - (300 - pen)) * skillMulOf(elite, mod), `${label(f)}: S2 physical vs DEF 300`);
    done(h);
  }
});
