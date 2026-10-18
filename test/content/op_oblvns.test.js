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
import { NOTE_LIFETIME, ownerTarget } from '../../server/sim/notes.js';
import { FEVER_NEED, FEVER_DURATION } from '../../server/sim/fever.js';
import { diyPool } from '../../shared/diy.js';
import { TICK, COLS } from '../../server/sim/constants.js';
import { animOf } from '../../server/sim/snapshot.js';
import { ANIM } from '../../shared/constants.js';

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
const ENEMIES = { e_d: dummy('e_d'), e_tank: dummy('e_tank', { def: 900, res: 10 }), e_arts: dummy('e_arts', { def: 0, res: 60 }),
  e_huge: { ...dummy('e_huge'), rank: 'BOSS', hitArea: { w: 3, h: 3, dx: 0, dy: 0 } } };
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

test('a targetless 持续攻击 plays no attack clip (owner 2026-10-16): idle with no enemy, the attack clip on an enemy', () => {
  const { h, u } = field({ skill: 2 });
  h.run(1.5);   // past the deploy clip
  const seen = new Set();
  for (let i = 0; i < 90; i++) { h.step(); seen.add(animOf(u, h.b.time)); }
  assert.ok(u.stats.attacks > 0, 'she did attack (her notes left)');
  assert.ok(!seen.has(ANIM.ATTACK) && !seen.has(ANIM.SKILL), `no attack / skill clip without a target: ${[...seen]}`);
  // an enemy in range: the clip again
  const b = field({ skill: 2, foes: [[10, 7]] });
  b.h.run(1.5);
  let attacked = false;
  for (let i = 0; i < 120 && !attacked; i++) { b.h.step(); attacked = animOf(b.u, b.h.b.time) === ANIM.ATTACK; }
  assert.ok(attacked, 'the attack clip on an enemy');
  done(h);
});

test('every return to free flight waits the minimum free time again (owner 2026-10-16, the flowchart)', () => {
  const { h, u } = field({ foes: [[10, 7], [10, 8]] });
  h.runUntil(() => h.b.notes.list.some((n) => n.state === 'trace'), 5);
  const n = h.b.notes.list.find((x) => x.state === 'trace');
  const other = h.b.enemies.find((e) => e !== n.target);
  n.target.hp = 0; h.b.kill(n.target);
  h.step();
  assert.equal(n.state, 'free', 'target lost → free');
  assert.equal(n.freeT, 1 / 30, 'the free timer starts over');
  // it may pick the other enemy at its next check, but only traces once minFree has passed again
  h.runUntil(() => n.dead || n.state === 'trace', 3);
  if (!n.dead) assert.ok(n.freeT >= n.kind.minFree - 1e-9, `traced after ${n.freeT} s free (min ${n.kind.minFree})`);
  void other; void u;
  done(h);
});

test('her notes outlive her (owner 2026-10-16): they fly on, still strike (damage + Fever), off-range read from her last range', () => {
  const { h, u } = field({ foes: [[10, 9]] });
  h.runUntil(() => h.b.notes.list.some((n) => n.owner === u), 5);
  const mine = h.b.notes.list.filter((n) => n.owner === u);
  const fever0 = h.b.fever.value, hits0 = noteHits(h, u).length;
  h.b.retreat(u);
  assert.ok(!u.deployed, 'she left');
  for (const n of mine) { assert.ok(!n.dead, 'not cleared on leaving'); assert.ok(n.range && n.range.size > 0, 'her last range kept'); }
  h.runUntil(() => noteHits(h, u).length > hits0, 5);
  assert.ok(noteHits(h, u).length > hits0, 'a note still strikes after she left');
  assert.ok(h.b.fever.value > fever0, 'and still fills the gauge');
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

test('a huge boss is struck at its centre, like a projectile — not at the edge of its hit rectangle', () => {
  const { h, u } = field({ skill: 0, foes: [[10, 10, 'e_huge']] });
  const boss = h.b.enemies[0];
  h.runUntil(() => noteHits(h, u).length > 0, 10);
  const hits = h.eventsOf('fx').filter((e) => e[1] === 'note' && e[4]?.on === 'hit');
  assert.ok(hits.length > 0);
  // the 3×3 rectangle's edge is 1.5 tiles from its centre
  for (const [, , x, y] of hits) assert.ok(Math.hypot(x - boss.x, y - boss.y) < 0.5, `hit at (${x}, ${y}), boss at (${boss.x}, ${boss.y})`);
  done(h);
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
  h.runUntil(() => h.b.fever.active, 20);
  assert.equal(u.mem.oblvnsTimbre, 'piano');
  assert.equal(h.b.fever.value, 0, 'the gauge is spent whole');
  assert.equal(u.skill.active, false, 'the Fever cast is not her toggle: the skill is off again');
  const seen = new Set(); let born = 0;
  const atk0 = u.stats.attacks;
  h.runUntil(() => { for (const x of h.b.notes.list) if (!seen.has(x.id)) { seen.add(x.id); born++; } return u.stats.attacks >= atk0 + 3; }, 10);
  h.run(0.3);
  for (const x of h.b.notes.list) if (!seen.has(x.id)) { seen.add(x.id); born++; }
  assert.ok(born >= 2 * 3, `double strike in Fever: ${born} notes for 3 attacks`);
  done(h);
});

test('S2 + an S3 member (owner 2026-10-19): the cast that starts Fever is not her one toggle — SP charges again and she still switches to organ, once', () => {
  const s3 = [{ uid: 2, diy: { slot: SLOT[6], charId: SAKI, skillIndex: 2, uniEquipId: LORY }, elite: true, row: 11, col: 5 }];
  const { h, u } = field({ skill: 1, more: s3, foes: [[10, 7]] });
  const v = h.unit(2);
  // the S3 member starts Fever before her first cast; S2 waits it out while the gauge refills
  u.skill.sp = 0; u.skill.charges = 0;
  h.b.fever.value = FEVER_NEED;
  v.skill.charges = 1; v.skill.opReadyAt = -Infinity;
  assert.ok(v.skill.activate('manual'));
  assert.ok(h.b.fever.active);
  h.runUntil(() => !h.b.fever.active, FEVER_DURATION + 1);
  h.b.fever.value = FEVER_NEED;
  // her cast at the full gauge: Fever again, still piano, the skill off
  h.runUntil(() => h.b.fever.active, 20);
  assert.equal(u.mem.oblvnsTimbre, 'piano');
  assert.equal(u.skill.active, false, 'not the toggle');
  // after that Fever: SP charges and her next cast is the switch
  h.runUntil(() => !h.b.fever.active, FEVER_DURATION + 1);
  h.runUntil(() => u.skill.sp > 0 || u.skill.charges > 0, 10);
  h.runUntil(() => u.mem.oblvnsTimbre === 'organ', 20);
  assert.ok(u.skill.active, 'the switch is the toggle: it stays on');
  const n = h.hooksOf('skillStart').filter((c) => c.unit === u).length;
  h.run(60);
  assert.equal(h.hooksOf('skillStart').filter((c) => c.unit === u).length, n, 'never cast again');
  assert.equal(u.mem.oblvnsTimbre, 'organ');
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

// the cast events' sting cue (skills.js `cue` → ['skill', id, 1, cue], op-oblvns.js STING): when the client plays a sting
const casts = (h, u) => h.eventsOf('skill').filter((e) => e[1] === u.id && e[2] === 1);

test('sting cues, S1: every cast — the full-charge auto cast, the manual one that starts Fever and every Fever recast (owner 2026-10-18: the literal rule)', () => {
  const { h, u } = field({ skill: 0, foes: [[10, 7]] });
  h.runUntil(() => casts(h, u).length >= 1, 30);
  h.b.fever.value = FEVER_NEED;
  h.runUntil(() => h.b.fever.active, 30);
  h.run(5);
  const cs = casts(h, u);
  assert.ok(cs.length >= 4, `casts: ${cs.length}`);
  for (const e of cs) assert.deepEqual(e[3], { sting: 1 }, 'a sting on every S1 cast');
  done(h);
});

test('sting cues, S2: the switch into organ only; a cast at a full gauge (it starts Fever, no switch) has none — the cue names the timbre for the model', () => {
  const a = field({ skill: 1, foes: [[10, 7]] });
  a.h.runUntil(() => a.u.skill.active, 20);
  assert.equal(a.u.mem.oblvnsTimbre, 'organ');
  assert.deepEqual(casts(a.h, a.u).map((e) => e[3]), [{ sting: 1, form: 'organ' }], 'piano → organ: h1, organ clips');
  done(a.h);
  const b = field({ skill: 1, foes: [[10, 7]] });
  b.h.b.fever.value = FEVER_NEED;
  b.h.runUntil(() => b.h.b.fever.active, 20);
  assert.deepEqual(casts(b.h, b.u).map((e) => e[3]), [{ form: 'piano' }], 'Fever start: silent, she stays on piano');
  done(b.h);
});

test('sting cues, S3: sting + loop only when Fever is neither running nor full (oblvns_s_3[switch_mode]); a Fever-started S3 has neither', () => {
  const a = field({ skill: 2, foes: [[10, 7]] });
  a.h.runUntil(() => a.u.skill.active, 60);
  assert.deepEqual(casts(a.h, a.u).map((e) => e[3]), [{ sting: 1, loop: 1 }], 'a plain cast');
  done(a.h);
  const b = field({ skill: 2, foes: [[10, 7]] });
  b.h.b.fever.value = FEVER_NEED;
  b.h.runUntil(() => b.u.skill.active, 60);
  assert.ok(b.h.b.fever.active, 'the cast at a full gauge started Fever');
  assert.deepEqual(casts(b.h, b.u).map((e) => e[3]), [undefined], 'the gauge was full: no sting, no loop');
  done(b.h);
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

test('转向速度 (PRTS 弹道): the turned direction is not renormalised — a note locked on a target behind it brakes, turns back and strikes, it never orbits', () => {
  for (const [name, kind] of Object.entries(NOTE_KINDS)) {
    const { h, u } = field({ foes: [[10, 2]] });
    const e = h.b.enemies[0];
    // a note in trace flying away from its target (+x) at full speed, its target 1.5 tiles behind it
    const n = h.b.notes.add({ owner: u, kind, x: e.x + 1.5, y: e.y, dx: 1, dy: 0, target: e, onHit: () => {} });
    n.state = 'trace'; n.vx = 1; n.vy = 0;
    let minSpeed = Infinity;
    for (let i = 0; i < 30 * 8 && !n.dead; i++) {
      const x0 = n.x, y0 = n.y;
      h.b.notes.update(TICK);
      if (!n.dead) minSpeed = Math.min(minSpeed, Math.hypot(n.x - x0, n.y - y0) / TICK);
    }
    assert.ok(n.dead && n.hit.has(e), `${name}: struck its target behind it`);
    assert.ok(minSpeed < kind.trace * 0.5, `${name}: braked while turning (${minSpeed.toFixed(2)} of ${kind.trace})`);
    done(h);
  }
});

test('a note looking for a target over her range takes hers first (owner 2026-10-16): the enemy she blocks, else her pick in range — outside her range (owner 2026-10-17) or with none of hers, the nearest to itself', () => {
  // a note over her range: it goes for the one she blocks
  const { h, u } = field({ foes: [[10, 5], [10, 10]] });
  h.runUntil(() => u.blocking.length > 0, 5);
  const [blocked, far] = [u.blocking[0], h.b.enemies.find((e) => e !== u.blocking[0])];
  const n = h.b.notes.add({ owner: u, kind: NOTE_KINDS.attackFree, x: u.x, y: u.y, dx: 1, dy: 0, onHit: () => {} });
  h.b.notes.update(TICK);
  assert.equal(n.target, blocked, 'her blocked enemy');
  // a note outside her range, right next to another enemy: its own pick, not hers
  const o = h.b.notes.add({ owner: u, kind: NOTE_KINDS.attackFree, x: far.x - 0.3, y: far.y, dx: 1, dy: 0, onHit: () => {} });
  assert.ok(!u.rangeKeySet.has(Math.round(o.y) * COLS + Math.round(o.x)), 'the setup: outside her range');
  h.b.notes.update(TICK);
  assert.equal(o.target, far, 'the one beside the note');
  // she blocks nothing: her own pick in range (the one nearest the blue box), not the one beside the note
  const g = field({ foes: [[10, 7], [10, 9]] });
  const lead = g.h.b.enemies.slice().sort((a, b) => g.h.b.remainingDistance(a) - g.h.b.remainingDistance(b))[0];
  const other = g.h.b.enemies.find((e) => e !== lead);
  // the note on her range's last tile (8, 10), nearer the other one (9, 10) than her pick (7, 10)
  const m = g.h.b.notes.add({ owner: g.u, kind: NOTE_KINDS.attackFree, x: other.x - 0.6, y: other.y + 0.3, dx: 1, dy: 0, onHit: () => {} });
  assert.ok(g.u.rangeKeySet.has(Math.round(m.y) * COLS + Math.round(m.x)), 'the setup: over her range');
  g.h.b.notes.update(TICK);
  assert.equal(m.target, lead, 'her pick');
  // none in her range and she blocks none: the nearest to the note itself (PRTS)
  const k = field({ foes: [[10, 18]] });
  const e = k.h.b.enemies[0];
  const q = k.h.b.notes.add({ owner: k.u, kind: NOTE_KINDS.attackFree, x: e.x - 0.5, y: e.y, dx: 1, dy: 0, onHit: () => {} });
  k.h.b.notes.update(TICK);
  assert.equal(q.target, e, 'its own pick');
  // S3 outside her range (owner 2026-10-17): its own pick still takes the highest RES / DEF within its radius
  const t = field({ skill: 2, foes: [[10, 10, 'e_tank'], [10, 11, 'e_arts']] });   // e_arts lands at x 10.5 (the map's edge)
  const [tank, arts] = ['e_tank', 'e_arts'].map((id) => t.h.b.enemies.find((x) => x.defId === `enemy_${id}`));
  const s3 = (prefer) => t.h.b.notes.add({ owner: t.u, kind: NOTE_KINDS.attackFree, x: 9.9, y: 10, dx: 1, dy: 0, data: { prefer }, onHit: () => {} });
  const [pn, an, plain] = [s3('res'), s3('def'), s3(null)];
  assert.ok(!t.u.rangeKeySet.has(10 * COLS + 10), 'the setup: outside her range');
  t.h.b.notes.update(TICK);
  assert.equal(pn.target, arts, 'S3 phys: the higher RES, though farther');
  assert.equal(an.target, tank, 'S3 arts: the higher DEF');
  assert.equal(plain.target, tank, 'no preference: the nearest');
  done(h); done(g.h); done(k.h); done(t.h);
});

test('the notes\' priority (owner 2026-10-16): her blocked enemies → her own range → the range another member lends her; S3 takes the highest RES / DEF within that group', () => {
  // two of her on one row (lent ranges), the back one blocks an enemy; a tougher one stands only in front of the front one
  const two = [{ uid: 2, diy: { slot: SLOT[6], charId: SAKI, skillIndex: 0, uniEquipId: LORY }, elite: true, row: 10, col: 7 }];
  const { h, u } = field({ skill: 2, more: two, foes: [[10, 5, 'e_d'], [10, 11, 'e_arts'], [10, 12, 'e_tank']] });
  h.runUntil(() => u.blocking.length > 0, 5);
  const mine = u.blocking[0];
  assert.equal(ownerTarget(h.b, u, 'res'), mine, 'S3 phys: the one she blocks, though another has more RES');
  assert.equal(ownerTarget(h.b, u, 'def'), mine, 'S3 arts: the one she blocks');
  assert.equal(ownerTarget(h.b, u), mine);
  // blocking none: the highest RES / DEF of her own range
  const g = field({ skill: 2, foes: [[10, 7, 'e_arts'], [10, 8, 'e_tank']] });
  assert.equal(ownerTarget(g.h.b, g.u, 'res')?.defId, 'enemy_e_arts');
  assert.equal(ownerTarget(g.h.b, g.u, 'def')?.defId, 'enemy_e_tank');
  // an enemy only in the lent range is the last resort: one in her own range wins over a tougher lent-range one
  const f = field({ skill: 0, more: [{ ...two[0], col: 8 }], foes: [[10, 6, 'e_d'], [10, 12, 'e_tank']] });
  const ext = new Set(f.u.extraRangeKeys || []);
  const lentOnly = f.h.b.enemies.find((e) => ext.has(e.tileR * COLS + e.tileC));
  assert.ok(lentOnly, 'the test field puts one enemy in the lent range only');
  assert.notEqual(ownerTarget(f.h.b, f.u, 'def'), lentOnly, 'her own range first');
  // the S3 volley launches its notes on those picks
  h.runUntil(() => h.b.notes.list.some((n) => n.owner === u && n.data.look.startsWith('s3')) || false, 60);
  for (const n of h.b.notes.list) if (n.owner === u && n.data.look.startsWith('s3') && n.target) assert.equal(n.target, mine, n.data.look);
  done(h); done(g.h); done(f.h);
});
