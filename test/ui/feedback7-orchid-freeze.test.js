// test/ui/feedback7-orchid-freeze.test.js — GitHub #354 (DuolaCCCCat): 「梓兰的主动刷新不会触发主动冻结」. 梓兰's 猎头顾问 (band_orchid) makes
// every active refresh a special one: two operators of the same name, and ONE of them frozen — kept to the next prep. The
// server did freeze it (slot.frozen, sent in m.private shop.slots[i].frozen) while the shop toggle stayed off; the shop bar
// drew the frost from the toggle alone, so the player never saw which card was frozen. Each card now reads its own slot.
// The rule itself (a second manual refresh re-rolls the frozen card too, like the toggle) is unchanged.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMatch, DATA } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// the browser data store reads the real data files from disk
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};
const { ChessCard, ItemCard, slotFrozen } = await import('../../public/js/ui/shopBar.js');
const { data } = await import('../../public/js/data.js');
await data.loadAll('items', 'effects', 'choices', 'assets', 'chess', 'bonds', 'garrisons');

/** Every vnode of a preact tree (htm output), depth first. */
function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const iced = (card) => hasClass(card, 'is-frozen') && [...walk(card)].some((n) => hasClass(n, 'scard__ice'));
const bare = (card) => !hasClass(card, 'is-frozen') && ![...walk(card)].some((n) => hasClass(n, 'scard__ice'));

/** A solo match in its first prep with 梓兰's strategy, level 4 shop, funds for a few refreshes. */
function orchid(seed = 12) {
  const h = makeMatch({ mode: 'solo', seed, fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.bandId = 'band_orchid';
  ps.shop.level = 4;
  ps.funds = 50;
  return { h, ps };
}

describe('#354: the card the 猎头顾问 freezes shows its frost', () => {
  test('the wire: the active refresh freezes one copied card and leaves the shop toggle off; the cards read their own slot', () => {
    const { h, ps } = orchid();
    assert.deepEqual(h.m.handle('p_0', { t: 'g.refresh' }), { ok: true });
    const priv = ps.privateView();
    assert.equal(priv.shop.frozen, false, 'the 冻结 toggle is off');
    const chess = priv.shop.slots.filter((s) => s && s.kind === 'chess');
    const frozen = chess.filter((s) => s.frozen);
    assert.equal(frozen.length, 1, 'exactly one card is frozen');
    assert.equal(chess.filter((s) => s.id === frozen[0].id).length, 2, 'one of the two operators of the same name');
    // the bar's frame and the button follow the toggle (off), each card follows its own slot
    for (const s of priv.shop.slots.filter(Boolean)) {
      const props = { slot: s, idx: 0, priv, frozen: slotFrozen(s, priv.shop.frozen), onBuy() {}, onDetail() {} };
      const card = s.kind === 'item' ? ItemCard(props) : ChessCard(props);
      assert.equal(s.frozen ? iced(card) : bare(card), true, `${s.id}: ${s.frozen ? 'frost' : 'no frost'}`);
    }
    h.m.dispose();
  });

  test('the toggle still freezes every unsold card, and the helper reads the slot and the toggle', () => {
    const { h, ps } = orchid(13);
    h.m.handle('p_0', { t: 'g.freeze' });
    const priv = ps.privateView();
    assert.equal(priv.shop.frozen, true);
    assert.ok(priv.shop.slots.filter(Boolean).every((s) => s.frozen), 'every slot copies the toggle');
    assert.equal(slotFrozen(priv.shop.slots[0], priv.shop.frozen), true);
    assert.equal(slotFrozen({ frozen: false }, true), true, 'a frame without per-slot flags: the toggle');
    assert.equal(slotFrozen({ frozen: true }, false), true, 'a slot of its own: its flag');
    assert.equal(slotFrozen({ frozen: false }, false), false);
    assert.equal(slotFrozen(null), false);
    h.m.dispose();
  });

  test('the rule stays as it was: the next manual refresh re-rolls the frozen card too and freezes one of the new pair; one refresh then the next prep keeps that card', () => {
    const { h, ps } = orchid();
    h.m.handle('p_0', { t: 'g.refresh' });
    const first = ps.shop.slots.find((s) => s && s.frozen);
    h.m.handle('p_0', { t: 'g.refresh' });
    const frozenNow = ps.shop.slots.filter((s) => s && s.frozen);
    assert.equal(frozenNow.length, 1, 'again exactly one frozen card');
    assert.equal(ps.shop.frozen, false);
    assert.ok(first && frozenNow[0], 'both refreshes froze a card');
    const kept = frozenNow[0].id;
    h.toPrep(2);
    assert.ok(ps.shop.slots.some((s) => s && s.id === kept), 'the frozen card is still in the shop in the next prep');
    assert.equal(ps.shop.frozen, false);
    h.m.dispose();
  });

  test('ShopBar passes slotFrozen(slot, toggle) to the operator and item cards; the frame and the 冻结 button stay on the toggle', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/ui/shopBar.js'), 'utf8');
    assert.match(src, /<\$\{ChessCard\} key=\$\{`c\$\{i\}:\$\{s\.id\}`\} slot=\$\{s\} idx=\$\{i\} priv=\$\{priv\} frozen=\$\{slotFrozen\(s, frozen\)\}/);
    assert.match(src, /<\$\{ItemCard\} key=\$\{`i\$\{i\}:\$\{s\.id\}`\} slot=\$\{s\} idx=\$\{i\} frozen=\$\{slotFrozen\(s, frozen\)\}/);
    assert.match(src, /const frozen = !!shop\.frozen;/);
    assert.match(src, /cx\('shopbar', frozen && 'is-frozen'/, 'the bar\'s frame is the toggle');
    assert.match(src, /cx\('toolbtn', 'toolbtn--ice', frozen && 'is-on'\)/, 'the button is the toggle');
    assert.ok(DATA.bands.band_orchid, 'the band exists in the data');
  });
});
