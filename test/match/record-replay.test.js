// GitHub #104: a record rebuilds its match. tools/replay-record.mjs replays a record of this checkout from its seed, the
// seats' setup (records.js `setup`: the loadout) and every action: each shop roll and each round's LP / level as
// recorded, the same result; with --bot, the bot takes the seats over from a round and finishes the match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../server/match/Match.js';
import { VirtualScheduler } from '../../server/match/scheduler.js';
import { getData } from '../../server/data.js';
import { finishRecord } from '../../server/match/records.js';
import { replayRecord } from '../../tools/replay-record.mjs';

const QUIET = { info() {}, debug() {}, warn() {}, error() {} };
const DATA = getData({ log: QUIET });

/** A solo match of one offline human on AI 托管 with a loadout, recorded; returns the record. */
function recorded(seed, difficulty = 'FUNNY') {
  let summary = null;
  const seats = [{ seat: 0, playerId: 'h_0', name: 'H', isBot: false, connected: false, loadout: { chess_char_1_13_a: { skill: 0 } } }];
  const m = new Match({ roomCode: 'T104', mode: 'solo', difficulty, seats, seed, data: DATA, log: QUIET, scheduler: new VirtualScheduler(),
    clientCombat: false, record: true, send: () => true, broadcast: () => {}, onEnd: (s) => { summary = s; } });
  for (const ps of m.players.values()) ps.autoplay = true;
  m.start();
  for (let i = 0; i < 5e6 && !summary; i++) if (!m.sched.runNext()) break;
  assert.ok(summary, 'match ended');
  return finishRecord(m, summary);
}

test('a record keeps the seat setup (the loadout) and replays exactly: shop rolls, rounds, result', () => {
  const rec = recorded(11);
  assert.deepEqual(Object.keys(rec.seats[0].setup), ['loadout']);
  const out = replayRecord(rec, { data: DATA });
  assert.equal(out.diverged, null, JSON.stringify(out.diverged));
  assert.equal(out.replayed, rec.actions.length);
  assert.ok(out.checks.shops > 10 && out.checks.rounds > 5, JSON.stringify(out.checks));
  assert.deepEqual(out.result, { victory: rec.result.victory, roundsPassed: rec.result.roundsPassed, teamLp: rec.result.teamLp });
});

test('--until stops at that round\'s prep; --bot finishes the match from there', () => {
  const rec = recorded(12);
  const stop = replayRecord(rec, { data: DATA, until: 5 });
  assert.equal(stop.diverged, null);
  assert.deepEqual(stop.stopped, { phase: 'PREP', round: 5 });
  const lp = rec.rounds.find((r) => r.r === 4).seats.s0.lp;
  assert.equal(stop.seats[0].lp, lp, 'the LP the record had after round 4');
  const bot = replayRecord(rec, { data: DATA, until: 5, bot: 'legacy' });
  assert.ok(bot.result, 'the bot finished the match');
  assert.equal(bot.botFrom, 5);
  // Fish's seed re-randomisation: the same board continued on other seeds finishes too, and not always the same way
  const ends = [1, 2, 3].map((seed) => JSON.stringify(replayRecord(rec, { data: DATA, until: 5, bot: 'legacy', reseed: seed }).result));
  for (const e of ends) assert.notEqual(e, 'null');
});

test('a changed record diverges at the first difference', () => {
  const rec = recorded(13);
  const i = rec.actions.findIndex((a) => a.a === 'shop' && a.r === 3);
  rec.actions[i] = { ...rec.actions[i], ids: rec.actions[i].ids.slice().reverse() };
  const out = replayRecord(rec, { data: DATA });
  assert.equal(out.diverged?.round, 3);
  assert.match(out.diverged.why, /shop/);
});
