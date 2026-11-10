// test/sim/feedback5-active-range.test.js — the ACTIVE_RANGE rule of the engine (the owner's rule of 2026-10-05): a MANUAL
// skill whose attack range while it runs strictly contains the operator's own range casts as soon as an enemy (a heal
// skill: an injured ally) is inside that larger range — trigger ACTIVE_RANGE, customRangeGrid = the running range, checked
// every tick by server/sim/skills.js. Community report: 「有的干员开技能后的攻击范围比平时攻击范围大，但是怪走到平时的攻击范围内才会开技能」.
// Since the official skill triggers (the live client trigger lists) the default data no longer resolves this rule for
// every such skill: the official SKILL_RANGE_ENEMY rule (SKILL_RANGE on the rangeGrid of the skill, any living enemy on it)
// covers 莫斯提马 S3, 白面鸮 S2, 安洁莉娜 S3 and the like. ACTIVE_RANGE is kept as a deviation appended to the list of
// 7 skills (空弦 S3, 异客 S2, 赫拉格 S3, 嵯峨 S3, 帕拉斯 S2, 赫德雷 S3, 涤火杰西卡 S3; `trigger.deviation`). The first
// three tests use synthetic records (the engine rule); the real-data ones read the official lists and the kept deviation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';
import { COLS } from '../../server/sim/constants.js';

const ds = getDefaultSource();
const BASE = [[0, 0], [0, 1]];                                   // 1-1
const WIDE = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [-1, 1]];  // strictly contains 1-1
const op = (o = {}) => chessRec({
  id: 't_op', rangeGrid: BASE, ...o,
  skill: { spCost: 1, initSp: 1, duration: 5, trigger: { rule: 'ACTIVE_RANGE', rawRule: 'DEFAULT', customRangeGrid: WIDE }, ...(o.skill || {}) },
});
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 0, ...o });
const arena = (o = {}) => makeBattle({
  defs: { chess: { t_op: op(o.chess), t_ally: chessRec({ id: 't_ally', skill: null, stats: { maxHp: 1e4 } }) }, enemies: { e: dummy('e'), f: dummy('f', { motion: 'FLY' }) } },
  units: [{ chessId: 't_op', row: 10, col: 4, dir: 'RIGHT' }, ...(o.units || [])], enemies: o.enemies || [],
  hooks: ['skillStart', 'attack'], captureNoisy: true, autoFinish: false, timeLimit: 30, seed: 3, content: 'generic',
});
const casts = (h, u) => h.hooksOf('skillStart').filter((c) => c.unit === u);
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };

test('ACTIVE_RANGE: an enemy inside the running range only casts the skill at once (no attack); nobody, or an enemy outside it, does not', () => {
  // (10,7) = [0,3]: the running range only — out of reach of the 1-1 attack
  const h = arena({ enemies: [{ key: 'e', pos: [10, 7] }] });
  const u = h.unit('t_op');
  assert.equal(u.skill.rule, 'ACTIVE_RANGE');
  assert.ok(h.runUntil(() => casts(h, u).length > 0, 2), 'cast');
  assert.equal(casts(h, u)[0].reason, 'ACTIVE_RANGE');
  assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u).length, 0, 'before any attack (DEFAULT would wait for one)');
  done(h);
  const none = arena();
  none.run(5);
  assert.equal(casts(none, none.unit('t_op')).length, 0, 'no enemy: no cast');
  done(none);
  const far = arena({ enemies: [{ key: 'e', pos: [10, 8] }] });   // [0,4]: outside the running range too
  far.run(5);
  assert.equal(casts(far, far.unit('t_op')).length, 0, 'an enemy outside the running range: no cast');
  done(far);
});

test('ACTIVE_RANGE: the DEFAULT condition on the larger range — no flyer for a ground-only unit; the permanent 攻击距离 grows it', () => {
  const fly = arena({ enemies: [{ key: 'f', pos: [10, 7], route: 2 }] });
  fly.run(5);
  assert.equal(casts(fly, fly.unit('t_op')).length, 0, 'a melee unit cannot target the flyer: no cast');
  done(fly);
  // [0,4] is in the running range grown by a permanent rangeExtend +1 (modules / talents "攻击距离+1": baseRangeExtend)
  const ext = arena({ enemies: [{ key: 'e', pos: [10, 8] }] });
  const u = ext.unit('t_op');
  ext.step();
  ext.b.addBuff(u, { key: 'test:range', mods: { rangeExtend: 1 }, persist: true });
  assert.ok(ext.runUntil(() => casts(ext, u).length > 0, 2), 'cast on the grown range');
  done(ext);
});

test('ACTIVE_RANGE heal skill: an injured ally inside the running range only casts it; a healthy one does not', () => {
  const medic = { profession: 'MEDIC', subProfessionId: 'physician', rangeGrid: BASE, skill: { trigger: { rule: 'ACTIVE_RANGE', rawRule: 'DEFAULT', customRangeGrid: WIDE } } };
  const h = arena({ chess: medic, units: [{ chessId: 't_ally', row: 10, col: 7 }] });
  const u = h.unit('t_op'), a = h.unit('t_ally');
  h.run(3);
  assert.equal(casts(h, u).length, 0, 'nobody to heal: no cast');
  a.hp = a.s.maxHp / 2;
  assert.ok(h.runUntil(() => casts(h, u).length > 0, 2), 'an injured ally at [0,3]: cast');
  done(h);
});

test('real data: 莫斯提马 S3 序时之匙 (3-15 over her 3-6) casts with an enemy on its skill range (official SKILL_RANGE_ENEMY); 白面鸮 S2 脑啡肽 (y-7 over y-2, a heal) is SKILL_RANGE for an injured ally on it', () => {
  const MOST = 'chess_char_4_02_a', PLOSIS = 'chess_char_4_21_a';
  const idx = (id, sid) => ds.getChess(id).raw.skills.find((s) => s.skillId === sid).index;
  const d = ds.getChess(MOST, { skillIndex: idx(MOST, 'skchr_mostma_3') });
  // official row [ATTACK_RANGE_ENEMY, SKILL_RANGE_ENEMY]: SEARCH, then SKILL_RANGE on the 3-15 of the skill
  assert.deepEqual([d.skill.trigger.rule, d.skill.trigger.also.map((e) => e.rule)], ['SEARCH', ['SKILL_RANGE']]);
  assert.deepEqual(d.skill.trigger.also[0].grid, d.skill.rangeGrid, 'the SKILL_RANGE grid is the 3-15 she attacks with');
  // official medic row [ATTACK_RANGE_ALLY, SKILL_RANGE_ALLY]: SKILL_RANGE for an injured ally, on her own range then on the y-7
  const p = ds.getChess(PLOSIS, { skillIndex: idx(PLOSIS, 'skchr_plosis_2') }).skill.trigger;
  assert.deepEqual([p.rule, p.allies, p.also.map((e) => [e.rule, e.allies])], ['SKILL_RANGE', true, [['SKILL_RANGE', true]]]);
  // an enemy on a field tile of 3-15 that 3-6 lacks (she stands at (10,3) facing right)
  const base = new Set(absoluteRangeKeys(d.rangeGrid, 10, 3, 'RIGHT', 0));
  const k = absoluteRangeKeys(d.skill.trigger.also[0].grid, 10, 3, 'RIGHT', 0).find((x) => !base.has(x) && ((x / COLS) | 0) >= 9 && ((x / COLS) | 0) <= 12);
  assert.ok(k != null);
  const h = makeBattle({
    defs: { enemies: { e: dummy('e') } }, units: [{ chessId: MOST, row: 10, col: 3, dir: 'RIGHT', skillIndex: idx(MOST, 'skchr_mostma_3') }],
    enemies: [{ key: 'e', pos: [(k / COLS) | 0, k % COLS] }], hooks: ['skillStart'], autoFinish: false, timeLimit: 30,
  });
  const u = h.unit(MOST);
  h.step();
  u.skill.gainSp(1000);
  assert.ok(h.runUntil(() => u.skill.active, 2), '莫斯提马 S3 cast');
  assert.equal(casts(h, u)[0].reason, 'SKILL_RANGE');
  done(h);
});

test('real data: 空弦 S3 (the kept deviation) appends ACTIVE_RANGE on its running range to the official list and casts on an enemy of it, no attack needed; S2 (no deviation) keeps SEARCH on the initial range', () => {
  const ARCH = 'chess_char_3_21_a';
  const idx = (sid) => ds.getChess(ARCH).raw.skills.find((s) => s.skillId === sid).index;
  const s3 = ds.getChess(ARCH, { skillIndex: idx('skchr_archet_3') }).skill, s2 = ds.getChess(ARCH, { skillIndex: idx('skchr_archet_2') }).skill;
  const raw3 = ds.rawChess(ARCH).skills.find((s) => s.skillId === 'skchr_archet_3').trigger;
  assert.deepEqual([raw3.deviation, raw3.official, raw3.rule, raw3.also.map((e) => e.rule)], ['ACTIVE_RANGE', ['ATTACK_RANGE_ENEMY', 'SKILL_RANGE_ENEMY'], 'SEARCH', ['ACTIVE_RANGE']]);
  assert.deepEqual(s3.trigger.also.map((e) => e.rule), ['ACTIVE_RANGE']);
  assert.equal(s2.trigger.rule, 'SEARCH');
  assert.equal(s2.trigger.also, undefined);
  // (10,7) = [0,4]: on the running range of S3, not on her initial one
  for (const [sid, want] of [['skchr_archet_3', 1], ['skchr_archet_2', 0]]) {
    const h = makeBattle({
      defs: { enemies: { e: dummy('e') } }, units: [{ chessId: ARCH, row: 10, col: 3, dir: 'RIGHT', skillIndex: idx(sid) }],
      enemies: [{ key: 'e', pos: [10, 7] }], hooks: ['skillStart'], autoFinish: false, timeLimit: 30,
    });
    const u = h.unit(ARCH);
    h.step();
    u.skill.gainSp(1000);
    h.run(4);
    assert.equal(casts(h, u).length, want, `${sid}: ${want ? 'cast on the running range' : 'the enemy is outside the initial range'}`);
    if (want) assert.equal(casts(h, u)[0].reason, 'ACTIVE_RANGE');
    done(h);
  }
});

test('real data: 安洁莉娜 S3 秘杖·反重力模式 (y-4 over her y-2) is the official SKILL_RANGE_ENEMY on its y-4: casts on an enemy of the y-4 only, no attack needed; her S2 (no rangeGrid) is SEARCH on the y-2', () => {
  const AGL = 'chess_char_5_20_a';
  const idx = (sid) => ds.getChess(AGL).raw.skills.find((s) => s.skillId === sid).index;
  const s3 = ds.getChess(AGL, { skillIndex: idx('skchr_aglina_3') }).skill, s2 = ds.getChess(AGL, { skillIndex: idx('skchr_aglina_2') }).skill;
  assert.deepEqual(ds.rawChess(AGL).skills.find((s) => s.skillId === 'skchr_aglina_3').trigger.official, ['SKILL_RANGE_ENEMY']);
  assert.equal(s3.trigger.rule, 'SKILL_RANGE');
  assert.deepEqual(s3.trigger.grid, s3.rangeGrid, 'the trigger grid is the y-4 she attacks with');
  assert.equal(s2.trigger.rule, 'SEARCH');
  // (10,6) = [0,3]: on the y-4, not on her y-2
  for (const [sid, want] of [['skchr_aglina_3', 1], ['skchr_aglina_2', 0]]) {
    const h = makeBattle({
      defs: { enemies: { e: dummy('e') } }, units: [{ chessId: AGL, row: 10, col: 3, dir: 'RIGHT', skillIndex: idx(sid) }],
      enemies: [{ key: 'e', pos: [10, 6] }], hooks: ['skillStart'], autoFinish: false, timeLimit: 30,
    });
    const u = h.unit(AGL);
    h.step();
    u.skill.gainSp(1000);
    h.run(4);
    assert.equal(casts(h, u).length, want, `${sid}: ${want ? 'cast on the y-4' : 'the enemy is outside the initial y-2'}`);
    if (want) assert.equal(casts(h, u)[0].reason, 'SKILL_RANGE');
    done(h);
  }
});
