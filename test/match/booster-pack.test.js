// test/match/booster-pack.test.js — the boosterPack cheat (GitHub #35; shared/ruleData.js BOOSTER, player/items.js
// openBooster): every player starts with a Booster Pack; equipped on an operator it opens a free pick-one offer of
// BOOSTER.choices operators of that operator's tier, in a fixed order that comes round per player and tier, and stays in
// the hand; AI players neither use nor drop it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give } from './harness.js';
import { BOOSTER } from '../../shared/ruleData.js';
import { rulesInForce, ruleOf } from '../../shared/rules.js';

const packsOf = (ps) => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item' && p.id === BOOSTER.itemId);
const normalOf = (gd, tier) => gd.visibleChess.filter((id) => gd.tierOf(id) === tier && !gd.chess(id).isGolden).sort();
const tierOrder = (m, tier) => [...m.pool.entries.keys()].filter((b) => m.gd.tierOf(b) === tier && !m.gd.chess(b)?.isDiy).sort();

test('boosterPack: a cheat; every player starts with one Booster Pack, nobody without the rule', () => {
  assert.equal(ruleOf('boosterPack').category, 'cheat');
  assert.deepEqual(rulesInForce({ boosterPack: true }), ['boosterPack']);
  const on = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { boosterPack: true } }).start();
  const off = makeMatch({ mode: 'coop', humans: 2, seed: 4 }).start();
  try {
    on.toPrep(1); off.toPrep(1);
    for (const id of ['p_0', 'p_1']) {
      assert.equal(packsOf(on.ps(id)).length, 1, id);
      assert.equal(packsOf(off.ps(id)).length, 0, id);
    }
    const rec = on.m.gd.item(BOOSTER.itemId);
    assert.equal(rec.booster, true);
    assert.equal(rec.hideInShop, true);
    assert.equal(off.m.gd.item(BOOSTER.itemId), null, 'no record without the rule');
  } finally { on.m.dispose(); off.m.dispose(); }
});

test('the pack on an operator: an offer of the next operators of its tier in the fixed order, the pack kept', () => {
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { boosterPack: true } }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    const [pack] = packsOf(ps);
    const tier = 3;
    const op = give(h.m, ps, normalOf(h.m.gd, tier)[0]);
    const order = tierOrder(h.m, tier);
    assert.ok(order.length > BOOSTER.choices, 'enough tier-3 operators to wrap round');
    ps.offers.length = 0;
    const take = (from, n) => Array.from({ length: n }, (_, i) => order[(from + i) % order.length]);
    let at = 0;
    for (let use = 0; use < Math.ceil(order.length / BOOSTER.choices) + 1; use++) {
      assert.deepEqual(ps.equip(pack.uid, op.uid), { ok: true }, `use ${use}`);
      const offer = ps.offers.at(-1);
      assert.equal(offer.tier, tier);
      assert.equal(offer.source, 'booster');
      assert.deepEqual(offer.slots.map((s) => s.id), take(at, BOOSTER.choices), `use ${use}: the next ${BOOSTER.choices}`);
      assert.ok(offer.slots.every((s) => s.price === 0 && h.m.gd.tierOf(s.id) === tier));
      at = (at + BOOSTER.choices) % order.length;
    }
    assert.ok(ps.find(pack.uid) && ps.find(pack.uid).area !== 'equipped', 'the pack stays where it was');
    assert.equal((op.items || []).length, 0, 'nothing attached');
    // a pick takes the operator, free
    ps.offers.splice(0, ps.offers.length - 1);
    const funds = ps.funds;
    const want = ps.offers[0].slots[2].id;
    assert.deepEqual(ps.pickReward(2), { ok: true });
    assert.equal(ps.funds, funds);
    assert.ok(ps.allChess().some((p) => p.id === want), 'the picked operator joins');
    // another tier keeps its own place
    const t5 = give(h.m, ps, normalOf(h.m.gd, 5)[0]);
    ps.offers.length = 0;
    assert.deepEqual(ps.equip(pack.uid, t5.uid), { ok: true });
    assert.deepEqual(ps.offers[0].slots.map((s) => s.id), tierOrder(h.m, 5).slice(0, BOOSTER.choices));
  } finally { h.m.dispose(); }
});

test('each player has a place of its own in the order', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { boosterPack: true } }).start();
  try {
    h.toPrep(1);
    const [a, b] = ['p_0', 'p_1'].map((id) => h.ps(id));
    const id2 = normalOf(h.m.gd, 2)[0];
    const [oa, ob] = [a, b].map((ps) => give(h.m, ps, id2));
    for (const ps of [a, b]) ps.offers.length = 0;
    a.equip(packsOf(a)[0].uid, oa.uid);
    a.equip(packsOf(a)[0].uid, oa.uid);
    b.equip(packsOf(b)[0].uid, ob.uid);
    const first = tierOrder(h.m, 2).slice(0, BOOSTER.choices);
    assert.deepEqual(b.offers[0].slots.map((s) => s.id), first, 'b starts at the beginning');
    assert.notDeepEqual(a.offers[1].slots.map((s) => s.id), first, 'a moved on');
  } finally { h.m.dispose(); }
});

test('AI players keep the pack: never used, never dropped', () => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 3, seed: 6, lobbyRules: { boosterPack: true } }).start();
  try {
    for (let r = 1; r <= 4; r++) {
      h.toPrep(r);
      for (const ps of h.m.players.values()) {
        if (!ps.isBot) continue;
        assert.equal(packsOf(ps).length, 1, `${ps.playerId} round ${r}`);
        assert.ok(!ps.offers.some((o) => o.source === 'booster'), 'the bot never opened it');
      }
    }
  } finally { h.m.dispose(); }
});
