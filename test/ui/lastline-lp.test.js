// GitHub #123: with the SPA-CC Last Line of Defense tag, the LP shown while a round runs (top bar, team rows, tooltip)
// and in the round's result box include its +2 past the cap, as the server's settlement (Match.riskLoss) charges it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { CC } from '../../shared/ruleData.js';

const { pendingLoss, liveLp, lastLineExtra, pendingLpLeaks, pendingTip, ownLeaks } = await import('../../public/js/ui/hud.js');
const { ownRoundLoss } = await import('../../public/js/ui/gameLogic/phases.js');
const { rowLp } = await import('../../public/js/ui/teamPanel.js');

const RULES = { ccLastLine: 1 };
const X = CC.lastLineLp;

test('lastLineExtra: the tag\'s LP, 0 without it', () => {
  assert.equal(X, 2);
  assert.equal(lastLineExtra(RULES), 2);
  assert.equal(lastLineExtra({ ccLastLine: 0 }), 0);
  assert.equal(lastLineExtra(null), 0);
});

test('pendingLoss adds it once anything leaked, past the cap', () => {
  assert.equal(pendingLoss(0, 10, X), 0, 'no leak, no extra');
  assert.equal(pendingLoss(1, 10, X), 3);
  assert.equal(pendingLoss(14, 10, X), 12, 'the issue: −12, not −10');
  assert.equal(pendingLoss(14, 10), 10, 'without the tag as before');
});

test('the server\'s pendingLp (LP, extra included) reads back as leaks, so it isn\'t counted twice', () => {
  assert.equal(pendingLpLeaks(5, X), 3);
  assert.equal(pendingLpLeaks(12, X), 10);
  assert.equal(pendingLpLeaks(0, X), 0);
  assert.equal(pendingLpLeaks(undefined, X), undefined);
  assert.equal(pendingLoss(ownLeaks(2, pendingLpLeaks(5, X)), 10, X), 5, 'local 2 leaks, server 3: 3 + 2');
});

test('liveLp: the top bar marks −12 for 14 leaks; a 联防 leaker pays it even when every survivor falls', () => {
  const live = liveLp(null, { phase: PHASE.COMBAT, round: 4, lp: 40, statsLeaks: 0, leaks: 14, cap: 10, extra: X });
  assert.equal(live.pending, 12);
  assert.equal(live.shown, 28);
  const unite = liveLp(null, { phase: PHASE.UNITE, round: 4, lp: 40, statsLeaks: 0, leaks: 3, cap: 10, uniteLeft: 0, extra: X });
  assert.equal(unite.pending, 2);
  assert.equal(liveLp(null, { phase: PHASE.COMBAT, round: 4, lp: 40, statsLeaks: 0, leaks: 0, cap: 10, extra: X }).pending, 0);
});

test('the result box (ownRoundLoss) and a teammate\'s 联防 row', () => {
  assert.equal(ownRoundLoss({ leaks: 14, cap: 10, extra: X }), 12);
  assert.equal(ownRoundLoss({ leaks: 0, cap: 10, extra: X }), 0);
  assert.equal(ownRoundLoss({ leaks: 14, cap: 10 }), 10);
  const pub = { phase: PHASE.UNITE, unite: { leakers: ['b'] } };
  assert.equal(rowLp({ playerId: 'b', lp: 30 }, pub, null, { uniteLocal: { b: 4 }, cap: 10, extra: X }).pending, 6);
});

test('the tooltip names the extra LP', () => {
  const tip = pendingTip(40, 12, { cap: 10, extra: X });
  assert.match(tip, /10/);
  assert.match(tip, /最后防线/);
  assert.match(pendingTip(40, 2, { unite: true, cap: 10, left: 0, extra: X }), /最后防线/);
});
