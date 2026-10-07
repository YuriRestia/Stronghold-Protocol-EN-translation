// test/content/op_huang.test.js — the 自选 operator kit of 煌 (char_017_huang, 6★ 强攻手; kit
// server/sim/content/kits/ops/op-huang.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, CEN-X
// “过载的武器与过热的心脏” or CEN-Y “稍后回来” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from
// data/backups.json (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_huang.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const HUANG = 'char_017_huang';
const FORMS = BACKUPS.units[HUANG].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const CENX = 'uniequip_002_huang', CENY = 'uniequip_003_huang';
const S1 = 'skchr_huang_1', S2 = 'skchr_huang_2', S3 = 'skchr_huang_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_hitter: dummy('enemy_hitter', { atk: 400, bat: 1 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, CENX, CENY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 煌 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied', 'fatal'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: HUANG, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.target?.side === 'enemy');
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('煌 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 3 and strikes every blocked enemy, melee ground-only, 炎 + 维多利亚, no 特质', () => {
  assert.equal(OPERATOR_KITS[HUANG], KITS[HUANG]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [HUANG, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.hitAllBlocked, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [3, true, 'melee', false, 'phys', 1.2], `${label(f)}: 强攻手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip', 'victoriaShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN, full potential): E2 Lv1 2115 / 609 / 303, E2 Lv60 2583 / 731 / 347; CEN-X +240 / +50 → +285 / +86
  // HP / ATK, CEN-Y +300 / +40 → +345 / +66
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2115, 609, 2583, 731]);
  assert.deepEqual([modOf(5, CENX).attr, modOf(6, CENX).attr, modOf(5, CENY).attr, modOf(6, CENY).attr], [{ maxHp: 240, atk: 50 }, { maxHp: 285, atk: 86 }, { maxHp: 300, atk: 40 }, { maxHp: 345, atk: 66 }]);
});

test('a 自选 pick: 煌 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(HUANG));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(HUANG), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: HUANG, skillIndex: 2, uniEquipId: CENY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: HUANG, skillIndex: 2, uniEquipId: CENY } } });
});

test('S1 强力击·γ型 (AUTO, attack SP 3, data DEFAULT): her 4th attack is the skill one — 205 % / 225 % ATK on every enemy she blocks', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0, row: 9 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.initSp, sk.bb.atk_scale], ['DEFAULT', 'attack', 3, 0, elite ? 2.25 : 2.05], `T${tier}`);
    const foes = [0, 1, 2].map(() => h.spawn('enemy_dummy', { pos: [9, 5] }));
    h.step();
    assert.equal(u.blocking.length, 3, `T${tier}: blocks all three`);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 10), `T${tier}: cast`);
    h.step();
    const attacks = [...new Set(hitsBy(h, u).map((c) => c.dmg.attackId))];
    assert.equal(attacks.length, 4, `T${tier}: the 4th attack (3 SP, then the skill attack)`);
    const last = hitsBy(h, u).filter((c) => c.dmg.attackId === attacks[3]);
    assert.deepEqual(last.map((c) => c.target).sort((a, b) => a.id - b.id), foes.sort((a, b) => a.id - b.id), `T${tier}: every blocked enemy`);
    for (const c of last) {
      approx(c.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} %`);
      assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true]);
    }
    for (const c of hitsBy(h, u).filter((c) => c.dmg.attackId !== attacks[3])) approx(c.amount, u.s.atk, `T${tier}: plain attacks`);
    done(h);
  }
});

test('S2 链锯延伸模块 (AUTO, 持续时间无限): on as soon as its 85 / 80 SP are full — no enemy needed —, ATK +55 % / +70 %, DEF +15 % / +20 %, range 2-2, never ends', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.kind, u.skill.rule, u.skill.spCost, sk.initSp, sk.bb.atk, sk.bb.def, sk.duration], ['toggle', 'SP_FULL', elite ? 80 : 85, 0, elite ? 0.7 : 0.55, elite ? 0.2 : 0.15, -1], `T${tier}`);
    h.run(sk.spCost - 1);
    assert.equal(u.skill.activations, 0, `T${tier}: not before its SP is full`);
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: on at full SP, no enemy on the field`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.def, u.base.def * (1 + sk.bb.def), `T${tier}: DEF`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 2-2`);
    assert.deepEqual(sk.rangeGrid, [[0, 0], [0, 1], [0, 2]]);
    const far = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.run(3);
    assert.ok(hitsBy(h, u).some((c) => c.target === far), `T${tier}: strikes two tiles ahead`);
    h.run(300);
    assert.ok(u.skill.active, `T${tier}: still on (持续时间无限)`);
    done(h);
  }
});

test('S3 沸腾爆裂 (data DEFAULT, 维持技能状态, 10 s): no normal attack; a cut every second for 8 s on the ground enemies of her 1-1 (not air), ATK / DEF ramp to +45 % / +60 % (full at 8.95 s); at 9 s −25 % max HP (never below 1) and 320 % / 340 % on the 3 × 3 ahead, air too', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.rule, u.skill.kind, sk.duration, sk.bb.atk, sk.bb.def, sk.bb.hp_ratio, sk.bb.damage_by_atk_scale, sk.rangeGrid],
      ['DEFAULT', 'duration', 10, elite ? 0.6 : 0.45, elite ? 0.6 : 0.45, 0.25, elite ? 3.4 : 3.2, null], `T${tier}`);
    const front = h.spawn('enemy_dummy', { pos: [10, 6] });
    const own = h.spawn('enemy_dummy', { pos: [10, 5] });
    const flyIn = h.spawn('enemy_fly', { pos: [10, 6] });
    const side = h.spawn('enemy_dummy', { pos: [9, 6] });      // 3-6, not 1-1
    const ahead2 = h.spawn('enemy_dummy', { pos: [10, 7] });   // 3-6, not 1-1
    const flySide = h.spawn('enemy_fly', { pos: [11, 7] });    // 3-6 (air)
    const outside = h.spawn('enemy_dummy', { pos: [10, 8] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in her range`);
    const t0 = h.b.time;
    approx(u.s.atk, u.base.atk, `T${tier}: no bonus before the first update`);
    const at = [], hits = [];
    let ended = false, lossAt = null;
    h.b.on('damaged', (c) => { if (c.target === u && c.dmg?.tags?.includes('hpLoss')) lossAt = h.b.time - t0; });
    h.b.on('skillEnd', (c) => { if (c.unit === u) ended = true; });
    h.b.on('damaged', (c) => {
      if (c.source !== u || c.target?.side !== 'enemy' || ended) return;
      hits.push(c);
      if (c.target === front) at.push({ t: h.b.time - t0, amt: c.amount, atk: u.s.atk, def: u.s.def });
    });
    h.runUntil(() => !u.skill.active, 12);
    const span = h.b.time - t0;
    assert.ok(span > 9.9 && span < 10.1, `T${tier}: the state lasts its 10 s (${span})`);
    approx(lossAt, 9, `T${tier}: the finish at 9 s`, 0.05);
    approx(at[8].t, 9, `T${tier}: the burst at 9 s`, 0.05);
    assert.ok(hits.every((c) => c.dmg.isSkill && !c.dmg.isAttack), `T${tier}: no normal attack while it runs`);
    const cutsOn = (e) => hits.filter((c) => c.target === e).length;
    assert.deepEqual([cutsOn(front), cutsOn(own)], [9, 9], `T${tier}: 8 cuts + the burst on her 1-1`);
    assert.deepEqual([cutsOn(flyIn), cutsOn(side), cutsOn(ahead2), cutsOn(flySide), cutsOn(outside)], [1, 1, 1, 1, 0], `T${tier}: the burst alone on the 3 × 3 (air too); nothing outside`);
    const D = sk.duration - 1.05;
    for (let k = 1; k <= 8; k++) {
      const c = at[k - 1];
      approx(c.t, k, `T${tier}: cut ${k} at ${k} s`, 0.05);
      approx(c.atk, u.base.atk * (1 + sk.bb.atk * Math.min(1, k / D)), `T${tier}: ATK at cut ${k}`);
      approx(c.def, u.base.def * (1 + sk.bb.def * Math.min(1, k / D)), `T${tier}: DEF at cut ${k}`);
      approx(c.amt, c.atk, `T${tier}: cut ${k} = 100 % ATK`);
    }
    approx(at[8].amt, u.base.atk * (1 + sk.bb.atk) * sk.bb.damage_by_atk_scale, `T${tier}: the burst at full ATK`);
    const loss = h.hooksOf('damaged').filter((c) => c.target === u && c.dmg?.tags?.includes('hpLoss'));
    assert.equal(loss.length, 1, `T${tier}: one 流失`);
    approx(loss[0].amount, u.s.maxHp * 0.25, `T${tier}: 25 % of MAX HP`);
    assert.equal(u.findBuff('skill:huang:ramp'), null, `T${tier}: the bonus goes with the skill`);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: her range throughout`);
    done(h);
  }
});

test('S3 沸腾爆裂: the 流失 never takes her below 1 HP; a 晕眩 ends the 维持技能状态 early — it still finishes (流失 + burst)', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2 });
  u.skill.gainSp(999);
  h.run(2);
  assert.equal(u.skill.activations, 0, 'DEFAULT: no enemy, no cast');
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  assert.ok(h.runUntil(() => u.skill.active, 3));
  h.run(3.2);
  const n0 = hitsBy(h, u).filter((c) => c.target === e).length;
  assert.equal(n0, 3, 'three cuts');
  h.b.applyStatus(u, 'stun', { duration: 2, source: e });
  h.step();
  assert.ok(!u.skill.active, 'the stun ended it');
  const after = hitsBy(h, u).filter((c) => c.target === e);
  assert.equal(after.length, 4, 'the burst on its end');
  approx(after[3].amount, u.base.atk * (1 + 0.6 * 3 / 8.95) * 3.4, 'the burst at the ATK of that moment (three updates)');
  done(h);
  // the non-lethal 流失: at 10 % HP the skill end leaves her at 1 HP (her 紧急除颤 then fires: HP ≤ 25 %)
  const r = field({ tier: 5, elite: false, skill: 2 });
  r.h.spawn('enemy_dummy', { pos: [10, 6] });
  r.u.mem.huangDefib.undeadA = false;     // talent already spent: only the 流失's own floor
  r.u.hp = r.u.s.maxHp * 0.1;
  r.u.skill.gainSp(999);
  assert.ok(r.h.runUntil(() => r.u.skill.active, 3));
  r.h.runUntil(() => !r.u.skill.active, 12);
  assert.ok(r.u.alive && Math.abs(r.u.hp - 1) < 1e-6, `left at 1 HP (${r.u.hp})`);
  done(r.h);
});

test('T1 紧急除颤: 不死 until her HP first reaches ≤ 25 % — then +50 % max HP and for 7 s no damage takes her below 50 % (a 流失 still does); once per deployment, again after a redeploy', () => {
  for (const f of [[5, false, null], [6, true, CENX], [5, true, CENY]]) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const t0 = u.def.raw.talents.find((t) => t.index === 0).bb;
    assert.deepEqual([t0.hp_ratio, t0['huang_t_1[heal].hp_ratio'], t0['huang_t_1[lock].min_hp_ratio'], t0['huang_t_1[lock].duration']], [0.25, 0.5, 0.5, 7], label(f));
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const max = u.s.maxHp;
    // a lethal hit from full HP: 不死 keeps her at 1 HP, the talent heals 50 %
    h.b.dealDamage(e, u, { amount: max * 5, type: 'true' });
    assert.ok(u.alive, `${label(f)}: 不死`);
    approx(u.hp, 1 + max * 0.5, `${label(f)}: 1 HP + 50 %`);
    const lockStart = h.b.time;
    // inside 7 s: a 60 % hit stops at exactly 50 %
    h.b.dealDamage(e, u, { amount: max * 0.6, type: 'true' });
    approx(u.hp, max * 0.5, `${label(f)}: held at 50 %`);
    h.b.dealDamage(e, u, { amount: max * 0.3, type: 'true' });
    approx(u.hp, max * 0.5, `${label(f)}: below 50 % nothing passes`);
    h.b.loseHp(u, max * 0.1, { source: e });
    approx(u.hp, max * 0.4, `${label(f)}: a 流失 is not held`);
    h.run(7 - (h.b.time - lockStart) + 0.1);
    h.b.dealDamage(e, u, { amount: max * 0.3, type: 'true' });
    approx(u.hp, max * 0.1, `${label(f)}: the lock is over`);
    h.b.dealDamage(e, u, { amount: max, type: 'true' });
    assert.ok(!u.alive, `${label(f)}: spent — the next lethal hit kills`);
    // a redeploy re-arms it
    h.b.redeploy(u);
    h.step();
    h.b.dealDamage(e, u, { amount: u.s.maxHp * 0.8, type: 'true' });
    approx(u.hp, u.s.maxHp * 0.7, `${label(f)}: again after the redeploy (20 % + 50 %)`);
    done(h);
  }
});

test('T2 严酷训练: 12 s after each deployment 抵抗 (control statuses last half as long); CEN-X stage 3 adds ATK +6 % after 30 s and ASPD +12 after 45 s (stage 1: nothing more)', () => {
  for (const f of [[5, false, null], [5, true, CENX], [6, true, CENX], [6, true, CENY]]) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const x3 = tier === 6 && mod === CENX;
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.run(11.8);
    assert.equal(h.b.resistOf(u), 0, `${label(f)}: no 抵抗 before 12 s`);
    h.run(0.4);
    assert.equal(h.b.resistOf(u), 0.5, `${label(f)}: 抵抗 at 12 s`);
    h.b.applyStatus(u, 'stun', { duration: 2, source: e });
    approx(u.findBuff('stun').timeLeft, 1, `${label(f)}: a 2 s stun lasts 1 s`);
    h.run(18);
    assert.equal(!!u.findBuff('talent:huang:atk'), x3, `${label(f)}: ATK +6 % after 30 s`);
    if (x3) approx(u.s.atk, u.base.atk * 1.06, 'ATK +6 %');
    h.run(15);
    assert.equal(!!u.findBuff('talent:huang:aspd'), x3, `${label(f)}: ASPD +12 after 45 s`);
    if (x3) assert.equal(u.s.aspd, 112);
    // per deployment: knocked out and back, the timer starts again
    h.b.kill(u, e);
    assert.ok(!u.alive);
    h.b.redeploy(u);
    h.step();
    assert.deepEqual([h.b.resistOf(u), !!u.findBuff('talent:huang:atk')], [0, false], `${label(f)}: reset by the redeploy`);
    h.run(12.2);
    assert.equal(h.b.resistOf(u), 0.5, `${label(f)}: 抵抗 again 12 s later`);
    done(h);
  }
});

test('CEN-X (stages 1 and 3): ×1.1 ATK scale on every damage of hers to a blocked enemy (normal attacks and S3 cuts) — none to an unblocked one; none without the module', () => {
  for (const f of [[5, true, null], [5, true, CENX], [6, true, CENX], [6, true, CENY]]) {
    const [tier, elite, mod] = f;
    const mul = mod === CENX ? 1.1 : 1;
    if (mod === CENX) assert.deepEqual(formOf(tier, true).modules.find((m) => m.uniEquipId === CENX).traitOverride.bb, { atk_scale: 1.1 });
    const { h, u } = field({ tier, elite, mod, skill: 2, row: 9 });
    const blocked = h.spawn('enemy_dummy', { pos: [9, 5] });
    h.step();
    assert.equal(blocked.blockedBy, u, `${label(f)}: blocked`);
    h.run(3);
    const plain = hitsBy(h, u).filter((c) => c.target === blocked && !c.dmg.isSkill);
    assert.ok(plain.length >= 2, label(f));
    for (const c of plain) approx(c.amount, u.s.atk * mul, `${label(f)}: blocked target`);
    const free = h.spawn('enemy_dummy', { pos: [9, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    h.run(1.1);
    const cut = hitsBy(h, u).filter((c) => c.dmg.isSkill);
    approx(cut.find((c) => c.target === blocked).amount, u.s.atk * mul, `${label(f)}: S3 cut on the blocked one`);
    approx(cut.find((c) => c.target === free).amount, u.s.atk, `${label(f)}: S3 cut on the free one`);
    done(h);
  }
});

test('CEN-Y stage 1: −20 % physical damage taken above 50 % HP (arts untouched); stage 3: 紧急除颤 at 50 % then a second trigger at 25 % (its own 不死, 9 s), and 150 DEF ignored while above 50 %', () => {
  for (const tier of [5, 6]) {
    const { h, u } = field({ tier, elite: true, mod: CENY, skill: 0 });
    assert.deepEqual(u.def.raw.trait.bb, { hp_ratio: 0.5, damage_resistance: 0.2 });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.step();
    assert.equal(u.s.defIgnoreFlat, tier === 6 ? 150 : 0, `T${tier}: 150 DEF ignored above 50 % from stage 2 on`);
    const max = u.s.maxHp;
    let hp = u.hp;
    h.b.dealDamage(e, u, { amount: 1000, type: 'phys' });
    approx(hp - u.hp, Math.max(1000 - u.s.def, 50) * 0.8, `T${tier}: physical ×0.8`);
    hp = u.hp;
    h.b.dealDamage(e, u, { amount: 300, type: 'arts' });
    approx(hp - u.hp, 300, `T${tier}: arts untouched`);
    hp = u.hp;
    h.b.dealDamage(e, u, { amount: 200, type: 'true' });
    approx(hp - u.hp, 200, `T${tier}: true untouched`);
    u.mem.huangDefib.undeadA = u.mem.huangDefib.undeadB = false;   // (stage 3's talent would fire at 50 %)
    u.hp = max * 0.5;
    hp = u.hp;
    h.b.dealDamage(e, u, { amount: 1000, type: 'phys' });
    approx(hp - u.hp, Math.max(1000 - u.s.def, 50), `T${tier}: at 50 % (not above) the full physical damage`);
    done(h);
  }
  // stage 3: the talent fires at 50 % (9 s), the hidden part at 25 % — only once the first is spent
  const { h, u } = field({ tier: 6, elite: true, mod: CENY, skill: 0 });
  const t0 = u.def.raw.talents.find((t) => t.index === 0).bb;
  const hid = Object.assign({}, ...u.def.raw.talents.filter((t) => t.index === -1).map((t) => t.bb));
  assert.deepEqual([t0.hp_ratio, t0['huang_t_1[lock].duration'], hid.def_penetrate_fixed, hid['huang_e_003[lock].check_hp_ratio'], hid['huang_e_003[lock].duration']], [0.5, 9, 150, 0.25, 9]);
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.step();
  assert.equal(u.s.defIgnoreFlat, 150, 'above 50 %: 150 DEF ignored');
  const max = u.s.maxHp;
  h.b.dealDamage(e, u, { amount: max * 0.6, type: 'true' });     // 100 % → 40 %: the 50 % trigger
  approx(u.hp, max * 0.9, '50 % trigger: +50 %');
  h.run(9.2);
  h.b.dealDamage(e, u, { amount: max * 0.3, type: 'true' });     // 90 % → 60 %
  h.step();
  assert.equal(u.s.defIgnoreFlat, 150);
  h.b.dealDamage(e, u, { amount: max * 0.2, type: 'true' });     // 60 % → 40 %: nothing (the first is spent)
  approx(u.hp, max * 0.4, 'no second 50 % trigger');
  h.step();
  assert.equal(u.s.defIgnoreFlat, 0, 'at 40 % the DEF penetration is off');
  h.b.dealDamage(e, u, { amount: max * 5, type: 'true' });       // lethal: its own 不死, then the 25 % trigger
  assert.ok(u.alive, 'the second 不死');
  approx(u.hp, 1 + max * 0.5, '25 % trigger: +50 %');
  h.b.dealDamage(e, u, { amount: max * 0.4, type: 'true' });
  approx(u.hp, max * 0.5, 'its 9 s lock holds 50 %');
  h.run(9.2);
  h.b.dealDamage(e, u, { amount: max, type: 'true' });
  assert.ok(!u.alive, 'both spent');
  done(h);
  // a single hit from above 50 % to 10 %: the 50 % trigger first (+50 % ⇒ 60 %), the 25 % one waits for a later drop
  const r = field({ tier: 6, elite: true, mod: CENY, skill: 0 });
  const e2 = r.h.spawn('enemy_dummy', { pos: [10, 6] });
  const m2 = r.u.s.maxHp;
  r.h.b.dealDamage(e2, r.u, { amount: m2 * 0.9, type: 'true' });
  approx(r.u.hp, m2 * 0.6, 'the 50 % trigger first');
  assert.deepEqual([r.u.mem.huangDefib.undeadA, r.u.mem.huangDefib.undeadB], [false, true], 'the 25 % trigger still armed');
  done(r.h);
});
