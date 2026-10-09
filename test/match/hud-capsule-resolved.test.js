// test/match/hud-capsule-resolved.test.js — the HUD capsule's server half (PR #157): m.public.fields[].progress carries
// the field's own `resolved` (knocked out + leaked among the enemies the round scheduled), and
//   * a bot / server-run field has no authority reporting b.progress — its capsule must read the battle's own counters
//     (`timelineSample` → Battle.resolved), not the report-driven `progress.leaks`, which stays 0 forever (maintainer
//     review point ①);
//   * `progress.resolved` starts at **null**, never 0: only a real reported number is adopted, so the client's
//     `resolved ?? killed` fallback keeps working (a `Number(null) === 0` would defeat it) — and a reported 0 is a real
//     value, told apart from "not reported" (review point ②);
//   * a finished two-half field (联防 with two helpers, the boss pair) publishes the FIELD's own `resolved` — the capsule's
//     number — never the sum of the players' own clamps: an enemy that spawns on one half and leaks on the other is
//     billed to one player's `total` and to the other's `leakedInTotal`, so both players' min(total, …) read 0 for it
//     while the field resolved it (found reviewing the capsule port, 2026-10-08).
// Run: node --test test/match/hud-capsule-resolved.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch, DATA } from './harness.js';
import { timelineSample, timelineAt, validateClientResult, runHeadless } from '../../server/match/fields.js';
import { buildBattleSpec, createBattleFromSpec, compactResult, battleProgress } from '../../server/sim/spec.js';
import { GameData } from '../../server/match/gamedata.js';
import { MatchViews } from '../../server/match/match/views.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { teammateProgress } from '../../public/js/battle/observe.js';
import { uniteLeftMark } from '../../public/js/battle/runner.js';

const fields = (h) => h.m.fields;
const progressOf = (m, fieldId) => (m.publicView().fields.find((f) => f.fieldId === fieldId) || {}).progress;

test('① 机器人战场 (mode server, 无上报): 胶囊读该战斗自己的计数器，不是停在 0 的 progress.leaks', () => {
  // no FakeBattle: the bot's field runs the real sim on the server (HeadlessJob + timeline), and nobody reports b.progress
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 1, seed: 7, instant: false, clientCombat: true, clients: false }).start();
  const m = h.m;
  h.toPrep(1);
  m.handle('p_0', { t: 'g.ready', ready: true });
  h.run(() => m.phase === PHASE.COMBAT);
  const f = fields(h).find((x) => x.fieldId === 'n:ai_0');
  assert.equal(f.mode, 'server', 'the bot field runs on the server');
  assert.equal(f.authority, null, 'no authority ever reports it');
  assert.ok(f.timeline && f.timeline.length > 1, 'it has a progress timeline');
  assert.equal(f.progress.leaks, 0, 'nothing was reported: progress.leaks stays 0');
  assert.equal(f.progress.resolved, null, 'and progress.resolved stays null (never a fabricated 0)');

  let filled = 0;
  for (let i = 0; i < 20 && !f.done; i++) {
    h.sched.advance(2000);
    const pr = progressOf(m, 'n:ai_0');
    // the capsule reads the battle's own counters, sampled on the field clock
    assert.equal(pr.resolved, timelineAt(f.timeline, m._fieldElapsed(f))[3], 'resolved = the timeline sample');
    assert.ok(pr.resolved != null && pr.resolved <= pr.total, 'a real number, never above the denominator');
    if (pr.resolved > 0) { filled = pr.resolved; break; }
  }
  assert.ok(filled > 0, 'the bot field\'s capsule fills up (a report-driven number would have stayed at 0)');
  // the sample is composed of the battle's own two counters — the field's own scheduled enemies that were resolved
  assert.equal(timelineSample(f.battle)[3], Math.min(f.battle.total, f.battle.killedInTotal + f.battle.leakedInTotal));
  assert.equal(progressOf(m, 'n:ai_0').resolved, timelineAt(f.timeline, m._fieldElapsed(f))[3], 'clamped by the field clock');
});

test('① 一场只漏不杀的机器人战场: resolved 由 leakedInTotal 顶起来 (不是 0)', () => {
  // three walkers, nobody to stop them: the field's own enemies leak — leakedInTotal is what the capsule must show
  const h = makeBattle({ seed: 5, enemies: [{ key: 'enemy_1005_yokai', count: 3 }], content: 'full' });
  h.runToEnd(120);
  assert.equal(h.b.total, 3);
  assert.equal(h.b.leakedInTotal, 3, 'the field leaked all three of its own enemies');
  assert.equal(h.b.leakedCount, 3, 'counted leaks — the LP charge, unchanged from master');
  const sample = timelineSample(h.b);
  assert.equal(sample[3], 3, 'the timeline sample carries the capsule numerator');
  assert.equal(battleProgress(h.b).resolved, 3, 'b.progress too (what a teammate HUD reads)');
  assert.equal(battleProgress(h.b).total, 3);
  assert.equal(battleProgress(h.b).killed, 0);
});

test('② 上报没有 resolved ⇒ progress.resolved = null，客户端回落到 killed；上报 resolved: 0 ⇒ 采用 0', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 9103, fake: true, clientCombat: true, clients: false, script: () => ({ duration: 6 }) }).start();
  const m = h.m;
  h.toPrep(1);
  m.handle('p_0', { t: 'g.ready', ready: true });
  m.handle('p_1', { t: 'g.ready', ready: true });
  h.run(() => m.phase === PHASE.COMBAT);
  const human = fields(h).find((x) => x.fieldId === 'n:p_0');
  assert.equal(human.mode, 'client');
  assert.equal(human.progress.resolved, null, 'a fresh field: resolved unknown, not 0');

  // a report without `resolved` (an older client / a field that cannot count it) leaves it unknown
  assert.deepEqual(m.handle('p_0', { t: 'b.progress', battleId: human.battleId, gt: 4, killed: 3, total: 9, leaks: 0 }), { ok: true });
  m.flush(true);
  assert.deepEqual(progressOf(m, 'n:p_0'), { killed: 3, resolved: null, total: 9, done: false });
  // … and the teammate HUD falls back to `killed` (master's display: resolved ?? killed)
  const mine = (pub) => teammateProgress(pub, 'p_1').find((x) => x.playerId === 'p_0');
  assert.deepEqual(mine(m.publicView()), { playerId: 'p_0', name: 'P0', isBot: false, killed: 3, resolved: 3, total: 9, done: false });

  // a reported 0 is a real value: adopted, and the HUD shows 0 (not the fallback)
  assert.deepEqual(m.handle('p_0', { t: 'b.progress', battleId: human.battleId, gt: 5, killed: 3, total: 9, leaks: 0, resolved: 0 }), { ok: true });
  m.flush(true);
  assert.deepEqual(progressOf(m, 'n:p_0'), { killed: 3, resolved: 0, total: 9, done: false });
  assert.deepEqual(mine(m.publicView()), { playerId: 'p_0', name: 'P0', isBot: false, killed: 3, resolved: 0, total: 9, done: false });
});

test('a done field\'s m.public progress carries the reported resolved (never a fabricated one)', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 9104, fake: true, clientCombat: true, clients: false, script: () => ({ duration: 2 }) }).start();
  const m = h.m;
  h.toPrep(1);
  m.handle('p_0', { t: 'g.ready', ready: true });
  m.handle('p_1', { t: 'g.ready', ready: true });
  h.run(() => m.phase === PHASE.COMBAT);
  const human = fields(h).find((x) => x.fieldId === 'n:p_0');
  // a result carrying the capsule numbers: 5 counted knock-outs (a split child included), 3 of the round's own resolved
  const result = {
    reason: 'cleared', time: 6, killed: 5, total: 3, resolved: 3,
    perPlayer: { p_0: { killed: 5, total: 3, resolved: 3, leaked: [], perfect: true, layerGains: {}, coins: 0, damageDealt: 0, bossDamage: 0, healingDone: 0, deaths: 0, unitsEnd: [], unitStats: [] } },
    errors: 0,
  };
  assert.deepEqual(m.handle('p_0', { t: 'b.result', battleId: human.battleId, result }), { ok: true });
  m.flush(true);
  const pr = progressOf(m, 'n:p_0');
  assert.equal(pr.done, true);
  assert.equal(pr.killed, 5, '`killed` keeps the counted reading (may exceed the denominator)');
  assert.equal(pr.total, 3, 'the denominator is the round\'s own list');
  assert.equal(pr.resolved, 3, 'the capsule numerator of the finished field');
});

test('a 联防 battle\'s live-counter mark still moves for a spawn — `total` no longer does (a split child / a summon is outside the capsule)', () => {
  // the runner re-reads the leakers' enemies still standing (uniteLeft) only when this mark moves; before the capsule
  // counted the round's own enemies only, every counted spawn raised `total` and so moved it
  const h = makeBattle({ seed: 41, autoFinish: false, timeLimit: 60, enemies: [{ key: 'enemy_1195_sfyin', pos: [9, 6] }] });
  h.step();
  const m0 = uniteLeftMark(h.b);
  assert.equal(h.b.total, 1);
  assert.equal(uniteLeftMark(h.b), m0, 'nothing happened: the same mark');
  const child = h.spawn('enemy_1196_msfyin', { pos: [9, 4] });                // a runtime spawn: counted, outside the denominator
  assert.ok(child && child.counted && !child.inTotal);
  assert.equal(h.b.total, 1, 'the denominator did not move');
  assert.notEqual(uniteLeftMark(h.b), m0, 'the mark did: the spawn is a standing enemy the counter must read');
  const m1 = uniteLeftMark(h.b);
  h.b.kill(child, null);
  assert.notEqual(uniteLeftMark(h.b), m1, 'a knock-out moves it');
});

// ---- an enemy that crosses the midline of a two-half field -------------------------------------------------------------
//
// The capsule counts per FIELD (Battle.resolved = min(total, killedInTotal + leakedInTotal)), but the sim also keeps every
// player's own counters: `total` and a knock-out belong to the half the enemy spawned on, a leak to the half whose tile it
// reached (deploy.js _recordLeak). A lane that runs through both halves — the 联防 lane (col 18 → col 2), the boss pair's
// crossing routes — bills one enemy's `total` to one player and its leak to the other, so each player's own
// min(total, killedInTotal + leakedInTotal) clamps it away: 0 and 0 for an enemy the field resolved. A finished field must
// publish the field's own number (what the capsule showed), never the sum of the players' clamps.

const gd = new GameData(DATA, 'mode_multi_hard');
/** m.public.fields[].progress of a finished client-combat field (the done branch of Match._fieldProgress). */
const doneView = (result, progress = { killed: 0, total: 0, leaks: 0, resolved: null }) => MatchViews.prototype._fieldProgress.call({}, { cc: true, done: true, result, progress });
const clone = (v) => JSON.parse(JSON.stringify(v));

/** A 联防 spec of two helpers who fielded nothing, and one escaped enemy that walks the whole lane (col 18 → col 2). */
function uniteCrossSpec() {
  return buildBattleSpec({
    battleId: 'mid-u', fieldId: 'u', kind: 'unite', seed: 11, modeId: 'mode_multi_normal', round: 1, stageId: 'act1autochess_m02',
    rect: { r0: 9, r1: 12, c0: 0, c1: 20 }, timeLimit: 90,
    players: [
      { playerId: 'p_1', seat: 1, side: 'L', colOffset: 8, units: [], bonds: {} },   // the half the lane starts on (col 18)
      { playerId: 'p_2', seat: 2, side: 'L', colOffset: 0, units: [], bonds: {} },   // the half it leaves on (col 2)
    ],
    routes: [{ motion: 'WALK', start: [9, 18], end: [9, 2], checkpoints: [] }],
    spawns: [{ time: 1, enemyKey: 'enemy_1007_slime', routeIndex: 0, count: 1, sourcePlayerId: 'p_0', mods: { hpMul: 0.8, atkMul: 0.8, speedMul: 1, slot: 'N' } }],
    flags: { layerGainsEnabled: false, dpInit: 10, dpPerSec: 1, dpMax: 99 },
  });
}
const newBattle = (spec) => createBattleFromSpec(spec, null, { recordEvents: false, quiet: true });

test('联防 whose escaped enemies enter on one helper\'s half and leak on the other\'s: the finished field publishes the capsule\'s own 4/4, not 0/4', () => {
  let ran = null;
  // every client runs the 联防 spec with the REAL sim (the fake battles only stand in for the normal round); the helpers
  // fielded nothing, so the leaker's four escaped enemies walk the whole lane and leak on the far half
  const realUnite = (result, spec) => {
    if (spec.kind !== 'unite') return result;
    const b = createBattleFromSpec(spec, h.m.ds, { recordEvents: false, quiet: true });
    const res = b.runToEnd(4000);
    ran = { res, capsule: battleProgress(b) };
    return compactResult(res);
  };
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 9111, fake: true, clientCombat: true,
    script: (b) => (b.kind === 'normal' ? { leaks: { p_0: 4 } } : {}),
    perPlayer: Object.fromEntries(['p_0', 'p_1', 'p_2'].map((pid) => [pid, { tamper: realUnite }])) }).start();
  const m = h.m;
  h.toPrep(1);
  const unite = () => fields(h).find((x) => x.fieldId === 'u');
  assert.ok(h.drive(() => (unite() && unite().done) || h.ended != null) && unite().done, 'the 联防 field finished');
  const f = unite();
  assert.equal(f.resultSource, 'client', 'the authority\'s own result was accepted');
  assert.ok(ran, 'the authority ran the 联防 spec with the real sim');

  // the premise: the enemies crossed the midline — `total` on the half they entered, the leaks on the half they left
  const per = Object.values(ran.res.perPlayer);
  assert.deepEqual(per.map((p) => p.total).sort(), [0, 4], 'every total is billed to the half the enemies spawned on');
  assert.deepEqual(per.map((p) => p.leaked.length).sort(), [0, 4], 'every leak to the half they reached');
  assert.deepEqual(per.map((p) => p.resolved), [0, 0], 'so each player\'s own min(total, …) reads 0');
  assert.equal(ran.capsule.resolved, 4, 'while the field\'s capsule read 4/4');
  assert.equal(ran.res.resolved, 4);

  // what the server keeps and publishes is the field's number
  assert.equal(f.result.resolved, 4, 'the validated result carries the field-level numerator');
  m.flush(true);
  assert.deepEqual(progressOf(m, 'u'), { killed: 0, resolved: 4, total: 4, done: true }, 'm.public: the capsule\'s own 4/4');
  m.dispose();
});

test('the boss pair: an enemy spawned on one half that leaks on the other half\'s goal reads 1/1 in the published progress too', () => {
  const PAIR = [
    { playerId: 'L', seat: 0, side: 'L', colOffset: 0, units: [], bonds: {} },
    { playerId: 'R', seat: 1, side: 'R', colOffset: 8, units: [], bonds: {} },
  ];
  // route 3 of the flat boss stage: the centre gate (col 10, the left half's) → the right goal (col 18, the right half's)
  const h = makeBattle({ kind: 'boss', players: PAIR, enemies: [{ key: 'enemy_1007_slime', time: 0, route: 3 }], timeLimit: Infinity, content: 'none', autoFinish: true });
  h.runToEnd(120);
  const res = h.result();
  assert.equal(res.reason, 'cleared');
  assert.equal(res.perPlayer.L.total, 1, 'billed to the half it spawned on');
  assert.equal(res.perPlayer.R.leaked.length, 1, 'leaked on the other half');
  assert.deepEqual([res.perPlayer.L.resolved, res.perPlayer.R.resolved], [0, 0], 'each player\'s own clamp reads 0');
  assert.equal(res.resolved, 1, 'the field resolved it');

  const spec = buildBattleSpec({ battleId: 'mid-b', fieldId: 'b:pair', kind: 'boss', seed: 3, round: 8, players: PAIR,
    spawns: [{ time: 0, enemyKey: 'enemy_1007_slime', routeIndex: 3, count: 1 }], flags: { layerGainsEnabled: false } });
  const v = validateClientResult(spec, compactResult(res), { gd });
  assert.ok(v.ok, v.reason);
  assert.equal(v.result.resolved, 1);
  assert.deepEqual(doneView(v.result), { killed: 0, resolved: 1, total: 1, done: true });
});

test('a server-run 联防 field (a bot, a takeover) reads the same: Battle.result()\'s field-level number, and so does its timeline', () => {
  const spec = uniteCrossSpec();
  const run = runHeadless(newBattle(spec), { players: spec.players.map((p) => p.playerId) });
  const res = run.result;
  assert.equal(res.reason, 'cleared');
  assert.deepEqual(Object.values(res.perPlayer).map((p) => [p.total, p.leaked.length, p.resolved]).sort(), [[0, 1, 0], [1, 0, 0]], 'the lane crossed the midline');
  assert.equal(res.resolved, 1);
  assert.deepEqual(doneView(res), { killed: 0, resolved: 1, total: 1, done: true }, 'the done field of a server run');
  assert.equal(run.timeline[run.timeline.length - 1][3], 1, 'the live timeline sample of that field read 1 too');
  // SP_VERIFY compares a client result with the server's run: both go through the same validation
  assert.equal(validateClientResult(spec, compactResult(res), { gd }).result.resolved, 1);
});

test('validateClientResult: the field-level resolved is kept as reported (clamped to the field\'s total); the players\' own numbers are only the fallback', () => {
  const spec = uniteCrossSpec();
  const raw = compactResult(newBattle(spec).runToEnd(200));
  assert.equal(raw.resolved, 1);
  const checked = (edit) => {
    const r = clone(raw);
    edit(r);
    const v = validateClientResult(spec, r, { gd });
    assert.ok(v.ok, v.reason);
    return v.result;
  };
  assert.equal(checked(() => {}).resolved, 1, 'as the client reported it (the per-player numbers are both 0 here)');
  assert.equal(checked((r) => { r.resolved = 0; }).resolved, 0, 'a reported 0 is a value');
  assert.equal(checked((r) => { r.resolved = 99; }).resolved, 1, 'never above the field\'s total');
  // an older client (or a hand-made result) that reports no field-level number: the players' own, when every one has one
  assert.equal(checked((r) => { delete r.resolved; r.perPlayer.p_1.resolved = 1; }).resolved, 1, 'the fallback is the sum of the players\' own numbers');
  assert.equal(checked((r) => { delete r.resolved; r.perPlayer.p_1.resolved = 5; r.perPlayer.p_2.resolved = 5; }).resolved, 1, 'the fallback too is clamped to the total');
  // a number that is not a non-negative integer counts as not reported
  for (const junk of [-1, 0.5, '1', null, NaN]) assert.equal(checked((r) => { r.resolved = junk; r.perPlayer.p_1.resolved = 1; }).resolved, 1, `junk ${String(junk)} → the fallback`);
  // nothing reported anywhere, or one player without a number: absent — the teammate UI falls back to `killed`, never to a fabricated 0
  assert.equal('resolved' in checked((r) => { delete r.resolved; delete r.perPlayer.p_1.resolved; delete r.perPlayer.p_2.resolved; }), false);
  assert.equal('resolved' in checked((r) => { delete r.resolved; delete r.perPlayer.p_2.resolved; }), false);
  assert.equal(doneView(checked((r) => { delete r.resolved; delete r.perPlayer.p_1.resolved; delete r.perPlayer.p_2.resolved; })).resolved, null, 'm.public: null, not 0');
});

test('a finished field\'s progress: the result\'s field-level numerator wins, the players\' own are the fallback, a synthetic result keeps the field\'s live report', () => {
  const pp = (o) => ({ killed: 0, total: 3, leaked: [], perfect: true, layerGains: {}, coins: 0, ...o });
  // the field-level number wins over the players' own (a crossing field sums to less than it resolved)
  assert.deepEqual(doneView({ perPlayer: { a: pp({ total: 3, resolved: 0 }), b: pp({ total: 0, resolved: 0 }) }, resolved: 2 }), { killed: 0, resolved: 2, total: 3, done: true });
  assert.equal(doneView({ perPlayer: { a: pp({ resolved: 0 }) }, resolved: 9 }).resolved, 3, 'clamped to the published total');
  assert.equal(doneView({ perPlayer: { a: pp({ resolved: 0 }) }, resolved: 0 }).resolved, 0, 'a reported 0 is a value');
  // no field-level number: the sum of the players' own when every one reported, else unknown (never a fabricated 0)
  assert.equal(doneView({ perPlayer: { a: pp({ resolved: 1 }), b: pp({ resolved: 2 }) } }).resolved, 3);
  assert.equal(doneView({ perPlayer: { a: pp({ resolved: 1 }), b: pp({}) } }).resolved, null);
  assert.equal(doneView({ perPlayer: { a: pp({}) } }).resolved, null);
  // a synthetic result (the field could not run: zeroes everywhere) shows the last live report instead
  const synthetic = { synthetic: true, resolved: 0, perPlayer: { a: pp({ total: 0, resolved: 0 }) } };
  assert.deepEqual(doneView(synthetic, { killed: 2, total: 5, leaks: 0, resolved: 3 }), { killed: 2, resolved: 3, total: 5, done: true });
  assert.deepEqual(doneView(synthetic, { killed: 2, total: 5, leaks: 0, resolved: null }), { killed: 2, resolved: null, total: 5, done: true });
});
