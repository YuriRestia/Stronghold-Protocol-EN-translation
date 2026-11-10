// test/content/standin_acfend.test.js — the Mechanist (char_610_acfend) 补位 stand-in kit (kits/ops/standin-acfend.js) on
// every chess she replaces: 4 星熊 (S2), 5 号角 / 6 余 (S3, module PRO-X on the elite); S1 through the harness
// `standIn: { skillIndex: 0 }`. Numbers: data/backups.json (skill_table, PRTS Mechanist(卫戍协议) and its 备注: the 0.1 s
// checks of both talents, S2's swap of the talent effect). Her triggers: the owner's 重装 exception for the stand-ins.
// Run: node --test test/content/standin_acfend.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { unitForm } from '../../shared/standIn.js';
import { TICK } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHAR = 'char_610_acfend';
const S1 = 'skchr_acfend_1', S2 = 'skchr_acfend_2';
const RECORDS = BACKUPS.units[CHAR].standsIn.flatMap((a) => [a, a.replace(/_a$/, '_b')]);
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, ...o });
const DEFS = {
  enemies: {
    enemy_dummy: dummy(),
    enemy_res: dummy({ key: 'enemy_res', res: 20 }),
    enemy_fly: dummy({ key: 'enemy_fly', motion: 'FLY' }),
  },
};
const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const formOf = (id) => unitForm(BACKUPS, CHAR, CHESS[id].status);
const skillOf = (id, skillId) => formOf(id).skills.find((s) => s.skillId === skillId);
const moduleOf = (id) => (CHESS[id].backup.uniEquipId && CHESS[id].status.equipLevel > 0 ? formOf(id).modules.find((m) => m.uniEquipId === CHESS[id].backup.uniEquipId) : null);

function battle(opts) {
  const log = [];
  const h = makeBattle({
    defs: DEFS, timeLimit: 300, autoFinish: false, seed: 5, flags: { dpPerSec: 0 }, ...opts,
    setup(b) {
      b.on('damaged', (c) => log.push({ t: b.time, src: c.source?.id ?? null, tgt: c.target.id, key: c.target.defId, amount: c.amount, type: c.type, tags: c.dmg?.tags ?? [], skill: !!c.dmg?.isSkill }), { priority: -999 });
      if (opts.setup) opts.setup(b);
    },
  });
  h.dmg = log;
  return h;
}
/** DEF % of her talent and module at this moment (精研材料 +10 %, its extra below half HP, PRO-X while blocking). */
const passiveDefPct = (id, u) => {
  const t0 = u.def.talents[0].bb;
  const mod = moduleOf(id);
  return t0.def + (u.hpRatio < t0.hp_ratio ? t0['acfend_t_1[extra].def'] : 0) + (mod && u.blocking.length ? mod.traitOverride.bb.def : 0);
};

// ---------------------------------------------------------------------------------------------------------------

test('Mechanist fields on all 6 records she replaces: her body (+ PRO-X attributes on the 5 / 6 elites), the chess\'s backup skill, her own kit, the 重装 trigger', () => {
  assert.equal(RECORDS.length, 6);
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
    assert.deepEqual([u.base.def, u.base.maxHp, u.base.blockCnt], [form.stats.def + (mod?.attr.def ?? 0), form.stats.maxHp + (mod?.attr.maxHp ?? 0), 3], `${id}: stats`);
    // the official 重装 row [ON_TAKE_DAMAGE, SKILL_RANGE_ENEMY] (no skill grid -> SEARCH): a hit or an enemy in her range
    assert.deepEqual([u.skill.rule, sk.trigger.rawRule], ['TAKE_DAMAGE', 'ON_TAKE_DAMAGE'], `${id}: trigger`);
    assert.deepEqual(u.skill.rules, ['TAKE_DAMAGE', 'SEARCH'], `${id}: trigger list`);
    assert.equal(u.profile.canHitFly, false, `${id}: ground-only`);
    assert.equal(h.b.errors.length, 0);
  }
  assert.deepEqual([CHESS.chess_char_4_17_a, CHESS.chess_char_5_08_a, CHESS.chess_char_6_03_a].map((c) => c.backup.skillIndex), [1, 2, 2]);
});

test('her skills cast with an enemy she blocks before anything hurts her (the owner\'s 重装 exception) — never on an air unit she cannot reach', () => {
  for (const id of ['chess_char_4_17_a', 'chess_char_5_08_b', 'chess_char_6_03_a']) {
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: true, carryState: { sp: 999 } }], enemies: [{ key: 'enemy_fly', pos: [10, 4] }] });
    const u = h.unit(1);
    h.run(2);
    assert.equal(u.skill.activations, 0, `${id}: an air unit on her tile is no target`);
    h.spawn('enemy_dummy', { pos: [10, 4] }); // ATK 0: it never damages her
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `${id}: cast`);
    assert.equal(h.dmg.filter((d) => d.tgt === u.id).length, 0, `${id}: untouched`);
    checkInvariants(h.b);
  }
});

test('精研材料: DEF +10 %; below 50 % HP another +10 % (+20 % with PRO-X Lv3), checked every 0.1 s', () => {
  for (const [id, extra] of [['chess_char_4_17_a', 0.1], ['chess_char_5_08_b', 0.1], ['chess_char_6_03_b', 0.2]]) {
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: true }] });
    const u = h.unit(1);
    h.step();
    assert.equal(u.def.talents[0].bb['acfend_t_1[extra].def'], extra, id);
    close(u.s.def, u.base.def * 1.1, `${id}: +10 %`);
    h.b.loseHp(u, u.hp * 0.55);
    h.run(0.1 + TICK);
    close(u.s.def, u.base.def * (1.1 + extra), `${id}: below half HP`);
    h.b.heal(u, u, u.s.maxHp);
    h.run(0.1 + TICK);
    close(u.s.def, u.base.def * 1.1, `${id}: healed`);
    checkInvariants(h.b);
  }
});

test('反馈装甲: enemies she blocks ASPD −7 within 0.1 s; it ends once nobody blocks them — at her retreat too', () => {
  const h = battle({ units: [{ chessId: 'chess_char_4_17_a', row: 10, col: 4, standIn: true }], enemies: [{ key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_fly', pos: [10, 5] }] });
  const u = h.unit(1);
  h.run(0.1 + TICK);
  const [a, b, f] = h.b.enemies;
  assert.deepEqual([a.s.aspd, b.s.aspd, f.s.aspd], [93, 93, 100], 'the two blocked enemies, not the air unit');
  assert.equal(a.findBuff('acfend:feedback').source, u);
  h.b.retreat(u);
  h.run(0.1 + TICK);
  assert.deepEqual([a.s.aspd, b.s.aspd], [100, 100], 'released: gone at the next check');
  checkInvariants(h.b);
});

test('S1 结构稳定: 40 s of max HP / DEF +26 % (+40 % elite)', () => {
  for (const [id, v] of [['chess_char_4_17_a', 0.26], ['chess_char_4_17_b', 0.4]]) {
    assert.deepEqual([skillOf(id, S1).bb.max_hp, skillOf(id, S1).bb.def, skillOf(id, S1).duration], [v, v, 40]);
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: { skillIndex: 0 }, carryState: { sp: 999 } }], enemies: [{ key: 'enemy_dummy', pos: [10, 4] }] });
    const u = h.unit(1);
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
    assert.ok(h.runUntil(() => cast != null, 3));
    h.step();
    close(u.s.maxHp, u.base.maxHp * (1 + v), `${id}: max HP`);
    close(u.s.def, u.base.def * (1 + v + passiveDefPct(id, u)), `${id}: DEF`);
    h.runUntil(() => !u.skill.active, 45);
    close(h.b.time - cast, 40, `${id}: 40 s`, 0.01);
    close(u.s.maxHp, u.base.maxHp, `${id}: max HP back`);
    checkInvariants(h.b);
  }
});

test('S2 不变性原理 (星熊\'s chess): 20 s of DEF +50 % / +65 %; 反馈装甲 ×2 / ×3 on the enemies she blocks, back to −7 after', () => {
  for (const [id, v, mult] of [['chess_char_4_17_a', 0.5, 2], ['chess_char_4_17_b', 0.65, 3]]) {
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: true }], enemies: [{ key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_dummy', pos: [10, 4] }] });
    const u = h.unit(1);
    h.run(0.2);
    assert.deepEqual(h.b.enemies.map((e) => e.s.aspd), [93, 93]);
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
    assert.ok(h.runUntil(() => cast != null, 60));
    h.step();
    assert.equal(u.skill.id, S2);
    close(u.s.def, u.base.def * (1 + v + passiveDefPct(id, u)), `${id}: DEF`);
    assert.deepEqual(h.b.enemies.map((e) => e.s.aspd), [100 - 7 * mult, 100 - 7 * mult], `${id}: ×${mult} at the cast`);
    assert.ok(h.b.enemies.every((e) => !e.findBuff('acfend:feedback') && e.findBuff('acfend:feedback2')), `${id}: the plain one replaced`);
    h.runUntil(() => !u.skill.active, 25);
    close(h.b.time - cast, 20, `${id}: 20 s`, 0.01);
    h.run(0.1 + TICK);
    assert.deepEqual(h.b.enemies.map((e) => e.s.aspd), [93, 93], `${id}: plain again`);
    checkInvariants(h.b);
  }
});

test('S3 应力倒置 (号角 / 余\'s chess): 30 s of DEF +50 % / +70 %, block +1, ATK × 40 % / 55 % arts to each enemy she blocks every second', () => {
  for (const [id, v, scale] of [['chess_char_5_08_a', 0.5, 0.4], ['chess_char_6_03_b', 0.7, 0.55]]) {
    const h = battle({
      units: [{ chessId: id, row: 10, col: 4, standIn: true, carryState: { sp: 999 } }],
      enemies: [{ key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_res', pos: [10, 4] }, { key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_dummy', pos: [10, 4] }, { key: 'enemy_dummy', pos: [10, 4] }],
    });
    const u = h.unit(1);
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
    h.step();
    assert.equal(u.blocking.length, 3, 'blocks 3');
    assert.ok(h.runUntil(() => cast != null, 3));
    h.run(0.5);
    assert.equal(u.s.blockCnt, 4);
    assert.equal(u.blocking.length, 4, `${id}: blocks a 4th`);
    close(u.s.def, u.base.def * (1 + v + passiveDefPct(id, u)), `${id}: DEF`);
    h.runUntil(() => !u.skill.active, 35);
    close(h.b.time - cast, 30, `${id}: 30 s`, 0.01);
    const pulses = h.dmg.filter((d) => d.src === u.id && d.tags.includes('stress'));
    const times = [...new Set(pulses.map((d) => Math.round((d.t - cast) * 1000) / 1000))];
    assert.equal(times.length, 30, `${id}: 30 pulses`);
    times.forEach((t, i) => assert.ok(Math.abs(t - (i + 1)) <= TICK + 1e-6, `${id}: pulse ${i + 1} at ${t}`));
    assert.ok(pulses.every((d) => d.type === 'arts' && d.skill));
    const first = pulses.filter((d) => d.t === pulses[0].t);
    assert.equal(first.length, 4, `${id}: each blocked enemy`);
    for (const d of first) close(d.amount, u.s.atk * scale * (d.key === 'enemy_res' ? 0.8 : 1), `${id}: ${d.key}`);
    h.run(0.2);
    assert.equal(u.s.blockCnt, 3);
    checkInvariants(h.b);
  }
});

test('module PRO-X (5 号角 / 6 余 elites): DEF +20 % exactly while she blocks; none without it', () => {
  for (const id of ['chess_char_4_17_b', 'chess_char_5_08_a', 'chess_char_5_08_b', 'chess_char_6_03_b']) {
    const mod = moduleOf(id);
    const h = battle({ units: [{ chessId: id, row: 10, col: 4, standIn: true }] });
    const u = h.unit(1);
    h.step();
    close(u.s.def, u.base.def * 1.1, `${id}: not blocking`);
    h.spawn('enemy_dummy', { pos: [10, 4] });
    h.run(0.2);
    assert.equal(u.blocking.length, 1);
    close(u.s.def, u.base.def * (1.1 + (mod ? 0.2 : 0)), `${id}: blocking`);
    assert.equal(!!mod, id === 'chess_char_5_08_b' || id === 'chess_char_6_03_b', id);
    checkInvariants(h.b);
  }
});
