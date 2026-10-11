import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../../server/match/gamedata.js';
import { DATA, makeMatch, give, checkInvariants } from './harness.js';
import { PHASE } from '../../shared/constants.js';
import { cardPickable } from '../../public/js/ui/choiceOverlay.js';

const PACK = 'chess_item_5_07_e_a';
const byName = name => Object.values(DATA.chess).find(c => !c.isGolden && c.name === name).chessId;
test('a duplicate draft card becomes unavailable when the preceding player exhausts equipment stock', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true }).start().toPrep();
  const m = h.m, a = h.ps('p_0'), b = h.ps('p_1');
  a.acquireItem(PACK);
  m.phase = PHASE.SP_DRAFT;
  m.sp = { cards: [PACK, PACK, 'chess_item_1_01_e_a'].map((id, idx) => ({ idx, id, kind: 'item' })),
    order: ['p_0', 'p_1'], idx: 0, picks: {}, taken: {}, untimed: true };
  assert.ok(m.pickCard(a, 0).ok); assert.equal(m.spTurn(), 'p_1');
  assert.equal(m.pickCard(b, 1).error, 'SOLD_OUT'); assert.equal(m.sp.picks.p_1, undefined);
  const card = m.publicView().sp.cards[1]; assert.equal(card.soldOut, true);
  assert.equal(cardPickable({ turnPid: 'p_1', pickOf: new Map() }, card, { myId: 'p_1', solo: false }), false);
  assert.ok(m.pickCard(b, 2).ok); m.dispose();
});
test('measured operator capacities and exceptions: co-op doubles shared stock, never private DIY stock', () => {
  const solo = new GameData(DATA, 'mode_single_normal'), coop = new GameData(DATA, 'mode_multi_normal');
  for (const [name, n] of [['普罗旺斯', 10], ['跃跃', 10], ['风丸', 8], ['蒂比', 12], ['哈洛德', 14], ['缪尔赛思', 5]]) {
    assert.equal(solo.poolCopies(byName(name)), n, name); assert.equal(coop.poolCopies(byName(name)), 2 * n, name);
  }
  assert.equal(coop.poolCopies('chess_char_6_diy1_a'), solo.poolCopies('chess_char_6_diy1_a'));
  assert.equal(solo.itemPoolCopies(PACK), 2); assert.equal(coop.itemPoolCopies(PACK), 2);
});

test('shared equipment occupancy includes hand/equipped/elite, never displayed offers; destroying frees stock', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true }).start().toPrep();
  const m = h.m, a = h.ps('p_0'), b = h.ps('p_1');
  assert.equal(m.itemPool.left(PACK), 2);
  a.funds = 10; const slot = a.shop.slots.findIndex(s => s?.kind === 'item');
  assert.ok(slot >= 0); a.shop.slots[slot] = { kind: 'item', id: PACK, basePrice: 1, sold: false, frozen: true };
  a.pushItemOffer([PACK]); assert.equal(m.itemPool.left(PACK), 2, 'display reserves nothing');
  const x = a.acquireItem(PACK), y = b.acquireItem(PACK); assert.ok(x && y);
  assert.equal(m.itemPool.left(PACK), 0);
  const money = a.funds;
  assert.equal(a.buy(slot).error, 'SOLD_OUT'); assert.equal(a.funds, money); assert.equal(a.shop.slots[slot].sold, false);
  assert.equal(a.pickReward(0).error, 'SOLD_OUT'); assert.equal(a.offers.length, 1);
  const id = [...m.pool.entries.keys()].find(id => m.gd.tierOf(id) === 1), owner = give(m, a, id);
  assert.ok(a.equip(x.uid, owner.uid).ok); assert.equal(m.itemPool.held(PACK), 2);
  assert.ok(a.sell(owner.uid).ok); assert.equal(m.itemPool.held(PACK), 2, 'selling returns equipment to hand, not to stock');
  assert.ok(a.destroy(x.uid).ok); assert.equal(m.itemPool.left(PACK), 1);
  assert.ok(a.buy(slot).ok, 'a third purchase is legal after one of the two owned copies was destroyed');
  assert.equal(m.itemPool.left(PACK), 0);
  b.eliminate(1); assert.equal(m.itemPool.left(PACK), 1);
  const gold = a.acquireItem(PACK); assert.ok(gold && m.gd.isGolden(gold.id));
  assert.equal(m.itemPool.held(PACK), 2, 'one upgraded item occupies two normal copies');
  assert.ok(a.destroy(gold.uid).ok); assert.equal(m.itemPool.left(PACK), 2);
  checkInvariants(m); m.dispose();
});

test('整备 does not upgrade a purchase that would exceed the shared item cap', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true }).start().toPrep();
  const m = h.m, a = h.ps('p_0'), b = h.ps('p_1');
  const KEY = 'effect:builtin_next_buy_golden_item';
  assert.ok(b.acquireItem(PACK));
  assert.equal(m.itemPool.left(PACK), 1);
  a.effects.push({ id: 'zb', key: KEY, name: '整备', counter: 1, battle: false });
  a.funds = 50;
  const slot = a.shop.slots.findIndex((s) => s?.kind === 'item');
  assert.ok(slot >= 0);
  a.shop.slots[slot] = { kind: 'item', id: PACK, basePrice: 1, sold: false, frozen: true };
  assert.ok(a.buy(slot).ok);
  const piece = [...a.hand, ...a.temp].find((p) => p && m.gd.baseIdOf(p.id) === PACK);
  assert.ok(piece);
  assert.equal(m.gd.isGolden(piece.id), false, 'the last copy stays normal');
  assert.equal(a.effects.find((e) => e.key === KEY).counter, 1, 'the charge is kept');
  assert.equal(m.itemPool.held(PACK), m.itemPool.cap(PACK));
  checkInvariants(m);
  const owned = [...b.hand, ...b.temp].find((p) => p && m.gd.baseIdOf(p.id) === PACK);
  assert.ok(b.destroy(owned.uid).ok);
  assert.equal(m.itemPool.left(PACK), 1, 'the freed copy is available again');
  checkInvariants(m);
  m.dispose();
});

test('整备 upgrades when the extra golden copy fits, including an uncapped item', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true }).start().toPrep();
  const m = h.m, a = h.ps('p_0');
  const KEY = 'effect:builtin_next_buy_golden_item';
  const uncapped = 'chess_item_2_03_e_a';
  assert.equal(m.itemPool.cap(uncapped), null);
  assert.equal(m.itemPool.left(PACK), 2);
  a.effects.push({ id: 'zb', key: KEY, name: '整备', counter: 1, battle: false });
  a.funds = 50;
  const slot = a.shop.slots.findIndex((s) => s?.kind === 'item');
  assert.ok(slot >= 0);
  a.shop.slots[slot] = { kind: 'item', id: PACK, basePrice: 1, sold: false, frozen: true };
  assert.ok(a.buy(slot).ok);
  const piece = [...a.hand, ...a.temp].find((p) => p && m.gd.baseIdOf(p.id) === PACK);
  assert.ok(piece && m.gd.isGolden(piece.id));
  assert.equal(m.itemPool.held(PACK), 2);
  assert.equal(a.effects.some((e) => e.key === KEY), false, 'the charge is spent');
  a.effects.push({ id: 'zb2', key: KEY, name: '整备', counter: 1, battle: false });
  const slot2 = slot === 0 ? 1 : 0;
  assert.ok(a.shop.slots.length > slot2);
  a.shop.slots[slot2] = { kind: 'item', id: uncapped, basePrice: 1, sold: false, frozen: true };
  assert.ok(a.buy(slot2).ok);
  const free = [...a.hand, ...a.temp].find((p) => p && m.gd.baseIdOf(p.id) === uncapped);
  assert.ok(free && m.gd.isGolden(free.id), 'an uncapped item may still become golden');
  checkInvariants(m);
  m.dispose();
});

test('consumed equipment releases its stock; effect-only items have no shared shop cap', () => {
  const h = makeMatch({ mode: 'solo', seed: 11, fake: true }).start().toPrep();
  const m = h.m, p = h.ps('p_0'), id = [...m.pool.entries.keys()][0], owner = give(m, p, id);
  const item = 'chess_item_1_04_e_a', before = m.itemPool.left(item);
  const piece = p.acquireItem(item); assert.ok(piece); assert.equal(m.itemPool.left(item), before - 1);
  assert.ok(p.equip(piece.uid, owner.uid).ok); assert.equal(p.find(piece.uid), null); assert.equal(m.itemPool.left(item), before);
  assert.equal(m.itemPool.cap('chess_item_2_03_e_a'), null);
  checkInvariants(m); m.dispose();
});

test('Mimic can exceed the pool; excess copies keep stock empty until enough ownership leaves', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11, fake: true }).start().toPrep();
  const m = h.m, p = h.ps('p_0');
  const id = [...m.pool.entries.keys()].find(id => m.gd.tierOf(id) === 6);
  assert.equal(m.pool.cap(id), 5);
  for (let i = 0; i < 5; i++) p.acquireChess(id);
  const target = p.allChess().find(c => c.id === id);
  assert.ok(target); assert.equal(m.pool.left(id), 0);
  const mimic = p.acquireItem('chess_item_5_05_e_a'); assert.ok(mimic);
  assert.ok(p.equip(mimic.uid, target.uid).ok);
  assert.equal(p.allChess().filter(c => m.gd.baseIdOf(c.id) === id).length, 2);
  assert.equal(m.pool.entries.get(id).left, -1);
  assert.equal(m.pool.left(id), 0); checkInvariants(m);
  const elite = p.allChess().find(c => m.gd.baseIdOf(c.id) === id);
  assert.ok(p.sell(elite.uid).ok); assert.equal(m.pool.left(id), 2); checkInvariants(m); m.dispose();
});

test('the equipment a trait produces outright (SERVER_GAIN_EQUIP) holds no shared stock and survives a drained pool', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true }).start().toPrep();
  const m = h.m, a = h.ps('p_0'), b = h.ps('p_1');
  const ITEM = 'chess_item_6_09_e_a'; // 变形同构体, tier Ⅵ, 3 copies — 缪尔赛思 76's <获得时> equipment
  assert.equal(m.itemPool.left(ITEM), 3);
  assert.ok(a.acquireChess('chess_char_6_11_a', { source: 'test' }));
  const made = [...a.hand, ...a.temp].filter((p) => p && p.kind === 'item' && m.gd.baseIdOf(p.id) === ITEM);
  assert.equal(made.length, 1, '缪尔赛思 <获得时> produces one 变形同构体');
  assert.ok(made[0].noPool);
  assert.equal(m.itemPool.held(ITEM), 0, 'the produced copy holds no stock');
  assert.equal(m.itemPool.left(ITEM), 3);
  const x = b.acquireItem(ITEM), y = b.acquireItem(ITEM), z = a.acquireItem(ITEM);
  assert.ok(x && y && z, 'ordinary acquisitions still occupy and drain the pool');
  assert.equal(m.itemPool.left(ITEM), 0);
  assert.ok(b.acquireChess('chess_char_6_11_b', { source: 'test', fromPool: false }));
  const made2 = [...b.hand, ...b.temp].filter((p) => p && p.kind === 'item' && p.noPool && m.gd.baseIdOf(p.id) === ITEM);
  assert.equal(made2.length, 2, 'the elite trait still produces two with the pool drained (no 装备库存不足 refusal)');
  assert.equal(m.itemPool.held(ITEM), 3, 'only the bought copies count');
  assert.ok(a.upgradeItem(made[0]), '整备 of a trait-produced copy needs no second stock copy');
  assert.equal(m.gd.isGolden(made[0].id), true);
  assert.ok(made[0].noPool, 'the marker rides onto the golden');
  assert.equal(m.itemPool.held(ITEM), 3);
  checkInvariants(m);
  m.dispose();
});

test('a golden merged from trait-produced copies stays outside the pool; a mixed merge keeps counting', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true }).start().toPrep();
  const m = h.m, a = h.ps('p_0');
  const RATION = 'chess_item_3_05_e_a'; // 迅捷作战粮, tier Ⅲ, 7 copies, mergeable — 卡涅利安's <获得时> equipment (garrison 49)
  assert.equal(m.itemPool.left(RATION), 7);
  assert.ok(a.acquireItem(RATION, { noPool: true }));
  assert.ok(a.acquireItem(RATION, { noPool: true }));
  const gold = [...a.hand, ...a.temp].find((p) => p && m.gd.isGolden(p.id) && m.gd.baseIdOf(p.id) === RATION);
  assert.ok(gold && gold.noPool, 'two trait-produced copies merge into an exempt golden');
  assert.equal(m.itemPool.held(RATION), 0);
  assert.ok(a.destroy(gold.uid).ok);
  assert.equal(m.itemPool.held(RATION), 0, 'destroying it frees nothing: it never occupied');
  assert.ok(a.acquireItem(RATION));
  assert.equal(m.itemPool.left(RATION), 6);
  assert.ok(a.acquireItem(RATION, { noPool: true }));
  const g2 = [...a.hand, ...a.temp].find((p) => p && m.gd.isGolden(p.id) && m.gd.baseIdOf(p.id) === RATION);
  assert.ok(g2 && !g2.noPool, 'a mixed merge keeps the bought twin\'s occupation');
  assert.equal(m.itemPool.held(RATION), 2);
  checkInvariants(m);
  m.dispose();
});

test('变形者集群 R5 grants the trait-fixed 变形同构体 outside the stock; 马克维茨 R1 商业包装方案 stays stock-bound', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true }).start().toPrep();
  const m = h.m, a = h.ps('p_0'), b = h.ps('p_1');
  const ITEM = 'chess_item_6_09_e_a';
  assert.equal(m.gd.isTraitFixedItem(ITEM), true);
  assert.equal(m.gd.isTraitFixedItem('chess_item_6_09_e_b'), true, 'the golden counts too');
  assert.equal(m.gd.isTraitFixedItem('chess_item_5_07_e_a'), false);
  assert.equal(m.gd.isTraitFixedItem('chess_char_6_11_a'), false, 'a chess id is never a trait-fixed item');
  for (let i = 0; i < 3; i++) assert.ok(b.acquireItem(ITEM));
  assert.equal(m.itemPool.left(ITEM), 0, 'the shop stock is drained');
  a.bandId = 'band_damaztic';
  m.round = 5;
  m.dispatch(a, 'onRoundStart', { round: 5 });
  const made = [...a.hand, ...a.temp].filter((p) => p && m.gd.baseIdOf(p.id) === ITEM);
  assert.equal(made.length, 1, 'the strategy grant survives the drained stock like the trait');
  assert.ok(made[0].noPool && m.itemPool.held(ITEM) === 3, 'and it holds no stock');
  const PACK = 'chess_item_5_07_e_a';
  assert.ok(b.acquireItem(PACK)); assert.ok(b.acquireItem(PACK));
  assert.equal(m.itemPool.left(PACK), 0);
  a.bandId = 'band_malkie';
  m.dispatch(a, 'onRoundStart', { round: 1 });
  assert.equal([...a.hand, ...a.temp].some((p) => p && m.gd.baseIdOf(p.id) === PACK), false, 'an ordinary strategy item stays gated (#466)');
  checkInvariants(m);
  m.dispose();
});
