// test/content/op_helage.test.js — the 自选 operator kit of 赫拉格 (char_188_helage, 6★ 武者; kit
// server/sim/content/kits/ops/op-helage.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, SBL-X
// “藏锋” or SBL-Y “热的雪” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of
// that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_helage.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const HELAGE = 'char_188_helage';
const FORMS = BACKUPS.units[HELAGE].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SBLX = 'uniequip_002_helage', SBLY = 'uniequip_003_helage';
const S1 = 'skchr_helage_1', S2 = 'skchr_helage_2', S3 = 'skchr_helage_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SBLX, SBLY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 赫拉格 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 },
    hooks: ['damaged', 'skillStart', 'skillEnd', 'heal', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: HELAGE, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
const selfHeals = (h, u) => h.hooksOf('heal').filter((c) => c.source === u && c.target === u && !c.opts?.regen);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('赫拉格 in every 自选 form: his operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 1, melee ground-only, 武者 (no heal from others, 70 HP per hit), no core bond (emptyShip), no 特质', () => {
  assert.equal(OPERATOR_KITS[HELAGE], KITS[HELAGE]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [HELAGE, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.hits, u.profile.noHeal, u.profile.selfHeal, u.base.bat], [1, 'melee', false, 1, true, 70, 1.2], `${label(f)}: 武者`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      assert.deepEqual(u.def.raw.tokens, [], `${label(f)}: no summons`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 2868 / 658 / 283, E2 Lv60 3502 / 744 / 317; SBL-X +230 HP +55 ATK → +350 / +90,
  // SBL-Y +55 ATK +50 DEF → +90 / +60
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2868, 658, 3502, 744]);
  assert.deepEqual([modOf(5, SBLX).attr, modOf(6, SBLX).attr, modOf(5, SBLY).attr, modOf(6, SBLY).attr], [{ maxHp: 230, atk: 55 }, { maxHp: 350, atk: 90 }, { atk: 55, def: 50 }, { atk: 90, def: 60 }]);
});

test('a 自选 pick: 赫拉格 is offered at tiers 5 and 6 (he has a kit) and a roster with him passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(HELAGE));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(HELAGE), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: HELAGE, skillIndex: 2, uniEquipId: SBLY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: HELAGE, skillIndex: 2, uniEquipId: SBLY } } });
});

test('武者 trait: one hit of 100 % ATK per attack heals him 70; another unit\'s heal does not reach him', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_06_a', row: 12, col: 5 }] });
  u.hp = u.s.maxHp * 0.5;
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  assert.ok(h.runUntil(() => hitsBy(h, u).length >= 1, 3));
  h.step();
  const [a] = hitsBy(h, u);
  assert.deepEqual([a.target, a.type, a.dmg.isAttack], [e, 'phys', true]);
  approx(a.amount, u.s.atk, 'one hit');
  assert.deepEqual(selfHeals(h, u).map((c) => c.amount), [70], 'healed 70');
  const hp = u.hp;
  assert.equal(h.b.heal(h.unit(2), u, 500), 0, 'not a heal target of others');
  assert.equal(u.hp, hp);
  done(h);
});

test('S1 新月 (AUTO, attack SP 3, data DEFAULT): the next attack hits twice at 125 % / 145 % ATK — and heals twice (one trait heal per damage instance)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [6, true, SBLY]]) {
    const sk = skillOf(tier, elite, S1), lb = `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.initSp, sk.bb.atk_scale], ['DEFAULT', 'attack', 3, 0, elite ? 1.45 : 1.25], lb);
    u.hp = u.s.maxHp * 0.5;
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.activations === 1 && hitsBy(h, u).length >= 2, 3), `${lb}: cast on his next attack`);
    h.step();
    const [a, b] = hitsBy(h, u);
    assert.deepEqual([a.target, b.target, a.dmg.attackId === b.dmg.attackId, a.dmg.isSkill], [e, e, true, true], lb);
    for (const c of [a, b]) approx(c.amount, u.s.atk * sk.bb.atk_scale, `${lb}: ${sk.bb.atk_scale * 100} %`);
    assert.deepEqual(selfHeals(h, u).map((c) => c.amount), [70, 70], `${lb}: 70 per hit`);
    done(h);
  }
});

test('S2 弦月 (MANUAL, time SP 32 / 29 from 5 / 10, data DEFAULT): 11 / 12 s of ATK +35 % / +50 %, two hits per attack (two heals), 物理闪避 75 %; all back after', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [5, true, SBLX]]) {
    const sk = skillOf(tier, elite, S2), lb = `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.initSp, sk.duration, sk.bb.atk, sk.bb.prob],
      ['DEFAULT', 'time', elite ? 29 : 32, elite ? 10 : 5, elite ? 12 : 11, elite ? 0.5 : 0.35, 0.75], lb);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `${lb}: no enemy, no cast`);
    u.hp = u.s.maxHp * 0.6;
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `${lb}: cast with an enemy in his range`);
    approx(u.skill.timeLeft, sk.duration, `${lb}: ${sk.duration} s`, 0.01);
    approx(u.s.dodgePhys, sk.bb.prob, `${lb}: 物理闪避`);
    const n0 = hitsBy(h, u).length, h0 = selfHeals(h, u).length;
    h.run(4);
    const hits = hitsBy(h, u).slice(n0);
    const ids = [...new Set(hits.map((c) => c.dmg.attackId))];
    assert.ok(ids.length >= 2, `${lb}: attacks`);
    for (const id of ids.slice(0, -1)) assert.equal(hits.filter((c) => c.dmg.attackId === id).length, 2, `${lb}: 二连击`);
    for (const c of hits) approx(c.amount, u.s.atk, `${lb}: ATK +${sk.bb.atk * 100} % per hit`);
    approx(u.s.atk / u.base.atk, 1 + sk.bb.atk, `${lb}: ATK`);
    assert.ok(selfHeals(h, u).length - h0 >= 2 * (ids.length - 1), `${lb}: a heal per hit`);
    h.runUntil(() => !u.skill.active, 20);
    approx(u.s.atk, u.base.atk, `${lb}: ATK back`);
    approx(u.s.dodgePhys, 0, `${lb}: no dodge after`);
    const n1 = hitsBy(h, u).length;
    h.run(3);
    const after = hitsBy(h, u).slice(n1);
    assert.equal(after.length, new Set(after.map((c) => c.dmg.attackId)).size, `${lb}: one hit per attack again`);
    assert.ok(e.alive);
    done(h);
  }
});

test('S3 满月 (MANUAL, time SP 43 / 41 from 15, data ACTIVE_RANGE): cast with an enemy 2 tiles ahead (outside 1-1); 13 / 14 s of ATK +55 % / +70 %, range 1-1 + 1 forward, up to 3 targets; back after', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [6, true, SBLX]]) {
    const sk = skillOf(tier, elite, S3), lb = `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.initSp, sk.duration, sk.bb.atk, sk.bb.ability_range_forward_extend, sk.bb['attack@max_target']],
      ['ACTIVE_RANGE', 'time', elite ? 41 : 43, 15, elite ? 14 : 13, elite ? 0.7 : 0.55, 1, 3], lb);
    assert.deepEqual(u.skill.triggerGrid, [[0, 0], [0, 1], [0, 2]], `${lb}: the trigger grid = the running range`);
    u.skill.gainSp(999);
    const far = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.active, 1), `${lb}: cast with an enemy in the running range only`);
    assert.deepEqual(u.liveRangeGrid, [[0, 0], [0, 1], [0, 2]], `${lb}: 1-1 + 1`);
    approx(u.skill.timeLeft, sk.duration, `${lb}: ${sk.duration} s`, 0.01);
    approx(u.s.atk / u.base.atk, 1 + sk.bb.atk, `${lb}: ATK`);
    const near = h.spawn('enemy_dummy', { pos: [10, 6] }), third = h.spawn('enemy_dummy', { pos: [10, 6] }), fourth = h.spawn('enemy_dummy', { pos: [10, 7] });
    const fly = h.spawn('enemy_fly', { pos: [10, 7] });
    const n0 = hitsBy(h, u).length;
    h.run(2);
    const hits = hitsBy(h, u).slice(n0);
    const id = hits[0].dmg.attackId;
    assert.equal(hits.filter((c) => c.dmg.attackId === id).length, 3, `${lb}: three targets per attack`);
    assert.ok(hits.every((c) => [far, near, third, fourth].includes(c.target)), `${lb}: ground enemies only (the flyer is never struck)`);
    assert.ok(!hits.some((c) => c.target === fly), lb);
    h.runUntil(() => !u.skill.active, 20);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${lb}: back to 1-1`);
    approx(u.s.atk, u.base.atk, `${lb}: ATK back`);
    done(h);
  }
});

test('T1 月盈星亏: 坚忍 ASPD up to +100 at 70 % of his HP lost (linear); SBL-X stage 3: +130 at 50 %', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const x3 = elite && mod === SBLX && tier === 6;
    const [maxAs, minHp] = x3 ? [130, 0.5] : [100, 0.3];
    for (const r of [1, 0.85, 0.65, 0.5, 0.3, 0.1]) {
      u.hp = u.s.maxHp * r;
      h.step();
      approx(u.s.aspd, 100 + maxAs * Math.min(1, (1 - r) / (1 - minHp)), `${label(f)}: at ${r * 100} % HP`, 0.002);
    }
    done(h);
  }
});

test('T2 运筹帷幄: 70 HP / s (生命回复速度) while he blocks nobody, none while blocking; SBL-Y stage 3: 90 / s, and also while blocking below 30 % HP', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const y3 = elite && mod === SBLY && tier === 6;
    const regen = y3 ? 90 : 70;
    const { h, u } = field({ tier, elite, mod, skill: 2, row: 9, col: 5 });
    h.step();
    assert.equal(u.s.hpRegen, regen, `${label(f)}: blocking nobody`);
    u.hp = u.s.maxHp * 0.5;
    const hp = u.hp;
    h.run(1);
    approx(u.hp - hp, regen, `${label(f)}: +${regen} HP in 1 s`, 0.05);
    assert.ok(!selfHeals(h, u).length, `${label(f)}: an HP-regen attribute, no heal`);
    h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => u.blocking.length > 0, 30), `${label(f)}: the walker reaches him`);
    h.step();
    assert.equal(u.s.hpRegen, 0, `${label(f)}: none while blocking above 30 % HP`);
    u.hp = u.s.maxHp * 0.25;
    h.step();
    assert.equal(u.s.hpRegen, y3 ? 90 : 0, `${label(f)}: blocking below 30 % HP`);
    done(h);
  }
});

test('SBL-X “藏锋”: below 50 % HP the physical and arts damage he takes ×0.75 (庇护, stages 1 and 3), true damage untouched; none without it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const e = h.spawn('enemy_dummy', { pos: [9, 9] });
    const shelter = elite && mod === SBLX;
    if (shelter) assert.deepEqual([u.def.raw.talents[0].bb.hp_ratio, u.def.raw.talents[0].bb.damage_resistance], [0.5, 0.25], label(f));
    const at = (r, dmg) => { u.hp = u.s.maxHp * r; return h.b.dealDamage(e, u, { canDodge: false, ...dmg }); };
    approx(at(0.8, { amount: 400, type: 'arts' }), 400, `${label(f)}: above 50 %`);
    approx(at(0.4, { amount: 400, type: 'arts' }), shelter ? 300 : 400, `${label(f)}: arts below 50 %`);
    approx(at(0.4, { amount: 900, type: 'phys' }), (900 - u.s.def) * (shelter ? 0.75 : 1), `${label(f)}: physical below 50 %`);
    approx(at(0.4, { amount: 400, type: 'true' }), 400, `${label(f)}: true damage`);
    done(h);
  }
});

test('SBL-Y “热的雪”: the first lethal blow of a deployment leaves him at 30 % HP (stages 1 and 3); the next one knocks him out; a new deployment has it again; none without it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const e = h.spawn('enemy_dummy', { pos: [9, 9] });
    const rise = elite && mod === SBLY;
    if (rise) assert.deepEqual(u.def.raw.trait.bb, { value: 70, hp_ratio: 0.3 }, label(f));
    h.b.dealDamage(e, u, { amount: 1e7, type: 'true' });
    assert.equal(u.alive, rise, `${label(f)}: the first lethal blow`);
    if (!rise) { done(h); continue; }
    approx(u.hp, u.s.maxHp * 0.3, `${label(f)}: at 30 %`);
    h.step();
    h.b.dealDamage(e, u, { amount: 1e7, type: 'true' });
    assert.equal(u.alive, false, `${label(f)}: once per deployment`);
    h.b.redeploy(u);
    assert.ok(u.alive && u.deployed, 'redeployed');
    h.b.dealDamage(e, u, { amount: 1e7, type: 'true' });
    assert.equal(u.alive, true, `${label(f)}: again after a new deployment`);
    approx(u.hp, u.s.maxHp * 0.3, `${label(f)}: at 30 % again`);
    done(h);
  }
});
