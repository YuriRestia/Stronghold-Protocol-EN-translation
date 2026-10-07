// test/content/op_shwaz.test.js — the 自选 operator kit of 黑 (char_340_shwaz, 6★ 重射手; kit
// server/sim/content/kits/ops/op-shwaz.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, ARC-X
// “定制弩配件套装” or ARC-Y “老剃刀” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the
// form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_shwaz.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const SHWAZ = 'char_340_shwaz';
const FORMS = BACKUPS.units[SHWAZ].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_shwaz', Y = 'uniequip_003_shwaz';
const S1 = 'skchr_shwaz_1', S2 = 'skchr_shwaz_2', S3 = 'skchr_shwaz_3';
const PROVE = 'chess_char_1_07_a', YAK = 'chess_char_1_02_a';
/** The unit form of a slot (tier, normal / elite). */
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, X, Y].map((m) => [t, true, m]))];
/** 破甲箭头 of a form: the base talent, upgraded by ARC-Y's NAMED change only (stage 3: 170 % / −25 %). */
const pierce = (tier, elite, mod) => ({ ...formOf(tier, elite).talents[0].bb, ...(modOf(tier, mod)?.talentChanges ?? []).filter((t) => t.talentIndex === 0 && t.name).reduce((o, t) => ({ ...o, ...t.bb }), {}) });

/** A battle with 黑 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5, players = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'dodge'], captureNoisy: true,
    ...(players ? { players } : { units: [{ uid: 1, diy: { slot: SLOT[tier], charId: SHWAZ, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others] }),
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

test('黑 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 3-6, ranged physical, hits air, blocks 1, ground-targetable, data triggers', () => {
  assert.equal(OPERATOR_KITS[SHWAZ], KITS[SHWAZ]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [SHWAZ, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      // ARC-X “定制弩配件套装”: "再部署时间减少" — the attribute respawn_time −25 (66 → 41 s at full potential)
      assert.equal(u.base.respawnTime, form.stats.respawnTime + (m?.attr.respawnTime ?? 0), `${label(f)}: redeploy time`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [1, 'ranged', true, 'phys', 1.6], `${label(f)}: 重射手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-6`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
      done(h);
    }
  }
  // the data: all three DEFAULT (S3's 「攻击范围改为」 is an attack-range change, not a 技能范围 — tools/build-data.mjs
  // ATTACK_RANGE_CHANGE); E2 Lv1 1393 / 676 / 164, Lv60 1685 / 805 / 204
  assert.deepEqual(formOf(6, true).skills.map((s) => s.trigger.rule), ['DEFAULT', 'DEFAULT', 'DEFAULT']);
  assert.deepEqual([FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.atk], [676, 805]);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr, modOf(5, Y).attr, modOf(6, Y).attr],
    [{ maxHp: 130, atk: 55, respawnTime: -25 }, { maxHp: 170, atk: 75, respawnTime: -25 }, { atk: 80, def: 10 }, { atk: 120, def: 16 }]);
});

test('a 自选 pick: 黑 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(SHWAZ));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(SHWAZ), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: SHWAZ, skillIndex: 2, uniEquipId: Y } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: SHWAZ, skillIndex: 2, uniEquipId: Y } } });
});

test('S1 强弩 (AUTO, attack SP 4, data DEFAULT): every 5th attack ×175 % / 190 % ATK, 破甲箭头 then at 60 % / 70 % (20 % otherwise); air units are hit', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1), t0 = pierce(tier, elite, null);
    const { h, u } = field({ tier, elite, skill: 0, seed: 21 });
    assert.deepEqual([u.skill.kind, u.skill.rule, u.skill.spCost, u.skill.spType, sk.bb.atk_scale, sk.bb['talent@prob']],
      ['instant', 'DEFAULT', 4, 'attack', elite ? 1.9 : 1.75, elite ? 0.7 : 0.6], `T${tier}`);
    h.spawn('enemy_fly', { pos: [10, 6] }); // a flyer in front: she hits air units
    h.run(800);
    const hits = atkHits(h, u);
    const sk1 = hits.filter((c) => c.dmg.isSkill), plain = hits.filter((c) => !c.dmg.isSkill);
    assert.ok(Math.abs(sk1.length * 5 - hits.length) <= 5, `T${tier}: one S1 attack in 5 (${sk1.length} / ${hits.length})`);
    const base = u.s.atk;
    for (const c of sk1) assert.ok([base * sk.bb.atk_scale, base * sk.bb.atk_scale * t0.atk_scale].some((v) => Math.abs(c.amount - v) < 1e-6), `T${tier}: S1 hit ${c.amount}`);
    for (const c of plain) assert.ok([base, base * t0.atk_scale].some((v) => Math.abs(c.amount - v) < 1e-6), `T${tier}: plain hit ${c.amount}`);
    const rate = (list, scale) => list.filter((c) => c.amount > base * scale + 1e-6).length / list.length;
    const r1 = rate(sk1, sk.bb.atk_scale), r0 = rate(plain, 1);
    assert.ok(Math.abs(r1 - sk.bb['talent@prob']) < 0.12, `T${tier}: 破甲箭头 on S1 ${r1}`);
    assert.ok(Math.abs(r0 - t0.prob) < 0.07, `T${tier}: 破甲箭头 otherwise ${r0}`);
    assert.ok(hits.every((c) => c.type === 'phys' && c.target.motion === 'FLY'), `T${tier}: physical, on the flyer`);
    done(h);
  }
});

test('S2 暮眼锐瞳 (MANUAL, data DEFAULT): ATK +85 % / +100 % for 33 / 36 s, 破甲箭头 at 40 % / 45 % meanwhile; no cast without an enemy', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2), t0 = pierce(tier, elite, null);
    const { h, u } = field({ tier, elite, skill: 1, seed: 8 });
    assert.deepEqual([u.skill.kind, u.skill.rule, sk.duration, sk.bb.atk, sk.bb['talent@prob']], ['duration', 'DEFAULT', elite ? 36 : 33, elite ? 1 : 0.85, elite ? 0.45 : 0.4], `T${tier}`);
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in range`);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.01);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK +${sk.bb.atk * 100} %`);
    const n0 = atkHits(h, u).length;
    u.skill.extend(600);
    h.runUntil(() => !u.skill.active, 700);
    const during = atkHits(h, u).slice(n0);
    const atk = u.base.atk * (1 + sk.bb.atk);
    assert.ok(during.length > 300 && during.every((c) => c.dmg.isSkill), `T${tier}: ${during.length} attacks, marked`);
    const r = during.filter((c) => c.amount > atk + 1e-6).length / during.length;
    assert.ok(Math.abs(r - sk.bb['talent@prob']) < 0.07, `T${tier}: 破甲箭头 ${r}`);
    for (const c of during.slice(0, 20)) assert.ok([atk, atk * t0.atk_scale].some((v) => Math.abs(c.amount - v) < 1e-6), `T${tier}: ${c.amount}`);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    done(h);
  }
});

test('S3 战术的终结: range 3-2 while it runs (and back), interval 1.6 + 0.4 s, ATK +120 % / +140 %, 破甲箭头 on every attack; the basic strategy (DEFAULT): an enemy she is about to attack casts it, then only the 3-2 line is attacked', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3), t0 = pierce(tier, elite, null);
    assert.deepEqual(sk.rangeGrid, [[0, 0], [0, 1], [0, 2], [0, 3]]);
    const { h, u } = field({ tier, elite, skill: 2, seed: 4 });
    assert.deepEqual([u.skill.kind, u.skill.rule, sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.bb['talent@prob']],
      ['duration', 'DEFAULT', elite ? 21 : 18, elite ? 1.4 : 1.2, 0.4, 1], `T${tier}`);
    u.skill.gainSp(999);
    const side = h.spawn('enemy_dummy', { pos: [11, 6] }); // in 3-6, not in 3-2
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast as she is about to attack the 3-6 enemy (DEFAULT)`);
    const far = h.spawn('enemy_dummy', { pos: [10, 8] }); // 3 tiles ahead: 3-2, outside 3-6
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: range 3-2 while it runs`);
    approx(u.s.interval, 2.0, `T${tier}: interval +0.4 s`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    const n0 = atkHits(h, u).length;
    h.runUntil(() => !u.skill.active, 30);
    const during = atkHits(h, u).slice(n0);
    assert.ok(during.length >= 8 && during.every((c) => c.target === far), `T${tier}: only the 3-2 enemy, not the side one (${during.length})`);
    for (const c of during) approx(c.amount, u.base.atk * (1 + sk.bb.atk) * t0.atk_scale, `T${tier}: every attack procs`);
    const cuts = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'defDown' && c.target === far);
    assert.ok(cuts.length >= during.length - 1, `T${tier}: DEF cut each time`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 3-6`);
    approx(u.s.interval, 1.6, `T${tier}: interval back`);
    done(h);
  }
});

test('T1 破甲箭头: a proc ×160 % (ARC-Y stage 3: 170 %) and, once it hit, DEF ×0.8 (×0.75) for 5 s (defDown); ARC-Y stage 1 keeps 160 % (its hidden trait part is not 破甲箭头); a dodged attack cuts nothing', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t0 = pierce(tier, elite, mod);
    assert.deepEqual([t0.atk_scale, t0.def, t0.prob, t0.defdown_duration], tier === 6 && mod === Y ? [1.7, -0.25, 0.2, 5] : [1.6, -0.2, 0.2, 5], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 2, seed: 13 });
    const e = h.spawn('enemy_dummy', { pos: [11, 6] }); // off her front line: no ARC-Y bonus
    h.run(120);
    const hits = atkHits(h, u).filter((c) => c.target === e);
    const procs = hits.filter((c) => c.amount > u.s.atk + 1e-6);
    assert.ok(procs.length > 5 && procs.length < hits.length * 0.4, `${label(f)}: ${procs.length} / ${hits.length}`);
    for (const c of procs) approx(c.amount, u.s.atk * t0.atk_scale, `${label(f)}: ×${t0.atk_scale}`);
    const cuts = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'defDown');
    assert.equal(cuts.length, procs.length, `${label(f)}: one DEF cut per proc`);
    for (const c of cuts) assert.deepEqual([c.value, c.duration], [-t0.def, t0.defdown_duration], label(f));
    // a dodged attack: no hit, no cut
    const d = h.spawn('enemy_dummy', { pos: [9, 6] });
    h.b.addBuff(d, { key: 'test:dodge', mods: { dodgePhys: 1 } });
    h.b.kill(e, null);
    const c0 = cuts.length;
    h.run(60);
    assert.ok(h.hooksOf('dodge').filter((c) => c.source === u).length > 20, `${label(f)}: dodged`);
    assert.equal(h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'defDown').length, c0, `${label(f)}: nothing cut`);
    done(h);
  }
});

test('T2 交叉火力: with another 【狙击】 operator on the field every sniper (her too, a partner\'s too) ATK +10 % — not 角峰, not alone, not once she leaves; ARC-X stage 3 "携带": +15 % on her player\'s snipers for the whole battle', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const squad = tier === 6 && mod === X;
    const v = squad ? 0.15 : 0.1;
    const t1 = { ...formOf(tier, elite).talents[1].bb, ...(modOf(tier, mod)?.talentChanges ?? []).filter((t) => t.talentIndex === 1).reduce((o, t) => ({ ...o, ...t.bb }), {}) };
    assert.equal(t1.atk, v, label(f));
    // alone: nothing
    const solo = field({ tier, elite, mod, skill: 0 });
    solo.h.run(1);
    assert.equal(solo.u.findBuff('talent:shwaz:crossfire'), null, `${label(f)}: alone`);
    done(solo.h);
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [{ uid: 2, chessId: PROVE, row: 12, col: 3 }, { uid: 3, chessId: YAK, row: 9, col: 3 }] });
    h.run(1);
    const prove = h.unit(2), yak = h.unit(3);
    for (const a of [u, prove]) assert.deepEqual(a.findBuff('talent:shwaz:crossfire')?.mods, { atkPct: v }, `${label(f)}: ${a.def.name}`);
    assert.equal(yak.findBuff('talent:shwaz:crossfire'), null, `${label(f)}: 角峰 (重装)`);
    approx(u.s.atk, u.base.atk * (1 + v), `${label(f)}: her ATK`);
    h.b.retreat(prove);
    h.run(1);
    assert.equal(!!u.findBuff('talent:shwaz:crossfire'), squad, `${label(f)}: 普罗旺斯 off the field (携带: still in the squad)`);
    h.b.redeploy(prove);
    h.run(1);
    h.b.retreat(u);
    h.run(1);
    assert.equal(!!prove.findBuff('talent:shwaz:crossfire'), squad, `${label(f)}: 黑 off the field`);
    done(h);
  }
  // a partner's sniper on a shared field: the field version counts it and buffs it; the squad version does not
  const pair = (mod, tier) => field({ players: [
    { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: tier === 6 ? 'chess_char_6_diy1_b' : 'chess_char_5_diy1_b', diy: { charId: SHWAZ, skillIndex: 0, uniEquipId: mod }, row: 10, col: 5 }], bonds: {}, bandId: null, playerEffects: [] },
    { playerId: 'p2', seat: 1, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: PROVE, row: 12, col: 3 }], bonds: {}, bandId: null, playerEffects: [] },
  ] });
  for (const [mod, tier, want] of [[null, 6, 0.1], [X, 6, null]]) {
    const { h } = pair(mod, tier);
    h.run(1);
    const mine = h.b.allyUnits.find((a) => a.ownerId === 'p1'), theirs = h.b.allyUnits.find((a) => a.ownerId === 'p2');
    assert.equal(mine.findBuff('talent:shwaz:crossfire')?.mods.atkPct ?? null, want, `${mod ?? 'none'}: 黑`);
    assert.equal(theirs.findBuff('talent:shwaz:crossfire')?.mods.atkPct ?? null, want, `${mod ?? 'none'}: the partner's 普罗旺斯`);
    done(h);
  }
});

test('ARC-Y 老剃刀 trait: an enemy on her straight line ahead takes ×105 % and cannot dodge (stages 1 and 3); off the line it dodges; ARC-X / no module change nothing; facing UP turns the line', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const y = elite && mod === Y;
    if (y) assert.deepEqual(formOf(tier, true).modules.find((m) => m.uniEquipId === Y).traitOverride.bb, { atk_scale: 1.05 }, label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, seed: 3 });
    u.skill.sp = 0; u.skill.charges = 0;
    const front = h.spawn('enemy_dummy', { pos: [10, 7] });
    const side = h.spawn('enemy_dummy', { pos: [11, 7] });
    for (const e of [front, side]) h.b.addBuff(e, { key: 'test:dodge', mods: { dodgePhys: 1 } });
    h.run(40);
    const onFront = atkHits(h, u).filter((c) => c.target === front);
    const dodged = h.hooksOf('dodge').filter((c) => c.source === u);
    if (y) {
      assert.ok(onFront.length > 10, `${label(f)}: the front enemy is hit (${onFront.length})`);
      for (const c of onFront.filter((x) => !x.dmg.isSkill)) assert.ok([u.s.atk * 1.05, u.s.atk * 1.05 * pierce(tier, elite, mod).atk_scale].some((v) => Math.abs(c.amount - v) < 1e-6), `${label(f)}: ×1.05 (${c.amount})`);
      h.b.kill(front, null);
      h.run(10);
      assert.ok(h.hooksOf('dodge').filter((c) => c.source === u && c.target === side).length > 3, `${label(f)}: off the line it dodges`);
    } else {
      assert.equal(onFront.length, 0, `${label(f)}: no bonus — every attack dodged`);
      assert.ok(dodged.length > 10, label(f));
    }
    done(h);
  }
  // facing UP: the line is the column above her
  const h = makeBattle({ defs: { enemies: ENEMIES }, timeLimit: 60, autoFinish: false, seed: 2, flags: { dpPerSec: 0 }, hooks: ['damaged'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 6, charId: SHWAZ, skillIndex: 0, uniEquipId: Y }, elite: true, row: 10, col: 5, dir: 'UP' }] });
  h.step();
  const u = h.unit(1);
  const e = h.spawn('enemy_dummy', { pos: [12, 5] });
  h.run(20);
  const plain = h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && !c.dmg.isSkill);
  assert.ok(plain.length > 5);
  for (const c of plain) assert.ok([1.05, 1.05 * pierce(6, true, Y).atk_scale].some((k) => Math.abs(c.amount - u.base.atk * k) < 1e-6), `UP: two tiles above her is her line (${c.amount})`);
  done(h);
});
