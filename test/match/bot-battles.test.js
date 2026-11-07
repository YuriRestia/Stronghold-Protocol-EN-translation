// test/match/bot-battles.test.js — (fork) piece 8 of docs/host-browser-bots.md: a field no connected human plays runs in a
// human's browser, never on the server. Run: node --test test/match/bot-battles.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_TIMELINE_MAX, validateC2S } from '../../shared/protocol.js';
import { BOT_HOST_STRIKES } from '../../server/match/match/botBattles.js';
import { createBotBattleRun } from '../../server/match/botBattleRun.js';
import { seatHash } from '../../server/match/botWorld.js';
import { simMeter } from '../../server/match/simMeter.js';
import { DataSource } from '../../server/sim/simdata.js';
import { attachFakeBattleHost, wire } from './fakeBotHost.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch } from './harness.js';

const human = (seat, connected = true) => ({ seat, playerId: `p_${seat}`, name: `P${seat}`, isBot: false, connected });
const bot = (seat) => ({ seat, playerId: `ai_${seat}`, name: `A${seat}`, isBot: true, connected: true });
const SEATS = [human(0), human(1), bot(2), bot(3)];
const DS = new DataSource(DATA, null);

/** A match stopped at its first combat, with its server runs counted. */
function atCombat(o = {}) {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats: SEATS, seed: 3, fake: true, clientCombat: true, hostId: 'p_0', botBattles: 'host', botBattleAnswerMs: 1000, ...o });
  h.serverRuns = [];
  const real = h.m._runOnServer;
  h.m._runOnServer = function count(f, why) { h.serverRuns.push([f.fieldId, why]); return real.call(this, f, why); };
  h.autoHumans().start();
  h.runToPhase('COMBAT', 1);
  return h;
}
const botFields = (h) => h.m.fields.filter((f) => f.players.every((pid) => h.m.players.get(pid).isBot));
const fakeAnswer = (f) => {
  const run = createBotBattleRun(f.spec, { ds: DS, BattleClass: FakeBattle });
  run.run();
  return wire({ t: 'b.botBattleResult', battleId: f.battleId, ...run.output() });
};

test('off by default: a bot field stays on the server and no frame goes out', () => {
  const h = atCombat({ botBattles: undefined });
  assert.equal(h.m.botBattles, 'server');
  assert.equal(h.allTo('p_0', 'b.botBattle').length, 0);
  assert.ok(h.serverRuns.length > 0);
  h.m.dispose();
});

test('a bot field goes to the room\'s host; its result becomes a finished server run, released at the natural end', () => {
  const h = atCombat();
  const fields = botFields(h);
  assert.ok(fields.length > 0);
  assert.equal(h.serverRuns.length, 0);
  assert.equal(h.allTo('p_0', 'b.botBattle').length, fields.length);
  assert.equal(h.allTo('p_1', 'b.botBattle').length, 0);
  const f = fields[0];
  assert.equal(f.mode, 'host');
  assert.equal(f.authority, null);
  assert.deepEqual(h.lastTo('p_0', 'b.botBattle').spec.players.length > 0, true);
  const msg = fakeAnswer(f);
  assert.equal(validateC2S(msg), null);
  h.m.handle('p_0', msg);
  assert.equal(f.mode, 'server');
  assert.equal(f.resultSource, 'host');
  assert.equal(f.endGt, msg.result.time);
  assert.ok(Array.isArray(f.timeline) && f.timeline.length > 0);
  assert.equal(f.done, false, 'held until the battle\'s natural end');
  assert.ok(f.doneTimer);
  h.run(() => f.done);
  assert.equal(f.result.time, msg.result.time);
  h.m.dispose();
});

test('only the executor can answer, and a second answer changes nothing', () => {
  const h = atCombat();
  const f = botFields(h)[0];
  const msg = fakeAnswer(f);
  h.m.handle('p_1', msg);
  assert.equal(f.mode, 'host', 'another sender');
  assert.equal(f.executor, 'p_0');
  h.m.handle('p_0', msg);
  assert.equal(f.resultSource, 'host');
  const { result } = f;
  h.m.handle('p_0', { ...msg, result: { ...msg.result, time: 1 } });
  assert.equal(f.result, result);
  assert.equal(h.allTo('p_1', 'b.botBattle').length, 0);
  h.m.dispose();
});

test('a refused result or a browser that cannot run it goes to the next human, then to a synthetic result', () => {
  const h = atCombat();
  const f = botFields(h)[0];
  h.m.handle('p_0', { t: 'b.botBattleResult', battleId: f.battleId, error: true });
  assert.equal(f.executor, 'p_1');
  assert.equal(h.allTo('p_1', 'b.botBattle').length, 1);
  const bad = fakeAnswer(f);
  bad.result.perPlayer = { nobody: bad.result.perPlayer[f.players[0]] };
  h.m.handle('p_1', bad);
  assert.equal(f.executor, null);
  assert.equal(f.resultSource, 'none');
  assert.ok(f.result.synthetic);
  assert.equal(h.m.botBattleStats.synthetic, 1);
  assert.equal(h.serverRuns.length, 0);
  h.m.dispose();
});

test('silence: told to stop, the next human asked; after enough timeouts a human is not asked again', () => {
  const h = atCombat();
  const fields = botFields(h);
  h.sched.advance(1001);
  assert.ok(h.allTo('p_0', 'b.botBattleCancel').length >= fields.length);
  assert.ok(fields.every((f) => f.executor === 'p_1'));
  assert.equal(h.m._botHostStrikes.get('p_0'), fields.length);
  if (fields.length >= BOT_HOST_STRIKES) assert.ok(h.m._botHostDemoted.has('p_0'));
  h.sched.advance(1001);
  assert.ok(fields.every((f) => f.result && f.result.synthetic));
  assert.equal(h.serverRuns.length, 0);
  h.m.dispose();
});

test('an executor who disconnects or leaves loses the field at once', () => {
  const h = atCombat();
  const f = botFields(h)[0];
  h.m.onDisconnect('p_0');
  assert.equal(f.executor, 'p_1');
  h.m.onLeave('p_1');
  assert.equal(f.executor, null);
  assert.ok(f.result.synthetic);
  h.m.dispose();
});

test('a battle still running when its field stops is cancelled, and a late answer is ignored', () => {
  const h = atCombat();
  const f = botFields(h)[0];
  const msg = fakeAnswer(f);
  h.m._stopClientCombat();
  assert.ok(h.allTo('p_0', 'b.botBattleCancel').some((x) => x.battleId === f.battleId));
  h.m.handle('p_0', msg);
  assert.equal(f.result, null);
  h.m.dispose();
});

test('nobody connected: no thinking and no simulating on the server', () => {
  const h = atCombat({ seats: [human(0, false), bot(1), bot(2), bot(3)] });
  assert.ok(h.m.fields.length > 0);
  assert.equal(h.serverRuns.length, 0);
  assert.ok(h.m.botBattleStats.synthetic >= 3);
  h.m.dispose();
});

test('every kind of room goes to a browser: a plugin room\'s frame names its content, a vanilla room\'s does not', () => {
  const plugin = atCombat({ cs: 'a'.repeat(64), requireCs: true });
  assert.equal(plugin.serverRuns.length, 0);
  const frames = plugin.allTo('p_0', 'b.botBattle');
  assert.ok(frames.length > 0);
  assert.ok(frames.every((m) => m.cs === 'a'.repeat(64) && !('cs' in m.spec)));
  plugin.m.dispose();
  // every vanilla room has a `cs` too, the official content's hash: the Worker loads the official data
  const vanilla = atCombat({ cs: 'b'.repeat(64) });
  assert.equal(vanilla.serverRuns.length, 0);
  const plain = vanilla.allTo('p_0', 'b.botBattle');
  assert.ok(plain.length > 0);
  assert.ok(plain.every((m) => !('cs' in m) && !('cs' in m.spec)));
  vanilla.m.dispose();
});

test('the wire: a timeline of real samples passes, a malformed or oversized one does not', () => {
  const base = { t: 'b.botBattleResult', battleId: 'b.1.1' };
  assert.equal(validateC2S({ ...base, error: true }), null);
  assert.equal(validateC2S({ ...base, timeline: [[0, 0, 5, null], [1, 2, 5, 2, { p_0: 3 }]], error: true }), null);
  assert.notEqual(validateC2S({ ...base, timeline: [[0, 0, 5]] }), null);
  assert.notEqual(validateC2S({ ...base, timeline: [[0, 0, 5, 'x']] }), null);
  assert.notEqual(validateC2S({ ...base, timeline: Array(BOT_TIMELINE_MAX + 1).fill([0, 0, 5, null]) }), null);
});

test('a real battle\'s answer fits the wire, its timeline ends on the final state', () => {
  const h = atCombat({ fake: false });
  const f = botFields(h)[0];
  const run = createBotBattleRun(f.spec, { ds: DS });
  assert.equal(run.run(), true);
  const out = wire(run.output());
  assert.equal(validateC2S({ t: 'b.botBattleResult', battleId: f.battleId, ...out }), null);
  assert.ok(out.timeline.length <= BOT_TIMELINE_MAX);
  assert.equal(out.timeline.at(-1)[0], out.result.time);
  h.m.dispose();
});

/** The whole game of one seed: real battles in the browser's place. The server's own headless time is counted. */
function play({ host, seed, seats, stopRound }) {
  let serverHeadless = 0;
  let inHost = false;
  const add = simMeter.add;
  simMeter.add = function metered(kind, ms) {
    if (kind === 'headless' && !inHost) serverHeadless++;
    return add.call(this, kind, ms);
  };
  try {
    const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats, seed, clientCombat: true, hostId: 'p_0', verify: 'off', ...(host ? { botBattles: 'host' } : {}) });
    const fake = host ? attachFakeBattleHost(h, { ds: DS, around: (fn) => { inHost = true; try { return fn(); } finally { inHost = false; } } }) : null;
    h.autoHumans().start();
    const rows = [];
    let key = '';
    h.run(() => {
      const k = `${h.m.phase}:${h.m.round}`;
      if (k !== key) {
        key = k;
        if (h.m.phase === 'COMBAT') rows.push(JSON.stringify([h.m.round, h.m.uidSeq, h.m.order.map((p) => [seatHash(p), p.funds, p.lp])]));
      }
      return h.ended != null || h.m.round > stopRound;
    }, { maxSteps: 2e7 });
    const stats = { ...h.m.botBattleStats };
    h.m.dispose();
    return { rows, stats, serverHeadless, frames: fake?.frames ?? 0 };
  } finally {
    simMeter.add = add;
  }
}

test('same seed: the game is the same when bot battles run in the browser, and the server simulates none of them', { timeout: 300000 }, () => {
  const seats = [human(0), bot(1), bot(2), bot(3)];
  const local = play({ host: false, seed: 11, seats, stopRound: 10 });
  const hosted = play({ host: true, seed: 11, seats, stopRound: 10 });
  assert.ok(local.rows.length >= 8, `${local.rows.length} combats`);
  assert.ok(local.serverHeadless > 0, 'the control does simulate on the server');
  assert.equal(hosted.serverHeadless, 0);
  assert.ok(hosted.frames >= 3 * 8, `${hosted.frames} bot battles`);
  assert.deepEqual(hosted.stats, { sent: hosted.frames, done: hosted.frames, rejected: 0, timeouts: 0, synthetic: 0 });
  assert.deepEqual(hosted.rows, local.rows);
});
