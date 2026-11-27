// test/vanilla-matchmaking.test.js — (fork) what a room promises strangers (Room.searchKind, issue #222): a search or a public
// Grand Alliance is 'vanilla' (the lobby rules are cleared and locked while strangers may be in it) or 'modded' (the rules stay
// editable, and only players who allow mods meet it). The solo queue's `mods` flag, the pools, and the Grand Alliance that
// opens private.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { getData } from '../server/data.js';
import { poolKey, planMerges } from '../server/matchmaker.js';
import { ERR, DEFAULT_RULES } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const VANILLA = 'a0'.repeat(32);
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
class Rec { constructor(o) { this.opts = o; } start() {} dispose() {} onLeave() {} onDisconnect() {} }

function harness() {
  const registry = new SessionRegistry();
  const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, content: { cs: VANILLA }, getData,
    options: { matchTickMs: 600_000, largeRooms: true, roomListGapMs: 0 } });
  const player = (name) => {
    const s = registry.create(name);
    s.connected = true;
    s.disconnectedAt = null;
    s.ws = { readyState: 1, bufferedAmount: 0, send() {}, terminate() {} };
    return s;
  };
  return { lobby, player, close: () => lobby.shutdown() };
}
const ok = (r) => assert.deepEqual(r, { ok: true });
const refused = (r, code) => assert.equal(r?.error, code, JSON.stringify(r));
const roomOf = (h, s) => h.lobby.rooms.get(s.roomCode);
const RULES = { extraFunds: true };

/** A co-op room of `count` humans (the others ready), with `rules` set by the host. */
function room(h, count, rules = null, name = 'P') {
  const ps = Array.from({ length: count }, (_, i) => h.player(`${name}${i}`));
  ok(h.lobby.create(ps[0], { mode: 'coop', difficulty: 'NORMAL' }));
  const r = roomOf(h, ps[0]);
  if (rules) ok(h.lobby.setRules(ps[0], { rules }));
  for (const p of ps.slice(1)) { ok(h.lobby.join(p, { code: r.code })); ok(h.lobby.ready(p, { ready: true })); }
  return { r, ps };
}

describe('vanilla or modded: the choice when a room opens to strangers', () => {
  test('the protocol takes a kind on room.search, room.setLock and mods on queue.join, nothing else', () => {
    assert.equal(validateC2S({ t: 'room.search', on: true }), null);
    assert.equal(validateC2S({ t: 'room.search', on: true, kind: 'modded' }), null);
    assert.notEqual(validateC2S({ t: 'room.search', on: true, kind: 'both' }), null);
    assert.equal(validateC2S({ t: 'room.setLock', on: false, kind: 'vanilla' }), null);
    assert.equal(validateC2S({ t: 'queue.join', difficulty: 'NORMAL', mods: true }), null);
    assert.notEqual(validateC2S({ t: 'queue.join', difficulty: 'NORMAL', mods: 1 }), null);
  });

  test('a search without a kind is vanilla: the rules are cleared, locked, and the others must ready up again', () => {
    const h = harness();
    try {
      const { r, ps } = room(h, 2, RULES);
      ok(h.lobby.search(ps[0], { on: true }));
      assert.equal(r.searchKind, 'vanilla');
      assert.deepEqual(r.rules, DEFAULT_RULES);
      assert.equal(r.vanillaLocked, true);
      assert.equal(r.seatOf(ps[1].playerId).ready, false);
      refused(h.lobby.setRules(ps[0], { rules: RULES }), ERR.CUSTOM_RULES);
      ok(h.lobby.search(ps[0], { on: false }));
      refused(h.lobby.setRules(ps[0], { rules: RULES }), ERR.CUSTOM_RULES);   // a second human is still seated
    } finally { h.close(); }
  });

  test('the lock lifts once the search stops and the host is alone again, and a stranger matched in keeps it', () => {
    const h = harness();
    try {
      const { r, ps } = room(h, 1, RULES);
      ok(h.lobby.search(ps[0], { on: true, kind: 'vanilla' }));
      refused(h.lobby.setRules(ps[0], { rules: RULES }), ERR.CUSTOM_RULES);
      ok(h.lobby.search(ps[0], { on: false }));
      ok(h.lobby.setRules(ps[0], { rules: RULES }));
      assert.equal(r.rules.extraFunds, true);
      // a matched seat locks it for good: it holds after the search stops, as after a match
      ok(h.lobby.search(ps[0], { on: true, kind: 'vanilla' }));
      const guest = h.player('G');
      ok(h.lobby.join(guest, { code: r.code }));
      r.seatOf(guest.playerId).matched = true;
      ok(h.lobby.search(ps[0], { on: false }));
      assert.equal(r.vanillaLocked, true);
      refused(h.lobby.setRules(ps[0], { rules: { extraFunds: false } }), ERR.CUSTOM_RULES);
    } finally { h.close(); }
  });

  test('a locked vanilla room takes no gameplay plugins; a modded one is not locked', () => {
    const h = harness();
    try {
      const { r, ps } = room(h, 1);
      ok(h.lobby.search(ps[0], { on: true, kind: 'vanilla' }));
      assert.equal(r.vanillaLocked, true);
      // a set with gameplay plugins (content.vanilla false), as resolveContent builds it from plugin files
      h.lobby.resolveContent = () => ({ content: Object.freeze({ cs: VANILLA, vanilla: false, plugins: Object.freeze([]) }) });
      refused(h.lobby.setPlugins(ps[0], { plugins: [{ id: 'gameplay' }] }), ERR.PLUGIN_BLOCKED);
      assert.equal(r.modded, false, 'the room stays as it was');
      ok(h.lobby.search(ps[0], { on: false }));
      ok(h.lobby.search(ps[0], { on: true, kind: 'modded' }));
      assert.equal(r.vanillaLocked, false);
      ok(h.lobby.setRules(ps[0], { rules: RULES }));
      assert.equal(r.rules.extraFunds, true, 'a modded room keeps editing its rules while it searches');
      assert.equal(r.searching, true);
    } finally { h.close(); }
  });

  test('pools: a modded room meets only modded rooms with the same rules; a vanilla key is what it was', () => {
    const h = harness();
    try {
      const a = room(h, 1, RULES, 'A'); const b = room(h, 1, RULES, 'B'); const c = room(h, 1, { extraDeploy: true }, 'C'); const d = room(h, 1, null, 'D');
      for (const x of [a, b, c]) ok(h.lobby.search(x.ps[0], { on: true, kind: 'modded' }));
      ok(h.lobby.search(d.ps[0], { on: true, kind: 'vanilla' }));
      assert.equal(poolKey(a.r), poolKey(b.r));
      assert.notEqual(poolKey(a.r), poolKey(c.r), 'other rules, other pool');
      assert.notEqual(poolKey(a.r), poolKey(d.r), 'modded and vanilla never share a pool');
      assert.ok(!poolKey(d.r).includes('mod'));
      assert.equal(h.lobby.mergeRooms(a.r, [d.r]), false);
      const plans = planMerges([a.r, b.r, c.r, d.r], h.lobby.now(), { partialMergeAfterMs: 1 });
      assert.ok(plans.every((p) => [p.target, ...p.sources].every((x) => poolKey(x) === poolKey(p.target))));
    } finally { h.close(); }
  });

  test('the solo queue: a vanilla-only Doctor never lands in a modded room, a Doctor who allows mods does', () => {
    const h = harness();
    try {
      const { r, ps } = room(h, 3, RULES, 'M');
      ok(h.lobby.search(ps[0], { on: true, kind: 'modded' }));
      const strict = h.player('Strict');
      ok(h.lobby.queueJoin(strict, { difficulty: 'NORMAL' }));
      h.lobby.placeSolos();
      assert.equal(strict.roomCode, null, 'a vanilla-only Doctor stays queued');
      assert.equal(h.lobby.soloQueue.get(strict.playerId).mods, false);
      h.lobby.queueLeave(strict);
      const open = h.player('Open');
      ok(h.lobby.queueJoin(open, { difficulty: 'NORMAL', mods: true }));
      h.lobby.placeSolos();
      assert.equal(open.roomCode, r.code, 'a Doctor who allows mods fills it');
    } finally { h.close(); }
  });

  test('a room the solo queue forms is vanilla and locked; another server only sees vanilla rooms', () => {
    const h = harness();
    try {
      const qs = ['Q0', 'Q1', 'Q2', 'Q3'].map((n) => h.player(n));
      for (const q of qs) ok(h.lobby.queueJoin(q, { difficulty: 'NORMAL' }));
      h.lobby.placeSolos();
      const formed = roomOf(h, qs[0]);
      assert.ok(formed, 'the four formed a room');
      assert.equal(formed.searchKind, 'vanilla');
      assert.equal(formed.vanillaLocked, true);
      const { r, ps } = room(h, 1, RULES, 'X');
      ok(h.lobby.search(ps[0], { on: true, kind: 'modded' }));
      const { r: v, ps: vs } = room(h, 1, null, 'V');
      ok(h.lobby.search(vs[0], { on: true, kind: 'vanilla' }));
      const codes = h.lobby.crossDigest().rooms.map((x) => x.code);
      assert.ok(!codes.includes(r.code), 'a modded room stays on this server');
      assert.ok(codes.includes(v.code));
    } finally { h.close(); }
  });
});

describe('a Grand Alliance opens private', () => {
  test('no password asked: it gets 4 random letters, is not public, and joining by code needs them', () => {
    const h = harness();
    try {
      const host = h.player('H');
      ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
      const r = roomOf(h, host);
      assert.equal(r.locked, true);
      assert.match(r.password, /^[A-Z]{4}$/);
      assert.equal(r.wentPublic, false);
      assert.equal(r.vanillaLocked, false, 'private: the host may still set rules');
      refused(h.lobby.join(h.player('J'), { code: r.code }), ERR.ROOM_LOCKED);
      ok(h.lobby.setRules(host, { rules: RULES }));
    } finally { h.close(); }
  });

  test('making it public asks vanilla or modded: vanilla clears and locks the rules, modded lists it as modded', () => {
    const h = harness();
    try {
      const host = h.player('H');
      ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
      const r = roomOf(h, host);
      ok(h.lobby.setRules(host, { rules: RULES }));
      ok(h.lobby.setLock(host, { on: false }));
      assert.equal(r.searchKind, 'vanilla');
      assert.deepEqual(r.rules, DEFAULT_RULES);
      assert.equal(r.vanillaLocked, true);
      refused(h.lobby.setRules(host, { rules: RULES }), ERR.CUSTOM_RULES);
      assert.ok(!h.lobby.ownRoomList()[0].modded);
      ok(h.lobby.setLock(host, { on: true }));
      assert.equal(r.vanillaLocked, false, 'private again and alone: editing is allowed again');
      ok(h.lobby.setLock(host, { on: false, kind: 'modded' }));
      assert.equal(r.vanillaLocked, false);
      ok(h.lobby.setRules(host, { rules: RULES }));
      assert.equal(h.lobby.ownRoomList()[0].modded, true);
    } finally { h.close(); }
  });
});
