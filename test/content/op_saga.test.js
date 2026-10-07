// test/content/op_saga.test.js — the 自选 operator kit of 嵯峨 (char_362_saga, 6★ 尖兵; kit
// server/sim/content/kits/ops/op-saga.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in every
// form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, SOL-Y 身向云泥 or
// SOL-X 何处寻驮？ at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json; the fidelity
// checklist of kits/README.md item by item (劝善's 重伤 per PRTS 术语释义 重伤 / the talent and S2 备注).
// Run: node --test test/content/op_saga.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { DYING, S2_CHECK, isDying } from '../../server/sim/content/kits/ops/op-saga.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const SAGA = 'char_362_saga';
const FORMS = BACKUPS.units[SAGA].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SOLY = 'uniequip_002_saga', SOLX = 'uniequip_003_saga';
const S1 = 'skcom_charge_cost[3]', S2 = 'skchr_saga_2', S3 = 'skchr_saga_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_weak: dummy('enemy_weak', { hp: 100 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
};
// a regenerating enemy (data/enemies.json has two: 200 HP/s for enemy_1061_zomshd)
ENEMIES.enemy_regen = { ...dummy('enemy_regen', { hp: 100 }), stats: { ...dummy('enemy_regen', { hp: 100 }).stats, hpRecoveryPerSec: 200 } };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SOLY, SOLX].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 嵯峨 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5, dp = 0 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: dp }, hooks: ['damaged', 'skillStart', 'skillEnd', 'kill', 'death', 'spGain', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: SAGA, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u, from = 0) => h.hooksOf('damaged').slice(from).filter((c) => c.source === u && c.target?.side === 'enemy');
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('嵯峨 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1, blocks 2, melee ground-only, no 特质', () => {
  assert.equal(OPERATOR_KITS[SAGA], KITS[SAGA]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [SAGA, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat, typeof u.profile.skipEnemy], [2, 'melee', 'phys', false, 1.05, 'function'], `${label(f)}: 尖兵`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // E2 Lv1 1609 / 459 / 297, E2 Lv60 2004 / 523 / 347 (full potential); SOL-Y +75 / +45 / +15 → +125 / +55 / +20, SOL-X +50 / +28 → +70 / +44
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1609, 459, 2004, 523]);
  assert.deepEqual([modOf(5, SOLY).attr, modOf(6, SOLY).attr, modOf(5, SOLX).attr, modOf(6, SOLX).attr],
    [{ maxHp: 75, atk: 45, def: 15 }, { maxHp: 125, atk: 55, def: 20 }, { atk: 50, def: 28 }, { atk: 70, def: 44 }]);
});

test('a 自选 pick: 嵯峨 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(SAGA));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(SAGA), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: SAGA, skillIndex: 1, uniEquipId: SOLX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: SAGA, skillIndex: 1, uniEquipId: SOLX } } });
});

test('melee, ground-only: no attack on a flyer in her range; a ground enemy there is attacked (physical, 100 % ATK)', () => {
  const { h, u } = field({ tier: 5, skill: 0 });
  const fly = h.spawn('enemy_fly', { pos: [10, 6] });
  h.run(3);
  assert.equal(hitsBy(h, u).filter((c) => c.target === fly).length, 0, 'flyer untouched');
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  assert.ok(h.runUntil(() => hitsBy(h, u).some((c) => c.target === e), 3));
  const c = hitsBy(h, u).find((x) => x.target === e);
  assert.deepEqual([c.type, c.dmg.isAttack], ['phys', true]);
  approx(c.amount, u.s.atk, '100 % ATK');
  done(h);
});

test('S1 冲锋号令·γ型 (AUTO): +12 DP as soon as its SP is full — no enemy needed (SP_FULL); 41 / 38 SP from 12 / 14', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, mod: elite ? SOLX : null, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spCost, sk.initSp, sk.bb.cost], ['SP_FULL', elite ? 38 : 41, elite ? 14 : 12, 12], `T${tier}`);
    h.b.players[0].dp = 0;
    h.run(sk.spCost - sk.initSp - 0.5);
    assert.equal(u.skill.activations, 0, `T${tier}: not before`);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 1), `T${tier}: at full SP, no enemy`);
    approx(h.b.players[0].dp, 12, `T${tier}: +12 DP`);
    done(h);
  }
});

test('S2 除恶 (MANUAL, data SKILL_RANGE on x-6, 2 charges): +4 DP; the cross\'s ground enemies take 280 % / 320 % ATK physical — at most 6, flyers and other tiles untouched', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, mod: elite ? SOLY : null, skill: 1 });
    assert.deepEqual([u.skill.rule, u.skill.maxCharges, sk.rangeId, sk.bb.atk_scale, sk.bb.cost, sk.spCost, sk.initSp], ['SKILL_RANGE', 2, 'x-6', elite ? 3.2 : 2.8, 4, elite ? 16 : 18, elite ? 10 : 9], `T${tier}`);
    assert.match(sk.desc, /最多6名地面敌人/);
    const cross = [[12, 5], [11, 5], [10, 3], [10, 4], [10, 6], [10, 7], [9, 5]];
    const ground = cross.map((pos) => h.spawn('enemy_dummy', { pos }));
    const fly = h.spawn('enemy_fly', { pos: [8, 5] });
    const diag = h.spawn('enemy_dummy', { pos: [11, 6] });
    h.b.players[0].dp = 0;
    const n0 = hitsBy(h, u).length;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 1), `T${tier}: cast (enemies in the cross)`);
    const hit = hitsBy(h, u, n0).filter((c) => c.dmg.tags?.includes('saga:s2'));
    assert.equal(hit.length, 6, `T${tier}: at most 6`);
    assert.ok(hit.every((c) => ground.includes(c.target)), `T${tier}: ground enemies of the cross only`);
    assert.equal(new Set(hit.map((c) => c.target)).size, 6, `T${tier}: six different`);
    for (const c of hit) {
      approx(c.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
      assert.deepEqual([c.type, c.dmg.isSkill, c.dmg.isAttack], ['phys', true, false], `T${tier}: a physical skill damage`);
    }
    assert.ok(!hit.some((c) => c.target === fly || c.target === diag), `T${tier}: flyer / diagonal untouched`);
    approx(h.b.players[0].dp, 4, `T${tier}: +4 DP`);
    assert.equal(u.skill.charges, 1, `T${tier}: one charge left`);
    done(h);
  }
});

test('S2 除恶: its trigger counts any enemy in the cross (a flyer too, 无视其不可选中) but hits ground ones only', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 1 });
  const fly = h.spawn('enemy_fly', { pos: [9, 5] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 1), 'cast for a flyer alone in the cross');
  assert.equal(hitsBy(h, u).filter((c) => c.target === fly).length, 0, 'but not hit');
  done(h);
});

test('S2 除恶: a 重伤 enemy is selected (可选择重伤单位) and every hit enemy still 重伤 0.7 s later is killed by her (killer 嵯峨, +2 SP each)', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 1 });
  const sk = skillOf(6, true, S2);
  const weak = h.spawn('enemy_weak', { pos: [10, 7] });   // in the cross, outside her 1-1
  const front = h.spawn('enemy_weak', { pos: [10, 6] });  // in her 1-1
  assert.ok(h.runUntil(() => isDying(front), 3), 'her attack: 重伤');
  assert.deepEqual([front.hp, weak.hp], [1, 100]);
  // 除恶 comes by itself once a charge is ready (SKILL_RANGE: enemies in the cross)
  assert.ok(h.runUntil(() => u.skill.activations === 1, sk.spCost - sk.initSp + 1), 'cast');
  const tc = h.b.time;
  assert.ok(hitsBy(h, u).some((c) => c.target === front && c.dmg.tags?.includes('saga:s2')), '可选择重伤单位');
  assert.ok(isDying(weak) && weak.hp === 1, 'the weak one: 1 HP, 重伤');
  h.run(S2_CHECK - 0.1);
  assert.ok(weak.alive && front.alive, 'not before 0.7 s');
  assert.ok(h.runUntil(() => !weak.alive && !front.alive, 0.2), 'both killed at 0.7 s');
  const kills = h.hooksOf('kill').filter((c) => c.victim === weak || c.victim === front);
  assert.ok(kills.length === 2 && kills.every((c) => c.killer === u), 'killer: 嵯峨');
  assert.equal(u.stats.kills, 2);
  const talentSp = h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'talent' && c.t >= tc).reduce((n, c) => n + c.amount, 0);
  approx(talentSp, 4, '2 × 2 SP');
  done(h);
});

test('S3 怒目 (MANUAL, data ACTIVE_RANGE on 1-1 + 1): 20 s, ATK +70 % / +100 %, interval 1.05 + 0.5 s, range +1, every blocked enemy at once, +20 DP over the skill; all back after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, row: 9, col: 5 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.bb.ability_range_forward_extend, sk.bb.cost, sk.bb.interval, sk.bb.value, sk.bb['attack@hp_ratio']],
      ['ACTIVE_RANGE', 20, elite ? 1 : 0.7, 0.5, 1, 1, 1, 20, 0.5], `T${tier}`);
    assert.deepEqual(sk.trigger.customRangeGrid, [[0, 0], [0, 1], [0, 2]], `T${tier}: her 1-1 + 1`);
    u.skill.gainSp(999);
    const far = h.spawn('enemy_dummy', { pos: [9, 7] }); // two tiles ahead: the running range only
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: cast for an enemy 2 tiles ahead`);
    h.b.players[0].dp = 0;
    assert.deepEqual(u.liveRangeGrid, [[0, 0], [0, 1], [0, 2]], `T${tier}: range +1`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.interval, 1.55, `T${tier}: +0.5 s`);
    assert.ok(h.runUntil(() => hitsBy(h, u).some((c) => c.target === far), 3), `T${tier}: reaches 2 tiles ahead`);
    h.b.kill(far, null);
    // two walkers blocked: one attack hits both
    h.spawn('enemy_walk', { routeIndex: 0 });
    h.spawn('enemy_walk', { routeIndex: 0, pos: [9, 9] });
    assert.ok(h.runUntil(() => u.blocking.length === 2, 30), `T${tier}: blocking two`);
    const n0 = h.hooksOf('attack').length;
    assert.ok(h.runUntil(() => h.hooksOf('attack').slice(n0).some((c) => c.attacker === u), 3));
    const at = h.hooksOf('attack').slice(n0).find((c) => c.attacker === u);
    assert.equal(at.targets.length, 2, `T${tier}: every blocked enemy`);
    h.runUntil(() => !u.skill.active, 25);
    approx(h.b.players[0].dp, 20, `T${tier}: +20 DP in all`, 1e-6);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: 1-1 again`);
    approx(u.s.interval, 1.05, `T${tier}: interval back`);
    done(h);
  }
});

test('S3 怒目: DP comes gradually (1 per second) and one more attack follows each attack on a target below half HP (checked before the hit), none above', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2 });
  const low = h.spawn('enemy_dummy', { pos: [10, 6] });
  low.hp = low.s.maxHp * 0.4;
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 1));
  h.b.players[0].dp = 0;
  h.run(5.5);
  approx(h.b.players[0].dp, 5, '5 DP after 5.5 s', 1e-6);
  // hits on the target, grouped by attack: an extra attack lands one tick after its attack
  const groups = (hits) => {
    const out = [];
    for (const c of hits) { const g = out.at(-1); if (g && c.t - g.at(-1).t < 0.1) g.push(c); else out.push([c]); }
    return out.map((g) => g.length);
  };
  const n0 = hitsBy(h, u).length;
  h.run(6);
  const low6 = groups(hitsBy(h, u, n0).filter((c) => c.target === low && c.dmg.isAttack));
  assert.ok(low6.length >= 3, `${low6.length} attacks in 6 s (1.55 s apart)`);
  assert.ok(low6.slice(0, -1).every((n) => n === 2), `every attack followed by one more: ${low6}`);
  // above half: no extra attack
  h.b.kill(low, null);
  const high = h.spawn('enemy_dummy', { pos: [10, 6] });
  high.hp = high.s.maxHp * 0.6;
  const n1 = hitsBy(h, u).length;
  h.run(5);
  const high5 = groups(hitsBy(h, u, n1).filter((c) => c.target === high && c.dmg.isAttack));
  assert.ok(high5.length >= 2 && high5.every((n) => n === 1), `one hit per attack: ${high5}`);
  done(h);
});

test('T1 劝善: her damage leaves an enemy at 1 HP and 重伤 (move ×0.2, unblockable, 禁疗, no regeneration); she never attacks it; it dies 10 s later (无来源, no SP); a 重伤 enemy takes no second 重伤', () => {
  for (const f of [[5, false, null], [6, true, SOLY]]) {
    const { h, u } = field({ tier: f[0], elite: f[1], mod: f[2], skill: 2 });
    const t0 = BACKUPS.units[SAGA].forms[f[1] ? '2/60/7/3' : '2/1/4/0'].talents[0].bb;
    assert.deepEqual(t0, { move_speed: -0.8, sp: 2, interval: 10 });
    const e = h.spawn('enemy_weak', { pos: [10, 6] });
    assert.ok(h.runUntil(() => isDying(e), 3), `${label(f)}: 重伤`);
    const at = h.b.time;
    assert.deepEqual([e.alive, e.hp], [true, 1], `${label(f)}: 1 HP left`);
    const d = e.findBuff(DYING);
    assert.equal(d.source, u);
    approx(d.mods.moveMul, 0.2, `${label(f)}: move −80 %`);
    assert.equal(d.mods.hpRegen, -1e9, `${label(f)}: regeneration zeroed`);
    assert.deepEqual(d.flags, { unblockable: true, healFree: true, noHeal: true }, `${label(f)}: 禁用近战 / 禁疗`);
    approx(e.s.moveSpeed, e.base.moveSpeed * 0.2, `${label(f)}: move`);
    assert.ok(e.s.hpRegen <= 0, `${label(f)}: no regeneration (a cancelling hpRegen)`);
    assert.equal(h.b.heal(e, e, 50, { self: true }), 0, `${label(f)}: 禁疗`);
    // she never attacks it again
    const n0 = hitsBy(h, u).length, a0 = u.stats.attacks;
    h.run(4);
    assert.equal(hitsBy(h, u, n0).length, 0, `${label(f)}: no damage of hers`);
    assert.equal(u.stats.attacks, a0, `${label(f)}: no attack`);
    // no second 重伤
    h.b.dealDamage(u, e, { amount: 1000, type: 'true' });
    assert.equal(e.findBuff(DYING), d, `${label(f)}: the same 重伤`);
    assert.equal(e.hp, 1, `${label(f)}: still not lethal`);
    // 10 s: a forced, 无来源 death
    const sp0 = u.skill.sp;
    h.run(at + 10 - h.b.time - 0.1);
    assert.ok(e.alive, `${label(f)}: alive before 10 s`);
    assert.ok(h.runUntil(() => !e.alive, 0.2), `${label(f)}: dead at 10 s`);
    const k = h.hooksOf('kill').find((c) => c.victim === e);
    assert.deepEqual([k.killer, e.removeReason], [null, 'killed'], `${label(f)}: 无来源 kill`);
    assert.equal(h.b.killed, 1, `${label(f)}: counted`);
    assert.equal(h.hooksOf('spGain').filter((c) => c.reason === 'talent').length, 0, `${label(f)}: no SP for it`);
    assert.ok(u.skill.sp >= sp0, `${label(f)}: (time SP only)`);
    done(h);
  }
});

test('T1 劝善: a 重伤 enemy regenerates nothing (生命回复速度归零) — one with 200 HP/s stays at 1 HP', () => {
  const { h, u } = field({ tier: 5, skill: 2 });
  const e = h.spawn('enemy_regen', { pos: [10, 6] });
  assert.equal(e.s.hpRegen, 200, 'it regenerates');
  assert.ok(h.runUntil(() => isDying(e), 3));
  h.run(3);
  assert.deepEqual([e.alive, e.hp], [true, 1], 'no HP back while 重伤');
  assert.equal(hitsBy(h, u).filter((c) => c.target === e).length, 1, 'one hit of hers, then none');
  done(h);
});

test('T1 劝善: whoever kills a 重伤 enemy gets 2 SP; 重伤 never kills while 消失 and kills at once when it comes back', () => {
  const others = [{ uid: 2, chessId: 'chess_char_1_08_a', row: 12, col: 9 }];
  const { h } = field({ tier: 5, skill: 2, others });
  const texas = h.unit(2);
  const e = h.spawn('enemy_weak', { pos: [10, 6] });
  assert.ok(h.runUntil(() => isDying(e), 3));
  const sp0 = texas.skill.sp;
  h.b.dealDamage(texas, e, { amount: 1e6, type: 'true' });
  assert.ok(!e.alive, 'another operator\'s damage kills it');
  approx(texas.skill.sp - sp0, 2, '+2 SP to 德克萨斯');
  // 消失
  const g = h.spawn('enemy_weak', { pos: [10, 6] });
  assert.ok(h.runUntil(() => isDying(g), 3));
  h.step();
  g.hidden = true;
  h.run(12);
  assert.ok(g.alive, 'no natural death while 消失');
  g.hidden = false;
  h.step();
  assert.ok(!g.alive, 'dead the moment it appears');
  assert.equal(h.hooksOf('kill').find((c) => c.victim === g).killer, null);
  done(h);
});

test('T1 劝善 SOL-X stage 3: her damage on a target below half HP ×1.15 (stage 1 and the other forms: none)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const x3 = elite && tier === 6 && mod === SOLX;
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const hitAt = (ratio) => {
      e.hp = e.s.maxHp * ratio;
      const n0 = hitsBy(h, u).length;
      assert.ok(h.runUntil(() => hitsBy(h, u, n0).length > 0, 3), label(f));
      return hitsBy(h, u, n0)[0].amount;
    };
    const lo = hitAt(0.4), hi = hitAt(0.6);
    approx(lo / hi, x3 ? 1.15 : 1, `${label(f)}: below / above half`);
    if (x3) assert.match(u.def.raw.talents.find((t) => t.index === 0).desc, /对生命值低于一半的单位造成的伤害提升15%/);
    done(h);
  }
});

test('T2 清明: once per deployment, the first time she drops below 40 %: 70 % physical dodge and 6 % max HP/s for 17 s; SOL-Y stage 3: 7 % (its blackboard) for 20 s', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, row: 12, col: 9 });
    const y3 = elite && tier === 6 && mod === SOLY;
    const tb = u.def.raw.talents.find((t) => t.index === 1).bb;
    assert.deepEqual(tb, { hp_ratio: 0.4, hp_recovery_per_sec_by_max_hp_ratio: y3 ? 0.07 : 0.06, prob: 0.7, duration: y3 ? 20 : 17 }, label(f));
    h.b.dealDamage(null, u, { amount: u.s.maxHp * 0.55, type: 'true' });
    assert.equal(u.findBuff('talent:saga:qingming'), null, `${label(f)}: at 45 % nothing`);
    h.b.dealDamage(null, u, { amount: u.s.maxHp * 0.1, type: 'true' });
    const b = u.findBuff('talent:saga:qingming');
    assert.ok(b, `${label(f)}: below 40 %`);
    assert.deepEqual(b.mods, { dodgePhys: 0.7, hpRegenRatio: y3 ? 0.07 : 0.06 }, `${label(f)}: mods`);
    approx(b.duration, y3 ? 20 : 17, `${label(f)}: duration`);
    approx(u.s.dodgePhys, 0.7, `${label(f)}: dodge`);
    const hp0 = u.hp;
    h.run(2.01);
    approx(u.hp - hp0, 2 * (y3 ? 0.07 : 0.06) * u.s.maxHp, `${label(f)}: regeneration`, 0.02);
    h.run(b.duration);
    assert.equal(u.findBuff('talent:saga:qingming'), null, `${label(f)}: over`);
    u.hp = u.s.maxHp;
    h.b.dealDamage(null, u, { amount: u.s.maxHp * 0.7, type: 'true' });
    assert.equal(u.findBuff('talent:saga:qingming'), null, `${label(f)}: only once`);
    h.b.retreat(u);
    h.b.redeploy(u, { free: true });
    h.b.dealDamage(null, u, { amount: u.s.maxHp * 0.7, type: 'true' });
    assert.ok(u.findBuff('talent:saga:qingming'), `${label(f)}: again after a new deployment`);
    done(h);
  }
});

test('SOL-X 何处寻驮？ trait: ATK / DEF +8 % while she blocks an enemy (stages 1 and 3); none without it; SOL-Y\'s 首次部署时部署费用-4 changes nothing in battle', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, row: 9, col: 5 });
    const solx = elite && mod === SOLX;
    if (solx) assert.deepEqual(u.def.raw.trait.bb, { atk: 0.08, def: 0.08 }, label(f));
    h.run(1);
    assert.equal(u.findBuff('trait:saga:block'), null, `${label(f)}: nothing blocked`);
    h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => u.blocking.length > 0, 30), `${label(f)}: the walker reaches her`);
    h.step();
    assert.equal(!!u.findBuff('trait:saga:block'), solx, `${label(f)}: blocking`);
    if (solx) assert.deepEqual(u.findBuff('trait:saga:block').mods, { atkPct: 0.08, defPct: 0.08 });
    if (elite && mod === SOLY) {
      assert.deepEqual(u.def.raw.talents.filter((t) => t.index === -1).map((t) => t.bb.runtime_cost).filter((v) => v != null), [-4], `${label(f)}: the data carries it`);
      assert.equal(u.base.cost, formOf(tier, true).stats.cost, `${label(f)}: no cost change`);
    }
    done(h);
  }
});
