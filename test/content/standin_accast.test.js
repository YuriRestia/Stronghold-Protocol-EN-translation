// test/content/standin_accast.test.js — the 补位 stand-in Pith (char_612_accast, kits/ops/standin-accast.js) on every chess
// it replaces (烛煌 T5, 焰影苇草 / 迷迭香 / 荒芜拉普兰德 T6, all S3 + SPC-X), normal and elite: every skill (S1 "书我所书", S2
// "为我所为", S3 "驭我所驭" with its burst), both talents (12 RES ignored; ATK +10 % on herself and the 【术师】 of the 4 tiles
// next to her), the module (SPC-X range, stats, T2 +20 % at level 3), the splash radius per skill, the data triggers,
// anti-air.
// Run: node --test test/content/standin_accast.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { unitForm } from '../../shared/standIn.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';
import { COLS } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const PITH = 'char_612_accast';
const [S1, S2, S3] = ['skchr_accast_1', 'skchr_accast_2', 'skchr_accast_3'];
const RECORDS = BACKUPS.units[PITH].standsIn.flatMap((a) => [a, a.replace(/_a$/, '_b')]);
const DUMMIES = {
  d: enemyRec({ key: 'd', hp: 1e7, speed: 0 }),
  r: enemyRec({ key: 'r', hp: 1e7, res: 50, speed: 0 }),
  f: enemyRec({ key: 'f', hp: 1e7, speed: 0, motion: 'FLY' }),
};
const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const formOf = (id) => unitForm(BACKUPS, PITH, CHESS[id].status);
const skillOf = (id, sid) => formOf(id).skills.find((s) => s.skillId === sid);
const moduleOf = (id) => {
  const c = CHESS[id];
  return c.status.equipLevel > 0 && c.backup.uniEquipId ? formOf(id).modules.find((m) => m.uniEquipId === c.backup.uniEquipId) : null;
};
const key = (r, c) => r * COLS + c;

/** Pith at (10,4) facing right (3-6: rows 9–11, cols 4–6; SPC-X adds (10,7)); dummies at `enemies`; extra `units`. */
function arena(chessId, { standIn = true, enemies = [], units = [], sp = 999, seed = 5, timeLimit = 200 } = {}) {
  return makeBattle({
    defs: { enemies: DUMMIES }, seed, timeLimit, autoFinish: false,
    units: [{ chessId, row: 10, col: 4, dir: 'RIGHT', standIn, ...(sp != null ? { carryState: { sp } } : {}) }, ...units],
    enemies, hooks: ['skillStart', 'skillEnd', 'damaged', 'attack'], captureNoisy: true,
  });
}
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };
const hits = (h, u, t0 = -1) => h.hooksOf('damaged').filter((c) => c.source === u && c.t >= t0);

test('Pith on every chess it replaces: the stand-in body, its kit, S3; SPC-X on the elites (level 1 at T5, 3 at T6) with its range; arts splash 1.1, anti-air', () => {
  assert.equal(RECORDS.length, 8);
  for (const id of RECORDS) {
    const c = CHESS[id];
    const form = formOf(id), mod = moduleOf(id);
    const h = arena(id, { sp: null });
    h.step();
    const u = h.unit(1);
    const where = `${id} ${c.name}`;
    assert.deepEqual([u.def.charId, u.def.standInFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [PITH, c.charId, S3, false, 'skills'], where);
    assert.equal(!!u.def.raw.module?.active, !!mod, `${where}: module only on the elite`);
    assert.equal(!!mod, id.endsWith('_b'), where);
    if (mod) assert.equal(u.def.raw.module.level, c.tier === 6 ? 3 : 1, where);
    assert.equal(u.base.atk, form.stats.atk + (mod ? mod.attr.atk : 0), `${where}: ATK`);
    assert.equal(u.base.maxHp, form.stats.maxHp + (mod ? mod.attr.maxHp : 0), `${where}: HP`);
    assert.deepEqual([u.profile.dmgType, u.profile.splashRadius, u.profile.canHitFly], ['arts', 1.1, true], `${where}: profile`);
    // the range: 3-6 (9 tiles), SPC-X its 3-1 grid (+ the tile [0,3])
    const want = absoluteRangeKeys(mod ? mod.talentChanges.find((t) => t.talentIndex === -1).rangeGrid : form.rangeGrid, 10, 4, 'RIGHT', 0);
    assert.deepEqual([...u.rangeKeys].sort((a, b) => a - b), [...want].sort((a, b) => a - b), `${where}: range`);
    assert.equal(u.rangeKeySet.has(key(10, 7)), !!mod, `${where}: (10,7) only with SPC-X`);
    const t1 = u.def.raw.talents.find((t) => t.index === 1);
    assert.equal(t1.bb.atk, mod && mod.level === 3 ? 0.2 : 0.1, `${where}: 授我所授`);
    done(h);
  }
});

test('Pith triggers: the data rules — S1 AUTO DEFAULT (an attack buff waits for her attack), S2 / S3 MANUAL SEARCH (official 术师 row ATTACK_RANGE_ENEMY + SKILL_RANGE_ENEMY; no rangeGrid of their own, so one rule)', () => {
  for (const id of ['chess_char_5_03_a', 'chess_char_5_03_b']) {
    for (const [i, sid] of [[0, S1], [1, S2], [2, S3]]) {
      const h = arena(id, { standIn: { skillIndex: i }, sp: null });
      h.step();
      const u = h.unit(1);
      assert.deepEqual([u.skill.id, u.skill.rules, u.def.skill.skillType], [sid, sid === S1 ? ['DEFAULT'] : ['SEARCH'], sid === S1 ? 'AUTO' : 'MANUAL'], `${id} ${sid}`);
      if (sid !== S1) assert.deepEqual(skillOf(id, sid).trigger.official, ['ATTACK_RANGE_ENEMY', 'SKILL_RANGE_ENEMY'], `${id} ${sid}: the official row`);
      done(h);
    }
  }
});

test('"见我所见": her arts hits ignore 12 RES (flat 法术穿透)', () => {
  for (const id of ['chess_char_5_03_a', 'chess_char_6_12_b']) {
    const h = arena(id, { sp: null, enemies: [{ key: 'r', pos: [10, 6] }] });
    const u = h.unit(1);
    assert.equal(u.s.resIgnoreFlat, 12);
    h.run(1);
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => hits(h, u, t0).length > 0, 5));
    close(hits(h, u, t0)[0].amount, u.s.atk * (1 - (50 - 12) / 100), `${id}: RES 50 − 12`, 1e-3);
    done(h);
  }
});

test('"授我所授": ATK +10 % (T6 elite: +20 %) on herself and the 【术师】 operators of the 4 tiles next to her — not diagonal, not farther, not another class', () => {
  for (const [id, v] of [['chess_char_5_03_a', 0.1], ['chess_char_5_03_b', 0.1], ['chess_char_6_08_b', 0.2]]) {
    const h = arena(id, { sp: null, units: [
      { chessId: 'chess_char_1_03_a', row: 10, col: 3 },   // 惊蛰 (CASTER), behind her: adjacent
      { chessId: 'chess_char_1_14_a', row: 9, col: 3 },    // 格雷伊 (CASTER), diagonal
      { chessId: 'chess_char_1_17_a', row: 12, col: 4 },   // 深靛 (CASTER), two tiles away
      { chessId: 'chess_char_1_02_a', row: 11, col: 4 },   // 角峰 (TANK), adjacent
    ] });
    h.run(1);
    const [p, adj, diag, far, tank] = [1, 2, 3, 4, 5].map((uid) => h.unit(uid));
    const buff = (x) => x.findBuff('talent:accast')?.mods?.atkPct ?? 0;
    assert.deepEqual([buff(p), buff(adj), buff(diag), buff(far), buff(tank)], [v, v, 0, 0, 0], id);
    close(p.s.atk, p.base.atk * (1 + v), `${id}: her ATK`);
    done(h);
  }
});

test('S1 "书我所书" (自动触发): no enemy, no cast; at her attack: ASPD +30 / +40 and the splash radius 1.5 for 25 s (1.1 before and after)', () => {
  for (const id of ['chess_char_5_03_a', 'chess_char_5_03_b']) {
    const sk = skillOf(id, S1);
    // (10,6) is a target; (11,7) is 1.41 tiles from it and out of her range: splash only, within 1.5 but not 1.1
    const h = arena(id, { standIn: { skillIndex: 0 }, enemies: [{ key: 'd', pos: [10, 6], time: 3 }, { key: 'd', pos: [11, 7], time: 3 }] });
    const u = h.unit(1);
    h.run(2.9);
    assert.equal(u.skill.activations, 0, `${id}: nobody to attack — no cast`);
    assert.ok(h.runUntil(() => u.skill.active, 3), `${id}: cast`);
    const start = h.b.time;
    assert.equal(u.s.aspd, 100 + sk.bb.attack_speed, `${id}: ASPD`);
    const side = h.b.enemies.find((e) => Math.round(e.y) === 11);
    h.run(5);
    assert.ok(hits(h, u, start).some((c) => c.target === side && c.dmg.isSplash), `${id}: the 1.41-tile neighbour takes the splash`);
    assert.ok(h.runUntil(() => !u.skill.active, 30));
    close(h.b.time - start, sk.duration, `${id}: ${sk.duration} s`, 0.05);
    assert.equal(u.s.aspd, 100);
    const t1 = h.b.time + 1.5;  // the last S1 bolts land
    h.run(6);
    assert.equal(hits(h, u, t1).filter((c) => c.target === side).length, 0, `${id}: splash 1.1 again`);
    assert.ok(hits(h, u, t1).length > 0);
    done(h);
  }
});

test('S2 "为我所为": her ASPD +35 / +50 and every 【术师】 operator ATK +30 / +35 % (herself included, wherever they stand; no other class) for 35 s', () => {
  for (const id of ['chess_char_5_03_a', 'chess_char_5_03_b']) {
    const sk = skillOf(id, S2);
    const h = arena(id, { standIn: { skillIndex: 1 }, enemies: [{ key: 'd', pos: [10, 6] }], units: [
      { chessId: 'chess_char_1_03_a', row: 12, col: 9 },   // 惊蛰 (CASTER), far away
      { chessId: 'chess_char_1_02_a', row: 9, col: 2 },    // 角峰 (TANK)
    ] });
    const [u, caster, tank] = [1, 2, 3].map((uid) => h.unit(uid));
    assert.ok(h.runUntil(() => u.skill.active, 3), `${id}: cast`);
    const start = h.b.time;
    assert.equal(u.s.aspd, 100 + sk.bb.attack_speed, `${id}: ASPD`);
    h.run(0.5);
    const buff = (x) => x.findBuff('accast:s2')?.mods?.atkPct ?? 0;
    assert.deepEqual([buff(u), buff(caster), buff(tank)], [sk.bb.atk, sk.bb.atk, 0], id);
    close(u.s.atk, u.base.atk * (1 + 0.1 + sk.bb.atk), `${id}: her ATK (T2 + S2)`);
    h.run(30);
    assert.equal(buff(caster), sk.bb.atk, `${id}: kept up while it runs`);
    assert.ok(h.runUntil(() => !u.skill.active, 10));
    close(h.b.time - start, sk.duration, `${id}: ${sk.duration} s`, 0.05);
    h.run(0.5);
    assert.deepEqual([buff(u), buff(caster)], [0, 0], `${id}: gone after it`);
    done(h);
  }
});

test('S3 "驭我所驭": one 100 / 140 % arts hit on every enemy of her range at the cast (SPC-X range included), then 2 targets, ASPD +40 / +55, splash 1.2, 35 s', () => {
  for (const id of ['chess_char_5_03_a', 'chess_char_6_08_b']) {
    const sk = skillOf(id, S3), elite = id.endsWith('_b');
    const h = arena(id, { sp: null, enemies: [[10, 5], [9, 6], [11, 6], [10, 7], [9, 8]].map((pos) => ({ key: 'd', pos })) });
    const u = h.unit(1);
    h.run(1);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `${id}: cast`);
    const start = h.hooksOf('skillStart').find((c) => c.unit === u).t, atk = u.s.atk;
    const burst = hits(h, u, start).filter((c) => (c.dmg.tags || []).includes('accast:aoe'));
    const at = (c) => `${Math.round(c.target.y)},${Math.round(c.target.x)}`;
    const want = ['10,5', '9,6', '11,6', ...(elite ? ['10,7'] : [])].sort();
    assert.deepEqual(burst.map(at).sort(), want, `${id}: every enemy of her range once — (9,8) is out of it`);
    assert.ok(burst.every((c) => Math.abs(c.amount - atk * sk.bb.atk_scale_aoe) < 1e-6 && c.type === 'arts' && c.dmg.isSkill && !c.dmg.isAttack), `${id}: ATK × ${sk.bb.atk_scale_aoe} arts, a skill hit`);
    assert.equal(u.s.aspd, 100 + sk.bb.attack_speed, `${id}: ASPD`);
    h.run(8);
    const atks = h.hooksOf('attack').filter((c) => c.attacker === u && c.t >= start);
    assert.ok(atks.length >= 3 && atks.every((c) => c.targets.length === 2), `${id}: 2 targets per attack (the cast's own attack too)`);
    assert.equal(h.hooksOf('skillStart').filter((c) => c.unit === u).length, 1, 'one burst per cast');
    assert.ok(h.runUntil(() => !u.skill.active, 40));
    close(h.b.time - start, sk.duration, `${id}: ${sk.duration} s`, 0.05);
    done(h);
  }
  // the splash radius 1.2: a neighbour 1.15 tiles from her only target, out of her range, is splashed during S3 only
  const h = arena('chess_char_5_03_a', { sp: null, enemies: [{ key: 'd', pos: [10, 6] }, { key: 'd', pos: [10, 7.15] }] });
  const u = h.unit(1);
  h.run(3);
  const side = h.b.enemies.find((e) => e.x > 7);
  assert.ok(side && hits(h, u).length > 0);
  assert.equal(hits(h, u).filter((c) => c.target === side).length, 0, 'splash 1.1: not reached');
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  const t0 = h.b.time + 0.01;
  h.run(4);
  assert.ok(hits(h, u, t0).some((c) => c.target === side && c.dmg.isSplash), 'splash 1.2: reached');
  done(h);
});

test('Pith hits air units too: a flyer in range is her target', () => {
  const h = arena('chess_char_6_12_a', { sp: null, enemies: [{ key: 'f', pos: [10, 6], route: 2 }] });
  const u = h.unit(1);
  assert.ok(h.runUntil(() => hits(h, u).length > 0, 5));
  assert.ok(hits(h, u)[0].target.isFlying);
  done(h);
});
