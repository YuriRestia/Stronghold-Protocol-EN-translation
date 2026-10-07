// test/content/op_nasti.test.js — the 自选 operator kit of 娜斯提 (char_4212_nasti, 6★ 工匠; kit
// server/sim/content/kits/ops/op-nasti.js) and of her <支援装置> “质检专员” (token_10059_nasti_nstdef), “监工专员”
// (token_10060_nasti_nstchr) and “应急承重小组” (token_10061_nasti_nstbld: the 小工程师 and its 高台), fielded the production way (a
// DIY slot + its `diy` pick; the devices as the placed hand pieces of her player) in every form: tiers 5 / 6, normal (E2 Lv1,
// skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or CRA-X 工程师们 at stage 1 (tier 5) / 3 (tier 6). Numbers
// from data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_nasti.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const NASTI = 'char_4212_nasti';
const DEF = 'token_10059_nasti_nstdef', CHR = 'token_10060_nasti_nstchr', BLD = 'token_10061_nasti_nstbld';
const TOK = [DEF, CHR, BLD];
const FORMS = BACKUPS.units[NASTI].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_nasti';
const S1 = 'skchr_nasti_1', S2 = 'skchr_nasti_2', S3 = 'skchr_nasti_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const tokOf = (id, tier, elite, skill, mod) => {
  let v = BACKUPS.tokens[id].variants[`${NASTI}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_rng: dummy('enemy_rng', { range: 2 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
  enemy_hit: enemyRec({ key: 'enemy_hit', hp: 1e9, speed: 0.6, mass: 0, atk: 400, bat: 1 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], [5, true, null], [5, true, X], [6, true, null], [6, true, X]];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, dir = 'RIGHT', pieces = [], others = [], seed = 5, dp = 99 } = {}) {
  const units = [
    { uid: 1, diy: { slot: SLOT[tier], charId: NASTI, skillIndex: skill, uniEquipId: mod }, elite, row, col, dir },
    ...pieces.map(([r, c, d], i) => ({ uid: 10 + i, kind: 'token', tokenId: TOK[skill], ownerUid: 1, row: r, col: c, dir: d ?? 'RIGHT' })),
    ...others,
  ];
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'death', 'deploy', 'spGain', 'heal'], captureNoisy: true,
    units,
  });
  h.step();
  h.b.players[0].dp = dp;
  const u = h.unit(1);
  const devs = h.b.allyUnits.filter((a) => a.kind === 'token' && a.defId === TOK[skill] && a.uid != null).sort((a, b) => a.uid - b.uid);
  return { h, u, devs };
}
const st = (u) => u.mem.craftsman;
const platformOf = (u) => u.mem.nastiPlatform ?? null;
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const protectOf = (a) => a.findBuff('protect')?.mods ?? null;

test('娜斯提 in every 自选 form: her kit (all three skills authored), stats + module attributes, 1-1, blocks 2, melee physical ground-only, 协防 (no faction bond), no 特质, the data triggers; offered as a pick', () => {
  assert.equal(OPERATOR_KITS[NASTI], KITS[NASTI]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [NASTI, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.profile.sub, u.base.bat], [2, 'melee', false, 'phys', 'craftsman', 1.5], `${label(f)}: 工匠`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => s.trigger.rule), ['DEFAULT', 'DEFAULT', 'DEFAULT']);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr], [{ maxHp: 78, atk: 26, def: 25 }, { maxHp: 145, atk: 40, def: 45 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(NASTI));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(NASTI), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: NASTI, skillIndex: 1, uniEquipId: X } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: NASTI, skillIndex: 1, uniEquipId: X } } });
});

test('<支援装置> hand pieces: the picked skill\'s device (variant sources), 2 of them (deploy limit 2, "最多可部署2个"); CRA-X costs 2 / 2 / 3; stock 3 (CRA-X 4); CRA-X stage 3: the first device deployment after each of hers costs 3 less', () => {
  for (const [skill, id] of TOK.entries()) {
    for (const s of [0, 1, 2]) assert.equal(tokOf(id, 6, true, s, null).sources.includes('skill'), s === skill, `${id} under S${s + 1}`);
    assert.equal(tokOf(id, 6, true, skill, null).stats.deployLimit, 2, `${id}: 2 hand pieces`);
  }
  assert.deepEqual(TOK.map((id, s) => tokOf(id, 6, true, s, null).stats.cost), [4, 4, 6]);
  assert.deepEqual(TOK.map((id, s) => tokOf(id, 6, true, s, X).stats.cost), [2, 2, 3]);
  assert.deepEqual(TOK.map((id, s) => tokOf(id, 6, true, s, null).stats.respawnTime), [8, 4, 6]);
  for (const [tier, elite, mod, cap, cut] of [[5, false, null, 3, 0], [5, true, X, 4, 0], [6, true, X, 4, 3]]) {
    const f = label([tier, elite, mod]);
    const { h, u, devs } = field({ tier, elite, mod, skill: 0, pieces: [[11, 7], [9, 7]] });
    const [a, b] = devs;
    assert.deepEqual([st(u).stock, st(u).cap, a.alive, b.alive], [cap, cap, true, true], `${f}: stock, both deployed free`);
    assert.equal(u.mem.nastiFirst, false, `${f}: the battle-start deployment used the first-device cut`);
    // she leaves and comes back: the first device back costs `cut` less, the next one its full cost
    h.b.kill(u, null);
    assert.ok(!a.alive && !b.alive, `${f}: her devices leave with her`);
    h.b.players[0].dp = 999;
    assert.ok(h.runUntil(() => u.alive, 200), `${f}: back`);
    h.b.players[0].dp = 100;
    assert.ok(h.runUntil(() => a.alive && b.alive, 20), `${f}: both devices back`);
    approx(h.b.players[0].dp, 100 - Math.max(0, a.base.cost - cut) - a.base.cost, `${f}: the first back ${Math.max(0, a.base.cost - cut)} DP, the second ${a.base.cost}`);
    done(h);
  }
});

test('注意安全: 12 % 庇护 on her; once a 远程 enemy is on the field (until she leaves) 18 % on her and on our 远程 operators (not the 近战 ones), and +1 SP every 6 s for them', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const t1 = formOf(tier, elite).talents.find((t) => t.index === 1).bb;
    assert.deepEqual([t1['nasti_t2[res].damage_resistance'], t1['nasti_t2[res_plus].damage_resistance'], t1['nasti_t2[add_sp].interval']], [0.12, 0.18, 6]);
    const { h, u } = field({ tier, elite, skill: 0, others: [{ uid: 3, chessId: 'chess_char_1_14_a', row: 9, col: 3 }, { uid: 4, chessId: 'chess_char_1_08_a', row: 12, col: 3 }] });
    const prov = h.unit(3), tx = h.unit(4);
    h.run(0.5);
    assert.deepEqual([protectOf(u), protectOf(prov), protectOf(tx)], [{ physTakenMul: 1 - 0.12, artsTakenMul: 1 - 0.12 }, null, null], `T${tier}: 12 % on her only`);
    h.spawn('enemy_dummy', { pos: [11, 9] });
    h.run(0.5);
    assert.deepEqual(protectOf(u), { physTakenMul: 1 - 0.12, artsTakenMul: 1 - 0.12 }, `T${tier}: a 近战 enemy changes nothing`);
    const rng = h.spawn('enemy_rng', { pos: [12, 9] });
    h.run(0.5);
    assert.deepEqual([protectOf(u), protectOf(prov), protectOf(tx)], [{ physTakenMul: 1 - 0.18, artsTakenMul: 1 - 0.18 }, { physTakenMul: 1 - 0.18, artsTakenMul: 1 - 0.18 }, null], `T${tier}: 18 % on her and 格雷伊 (远程), not 德克萨斯`);
    const gifts = (a) => h.hooksOf('spGain').filter((c) => c.unit === a && c.reason === 'talent').map((c) => c.t);
    prov.skill.sp = 0;
    u.skill.sp = 0;
    const g0 = gifts(prov).length;
    h.run(12.1);
    assert.equal(gifts(prov).length - g0, 2, `T${tier}: +1 SP every 6 s (格雷伊)`);
    assert.ok(gifts(u).length >= 2, `T${tier}: and her`);
    assert.equal(gifts(tx).length, 0, `T${tier}: not 德克萨斯`);
    h.b.kill(rng, null);
    h.run(1);
    assert.deepEqual(protectOf(prov), { physTakenMul: 1 - 0.18, artsTakenMul: 1 - 0.18 }, `T${tier}: permanent until she leaves`);
    h.b.kill(u, null);
    h.run(1);
    assert.equal(protectOf(prov), null, `T${tier}: gone with her`);
    done(h);
  }
});

test('S1 “拱卫” + “质检专员”: DEF +25 % on the operator it faces; while S1 runs DEF +40 / 46 %, block +1 and the device −2 % max HP / s; S1 38 / 40 s, ATK / DEF +52 / 65 %, every blocked enemy at once, +1 stock at the start', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const v = tokOf(DEF, tier, elite, 0, null);
    const { h, u, devs } = field({ tier, elite, skill: 0, pieces: [[11, 4]], others: [{ uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 5 }] });
    const yak = h.unit(3);
    const [d] = devs;
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.def, sk.bb['talent@def'], v.talents[1].bb.def, v.skill.bb['talent@block_cnt'], v.skill.bb['talent@hp_ratio']],
      [elite ? 40 : 38, elite ? 0.65 : 0.52, elite ? 0.65 : 0.52, elite ? 0.46 : 0.4, 0.25, 1, 0.02], `T${tier}`);
    h.step();
    assert.deepEqual(yak.findBuff(`nasti:nstdef:${d.id}`)?.mods, { defPct: 0.25 }, `T${tier}: 严禁偷工减料`);
    assert.ok(d.s.flags.untargetable && d.s.flags.invulnerable && d.s.flags.noHeal, `T${tier}: 不会受到攻击, 无敌, 禁疗`);
    st(u).stock = 1;
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3));
    assert.equal(st(u).stock, 2, `T${tier}: +1 stock`);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.02);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    assert.deepEqual(u.skill.spec.attack, { hitAllBlocked: true });
    h.step();
    assert.deepEqual(yak.findBuff(`nasti:nstdef:${d.id}`)?.mods, { defPct: sk.bb['talent@def'], blockCnt: 1 }, `T${tier}: the S1 mode`);
    assert.equal(yak.s.blockCnt, yak.base.blockCnt + 1, `T${tier}: block +1`);
    const hp0 = d.hp;
    h.run(5.02);
    approx(hp0 - d.hp, d.s.maxHp * 0.02 * 5, `T${tier}: −2 % / s`, 1e-3);
    h.runUntil(() => !u.skill.active, sk.duration + 1);
    h.step();
    assert.deepEqual(yak.findBuff(`nasti:nstdef:${d.id}`)?.mods, { defPct: 0.25 }, `T${tier}: back to +25 %`);
    approx(d.hp, d.s.maxHp * (1 - 0.02 * (sk.duration - 1)), `T${tier}: ${sk.duration - 1} ticks of −2 % (at 1 … ${sk.duration - 1} s; the skill ends at ${sk.duration})`, 1e-3);
    done(h);
  }
});

test('S2 “执行” + “监工专员”: deployed at 3 / 8 HP, +1 HP every 6 SP (阻回 at full HP); S2 4 s: no attack, a barrier of 6 / 8 % of her max HP each 0.5 s up to 48 / 64 %; the device: +1 SP and a 3 / 4 % barrier to the operator it faces each 0.5 s, −1 HP each, leaves at the end; +1 stock at the end; her barriers go when she leaves', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const v = tokOf(CHR, tier, elite, 1, null);
    const { h, u, devs } = field({ tier, elite, skill: 1, pieces: [[11, 4]], others: [{ uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 5 }] });
    const yak = h.unit(3);
    const [d] = devs;
    assert.deepEqual([sk.duration, sk.bb['attack@nasti_s2[update_shield].shield_each_hp_rate'], sk.bb['attack@nasti_s2[update_shield].shield_max_hp_rate'], v.skill.bb['talent@shield_each_hp_rate'], v.skill.bb['talent@shield_max_hp_rate'], v.stats.maxHp, v.talents[1].bb.init_hp, v.skill.spCost],
      [4, elite ? 0.08 : 0.06, elite ? 0.64 : 0.48, elite ? 0.04 : 0.03, elite ? 0.64 : 0.48, 8, 3, 6], `T${tier}`);
    assert.deepEqual([d.hp, d.s.maxHp], [3, 8], `T${tier}: 3 / 8 HP`);
    h.run(12.2);
    assert.equal(d.hp, 5, `T${tier}: +1 HP every 6 s`);
    h.run(18.2);
    assert.equal(d.hp, 8, `T${tier}: full`);
    assert.ok(d.s.flags.noSp, `T${tier}: 阻回 at full HP`);
    // S2: 8 pulses over 4 s on 角峰; the device dies on its last HP; her own barrier
    st(u).stock = 1;
    yak.skill.sp = 0;
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    assert.deepEqual(u.skill.spec.attack, { noAttack: true }, `T${tier}: 停止攻击`);
    const t0 = h.b.time;
    h.runUntil(() => !u.skill.active, 6);
    approx(h.b.time - t0, 4, `T${tier}: 4 s`, 0.03);
    const each = u.s.maxHp * v.skill.bb['talent@shield_each_hp_rate'];
    approx(yak.findBuff(`nasti:shield:${u.id}`)?.shield ?? 0, 8 * each, `T${tier}: 8 pulses of ${v.skill.bb['talent@shield_each_hp_rate'] * 100} % of her max HP`, 1e-3);
    assert.equal(h.hooksOf('spGain').filter((c) => c.unit === yak && c.reason === 'device').length, 8, `T${tier}: 8 SP`);
    approx(u.findBuff('nasti:s2shield').shield, u.s.maxHp * sk.bb['attack@nasti_s2[update_shield].shield_max_hp_rate'], `T${tier}: her barrier at the cap`, 1e-3);
    assert.equal(d.alive, false, `T${tier}: the device spent (8 HP) / left at the end`);
    assert.equal(st(u).stock, 2, `T${tier}: +1 stock at the end (the device not back yet)`);
    assert.ok(h.runUntil(() => d.alive, 10), `T${tier}: back after 4 s`);
    assert.deepEqual([d.hp, st(u).stock], [3, 1]);
    // she leaves: every barrier of her S2 goes
    h.b.kill(u, null);
    assert.ok(!yak.findBuff(`nasti:shield:${u.id}`) && !u.findBuff('nasti:s2shield'), `T${tier}: barriers gone with her`);
    done(h);
  }
});

test('S3 栖脚地 + 应急承重小组: the 小工程师 builds the 高台 on the free low tile it faces (none on a taken tile); 50 SP a level (its own 1 / s + 1 / s from the 小工程师, 2 / s in S3); level 1 attackable, block 1; level 2 +1000 HP / +100 DEF / +5 RES; level 3 +2000 / +200 / +10, 阻回; heals 1 % (2 %) for −2 %; stays when she leaves only at level 3; S3 15 s, ATK / DEF +100 / 130 %', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const v = tokOf(BLD, tier, elite, 2, null);
    const { h, u, devs } = field({ tier, elite, skill: 2, pieces: [[11, 4], [9, 4, 'UP']], others: [{ uid: 3, chessId: 'chess_char_1_02_a', row: 10, col: 4 }] });
    const [eng, blocked] = devs;
    const p = platformOf(u);
    assert.ok(p && p.alive, `T${tier}: the 高台 built`);
    assert.deepEqual([p.tileR, p.tileC, p.mem.nastiLevel], [11, 5, 0], `T${tier}: on the tile it faces`);
    assert.equal(h.b.allyUnits.filter((a) => a.defId === BLD && a.mem.nastiPlatform).length, 1, `T${tier}: one 高台 (the other 小工程师 faces 角峰)`);
    void blocked;
    assert.ok(p.s.flags.untargetable && p.s.flags.invulnerable && p.s.blockCnt === 0, `T${tier}: 未激活 — untargetable, invulnerable, blocks nobody`);
    assert.ok(eng.s.flags.untargetable && eng.s.flags.invulnerable && eng.s.flags.noHeal, `T${tier}: the 小工程师 不会受到攻击`);
    assert.deepEqual([v.skill.spCost, v.talents[0].bb.m1_sp, v.talents[0].bb.m2_sp, v.talents[0].bb['nasti_nstbld_m1[heal_m456].hp_ratio'], v.talents[0].bb['nasti_nstbld_m2[heal_m456].hp_ratio']], [50, 1, 2, 0.01, 0.02], `T${tier}`);
    // level 1 after 25 s (1 + 1 SP / s)
    assert.ok(h.runUntil(() => p.mem.nastiLevel === 1, 27), `T${tier}: level 1`);
    approx(h.b.time, 25, `T${tier}: 50 SP at 2 / s`, 0.08);
    assert.ok(!p.s.flags.untargetable && !p.s.flags.invulnerable && p.s.blockCnt === 1, `T${tier}: 激活 — attackable, block 1`);
    // S3: 3 SP / s (1 own + 2), level 2
    u.skill.gainSp(999);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK +${sk.bb.atk * 100} %`);
    approx(u.skill.timeLeft, 15, `T${tier}: 15 s`, 0.05);
    const sp0 = p.skill.sp, tS = h.b.time;
    h.run(5);
    approx(p.skill.sp - sp0, 3 * 5, `T${tier}: 3 SP / s in S3`, 0.05);
    void tS;
    assert.ok(h.runUntil(() => p.mem.nastiLevel === 2, 20), `T${tier}: level 2`);
    approx(p.s.maxHp, v.stats.maxHp + 1000, `T${tier}: +1000 HP`);
    assert.deepEqual([p.s.def, p.s.res], [v.stats.def + 100, v.stats.res + 5], `T${tier}: +100 DEF / +5 RES`);
    // heal: 1 % of its max HP for −2 % of the 小工程师's
    h.runUntil(() => !u.skill.active, 20);
    p.hp = p.s.maxHp * 0.5;
    const e0 = eng.hp, p0 = p.hp;
    h.run(1.01);
    approx(p.hp - p0, p.s.maxHp * 0.01, `T${tier}: heals 1 %`, 0.02);
    approx(e0 - eng.hp, eng.s.maxHp * 0.02, `T${tier}: −2 % own`, 0.02);
    // level 3: 阻回; stays when she leaves
    p.skill.gainSp(999);
    h.step(2);
    assert.equal(p.mem.nastiLevel, 3, `T${tier}: level 3`);
    approx(p.s.maxHp, v.stats.maxHp + 2000, `T${tier}: +2000 HP`);
    assert.ok(p.s.flags.noSp, `T${tier}: 阻回 at the top level`);
    h.b.kill(u, null);
    assert.ok(p.alive, `T${tier}: a level-3 高台 stays when she leaves`);
    assert.ok(!eng.alive, `T${tier}: the 小工程师 goes with her`);
    done(h);
  }
  // below level 3 the 高台 goes with her; no 高台 on a taken tile
  const { h, u } = field({ tier: 6, elite: true, skill: 2, pieces: [[11, 4]], others: [{ uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 5 }] });
  assert.equal(platformOf(u), null, 'the tile it faces is taken: no 高台');
  done(h);
  const r2 = field({ tier: 6, elite: true, skill: 2, pieces: [[11, 4]] });
  const p2 = platformOf(r2.u);
  r2.h.b.kill(r2.u, null);
  assert.ok(!p2.alive, 'a level-0 高台 goes with her');
  done(r2.h);
});

test('CRA-X stage 3 "装置可与攻击范围内其他装置共同提供效果": a 质检专员 with another on its range also reaches that one\'s range (the operator ahead gets both) — not at stage 1 or without the module', () => {
  for (const [tier, mod, want] of [[6, X, 2], [5, X, 1], [6, null, 1]]) {
    const { h, devs } = field({ tier, elite: true, mod, skill: 0, pieces: [[11, 3], [11, 4]], others: [{ uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 5 }] });
    const yak = h.unit(3);
    h.step();
    const n = devs.filter((d) => yak.findBuff(`nasti:nstdef:${d.id}`)).length;
    assert.equal(n, want, `T${tier} ${mod ?? 'none'}: ${want} device(s) reach 角峰`);
    approx(yak.s.def, yak.base.def * (1 + 0.25 * want), `T${tier}: DEF +${25 * want} %`);
    done(h);
  }
});
