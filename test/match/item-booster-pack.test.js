// test/match/item-booster-pack.test.js — the itemBoosterPack cheat (GitHub #56; shared/ruleData.js ITEM_BOOSTER,
// player/items.js openItemBooster): every player starts with an Equipment Booster Pack; equipped on any operator it opens
// a free pick-one offer of ITEM_BOOSTER.choices items, the next ones of one fixed order through every shop item, and
// stays in the hand; its own toggle, apart from the Booster Pack; AI players neither use nor drop it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give } from './harness.js';
import { BOOSTER, ITEM_BOOSTER, ruleDataPatch } from '../../shared/ruleData.js';
import { rulesInForce, ruleOf } from '../../shared/rules.js';

const packsOf = (ps, id = ITEM_BOOSTER.itemId) => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item' && p.id === id);
const itemOrder = (gd) => Object.keys(gd.shopItemsByTier).map(Number).sort((a, b) => a - b).flatMap((t) => gd.shopItemsByTier[t]);

test('itemBoosterPack: a cheat of its own; every player starts with one Equipment Booster Pack, and only with the rule', () => {
  assert.equal(ruleOf('itemBoosterPack').category, 'cheat');
  assert.deepEqual(rulesInForce({ itemBoosterPack: true }), ['itemBoosterPack']);
  const rec = ruleDataPatch({}, { itemBoosterPack: true }).items[ITEM_BOOSTER.itemId];
  assert.equal(rec.booster, true);
  assert.equal(rec.boosts, 'items');
  assert.equal(rec.iconId, ITEM_BOOSTER.iconId);
  assert.notEqual(ITEM_BOOSTER.iconId, BOOSTER.iconId, 'told apart from the Booster Pack at a glance');
  const on = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { itemBoosterPack: true } }).start();
  const both = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { itemBoosterPack: true, boosterPack: true } }).start();
  const off = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { boosterPack: true } }).start();
  try {
    on.toPrep(1); both.toPrep(1); off.toPrep(1);
    for (const id of ['p_0', 'p_1']) {
      assert.deepEqual([packsOf(on.ps(id)).length, packsOf(on.ps(id), BOOSTER.itemId).length], [1, 0], id);
      assert.deepEqual([packsOf(both.ps(id)).length, packsOf(both.ps(id), BOOSTER.itemId).length], [1, 1], id);
      assert.deepEqual([packsOf(off.ps(id)).length, packsOf(off.ps(id), BOOSTER.itemId).length], [0, 1], id);
    }
    assert.equal(off.m.gd.item(ITEM_BOOSTER.itemId), null, 'no record without the rule');
  } finally { on.m.dispose(); both.m.dispose(); off.m.dispose(); }
});

test('the pack on any operator: an offer of the next items of one order through every shop item, the pack kept', () => {
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { itemBoosterPack: true } }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    const [pack] = packsOf(ps);
    const gd = h.m.gd;
    const order = itemOrder(gd);
    assert.ok(order.length > 2 * ITEM_BOOSTER.choices, 'enough items to wrap round');
    assert.ok(order.every((id) => !gd.item(id).isGolden && !gd.item(id).booster), 'shop items only');
    for (let i = 1; i < order.length; i++) assert.ok(gd.item(order[i]).tier >= gd.item(order[i - 1]).tier, 'tier 1 → 6');
    const ops = [give(h.m, ps, gd.visibleChess.find((id) => gd.tierOf(id) === 1)), give(h.m, ps, gd.visibleChess.find((id) => gd.tierOf(id) === 4))];
    ps.offers.length = 0;
    const take = (from, n) => Array.from({ length: n }, (_, i) => order[(from + i) % order.length]);
    let at = 0;
    for (let use = 0; use < Math.ceil(order.length / ITEM_BOOSTER.choices) + 1; use++) {
      // whichever operator, of whichever tier: one order
      assert.deepEqual(ps.equip(pack.uid, ops[use % 2].uid), { ok: true }, `use ${use}`);
      const offer = ps.offers.at(-1);
      assert.equal(offer.source, 'itemBooster');
      assert.deepEqual(offer.slots.map((s) => s.id), take(at, ITEM_BOOSTER.choices), `use ${use}: the next ${ITEM_BOOSTER.choices}`);
      assert.ok(offer.slots.every((s) => s.kind === 'item' && s.price === 0));
      at = (at + ITEM_BOOSTER.choices) % order.length;
    }
    assert.ok(ps.find(pack.uid) && ps.find(pack.uid).area !== 'equipped', 'the pack stays where it was');
    assert.ok(ops.every((op) => (op.items || []).length === 0), 'nothing attached');
    // a pick gives the item, free
    ps.offers.splice(0, ps.offers.length - 1);
    const funds = ps.funds;
    const want = ps.offers[0].slots[1].id;
    assert.deepEqual(ps.pickReward(1), { ok: true });
    assert.equal(ps.funds, funds);
    assert.ok(ps.hand.some((p) => p && p.kind === 'item' && p.id === want), 'the picked item joins the hand');
  } finally { h.m.dispose(); }
});

test('an item the shared stock has run out of is still listed; each player has a place of their own', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { itemBoosterPack: true } }).start();
  try {
    h.toPrep(1);
    const [a, b] = ['p_0', 'p_1'].map((id) => h.ps(id));
    const order = itemOrder(h.m.gd);
    const real = h.m.itemPool.canGain;
    h.m.itemPool.canGain = (id) => id !== order[0] && real.call(h.m.itemPool, id);
    const [oa, ob] = [a, b].map((ps) => give(h.m, ps, h.m.gd.visibleChess.find((id) => h.m.gd.tierOf(id) === 2)));
    for (const ps of [a, b]) ps.offers.length = 0;
    a.equip(packsOf(a)[0].uid, oa.uid);
    a.equip(packsOf(a)[0].uid, oa.uid);
    b.equip(packsOf(b)[0].uid, ob.uid);
    const first = order.slice(0, ITEM_BOOSTER.choices);
    assert.deepEqual(a.offers[0].slots.map((s) => s.id), first, 'out of stock, still offered');
    assert.deepEqual(b.offers[0].slots.map((s) => s.id), first, 'b starts at the beginning');
    assert.deepEqual(a.offers[1].slots.map((s) => s.id), order.slice(ITEM_BOOSTER.choices, 2 * ITEM_BOOSTER.choices), 'a moved on');
  } finally { h.m.dispose(); }
});

test('AI players keep the pack: never used, never dropped', () => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 3, seed: 6, lobbyRules: { itemBoosterPack: true } }).start();
  try {
    for (let r = 1; r <= 4; r++) {
      h.toPrep(r);
      for (const ps of h.m.players.values()) {
        if (!ps.isBot) continue;
        assert.equal(packsOf(ps).length, 1, `${ps.playerId} round ${r}`);
        assert.ok(!ps.offers.some((o) => o.source === 'itemBooster'), 'the bot never opened it');
      }
    }
  } finally { h.m.dispose(); }
});
