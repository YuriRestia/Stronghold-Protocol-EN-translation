// (fork) Room chat (user, 2026-11-11; docs/design/network.md "Room chat"): the spam limits (server/chatLimit.js) and the
// lobby's room.chat / room.emote — who gets a line, what is refused without a frame, the escalating pauses, the
// per-network cap, the in-memory history a reconnect gets (and a newcomer does not), and the page's log state.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { getData } from '../server/data.js';
import { sendChat } from '../server/match/chatWallet.js';
import { chatBudgetReset, chatBudgetRooms, chatBudgetTake, chatLimitCheck, chatLimitGate, chatLimitState, chatNetworkCheck, chatNetworkSweep, chatWireBytes } from '../server/chatLimit.js';
import {
  CHAT_BURST_LINES, CHAT_BURST_MS, CHAT_LONG_LINES, CHAT_LONG_MS, CHAT_NETWORK_LINES,
  CHAT_PAUSE_FORGIVE_MS, EMOTES, ROOM_CHAT_GAP_MS, ROOM_CHAT_HISTORY_LINES,
} from '../shared/constants.js';
import { ROOM_LOG_KEEP, roomChatAppend, roomChatFor, roomChatLine, roomChatSystemLines } from '../public/js/roomChat.js';

const VANILLA = 'a0'.repeat(32);
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
class Rec { constructor(opts) { this.opts = opts; } start() {} dispose() {} onLeave() {} onDisconnect() {} }

function harness() {
  chatBudgetReset();
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
  // the second and third offences pause longer; the steps stop at 120 s (each after a quiet 5 min, so only the burst trips)
  const offend = () => { const from = st.pausedUntil + CHAT_LONG_MS; for (let i = 0; i < CHAT_BURST_LINES; i++) { now = from + i * 1600; chatLimitCheck(st, `r${now}`, now, { gapMs: 1500 }); } now += 1600; return chatLimitCheck(st, 'y', now, { gapMs: 1500 }); };
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

test('limits: 20 lines in 5 minutes, even kept just under the burst, start a pause', () => {
  const st = chatLimitState();
  let now = 0;
  let sent = 0;
  // 5 lines every 15 s never trips the burst; the 5-minute window still holds the sender to 20
  for (let i = 0; i < 40 && sent < CHAT_LONG_LINES; i++) {
    for (let k = 0; k < 5 && sent < CHAT_LONG_LINES; k++) { assert.equal(chatLimitCheck(st, `l${sent}`, now, { gapMs: 1500 }).ok, true); sent++; now += 1600; }
    now += 15_000;
  }
  const r = chatLimitCheck(st, 'one more', now, { gapMs: 1500 });
  assert.deepEqual([r.why, r.newPause], ['long', true]);
  assert.ok(now - 0 < CHAT_LONG_MS, 'all inside one window');
});

test('limits: the gate refuses before any filtering — a line that cleans to nothing still spends the gap', () => {
  const st = chatLimitState();
  assert.equal(chatLimitGate(st, 0, { gapMs: 1500 }), true);
  assert.equal(chatLimitGate(st, 500, { gapMs: 1500 }), false, 'a junk flood is turned away without a filter run');
  assert.equal(chatLimitGate(st, 1000, { gapMs: 1500 }), true, '1.5 s less the 0.5 s of jitter');
  st.pausedUntil = 5000;
  assert.equal(chatLimitGate(st, 4000, { gapMs: 1500 }), false);
});

test('budget: one bucket for every chat line, two seconds deep, refilled by the second', () => {
  chatBudgetReset(1000, { roomShare: 1, matchReserve: 0 });
  assert.equal(chatWireBytes(100, 3), 3 * 180, 'each recipient: the frame plus 80 B of TLS / TCP');
  assert.equal(chatBudgetTake(1500, 0), true);
  assert.equal(chatBudgetTake(600, 0), false, '2 s of budget is 2,000 B');
  assert.equal(chatBudgetTake(600, 100), true, '100 ms refilled 100 B');
  assert.equal(chatBudgetTake(2001, 10_000), false, 'never more than two seconds at once');
  chatBudgetReset();
});

test('budget: one room gets at most its fair share; other rooms still chat', () => {
  chatBudgetReset(1000, { roomShare: 0.25, matchReserve: 0 }); // a room: 250 B/s, 500 B at once
  assert.equal(chatBudgetTake(400, 0, { room: 'A' }), true);
  assert.equal(chatBudgetTake(400, 0, { room: 'A' }), false, 'room A spent its share');
  assert.equal(chatBudgetTake(400, 0, { room: 'B' }), true, 'room B is not silenced by A');
  assert.equal(chatBudgetTake(400, 1200, { room: 'A' }), true, '1.2 s refilled A by 300 B');
  // a line bigger than the share (a heavily watched match) still goes out once when the room's bucket is full
  assert.equal(chatBudgetTake(900, 20_000, { room: 'C' }), true);
  assert.equal(chatBudgetTake(10, 20_000, { room: 'C' }), false, 'then the room waits out the debt');
  assert.equal(chatBudgetTake(10, 21_700, { room: 'C' }), true);
  // idle rooms are forgotten (their bucket is full again anyway)
  chatBudgetTake(1, 40_000, { room: 'D' });
  assert.equal(chatBudgetRooms(), 1, 'only room D is still kept');
  chatBudgetReset();
});

test('budget: the match reserve is only for match chat, which uses it first', () => {
  chatBudgetReset(1000, { roomShare: 1, matchReserve: 0.25 }); // shared pool 1,500 B at once, reserve 500 B
  assert.equal(chatBudgetTake(1500, 0, { room: 'R' }), true, 'room chat empties the shared pool');
  assert.equal(chatBudgetTake(100, 0, { room: 'R2' }), false, 'room chat never touches the reserve');
  assert.equal(chatBudgetTake(400, 0, { room: 'match:M', match: true }), true, 'match chat still goes out');
  assert.equal(chatBudgetTake(200, 0, { room: 'match:M', match: true }), false, 'the reserve has 100 B left, the pool none');
  assert.equal(chatBudgetTake(200, 1000, { room: 'match:M', match: true }), true, 'reserve first, then the pool');
  chatBudgetReset();
});

test('room chat: over the server-wide budget a line is dropped and the sender told "busy", at most every 3 s', () => {
  const h = harness();
  const { host, guests: [a] } = h.room(2);
  chatBudgetReset(100, { roomShare: 1, matchReserve: 0 }); // a tiny budget: 200 B at once
  say(h, host, 'x'.repeat(100));
  assert.equal(h.got(a, 'room.chat').length, 0, 'over the budget: nobody gets it');
  assert.deepEqual(h.got(host, 'room.chatPause'), [{ t: 'room.chatPause', ms: 3000, busy: true }]);
  h.step(ROOM_CHAT_GAP_MS);
  say(h, host, 'y'.repeat(100));
  assert.equal(h.got(host, 'room.chatPause').length, 1, 'told once per 3 s');
  h.step(2000);
  say(h, host, 'ok');
  assert.equal(h.got(a, 'room.chat').at(-1)?.x, 'ok', 'a short line fits once the budget refilled');
  chatBudgetReset();
});

test('room chat: a flooding room is told "busy" and only silences itself; another room still chats', () => {
  const h = harness();
  const spam = h.room(4);
  const calm = h.room(2);
  // each room: 1,000 B/s, 2,000 B at once; a 100-letter line to 3 others is about 3 × 260 B
  chatBudgetReset(4000);
  for (const s of [spam.host, ...spam.guests]) say(h, s, 'x'.repeat(100));
  const heard = h.got(spam.guests[2], 'room.chat').length;
  assert.equal(heard, 2, 'the room ran out of its share after two lines');
  assert.ok(h.got(spam.guests[1], 'room.chatPause').some((p) => p.busy), 'the sender over the share is told "busy"');
  say(h, calm.host, 'anyone up for a run?');
  assert.equal(h.got(calm.guests[0], 'room.chat').at(-1)?.x, 'anyone up for a run?', 'the calm room is not blocked');
  chatBudgetReset();
});

test('match chat: room spam that empties the shared pool never blocks in-game chat', () => {
  chatBudgetReset(4000); // shared pool 6,000 B at once, match reserve 2,000 B
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) chatBudgetTake(1000, t0, { room: `R${i}` });
  assert.equal(chatBudgetTake(200, t0, { room: 'R-late' }), false, 'room chat is busy now');
  const sent = [];
  const toasts = [];
  const ps = { playerId: 'p_0', seat: 1, isBot: false, chatLeft: 50, chatRound: 1, chatPending: null, dirty() {} };
  const m = {
    roomCode: 'ABCD', sched: { now: () => 100_000 }, players: new Map([['p_0', ps], ['p_1', {}], ['p_2', {}], ['p_3', {}]]),
    broadcast: (msg) => sent.push(msg), toast: (_ps, _kind, text) => toasts.push(text),
  };
  assert.deepEqual(sendChat(m, ps, 'push left lane'), { ok: true });
  assert.deepEqual(sent.map((f) => f.x), ['push left lane'], 'the match reserve carries it');
  assert.deepEqual(toasts, []);
  chatBudgetReset();
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
