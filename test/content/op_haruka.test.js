// test/content/op_haruka.test.js — the 自选 operator kit of 遥 (char_4202_haruka, 6★ 护佑者; kit
// server/sim/content/kits/ops/op-haruka.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in every
// form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or BLS-Y
// “迟来的纪念” at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_haruka.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ID = 'char_4202_haruka';
const FORMS = BACKUPS.units[ID].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const Y = 'uniequip_002_haruka';
const S1 = 'skchr_haruka_1', S2 = 'skchr_haruka_2', S3 = 'skchr_haruka_3';
const BUBBLE = 'haruka:bubble';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_heavy: dummy('enemy_heavy', { mass: 4 }),
  enemy_noflt: dummy('enemy_noflt', { immunities: { levitate: true } }),
};
const PLAIN_REC = chessRec({ id: 'test_plain_a', charId: 'char_test_plain', profession: 'CASTER', skill: null, stats: { maxHp: 2000, def: 0, res: 0 } });
const FORMS_ALL = [[5, false, null], [6, false, null], [5, true, null], [5, true, Y], [6, true, null], [6, true, Y]];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 遥 as uid 1 at (10, 5) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: { test_plain_a: PLAIN_REC } }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'heal', 'statusApplied', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ID, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const ally = (uid, row, col) => ({ uid, chessId: 'test_plain_a', row, col });
/** Clear every bubble and make her next attack (or bubble) come at once — the battle start already gave one. */
function fresh(h, u) {
  for (const x of h.b.allyUnits) h.b.removeBuff(x, BUBBLE);
  u.atkCd = 0;
}
const bubbled = (h) => h.b.allyUnits.filter((a) => a.findBuff(BUBBLE)).map((a) => a.uid).sort();
const heals = (h, u, from = 0) => h.hooksOf('heal').slice(from).filter((x) => x.source === u && !x.opts?.regen);

test('遥 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, y-6, 护佑者 (ranged arts, hits air, blocks 1; BLS-Y 2 targets), S1 / S2 DEFAULT, S3 ACTIVE_RANGE on its y-8, ground-targetable, 空构 bond, no 特质', () => {
  assert.equal(OPERATOR_KITS[ID], KITS[ID]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ID, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def, form.stats.res], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [1, 'ranged', 'arts', true, 1.6], `${label(f)}: 护佑者`);
      assert.equal(u.profile.maxTargets, mod === Y ? 2 : 1, `${label(f)}: targets`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: y-6`);
      assert.equal(u.skill.rule, skill === 2 ? 'ACTIVE_RANGE' : 'DEFAULT', `${label(f)}: trigger`);
      if (skill === 2) assert.deepEqual(u.skill.triggerGrid, form.skills[2].rangeGrid, `${label(f)}: the y-8 trigger grid`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1415, 423, 1728, 477]);
  assert.deepEqual([modOf(5, Y).attr, modOf(6, Y).attr], [{ maxHp: 130, atk: 30 }, { maxHp: 210, atk: 52 }]);
});

test('a 自选 pick: 遥 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(ID));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(ID), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: ID, skillIndex: 1, uniEquipId: Y } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: ID, skillIndex: 1, uniEquipId: Y } } });
});

test('Trait: arts attacks (BLS-Y: two targets); while a skill runs every attack heals the most injured ally (BLS-Y: two) for 75 % of her ATK', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, Y]]) {
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [ally(2, 11, 6), ally(3, 9, 6)] });
    h.spawn('enemy_dummy', { pos: [10, 7] }); h.spawn('enemy_fly', { pos: [11, 7] });
    h.run(3);
    const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
    assert.ok(hits.length && hits.every((c) => c.type === 'arts'));
    assert.equal(new Set(hits.map((c) => c.target)).size, mod === Y ? 2 : 1, `${label([tier, elite, mod])}: targets`);
    const [a, b] = [h.unit(2), h.unit(3)];
    a.hp = 600; b.hp = 900;
    const n0 = h.hooksOf('heal').length;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => heals(h, u, n0).length > 0, 4));
    const first = heals(h, u, n0).filter((x, i, l) => Math.abs(x.t - l[0].t) < 1e-9);
    assert.deepEqual(first.map((x) => x.target.uid).sort(), mod === Y ? [2, 3] : [2]);
    for (const x of first) approx(x.amount, u.s.atk * 0.75, '75 % ATK');
    done(h);
  }
});

test('T1 浮光泡影: with each attack a bubble goes to the ally of her range with the lowest HP share that holds none (herself too); with nothing to attack the attack becomes the bubble, one per attack interval; 30 % 庇护 on physical and arts, not true; out of range nobody', () => {
  const { h, u } = field({ others: [ally(2, 11, 6), ally(3, 9, 6), ally(4, 10, 9)] });
  const [a, b, out] = [h.unit(2), h.unit(3), h.unit(4)];
  a.hp = 1000; b.hp = 1200; out.hp = 100;
  fresh(h, u);
  // no enemy: ShieldOnly at once (a, 50 %), then one interval later b (60 %), then herself (full)
  h.run(0.05);
  assert.deepEqual(bubbled(h), [2]);
  h.run(1.6);
  assert.deepEqual(bubbled(h), [2, 3]);
  h.run(1.6);
  assert.deepEqual(bubbled(h), [1, 2, 3]);
  assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u).length, 0, 'no attack');
  h.run(3.2);
  assert.deepEqual(bubbled(h), [1, 2, 3], 'nobody left in range (the one at (10, 9) is outside)');
  const bub = a.findBuff(BUBBLE);
  approx(bub.data.v, 0.3, '30 %', 1e-9);
  const e = h.spawn('enemy_dummy', { pos: [11, 9] });
  for (const [type, want] of [['phys', 70], ['arts', 70], ['true', 100]]) {
    const hp0 = b.hp;
    // a 无来源 hit: the bubble takes no notice
    h.b.dealDamage(e, b, { amount: 100, type, canDodge: false, sourceless: true });
    approx(hp0 - b.hp, want, `${type}`);
    b.hp = 1200;
  }
  assert.ok(b.findBuff(BUBBLE), '无来源 damage never breaks a bubble');
  // with a target: a bubble after each attack
  for (const x of [a, b, u]) h.b.removeBuff(x, BUBBLE);
  h.spawn('enemy_dummy', { pos: [10, 7] });
  const n0 = h.hooksOf('attack').length;
  assert.ok(h.runUntil(() => h.hooksOf('attack').slice(n0).some((c) => c.attacker === u), 2));
  h.step();
  assert.deepEqual(bubbled(h), [2], 'the attack and its bubble');
  done(h);
});

test('T1 / T2: an enemy hit that lowers the holder\'s HP breaks its bubble 0.5 s later (once; a fully shielded hit does not count) and heals it 28 % of her ATK as it was when she gave it; BLS-Y stage 3: 20 % to give the holder 1 SP; stage 1: never', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, Y], [5, true, Y]]) {
    const { h, u } = field({ tier, elite, mod, others: [ally(2, 11, 6)] });
    const a = h.unit(2);
    a.hp = 1000;
    fresh(h, u);
    h.run(0.05);
    const b = a.findBuff(BUBBLE);
    assert.ok(b, 'bubbled');
    const atk0 = u.s.atk;
    h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });   // her ATK doubles after the grant
    const e = h.spawn('enemy_dummy', { pos: [11, 9] });
    h.b.addBuff(a, { key: 'test:shield', shield: 500 });
    h.b.dealDamage(e, a, { amount: 300, type: 'true' });
    h.run(0.6);
    assert.equal(a.findBuff(BUBBLE), b, 'a hit the shield took whole: no break');
    h.b.removeBuff(a, 'test:shield');
    const n0 = h.hooksOf('heal').length;
    h.b.dealDamage(e, a, { amount: 100, type: 'true' });
    h.run(0.25);
    h.b.dealDamage(e, a, { amount: 100, type: 'true' });
    h.run(0.2);
    assert.equal(a.findBuff(BUBBLE), b, 'still there at 0.45 s');
    h.run(0.1);
    assert.notEqual(a.findBuff(BUBBLE), b, 'broken 0.5 s after the first hit');
    const hs = heals(h, u, n0).filter((x) => x.target === a);
    assert.equal(hs.length, 1, 'one break, one heal');
    approx(hs[0].amount, atk0 * 0.28, '28 % of the ATK of the grant');
    void u;
    done(h);
  }
  // BLS-Y stage 3: the dice
  for (const [tier, want] of [[6, true], [5, false]]) {
    const { h, u } = field({ tier, elite: true, mod: Y, others: [{ uid: 2, chessId: 'chess_char_1_08_a', row: 11, col: 6 }] });
    const tex = h.unit(2);
    const e = h.spawn('enemy_dummy', { pos: [11, 9] });
    let gained = 0, breaks = 0;
    h.b.on('spGain', (c) => { if (c.unit === tex && c.reason === 'talent') gained += c.amount; });
    for (let i = 0; i < 300; i++) {
      tex.skill.sp = 0; tex.skill.charges = 0;
      if (!tex.findBuff(BUBBLE)) h.run(0.05);
      if (!tex.findBuff(BUBBLE)) { h.run(1.7); continue; }
      tex.hp = tex.s.maxHp * 0.5;
      h.b.dealDamage(e, tex, { amount: 1, type: 'true' });
      h.run(0.55);
      breaks++;
    }
    if (want) assert.ok(gained / breaks > 0.12 && gained / breaks < 0.28, `≈ 20 %: ${gained} / ${breaks}`);
    else assert.equal(gained, 0, 'stage 1: no SP');
    void u;
    done(h);
  }
});

test('S1 夜啼彩羽 (DEFAULT): ASPD +30 / +45 for 19 / 20 s, heals; a bubble breaking meanwhile at once gives a new one to the ally of the 8 around its holder that has none, the lowest HP share first', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0, others: [ally(2, 11, 6), ally(3, 12, 6), ally(4, 12, 7), ally(5, 9, 9)] });
    assert.deepEqual([sk.duration, sk.bb.attack_speed, u.skill.spCost, sk.initSp], [elite ? 20 : 19, elite ? 45 : 30, 25, elite ? 10 : 7]);
    const [a, b, c] = [h.unit(2), h.unit(3), h.unit(4)];
    h.spawn('enemy_dummy', { pos: [10, 7] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    approx(u.skill.timeLeft, sk.duration, 'duration', 0.05);
    approx(u.s.aspd, 100 + sk.bb.attack_speed, 'ASPD');
    for (const x of h.b.allyUnits) h.b.removeBuff(x, BUBBLE);
    h.b.addBuff(a, { key: BUBBLE, source: u, data: { v: 0.3, atk: u.s.atk, heal: 0.25, prob: 0, sp: 0, boom: false } });
    b.hp = 1500; c.hp = 1200;   // both around a; c has the lower share
    const e = h.spawn('enemy_dummy', { pos: [11, 9] });
    h.b.dealDamage(e, a, { amount: 10, type: 'true' });
    h.run(0.52);
    assert.ok(!a.findBuff(BUBBLE) && c.findBuff(BUBBLE), 'the new bubble on the lowest share of the 8 around');
    assert.equal(c.findBuff(BUBBLE).source, u);
    h.runUntil(() => !u.skill.active, 25);
    approx(u.s.aspd, 100, 'back');
    done(h);
  }
});

test('S2 幽隙栖萤: every heal of hers meanwhile deals heal × 140 % / 200 % arts damage to the 2 / 3 nearest enemies within 1.7 of the healed unit (air units too); rank 7: one more heal target and one more bubble; the first use lasts 22 / 23 s with no ATK bonus, the next ones ATK +20 % / +25 % and endless; the count restarts with a deployment', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.duration, sk.bb.atk_scale_extra, sk.bb.max_target_extra, sk.bb['attack@max_target_heal_add'], sk.bb.max_target_shield_add, sk.bb.atk, sk.bb.ability_range_radius],
      [elite ? 23 : 22, elite ? 2 : 1.4, elite ? 3 : 2, elite ? 1 : 0, elite ? 1 : 0, elite ? 0.25 : 0.2, 1.7]);
    const { h, u } = field({ tier, elite, skill: 1, others: [ally(2, 11, 6), ally(3, 9, 6), ally(4, 10, 4)] });
    const [a, b] = [h.unit(2), h.unit(3)];
    h.spawn('enemy_dummy', { pos: [9, 7] });   // her target, √5 from a
    const near = [h.spawn('enemy_dummy', { pos: [12, 6] }), h.spawn('enemy_fly', { pos: [11, 7] }), h.spawn('enemy_dummy', { pos: [12, 7] })];
    h.spawn('enemy_dummy', { pos: [13, 9] });   // too far from (11, 6)
    h.run(0.1);
    for (const x of h.b.allyUnits) h.b.removeBuff(x, BUBBLE);
    a.hp = 400; b.hp = 1000;
    const n0 = h.hooksOf('heal').length;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    approx(u.s.atk, u.base.atk, 'first use: no ATK bonus');
    assert.ok(h.runUntil(() => heals(h, u, n0).length > 0, 3));
    const t0 = heals(h, u, n0)[0].t;
    const first = heals(h, u, n0).filter((x) => Math.abs(x.t - t0) < 1e-9);
    assert.deepEqual(first.map((x) => x.target.uid).sort(), elite ? [2, 3] : [2], 'rank 7: two heal targets');
    const ha = first.find((x) => x.target === a);
    const dmg = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('haruka:s2') && Math.abs(c.t - t0) < 1e-9);
    // around a (11, 6): the three near enemies; (12, 7) is √2 ≈ 1.41 away — the 2 nearest at rank 4 are (12, 6) and (11, 7)
    const onA = dmg.filter((c) => near.includes(c.target));
    assert.equal(new Set(onA.map((c) => c.target)).size, elite ? 3 : 2, 'max_target_extra');
    for (const c of onA) approx(c.amount, ha.amount * sk.bb.atk_scale_extra, `heal × ${sk.bb.atk_scale_extra}`);
    assert.ok(onA.some((c) => c.target === near[1]), 'the flyer too');
    assert.ok(onA.every((c) => c.type === 'arts'));
    // rank 7: two bubbles per attack
    h.step();
    assert.ok(bubbled(h).length >= (elite ? 2 : 1), 'bubbles per attack');
    h.runUntil(() => !u.skill.active, 30);
    approx(h.hooksOf('skillEnd').filter((c) => c.unit === u).at(-1).t - h.hooksOf('skillStart').filter((c) => c.unit === u).at(-1).t, sk.duration, 'first use: its duration', 0.05);
    // second use: ATK bonus, endless
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4));
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), 'second use: ATK');
    h.run(sk.duration * 3);
    assert.ok(u.skill.active, 'endless');
    // a new deployment: the first use again
    h.b.retreat(u);
    h.b.redeploy(u);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4));
    approx(u.s.atk, u.base.atk, 'first use of the new deployment');
    done(h);
  }
});

test('S3 夏末游鳞 (ACTIVE_RANGE): cast with an enemy on its y-8 outside her y-6; range y-8 while on, back after; ATK +25 % / +40 %; interval 1.6 − 0.4 / 0.6 s; heals; her bubbles ×1.4 / ×1.7 (also those given before); an enemy setting one off is 浮空 3 / 4 s (half on 重量 > 3, none when immune) and takes 60 % / 70 % ATK arts each second of it (from 0.5 s)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const form = formOf(tier, elite);
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.bb.damage_resistance_scale, sk.bb.levitate_duration, sk.bb.atk_scale, sk.bb.interval],
      [40, elite ? 0.4 : 0.25, elite ? -0.6 : -0.4, elite ? 1.7 : 1.4, elite ? 4 : 3, elite ? 0.7 : 0.6, 1]);
    const { h, u } = field({ tier, elite, skill: 2, others: [ally(2, 11, 6), ally(3, 9, 6)] });
    const a = h.unit(2);
    h.run(0.1);
    assert.ok(a.findBuff(BUBBLE) || h.unit(3).findBuff(BUBBLE) || u.findBuff(BUBBLE), 'bubbles before');
    const holder = [a, h.unit(3), u].find((x) => x.findBuff(BUBBLE));
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, 'no enemy: no cast');
    h.spawn('enemy_dummy', { pos: [10, 8] });   // y-8 (+3), not y-6
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast on the y-8');
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, 'y-8 while on');
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), 'ATK');
    approx(u.s.interval, 1.6 + sk.bb.base_attack_time, 'interval');
    approx(holder.findBuff(BUBBLE).data.v, 0.3 * sk.bb.damage_resistance_scale, 'a bubble given before: rescaled', 1e-9);
    // levitation: a hit on a bubbled ally
    for (const x of h.b.allyUnits) h.b.removeBuff(x, BUBBLE);
    h.b.addBuff(a, { key: BUBBLE, source: u, data: { v: 0.42, atk: u.s.atk, heal: 0, prob: 0, sp: 0, boom: false } });
    const e = h.spawn('enemy_dummy', { pos: [12, 9] });
    h.b.dealDamage(e, a, { amount: 50, type: 'true' });
    const lev = h.hooksOf('statusApplied').filter((c) => c.target === e && c.status === 'levitate');
    assert.equal(lev.length, 1);
    approx(lev[0].duration, sk.bb.levitate_duration, 'levitate');
    assert.ok(e.isFlying, 'an air unit meanwhile');
    const n0 = h.hooksOf('damaged').length;
    h.run(sk.bb.levitate_duration + 0.2);
    const ticks = h.hooksOf('damaged').slice(n0).filter((c) => c.target === e && c.dmg?.tags?.includes('haruka:float'));
    assert.equal(ticks.length, sk.bb.levitate_duration, 'one tick a second: 0.5, 1.5 …');
    approx(ticks[0].t - lev[0].t, 0.5, 'first tick at 0.5 s', 0.05);
    for (const c of ticks) { approx(c.amount, u.s.atk * sk.bb.atk_scale, `${sk.bb.atk_scale * 100} % ATK`); assert.equal(c.type, 'arts'); }
    // heavy: half; immune: none
    const heavy = h.spawn('enemy_heavy', { pos: [12, 10] }), immune = h.spawn('enemy_noflt', { pos: [12, 11] });
    h.b.addBuff(a, { key: BUBBLE, source: u, data: { v: 0.42, atk: u.s.atk, heal: 0, prob: 0, sp: 0, boom: false } });
    h.b.dealDamage(heavy, a, { amount: 10, type: 'true' });
    h.b.dealDamage(immune, a, { amount: 10, type: 'true' });
    approx(h.hooksOf('statusApplied').filter((c) => c.target === heavy && c.status === 'levitate')[0].duration, sk.bb.levitate_duration / 2, '重量 > 3: half');
    assert.equal(h.hooksOf('statusApplied').filter((c) => c.target === immune && c.status === 'levitate').length, 0, 'immune');
    h.run(2);
    assert.equal(h.hooksOf('damaged').filter((c) => c.target === immune && c.dmg?.tags?.includes('haruka:float')).length, 0, 'no damage without the levitation');
    h.runUntil(() => !u.skill.active, 45);
    assert.deepEqual(u.liveRangeGrid, form.rangeGrid, 'back to y-6');
    approx(u.s.interval, 1.6, 'interval back');
    done(h);
  }
});

test('outside S3 a bubble levitates nobody; a bubble outlasts her leaving and still heals with the ATK of its grant', () => {
  const { h, u } = field({ skill: 0, others: [ally(2, 11, 6)] });
  const a = h.unit(2);
  a.hp = 1000;
  fresh(h, u);
  h.run(0.05);
  assert.ok(a.findBuff(BUBBLE));
  const atk = u.s.atk;
  const e = h.spawn('enemy_dummy', { pos: [11, 9] });
  h.b.retreat(u);
  h.step();
  assert.ok(a.findBuff(BUBBLE), 'still there');
  const n0 = h.hooksOf('heal').length;
  h.b.dealDamage(e, a, { amount: 10, type: 'true' });
  assert.equal(h.hooksOf('statusApplied').filter((c) => c.status === 'levitate').length, 0);
  h.run(0.6);
  approx(heals(h, u, n0)[0].amount, atk * 0.28, 'her heal after she left');
  done(h);
});
