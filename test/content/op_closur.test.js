// test/content/op_closur.test.js — the 自选 operator kit of 可露希尔 (char_4228_closur, 6★ 战术家; kit
// server/sim/content/kits/ops/op-closur.js) and of her 援军 指挥中心 (token_10066_closur_ourbase), fielded the production way (a
// DIY slot + its `diy` pick, simdata getDiy; the 指挥中心 as the placed hand piece of her player) in every form: tiers 5 / 6,
// normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or TAC-X 给自己的小奖杯 at stage 1
// (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_closur.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { BASE, SHIELD_KEY, S2_KEY, RHODES_KEY, SLOWDOWN } from '../../server/sim/content/kits/ops/op-closur.js';
import { COLS } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CL = 'char_4228_closur';
const FORMS = BACKUPS.units[CL].forms;
const TOKREC = BACKUPS.tokens[BASE];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const TX = 'uniequip_002_closur';
const S1 = 'skchr_closur_1', S2 = 'skchr_closur_2', S3 = 'skchr_closur_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const talentOf = (tier, elite, mod, i) => modOf(tier, elite ? mod : null)?.talentChanges?.find((t) => t.talentIndex === i) ?? formOf(tier, elite).talents.find((t) => t.index === i);
const tokVariant = (tier, elite) => TOKREC.variants[`${CL}@${statusOf(tier, elite)}`];
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_atk: dummy('enemy_atk', { atk: 2000, bat: 1 }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, TX].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const YAK = 'chess_char_1_02_a', TEXAS = 'chess_char_1_08_a', PODEGO = 'chess_char_1_13_a';
const tk = (r, c) => r * COLS + c;

/**
 * 可露希尔 as uid 1 at (row, col) facing RIGHT; `base` = the 指挥中心 piece's tile (uid 2) or null; `others` as given.
 */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, base = [10, 6], others = [], seed = 5 } = {}) {
  const op = { uid: 1, diy: { slot: SLOT[tier], charId: CL, skillIndex: skill, uniEquipId: mod }, elite, row, col };
  const piece = base ? [{ uid: 2, kind: 'token', tokenId: BASE, ownerUid: 1, row: base[0], col: base[1] }] : [];
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'attack'], captureNoisy: true,
    units: [op, ...piece, ...others],
  });
  h.step();
  return { h, u: h.unit(1), t: h.b.allyUnits.find((a) => a.kind === 'token' && a.defId === BASE && a.alive) ?? null };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const dpOf = (h) => h.b.players[0].dp;
const hitsOn = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
/** Record the DP gains' times. */
function dpLog(h) {
  const log = [];
  let last = dpOf(h);
  h.b.on('tick', () => { const v = dpOf(h); if (v !== last) { log.push([h.b.time, v - last]); last = v; } });
  return log;
}

test('可露希尔 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 3-3, 战术家 (ranged physical, hits air, blocks 1), ground-targetable, the triggers (S1 at full SP); the placed 指挥中心 deploys with its variant\'s stats, no attack, 禁疗, blocks 2, its range by her skill (x-5 / x-4 / x-6); no generic 援军', () => {
  assert.equal(OPERATOR_KITS[CL], KITS[CL]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u, t } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null, sk = form.skills[skill];
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [CL, SLOT[tier], sk.skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.profile.sub, u.base.bat], [1, 'ranged', true, 'phys', 'tactician', 1], `${label(f)}: 战术家`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-3`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      assert.deepEqual([u.skill.rule, u.skill.spCost], [skill === 0 ? 'SP_FULL' : sk.trigger.rule, sk.spCost], `${label(f)}: trigger`);
      if (skill > 0) assert.deepEqual([sk.trigger.rule, sk.trigger.rawRule], ['SP_FULL', 'ALWAYS'], `${label(f)}: the 战术家 row`);
      else assert.equal(sk.trigger.rule, 'DEFAULT', `${label(f)}: the data's AUTO rule (the kit fires it at full SP)`);
      const v = tokVariant(tier, elite);
      assert.ok(t && t.uid === 2 && t.tileR === 10 && t.tileC === 6, `${label(f)}: the placed 指挥中心 on its tile`);
      assert.deepEqual([t.base.maxHp, t.base.def, t.s.blockCnt, !!t.profile.noAttack, !!t.s.flags.noHeal], [v.stats.maxHp, v.stats.def, 2, true, true], `${label(f)}: 指挥中心`);
      const grid = skill === 0 ? v.skill.rangeGrid : v.bySkill[String(skill)].skill.rangeGrid;
      assert.deepEqual(t.liveRangeGrid, grid, `${label(f)}: its range by her S${skill + 1}`);
      assert.equal(h.b.allyUnits.filter((a) => a.defId === 'token_tactician_reinforce').length, 0, `${label(f)}: no generic 援军`);
      assert.equal(u.trait.reinforcement, t, `${label(f)}: her 援军`);
      done(h);
    }
  }
  assert.deepEqual([modOf(5, TX).attr, modOf(6, TX).attr], [{ maxHp: 150, atk: 20, def: 15 }, { maxHp: 180, atk: 30, def: 25 }]);
  assert.deepEqual([tokVariant(5, false).stats.maxHp, tokVariant(5, true).stats.maxHp, tokVariant(5, true).skill.rangeId, tokVariant(5, true).bySkill['1'].skill.rangeId, tokVariant(5, true).bySkill['2'].skill.rangeId], [2620, 3054, 'x-5', 'x-4', 'x-6']);
});

test('a 自选 pick: 可露希尔 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(CL));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(CL), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: CL, skillIndex: 1, uniEquipId: TX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: CL, skillIndex: 1, uniEquipId: TX } } });
});

test('精准投放 without a placed piece: the 指挥中心 comes on the tactical point (a walkable tile of her range, the enemy path first); her leaving withdraws it for good, her redeploy brings a new one; knocked out it sits in its 战术点形态 for 15 s (off the fight, its tile kept, no 援军) and comes back at full HP', () => {
  const { h, u, t } = field({ tier: 6, elite: true, mod: TX, skill: 0, base: null });
  assert.ok(t && t.uid == null, 'summoned');
  assert.ok(u.baseRangeKeys.includes(tk(t.tileR, t.tileC)) && h.b.grid.groundPassable(t.tileR, t.tileC), 'a walkable tile of her range');
  assert.ok(h.b.groundPathTiles().has(tk(t.tileR, t.tileC)), 'on an enemy ground path');
  done(h);
  // the placed piece: knock-out ⇒ 战术点形态
  const r = field({ tier: 5, elite: true, mod: TX, skill: 1, others: [{ uid: 3, chessId: YAK, row: 11, col: 6 }] });
  const refresh = tokVariant(5, true).talents.find((x) => x.bb.interval != null).bb.interval;
  assert.equal(refresh, 15);
  r.h.b.kill(r.t, null);
  assert.ok(!r.t.alive && !r.t.removed && r.t.mem.closurTac, 'in its 战术点形态');
  assert.ok(r.h.b.isReservedTile(10, 6), 'its tile kept');
  r.u.skill.gainSp(999);
  r.h.run(0.5);
  assert.equal(r.h.unit(3).findBuff(`${S2_KEY}:${r.u.id}`), null, 'no 援军 while it is down (角峰 in its range unmarked)');
  r.h.run(refresh - 0.6);
  assert.ok(!r.t.alive, 'still down before 15 s');
  r.h.run(0.3);
  assert.ok(r.t.alive && r.t.tileR === 10 && r.t.tileC === 6, 'back on its tile after 15 s');
  approx(r.t.hp, r.t.s.maxHp, 'at full HP');
  r.h.run(0.2);
  assert.ok(r.h.unit(3).findBuff(`${S2_KEY}:${r.u.id}`), '角峰 marked again (S2 runs)');
  // her leaving: withdrawn for good; her redeploy: a new one on the board tile
  r.h.b.kill(r.u, null);
  assert.ok(!r.t.alive && r.t.removed, 'withdrawn with her (no 战术点形态)');
  r.h.b.redeploy(r.u, { free: true });
  const n = r.h.b.allyUnits.find((a) => a.kind === 'token' && a.defId === BASE && a.alive);
  assert.ok(n && n !== r.t && n.tileR === 10 && n.tileC === 6, 'a new 指挥中心 on the board tile');
  done(r.h);
});

test('Trait: her damage on an enemy blocked by her 援军 — the 指挥中心 or an ally of its range — ×atk_scale (1.5); ×1 vs an enemy blocked by an ally outside its range', () => {
  for (const f of [[5, false, null], [6, true, TX]]) {
    const [tier, elite, mod] = f;
    // S1 carried: the 指挥中心's x-5 around (10,6) holds (11,6) (角峰), not (11,7) (德克萨斯)
    const { h, u, t } = field({ tier, elite, mod, skill: 0, others: [{ uid: 3, chessId: YAK, row: 11, col: 6 }, { uid: 4, chessId: TEXAS, row: 11, col: 7 }] });
    const scale = formOf(tier, elite).trait.bb.atk_scale;
    assert.equal(scale, 1.5);
    for (const [pos, blocker, mul] of [[[10, 6], t, scale], [[11, 6], h.unit(3), scale], [[11, 7], h.unit(4), 1]]) {
      const e = h.spawn('enemy_dummy', { pos });
      assert.ok(h.runUntil(() => e.blockedBy === blocker && hitsOn(h, u, e).length > 0, 5), `${label(f)}: ${pos} blocked and hit`);
      const c = hitsOn(h, u, e)[0];
      approx(c.amount, u.s.atk * mul, `${label(f)}: ×${mul} on the enemy blocked at ${pos}`);
      h.b.kill(e, null);
      h.step();
    }
    done(h);
  }
});

test('S1 递归策略 (AUTO, at full SP): every 援军 — the 指挥中心 and the allies of its x-5, not one outside, not a 孤立 one — gets one 护盾 layer (不叠加); 3 DP, then 4, 5 … up to 6 (normal) / 7 (elite), one at a time every 8 / n s from half that; the count restarts with a redeploy', () => {
  for (const f of [[5, false, null], [6, true, TX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.duration, sk.bb.cost, sk.bb.cost_per_add, sk.bb.cost_add_max, sk.bb.shield_cnt, sk.initSp], [8, 3, 1, elite ? 7 : 6, 1, 0], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 11, col: 6 }, { uid: 4, chessId: TEXAS, row: 11, col: 7 }, { uid: 5, chessId: PODEGO, row: 9, col: 6 }];
    const { h, u, t } = field({ tier, elite, mod, skill: 0, others });
    h.b.addBuff(h.unit(5), { key: 'test:isolated', flags: { isolated: true } });
    const log = dpLog(h);
    h.b.players[0].dp = 0;
    const casts = [];
    h.b.on('skillStart', (c) => { if (c.unit === u) casts.push(h.b.time); });
    assert.ok(h.runUntil(() => u.skill.activations === 1, sk.spCost + 1), `${label(f)}: cast at full SP, no enemy on the field`);
    h.step();
    for (const a of [t, h.unit(3)]) assert.equal(a.findBuff(`${SHIELD_KEY}:${u.id}`)?.shieldHits, 1, `${label(f)}: ${a.defId} one 护盾 layer`);
    for (const a of [h.unit(4), h.unit(5), u]) assert.equal(a.findBuff(`${SHIELD_KEY}:${u.id}`), null, `${label(f)}: ${a.defId} no 护盾`);
    // the 护盾 takes one hit whole
    const e = h.spawn('enemy_atk', { pos: [10, 6] });
    assert.ok(h.runUntil(() => !t.findBuff(`${SHIELD_KEY}:${u.id}`), 4), `${label(f)}: spent by a hit`);
    approx(t.hp, t.s.maxHp, `${label(f)}: that hit blocked whole`);
    h.b.kill(e, null);
    // the DP of the casts: n = 3, 4, … ≤ max; each over 8 s every 8 / n from half that
    const want = [];
    for (let k = 0; k < 6; k++) want.push(Math.min(sk.bb.cost_add_max, sk.bb.cost + k));
    h.runUntil(() => u.skill.activations >= 6 && !u.skill.active, 6 * (sk.spCost + 9));
    for (let k = 0; k < 6; k++) {
      const s0 = casts[k], n = want[k];
      const gains = log.filter(([tt]) => tt > s0 - 1e-9 && tt < s0 + 8 + 0.05);
      assert.equal(gains.reduce((a, [, d]) => a + d, 0), n, `${label(f)}: cast ${k + 1} gives ${n}`);
      approx(gains[0][0] - s0, 8 / n / 2, `${label(f)}: cast ${k + 1} first DP after ${8 / n / 2} s`, 0.06);
    }
    // a redeploy restarts the count
    h.b.retreat(u);
    h.b.redeploy(u, { free: true });
    const before = dpOf(h);
    h.runUntil(() => u.skill.activations >= 7 && !u.skill.active, sk.spCost + 10);
    assert.equal(dpOf(h) - before, sk.bb.cost, `${label(f)}: back to ${sk.bb.cost} after a redeploy`);
    done(h);
  }
});

test('S2 模型扩展: +cost DP at once and 15 one per 2 s; ATK +atk, 2 targets; every 援军 (x-4) DEF +def and block +1; the enemies they block are her targets beyond her range; an operator of hers deployed on the 指挥中心\'s range meanwhile gives back ceil(40 % × its cost) — not after a 【移动】, not outside the range', () => {
  for (const f of [[5, false, null], [6, true, TX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.duration, sk.bb.cost, sk.bb.cost_period, sk.bb['closur_s_2[add_cost_period].interval'], sk.bb.atk, sk.bb.def, sk.bb.block_cnt, sk.bb['attack@max_target'], sk.bb.cost_return],
      [30, elite ? 7 : 6, 15, 2, elite ? 0.55 : 0.4, elite ? 0.45 : 0.3, 1, 2, 0.4], label(f));
    // 角峰 (11,7) is in the x-4 of (10,6); 德克萨斯 (12,8) is outside it and outside her 3-3; 波登可 (9,9) far
    const others = [{ uid: 3, chessId: YAK, row: 11, col: 7 }, { uid: 4, chessId: TEXAS, row: 12, col: 8 }, { uid: 5, chessId: PODEGO, row: 12, col: 4 }];
    const { h, u, t } = field({ tier, elite, mod, skill: 1, others });
    const yak = h.unit(3), texas = h.unit(4), podego = h.unit(5);
    const log = dpLog(h);
    h.b.players[0].dp = 0;
    const atk0 = u.s.atk, yakDef = yak.s.def, yakBlock = yak.s.blockCnt;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1));
    const t0 = h.b.time;
    approx(dpOf(h), sk.bb.cost, `${label(f)}: +${sk.bb.cost} at once`);
    approx(u.s.atk, atk0 * (1 + sk.bb.atk + (u.findBuff(RHODES_KEY)?.mods.atkPct ?? 0)) / (1 + (u.findBuff(RHODES_KEY)?.mods.atkPct ?? 0)), `${label(f)}: ATK +${sk.bb.atk * 100} %`, 1e-3);
    h.run(0.2);
    assert.deepEqual([t.s.blockCnt, yak.s.blockCnt], [3, yakBlock + 1], `${label(f)}: 援军 block +1`);
    approx(yak.s.def - yakDef, yak.base.def * sk.bb.def, `${label(f)}: 援军 DEF +${sk.bb.def * 100} %`, 1e-3);
    assert.equal(texas.findBuff(`${S2_KEY}:${u.id}`), null, `${label(f)}: not outside the x-4`);
    // an enemy blocked by 角峰 outside her 3-3? (11,7) is inside it; one blocked by the 指挥中心 and two more in range: 2 targets
    const es = [h.spawn('enemy_dummy', { pos: [10, 6] }), h.spawn('enemy_dummy', { pos: [9, 5] }), h.spawn('enemy_dummy', { pos: [11, 5] })];
    const n0 = h.hooksOf('attack').length;
    h.run(3);
    const atks = h.hooksOf('attack').slice(n0).filter((c) => c.attacker === u);
    assert.ok(atks.length >= 2 && atks.every((c) => c.targets.length === 2), `${label(f)}: 2 targets per attack (${atks.map((c) => c.targets.length)})`);
    for (const e of es) h.b.kill(e, null);
    // the refund: 角峰 (cost 17) redeployed on the x-4 ⇒ +7; 波登可 outside ⇒ nothing; a 【移动】 ⇒ nothing
    h.step();
    const d0 = dpOf(h);
    h.b.kill(yak, null);
    h.b.redeploy(yak, { free: true });
    approx(dpOf(h) - d0, Math.ceil(yak.base.cost * 0.4), `${label(f)}: ceil(40 % × ${yak.base.cost})`);
    const d1 = dpOf(h);
    h.b.kill(podego, null);
    h.b.redeploy(podego, { free: true });
    approx(dpOf(h) - d1, 0, `${label(f)}: outside the range — nothing`);
    assert.ok(h.b.moveRedeploy(yak, 9, 6), '【移动】');
    approx(dpOf(h) - d1, 0, `${label(f)}: a 【移动】 — nothing`);
    h.runUntil(() => !u.skill.active, 31);
    approx(h.b.time - t0, 30, `${label(f)}: 30 s`, 0.01);
    const periodic = log.filter(([tt]) => tt > t0 + 0.5 && tt <= t0 + 30.05).filter(([, d]) => d === 1);
    assert.equal(periodic.length, 15, `${label(f)}: 15 DP over the skill`);
    approx(periodic[0][0] - t0, 2, `${label(f)}: one per 2 s`, 0.06);
    assert.equal(t.findBuff(`${S2_KEY}:${u.id}`), null, `${label(f)}: the 援军 buff ends with it`);
    assert.equal(u.extraRangeKeys, null, `${label(f)}: no extra range after`);
    done(h);
  }
  // the enemies her 援军 block are her targets beyond her own range: 角峰 at (11,8) — out of her 3-3 ([1, 4]) — is in the
  // x-4 of a 指挥中心 at (10,7)
  const { h, u } = field({ tier: 6, elite: true, mod: TX, skill: 1, base: [10, 7], others: [{ uid: 3, chessId: YAK, row: 11, col: 8 }] });
  const e = h.spawn('enemy_dummy', { pos: [11, 8] });
  h.run(0.5);
  assert.equal(e.blockedBy, h.unit(3));
  assert.equal(hitsOn(h, u, e).length, 0, 'out of her range before');
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => hitsOn(h, u, e).length > 0, 4), 'hit while S2 runs');
  approx(hitsOn(h, u, e)[0].amount, u.s.atk * 1.5, 'with the trait ×1.5');
  done(h);
});

test('S3 Q.E.D.: 18 DP one per 1.66 s; attack interval (1.0 − 0.5 s) / ASPD 1.08 (full potential); hits of attack@atk_scale × ATK with one 迟钝 stack each (4 % / 5 %, ≤ 10 stacks, one 3 s timer); one more target per 9 attacks (≤ 6); her range adds the 指挥中心\'s x-6 and her 援军\'s ranges', () => {
  for (const f of [[5, false, null], [6, true, TX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.bb.cost_period, sk.bb['closur_s_3[add_cost_period].interval'], sk.bb.base_attack_time, sk.bb['attack@atk_scale'], sk.bb['attack@slow_down'], sk.bb['attack@slow_down_time'], sk.bb['attack@max_stack_cnt'], sk.bb['attack@slow_down_max'], sk.bb.attack_trigger_cnt, sk.bb.max_trigger_cnt],
      [30, 18, 1.66, -0.5, elite ? 1.9 : 1.5, elite ? 0.05 : 0.04, 3, 10, elite ? 0.5 : 0.4, 9, 6], label(f));
    const { h, u, t } = field({ tier, elite, mod, skill: 2 });
    const log = dpLog(h);
    // eight enemies in her 3-3 (a flyer among them): enough for 1 + 6 targets
    const near = [[9, 4], [9, 5], [9, 6], [9, 7], [11, 4], [11, 5], [11, 6], [11, 7]].map((p, i) => h.spawn(i === 2 ? 'enemy_fly' : 'enemy_dummy', { pos: p }));
    h.run(1);
    h.b.players[0].dp = 0;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1));
    const t0 = h.b.time;
    assert.equal(formOf(tier, elite).stats.aspd, 108, `${label(f)}: ASPD 108 (潜能 攻速 +8)`);
    approx(u.s.interval, 0.5 / 1.08, `${label(f)}: interval 0.5 s / 1.08 (ASPD 108)`);
    let attacks = 0;
    const perAttack = [];
    h.b.on('attack', (c) => { if (c.attacker === u && u.skill.active) { attacks++; perAttack.push(c.targets.length); } });
    h.runUntil(() => attacks >= 9 + 1, 10);
    assert.ok(perAttack.slice(0, 9).every((n) => n === 1) && perAttack[9] === 2, `${label(f)}: one more target after 9 attacks (${perAttack})`);
    // the 迟钝 on one enemy: 1 stack per hit, capped
    const e0 = [...near].sort((a, b) => hitsOn(h, u, b).filter((c) => c.dmg.isSkill).length - hitsOn(h, u, a).filter((c) => c.dmg.isSkill).length)[0];
    const sl = e0.findBuff(SLOWDOWN);
    assert.ok(sl, `${label(f)}: 迟钝 on a hit enemy`);
    const skillHits = (e) => hitsOn(h, u, e).filter((c) => c.dmg.isSkill);
    const stacks = Math.min(10, skillHits(e0).length);
    approx(sl.data.value, Math.min(sk.bb['attack@slow_down_max'], sk.bb['attack@slow_down'] * stacks), `${label(f)}: ${stacks} stacks`);
    approx(e0.s.moveSpeed, e0.base.moveSpeed * (1 - sl.data.value), `${label(f)}: move speed ×(1 − v)`);
    for (const c of skillHits(e0).slice(0, 3)) approx(c.amount, u.s.atk * sk.bb['attack@atk_scale'], `${label(f)}: ${sk.bb['attack@atk_scale'] * 100} % ATK`);
    h.runUntil(() => !u.skill.active, 31);
    approx(h.b.time - t0, 30, `${label(f)}: 30 s`, 0.01);
    assert.equal(Math.max(...perAttack), 7, `${label(f)}: at most 1 + 6 targets`);
    approx(log.reduce((a, [tt, d]) => a + (tt > t0 - 1e-9 && tt < t0 + 30.05 ? d : 0), 0), 18, `${label(f)}: 18 DP`);
    approx(log.find(([tt]) => tt > t0 - 1e-9)[0] - t0, 1.66, `${label(f)}: the first after 1.66 s`, 0.06);
    // the cap after 10 hits, one timer: 3 s without a hit clears every stack
    const capped = near.find((e) => skillHits(e).length >= 10);
    assert.ok(capped);
    h.run(0.1);
    h.b.kill(u, null);
    h.run(3.1);
    assert.equal(capped.findBuff(SLOWDOWN), null, `${label(f)}: gone 3 s after the last hit`);
    done(h);
    void t;
  }
  // her range adds the 指挥中心's x-6: (10,8) is outside her 3-3 (cols 4–7), inside the x-6 of (10,6) ([0, 2])
  const { h, u } = field({ tier: 6, elite: true, mod: TX, skill: 2 });
  const far = h.spawn('enemy_dummy', { pos: [10, 8] });
  h.run(2);
  assert.equal(hitsOn(h, u, far).length, 0, 'out of her range before');
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => hitsOn(h, u, far).length > 0, 3), 'hit while S3 runs');
  assert.ok(u.extraRangeKeys.includes(tk(10, 8)) && u.extraRangeKeys.includes(tk(8, 6)), 'the x-6 in her range');
  done(h);
});

test('T2 极限调度: from the battle start the 【罗德岛】 operators of her player (herself too) ATK +4 % (TAC-X stage 3 +8 %) for the whole battle; others not', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const tb = talentOf(tier, elite, mod, 1).bb;
    assert.deepEqual(tb, tier === 6 && elite && mod === TX ? { cost: -6, atk: 0.08 } : { cost: -4, atk: 0.04 }, label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [{ uid: 3, chessId: PODEGO, row: 12, col: 3 }, { uid: 4, chessId: YAK, row: 11, col: 3 }] });
    const podego = h.unit(3), yak = h.unit(4);
    assert.equal(podego.def.raw.nationId, 'rhodes');
    for (const a of [u, podego]) assert.equal(a.findBuff(RHODES_KEY)?.mods.atkPct, tb.atk, `${label(f)}: ${a.defId}`);
    assert.equal(yak.findBuff(RHODES_KEY), null, `${label(f)}: 角峰 is no 罗德岛 operator`);
    h.b.kill(u, null);
    h.run(1);
    assert.equal(podego.findBuff(RHODES_KEY)?.mods.atkPct, tb.atk, `${label(f)}: kept while she is down (携带)`);
    done(h);
  }
});

test('TAC-X “给自己的小奖杯”: damage on one of her 援军 from an enemy it blocks ×0.85 (stages 1 and 3); not without the module', () => {
  for (const f of [[5, false, null], [5, true, null], [5, true, TX], [6, true, TX]]) {
    const [tier, elite, mod] = f;
    const { h, u, t } = field({ tier, elite, mod, skill: 0 });
    const guard = elite && mod === TX ? modOf(tier, TX).talentChanges.find((x) => x.talentIndex === -1).bb.damage_scale : 1;
    if (elite && mod === TX) assert.equal(guard, 0.85);
    const e = h.spawn('enemy_atk', { pos: [10, 6] });
    assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source === e && c.target === t), 5), `${label(f)}: hit by the enemy it blocks`);
    const c = h.hooksOf('damaged').find((x) => x.source === e && x.target === t);
    approx(c.amount, Math.max(2000 - t.s.def, 100) * guard, `${label(f)}: ×${guard}`);
    done(h);
    void u;
  }
});
