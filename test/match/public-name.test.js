// test/match/public-name.test.js — GitHub #118: a player who set a public name and turned it on (hello.publicName,
// ui/publicName.js) has it in the match record's seat (server/match/records.js); everyone else stays anonymous (#32).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { finishRecord } from '../../server/match/records.js';
import { sanitizePublicName } from '../../server/net.js';
import { validateC2S } from '../../shared/protocol.js';
import { PUBLIC_NAME_MAX_LEN } from '../../shared/constants.js';
import { parsePublicName, sentPublicName } from '../../public/js/ui/publicName.js';
import { Lobby } from '../../server/lobby.js';
import { SessionRegistry } from '../../server/net.js';
import { getData } from '../../server/data.js';

const SEATS = [
  { seat: 0, playerId: 'p_0123456789', name: 'Alice', isBot: false, connected: true, publicName: 'Alice#1234' },
  { seat: 1, playerId: 'p_9876543210', name: 'Bob', isBot: false, connected: true },
  { seat: 2, playerId: 'ai_deadbeef', name: 'AI-Two', isBot: true, connected: true, publicName: 'never' },
];

test('the record names only the seat that opted in; no nickname or id leaks', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', seats: SEATS.map((s) => ({ ...s })), seed: 11, record: true, fake: true });
  try {
    h.start();
    const rec = finishRecord(h.m, null);
    assert.ok(rec);
    assert.deepEqual(rec.seats.map((s) => s.name ?? null), ['Alice#1234', null, null]);
    const text = JSON.stringify(rec);
    for (const s of SEATS) { assert.ok(!text.includes(s.playerId), s.playerId); assert.ok(!text.includes(`"${s.name}"`), s.name); }
  } finally { h.m.dispose(); }
});

test('the name is plain text, at most PUBLIC_NAME_MAX_LEN, and optional in hello', () => {
  assert.equal(sanitizePublicName('  Fish  '), 'Fish');
  assert.equal(sanitizePublicName('<b>x</b>​'), sanitizePublicName('<b>x</b>'));
  assert.equal([...sanitizePublicName('x'.repeat(100))].length, PUBLIC_NAME_MAX_LEN);
  assert.equal(sanitizePublicName('   '), null);
  assert.equal(sanitizePublicName(42), null);
  assert.equal(validateC2S({ t: 'hello', name: 'A' }), null);
  assert.equal(validateC2S({ t: 'hello', name: 'A', publicName: 'Fish' }), null);
  assert.equal(validateC2S({ t: 'hello', name: 'A', publicName: 3 }), 'bad field publicName');
});

test('the browser sends it only while switched on', () => {
  assert.deepEqual(parsePublicName(null), { name: '', on: false });
  assert.equal(sentPublicName(parsePublicName({ name: 'Fish', on: false })), null);
  assert.equal(sentPublicName(parsePublicName({ name: '  ', on: true })), null);
  assert.equal(sentPublicName(parsePublicName({ name: ' Fish ', on: true })), 'Fish');
});

test('the lobby carries a session\'s public name into the match seats, never into room.state', () => {
  class Rec { static last = null; constructor(opts) { Rec.last = opts; } start() {} dispose() {} onLeave() {} onDisconnect() {} }
  const registry = new SessionRegistry();
  const quiet = { info() {}, warn() {}, error() {}, debug() {} };
  const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, getData });
  const states = [];
  const ps = ['Fish#1', null].map((publicName, i) => {
    const sess = registry.create(`P${i}`);
    Object.assign(sess, { connected: true, disconnectedAt: null, publicName });
    sess.ws = { readyState: 1, bufferedAmount: 0, send(d) { const m = JSON.parse(d); if (m.t === 'room.state') states.push(m); }, terminate() {} };
    return sess;
  });
  assert.deepEqual(lobby.create(ps[0], { mode: 'coop' }), { ok: true });
  assert.deepEqual(lobby.join(ps[1], { code: states.at(-1).code }), { ok: true });
  assert.ok(!JSON.stringify(states).includes('Fish#1'), 'room.state never carries it');
  for (const s of lobby.rooms.get(states.at(-1).code).seats) if (s) s.ready = true;
  assert.deepEqual(lobby.start(ps[0]), { ok: true });
  const bySeat = Object.fromEntries(Rec.last.seats.map((s) => [s.playerId, s.publicName]));
  assert.equal(bySeat[ps[0].playerId], 'Fish#1');
  assert.equal(bySeat[ps[1].playerId], null);
});
