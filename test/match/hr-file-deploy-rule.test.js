// GitHub #183: 人事部文档 (HR File, "max deployable becomes 9") did nothing under the +2 deployment-limit rule (8 + 2 = 10 ≥ 9).
// It raises the limit to 9 above the rule's bonus: 9 normally, 11 with the rule; two of them don't add up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, giveItem, chessOfTier } from './harness.js';

function equipHr(lobbyRules, n = 1) {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11, lobbyRules }).start();
  h.toPrep(1);
  const m = h.m, ps = h.ps('p_0');
  const a = give(m, ps, chessOfTier(1).find((c) => m.pool.has(c)));
  const before = ps.deployCap;
  for (let i = 0; i < n; i++) { const hr = giveItem(m, ps, 'chess_item_6_08_e_a'); assert.ok(m.handle('p_0', { t: 'g.equip', itemUid: hr.uid, targetUid: a.uid }).ok); }
  return { before, after: ps.deployCap };
}

test('HR File: 9 normally', () => { assert.deepEqual(equipHr(undefined), { before: 8, after: 9 }); });
test('HR File with the +2 deployment rule: 10 → 11, still +1', () => { assert.deepEqual(equipHr({ extraDeploy: true }), { before: 10, after: 11 }); });
test('two HR Files do not add up', () => {
  assert.equal(equipHr(undefined, 2).after, 9);
  assert.equal(equipHr({ extraDeploy: true }, 2).after, 11);
});
