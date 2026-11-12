// (fork) One for All (一策同心, a Grand Alliance strategy mode): the lobby side — the room flag at create and through
// room.setOneForAll (host only, before the match, Grand Alliances only), room.state / rooms.list, the match option, the
// matchmaking pool (merges only with its own mode, a search restarts on a switch), the solo queue's sub-opt-in, and the
// cross-region digest leaving it out.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { getData } from '../server/data.js';
import { planMerges, poolKey, roomSize } from '../server/matchmaker.js';
import { planSolos, SoloQueue } from '../server/soloQueue.js';
import { ERR, MAX_SEATS } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { DEFAULT_VERSION } from '../shared/versions.js';

const VANILLA = 'a0'.repeat(32);
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

class Rec {
  static last = null;
  constructor(opts) { this.opts = opts; Rec.last = opts; }
  start() {}
  dispose() {}
  onLeave() {}
  onDisconnect() {}
}

function harness() {
  const registry = new SessionRegistry();
  const clock = { t: 1_000_000 };
  const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, content: { cs: VANILLA }, getData, now: () => clock.t,
    options: { largeRooms: true, roomListGapMs: 0, matchTickMs: 600_000 } });
  const frames = new Map();
  const player = (name) => {
    const s = registry.create(name);
    s.connected = true;
    s.disconnectedAt = null;
    const box = [];
    frames.set(s.playerId, box);
    s.ws = { readyState: 1, bufferedAmount: 0, send(data) { box.push(JSON.parse(data)); }, terminate() {} };
    return s;
  };
  const last = (s, t) => [...frames.get(s.playerId)].reverse().find((m) => m.t === t);
  return { lobby, player, last, clock, close: () => lobby.shutdown() };
}

const ok = (r) => assert.deepEqual(r, { ok: true });
const refused = (r, code) => assert.equal(r?.error, code, JSON.stringify(r));
const roomOf = (h, s) => h.lobby.rooms.get(s.roomCode);

/** A searching Grand Alliance of `count` humans (squad A first), every one but the host ready. */
function searchingGrand(h, count, extra = {}, name = 'P') {
  const ps = Array.from({ length: count }, (_, i) => h.player(`${name}${i}`));
  ok(h.lobby.create(ps[0], { mode: 'coop', difficulty: 'NORMAL', capacity: 8, ...extra }));
  const r = roomOf(h, ps[0]);
  for (const p of ps.slice(1)) { ok(h.lobby.join(p, { code: r.code })); ok(h.lobby.ready(p, { ready: true })); }
  ok(h.lobby.search(ps[0], { on: true }));
  return { r, ps };
}

test('protocol: room.create oneForAll, room.setOneForAll { on }, queue.join oneForAll — booleans only', () => {
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', capacity: 8, oneForAll: true }), null);
  assert.notEqual(validateC2S({ t: 'room.create', mode: 'coop', capacity: 8, oneForAll: 'yes' }), null);
  assert.equal(validateC2S({ t: 'room.setOneForAll', on: true }), null);
  assert.equal(validateC2S({ t: 'room.setOneForAll', on: false }), null);
  assert.notEqual(validateC2S({ t: 'room.setOneForAll' }), null);
  assert.notEqual(validateC2S({ t: 'room.setOneForAll', on: 1 }), null);
  assert.equal(validateC2S({ t: 'queue.join', difficulty: 'NORMAL', large: true, oneForAll: true }), null);
  assert.notEqual(validateC2S({ t: 'queue.join', difficulty: 'NORMAL', large: true, oneForAll: 'on' }), null);
});

test('create: a Grand Alliance may start in One for All; a normal room may not; room.state carries the flag on Grand Alliances only', () => {
  const h = harness();
  try {
    const a = h.player('A');
    ok(h.lobby.create(a, { mode: 'coop', capacity: 8, oneForAll: true }));
    assert.equal(h.last(a, 'room.state').oneForAll, true);
    assert.equal(roomOf(h, a).oneForAll, true);
    const b = h.player('B');
    ok(h.lobby.create(b, { mode: 'coop', capacity: 8 }));
    assert.equal(h.last(b, 'room.state').oneForAll, false, 'Free pick by default');
    const c = h.player('C');
    refused(h.lobby.create(c, { mode: 'coop', oneForAll: true }), ERR.BAD_MSG);
    assert.equal(c.roomCode, null, 'no room made');
    ok(h.lobby.create(c, { mode: 'coop' }));
    assert.equal('oneForAll' in h.last(c, 'room.state'), false, 'a normal room.state stays as it was');
  } finally { h.close(); }
});

test('room.setOneForAll: host only, before the match, Grand Alliances only; nobody is un-readied', () => {
  const h = harness();
  try {
    const host = h.player('Host');
    const mate = h.player('Mate');
    const outsider = h.player('Out');
    refused(h.lobby.setOneForAll(outsider, { on: true }), ERR.NOT_IN_ROOM);
    ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
    const r = roomOf(h, host);
    ok(h.lobby.join(mate, { code: r.code }));
    ok(h.lobby.ready(mate, { ready: true }));
    refused(h.lobby.setOneForAll(mate, { on: true }), ERR.NOT_HOST);
    assert.equal(r.oneForAll, false);
    ok(h.lobby.setOneForAll(host, { on: true }));
    assert.equal(r.oneForAll, true);
    assert.equal(h.last(mate, 'room.state').oneForAll, true, 'everyone sees it');
    assert.equal(r.seatOf(mate.playerId).ready, true, 'the mate stays ready');
    ok(h.lobby.setOneForAll(host, { on: true }), 'the same again is a no-op');
    ok(h.lobby.setOneForAll(host, { on: false }));
    assert.equal(h.last(mate, 'room.state').oneForAll, false);
    ok(h.lobby.setOneForAll(host, { on: true }));
    ok(h.lobby.start(host));
    refused(h.lobby.setOneForAll(host, { on: false }), ERR.WRONG_PHASE);
    assert.equal(r.oneForAll, true);
    // a normal room has no strategy mode
    const solo = h.player('Normal');
    ok(h.lobby.create(solo, { mode: 'coop' }));
    refused(h.lobby.setOneForAll(solo, { on: true }), ERR.BAD_MSG);
  } finally { h.close(); }
});

test('the match gets oneForAll beside largeRoom; a Free-pick Grand Alliance and a normal room do not', () => {
  const h = harness();
  try {
    const a = h.player('A');
    ok(h.lobby.create(a, { mode: 'coop', capacity: 8, oneForAll: true }));
    ok(h.lobby.start(a));
    assert.equal(Rec.last.largeRoom, true);
    assert.equal(Rec.last.oneForAll, true);
    const b = h.player('B');
    ok(h.lobby.create(b, { mode: 'coop', capacity: 8 }));
    ok(h.lobby.start(b));
    assert.equal(Rec.last.largeRoom, true);
    assert.equal(Rec.last.oneForAll, undefined, 'a Free-pick match opts object does not grow the key');
    const c = h.player('C');
    ok(h.lobby.create(c, { mode: 'coop' }));
    ok(h.lobby.start(c));
    assert.equal(Rec.last.oneForAll, undefined);
  } finally { h.close(); }
});

test('room browser: a One for All room is marked, a switch refreshes the list; the flag never shows on a Free-pick row', async () => {
  const h = harness();
  try {
    const watcher = h.player('W');
    const host = h.player('Host');
    ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
    ok(h.lobby.watchRooms(watcher, { on: true }));
    let list = h.last(watcher, 'rooms.list');
    assert.equal(list.rooms[0].oneForAll, undefined);
    ok(h.lobby.setOneForAll(host, { on: true }));
    await new Promise((r) => setTimeout(r, 5));
    list = h.last(watcher, 'rooms.list');
    assert.equal(list.rooms[0].oneForAll, true);
    assert.equal(h.lobby.ownRoomList()[0].oneForAll, true, 'what the peer link shows the other regions');
  } finally { h.close(); }
});

test('pools: a One for All Grand Alliance merges only with One for All ones; normal rooms keep their old key', () => {
  const big = (oneForAll, a, code) => ({ code, mode: 'coop', difficulty: 'NORMAL', version: DEFAULT_VERSION, searching: true, searchSince: 0,
    hostId: `${code}_0`, match: null, disposed: false, capacity: 8, large: true, oneForAll,
    seats: Array.from({ length: 8 }, (_, i) => (i < a ? { seat: i, playerId: `${code}_${i}`, isBot: false, left: false, ready: true, connected: true } : null)) });
  const ofa1 = big(true, 4, 'O1');
  const ofa2 = big(true, 4, 'O2');
  const free = big(false, 4, 'F1');
  assert.notEqual(poolKey(ofa1), poolKey(free));
  assert.equal(poolKey(ofa1), poolKey(ofa2));
  assert.equal(poolKey(free), `${DEFAULT_VERSION}|NORMAL|8`, 'a Free-pick key is unchanged');
  // a stray flag on a 4-seat room changes nothing
  const four = { ...big(true, 2, 'N1'), capacity: MAX_SEATS, large: false, seats: new Array(MAX_SEATS).fill(null) };
  assert.equal(poolKey(four), `${DEFAULT_VERSION}|NORMAL|${MAX_SEATS}`);
  const plans = planMerges([ofa1, free, ofa2], 0);
  assert.equal(plans.length, 1);
  assert.deepEqual([plans[0].target, ...plans[0].sources].map((r) => r.code).sort(), ['O1', 'O2']);
  assert.deepEqual(planMerges([ofa1, free], 60_000, { partialMergeAfterMs: 1 }), [], 'not even a partial merge across modes');
});

test('solo queue: a One for All room takes only Doctors with the sub-opt-in; a Free-pick one takes both; the sub-opt-in needs large', () => {
  const ga = (oneForAll) => ({ code: oneForAll ? 'OFA' : 'FREE', mode: 'coop', difficulty: 'NORMAL', version: DEFAULT_VERSION, searching: true,
    searchSince: 0, hostId: 'h0', match: null, disposed: false, capacity: 8, large: true, oneForAll,
    seats: Array.from({ length: 8 }, (_, i) => (i < 6 ? { seat: i, playerId: `h${i}`, isBot: false, left: false, ready: true, connected: true } : null)) });
  const solo = (id, opts) => ({ playerId: id, difficulty: 'NORMAL', since: 0, versions: [DEFAULT_VERSION], large: true, oneForAll: false, ...opts });
  const ofa = ga(true);
  assert.deepEqual(planSolos([ofa], [solo('a'), solo('b')]), [], 'Grand Alliance tick alone: not into One for All');
  const both = planSolos([ofa], [solo('a', { oneForAll: true }), solo('b', { oneForAll: true })]);
  assert.deepEqual(both.map((p) => [p.room.code, p.entries.length]), [['OFA', 2]]);
  const free = planSolos([ga(false)], [solo('a', { oneForAll: true }), solo('b')]);
  assert.deepEqual(free.map((p) => [p.room.code, p.entries.length]), [['FREE', 2]], 'a ticked Doctor still fills Free-pick rooms');
  assert.deepEqual(planSolos([ofa], [solo('a', { oneForAll: true })], { now: 60_000, partialMergeAfterMs: 10_000 })
    .map((p) => p.entries.length), [1], 'the partial fill after the wait follows the same rule');
  const q = new SoloQueue();
  assert.equal(q.add('x', 'NORMAL', 0, { large: false, oneForAll: true }).oneForAll, false, 'no sub-opt-in without large');
  assert.equal(q.add('y', 'NORMAL', 0, { large: true, oneForAll: true }).oneForAll, true);
});

test('lobby: queued Doctors fill a One for All room only with the sub-opt-in; queue.state echoes it', () => {
  const h = harness();
  try {
    const { r } = searchingGrand(h, 6, { oneForAll: true }, 'G');
    const plain = ['A', 'B'].map((x) => h.player(x));
    for (const s of plain) ok(h.lobby.queueJoin(s, { difficulty: 'NORMAL', large: true }));
    h.lobby.matchmaker.run();
    assert.equal(roomSize(r), 6, 'the Grand Alliance tick alone');
    const noLarge = h.player('N');
    ok(h.lobby.queueJoin(noLarge, { difficulty: 'NORMAL', oneForAll: true }));
    assert.equal(h.lobby.soloQueue.get(noLarge.playerId).oneForAll, false, 'ignored without large');
    assert.equal(h.last(noLarge, 'queue.state').oneForAll, undefined);
    for (const s of plain) ok(h.lobby.queueJoin(s, { difficulty: 'NORMAL', large: true, oneForAll: true }));
    assert.equal(h.last(plain[0], 'queue.state').oneForAll, true);
    h.lobby.matchmaker.run();
    assert.equal(roomSize(r), 8);
    assert.ok(r.match);
    assert.equal(Rec.last.oneForAll, true);
  } finally { h.close(); }
});

test('lobby: two One for All rooms merge and keep the mode; a Free-pick one never joins them', () => {
  const h = harness();
  try {
    const { r: target } = searchingGrand(h, 4, { oneForAll: true }, 'T');
    const { r: free } = searchingGrand(h, 4, {}, 'F');
    h.lobby.matchmaker.run();
    assert.equal(free.disposed, false);
    assert.equal(target.disposed, false);
    const { r: src } = searchingGrand(h, 4, { oneForAll: true }, 'S');
    h.lobby.matchmaker.run();
    const [kept, gone] = target.disposed ? [src, target] : [target, src];
    assert.equal(gone.disposed, true, 'merged');
    assert.equal(kept.oneForAll, true, 'the merged room is still One for All');
    assert.ok(kept.match);
    assert.equal(Rec.last.oneForAll, true);
    assert.equal(free.disposed, false);
  } finally { h.close(); }
});

test('a switch while searching restarts the search in the new pool; the cross-region digest and reserve leave One for All out', () => {
  const h = harness();
  try {
    const { r: free, ps } = searchingGrand(h, 4, {}, 'A');
    assert.equal(free.searchSince, h.clock.t);
    assert.equal(h.lobby.crossDigest().rooms.length, 1);
    h.clock.t += 30_000;
    ok(h.lobby.setOneForAll(ps[0], { on: true }));
    assert.equal(free.searching, true, 'still searching');
    assert.equal(free.searchSince, h.clock.t, 'the wait starts over');
    assert.equal(h.lobby.crossDigest().rooms.length, 0, 'not offered to other regions');
    h.lobby.crossTicket = (p) => JSON.stringify(p);
    assert.equal(h.lobby.crossReserve({ difficulty: 'NORMAL', large: true, rooms: [free.code], solos: [], humans: 4, bots: 0, ttlMs: 15_000 }).ok, false);
    // the One for All Doctor of another server's queue never comes through the digest as such
    const s = h.player('Q');
    ok(h.lobby.queueJoin(s, { difficulty: 'NORMAL', large: true, oneForAll: true }));
    assert.equal(h.lobby.crossDigest().solos[0].oneForAll, undefined);
  } finally { h.close(); }
});
