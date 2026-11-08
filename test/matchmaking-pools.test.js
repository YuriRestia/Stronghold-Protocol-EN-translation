// test/matchmaking-pools.test.js — (fork) matchmaking by official version and for Grand Alliances (DESIGN §90.3 /
// §90.4): the pure planners (planMerges pools, fitSquads, planSolos versions and opt-in, planCross), and a Lobby over a
// stub of the real version data: a version switch while searching, the solo queue's versions, the content gate before a
// matchmade start, Grand Alliance merges and fills, and a cross-region Grand Alliance reserve.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { getData, getVersionData } from '../server/data.js';
import { planMerges, fitSquads, roomSize, isMatchable } from '../server/matchmaker.js';
import { planSolos } from '../server/soloQueue.js';
import { planCross } from '../server/crossMatch.js';
import { DIFFICULTIES, ERR, MAX_SEATS, modeIdFor } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { DEFAULT_VERSION, VERSIONS } from '../shared/versions.js';

const V1 = 'act1autochess';
const V21 = 'act2autochess@V2_1';

// ---- pure planners ---------------------------------------------------------------------------------------------------

let n = 0;
/** A fake searching room: squads [a, b] humans (a large room has 8 seats), the first human hosts. */
function room({ a = 1, b = 0, large = false, version = DEFAULT_VERSION, difficulty = 'NORMAL', since = 0, bots = 0 } = {}) {
  const code = `R${String(n++).padStart(3, '0')}`;
  const cap = large ? 8 : MAX_SEATS;
  const seats = new Array(cap).fill(null);
  const human = (i, k) => ({ seat: i, playerId: `${code}_h${k}`, isBot: false, left: false, ready: true, connected: true });
  let k = 0;
  for (let i = 0; i < a; i++) seats[i] = human(i, k++);
  for (let i = 0; i < b; i++) seats[4 + i] = human(4 + i, k++);
  for (let i = 0; i < bots; i++) seats[a + i] = { seat: a + i, playerId: `${code}_b${i}`, isBot: true, left: false, ready: true, connected: true };
  const hostId = seats.find(Boolean)?.playerId ?? null;
  return { code, mode: 'coop', difficulty, version, searching: true, searchSince: since, hostId, seats, match: null, disposed: false, ...(large ? { capacity: 8, large: true } : {}) };
}
const solo = (id, { versions = [DEFAULT_VERSION], large = false, difficulty = 'NORMAL', since = 0 } = {}) => ({ playerId: id, difficulty, since, versions, large });

describe('pools: version, difficulty, size', () => {
  test('rooms of different versions never merge; the same version does', () => {
    const plans = planMerges([room({ a: 2 }), room({ a: 2, version: V1 }), room({ a: 2, version: V1 })], 0);
    assert.equal(plans.length, 1);
    assert.deepEqual([plans[0].target, ...plans[0].sources].map((r) => r.version), [V1, V1]);
  });

  test('a Grand Alliance never merges with a 4-seat room, nor a test room with anyone', () => {
    assert.deepEqual(planMerges([room({ a: 2 }), room({ a: 2, large: true })], 0), []);
    assert.equal(isMatchable({ ...room({ a: 2 }), test: true }), false);
  });

  test('fitSquads keeps each squad whole, squad A first', () => {
    const t = room({ a: 3, b: 2, large: true }); // free: A 1, B 2
    assert.deepEqual(fitSquads(t, [[2, 0]]), [[1, 1]], 'two go to B');
    assert.deepEqual(fitSquads(t, [[1, 0]]), [[0, 1]], 'one goes to A');
    assert.equal(fitSquads(t, [[2, 2]]), null, 'B has 2 free, A 1: one squad of 2 would split');
    assert.deepEqual(fitSquads(t, [[1, 2]]), [[0, 1]], 'A→A, B→B');
  });

  test('Grand Alliances fill to 8 exactly when their squads fit, else a partial merge waits for room', () => {
    const big = room({ a: 4, b: 1, large: true });
    const fits = room({ a: 3, large: true });
    const split = room({ a: 2, b: 1, large: true });
    const plans = planMerges([big, split, fits], 0);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].target, big);
    assert.deepEqual(plans[0].sources, [fits], '2+1 would need squad B to take both of its squads: 3 free there, but A is full');
    // partial: two small ones after the wait, never one whose squads do not fit
    const p1 = room({ a: 4, b: 3, large: true, since: 0 });
    const p2 = room({ a: 2, large: true, since: 0 });
    assert.deepEqual(planMerges([p1, p2], 60_000), [], '2 do not fit in the 1 seat left');
  });
});

describe('planSolos: versions and the Grand Alliance opt-in', () => {
  test('a room takes only Doctors queued for its version; a Doctor queued for several fills the first room that fills', () => {
    const r1 = room({ a: 2, version: V1, since: 0 });
    const plans = planSolos([r1], [solo('a', { versions: [DEFAULT_VERSION, V1] }), solo('b'), solo('c', { versions: [V1] })]);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].room, r1);
    assert.deepEqual(plans[0].entries.map((e) => e.playerId), ['a', 'c']);
  });

  test('new rooms: the official order first, 4 who share a version', () => {
    const e = [solo('a', { versions: [V1, DEFAULT_VERSION] }), solo('b', { versions: [V1] }), solo('c', { versions: [V1] }), solo('d', { versions: [V1, V21] }), solo('e')];
    const plans = planSolos([], e);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].version, V1);
    assert.deepEqual(plans[0].entries.map((x) => x.playerId), ['a', 'b', 'c', 'd']);
    const def = planSolos([], ['p', 'q', 'r', 's'].map((id) => solo(id, { versions: [V1, DEFAULT_VERSION] })));
    assert.equal(def[0].version, DEFAULT_VERSION, '第二期下半 leads the official order');
  });

  test('a Grand Alliance takes only opted-in Doctors: exact fills at once, the rest after the wait', () => {
    const ga = room({ a: 4, b: 2, large: true, since: 0 });
    assert.deepEqual(planSolos([ga], [solo('a'), solo('b')]), [], 'not opted in');
    const exact = planSolos([ga], [solo('a', { large: true }), solo('b', { large: true })]);
    assert.deepEqual(exact.map((p) => [p.room, p.entries.length]), [[ga, 2]]);
    const one = [solo('a', { large: true, since: 0 })];
    assert.deepEqual(planSolos([ga], one, { now: 5_000, partialMergeAfterMs: 10_000 }), [], 'too soon');
    const later = planSolos([ga], one, { now: 10_000, partialMergeAfterMs: 10_000 });
    assert.deepEqual(later.map((p) => [p.room, p.entries.length]), [[ga, 1]], 'after the wait, one sits in');
  });

  test('new normal rooms come before a Grand Alliance takes the opted-in leftovers', () => {
    const ga = room({ a: 2, large: true, since: 0 }); // needs 6: no exact fill from 5
    const e = ['a', 'b', 'c', 'd', 'e'].map((id) => solo(id, { large: true }));
    const plans = planSolos([ga], e, { now: 60_000, partialMergeAfterMs: 10_000 });
    assert.deepEqual(plans.map((p) => [p.room === ga ? 'ga' : 'new', p.entries.map((x) => x.playerId).join('')]), [['new', 'abcd'], ['ga', 'e']]);
  });
});

describe('planCross: versions every region enables, Grand Alliances where their room is', () => {
  const now = 1_000_000;
  const cross = (sg, us) => planCross([{ id: 'sg', ...sg }, { id: 'us', ...us }], now, { crossAfterMs: 15_000 });
  test('a version one region lacks is not matched across; one both enable is', () => {
    const r = { code: 'AAAA', humans: 2, bots: 0, difficulty: 'NORMAL', wait: 20_000, version: V1 };
    const s = { code: 'BBBB', humans: 2, bots: 0, difficulty: 'NORMAL', wait: 20_000, version: V1 };
    assert.deepEqual(cross({ rooms: [r], solos: [], versions: [DEFAULT_VERSION, V1] }, { rooms: [s], solos: [], versions: [DEFAULT_VERSION] }), []);
    const plans = cross({ rooms: [r], solos: [], versions: [DEFAULT_VERSION, V1] }, { rooms: [s], solos: [], versions: [DEFAULT_VERSION, V1] });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].version, V1);
    const solos = [1, 2].map((i) => ({ id: `s${i}`, difficulty: 'NORMAL', wait: 20_000, versions: [V1, DEFAULT_VERSION] }));
    const viaSolos = cross({ rooms: [r], solos: [], versions: [DEFAULT_VERSION, V1] }, { rooms: [], solos, versions: [DEFAULT_VERSION, V1] });
    assert.equal(viaSolos[0].version, V1);
  });

  test('a Grand Alliance plan plays where its target room is, with each member\'s squads', () => {
    const ga = { code: 'GGGG', humans: 6, bots: 0, difficulty: 'NORMAL', wait: 20_000, cap: 8, squads: [4, 2] };
    const other = { code: 'HHHH', humans: 2, bots: 0, difficulty: 'NORMAL', wait: 20_000, cap: 8, squads: [0, 2] };
    const plans = cross({ rooms: [ga], solos: [] }, { rooms: [other], solos: [] });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].large, true);
    assert.equal(plans[0].target, 'sg');
    const us = plans[0].members.find((m) => m.region === 'us');
    assert.deepEqual(us.squads, { HHHH: [0, 2] });
    // the smaller room hosts when it is the target: the bigger one would not fit in it
    const opted = [1, 2].map((i) => ({ id: `s${i}`, difficulty: 'NORMAL', wait: 20_000, large: true }));
    const fill = cross({ rooms: [ga], solos: [] }, { rooms: [], solos: opted });
    assert.equal(fill[0].large, true);
    assert.equal(fill[0].target, 'sg', 'where the Grand Alliance is, though the queue is elsewhere');
  });
});

// ---- the lobby ---------------------------------------------------------------------------------------------------------

const VANILLA = 'a0'.repeat(32);
const CS = { [V21]: 'b1'.repeat(32), [V1]: 'c1'.repeat(32), 'act1autochess@V1_1': 'd1'.repeat(32) };
const ALL = VERSIONS.map((v) => v.id);
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const csOf = (id) => (id === DEFAULT_VERSION ? VANILLA : CS[id]);
const dataOf = (id) => (id === DEFAULT_VERSION ? getData() : getVersionData(id));
const versionStub = () => ({
  ids: ALL, defaultId: DEFAULT_VERSION, nonDefault: ALL.filter((id) => id !== DEFAULT_VERSION),
  isEnabled: (id) => ALL.includes(id), csOf,
  content: (id) => (id === DEFAULT_VERSION ? Object.freeze({ cs: VANILLA, vanilla: true, plugins: Object.freeze([]) })
    : Object.freeze({ cs: CS[id], vanilla: true, version: id, plugins: Object.freeze([]) })),
  data: dataOf,
  dataOfCs: (cs) => { const id = ALL.find((x) => csOf(x) === cs); return id ? dataOf(id) : null; },
  offered: (id, mode) => DIFFICULTIES.filter((d) => Object.hasOwn(dataOf(id).config.modes, modeIdFor(mode, d))),
  welcome: () => ALL.map((id) => ({ id, cs: csOf(id) })),
});
class Rec { static all = []; constructor(o) { this.opts = o; Rec.all.push(o); } start() {} dispose() {} }

function harness() {
  Rec.all.length = 0;
  const registry = new SessionRegistry();
  const clock = { t: 1_000_000 };
  const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, content: { cs: VANILLA }, getData, versions: versionStub(),
    now: () => clock.t, options: { matchTickMs: 600_000, largeRooms: true, roomListGapMs: 0 } });
  const frames = new Map();
  const player = (name) => {
    const s = registry.create(name);
    s.connected = true;
    s.disconnectedAt = null;
    const box = [];
    frames.set(s.playerId, box);
    s.ws = { readyState: 1, bufferedAmount: 0, send(d) { box.push(JSON.parse(d)); }, terminate() {} };
    return s;
  };
  const got = (s, t) => frames.get(s.playerId).filter((m) => m.t === t);
  return { lobby, player, got, clock, close: () => lobby.shutdown() };
}
const ok = (r) => assert.deepEqual(r, { ok: true });
const roomOf = (h, s) => h.lobby.rooms.get(s.roomCode);
/** A searching co-op room of `count` humans, every one but the host ready (and, in a version room, loaded). */
function searchingRoom(h, count, extra = {}, name = 'P') {
  const ps = Array.from({ length: count }, (_, i) => h.player(`${name}${i}`));
  ok(h.lobby.create(ps[0], { mode: 'coop', difficulty: 'NORMAL', ...extra }));
  const r = roomOf(h, ps[0]);
  for (const p of ps.slice(1)) {
    ok(h.lobby.join(p, { code: r.code, ...(extra.password ? { password: extra.password } : {}) }));
    ok(h.lobby.ready(p, { ready: true }));
  }
  if (r.needsContent) for (const p of ps) ok(h.lobby.contentReady(p, { cs: r.content.cs }));
  ok(h.lobby.search(ps[0], { on: true }));
  return { r, ps };
}

describe('lobby: versions', () => {
  test('a version switch while searching keeps the search, in the new version\'s pool only', () => {
    const h = harness();
    try {
      const { r: lone, ps: [host] } = searchingRoom(h, 1, {}, 'L');
      ok(h.lobby.proposeVersion(host, { version: V1 }));
      assert.equal(lone.searching, true);
      const { r: def } = searchingRoom(h, 3, {}, 'D');
      h.lobby.matchmaker.run();
      assert.equal(lone.disposed, false, 'no merge into the default room');
      assert.equal(def.seats.filter(Boolean).length, 3);
      assert.equal(Rec.all.length, 0);
    } finally { h.close(); }
  });

  test('queue.join: versions this server lacks are refused, ones without the difficulty dropped', () => {
    const h = harness();
    try {
      const a = h.player('A');
      assert.equal(h.lobby.queueJoin(a, { difficulty: 'NORMAL', versions: ['nope'] }).error, ERR.VERSION_UNKNOWN);
      ok(h.lobby.queueJoin(a, { difficulty: 'NORMAL', versions: [V1, DEFAULT_VERSION], large: true }));
      const st = h.got(a, 'queue.state').at(-1);
      assert.deepEqual(st.versions, [V1, DEFAULT_VERSION]);
      assert.equal(st.large, true);
      assert.equal(validateC2S({ t: 'queue.join', difficulty: 'NORMAL', versions: [V1], large: true }), null);
      assert.notEqual(validateC2S({ t: 'queue.join', difficulty: 'NORMAL', versions: [] }), null);
    } finally { h.close(); }
  });

  test('a matchmade version room starts only once every page has loaded it; a page that cannot leaves', () => {
    const h = harness();
    try {
      const { r } = searchingRoom(h, 1, { version: V1 }, 'H');
      const solos = ['S1', 'S2', 'S3'].map((x) => h.player(x));
      for (const s of solos) ok(h.lobby.queueJoin(s, { difficulty: r.difficulty, versions: [V1] }));
      h.lobby.matchmaker.run();
      assert.equal(roomSize(r), 4);
      assert.equal(r.match, null, 'the solos\' pages have not loaded 第一期 yet');
      ok(h.lobby.contentReady(solos[0], { cs: r.content.cs }));
      ok(h.lobby.contentReady(solos[1], { cs: r.content.cs, ok: false }));
      h.lobby.matchmaker.run();
      assert.equal(r.match, null);
      assert.equal(roomSize(r), 3, 'the page that could not load it left');
      assert.equal(h.got(solos[1], 'room.closed').at(-1)?.reason, 'content');
      assert.equal(r.searching, true, 'and the room searches on');
      const s4 = h.player('S4');
      ok(h.lobby.queueJoin(s4, { difficulty: r.difficulty, versions: [V1] }));
      h.lobby.matchmaker.run();
      ok(h.lobby.contentReady(solos[2], { cs: r.content.cs }));
      h.clock.t += 61_000;
      h.lobby.matchmaker.run();
      assert.equal(roomSize(r), 3, 'still not ready after contentWaitMs: it leaves too');
      assert.equal(h.got(s4, 'room.closed').at(-1)?.reason, 'content');
    } finally { h.close(); }
  });

  test('queue.ai on another version: the AI room starts once the page has loaded that version', () => {
    const h = harness();
    try {
      const a = h.player('A');
      ok(h.lobby.queueJoin(a, { difficulty: 'NORMAL', versions: [V1] }));
      h.clock.t += 121_000;
      ok(h.lobby.queueAi(a));
      const r = roomOf(h, a);
      assert.equal(r.version, V1);
      assert.equal(roomSize(r), 4);
      assert.equal(r.match, null);
      ok(h.lobby.contentReady(a, { cs: r.content.cs }));
      h.lobby.matchmaker.run();
      assert.ok(r.match, 'started');
    } finally { h.close(); }
  });

  test('4 Doctors queued for 第一期 make a 第一期 room, which starts once their pages load it', () => {
    const h = harness();
    try {
      const solos = ['A', 'B', 'C', 'D'].map((x) => h.player(x));
      for (const s of solos) ok(h.lobby.queueJoin(s, { difficulty: 'NORMAL', versions: [V1] }));
      h.lobby.matchmaker.run();
      const r = roomOf(h, solos[0]);
      assert.equal(r.version, V1);
      assert.equal(r.match, null);
      for (const s of solos) ok(h.lobby.contentReady(s, { cs: r.content.cs }));
      h.lobby.matchmaker.run();
      assert.ok(r.match, 'started');
      assert.equal(Rec.all.at(-1).version, V1);
    } finally { h.close(); }
  });
});

describe('lobby: Grand Alliances', () => {
  test('a locked Grand Alliance searches; merges keep squads whole and it starts at 8', () => {
    const h = harness();
    try {
      const { r: big, ps } = searchingRoom(h, 1, { capacity: 8 }, 'G');
      // the host's group: A 4, B 1 (the fifth to join sits in seat 5)
      ok(h.lobby.search(ps[0], { on: false }));
      ok(h.lobby.setLock(ps[0], { on: true, password: 'ABCD' }));
      const more = ['G1', 'G2', 'G3', 'G4'].map((x) => h.player(x));
      for (const p of more) { ok(h.lobby.join(p, { code: big.code, password: 'ABCD' })); ok(h.lobby.ready(p, { ready: true })); }
      ok(h.lobby.search(ps[0], { on: true }));
      const { r: small } = searchingRoom(h, 3, { capacity: 8 }, 'K');
      const { r: four } = searchingRoom(h, 3, {}, 'F');
      h.lobby.matchmaker.run();
      assert.equal(small.disposed, true, 'merged');
      assert.equal(four.disposed, false, 'a 4-seat room never merges in');
      assert.ok(big.match, 'full at 8: started');
      const squadB = big.seats.slice(4).filter(Boolean).map((s) => s.name).sort();
      assert.deepEqual(squadB, ['G4', 'K0', 'K1', 'K2'], 'the 3 kept together in squad B');
    } finally { h.close(); }
  });

  test('only opted-in queued Doctors fill a Grand Alliance', () => {
    const h = harness();
    try {
      const { r: ga } = searchingRoom(h, 6, { capacity: 8 }, 'G');
      const plain = ['A', 'B'].map((x) => h.player(x));
      for (const s of plain) ok(h.lobby.queueJoin(s, { difficulty: 'NORMAL' }));
      h.lobby.matchmaker.run();
      assert.equal(roomSize(ga), 6);
      const opted = ['C', 'D'].map((x) => h.player(x));
      for (const s of opted) ok(h.lobby.queueJoin(s, { difficulty: 'NORMAL', large: true }));
      h.lobby.matchmaker.run();
      assert.equal(roomSize(ga), 8);
      assert.ok(ga.match);
    } finally { h.close(); }
  });

  test('across regions: the reserve holds seats per squad and a moved Doctor sits in the squad it was told', () => {
    const h = harness();
    try {
      h.lobby.crossTicket = (p) => JSON.stringify(p);
      h.lobby.crossVerify = (x) => JSON.parse(x);
      const { r: ga } = searchingRoom(h, 4, { capacity: 8 }, 'G'); // squad A full
      const res = h.lobby.crossReserve({ difficulty: 'NORMAL', large: true, rooms: [ga.code], solos: [], humans: 4, bots: 0, ttlMs: 15_000,
        incoming: [{ region: 'us', rooms: [{ code: 'XXXX', squads: [3, 0] }], solos: 1 }] });
      assert.equal(res.ok, true);
      assert.deepEqual(res.assign, { XXXX: [1, 1] });
      assert.deepEqual(res.soloSquads, { us: [1] });
      assert.deepEqual(ga.reservations[0].squads, [0, 4]);
      const stranger = h.player('X');
      assert.equal(h.lobby.join(stranger, { code: ga.code }).error, ERR.ROOM_FULL, 'every free seat is held');
      const moved = h.player('M');
      ok(h.lobby.join(moved, { code: ga.code, ticket: res.ticket, squad: 1 }));
      assert.ok(ga.seatOf(moved.playerId).seat >= 4);
      const bad = h.lobby.crossReserve({ difficulty: 'NORMAL', large: true, rooms: [ga.code], solos: [], humans: 4, bots: 0, ttlMs: 15_000, incoming: [] });
      assert.equal(bad.ok, false, 'a room holding seats is not matchable');
    } finally { h.close(); }
  });
});

describe('lobby: review fixes (holds, votes, the load wait, moved squads)', () => {
  const tickets = (h) => { h.lobby.crossTicket = (p) => JSON.stringify(p); h.lobby.crossVerify = (x) => JSON.parse(x); };

  test('a Grand Alliance whose held seats expire searches on at 5/8 instead of starting', () => {
    const h = harness();
    try {
      tickets(h);
      const { r: ga } = searchingRoom(h, 5, { capacity: 8 }, 'G');
      const res = h.lobby.crossReserve({ difficulty: 'NORMAL', large: true, rooms: [ga.code], solos: [], humans: 3, bots: 0, ttlMs: 1000,
        incoming: [{ region: 'us', rooms: [{ code: 'XXXX', squads: [0, 3] }], solos: 0 }] });
      assert.equal(res.ok, true);
      h.clock.t += 2000;
      h.lobby.matchmaker.run();
      assert.equal(ga.reservations, null);
      assert.equal(ga.match, null, 'not started at 5');
      assert.equal(ga.searching, true);
    } finally { h.close(); }
  });

  test('no version switch while seats are held; a merge and a solo placement void an open version vote', () => {
    const h = harness();
    try {
      tickets(h);
      const { r: held, ps: [hh] } = searchingRoom(h, 3, {}, 'H');
      assert.equal(h.lobby.crossReserve({ difficulty: 'NORMAL', rooms: [held.code], solos: [], humans: 1, bots: 0, ttlMs: 15_000 }).ok, true);
      assert.equal(h.lobby.proposeVersion(hh, { version: V1 }).error, ERR.NOT_READY);
      const { r: voting, ps: [vh] } = searchingRoom(h, 2, {}, 'V');
      ok(h.lobby.proposeVersion(vh, { version: V1 }));
      assert.ok(voting.versionVote, 'a vote is open');
      const { r: mates } = searchingRoom(h, 2, {}, 'M');
      h.lobby.matchmaker.run();
      const merged = [voting, mates].find((x) => !x.disposed);
      assert.equal(roomSize(merged), 4, 'merged');
      assert.equal(voting.versionVote, null, 'the merge voided it (kept room or closed one)');
      const { r: voting2, ps: [v2] } = searchingRoom(h, 2, {}, 'W');
      ok(h.lobby.proposeVersion(v2, { version: V1 }));
      for (const x of ['S1', 'S2'].map((s) => h.player(s))) ok(h.lobby.queueJoin(x, { difficulty: 'NORMAL' }));
      h.lobby.matchmaker.run();
      assert.equal(roomSize(voting2), 4);
      assert.equal(voting2.versionVote, null, 'the solo placement voided it');
    } finally { h.close(); }
  });

  test('the load wait starts over when the room stops being full and ready', () => {
    const h = harness();
    try {
      const solos = ['A', 'B', 'C', 'D'].map((x) => h.player(x));
      for (const s of solos) ok(h.lobby.queueJoin(s, { difficulty: 'NORMAL', versions: [V1] }));
      h.lobby.matchmaker.run();
      const r = roomOf(h, solos[0]);
      ok(h.lobby.contentReady(solos[0], { cs: r.content.cs }));
      h.clock.t += 50_000;
      const seat = r.seatOf(solos[3].playerId);
      seat.connected = false; // dropped: not ready, so no wait
      h.lobby.matchmaker.run();
      assert.equal(r.contentWait, null);
      seat.connected = true;
      h.lobby.matchmaker.run();
      h.clock.t += 20_000; // 70 s since the first wait, 20 s since this one
      h.lobby.matchmaker.run();
      assert.equal(roomSize(r), 4, 'nobody kicked: the wait started over');
    } finally { h.close(); }
  });

  test('a moved Grand Alliance whose squads changed since the plan does not move', () => {
    const h = harness();
    try {
      const { r: src } = searchingRoom(h, 3, { capacity: 8 }, 'G'); // squad A 3, B 0
      const cmd = { member: 'us', region: 'sg', code: 'TTTT', ticket: 't', rooms: [src.code], solos: [], humans: 3, bots: 0, large: true,
        assign: { [src.code]: [1, 0] }, soloSquads: [] };
      assert.equal(h.lobby.crossMove({ ...cmd, squads: { [src.code]: [2, 1] } }).ok, false, 'planned 2+1, now 3+0');
      assert.equal(src.disposed, false, 'it stays and searches on');
      assert.equal(h.lobby.crossMove({ ...cmd, squads: { [src.code]: [3, 0] } }).ok, true);
    } finally { h.close(); }
  });
});
