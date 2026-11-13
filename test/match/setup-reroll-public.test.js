// (fork) No setup reroll in a room strangers could join (user, 2026-11-13: "rerolls must be disabled ... It's intended
// as a feature for friends to play privately, or solo"): the lobby's rerollLock (a public Grand Alliance, Find
// Teammates, the solo queue), the match's refusal and m.public rerollOff; private rooms and solo keep it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../../server/lobby.js';
import { SessionRegistry } from '../../server/net.js';
import { getData } from '../../server/data.js';
import { wireOptions } from '../../server/match/host/proxy.js';
import { makeMatch } from './harness.js';
import { ERR } from '../../shared/constants.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const ok = (r) => assert.deepEqual(r, { ok: true });

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
  const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, content: { cs: 'a0'.repeat(32) }, getData, options: { largeRooms: true, roomListGapMs: 0 } });
  const player = (name) => {
    const s = registry.create(name);
    s.connected = true;
    s.disconnectedAt = null;
    s.ws = { readyState: 1, bufferedAmount: 0, send() {}, terminate() {} };
    return s;
  };
  /** A room of `host` with a ready guest; returns the room. */
  const room = (create) => {
    const host = player('Host');
    ok(lobby.create(host, create));
    const r = lobby.roomOf(host);
    const guest = player('Guest');
    ok(lobby.join(guest, { code: r.code, ...(r.locked ? { password: r.password } : {}) }));
    ok(lobby.ready(guest, { ready: true }));
    return { r, host, guest };
  };
  /** Start the room's match and return the lock the match got. */
  const lockAtStart = ({ r, host }) => {
    Rec.last = null;
    ok(lobby.start(host));
    assert.ok(Rec.last, 'the match started');
    return Rec.last.rerollLock ?? null;
  };
  return { lobby, player, room, lockAtStart };
}

test('a private co-op room and a solo room keep the setup reroll (no rerollLock in the match options)', () => {
  const h = harness();
  const coop = h.room({ mode: 'coop', difficulty: 'NORMAL' });
  assert.equal(h.lobby.rerollLock(coop.r), null);
  assert.equal(h.lockAtStart(coop), null);
  assert.equal('rerollLock' in Rec.last, false, 'a private room\'s opts keep their keys');
  const solo = h.player('Solo');
  ok(h.lobby.create(solo, { mode: 'solo', difficulty: 'NORMAL' }));
  ok(h.lobby.start(solo));
  assert.equal(Rec.last.rerollLock ?? null, null);
});

test('a public (unlocked) Grand Alliance has no reroll; one created locked keeps it', () => {
  const h = harness();
  assert.equal(h.lockAtStart(h.room({ mode: 'coop', capacity: 8 })), 'public');
  assert.equal(h.lockAtStart(h.room({ mode: 'coop', capacity: 8, password: 'abcd' })), null);
});

test('a Grand Alliance that was public stays without reroll after the host locks it', () => {
  const h = harness();
  const ga = h.room({ mode: 'coop', capacity: 8 });
  ok(h.lobby.setLock(ga.host, { on: true }));
  assert.equal(h.lockAtStart(ga), 'matchmade');
  const locked = h.room({ mode: 'coop', capacity: 8, password: 'wxyz' });
  ok(h.lobby.setLock(locked.host, { on: false }));
  ok(h.lobby.setLock(locked.host, { on: true }));
  assert.equal(h.lockAtStart(locked), 'matchmade', 'opened to the public once');
});

test('Find Teammates on a private team or Grand Alliance turns the reroll off, also after the search stops', () => {
  const h = harness();
  const team = h.room({ mode: 'coop', difficulty: 'NORMAL' });
  ok(h.lobby.search(team.host, { on: true }));
  assert.equal(h.lockAtStart(team), 'matchmade');
  const stopped = h.room({ mode: 'coop', difficulty: 'NORMAL' });
  ok(h.lobby.search(stopped.host, { on: true }));
  ok(h.lobby.search(stopped.host, { on: false }));
  assert.equal(h.lockAtStart(stopped), 'matchmade');
  const ga = h.room({ mode: 'coop', capacity: 8, password: 'abcd' });
  ok(h.lobby.search(ga.host, { on: true }));
  assert.equal(h.lockAtStart(ga), 'matchmade');
});

test('a room the solo queue seats strangers in, or with a matched seat, has no reroll', () => {
  const h = harness();
  const filled = h.room({ mode: 'coop', difficulty: 'NORMAL' });
  h.lobby.seatSolos(filled.r, [h.player('Stranger')]);
  assert.equal(h.lockAtStart(filled), 'matchmade');
  const merged = h.room({ mode: 'coop', difficulty: 'NORMAL' });
  merged.r.seatOf(merged.guest.playerId).matched = true;   // a merge or a cross-server move (mergeRooms / seatHeld)
  assert.equal(h.lockAtStart(merged), 'matchmade');
});

test('a match host gets the lock too (wireOptions)', () => {
  assert.equal(wireOptions({ roomCode: 'ABCD', rerollLock: 'public' }).rerollLock, 'public');
  assert.equal('rerollLock' in wireOptions({ roomCode: 'ABCD' }), false);
});

test('the match refuses a reroll when locked and says why in m.public; unlocked it opens the vote', (t) => {
  for (const lock of ['public', 'matchmade']) {
    const h = makeMatch({ humans: 2, rerollLock: lock }).start();
    t.after(() => h.m.dispose());
    const res = h.m.requestSetupReroll('p_0', 0);
    assert.equal(res.error, ERR.WRONG_PHASE);
    assert.equal(res.detail, `setup reroll off: ${lock}`);
    assert.equal(h.m.setupVote, null);
    assert.equal(h.lastBc('m.public').rerollOff, lock);
  }
  const free = makeMatch({ humans: 2 }).start();
  t.after(() => free.m.dispose());
  assert.equal('rerollOff' in free.lastBc('m.public'), false);
  ok(free.m.requestSetupReroll('p_0', 0));
  assert.ok(free.m.setupVote);
});
