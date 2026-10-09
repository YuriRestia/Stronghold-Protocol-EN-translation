// test/content/op_lmlee.test.js — the 自选 operator kit of 老鲤 (char_322_lmlee, 6★ 行商; kit
// server/sim/content/kits/ops/op-lmlee.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, MER-X
// “无问吉凶” or MER-Y “但思善恶” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json; the
// fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_lmlee.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { GUARD_KEY, MARK_RADIUS } from '../../server/sim/content/kits/ops/op-lmlee.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const LEE = 'char_322_lmlee';
const FORMS = BACKUPS.units[LEE].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_lmlee', Y = 'uniequip_003_lmlee';
const S1 = 'skchr_lmlee_1', S2 = 'skchr_lmlee_2', S3 = 'skchr_lmlee_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The talent `index` of a form with the picked module's change. */
const talentOf = (tier, elite, mod, index) => modOf(tier, elite ? mod : null)?.talentChanges.find((t) => t.talentIndex === index) ?? formOf(tier, elite).talents.find((t) => t.index === index);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
  enemy_light: dummy('enemy_light', { hp: 1000 }),
  enemy_gun: dummy('enemy_gun', { atk: 300, range: 5, bat: 1, dmgType: 'phys' }),
  enemy_close: dummy('enemy_close', { atk: 300, range: 1.5, bat: 1, dmgType: 'phys' }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, X, Y].map((m) => [t, true, m]))];

/** A battle with 老鲤 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5, dp = 0 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'dodge', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: LEE, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.b.players[0].dp = dp;
  h.step();
  return { h, u: h.unit(1) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const from = (h, src) => h.hooksOf('damaged').filter((c) => c.source === src);

test('老鲤 in every 自选 form: his kit (all three skills authored), stats + module attributes, 1-1, blocks 1, melee physical ground-only, 行商, 炎, no 特质; S1 / S3 SP_FULL, S2 the data\'s DEFAULT', () => {
  assert.equal(OPERATOR_KITS[LEE], KITS[LEE]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [LEE, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat, u.profile.sub], [1, 'melee', false, 'phys', 1, 'merchant'], `${label(f)}: 行商`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.equal(u.skill.rule, skill === 1 ? form.skills[1].trigger.rule : 'SP_FULL', `${label(f)}: trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => [s.skillType, s.trigger.rule]), [['AUTO', 'DEFAULT'], ['MANUAL', 'DEFAULT'], ['AUTO', 'DEFAULT']]);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr, modOf(5, Y).attr, modOf(6, Y).attr], [{ maxHp: 200, atk: 55 }, { maxHp: 300, atk: 74 }, { atk: 57, def: 35 }, { atk: 76, def: 50 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(LEE), `tier ${t}`);
  assert.equal(validateDiyPicks({ [SLOT[6]]: { charId: LEE, skillIndex: 2, uniEquipId: Y } }, { data, kitted: KITTED_CHARS }).ok, true);
});

test('trait 行商: −3 DP every 3 s while he stands (MER-X: −2), he retreats when the DP runs short; MER-Y: ATK +4 % per payment, 5 stacks at most', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1, dp: 4 });   // (S2: no cast without an enemy, no ATK bonus)
    const cost = elite && mod === X ? 2 : 3;
    assert.deepEqual([u.profile.merchantInterval, u.profile.merchantCost], [3, cost], label(f));
    h.b.players[0].dp = 100;
    const t1 = talentOf(tier, elite, mod, 1);
    const extra = Math.abs(t1.bb.extra_cost);
    h.run(3.05);   // first payment: 有备无患 takes |extra_cost| (DP ≥ it, no guard yet)
    approx(h.b.players[0].dp, 100 - extra, `${label(f)}: first payment`);
    h.run(3);
    approx(h.b.players[0].dp, 100 - extra - cost, `${label(f)}: then the trait's cost`);
    const y = elite && mod === Y;
    const st = u.findBuff('trait:lmlee:merY');
    assert.equal(st?.stacks ?? 0, y ? 2 : 0, `${label(f)}: MER-Y stacks`);
    if (y) {
      h.run(30);
      assert.equal(u.findBuff('trait:lmlee:merY').stacks, 5, `${label(f)}: 5 at most`);
      approx(u.s.atk, u.base.atk * (1 + 5 * 0.04), `${label(f)}: ATK +20 %`);
    }
    h.b.players[0].dp = cost - 0.5;
    h.run(3.1);
    assert.ok(!u.alive && !u.deployed, `${label(f)}: retreats when the DP runs short`);
    done(h);
  }
});

test('T1 和气生财: while he blocks one enemy alone in the 3 × 3 — his ASPD +30, its −30; a second enemy around ⇒ ±15; nothing while he blocks nobody (MER-Y stage 3: ±42 / ±21)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, row: 9, col: 5, dp: 999 });
    const tb = talentOf(tier, elite, mod, 0).bb;
    const self = tb['lmlee_t_1[self].attack_speed'], foe = tb['lmlee_t_1[enemy].attack_speed'];
    assert.deepEqual([self, foe, tb.cnt], elite && tier === 6 && mod === Y ? [21, -21, 1] : [15, -15, 1], label(f));
    h.run(0.5);
    assert.equal(u.findBuff('talent:lmlee:self'), null, `${label(f)}: blocking nobody`);
    const w = h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => w.blockedBy === u, 30), `${label(f)}: the walker reaches him`);
    h.step();
    approx(u.s.aspd, 100 + 2 * self + (u.skill.active ? 0 : 0), `${label(f)}: ×2 alone`);
    approx(w.s.aspd, 100 + 2 * foe, `${label(f)}: its ASPD ×2`);
    const other = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.step();
    approx(u.s.aspd, 100 + self, `${label(f)}: two enemies around`);
    approx(w.s.aspd, 100 + foe, `${label(f)}: its ASPD`);
    h.b.kill(other, null);
    h.b.kill(w, null);
    h.run(0.3);
    assert.equal(u.findBuff('talent:lmlee:self'), null, `${label(f)}: gone with the block`);
    done(h);
  }
});

test('T2 有备无患: with DP ≥ 5 a payment costs 5 and arms the guard (MER-X stage 3: 4); the guard cancels the next 晕眩 / 冻结 and stuns its enemy source 3 s (4 s); no second guard while one is held; DP 3–4 pays the trait cost only', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const tb = talentOf(tier, elite, mod, 1).bb;
    const x3 = elite && tier === 6 && mod === X;
    assert.deepEqual([Math.abs(tb.extra_cost), tb.stun], x3 ? [4, 4] : [5, 3], label(f));
    const cost = elite && mod === X ? 2 : 3;
    const dp0 = Math.abs(tb.extra_cost) - 1;
    const { h, u } = field({ tier, elite, mod, skill: 1, dp: dp0 });
    h.run(3.05);
    approx(h.b.players[0].dp, dp0 - cost, `${label(f)}: DP < |extra_cost| ⇒ the trait cost only`);
    assert.equal(u.findBuff(GUARD_KEY), null, `${label(f)}: no guard`);
    h.b.players[0].dp = 20;
    h.run(3);
    approx(h.b.players[0].dp, 20 - Math.abs(tb.extra_cost), `${label(f)}: armed`);
    assert.ok(u.findBuff(GUARD_KEY), `${label(f)}: guard`);
    h.run(3);
    approx(h.b.players[0].dp, 20 - Math.abs(tb.extra_cost) - cost, `${label(f)}: guard held ⇒ trait cost`);
    const e = h.spawn('enemy_dummy', { pos: [10, 8] });
    assert.equal(h.b.applyStatus(u, 'stun', { duration: 5, source: e }), false, `${label(f)}: stun cancelled`);
    assert.ok(!u.s.flags.stun && u.findBuff(GUARD_KEY) === null, `${label(f)}: guard spent`);
    assert.ok(e.s.flags.stun, `${label(f)}: the source is stunned`);
    approx(e.findBuff('stun').timeLeft, tb.stun, `${label(f)}: ${tb.stun} s`, 0.05);
    assert.equal(h.b.applyStatus(u, 'stun', { duration: 1, source: e }), true, `${label(f)}: the next one lands`);
    h.run(3.1);   // re-armed at the next payment (DP is there)
    assert.ok(u.findBuff(GUARD_KEY), `${label(f)}: re-armed`);
    h.b.applyStatus(u, 'cold', { duration: 3, source: e });
    h.b.applyStatus(u, 'cold', { duration: 3, source: e });  // cold on cold ⇒ 冻结: cancelled
    assert.ok(!u.s.flags.freeze && u.findBuff(GUARD_KEY) === null, `${label(f)}: 冻结 cancelled`);
    done(h);
  }
});

test('S1 小惩大诫 (AUTO, SP_FULL): on at 11 / 10 s with nobody on the field; ATK +25 % / +40 %, 法术闪避 20 % / 25 %, for the rest of the deployment', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.spCost, sk.bb.atk, sk.bb.prob], elite ? [10, 0.4, 0.25] : [11, 0.25, 0.2], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 0, dp: 999 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['toggle', 'SP_FULL']);
    h.run(sk.spCost - 0.5);
    assert.equal(u.skill.activations, 0);
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: on at full SP`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.dodgeArts, sk.bb.prob, `T${tier}: 法术闪避`);
    h.run(200);
    assert.ok(u.skill.active, `T${tier}: 持续时间无限`);
    done(h);
  }
});

test('S2 驱凶辟邪: passive ASPD +15 / +20; cast on his attack, the target is marked (taunt +1) and bursts 5 s later for (230 % + 10 % × hits) / (260 % + 15 % × hits) ATK arts within radius 1 (flyers too)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.bb.attack_speed, sk.bb.default_atk_scale, sk.bb.factor_atk_scale, sk.bb.max_stack_cnt, sk.bb.paper_duration, sk.bb.taunt_level],
      elite ? [20, 2.6, 0.15, 25, 5, 1] : [15, 2.3, 0.1, 20, 5, 1], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1, dp: 999 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['instant', 'DEFAULT']);
    approx(u.s.aspd, 100 + sk.bb.attack_speed, `T${tier}: passive`);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `T${tier}: nobody to attack`);
    const t = h.spawn('enemy_dummy', { pos: [10, 6] });
    const near = h.spawn('enemy_fly', { pos: [11, 6] }), far = h.spawn('enemy_dummy', { pos: [10, 8] });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `T${tier}: cast`);
    const mark = t.findBuff(`lmlee:mark:${u.id}`);
    assert.ok(mark, `T${tier}: marked`);
    assert.equal(t.s.taunt, 1, `T${tier}: taunt +1`);
    const t0 = h.b.time;
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => !t.findBuff(`lmlee:mark:${u.id}`), 6), `T${tier}: bursts`);
    approx(h.b.time - t0, sk.bb.paper_duration, `T${tier}: after 5 s`, 0.05);
    const dmg = h.hooksOf('damaged').slice(n0);
    const burst = dmg.filter((c) => c.source === u && c.dmg.tags.includes('lmlee:burst'));
    // his hits on it before the burst (one of his hits in the burst's own tick lands after it and is not counted)
    const all = h.hooksOf('damaged');
    const hits = all.slice(0, all.indexOf(burst[0])).filter((c) => c.target === t && c.source === u && !c.dmg.tags.includes('lmlee:burst')).length;
    assert.deepEqual(burst.map((c) => c.target).sort((a, b) => a.id - b.id), [t, near].sort((a, b) => a.id - b.id), `T${tier}: radius ${MARK_RADIUS}, the flyer too, not 2 tiles away`);
    assert.ok(!burst.some((c) => c.target === far));
    for (const c of burst) {
      assert.equal(c.type, 'arts');
      approx(c.amount, u.s.atk * (sk.bb.default_atk_scale + hits * sk.bb.factor_atk_scale), `T${tier}: ${hits} hits counted`, 1e-3);
    }
    assert.ok(hits >= 4, `T${tier}: his attacks were counted (${hits})`);
    done(h);
  }
});

test('S2 驱凶辟邪 bursts early: at the hit cap, when the target is knocked out, on a recast; when he is knocked out; and vanishes when he leaves without blocking it', () => {
  const sk = skillOf(6, true, S2);
  { // the cap: 25 instances
    const { h, u } = field({ tier: 6, elite: true, skill: 1, dp: 999 });
    const t = h.spawn('enemy_dummy', { pos: [10, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3));
    for (let i = 0; i < sk.bb.max_stack_cnt - 2; i++) h.b.dealDamage(u, t, { amount: 1, type: 'true' });
    assert.ok(t.findBuff(`lmlee:mark:${u.id}`), 'below the cap');
    h.b.dealDamage(u, t, { amount: 1, type: 'true' });
    h.b.dealDamage(u, t, { amount: 1, type: 'true' });
    assert.equal(t.findBuff(`lmlee:mark:${u.id}`), null, 'cap ⇒ at once');
    const b = from(h, u).filter((c) => c.dmg.tags.includes('lmlee:burst'));
    assert.equal(b.length, 1);
    assert.ok(b[0].amount >= u.s.atk * (sk.bb.default_atk_scale + sk.bb.max_stack_cnt * sk.bb.factor_atk_scale) - 1e-3);
    done(h);
  }
  { // knocked out target ⇒ burst on its spot
    const { h, u } = field({ tier: 6, elite: true, skill: 1, dp: 999 });
    const t = h.spawn('enemy_light', { pos: [10, 6] });
    const by = h.spawn('enemy_dummy', { pos: [11, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3));
    h.b.dealDamage(u, t, { amount: 1e7, type: 'true' });
    assert.ok(!t.alive);
    assert.ok(from(h, u).some((c) => c.target === by && c.dmg.tags.includes('lmlee:burst')), 'the neighbour takes the burst');
    done(h);
  }
  { // recast ⇒ the old mark bursts
    const { h, u } = field({ tier: 6, elite: true, skill: 1, dp: 999 });
    const t = h.spawn('enemy_dummy', { pos: [10, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3));
    u.skill.gainSp(999);
    u.skill.opReadyAt = -Infinity;
    assert.ok(h.runUntil(() => u.skill.activations === 2, 3));
    assert.equal(from(h, u).filter((c) => c.dmg.tags.includes('lmlee:burst')).length, 1, 'the first mark burst');
    assert.ok(t.findBuff(`lmlee:mark:${u.id}`), 'a new mark');
    done(h);
  }
  { // he is knocked out ⇒ burst; he leaves without blocking it ⇒ nothing
    for (const how of ['killed', 'retreat']) {
      const { h, u } = field({ tier: 6, elite: true, skill: 1, dp: 999 });
      const t = h.spawn('enemy_dummy', { pos: [10, 6] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.activations === 1, 3));
      if (how === 'killed') h.b.dealDamage(t, u, { amount: 1e8, type: 'true' });
      else h.b.retreat(u);
      assert.equal(t.findBuff(`lmlee:mark:${u.id}`), null, how);
      assert.equal(from(h, u).filter((c) => c.dmg.tags.includes('lmlee:burst')).length, how === 'killed' ? 1 : 0, how);
      done(h);
    }
  }
});

test('S3 贵客盈门 (AUTO, SP_FULL): range x-4, ATK / DEF +31 % / +37 %, taunt +1, every attack pushes the other enemies of his range; 55 % / 60 % dodge of damage from outside his range only', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.bb.atk, sk.bb.def, sk.bb.taunt_level, sk.bb.prob, sk.bb['attack@force'], sk.bb['attack@prob_knockback'], sk.rangeId], elite ? [0.37, 0.37, 1, 0.6, 0, 1, 'x-4'] : [0.31, 0.31, 1, 0.55, 0, 1, 'x-4'], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2, dp: 999, seed: 9 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['toggle', 'SP_FULL']);
    u.skill.gainSp(999);
    h.step();
    assert.ok(u.skill.active, `T${tier}: on at full SP`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: x-4`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.def, u.base.def * (1 + sk.bb.def), `T${tier}: DEF`);
    assert.equal(u.s.taunt, 1, `T${tier}: taunt`);
    // pushes: the target stays, the other enemy of his range is pushed away (radial)
    const a = h.spawn('enemy_dummy', { pos: [10, 6] }), b = h.spawn('enemy_dummy', { pos: [11, 5] });
    assert.ok(h.runUntil(() => h.hooksOf('attack').some((c) => c.attacker === u), 3), `T${tier}: attacks`);
    const main = h.hooksOf('attack').find((c) => c.attacker === u).targets[0];
    const other = main === a ? b : a;
    assert.ok(Math.hypot(main.x - (main === a ? 6 : 5), main.y - (main === a ? 10 : 11)) < 1e-6, `T${tier}: the target is not pushed`);
    assert.ok(Math.hypot(other.x - (other === a ? 6 : 5), other.y - (other === a ? 10 : 11)) > 1, `T${tier}: the other one is pushed`);
    done(h);
  }
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, dp: 999, seed: 21 });
    u.skill.gainSp(999);
    h.step();
    const gun = h.spawn('enemy_gun', { pos: [10, 9] });       // outside x-4
    const fist = h.spawn('enemy_close', { pos: [10, 6] });    // inside it
    h.b.addBuff(u, { key: 'test:tank', mods: { hpFlat: 1e9 } });
    h.run(240);
    const taken = (src) => h.hooksOf('damaged').filter((c) => c.target === u && c.source === src).length;
    const dodged = (src) => h.hooksOf('dodge').filter((c) => c.target === u && c.source === src).length;
    const r = dodged(gun) / (dodged(gun) + taken(gun));
    assert.ok(Math.abs(r - sk.bb.prob) < 0.08, `T${tier}: ${(r * 100).toFixed(0)} % of the ranged hits dodged`);
    assert.equal(dodged(fist), 0, `T${tier}: none from inside his range`);
    assert.ok(taken(fist) > 100);
    done(h);
  }
});
