// test/content/op_amgoat.test.js — the 自选 operator kit of 艾雅法拉 (char_180_amgoat, 6★ 中坚术师; kit
// server/sim/content/kits/ops/op-amgoat.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, CCR-X
// “错过的声音” or CCR-Y “宠物大赛第一名” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json
// (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_amgoat.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ID = 'char_180_amgoat';
const FORMS = BACKUPS.units[ID].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const CCRX = 'uniequip_002_amgoat', CCRY = 'uniequip_003_amgoat';
const S1 = 'skchr_amgoat_1', S2 = 'skchr_amgoat_2', S3 = 'skchr_amgoat_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, res: 50, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_elite: dummy('enemy_elite', { rank: 'ELITE' }), enemy_boss: dummy('enemy_boss', { rank: 'BOSS' }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, CCRX, CCRY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 艾雅法拉 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5, setup = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'spGain', 'deploy'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ID, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
    setup,
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Arts damage of `amount` on RES `res` with `ignore` flat RES ignored. */
const arts = (amount, res, ignore = 0) => Math.max(amount * (1 - Math.max(0, res - ignore) / 100), amount * 0.05);

test('艾雅法拉 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 3-1 range, ranged arts that hits air, block 1, 1.6 s, 空 bonds, no 特质', () => {
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
  // the numbers of the forms (zh_CN, full potential: ATK +27): E2 Lv1 1359 / 562 / 109, E2 Lv60 1614 / 635 / 118; CCR-X
  // +130 / +40 → +180 / +65, CCR-Y +180 / +25 → +230 / +50 HP / ATK
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1359, 562, 1614, 635]);
  assert.deepEqual([modOf(5, CCRX).attr, modOf(6, CCRX).attr, modOf(5, CCRY).attr, modOf(6, CCRY).attr], [{ maxHp: 130, atk: 40 }, { maxHp: 180, atk: 65 }, { maxHp: 180, atk: 25 }, { maxHp: 230, atk: 50 }]);
});

test('a 自选 pick: 艾雅法拉 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(ID));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(ID), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: ID, skillIndex: 2, uniEquipId: CCRY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: ID, skillIndex: 2, uniEquipId: CCRY } } });
});

test('S1 二重咏唱 (MANUAL, data DEFAULT, 25 s): ASPD +38 / +45 on the first cast of a deployment; ASPD and ATK +38 % / +45 % from the second; the count restarts after a redeploy', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    const a = sk.bb['amgoat_s_1[a].attack_speed'], b = sk.bb['amgoat_s_1[b].attack_speed'], atk = sk.bb['amgoat_s_1[b].atk'];
    assert.deepEqual([u.skill.rule, sk.duration, sk.spCost, sk.initSp, a, b, atk], ['DEFAULT', 25, elite ? 39 : 42, elite ? 20 : 15, elite ? 45 : 38, elite ? 45 : 38, elite ? 0.45 : 0.38], `T${tier}`);
    h.run(0.6);
    const aspd0 = u.s.aspd, atk0 = u.s.atk;
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: no enemy, no cast`);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in her range`);
    approx(u.skill.timeLeft, 25, `T${tier}: 25 s`, 0.01);
    assert.deepEqual(u.findBuff('skill:amgoat:duet')?.mods, { aspd: a }, `T${tier}: the first cast`);
    approx(u.s.aspd, aspd0 + a, `T${tier}: ASPD`);
    approx(u.s.atk, atk0, `T${tier}: no ATK on the first cast`);
    assert.ok(h.runUntil(() => !u.skill.active, 26));
    assert.equal(u.findBuff('skill:amgoat:duet'), null, `T${tier}: gone after it`);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 5), `T${tier}: the second cast`);
    assert.deepEqual(u.findBuff('skill:amgoat:duet')?.mods, { aspd: b, atkPct: atk }, `T${tier}: the second cast`);
    approx(u.s.atk, u.base.atk * (1 + 0.16 + atk), `T${tier}: ATK with 炎息`);
    h.b.retreat(u);
    h.b.redeploy(u);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 5), `T${tier}: a cast after the redeploy`);
    assert.deepEqual(u.findBuff('skill:amgoat:duet')?.mods, { aspd: a }, `T${tier}: the count restarted (PRTS 备注)`);
    done(h);
  }
});

test('S2 点燃 (AUTO, 2 charges, data DEFAULT): main target RES ×0.85 / ×0.8 first, ½ explosion on every enemy within 1.5 (flyers too), then ½ again on the main target; the others\' RES cut after their hit, 6 s', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [6, true, CCRX]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.maxCharges, sk.spCost, sk.bb.atk_scale, sk.bb.atk_scale_2, sk.bb.magic_resistance, sk.bb.duration],
      ['DEFAULT', 'charges', 2, elite ? 6 : 7, elite ? 1.55 : 1.375, elite ? 1.55 : 1.375, elite ? -0.2 : -0.15, 6], `T${tier}`);
    const ign = mod === CCRX ? 10 : 0;
    h.run(0.6);
    // 乱火 filled 1–2 charges at the deployment: spent before the scene is set
    u.skill.charges = 0;
    u.skill.sp = 0;
    // the main target alone in her range (its tip 0,3); three around it outside the range, one beyond the explosion
    const main = h.spawn('enemy_dummy', { pos: [10, 8] });
    const n1 = h.spawn('enemy_dummy', { pos: [10, 9] }), n2 = h.spawn('enemy_dummy', { pos: [11, 9] }), fly = h.spawn('enemy_fly', { pos: [9, 9] });
    const far = h.spawn('enemy_dummy', { pos: [10, 10] });
    u.skill.gainSp(999);
    assert.equal(u.skill.charges, 2);
    const n0 = hitsBy(h, u).length;
    assert.ok(h.runUntil(() => hitsBy(h, u).slice(n0).filter((c) => c.target === main).length >= 2, 4), `T${tier}: the ignited attack lands`);
    h.step();
    const hits = hitsBy(h, u).slice(n0);
    const atk = u.s.atk;
    const cut = 50 * (1 + sk.bb.magic_resistance);
    const onMain = hits.filter((c) => c.target === main);
    assert.equal(onMain.length, 2, `T${tier}: two ½ hits on the main target`);
    for (const c of onMain) approx(c.amount, arts(atk * sk.bb.atk_scale, cut, ign), `T${tier}: ½ on the main target after its RES cut`);
    for (const e of [n1, n2, fly]) {
      const hs = hits.filter((c) => c.target === e);
      assert.equal(hs.length, 1, `T${tier}: one explosion hit on ${e.tileR},${e.tileC}`);
      approx(hs[0].amount, arts(atk * sk.bb.atk_scale, 50, ign), `T${tier}: ½ before its own RES cut`);
      assert.deepEqual([hs[0].type, hs[0].dmg.isSplash, hs[0].dmg.isSkill], ['arts', true, true]);
    }
    assert.ok(!hits.some((c) => c.target === far), `T${tier}: 2 tiles away — outside the 1.5 explosion`);
    for (const e of [main, n1, n2, fly]) approx(e.s.res, cut, `T${tier}: RES ×${1 + sk.bb.magic_resistance}`);
    approx(far.s.res, 50, `T${tier}: untouched`);
    assert.equal(u.skill.charges, 1, `T${tier}: one charge spent`);
    // the next attack spends the second charge; the cut stays one (同名效果取最高) and lasts 6 s
    assert.ok(h.runUntil(() => u.skill.charges === 0, 4));
    h.run(0.5);
    approx(main.s.res, cut, `T${tier}: one RES cut, not two`);
    h.b.retreat(u); // no further ignition: the cut runs out
    h.run(6.2);
    approx(main.s.res, 50, `T${tier}: back after 6 s`);
    done(h);
  }
});

test('S3 火山 (MANUAL, data ACTIVE_RANGE on x-3 — 「攻击范围增大」 is an attack-range change, owner rule 2026-10-05): 15 s, ATK +70 % / +85 %, interval 1.6 − 1.1 = 0.5 s, range x-3 while on, lava on 4 / 5 random different enemies of it per attack (all when fewer); back after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, seed: 9 });
    const n = sk.bb['attack@max_target'];
    assert.deepEqual([u.skill.rule, sk.trigger.rawRule, sk.rangeId, sk.duration, sk.bb.atk, sk.bb.base_attack_time, n, sk.spCost, sk.initSp],
      ['ACTIVE_RANGE', 'DEFAULT', 'x-3', 15, elite ? 0.85 : 0.7, -1.1, elite ? 5 : 4, 80, elite ? 40 : 33], `T${tier}`);
    assert.deepEqual(u.skill.triggerGrid, sk.rangeGrid, `T${tier}: the trigger grid is x-3`);
    h.run(0.6);
    const atk0 = u.s.atk;
    approx(u.s.interval, 1.6, `T${tier}: own interval`);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `T${tier}: nobody on x-3`);
    // seven enemies: x-3 holds (8,5) / (12,5) / (10,2), none of them in her own 3-1
    const spots = [[10, 6], [9, 7], [11, 7], [10, 8], [8, 5], [12, 5], [10, 2]];
    const foes = spots.map((p) => h.spawn('enemy_dummy', { pos: p }));
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: cast`);
    approx(u.skill.timeLeft, 15, `T${tier}: 15 s`, 0.05);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: x-3 while on`);
    approx(u.s.interval, 0.5, `T${tier}: 0.5 s`);
    approx(u.s.atk, atk0 + u.base.atk * sk.bb.atk, `T${tier}: ATK +${sk.bb.atk * 100} %`);
    const n0 = hitsBy(h, u).length;
    h.run(6);
    assert.ok(u.skill.active);
    u.skill.end('test');
    h.run(0.5); // the last lava lands
    const hits = hitsBy(h, u).slice(n0).filter((c) => c.dmg.isAttack && c.dmg.isSkill);
    const byAttack = new Map();
    for (const c of hits) byAttack.set(c.dmg.attackId, [...(byAttack.get(c.dmg.attackId) ?? []), c.target]);
    assert.ok(byAttack.size >= 11, `T${tier}: ${byAttack.size} attacks in 6 s (one per 0.5 s)`);
    const counts = new Map(foes.map((e) => [e, 0]));
    for (const [, ts] of byAttack) {
      assert.equal(ts.length, n, `T${tier}: ${n} lava per attack`);
      assert.equal(new Set(ts).size, n, `T${tier}: different enemies`);
      for (const t of ts) counts.set(t, counts.get(t) + 1);
    }
    for (const [e, k] of counts) assert.ok(k > 0, `T${tier}: ${e.tileR},${e.tileC} drew lava (random draw)`);
    for (const c of hits.slice(0, 4)) approx(c.amount, arts(atk0 + u.base.atk * sk.bb.atk, 50), `T${tier}: 100 % of her S3 ATK, arts`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 3-1`);
    approx(u.s.interval, 1.6, `T${tier}: interval back`);
    done(h);
  }
  // two enemies of x-3 only: both every attack
  const { h, u } = field({ tier: 6, elite: true, skill: 2, seed: 4 });
  const two = [h.spawn('enemy_dummy', { pos: [10, 6] }), h.spawn('enemy_dummy', { pos: [10, 8] })];
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 2));
  const n0 = hitsBy(h, u).length;
  h.run(3);
  const byAttack = new Map();
  for (const c of hitsBy(h, u).slice(n0).filter((x) => x.dmg.isSkill)) byAttack.set(c.dmg.attackId, [...(byAttack.get(c.dmg.attackId) ?? []), c.target]);
  [...byAttack.keys()].slice(0, -1).forEach((k) => assert.deepEqual(new Set(byAttack.get(k)), new Set(two), 'fewer enemies than lava: each of them'));
  assert.ok(byAttack.size >= 5);
  done(h);
});

test('T1 炎息: every 【术师】 operator of the field ATK +16 % while she is deployed (惊蛰 yes, 德克萨斯 no); CCR-X stage 3 "携带时" +24 %, kept while she is knocked out', () => {
  const others = [{ uid: 2, chessId: 'chess_char_1_03_a', row: 12, col: 3 }, { uid: 3, chessId: 'chess_char_1_08_a', row: 12, col: 8 }];
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, others });
    h.run(0.6);
    const leizi = h.unit(2), texas = h.unit(3);
    const carried = elite && tier === 6 && mod === CCRX;
    const v = carried ? 0.24 : 0.16;
    const t0 = u.def.raw.talents.find((t) => t.index === 0);
    assert.equal(t0.bb.atk, v, `${label(f)}: the data`);
    assert.match(t0.desc, carried ? /^携带时/ : /^在场时/, `${label(f)}: the text`);
    assert.deepEqual(leizi.findBuff('talent:amgoat:casters')?.mods, { atkPct: v }, `${label(f)}: 惊蛰 (术师)`);
    assert.deepEqual(u.findBuff('talent:amgoat:casters')?.mods, { atkPct: v }, `${label(f)}: herself`);
    assert.equal(texas.findBuff('talent:amgoat:casters'), null, `${label(f)}: 德克萨斯 (先锋) gets nothing`);
    h.b.kill(u, null);
    h.run(1.2);
    assert.equal(!!leizi.findBuff('talent:amgoat:casters'), carried, `${label(f)}: after she is knocked out`);
    done(h);
  }
});

test('T2 乱火: 10–19 SP at every deployment (a floored draw); CCR-Y stage 3 also ASPD +6–15, both the maxima (19 / 15) with an elite or leader in range at the deployment; stage 1 and no module: no ASPD, no maximum rule', () => {
  const seen = new Set(), seenAs = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const gifts = [];
    const setup = (b) => b.on('deploy', (c) => { if (c.unit.uid === 1) gifts.push([c.unit.skill.sp, c.unit.findBuff('talent:amgoat:wildfire')?.mods?.aspd ?? 0]); }, { priority: -100 });
    const y3 = seed % 2 === 0;
    const { h } = field({ tier: 6, elite: true, mod: y3 ? CCRY : null, skill: 2, seed, setup });
    const sk = skillOf(6, true, S3);
    const [sp, as] = gifts[0];
    const k = sp - sk.initSp;
    assert.ok(Number.isInteger(k) && k >= 10 && k <= 19, `seed ${seed}: +${k} SP`);
    seen.add(k);
    if (y3) { assert.ok(Number.isInteger(as) && as >= 6 && as <= 15, `seed ${seed}: ASPD +${as}`); seenAs.add(as); } else assert.equal(as, 0);
    done(h);
  }
  assert.ok(seen.size >= 6 && seenAs.size >= 4, `a spread of draws: SP ${[...seen].sort((a, b) => a - b)}, ASPD ${[...seenAs].sort((a, b) => a - b)}`);
  // an elite / leader in range at a deployment: the maxima with CCR-Y stage 3; a draw otherwise
  for (const [tier, mod, rank] of [[6, CCRY, 'enemy_elite'], [6, CCRY, 'enemy_boss'], [5, CCRY, 'enemy_elite'], [6, null, 'enemy_elite'], [6, CCRY, 'enemy_dummy']]) {
    const lab = `T${tier} ${mod ?? 'none'} ${rank}`;
    const top = tier === 6 && mod === CCRY && rank !== 'enemy_dummy';
    let maxed = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const gifts = [];
      const setup = (b) => b.on('deploy', (c) => { if (c.unit.uid === 1) gifts.push([c.unit.skill.sp, c.unit.findBuff('talent:amgoat:wildfire')?.mods?.aspd ?? 0]); }, { priority: -100 });
      const { h, u } = field({ tier, elite: true, mod, skill: 2, seed, setup });
      const sk = skillOf(tier, true, S3);
      h.spawn(rank, { pos: [10, 6] });
      h.b.retreat(u);
      h.b.redeploy(u);
      const [sp, as] = gifts[1];
      if (top) assert.deepEqual([sp - sk.initSp, as], [19, 15], `${lab} seed ${seed}: the maxima`);
      else {
        assert.ok(sp - sk.initSp >= 10 && sp - sk.initSp <= 19, lab);
        if (sp - sk.initSp === 19) maxed++;
        if (mod !== CCRY || tier === 5) assert.equal(as, 0, `${lab}: no ASPD`);
      }
      done(h);
    }
    if (!top) assert.ok(maxed < 6, `${lab}: not always the maximum`);
  }
  // the talent's text and blackboard (stage 3 CCR-Y)
  const t1 = formOf(6, true).modules.find((m) => m.uniEquipId === CCRY).talentChanges.find((t) => t.talentIndex === 1);
  assert.deepEqual(t1.bb, { sp_min: 10, sp_max: 20, attack_speed_min: 6, attack_speed_max: 16, factor: 1 });
  assert.match(t1.desc, /随机获得10（\+3）~19（\+4）点技力并随机提升6~15的攻击速度/);
});

test('modules: CCR-X "无视目标10点法术抗性" at stages 1 and 3 (her normal attack on RES 50 deals × 0.6); CCR-Y "普通攻击命中精英或领袖敌人时获得1点技力" — not on a normal enemy, not from S2\'s explosion', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const x = elite && mod === CCRX, y = elite && mod === CCRY;
    assert.equal(u.s.resIgnoreFlat, x ? 10 : 0, `${label(f)}: RES ignore`);
    if (x) assert.equal(u.def.raw.trait.moduleDesc, '无视目标10点法术抗性');
    if (y) assert.deepEqual(u.def.raw.trait.bb, { sp: 1 });
    const foe = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.run(0.6);
    const n0 = hitsBy(h, u).length;
    h.run(4);
    const hits = hitsBy(h, u).slice(n0).filter((c) => c.target === foe && c.dmg.isAttack);
    assert.ok(hits.length >= 2, label(f));
    approx(hits[0].amount, arts(u.s.atk, 50, x ? 10 : 0), `${label(f)}: arts on RES 50`);
    const talentSp = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'trait').length;
    assert.equal(talentSp(), 0, `${label(f)}: no SP from a normal enemy`);
    h.b.kill(foe, null);
    const el = h.spawn('enemy_elite', { pos: [10, 6] });
    const k0 = talentSp(), a0 = hitsBy(h, u).filter((c) => c.target === el && c.dmg.isAttack).length;
    h.run(4);
    const hitsE = hitsBy(h, u).filter((c) => c.target === el && c.dmg.isAttack).length - a0;
    assert.ok(hitsE >= 2, label(f));
    const gained = talentSp() - k0;
    assert.equal(gained, y ? hitsE : 0, `${label(f)}: +1 SP per hit on an elite`);
    if (y) for (const c of h.hooksOf('spGain').filter((s) => s.unit === u && s.reason === 'trait')) assert.equal(c.amount, 1);
    done(h);
  }
  // S2's explosion and second ½ are no further 命中 (CCR-Y stage 3): one SP per ignited attack on an elite
  const { h, u } = field({ tier: 6, elite: true, mod: CCRY, skill: 1 });
  h.run(0.6);
  u.skill.charges = 0;
  u.skill.sp = 0;
  const el = h.spawn('enemy_elite', { pos: [10, 8] });
  h.spawn('enemy_elite', { pos: [10, 9] });
  u.skill.gainSp(999);
  const k0 = h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'trait').length;
  assert.ok(h.runUntil(() => hitsBy(h, u).filter((c) => c.target === el && c.dmg.isSkill).length >= 2, 4));
  h.step();
  assert.equal(h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'trait').length - k0, 1, 'one SP for the ignited attack');
  done(h);
});
