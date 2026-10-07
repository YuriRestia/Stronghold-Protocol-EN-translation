// test/content/op_phatm2.test.js — the 自选 operator kit of 酒神 (char_1042_phatm2, 6★ 巫役; kit
// server/sim/content/kits/ops/op-phatm2.js) and of her summons 本能的召唤 (token_10054_phatm2_encdool) and 迷狂牢笼
// (token_10055_phatm2_mndclv), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy; 本能的召唤 as the
// placed hand piece of her player) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60,
// rank 7) with no module or RIT-X “酒神之心” at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the
// fidelity checklist of kits/README.md.
// Run: node --test test/content/op_phatm2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ID = 'char_1042_phatm2';
const CALL = 'token_10054_phatm2_encdool', CAGE = 'token_10055_phatm2_mndclv';
const FORMS = BACKUPS.units[ID].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_phatm2';
const S1 = 'skchr_phatm2_1', S2 = 'skchr_phatm2_2', S3 = 'skchr_phatm2_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_elite: dummy('enemy_elite', { rank: 'ELITE' }),
  enemy_shooter: dummy('enemy_shooter', { atk: 300, range: 2, bat: 1 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 1, mass: 0, atk: 50 }),
  enemy_walk_elite: enemyRec({ key: 'enemy_walk_elite', hp: 1e9, speed: 1, mass: 0, atk: 50, rank: 'ELITE' }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], [5, true, null], [5, true, X], [6, true, null], [6, true, X]];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 酒神 as uid 1 at (10, 5) facing RIGHT, plus `others`; `call` = the 本能的召唤 piece's tile (uid 9) or null. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], call = null, callFirst = false, seed = 5 } = {}) {
  const op = { uid: 1, diy: { slot: SLOT[tier], charId: ID, skillIndex: skill, uniEquipId: mod }, elite, row, col };
  const piece = call ? [{ uid: 9, kind: 'token', tokenId: CALL, ownerUid: 1, row: call[0], col: call[1] }] : [];
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'attack', 'elementBurst'], captureNoisy: true,
    units: callFirst ? [...piece, op, ...others] : [op, ...piece, ...others],
  });
  h.step();
  return { h, u: h.unit(1), callUnit: h.b.allyUnits.find((a) => a.kind === 'token' && a.defId === CALL) ?? null };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const elemOf = (h, src, from = 0) => h.hooksOf('damaged').slice(from).filter((c) => c.source === src && c.type === 'element');
const cagesOf = (h) => h.b.allyUnits.filter((a) => a.kind === 'token' && a.defId === CAGE && a.alive);
/** No attacks of hers (to isolate an effect). */
const quiet = (h, u) => h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });

test('酒神 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, y-2, 巫役 (ranged arts, hits air, blocks 1), S1 AUTO on attack SP (data DEFAULT), S2 at full SP (kit), S3 ACTIVE_RANGE on its y-8, ground-targetable, 维多利亚 bond, no 特质', () => {
  assert.equal(OPERATOR_KITS[ID], KITS[ID]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ID, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def, form.stats.res], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat, u.profile.maxTargets], [1, 'ranged', 'arts', true, 1.6, 1], `${label(f)}: 巫役`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: y-2`);
      assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.kind], [['DEFAULT', 'attack', 'instant'], ['SP_FULL', 'time', 'toggle'], ['ACTIVE_RANGE', 'time', 'duration']][skill], `${label(f)}: trigger / SP / kind`);
      if (skill === 2) assert.deepEqual(u.skill.triggerGrid, form.skills[2].rangeGrid, `${label(f)}: the y-8 trigger grid`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['victoriaShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [936, 434, 1111, 486]);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr], [{ maxHp: 125, atk: 30 }, { maxHp: 200, atk: 42 }]);
});

test('a 自选 pick: 酒神 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(ID));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(ID), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: ID, skillIndex: 2, uniEquipId: X } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: ID, skillIndex: 2, uniEquipId: X } } });
});

test('T1 形为心役: every hit of her attacks first gives its target 33 % ATK 神经损伤 and every other enemy within 1.3 of it (中点, air too) 23 % ATK — then the arts damage; one 1.5 away nothing', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const { h, u } = field({ tier, elite, skill: 2 });
    const t1 = formOf(tier, elite).talents[0].bb;
    assert.deepEqual(t1, { 'attack@ep_damage_ratio': 0.33, ep_damage_ratio: 0.23, range_radius: 1.3 });
    const main = h.spawn('enemy_dummy', { pos: [10, 6] });
    const nearFly = h.spawn('enemy_fly', { pos: [11, 6] });
    const far = h.spawn('enemy_dummy', { pos: [11.5, 7] });   // ≈ 1.8 from (10, 6)
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => h.hooksOf('damaged').slice(n0).some((c) => c.source === u && c.dmg?.isAttack && c.target === main), 3));
    const seq = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u);
    const iHit = seq.findIndex((c) => c.dmg?.isAttack && c.target === main);
    const before = seq.slice(0, iHit);
    const mainEl = before.find((c) => c.type === 'element' && c.target === main);
    const flyEl = before.find((c) => c.type === 'element' && c.target === nearFly);
    assert.ok(mainEl && flyEl, '神经损伤 before the damage');
    assert.equal(mainEl.dmg.element, 'neural');
    approx(mainEl.amount, u.s.atk * 0.33, '33 % ATK');
    approx(flyEl.amount, u.s.atk * 0.23, '23 % ATK to the flyer around');
    assert.ok(!before.some((c) => c.target === far), 'outside the 1.3');
    approx(seq[iHit].amount, u.s.atk, 'arts damage = ATK');
    assert.equal(seq[iHit].type, 'arts');
    done(h);
  }
});

test('RIT-X “酒神之心”: her 神经损伤 on an ELITE / leader enemy ×1.18 (stages 1 and 3), on a normal one ×1; none without the module', () => {
  for (const [tier, elite, mod] of [[5, true, X], [6, true, X], [6, true, null], [5, false, null]]) {
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const want = mod ? 1.18 : 1;
    if (mod) assert.equal(modOf(tier, mod).traitOverride.bb.ep_damage_scale, 1.18);
    const el = h.spawn('enemy_elite', { pos: [10, 6] });
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => elemOf(h, u, n0).some((c) => c.target === el), 3));
    approx(elemOf(h, u, n0).find((c) => c.target === el).amount, u.s.atk * 0.33 * want, `${label([tier, elite, mod])}: elite`);
    h.b.kill(el);
    const nm = h.spawn('enemy_dummy', { pos: [10, 6] });
    const n1 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => elemOf(h, u, n1).some((c) => c.target === nm), 3));
    approx(elemOf(h, u, n1).find((c) => c.target === nm).amount, u.s.atk * 0.33, 'normal enemy');
    done(h);
  }
});

test('T2 堕梦: while she is on the field every enemy in a 神经损伤 burst has ASPD −16 (RIT-X stage 3 −24), on the whole field; none outside the burst or once she left', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, X], [5, true, X]]) {
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    quiet(h, u);
    const v = formOf(tier, elite).talents[1].bb.attack_speed + (mod === X && tier === 6 ? -8 : 0);
    const e = h.spawn('enemy_dummy', { pos: [12, 15] });   // far outside her range
    const aspd0 = e.s.aspd;
    e.elem.neural = 999;
    h.b.dealDamage(u, e, { type: 'element', element: 'neural', amount: 10 });
    assert.ok(e.findBuff('neuralBurst'), 'burst');
    h.step();
    approx(e.s.aspd, aspd0 + v, `ASPD ${v}`);
    h.b.retreat(u);
    h.run(0.3);
    approx(e.s.aspd, aspd0, 'she left: gone');
    done(h);
  }
});

test('T2 堕梦: an enemy of her range starting a normal attack first takes 70 (RIT-X stage 3: 90) 神经损伤; a burst from it interrupts that very attack (麻痹); outside her range nothing', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, X]]) {
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    quiet(h, u);
    const val = mod === X && tier === 6 ? 90 : 70;
    const sh = h.spawn('enemy_shooter', { pos: [10, 7] });   // in her y-2, 2 tiles from her
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => h.hooksOf('damaged').slice(n0).some((c) => c.source === sh && c.target === u), 3), 'it shoots her');
    const el = elemOf(h, u, n0).filter((c) => c.target === sh);
    assert.equal(el.length, 1, 'one 神经损伤 per attack');
    approx(el[0].amount, val, `${val}`);
    // a burst from it: the attack is interrupted
    sh.elem.neural = 1000 - val + 1;
    const hp0 = u.hp, n1 = h.hooksOf('damaged').length;
    h.run(1.05);
    assert.ok(sh.findBuff('neuralBurst'), 'burst on its attack');
    assert.ok(!h.hooksOf('damaged').slice(n1).some((c) => c.source === sh && c.target === u && c.dmg?.isAttack), 'that attack never lands');
    assert.equal(u.hp, hp0);
    // outside her range
    const out = h.spawn('enemy_shooter', { pos: [12, 8] });
    h.b.relocate(u, 10, 5);
    const n2 = h.hooksOf('damaged').length;
    h.run(3);
    assert.ok(!elemOf(h, u, n2).some((c) => c.target === out), '(12, 8) is outside her y-2');
    done(h);
  }
});

test('S1 暗夜回声 (AUTO, 3 attack SP): every 4th attack hits twice for 105 % / 120 % ATK arts, an enemy not in a burst first, and roots it 2 / 3 s; while that root holds 神经损伤 on it ×1.3 / ×1.5 (from anyone)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.spCost, sk.initSp, sk.bb.atk_scale, sk.bb.times, sk.bb.unmove, sk.bb.ep_damage_scale], [3, 0, elite ? 1.2 : 1.05, 2, elite ? 3 : 2, elite ? 1.5 : 1.3]);
    const { h, u } = field({ tier, elite, skill: 0 });
    const burst = h.spawn('enemy_dummy', { pos: [10, 6] });
    const fresh = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.b.addBuff(burst, { key: 'neuralBurst', duration: 100, flags: { burstLock: true } });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 10));
    h.run(0.5);   // the bolts land
    const atks = h.hooksOf('attack').filter((c) => c.attacker === u);
    assert.deepEqual(atks.map((c) => c.isSkill), [false, false, false, true], 'three plain attacks, then the skill\'s');
    const skillHits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack && c.dmg.isSkill);
    assert.equal(skillHits.length, 2, 'two hits');
    assert.ok(skillHits.every((c) => c.target === fresh), 'the enemy not in a burst');
    for (const c of skillHits) approx(c.amount, u.s.atk * sk.bb.atk_scale, `${sk.bb.atk_scale * 100} %`);
    const bind = h.hooksOf('statusApplied').find((c) => c.status === 'bind' && c.target === fresh);
    assert.ok(bind, 'rooted');
    approx(bind.duration, sk.bb.unmove, 'root time');
    // (her hits so far plus the ones during the root — T1 33 % / 23 % ATK at full potential — would burst it before the
    // ×1 check below, and a bursting enemy takes no 神经损伤: its gauge starts over here)
    fresh.elem.neural = 0;
    const n0 = h.hooksOf('damaged').length;
    const other = h.spawn('enemy_dummy', { pos: [12, 12] });
    h.b.dealDamage(other, fresh, { type: 'element', element: 'neural', amount: 100 });
    approx(h.hooksOf('damaged').slice(n0).find((c) => c.target === fresh && c.type === 'element').amount, 100 * sk.bb.ep_damage_scale, `×${sk.bb.ep_damage_scale} while rooted`);
    h.run(sk.bb.unmove + 0.1);
    const n1 = h.hooksOf('damaged').length;
    h.b.dealDamage(other, fresh, { type: 'element', element: 'neural', amount: 100 });
    approx(h.hooksOf('damaged').slice(n1).find((c) => c.target === fresh && c.type === 'element').amount, 100, '×1 after it');
    done(h);
  }
});

test('S2 群体性谵妄 (AUTO, at full SP, endless): cast after 33 / 30 s with no enemy; ASPD +20 / +25; T1\'s splash radius 1.5; it never ends', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.spCost, sk.initSp, sk.bb.attack_speed, sk.bb['talent@range_radius']], [elite ? 30 : 33, 0, elite ? 25 : 20, 1.5]);
    const { h, u } = field({ tier, elite, skill: 1 });
    h.run(sk.spCost - 0.5);
    assert.equal(u.skill.activations, 0);
    assert.ok(h.runUntil(() => u.skill.active, 1), 'at full SP');
    approx(u.s.aspd, 100 + sk.bb.attack_speed, 'ASPD');
    const main = h.spawn('enemy_dummy', { pos: [10, 6] });
    const at14 = h.spawn('enemy_dummy', { pos: [11.4, 6] });   // 1.4 away: inside 1.5, outside 1.3
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => elemOf(h, u, n0).some((c) => c.target === at14), 3), 'the 1.5 splash');
    void main;
    h.run(200);
    assert.ok(u.skill.active, 'endless');
    done(h);
  }
});

test('S2 + 本能的召唤: the placed piece deploys at the battle start (untargetable, no attack, no block), 诱导s the enemies entering its x-1 (at most 4, ELITE first), leaves 10 s after or when one reaches it; leaving: every enemy of its x-1 停顿 6 s and 12 × (15 % / 20 % ATK 神经损伤 + 100 % / 120 % ATK arts) over 6 s at her ATK of its deployment; back with S2 and again 25 s after each exit while it runs; her leaving withdraws it', () => {
  for (const [tier, elite, callFirst] of [[5, false, false], [6, true, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u, callUnit } = field({ tier, elite, skill: 1, call: [10, 6], callFirst });
    const call = callUnit;
    assert.ok(call && call.alive, 'deployed with the board');
    assert.ok(call.s.flags.untargetable && call.profile.noAttack && call.s.blockCnt === 0, 'untargetable, no attack, no block');
    const atkAtDeploy = u.s.atk;
    // nothing to lure: it leaves after 10 s; the enemies of its x-1 then get the 停顿 and the damage
    const inside = h.spawn('enemy_dummy', { pos: [11, 7] });
    h.b.addBuff(inside, { key: 'test:noattract', flags: { attract: true } });   // (already lured elsewhere: not taken)
    h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });                   // her ATK changes after the deployment
    quiet(h, u);
    assert.ok(h.runUntil(() => !call.alive, 11), 'leaves after 10 s');
    approx(h.hooksOf('death').find((c) => c.unit === call).t, 10, '10 s', 0.05);
    h.b.removeBuff(inside, 'test:noattract');
    const slow = h.hooksOf('statusApplied').find((c) => c.status === 'sluggish' && c.target === inside);
    assert.ok(slow);
    approx(slow.duration, sk.bb.sluggish, '停顿 6 s');
    const n0 = h.hooksOf('damaged').length;
    h.run(6.2);
    const ticks = h.hooksOf('damaged').slice(n0).filter((c) => c.target === inside && c.source === u);
    const arts = ticks.filter((c) => c.type === 'arts'), neural = ticks.filter((c) => c.type === 'element');
    assert.equal(arts.length, 12, '12 arts ticks');
    // 12 神经损伤 ticks — unless the gauge bursts first (then the 爆发冷却 takes no more: elite 12 × 97.2 > 1000)
    const per = atkAtDeploy * sk.bb.ep_damage_ratio_token;
    assert.equal(neural.length, Math.min(12, Math.ceil(1000 / per)), '神经损伤 ticks');
    for (const c of arts) approx(c.amount, atkAtDeploy * sk.bb.atk_scale, `arts ${sk.bb.atk_scale * 100} % of the cached ATK`);
    for (const c of neural) approx(c.amount, atkAtDeploy * sk.bb.ep_damage_ratio_token, `神经损伤 ${sk.bb.ep_damage_ratio_token * 100} %`);
    assert.ok(arts.every((c) => c.dmg.tags.includes('dot') && c.dmg.canDodge === false), '持续伤害');
    h.b.removeBuff(u, 'test:atk');
    h.b.kill(inside);
    // S2 (at full SP: 33 / 30 s) gives it back, after its own 25 s redeploy time from its exit at 10 s
    assert.ok(h.runUntil(() => u.skill.active, 20));
    approx(h.b.time, sk.spCost, 'S2 at full SP', 0.05);
    assert.ok(!call.alive, 'still in its redeploy time');
    assert.ok(h.runUntil(() => call.alive, 6), 'back with S2');
    approx(h.b.time, 35, 'at 10 + 25 s', 0.6);
    const t0 = h.b.time;
    // five walkers on row 9 enter its x-1 at (9, 7) together: four are lured, the elite first; the first to arrive ends it
    const w = [h.spawn('enemy_walk', { routeIndex: 0 }), h.spawn('enemy_walk', { routeIndex: 0 }), h.spawn('enemy_walk', { routeIndex: 0 }),
      h.spawn('enemy_walk', { routeIndex: 0 }), h.spawn('enemy_walk_elite', { routeIndex: 0 })];
    assert.ok(h.runUntil(() => !call.alive, 12), 'gone again');
    const lured = h.hooksOf('statusApplied').filter((c) => c.status === 'attract' && c.source === call && c.t >= t0);
    assert.equal(lured.length, 4, 'max_target 4');
    assert.equal(lured[0].target, w[4], 'the elite first');
    assert.equal(new Set(lured.map((c) => c.target)).size, 4);
    const exitT = h.hooksOf('death').filter((c) => c.unit === call).at(-1).t;
    assert.ok(exitT - t0 < 10 - 0.5, `left on an arrival, before its 10 s (${(exitT - t0).toFixed(2)} s)`);
    assert.ok(lured.some((c) => Math.hypot(c.target.x - 6, c.target.y - 10) <= 0.4 + 1e-6), 'one of them within 0.4 of it');
    assert.ok(w.every((e) => !e.findBuff('attract') || e.findBuff('attract').source !== call), 'the 诱导 ends with it');
    // 25 s later it is back (S2 still runs)
    h.run(24.5);
    assert.ok(!call.alive);
    assert.ok(h.runUntil(() => call.alive, 1.5), 'back after its own redeploy time');
    h.b.retreat(u);
    h.step();
    assert.ok(!call.alive, 'withdrawn when she leaves');
    h.run(30);
    assert.ok(!call.alive, 'not back without her');
    done(h);
  }
});

test('本能的召唤: an ELITE in its x-1 is lured before normal enemies; only reachable ground enemies (flyers always)', () => {
  const { h, u, callUnit } = field({ skill: 1, call: [11, 6] });
  quiet(h, u);
  const n = [h.spawn('enemy_dummy', { pos: [12, 6] }), h.spawn('enemy_dummy', { pos: [11, 5] }), h.spawn('enemy_dummy', { pos: [11, 7] }),
    h.spawn('enemy_dummy', { pos: [10, 6] }), h.spawn('enemy_elite', { pos: [12, 7] })];
  h.run(0.15);
  const lured = h.hooksOf('statusApplied').filter((c) => c.status === 'attract' && c.source === callUnit).map((c) => c.target);
  assert.equal(lured.length, 4, 'four');
  assert.equal(lured[0], n[4], 'the elite first');
  done(h);
});

test('S3 空剧场 (ACTIVE_RANGE on y-8): range y-8 while on, ATK +75 % / +95 %, an enemy not in a burst first; her 神经损伤 starts 10 % ATK 神经损伤 a second (from 0.1 s) until a burst; the 爆发冷却 of enemies in her range runs 1.5×', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const form = formOf(tier, elite);
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.ep_damage_ratio, sk.bb.interval, sk.bb['talent@ep_break_recover_speed'], sk.bb['phatm2_s_3[token_cooldown].interval']],
      [30, elite ? 0.95 : 0.75, 0.1, 1, 0.5, 30]);
    const { h, u } = field({ tier, elite, skill: 2 });
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, 'no enemy: no cast');
    const e = h.spawn('enemy_dummy', { pos: [10, 8] });   // y-8 (+3), not y-2
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast on the y-8');
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, 'y-8 while on');
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), 'ATK');
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => elemOf(h, u, n0).some((c) => c.target === e), 3), 'her first 神经损伤');
    const t0 = elemOf(h, u, n0).find((c) => c.target === e).t;
    quiet(h, u);
    h.run(2.2);
    const dot = elemOf(h, u, n0).filter((c) => c.target === e && c.dmg.tags.includes('phatm2:theatre'));
    assert.ok(dot.length >= 2, `${dot.length} ticks`);
    approx(dot[0].t - t0, 0.1, 'first at 0.1 s', 0.05);
    approx(dot[1].t - dot[0].t, 1, 'then each second', 0.05);
    for (const c of dot) approx(c.amount, u.s.atk * 0.1, '10 % ATK');
    // until a burst
    e.elem.neural = 999;
    h.run(1.1);
    assert.ok(e.findBuff('neuralBurst'), 'burst');
    const n1 = h.hooksOf('damaged').length;
    h.run(3);
    assert.equal(elemOf(h, u, n1).filter((c) => c.target === e && c.dmg.tags.includes('phatm2:theatre')).length, 0, 'stops in a burst');
    // the 爆发冷却 runs 1.5× in her range
    const lock = e.findBuff('neuralBurst');
    const left = lock.timeLeft;
    h.run(1);
    approx(left - lock.timeLeft, 1.5, 'cooldown 1.5×', 0.05);
    h.runUntil(() => !u.skill.active, 35);
    assert.deepEqual(u.liveRangeGrid, form.rangeGrid, 'back to y-2');
    done(h);
  }
});

test('S3 迷狂牢笼: a 神经损伤 burst of an enemy in her range puts a 牢笼 on its ground tile that blocks the enemies on it (air too), takes 1 per hit from them only, falls after 3 hits; it takes nobody else; refreshed by a burst on its tile; leaves with nobody blocked, 30 s after the skill, or when she leaves', () => {
  const { h, u } = field({ skill: 2 });
  h.spawn('enemy_dummy', { pos: [10, 8] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  quiet(h, u);
  const a = h.spawn('enemy_shooter', { pos: [11, 7] }), fly = h.spawn('enemy_fly', { pos: [11, 7] });
  a.elem.neural = 990;
  h.b.dealDamage(u, a, { type: 'element', element: 'neural', amount: 20 });
  const cage = cagesOf(h)[0];
  assert.ok(cage, 'a 牢笼');
  assert.deepEqual([cage.tileR, cage.tileC, cage.ownerUnit === u], [11, 7, true]);
  assert.ok(a.blockedBy === cage && fly.blockedBy === cage, 'both blocked, the flyer too');
  assert.equal(cage.s.blockCnt, 2, 'block count = their weight');
  assert.ok(cage.s.flags.isolated && cage.s.flags.noHeal && cage.profile.noAttack, '孤立, 禁疗, no attack');
  // damage: from another enemy nothing, from a blocked one 1
  const other = h.spawn('enemy_dummy', { pos: [12, 12] });
  h.b.dealDamage(other, cage, { amount: 500, type: 'phys' });
  assert.equal(cage.hp, 3, 'immune to an enemy it does not block');
  h.b.dealDamage(null, cage, { amount: 500, type: 'true', sourceless: true });
  assert.equal(cage.hp, 3, '无来源: nothing');
  h.b.dealDamage(fly, cage, { amount: 500, type: 'phys' });
  assert.equal(cage.hp, 2, '1 per hit');
  // an enemy arriving on its tile is not taken by contact
  const late = h.spawn('enemy_dummy', { pos: [11, 7] });
  h.run(0.2);
  assert.equal(late.blockedBy, null, 'no new block by contact');
  // refreshed by its 神经损伤 burst on that tile: HP back, it is blocked too
  late.elem.neural = 999;
  h.b.dealDamage(u, late, { type: 'element', element: 'neural', amount: 10 });
  assert.equal(late.blockedBy, cage, 'refreshed: blocked');
  assert.equal(cage.hp, 3, 'full HP again');
  assert.equal(cage.s.blockCnt, 3);
  assert.equal(cagesOf(h).length, 1, 'no second 牢笼 on the tile');
  // three hits from a blocked enemy: gone, the enemies released
  for (let i = 0; i < 3; i++) h.b.dealDamage(fly, cage, { amount: 100, type: 'phys' });
  assert.ok(!cage.alive, 'three hits');
  assert.ok(!a.blockedBy && !fly.blockedBy, 'released');
  done(h);
});

test('S3 迷狂牢笼: no 牢笼 on a tile with a unit or on high ground; at the skill start the enemies of her range already in a burst set T1\'s splash off once and get one; 牢笼 last 30 s after the skill; her leaving withdraws them', () => {
  const { h, u } = field({ skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 11, col: 6 }] });
  quiet(h, u);
  // already bursting before the skill
  const pre = h.spawn('enemy_dummy', { pos: [10, 7] }), side = h.spawn('enemy_dummy', { pos: [10.9, 7] });
  pre.elem.neural = 999;
  h.b.dealDamage(u, pre, { type: 'element', element: 'neural', amount: 10 });
  assert.ok(pre.findBuff('neuralBurst'));
  const n0 = h.hooksOf('damaged').length;
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  const splash = elemOf(h, u, n0).filter((c) => c.target === side);
  assert.equal(splash.length, 1, 'T1\'s splash once around it');
  approx(splash[0].amount, u.s.atk * 0.23, '23 % of her (S3) ATK');
  const c1 = cagesOf(h).find((c) => c.tileR === 10 && c.tileC === 7);
  assert.ok(c1 && pre.blockedBy === c1, 'a 牢笼 for the bursting one');
  // a unit on the tile: none
  const onAlly = h.spawn('enemy_dummy', { pos: [11, 6] });
  onAlly.elem.neural = 999;
  h.b.dealDamage(u, onAlly, { type: 'element', element: 'neural', amount: 10 });
  assert.ok(!cagesOf(h).some((c) => c.tileR === 11 && c.tileC === 6), 'not on 角峰\'s tile');
  // the skill ends: 30 s more
  u.skill.end('test');
  h.run(29.5);
  if (pre.alive && pre.blockedBy === c1) assert.ok(c1.alive, 'still there at 29.5 s');
  h.run(1);
  assert.ok(!c1.alive, 'gone 30 s after the skill');
  // her leaving withdraws them
  u.skill.gainSp(999);
  const late = h.spawn('enemy_dummy', { pos: [12, 7] });
  assert.ok(h.runUntil(() => u.skill.active, 4));
  late.elem.neural = 999;
  h.b.dealDamage(u, late, { type: 'element', element: 'neural', amount: 10 });
  assert.ok(cagesOf(h).length >= 1);
  h.b.retreat(u);
  h.step();
  assert.equal(cagesOf(h).length, 0, 'withdrawn with her');
  done(h);
});
