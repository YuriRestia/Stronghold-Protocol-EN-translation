// SHELVED (2026-11-11): External AI is shelved in this fork, so no suite runs this file (test/shelved/README.md).
// The External AI cases split out of test/match/bot-strategy-seats.test.js.
/* eslint-disable no-unused-vars -- the split-out cases keep their source file's whole import header */
// #816 P1: per-seat strategy overrides (SP_BOT_STRATEGY_SEATS / opts.botStrategySeats). The default match keeps
// one strategy object for every seat; a seat override changes only that seat's hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_BOT, defineBotStrategy } from '../../../server/match/botStrategyContract.js';
import { getBotStrategy, getBotStrategySeats } from '../../../server/match/botStrategies.js';
import { replayTestMatch, decodeTestTrace } from '../../../server/match/testReplay.js';
import { makeMatch, checkInvariants, giveItem, DATA } from '../../match/harness.js';
import { FakeBattle } from '../../match/fakeBattle.js';

const ENV = ['SP_BOT_STRATEGY', 'SP_BOT_STRATEGY_SEATS'];
/** Clear both variables for the test and restore them afterwards. */
function cleanEnv(t) {
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  t.after(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
}
const bots = (opts = {}) => makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 0, bots: 3, seed: 7, fake: true, ...opts });
const journalLog = (entries) => ({ info(line) {
  if (line.startsWith('[test-input ')) entries.push(JSON.parse(line.slice(line.indexOf(']') + 2)));
} });

test('one external seat creates the one external host; only that seat asks it, within SP_EXTERNAL_AI_SEATS', (t) => {
  cleanEnv(t);
  const none = bots();
  t.after(() => none.m.dispose());
  assert.equal(none.m.externalAI, null);
  for (const [externalAI, asked] of [[undefined, [1]], [{ seats: [0, 1] }, [1]], [{ seats: [0] }, []]]) {
    const h = bots({ botStrategySeats: { 1: 'external' }, externalReplay: true, externalAI });
    t.after(() => h.m.dispose());
    const { m } = h;
    assert.ok(m.externalAI);
    const seats = [];
    const start = m.externalAI.start.bind(m.externalAI);
    m.externalAI.start = (ps, decision) => { seats.push(ps.seat); return start(ps, decision); };
    h.start();
    assert.ok(h.run(() => m.phase === 'BAND_DRAFT' && m.order.every((ps) => ps.bandId || m.externalAI.jobs.size > 0)));
    assert.deepEqual([...new Set(seats)], [1], JSON.stringify(externalAI));
    assert.deepEqual([...m.externalAI.states.keys()].map((id) => m.players.get(id).seat), asked);
  }
});
