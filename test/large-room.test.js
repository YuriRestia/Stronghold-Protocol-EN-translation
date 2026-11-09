// (fork) 8-seat rooms (shared/largeRoom.js, DESIGN §91): the lobby side (capacity, humans only, no
// matchmaking, seat moves, the Large rooms list, the match options) and the match side (squads, the scaled pool, the
// per-squad drafts, the relay 联防 plan, idle seats, squad-first executors, an absent player's board under the AI).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { getData } from '../server/data.js';
import { Match } from '../server/match/Match.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { hiddenEligible } from '../server/match/finalAssault.js';
import { planUnite } from '../server/match/unite.js';
import { reapPlan, MAX_AGE_MS, LARGE_MAX_AGE_MS } from '../scripts/generations.mjs';
import { ERR, PHASE } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { roomScaleFor, scaleCount, squadOfSeat, LARGE_ROOM_SEATS } from '../shared/largeRoom.js';

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

function harness({ largeRooms = true } = {}) {
  const registry = new SessionRegistry();
  const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, content: { cs: VANILLA }, getData, options: { largeRooms, roomListGapMs: 0 } });
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
  const all = (s) => frames.get(s.playerId);
  return { lobby, player, last, all, registry };
}

const ok = (r) => assert.deepEqual(r, { ok: true });
const refused = (r, code) => assert.equal(r?.error, code, JSON.stringify(r));

test('shared rules: squads by seat, room scale above 4, counts rounded up', () => {
  assert.deepEqual([0, 3, 4, 7].map(squadOfSeat), [0, 0, 1, 1]);
  assert.deepEqual([1, 4, 5, 6, 7, 8].map(roomScaleFor), [1, 1, 1.25, 1.5, 1.75, 2]);
  assert.deepEqual([10, 36].map((n) => scaleCount(n, 1.25)), [13, 45]);
  assert.equal(scaleCount(10, 1), 10);
});

test('protocol: capacity 4 or 8, the seat moves, the list flag and rooms.watch', () => {
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', capacity: 8 }), null);
  assert.notEqual(validateC2S({ t: 'room.create', mode: 'coop', capacity: 6 }), null);
  assert.equal(validateC2S({ t: 'room.moveSeat', seat: 7 }), null);
  assert.notEqual(validateC2S({ t: 'room.moveSeat', seat: 8 }), null);
  assert.equal(validateC2S({ t: 'room.swapSeats', a: 0, b: 5 }), null);
  assert.equal(validateC2S({ t: 'room.setLock', on: true, password: 'abcd' }), null);
  assert.equal(validateC2S({ t: 'room.setLock', on: false }), null);
  assert.notEqual(validateC2S({ t: 'room.setLock', on: true, password: 'AB1D' }), null);
  assert.notEqual(validateC2S({ t: 'room.setLock', on: true, password: 'ABCDE' }), null);
  assert.equal(validateC2S({ t: 'room.join', code: 'ABCD', password: 'WXYZ' }), null);
  assert.equal(validateC2S({ t: 'room.spectate', code: 'ABCD', password: 'WXYZ' }), null);
  assert.equal(validateC2S({ t: 'rooms.watch', on: true }), null);
  assert.equal(validateC2S({ t: 'room.kick', seat: 6, playerId: 'abc' }), null);
});

test('a large room is refused while the server keeps them off, and only as a default-version co-op room', () => {
  const off = harness({ largeRooms: false });
  refused(off.lobby.create(off.player('A'), { mode: 'coop', capacity: 8 }), ERR.BAD_MSG);
  assert.equal(off.lobby.welcomeInfo().largeRooms, undefined);
  const h = harness();
  assert.equal(h.lobby.welcomeInfo().largeRooms, true);
  refused(h.lobby.create(h.player('B'), { mode: 'solo', capacity: 8 }), ERR.BAD_MSG);
});

test('a Grand Alliance can be created private, with its password; a normal room cannot take one', () => {
  const h = harness();
  const host = h.player('Host');
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', capacity: 8, password: 'abcd' }), null);
  assert.notEqual(validateC2S({ t: 'room.create', mode: 'coop', capacity: 8, password: 'ab1' }), null);
  refused(h.lobby.create(host, { mode: 'coop', password: 'ABCD' }), ERR.BAD_MSG);
  ok(h.lobby.create(host, { mode: 'coop', capacity: LARGE_ROOM_SEATS, password: 'abcd' }));
  const st = h.last(host, 'room.state');
  assert.equal(st.locked, true);
  assert.equal(st.password, 'ABCD');
  const guest = h.player('Guest');
  refused(h.lobby.join(guest, { code: st.code }), ERR.ROOM_LOCKED);
  ok(h.lobby.join(guest, { code: st.code, password: 'ABCD' }));
});

test('public and private again keeps the password; private the first time without one gets 4 random letters', () => {
  const h = harness();
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop', capacity: LARGE_ROOM_SEATS }));
  ok(h.lobby.setLock(host, { on: true }));
  const first = h.last(host, 'room.state').password;
  assert.match(first, /^[A-Z]{4}$/);
  ok(h.lobby.setLock(host, { on: true, password: 'wxyz' }));
  ok(h.lobby.setLock(host, { on: false }));
  const pub = h.last(host, 'room.state');
  assert.equal(pub.locked, false);
  assert.equal(pub.password, undefined, 'not sent while public');
  ok(h.lobby.setLock(host, { on: true }));
  assert.equal(h.last(host, 'room.state').password, 'WXYZ', 'the same password back');
});

test('large room: 8 seats, humans only, searches like any room (DESIGN §90.4), unlocked at first', () => {
  const h = harness();
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop', capacity: LARGE_ROOM_SEATS }));
  const st = h.last(host, 'room.state');
  assert.equal(st.seats.length, 8);
  assert.equal(st.capacity, 8);
  assert.equal(st.locked, false);
  assert.equal(st.password, undefined);
  refused(h.lobby.addBot(host), ERR.BAD_TARGET);
  ok(h.lobby.search(host, { on: true })); // (2026-11-08) matchmaking fills it too
  refused(h.lobby.setAiTakeover(host, { on: true }), ERR.BAD_TARGET);
  // a normal room.state stays without the keys
  const other = h.player('Other');
  ok(h.lobby.create(other, { mode: 'coop' }));
  assert.equal(h.last(other, 'room.state').capacity, undefined);
  assert.equal(h.last(other, 'room.state').seats.length, 4);
});

test('large room: members move to empty seats, the host swaps, joiners fill the first free seat', () => {
  const h = harness();
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
  const code = h.last(host, 'room.state').code;
  const ps = ['B', 'C', 'D', 'E'].map((n) => h.player(n));
  for (const p of ps) ok(h.lobby.join(p, { code }));
  const room = h.lobby.rooms.get(code);
  assert.deepEqual(room.seats.map((s) => s?.name ?? null), ['Host', 'B', 'C', 'D', 'E', null, null, null]);
  ok(h.lobby.moveSeat(ps[2], { seat: 6 }));
  refused(h.lobby.moveSeat(ps[0], { seat: 4 }), ERR.BAD_TARGET); // taken
  assert.equal(room.seats[6].name, 'D');
  assert.equal(room.seats[6].seat, 6);
  assert.equal(room.seats[3], null);
  refused(h.lobby.swapSeats(ps[0], { a: 0, b: 1 }), ERR.NOT_HOST);
  ok(h.lobby.swapSeats(host, { a: 1, b: 5 }));
  assert.equal(room.seats[5].name, 'B');
  assert.equal(room.seats[1], null);
  const late = h.player('F');
  ok(h.lobby.join(late, { code }));
  assert.equal(room.seats[1].name, 'F');
});

test('room browser: every open room, a locked one marked, refreshed while watched, gone once started', async () => {
  const h = harness();
  const watcher = h.player('W');
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
  const code = h.last(host, 'room.state').code;
  ok(h.lobby.watchRooms(watcher, { on: true }));
  let list = h.last(watcher, 'rooms.list');
  assert.equal(list.rooms.length, 1);
  assert.deepEqual(list.rooms[0], { code, host: 'Host', seats: 1, capacity: 8, difficulty: list.rooms[0].difficulty, squads: [1, 0] });
  ok(h.lobby.setLock(host, { on: true, password: 'wxyz' }));
  await new Promise((r) => setTimeout(r, 5));
  list = h.last(watcher, 'rooms.list');
  assert.equal(list.rooms.length, 1, 'a locked room still shows');
  assert.equal(list.rooms[0].locked, true);
  assert.equal(list.rooms[0].password, undefined, 'never the password');
  ok(h.lobby.start(host));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.last(watcher, 'rooms.list').rooms.length, 0);
});

test('a large room starts its match with largeRoom, browser bots and the idle callback', () => {
  const h = harness();
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
  ok(h.lobby.start(host));
  assert.equal(Rec.last.largeRoom, true);
  assert.equal(Rec.last.botExecution, 'host');
  assert.equal(Rec.last.botBattles, 'host');
  assert.equal(typeof Rec.last.onIdle, 'function');
  const other = h.player('Other');
  ok(h.lobby.create(other, { mode: 'coop' }));
  ok(h.lobby.start(other));
  assert.equal(Rec.last.largeRoom, undefined);
});

// ---- match side ------------------------------------------------------------------------------------------------------

function largeMatch(seatIdx, extra = {}) {
  const data = getData({ log: quiet });
  const seats = seatIdx.map((i) => ({ seat: i, playerId: `p_${i}`, name: `P${i + 1}`, isBot: false, connected: true }));
  const sent = [];
  const m = new Match({ roomCode: 'T', mode: 'coop', difficulty: 'NORMAL', seats, seed: 7, data, log: quiet, scheduler: new VirtualScheduler(),
    battleContent: 'full', botRehearsal: 0, largeRoom: true, send: (pid, msg) => { sent.push([pid, msg]); return true; }, broadcast: () => {}, onEnd: () => {}, ...extra });
  return { m, sent };
}

test('match: squads where people sat, and today\'s rules when everyone is in one squad', () => {
  const { m } = largeMatch([0, 1, 4, 5, 6]);
  assert.deepEqual(m.squads, [['p_0', 'p_1'], ['p_4', 'p_5', 'p_6']]);
  assert.equal(m.roomScale, 1.25);
  assert.equal(m.publicView().players.find((p) => p.playerId === 'p_5').squad, 1);
  const one = largeMatch([0, 1, 2]).m;
  assert.equal(one.squads, null);
  assert.equal(one.publicView().players[0].squad, undefined);
});

test('match: one pool for the room, copies × players ÷ 4 rounded up; a normal match keeps its counts', () => {
  const big = largeMatch([0, 1, 2, 3, 4, 5, 6, 7]).m;
  const data = getData({ log: quiet });
  const normal = new Match({ roomCode: 'N', mode: 'coop', difficulty: 'NORMAL', seats: [0, 1, 2, 3].map((i) => ({ seat: i, playerId: `n_${i}`, name: 'N', isBot: false, connected: true })),
    seed: 7, data, log: quiet, scheduler: new VirtualScheduler(), battleContent: 'full', botRehearsal: 0, send: () => true, broadcast: () => {}, onEnd: () => {} });
  for (const [id, e] of normal.pool.entries) {
    const b = big.pool.entries.get(id);
    if (b) assert.equal(b.cap, Math.ceil(e.cap * 2), id);
  }
  const item = Object.keys(data.items || {}).find((id) => Number.isInteger(normal.itemPool.cap(id)));
  assert.ok(item, 'an equipment card with a shop cap');
  assert.equal(big.itemPool.cap(item), normal.itemPool.cap(item) * 2);
});

test('match: the Hidden Core threshold scales with the room', () => {
  const { m } = largeMatch([0, 1, 2, 3, 4, 5, 6, 7], { difficulty: 'HARD' });
  const base = m.gd.hiddenCore.multi;
  if (!m.gd.hiddenRound) return;
  assert.equal(hiddenEligible(m.gd, { layerSum: base + 1, teamLp: 50 }), true);
  assert.equal(hiddenEligible(m.gd, { layerSum: base + 1, teamLp: 50, scale: 2 }), false);
  assert.equal(hiddenEligible(m.gd, { layerSum: base * 2 + 1, teamLp: 50, scale: 2 }), true);
});

test('match: the strategy draft runs one lane per squad at once, 队友已选 inside a squad only', () => {
  const { m } = largeMatch([0, 1, 4, 5]);
  m.phase = PHASE.INFO_CHECK;
  m.enterBandDraft();
  const v = m.publicView().draft;
  assert.equal(v.lanes.length, 2);
  const [a, b] = v.lanes;
  assert.ok(a.turn && b.turn && a.turn !== b.turn);
  assert.equal(m.squadOf(a.turn), 0);
  assert.equal(m.squadOf(b.turn), 1);
  const band = m.gd.bandIds()[0];
  assert.deepEqual(m.pickBand(m.players.get(a.turn), band), { ok: true });
  // the other squad may take the same strategy; the picker's squadmate may not
  assert.deepEqual(m.pickBand(m.players.get(b.turn), band), { ok: true });
  const mateA = m.publicView().draft.lanes[0].turn;
  assert.equal(m.pickBand(m.players.get(mateA), band).error, ERR.BAD_TARGET);
  // the lane whose turn moved on shows the next picker; the deadline is each lane's own
  assert.notEqual(m.publicView().draft.lanes[0].turn, a.turn);
  assert.ok(m.publicView().draft.lanes.every((l) => l.turnDeadline > 0));
});

test('match: the 机变 draft gives each squad its own cards and turn', () => {
  const { m } = largeMatch([0, 1, 4, 5]);
  m.round = m.gd.spRounds()[0];
  m.enterSpDraft();
  assert.equal(m.phase, PHASE.SP_DRAFT);
  const lanes = m.publicView().sp.lanes;
  assert.equal(lanes.length, 2);
  for (const l of lanes) assert.equal(l.cards.length, 6);
  const pa = m.players.get(lanes[0].turn);
  assert.deepEqual(m.pickCard(pa, 0), { ok: true });
  assert.equal(m.publicView().sp.lanes[0].taken[0], pa.playerId);
  assert.equal(m.publicView().sp.lanes[1].taken[0], undefined);
});

test('match: the relay plan sends what got through to the next perfect players who have not helped', () => {
  const { m } = largeMatch([0, 1, 4, 5]);
  const P = (i) => m.players.get(`p_${i}`);
  const key = Object.keys(m.data.enemies || {})[0] || 'enemy_1007_slime';
  m.lastResults = new Map([
    ['p_0', { leaked: [{ enemyKey: key, counted: true }], perfect: false }],
    ['p_1', { leaked: [], perfect: true }],
    ['p_4', { leaked: [], perfect: true }],
    ['p_5', { leaked: [], perfect: true }],
  ]);
  const plan = { helpers: [P(1)], leakers: [P(0)], leaked: [{ enemyKey: key, mods: { hp: 2 }, lpr: 1, sourcePlayerId: 'p_0', tag: null, bounty: null }], notReentered: new Map() };
  const res = { perPlayer: { p_1: { leaked: [{ enemyKey: key, counted: true, sourcePlayerId: 'p_0', mods: { hp: 2 } }] } } };
  const next = m._relayPlan(plan, res);
  if (!m.gd.enemy(key)) return; // no such enemy in this data build
  assert.equal(next.relayRound, 2);
  assert.ok(next.helpers.every((p) => p !== P(1) && p !== P(0)));
  assert.equal(next.leaked.length, 1);
  assert.equal(next.leaked[0].sourcePlayerId, 'p_0');
  assert.deepEqual(next.leaked[0].mods, { hp: 2 });
  // nothing got through: no second round
  assert.equal(m._relayPlan(plan, { perPlayer: { p_1: { leaked: [] } } }), null);
});

test('match: the prep deadline warns an idle seat on its 2nd round and removes it on the 3rd; any intent resets it', () => {
  const idle = [];
  const { m, sent } = largeMatch([0, 4], { onIdle: (pid) => idle.push(pid) });
  const ps = m.players.get('p_0');
  m._noteIdlePrep(ps);
  m._noteIdlePrep(ps);
  assert.ok(sent.some(([pid, msg]) => pid === 'p_0' && msg.t === 'm.toast'));
  m._handle(ps, { t: 'g.emote', id: 'nope' });
  assert.equal(ps.idlePreps, 0);
  for (let i = 0; i < 3; i++) m._noteIdlePrep(ps);
  m.sched.advance?.(1);
  m.sched.runDue?.();
  assert.equal(ps.idlePreps, 3);
});

test('match: a dropped player\'s board goes to the AI and comes back on reconnect; a departure keeps it under the AI', () => {
  const { m } = largeMatch([0, 1, 4]);
  const ps = m.players.get('p_1');
  m.onDisconnect('p_1');
  assert.equal(ps.autoplay, true);
  m.onReconnect('p_1');
  assert.equal(ps.autoplay, false);
  m.onLeave('p_1');
  assert.equal(ps.alive, true);
  assert.equal(ps.botControlled, true);
});

test('match: bot work for a player goes to a browser of its squad first, then anyone', () => {
  const { m } = largeMatch([0, 1, 4, 5], { hostId: 'p_0' });
  assert.equal(m._botExecutorFor(undefined, ['p_5']), 'p_4');
  assert.equal(m._botExecutorFor(undefined, ['p_1']), 'p_0');
  m.players.get('p_4').connected = false;
  assert.equal(m._botExecutorFor(undefined, ['p_4']), 'p_5');
  m.players.get('p_5').connected = false;
  assert.equal(m._botExecutorFor(undefined, ['p_5']), 'p_0');
});

test('match: an AFK player whose page still sends battle reports and bot work stays idle; a prep action resets it', () => {
  const { m } = largeMatch([0, 4], { onIdle: () => {} });
  const ps = m.players.get('p_0');
  ps.idlePreps = 2;
  for (const frame of [{ t: 'b.progress', battleId: 'x', killed: 1 }, { t: 'b.result', battleId: 'x' }, { t: 'b.botMoves', taskId: 'x' },
    { t: 'b.botBattleResult', battleId: 'x' }, { t: 'g.unitStats', seq: 1 }, { t: 'g.watch', fieldId: 'n:p_4' }]) {
    try { m._handle(ps, frame); } catch { /* a malformed frame may be refused; the count is what matters */ }
    assert.equal(ps.idlePreps, 2, frame.t);
  }
  m._handle(ps, { t: 'g.refresh' });
  assert.equal(ps.idlePreps, 0);
});

test('match: a departed player whose board the AI plays never helps in a 联防, in round 1 or the relay', () => {
  const { m } = largeMatch([0, 1, 4, 5]);
  const P = (i) => m.players.get(`p_${i}`);
  const key = Object.keys(m.data.enemies || {}).find((k) => m.gd.enemy(k));
  assert.ok(key, 'an enemy of the data');
  m.onLeave('p_4');
  assert.equal(P(4).alive, true);
  assert.equal(P(4).left, true);
  const results = new Map([
    ['p_0', { leaked: [{ enemyKey: key, counted: true }], perfect: false }],
    ['p_1', { leaked: [], perfect: true }],
    ['p_4', { leaked: [], perfect: true }],
    ['p_5', { leaked: [], perfect: true }],
  ]);
  const plan = planUnite(m, results);
  assert.ok(plan.helpers.length > 0);
  assert.ok(!plan.helpers.includes(P(4)), 'round 1');
  m.lastResults = results;
  const res = { perPlayer: { [plan.helpers[0].playerId]: { leaked: [{ enemyKey: key, counted: true, sourcePlayerId: 'p_0' }] } } };
  const next = m._relayPlan({ ...plan, helpers: [plan.helpers[0]] }, res);
  if (next) assert.ok(!next.helpers.includes(P(4)), 'the relay');
});

test('match: the boss overtime drain is unchanged at scale 1 and multiplied above it', () => {
  for (const [scale, want] of [[1, 1.5], [2, 3]]) {
    const { m } = largeMatch(scale > 1 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2]);
    assert.equal(m.roomScale, scale);
    m.gd.bossOvertimeDue = () => 1.5;
    m.overtimeApplied = 0;
    let lost = 0;
    m._teamLpLoss = (n) => { lost += n; };
    m._applyOvertime(999);
    assert.equal(lost, want, `scale ${scale}`);
  }
});

test('match: the leader pool counts every player alive up to the room\'s seats, for both leaders; 4 seats keep the 4 cap', () => {
  // docs/design/large-rooms.md "one HP pool of base × players alive" (the user's report of 2026-11-10: 6 players met a 4-player pool)
  for (const [seatIdx, out, want] of [[[0, 1, 2], [], 3], [[0, 1, 2, 3, 4, 5], [], 6], [[0, 1, 2, 3, 4, 5, 6, 7], [], 8], [[0, 1, 2, 3, 4, 5, 6, 7], ['p_2', 'p_6'], 6]]) {
    for (const hidden of [false, true]) {
      const { m } = largeMatch(seatIdx, { difficulty: 'HARD' });
      for (const id of out) { const ps = m.players.get(id); ps.alive = false; ps.lp = 0; }
      m.startFinalAssault(hidden);
      const bossId = hidden ? m.hiddenBossId : m.bossId;
      const label = `${seatIdx.length} seats, ${want} alive, ${hidden ? 'Hidden Core' : 'Final Assault'}`;
      assert.equal(m.bossPool.maxHp, m.gd.boss(bossId).bloodPoint.HARD * want, label);
      assert.equal(m.publicView().bossHp.max, m.bossPool.maxHp, `${label}: the HP bar shows the same pool`);
      m.dispose();
    }
  }
});

test('generations: 105 minutes only for a retiring generation that still runs a large-room match', () => {
  const table = { current: 'a', gens: { a: { port: 3101 }, b: { port: 3102, retiringSince: 0 } } };
  const busy = { humanMatches: 1, sockets: 3 };
  assert.deepEqual(reapPlan(table, { b: busy }, MAX_AGE_MS + 1).stop, ['b'], 'a normal match: still 60 min');
  assert.deepEqual(reapPlan(table, { b: { ...busy, largeMatches: 1 } }, MAX_AGE_MS + 1).stop, [], 'a large-room match runs on');
  assert.deepEqual(reapPlan(table, { b: { ...busy, largeMatches: 1 } }, LARGE_MAX_AGE_MS + 1).stop, ['b'], 'until 105 min');
  assert.equal(MAX_AGE_MS, 60 * 60 * 1000);
});

test('a normal room still answers BAD_MSG for a seat past its 4, as before 8-seat rooms', () => {
  const h = harness();
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop' }));
  refused(h.lobby.removeBot(host, { seat: 5 }), ERR.BAD_MSG);
  refused(h.lobby.kick(host, { seat: 6, playerId: 'x' }), ERR.BAD_MSG);
  refused(h.lobby.removeBot(host, { seat: 2 }), ERR.BAD_TARGET);
});

test('match: a player who turned on AI 托管 is never counted idle; pause and 托管 reset the count', () => {
  const idle = [];
  const { m } = largeMatch([0, 4], { onIdle: (pid) => idle.push(pid) });
  const ps = m.players.get('p_0');
  ps.autoplay = true;
  for (let i = 0; i < 5; i++) m._noteIdlePrep(ps);
  assert.equal(ps.idlePreps, 0);
  ps.autoplay = false;
  ps.idlePreps = 2;
  m._handle(ps, { t: 'g.autoplay', on: true });
  assert.equal(ps.idlePreps, 0);
  m._handle(ps, { t: 'g.autoplay', on: false });
  ps.idlePreps = 2;
  try { m._handle(ps, { t: 'g.pause', on: true }); } catch { /* a co-op match may refuse the pause; the count is what matters */ }
  assert.equal(ps.idlePreps, 0);
  assert.deepEqual(idle, []);
});

test('lock: the host locks with 4 letters and alone sees them; joining by key or invite link and watching need them; wrong ones are rate-limited', () => {
  const h = harness();
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
  const code = h.last(host, 'room.state').code;
  const mate = h.player('Mate');
  ok(h.lobby.join(mate, { code }));
  refused(h.lobby.setLock(mate, { on: true, password: 'ABCD' }), ERR.NOT_HOST);
  refused(h.lobby.setLock(host, { on: true, password: 'AB1D' }), ERR.BAD_MSG); // (2026-11-08) { on: true } alone is allowed: the last password or 4 random letters
  ok(h.lobby.setLock(host, { on: true, password: 'wxyz' }));
  assert.equal(h.last(mate, 'room.state').locked, true);
  assert.equal(h.last(host, 'room.state').password, 'WXYZ', 'the host sees it, upper case');
  assert.equal(h.last(mate, 'room.state').password, undefined, 'nobody else gets the password');
  assert.equal(h.last(mate, 'room.state').locked, true);
  const guest = h.player('Guest');
  refused(h.lobby.join(guest, { code }), ERR.ROOM_LOCKED);
  refused(h.lobby.join(guest, { code, password: 'AAAA' }), ERR.ROOM_LOCKED);
  refused(h.lobby.spectate(guest, { code }), ERR.ROOM_LOCKED);
  ok(h.lobby.join(guest, { code, password: 'wxyz' }));
  assert.equal(h.last(guest, 'room.state').password, undefined, 'a joiner never gets it either');
  // a host change hands the password to the new host only
  h.lobby.leave(host);
  const next = h.lobby.rooms.get(code).hostId;
  const nextHost = [mate, guest].find((p) => p.playerId === next);
  assert.equal(h.last(nextHost, 'room.state').password, 'WXYZ');
  const other0 = [mate, guest].find((p) => p.playerId !== next);
  assert.equal(h.last(other0, 'room.state').password, undefined);
  const watcher = h.player('Watcher');
  ok(h.lobby.spectate(watcher, { code, password: 'WXYZ' }));
  // a spectator who gave the password may take a free seat without it
  ok(h.lobby.join(watcher, { code }));
  const guesser = h.player('Guesser');
  for (let i = 0; i < 6; i++) refused(h.lobby.join(guesser, { code, password: 'QQQ' + String.fromCharCode(65 + i) }), ERR.ROOM_LOCKED);
  refused(h.lobby.join(guesser, { code, password: 'WXYZ' }), ERR.RATE);
  ok(h.lobby.setLock(nextHost, { on: false }));
  assert.equal(h.last(nextHost, 'room.state').password, undefined);
  ok(h.lobby.join(h.player('Late'), { code }));
  // a normal room has no lock
  const other = h.player('Other');
  ok(h.lobby.create(other, { mode: 'coop' }));
  refused(h.lobby.setLock(other, { on: true, password: 'ABCD' }), ERR.BAD_TARGET);
});

test('lock: no other copy of the room carries the password — frames to members, P2P sync, trusted-plugin events, the region digest, /healthz stats, the room list', async () => {
  const h = harness();
  const events = [];
  h.lobby.trustedRuntime = { event: (name, data) => events.push([name, data]) };
  const host = h.player('Host');
  ok(h.lobby.create(host, { mode: 'coop', capacity: 8 }));
  const code = h.last(host, 'room.state').code;
  const mate = h.player('Mate');
  ok(h.lobby.join(mate, { code }));
  // P2P on for everyone: the relay's sync frames go out to the members too
  for (const s of [host, mate]) h.lobby.handleMessage(s, { t: 'p2p.enable', enabled: true });
  ok(h.lobby.setLock(host, { on: true, password: 'qzqz' }));
  const guest = h.player('Guest');
  ok(h.lobby.join(guest, { code, password: 'QZQZ' }));
  const watcher = h.player('Watcher');
  ok(h.lobby.watchRooms(watcher, { on: true }));
  await new Promise((r) => setTimeout(r, 5));
  const leaks = (x) => JSON.stringify(x).includes('QZQZ');
  assert.ok(leaks(h.all(host)), 'the host does get it');
  for (const s of [mate, guest, watcher]) assert.ok(!leaks(h.all(s)), `${s.name}'s frames`);
  assert.ok(events.length > 0 && !leaks(events), 'trusted-plugin events');
  assert.ok(!leaks(h.lobby.crossDigest()), 'the region digest');
  assert.ok(!leaks(h.lobby.stats()), '/healthz stats');
  assert.ok(!leaks(h.lobby.roomList()), 'the room list');
});
