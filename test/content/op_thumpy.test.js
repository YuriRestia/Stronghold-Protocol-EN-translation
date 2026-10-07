// test/content/op_thumpy.test.js — the 自选 operator kit of 珊比 (char_4235_thumpy, 6★ 本源铁卫; kit
// server/sim/content/kits/ops/op-thumpy.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or PRP-X
// 出发的勇气 at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of that slot
// status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_thumpy.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const THUMPY = 'char_4235_thumpy';
const FORMS = BACKUPS.units[THUMPY].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const PRPX = 'uniequip_002_thumpy';
const S1 = 'skchr_thumpy_1', S2 = 'skchr_thumpy_2', S3 = 'skchr_thumpy_3';
const TEXAS = 'chess_char_1_08_a';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_m1: dummy('enemy_m1', { mass: 1 }),
  enemy_m4: dummy('enemy_m4', { mass: 4 }), enemy_m5: dummy('enemy_m5', { mass: 5 }),
  enemy_shooter: dummy('enemy_shooter', { atk: 300, bat: 1, range: 3 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, PRPX].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const K = (r, c) => r * 21 + c;
const sortN = (a) => [...a].sort((x, y) => x - y);

/** A battle with 珊比 as uid 1 at (row, col) facing `dir` (RIGHT), plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, dir = 'RIGHT', others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'elementBurst'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: THUMPY, skillIndex: skill, uniEquipId: mod }, elite, row, col, dir }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const skillBuff = (u) => u.findBuff(`skill:${u.id}`);
/** Keep her own SP (and so her casts) out of the way (阻回). */
const noSp = (h, u) => h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true }, duration: Infinity });
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('珊比 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, range 0-1 (her own tile), blocks 3, physical melee ground-only, no 特质', () => {
  assert.equal(OPERATOR_KITS[THUMPY], KITS[THUMPY]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [THUMPY, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def, 10], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [3, 'melee', false, 'phys', 1.6], `${label(f)}: 本源铁卫`);
      assert.deepEqual(u.liveRangeGrid, [[0, 0]], `${label(f)}: 0-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [BACKUPS.diy.operators[THUMPY].bonds, []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN, full potential: HP +270): E2 Lv1 2835 / 536 / 430, E2 Lv60 3464 / 625 / 516; PRP-X +250 / +50
  // → +450 / +80
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2835, 536, 3464, 625]);
  assert.deepEqual([modOf(5, PRPX).attr, modOf(6, PRPX).attr], [{ maxHp: 250, atk: 50 }, { maxHp: 450, atk: 80 }]);
});

test('a 自选 pick: 珊比 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(THUMPY));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(THUMPY), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: THUMPY, skillIndex: 1, uniEquipId: PRPX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: THUMPY, skillIndex: 1, uniEquipId: PRPX } } });
});

test('triggers: every skill is MANUAL with the data\'s DEFAULT (the owner\'s 重装 exception; rawRule TAKE_DAMAGE); S1 casts with an enemy on her tile, S2 / S3 (areas larger than her range) as soon as a ground enemy is on the glue / conveyor — the kit\'s ACTIVE_RANGE; a flyer never counts', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    for (const skill of [0, 1, 2]) {
      const sk = formOf(tier, elite).skills[skill];
      assert.deepEqual([sk.skillType, sk.trigger.rule, sk.trigger.rawRule], ['MANUAL', 'DEFAULT', 'TAKE_DAMAGE'], `T${tier} S${skill + 1}: data`);
      const { h, u } = field({ tier, elite, skill });
      assert.equal(u.skill.rule, skill === 0 ? 'DEFAULT' : 'ACTIVE_RANGE');
      h.spawn('enemy_fly', { pos: [10, 6] });
      if (skill === 0) h.spawn('enemy_shooter', { pos: [10, 7] });
      u.skill.gainSp(999);
      h.run(3);
      assert.deepEqual([u.skill.activations, u.stats.attacks], [0, 0], `T${tier} S${skill + 1}: no cast for a flyer (or a shooter off her tile for S1), no attack on the flyer`);
      h.spawn('enemy_dummy', { pos: skill === 0 ? [10, 5] : [10, 7] });
      assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `T${tier} S${skill + 1}: cast with a ground enemy ${skill === 0 ? 'on her tile' : 'on the skill area'}`);
      done(h);
    }
  }
});

test('S1 “还不走？” (30 s): ATK / DEF +28 % / +37 %; she strikes every enemy she blocks at once and pushes each one radially with 小力 (weight 0: 1.7 tiles; weight 1: 0.44)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.duration, sk.spCost, sk.bb.atk, sk.bb.def, sk.bb['attack@force']], [30, elite ? 34 : 37, elite ? 0.37 : 0.28, elite ? 0.37 : 0.28, 0], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 0 });
    const right = h.spawn('enemy_dummy', { pos: [10, 5.4] }), left = h.spawn('enemy_dummy', { pos: [10, 4.6] }), upE = h.spawn('enemy_m1', { pos: [10.4, 5] });
    assert.ok(h.runUntil(() => u.blocking.length === 3, 1), `T${tier}: blocks all three`);
    const at = [right, left, upE].map((e) => [e.x, e.y]);
    u.skill.gainSp(999);
    const n0 = h.hooksOf('damaged').length;
    // the cast comes as she is about to attack: that attack is the first skill attack (same tick)
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    assert.deepEqual(skillBuff(u).mods, { atkPct: sk.bb.atk, defPct: sk.bb.def }, `T${tier}: the skill buff`);
    const hit = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && c.dmg.isAttack && c.dmg.isSkill);
    assert.equal(new Set(hit.map((c) => c.dmg.attackId)).size, 1, `T${tier}: one attack`);
    assert.deepEqual(sortN(hit.map((c) => c.target.id)), sortN([right.id, left.id, upE.id]), `T${tier}: every blocked enemy struck at once`);
    approx(right.x - at[0][0], 1.7, `T${tier}: weight 0 pushed right 1.7`);
    approx(at[1][0] - left.x, 1.7, `T${tier}: weight 0 pushed left 1.7`);
    approx(upE.y - at[2][1], 0.44, `T${tier}: weight 1 pushed up 0.44`);
    done(h);
  }
});

test('S2 “慢慢走~” glue: her tile + 4 passable tiles in PRTS\'s order — open ground: the cross on her front tile; front blocked (facing the field edge): left, right, then spreading', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.bb.max_cnt, sk.bb.interval, sk.bb.sluggish], [5, 0.7, 0.5], `T${tier}`);
    const a = field({ tier, elite, skill: 1 });
    noSp(a.h, a.u);
    a.u.skill.addCharge(1);
    a.u.skill.activate('test');
    // facing RIGHT (row 0 is the bottom row: her right hand is row − 1): own (10,5), front (10,6), its right (9,6), its
    // left (11,6), its front (10,7)
    assert.deepEqual(sortN(a.u.mem.thumpyGlue.keys), sortN([K(10, 5), K(10, 6), K(9, 6), K(11, 6), K(10, 7)]), `T${tier}: open ground`);
    done(a.h);
    // facing UP on the top lane (row 12): the front (13,5) is no ground ⇒ her left (12,4), right (12,6), then from (12,6):
    // its right (12,7), then from (12,7): (12,8)
    const b = field({ tier, elite, skill: 1, row: 12, col: 5, dir: 'UP' });
    noSp(b.h, b.u);
    b.u.skill.addCharge(1);
    b.u.skill.activate('test');
    assert.deepEqual(sortN(b.u.mem.thumpyGlue.keys), sortN([K(12, 5), K(12, 4), K(12, 6), K(12, 7), K(12, 8)]), `T${tier}: front blocked`);
    done(b.h);
  }
});

test('S2 “慢慢走~” (20 s): ATK / DEF +48 % / +57 %; from the cast every 0.7 s each ground enemy on the glue (untargetable ones too) takes 停顿 0.5 s, then 37 % / 43 % ATK physical; none off the glue, no flyer, no 隐匿 one', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.duration, sk.spCost, sk.bb.atk, sk.bb.def, sk.bb.atk_scale], [20, elite ? 27 : 30, elite ? 0.57 : 0.48, elite ? 0.57 : 0.48, elite ? 0.43 : 0.37], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1 });
    noSp(h, u);
    const on = h.spawn('enemy_dummy', { pos: [11, 6] }), front = h.spawn('enemy_dummy', { pos: [10, 7] });
    const off = h.spawn('enemy_dummy', { pos: [10, 8] }), fly = h.spawn('enemy_fly', { pos: [9, 6] });
    const ghost = h.spawn('enemy_dummy', { pos: [11, 6] }), hidden = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.b.addBuff(ghost, { key: 'test:untargetable', flags: { untargetable: true } });
    h.b.addBuff(hidden, { key: 'test:stealth', flags: { stealth: true } });
    h.step();
    u.skill.addCharge(1);
    u.skill.activate('test');
    assert.deepEqual(skillBuff(u).mods, { atkPct: sk.bb.atk, defPct: sk.bb.def }, `T${tier}: the skill buff`);
    h.runUntil(() => !u.skill.active, 25);
    const glue = (e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && c.dmg.tags?.includes('thumpy:glue') && c.type === 'phys');
    for (const e of [on, front, ghost]) {
      const hits = glue(e);
      assert.equal(hits.length, 29, `T${tier}: ${e.tileR},${e.tileC} — a pulse at 0, 0.7 … 19.6 s`);
      const sl = h.hooksOf('statusApplied').filter((c) => c.source === u && c.target === e && c.status === 'sluggish');
      assert.equal(sl.length, 29, `T${tier}: 停顿 each pulse`);
      assert.ok(sl.every((c) => Math.abs(c.duration - 0.5) < 1e-9), `T${tier}: 0.5 s`);
    }
    // the hit is atk_scale × her ATK during the skill (DEF 0); the first lands in the cast's tick
    const ref = glue(on)[0];
    approx(ref.amount, u.base.atk * (1 + sk.bb.atk) * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
    for (const e of [off, fly, hidden]) assert.equal(glue(e).length, 0, `T${tier}: ${e.defId} at ${e.tileR},${e.tileC} untouched`);
    assert.equal(u.mem.thumpyGlue, null, `T${tier}: the glue is gone with the skill`);
    done(h);
  }
});

test('S2 rider: while the glue lies, another operator\'s physical damage to an enemy on it adds 15 % of 珊比\'s ATK 侵蚀损伤 (from her); off the glue, arts, and 无来源 damage add none', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.equal(sk.bb['ep_damage_ratio[damage]'], 0.15, `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1, others: [{ uid: 2, chessId: TEXAS, row: 12, col: 9 }] });
    const tex = h.unit(2);
    noSp(h, u);
    const on = h.spawn('enemy_dummy', { pos: [11, 6] }), off = h.spawn('enemy_dummy', { pos: [11, 8] });
    h.step();
    u.skill.addCharge(1);
    u.skill.activate('test');
    const ero = (e) => e.elem.erosion;
    const e0 = ero(on);
    h.b.dealDamage(tex, on, { amount: 100, type: 'phys' });
    approx(ero(on) - e0, 0.15 * u.s.atk, `T${tier}: +15 % of her ATK`);
    const burstless = h.hooksOf('damaged').filter((c) => c.type === 'element' && c.target === on).slice(-1)[0];
    assert.equal(burstless.source, u, `T${tier}: the 侵蚀损伤 is hers`);
    const e1 = ero(on);
    h.b.dealDamage(tex, on, { amount: 100, type: 'arts' });
    h.b.dealDamage(tex, on, { amount: 100, type: 'phys', sourceless: true });
    assert.equal(ero(on), e1, `T${tier}: arts / 无来源 add none`);
    h.b.dealDamage(tex, off, { amount: 100, type: 'phys' });
    assert.equal(ero(off), 0, `T${tier}: off the glue none`);
    u.skill.extend(-999);
    h.step();
    const e2 = ero(on);
    h.b.dealDamage(tex, on, { amount: 100, type: 'phys' });
    assert.equal(ero(on), e2, `T${tier}: none once the glue is gone`);
    done(h);
  }
});

test('S3 “不准走！” (60 s): block +2, strikes every blocked enemy, ATK +65 % / +80 %, DEF +75 % / +105 %; the belt carries unblocked ground enemies of 重量 ≤ 4 on the 4 tiles ahead towards her at 0.8 × 20 / 30 tile/s; heavier ones, flyers and blocked ones stay', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.spCost, sk.bb.atk, sk.bb.def, sk.bb.block_cnt, sk.bb.conveyor_speed, sk.bb.mass_level, sk.bb.max_cnt, sk.bb.interval],
      [60, elite ? 57 : 58, elite ? 0.8 : 0.65, elite ? 1.05 : 0.75, 2, 0.8, 4, 5, 1], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2, col: 4 });
    noSp(h, u);
    const m4 = h.spawn('enemy_m4', { pos: [10, 7] }), m5 = h.spawn('enemy_m5', { pos: [10, 8] });
    const fly = h.spawn('enemy_fly', { pos: [10, 6] }), past = h.spawn('enemy_dummy', { pos: [10, 9] });
    h.step();
    u.skill.addCharge(1);
    u.skill.activate('test');
    assert.deepEqual(skillBuff(u).mods, { atkPct: sk.bb.atk, defPct: sk.bb.def, blockCnt: 2 }, `T${tier}: the skill buff`);
    assert.equal(u.s.blockCnt, 5, `T${tier}: block 3 + 2`);
    assert.deepEqual(sortN(u.mem.thumpyBelt.carryKeys), sortN([K(10, 5), K(10, 6), K(10, 7), K(10, 8)]), `T${tier}: the belt`);
    const x0 = m4.x;
    h.run(1);
    approx(x0 - m4.x, (0.8 * 20) / 30, `T${tier}: 0.533 tile in a second`, 1e-3);
    assert.deepEqual([m5.x, fly.x, past.x], [8, 6, 9], `T${tier}: 重量 5, the flyer and the enemy past the belt stay`);
    assert.ok(h.runUntil(() => m4.blockedBy === u, 6), `T${tier}: carried until she blocks it`);
    const xb = m4.x;
    h.run(1);
    assert.equal(m4.x, xb, `T${tier}: a blocked enemy is no longer carried`);
    done(h);
  }
});

test('S3 belt damage: every second from the cast, each targetable ground enemy on her tile and the 4 tiles ahead and each one she blocks takes 27 % / 33 % ATK physical; an enemy whose 侵蚀 bursts there loses 30 DEF more (stacking, for good)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.bb.atk_scale, sk.bb['thumpy[ep_break_water].def']], [elite ? 0.33 : 0.27, -30], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2, col: 4 });
    noSp(h, u);
    const own = h.spawn('enemy_m5', { pos: [10, 4] }), ahead = h.spawn('enemy_m5', { pos: [10, 8] });
    const beyond = h.spawn('enemy_m5', { pos: [10, 9] }), fly = h.spawn('enemy_fly', { pos: [10, 7] }), side = h.spawn('enemy_m5', { pos: [11, 5] });
    h.step();
    u.skill.addCharge(1);
    u.skill.activate('test');
    h.run(5.05);
    const belt = (e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && c.dmg.tags?.includes('thumpy:belt'));
    for (const e of [own, ahead]) {
      const hits = belt(e);
      assert.equal(hits.length, 6, `T${tier}: ${e.tileR},${e.tileC} — at 0, 1 … 5 s`);
      assert.equal(hits[0].type, 'phys');
      approx(hits[0].amount, u.base.atk * (1 + sk.bb.atk) * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
    }
    for (const e of [beyond, fly, side]) assert.equal(belt(e).length, 0, `T${tier}: ${e.defId} at ${e.tileR},${e.tileC} spared`);
    // 侵蚀 bursts: on the belt ⇒ −30 more; off it ⇒ the burst's own −120 only
    for (const e of [ahead, side]) h.b.dealDamage(null, e, { type: 'element', element: 'erosion', amount: 1000 });
    assert.deepEqual([ahead.findBuff('skill:thumpy:beltBreak')?.mods, side.findBuff('skill:thumpy:beltBreak')], [{ defFlat: -30 }, null], `T${tier}: the belt's extra cut`);
    assert.equal(ahead.s.def, Math.max(0, 0 - 120 - 30), `T${tier}: DEF 0 floor`);
    assert.equal(ahead.findBuff('skill:thumpy:beltBreak').timeLeft, Infinity, `T${tier}: for good`);
    h.run(8.1); // the burst lock (8 s) ends: a second burst stacks
    h.b.dealDamage(null, ahead, { type: 'element', element: 'erosion', amount: 1000 });
    assert.equal(ahead.findBuff('skill:thumpy:beltBreak').stacks, 2, `T${tier}: stacking`);
    done(h);
  }
});

test('T1 探险理论: 元素损伤 she takes ×0.8; her physical damage adds 12 % ATK 侵蚀损伤 (not her arts), or — while the target\'s 侵蚀 burst runs — shortens that burst by 1.2 s instead', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, row: 9 });
    noSp(h, u);
    assert.deepEqual(u.def.raw.talents.find((t) => t.index === 0).bb, { ep_damage_scale: 0.8, duration_dec: 1.2, 'ep_damage_ratio[trigger]': 0.12 }, label(f));
    const e = h.spawn('enemy_dummy', { pos: [10, 8] });
    h.step();
    h.b.dealDamage(e, u, { type: 'element', element: 'burn', amount: 100 });
    approx(u.elem.burn, 80, `${label(f)}: 元素损伤 taken ×0.8`);
    h.b.dealDamage(u, e, { amount: 100, type: 'phys' });
    approx(e.elem.erosion, 0.12 * u.s.atk, `${label(f)}: 12 % ATK 侵蚀损伤 (not blocking: no module bonus)`);
    const e0 = e.elem.erosion;
    h.b.dealDamage(u, e, { amount: 100, type: 'arts' });
    assert.equal(e.elem.erosion, e0, `${label(f)}: not on arts damage`);
    h.b.dealDamage(null, e, { type: 'element', element: 'erosion', amount: 1000 });
    const lock = e.findBuff('erosionBurst');
    assert.ok(lock, `${label(f)}: bursting`);
    const left = lock.timeLeft;
    h.b.dealDamage(u, e, { amount: 100, type: 'phys' });
    approx(lock.timeLeft, left - 1.2, `${label(f)}: the burst 1.2 s shorter`);
    done(h);
  }
});

test('T2 坚硬脚板: an enemy she has damaged whose 侵蚀 bursts gives her DEF +11 (PRP-X stage 3: DEF +15, ATK +6; ≤ 30 stacks) and 330 (480) 屏障 added to one barrier, ≤ 300 % max HP; unmarked enemies nothing; the marks go when she leaves', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, row: 9 });
    noSp(h, u);
    const x3 = elite && mod === PRPX && tier === 6;
    const t1 = u.def.raw.talents.find((t) => t.index === 1).bb;
    assert.deepEqual(t1, x3 ? { def: 15, atk: 6, shield_value: 480, max_stack_cnt: 30, scale: 3 } : { def: 11, atk: 0, shield_value: 330, max_stack_cnt: 30, scale: 3 }, label(f));
    const marked = h.spawn('enemy_dummy', { pos: [10, 8] }), other = h.spawn('enemy_dummy', { pos: [11, 8] });
    h.step();
    h.b.dealDamage(null, other, { type: 'element', element: 'erosion', amount: 1000 });
    assert.equal(u.findBuff('talent:thumpy:sole'), null, `${label(f)}: an unmarked enemy's burst`);
    h.b.dealDamage(u, marked, { amount: 10, type: 'arts' });
    h.b.dealDamage(null, marked, { type: 'element', element: 'erosion', amount: 1000 });
    assert.deepEqual(u.findBuff('talent:thumpy:sole')?.mods, x3 ? { defFlat: 15, atkFlat: 6 } : { defFlat: 11 }, `${label(f)}: the stack`);
    assert.equal(u.findBuff('talent:thumpy:barrier')?.shield, t1.shield_value, `${label(f)}: 屏障`);
    h.run(8.1);
    h.b.dealDamage(null, marked, { type: 'element', element: 'erosion', amount: 1000 });
    assert.equal(u.findBuff('talent:thumpy:sole').stacks, 2, `${label(f)}: two stacks`);
    approx(u.s.def, u.base.def + 2 * t1.def, `${label(f)}: DEF`);
    assert.equal(u.findBuff('talent:thumpy:barrier').shield, 2 * t1.shield_value, `${label(f)}: the same barrier grows`);
    u.findBuff('talent:thumpy:barrier').shield = 3 * u.s.maxHp - 10;
    h.run(8.1);
    h.b.dealDamage(null, marked, { type: 'element', element: 'erosion', amount: 1000 });
    approx(u.findBuff('talent:thumpy:barrier').shield, 3 * u.s.maxHp, `${label(f)}: capped at 300 % max HP`);
    // she leaves the field: the marks go; back on it, the enemy's burst gives nothing until she damages it again
    h.b.retreat(u);
    h.b.redeploy(u);
    h.step();
    h.run(8.1);
    h.b.dealDamage(null, marked, { type: 'element', element: 'erosion', amount: 1000 });
    assert.equal(u.findBuff('talent:thumpy:sole'), null, `${label(f)}: marks cleared when she left`);
    done(h);
  }
});

test('PRP-X 出发的勇气 trait: every 元素损伤 she deals ×1.15 while she blocks (stages 1 and 3); ×1 when blocking nobody or without the module', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    noSp(h, u);
    const x = elite && mod === PRPX;
    if (x) assert.deepEqual(u.def.raw.trait.bb, { ep_damage_scale: 1.15 }, label(f));
    const far = h.spawn('enemy_dummy', { pos: [10, 8] });
    h.step();
    h.b.dealDamage(u, far, { amount: 100, type: 'phys' });
    approx(far.elem.erosion, 0.12 * u.s.atk, `${label(f)}: blocking nobody`);
    const near = h.spawn('enemy_dummy', { pos: [10, 5] });
    assert.ok(h.runUntil(() => near.blockedBy === u, 1), `${label(f)}: blocking`);
    const g0 = far.elem.erosion;
    h.b.dealDamage(u, far, { amount: 100, type: 'phys' });
    approx(far.elem.erosion - g0, 0.12 * u.s.atk * (x ? 1.15 : 1), `${label(f)}: while blocking`);
    done(h);
  }
});
