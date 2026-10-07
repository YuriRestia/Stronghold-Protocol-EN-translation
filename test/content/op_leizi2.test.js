// test/content/op_leizi2.test.js — the 自选 operator kit of 司霆惊蛰 (char_1043_leizi2, 6★ 解放者; kit
// server/sim/content/kits/ops/op-leizi2.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or LIB-X
// “一念” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of that slot
// status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_leizi2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { COLS } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const LEIZI2 = 'char_1043_leizi2';
const FORMS = BACKUPS.units[LEIZI2].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const LIBX = 'uniequip_002_leizi2';
const S1 = 'skchr_leizi2_1', S2 = 'skchr_leizi2_2', S3 = 'skchr_leizi2_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const tOf = (tier, elite, mod, i) => {
  const base = formOf(tier, elite).talents.find((t) => t.index === i).bb;
  const ch = elite && mod ? modOf(tier, mod).talentChanges.find((t) => t.talentIndex === i) : null;
  return { ...base, ...(ch?.bb ?? {}) };
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_shooter: dummy('enemy_shooter', { atk: 100, range: 2.5, bat: 1 }),
  enemy_flyshooter: dummy('enemy_flyshooter', { atk: 100, range: 2.5, bat: 1, motion: 'FLY' }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, LIBX].map((m) => [t, true, m]))];
const COUNT_IV = 31 / 30;

/** A battle with 司霆惊蛰 as uid 1 at (row, col) facing RIGHT; `rec` logs her damage with her ATK at that moment. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, seed = 5, silence = false } = {}) {
  const log = [];
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: LEIZI2, skillIndex: skill, uniEquipId: mod }, elite, row, col }],
    setup(b) {
      b.on('damaged', (c) => {
        const u = b.allyUnits.find((a) => a.uid === 1);
        if (c.source === u) log.push({ t: b.time, e: c.target, amount: c.amount, type: c.type, atk: u.s.atk, mul: u.s.atkScaleMul, tags: c.dmg?.tags || [], isAttack: !!c.dmg?.isAttack, isSplash: !!c.dmg?.isSplash, attackId: c.dmg?.attackId });
      }, { priority: 1000 });
    },
  });
  h.step();
  const u = h.unit(1);
  if (silence) h.b.addBuff(u, { key: 'test:silence', flags: { silence: true }, persist: true });
  return { h, u, log };
}
const tagged = (x, t) => x.tags.includes(t);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

test('司霆惊蛰 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-2, a 解放者 (no attack, block 0 while no skill runs), 起飞, melee physical ground-only, 炎, no 特质', () => {
  assert.equal(OPERATOR_KITS[LEIZI2], KITS[LEIZI2]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill, silence: true });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [LEIZI2, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([form.stats.blockCnt, u.s.blockCnt, u.profile.sub, u.profile.noAttackUnlessSkill, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [3, 0, 'librator', true, 'melee', false, 'phys', 1.2], `${label(f)}: 解放者`);
      assert.deepEqual([u.profile.rampMax, u.profile.rampTime, u.profile.rampInit], [2, 40, elite && mod === LIBX ? 1 : 0], `${label(f)}: the trait's ramp`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-2`);
      assert.deepEqual([form.tokens, form.displayTokens, u.def.raw.tokens], [[], [], []], `${label(f)}: no summons`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: 起飞`);
      done(h);
    }
  }
  // E2 Lv1 3206 / 335 / 417, E2 Lv60 3642 / 371 / 466 (full potential); LIB-X +225 / +26 / +27 → +360 / +42 / +36 (HP / ATK / DEF)
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [3206, 335, 3642, 371]);
  assert.deepEqual([modOf(5, LIBX).attr, modOf(6, LIBX).attr], [{ maxHp: 225, atk: 26, def: 27 }, { maxHp: 360, atk: 42, def: 36 }]);
});

test('a 自选 pick: 司霆惊蛰 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(LEIZI2));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(LEIZI2), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: LEIZI2, skillIndex: 2, uniEquipId: LIBX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: LEIZI2, skillIndex: 2, uniEquipId: LIBX } } });
});

test('trait + LIB-X: ATK +5 % a second up to +200 % while no skill runs (LIB-X stages 1 / 3: +100 % from each deployment); she never attacks then', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1, silence: true });
    const init = elite && mod === LIBX ? 1 : 0;
    approx(u.s.atk, u.base.atk * (1 + init), `${label(f)}: at the deployment`);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    h.run(10.05);
    approx(u.s.atk, u.base.atk * (1 + Math.min(2, init + 0.5)), `${label(f)}: after 10 s`);
    h.run(40);
    approx(u.s.atk, u.base.atk * 3, `${label(f)}: +200 % at most`);
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u).length, 0, `${label(f)}: no attack`);
    done(h);
  }
});

test('T1 明断 起飞: while no skill runs ground enemies never target her (a ground shooter in range stays idle, a flying one hits her); a skill lands her (0.5 s with no attack, counted in its time) and she blocks 3; after it the take-off clip (0.933 s) passes before she is up again', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const { h, u } = field({ tier, elite, skill: 1, silence: true });
    const g = h.spawn('enemy_shooter', { pos: [10, 7] });
    h.run(4);
    assert.equal(h.hooksOf('damaged').filter((c) => c.target === u && c.source === g).length, 0, `T${tier}: the ground shooter cannot select her`);
    const air = h.spawn('enemy_flyshooter', { pos: [11, 6] });
    h.run(3);
    assert.ok(h.hooksOf('damaged').some((c) => c.target === u && c.source === air), `T${tier}: a flyer can`);
    h.spawn('enemy_dummy', { pos: [10, 6] });   // S2's SEARCH: a ground enemy on her 1-2
    h.b.removeBuff(u, 'test:silence');
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: S2 (an enemy on her 1-2)`);
    const cast = h.b.time;
    assert.deepEqual([!!u.s.flags.liftoff, u.s.blockCnt], [false, 3], `T${tier}: landed`);
    h.run(3);
    assert.ok(h.hooksOf('damaged').some((c) => c.target === u && c.source === g), `T${tier}: now the ground shooter hits her`);
    const first = h.hooksOf('attack').find((c) => c.attacker === u);
    approx(first.t - cast, 0.5, `T${tier}: her first attack once the landing is over`, 0.05);
    h.runUntil(() => !u.skill.active, 40);
    approx(h.b.time - cast, skillOf(tier, elite, S2).duration, `T${tier}: the landing counts in the 36 s`, 0.05);
    h.step();
    assert.deepEqual([!!u.s.flags.liftoff, u.s.blockCnt], [false, 0], `T${tier}: taking off`);
    h.run(0.8);
    assert.ok(!u.s.flags.liftoff, `T${tier}: still taking off`);
    h.run(0.15);
    assert.deepEqual([!!u.s.flags.liftoff, u.s.blockCnt], [true, 0], `T${tier}: up again`);
    done(h);
  }
});

test('T1 明断 strikes: every 1.0333 s each tile of her range counts — a struck tile is struck again 8–12 counts later, a new one within 2–16 — for 100 % ATK arts on every enemy there, air units too, 0.15 s after the cast', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, LIBX]]) {
    const t0 = tOf(tier, elite, mod, 0);
    assert.deepEqual([t0.interval, t0.atk_scale_t, t0.times], [1, 1, 1]);
    const { h, log } = field({ tier, elite, mod, skill: 0, silence: true });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] }), fly = h.spawn('enemy_fly', { pos: [11, 5] }), off = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.run(300);
    for (const tgt of [e, fly]) {
      const hits = log.filter((x) => x.e === tgt && tagged(x, 'leizi2:thunder'));
      assert.ok(hits.length >= 20, `T${tier}: ${hits.length} strikes on ${tgt.defId}`);
      const first = Math.round((hits[0].t - 0.15) / COUNT_IV);
      assert.ok(first >= 2 && first <= 16, `T${tier}: the first after ${first} counts`);
      approx(hits[0].t - 0.15, first * COUNT_IV, `T${tier}: on a count, landing 0.15 s later`, 0.02);
      for (let i = 1; i < hits.length; i++) {
        const k = (hits[i].t - hits[i - 1].t) / COUNT_IV;
        assert.ok(Math.abs(k - Math.round(k)) < 0.03 && Math.round(k) >= 8 && Math.round(k) <= 12, `T${tier}: ${k} counts apart`);
      }
      for (const x of hits) { approx(x.amount, x.atk * x.mul, `T${tier}: 100 % ATK`); assert.equal(x.type, 'arts'); approx(x.mul, 1, 'no skill: ×1'); }
    }
    assert.equal(log.filter((x) => x.e === off).length, 0, `T${tier}: (10,7) is off her 1-2`);
    done(h);
  }
});

test('T1: ×1.11 (LIB-X stage 3: ×1.17) on everything she deals while a skill runs — an atkScaleMul buff for the skill\'s time', () => {
  for (const f of [[5, false, null], [6, true, null], [5, true, LIBX], [6, true, LIBX]]) {
    const [tier, elite, mod] = f;
    const up = tOf(tier, elite, mod, 0)['atk_scale[skill_up]'];
    assert.equal(up, elite && mod === LIBX && tier === 6 ? 1.17 : 1.11, label(f));
    const { h, u, log } = field({ tier, elite, mod, skill: 1 });
    approx(u.s.atkScaleMul, 1, `${label(f)}: off`);
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 2));
    approx(u.s.atkScaleMul, up, `${label(f)}: on`);
    h.run(4);
    const atk = log.filter((x) => x.isAttack);
    assert.ok(atk.length > 0, `${label(f)}: attacks`);
    for (const x of atk) approx(x.amount, x.atk * skillOf(tier, elite, S2).bb['attack@atk_scale_s2'] * up, `${label(f)}: S2 attack × ${up}`);
    h.runUntil(() => !u.skill.active, 40);
    approx(u.s.atkScaleMul, 1, `${label(f)}: off again`);
    done(h);
  }
});

test('T2 追责: every cast strikes each low tile of her range ring by ring from her tile (0.25 s apart; S1 0.07 s), landing 0.15 s later: 100 % ATK × skill bonus arts and 3 s 战栗 on every enemy there, air units too', () => {
  const t1 = tOf(5, false, null, 1);
  assert.deepEqual([t1.atk_scale_t2, t1.not_combat], [1, 3]);
  for (const [skill, gap, pos, d] of [[2, 0.25, [10, 7], 2], [0, 0.07, [10, 6], 1], [2, 0.25, [11, 6], 2]]) {
    const { h, u, log } = field({ tier: 5, skill });
    const e = h.spawn(pos[0] === 11 ? 'enemy_fly' : 'enemy_dummy', { pos });
    u.skill.gainSp(999);
    if (skill === 0) h.spawn('enemy_dummy', { pos: [11, 5] });    // S1 (ACTIVE_RANGE on the 3-19) needs a ground enemy in range
    assert.ok(h.runUntil(() => u.skill.active, 2), `S${skill + 1}: cast`);
    const t0 = h.b.time;
    h.run(1.2);
    const hits = log.filter((x) => x.e === e && tagged(x, 'leizi2:accuse'));
    assert.equal(hits.length, 1, `S${skill + 1}: one strike on ${pos}`);
    approx(hits[0].t - t0, d * gap + 0.15, `S${skill + 1}: ring ${d}`, 0.04);
    approx(hits[0].amount, hits[0].atk * 1.11, `S${skill + 1}: 100 % ATK × 1.11`);
    assert.equal(hits[0].type, 'arts');
    const tr = h.hooksOf('statusApplied').filter((c) => c.status === 'tremble' && c.target === e && c.source === u);
    assert.equal(tr.length, 1, `S${skill + 1}: 战栗`);
    approx(tr[0].duration, 3, 'for 3 s');
    done(h);
  }
  // S2: one cast per low tile of the flood fill (19 on the flat stage at (10,5)) — each gives a +10 % stack at once
  const { h, u } = field({ tier: 5, skill: 1 });
  u.skill.gainSp(999);
  h.spawn('enemy_dummy', { pos: [10, 6] });
  assert.ok(h.runUntil(() => u.skill.active, 2));
  const low = u.rangeKeys.filter((k) => h.b.grid.isLow(Math.floor(k / COLS), k % COLS)).length;
  assert.equal(low, 19, 'the flood fill');
  h.run(0.8);
  const st = u.findBuff('skill:leizi2:thunderAtk');
  assert.ok(st && st.stacks >= 19 && st.stacks <= 25, `S2 stacks after the rings: ${st?.stacks}`);
  done(h);
});

test('S1 浩气长存 (MANUAL, 3 charges, data ACTIVE_RANGE — the SEARCH row on her larger 3-19): a 0.5 s skill on the 3-19; 0.3 s in, a 3-2 to her left, front and right each hits every ground enemy on it for 260 % / 300 % ATK × 1.11 physical (one on her tile three times, none diagonal, no flyer)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u, log } = field({ tier, elite, skill: 0, silence: true });
    assert.deepEqual([u.skill.rule, u.skill.maxCharges, sk.bb['attack@atk_scale_s1'], sk.rangeId, u.skill.spCost, sk.initSp], ['ACTIVE_RANGE', 3, elite ? 3 : 2.6, '3-19', elite ? 13 : 14, 17], `T${tier}`);
    const own = h.spawn('enemy_dummy', { pos: [10, 5] }), front = h.spawn('enemy_dummy', { pos: [10, 8] });
    const left = h.spawn('enemy_dummy', { pos: [12, 5] }), right = h.spawn('enemy_dummy', { pos: [9, 5] });
    const diag = h.spawn('enemy_dummy', { pos: [11, 6] }), fly = h.spawn('enemy_fly', { pos: [11, 5] });
    h.b.removeBuff(u, 'test:silence');
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: cast`);
    const t0 = h.b.time;
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: the 3-19`);
    h.runUntil(() => !u.skill.active, 1);
    approx(h.b.time - t0, 0.5, `T${tier}: 0.5 s`, 0.04);
    const s1 = log.filter((x) => tagged(x, 'leizi2:s1'));
    const n = (e) => s1.filter((x) => x.e === e).length;
    assert.deepEqual([n(own), n(front), n(left), n(right), n(diag), n(fly)], [3, 1, 1, 1, 0, 0], `T${tier}: who is hit`);
    for (const x of s1) {
      approx(x.t - t0, 0.3, `T${tier}: 0.3 s in`, 0.04);
      approx(x.amount, x.atk * sk.bb['attack@atk_scale_s1'] * 1.11, `T${tier}: ${sk.bb['attack@atk_scale_s1'] * 100} % × 1.11`);
      assert.equal(x.type, 'phys');
    }
    assert.equal(log.filter((x) => x.isAttack).length, 0, `T${tier}: no normal attack`);
    done(h);
  }
});

test('S1: "充能耗尽前特性不重置" — the ramp is kept while a charge remains and reset by the last one', () => {
  const { h, u } = field({ tier: 5, skill: 0, silence: true });
  h.spawn('enemy_dummy', { pos: [10, 6] });
  h.run(8.05);
  u.skill.gainSp(999);
  assert.equal(u.skill.charges, 3);
  const ramp0 = u.trait.ramp;
  approx(ramp0, 0.4, 'the ramp after 8 s');
  h.b.removeBuff(u, 'test:silence');
  assert.ok(h.runUntil(() => u.skill.activations === 1 && !u.skill.active, 2));
  assert.ok(u.trait.ramp >= ramp0 - 1e-9, `kept after the first charge (${u.trait.ramp})`);
  assert.ok(h.runUntil(() => u.skill.activations === 2 && !u.skill.active, 5));
  assert.ok(u.trait.ramp >= ramp0 - 1e-9, `kept after the second (${u.trait.ramp})`);
  approx(u.s.atk, u.base.atk * (1 + u.trait.ramp), 'ATK');
  assert.ok(h.runUntil(() => u.skill.activations === 3 && !u.skill.active, 5));
  assert.equal(u.skill.charges, 0);
  assert.ok(u.trait.ramp < 0.06, `reset by the last (${u.trait.ramp})`);
  done(h);
});

test('S2 正霆摄威 (MANUAL, data SEARCH): range = the low tiles 3 four-way steps from hers (high ground and the field\'s edge stop it), 3 targets with air units for 110 % / 125 % ATK × 1.11, +10 % ATK per lightning cast up to 25, all gone after 36 s', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.bb['attack@atk_scale_s2'], sk.bb['attack@max_target_s2'], sk.bb.thunder_atk, sk.bb.thunder_max_stack_cnt, sk.duration, sk.rangeId], [elite ? 1.25 : 1.1, 3, 0.1, 25, 36, null]);
    const { h, u, log } = field({ tier, elite, skill: 1, row: 9, col: 3 });
    assert.equal(u.skill.rule, 'SEARCH');
    u.skill.gainSp(999);
    const targets = [[9, 4], [10, 3], [9, 5]].map((pos) => h.spawn('enemy_dummy', { pos }));
    const fly = h.spawn('enemy_fly', { pos: [10, 4] });
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: cast`);
    // from (9,3): row 8 is high, (10,2) / (11,2) / (12,2) are high, (9,2) is low (the goal), columns < 0 are off the field
    const want = [];
    for (let r = 9; r <= 12; r++) for (let c = 0; c <= 10; c++) {
      const t = h.b.grid.tile(r, c);
      if (t.height === 'LOW' && Math.abs(r - 9) + Math.abs(c - 3) <= 3) want.push(`${r},${c}`);
    }
    const got = u.rangeKeys.map((k) => `${Math.floor(k / COLS)},${k % COLS}`).sort();
    assert.deepEqual(got, want.sort(), `T${tier}: the flood fill`);
    h.run(3);
    const atk = log.filter((x) => x.isAttack);
    const ids = new Set(atk.filter((x) => x.attackId === atk[0].attackId).map((x) => x.e));
    assert.equal(ids.size, 3, `T${tier}: 3 targets`);
    assert.ok(atk.some((x) => x.e === fly), `T${tier}: a flyer among them`);
    for (const x of atk) approx(x.amount, x.atk * sk.bb['attack@atk_scale_s2'] * 1.11, `T${tier}: ${sk.bb['attack@atk_scale_s2'] * 100} % × 1.11`);
    h.run(30);
    const st = u.findBuff('skill:leizi2:thunderAtk');
    assert.equal(st.stacks, 25, `T${tier}: 25 stacks at most`);
    approx(u.s.atk, u.base.atk * (1 + u.trait.ramp + 2.5), `T${tier}: +250 %`);
    h.runUntil(() => !u.skill.active, 10);
    assert.equal(u.findBuff('skill:leizi2:thunderAtk'), null, `T${tier}: gone`);
    assert.deepEqual([u.trait.ramp, u.liveRangeGrid], [0, formOf(tier, elite).rangeGrid], `T${tier}: the trait reset, 1-2 again`);
    void targets;
    done(h);
  }
});

test('S3 天地通明 (MANUAL, data CUSTOM_RANGE on 2-1): range 2-1, attack interval 1.2 + 1.7 s, 210 % / 240 % ATK × 1.11 on the target and everyone within 1.65 (air too); then four currents', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.bb['attack@atk_scale_s3'], sk.bb.base_attack_time, sk.bb['attack@range_radius'], sk.bb['attack@atk_scale_current'], sk.bb.prob, sk.bb.not_combat, sk.duration, sk.rangeId],
      [elite ? 2.4 : 2.1, 1.7, 1.65, elite ? 0.56 : 0.45, elite ? 0.1 : 0.07, 3, 24, '2-1']);
    const { h, u, log } = field({ tier, elite, skill: 2 });
    assert.equal(u.skill.rule, 'CUSTOM_RANGE');
    u.skill.gainSp(999);
    const fly0 = h.spawn('enemy_fly', { pos: [12, 5] });   // a flyer on the 2-1 casts it
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: a flyer on the 2-1`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 2-1`);
    approx(u.s.interval, 2.9, `T${tier}: 2.9 s`);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] }), side = h.spawn('enemy_dummy', { pos: [10, 7] }), flyNear = h.spawn('enemy_fly', { pos: [11, 7] });
    h.b.kill(fly0, null);
    h.runUntil(() => log.some((x) => x.isAttack && x.e === e), 4);
    const a0 = log.find((x) => x.isAttack && x.e === e);
    const one = log.filter((x) => x.isAttack && x.attackId === a0.attackId);
    assert.deepEqual(new Set(one.map((x) => x.e)), new Set([e, side, flyNear]), `T${tier}: the target and everyone within 1.65`);
    for (const x of one) approx(x.amount, x.atk * sk.bb['attack@atk_scale_s3'] * 1.11, `T${tier}: ${sk.bb['attack@atk_scale_s3'] * 100} % × 1.11`);
    done(h);
  }
});

test('S3 currents: four from the target\'s spot (up, right, down, left; 0.28 s apart) at 1 tile/s for 3.1 s, bouncing off high ground and her own tile; 45 % / 56 % ATK × 1.11 arts on ground enemies of their tile, at most every 0.6 s per current; 战栗 7 % / 10 % for 3 s', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u, log } = field({ tier, elite, skill: 2 });
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    const fly = h.spawn('enemy_fly', { pos: [10, 8] });
    assert.ok(h.runUntil(() => u.skill.active, 2));
    h.runUntil(() => log.some((x) => x.isAttack && x.e === e), 4);
    const t0 = log.find((x) => x.isAttack && x.e === e).t;
    h.run(0.9);
    const cur = u.mem.leiziCurrents.slice(0, 4);
    assert.deepEqual(cur.map((c) => [c.dr, c.dc]), [[1, 0], [0, 1], [-1, 0], [0, -1]], `T${tier}: up, right, down, left`);
    // spawned 0, 0.28, 0.56, 0.84 s after the hit, 1 tile/s: the up one has risen (now − t0), the left one (now − t0 − 0.84)
    approx(cur[0].y, 10 + (h.b.time - t0), `T${tier}: the up current`, 0.03);
    approx(cur[3].x, 7 - (h.b.time - t0 - 0.84), `T${tier}: the left current`, 0.05);
    h.run(2.3);
    // the left one bounced before her tile (10,5): never past x 5.5; the up one bounced off row 13 (high)
    assert.ok(cur[3].x > 5.5 - 1e-9, `T${tier}: off her tile`);
    assert.ok(cur[0].y < 12.5 + 1e-9 && cur[0].dr === -1, `T${tier}: off the high row 13`);
    h.run(1);
    assert.ok(!u.mem.leiziCurrents.some((c) => cur.includes(c)), `T${tier}: gone after 3.1 s`);
    const zap = log.filter((x) => tagged(x, 'leizi2:current'));
    assert.ok(zap.length > 0 && zap.every((x) => x.e !== fly), `T${tier}: ground only`);
    for (const x of zap) { approx(x.amount, x.atk * sk.bb['attack@atk_scale_current'] * x.mul, `T${tier}: ${sk.bb['attack@atk_scale_current'] * 100} %`); assert.equal(x.type, 'arts'); }
    approx(zap[0].mul, 1.11, `T${tier}: × 1.11 while S3 runs`);
    done(h);
  }
  // 战栗: about prob of the current hits while S3 runs, 3 s each (T2's strikes at the cast give a 3 s 战栗 too at full
  // potential: those are not counted)
  const { h, u, log } = field({ tier: 6, elite: true, skill: 2, seed: 9 });
  u.skill.gainSp(999);
  for (const pos of [[10, 6], [10, 7], [9, 7], [11, 7], [10, 8], [12, 7], [9, 6]]) h.spawn('enemy_dummy', { pos });
  assert.ok(h.runUntil(() => u.skill.active, 2));
  h.run(23);
  const zaps = log.filter((x) => tagged(x, 'leizi2:current')).length;
  const accused = log.filter((x) => tagged(x, 'leizi2:accuse'));
  const tr = h.hooksOf('statusApplied').filter((c) => c.status === 'tremble' && c.source === u && c.duration === 3
    && !accused.some((x) => x.e === c.target && x.t === c.t));
  assert.ok(zaps > 60, `${zaps} current hits`);
  assert.ok(tr.length / zaps > 0.04 && tr.length / zaps < 0.18, `${tr.length} / ${zaps} ≈ 10 %`);
  done(h);
});
