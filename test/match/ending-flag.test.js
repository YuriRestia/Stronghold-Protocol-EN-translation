// (fork) m.public `ending` (server/match/match/views.js, results.js endingView): set the moment the last battle is over
// and RESULT follows the settlement pause, with each player's result-card ace — the page loads the result cards'
// animated illustrations in that pause (crew-docs l2d-art-proposal D10, open item O4). FakeBattle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { aceOf } from '../../shared/resultAce.js';
import { DELAYS } from '../../server/match/match/common.js';
import { makeMatch, give, chessOfTier, legalTileFor } from './harness.js';

const acesOfResult = (end) => Object.fromEntries(end.players.map((p) => [p.playerId, aceOf(p.lineup)]).filter(([, a]) => a)
  .map(([id, a]) => [id, { id: a.id, golden: a.golden, ...(a.diy ? { diy: { charId: a.diy.charId } } : {}), ...(a.standInFor ? { standInFor: a.standInFor } : {}) }]));

test('a won Final Assault with no Hidden Core: ending set as the round ends, aces = the result\'s, RESULT one settlement pause later', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 2, seed: 41, fake: true, script: (b) => (b.kind === 'boss' ? { bossDps: 1e9 } : {}) }).start();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round === 14);
  // a lineup each: a tier-3 piece, then a tier-5 one (the ace) — two humans, boss halves
  for (const ps of m.players.values()) {
    for (const id of [chessOfTier(3)[0], chessOfTier(5)[ps.seat]]) give(m, ps, id, 'board', legalTileFor(m, ps, id));
  }
  h.drive(() => m.phase === PHASE.FINAL_ASSAULT);
  assert.equal(m.publicView().ending, undefined, 'absent while the fight runs');
  h.drive(() => !!m.ending);
  const at = h.sched.now();
  assert.equal(m.phase, PHASE.FINAL_ASSAULT, 'set before RESULT');
  const pub = m.publicView();
  assert.ok(pub.ending && pub.ending.aces, 'in m.public');
  const end = h.runToEnd();
  assert.equal(end.victory, true);
  assert.deepEqual(pub.ending.aces, acesOfResult(end), 'the same aces m.result\'s lineups give');
  for (const ps of m.players.values()) assert.equal(pub.ending.aces[ps.playerId].id, chessOfTier(5)[ps.seat], 'the tier-5 piece');
  assert.equal(h.sched.now() - at, Math.round(DELAYS.SETTLE * m.timerScale), 'the settlement pause');
  m.dispose();
});

test('a Final Assault won into the Hidden Core sets no ending; the Hidden Core\'s end does', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed: 52, fake: true, script: (b) => (b.kind === 'boss' || b.kind === 'hidden' ? { bossDps: 1e9 } : {}) }).start();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round === 14);
  for (const p of m.players.values()) { p.bondCountBonus.yanShip = 3; p.layers.yanShip = 601; p.recompute(); }
  h.drive(() => m.phase === PHASE.PREP && m.round === 15);
  assert.equal(m.ending, undefined, 'the Hidden Core follows: no ending');
  h.drive(() => m.phase === PHASE.HIDDEN_CORE);
  h.drive(() => !!m.ending);
  assert.equal(m.phase, PHASE.HIDDEN_CORE);
  const at = h.sched.now();
  const end = h.runToEnd();
  assert.equal(end.hiddenCleared, true);
  assert.equal(h.sched.now() - at, Math.round(DELAYS.SETTLE * m.timerScale));
  m.dispose();
});

test('a settlement that leaves nobody alive sets ending in SETTLE; RESULT follows the pause', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 2, seed: 43, fake: true }).start();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round === 3);
  for (const p of m.players.values()) p.lp = 0;
  h.drive(() => m.phase === PHASE.SETTLE);
  assert.ok(m.ending && m.publicView().ending, 'set with the settlement that eliminated everyone');
  const at = h.sched.now();
  const end = h.runToEnd();
  assert.equal(end.reason, 'eliminated');
  assert.equal(h.sched.now() - at, Math.round(DELAYS.SETTLE * m.timerScale));
  m.dispose();
});

test('an ordinary settlement with players left sets no ending', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 2, seed: 44, fake: true }).start();
  const m = h.m;
  h.drive(() => m.phase === PHASE.SETTLE && m.round === 2);
  assert.equal(m.ending, undefined);
  assert.equal(m.publicView().ending, undefined);
  m.dispose();
});
