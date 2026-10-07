// test/content/op_ironmn.test.js — the 自选 operator kit of 白铁 (char_4072_ironmn, 6★ 工匠; kit
// server/sim/content/kits/ops/op-ironmn.js) and of his <支援装置> 白铁™多功能平台 (token_10027_ironmn_pile1 / pile2) and 铁钳号·原型机
// (token_10027_ironmn_pile3), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy; the devices as the placed
// hand pieces of his player) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7)
// with no module, CRA-X 铁钳号·爬行者 or CRA-Y 海布里印记 at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the
// fidelity checklist of kits/README.md (the engine's ally targets themselves: test/sim/feedback5-o23-engine.test.js).
// Run: node --test test/content/op_ironmn.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks, diyRecordOf } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const IRON = 'char_4072_ironmn';
const P1 = 'token_10027_ironmn_pile1', P2 = 'token_10027_ironmn_pile2', CRAB = 'token_10027_ironmn_pile3';
const TOK = [P1, P2, CRAB];
const FORMS = BACKUPS.units[IRON].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_ironmn', Y = 'uniequip_003_ironmn';
const S1 = 'skchr_ironmn_1', S2 = 'skchr_ironmn_2', S3 = 'skchr_ironmn_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** A device's variant for a form, with the pick's skill / module (getDiyToken). */
const tokOf = (id, tier, elite, skill, mod) => {
  let v = BACKUPS.tokens[id].variants[`${IRON}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
  enemy_hit: dummy('enemy_hit', { atk: 1000, bat: 1, blockCnt: 1 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, X, Y].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/**
 * 白铁 as uid 1 at (row, col) facing `dir`; `pieces` = his device pieces [[r, c, dir?]] (uids 10…, the picked skill's
 * device); `others` = more units.
 */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, dir = 'RIGHT', pieces = [], others = [], seed = 5, dp = 99 } = {}) {
  const units = [
    { uid: 1, diy: { slot: SLOT[tier], charId: IRON, skillIndex: skill, uniEquipId: mod }, elite, row, col, dir },
    ...pieces.map(([r, c, d], i) => ({ uid: 10 + i, kind: 'token', tokenId: TOK[skill], ownerUid: 1, row: r, col: c, dir: d ?? 'RIGHT' })),
    ...others,
  ];
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'death', 'deploy', 'statusApplied', 'spGain', 'heal'], captureNoisy: true,
    units,
  });
  h.step();
  h.b.players[0].dp = dp;
  const u = h.unit(1);
  const devs = h.b.allyUnits.filter((a) => a.kind === 'token' && a.defId === TOK[skill]).sort((a, b) => a.uid - b.uid);
  return { h, u, devs };
}
const st = (u) => u.mem.craftsman;
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Force every rng.chance roll to `v` (returns the probabilities asked for). */
function forceChance(h, v) {
  const asked = [];
  h.b.rng.chance = (p) => { asked.push(p); return v; };
  return asked;
}

test('白铁 in every 自选 form: his kit (all three skills authored), stats + module attributes, 1-1, blocks 2, melee physical ground-only, 维多利亚, no 特质, the data triggers', () => {
  assert.equal(OPERATOR_KITS[IRON], KITS[IRON]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [IRON, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), form.stats.aspd + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.profile.sub, u.base.bat], [2, 'melee', false, 'phys', 'craftsman', 1.5], `${label(f)}: 工匠`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['victoriaShip'], []], `${label(f)}: bonds / 特质`);
      assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => s.trigger.rule), ['DEFAULT', 'DEFAULT', 'DEFAULT']);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr, modOf(5, Y).attr, modOf(6, Y).attr],
    [{ atk: 25, def: 25, aspd: 5 }, { atk: 45, def: 45, aspd: 5 }, { maxHp: 260, def: 45 }, { maxHp: 400, def: 60 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  assert.deepEqual(diyRecordOf(CHESS[SLOT[5]], { charId: IRON, skillIndex: 0 }, data).bonds, ['victoriaShip']);
  assert.ok(KITTED_CHARS.includes(IRON));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(IRON), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: IRON, skillIndex: 2, uniEquipId: Y } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: IRON, skillIndex: 2, uniEquipId: Y } } });
});

test('<支援装置> hand pieces: the picked skill\'s device only (variant sources), deploy limit 2 in the data (1 + the hidden max_deploy_count 1: E2 "最多可部署2个"), the module costs / redeploy times', () => {
  for (const [skill, id] of TOK.entries()) {
    for (const s of [0, 1, 2]) assert.equal(tokOf(id, 6, true, s, null).sources.includes('skill'), s === skill, `${id} under S${s + 1}`);
    const v = tokOf(id, 6, true, skill, null);
    assert.equal(v.talents.find((t) => t.bb.max_deploy_count != null).bb.max_deploy_count, 1, `${id}: the hidden max_deploy_count`);
    assert.equal(v.stats.deployLimit, 2, `${id}: the data's deploy limit (tools/build-data.mjs tokenTalentDeckBonus)`);
    assert.deepEqual([v.stats.deckStack, tokOf(id, 6, true, skill, X).stats.deckStack], [3, 4], `${id}: the holding 3 (CRA-X +1)`);
  }
  // CRA-X 部署费用 −1 / −1 / −4, CRA-Y 再部署时间 −5 / −5 / −10 (PRTS module page)
  const cost = (mod) => TOK.map((id, s) => tokOf(id, 6, true, s, mod).stats.cost);
  const resp = (mod) => TOK.map((id, s) => tokOf(id, 6, true, s, mod).stats.respawnTime);
  assert.deepEqual([cost(null), cost(X), cost(Y)], [[3, 3, 10], [2, 2, 6], [3, 3, 10]]);
  assert.deepEqual([resp(null), resp(X), resp(Y)], [[10, 10, 20], [10, 10, 20], [5, 5, 10]]);
});

test('战地工程师 / the device rules: stock 3 (CRA-X 4) after his deployment; a device that left comes back on its tile after its redeploy time, paying its cost and one stock; none without stock or DP; his devices leave with him and return after him', () => {
  for (const [tier, elite, mod] of [[5, false, null], [5, true, X], [6, true, Y]]) {
    const f = label([tier, elite, mod]);
    const { h, u, devs } = field({ tier, elite, mod, skill: 0, pieces: [[11, 7]], dp: 99 });
    const d = devs[0];
    const v = tokOf(P1, tier, elite, 0, mod);
    const cap = 3 + (mod === X ? 1 : 0);
    assert.deepEqual([st(u).stock, st(u).cap, d.alive, d.tileR, d.tileC], [cap, cap, true, 11, 7], `${f}: deployed for free with the board, stock ${cap}`);
    assert.deepEqual([d.base.cost, d.base.respawnTime], [v.stats.cost, v.stats.respawnTime], `${f}: the variant's cost / redeploy time`);
    assert.ok(d.s.flags.untargetable && d.s.flags.invulnerable && d.s.flags.noHeal, `${f}: 不会受到攻击, 无敌, 禁疗`);
    forceChance(h, false);
    h.b.kill(d, null);
    assert.equal(d.alive, false);
    h.run(v.stats.respawnTime - 0.3);
    assert.equal(d.alive, false, `${f}: not before its redeploy time`);
    h.run(0.6);
    assert.deepEqual([d.alive, d.tileR, d.tileC, st(u).stock, h.b.players[0].dp], [true, 11, 7, cap - 1, 99 - v.stats.cost], `${f}: back on its tile, −${v.stats.cost} DP, −1 stock`);
    // no stock ⇒ it waits
    st(u).stock = 0;
    h.b.kill(d, null);
    h.run(v.stats.respawnTime + 2);
    assert.equal(d.alive, false, `${f}: no stock, no return`);
    st(u).stock = 1;
    h.run(0.5);
    assert.ok(d.alive, `${f}: back as soon as he holds one`);
    // no DP ⇒ it waits
    st(u).stock = 1;
    h.b.players[0].dp = 0;
    h.b.kill(d, null);
    h.run(v.stats.respawnTime + 2);
    assert.equal(d.alive, false, `${f}: no DP, no return`);
    h.b.players[0].dp = 50;
    h.run(0.5);
    assert.ok(d.alive, `${f}: back once the DP is there`);
    // he leaves ⇒ his devices go; his return refills the stock and brings them back
    st(u).stock = 0;
    h.b.kill(u, null);
    assert.equal(d.alive, false, `${f}: gone with him (die_to_kill_token)`);
    h.b.players[0].dp = 99;
    assert.ok(h.runUntil(() => u.alive, 200), `${f}: he redeploys`);
    assert.equal(st(u).stock, cap, `${f}: stock refilled (charge_token[born])`);
    assert.ok(h.runUntil(() => d.alive, 30), `${f}: the device back after him`);
    assert.equal(st(u).stock, cap - 1);
    done(h);
  }
});

test('节约经费: a device of his leaving his x-4 ⇒ prob (0.8; CRA-X stage 3 1) ⇒ +1 stock (capped); none when the roll fails, outside his x-4 or when it goes with him', () => {
  for (const [tier, elite, mod, prob] of [[5, false, null, 0.8], [5, true, X, 0.8], [6, true, X, 1], [6, true, Y, 0.8]]) {
    const f = label([tier, elite, mod]);
    const { h, u, devs } = field({ tier, elite, mod, skill: 0, pieces: [[11, 6], [10, 8]], dp: 99 });
    const [near, far] = devs;
    const cap = st(u).cap;
    st(u).stock = 1;
    let asked = forceChance(h, true);
    h.b.kill(near, null);
    assert.deepEqual([asked, st(u).stock], [[prob], 2], `${f}: on his x-4 — rolled ${prob}, +1`);
    asked = forceChance(h, true);
    h.b.kill(far, null);
    assert.deepEqual([asked, st(u).stock], [[], 2], `${f}: two tiles away — no roll`);
    h.run(25);
    assert.ok(near.alive && far.alive);
    st(u).stock = 1;
    forceChance(h, false);
    h.b.kill(near, null);
    assert.equal(st(u).stock, 1, `${f}: a failed roll`);
    h.run(15);
    st(u).stock = cap;
    forceChance(h, true);
    h.b.kill(near, null);
    assert.equal(st(u).stock, cap, `${f}: capped at ${cap}`);
    h.run(15);
    st(u).stock = 0;
    asked = forceChance(h, true);
    h.b.kill(u, null);
    assert.deepEqual([asked, st(u).stock], [[], 0], `${f}: leaving with him — no roll`);
    done(h);
  }
});

test('S1 极致火力 + 白铁™多功能平台: ATK +12 % on the operator it faces (×2.5 / ×3 while S1 runs); S1 16 / 17 s, 140 % / 170 % ATK attacks, +1 stock at the start, every device destroyed at its end', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const v = tokOf(P1, tier, elite, 0, null);
    const { h, u, devs } = field({ tier, elite, skill: 0, pieces: [[11, 4], [9, 8]], others: [{ uid: 3, chessId: 'chess_char_1_08_a', row: 11, col: 5 }] });
    const tx = h.unit(3);
    const [d] = devs;
    h.run(0.2);
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb['attack@atk_scale'], sk.bb.fake_scale, v.skill.bb.talent_scale, v.talents[0].bb.atk], ['DEFAULT', elite ? 17 : 16, elite ? 1.7 : 1.4, elite ? 3 : 2.5, elite ? 3 : 2.5, 0.12], `T${tier}`);
    assert.deepEqual(tx.findBuff(`ironmn:pile1:${d.id}`)?.mods, { atkPct: 0.12 }, `T${tier}: 支援火力 on the operator it faces`);
    approx(tx.s.atk, tx.base.atk * 1.12, `T${tier}: ATK +12 %`);
    assert.equal(u.findBuff(`ironmn:pile1:${d.id}`), null, `T${tier}: not on 白铁 (not on its range)`);
    st(u).stock = 1;
    forceChance(h, false);
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast with an enemy in his range`);
    assert.equal(st(u).stock, 2, `T${tier}: +1 stock at the start`);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.02);
    h.step(2);
    approx(tx.s.atk, tx.base.atk * (1 + 0.12 * sk.bb.fake_scale), `T${tier}: ×${sk.bb.fake_scale} while S1 runs`);
    const n0 = h.hooksOf('damaged').filter((c) => c.source === u && c.target === e).length;
    h.run(3);
    const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.target === e).slice(n0);
    assert.ok(hits.length >= 1);
    for (const c of hits) approx(c.amount, u.s.atk * sk.bb['attack@atk_scale'], `T${tier}: ${sk.bb['attack@atk_scale'] * 100} % ATK`);
    const alive0 = devs.filter((x) => x.alive).length;
    assert.equal(alive0, 2);
    h.runUntil(() => !u.skill.active, sk.duration + 1);
    h.step();
    assert.deepEqual(devs.map((x) => x.alive), [false, false], `T${tier}: 技能结束时所有场上的装置被销毁`);
    assert.equal(tx.findBuff(`ironmn:pile1:${d.id}`), null, `T${tier}: its buff gone with it`);
    assert.ok(h.runUntil(() => devs.every((x) => x.alive), 30), `T${tier}: both back (stock 2)`);
    approx(tx.s.atk, tx.base.atk * 1.12, `T${tier}: ×1 after the skill`);
    done(h);
  }
});

test('S2 高效补给 + 白铁™多功能平台: +1 SP every 3.5 s to the operator it faces (2.5 / 2 s while S2 runs), the device loses 0.4 % (0.8 %) max HP / s; S2 30 s, ATK / DEF +25 / 40 %, every blocked enemy at once, +1 stock at its end', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const v = tokOf(P2, tier, elite, 1, null);
    const { h, u, devs } = field({ tier, elite, skill: 1, pieces: [[11, 4]], others: [{ uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 5 }] });
    const yak = h.unit(3);
    const [d] = devs;
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.def, v.talents[0].bb['default.interval'], v.skill.bb['s2.interval'], v.talents.find((t) => t.bb.hp_ratio).bb.hp_ratio, v.skill.bb['s2.hp_ratio']],
      [30, elite ? 0.4 : 0.25, elite ? 0.4 : 0.25, 3.5, elite ? 2 : 2.5, 0.004, 0.008], `T${tier}`);
    const gifts = () => h.hooksOf('spGain').filter((c) => c.unit === yak && c.reason === 'device').map((c) => c.t);
    yak.skill.sp = 0;
    h.run(11);
    const g = gifts();
    assert.equal(g.length, 3, `T${tier}: 3 SP gifts in 11 s`);
    approx(g[1] - g[0], 3.5, `T${tier}: every 3.5 s`, 0.02);
    approx(d.hp, d.s.maxHp * (1 - 0.004 * Math.floor(h.b.time)), `T${tier}: 0.4 % / s`, 0.01);
    // S2: two blocked enemies at once, ATK / DEF, interval and bleed
    const a = h.spawn('enemy_dummy', { pos: [10, 6] });
    const b = h.spawn('enemy_walk', { routeIndex: 0 });
    void b;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    approx(u.s.def, u.base.def * (1 + sk.bb.def), `T${tier}: DEF`);
    assert.deepEqual(u.skill.spec.attack, { hitAllBlocked: true }, `T${tier}: 攻击所有阻挡的敌人`);
    const hp0 = d.hp, t0 = h.b.time;
    yak.skill.sp = 0;
    const n0 = gifts().length;
    h.run(10.05);
    const g2 = gifts().slice(n0);
    approx(g2[1] - g2[0], v.skill.bb['s2.interval'], `T${tier}: every ${v.skill.bb['s2.interval']} s while S2 runs`, 0.02);
    approx(hp0 - d.hp, d.s.maxHp * 0.008 * Math.floor(h.b.time - t0 + 1e-9), `T${tier}: 0.8 % / s while S2 runs`, 0.05);
    void a;
    st(u).stock = 1;
    h.runUntil(() => !u.skill.active, 25);
    assert.equal(st(u).stock, 2, `T${tier}: +1 stock at its end`);
    done(h);
  }
  // S2 hits every enemy it blocks
  const { h, u } = field({ tier: 6, elite: true, skill: 1, row: 9, col: 5 });
  h.spawn('enemy_walk', { routeIndex: 0 });
  h.run(0.4);
  h.spawn('enemy_walk', { routeIndex: 0 });
  assert.ok(h.runUntil(() => u.blocking.length === 2, 40), 'two blocked');
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  const n0 = h.hooksOf('damaged').length;
  h.run(4);
  const ids = new Set(h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && c.dmg?.isAttack).map((c) => c.target.id));
  assert.equal(ids.size, 2, 'both blocked enemies hit');
  done(h);
});

test('S3 铁钳号·原型机: 30 s, ATK +25 / 40 %, ASPD +25 / 40, +1 stock at the start; the 铁钳号 is our attacks\' last target (an enemy first), takes no damage, +1 SP per hit, a 工匠\'s hit heals it 1 %; enemies never target it; immune to the PRTS statuses', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const v = tokOf(CRAB, tier, elite, 2, null);
    // the crab faces 白铁's front tile; 德克萨斯 (UP) has it on her range
    const { h, u, devs } = field({ tier, elite, skill: 2, pieces: [[10, 6]], others: [{ uid: 3, chessId: 'chess_char_1_08_a', row: 9, col: 6, dir: 'UP' }] });
    const tx = h.unit(3);
    const [c] = devs;
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.attack_speed, v.skill.spCost, v.skill.spType, v.skill.bb.hp_ratio, v.trait.bb.hp_ratio, v.stats.tauntLevel],
      [30, elite ? 0.4 : 0.25, elite ? 40 : 25, 5, 'INCREASE_WHEN_TAKEN_DAMAGE', 0.025, 0.01, -2], `T${tier}`);
    assert.ok(h.b.isAllyTarget(c), `T${tier}: an ally target`);
    assert.ok(c.s.flags.untargetable && c.s.flags.isolated && c.s.flags.noHeal && c.s.flags.noDisplace && !c.s.flags.invulnerable, `T${tier}: 不会受到攻击 (enemies), 孤立, 禁疗, 失衡免疫, not 无敌`);
    h.run(3);
    const hitsBy = (src) => h.hooksOf('damaged').filter((x) => x.target === c && x.source === src).length;
    const atkOn = (src) => h.events.filter((e) => e[0] === 'atk' && e[1] === src.id && e[2] === c.id).length;
    assert.ok(atkOn(u) > 0 && atkOn(tx) > 0, `T${tier}: 白铁 and 德克萨斯 attack it (no enemy around)`);
    assert.equal(hitsBy(u) + hitsBy(tx), 0, `T${tier}: no damage reaches it`);
    assert.equal(c.hp, c.s.maxHp);
    assert.equal(c.skill.sp, 5, `T${tier}: 5 SP (full) after 3 s of hits — 受击回复`);
    assert.ok(h.hooksOf('spGain').filter((x) => x.unit === c && x.reason === 'hurt').length >= 5, `T${tier}: one SP per hit`);
    // an enemy in an attacker's range comes first (one on the crab's tile, in 白铁's range)
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.step();
    const a0 = atkOn(u);
    h.run(3);
    assert.ok(h.events.filter((x) => x[0] === 'atk' && x[1] === u.id && x[2] === e.id).length >= 1, `T${tier}: 白铁 attacks the enemy`);
    assert.equal(atkOn(u), a0, `T${tier}: not the crab meanwhile`);
    h.b.kill(e, null);
    h.step();
    // heal from a 工匠's hit only
    c.hp = c.s.maxHp * 0.5;
    const healBy = () => h.hooksOf('heal').filter((x) => x.target === c).length;
    const h0 = healBy();
    h.b.dealDamage(u, c, { amount: 100, type: 'phys', isAttack: true });
    approx(c.hp, c.s.maxHp * 0.51, `T${tier}: 白铁 heals it 1 %`);
    h.b.dealDamage(tx, c, { amount: 100, type: 'phys', isAttack: true });
    approx(c.hp, c.s.maxHp * 0.51, `T${tier}: 德克萨斯 does not`);
    assert.equal(healBy() - h0, 1);
    // statuses PRTS lists, element, enemies' attacks
    for (const s of ['stun', 'cold', 'freeze', 'levitate', 'bind', 'silence', 'sleep']) assert.equal(h.b.applyStatus(c, s, { duration: 3, source: e }), false, `T${tier}: ${s} immune`);
    // S3 itself (an enemy in his range: the data's DEFAULT)
    h.spawn('enemy_dummy', { pos: [10, 6] });
    st(u).stock = 1;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    assert.equal(u.s.aspd, u.base.aspd + sk.bb.attack_speed, `T${tier}: ASPD`);
    approx(u.skill.timeLeft, 30, `T${tier}: 30 s`, 0.05);
    assert.equal(st(u).stock, 2, `T${tier}: +1 stock at the start`);
    done(h);
  }
});

test('铁钳号·原型机\'s skill (5 SP, an enemy in its 3-13, flyers too): −2.5 % max HP (流失), then 白铁\'s ATK × 230 % / 260 % physical on the first enemy and × 110 % / 120 % on every other within 1.1 of it; 团结的力量: the operator behind it takes ×0.8 physical (not arts)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const v = tokOf(CRAB, tier, elite, 2, null);
    const { h, u, devs } = field({ tier, elite, skill: 2, row: 12, col: 3, pieces: [[10, 5]], others: [{ uid: 3, chessId: 'chess_char_1_02_a', row: 10, col: 4 }] });
    const yak = h.unit(3);
    const [c] = devs;
    assert.deepEqual([v.skill.bb.atk_scale, v.skill.bb.atk_scale_2, v.talents[0].bb.damage_resistance], [elite ? 2.6 : 2.3, elite ? 1.2 : 1.1, 0.2], `T${tier}`);
    assert.deepEqual(yak.findBuff(`ironmn:crab:${c.id}`)?.mods, { physTakenMul: 0.8 }, `T${tier}: 角峰 behind it`);
    // damage taken by 角峰: physical ×0.8, arts unchanged
    const p = h.b.dealDamage(null, yak, { amount: 1000, type: 'phys', canDodge: false, sourceless: true });
    const ar = h.b.dealDamage(null, yak, { amount: 1000, type: 'arts', canDodge: false, sourceless: true });
    approx(p, Math.max(1000 - yak.s.def, 50) * 0.8, `T${tier}: physical ×0.8`, 1e-3);
    approx(ar, 1000 * (1 - yak.s.res / 100), `T${tier}: arts ×1`, 1e-3);
    yak.hp = yak.s.maxHp;
    // its skill: an enemy in the 3-13, SP full
    const main = h.spawn('enemy_fly', { pos: [10, 7] });
    const near = h.spawn('enemy_dummy', { pos: [10, 8] });
    const far = h.spawn('enemy_dummy', { pos: [12, 8] });
    c.skill.gainSp(99);
    const atk = u.s.atk;
    const hp0 = c.hp;
    assert.ok(h.runUntil(() => c.skill.activations === 1, 1), `T${tier}: cast at full SP with an enemy in range`);
    approx(hp0 - c.hp, c.s.maxHp * 0.025, `T${tier}: −2.5 % max HP`);
    h.run(1);
    const by = (t) => h.hooksOf('damaged').filter((x) => x.source === c && x.target === t);
    assert.equal(by(main).length, 1, `T${tier}: the flyer is the first target (可对空)`);
    approx(by(main)[0].amount, atk * v.skill.bb.atk_scale, `T${tier}: ${v.skill.bb.atk_scale * 100} % of 白铁's ATK`);
    assert.equal(by(near).length, 1, `T${tier}: the enemy within 1.1`);
    approx(by(near)[0].amount, atk * v.skill.bb.atk_scale_2, `T${tier}: ${v.skill.bb.atk_scale_2 * 100} %`);
    assert.equal(by(far).length, 0, `T${tier}: farther than 1.1 untouched`);
    assert.deepEqual([by(main)[0].type, by(main)[0].dmg.isSkill], ['phys', true]);
    done(h);
  }
});

test('CRA-X: stage 3 节约经费 "当白铁周围8格存在自身装置时技力回复速度+0.2/秒" (one effect) — none at stage 1, none with the device outside his x-4', () => {
  for (const [tier, mod, want] of [[5, X, 0], [6, X, 0.2], [6, Y, 0], [6, null, 0]]) {
    const f = label([tier, true, mod]);
    const { h, u, devs } = field({ tier, elite: true, mod, skill: 0, pieces: [[11, 6], [9, 4]] });
    h.step();
    assert.equal(u.s.spRecovery, u.base.spRecovery + want, `${f}: SP recovery`);
    if (want) {
      assert.deepEqual(u.findBuff('talent:ironmn:spRecover').mods, { spRecoveryFlat: 0.2 });
      for (const d of devs) h.b.retreat(d, { reason: 'expired' });
      h.step();
      assert.equal(u.s.spRecovery, u.base.spRecovery, `${f}: none once no device stands on his x-4`);
    }
    done(h);
  }
});

test('CRA-Y: stage 3 "自身装置天赋生效的干员攻击速度+6（此效果不受技能影响）" — the operator a 平台 faces / the one behind a 铁钳号, +6 also while S1 runs; none at stage 1', () => {
  for (const [tier, want] of [[5, 0], [6, 6]]) {
    for (const skill of [0, 1, 2]) {
      const f = `T${tier} CRA-Y S${skill + 1}`;
      const piece = skill === 2 ? [10, 7] : [11, 4];
      const op = skill === 2 ? { uid: 3, chessId: 'chess_char_1_08_a', row: 10, col: 6 } : { uid: 3, chessId: 'chess_char_1_08_a', row: 11, col: 5 };
      const { h, devs } = field({ tier, elite: true, mod: Y, skill, pieces: [piece], others: [op] });
      const tx = h.unit(3);
      h.step();
      assert.equal(tx.s.aspd, tx.base.aspd + want, `${f}: ASPD`);
      if (want) assert.deepEqual(tx.findBuff(`ironmn:aspd:${devs[0].id}`).mods, { aspd: 6 });
      done(h);
    }
  }
  const { h, u } = field({ tier: 6, elite: true, mod: Y, skill: 0, pieces: [[11, 4]], others: [{ uid: 3, chessId: 'chess_char_1_08_a', row: 11, col: 5 }] });
  const tx = h.unit(3);
  u.skill.gainSp(999);
  h.spawn('enemy_dummy', { pos: [10, 6] });
  assert.ok(h.runUntil(() => u.skill.active, 3));
  h.step();
  assert.equal(tx.s.aspd, tx.base.aspd + 6, 'not scaled by S1');
  done(h);
});

test('铁钳号·原型机: enemies never select it (a ranged enemy beside it shoots 白铁 instead); its own HP loss can knock it out — then 节约经费 rolls and it returns like any device (20 s, CRA-Y 10 s; 10 DP, CRA-X 6)', () => {
  const shooter = enemyRec({ key: 'enemy_shooter', hp: 1e9, speed: 0, mass: 0, range: 2.5, atk: 50, bat: 1 });
  for (const [tier, elite, mod] of [[5, false, null], [6, true, X], [6, true, Y]]) {
    const f = label([tier, elite, mod]);
    const units = [
      { uid: 1, diy: { slot: SLOT[tier], charId: IRON, skillIndex: 2, uniEquipId: mod }, elite, row: 10, col: 5 },
      { uid: 10, kind: 'token', tokenId: CRAB, ownerUid: 1, row: 11, col: 6 },
    ];
    const h = makeBattle({ defs: { enemies: { ...ENEMIES, enemy_shooter: shooter } }, timeLimit: 900, autoFinish: false, seed: 7, flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'death'], captureNoisy: true, units });
    h.step();
    h.b.players[0].dp = 99;
    const u = h.unit(1);
    const c = h.b.allyUnits.find((a) => a.defId === CRAB);
    const e = h.spawn('enemy_shooter', { pos: [9, 7] });
    h.run(5);
    const atk = h.events.filter((x) => x[0] === 'atk' && x[1] === e.id);
    assert.ok(atk.length > 0 && atk.every((x) => x[2] !== c.id), `${f}: the enemy shoots, never at the crab`);
    assert.equal(c.hp, c.s.maxHp, `${f}: untouched`);
    // knocked out by its own HP loss
    h.b.kill(e, null);
    h.step();
    const v = tokOf(CRAB, tier, elite, 2, mod);
    c.hp = 10;
    c.skill.gainSp(99);
    const asked = forceChance(h, true);
    h.spawn('enemy_dummy', { pos: [11, 8] });
    assert.ok(h.runUntil(() => !c.alive, 2), `${f}: its −2.5 % knocks it out`);
    assert.deepEqual(asked.length, 1, `${f}: 节约经费 rolled (on his x-4)`);
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => c.alive, v.stats.respawnTime + 2), `${f}: back`);
    approx(h.b.time - t0, v.stats.respawnTime, `${f}: after ${v.stats.respawnTime} s`, 0.3);
    approx(h.b.players[0].dp, 99 - v.stats.cost, `${f}: −${v.stats.cost} DP`);
    assert.equal(c.hp, c.s.maxHp, `${f}: at full HP`);
    void u;
    done(h);
  }
});
