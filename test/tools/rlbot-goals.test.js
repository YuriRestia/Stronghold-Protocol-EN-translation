// rlbot #197 I5: the goal tracker (tools/rlbot-goals.mjs) reads a record's facts correctly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../server/match/Match.js';
import { VirtualScheduler } from '../../server/match/scheduler.js';
import { getData } from '../../server/data.js';
import { finishRecord, installRecorder } from '../../server/match/records.js';
import { factsOf, ALLIANCES, TRANSMITTER_IDS } from '../../tools/rlbot-goals.mjs';

const QUIET = { info() {}, debug() {}, warn() {}, error() {} };
const DATA = getData({ log: QUIET });

/** A real solo bot match (isBot: true, like botbench), recorded. */
function botRecord(seed, difficulty = 'FUNNY') {
  let summary = null;
  const seats = [{ seat: 0, playerId: 'ai_0', name: 'AI', isBot: true, connected: true }];
  const m = new Match({
    roomCode: 'GOALTEST', mode: 'solo', difficulty, seats, seed, data: DATA, log: QUIET, scheduler: new VirtualScheduler(),
    clientCombat: false, botStrategy: 'legacy', botStrategySeats: {},
    send: () => true, broadcast: () => {}, onEnd: (s) => { summary = s; },
  });
  installRecorder(m);
  m.start();
  for (let i = 0; i < 5e6 && !summary; i++) if (!m.sched.runNext()) break;
  assert.ok(summary, 'match ended');
  return finishRecord(m, summary);
}

test('ALLIANCES names every bondId real (server/data.js bonds)', () => {
  for (const id of Object.values(ALLIANCES)) assert.ok(DATA.bonds[id], id);
  assert.equal(Object.keys(ALLIANCES).length, 17, 'all 17 #197 Playstyle alliances');
});

test('TRANSMITTER_IDS names the real 信标 item ids', () => {
  for (const id of TRANSMITTER_IDS) assert.ok(DATA.items[id], id);
});

test('factsOf: one row per seat, with ultimate/victory/bonds/transmitterUses/funds read correctly', () => {
  const rec = botRecord(1, 'FUNNY');
  const [fact] = [...factsOf(rec)];
  assert.equal(fact.ultimate, false, 'FUNNY is not Ultimate');
  assert.equal(fact.players, 1);
  assert.equal(typeof fact.victory, 'boolean');
  assert.equal(typeof fact.lpLost, 'number');
  assert.equal(typeof fact.transmitterUses, 'number');
  assert.ok(fact.transmitterUses >= 0);
  assert.equal(typeof fact.fundsGame, 'number');
  assert.ok(fact.fundsGame >= 0);
  // every goal's bondOf(id) call must be safe even for an alliance never reached (bondsMeta.js only lists active ones)
  for (const id of Object.values(ALLIANCES)) {
    const b = fact.bondOf(id);
    assert.equal(typeof b.layers, 'number');
    assert.equal(typeof b.count, 'number');
  }
});

test('factsOf: ABYSS is Ultimate, and a co-op record yields one row per seat', () => {
  let summary = null;
  const seats = [0, 1].map((seat) => ({ seat, playerId: `ai_${seat}`, name: `AI${seat}`, isBot: true, connected: true }));
  const m = new Match({
    roomCode: 'GOALTEST2', mode: 'coop', difficulty: 'ABYSS', seats, seed: 2, data: DATA, log: QUIET, scheduler: new VirtualScheduler(),
    clientCombat: false, botStrategy: 'legacy', botStrategySeats: {},
    send: () => true, broadcast: () => {}, onEnd: (s) => { summary = s; },
  });
  installRecorder(m);
  m.start();
  for (let i = 0; i < 5e6 && !summary; i++) if (!m.sched.runNext()) break;
  const rec = finishRecord(m, summary);
  const facts = [...factsOf(rec)];
  assert.equal(facts.length, 2);
  for (const f of facts) { assert.equal(f.ultimate, true); assert.equal(f.players, 2); }
});
