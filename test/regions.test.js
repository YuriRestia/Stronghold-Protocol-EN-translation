// test/regions.test.js — (fork) several servers, one game (DESIGN §8.7, §90.2): keys that name their server, the signed link,
// counts over it, key joins and matchmaking across two real server processes' worth of stack in this process.
import { describe, test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { parseRegions, regionLetters, regionOfCode, regionSocketUrl } from '../shared/regions.js';
import { regionConfigFrom, regionConnectSources, regionsReport } from '../server/regions.js';
import { signBody, verifyBody, signTicket, verifyTicket, compatible, SYNC_PATH } from '../server/peerLink.js';
import { planCross } from '../server/crossMatch.js';
import { CODE_ALPHABET, ERR, MAX_SEATS } from '../shared/constants.js';
import { siteCsp } from '../server/http/csp.js';

const SECRET = 'x'.repeat(40);
const quiet = { info() {}, warn() {}, debug() {}, error() {} };
const LIST = [{ id: 'sg', host: 'a.example' }, { id: 'us', host: 'b.example' }];

describe('keys name their server', () => {
  test('two regions split the alphabet in half, and every letter names exactly one', () => {
    assert.equal(regionLetters(LIST, 'sg'), 'ABCDEFGHJKLM');
    assert.equal(regionLetters(LIST, 'us'), 'NPQRSTUVWXYZ');
    for (const c of CODE_ALPHABET) assert.equal(regionOfCode(`${c}AAA`, LIST), regionLetters(LIST, 'sg').includes(c) ? 'sg' : 'us');
  });

  test('a key in lower case or with spaces still names its server; a stray character names none', () => {
    assert.equal(regionOfCode(' nabc', LIST), 'us');
    assert.equal(regionOfCode('1ABC', LIST), null);
    assert.equal(regionOfCode('ABCD', []), null);
  });

  test('three regions leave no letter out', () => {
    const three = [...LIST, { id: 'eu', host: 'c.example' }];
    assert.equal(['sg', 'us', 'eu'].map((id) => regionLetters(three, id)).join(''), CODE_ALPHABET);
  });

  test('parseRegions refuses anything it cannot use: one server, as without the setting', () => {
    assert.deepEqual(parseRegions('sg=a.example,us=b.example:8443').map((r) => r.host), ['a.example', 'b.example:8443']);
    for (const bad of ['', 'sg=a.example', 'sg=a.example,sg=b.example', 'sg=a.example,us=a.example', 'sg=a b,us=c', 'nonsense', null]) {
      assert.deepEqual(parseRegions(bad), [], String(bad));
    }
  });

  test('a socket uses wss from an https page, and ws for this machine', () => {
    assert.equal(regionSocketUrl('us.example', '/_build/g/_/ws', true), 'wss://us.example/_build/g/_/ws');
    assert.equal(regionSocketUrl('localhost:3001', '/ws', true), 'ws://localhost:3001/ws');
  });
});

describe('the operator\'s settings', () => {
  const env = { SP_REGIONS: 'sg=a.example,us=b.example', SP_REGION: 'us' };

  test('off without SP_REGIONS, and off with a region not in the list', () => {
    assert.equal(regionConfigFrom({}), null);
    assert.equal(regionConfigFrom({ ...env, SP_REGION: 'eu' }), null);
  });

  test('the first region is the arbiter; a server knows its own letters', () => {
    const c = regionConfigFrom(env);
    assert.equal(c.arbiter, 'sg');
    assert.equal(c.letters, 'NPQRSTUVWXYZ');
    assert.equal(c.auto, false);
  });

  test('cross-region matchmaking needs a long enough secret', () => {
    assert.equal(regionConfigFrom({ ...env, SP_CROSS_MATCH: '1' }).crossMatch, false);
    assert.equal(regionConfigFrom({ ...env, SP_CROSS_MATCH: '1', SP_PEER_SECRET: 'short' }).secret, null);
    assert.equal(regionConfigFrom({ ...env, SP_CROSS_MATCH: '1', SP_PEER_SECRET: SECRET }).crossMatch, true);
  });

  test('a page may reach the other regions\' sockets only, and /healthz never shows the secret', () => {
    const c = regionConfigFrom({ ...env, SP_PEER_SECRET: SECRET });
    assert.deepEqual(regionConnectSources(c), ['wss://a.example']);
    assert.equal(JSON.stringify(regionsReport(c)).includes(SECRET), false);
    assert.match(siteCsp('public', { connectSources: ['wss://a.example'] }), /connect-src 'self' wss:\/\/a\.example/);
    assert.match(siteCsp('public'), /connect-src 'self'[;"]?/);
  });
});

describe('signatures and tickets', () => {
  test('a body verifies only with its secret, its text and a recent time', () => {
    const now = 1_000_000;
    const sig = signBody(SECRET, now, 'body');
    assert.equal(verifyBody(SECRET, now, sig, 'body', now), true);
    assert.equal(verifyBody(SECRET, now, sig, 'other', now), false);
    assert.equal(verifyBody('y'.repeat(40), now, sig, 'body', now), false);
    assert.equal(verifyBody(SECRET, now, sig, 'body', now + 60_000), false);
    assert.equal(verifyBody(SECRET, 'x', sig, 'body', now), false);
    assert.equal(verifyBody(SECRET, now, undefined, 'body', now), false);
  });

  test('a ticket is refused when forged, edited or late', () => {
    const t = signTicket(SECRET, { rid: 'r', code: 'ABCD', exp: 2000 });
    assert.equal(verifyTicket(SECRET, t, 1000).rid, 'r');
    assert.equal(verifyTicket(SECRET, t, 3000), null);
    assert.equal(verifyTicket('y'.repeat(40), t, 1000), null);
    assert.equal(verifyTicket(SECRET, `A${t}`, 1000), null);
    for (const bad of [null, 5, '', 'nodot', '.']) assert.equal(verifyTicket(SECRET, bad, 1000), null);
  });

  test('servers on another generation, protocol or game data never share a match', () => {
    const a = { gen: 'g1', proto: 1, cs: 'c' };
    assert.equal(compatible(a, { ...a }), true);
    for (const b of [{ ...a, gen: 'g2' }, { ...a, proto: 2 }, { ...a, cs: 'd' }]) assert.equal(compatible(a, b), false);
    assert.equal(compatible(a, null), false);
  });
});

describe('planCross', () => {
  const room = (code, humans, wait = 20_000, bots = 0, difficulty = 'NORMAL') => ({ code, humans, bots, difficulty, wait });
  const solo = (id, wait = 20_000, difficulty = 'NORMAL') => ({ id, difficulty, wait });
  const plan = (sg, us, opts = {}) => planCross([{ id: 'sg', ...sg }, { id: 'us', ...us }], 1_000_000, { crossAfterMs: 15_000, ...opts });

  test('an exact fill across regions goes where most of the humans are', () => {
    const [p, ...rest] = plan({ rooms: [room('AAAA', 1)], solos: [] }, { rooms: [room('NNNN', 3)], solos: [] });
    assert.equal(rest.length, 0);
    assert.equal(p.target, 'us');
    assert.deepEqual(p.members.find((m) => m.region === 'sg').rooms, ['AAAA']);
  });

  test('a tie goes to the longest wait', () => {
    assert.equal(plan({ rooms: [room('AAAA', 2, 40_000)], solos: [] }, { rooms: [room('NNNN', 2, 20_000)], solos: [] })[0].target, 'sg');
    assert.equal(plan({ rooms: [room('AAAA', 2, 20_000)], solos: [] }, { rooms: [room('NNNN', 2, 40_000)], solos: [] })[0].target, 'us');
  });

  test('a search younger than the local-first wait stays out', () => {
    assert.deepEqual(plan({ rooms: [room('AAAA', 2, 14_000)], solos: [] }, { rooms: [room('NNNN', 2)], solos: [] }), []);
  });

  test('never a partial merge: nobody moves into a room that would not start', () => {
    assert.deepEqual(plan({ rooms: [room('AAAA', 1)], solos: [] }, { rooms: [room('NNNN', 1)], solos: [] }), []);
    assert.deepEqual(plan({ rooms: [room('AAAA', 3)], solos: [] }, { rooms: [room('NNNN', 3)], solos: [] }), []);
  });

  test('one region\'s own full plan is left to that region\'s matchmaker', () => {
    assert.deepEqual(plan({ rooms: [room('AAAA', 2), room('BBBB', 2)], solos: [] }, { rooms: [], solos: [] }), []);
  });

  test('different difficulties never meet', () => {
    assert.deepEqual(plan({ rooms: [room('AAAA', 2, 20_000, 0, 'HARD')], solos: [] }, { rooms: [room('NNNN', 2)], solos: [] }), []);
  });

  test('solos across regions make a room of four; bots count toward the fill', () => {
    const [p] = plan({ rooms: [], solos: [solo('a'), solo('b'), solo('c')] }, { rooms: [], solos: [solo('d')] });
    assert.equal(p.target, 'sg');
    assert.equal(p.members.reduce((n, m) => n + m.humans, 0), MAX_SEATS);
    const [q] = plan({ rooms: [room('AAAA', 1, 20_000, 2)], solos: [] }, { rooms: [], solos: [solo('d')] });
    assert.deepEqual(q.members.find((m) => m.region === 'us').solos, ['d']);
    assert.equal(q.target, 'sg'); // a tie of one human each: the longer wait, then the name
  });

  test('members already in a plan stay out of the next', () => {
    const busy = new Set(['room:AAAA']);
    assert.deepEqual(plan({ rooms: [room('AAAA', 2)], solos: [] }, { rooms: [room('NNNN', 2)], solos: [] }, { busy }), []);
  });
});

/**
 * Two regions in this process, each a full server joined by real HTTP. Starting one loads all the game data, so the tests
 * share one pair and set what they need here: `cross` is matchmaking on or off, `usGen` the US server's generation.
 */
let shared = null;
async function startPair() {
  const opts = { MatchClass: StubMatch, port: 0, host: '127.0.0.1', log: quiet, quiet: true, noticeFile: null, assetIndex: false, peerPollMs: 40, matchTickMs: 20 };
  const config = (self, hosts) => ({ self, list: hosts, letters: regionLetters(hosts, self), arbiter: 'sg', auto: true, crossMatch: true, secret: SECRET, crossAfterMs: 0 });
  const sgConfig = config('sg', [{ id: 'sg', host: 'localhost:1' }, { id: 'us', host: 'localhost:2' }]);
  const sg = await startServer({ ...opts, regions: sgConfig });
  const usConfig = config('us', [{ id: 'sg', host: `localhost:${sg.port}` }, { id: 'us', host: 'localhost:2' }]);
  const us = await startServer({ ...opts, regions: usConfig });
  return { sg, us, sgConfig, usConfig };
}
async function twoRegions({ crossAfterMs = 0, cross = true, usGen = null } = {}) {
  shared ??= await startPair();
  const { sg, us, sgConfig } = shared;
  sgConfig.crossAfterMs = crossAfterMs;
  for (const s of [sg, us]) {
    s.lobby.crossTicket = cross ? (payload) => signTicket(SECRET, payload) : null;
    s.lobby.crossVerify = cross ? (ticket) => verifyTicket(SECRET, ticket, Date.now()) : null;
  }
  us.peer.gen = usGen;
  return { sg, us, close: async () => {} };
}

const open = new Set();
async function player(server, name) {
  const c = await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);
  open.add(c);
  const w = await c.hello(name);
  c.id = w.playerId;
  c.token = w.token;
  return c;
}
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
/** A searching room of `n` humans on `server`. */
async function searching(server, n, tag) {
  const host = await player(server, `${tag}0`);
  await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
  const { code } = await host.waitFor('room.state', (s) => s.hostId === host.id);
  const members = [host];
  for (let i = 1; i < n; i++) {
    const c = await player(server, `${tag}${i}`);
    await ok(c, { t: 'room.join', code });
    await ok(c, { t: 'room.ready', ready: true });
    members.push(c);
  }
  await ok(host, { t: 'room.search', on: true });
  return { code, members };
}

describe('two servers', () => {
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
    await new Promise((done) => setTimeout(done, 60)); // the servers see those sockets go before the next test searches
  });
  after(async () => { await Promise.all([shared?.sg.close(), shared?.us.close()]); shared = null; });

  test('each server\'s keys start with its own letters, and /healthz names the regions', async () => {
    const r = await twoRegions({ cross: false });
    try {
      for (const [server, letters] of [[r.sg, 'ABCDEFGHJKLM'], [r.us, 'NPQRSTUVWXYZ']]) {
        const c = await player(server, 'Doc');
        await ok(c, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
        const { code } = await c.waitFor('room.state');
        assert.ok(letters.includes(code[0]), code);
      }
      const h = await (await fetch(`http://127.0.0.1:${r.us.port}/healthz`)).json();
      assert.equal(h.regions.self, 'us');
    } finally { await r.close(); }
  });

  test('a room is on one server only, whichever key was asked', async () => {
    const r = await twoRegions({ cross: false });
    try {
      const a = await player(r.us, 'Host');
      await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
      const { code } = await a.waitFor('room.state');
      assert.equal(regionOfCode(code, [{ id: 'sg' }, { id: 'us' }]), 'us');
      const b = await player(r.us, 'Friend');
      await ok(b, { t: 'room.join', code });
      assert.equal((await r.sg.lobby.rooms.get(code)), undefined, 'the room is on one server only');
    } finally { await r.close(); }
  });

  test('sys.online adds the other server\'s players', async () => {
    const r = await twoRegions({ cross: false });
    try {
      await player(r.sg, 'A');
      await player(r.us, 'B');
      await player(r.us, 'C');
      const seen = await player(r.sg, 'D');
      const m = await seen.waitFor('sys.online', (x) => x.online === 4);
      assert.equal(m.online, 4);
      const h = await (await fetch(`http://127.0.0.1:${r.us.port}/healthz`)).json();
      assert.equal(h.peer.up, true);
    } finally { await r.close(); }
  });

  test('a wrong signature is refused, and the link never takes an unsigned post', async () => {
    const r = await twoRegions({ cross: false });
    try {
      const url = `http://127.0.0.1:${r.sg.port}${SYNC_PATH}`;
      assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 403);
      const at = Date.now();
      const body = JSON.stringify({ region: 'us' });
      assert.equal((await fetch(url, { method: 'POST', body, headers: { 'x-sp-peer-time': String(at), 'x-sp-peer-sig': signBody('z'.repeat(40), at, body) } })).status, 403);
      assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify({ region: 'sg' }), headers: { 'x-sp-peer-time': String(at), 'x-sp-peer-sig': signBody(SECRET, at, JSON.stringify({ region: 'sg' })) } })).status, 400, 'not from another region');
      assert.equal((await fetch(`http://127.0.0.1:${r.sg.port}${SYNC_PATH}`)).status, 404, 'GET is no route');
    } finally { await r.close(); }
  });

  test('searches on two servers that fill a room meet on the server with more humans, and it starts', async () => {
    const r = await twoRegions();
    try {
      const big = await searching(r.us, 3, 'U');
      const small = await searching(r.sg, 1, 'S');
      const mover = small.members[0];
      const move = await mover.waitFor('room.move');
      assert.equal(move.region, 'us');
      assert.equal(move.code, big.code);
      const closed = await mover.waitFor('room.closed');
      assert.equal(closed.reason, 'moved');
      const arrived = await player(r.us, 'S0');
      await ok(arrived, { t: 'room.join', code: move.code, ticket: move.ticket });
      await big.members[0].waitFor('room.state', (s) => s.inMatch === true);
      const state = await arrived.waitFor('room.state', (s) => s.inMatch === true);
      assert.equal(state.seats.filter((s) => s && !s.isBot).length, 4);
      assert.equal(r.sg.lobby.rooms.has(small.code), false, 'the source room is gone');
    } finally { await r.close(); }
  });

  test('a local fill comes first: nothing crosses while a search is younger than the wait', async () => {
    const r = await twoRegions({ crossAfterMs: 60_000 });
    try {
      const a = await searching(r.us, 2, 'U');
      await searching(r.sg, 2, 'S');
      await new Promise((ok_) => setTimeout(ok_, 300));
      assert.equal(a.members[0].inbox.some((m) => m.t === 'room.move'), false);
      assert.equal(r.us.lobby.rooms.get(a.code).reservations ?? null, null);
    } finally { await r.close(); }
  });

  test('held seats keep a stranger out, and a ticket from elsewhere is refused', async () => {
    const r = await twoRegions({ cross: false });
    try {
      const lobby = r.us.lobby;
      lobby.crossTicket = (p) => signTicket(SECRET, p);
      lobby.crossVerify = (x) => verifyTicket(SECRET, x, Date.now());
      const room = await searching(r.us, 3, 'U');
      const held = lobby.crossReserve({ difficulty: 'NORMAL', rooms: [room.code], solos: [], humans: 1, bots: 0, ttlMs: 5000 });
      assert.equal(held.ok, true);
      const stranger = await player(r.us, 'X');
      const refused = await stranger.request({ t: 'room.join', code: room.code });
      assert.equal(refused.code, ERR.ROOM_FULL);
      const forged = await stranger.request({ t: 'room.join', code: room.code, ticket: signTicket('y'.repeat(40), { rid: held.rid, code: room.code, exp: Date.now() + 5000 }) });
      assert.equal(forged.code, ERR.ROOM_FULL);
      const other = signTicket(SECRET, { rid: 'nope', code: room.code, exp: Date.now() + 5000 });
      assert.equal((await stranger.request({ t: 'room.join', code: room.code, ticket: other })).code, ERR.ROOM_FULL);
      await ok(stranger, { t: 'room.join', code: room.code, ticket: held.ticket });
      await room.members[0].waitFor('room.state', (s) => s.inMatch === true);
    } finally { await r.close(); }
  });

  test('a group that never arrives frees the seats, and the room searches on', async () => {
    const r = await twoRegions({ cross: false });
    try {
      const lobby = r.us.lobby;
      lobby.crossTicket = (p) => signTicket(SECRET, p);
      lobby.crossVerify = (x) => verifyTicket(SECRET, x, Date.now());
      const room = await searching(r.us, 2, 'U');
      const held = lobby.crossReserve({ difficulty: 'NORMAL', rooms: [room.code], solos: [], humans: 1, bots: 1, ttlMs: 10 });
      assert.equal(held.ok, true);
      const target = lobby.rooms.get(room.code);
      assert.equal(target.seats.filter((s) => s?.isBot).length, 1, 'the group\'s AI seat is there at once');
      await room.members[0].waitFor('room.state', (s) => s.seats.filter(Boolean).length === 2 && !target.reservations);
      assert.equal(target.searching, true);
      assert.equal(target.seats.filter((s) => s?.isBot).length, 0, 'it leaves with the reservation');
    } finally { await r.close(); }
  });

  test('a plan refuses when a member stopped waiting, before anything moves', async () => {
    const r = await twoRegions({ cross: false });
    try {
      const lobby = r.us.lobby;
      lobby.crossTicket = (p) => signTicket(SECRET, p);
      const room = await searching(r.us, 2, 'U');
      await ok(room.members[0], { t: 'room.search', on: false });
      assert.equal(lobby.crossReserve({ difficulty: 'NORMAL', rooms: [room.code], solos: [], humans: 2, bots: 0, ttlMs: 5000 }).ok, false);
      assert.equal(lobby.crossMove({ region: 'sg', code: 'AAAA', ticket: 't', rooms: [room.code], solos: [] }).ok, false);
      assert.equal(lobby.rooms.has(room.code), true);
    } finally { await r.close(); }
  });

  test('a queued Doctor moves with a ticket and leaves the queue', async () => {
    const r = await twoRegions();
    try {
      const room = await searching(r.us, 3, 'U');
      const solo = await player(r.sg, 'Solo');
      await ok(solo, { t: 'queue.join', difficulty: 'NORMAL' });
      const move = await solo.waitFor('room.move');
      assert.equal(move.code, room.code);
      const q = await solo.waitFor('queue.state', (m) => m.queued === false);
      assert.equal(q.placed, true);
    } finally { await r.close(); }
  });

  test('a server on another generation is left out of the plans; each stays local', async () => {
    const r = await twoRegions({ usGen: 'other-gen' });
    try {
      const a = await searching(r.us, 2, 'U');
      await searching(r.sg, 2, 'S');
      await new Promise((ok_) => setTimeout(ok_, 300));
      assert.equal(a.members[0].inbox.some((m) => m.t === 'room.move'), false);
    } finally { await r.close(); }
  });
});

describe('no link', () => {
  test('without a secret a server has regions and keys but no link, and the sync path is no route', async () => {
    const server = await startServer({ MatchClass: StubMatch, port: 0, host: '127.0.0.1', log: quiet, quiet: true, noticeFile: null, assetIndex: false,
      regions: { self: 'sg', list: LIST, letters: regionLetters(LIST, 'sg'), arbiter: 'sg', auto: false, crossMatch: false, secret: null, crossAfterMs: 0 } });
    try {
      const h = await (await fetch(`http://127.0.0.1:${server.port}/healthz`)).json();
      assert.equal(h.regions.self, 'sg');
      assert.equal(h.peer, undefined);
      assert.equal((await fetch(`http://127.0.0.1:${server.port}${SYNC_PATH}`, { method: 'POST', body: '{}' })).status, 405);
    } finally { await server.close(); }
  });
});
