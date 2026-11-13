// test/match/unite-ai-helper.test.js — (fork) live report 2026-11-13: an 8-player Grand Alliance stuck at "Uniting", the
// countdown at 00, when the only perfect player (the 联防's only helper) was a dropped seat the AI played. Run:
// node --test test/match/unite-ai-helper.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBotBattleRun } from '../../server/match/botBattleRun.js';
import { DataSource } from '../../server/sim/simdata.js';
import { wire } from './fakeBotHost.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch } from './harness.js';
import { validateC2S } from '../../shared/protocol.js';
import { BOT_FIELD_MAX_EXECUTORS } from '../../server/match/match/botBattles.js';

const DS = new DataSource(DATA, null);
const human = (seat, connected = true) => ({ seat, playerId: `p_${seat}`, name: `P${seat}`, isBot: false, connected });
const enemyKey = Object.keys(DATA.enemies).find((k) => DATA.enemies[k].stats?.maxHp > 0 && !DATA.enemies[k].tokenOnly);

/** An 8-seat room at round 1's combat whose seat 8 dropped; the 联防 is started with that seat as its only helper. */
function uniteWithDroppedHelper(o = {}) {
  const seats = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => human(i, i !== 7));
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats, seed: 3, fake: true, largeRoom: true, clientCombat: true, hostId: 'p_0', botBattles: 'host', botBattleAnswerMs: 1000, ...o });
  h.autoHumans().start();
  h.runToPhase('COMBAT', 1);
  const m = h.m;
  m._stopClientCombat();
  m.fields = [];
  const helper = m.players.get('p_7');
  const leakers = [0, 1, 2, 3, 4, 5, 6].map((i) => m.players.get(`p_${i}`));
  const leaked = leakers.map((ps) => ({ enemyKey, mods: null, lpr: 1, sourcePlayerId: ps.playerId, tag: null, bounty: null }));
  m.startUnite({ helpers: [helper], leakers, leaked, notReentered: new Map() });
  return h;
}

test('a 联防 whose only helper is a dropped seat goes to a browser and ends', () => {
  const h = uniteWithDroppedHelper();
  const m = h.m;
  assert.equal(m.phase, 'UNITE');
  const f = m.fields[0];
  assert.equal(f.kind, 'unite');
  assert.equal(f.mode, 'host', 'a browser runs it');
  const frame = h.allTo(f.executor, 'b.botBattle').find((x) => x.battleId === f.battleId);
  assert.ok(frame, 'the executor was asked');
  const run = createBotBattleRun(frame.spec, { ds: DS, BattleClass: FakeBattle });
  run.run();
  m.handle(f.executor, wire({ t: 'b.botBattleResult', battleId: f.battleId, ...run.output() }));
  assert.equal(f.resultSource, 'host', 'the answer was accepted');
  h.run(() => m.phase !== 'UNITE', { maxSteps: 2000 });
  assert.notEqual(m.phase, 'UNITE', 'the 联防 ended');
  m.dispose();
});

// Live 2026-11-13 (room FKCJ, 8 players, R8): 7 browsers in a row "did not answer". They had answered, but the timeline's
// per-leaker `left` map held 7 players and shared/protocol.js RESULT_LIMITS.players was 4: validateC2S refused every
// b.botBattleResult (server/net.js answers BAD_MSG and logs nothing), so the match never saw one.
test('an 8-player 联防 answer from a browser (real battle, 7 leakers) passes the wire schema and is accepted', () => {
  const h = uniteWithDroppedHelper();
  const m = h.m;
  const f = m.fields[0];
  const frame = h.allTo(f.executor, 'b.botBattle').find((x) => x.battleId === f.battleId);
  const run = createBotBattleRun(frame.spec, { ds: DS }); // the real Battle, as the Worker runs it
  assert.equal(run.run(), true, 'the battle ran to its end');
  const msg = wire({ t: 'b.botBattleResult', battleId: f.battleId, ...run.output() });
  assert.ok(msg.timeline.some((s) => s[4] && Object.keys(s[4]).length > 4), 'the timeline names more than 4 leakers');
  assert.equal(validateC2S(msg), null, 'the frame passes the schema');
  // a 联防 with 8 helpers: b.result's perPlayer holds 8 players too (a 9th never exists)
  const pp = Object.values(msg.result.perPlayer)[0];
  const withPlayers = (n) => ({ t: 'b.result', battleId: f.battleId, result: { ...msg.result, perPlayer: Object.fromEntries(Array.from({ length: n }, (_, i) => [`p_${i}`, pp])) } });
  assert.equal(validateC2S(withPlayers(8)), null, '8 helpers pass');
  assert.notEqual(validateC2S(withPlayers(9)), null, 'a 9th player does not');
  m.handle(f.executor, msg);
  assert.equal(f.resultSource, 'host', 'the answer was accepted');
  m.dispose();
});

// 2026-11-13: server/sim/spec.js compactResult kept 4 players, so a 联防 with 5+ helpers answered with 4 of them and
// validateClientResult refused it ('players'): a human authority's field went to the server, a bot field to the synthetic result.
test('a 联防 with 5 helpers: the browser result names all 5 and is accepted', () => {
  const seats = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => human(i, i < 3)); // seats 3–7 dropped: their 联防 runs in a browser
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats, seed: 3, fake: true, largeRoom: true, clientCombat: true, hostId: 'p_0', botBattles: 'host', botBattleAnswerMs: 1000 });
  h.autoHumans().start();
  h.runToPhase('COMBAT', 1);
  const m = h.m;
  m._stopClientCombat();
  m.fields = [];
  const helpers = [3, 4, 5, 6, 7].map((i) => m.players.get(`p_${i}`));
  const leakers = [0, 1, 2].map((i) => m.players.get(`p_${i}`));
  m.startUnite({ helpers, leakers, leaked: leakers.map((ps) => ({ enemyKey, mods: null, lpr: 1, sourcePlayerId: ps.playerId, tag: null, bounty: null })), notReentered: new Map() });
  const f = m.fields[0];
  assert.equal(f.mode, 'host');
  const frame = h.allTo(f.executor, 'b.botBattle').find((x) => x.battleId === f.battleId);
  const run = createBotBattleRun(frame.spec, { ds: DS });
  assert.equal(run.run(), true);
  const msg = wire({ t: 'b.botBattleResult', battleId: f.battleId, ...run.output() });
  assert.equal(Object.keys(msg.result.perPlayer).length, 5, 'all 5 helpers are in the result');
  assert.equal(validateC2S(msg), null);
  m.handle(f.executor, msg);
  assert.equal(f.resultSource, 'host', 'the answer was accepted');
  m.dispose();
});

test('wire schema: 8-player maps pass in b.progress, a 9th player does not', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `p_${i}`);
  const map = (n, v) => Object.fromEntries(ids(n).map((id) => [id, v]));
  const progress = (n) => ({ t: 'b.progress', battleId: 'bt_1', gt: 1, killed: 0, total: 8, left: map(n, 1), by: map(n, 1), leaksBy: map(n, 1) });
  assert.equal(validateC2S(progress(8)), null);
  assert.notEqual(validateC2S(progress(9)), null);
});

test('a 联防 whose only helper is a dropped seat ends even when no browser answers', () => {
  const h = uniteWithDroppedHelper();
  const m = h.m;
  const f = m.fields[0];
  h.run(() => m.phase !== 'UNITE', { maxSteps: 5000 });
  assert.notEqual(m.phase, 'UNITE', 'the 联防 ended');
  // at most BOT_FIELD_MAX_EXECUTORS browsers (live: 7 in a row, 30 s each), then the synthetic result
  assert.equal(f.botTried.size, BOT_FIELD_MAX_EXECUTORS, `${BOT_FIELD_MAX_EXECUTORS} browsers asked, of 7 connected`);
  assert.equal(h.logs.warn.filter((l) => l.includes('did not answer')).length, BOT_FIELD_MAX_EXECUTORS);
  assert.ok(h.logs.warn.some((l) => l.includes(`nobody can run this bot battle (${BOT_FIELD_MAX_EXECUTORS} browsers tried)`)));
  assert.equal(f.resultSource, 'none');
  m.dispose();
});

// The watchdog (server/match/match/unitePhase.js _armUniteWatchdog): every step that ends the 联防 runs in a guarded timer
// (infra.js guard swallows an exception), so one throw used to leave the match in UNITE for good, the countdown at 00.
test('watchdog: the 联防 end throws once (in _afterUnite) — the match still settles and reaches the next prep', () => {
  const h = uniteWithDroppedHelper();
  const m = h.m;
  const real = m._afterUnite;
  let throws = 1;
  m._afterUnite = function boom(plan, res) { if (throws-- > 0) throw new Error('test: the 联防 end failed'); return real.call(this, plan, res); };
  h.run(() => m.phase !== 'UNITE', { maxSteps: 20000 });
  assert.notEqual(m.phase, 'UNITE', 'the watchdog ended the 联防');
  assert.ok(h.logs.error.some((l) => l.includes('test: the 联防 end failed')), 'the throw was logged');
  assert.ok(h.logs.warn.some((l) => l.includes('overdue')), 'the watchdog said so');
  h.runToPhase('PREP', 2);
  m.dispose();
});

test('watchdog: a client 联防 field whose authority never reports (and whose deadline timer is lost) still ends', () => {
  const seats = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => human(i));
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats, seed: 3, fake: true, largeRoom: true, clientCombat: true, clients: false, hostId: 'p_0', botBattles: 'host', botBattleAnswerMs: 1000 });
  h.autoHumans().start();
  h.runToPhase('COMBAT', 1);
  const m = h.m;
  m._stopClientCombat();
  m.fields = [];
  const leakers = [0, 1, 2, 3, 4, 5, 6].map((i) => m.players.get(`p_${i}`));
  m.startUnite({ helpers: [m.players.get('p_7')], leakers, leaked: leakers.map((ps) => ({ enemyKey, mods: null, lpr: 1, sourcePlayerId: ps.playerId, tag: null, bounty: null })), notReentered: new Map() });
  const f = m.fields[0];
  assert.equal(f.mode, 'client');
  assert.equal(f.authority, 'p_7');
  m.cancel(f.deadlineTimer); // the authority deadline is gone too: only the watchdog is left
  f.deadlineTimer = null;
  // a hold (pause.js _freezeBattle) stops the watchdog's clock too; the release re-arms what it had left
  assert.equal(m._freezeBattle().ok, true);
  assert.equal(m._uniteWatchdog, null, 'held');
  h.sched.advance(10 * 60 * 1000);
  assert.equal(m.phase, 'UNITE', 'nothing ended during the hold');
  m._resume();
  assert.ok(m._uniteWatchdog, 'the release re-armed it');
  h.run(() => m.phase !== 'UNITE', { maxSteps: 20000 });
  assert.notEqual(m.phase, 'UNITE', 'the watchdog ended the 联防');
  assert.equal(f.resultSource, 'none', 'a synthetic result: the leakers are charged their own leaks');
  m.dispose();
});

test('watchdog: a 联防 that ends normally leaves no watchdog behind', () => {
  const h = uniteWithDroppedHelper();
  const m = h.m;
  h.run(() => m.phase !== 'UNITE', { maxSteps: 5000 });
  assert.equal(m._uniteWatchdog, null);
  assert.ok(!h.logs.warn.some((l) => l.includes('overdue')), 'no overdue warning on the normal path');
  m.dispose();
});
