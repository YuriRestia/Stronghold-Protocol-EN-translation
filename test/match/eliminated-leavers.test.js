// test/match/eliminated-leavers.test.js — (fork) a player who leaves the match (g.leave, room.leave, the end of the rejoin
// window, a Grand Alliance idle removal) is eliminated in every room type (user, 2026-11-11). A battle they were fighting
// plays out to its natural end in a browser at once, like a disconnect's — nobody waits for a silent field and the server
// never runs the board — and from the next round on nothing of theirs runs: no AI board, no prep, no battles.
// Run: node --test test/match/eliminated-leavers.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataSource } from '../../server/sim/simdata.js';
import { attachFakeBattleHost } from './fakeBotHost.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch } from './harness.js';

const DS = new DataSource(DATA, null);
const human = (seat, connected = true) => ({ seat, playerId: `p_${seat}`, name: `P${seat}`, isBot: false, connected });
const bot = (seat) => ({ seat, playerId: `ai_${seat}`, name: `A${seat}`, isBot: true, connected: true });
const GRAND = [human(0), human(1), bot(2), bot(3), bot(4), bot(5), bot(6), bot(7)];

/** A match with bot battles on the host browser (a fake one that answers), stopped at `phase`. */
function at(phase, round, o = {}) {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats: GRAND, largeRoom: true, seed: 3, fake: true, clientCombat: true, hostId: 'p_0', botBattles: 'host', botBattleAnswerMs: 1000, ...o });
  h.serverRuns = [];
  const real = h.m._runOnServer;
  h.m._runOnServer = function count(f, why) { h.serverRuns.push([f.fieldId, why]); return real.call(this, f, why); };
  attachFakeBattleHost(h, { ds: DS, BattleClass: FakeBattle });
  h.autoHumans().start();
  h.runToPhase(phase, round);
  return h;
}
/** Every frame that asks a browser to run field `fieldId` (as its authority or as a bot-battle executor). */
const runAsks = (h, fieldId) => h.sent.filter(([, msg]) => (msg.t === 'b.botBattle' || (msg.t === 'b.start' && msg.authoritative)) && msg.fieldId === fieldId);

test('Grand Alliance: a player who leaves mid-battle is eliminated; their battle plays out in a browser and nobody waits', () => {
  const base = at('COMBAT', 1);
  const t0 = base.sched.now();
  base.run(() => base.m.phase !== 'COMBAT');
  const usual = base.sched.now() - t0;
  base.m.dispose();

  const h = at('COMBAT', 1);
  const t1 = h.sched.now();
  h.m.onLeave('p_1');
  const ps = h.ps('p_1');
  assert.equal(ps.alive, false, 'leaving eliminates, as in a 4-player room');
  assert.equal(ps.lp, 0);
  const own = h.m.fields.find((f) => f.fieldId === 'n:p_1');
  assert.equal(own.done, false, 'their battle goes on');
  assert.equal(own.mode, 'host', 'handed to a browser at once');
  assert.equal(own.executor, 'p_0');
  h.run(() => h.m.phase !== 'COMBAT');
  assert.ok(own.done && !own.result?.synthetic && own.resultSource === 'host', 'it played out to its end in that browser');
  assert.ok(h.sched.now() - t1 <= usual, `the combat took ${h.sched.now() - t1} ms, ${usual} ms without the leave`);
  assert.deepEqual(h.serverRuns, [], 'no board on the server');
  // gone for good: no field, no AI prep, nothing to run in the next round
  const preps = [];
  const realPrep = h.m.scheduleBotPrep;
  h.m.scheduleBotPrep = function spy(p, ...rest) { preps.push(p.playerId); return realPrep.call(this, p, ...rest); };
  h.runToPhase('COMBAT', 2);
  assert.equal(ps.alive, false);
  assert.deepEqual(h.m.fields.filter((f) => f.players.includes('p_1')).map((f) => f.fieldId), []);
  assert.ok(preps.length > 0 && !preps.includes('p_1'), `no AI prep for the seat (${preps.join()})`);
  assert.deepEqual(h.serverRuns, []);
  h.m.dispose();
});

test('Grand Alliance: during the rejoin window the AI plays a dropped player\'s board; when it runs out they are eliminated', () => {
  const h = at('PREP', 1);
  const ps = h.ps('p_1');
  h.m.onDisconnect('p_1');
  assert.equal(ps.autoplay, true, 'the rejoin window keeps the current behaviour');
  assert.equal(ps.alive, true);
  h.runToPhase('COMBAT', 1);
  const own = h.m.fields.find((f) => f.fieldId === 'n:p_1');
  assert.equal(own.mode, 'host', 'their battle runs in a browser meanwhile');
  h.m.onLeave('p_1'); // the window ran out
  assert.equal(ps.alive, false);
  assert.equal(own.done, false, 'the running battle goes on');
  h.run(() => own.done);
  assert.ok(!own.result?.synthetic);
  h.runToPhase('COMBAT', 2);
  assert.deepEqual(h.m.fields.filter((f) => f.players.includes('p_1')).map((f) => f.fieldId), []);
  assert.deepEqual(h.serverRuns, []);
  h.m.dispose();
});

test('a leaver alone in a boss field: the field plays on in another browser at once, never on the server', () => {
  const h = at('FINAL_ASSAULT', null, { seats: [human(0), human(1), human(2)], largeRoom: false });
  const solo = h.m.fields.find((f) => f.players.length === 1);
  assert.ok(solo, 'three players: one boss field of one');
  const pid = solo.players[0];
  h.m.onLeave(pid);
  assert.equal(h.ps(pid).alive, false);
  assert.equal(solo.done, false, 'it goes on');
  assert.ok(solo.authority && solo.authority !== pid, `handed to another browser at once (${solo.mode} ${solo.authority})`);
  assert.deepEqual(h.serverRuns, []);
  h.m.dispose();
});

test('a leaver who shares a boss field: the field goes on for the partner still in', () => {
  const h = at('FINAL_ASSAULT', null, { seats: [human(0), human(1), human(2), human(3)], largeRoom: false });
  const pair = h.m.fields.find((f) => f.players.length === 2 && f.authority);
  const leaver = pair.authority;
  const partner = pair.players.find((p) => p !== leaver);
  h.m.onLeave(leaver);
  assert.equal(pair.done, false);
  assert.equal(pair.authority, partner, 'the partner runs it');
  h.m.dispose();
});
