// test/content/op_lin.test.js — the 自选 operator kit of 林 (char_4080_lin, 6★ 阵法术师; kit
// server/sim/content/kits/ops/op-lin.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, PLX-X
// “七窍玲珑” or PLX-Y “情与义” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form
// of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_lin.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const LIN = 'char_4080_lin';
const FORMS = BACKUPS.units[LIN].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const PLXX = 'uniequip_002_lin', PLXY = 'uniequip_003_lin';
const S1 = 'skchr_lin_1', S2 = 'skchr_lin_2', S3 = 'skchr_lin_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_weak: dummy('enemy_weak', { hp: 10 }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, PLXX, PLXY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
/** Her x-1 (and x-2) range from (10, 5) facing RIGHT, as [row, col]. */
const X1 = [[12, 5], [11, 4], [11, 5], [11, 6], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7], [9, 4], [9, 5], [9, 6], [8, 5]];

/** A battle with 林 as uid 1 at (10, 5) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, others = [], seed = 5, setup = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed, setup,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'spGain'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: LIN, skillIndex: skill, uniEquipId: mod }, elite, row: 10, col: 5 }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const glassHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('lin:glass'));
const glassOf = (a) => a.findBuff('lin:glass');
/** True damage straight to `t` from `src` (no DEF / RES: the exact amount meets the 琉璃璧). */
const hurt = (h, src, t, n) => h.b.dealDamage(src, t, { amount: n, type: 'true' });
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('林 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, x-1 range, 阵法术师 (no attack and the guard while no skill runs; every enemy of her range, air too, while one does)', () => {
  assert.equal(OPERATOR_KITS[LIN], KITS[LIN]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [LIN, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res, u.base.bat], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 15, 2], `${label(f)}: stats`);
      assert.deepEqual([u.profile.noAttackUnlessSkill, u.profile.allInRange, u.profile.canHitFly, u.profile.dmgType, u.profile.projectile], [true, true, true, 'arts', 'beam'], `${label(f)}: 阵法术师`);
      const plxx = elite && mod === PLXX;
      assert.deepEqual([u.profile.guardDef, u.profile.guardRes], plxx ? [2.15, 25] : [2, 20], `${label(f)}: trait tunables`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: x-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [BACKUPS.diy.operators[LIN].bonds, []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: enemies target her`);
      done(h);
    }
  }
  // E2 Lv1 1679 / 764 / 212, E2 Lv60 1924 / 843 / 232; PLX-X +62 / +45 → +77 / +53 ATK / DEF, PLX-Y +50 / +20 → +73 / +40
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1679, 764, 1924, 843]);
  assert.deepEqual([modOf(5, PLXX).attr, modOf(6, PLXX).attr, modOf(5, PLXY).attr, modOf(6, PLXY).attr], [{ atk: 62, def: 45 }, { atk: 77, def: 53 }, { atk: 50, def: 20 }, { atk: 73, def: 40 }]);
});

test('a 自选 pick: 林 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(LIN));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(LIN), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: LIN, skillIndex: 0, uniEquipId: PLXX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: LIN, skillIndex: 0, uniEquipId: PLXX } } });
});

test('trait + PLX-X: DEF ×3 / RES +20 while no skill runs (PLX-X ×3.15 / +25); while one runs the guard is off — PLX-X keeps DEF +100 % / RES +10 (stages 1 and 3)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const plxx = elite && mod === PLXX;
    if (plxx) assert.deepEqual(u.def.raw.trait.bb, { def: 2.15, magic_resistance: 25, 'lin_e_002[buff].def': 1, 'lin_e_002[buff].magic_resistance': 10 }, label(f));
    approx(u.s.def, u.base.def * (1 + (plxx ? 2.15 : 2)), `${label(f)}: guard DEF`);
    approx(u.s.res, 15 + (plxx ? 25 : 20), `${label(f)}: guard RES`);
    h.run(1);
    assert.equal(atkHits(h, u).length, 0, `${label(f)}: no attack while no skill runs`);
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 1), `${label(f)}: 荫庇`);
    approx(u.s.def, u.base.def * (1 + (plxx ? 1 : 0)), `${label(f)}: skill DEF`);
    approx(u.s.res, 15 + (plxx ? 10 : 0), `${label(f)}: skill RES`);
    h.runUntil(() => !u.skill.active, 30);
    approx(u.s.def, u.base.def * (1 + (plxx ? 2.15 : 2)), `${label(f)}: the guard is back`);
    done(h);
  }
});

test('S1 玲珑 (MANUAL, data SEARCH, a 状态切换类 skill: switched on once and kept): cast as soon as an enemy is in her range; ATK +25 % / +40 %, interval 2 → 3 s, every enemy of her range (air too) 停顿 0.8 / 0.9 s per attack', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.kind, sk.bb.atk, sk.bb['attack@sluggish'], sk.bb.base_attack_time, u.skill.spCost], ['SEARCH', 'toggle', elite ? 0.4 : 0.25, elite ? 0.9 : 0.8, 1, elite ? 6 : 8], `T${tier}`);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `T${tier}: nobody in range`);
    const a = h.spawn('enemy_dummy', { pos: [10, 7] }), b = h.spawn('enemy_fly', { pos: [11, 5] }), off = h.spawn('enemy_dummy', { pos: [10, 8] });
    assert.ok(h.runUntil(() => u.skill.active, 0.2), `T${tier}: cast at once (SEARCH)`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.interval, 3, `T${tier}: 3 s`);
    h.runUntil(() => atkHits(h, u).length >= 2, 4);
    const hits = atkHits(h, u);
    assert.deepEqual(hits.map((c) => c.target.id).sort(), [a.id, b.id].sort(), `T${tier}: both in range, air too`);
    for (const c of hits) { approx(c.amount, u.s.atk, `T${tier}: 100 % ATK`); assert.equal(c.type, 'arts', `T${tier}: arts`); }
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: x-1 while it runs`);
    const slow = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'sluggish');
    assert.deepEqual(slow.map((c) => c.target.id).sort(), [a.id, b.id].sort(), `T${tier}: 停顿 on each`);
    for (const c of slow) approx(c.duration, sk.bb['attack@sluggish'], `T${tier}: 停顿 ${sk.bb['attack@sluggish']} s`);
    assert.ok(!hits.some((c) => c.target === off), `T${tier}: outside x-1`);
    h.run(120);
    assert.deepEqual([u.skill.active, u.skill.activations], [true, 1], `T${tier}: kept on`);
    done(h);
  }
});

test('S2 荫庇 (MANUAL, data SEARCH, 25 s): ASPD +50 / +90, taunt −1; every allied unit of her range gets its own 琉璃璧 (threshold 200, Lin\'s ATK, centred on it, its own regrowth), lost at the end; none outside', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, PLXY]]) {
    const sk = skillOf(tier, elite, S2);
    const t0 = formOf(tier, elite).modules?.find((m) => m.uniEquipId === mod)?.talentChanges.find((t) => t.talentIndex === 0)?.bb ?? formOf(tier, elite).talents[0].bb;
    const others = [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 6 }, { uid: 3, chessId: 'chess_char_1_02_a', row: 12, col: 9 }];
    const { h, u } = field({ tier, elite, mod, skill: 1, others });
    const near = h.unit(2), far = h.unit(3);
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.attack_speed, sk.bb.taunt_level], ['SEARCH', 25, elite ? 90 : 50, -1], `T${tier}`);
    assert.equal(glassOf(near), null, `T${tier}: no copy before the skill`);
    u.skill.gainSp(999);
    const e0 = h.spawn('enemy_dummy', { pos: [11, 5] });
    assert.ok(h.runUntil(() => u.skill.active, 0.5), `T${tier}: cast`);
    h.run(0.2);
    assert.deepEqual([u.s.aspd, u.s.taunt], [100 + sk.bb.attack_speed, -1], `T${tier}: ASPD / taunt`);
    assert.deepEqual([glassOf(near)?.shield, glassOf(near)?.source === u, glassOf(far)], [200, true, null], `T${tier}: a copy in range only`);
    // the copy breaks on a hit over 200: burst on Lin's range centred on the ally, Lin's ATK, source Lin
    const inBurst = h.spawn('enemy_dummy', { pos: [10, 8] }), outBurst = h.spawn('enemy_dummy', { pos: [10, 9] });
    h.step();
    const hp0 = near.hp;
    hurt(h, e0, near, 300);
    approx(hp0 - near.hp, 100, `T${tier}: 300 − 200 through`);
    assert.equal(glassOf(near), null, `T${tier}: broken`);
    const gh = glassHits(h, u);
    assert.ok(gh.some((c) => c.target === inBurst) && !gh.some((c) => c.target === outBurst), `T${tier}: centred on the ally`);
    approx(gh.find((c) => c.target === inBurst).amount, u.s.atk * t0.atk_scale * (mod === PLXY ? 1 + 0.03 : 1), `T${tier}: ${t0.atk_scale * 100} % Lin ATK`);
    assert.ok(h.hooksOf('statusApplied').some((c) => c.source === u && c.status === 'stun' && c.target === inBurst), `T${tier}: stunned`);
    h.run(t0.interval - 0.2);
    assert.equal(glassOf(near), null, `T${tier}: not before ${t0.interval} s`);
    h.run(0.4);
    assert.equal(glassOf(near)?.shield, 200, `T${tier}: back after ${t0.interval} s`);
    h.runUntil(() => !u.skill.active, 30);
    assert.equal(glassOf(near), null, `T${tier}: gone with the skill`);
    assert.ok(glassOf(u), `T${tier}: hers stays`);
    done(h);
  }
});

test('S3 流光乍裂 (MANUAL, data CUSTOM_RANGE x-2, 26 / 28 s): cast with an enemy in x-2; range x-2 while on (bursts too), back after; ATK +125 % / +160 %; her 琉璃璧 threshold ×2 / ×2.5; a knock-out by her attack breaks it (burst) and raises it at once', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.atk, sk.bb.talent_scale, sk.rangeId], ['CUSTOM_RANGE', elite ? 28 : 26, elite ? 1.6 : 1.25, elite ? 2.5 : 2, 'x-2'], `T${tier}`);
    assert.deepEqual(sk.trigger.customRangeGrid, sk.rangeGrid);
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [11, 7] });   // x-2 [1, 2], not x-1
    assert.ok(h.runUntil(() => u.skill.active, 0.5), `T${tier}: cast with an enemy in x-2`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: x-2`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    const thr = 200 * sk.bb.talent_scale;
    assert.equal(glassOf(u).shield, thr, `T${tier}: threshold ${thr}`);
    const hp0 = u.hp;
    hurt(h, e, u, 450);
    if (thr > 450) { assert.equal(u.hp, hp0, `T${tier}: 450 absorbed`); assert.ok(glassOf(u)); } else { approx(hp0 - u.hp, 450 - thr, `T${tier}: 450 − ${thr}`); assert.equal(glassOf(u), null); }
    // a knock-out by her attack: burst (x-2 around her) and the 琉璃璧 standing again at once
    if (!glassOf(u)) { h.run(9); assert.ok(glassOf(u), `T${tier}: regrown`); }
    const witness = h.spawn('enemy_dummy', { pos: [9, 3] });   // x-2 [−1, −2]
    const weak = h.spawn('enemy_weak', { pos: [10, 6] });
    h.step();
    const g0 = glassHits(h, u).length;
    h.runUntil(() => !weak.alive, 4);
    h.step();
    assert.ok(glassHits(h, u).slice(g0).some((c) => c.target === witness), `T${tier}: the kill's burst reaches x-2`);
    assert.equal(glassOf(u)?.shield, thr, `T${tier}: raised again at once`);
    h.runUntil(() => !u.skill.active, 40);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: x-1 again`);
    assert.equal(glassOf(u)?.shield, 200, `T${tier}: plain threshold again`);
    done(h);
  }
});

test('T1 计出万全 (every form): a 琉璃璧 from deployment — a hit ≤ 200 absorbed whole, a hit over 200 goes through less 200 and breaks it: stun 1 s first, then 110 % / 120 % ATK arts on her range, regrowing after 8 s / 6 s (PLX-Y stage 3); a lethal hit still breaks it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const order = [];
    const { h, u } = field({ tier, elite, mod, skill: 2, setup: (b) => {
      b.on('statusApplied', (c) => { if (c.status === 'stun' && c.source?.uid === 1) order.push('stun'); });
      b.on('damaged', (c) => { if (c.dmg?.tags?.includes('lin:glass')) order.push(c.target.s.flags.stun ? 'hit-stunned' : 'hit'); });
    } });
    const t0 = u.def.raw.talents.find((t) => t.index === 0).bb;
    const y3 = elite && tier === 6 && mod === PLXY;
    assert.deepEqual([t0.value, t0.atk_scale, t0.stun, t0.interval], [200, y3 ? 1.2 : 1.1, 1, y3 ? 6 : 8], label(f));
    assert.equal(glassOf(u)?.shield, 200, `${label(f)}: up from deployment`);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] }), out = h.spawn('enemy_dummy', { pos: [10, 9] });
    h.step();
    const hp0 = u.hp;
    hurt(h, e, u, 150);
    hurt(h, e, u, 200);
    assert.deepEqual([u.hp, glassOf(u)?.shield], [hp0, 200], `${label(f)}: 150 and 200 absorbed, full again`);
    hurt(h, e, u, 300);
    approx(hp0 - u.hp, 100, `${label(f)}: 300 − 200`);
    assert.equal(glassOf(u), null, `${label(f)}: broken`);
    const gh = glassHits(h, u);
    assert.deepEqual(gh.map((c) => c.target.id), [e.id], `${label(f)}: her range only`);
    const plxy = elite && mod === PLXY ? 1 + 0.03 * 1 : 1;
    approx(gh[0].amount, u.s.atk * t0.atk_scale * plxy, `${label(f)}: ${t0.atk_scale * 100} % ATK`);
    assert.deepEqual(order, ['stun', 'hit-stunned'], `${label(f)}: stun first`);
    assert.ok(!h.hooksOf('statusApplied').some((c) => c.target === out && c.status === 'stun'), `${label(f)}: none outside`);
    h.run(t0.interval - 0.1);
    assert.equal(glassOf(u), null, `${label(f)}: not yet`);
    h.run(0.2);
    assert.equal(glassOf(u)?.shield, 200, `${label(f)}: back after ${t0.interval} s`);
    // a lethal hit: the burst still comes
    const n0 = glassHits(h, u).length;
    hurt(h, e, u, u.hp + 1000);
    assert.equal(u.alive, false, `${label(f)}: knocked out`);
    assert.equal(glassHits(h, u).length, n0 + 1, `${label(f)}: the lethal hit broke it`);
    done(h);
  }
});

test('T2 韬光: each damage instance she takes rolls 55 % for +1 SP (PLX-X stage 3: 80 %, +2) — one the 琉璃璧 absorbs whole too; a 流失 never', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2, seed: 33 });
    const x3 = elite && tier === 6 && mod === PLXX;
    const t1 = u.def.raw.talents.find((t) => t.index === 1).bb;
    assert.deepEqual([t1.prob, t1.sp], x3 ? [0.8, 2] : [0.55, 1], label(f));
    const e = h.spawn('enemy_dummy', { pos: [10, 9] });
    h.step();
    const gains = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'talent');
    const hp0 = u.hp;
    for (let i = 0; i < 200; i++) { if (i % 10 === 0) u.skill.sp = 0; hurt(h, e, u, 50); }
    assert.equal(u.hp, hp0, `${label(f)}: all absorbed`);
    const absorbed = gains();
    assert.ok(Math.abs(absorbed.length / 200 - t1.prob) < 0.12, `${label(f)}: absorbed hits roll too: ${absorbed.length} / 200 ≈ ${t1.prob * 100} %`);
    assert.ok(absorbed.every((c) => c.amount === t1.sp), `${label(f)}: +${t1.sp} SP`);
    hurt(h, e, u, 400);   // breaks it: 200 through
    const n0 = gains().length;
    for (let i = 0; i < 200; i++) { if (i % 10 === 0) u.skill.sp = 0; hurt(h, e, u, 1); }
    const g = gains().slice(n0);
    assert.ok(Math.abs(g.length / 200 - t1.prob) < 0.12, `${label(f)}: ${g.length} / 200 ≈ ${t1.prob * 100} %`);
    const n1 = gains().length;
    for (let i = 0; i < 50; i++) { u.skill.sp = 0; h.b.loseHp(u, 1, { source: e }); }
    assert.equal(gains().length, n1, `${label(f)}: a 流失 rolls nothing`);
    done(h);
  }
});

test('PLX-Y “情与义” (stages 1 and 3): +3 % damage per enemy on her range, at most 5 (+15 %); none without it', () => {
  for (const f of FORMS_ALL.filter(([, elite]) => elite)) {
    const [tier, , mod] = f;
    const plxy = mod === PLXY;
    for (const n of [2, 7]) {
      const { h, u } = field({ tier, elite: true, mod, skill: 0 });
      if (plxy) assert.deepEqual(u.def.raw.talents.filter((t) => t.index === -1).map((t) => t.bb), [{ damage_scale: 0.03, max_valid_stack_cnt: 5 }], label(f));
      const tiles = [[10, 6], [10, 7], [11, 5], [9, 5], [11, 4], [9, 4], [11, 6]].slice(0, n);
      for (const p of tiles) h.spawn('enemy_dummy', { pos: p });
      u.skill.gainSp(999);
      h.runUntil(() => atkHits(h, u).length >= n, 5);
      for (const c of atkHits(h, u).slice(0, n)) approx(c.amount, u.s.atk * (plxy ? 1 + 0.03 * Math.min(5, n) : 1), `${label(f)}: ${n} enemies`);
      done(h);
    }
  }
});

test('the x-1 grid of the tests is her data range (from (10, 5) facing RIGHT)', () => {
  const { h, u } = field({});
  assert.deepEqual([...u.rangeKeys].sort((a, b) => a - b), X1.map(([r, c]) => r * 21 + c).sort((a, b) => a - b));
  done(h);
});
