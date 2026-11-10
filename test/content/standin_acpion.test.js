// test/content/standin_acpion.test.js — the 郁金香 (char_608_acpion) 补位 stand-in kit (kits/ops/standin-acpion.js) on every
// chess she replaces: 3 瑕光 (S3), 4 焰尾 (S2), 5 凛御银灰 / 6 圣聆初雪 / 缪尔赛思 / 耀骑士临光 (S3, module SOL-X on the
// elite); S1 through the harness `standIn: { skillIndex: 0 }`. Numbers: data/backups.json (skill_table, PRTS
// 郁金香(卫戍协议)); S3's slash timing: her Spine Skill clip (8 OnAttack events, 0.400 s + k/6 s).
// Run: node --test test/content/standin_acpion.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { unitForm } from '../../shared/standIn.js';
import { TICK } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHAR = 'char_608_acpion';
const S1 = 'skchr_acpion_1', S3 = 'skchr_acpion_3';
const RECORDS = BACKUPS.units[CHAR].standsIn.flatMap((a) => [a, a.replace(/_a$/, '_b')]);
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, ...o });
const DEFS = {
  enemies: {
    enemy_dummy: dummy(),
    enemy_def: dummy({ key: 'enemy_def', def: 400 }),
    enemy_fly: dummy({ key: 'enemy_fly', motion: 'FLY' }),
    enemy_weak: dummy({ key: 'enemy_weak', hp: 10 }),
    enemy_hitter: dummy({ key: 'enemy_hitter', atk: 300, bat: 0.5 }),
  },
};
const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const formOf = (id) => unitForm(BACKUPS, CHAR, CHESS[id].status);
const skillOf = (id, skillId) => formOf(id).skills.find((s) => s.skillId === skillId);
const moduleOf = (id) => (CHESS[id].backup.uniEquipId && CHESS[id].status.equipLevel > 0 ? formOf(id).modules.find((m) => m.uniEquipId === CHESS[id].backup.uniEquipId) : null);

/** A battle with the shared defs and a `damaged` log (h.dmg: { t, src, tgt, key, amount, type, tags, skill, attack }). */
function battle(opts) {
  const log = [];
  const h = makeBattle({
    defs: DEFS, timeLimit: 200, autoFinish: false, seed: 5, flags: { dpPerSec: 0 }, ...opts,
    setup(b) {
      b.on('damaged', (c) => log.push({ t: b.time, src: c.source?.id ?? null, tgt: c.target.id, key: c.target.defId, amount: c.amount, type: c.type, tags: c.dmg?.tags ?? [], skill: !!c.dmg?.isSkill, attack: !!c.dmg?.isAttack }), { priority: -999 });
      if (opts.setup) opts.setup(b);
    },
  });
  h.dmg = log;
  return h;
}
const dpOf = (h) => h.b.players[0].dp;

// ---------------------------------------------------------------------------------------------------------------

test('郁金香 fields on all 12 records she replaces: her body (+ SOL-X attributes on the 5 / 6 elites), the chess\'s backup skill, her own kit, the data triggers', () => {
  assert.equal(RECORDS.length, 12);
  for (const id of RECORDS) {
    const c = CHESS[id];
    const form = formOf(id);
    const sk = form.skills.find((s) => s.index === c.backup.skillIndex);
    const mod = moduleOf(id);
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: true }] });
    h.step();
    const u = h.unit(1);
    assert.deepEqual([u.def.charId, u.def.standInFor, u.skill.id], [CHAR, c.charId, sk.skillId], id);
    assert.ok(!u.kit.generic && u.kit.skillSource === 'skills', `${id}: her kit's own spec`);
    assert.equal(!!u.def.raw.module?.active, !!mod, `${id}: module`);
    assert.deepEqual([u.base.atk, u.base.def, u.base.maxHp, u.base.blockCnt], [form.stats.atk + (mod?.attr.atk ?? 0), form.stats.def + (mod?.attr.def ?? 0), form.stats.maxHp, 2], `${id}: stats`);
    // official [COMBAT_OR_ATTACK, SKILL_RANGE_ENEMY]: S3's skill range is the x-1 diamond, S1 / S2 have none (= SEARCH)
    assert.deepEqual(u.skill.rules, sk.skillId === S3 ? ['DEFAULT', 'SKILL_RANGE'] : ['DEFAULT', 'SEARCH'], `${id}: trigger`);
    assert.deepEqual(sk.trigger.official, ['COMBAT_OR_ATTACK', 'SKILL_RANGE_ENEMY'], `${id}: the official list`);
    assert.equal(u.profile.canHitFly, false, `${id}: her attack is ground-only`);
    assert.deepEqual([u.skill.spCost, u.skill.initSp], [sk.spCost, sk.initSp], `${id}: SP`);
    assert.equal(h.b.errors.length, 0);
  }
  // the three tiers' skills: 3 瑕光 S3, 4 焰尾 S2, 5–6 S3
  assert.deepEqual([CHESS.chess_char_3_12_a, CHESS.chess_char_4_19_a, CHESS.chess_char_5_14_a].map((c) => c.backup.skillIndex), [2, 1, 2]);
});

test('浪潮之心: ATK +10 %, +1 DP for each enemy she kills; SOL-X (5 / 6 elites only): ATK / DEF +8 % exactly while she blocks', () => {
  for (const id of ['chess_char_3_12_a', 'chess_char_4_19_b', 'chess_char_5_14_b', 'chess_char_6_17_b']) {
    const mod = moduleOf(id);
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: true }] });
    const u = h.unit(1);
    h.step();
    close(u.s.atk, u.base.atk * 1.1, `${id}: ATK +10 %`);
    close(u.s.def, u.base.def, `${id}: DEF`);
    // a weak enemy walks into her block and dies to her first attack: +1 DP (no DP per second here)
    const dp0 = dpOf(h);
    const e = h.spawn('enemy_weak', { pos: [10, 4] });
    assert.ok(h.runUntil(() => !e.alive, 5), `${id}: she kills it`);
    assert.equal(dpOf(h), dp0 + 1, `${id}: +1 DP for the kill`);
    assert.equal(u.skill.activations, 0, `${id}: no skill DP mixed in`);
    // a lasting enemy on her tile: blocked ⇒ SOL-X
    h.spawn('enemy_dummy', { pos: [10, 4] });
    h.run(0.2);
    assert.equal(u.blocking.length, 1);
    close(u.s.atk, u.base.atk * (1.1 + (mod ? 0.08 : 0)), `${id}: ATK while blocking`);
    close(u.s.def, u.base.def * (1 + (mod ? 0.08 : 0)), `${id}: DEF while blocking`);
    if (mod) assert.deepEqual([mod.traitOverride.bb.atk, mod.traitOverride.bb.def], [0.08, 0.08]);
    checkInvariants(h.b);
  }
});

test('无垠之心: SP recovery +0.6/s (+1/s with SOL-X Lv3) from each deployment until her 2nd skill activation of it', () => {
  for (const [id, per] of [['chess_char_3_12_a', 0.6], ['chess_char_5_14_b', 0.6], ['chess_char_6_02_b', 1]]) {
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: { skillIndex: 0 } }], enemies: [{ key: 'enemy_dummy', pos: [10, 4] }] });
    const u = h.unit(1);
    h.step();
    assert.equal(u.skill.id, S1);
    close(u.s.spRecovery, 1 + per, `${id}: before the 1st cast`);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 40));
    h.step();
    close(u.s.spRecovery, 1 + per, `${id}: between the casts`);
    assert.ok(h.runUntil(() => u.skill.activations === 2, 40));
    h.step();
    close(u.s.spRecovery, 1, `${id}: after the 2nd cast`);
    // a new deployment starts it again
    h.b.retreat(u);
    assert.ok(h.b.redeploy(u));
    h.step();
    close(u.s.spRecovery, 1 + per, `${id}: redeployed`);
    checkInvariants(h.b);
  }
  // the module's talent upgrade: +1/s at module Lv3 only (Lv1 keeps +0.6)
  assert.deepEqual(BACKUPS.units[CHAR].forms['2/60/7/3'].modules[0].talentChanges.map((t) => t.bb.sp_recovery_per_sec), [1]);
});

test('S1 钻心: +6 DP and ATK × 170 % / 200 % physical to at most 2 enemies of her attack range (the blocked ones first, no air unit)', () => {
  for (const [id, scale] of [['chess_char_3_12_a', 1.7], ['chess_char_3_12_b', 2]]) {
    assert.equal(skillOf(id, S1).bb.atk_scale, scale);
    const h = battle({
      units: [{ chessId: id, row: 10, col: 4, standIn: { skillIndex: 0 }, carryState: { sp: 999 } }],
      enemies: [{ key: 'enemy_def', pos: [10, 4] }, { key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_def', pos: [10, 5] }, { key: 'enemy_fly', pos: [10, 5] }],
    });
    const u = h.unit(1);
    const dp0 = dpOf(h);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 5), `${id}: cast`);
    const atk = u.s.atk;
    const hits = h.dmg.filter((d) => d.src === u.id && d.skill);
    assert.equal(hits.length, 2, `${id}: two targets`);
    assert.deepEqual(hits.map((d) => d.key).sort(), ['enemy_def', 'enemy_dummy'], `${id}: the two she blocks`);
    for (const d of hits) close(d.amount, atk * scale - (d.key === 'enemy_def' ? 400 : 0), `${id}: ${d.key}`);
    assert.equal(dpOf(h), dp0 + 6, `${id}: +6 DP`);
    checkInvariants(h.b);
  }
});

test('S2 迅瞬 (焰尾\'s chess): 10 s of ASPD +95 / +110 and 25 % / 30 % DEF ignored; 1 DP every 1.6 s / 1.4 s, 6 / 7 in all', () => {
  for (const [id, aspd, pen, iv, n] of [['chess_char_4_19_a', 95, 0.25, 1.6, 6], ['chess_char_4_19_b', 110, 0.3, 1.4, 7]]) {
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: true, carryState: { sp: 999 } }] });
    const u = h.unit(1);
    h.run(1);
    assert.equal(u.skill.activations, 0, `${id}: DEFAULT — no enemy, no cast`);
    h.spawn('enemy_def', { pos: [10, 4] });
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
    const gains = [];
    let last = dpOf(h);
    assert.ok(h.runUntil(() => u.skill.active, 5), `${id}: cast with an enemy`);
    assert.equal(u.s.aspd, 100 + aspd);
    close(u.s.defIgnorePct, pen, `${id}: DEF ignore`);
    while (u.skill.active) {
      h.step();
      const now = dpOf(h);
      if (now !== last) { gains.push([h.b.time - cast, now - last]); last = now; }
    }
    close(h.b.time - cast, 10, `${id}: 10 s`, 0.01);
    assert.equal(gains.length, n, `${id}: ${n} DP gains`);
    gains.forEach(([t, d], i) => { assert.equal(d, 1); assert.ok(Math.abs(t - (i + 1) * iv) <= TICK + 1e-6, `${id}: gain ${i + 1} at ${t}`); });
    // her attacks during the skill ignored the share of the 400 DEF
    const hit = h.dmg.find((d) => d.src === u.id && d.attack && d.t > cast + 0.1 && d.t < cast + 9.9);
    close(hit.amount, u.s.atk - 400 * (1 - pen), `${id}: attack vs DEF 400`);
    assert.equal(u.s.aspd, 100);
    checkInvariants(h.b);
  }
});

test('S3 只余芬芳: +6 / +7 DP, 8 slashes at 0.4 s + k/6 s on every enemy of the x-1 around her (air units too), each ATK × 155 % / 170 % ignoring 50 % DEF', () => {
  for (const [id, scale, cost] of [['chess_char_3_12_a', 1.55, 6], ['chess_char_3_12_b', 1.7, 7], ['chess_char_6_02_b', 1.7, 7]]) {
    const b3 = skillOf(id, S3).bb;
    assert.deepEqual([b3.atk_scale, b3.cost, b3.times, b3.def_penetrate], [scale, cost, 8, 0.5]);
    const h = battle({
      units: [{ chessId: id, row: 10, col: 4, standIn: true, carryState: { sp: 999 } }],
      // x-1 = the diamond of radius 2: (10,4) blocked, (9,5) and (12,4) in it; (10,7) and (12,6) outside
      enemies: [{ key: 'enemy_def', pos: [10, 4] }, { key: 'enemy_fly', pos: [9, 5] }, { key: 'enemy_dummy', pos: [12, 4] }, { key: 'enemy_dummy', pos: [10, 7] }, { key: 'enemy_dummy', pos: [12, 6] }],
    });
    const u = h.unit(1);
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
    const dp0 = dpOf(h);
    assert.ok(h.runUntil(() => cast != null, 5), `${id}: cast`);
    h.step();
    assert.equal(dpOf(h), dp0 + cost, `${id}: +${cost} DP`);
    h.run(2);
    const atk = u.base.atk * 1.1; // 浪潮之心; SOL-X is off: she blocks nothing while it plays
    const slashes = h.dmg.filter((d) => d.src === u.id && d.tags.includes('slash'));
    const byKey = (k) => slashes.filter((d) => d.key === k);
    assert.equal(byKey('enemy_def').length, 8, `${id}: 8 slashes on the blocked enemy`);
    assert.equal(byKey('enemy_fly').length, 8, `${id}: 8 on the air unit`);
    assert.equal(byKey('enemy_dummy').length, 8, `${id}: 8 on (12,4) only — not on (10,7) / (12,6)`);
    assert.equal(new Set(byKey('enemy_dummy').map((d) => d.tgt)).size, 1);
    byKey('enemy_def').forEach((d, k) => {
      close(d.amount, atk * scale - 400 * 0.5, `${id}: slash ${k} vs DEF 400`);
      assert.ok(Math.abs(d.t - cast - (0.4 + k / 6)) <= TICK + 1e-6, `${id}: slash ${k} at ${d.t - cast}`);
      assert.equal(d.type, 'phys');
    });
    for (const d of byKey('enemy_fly')) close(d.amount, atk * scale, `${id}: air unit`);
    checkInvariants(h.b);
  }
});

test('S3 只余芬芳 while it plays (PRTS 备注): 无敌, 无法阻挡, 眩晕 / 冻结免疫, no normal attack — for the 1.8 s of her Skill + Skill_End clips', () => {
  const h = battle({
    units: [{ chessId: 'chess_char_6_11_b', row: 10, col: 4, standIn: true, carryState: { sp: 999 } }],
    enemies: [{ key: 'enemy_hitter', pos: [10, 4] }],
  });
  const u = h.unit(1);
  let cast = null;
  h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
  assert.ok(h.runUntil(() => cast != null, 5));
  h.step();
  const hp = u.hp;
  const buff = u.findBuff('acpion:fragrance');
  assert.deepEqual(buff.flags, { invulnerable: true, noBlock: true, disarm: true });
  close(buff.duration, 0.4 + 7 / 6 + 0.233, 'the window');
  assert.equal(u.blocking.length, 0, 'lets go of the enemy');
  assert.equal(h.b.applyStatus(u, 'stun', { duration: 3, source: h.b.enemies[0] }), false, 'stun refused');
  assert.equal(h.b.applyStatus(u, 'freeze', { duration: 3, source: h.b.enemies[0] }), false, 'freeze refused');
  const attacks0 = h.hooksOf('attack').length;
  h.runUntil(() => h.b.time >= cast + 1.75, 3);
  assert.equal(u.hp, hp, 'no damage taken');
  assert.equal(u.blocking.length, 0, 'blocks nothing meanwhile');
  assert.equal(h.hooksOf('attack').length, attacks0, 'no normal attack meanwhile');
  h.runUntil(() => h.b.time >= cast + 2.2, 3);
  assert.equal(u.findBuff('acpion:fragrance'), null);
  assert.equal(u.blocking.length, 1, 'blocks again');
  assert.ok(h.b.applyStatus(u, 'stun', { duration: 0.5, source: h.b.enemies[0] }), 'stun lands again');
  h.run(1);
  assert.ok(u.hp < hp, 'takes damage again');
  checkInvariants(h.b);
});

test('S3 trigger [DEFAULT, SKILL_RANGE on x-1] (data, official [COMBAT_OR_ATTACK, SKILL_RANGE_ENEMY]): any enemy on the x-1 casts it — an air unit she cannot attack too; none there, no cast', () => {
  const run = (pos) => {
    const h = battle({ units: [{ chessId: 'chess_char_3_12_a', row: 10, col: 4, standIn: true, carryState: { sp: 999 } }], enemies: [{ key: 'enemy_fly', pos }] });
    const u = h.unit(1);
    h.run(3);
    return { casts: u.skill.activations, attacks: h.hooksOf('attack').filter((a) => a.attacker === u).length, slashes: h.dmg.filter((d) => d.tags.includes('slash')).length, trigger: u.def.skill.trigger };
  };
  const inside = run([10, 6]);
  assert.equal(inside.trigger.rule, 'DEFAULT');
  assert.deepEqual(inside.trigger.also.map((a) => a.rule), ['SKILL_RANGE']);
  assert.equal(inside.trigger.also[0].grid.length, 13, 'the x-1 diamond');
  assert.deepEqual([inside.casts, inside.attacks, inside.slashes], [1, 0, 8], 'cast with no attack; the slashes reach the air unit');
  const outside = run([10, 7]);
  assert.deepEqual([outside.casts, outside.slashes], [0, 0]);
});
