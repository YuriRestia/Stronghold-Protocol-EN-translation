// test/content/op_heyak.test.js — the 自选 operator kit of 霍尔海雅 (char_4027_heyak, 6★ 中坚术师; kit
// server/sim/content/kits/ops/op-heyak.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, CCR-X
// “图书馆”, CCR-Y “羽蛇的时间博物馆” or ISW-A “霍尔海雅特限证章” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from
// data/backups.json (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_heyak.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ID = 'char_4027_heyak';
const FORMS = BACKUPS.units[ID].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const CCRX = 'uniequip_002_heyak', CCRY = 'uniequip_003_heyak', ISWA = 'uniequip_004_heyak';
const S1 = 'skchr_heyak_1', S2 = 'skchr_heyak_2', S3 = 'skchr_heyak_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_heavy: dummy('enemy_heavy', { mass: 2 }),
  enemy_r50: dummy('enemy_r50', { res: 50 }), enemy_elite: dummy('enemy_elite', { rank: 'ELITE' }), enemy_boss: dummy('enemy_boss', { rank: 'BOSS' }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, CCRX, CCRY, ISWA].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 霍尔海雅 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5, setup = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'spGain'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ID, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
    setup,
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
const statusBy = (h, u, key) => h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === key);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const arts = (amount, res, ignore = 0) => Math.max(amount * (1 - Math.max(0, res - ignore) / 100), amount * 0.05);
/** 传承终焉's numbers in a form: [atk_scale, silence]. */
const t0Of = (tier, elite, mod) => {
  const t = (mod ? modOf(tier, mod).talentChanges.find((c) => c.talentIndex === 0) : null) ?? formOf(tier, elite).talents.find((c) => c.index === 0);
  return [t.bb.atk_scale, t.bb.silence];
};

test('霍尔海雅 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 3-1 range, ranged arts that hits air, block 1, 1.6 s, 空 bonds, no 特质', () => {
  assert.equal(OPERATOR_KITS[ID], KITS[ID]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ID, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 20], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.groundOnly, u.base.bat], [1, 'ranged', 'arts', true, false, 1.6], `${label(f)}: 中坚术师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.raw.tokens], [['emptyShip'], [], []], `${label(f)}: bonds / 特质 / no summon`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // E2 Lv1 1380 / 552 / 116, E2 Lv60 1639 / 624 / 125; CCR-X +120 / +40 → +175 / +65, CCR-Y +105 / +32 / +15 → +140 / +45 /
  // +25, ISW-A +100 / +55 → +130 / +80
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1380, 552, 1639, 624]);
  assert.deepEqual([modOf(5, CCRX).attr, modOf(6, CCRX).attr, modOf(5, CCRY).attr, modOf(6, CCRY).attr, modOf(5, ISWA).attr, modOf(6, ISWA).attr],
    [{ maxHp: 120, atk: 40 }, { maxHp: 175, atk: 65 }, { maxHp: 105, atk: 32, def: 15 }, { maxHp: 140, atk: 45, def: 25 }, { maxHp: 100, atk: 55 }, { maxHp: 130, atk: 80 }]);
});

test('a 自选 pick: 霍尔海雅 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks (ISW-A, a 集成战略 module, is refused)', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(ID));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(ID), `tier ${t}`);
  assert.equal(validateDiyPicks({ [SLOT[6]]: { charId: ID, skillIndex: 2, uniEquipId: ISWA } }, { data, kitted: KITTED_CHARS }).error, 'BAD_TARGET',
    'a 集成战略 module (ISW-A) is not a 自选 choice (shared/diy.js, W5K)');
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: ID, skillIndex: 2, uniEquipId: CCRX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: ID, skillIndex: 2, uniEquipId: CCRX } } });
});

test('S1 但为求索 (AUTO, 1 / 2 charges, data DEFAULT): the next attack hits two enemies at 200 % / 240 % ATK arts; with one enemy only it lifts it 2.5 / 3 s — before 传承终焉, so that hit is × 1.23 and silences', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const [ts, sil] = t0Of(tier, elite, null);
    assert.deepEqual([sk.skillType, sk.spCost, sk.maxChargeTime, sk.bb.atk_scale, sk.bb.levitate, ts, sil], ['AUTO', 8, elite ? 2 : 1, elite ? 2.4 : 2, elite ? 3 : 2.5, 1.23, 3], `T${tier}`);
    // two enemies: two shots, no lift
    {
      const { h, u } = field({ tier, elite, skill: 0 });
      assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.maxCharges], ['DEFAULT', elite ? 'charges' : 'instant', elite ? 2 : 1], `T${tier}`);
      u.skill.charges = 0;
      u.skill.sp = 0;
      const a = h.spawn('enemy_dummy', { pos: [10, 6] }), b = h.spawn('enemy_dummy', { pos: [11, 7] });
      u.skill.gainSp(999);
      const n0 = hitsBy(h, u).length;
      assert.ok(h.runUntil(() => hitsBy(h, u).slice(n0).filter((c) => c.dmg.isSkill).length >= 2, 3), `T${tier}: cast`);
      const sh = hitsBy(h, u).slice(n0).filter((c) => c.dmg.isSkill);
      assert.deepEqual(new Set(sh.slice(0, 2).map((c) => c.target)), new Set([a, b]), `T${tier}: one more target`);
      for (const c of sh.slice(0, 2)) approx(c.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
      assert.equal(statusBy(h, u, 'levitate').length, 0, `T${tier}: two shots — no lift`);
      done(h);
    }
    // one enemy: lifted, and that hit already counts as one on an air unit
    {
      const { h, u } = field({ tier, elite, skill: 0 });
      u.skill.charges = 0;
      u.skill.sp = 0;
      const a = h.spawn('enemy_dummy', { pos: [10, 6] });
      u.skill.gainSp(999);
      const n0 = hitsBy(h, u).length;
      assert.ok(h.runUntil(() => hitsBy(h, u).slice(n0).some((c) => c.dmg.isSkill), 3), `T${tier}: cast`);
      const sh = hitsBy(h, u).slice(n0).find((c) => c.dmg.isSkill);
      assert.equal(sh.target, a);
      approx(sh.amount, u.s.atk * sk.bb.atk_scale * ts, `T${tier}: × ${ts} (lifted first)`);
      const lev = statusBy(h, u, 'levitate');
      assert.equal(lev.length, 1, `T${tier}: lifted`);
      approx(lev[0].duration, sk.bb.levitate, `T${tier}: 浮空 ${sk.bb.levitate} s`);
      const sl = statusBy(h, u, 'silence');
      assert.ok(sl.length >= 1 && sl[0].target === a, `T${tier}: silenced`);
      approx(sl[0].duration, sil, `T${tier}: ${sil} s`);
      done(h);
    }
  }
});

test('S2 群星逶迤 (MANUAL, data DEFAULT): 16 s, each attack 9 shots of 27 % / 35 % ATK at random enemies of her range, each rolling 10 % / 12 % to lift 1 s; a lifted or flying target takes × 1.23', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const sc = sk.bb['attack@atk_scale'], p = sk.bb['attack@prob'];
    assert.deepEqual([sk.duration, sc, p, sk.bb['attack@levitate'], sk.spCost, sk.initSp], [16, elite ? 0.35 : 0.27, elite ? 0.12 : 0.1, 1, elite ? 32 : 36, elite ? 22 : 21], `T${tier}`);
    assert.match(sk.desc, /9连发/);
    const flying = [];
    const setup = (b) => b.on('damaged', (c) => { if (c.source?.uid === 1) flying.push(c.target.isFlying); }, { priority: -100 });
    const { h, u } = field({ tier, elite, skill: 1, seed: 21, setup });
    assert.equal(u.skill.rule, 'DEFAULT');
    let rolls = 0;
    const chance = h.b.rng.chance;
    h.b.rng.chance = (q) => { if (q === p) rolls++; return chance(q); };
    const foes = [[10, 6], [9, 6], [11, 6], [10, 7], [9, 7], [11, 7]].map((pos) => h.spawn('enemy_dummy', { pos }));
    const fly = h.spawn('enemy_fly', { pos: [10, 8] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    approx(u.skill.timeLeft, 16, `T${tier}: 16 s`, 0.05);
    const n0 = hitsBy(h, u).length, f0 = flying.length;
    assert.ok(h.runUntil(() => !u.skill.active, 17));
    h.run(0.6);
    const shots = hitsBy(h, u).slice(n0).filter((c) => c.dmg.isSkill);
    const fl = flying.slice(f0, f0 + hitsBy(h, u).slice(n0).length);
    const byAttack = new Map();
    for (const c of shots) byAttack.set(c.dmg.attackId, [...(byAttack.get(c.dmg.attackId) ?? []), c.target]);
    assert.ok(byAttack.size >= 9, `T${tier}: ${byAttack.size} attacks`);
    for (const [, ts] of byAttack) assert.equal(ts.length, 9, `T${tier}: 9 shots per attack`);
    for (const e of [...foes, fly]) assert.ok(shots.some((c) => c.target === e), `T${tier}: ${e.tileR},${e.tileC} drew shots (random)`);
    assert.equal(rolls, shots.length, `T${tier}: one ${p * 100} % roll per shot`);
    const lifts = statusBy(h, u, 'levitate');
    assert.ok(lifts.length > 0.5 * p * shots.length && lifts.length <= 1.3 * p * shots.length, `T${tier}: ${lifts.length} lifts of ${shots.length} shots`);
    assert.ok(lifts.every((c) => c.target !== fly && Math.abs(c.duration - 1) < 1e-9), `T${tier}: 1 s, never on a data flyer`);
    const all = hitsBy(h, u).slice(n0);
    all.forEach((c, i) => {
      if (!c.dmg.isSkill) return;
      approx(c.amount, u.s.atk * sc * (fl[i] ? 1.23 : 1), `T${tier}: shot ${i} (${fl[i] ? 'air' : 'ground'})`);
    });
    assert.ok(fl.filter(Boolean).length > shots.filter((c) => c.target === fly).length, `T${tier}: lifted ground enemies took × 1.23 too`);
    done(h);
  }
});

test('S3 博览者的狂语 (MANUAL, data ACTIVE_RANGE on 3-10): 45 s, interval 1.6 + 1.4 = 3.0 s, range 3-10 while on; each attack three whirlwinds (her row and the rows beside), 1 tile/s, each lifting the first enemy it touches then dealing 2.33→3.5 / 2.53→3.8 × ATK over 1.77 s (× 1.23: lifted)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const lo = sk.bb['attack@min_atk_scale'], hi = sk.bb['attack@max_atk_scale'], lev = sk.bb['attack@levitate'];
    assert.deepEqual([sk.rangeId, sk.duration, sk.bb.base_attack_time, lo, hi, lev, sk.spCost, sk.initSp], ['3-10', 45, 1.4, elite ? 2.53 : 2.33, elite ? 3.8 : 3.5, elite ? 2 : 1.8, elite ? 64 : 67, elite ? 42 : 41], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.rule, u.skill.triggerGrid], ['ACTIVE_RANGE', sk.rangeGrid], `T${tier}: the trigger`);
    h.run(0.6);
    u.skill.gainSp(999);
    // (10,9) is on 3-10 only: the cast comes with it; lanes: row 9 → (9,6) 1 tile ahead, row 10 → (10,8) before (10,9), row 11 → (11,9)
    const far = h.spawn('enemy_dummy', { pos: [10, 9] });
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: cast with an enemy on 3-10 only`);
    const near = h.spawn('enemy_dummy', { pos: [9, 6] }), mid = h.spawn('enemy_dummy', { pos: [10, 8] }), low = h.spawn('enemy_dummy', { pos: [11, 9] });
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 3-10 while on`);
    approx(u.s.interval, 3, `T${tier}: 3.0 s`);
    const n0 = hitsBy(h, u).length;
    h.run(6.5);
    const hits = hitsBy(h, u).slice(n0);
    const first = (e) => hits.find((c) => c.target === e);
    const scale = (age) => lo + (hi - lo) * Math.min(1, age / 1.77);
    approx(first(near).amount, u.s.atk * scale(0.5) * 1.23, `T${tier}: 0.5 tile flown`, 1e-3);
    approx(first(mid).amount, u.s.atk * hi * 1.23, `T${tier}: 2.5 tiles — the maximum`);
    approx(first(low).amount, u.s.atk * hi * 1.23, `T${tier}: 3.5 tiles`);
    assert.ok(!hits.some((c) => c.target === far), `T${tier}: (10,9) behind (10,8) in its lane is never reached`);
    for (const c of hits) assert.deepEqual([c.type, c.dmg.isAttack, c.dmg.isSkill], ['arts', true, true]);
    const lifts = statusBy(h, u, 'levitate');
    assert.ok(lifts.length >= 3 && lifts.every((c) => Math.abs(c.duration - lev) < 1e-9), `T${tier}: 浮空 ${lev} s`);
    assert.ok(statusBy(h, u, 'silence').length >= 3, `T${tier}: 传承终焉 silences the lifted`);
    u.skill.end('test');
    h.run(0.1);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 3-1`);
    approx(u.s.interval, 1.6, `T${tier}: interval back`);
    done(h);
  }
});

test('S3 whirlwinds: they fly 5 tiles at most, a heavy (mass > 3) target is lifted half as long, and those out when she leaves fly on without 传承终焉 or her module\'s RES ignore', () => {
  // 5 tiles: from her centre (col 4) a box reaches col 9.5 — (11,9) is struck 4.5 tiles out, (10,10) never
  {
    const { h, u } = field({ tier: 6, elite: true, skill: 2, col: 4 });
    u.skill.gainSp(999);
    const trig = h.spawn('enemy_dummy', { pos: [9, 8] });
    const edge = h.spawn('enemy_dummy', { pos: [11, 9] }), beyond = h.spawn('enemy_dummy', { pos: [10, 10] });
    assert.ok(h.runUntil(() => u.skill.active, 2));
    h.run(7);
    assert.ok(hitsBy(h, u).some((c) => c.target === trig && c.dmg.isSkill), 'the lane-9 whirlwind');
    assert.ok(hitsBy(h, u).some((c) => c.target === edge && c.dmg.isSkill), 'struck 4.5 tiles out');
    assert.ok(!hitsBy(h, u).some((c) => c.target === beyond), '6 tiles out: the whirlwind is gone');
    done(h);
  }
  // her module leaves with her (CCR-X stage 3 on RES 50): a whirlwind out when she retreats hits × 1 without the RES ignore
  {
    const { h, u } = field({ tier: 6, elite: true, mod: CCRX, skill: 2 });
    u.skill.gainSp(999);
    const e = h.spawn('enemy_r50', { pos: [10, 9] });
    assert.ok(h.runUntil(() => u.skill.active, 2));
    assert.ok(h.runUntil(() => u.mem.heyakWinds.length > 0, 5), 'whirlwinds out');
    h.run(0.5);
    const atk = u.s.atk;
    h.b.retreat(u);
    const s0 = statusBy(h, u, 'silence').length;
    assert.ok(h.runUntil(() => hitsBy(h, u).some((c) => c.target === e), 6), 'the whirlwind flies on');
    const c = hitsBy(h, u).find((x) => x.target === e);
    approx(c.amount, arts(atk * 3.8, 50, 0), 'no 传承终焉 (× 1.38) and no RES ignore');
    assert.equal(statusBy(h, u, 'silence').length, s0, 'no silence');
    assert.equal(statusBy(h, u, 'levitate').filter((x) => x.target === e).length, 1, 'still lifted');
    done(h);
  }
  // a mass-4 target: 浮空 halved (2 s → 1 s at rank 7); 曾有羽翼's 失重 lowers it to 3 while above 80 % HP
  {
    const { h, u } = field({ tier: 6, elite: true, skill: 2 });
    u.skill.gainSp(999);
    const heavy = h.spawn('enemy_heavy', { pos: [10, 9] });
    heavy.base.massLevel = 4;
    heavy.markDirty();
    heavy.hp = heavy.s.maxHp * 0.7; // below 80 %: no 失重
    assert.ok(h.runUntil(() => u.skill.active, 2));
    assert.ok(h.runUntil(() => statusBy(h, u, 'levitate').length > 0, 8));
    approx(statusBy(h, u, 'levitate')[0].duration, 1, 'mass 4: half of 2 s');
    done(h);
  }
});

test('T1 传承终焉: hits on air units × 1.23 and silence 3 s (CCR-X stage 3: × 1.38 / 5 s, ISW-A stage 3: × 1.48 / 5 s; stage 1 modules keep 1.23 / 3); ground targets: neither', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const [ts, sil] = t0Of(tier, elite, elite ? mod : null);
    const want = elite && tier === 6 && mod === CCRX ? [1.38, 5] : elite && tier === 6 && mod === ISWA ? [1.48, 5] : [1.23, 3];
    assert.deepEqual([ts, sil], want, `${label(f)}: the data`);
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const fly = h.spawn('enemy_fly', { pos: [10, 6] });
    const n0 = hitsBy(h, u).length;
    h.run(1.7);
    const c = hitsBy(h, u).slice(n0).find((x) => x.target === fly && x.dmg.isAttack);
    assert.ok(c, label(f));
    approx(c.amount, u.s.atk * ts, `${label(f)}: × ${ts} on a flyer`);
    const sl = statusBy(h, u, 'silence').find((x) => x.target === fly);
    assert.ok(sl, `${label(f)}: silenced`);
    approx(sl.duration, sil, `${label(f)}: ${sil} s`);
    h.b.kill(fly, null);
    const g = h.spawn('enemy_dummy', { pos: [10, 6] });
    const n1 = hitsBy(h, u).length, s1 = statusBy(h, u, 'silence').length;
    h.run(1.7);
    const cg = hitsBy(h, u).slice(n1).find((x) => x.target === g && x.dmg.isAttack);
    approx(cg.amount, u.s.atk, `${label(f)}: × 1 on the ground`);
    assert.equal(statusBy(h, u, 'silence').length, s1, `${label(f)}: no silence on the ground`);
    done(h);
  }
});

test('T2 曾有羽翼: 失重 (weight −1) on every enemy of her range above 80 % HP, gone below it or out of range, never on top of another 失重; CCR-Y stage 3: above 50 %, and 20 % 【法术脆弱】 below 50 %', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const y3 = elite && tier === 6 && mod === CCRY;
    const thr = y3 ? 0.5 : 0.8;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const inR = h.spawn('enemy_heavy', { pos: [10, 6] }), out = h.spawn('enemy_heavy', { pos: [10, 10] });
    h.step(2);
    assert.ok(inR.findBuff('heyak:weightless'), `${label(f)}: full HP in range`);
    assert.equal(inR.weight, 1, `${label(f)}: mass 2 → 1`);
    assert.equal(out.findBuff('heyak:weightless'), null, `${label(f)}: out of range`);
    inR.hp = inR.s.maxHp * (thr + 0.01);
    h.step();
    assert.ok(inR.findBuff('heyak:weightless'), `${label(f)}: above ${thr * 100} %`);
    inR.hp = inR.s.maxHp * (thr - 0.01);
    h.step();
    assert.equal(inR.findBuff('heyak:weightless'), null, `${label(f)}: below ${thr * 100} %`);
    assert.equal(inR.weight, 2, `${label(f)}: mass back`);
    inR.hp = inR.s.maxHp * 0.3;
    h.run(0.5);
    const fr = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'artsFragile' && c.target === inR);
    assert.equal(fr.length > 0, y3, `${label(f)}: 【法术脆弱】 below 50 %`);
    if (y3) { assert.equal(fr[0].value, 0.2); approx(inR.s.artsTakenMul, 1.2, `${label(f)}: arts taken × 1.2`); }
    // another source's 失重 (安洁莉娜's key): not doubled
    inR.hp = inR.s.maxHp;
    h.b.addBuff(inR, { key: 'aglina:weightless', status: 'weightless', duration: 1, mods: { massFlat: -1 } });
    h.step();
    assert.equal(inR.findBuff('heyak:weightless'), null, `${label(f)}: 同名效果不可叠加`);
    assert.equal(inR.weight, 1);
    h.run(1.1);
    assert.ok(inR.findBuff('heyak:weightless'), `${label(f)}: hers again once the other ended`);
    h.b.retreat(u);
    h.step();
    assert.equal(inR.findBuff('heyak:weightless'), null, `${label(f)}: gone when she leaves`);
    done(h);
  }
  const hp = formOf(6, true).modules.find((m) => m.uniEquipId === CCRY).talentChanges;
  assert.deepEqual([hp.find((t) => t.talentIndex === 1).bb, hp.find((t) => t.talentIndex === -1).bb], [{ hp_ratio: 0.5 }, { damage_scale: 1.2, hp_ratio: 0.5 }]);
});

test('modules: CCR-X "无视目标10点法术抗性" (stages 1 and 3); CCR-Y "普通攻击命中精英或领袖敌人时获得1点技力"; ISW-A (集成战略 only): no RES ignore, no SP, no goal-tile 浮空, no radius-1.1 skill splash — its stats and 传承终焉 numbers only', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const x = elite && mod === CCRX, y = elite && mod === CCRY, w = elite && mod === ISWA;
    assert.equal(u.s.resIgnoreFlat, x ? 10 : 0, `${label(f)}: RES ignore`);
    if (w) assert.match(u.def.raw.trait.moduleDesc, /^在集成战略中/, `${label(f)}: the ISW trait text`);
    const foe = h.spawn('enemy_r50', { pos: [10, 6] });
    const n0 = hitsBy(h, u).length;
    h.run(3.5);
    const hits = hitsBy(h, u).slice(n0).filter((c) => c.target === foe && c.dmg.isAttack);
    assert.ok(hits.length >= 2, label(f));
    approx(hits[0].amount, arts(u.s.atk, 50, x ? 10 : 0), `${label(f)}: arts on RES 50`);
    const traitSp = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'trait').length;
    assert.equal(traitSp(), 0, `${label(f)}: no SP from a normal enemy`);
    h.b.kill(foe, null);
    const el = h.spawn('enemy_elite', { pos: [10, 6] });
    const k0 = traitSp(), a0 = hitsBy(h, u).filter((c) => c.target === el && c.dmg.isAttack).length;
    h.run(3.5);
    const hitsE = hitsBy(h, u).filter((c) => c.target === el && c.dmg.isAttack).length - a0;
    assert.equal(traitSp() - k0, y ? hitsE : 0, `${label(f)}: +1 SP per hit on an elite`);
    done(h);
  }
  // ISW-A stage 3: a whirlwind strikes its target only (the 1.1 splash is 集成战略-only)
  const { h, u } = field({ tier: 6, elite: true, mod: ISWA, skill: 2 });
  u.skill.gainSp(999);
  const t = h.spawn('enemy_dummy', { pos: [10, 9] });
  const side = h.spawn('enemy_dummy', { pos: [10, 9] });
  side.x = 9.6; side.y = 9.7; // 0.67 from it, behind it in lane 10 (whose whirlwind is spent on it), outside lane 9
  assert.ok(h.runUntil(() => u.skill.active, 2));
  h.run(8);
  assert.ok(hitsBy(h, u).some((c) => c.target === t), 'the target');
  assert.ok(!hitsBy(h, u).some((c) => c.target === side), 'nothing beside it');
  assert.ok(!statusBy(h, u, 'levitate').some((c) => c.target === side), 'no splash 浮空');
  done(h);
});
