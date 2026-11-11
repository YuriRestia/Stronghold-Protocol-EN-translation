// (fork) Room chat (user, 2026-11-11; docs/design/network.md "Room chat"): the spam limits (server/chatLimit.js) and the
// lobby's room.chat / room.emote — who gets a line, what is refused without a frame, the escalating pauses, the
// per-network cap, the in-memory history a reconnect gets (and a newcomer does not), and the page's log state.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { getData } from '../server/data.js';
import { chatLimitCheck, chatLimitState, chatNetworkCheck, chatNetworkSweep } from '../server/chatLimit.js';
import {
  CHAT_BURST_LINES, CHAT_BURST_MS, CHAT_NETWORK_LINES, CHAT_PAUSE_FORGIVE_MS, EMOTES, ROOM_CHAT_GAP_MS,
  ROOM_CHAT_HISTORY_LINES,
} from '../shared/constants.js';
import { ROOM_LOG_KEEP, roomChatAppend, roomChatFor, roomChatLine, roomChatSystemLines } from '../public/js/roomChat.js';

const VANILLA = 'a0'.repeat(32);
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
class Rec { constructor(opts) { this.opts = opts; } start() {} dispose() {} onLeave() {} onDisconnect() {} }

function harness() {
  const clock = { t: 1_000_000 };
  const registry = new SessionRegistry();
  const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, content: { cs: VANILLA }, getData, now: () => clock.t, options: { largeRooms: true } });
  const frames = new Map();
  const player = (name, addr = `10.0.0.${frames.size + 1}`) => {
    const s = registry.create(name);
    s.connected = true;
    s.disconnectedAt = null;
    s.addr = addr;
    const box = [];
    frames.set(s.playerId, box);
    s.ws = { readyState: 1, bufferedAmount: 0, send(data) { box.push(JSON.parse(data)); }, terminate() {} };
    return s;
  };
  const got = (s, t) => frames.get(s.playerId).filter((m) => m.t === t);
  const clear = () => { for (const box of frames.values()) box.length = 0; };
  const room = (n = 3, opts = {}) => {
    const host = player('Host', opts.addr);
    assert.deepEqual(lobby.create(host, { mode: 'coop', ...(opts.capacity ? { capacity: opts.capacity } : {}) }), { ok: true });
    const code = lobby.roomOf(host).code;
    const guests = [];
    for (let i = 1; i < n; i++) {
      const g = player(`G${i}`, opts.addr);
      assert.deepEqual(lobby.join(g, { code }), { ok: true });
      guests.push(g);
    }
    clear();
    return { host, guests, code };
  };
  const step = (ms) => { clock.t += ms; };
  return { lobby, player, got, clear, room, step, clock };
}

const say = (h, s, x) => h.lobby.handleMessage(s, { t: 'room.chat', x });

test('limits: a gap, a burst that starts a pause, pauses that grow and are forgiven', () => {
  const st = chatLimitState();
  let now = 0;
  assert.equal(chatLimitCheck(st, 'a', now, { gapMs: 1500 }).ok, true);
  assert.equal(chatLimitCheck(st, 'b', now + 900, { gapMs: 1500 }).why, 'gap', 'inside the gap (with 500 ms of jitter allowed)');
  for (let i = 1; i < CHAT_BURST_LINES; i++) { now += 1600; assert.equal(chatLimitCheck(st, `l${i}`, now, { gapMs: 1500 }).ok, true); }
  now += 1600;
  const p1 = chatLimitCheck(st, 'one too many', now, { gapMs: 1500 });
  assert.deepEqual([p1.why, p1.newPause, p1.pausedUntil - now], ['burst', true, 30_000]);
  assert.equal(chatLimitCheck(st, 'x', now + 10_000, { gapMs: 1500 }).why, 'paused');
  // the second and third offences pause longer; the steps stop at 120 s
  const offend = () => { for (let i = 0; i < CHAT_BURST_LINES; i++) { now = st.pausedUntil + 1 + i * 1600; chatLimitCheck(st, `r${now}`, now, { gapMs: 1500 }); } now += 1600; return chatLimitCheck(st, 'y', now, { gapMs: 1500 }); };
  assert.equal(offend().pausedUntil - now, 60_000);
  assert.equal(offend().pausedUntil - now, 120_000);
  assert.equal(offend().pausedUntil - now, 120_000);
  // one step forgiven per quiet 10 minutes
  now = st.pausedUntil + 2 * CHAT_PAUSE_FORGIVE_MS;
  for (let i = 0; i < CHAT_BURST_LINES; i++) chatLimitCheck(st, `q${i}`, now + i * 1600, { gapMs: 1500 });
  now += CHAT_BURST_LINES * 1600;
  assert.equal(chatLimitCheck(st, 'z', now, { gapMs: 1500 }).pausedUntil - now, 60_000, 'two steps forgiven: back to the second step');
});

test('limits: a repeated line inside 10 s is dropped but counts toward the burst; the network cap is shared', () => {
  const st = chatLimitState();
  assert.equal(chatLimitCheck(st, 'gg', 0, { gapMs: 1500 }).ok, true);
  assert.equal(chatLimitCheck(st, 'G G', 2000, { gapMs: 1500 }).why, 'duplicate', 'case and spacing aside');
  assert.equal(st.times.length, 2);
  assert.equal(chatLimitCheck(st, 'gg', 13_000, { gapMs: 1500 }).ok, true, 'after 10 s it may go again');
  const table = new Map();
  for (let i = 0; i < CHAT_NETWORK_LINES; i++) assert.equal(chatNetworkCheck(table, 'net', i), true);
  assert.equal(chatNetworkCheck(table, 'net', 100), false);
  assert.equal(chatNetworkCheck(table, 'other', 100), true);
  assert.equal(chatNetworkCheck(table, 'net', CHAT_BURST_MS + 50), true, 'the window moves on');
  chatNetworkSweep(table, 10 * CHAT_BURST_MS);
  assert.equal(table.size, 0, 'idle networks are dropped');
});

test('room chat: a plain-text line to every other member, never back to the sender; refusals send nothing', () => {
  const h = harness();
  const { host, guests: [a, b] } = h.room(3);
  assert.deepEqual(say(h, host, '  <b>gl hf</b> \u{1F602} '), { ok: true });
  const line = h.got(a, 'room.chat')[0];
  assert.deepEqual(line, { t: 'room.chat', id: host.playerId, n: 'Host', x: 'gl hf' });
  assert.equal(h.got(b, 'room.chat').length, 1);
  assert.equal(h.got(host, 'room.chat').length, 0);
  h.clear();
  h.step(ROOM_CHAT_GAP_MS);
  say(h, host, 'x'.repeat(300));
  assert.equal(h.got(a, 'room.chat')[0].x.length, 100, 'one line is at most 100 letters');
  h.clear();
  say(h, host, 'too soon');
  say(h, a, '\u{1F602}\u{1F602}');
  assert.equal(h.got(b, 'room.chat').length, 0, 'inside the gap / nothing printable: dropped');
  assert.equal(h.got(host, 'error').length + h.got(a, 'error').length, 0, 'and nobody hears of it');
});

test('room chat: the 7th line in 15 s starts a 30 s pause, told once to the sender only', () => {
  const h = harness();
  const { host, guests: [a] } = h.room(2);
  for (let i = 0; i < CHAT_BURST_LINES; i++) { say(h, host, `line ${i}`); h.step(ROOM_CHAT_GAP_MS); }
  assert.equal(h.got(a, 'room.chat').length, CHAT_BURST_LINES);
  say(h, host, 'one too many');
  assert.deepEqual(h.got(host, 'room.chatPause'), [{ t: 'room.chatPause', ms: 30_000 }]);
  assert.equal(h.got(a, 'room.chatPause').length, 0);
  assert.equal(h.got(a, 'room.chat').length, CHAT_BURST_LINES);
  h.step(ROOM_CHAT_GAP_MS);
  say(h, host, 'still paused');
  assert.equal(h.got(host, 'room.chatPause').length, 1, 'no second frame during the pause');
  h.step(30_000);
  say(h, host, 'back');
  assert.equal(h.got(a, 'room.chat').at(-1).x, 'back');
});

test('room chat: the pause and the gap live on the session, so a reconnect does not reset them', () => {
  const h = harness();
  const { host, guests: [a] } = h.room(2);
  for (let i = 0; i <= CHAT_BURST_LINES; i++) { say(h, host, `l${i}`); h.step(ROOM_CHAT_GAP_MS); }
  host.connected = false; h.lobby.onDisconnect?.(host);
  host.connected = true; h.lobby.onHello(host, { resumed: true, repeat: false });
  h.clear();
  say(h, host, 'after the reconnect');
  assert.equal(h.got(a, 'room.chat').length, 0);
});

test('room chat: every session of one network together sends at most 20 lines in 15 s', () => {
  const h = harness();
  const { host, guests } = h.room(4, { addr: '192.0.2.7' });
  const all = [host, ...guests];
  for (let r = 0; r < CHAT_BURST_LINES; r++) {
    for (const s of all) say(h, s, `${s.name} ${r}`);
    h.step(ROOM_CHAT_GAP_MS);
  }
  // 24 tries from four sessions of one network, each within its own limits: the first 20 go out
  assert.equal(h.lobby.roomOf(host).chatLog.length, CHAT_NETWORK_LINES);
  assert.equal(h.got(host, 'room.chat').length, 15, 'the host heard the five rounds of the other three');
});

test('room chat: spectators read but do not write; nothing during a match; emotes at most one a second', () => {
  const h = harness();
  const { host, guests: [a], code } = h.room(2);
  const watcher = h.player('Watcher');
  assert.deepEqual(h.lobby.spectate(watcher, { code }), { ok: true });
  h.clear();
  say(h, watcher, 'hello from the stands');
  assert.equal(h.got(host, 'room.chat').length, 0);
  say(h, host, 'hi');
  assert.equal(h.got(watcher, 'room.chat').length, 1, 'spectators get the lines');
  h.lobby.roomOf(host).match = {};
  h.step(ROOM_CHAT_GAP_MS);
  say(h, host, 'in the match');
  assert.equal(h.got(a, 'room.chat').length, 1, 'match chat has its own channel');
  h.lobby.roomOf(host).match = null;
  h.clear();
  h.lobby.handleMessage(host, { t: 'room.emote', id: EMOTES[0] });
  h.lobby.handleMessage(host, { t: 'room.emote', id: EMOTES[1] });
  assert.deepEqual(h.got(a, 'room.emote'), [{ t: 'room.emote', id: host.playerId, e: EMOTES[0] }]);
  h.step(1000);
  h.lobby.handleMessage(host, { t: 'room.emote', id: EMOTES[1] });
  assert.equal(h.got(a, 'room.emote').length, 2);
});

test('room chat: a reconnect gets the lines it got before; a newcomer gets nothing older than itself', () => {
  const h = harness();
  const { host, guests: [a], code } = h.room(2);
  say(h, host, 'before the newcomer'); h.step(ROOM_CHAT_GAP_MS);
  const late = h.player('Late');
  assert.deepEqual(h.lobby.join(late, { code }), { ok: true });
  say(h, a, 'after'); h.step(ROOM_CHAT_GAP_MS);
  h.clear();
  a.connected = true; h.lobby.onHello(a, { resumed: true, repeat: false });
  const log = h.got(a, 'room.chatLog')[0];
  assert.deepEqual(log.lines.map((l) => l.x), ['before the newcomer', 'after'], 'its own line too');
  assert.ok(log.lines.every((l) => Number.isFinite(l.ago) && l.ago >= 0));
  late.connected = true; h.lobby.onHello(late, { resumed: true, repeat: false });
  assert.deepEqual(h.got(late, 'room.chatLog')[0].lines.map((l) => l.x), ['after']);
  // the history is bounded: the last 50 lines
  for (let i = 0; i < ROOM_CHAT_HISTORY_LINES + 10; i++) { say(h, i % 2 ? host : a, `n${i}`); h.step(16_000); }
  assert.equal(h.lobby.roomOf(host).chatLog.length, ROOM_CHAT_HISTORY_LINES);
  assert.ok(h.lobby.roomOf(host).chatBytes <= 16 * 1024);
});

test('page: the log keeps 200 lines, mutes stop a line, join and leave lines come from room.state', () => {
  let rc = roomChatFor('ABCD');
  for (let i = 0; i < ROOM_LOG_KEEP + 5; i++) rc = roomChatAppend(rc, [{ id: 'p', n: 'P', x: `${i}`, at: i }]);
  assert.equal(rc.lines.length, ROOM_LOG_KEEP);
  assert.equal(rc.lines[0].x, '5');
  assert.equal(roomChatLine({ id: 'p', n: 'P', x: 'hi' }, ['p'], 0), null, 'a muted sender');
  assert.deepEqual(roomChatLine({ id: 'p', n: 'P', x: 'hi' }, [], 7), { id: 'p', n: 'P', x: 'hi', at: 7 });
  const seat = (playerId, name, isBot = false) => ({ playerId, name, isBot });
  const prev = { code: 'ABCD', seats: [seat('a', 'A'), seat('b', 'B'), null] };
  const next = { code: 'ABCD', seats: [seat('a', 'A'), null, seat('c', 'C'), seat('bot', 'AI', true)] };
  assert.deepEqual(roomChatSystemLines(prev, next, 1).map((l) => `${l.sys}:${l.n}`), ['join:C', 'leave:B']);
  assert.deepEqual(roomChatSystemLines(prev, { ...next, code: 'WXYZ' }, 1), [], 'another room: a new log, not news');
});
