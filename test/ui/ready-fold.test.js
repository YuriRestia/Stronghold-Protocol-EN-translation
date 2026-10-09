// GitHub #138 (the owner's decision of 2026-10-07: 「点准备后商店自动收起，取消准备时再展开」): pressing 准备就绪 folds the shop
// bar in prep, cancelling the ready unfolds it. The decision is gameLogic readyShopFold(prev, cur) over the own CONFIRMED
// ready state (m.private.ready): only a change inside one prep round counts. The screen's effect applies it
// (screens/game.js; the browser check is test/ui/ready-fold.e2e.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { readyShopFold } = await import('../../public/js/ui/gameLogic.js');

test('readyShopFold: ready folds, cancelling unfolds — inside one prep round', () => {
  assert.equal(readyShopFold({ round: 6, ready: false }, { round: 6, ready: true }), 'fold');
  assert.equal(readyShopFold({ round: 6, ready: true }, { round: 6, ready: false }), 'unfold');
  assert.equal(readyShopFold({ round: 6, ready: false }, { round: 6, ready: false }), null, 'nothing changed');
  assert.equal(readyShopFold({ round: 6, ready: true }, { round: 6, ready: true }), null, 'nothing changed');
  // a truthy / falsy flag counts like a boolean (m.private carries true / false, a missing one is not ready)
  assert.equal(readyShopFold({ round: 6, ready: undefined }, { round: 6, ready: 1 }), 'fold');
  assert.equal(readyShopFold({ round: 6, ready: 1 }, { round: 6, ready: 0 }), 'unfold');
});

test('readyShopFold: the first state seen, a new round\'s reset and anything outside a prep are no press', () => {
  // a reconnect in the middle of a prep (or the prep's start): no state before it
  assert.equal(readyShopFold(null, { round: 6, ready: true }), null);
  assert.equal(readyShopFold(undefined, { round: 6, ready: false }), null);
  // the next round starts not ready (the server resets it): not a 取消准备
  assert.equal(readyShopFold({ round: 6, ready: true }, { round: 7, ready: false }), null);
  assert.equal(readyShopFold({ round: 6, ready: false }, { round: 7, ready: true }), null, 'a new round never reads as a press either');
  // leaving the prep (combat, the draft, the observers): the screen passes null
  assert.equal(readyShopFold({ round: 6, ready: true }, null), null);
  assert.equal(readyShopFold(null, null), null);
  assert.equal(readyShopFold('x', { round: 6, ready: true }), null);
});
