// test/lobby-soloqueue.test.js — 单人匹配 (DESIGN §28): planSolos, and queue.join / queue.leave / queue.ai end to end. A
// queued Doctor is only ever placed into a room that starts at once: their first room.state already says inMatch.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { planSolos } from '../server/soloQueue.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, MAX_SEATS } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const quietLog = () => {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
};
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const seatOf = (state, id) => state.seats.find((s) => s && s.playerId === id) || null;
const filled = (state) => state.seats.filter(Boolean).length;
const firstRoomState = (c) => c.log.find((m) => m.t === 'room.state') || null;

describe('planSolos', () => {
  const room = (code, difficulty, size, since) => ({
    code, difficulty, mode: 'coop', searching: true, searchSince: since, hostId: 'h', disposed: false, match: null,
    seats: Array.from({ length: MAX_SEATS }, (_, i) => (i < size ? { playerId: `${code}${i}`, isBot: false, connected: true, ready: true } : null)),
  });
  const solo = (id, difficulty = 'NORMAL', since = 0) => ({ playerId: id, difficulty, since });

  test('4 solos form a room; 3 wait', () => {
    assert.deepEqual(planSolos([], [solo('a'), solo('b'), solo('c')]), []);
    const plans = planSolos([], [solo('a'), solo('b'), solo('c'), solo('d'), solo('e')]);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].room, null);
    assert.deepEqual(plans[0].entries.map((e) => e.playerId), ['a', 'b', 'c', 'd']);
  });

  test('searching rooms fill first, oldest first, only exactly; a room needing too many is skipped', () => {
    const old3 = room('OLD', 'NORMAL', 3, 1);
    const two = room('TWO', 'NORMAL', 2, 2);
    const one = room('ONE', 'NORMAL', 1, 0); // needs 3
    const plans = planSolos([two, old3, one], [solo('a'), solo('b')]);
    // ONE (oldest) needs 3 of 2: skipped. OLD takes a, TWO would need 2 but only b is left.
    assert.deepEqual(plans.map((p) => [p.room?.code, p.entries.map((e) => e.playerId)]), [['OLD', ['a']]]);
  });

  test('difficulties never mix; paused rooms are skipped', () => {
    const paused = room('PAU', 'NORMAL', 3, 0);
    paused.seats[1].ready = false;
    const abyss = room('ABY', 'ABYSS', 3, 0);
    const plans = planSolos([paused, abyss], [solo('a', 'NORMAL'), solo('b', 'ABYSS')]);
    assert.deepEqual(plans.map((p) => [p.room?.code, p.entries.map((e) => e.playerId)]), [['ABY', ['b']]]);
  });
});

describe('queue.* (单人匹配)', () => {
  let srv;
  const open = new Set();
  const cap = quietLog();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.id = (await c.hello(name)).playerId;
    return c;
  };
  const queue = async (c, difficulty = 'NORMAL') => {
    await ok(c, { t: 'queue.join', difficulty });
    return c.waitFor('queue.state', (m) => m.queued === true);
  };
  before(async () => {
    srv = await startServer({
      port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch, matchTickMs: 50, partialMergeAfterMs: 60_000,
      soloAiAfterMs: 300, maxMatchesPerAddr: 0, maxRoomsPerAddr: 0,
    });
  });
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
  });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('protocol: queue.join {difficulty}, queue.leave, queue.ai', () => {
    assert.equal(validateC2S({ t: 'queue.join', difficulty: 'NORMAL' }), null);
    assert.notEqual(validateC2S({ t: 'queue.join', difficulty: 'nope' }), null);
    assert.notEqual(validateC2S({ t: 'queue.join' }), null);
    assert.equal(validateC2S({ t: 'queue.leave' }), null);
    assert.equal(validateC2S({ t: 'queue.ai' }), null);
  });

  test('queue.state carries the wait and when AI is offered; no queue size anywhere', async () => {
    const a = await player('Qa');
    const st = await queue(a, 'ABYSS');
    assert.equal(st.difficulty, 'ABYSS');
    assert.equal(typeof st.since, 'number');
    assert.equal(st.aiAt, st.since + 300);
    assert.deepEqual(Object.keys(st).sort(), ['aiAt', 'difficulty', 'queued', 'since', 't']);
    // a second click keeps the wait
    await ok(a, { t: 'queue.join', difficulty: 'ABYSS' });
    assert.equal((await a.waitFor('queue.state', (m) => m.queued)).since, st.since);
    await a.expectNone('room.state', () => true, 200);
  });

  test('4 solos: one room, already started in its first room.state, oldest waiter hosts', async () => {
    const cs = [];
    for (const n of ['S1', 'S2', 'S3']) { const c = await player(n); await queue(c); cs.push(c); }
    for (const c of cs) await c.expectNone('room.state', () => true, 150);
    const last = await player('S4');
    await queue(last);
    cs.push(last);
    const states = await Promise.all(cs.map((c) => c.waitFor('room.state', (s) => !!seatOf(s, c.id), 3000)));
    for (const c of cs) {
      assert.equal(firstRoomState(c).inMatch, true, 'no room screen before the match');
      const q = await c.waitFor('queue.state', (m) => m.queued === false);
      assert.equal(q.placed, true);
    }
    assert.equal(new Set(states.map((s) => s.code)).size, 1);
    assert.equal(filled(states[0]), MAX_SEATS);
    assert.equal(states[0].hostId, cs[0].id);
  });

  test('a searching room of 2 takes 2 solos at once and starts', async () => {
    const host = await player('RH');
    const mate = await player('RM');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'HARD' });
    const { code } = await host.waitFor('room.state', (s) => s.hostId === host.id);
    await ok(mate, { t: 'room.join', code });
    await ok(mate, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, mate.id)?.ready);
    await ok(host, { t: 'room.search', on: true });
    const s1 = await player('RS1');
    await queue(s1, 'HARD');
    // one solo is not enough for the 2 free seats: nothing moves
    await s1.expectNone('room.state', () => true, 200);
    const s2 = await player('RS2');
    await queue(s2, 'HARD');
    const st = await host.waitFor('room.state', (s) => s.inMatch === true, 3000);
    assert.equal(st.code, code);
    assert.ok(seatOf(st, s1.id) && seatOf(st, s2.id));
    for (const c of [s1, s2]) {
      await c.waitFor('room.state', (s) => s.code === code);
      assert.equal(firstRoomState(c).inMatch, true);
    }
    // the room's members never saw the solos seated before the start
    assert.ok(!host.log.some((m) => m.t === 'room.state' && !m.inMatch && seatOf(m, s1.id)));
  });

  test('queue.leave, room.create and a dropped socket leave the queue', async () => {
    const a = await player('La');
    await queue(a, 'FUNNY');
    await ok(a, { t: 'queue.leave' });
    await a.waitFor('queue.state', (m) => m.queued === false);
    await queue(a, 'FUNNY');
    await ok(a, { t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    await a.waitFor('queue.state', (m) => m.queued === false);
    const b = await player('Lb');
    await queue(b, 'FUNNY');
    await b.terminate();
    assert.equal(await waitUntil(() => !srv.lobby.soloQueue.get(b.id)), true);
    assert.equal(srv.lobby.soloQueue.get(a.id), null);
  });

  test('queue.ai: refused before soloAiAfterMs, then a started room of this Doctor and AI', async () => {
    const a = await player('Ai');
    await err(a, { t: 'queue.ai' }, ERR.NOT_READY);
    await queue(a, 'NORMAL');
    await err(a, { t: 'queue.ai' }, ERR.NOT_READY);
    await new Promise((r) => setTimeout(r, 320));
    await ok(a, { t: 'queue.ai' });
    const st = await a.waitFor('room.state', (s) => !!seatOf(s, a.id));
    assert.equal(st.inMatch, true);
    assert.equal(st.mode, 'coop');
    assert.equal(st.seats.filter((s) => s && s.isBot).length, MAX_SEATS - 1);
    assert.equal(new Set(st.seats.filter((s) => s && s.isBot).map((s) => s.name)).size, MAX_SEATS - 1);
    await a.waitFor('queue.state', (m) => m.queued === false && !m.placed);
  });

  test('queue.join from a running match is refused', async () => {
    const a = await player('Run');
    await ok(a, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await a.waitFor('room.state');
    await ok(a, { t: 'room.start' });
    await a.waitFor('room.state', (s) => s.inMatch);
    await err(a, { t: 'queue.join', difficulty: 'NORMAL' }, ERR.ROOM_STARTED);
  });
});

async function waitUntil(fn, ms = 1000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); }
  return fn();
}
