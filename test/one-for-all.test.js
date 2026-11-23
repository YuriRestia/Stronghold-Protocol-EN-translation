// (fork) One for All (DESIGN §91.9, server/match/match/oneForAll.js): a Grand Alliance whose strategy is one room-wide
// secret vote. The vote, its secrecy, the close (early, time-out, dropped, leaver), the tally and tie draw, the winner
// for every seat, the 7.5 s BATTLE_CHECK, the result's mode and 鸭爵 applying once per holder with every seat holding it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { Match } from '../server/match/Match.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { buildResult } from '../server/match/results.js';
import { ERR, PHASE } from '../shared/constants.js';
import { ONE_FOR_ALL_CHECK_SECONDS } from '../shared/largeRoom.js';
import { makeMatch, DATA } from './match/harness.js';
import { createRegistry } from '../server/match/effectsMeta.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

function vote(seatIdx = [0, 1, 4, 5], extra = {}) {
  const data = getData({ log: quiet });
  const seats = seatIdx.map((i) => ({ seat: i, playerId: `p_${i}`, name: `P${i + 1}`, isBot: false, connected: true }));
  const sched = new VirtualScheduler();
  const m = new Match({ roomCode: 'T', mode: 'coop', difficulty: 'NORMAL', seats, seed: 7, data, log: quiet, scheduler: sched,
    battleContent: 'full', botRehearsal: 0, largeRoom: true, oneForAll: true, send: () => true, broadcast: () => {}, onEnd: () => {}, ...extra });
  m.phase = PHASE.INFO_CHECK;
  m.enterBandDraft();
  const P = (i) => m.players.get(`p_${i}`);
  return { m, sched, P, bands: m.gd.bandIds() };
}
/** Runs the queued 0 ms callbacks (the close is scheduled with later(0)). */
const settle = (sched) => sched.advance(1);

test('One for All: only a Grand Alliance has it; the vote replaces turns and squad lanes', () => {
  const { m } = vote();
  assert.equal(m.oneForAll, true);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  const d = m.publicView().draft;
  assert.equal(d.mode, 'vote');
  assert.equal(d.voters, 4);
  assert.equal(d.locked, 0);
  assert.equal(d.lanes, undefined);
  assert.equal(d.turn, null);
  assert.deepEqual(d.picks, {});
  assert.ok(d.turnDeadline > 0 && d.turnDeadline === m.deadline);
  assert.equal(d.turnSeconds, 50);
  const data = getData({ log: quiet });
  const plain = new Match({ roomCode: 'N', mode: 'coop', difficulty: 'NORMAL', seats: [0, 1].map((i) => ({ seat: i, playerId: `n_${i}`, name: 'N', isBot: false, connected: true })),
    seed: 7, data, log: quiet, scheduler: new VirtualScheduler(), battleContent: 'full', botRehearsal: 0, oneForAll: true, send: () => true, broadcast: () => {}, onEnd: () => {} });
  assert.equal(plain.oneForAll, false, 'not without largeRoom');
});

test('One for All: Confirm locks the vote; no change, no skip, no highlight after it', () => {
  const { m, P, bands } = vote();
  assert.deepEqual(m.bandFocus(P(0), bands[3]), { ok: true });
  assert.deepEqual(P(0).privateView().vote, { bandId: null, locked: false });
  assert.deepEqual(m.pickBand(P(0), bands[3]), { ok: true });
  assert.deepEqual(P(0).privateView().vote, { bandId: bands[3], locked: true });
  assert.equal(m.pickBand(P(0), bands[4]).error, ERR.ALREADY);
  assert.equal(m.bandFocus(P(0), bands[4]).error, ERR.ALREADY);
  assert.equal(m.skipBand(P(1)).error, ERR.WRONG_PHASE);
  assert.equal(m.pickBand(P(1), 'band_nope').error, ERR.BAD_TARGET);
  assert.equal(m.publicView().draft.locked, 1);
  // everyone may vote for the same strategy (no 队友已选)
  assert.deepEqual(m.pickBand(P(4), bands[3]), { ok: true });
});

test('One for All: secret — nobody else\'s vote is in the public view or another player\'s private view before the reveal', () => {
  const { m, P, bands } = vote();
  const secret = bands.slice(-3); // strategies no default or highlight would show
  m.pickBand(P(0), secret[0]);
  m.pickBand(P(1), secret[1]);
  m.bandFocus(P(4), secret[2]);
  const pub = JSON.stringify(m.publicView());
  for (const id of secret) assert.ok(!pub.includes(id), `public view leaks ${id}`);
  for (const [i, own] of [[0, secret[0]], [1, secret[1]], [4, null], [5, null]]) {
    const priv = JSON.stringify(P(i).privateView());
    for (const id of secret) if (id !== own) assert.ok(!priv.includes(id), `p_${i} sees ${id}`);
  }
});

test('One for All: the vote ends at once when everyone locked; most votes wins for every seat; 7.5 s BATTLE_CHECK', () => {
  const { m, sched, P, bands } = vote();
  const [a, b] = [bands[5], bands[9]];
  m.pickBand(P(0), a);
  m.pickBand(P(1), b);
  m.pickBand(P(4), a);
  settle(sched);
  assert.equal(m.phase, PHASE.BAND_DRAFT, 'one voter still deciding');
  m.pickBand(P(5), a);
  settle(sched);
  assert.equal(m.phase, PHASE.BATTLE_CHECK);
  const r = m.publicView().draft.reveal;
  assert.deepEqual(r.counts, { [a]: 3, [b]: 1 });
  assert.equal(r.winner, a);
  assert.deepEqual(r.random, []);
  assert.deepEqual(r.picks, { p_0: a, p_1: b, p_4: a, p_5: a });
  for (const ps of m.order) {
    assert.equal(ps.bandId, a);
    assert.equal(ps.lp, m.gd.startLp(a));
  }
  assert.ok(Math.abs(m.deadline - sched.now() - ONE_FOR_ALL_CHECK_SECONDS * 1000) <= 1, 'BATTLE_CHECK runs 7.5 s');
  assert.equal(m.battleCheckSeconds(), 7.5);
  assert.equal(buildResult(m, { victory: false, reason: 'eliminated' }).mode, 'oneForAll');
});

test('One for All: a tie is drawn from the draft stream among the tied strategies, the same on a replay', () => {
  const run = (seed) => {
    const { m, sched, P, bands } = vote([0, 1, 4, 5], { seed });
    m.pickBand(P(0), bands[2]); m.pickBand(P(1), bands[2]);
    m.pickBand(P(4), bands[7]); m.pickBand(P(5), bands[7]);
    settle(sched);
    return { w: m.publicView().draft.reveal.winner, tied: [bands[2], bands[7]] };
  };
  const winners = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const one = run(seed);
    assert.ok(one.tied.includes(one.w));
    assert.equal(run(seed).w, one.w, `seed ${seed} replays the same`);
    winners.add(one.w);
  }
  assert.equal(winners.size, 2, 'both tied strategies win under some seed');
});

test('One for All: time-out counts the highlight, else a random strategy never built on a switched-off bond', () => {
  const { m, sched, P, bands } = vote();
  m.pickBand(P(0), bands[1]);
  m.bandFocus(P(1), bands[6]);
  sched.advance(m.deadline - sched.now() + 1);
  assert.equal(m.phase, PHASE.BATTLE_CHECK);
  const r = m.publicView().draft.reveal;
  assert.equal(r.picks.p_0, bands[1]);
  assert.equal(r.picks.p_1, bands[6]);
  assert.deepEqual(r.random, ['p_4', 'p_5']);
  const off = m.gd.modeInactiveBonds;
  for (const pid of r.random) assert.ok(!m.gd.bandBondIds(r.picks[pid]).some((b) => off.has(b)), `${r.picks[pid]} is 本局禁用`);
  // the random votes replay the same
  const again = vote();
  again.m.pickBand(again.P(0), bands[1]);
  again.m.bandFocus(again.P(1), bands[6]);
  again.sched.advance(again.m.deadline - again.sched.now() + 1);
  assert.deepEqual(again.m.publicView().draft.reveal, r);
  // with switched-off bonds, no random vote lands on one built around them in many draws
  const pool = m._randomVotePool();
  if (off.size) assert.ok(pool.length < bands.length);
  for (const id of pool) assert.ok(!m.gd.bandBondIds(id).some((b) => off.has(b)));
});

test('One for All: a dropped seat is not waited for and votes at random; a leaver\'s vote is dropped', () => {
  const { m, sched, P, bands } = vote();
  m.bandFocus(P(5), bands[8]);
  m._largeDisconnect(P(5)); // the AI plays the seat
  m.pickBand(P(0), bands[3]);
  m.pickBand(P(1), bands[3]);
  m._quit(P(4)); // g.leave before the reveal
  settle(sched);
  assert.equal(m.phase, PHASE.BATTLE_CHECK, 'nobody left deciding');
  const r = m.publicView().draft.reveal;
  assert.equal(r.picks.p_4, undefined, 'the leaver has no vote');
  assert.deepEqual(r.random, ['p_5'], 'the dropped seat votes at random, not its highlight');
  assert.equal(r.winner, bands[3]);
  assert.equal(P(4).bandId, bands[3]);
  assert.equal(P(4).lp, 0, 'the leaver keeps its 0 LP');
  assert.equal(P(5).lp, m.gd.startLp(bands[3]));
});

test('One for All: a single human votes untimed and the vote ends on Confirm', () => {
  const { m, sched, P, bands } = vote([0]);
  assert.equal(m.deadline, 0);
  assert.equal(m.publicView().draft.untimed, true);
  m.pickBand(P(0), bands[4]);
  settle(sched);
  assert.equal(m.phase, PHASE.BATTLE_CHECK);
  assert.equal(P(0).bandId, bands[4]);
});

// 鸭爵 is a global effect (server/sim/content/bands/meta.js duckGlobal): every living holder makes its own 0–2 draw on
// separate units (the user, 2026-11-13: "if there's 8 players duck lord, that gets applied 8 times"); the first draw is
// the one a single holder makes, every player gets the same units.
test('One for All: 鸭爵 held by every seat draws once per holder, on separate units, the same for every player', () => {
  const REG = createRegistry({ log: quiet });
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 3, seed: 91, registry: REG, fake: true }).start();
  h.toPrep(6);
  const m = h.m;
  const ps = m.alivePlayers();
  const duck = (spawns) => spawns.filter((s) => s.tag === 'duck').map((s) => `${s.actionIndex}:${s.routeIndex}:${s.enemyKey}`).sort();
  const seed0 = m.seed;
  let seen = 0, more = 0;
  for (let k = 0; k < 12; k++) {
    m.seed = seed0 + k;
    for (const p of ps) p.bandId = m.gd.bandDraft.timeoutBandId;
    ps[0].bandId = 'band_ducklord';
    const one = ps.map((p) => duck(m._normalOpts(p).spawns));
    for (const p of ps) p.bandId = 'band_ducklord';
    const lists = ps.map((p) => m._normalOpts(p).spawns.filter((s) => s.tag === 'duck'));
    const all = lists.map(duck);
    for (let i = 0; i < ps.length; i++) for (const u of one[i]) assert.ok(all[i].includes(u), `draw ${k}: the single holder's swap ${u} stays`);
    const units = lists.map((l) => l.map((s) => `${s.actionIndex}:${s.routeIndex}:${s.time}`));
    for (const u of units) assert.equal(new Set(u).size, u.length, `draw ${k}: no unit swapped twice`);
    const unitsOf = (l) => l.map((s) => `${s.actionIndex}:${s.routeIndex}`).sort();
    for (let i = 1; i < ps.length; i++) assert.deepEqual(unitsOf(lists[i]), unitsOf(lists[0]), `draw ${k}: player ${i} has the same units`);
    assert.ok(all[0].length <= 2 * ps.length);
    seen += one[0].length;
    more += all[0].length - one[0].length;
  }
  assert.ok(seen > 0, 'some draw swapped a unit');
  assert.ok(more > seen, `four holders swap more than one (${seen + more} vs ${seen})`);
  assert.ok(DATA.bands.band_ducklord);
  m.dispose();
});
