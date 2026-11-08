// test/match/bot-boss.test.js — (fork) piece 9 of docs/host-browser-bots.md: a boss field of bots only runs live in a human's
// browser. It reports as a human's battle does, and the server simulates nothing. Run: node --test test/match/bot-boss.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateC2S } from '../../shared/protocol.js';
import { createBotBossRun } from '../../server/match/botBattleRun.js';
import { BOSS_SILENCE_MS, validateClientResult } from '../../server/match/fields.js';
import { simMeter } from '../../server/match/simMeter.js';
import { DataSource } from '../../server/sim/simdata.js';
import { attachFakeBattleHost, wire } from './fakeBotHost.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch } from './harness.js';

const human = (seat) => ({ seat, playerId: `p_${seat}`, name: `P${seat}`, isBot: false, connected: true });
const bot = (seat) => ({ seat, playerId: `ai_${seat}`, name: `A${seat}`, isBot: true, connected: true });
const DS = new DataSource(DATA, null);
const botOnly = (h) => h.m.fields.find((f) => f.players.every((pid) => h.m.players.get(pid).isBot));

/** A match driven to its Final Assault with a bot-only boss field. `script` sets how the boss fight goes. */
function atFinal({ seats = [human(0), bot(1), bot(2), bot(3)], script = (b) => (b.kind === 'boss' ? { bossDps: 200 } : { duration: 2 }), seed = 9108, botBattles = 'host', mute = null } = {}) {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', seats, seed, fake: true, clientCombat: true, instant: false, hostId: 'p_0', script, botBattles, botBattleAnswerMs: 1000 });
  h.serverRuns = [];
  const real = h.m._runOnServer;
  h.m._runOnServer = function count(f, why) { h.serverRuns.push([f.fieldId, why]); return real.call(this, f, why); };
  h.fake = attachFakeBattleHost(h, { ds: DS, BattleClass: FakeBattle });
  h.fake.mute = mute;
  h.autoHumans().start();
  assert.ok(h.drive(() => h.m.phase === 'FINAL_ASSAULT'), `reached ${h.m.phase}`);
  return h;
}

test('off by default: a bot-only boss field stays on the server', () => {
  const h = atFinal({ botBattles: 'server' });
  const f = botOnly(h);
  assert.ok(f);
  assert.equal(f.mode, 'server');
  assert.ok(h.serverRuns.some(([id]) => id === f.fieldId));
  h.m.dispose();
});

test('a bot-only boss field goes to the host live; its reports count like any authority\'s, and the server runs nothing', () => {
  const add = simMeter.add;
  let onServer = 0;
  const h = atFinal();
  const f = botOnly(h);
  assert.equal(f.mode, 'client');
  assert.equal(f.authority, 'p_0');
  assert.equal(f.botHost, true);
  const frame = h.allTo('p_0', 'b.botBattle').find((m) => m.battleId === f.battleId);
  assert.ok(frame.live);
  assert.equal(frame.live.speed, h.m.gameSpeed);
  assert.deepEqual(h.serverRuns, []);
  assert.equal(h.m.pacer ?? null, null, 'no server pacer');
  simMeter.add = function metered(kind, ms) { if (kind === 'boss') onServer++; return add.call(this, kind, ms); };
  const hp = h.m.bossPool.hp;
  try {
    h.sched.advance(5000);
  } finally { simMeter.add = add; }
  assert.ok(h.fake.reports > 0);
  assert.ok(f.bossAcked > 0, 'its damage reached the shared pool');
  assert.ok(h.m.bossPool.hp < hp);
  assert.equal(onServer, 0);
  assert.deepEqual(h.serverRuns, []);
  h.m.dispose();
});

test('the whole Final Assault: the bot field\'s result is taken, the match goes on, and nothing ran on the server', () => {
  const h = atFinal({ script: (b) => (b.kind === 'boss' ? { bossDps: 20000 } : { duration: 2 }) });
  const f = botOnly(h);
  assert.ok(h.run(() => h.m.phase !== 'FINAL_ASSAULT' || f.done, { maxSteps: 3e6 }));
  assert.ok(f.done);
  assert.equal(f.resultSource, 'client');
  assert.deepEqual(h.serverRuns, []);
  assert.deepEqual(h.logs.error, []);
  h.m.dispose();
});

/** Two humans and a pair of bots: a seed whose pairing leaves a field of bots only. */
function twoHumans(mute = null) {
  for (let seed = 9200; seed < 9240; seed++) {
    const h = atFinal({ seats: [human(0), human(1), bot(2), bot(3)], seed, mute });
    if (botOnly(h)) return h;
    h.m.dispose();
  }
  throw new Error('no seed pairs the bots together');
}

test('a silent executor: a strike, told to stop, and the next human starts on the field\'s clock', () => {
  const h = twoHumans((pid) => pid === 'p_0');
  const f = botOnly(h);
  assert.equal(f.authority, 'p_0');
  h.sched.advance(BOSS_SILENCE_MS + 500);
  assert.equal(f.authority, 'p_1');
  assert.equal(h.m._botHostStrikes.get('p_0'), 1);
  assert.ok(h.allTo('p_0', 'b.end').some((m) => m.battleId === f.battleId && m.reason === 'takeover'));
  const frame = h.allTo('p_1', 'b.botBattle').find((m) => m.battleId === f.battleId);
  assert.ok(frame.live.elapsed > 0, 'not from zero');
  assert.deepEqual(h.serverRuns, []);
  h.m.dispose();
});

test('an executor that disconnects or goes hidden loses the field at once; with nobody left, what it has so far stands', () => {
  const h = twoHumans();
  const f = botOnly(h);
  h.sched.advance(1000);
  h.m.handle('p_0', { t: 'b.botHidden', hidden: true });
  assert.equal(f.authority, 'p_1');
  h.m.onDisconnect('p_1');
  assert.ok(f.result?.synthetic || f.done, 'no human left to ask');
  assert.deepEqual(h.serverRuns, []);
  h.m.dispose();
});

test('an implausible result moves the field on, and only the executor can report', () => {
  const h = twoHumans((pid) => pid === 'p_0');
  const f = botOnly(h);
  h.m.handle('p_1', { t: 'b.progress', battleId: f.battleId, gt: 1, killed: 0, total: 1, bossDmg: 1e6 });
  assert.equal(f.bossAcked, 0, 'another sender');
  h.m.handle('p_0', { t: 'b.result', battleId: f.battleId, result: { reason: 'forced', time: 0, perPlayer: {} } });
  assert.equal(f.authority, 'p_1');
  assert.ok(h.m.botBattleStats.rejected >= 1);
  h.m.dispose();
});

test('the Final Assault ending tells the executor, even though it is not one of the field\'s players', () => {
  const h = twoHumans((pid) => pid === 'p_0');
  const f = botOnly(h);
  assert.ok(!f.players.includes('p_0'));
  h.m._endFinal('forced');
  assert.ok(h.allTo('p_0', 'b.end').some((m) => m.battleId === f.battleId && m.reason === 'forced'));
  h.m.dispose();
});

test('every field of bots, a human still connected: the host runs them all; nobody connected: only the fields of the absent human run on the server', () => {
  const h = atFinal();
  assert.deepEqual(h.serverRuns, []);
  h.m.dispose();
  const gone = makeMatch({ mode: 'coop', difficulty: 'FUNNY', seats: [{ ...human(0), connected: false }, bot(1), bot(2), bot(3)], seed: 9108, fake: true, clientCombat: true,
    instant: false, script: (b) => (b.kind === 'boss' ? { bossDps: 200 } : { duration: 2 }), botBattles: 'host' });
  gone.serverRuns = [];
  const real = gone.m._runOnServer;
  gone.m._runOnServer = function count(f, why) { gone.serverRuns.push([f.fieldId, why]); return real.call(this, f, why); };
  gone.autoHumans().start();
  const theirs = new Set();
  gone.m._runOnServer = function count(f, why) { gone.serverRuns.push([f.fieldId, why]); if (f.players.includes('p_0')) theirs.add(f.fieldId); return real.call(this, f, why); };
  gone.drive(() => gone.m.phase === 'FINAL_ASSAULT' || gone.ended != null, { maxSteps: 3e6 });
  // a disconnected human may come back: their fields stay the server's (dev-0.2's rule), the bots' never are
  assert.ok(gone.serverRuns.length > 0);
  assert.deepEqual(gone.serverRuns.filter(([id]) => !theirs.has(id)), []);
  assert.equal(gone.m.runner ?? null, null);
  gone.m.dispose();
});

test('a real boss battle\'s reports and result fit the wire and the server\'s checks', () => {
  const h = atFinal();
  const f = botOnly(h);
  const { cs: _cs, ...spec } = wire(f.spec);
  h.m.dispose();
  const run = createBotBossRun(spec, { ds: DS, battleId: f.battleId });
  run.stepTo(3);
  assert.equal(validateC2S({ t: 'b.progress', ...wire(run.progress()) }), null);
  run.syncPool(spec.boss.poolHp, 0);
  run.forceEnd('forced');
  assert.equal(run.finished, true);
  const result = wire(run.result());
  assert.equal(validateC2S({ t: 'b.result', battleId: f.battleId, result }), null);
  const v = validateClientResult(spec, result, { gd: h.m.gd });
  assert.equal(v.ok, true, v.reason);
});

/** Seat 1 shares its boss field with a bot (seed 9108: p_1 + ai_3, p_1 its authority). */
function atFinalWithPartner() {
  const h = atFinal({ seats: [human(0), human(1), bot(2), bot(3)] });
  const f = h.m.fields.find((x) => x.players.includes('p_1'));
  assert.deepEqual([...f.players].sort(), ['ai_3', 'p_1']);
  assert.equal(f.authority, 'p_1');
  assert.equal(f.botHost ?? false, false);
  return { h, f };
}

test('a field whose human LEFT the match goes to a browser like a bot field, live from the field\'s clock', () => {
  const { h, f } = atFinalWithPartner();
  h.sched.advance(2000);
  h.m.onLeave('p_1');
  assert.equal(h.m.players.get('p_1').left, true);
  assert.equal(f.botHost, true);
  assert.equal(f.authority, 'p_0');
  const frame = h.allTo('p_0', 'b.botBattle').find((m) => m.battleId === f.battleId);
  assert.ok(frame && frame.live && frame.live.elapsed > 0, 'started on the field\'s clock');
  assert.ok(!h.serverRuns.some(([id]) => id === f.fieldId), 'not simulated on the server');
  // a left player cannot come back, so nothing hands it back
  h.m.onReconnect?.('p_1');
  assert.equal(h.m.players.get('p_1').connected, false);
  h.m.dispose();
});

test('a field whose human is only disconnected stays on the server: that human may come back', () => {
  const { h, f } = atFinalWithPartner();
  h.sched.advance(2000);
  h.m.onDisconnect('p_1');
  assert.equal(f.botHost ?? false, false);
  assert.ok(h.serverRuns.some(([id, why]) => id === f.fieldId && why === 'disconnect'));
  assert.ok(!h.allTo('p_0', 'b.botBattle').some((m) => m.battleId === f.battleId), 'no browser runs it');
  h.m.dispose();
});
