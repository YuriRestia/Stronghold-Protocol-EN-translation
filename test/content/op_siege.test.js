// test/content/op_siege.test.js — the 自选 operator kit of 推进之王 (char_112_siege, 6★ 尖兵; kit
// server/sim/content/kits/ops/op-siege.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, SOL-X
// “糖果盒” or SOL-Y “初诺” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of
// that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_siege.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const SIEGE = 'char_112_siege';
const FORMS = BACKUPS.units[SIEGE].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SOLX = 'uniequip_002_siege', SOLY = 'uniequip_003_siege';
const S1 = 'skcom_charge_cost[3]', S2 = 'skchr_siege_2', S3 = 'skchr_siege_3';
/** The unit form of a slot (tier, normal / elite). */
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }) };
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SOLX, SOLY].map((m) => [t, true, m]))];

/** A battle with 推进之王 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: SIEGE, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
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

test('推进之王 in every 自选 form: its operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 2, melee ground-only, 维多利亚, no 特质', () => {
  assert.equal(OPERATOR_KITS[SIEGE], KITS[SIEGE]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [SIEGE, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.base.bat], [2, 'melee', false, 1.05], `${label(f)}: 尖兵`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['victoriaShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN, full potential: ATK +25): E2 Lv1 1643 / 447 / 307, E2 Lv60 2046 / 509 / 358; SOL-X +60 / +40
  // → +75 / +50 ATK / DEF, SOL-Y +200 / +65 → +260 / +82 HP / ATK
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1643, 447, 2046, 509]);
  assert.deepEqual([modOf(5, SOLX).attr, modOf(6, SOLX).attr, modOf(5, SOLY).attr, modOf(6, SOLY).attr], [{ atk: 60, def: 40 }, { atk: 75, def: 50 }, { maxHp: 200, atk: 65 }, { maxHp: 260, atk: 82 }]);
});

test('a 自选 pick: 推进之王 is offered at tiers 5 and 6 (he has a kit) and a roster with him passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(SIEGE));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(SIEGE), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: SIEGE, skillIndex: 1, uniEquipId: SOLY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: SIEGE, skillIndex: 1, uniEquipId: SOLY } } });
});

test('S1 冲锋号令·γ型 (AUTO): +12 DP as soon as its SP is full — no enemy needed (the kit\'s SP_FULL, as 德克萨斯 casts it); 41 / 38 SP from 12 / 14', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, mod: elite ? SOLX : null, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spCost, sk.initSp, sk.bb.cost], ['SP_FULL', elite ? 38 : 41, elite ? 14 : 12, 12], `T${tier}`);
    h.b.players[0].dp = 0;
    const wait = sk.spCost - sk.initSp;
    h.run(wait - 0.5);
    assert.equal(u.skill.activations, 0, `T${tier}: not before its SP is full`);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 1), `T${tier}: cast at full SP (${wait} s), no enemy on the field`);
    approx(h.b.players[0].dp, 12, `T${tier}: +12 DP`);
    h.run(sk.spCost + 0.1);
    assert.equal(u.skill.activations, 2, `T${tier}: again ${sk.spCost} s later`);
    approx(h.b.players[0].dp, 24, `T${tier}: +12 DP each cast`);
    done(h);
  }
});

test('S2 跃空锤 (AUTO, 2 / 3 charges): the next attack hits every ground enemy on her x-5 for 250 % / 280 % ATK physical and gives 3 DP; one charge per attack; outside x-5 and flyers untouched', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, mod: elite ? SOLY : null, skill: 1 });
    assert.deepEqual([u.skill.rule, u.skill.maxCharges, sk.bb.atk_scale, sk.bb.cost, sk.rangeId], ['DEFAULT', elite ? 3 : 2, elite ? 2.8 : 2.5, 3, 'x-5'], `T${tier}`);
    const at = (pos, key = 'enemy_dummy') => h.spawn(key, { pos });
    const front = at([10, 6]), back = at([10, 4]), upE = at([9, 5]);
    const fly = at([11, 5], 'enemy_fly');
    const diag = at([9, 6]), far = at([10, 7]);
    u.skill.gainSp(999);
    assert.equal(u.skill.charges, u.skill.maxCharges, `T${tier}: charges stored`);
    h.b.players[0].dp = 0;
    const n0 = atkHits(h, u).length;
    assert.ok(h.runUntil(() => u.skill.activations === 1 && atkHits(h, u).length > n0, 3), `T${tier}: cast on her next attack`);
    const first = atkHits(h, u).slice(n0);
    const id = first[0].dmg.attackId;
    const hit = first.filter((c) => c.dmg.attackId === id);
    assert.deepEqual(hit.map((c) => c.target).sort((a, b) => a.id - b.id), [front, back, upE].sort((a, b) => a.id - b.id), `T${tier}: her x-5 ground enemies`);
    for (const c of hit) {
      approx(c.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
      assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true], `T${tier}: physical skill attack`);
    }
    for (const e of [fly, diag, far]) assert.ok(!hit.some((c) => c.target === e), `T${tier}: ${e.defId} at ${e.tileR},${e.tileC} untouched`);
    approx(h.b.players[0].dp, 3, `T${tier}: +3 DP`);
    assert.equal(u.skill.charges, u.skill.maxCharges - 1, `T${tier}: one charge spent`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 1-1 after the attack`);
    // the stored charges go on her next attacks, one each
    h.runUntil(() => u.skill.activations === u.skill.maxCharges, 10);
    assert.equal(u.skill.charges, 0);
    approx(h.b.players[0].dp, 3 * u.skill.maxCharges, `T${tier}: +3 DP per charge`);
    done(h);
  }
});

test('S3 碎颅击 (MANUAL, data DEFAULT): 18 / 21 s, attack interval 1.05 + 1.0 s, every attack 290 % / 320 % ATK with 40 % to stun 0.8 / 1.1 s; all back after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, seed: 11 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb['attack@atk_scale'], sk.bb['attack@buff_prob'], sk.bb['attack@stun'], sk.bb.base_attack_time],
      ['DEFAULT', elite ? 21 : 18, elite ? 3.2 : 2.9, 0.4, elite ? 1.1 : 0.8, 1], `T${tier}`);
    approx(u.s.interval, 1.05, `T${tier}: own interval`);
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in her range`);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.01);
    approx(u.s.interval, 2.05, `T${tier}: +1.0 s`);
    const n0 = atkHits(h, u).length;
    u.skill.extend(400); // ≈ 200 attacks
    h.runUntil(() => !u.skill.active, 500);
    const hits = atkHits(h, u).slice(n0).filter((c) => c.dmg.isSkill);
    assert.ok(hits.length > 190, `T${tier}: ${hits.length} skill attacks`);
    for (const c of hits.slice(0, 5)) approx(c.amount, u.s.atk * sk.bb['attack@atk_scale'], `T${tier}: ${sk.bb['attack@atk_scale'] * 100} % ATK`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun' && c.target === e);
    assert.ok(stuns.length / hits.length > 0.32 && stuns.length / hits.length < 0.48, `T${tier}: ${stuns.length} / ${hits.length} stuns ≈ 40 %`);
    for (const c of stuns) approx(c.duration, sk.bb['attack@stun'], `T${tier}: stun ${sk.bb['attack@stun']} s`);
    approx(u.s.interval, 1.05, `T${tier}: interval back`);
    const n1 = atkHits(h, u).length;
    h.run(10);
    assert.ok(atkHits(h, u).slice(n1).every((c) => !c.dmg.isSkill && Math.abs(c.amount - u.s.atk) < 1e-6), `T${tier}: plain attacks once it ends`);
    done(h);
  }
});

test('T1 万兽之王: every 【先锋】 operator of the field ATK / DEF +10 % while she is deployed (not other professions); SOL-X stage 3 adds her own +8 % / +8 %', () => {
  const others = [{ uid: 2, chessId: 'chess_char_1_08_a', row: 11, col: 3 }, { uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 7 }];
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    h.run(0.6);
    const texas = h.unit(2), yak = h.unit(3);
    const t0 = u.def.raw.talents.find((t) => t.index === 0);
    const extra = elite && mod === SOLX && tier === 6 ? 0.08 : 0;
    assert.deepEqual(texas.findBuff('talent:siege:pioneers')?.mods, { atkPct: 0.1, defPct: 0.1 }, `${label(f)}: 德克萨斯 (先锋)`);
    assert.equal(yak.findBuff('talent:siege:pioneers'), null, `${label(f)}: 角峰 (重装) gets nothing`);
    assert.deepEqual(u.findBuff('talent:siege:pioneers')?.mods, { atkPct: 0.1, defPct: 0.1 }, `${label(f)}: herself`);
    approx(u.s.atk, u.base.atk * (1 + 0.1 + extra), `${label(f)}: her ATK`);
    approx(u.s.def, u.base.def * (1 + 0.1 + extra), `${label(f)}: her DEF`);
    assert.equal(!!u.findBuff('talent:siege:self'), extra > 0, `${label(f)}: the SOL-X self extra`);
    if (extra) assert.match(t0.desc, /自身攻击力和防御力额外\+8%/, 'the module text');
    h.b.retreat(u);
    h.run(0.7);
    assert.equal(texas.findBuff('talent:siege:pioneers'), null, `${label(f)}: gone once she leaves the field`);
    done(h);
  }
});

test('T2 粉碎: an enemy falling on her x-5 gives 1 SP (flyers too, under her own 阻回 too, never during a timed skill); SOL-Y stage 3: 3 SP and 1 SP to another 【先锋】 operator', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const others = [{ uid: 2, chessId: 'chess_char_1_08_a', row: 12, col: 9 }];
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    const texas = h.unit(2);
    const y3 = elite && mod === SOLY && tier === 6;
    const sp = y3 ? 3 : 1;
    const kill = (pos, key = 'enemy_dummy') => {
      const e = h.spawn(key, { pos });
      const [a, b] = [u.skill.sp, texas.skill.sp];
      h.b.kill(e, null);
      const r6 = (v) => Math.round(v * 1e6) / 1e6;
      return [r6(u.skill.sp - a), r6(texas.skill.sp - b)];
    };
    assert.deepEqual(kill([10, 4]), [sp, y3 ? 1 : 0], `${label(f)}: behind her (x-5)`);
    assert.deepEqual(kill([9, 5], 'enemy_fly'), [sp, y3 ? 1 : 0], `${label(f)}: a flyer above her`);
    assert.deepEqual(kill([9, 6]), [0, 0], `${label(f)}: diagonal — outside x-5`);
    assert.deepEqual(kill([10, 7]), [0, 0], `${label(f)}: two tiles ahead`);
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true }, duration: 5 });
    assert.equal(kill([10, 6])[0], sp, `${label(f)}: 无视自身的阻回`);
    h.b.removeBuff(u, 'test:noSp');
    u.skill.gainSp(999);
    u.skill.activate('test');
    assert.ok(u.skill.active);
    assert.equal(kill([11, 5])[0], 0, `${label(f)}: no SP while 碎颅击 runs`);
    done(h);
  }
});

test('SOL-X “糖果盒” trait: ATK / DEF +8 % while she blocks an enemy (stages 1 and 3); none without it; SOL-Y\'s 首次部署时部署费用-4 changes nothing in battle', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2, row: 9, col: 5 });
    const solx = elite && mod === SOLX;
    if (solx) assert.deepEqual(u.def.raw.trait.bb, { atk: 0.08, def: 0.08 }, label(f));
    h.run(1);
    assert.equal(u.findBuff('trait:siege:block'), null, `${label(f)}: nothing blocked`);
    h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => u.blocking.length > 0, 30), `${label(f)}: the walker reaches her`);
    h.step();
    assert.equal(!!u.findBuff('trait:siege:block'), solx, `${label(f)}: blocking`);
    if (solx) assert.deepEqual(u.findBuff('trait:siege:block').mods, { atkPct: 0.08, defPct: 0.08 });
    if (elite && mod === SOLY) {
      assert.deepEqual(u.def.raw.talents.filter((t) => t.index === -1).map((t) => t.bb.runtime_cost).filter((v) => v != null), [-4], `${label(f)}: the data carries it`);
      assert.equal(u.base.cost, formOf(tier, true).stats.cost, `${label(f)}: no cost change`);
    }
    done(h);
  }
});
