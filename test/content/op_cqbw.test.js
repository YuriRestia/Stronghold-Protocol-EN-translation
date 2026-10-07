// test/content/op_cqbw.test.js — the 自选 operator kit of W (char_113_cqbw, 6★ 炮手; kit
// server/sim/content/kits/ops/op-cqbw.js) and of her summon “此面向敌” (token_10008_cqbw_box), fielded the production way (a
// DIY slot + its `diy` pick, simdata getDiy) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and
// elite (E2 Lv60, rank 7) with no module, ART-X “佣兵的行囊” or ART-Y “刺棱钝刃” at stage 1 (tier 5) / 3 (tier 6). Every
// number is read back from data/backups.json (the form of that slot status); the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_cqbw.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const W = 'char_113_cqbw';
const MINE = 'token_10008_cqbw_box';
const FORMS = BACKUPS.units[W].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_cqbw', Y = 'uniequip_003_cqbw';
const S1 = 'skchr_cqbw_1', S2 = 'skchr_cqbw_2', S3 = 'skchr_cqbw_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The mine's variant of a form with the pick's skill / module (getDiyToken). */
const mineOf = (tier, elite, mod) => {
  let v = BACKUPS.tokens[MINE].variants[`${W}@${statusOf(tier, elite)}`];
  v = { ...v, ...v.bySkill['1'] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_def: dummy('enemy_def', { def: 300 }),
  enemy_weak: dummy('enemy_weak', { hp: 100 }),
};
for (const hp of [2e8, 3e8, 4e8, 5e8]) ENEMIES[`enemy_hp${hp / 1e8}`] = dummy(`enemy_hp${hp / 1e8}`, { hp });
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, X, Y].map((m) => [t, true, m]))];
/** Flat-stage rows with W's 3-10 at (10, 4) left without a free deployable tile, or with only (9, 5) and (11, 8). */
const NO_TILE = { 9: '##ErfffffrSrrrrrrrS##', 10: '##hrrffffrfrrrrrrrf##', 11: '##hrfffffrfrrrrrrrf##' };
const TWO_TILES = { 9: '##ErfrfffrSrrrrrrrS##', 10: '##hrrffffrfrrrrrrrf##', 11: '##hrffffrrfrrrrrrrf##' };

/** A battle with W as uid 1 at (row, col) facing RIGHT (her 3-10: the 3 rows around her, her column and the 4 ahead). */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, others = [], seed = 5, rows = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed, flat: rows ? { rows } : {},
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'spGain', 'dodge'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: W, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const from = (h, src) => h.hooksOf('damaged').filter((c) => c.source === src);
const on = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const minesOf = (h, u) => h.b.allyUnits.filter((t) => t.kind === 'token' && t.defId === MINE && t.ownerUnit === u);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

test('W in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 3-10, ranged physical 炮手 (splash 1.0), hits air, blocks 1, ground-targetable, the data triggers; offered as a pick', () => {
  assert.equal(OPERATOR_KITS[W], KITS[W]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [W, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat, u.profile.splashRadius, u.profile.sub],
        [1, 'ranged', true, 'phys', 2.8, 1, 'aoesniper'], `${label(f)}: 炮手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-10`);
      assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => [s.skillType, s.trigger.rule]), [['MANUAL', 'DEFAULT'], ['AUTO', 'DEFAULT'], ['MANUAL', 'DEFAULT']]);
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1284, 746, 1497, 879]);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr, modOf(5, Y).attr, modOf(6, Y).attr], [{ maxHp: 130, atk: 54 }, { maxHp: 210, atk: 78 }, { maxHp: 160, atk: 45 }, { maxHp: 200, atk: 85 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(W) && [5, 6].every((t) => diyPool(t, { data, kitted: KITTED_CHARS }).includes(W)));
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: W, skillIndex: 1, uniEquipId: X } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: W, skillIndex: 1, uniEquipId: X } } });
});

test('trait 炮手: every enemy within 1.0 of the struck one takes the hit in full (PRTS 溅射半径一览 1.0, not the profile\'s 1.1), air units too', () => {
  const { h, u } = field({ skill: 2 });
  const main = h.spawn('enemy_dummy', { pos: [10, 8] });
  const near = h.spawn('enemy_dummy', { pos: [11, 8.9] });   // 1.35 away, outside her range (col 9)
  const one = h.spawn('enemy_fly', { pos: [9, 8.6] });       // √(1 + 0.36) ≈ 1.166: outside 1.0 as well
  const fly = h.spawn('enemy_fly', { pos: [10, 9] });         // 1.0 away
  const edge = h.spawn('enemy_dummy', { pos: [10, 9.08] });   // 1.08: inside 1.1, outside 1.0
  assert.ok(h.runUntil(() => from(h, u).some((c) => c.target === main), 6), 'she attacks the one enemy of her range');
  h.run(0.5);
  const id = from(h, u).find((c) => c.target === main).dmg.attackId;
  const hit = from(h, u).filter((c) => c.dmg.attackId === id);
  assert.deepEqual(new Set(hit.map((c) => c.target)), new Set([main, fly]), 'the struck one and the flyer 1.0 away');
  for (const c of hit) approx(c.amount, u.s.atk, 'full damage');
  assert.deepEqual([near, one, edge].map((e) => on(h, e).length), [0, 0, 0], 'beyond 1.0 untouched (1.08 too)');
  done(h);
});

test('S1 红桃K (MANUAL, data DEFAULT, 22 / 19 SP): cast like an attack — that attack is the grenade: 270 % / 310 % ATK physical to every enemy within 1.2 (air too), each stunned 1.8 / 2.1 s; no extra hit; plain attacks after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.spCost, sk.initSp, sk.spType, sk.bb.atk_scale, sk.bb.stun], elite ? [19, 0, 'INCREASE_WITH_TIME', 3.1, 2.1] : [22, 0, 'INCREASE_WITH_TIME', 2.7, 1.8], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['instant', 'DEFAULT'], `T${tier}`);
    const main = h.spawn('enemy_dummy', { pos: [10, 8] });
    const a = h.spawn('enemy_dummy', { pos: [10, 9.15] });   // 1.15: inside 1.2, outside her 1.0
    const b = h.spawn('enemy_dummy', { pos: [10, 9.3] });    // 1.3: outside 1.2
    const f = h.spawn('enemy_fly', { pos: [9, 8.55] });      // √(1 + 0.3025) ≈ 1.141, outside her range (col 9)
    assert.ok(h.runUntil(() => from(h, u).length > 0, 6), `T${tier}: a plain attack first`);
    assert.deepEqual(from(h, u).map((c) => c.target), [main], `T${tier}: her 1.0 splash reaches none of them`);
    u.skill.gainSp(999);
    const n0 = from(h, u).length;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4), `T${tier}: cast on her next attack`);
    h.run(0.6);
    const shot = from(h, u).slice(n0);
    const id = shot[0].dmg.attackId;
    assert.ok(shot.every((c) => c.dmg.attackId === id), `T${tier}: one attack — the grenade, nothing else`);
    assert.deepEqual(new Set(shot.map((c) => c.target)), new Set([main, a, f]), `T${tier}: everything within 1.2`);
    for (const c of shot) {
      approx(c.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} %`);
      assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true], `T${tier}: physical skill damage`);
    }
    assert.equal(on(h, b).length, 0, `T${tier}: 1.3 away untouched`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun');
    assert.deepEqual(new Set(stuns.map((c) => c.target)), new Set([main, a, f]), `T${tier}: each victim stunned`);
    for (const c of stuns) approx(c.duration, sk.bb.stun, `T${tier}: ${sk.bb.stun} s`);
    const n1 = from(h, u).length;
    h.run(6);
    const later = from(h, u).slice(n1);
    assert.ok(later.length >= 2 && later.every((c) => !c.dmg.isSkill && Math.abs(c.amount - u.s.atk) < 1e-6), `T${tier}: plain attacks again`);
    done(h);
  }
});

test('S2 惊吓盒子 (AUTO, data DEFAULT, 11 / 10 SP): the next attack plants a 此面向敌 under the targetable ground enemy instead of hitting; 1.5 s after an enemy comes within 1.35, W\'s ATK × 220 % / 250 % to every ground enemy within 1.35 + stun 1.6 / 1.8 s; then it is gone', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2), mv = mineOf(tier, elite, null);
    assert.deepEqual([sk.skillType, sk.spCost, sk.initSp, sk.bb.atk_scale, sk.bb.stun, sk.overrideTokenKey], elite ? ['AUTO', 10, 0, 2.5, 1.8, MINE] : ['AUTO', 11, 0, 2.2, 1.6, MINE], `T${tier}`);
    assert.deepEqual([mv.skill.bb.atk_scale, mv.skill.bb.stun, mv.talents[0].bb.duration], [sk.bb.atk_scale, sk.bb.stun, 120], `T${tier}: the token carries the form's S2 blackboard`);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['instant', 'DEFAULT'], `T${tier}`);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    const g = h.spawn('enemy_dummy', { pos: [11, 7] });          // 1.0 from the mine
    const fly = h.spawn('enemy_fly', { pos: [10, 8] });          // 1.0 from the mine, an air unit
    const far = h.spawn('enemy_dummy', { pos: [9, 8.3] });        // √(1 + 1.69) ≈ 1.64
    u.skill.gainSp(999);
    const n0 = from(h, u).length;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4), `T${tier}: cast`);
    assert.equal(from(h, u).length, n0, `T${tier}: that attack made no hit`);
    const [m] = minesOf(h, u);
    assert.ok(m && m.alive, `T${tier}: a mine`);
    assert.deepEqual([m.tileR, m.tileC], [10, 7], `T${tier}: under the targetable ground enemy (of the four, by her order)`);
    assert.deepEqual([!!m.s.flags.untargetable, m.profile.noAttack, m.s.blockCnt, m.base.maxHp], [true, true, 0, mv.stats.maxHp], `T${tier}: untargetable trap, no attack, blocks nothing`);
    const atk = u.s.atk;
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => !m.alive, 3), `T${tier}: goes off`);
    assert.ok(Math.abs(h.b.time - t0 - 1.5) < 0.07, `T${tier}: 1.5 s after it was armed (at once: an enemy on it) — ${h.b.time - t0}`);
    const blast = from(h, m);
    assert.deepEqual(new Set(blast.map((c) => c.target)), new Set([e, g]), `T${tier}: the ground enemies within 1.35`);
    for (const c of blast) {
      approx(c.amount, atk * sk.bb.atk_scale, `T${tier}: W's ATK × ${sk.bb.atk_scale}`);
      assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true], `T${tier}: physical`);
    }
    assert.deepEqual([on(h, fly).filter((c) => c.source === m).length, on(h, far).filter((c) => c.source === m).length], [0, 0], `T${tier}: not the flyer, not 1.64 away`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === m && c.status === 'stun');
    assert.deepEqual(new Set(stuns.map((c) => c.target)), new Set([e, g]), `T${tier}: stunned`);
    for (const c of stuns) approx(c.duration, sk.bb.stun, `T${tier}: ${sk.bb.stun} s`);
    assert.equal(h.hooksOf('death').find((c) => c.unit === m)?.reason, 'expired', `T${tier}: used up, no knock-out`);
    done(h);
  }
});

test('S2 惊吓盒子: no free deployable tile in her range ⇒ the skill does not fire (SP kept, she attacks); else the tile nearest to the enemy; flyers neither pick the tile nor arm it; 120 s life; her retreat withdraws every mine', () => {
  const blocked = field({ skill: 1, rows: NO_TILE });
  blocked.h.spawn('enemy_dummy', { pos: [10, 7] });
  blocked.u.skill.gainSp(999);
  blocked.h.run(10);
  assert.deepEqual([blocked.u.skill.activations, blocked.u.skill.charges, minesOf(blocked.h, blocked.u).length], [0, 1, 0], 'refused, SP kept');
  assert.ok(from(blocked.h, blocked.u).length >= 3, 'her attacks go on');
  done(blocked.h);

  const two = field({ skill: 1, rows: TWO_TILES });
  two.h.spawn('enemy_dummy', { pos: [10, 8] });   // on floor: 1.0 from (11, 8), √(1 + 9) from (9, 5)
  two.u.skill.gainSp(999);
  assert.ok(two.h.runUntil(() => two.u.skill.activations === 1, 4));
  assert.deepEqual(minesOf(two.h, two.u).map((m) => [m.tileR, m.tileC]), [[11, 8]], 'the free tile nearest to the enemy');
  done(two.h);

  const { h, u } = field({ skill: 1 });
  const fly = h.spawn('enemy_fly', { pos: [10, 7] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 4), 'a flyer in range: cast');
  const [m] = minesOf(h, u);
  assert.ok(m && m.alive, 'a mine on a free tile of her range (drawn: no ground enemy to place it by)');
  h.run(30);
  assert.ok(m.alive && !m.mem.armed && on(h, fly).every((c) => c.source !== m), 'the flyer never arms it');
  assert.ok(h.runUntil(() => !m.alive, 100), 'gone at last');
  approx(m.deathAt - m.deployedAt, 120, 'after 120 s', 0.01);
  assert.equal(h.hooksOf('death').find((c) => c.unit === m)?.reason, 'expired');
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => minesOf(h, u).filter((t) => t.alive).length >= 1, 8), 'another one');
  h.b.retreat(u);
  h.step();
  assert.equal(minesOf(h, u).filter((t) => t.alive).length, 0, 'W撤退时撤退全部此面向敌');
  done(h);
});

test('S3 D12 (MANUAL, data DEFAULT, 42 / 39 SP from 14 / 17): bombs on the 3 enemies of her range with the most HP (air too), cached ATK × 250 % / 280 % 无来源 physical within 1.2 of each 3 s after it lands + stun 3.5 / 4 s; early when its target falls; no hit of its own', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.spCost, sk.initSp, sk.bb.max_target, sk.bb.atk_scale, sk.bb.stun], elite ? [39, 17, 3, 2.8, 4] : [42, 14, 3, 2.5, 3.5], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.kind, u.skill.rule, Math.floor(u.skill.sp)], ['instant', 'DEFAULT', sk.initSp], `T${tier}: from ${sk.initSp} SP`);
    const lo = h.spawn('enemy_hp2', { pos: [9, 5] });
    const e3 = h.spawn('enemy_hp3', { pos: [11, 5] });
    const e4 = h.spawn('enemy_hp4', { pos: [10, 8] });
    const f5 = h.spawn('enemy_hp5', { pos: [9, 8] });
    const fly = h.spawn('enemy_fly', { pos: [11, 8] });   // 1e9 HP: the most of all
    const side = h.spawn('enemy_dummy', { pos: [10, 9.15] });   // outside her range, 1.15 from e4
    u.skill.gainSp(999);
    const n0 = from(h, u).length;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4), `T${tier}: cast`);
    const atk = u.s.atk;
    h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });
    h.run(0.1);
    assert.equal(from(h, u).length, n0, `T${tier}: that attack made no hit`);
    h.run(1);
    assert.ok(h.hooksOf('damaged').every((c) => !c.dmg.tags?.includes('cqbw:d12')), `T${tier}: nothing before 3 s`);
    h.run(2.6);
    const blasts = h.hooksOf('damaged').filter((c) => c.dmg.tags?.includes('cqbw:d12'));
    const victims = new Set(blasts.map((c) => c.target));
    assert.ok([fly, f5, e4].every((e) => victims.has(e)), `T${tier}: the three with the most HP (the flyer too)`);
    assert.ok(victims.has(side), `T${tier}: and what stands within 1.2 of a bomb`);
    assert.ok(!victims.has(lo) && !victims.has(e3), `T${tier}: the others untouched`);
    // the ATK cached at the cast (her +100 % since then counts for nothing); a victim of her range that an earlier bomb
    // stunned takes 落井下石's ×1.21 on top, the one outside her range never
    const base = atk * sk.bb.atk_scale;
    for (const c of blasts) {
      const stunnedBefore = c.target !== side && Math.abs(c.amount - base * 1.21) < 1e-6 * base;
      assert.ok(Math.abs(c.amount - base) < 1e-6 * base || stunnedBefore, `T${tier}: the cached ATK × ${sk.bb.atk_scale} (${c.amount} vs ${base})`);
      assert.deepEqual([c.type, c.source, c.credit, !!c.dmg.sourceless], ['phys', null, u, true], `T${tier}: 无来源, credited to her`);
    }
    assert.ok(on(h, side).filter((c) => c.dmg.tags?.includes('cqbw:d12')).every((c) => Math.abs(c.amount - base) < 1e-6 * base), `T${tier}: outside her range: no 落井下石`);
    for (const e of [fly, f5, e4]) approx(blasts.find((c) => c.target === e).amount, base, `T${tier}: its first blast, not stunned yet`);
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun');
    assert.ok(stuns.length >= 4 && stuns.every((c) => Math.abs(c.duration - sk.bb.stun) < 1e-6), `T${tier}: stun ${sk.bb.stun} s`);
    done(h);
  }
  // early burst: the bombed enemy falls before its 3 s; a bomb still goes off after she leaves the field
  const { h, u } = field({ skill: 2 });
  const target = h.spawn('enemy_dummy', { pos: [10, 8] });
  const by = h.spawn('enemy_dummy', { pos: [10, 9.1] });   // outside her range and her 1.0 splash, 1.1 from the target
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 4), 'cast');
  h.run(0.8);
  assert.ok(on(h, by).length === 0, 'the bomb landed, nothing yet');
  h.b.kill(target, null);
  h.step();
  assert.ok(on(h, by).some((c) => c.dmg.tags?.includes('cqbw:d12')), 'it went off at once');
  const two = field({ skill: 2 });
  const t2 = two.h.spawn('enemy_dummy', { pos: [10, 8] });
  two.u.skill.gainSp(999);
  assert.ok(two.h.runUntil(() => two.u.skill.activations === 1, 4));
  two.h.run(0.8);
  two.h.b.retreat(two.u);
  two.h.run(3);
  assert.ok(on(two.h, t2).some((c) => c.dmg.tags?.includes('cqbw:d12')), 'her retreat keeps the bomb');
  done(h);
  done(two.h);
});

test('T1 设伏: 10 s after each deployment 60 % physical and arts dodge, taunt −1, until she leaves; ART-Y stage 3: after 8 s, and ATK +1.25 % a second up to +20 %, reset by damage taken (not by a dodge or a 流失)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const y3 = elite && mod === Y && tier === 6;
    const iv = y3 ? 8 : 10;
    assert.deepEqual(u.def.raw.talents.find((t) => t.index === 0).bb, { interval: iv, prob: 0.6, taunt_level: -1 }, label(f));
    h.run(iv - 0.3);
    assert.equal(u.findBuff('talent:cqbw:ambush'), null, `${label(f)}: not before ${iv} s`);
    h.run(0.5);
    assert.deepEqual(u.findBuff('talent:cqbw:ambush')?.mods, { dodgePhys: 0.6, dodgeArts: 0.6, taunt: -1 }, `${label(f)}: after ${iv} s`);
    assert.deepEqual([u.s.dodgePhys, u.s.dodgeArts, u.s.taunt], [0.6, 0.6, -1], label(f));
    const ramp = u.findBuff('talent:cqbw:ramp');
    if (!y3) assert.equal(ramp, null, `${label(f)}: no ramp`);
    else {
      assert.equal(ramp.stacks, Math.floor(iv + 0.2), `${label(f)}: a stack a second`);
      approx(u.s.atk, u.base.atk * (1 + 0.0125 * ramp.stacks), `${label(f)}: ATK +1.25 % each`);
      h.run(10);
      assert.equal(u.findBuff('talent:cqbw:ramp').stacks, 16, `${label(f)}: at most 16`);
      approx(u.s.atk, u.base.atk * 1.2, `${label(f)}: +20 %`);
      h.b.loseHp(u, 10, { source: u });
      assert.equal(u.findBuff('talent:cqbw:ramp')?.stacks, 16, `${label(f)}: a 流失 keeps it`);
      const src = h.spawn('enemy_dummy', { pos: [10, 12] });
      h.b.dealDamage(src, u, { amount: 10, type: 'phys', canDodge: false });
      assert.equal(u.findBuff('talent:cqbw:ramp'), null, `${label(f)}: damage clears it`);
      h.run(1.01);
      assert.equal(u.findBuff('talent:cqbw:ramp')?.stacks, 1, `${label(f)}: and it climbs again`);
    }
    h.b.retreat(u);
    assert.equal(u.findBuff('talent:cqbw:ambush'), null, `${label(f)}: gone when she leaves`);
    done(h);
  }
  // a dodged hit does not reset the ramp (dodges come from the 60 % of 设伏)
  const { h, u } = field({ tier: 6, elite: true, mod: Y, skill: 2, seed: 9 });
  h.run(12);
  const e = h.spawn('enemy_dummy', { pos: [10, 12] });
  let checked = 0;
  for (let i = 0; i < 60 && checked < 3; i++) {
    if (!u.findBuff('talent:cqbw:ramp')) h.run(1.05);
    const before = u.findBuff('talent:cqbw:ramp')?.stacks ?? 0;
    const n = h.hooksOf('dodge').length;
    h.b.dealDamage(e, u, { amount: 1, type: 'phys' });
    if (h.hooksOf('dodge').length > n) {
      assert.ok(before > 0 && u.findBuff('talent:cqbw:ramp')?.stacks === before, 'a dodge keeps the ramp');
      checked++;
    } else assert.equal(u.findBuff('talent:cqbw:ramp'), null, 'a hit that lands clears it');
  }
  assert.equal(checked, 3, 'three dodges seen');
  done(h);
});

test('T2 落井下石: a stunned enemy in her range takes ×1.21 physical damage from anyone (×1.27 with ART-X stage 3); not arts, not unstunned, not frozen, not outside her range; two W keep the strongest', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const x3 = elite && mod === X && tier === 6;
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 12, col: 9 }] });
    const ally = h.unit(2);
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    const inR = h.spawn('enemy_dummy', { pos: [11, 7] }), outR = h.spawn('enemy_dummy', { pos: [12, 7] });
    const scale = x3 ? 1.27 : 1.21;
    assert.equal(u.def.raw.talents.find((t) => t.index === 1).bb.damage_scale, scale, label(f));
    const deal = (e, type) => h.b.dealDamage(ally, e, { amount: 1000, type, canDodge: false });
    assert.equal(deal(inR, 'phys'), 1000, `${label(f)}: not stunned`);
    for (const e of [inR, outR]) h.b.applyStatus(e, 'stun', { duration: 5 });
    approx(deal(inR, 'phys'), 1000 * scale, `${label(f)}: stunned in her range`);
    assert.equal(deal(inR, 'arts'), 1000, `${label(f)}: physical only`);
    assert.equal(deal(outR, 'phys'), 1000, `${label(f)}: outside her range`);
    h.b.removeStatus(inR, 'stun');
    h.b.applyStatus(inR, 'freeze', { duration: 5 });
    assert.equal(deal(inR, 'phys'), 1000, `${label(f)}: 冻结 is no 晕眩`);
    done(h);
  }
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 60, autoFinish: false, seed: 1, flags: { dpPerSec: 0, dpMax: 999 },
    units: [{ uid: 1, diy: { slot: 5, charId: W, skillIndex: 2 }, row: 10, col: 4 }, { uid: 2, diy: { slot: 6, charId: W, skillIndex: 2, uniEquipId: X }, elite: true, row: 11, col: 4 }],
  });
  h.step();
  const e = h.spawn('enemy_dummy', { pos: [10, 7] });
  h.b.applyStatus(e, 'stun', { duration: 5 });
  approx(h.b.dealDamage(null, e, { amount: 1000, type: 'phys', canDodge: false }), 1270, 'two W: ×1.27, not ×1.21 × 1.27');
  checkInvariants(h.b);
});

test('ART-X stage 3 落井下石: +1 SP (forced, under 阻回 too) when her projectile — a normal attack, a D12 bomb — knocks out an enemy of her range, or her mine knocks out any enemy; not stage 1, not others\' kills', () => {
  for (const f of [[5, true, X], [6, true, X], [6, true, Y], [6, false, null]]) {
    const [tier, elite, mod] = f;
    const x3 = tier === 6 && mod === X;
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 12, col: 9 }] });
    assert.equal(u.def.raw.talents.find((t) => t.index === 1).bb.sp ?? 0, x3 ? 1 : 0, label(f));
    const forced = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'init').length;
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
    const n0 = forced();
    const weak = h.spawn('enemy_weak', { pos: [10, 7] });
    assert.ok(h.runUntil(() => !weak.alive, 6), `${label(f)}: her attack knocks it out`);
    assert.equal(forced() - n0, x3 ? 1 : 0, `${label(f)}: +1 SP under 阻回`);
    const other = h.spawn('enemy_weak', { pos: [12, 12] });
    h.b.dealDamage(h.unit(2), other, { amount: 1e6, type: 'true' });
    assert.equal(forced() - n0, x3 ? 1 : 0, `${label(f)}: not another unit's kill`);
    done(h);
  }
  // her mine's knock-out: any enemy (S2), and a D12 bomb's (S3)
  for (const skill of [1, 2]) {
    const { h, u } = field({ tier: 6, elite: true, mod: X, skill });
    const forced = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'init').length;
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    const weak = h.spawn('enemy_weak', { pos: [10, 7] });
    h.b.removeBuff(u, 'test:disarm');
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4), `S${skill + 1}: cast`);
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    assert.ok(h.runUntil(() => !weak.alive, 5), `S${skill + 1}: the ${skill === 1 ? 'mine' : 'bomb'} knocks it out`);
    const killer = h.hooksOf('death').find((c) => c.unit === weak)?.killer;
    assert.equal(skill === 1 ? killer?.defId : killer, skill === 1 ? MINE : u, `S${skill + 1}: the killer`);
    assert.equal(forced(), 1, `S${skill + 1}: +1 SP`);
    done(h);
  }
});

test('ART-X trait: ×1.1 on her damage to a blocked enemy (main and splash), stage 1 and 3; its token part: the mine ×1.1 on a blocked one; ART-Y trait: ignores 100 DEF', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const x = elite && mod === X, y = elite && mod === Y;
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 8, dir: 'LEFT' }] });
    const blockedE = h.spawn('enemy_dummy', { pos: [10, 8] });   // on 角峰's tile: blocked by him
    const free = h.spawn('enemy_dummy', { pos: [11, 8] });       // 1.0 away: her splash
    h.step();
    assert.ok(blockedE.blockedBy, `${label(f)}: blocked`);
    assert.ok(h.runUntil(() => from(h, u).some((c) => c.target === free), 6), `${label(f)}: an attack`);
    const id = from(h, u).find((c) => c.target === free).dmg.attackId;
    const hits = from(h, u).filter((c) => c.dmg.attackId === id);
    const amt = (e) => hits.find((c) => c.target === e)?.amount;
    approx(amt(free), u.s.atk, `${label(f)}: not blocked`);
    approx(amt(blockedE), u.s.atk * (x ? 1.1 : 1), `${label(f)}: blocked`);
    if (x) assert.deepEqual(u.def.raw.trait.bb, { atk_scale: 1.1 }, label(f));
    if (y) assert.deepEqual(u.def.raw.trait.bb, { def_penetrate_fixed: 100 }, label(f));
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    const d = h.spawn('enemy_def', { pos: [9, 12] });
    approx(h.b.dealDamage(u, d, { amount: 1000, type: 'phys', canDodge: false }), y ? 800 : 700, `${label(f)}: DEF 300 ${y ? '− 100' : ''}`);
    done(h);
  }
  // the mine of an ART-X W: ×1.1 on the blocked enemy within its blast
  for (const [tier, mod] of [[5, X], [6, X], [6, Y]]) {
    const { h, u } = field({ tier, elite: true, mod, skill: 1, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 7, dir: 'LEFT' }] });
    const blockedE = h.spawn('enemy_dummy', { pos: [9, 7] });
    const free = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.step();
    assert.ok(blockedE.blockedBy && !free.blockedBy);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4));
    const [m] = minesOf(h, u);
    assert.deepEqual([m.tileR, m.tileC], [10, 7], `T${tier} ${mod}: the free tile under an enemy`);
    assert.equal(m.def.traitBb.atk_scale ?? 1, mod === X ? 1.1 : 1, `T${tier} ${mod}: the token's trait`);
    assert.ok(h.runUntil(() => !m.alive, 3));
    const amt = (e) => from(h, m).find((c) => c.target === e)?.amount;
    approx(amt(blockedE), amt(free) * (mod === X ? 1.1 : 1), `T${tier} ${mod}: ×1.1 on the blocked one`);
    done(h);
  }
});
