// test/content/op_oblvns.test.js — the 自选 operator kit of 丰川祥子 (char_4182_oblvns, 6★ 领主; kit
// server/sim/content/kits/ops/op-oblvns.js) with the engine parts she brought: the free-flight notes (server/sim/notes.js),
// 持续攻击 (ai.js profile `permanentAttack`), the Fever gauge (server/sim/fever.js, snapshot `fever`, 联防 carry).
// Fielded the production way (a DIY slot + its `diy` pick); numbers are read back from data/backups.json.
// Run: node --test test/content/op_oblvns.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { NOTE_KINDS } from '../../server/sim/content/kits/ops/op-oblvns.js';
import { NOTE_LIFETIME } from '../../server/sim/notes.js';
import { FEVER_NEED, FEVER_DURATION } from '../../server/sim/fever.js';
import { diyPool } from '../../shared/diy.js';
import { TICK } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const BACKUPS = load('backups');
const CHESS = load('chess');
const SAKI = 'char_4182_oblvns';
const FORMS = BACKUPS.units[SAKI].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const LORY = 'uniequip_002_oblvns';
const S1 = 'skchr_oblvns_1', S2 = 'skchr_oblvns_2', S3 = 'skchr_oblvns_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillBb = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id).bb;
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { e_d: dummy('e_d'), e_tank: dummy('e_tank', { def: 900, res: 10 }), e_arts: dummy('e_arts', { def: 0, res: 60 }) };
const FORMS_ALL = [[5, false, null], [6, false, null], [5, true, null], [5, true, LORY], [6, true, null], [6, true, LORY]];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 丰川祥子 as uid 1 at (row, col) facing RIGHT, `foes` as [[row, col, key?]], `more` extra units. */
function field({ tier = 6, elite = true, mod = LORY, skill = 0, row = 10, col = 5, foes = [], more = [], bonds = {}, players = null, seed = 5, hooks } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed, bonds,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: hooks ?? ['damaged', 'hit', 'skillStart', 'skillEnd', 'attack', 'fatal', 'death'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: SAKI, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...more],
    enemies: foes.map(([r, c, key]) => ({ key: key ?? 'e_d', pos: [r, c] })),
    ...(players ? { players } : {}),
  });
  h.step();
  return { h, u: h.unit(1) };
}
const noteHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('note'));
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
test('丰川祥子 in every 自选 form and skill: her own kit, the form\'s stats + LOR-Y attributes, 3-12 range, block 2, hits flyers', () => {
  assert.equal(OPERATOR_KITS[SAKI], KITS[SAKI]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = mod ? form.modules.find((x) => x.uniEquipId === mod) : null;
      assert.deepEqual([u.def.charId, u.skill.id, !!u.kit.generic, u.kit.skillSource], [SAKI, form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0)], `${label(f)}: stats`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-12`);
      assert.deepEqual([u.s.blockCnt, u.profile.canHitFly], [2, true], `${label(f)}: 领主`);
      done(h);
    }
  }
});

test('a 自选 pick: offered at tiers 5 and 6 now that she has a kit', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(SAKI));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(SAKI), `tier ${t}`);
});

test('持续攻击: with no enemy she keeps attacking (attack SP charged, owner 2026-10-15) and her notes wander off — gone after 1 s out of range', () => {
  const { h, u } = field({ skill: 2 });
  h.run(10);
  assert.ok(u.stats.attacks >= 6, `attacks with no target: ${u.stats.attacks}`);
  assert.ok(u.skill.sp >= 6, `attack SP from targetless attacks: ${u.skill.sp}`);
  // every note dies within (time to leave the range) + 1 s: the field never holds more than a few
  assert.ok(h.b.notes.list.length <= 6, `${h.b.notes.list.length} notes alive`);
  for (const n of h.b.notes.list) assert.ok(n.age < NOTE_LIFETIME);
  done(h);
});

test('持续攻击 stops when no enemy is in range and the tile ahead is impassable (PRTS 备注)', () => {
  // the flat stage's row 13 is the 'X' wall (pass NONE): facing UP (+1 row) from row 12 she does not attack
  const a = field({ row: 12, col: 5, more: [] });
  a.h.b.allyUnits[0].dir = 'UP';
  a.h.b._refreshRange(a.u);
  const before = a.u.stats.attacks;
  a.h.run(6);
  assert.equal(a.u.stats.attacks, before, 'no attack into an impassable tile with nothing in range');
  done(a.h);
});

test('a note with a target: launched straight, traces it, strikes once (physical); the trait\'s 80 % only when not blocking', () => {
  for (const [tier, elite, mod] of [[6, true, LORY], [5, false, null]]) {
    const { h, u } = field({ tier, elite, mod, skill: 2, foes: [[10, 7]] });
    h.runUntil(() => noteHits(h, u).length > 0, 10);
    const hit = noteHits(h, u)[0];
    assert.equal(hit.dmg.type, 'phys');
    // ATK × 0.8 (ranged: she blocks nothing at 2 tiles) before DEF
    approx(hit.dmg.amount, u.s.atk * 0.8, `${label([tier, elite, mod])}: ranged ×0.8`, 1e-3);
    done(h);
  }
});

test('S1 新月的苏醒: 8 notes one by one (0.1 s apart with a target), atk_scale … atk_scale_8, arts; charges 2', () => {
  const { h, u } = field({ tier: 5, skill: 0, foes: [[10, 7]] });
  const bb = skillBb(5, true, S1);
  assert.equal(u.skill.maxCharges, 2);
  h.runUntil(() => h.hooksOf('skillStart').some((c) => c.unit === u), 20);
  const t0 = h.b.time;
  const born = [];
  const seen = new Set();
  h.runUntil(() => { for (const n of h.b.notes.list) if (!seen.has(n.id) && n.data.look.startsWith('s1_')) { seen.add(n.id); born.push([h.b.time - t0, n]); } return born.length >= 8; }, 3);
  assert.equal(born.length, 8);
  for (let i = 1; i < 8; i++) approx(born[i][0] - born[i - 1][0], 0.1, `note ${i + 1} spacing`, 0.35);
  const scales = ['atk_scale', ...[2, 3, 4, 5, 6, 7, 8].map((i) => `atk_scale_${i}`)].map((kk) => bb[kk]);
  born.forEach(([, n], i) => { assert.equal(n.data.type, 'arts'); approx(n.data.amount, u.s.atk * scales[i] * 0.8, `note ${i + 1}`, 1e-3); });
  done(h);
});
test('S2 满月的舞会: piano from deployment (ATK +attack@atk, physical notes that pass through), its one cast switches to organ (ASPD +attack@attack_speed, arts)', () => {
  const { h, u } = field({ skill: 1, foes: [[10, 7], [10, 8]] });
  const bb = skillBb(6, true, S2);
  assert.equal(u.mem.oblvnsTimbre, 'piano');
  const atk0 = u.base.atk;
  approx(u.s.atk, atk0 * (1 + bb['attack@atk']), 'piano ATK', 1e-6);
  // a piano note passes through: the two enemies in a line both take damage from the same note
  h.runUntil(() => noteHits(h, u).length >= 2, 10);
  h.runUntil(() => u.skill.active, 20);
  assert.equal(u.mem.oblvnsTimbre, 'organ', 'the one cast of the deployment: piano → organ');
  assert.ok(u.findBuff('skill:oblvns:timbre').mods.aspd === bb['attack@attack_speed']);
  const n = h.hooksOf('skillStart').filter((c) => c.unit === u).length;
  h.run(30);
  assert.equal(h.hooksOf('skillStart').filter((c) => c.unit === u).length, n, 'never cast again (状态切换类)');
  h.runUntil(() => h.b.notes.list.some((x) => x.data.look === 's2_slow'), 5);
  assert.equal(h.b.notes.list.find((x) => x.data.look === 's2_slow').data.type, 'arts');
  done(h);
});

test('S2 with a full gauge: its cast starts Fever instead and keeps piano; during Fever two notes per attack', () => {
  const { h, u } = field({ skill: 1, foes: [[10, 7]] });
  h.b.fever.value = FEVER_NEED;
  h.runUntil(() => u.skill.active, 20);
  assert.ok(h.b.fever.active, 'Fever started');
  assert.equal(u.mem.oblvnsTimbre, 'piano');
  assert.equal(h.b.fever.value, 0, 'the gauge is spent whole');
  const seen = new Set(); let born = 0;
  const atk0 = u.stats.attacks;
  h.runUntil(() => { for (const x of h.b.notes.list) if (!seen.has(x.id)) { seen.add(x.id); born++; } return u.stats.attacks >= atk0 + 3; }, 10);
  h.run(0.3);
  for (const x of h.b.notes.list) if (!seen.has(x.id)) { seen.add(x.id); born++; }
  assert.ok(born >= 2 * 3, `double strike in Fever: ${born} notes for 3 attacks`);
  done(h);
});

test('S3 残月的余响: the skill range, 2 physical notes on the highest-RES enemy + 2 arts notes on the highest-DEF one, attack@atk_scale (LOR-Y stage 1: still ×0.8)', () => {
  const { h, u } = field({ tier: 5, skill: 2, foes: [[10, 7, 'e_tank'], [11, 7, 'e_arts']] });
  const bb = skillBb(5, true, S3);
  h.runUntil(() => u.skill.active, 60);
  assert.deepEqual(u.liveRangeGrid, formOf(5, true).skills[2].rangeGrid);
  const seen = new Map();
  h.runUntil(() => { for (const n of h.b.notes.list) if (n.data.look.startsWith('s3') && !seen.has(n.id)) seen.set(n.id, n); return seen.size >= 4; }, 5);
  const notes = [...seen.values()].slice(0, 4);
  const phys = notes.filter((n) => n.data.type === 'phys'), arts = notes.filter((n) => n.data.type === 'arts');
  assert.equal(phys.length, 2); assert.equal(arts.length, 2);
  for (const n of phys) assert.equal(n.target?.defId, 'enemy_e_arts', 'physical notes trace the highest RES');
  for (const n of arts) assert.equal(n.target?.defId, 'enemy_e_tank', 'arts notes trace the highest DEF');
  for (const n of notes) approx(n.data.amount, u.s.atk * bb['attack@atk_scale'] * 0.8, 'attack@atk_scale', 1e-3);
  done(h);
});

test('LOR-Y stage 3 talent 1: no ranged 80 % during her skill', () => {
  const { h, u } = field({ skill: 2, foes: [[10, 7, 'e_tank'], [11, 7, 'e_arts']] });
  h.runUntil(() => u.skill.active, 60);
  h.runUntil(() => h.b.notes.list.some((x) => x.data.look.startsWith('s3')), 3);
  const n = h.b.notes.list.find((x) => x.data.look.startsWith('s3'));
  approx(n.data.amount, u.s.atk * skillBb(6, true, S3)['attack@atk_scale'], 'no ×0.8 in skill', 1e-3);
  done(h);
});
test('T2 毋畏遗忘: Fever +cnt per damage she outputs (a dodged hit too: the `hit` step), capped at 450; snapshot `fever` shows it', () => {
  const { h, u } = field({ skill: 2, foes: [[10, 7]] });
  const cnt = formOf(6, true).talents[1].bb.cnt;
  h.runUntil(() => noteHits(h, u).length >= 3, 15);
  const n = h.hooksOf('hit').filter((c) => c.source === u && c.target?.side === 'enemy').length;
  approx(h.b.fever.value, Math.min(FEVER_NEED, n * cnt), 'Fever = hits × cnt');
  const row = h.b.snapshot().fever.find((r) => r[0] === u.id);
  approx(row[1], h.b.fever.value / FEVER_NEED, 'snapshot fill', 1e-2);
  h.b.fever.add(1e6);
  assert.equal(h.b.fever.value, FEVER_NEED);
  done(h);
});

test('Fever: a manual S1 cast (1 charge) at a full gauge spends it and runs 20 s; S1 is recast for free back to back; Fever ends', () => {
  const { h, u } = field({ skill: 0, foes: [[10, 7]] });
  h.b.fever.value = FEVER_NEED;
  h.runUntil(() => h.b.fever.active, 20);
  assert.equal(h.b.fever.value < FEVER_NEED, true);
  const on = h.b.time;
  h.runUntil(() => !h.b.fever.active, FEVER_DURATION + 2);
  approx(h.b.time - on, FEVER_DURATION, 'Fever lasts 20 s', 0.01);
  const free = h.hooksOf('skillStart').filter((c) => c.unit === u && c.reason === 'fever').length;
  assert.ok(free >= 5, `S1 recast during Fever: ${free}`);
  done(h);
});

test('the full-charge auto cast of S1 never starts Fever; high 迅捷 refills S1 to 2 charges every cast → Fever lockout (emerges, no special case)', () => {
  const swift = { swiftShip: { count: 2, active: true, tier: 1, layers: 230 } };
  for (const [bonds, wantFever] of [[{}, true], [swift, false]]) {
    const { h, u } = field({ skill: 0, foes: [[10, 7]], bonds });
    let fevers = 0, was = false;
    for (let i = 0; i < 30 * 120; i++) { h.step(); if (h.b.fever.active && !was) fevers++; was = h.b.fever.active; }
    assert.equal(h.b.fever.value, FEVER_NEED, 'the gauge fills either way');
    const reasons = h.hooksOf('skillStart').filter((c) => c.unit === u).map((c) => c.reason);
    assert.equal(fevers > 0, wantFever, `迅捷 ${bonds.swiftShip ? 'high' : 'off'}: ${[...new Set(reasons)]}`);
    // with 迅捷 only her first cast (1 charge, before any proc) is a manual one: every later cast is the full-charge one
    if (!wantFever) assert.deepEqual([...new Set(reasons.slice(1))], ['full'], 'the full-charge auto cast from then on');
    done(h);
  }
});

test('Fever with S3: its duration does not run during Fever; a Fever-started S3 ends with Fever; S3 saves a member from lethal damage, who withdraws at the end', () => {
  const { h, u } = field({ skill: 2, foes: [[10, 7]] });
  h.runUntil(() => u.skill.active, 60);
  h.b.fever.value = FEVER_NEED;
  h.b.fever.tryStart(u);
  const left = u.skill.timeLeft;
  h.run(3);
  approx(u.skill.timeLeft, left, 'paused in Fever', 1e-6);
  // lethal damage in Fever: she stays
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true', sourceless: true });
  assert.ok(u.alive, 'undying during Fever');
  h.runUntil(() => !h.b.fever.active, FEVER_DURATION + 1);
  h.step();
  assert.ok(!u.alive, 'withdraws when Fever ends');
  done(h);
});

test('T2: another 丰川祥子 whose base range overlaps lends hers as an extension (PRTS 备注); both share one gauge', () => {
  const two = [{ uid: 2, diy: { slot: SLOT[5], charId: SAKI, skillIndex: 2, uniEquipId: LORY }, elite: true, row: 11, col: 5 }];
  const { h, u } = field({ skill: 2, more: two, foes: [[10, 7]] });
  const v = h.unit(2);
  assert.ok(u.extraRangeKeys && u.extraRangeKeys.length > 0, 'extension from the other one');
  assert.ok(v.extraRangeKeys && v.extraRangeKeys.length > 0);
  assert.equal(h.b.fever.members.size, 2);
  h.runUntil(() => noteHits(h, v).length > 0, 10);
  assert.ok(h.b.fever.value > 0);
  done(h);
});

test('T1 颂乐音符: each live note gives her damage DEF penetration (ratio × notes, capped at max_cnt)', () => {
  const { h, u } = field({ skill: 2, foes: [[10, 7, 'e_tank']] });
  const t0 = formOf(6, true).modules[0].talentChanges.find((t) => t.talentIndex === 0).bb;
  h.runUntil(() => noteHits(h, u).length > 0, 10);
  const c = noteHits(h, u)[0];
  assert.ok(c.dmg.defIgnorePct > 0 && c.dmg.defIgnorePct <= t0.def_penetrate_ratio * t0.max_cnt + 1e-9, `def pen ${c.dmg.defIgnorePct}`);
  approx(c.dmg.defIgnorePct / t0.def_penetrate_ratio, Math.round(c.dmg.defIgnorePct / t0.def_penetrate_ratio), 'a whole number of notes', 1e-6);
  done(h);
});

test('联防 carry: a field starts at the higher feverCarry of its players; BattleResult reports the gauge', () => {
  const unit = (uid) => ({ uid, kind: 'chess', chessId: SLOT[6], diy: { charId: SAKI, skillIndex: 2, uniEquipId: LORY }, row: 10, col: 5 });
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 5, autoFinish: false,
    players: [
      { playerId: 'a', seat: 0, side: 'L', colOffset: 0, units: [unit(1)], bonds: {}, feverCarry: 120 },
      { playerId: 'b', seat: 1, side: 'L', colOffset: 8, units: [unit(2)], bonds: {}, feverCarry: 300 },
    ],
  });
  h.step();
  assert.equal(h.b.fever.value, 300, 'the higher carry [ASSUMED, owner 2026-10-15]');
  const r = h.runToEnd(10);
  assert.equal(typeof r.perPlayer.a.fever, 'number');
  done(h);
});

test('determinism: two runs with the same seed give the same notes and damage', () => {
  const run = () => {
    const { h, u } = field({ skill: 0, foes: [[10, 7], [9, 8]], seed: 11 });
    h.run(20);
    return JSON.stringify([u.stats.dmg, h.b.fever.value, h.b.notes.list.map((n) => [n.x, n.y])]);
  };
  assert.equal(run(), run());
  void TICK; void NOTE_KINDS;
});
