// test/content/standin_acnipe.test.js — the 补位 stand-in Stormeye (char_611_acnipe, kits/ops/standin-acnipe.js) on every
// chess it replaces (空弦 T3 S3, 莫斯提马 T4 S2, 百炼嘉维尔 / 妮芙 T5 S3 + MAR-X, 蕾缪安 / 异客 T6 S3 + MAR-X), normal and elite:
// every skill (S1 破空, S2 心手合一, S3 旋臂 with its extra hit), both talents (风坠 on every damage instance, 风雨欲来), the
// module (MAR-X ×1.1 on air units, stats, 风坠 190 % at level 3), the data triggers, anti-air and the 'fly' priority.
// Run: node --test test/content/standin_acnipe.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { unitForm } from '../../shared/standIn.js';
import { canTargetAlly } from '../../server/sim/targeting.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const STORM = 'char_611_acnipe';
const [S1, S2, S3] = ['skchr_acnipe_1', 'skchr_acnipe_2', 'skchr_acnipe_3'];
const EXTRA = 'acnipe:extra';
const RECORDS = BACKUPS.units[STORM].standsIn.flatMap((a) => [a, a.replace(/_a$/, '_b')]);
const DUMMIES = {
  d: enemyRec({ key: 'd', hp: 1e7, speed: 0 }),
  dd: enemyRec({ key: 'dd', hp: 1e7, def: 300, speed: 0 }),
  f: enemyRec({ key: 'f', hp: 1e7, speed: 0, motion: 'FLY' }),
};
const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const formOf = (id) => unitForm(BACKUPS, STORM, CHESS[id].status);
const skillOf = (id, sid) => formOf(id).skills.find((s) => s.skillId === sid);
/** The module the elite record fields (null without one). */
const moduleOf = (id) => {
  const c = CHESS[id];
  return c.status.equipLevel > 0 && c.backup.uniEquipId ? formOf(id).modules.find((m) => m.uniEquipId === c.backup.uniEquipId) : null;
};

/** Stormeye at (10,4) facing right (range 3-3: rows 9–11, cols 4–7); dummies at `enemies`. */
function arena(chessId, { standIn = true, enemies = [], sp = 999, seed = 3, timeLimit = 200 } = {}) {
  return makeBattle({
    defs: { enemies: DUMMIES }, seed, timeLimit, autoFinish: false,
    units: [{ chessId, row: 10, col: 4, dir: 'RIGHT', standIn, ...(sp != null ? { carryState: { sp } } : {}) }],
    enemies, hooks: ['skillStart', 'skillEnd', 'damaged', 'attack'], captureNoisy: true,
  });
}
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };
/** Damage instances Stormeye dealt (captured `damaged` ctx), optionally from `t0` on. */
const hits = (h, u, t0 = -1) => h.hooksOf('damaged').filter((c) => c.source === u && c.t >= t0);

test('Stormeye on every chess it replaces: the stand-in body, its kit (never generic), the chess backup skill, the module on the T5 / T6 elites only; anti-air, fly first, ground-targetable', () => {
  assert.equal(RECORDS.length, 12);
  for (const id of RECORDS) {
    const c = CHESS[id];
    const form = formOf(id), mod = moduleOf(id);
    const sk = form.skills.find((s) => s.index === c.backup.skillIndex);
    const h = arena(id, { sp: null });
    h.step();
    const u = h.unit(1);
    const where = `${id} ${c.name}`;
    assert.deepEqual([u.def.charId, u.def.standInFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [STORM, c.charId, sk.skillId, false, 'skills'], where);
    assert.equal(u.skill.kind, sk.skillId === S2 ? 'toggle' : 'duration', where);
    assert.equal(!!u.def.raw.module?.active, !!mod, `${where}: module only on the T5 / T6 elite`);
    if (mod) assert.equal(u.def.raw.module.level, c.tier === 6 ? 3 : 1, where);
    assert.equal(u.base.atk, form.stats.atk + (mod ? mod.attr.atk : 0), `${where}: ATK`);
    assert.equal(u.base.maxHp, form.stats.maxHp + (mod ? mod.attr.maxHp : 0), `${where}: HP`);
    assert.deepEqual([u.profile.canHitFly, u.profile.priority, u.profile.dmgType, u.profile.flyScale], [true, 'fly', 'phys', mod ? 1.1 : 1], `${where}: profile`);
    const t0 = u.def.raw.talents.find((t) => t.index === 0);
    assert.equal(t0.bb.atk_scale, mod && mod.level === 3 ? 1.9 : 1.8, `${where}: 风坠`);
    // ground-targetable: an enemy ranged attack may select her (no 起飞 / 迷彩 / 隐匿)
    assert.ok(canTargetAlly({ blockedBy: null }, u, true), `${where}: an enemy may target her`);
    done(h);
  }
});

test('Stormeye triggers: the data rules — S1 / S3 MANUAL SEARCH (official SNIPER row [ATTACK_RANGE_ENEMY, SKILL_RANGE_ENEMY], no range change), S2 AUTO DEFAULT (an attack buff waits for her next attack, endless)', () => {
  for (const id of ['chess_char_3_21_a', 'chess_char_3_21_b']) {
    for (const [i, sid] of [[0, S1], [1, S2], [2, S3]]) {
      const h = arena(id, { standIn: { skillIndex: i }, sp: null });
      h.step();
      const u = h.unit(1);
      const rule = sid === S2 ? 'DEFAULT' : 'SEARCH';
      assert.deepEqual([u.skill.id, u.skill.rules, u.def.skill.trigger.rule, u.def.skill.skillType], [sid, [rule], rule, sid === S2 ? 'AUTO' : 'MANUAL'], `${id} ${sid}`);
      done(h);
    }
  }
});

test('S1 破空: ATK +15 %, ASPD +30 / +50, 100 DEF ignored on her hits, for 20 s; then all of it ends', () => {
  for (const id of ['chess_char_3_21_a', 'chess_char_3_21_b']) {
    const sk = skillOf(id, S1);
    const h = arena(id, { standIn: { skillIndex: 0 }, enemies: [{ key: 'dd', pos: [10, 6] }] });
    const u = h.unit(1);
    h.b.rng.chance = () => false; // no 风坠
    assert.ok(h.runUntil(() => u.skill.active, 3), `${id}: cast`);
    const start = h.b.time, base = u.base.atk;
    close(u.s.atk, base * (1 + sk.bb.atk), `${id}: ATK`);
    assert.equal(u.s.aspd, 100 + sk.bb.attack_speed, `${id}: ASPD`);
    assert.equal(u.s.defIgnoreFlat, 100, `${id}: DEF ignored`);
    assert.ok(h.runUntil(() => hits(h, u, start).length > 0, 3));
    close(hits(h, u, start)[0].amount, base * (1 + sk.bb.atk) - (300 - 100), `${id}: a hit on DEF 300`, 1e-3);
    assert.ok(h.runUntil(() => !u.skill.active, 30));
    close(h.b.time - start, sk.duration, `${id}: ${sk.duration} s`, 0.05);
    assert.deepEqual([u.s.atk, u.s.aspd, u.s.defIgnoreFlat], [base, 100, 0], `${id}: back`);
    done(h);
  }
});

test('S2 心手合一 (自动触发): no enemy, no cast; with one it casts at her attack — ATK +5 %, one extra target per attack, endless and no SP meanwhile; a knock-out ends it', () => {
  for (const id of ['chess_char_4_02_a', 'chess_char_4_02_b']) {
    const sk = skillOf(id, S2);
    const h = arena(id, { timeLimit: 400, enemies: [{ key: 'd', pos: [10, 6], time: 5 }, { key: 'd', pos: [9, 6], time: 5 }] });
    const u = h.unit(1);
    h.run(4.9);
    assert.equal(u.skill.activations, 0, `${id}: full SP, nobody to attack — no cast`);
    assert.ok(h.runUntil(() => u.skill.active, 3), `${id}: cast`);
    assert.equal(h.hooksOf('skillStart')[0].reason, 'DEFAULT');
    const base = u.base.atk;
    close(u.s.atk, base * (1 + sk.bb.atk), `${id}: ATK`);
    h.run(10);
    const atks = h.hooksOf('attack').filter((c) => c.attacker === u);
    assert.ok(atks.length >= 9 && atks.every((c) => c.targets.length === sk.bb['attack@max_target']), `${id}: ${sk.bb['attack@max_target']} targets per attack`);
    h.run(120);
    assert.ok(u.skill.active && u.skill.kind === 'toggle', `${id}: still on after 130 s`);
    assert.equal(u.skill.sp, 0, `${id}: no SP while it runs`);
    h.b.kill(u);
    assert.ok(h.runUntil(() => u.alive && u.deployed, 120), 'redeployed');
    h.step();
    assert.equal(u.skill.active, false, `${id}: off after the knock-out`);
    close(u.skill.sp, sk.initSp, `${id}: SP back to its initial ${sk.initSp}`, 0.1);
    done(h);
  }
});

test('S3 旋臂: 3 targets, a double hit on each, 风坠 at 30 / 35 % (25 % before), one extra 100 % hit per attack on a target at ≥ 90 % HP — none below; 30 s', () => {
  for (const id of ['chess_char_3_21_a', 'chess_char_6_01_b']) {
    const sk = skillOf(id, S3);
    const h = arena(id, { sp: null, enemies: [[10, 5], [10, 6], [9, 6], [11, 6]].map((pos) => ({ key: 'd', pos })) });
    const u = h.unit(1);
    const probs = [];
    h.b.rng.chance = (p) => { probs.push([h.b.time, p, !!(u.skill.active)]); return false; };
    // before the cast: one target, 风坠 at the talent's 25 %
    assert.ok(h.runUntil(() => hits(h, u).length >= 2, 5));
    assert.ok(probs.length >= 2 && probs.every(([, p, on]) => !on && p === 0.25), `${id}: 25 % outside S3`);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `${id}: S3 cast`);
    const start = h.b.time;
    h.run(6);
    const during = probs.filter(([t]) => t > start + 0.5);
    assert.ok(during.length > 10 && during.every(([, p]) => p === sk.bb['talent@prob']), `${id}: 风坠 at ${sk.bb['talent@prob']}`);
    // per attack: 3 targets × (2 attack hits + 1 extra at 100 % ATK, never rolled)
    const atk = u.s.atk;
    const byAttack = new Map();
    for (const c of hits(h, u, start + 0.5)) {
      const k = c.dmg.attackId || `x${c.t}`;
      if (!byAttack.has(k)) byAttack.set(k, []);
      byAttack.get(k).push(c);
    }
    const attacks = h.hooksOf('attack').filter((c) => c.attacker === u && c.t > start + 0.5 && c.t < h.b.time - 1);
    assert.ok(attacks.length >= 3 && attacks.every((c) => c.targets.length === 3), `${id}: 3 targets`);
    const normal = hits(h, u, start + 0.5).filter((c) => c.dmg.isAttack);
    const extra = hits(h, u, start + 0.5).filter((c) => (c.dmg.tags || []).includes(EXTRA));
    assert.ok(normal.every((c) => Math.abs(c.amount - atk) < 1e-6), `${id}: every attack hit = ATK (no 风坠)`);
    assert.ok(extra.length > 0 && extra.every((c) => Math.abs(c.amount - atk * sk.bb['attack@atk_scale_extra']) < 1e-6 && !c.dmg.isAttack && c.type === 'phys'), `${id}: the extra hit: ATK × atk_scale_extra, physical, not an attack`);
    // every target of an attack: exactly 2 attack hits and 1 extra
    const perTarget = new Map();
    for (const c of normal.concat(extra)) {
      const k = `${c.target.id}`;
      perTarget.set(k, perTarget.get(k) ?? { n: 0, x: 0 });
      perTarget.get(k)[(c.dmg.tags || []).includes(EXTRA) ? 'x' : 'n']++;
    }
    for (const [k, v] of perTarget) assert.equal(v.n, 2 * v.x, `${id}: target ${k} — 2 hits per extra (${v.n} / ${v.x})`);
    // a target below 90 %: no extra
    const low = h.b.enemies.find((e) => perTarget.has(`${e.id}`));
    low.hp = low.s.maxHp * 0.85;
    const t1 = h.b.time;
    h.run(3);
    assert.ok(hits(h, u, t1).some((c) => c.target === low && c.dmg.isAttack), 'the low target is still attacked');
    assert.equal(hits(h, u, t1).filter((c) => c.target === low && (c.dmg.tags || []).includes(EXTRA)).length, 0, `${id}: no extra below 90 %`);
    // 风坠 on: the attack hits ×1.8 / 1.9, the extra stays at 100 %
    h.b.rng.chance = () => true;
    const t2 = h.b.time;
    h.run(2);
    const scale = u.def.raw.talents.find((t) => t.index === 0).bb.atk_scale;
    const crit = hits(h, u, t2);
    assert.ok(crit.filter((c) => c.dmg.isAttack).every((c) => Math.abs(c.amount - u.s.atk * scale) < 1e-6), `${id}: 风坠 ×${scale}`);
    assert.ok(crit.filter((c) => (c.dmg.tags || []).includes(EXTRA)).every((c) => Math.abs(c.amount - u.s.atk) < 1e-6), `${id}: never on the extra`);
    assert.ok(h.runUntil(() => !u.skill.active, 40));
    close(h.b.time - start, sk.duration, `${id}: ${sk.duration} s`, 0.05);
    done(h);
  }
});

test('风坠: an attack hit at ATK × 1.8 (T6 elite, MAR-X level 3: × 1.9) before DEF, on 25 % of the hits', () => {
  for (const id of ['chess_char_3_21_a', 'chess_char_6_05_b']) {
    const h = arena(id, { sp: null, enemies: [{ key: 'dd', pos: [10, 6] }] });
    const u = h.unit(1);
    h.b.rng.chance = () => true;
    assert.ok(h.runUntil(() => hits(h, u).length > 0, 5));
    const scale = id.endsWith('_b') ? 1.9 : 1.8;
    close(hits(h, u)[0].amount, u.s.atk * scale - 300, `${id}: ATK × ${scale} − DEF`, 1e-3);
    done(h);
  }
  // the real roll: about a quarter of 200 hits (seeded)
  const h = arena('chess_char_3_21_a', { sp: null, seed: 11, enemies: [{ key: 'd', pos: [10, 6] }], timeLimit: 400 });
  const u = h.unit(1);
  h.run(42);   // S3 is cast at 44 s
  const all = hits(h, u).filter((c) => c.dmg.isAttack);
  const crits = all.filter((c) => c.amount > u.s.atk * 1.5);
  assert.ok(all.length >= 40, `${all.length} hits`);
  assert.ok(crits.length / all.length > 0.1 && crits.length / all.length < 0.45, `${crits.length} of ${all.length} hits ×1.8`);
  done(h);
});

test('MAR-X (T5 / T6 elite): attacks on air units at ATK × 1.1; the normal form has no bonus; fly targets first', () => {
  for (const [id, mul] of [['chess_char_5_18_b', 1.1], ['chess_char_6_01_b', 1.1], ['chess_char_5_18_a', 1]]) {
    const h = arena(id, { sp: null, enemies: [{ key: 'd', pos: [10, 5] }, { key: 'f', pos: [10, 7], route: 2 }] });
    const u = h.unit(1);
    h.b.rng.chance = () => false;
    assert.ok(h.runUntil(() => hits(h, u).length >= 3, 6));
    const first = hits(h, u);
    assert.ok(first.slice(0, 3).every((c) => c.target.isFlying), `${id}: the flyer first, though the ground dummy is nearer`);
    close(first[0].amount, u.s.atk * mul, `${id}: ×${mul} on the flyer`);
    done(h);
  }
});

test('风雨欲来: +0.2 SP/s once she has not attacked for 2 s (her deployment counts); attacking every second, none', () => {
  const sk = skillOf('chess_char_3_21_a', S3);
  const idle = arena('chess_char_3_21_a', { sp: null });
  const u = idle.unit(1);
  idle.step();
  const t0 = idle.b.time, sp0 = u.skill.sp;
  idle.run(12);
  const dt = idle.b.time - t0;
  close(u.skill.sp - sp0, dt + 0.2 * (dt - 2), 'idle: +1/s, +0.2/s after 2 s', 0.08);
  done(idle);
  const busy = arena('chess_char_3_21_a', { sp: null, enemies: [{ key: 'd', pos: [10, 6] }] });
  const v = busy.unit(1);
  busy.step();
  const b0 = busy.b.time, bs0 = v.skill.sp;
  busy.run(12);
  close(v.skill.sp - bs0, busy.b.time - b0, 'attacking: +1/s only', 0.08);
  assert.ok(v.skill.sp < sk.spCost);
  done(busy);
});
