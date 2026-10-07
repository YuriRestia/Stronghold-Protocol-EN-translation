// test/content/op_sleach.test.js — the 自选 operator kit of 琴柳 (char_479_sleach, 6★ 执旗手; kit
// server/sim/content/kits/ops/op-sleach.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in every
// form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, BEA-X 牧人的歌 or
// BEA-Y “友谊万岁” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json; the fidelity checklist
// of kits/README.md item by item.
// Run: node --test test/content/op_sleach.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { FLAG_FLIGHT, FLAG_ALLY, FLAG_ENEMY, S2_KEY, FRONT_KEY, CAMOU_KEY } from '../../server/sim/content/kits/ops/op-sleach.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const SL = 'char_479_sleach';
const FORMS = BACKUPS.units[SL].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const BX = 'uniequip_002_sleach', BY = 'uniequip_003_sleach';
const S1 = 'skcom_assist_cost[3]', S2 = 'skchr_sleach_2', S3 = 'skchr_sleach_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The talents of a form with the module's changes (the composed record's). */
const talentOf = (tier, elite, mod, i) => {
  const ch = modOf(tier, elite ? mod : null)?.talentChanges?.find((t) => t.talentIndex === i);
  return ch ?? formOf(tier, elite).talents.find((t) => t.index === i);
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, BX, BY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const TEXAS = 'chess_char_1_08_a', YAK = 'chess_char_1_02_a', PROVE = 'chess_char_1_07_a';

/** A battle with 琴柳 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5, flags = {} } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, ...flags }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'deploy', 'death', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: SL, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const dpOf = (h) => h.b.players[0].dp;

test('琴柳 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 1-1, 执旗手 (blocks 1, melee physical, ground-only), ground-targetable, 维多利亚; the three triggers SP_FULL (the 执旗手 row)', () => {
  assert.equal(OPERATOR_KITS[SL], KITS[SL]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null, sk = form.skills[skill];
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [SL, SLOT[tier], sk.skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.profile.sub, u.base.bat], [1, 'melee', false, 'phys', 'bearer', 1.3], `${label(f)}: 执旗手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['victoriaShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      assert.deepEqual([u.skill.rule, u.skill.spCost, u.skill.kind, sk.trigger.rawRule], ['SP_FULL', sk.spCost, 'duration', 'ALWAYS'], `${label(f)}: trigger / SP`);
      done(h);
    }
  }
  // the form numbers (zh_CN, full potential): E2 Lv1 1339 / 483 / 311, E2 Lv60 1668 / 541 / 348; BEA-X +150 / +48 → +200 / +68 HP / ATK,
  // BEA-Y +150 / +45 → +200 / +70 HP / DEF
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1339, 483, 1668, 541]);
  assert.deepEqual([modOf(5, BX).attr, modOf(6, BX).attr, modOf(5, BY).attr, modOf(6, BY).attr], [{ maxHp: 150, atk: 48 }, { maxHp: 200, atk: 68 }, { maxHp: 150, def: 45 }, { maxHp: 200, def: 70 }]);
});

test('a 自选 pick: 琴柳 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(SL));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(SL), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: SL, skillIndex: 2, uniEquipId: BY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: SL, skillIndex: 2, uniEquipId: BY } } });
});

test('S1 支援号令·γ型: cast as soon as its SP is full (no enemy needed), 8 s, no attack, blocks 0 meanwhile; +1 DP every 0.44 s from 0.44 s, 18 in all', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, BX]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [{ uid: 2, chessId: YAK, row: 10, col: 7 }] });
    assert.deepEqual([sk.duration, sk.bb.value, sk.bb.interval, sk.bb.cost, sk.initSp, sk.spCost], [8, 18, 0.44, 1, elite ? 12 : 11, elite ? 29 : 32], `T${tier}`);
    h.run(sk.spCost - sk.initSp - 0.5);
    assert.equal(u.skill.activations, 0, `T${tier}: not before its SP is full`);
    h.b.players[0].dp = 0;
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: cast at full SP with no enemy on the field`);
    const t0 = h.b.time;
    let attacksOn = 0;
    h.b.on('attack', (c) => { if (c.attacker === u && u.skill.active) attacksOn++; });
    assert.equal(u.s.blockCnt, 0, `T${tier}: 执旗手 — block 0 while it runs`);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    h.runUntil(() => dpOf(h) >= 1, 1);
    approx(h.b.time - t0, 0.44, `T${tier}: the first DP after one interval`, 0.1);
    h.runUntil(() => !u.skill.active, 9);
    approx(h.b.time - t0, 8, `T${tier}: 8 s`, 0.01);
    approx(dpOf(h), 18, `T${tier}: 18 DP`);
    assert.equal(attacksOn, 0, `T${tier}: 停止攻击`);
    h.run(1);
    approx(dpOf(h), 18, `T${tier}: nothing after`);
    assert.equal(u.s.blockCnt, 1, `T${tier}: block back`);
    done(h);
  }
});

test('S2 信仰传承: the flag goes to the operator with the lowest HP share on the x-1 (not her, not a 孤立 one, not out of range): DEF +def and 生命回复速度 ATK × ratio there (through 禁疗), T1\'s area follows the flag; 20 DP over 15 s; back to her after', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, BY]]) {
    const sk = skillOf(tier, elite, S2);
    const others = [
      { uid: 2, chessId: YAK, row: 10, col: 6 },     // [0, 1]: in range, 80 %
      { uid: 3, chessId: TEXAS, row: 11, col: 4 },   // [1, -1]: in range, 40 % — the target
      { uid: 4, chessId: PROVE, row: 12, col: 7 },   // [2, 2]: outside the x-1, 10 %
      { uid: 5, chessId: 'chess_char_1_09_a', row: 9, col: 5 }, // [-1, 0]: in range, 5 % but 孤立 — never chosen
    ];
    const { h, u } = field({ tier, elite, mod, skill: 1, row: 10, col: 5, others });
    const yak = h.unit(2), texas = h.unit(3), prove = h.unit(4);
    assert.deepEqual([sk.duration, sk.bb.value, sk.bb['sleach_s_2[cost].interval'], sk.rangeId, sk.bb.def, sk.bb.atk_to_hp_recovery_ratio], [15, 20, 0.75, 'x-1', elite ? 0.35 : 0.22, elite ? 0.35 : 0.22], `T${tier}`);
    yak.hp = yak.s.maxHp * 0.8; texas.hp = texas.s.maxHp * 0.4; prove.hp = prove.s.maxHp * 0.1;
    u.hp = u.s.maxHp * 0.05; // her own share never makes her the target
    const iso = h.unit(5);
    iso.hp = iso.s.maxHp * 0.05;
    h.b.addBuff(iso, { key: 'test:isolated', flags: { isolated: true } });
    h.b.addBuff(texas, { key: 'test:noheal', flags: { noHeal: true } });
    h.b.players[0].dp = 0;
    const defBefore = texas.s.def;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1));
    const t0 = h.b.time;
    assert.deepEqual(u.mem.sleachFlag && [u.mem.sleachFlag.r, u.mem.sleachFlag.c], [11, 4], `T${tier}: the flag on 德克萨斯's tile`);
    h.run(0.3);
    const b = texas.findBuff(`${S2_KEY}:${u.id}`);
    assert.ok(b, `T${tier}: the flag effect on 德克萨斯`);
    approx(b.mods.defPct, sk.bb.def, `T${tier}: DEF +${sk.bb.def * 100} %`);
    approx(b.mods.hpRegen, u.s.atk * sk.bb.atk_to_hp_recovery_ratio, `T${tier}: 生命回复速度 = ATK × ratio`);
    approx(texas.s.def - defBefore, texas.base.def * sk.bb.def, `T${tier}: DEF applied (直接乘算)`, 1e-3);
    const hp0 = texas.hp;
    h.run(2);
    assert.ok(texas.hp > hp0 + 1.5 * u.s.atk * sk.bb.atk_to_hp_recovery_ratio, `T${tier}: it regenerates through 禁疗 (${hp0} → ${texas.hp})`);
    assert.equal(yak.findBuff(`${S2_KEY}:${u.id}`), null, `T${tier}: only the operator on the flag's tile`);
    assert.equal(prove.findBuff(`${S2_KEY}:${u.id}`), null, `T${tier}: the 10 % operator outside the x-1 is never chosen`);
    // T1's 3×3 follows the flag: 德克萨斯 (on it) and 琴柳 ([−1, +1] of it) are inside, 角峰 ([−1, +2]) is not
    const asp = talentOf(tier, elite, mod, 0).bb['sleach_t_1[ally].attack_speed'];
    assert.equal(texas.findBuff(`${FLAG_ALLY}:${u.id}`)?.mods.aspd, asp, `T${tier}: 德克萨斯 in the flag's area`);
    assert.equal(u.findBuff(`${FLAG_ALLY}:${u.id}`)?.mods.aspd, asp, `T${tier}: 琴柳 next to the flag`);
    assert.equal(yak.findBuff(`${FLAG_ALLY}:${u.id}`), null, `T${tier}: 角峰 outside the flag's area`);
    h.runUntil(() => !u.skill.active, 16);
    approx(h.b.time - t0, 15, `T${tier}: 15 s`, 0.01);
    approx(dpOf(h), 20, `T${tier}: 20 DP`);
    assert.equal(u.mem.sleachFlag, null, `T${tier}: the flag back`);
    assert.equal(texas.findBuff(`${S2_KEY}:${u.id}`), null, `T${tier}: the effect ends with the skill`);
    h.run(0.5);
    assert.equal(yak.findBuff(`${FLAG_ALLY}:${u.id}`)?.mods.aspd, asp, `T${tier}: 角峰 next to her again`);
    done(h);
  }
  // nobody else on the x-1: the flag stays on her tile — she has DEF / 生命回复速度 there
  const { h, u } = field({ tier: 6, elite: true, mod: BX, skill: 1 });
  const sk = skillOf(6, true, S2);
  u.skill.gainSp(999);
  h.run(0.3);
  assert.deepEqual([u.mem.sleachFlag.r, u.mem.sleachFlag.c], [10, 5], 'her own tile');
  approx(u.findBuff(`${S2_KEY}:${u.id}`)?.mods.defPct ?? 0, sk.bb.def, 'on herself');
  done(h);
});

test('S3 光辉旗帜: +10 DP at once; the flag on the ground tile of the enemy ranked first in the 2-1 (never a flyer): 停顿 + 脆弱 on its 3×3 at once, the strike 1 s later — atk_scale × ATK physical and 3 s 晕眩 to ground and air enemies of the 3×3; no ground enemy → her own tile', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, BX]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, mod, skill: 2, row: 10, col: 4 });
    assert.deepEqual([sk.duration, sk.bb.cost, sk.bb.atk_scale, sk.bb.stun, sk.bb['debuff.damage_scale'], sk.rangeId], [10, 10, elite ? 2.4 : 2, 3, elite ? 0.25 : 0.2, '2-1'], `T${tier}`);
    // in the 2-1 (facing RIGHT from 10,4): (10,6) [0,2] and (11,5) [1,1]; a taunt makes (10,6) the one her targeting ranks
    // first (the highest 仇恨); its 3×3 (rows 9–11, cols 5–7) holds (11,5) and the flyer at (9,6), not (10,8)
    const first = h.spawn('enemy_dummy', { pos: [10, 6] }), second = h.spawn('enemy_dummy', { pos: [11, 5] });
    h.b.addBuff(first, { key: 'test:taunt', mods: { taunt: 1 } });
    const fly = h.spawn('enemy_fly', { pos: [9, 6] });
    const out = h.spawn('enemy_dummy', { pos: [10, 8] });
    h.b.players[0].dp = 0;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1));
    const t0 = h.b.time;
    approx(dpOf(h), 10, `T${tier}: +10 DP at once`);
    assert.deepEqual([u.mem.sleachFlag.r, u.mem.sleachFlag.c], [10, 6], `T${tier}: the first-ranked ground enemy's tile`);
    h.run(0.3);
    const inArea = [first, second, fly];
    for (const e of inArea) {
      assert.ok(e.findBuff('sluggish'), `T${tier}: ${e.defId} 停顿 before the flag lands`);
      approx(e.findBuff('fragile')?.data?.value ?? 0, sk.bb['debuff.damage_scale'], `T${tier}: ${e.defId} 脆弱`);
      assert.equal(e.findBuff('stun'), null, `T${tier}: no 晕眩 yet`);
    }
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u).length, 0, `T${tier}: no damage before it lands`);
    assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source === u), 2));
    approx(h.b.time - t0, FLAG_FLIGHT, `T${tier}: it lands ${FLAG_FLIGHT} s after the throw`, 0.05);
    const hits = h.hooksOf('damaged').filter((c) => c.source === u);
    const struck = new Set(hits.map((c) => c.target));
    for (const e of inArea) {
      assert.ok(struck.has(e), `T${tier}: ${e.defId} struck (ground and air)`);
      const c = hits.find((x) => x.target === e);
      approx(c.amount, u.s.atk * sk.bb.atk_scale * (1 + sk.bb['debuff.damage_scale']), `T${tier}: ${sk.bb.atk_scale * 100} % ATK × the 脆弱`);
      assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true]);
      const st = h.hooksOf('statusApplied').find((x) => x.source === u && x.status === 'stun' && x.target === e);
      approx(st?.duration ?? 0, sk.bb.stun, `T${tier}: ${sk.bb.stun} s 晕眩`);
    }
    assert.ok(!struck.has(out) && !out.findBuff('sluggish'), `T${tier}: nothing outside the 3×3`);
    h.runUntil(() => !u.skill.active, 11);
    approx(h.b.time - t0, 10, `T${tier}: 10 s`, 0.01);
    assert.equal(u.mem.sleachFlag, null, `T${tier}: the flag back`);
    done(h);
  }
  // only a flyer in the 2-1, then nobody: her own tile
  for (const pos of [[10, 6], null]) {
    const { h, u } = field({ tier: 6, elite: true, mod: BY, skill: 2, row: 10, col: 4 });
    if (pos) h.spawn('enemy_fly', { pos });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1));
    assert.deepEqual([u.mem.sleachFlag.r, u.mem.sleachFlag.c], [10, 4], pos ? 'a flyer is never the target' : 'no enemy: her tile');
    done(h);
  }
});

test('T1 不退之旗 in every form: operators of the 3×3 around her ASPD +12 (BEA-X stage 3 +15) — 孤立 ones too, summons not —, enemies there (ground and air) ASPD −12 (−15); nothing outside, nothing once she left', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const tb = talentOf(tier, elite, mod, 0).bb;
    const others = [{ uid: 2, chessId: YAK, row: 11, col: 6 }, { uid: 3, chessId: TEXAS, row: 9, col: 4 }, { uid: 4, chessId: PROVE, row: 10, col: 7 }];
    const { h, u } = field({ tier, elite, mod, skill: 2, others });
    const yak = h.unit(2), texas = h.unit(3), prove = h.unit(4);
    h.b.addBuff(texas, { key: 'test:isolated', flags: { isolated: true } });
    const tok = h.b.spawnToken('p1', 'token_10000_silent_healrb', 11, 4);
    const e1 = h.spawn('enemy_dummy', { pos: [10, 6] }), e2 = h.spawn('enemy_fly', { pos: [9, 5] }), e3 = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.run(0.5);
    const a = tb['sleach_t_1[ally].attack_speed'], en = tb['sleach_t_1[enemy].attack_speed'];
    assert.deepEqual([a, en], tier === 6 && elite && mod === BX ? [15, -15] : [12, -12], label(f));
    for (const x of [u, yak, texas]) assert.equal(x.findBuff(`${FLAG_ALLY}:${u.id}`)?.mods.aspd, a, `${label(f)}: ${x.defId} +${a}`);
    assert.equal(prove.findBuff(`${FLAG_ALLY}:${u.id}`), null, `${label(f)}: two tiles away`);
    assert.ok(tok && !tok.findBuff(`${FLAG_ALLY}:${u.id}`), `${label(f)}: no summon`);
    for (const e of [e1, e2]) assert.equal(e.findBuff(`${FLAG_ENEMY}:${u.id}`)?.mods.aspd, en, `${label(f)}: ${e.defId} ${en}`);
    assert.equal(e3.findBuff(`${FLAG_ENEMY}:${u.id}`), null, `${label(f)}: the enemy two tiles away`);
    approx(e1.s.aspd, 100 + en, `${label(f)}: enemy ASPD`);
    h.b.retreat(u);
    h.run(0.5);
    assert.equal(yak.findBuff(`${FLAG_ALLY}:${u.id}`), null, `${label(f)}: gone with her`);
    assert.equal(e1.findBuff(`${FLAG_ENEMY}:${u.id}`), null, `${label(f)}: gone with her (enemy)`);
    done(h);
  }
});

test('T2 精神感召: from her deployment the operators of her player off the field cost −2 until the next operator deployment; BEA-Y stage 3 adds +2 DP when that operator is 近战位 (once) — nothing at stage 1 or for a 远程位 one', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const bonus = tier === 6 && elite && mod === BY ? 2 : 0;
    if (bonus) assert.deepEqual(modOf(6, BY).talentChanges.find((t) => t.talentIndex === -1).bb, { cost: 2 });
    // she deploys last (col 7 after cols 3 / 4): no operator waits, so the effect stays; a knocked-out one gets the cut
    for (const [chessId, melee] of [[TEXAS, true], [PROVE, false]]) {
      const { h } = field({ tier, elite, mod, skill: 0, row: 10, col: 7, others: [{ uid: 2, chessId, row: 10, col: 3 }, { uid: 3, chessId: YAK, row: 11, col: 4 }] });
      const op = h.unit(2), cost = op.base.cost;
      h.b.kill(op);
      assert.equal(op.base.cost, cost - 2, `${label(f)} ${chessId}: −2 while it waits`);
      h.b.players[0].dp = 20;
      assert.ok(h.b.redeploy(op, { free: false }), 'redeploys');
      approx(dpOf(h), 20 - (cost - 2) + (melee ? bonus : 0), `${label(f)} ${chessId}: paid ${cost - 2}${melee && bonus ? ', +2 DP (近战位)' : ''}`);
      assert.equal(op.base.cost, cost, `${label(f)} ${chessId}: the cost back once used`);
      h.b.kill(op);
      assert.equal(op.base.cost, cost, `${label(f)} ${chessId}: used up — no cut on the next knock-out`);
      h.b.players[0].dp = 20;
      h.b.redeploy(op, { free: false });
      approx(dpOf(h), 20 - cost, `${label(f)} ${chessId}: and no second +DP`);
      done(h);
    }
  }
  // an operator deploying after her in the battle-start deployment uses it up at once (free: nothing saved); her leaving
  // ends a pending one
  const { h, u } = field({ tier: 6, elite: true, mod: BY, skill: 0, row: 10, col: 3, others: [{ uid: 2, chessId: YAK, row: 10, col: 6 }] });
  const yk = h.unit(2), cost = yk.base.cost;
  approx(dpOf(h), 10 + 2, 'BEA-Y stage 3: 角峰 (近战位) deployed right after her: +2 DP at the battle start');
  h.b.kill(yk);
  assert.equal(yk.base.cost, cost, 'used up by the battle-start deployment');
  h.b.retreat(u);
  h.b.redeploy(u, { free: true });
  assert.equal(yk.base.cost, cost - 2, 'her redeploy: the waiting 角峰 −2 again');
  h.b.retreat(u);
  assert.equal(yk.base.cost, cost, 'her leaving ends it');
  done(h);
});

test('BEA-X “牧人的歌”: while her skill runs the operator in front of her blocks +1 (stages 1 and 3), not before / after, not without the module; BEA-Y “友谊万岁”: 迷彩 while her skill runs', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, row: 10, col: 5, others: [{ uid: 2, chessId: YAK, row: 10, col: 6 }, { uid: 3, chessId: TEXAS, row: 11, col: 5 }] });
    const front = h.unit(2), side = h.unit(3);
    const bx = elite && mod === BX, by = elite && mod === BY;
    if (bx) assert.deepEqual(u.def.raw.trait.bb, { block_cnt: 1 }, label(f));
    const base = front.s.blockCnt;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 1));
    h.run(0.3);
    assert.equal(front.s.blockCnt, base + (bx ? 1 : 0), `${label(f)}: the operator in front`);
    assert.equal(!!side.findBuff(`${FRONT_KEY}:${u.id}`), false, `${label(f)}: not the one beside her`);
    assert.equal(!!u.s.flags.camou, by, `${label(f)}: 迷彩 while it runs`);
    assert.equal(!!u.findBuff(CAMOU_KEY), by);
    h.runUntil(() => !u.skill.active, 10);
    h.step();
    assert.equal(front.s.blockCnt, base, `${label(f)}: back after`);
    assert.equal(!!u.s.flags.camou, false, `${label(f)}: no 迷彩 after`);
    done(h);
  }
});
