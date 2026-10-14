// test/lobby-matchmaking.test.js — room.search end to end (DESIGN §90): the ready gate, whole-room merges, auto-start,
// spectators.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { readFileSync } from 'node:fs';
import { ERR, MAX_SEATS } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const SILVER = 'chess_char_4_22_a'; // 银灰 (NORMAL)
const SARIA = 'chess_char_5_11_a'; // 塞雷娅 (NORMAL)

class RecordingStub extends StubMatch {
  static instances = [];
  constructor(opts) { super(opts); this.opts = opts; RecordingStub.instances.push(this); }
}

function clientPool(getUrl) {
  const open = new Set();
  return {
    async connect() { const c = await TestClient.connect(getUrl()); open.add(c); return c; },
    async player(name) {
      const c = await this.connect();
      const w = await c.hello(name);
      c.id = w.playerId;
      return c;
    },
    async closeAll() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      open.clear();
    },
  };
}
const quietLog = () => {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
};
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const seatOf = (state, id) => state.seats.find((s) => s && s.playerId === id) || null;
const filled = (state) => state.seats.filter(Boolean).length;

/** A co-op room of `names.length` humans (the first hosts, the rest ready). @returns {Promise<{ code: string, members: TestClient[] }>} */
async function group(pool, names, difficulty = 'NORMAL') {
  const [host, ...rest] = await Promise.all(names.map((n) => pool.player(n)));
  await ok(host, { t: 'room.create', mode: 'coop', difficulty });
  const { code } = await host.waitFor('room.state', (s) => s.hostId === host.id);
  for (const c of rest) {
    await ok(c, { t: 'room.join', code });
    await ok(c, { t: 'room.ready', ready: true });
  }
  if (rest.length) await host.waitFor('room.state', (s) => rest.every((c) => seatOf(s, c.id)?.ready));
  return { code, members: [host, ...rest] };
}
/** Every member sees itself seated in one started room; returns that room.state. */
async function allInMatch(members) {
  const states = await Promise.all(members.map((c) => c.waitFor('room.state', (s) => s.inMatch === true && !!seatOf(s, c.id), 3000)));
  assert.equal(new Set(states.map((s) => s.code)).size, 1, 'one room');
  return states[0];
}

describe('room.search (matchmaking)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: RecordingStub, matchTickMs: 50, partialMergeAfterMs: 60_000 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('protocol: room.search {on: boolean}', () => {
    assert.equal(validateC2S({ t: 'room.search', on: true }), null);
    assert.equal(validateC2S({ t: 'room.search', on: false }), null);
    assert.notEqual(validateC2S({ t: 'room.search' }), null);
    assert.notEqual(validateC2S({ t: 'room.search', on: 1 }), null);
  });

  test('refusals: not the host, a pre-made member not ready, solo, full', async () => {
    const { code, members: [host, guest] } = await group(pool, ['Host', 'Guest'], 'ABYSS');
    await err(guest, { t: 'room.search', on: true }, ERR.NOT_HOST);
    await ok(guest, { t: 'room.ready', ready: false });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready === false);
    await err(host, { t: 'room.search', on: true }, ERR.NOT_READY);
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready === true);
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (s) => s.code === code && filled(s) === MAX_SEATS);
    await err(host, { t: 'room.search', on: true }, ERR.ROOM_FULL);
    const solo = await pool.player('Solo');
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'ABYSS' });
    await solo.waitFor('room.state');
    await err(solo, { t: 'room.search', on: true }, ERR.ROOM_FULL);
  });

  test('2 + 2: the pairs merge into one room that starts by itself; the moved pair follows the new code', async () => {
    const a = await group(pool, ['A1', 'A2']);
    const b = await group(pool, ['B1', 'B2']);
    await ok(a.members[0], { t: 'room.search', on: true });
    const st = await a.members[1].waitFor('room.state', (s) => s.searching === true);
    assert.equal(typeof st.searchSince, 'number');
    await ok(b.members[0], { t: 'room.search', on: true });
    const started = await allInMatch([...a.members, ...b.members]);
    assert.equal(filled(started), MAX_SEATS);
    assert.equal(started.searching, false, 'the search ends with the match');
    assert.ok([a.code, b.code].includes(started.code));
    for (const c of [...a.members, ...b.members]) assert.ok(!c.log.some((m) => m.t === 'room.closed'), 'no room.closed');
    const late = await pool.player('Late');
    await err(late, { t: 'room.join', code: started.code === a.code ? b.code : a.code }, ERR.ROOM_NOT_FOUND);
  });

  test('AI count as filled: 1 human + 2 AI takes one searching player; AI names stay unique', async () => {
    const a = await group(pool, ['Lead']);
    const lead = a.members[0];
    await ok(lead, { t: 'room.addBot' });
    await ok(lead, { t: 'room.addBot' });
    const b = await group(pool, ['Single']);
    await ok(b.members[0], { t: 'room.addBot' });
    await b.members[0].waitFor('room.state', (s) => filled(s) === 2);
    // b: 1 human + 1 AI → only a 2-seat group fits a 2-seat room; a (3 seats) needs exactly one
    const c = await group(pool, ['Third']);
    await ok(lead, { t: 'room.search', on: true });
    await ok(b.members[0], { t: 'room.search', on: true });
    await ok(c.members[0], { t: 'room.search', on: true });
    const started = await allInMatch([lead, c.members[0]]);
    assert.equal(started.code, a.code, 'the bigger group hosts');
    assert.equal(started.hostId, lead.id);
    const botNames = started.seats.filter((s) => s.isBot).map((s) => s.name);
    assert.equal(new Set(botNames).size, botNames.length);
    // b (2 seats) is still waiting for another 2
    const bs = await b.members[0].waitFor('room.state', (s) => s.searching === true);
    assert.equal(bs.inMatch, false);
    await ok(b.members[0], { t: 'room.search', on: false });
  });

  test('a friend joining a searching room pauses it until they are ready; filling by code starts it', async () => {
    const a = await group(pool, ['Host', 'Mate'], 'HARD');
    const [host] = a.members;
    await ok(host, { t: 'room.search', on: true });
    const friend = await pool.player('Friend');
    await ok(friend, { t: 'room.join', code: a.code });
    const solo = await group(pool, ['Stranger'], 'HARD');
    await ok(solo.members[0], { t: 'room.search', on: true });
    // paused: 3 seats + 1 searching would fit, but Friend is not ready
    await solo.members[0].expectNone('room.state', (s) => s.code === a.code, 300);
    await ok(friend, { t: 'room.ready', ready: true });
    await allInMatch([...a.members, friend, solo.members[0]]);
  });

  test('a full searching room starts by itself (the host adds the last AI); a full room that does not search waits', async () => {
    const a = await group(pool, ['Host', 'Mate', 'Pal'], 'FUNNY');
    await ok(a.members[0], { t: 'room.search', on: true });
    await ok(a.members[0], { t: 'room.search', on: false });
    await ok(a.members[0], { t: 'room.addBot' });
    await a.members[0].expectNone('room.state', (s) => s.inMatch === true, 300);
    await ok(a.members[0], { t: 'room.removeBot', seat: 3 });
    await a.members[0].waitFor('room.state', (s) => filled(s) === 3);
    await ok(a.members[0], { t: 'room.search', on: true });
    await ok(a.members[0], { t: 'room.addBot' });
    await allInMatch(a.members);
  });

  test('spectators follow the merge while seats last; a spectator that does not fit gets room.closed {merged}', async () => {
    const a = await group(pool, ['A1', 'A2'], 'ABYSS');
    const b = await group(pool, ['B1', 'B2'], 'ABYSS');
    const [sa, sb1, sb2] = await Promise.all(['SA', 'SB1', 'SB2'].map((n) => pool.player(n)));
    await ok(sa, { t: 'room.spectate', code: a.code });
    await ok(sb1, { t: 'room.spectate', code: b.code });
    await ok(sb2, { t: 'room.spectate', code: b.code });
    await b.members[0].waitFor('room.state', (s) => s.spectators.length === 2);
    await ok(a.members[0], { t: 'room.search', on: true });
    await a.members[0].waitFor('room.state', (s) => s.searching);
    await ok(b.members[0], { t: 'room.search', on: true });
    const started = await allInMatch([...a.members, ...b.members]);
    assert.equal(started.spectators.length, 2, 'the target keeps its own and takes one');
    const closed = [sa, sb1, sb2].filter((c) => c.log.some((m) => m.t === 'room.closed'));
    assert.equal(closed.length, 1);
    assert.equal(closed[0].log.find((m) => m.t === 'room.closed').reason, 'merged');
  });

  test('a moved player keeps what their seat holds (0.2.0 补位 not-owned list) into the merged match', async () => {
    RecordingStub.instances.length = 0;
    const a = await group(pool, ['O1', 'O2']);
    const b = await group(pool, ['P1', 'P2']);
    await ok(a.members[1], { t: 'room.ownership', notOwned: [SILVER] });
    await ok(b.members[1], { t: 'room.ownership', notOwned: [SARIA] });
    await ok(a.members[0], { t: 'room.search', on: true });
    await ok(b.members[0], { t: 'room.search', on: true });
    await allInMatch([...a.members, ...b.members]);
    const m = RecordingStub.instances.at(-1);
    assert.ok(m, 'a match was created');
    const seat = (c) => m.opts.seats.find((s) => s.playerId === c.id);
    assert.deepEqual(seat(a.members[1]).notOwned, [SILVER]);
    assert.deepEqual(seat(b.members[1]).notOwned, [SARIA]);
    assert.equal(seat(a.members[0]).notOwned, null);
  });

  test('different difficulties never merge', async () => {
    const a = await group(pool, ['N1', 'N2', 'N3'], 'FUNNY');
    const b = await group(pool, ['H1'], 'ABYSS');
    await ok(a.members[0], { t: 'room.search', on: true });
    await ok(b.members[0], { t: 'room.search', on: true });
    await a.members[0].expectNone('room.state', (s) => filled(s) === MAX_SEATS, 300);
    await ok(a.members[0], { t: 'room.search', on: false });
    await ok(b.members[0], { t: 'room.search', on: false });
  });
});

test('ui/matchSearch.js passes t() params as an object (a bare value leaves the placeholder unfilled)', () => {
  const src = readFileSync(new URL('../public/js/ui/matchSearch.js', import.meta.url), 'utf8');
  const bare = [...src.matchAll(/\bt\('[^']*\{[^}]+\}[^']*',\s*([^{\s][^)]*)\)/g)].map((m) => m[0]);
  assert.deepEqual(bare, []);
});

describe('room.search partial merges', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch, matchTickMs: 50, partialMergeAfterMs: 200 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  after(async () => {
    await pool.closeAll();
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('two lone searchers become a searching pair after the delay, then fill with another pair', async () => {
    const a = await group(pool, ['Solo1']);
    const b = await group(pool, ['Solo2']);
    await ok(a.members[0], { t: 'room.search', on: true });
    await ok(b.members[0], { t: 'room.search', on: true });
    const pair = await b.members[0].waitFor('room.state', (s) => filled(s) === 2 && !!seatOf(s, a.members[0].id), 3000);
    assert.equal(pair.searching, true);
    assert.equal(pair.inMatch, false);
    const c = await group(pool, ['P1', 'P2']);
    await ok(c.members[0], { t: 'room.search', on: true });
    await allInMatch([...a.members, ...b.members, ...c.members]);
  });
});
