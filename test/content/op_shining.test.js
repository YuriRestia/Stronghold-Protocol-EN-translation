// test/content/op_shining.test.js — the 自选 operator kit of 闪灵 (char_147_shining, 6★ 医师; kit
// server/sim/content/kits/ops/op-shining.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, PHY-Y
// 干枯剑鞘 or PHY-X “使徒” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of
// that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_shining.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const SHINING = 'char_147_shining';
const FORMS = BACKUPS.units[SHINING].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const PHYY = 'uniequip_002_shining', PHYX = 'uniequip_003_shining';
const S1 = 'skchr_shining_1', S2 = 'skchr_shining_2', S3 = 'skchr_shining_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const ENEMIES = { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, mass: 0 }) };
/** Synthetic allies with no skill: a melee one (地面 tiles) and a ranged one (高台). */
const ALLIES = {
  test_melee_a: chessRec({ id: 'test_melee_a', profession: 'WARRIOR', stats: { maxHp: 10000, def: 100, atk: 0 }, skill: null }),
  test_ranged_a: chessRec({ id: 'test_ranged_a', profession: 'SNIPER', stats: { maxHp: 10000, def: 100, atk: 0 }, skill: null }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, PHYY, PHYX].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/**
 * A battle with 闪灵 as uid 1 on the 高台 tile (11,2) facing RIGHT (her 3-3: rows 10–12, cols 2–5), a melee ally on the
 * 地面 tile (10,4) (uid 2) and a ranged ally on the 高台 tile (10,2) (uid 3) — both in her range —, a melee ally outside it
 * at (10,8) (uid 4).
 */
function field({ tier = 5, elite = false, mod = null, skill = 0, seed = 5, extra = [] } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: ALLIES }, timeLimit: 600, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd'], captureNoisy: true,
    units: [
      { uid: 1, diy: { slot: SLOT[tier], charId: SHINING, skillIndex: skill, uniEquipId: mod }, elite, row: 11, col: 2 },
      { uid: 2, chessId: 'test_melee_a', row: 10, col: 4 },
      { uid: 3, chessId: 'test_ranged_a', row: 10, col: 2 },
      { uid: 4, chessId: 'test_melee_a', row: 10, col: 8 },
      ...extra,
    ],
  });
  h.step();
  return { h, u: h.unit(1), ground: h.unit(2), high: h.unit(3), out: h.unit(4) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const healsOn = (h, u, t, from = 0) => h.hooksOf('heal').slice(from).filter((c) => c.source === u && c.target === t && !c.opts?.regen);

test('闪灵 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 3-3, one heal (医师), no 特质', () => {
  assert.equal(OPERATOR_KITS[SHINING], KITS[SHINING]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [SHINING, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), form.stats.aspd + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      // a heal attack selects injured allies only (ai.js acquireTargets): no enemy, so no anti-air question
      assert.deepEqual([u.profile.dmgType, u.profile.heal?.mode, u.profile.attack, u.base.bat], ['heal', 'single', 'ranged', 2.85], `${label(f)}: 医师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-3`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 1451 / 424 / 135, E2 Lv60 1558 / 494 / 154; PHY-Y +35 ATK +5 ASPD → +60 / +7,
  // PHY-X +45 ATK +13 DEF → +63 / +20
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1451, 424, 1558, 494]);
  assert.deepEqual([modOf(5, PHYY).attr, modOf(6, PHYY).attr, modOf(5, PHYX).attr, modOf(6, PHYX).attr], [{ atk: 35, aspd: 5 }, { atk: 60, aspd: 7 }, { atk: 45, def: 13 }, { atk: 63, def: 20 }]);
});

test('a 自选 pick: 闪灵 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(SHINING));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(SHINING), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: SHINING, skillIndex: 2, uniEquipId: PHYX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: SHINING, skillIndex: 2, uniEquipId: PHYX } } });
});

test('S1 信条 (MANUAL, data DEFAULT): cast on an injured ally in range only; 20 s of ATK +58 % / +67 % and ASPD +10 / +20; 47 / 44 SP from 10 / 14', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u, ground } = field({ tier, elite, mod: elite ? PHYY : null, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.spCost, sk.initSp, sk.duration, sk.bb.atk, sk.bb.attack_speed],
      ['DEFAULT', elite ? 44 : 47, elite ? 14 : 10, 20, elite ? 0.67 : 0.58, elite ? 20 : 10], `T${tier}`);
    const aspd0 = u.s.aspd;
    u.skill.gainSp(999);
    h.run(3);
    assert.equal(u.skill.activations, 0, `T${tier}: nobody injured, no cast`);
    ground.hp = 100;
    assert.ok(h.runUntil(() => u.skill.active, 5), `T${tier}: cast as she heals`);
    approx(u.skill.timeLeft, 20, `T${tier}: 20 s`, 0.01);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.aspd, aspd0 + sk.bb.attack_speed, `T${tier}: ASPD`);
    h.runUntil(() => !u.skill.active, 25);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    approx(u.s.aspd, aspd0, `T${tier}: ASPD back`);
    done(h);
  }
});

test('S2 自动掩护 (AUTO, data DEFAULT, 1 / 2 charges): the next heal gives its target a 屏障 of 28 % / 35 % ATK for 2 / 3 s (every damage type) and DEF +25 % / +35 % while it holds', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u, ground } = field({ tier, elite, mod: elite ? PHYX : null, skill: 1 });
    assert.deepEqual([u.skill.rule, u.skill.maxCharges, u.skill.kind, sk.spCost, sk.bb.atk_scale, sk.bb.duration, sk.bb.def],
      ['DEFAULT', elite ? 2 : 1, elite ? 'charges' : 'instant', 7, elite ? 0.35 : 0.28, elite ? 3 : 2, elite ? 0.35 : 0.25], `T${tier}`);
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: nobody injured, no cast (it waits for a heal)`);
    ground.hp = 100;
    const def0 = ground.s.def;
    assert.ok(h.runUntil(() => ground.findBuff('shining:barrier'), 5), `T${tier}: the barrier comes with the heal`);
    assert.equal(healsOn(h, u, ground).length, 1, `T${tier}: one heal so far`);
    const bar = ground.findBuff('shining:barrier');
    approx(bar.shield, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
    approx(bar.duration, sk.bb.duration, `T${tier}: ${sk.bb.duration} s`);
    assert.equal(bar.shieldType, null, `T${tier}: absorbs every damage type`);
    assert.deepEqual(ground.findBuff('shining:barrierDef')?.mods, { defPct: sk.bb.def }, `T${tier}: DEF bonus`);
    approx(ground.s.def, def0 * (1 + sk.bb.def), `T${tier}: DEF`, 1e-6);
    // the barrier takes physical and arts damage alike
    const hp0 = ground.hp, sh0 = bar.shield;
    h.b.dealDamage(null, ground, { amount: 10, type: 'arts', canDodge: false });
    approx(ground.hp, hp0, `T${tier}: arts absorbed`);
    approx(bar.shield, sh0 - 10, `T${tier}: shield −10`);
    h.b.dealDamage(null, ground, { amount: 1e6, type: 'true' });
    assert.equal(ground.findBuff('shining:barrier'), null, `T${tier}: broken`);
    assert.equal(ground.findBuff('shining:barrierDef'), null, `T${tier}: the DEF bonus goes with it`);
    done(h);
  }
});

test('S2 自动掩护: barriers stack with their own timers, the older absorbs first, the DEF bonus does not stack; all gone after their time', () => {
  const sk = skillOf(6, true, S2);
  const { h, u, ground } = field({ tier: 6, elite: true, mod: PHYY, skill: 1 });
  ground.hp = 100;
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => ground.buffs.filter((b) => b.key === 'shining:barrier').length === 1, 5));
  ground.hp = 100; // still the most injured
  assert.ok(h.runUntil(() => ground.buffs.filter((b) => b.key === 'shining:barrier').length === 2, 8), 'the second charge on the next heal');
  const [a, b] = ground.buffs.filter((x) => x.key === 'shining:barrier');
  assert.ok(a.seq < b.seq && a.timeLeft < b.timeLeft, 'own timers');
  assert.equal(ground.buffs.filter((x) => x.key === 'shining:barrierDef').length, 1, 'one DEF bonus');
  approx(ground.findBuff('shining:barrierDef').mods.defPct, sk.bb.def, 'not doubled');
  approx(ground.s.shield, a.shield + b.shield, 'the absorption adds up');
  const sa = a.shield, sb = b.shield;
  h.b.dealDamage(null, ground, { amount: sa / 2, type: 'true' });
  approx(a.shield, sa / 2, 'the older one first');
  approx(b.shield, sb, 'the newer one untouched');
  h.run(sk.bb.duration + 0.1);
  assert.equal(ground.findBuff('shining:barrier'), null, 'expired');
  assert.equal(ground.findBuff('shining:barrierDef'), null, 'the DEF bonus with them');
  done(h);
});

test('S3 教条力场 (MANUAL, data DEFAULT): 60 s, ATK +30 % / +40 %, every ally in her range DEF +45 % / +60 % (not outside it); gone after it ends', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u, ground, high, out } = field({ tier, elite, mod: elite ? PHYX : null, skill: 2 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.spCost, sk.initSp, sk.bb.atk, sk.bb.def], ['DEFAULT', 60, 120, 100, elite ? 0.4 : 0.3, elite ? 0.6 : 0.45], `T${tier}`);
    u.skill.gainSp(999);
    ground.hp = 100;
    assert.ok(h.runUntil(() => u.skill.active, 5), `T${tier}: cast on the injured ally`);
    h.run(0.3);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    for (const a of [ground, high, u]) assert.deepEqual(a.findBuff('skill:shining:def')?.mods, { defPct: sk.bb.def }, `T${tier}: ${a.defId} in range`);
    assert.equal(out.findBuff('skill:shining:def'), null, `T${tier}: outside her range`);
    u.skill.end('test');
    h.run(0.3);
    for (const a of [ground, high, u]) assert.equal(a.findBuff('skill:shining:def'), null, `T${tier}: gone once it ends`);
    done(h);
  }
});

test('T1 黑恶魔的庇护: allies in her range DEF +65 (herself too, not outside); PHY-Y stage 3: +105 and 地面 units +40 more (stage 1: +65 only)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u, ground, high, out } = field({ tier, elite, mod, skill: 0 });
    h.run(0.3);
    const y3 = elite && tier === 6 && mod === PHYY;
    const d = y3 ? 105 : 65, low = y3 ? 40 : 0;
    assert.deepEqual(ground.findBuff('talent:shining:def')?.mods, { defFlat: d + low }, `${label(f)}: 地面 ally`);
    assert.deepEqual(high.findBuff('talent:shining:def')?.mods, { defFlat: d }, `${label(f)}: 高台 ally`);
    assert.deepEqual(u.findBuff('talent:shining:def')?.mods, { defFlat: d }, `${label(f)}: herself (高台)`);
    assert.equal(out.findBuff('talent:shining:def'), null, `${label(f)}: outside her range`);
    approx(ground.s.def, 100 + d + low, `${label(f)}: DEF of the 地面 ally`);
    if (y3) assert.match(u.def.raw.talents.find((t) => t.index === 0).desc, /防御力\+105（\+5），地面单位防御力额外\+40/);
    h.b.retreat(u);
    h.run(0.3);
    assert.equal(ground.findBuff('talent:shining:def'), null, `${label(f)}: gone once she leaves`);
    done(h);
  }
});

test('T2 法典: ASPD +13; PHY-X stage 3: ASPD +18, ATK +25 % with 自动掩护 picked, SP +0.6/s with 教条力场 picked (stage 1: ASPD +13 only)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const x3 = elite && tier === 6 && mod === PHYX;
      approx(u.s.aspd, u.base.aspd + (x3 ? 18 : 13), `${label(f)} S${skill + 1}: ASPD`);
      approx(u.s.atk, u.base.atk * (1 + (x3 && skill === 1 ? 0.25 : 0)), `${label(f)} S${skill + 1}: ATK`);
      approx(u.s.spRecovery, 1 + (x3 && skill === 2 ? 0.6 : 0), `${label(f)} S${skill + 1}: SP/s`);
      if (x3 && skill === 2) {
        const sp0 = u.skill.sp;
        h.run(5);
        approx(u.skill.sp - sp0, 5 * 1.6, `${label(f)}: 1.6 SP/s`, 0.01);
      }
      done(h);
    }
  }
});

test('module traits: PHY-Y heals on 地面 units ×1.15 (not on 高台), PHY-X heals on allies below 50 % ×1.15 (stages 1 and 3); none without a module', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u, ground, high } = field({ tier, elite, mod, skill: 0 });
    const tb = u.def.raw.trait.bb;
    const y = elite && mod === PHYY, x = elite && mod === PHYX;
    if (y) assert.deepEqual(tb, { heal_scale: 1.15 }, label(f));
    if (x) assert.deepEqual(tb, { heal_scale: 1.15, hp_ratio: 0.5 }, label(f));
    const heal = (t, hp) => {
      t.hp = hp;
      const n0 = h.hooksOf('heal').length;
      assert.ok(h.runUntil(() => healsOn(h, u, t, n0).length > 0, 6), `${label(f)}: a heal on ${t.defId}`);
      return healsOn(h, u, t, n0)[0].amount;
    };
    // 地面 vs 高台, both below 50 %
    approx(heal(ground, 100), u.s.atk * (y || x ? 1.15 : 1), `${label(f)}: 地面 ally at 1 %`);
    ground.hp = ground.s.maxHp;
    approx(heal(high, 100), u.s.atk * (x ? 1.15 : 1), `${label(f)}: 高台 ally at 1 %`);
    high.hp = high.s.maxHp;
    // above 50 %
    approx(heal(ground, 6000), u.s.atk * (y ? 1.15 : 1), `${label(f)}: 地面 ally at 60 %`);
    ground.hp = ground.s.maxHp;
    approx(heal(high, 6000), u.s.atk, `${label(f)}: 高台 ally at 60 %`);
    done(h);
  }
});
