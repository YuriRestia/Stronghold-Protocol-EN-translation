// test/match/deck.test.js — GitHub #132: g.deck answers the requester with the shared deck (m.deck { seq, round, ops:
// [[baseId, left, cap]] }, server/match/match/intents.js deck), which follows buys and sales; the popup groups it
// (public/js/ui/deck.js deckGroups).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { validateC2S } from '../../shared/protocol.js';
import { deckGroups } from '../../public/js/ui/deck.js';

test('g.deck: the pool\'s copies, to the requester only; a buy takes one, a sale gives it back', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed: 7, fake: true });
  try {
    h.start(); h.runToPhase('PREP');
    assert.deepEqual(h.m.handle('p_0', { t: 'g.deck', seq: 3 }), { ok: true });
    const msg = h.lastTo('p_0', 'm.deck');
    assert.equal(msg.seq, 3);
    assert.equal(msg.round, h.m.round);
    assert.equal(h.lastTo('p_1', 'm.deck'), null, 'the requester only');
    const left = Object.fromEntries(msg.ops.map(([id, l, cap]) => [id, [l, cap]]));
    assert.equal(msg.ops.length, h.m.pool.entries.size);
    for (const [id, e] of h.m.pool.entries) assert.deepEqual(left[id], [Math.max(0, e.left), e.cap], id);
    // a buy: one copy fewer
    const ps = h.ps('p_0');
    ps.funds = 99;
    const slot = ps.shop.slots.findIndex((s) => s && s.kind === 'chess');
    const id = ps.shop.slots[slot].id;
    const base = h.m.gd.baseIdOf(id);
    assert.deepEqual(ps.buy(slot), { ok: true });
    h.m.handle('p_0', { t: 'g.deck', seq: 4 });
    const after = Object.fromEntries(h.lastTo('p_0', 'm.deck').ops.map(([i, l]) => [i, l]));
    assert.equal(after[base], left[base][0] - 1);
  } finally { h.m.dispose(); }
});

test('the request is validated', () => {
  assert.equal(validateC2S({ t: 'g.deck', seq: 1 }), null);
  assert.equal(validateC2S({ t: 'g.deck' }), null);
  assert.equal(validateC2S({ t: 'g.deck', seq: -1 }), 'bad field seq');
});

test('deckGroups: by class in the game\'s order, then tier, then name', () => {
  const recs = { a: { name: 'B', tier: 2, profession: 'SNIPER' }, b: { name: 'A', tier: 2, profession: 'SNIPER' }, c: { name: 'Z', tier: 1, profession: 'SNIPER' }, d: { name: 'X', tier: 6, profession: 'PIONEER' } };
  const g = deckGroups([['a', 1, 3], ['b', 0, 3], ['c', -2, 4], ['d', 2, 2], ['missing', 1, 1]], (id) => recs[id]);
  assert.deepEqual(g.map((x) => x.prof), ['PIONEER', 'SNIPER']);
  assert.deepEqual(g[1].ops.map((o) => [o.id, o.left]), [['c', 0], ['b', 0], ['a', 1]]);
});
