// GitHub #332 / PR #333 by @2321Robin (the footage of an official 1→2 upgrade: bilibili BV1AXwuzdEys 1:39): a 调度中心
// upgrade opens the new level's extra slots at once but EMPTY — the official shop shows the new slot, draws no card into
// it, and fills it with the next roll (a manual refresh or the round start). The official texts only name the slots: the
// tutorial's 休整期 page 「升级后将出现更多的商品栏位」, PRTS 帮助 「增加刷新栏位」. 0.2.0 drew a card into each new slot instead
// (item 19 of the community report of 2026-10-06, 「升级商店获得新的商店位时用新卡补上，而不是空着」, one uncorroborated remark);
// before that the shop kept its old slot count until the next roll. Either way the upgrade leaves the cards shown where they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';

const ids = (slots) => slots.map((s) => (s ? `${s.kind}:${s.id}${s.sold ? '(sold)' : ''}` : null));
const tierOf = (id) => DATA.chess[id]?.tier ?? 0;

test('a level-up opens the new level\'s operator slot EMPTY; the cards shown stay in place; a refresh fills it', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 7, fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.funds = 200;
  assert.deepEqual(h.m.gd.shopSlots(1), { chess: 3, item: 1 });
  const s1 = ps.shop.slots.slice();
  assert.equal(s1.length, 4);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.levelUp' }), { ok: true });
  // level 2: 4 operator slots + the item slot — the three cards and the item kept (the same objects), the new slot empty
  assert.equal(ps.shop.level, 2);
  assert.deepEqual(ps.shop.layout, { chess: 4, item: 1 });
  assert.equal(ps.shop.slots.length, 5);
  for (let i = 0; i < 3; i++) assert.equal(ps.shop.slots[i], s1[i], `operator card ${i} kept`);
  assert.equal(ps.shop.slots[4], s1[3], 'the item card stays after the operator cards');
  assert.equal(ps.shop.slots[3], null, 'the new slot is open and empty');
  // the player sees it right away (m.private shop)
  assert.deepEqual(ids(ps.privateView().shop.slots), ids(ps.shop.slots));
  // a manual refresh fills every slot at the new level (the empty one included)
  assert.deepEqual(h.m.handle('p_0', { t: 'g.refresh' }), { ok: true });
  assert.equal(ps.shop.slots.length, 5);
  for (const s of ps.shop.slots) assert.ok(s && !s.sold, 'every slot carries a fresh card after the refresh');
  for (const s of ps.shop.slots) if (s.kind === 'chess') assert.ok(tierOf(s.id) >= 1 && tierOf(s.id) <= 2, `drawn at level 2 (tier ${tierOf(s.id)})`);
  // 2 → 3 keeps 4 operator slots: nothing rerolled, nothing added
  const s2 = ps.shop.slots.slice();
  h.m.handle('p_0', { t: 'g.levelUp' });
  assert.equal(ps.shop.level, 3);
  assert.deepEqual(ps.shop.slots, s2, 'no extra slot at level 3, no reroll');
  // 3 → 4: the fifth operator slot, empty again
  h.m.handle('p_0', { t: 'g.levelUp' });
  assert.equal(ps.shop.level, 4);
  assert.deepEqual(ps.shop.layout, { chess: 5, item: 1 });
  for (let i = 0; i < 4; i++) assert.equal(ps.shop.slots[i], s2[i]);
  assert.equal(ps.shop.slots[5], s2[4]);
  assert.equal(ps.shop.slots[4], null, 'the new slot is open and empty');
  h.invariants();
  h.m.dispose();
});

test('a bought card stays sold; the empty new slot has nothing to freeze; the round start fills the shop to the new level', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11, fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.funds = 200;
  assert.deepEqual(h.m.handle('p_0', { t: 'g.buy', slot: 0 }), { ok: true });
  assert.equal(ps.shop.slots[0].sold, true);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.freeze' }), { ok: true });
  h.m.handle('p_0', { t: 'g.levelUp' });
  assert.equal(ps.shop.slots[0].sold, true, 'the bought slot is not refilled');
  assert.equal(ps.shop.slots[3], null, 'the new slot is open and empty — nothing to freeze');
  const keep = ps.shop.slots.filter((s) => s && !s.sold && s.frozen).map((s) => s.id);
  assert.equal(keep.length, 3, 'two operator cards and the item carry the freeze toggle');
  // the round start fills every slot of the new level: frozen cards kept in place, the sold and the empty slot rolled
  h.drive(() => h.m.phase === 'PREP' && h.m.round === 2);
  assert.equal(ps.shop.slots.length, 5);
  for (const s of ps.shop.slots) assert.ok(s, 'the round start leaves no empty slot');
  assert.deepEqual(ps.shop.slots.slice(1).map((s) => s.id).slice(0, 2), keep.slice(0, 2), 'the frozen operator cards kept');
  assert.equal(ps.shop.slots[4].id, keep[2], 'the frozen item kept after the operator slots');
  assert.notEqual(ps.shop.slots[0].id, undefined, 'the sold slot rerolled');
  h.invariants();
  h.m.dispose();
});

test('every mode\'s slot table: a level-up opens exactly the new positions, empty (标准: 3,4,4,4,4,5)', () => {
  for (const [mode, difficulty] of [['solo', 'FUNNY'], ['solo', 'NORMAL'], ['coop', 'FUNNY'], ['coop', 'ABYSS']]) {
    const h = makeMatch({ mode, difficulty, seed: 3, fake: true, humans: 1, bots: mode === 'coop' ? 1 : 0 }).start();
    h.toPrep(1);
    const ps = h.ps('p_0');
    const gd = h.m.gd;
    ps.funds = 500;
    let empty = 0;
    for (let lv = 2; lv <= gd.maxShopLevel; lv++) {
      const before = ps.shop.slots.slice();
      assert.deepEqual(h.m.handle('p_0', { t: 'g.levelUp' }), { ok: true });
      const { chess, item } = gd.shopSlots(lv);
      assert.equal(ps.shop.slots.length, chess + item, `${mode} ${difficulty} L${lv}`);
      const grew = (chess - gd.shopSlots(lv - 1).chess) + (item - gd.shopSlots(lv - 1).item);
      const kept = ps.shop.slots.filter((s) => s && before.includes(s)).length;
      assert.equal(kept, before.filter((s) => s).length, `${mode} ${difficulty} L${lv}: every shown card kept`);
      // the empty positions accumulate: nothing fills them between the upgrades (no refresh / round start here)
      empty += grew;
      assert.equal(ps.shop.slots.filter((s) => !s).length, empty, `${mode} ${difficulty} L${lv}: the new positions are open and empty`);
    }
    // one refresh fills everything at the final level
    assert.deepEqual(h.m.handle('p_0', { t: 'g.refresh' }), { ok: true });
    for (const s of ps.shop.slots) assert.ok(s, `${mode} ${difficulty}: the refresh leaves no empty slot`);
    h.invariants();
    h.m.dispose();
  }
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => new GameData(DATA, 'mode_single_funny').shopSlots(l).chess), [3, 4, 4, 4, 4, 5]);
});
