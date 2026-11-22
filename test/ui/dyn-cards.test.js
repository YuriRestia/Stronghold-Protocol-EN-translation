// (fork) ui/dynCards.js: the 动态立绘 setting (D7), which art a result / room card shows (D6), and the loading rules
// (D10 / D11) — crew-docs/l2d-art-proposal.md §1, §5. The renderer is a fake of the contract's mount API here
// (docs/design/vfx-format.md §33.19), installed with setDynModule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_WAIT_MS, dynIllustMode, cardAnimates, phoneDevice, cardArtOf, resultCardArt, illustKey,
  setDynModule, startResultLoad, resultWaitMs, endResultLoad,
} from '../../public/js/ui/dynCards.js';
import * as stub from '../../public/js/ui/dynStub.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../../public/js/ui/gameLogic/settings.js';
import { cardContext } from '../../public/js/ui/seatArt.js';

test('动态立绘: auto is Mine Only on a phone and Everyone elsewhere; Off / Mine / Everyone as set (D7)', () => {
  assert.equal(DEFAULT_SETTINGS.dynIllust, 'auto');
  assert.equal(dynIllustMode('auto', true), 'mine');
  assert.equal(dynIllustMode('auto', false), 'all');
  assert.equal(dynIllustMode(undefined, false), 'all');
  for (const v of ['off', 'mine', 'all']) { assert.equal(dynIllustMode(v, true), v); assert.equal(dynIllustMode(v, false), v); }
  assert.equal(phoneDevice(true, 390), true);
  assert.equal(phoneDevice(true, 820), false, 'a tablet is no phone');
  assert.equal(phoneDevice(false, 390), false);
  assert.equal(phoneDevice(true, 0), false, 'unknown screen');
});

test('which cards animate: every card on Everyone, one\'s own on Mine Only, none on Off (spec §5.2)', () => {
  assert.deepEqual([cardAnimates('all', true), cardAnimates('all', false)], [true, true]);
  assert.deepEqual([cardAnimates('mine', true), cardAnimates('mine', false)], [true, false]);
  assert.deepEqual([cardAnimates('off', true), cardAnimates('off', false)], [false, false]);
});

test('settings: dynIllust / resultArt keep known values, junk takes the default (room card, the user\'s D6 default)', () => {
  assert.equal(sanitizeSettings({ dynIllust: 'mine', resultArt: 'ace' }).dynIllust, 'mine');
  assert.equal(sanitizeSettings({ dynIllust: 'mine', resultArt: 'ace' }).resultArt, 'ace');
  assert.equal(sanitizeSettings({ dynIllust: 'on', resultArt: 7 }).dynIllust, 'auto');
  assert.equal(sanitizeSettings({ dynIllust: 'on', resultArt: 7 }).resultArt, 'card');
  assert.equal(sanitizeSettings(null).resultArt, 'card');
});

test('a card\'s art: the operator and the owner\'s outfit for it; the key through the renderer\'s dynIllustKey', () => {
  const choices = (owner) => (owner === 'p1' ? { char_a: 'char_a@x#1' } : {});
  assert.deepEqual(cardArtOf({ charId: 'char_a' }, 'p1', choices), { chess: { charId: 'char_a' }, charId: 'char_a', outfit: 'char_a@x#1' });
  assert.equal(cardArtOf({ charId: 'char_a' }, 'p2', choices).outfit, null);
  assert.equal(cardArtOf(null, 'p1', choices), null);
  const asked = [];
  setDynModule({ ...stub, dynIllustKey: (c, s) => { asked.push([c, s]); return c === 'char_a' ? `k_${s || 'e2'}` : null; } });
  assert.equal(illustKey({ charId: 'char_a', outfit: 'char_a@x#1' }), 'k_char_a@x#1');
  assert.equal(illustKey({ charId: 'char_a', outfit: null }), 'k_e2', 'no outfit: the contract\'s null');
  assert.equal(illustKey({ charId: 'char_b', outfit: null }), null, 'none on this server: 2D');
  assert.equal(illustKey(null), null);
  assert.deepEqual(asked, [['char_a', 'char_a@x#1'], ['char_a', null], ['char_b', null]]);
  setDynModule(null);
});

test('the stand-in renderer: keys from the dynillust group, every Card stays 2D', async () => {
  assert.equal(stub.dynIllustKey('char_a', null), null, 'no local manifest: none');
  const st = stub.createDynIllustStage({ parent: null, quality: 'full' });
  await st.preload(['x']);
  const card = st.mount(null, 'x');
  assert.equal(await card.ready, false);
  card.start(); card.unmount();
  assert.equal(card.state, 'unmounted');
});

test('结算卡片立绘 (D6): the room card, or the ace; an AI seat (no room card) shows its ace either way', () => {
  const a = { chessId: 'a', charId: 'char_a', tier: 6 }, b = { chessId: 'b', charId: 'char_b', tier: 5 };
  const ctx = cardContext([a, b]);
  const none = () => ({});
  const seat = { playerId: 'p1', card: 'char_b' };
  const o = { aceChess: a, seat, ctx, choices: none };
  assert.equal(resultCardArt('card', { playerId: 'p1' }, o).charId, 'char_b', 'the picked room card');
  assert.equal(resultCardArt('ace', { playerId: 'p1' }, o).charId, 'char_a', 'the ace');
  assert.equal(resultCardArt('card', { playerId: 'bot', isBot: true }, { ...o, seat: { playerId: 'bot', isBot: true } }).charId, 'char_a');
  assert.equal(resultCardArt('card', { playerId: 'me' }, { ...o, seat: { playerId: 'me' }, myId: 'me', myCard: 'char_a' }).charId, 'char_a', 'one\'s own pick at once');
  assert.equal(resultCardArt('ace', { playerId: 'p1' }, { ...o, aceChess: null }), null, 'no lineup: no art');
});

/** A fake renderer module with the contract's API; `stages` records what was built, preloaded and destroyed. */
function fakeModule(have) {
  const stages = [];
  return {
    stages,
    dynIllustKey: (charId) => (have.includes(charId) ? `k_${charId}` : null),
    createDynIllustStage(o) {
      const st = { o, preloads: [], destroyed: false, settle: null };
      stages.push(st);
      return {
        preload: (keys) => new Promise((res, rej) => { st.preloads.push(keys); st.settle = { res, rej }; }),
        mount: () => ({ ready: Promise.resolve(true), state: 'ready', start() {}, unmount() {} }),
        destroy: () => { st.destroyed = true; },
      };
    },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const noIndex = () => Promise.resolve(); // the fake's keys need no data/local-assets.json
const settled = async () => { for (let i = 0; i < 5; i++) await flush(); };

test('the result screen waits for its cards, at most RESULT_WAIT_MS after the result, and opens once they are in (D11)', async () => {
  assert.equal(RESULT_WAIT_MS, 3000);
  const fake = fakeModule(['char_a', 'char_b']);
  setDynModule(fake);
  endResultLoad();
  assert.equal(resultWaitMs(1000, 1000), 0, 'no load started: no wait');
  startResultLoad(() => [{ charId: 'char_a', outfit: null }, { charId: 'char_b', outfit: null }, { charId: 'char_c', outfit: null }], { index: noIndex });
  await settled();
  assert.equal(fake.stages.length, 1, 'one Stage');
  assert.deepEqual(fake.stages[0].preloads, [['k_char_a', 'k_char_b']], 'the cards this server has, once each');
  const at = 50_000;
  assert.equal(resultWaitMs(at, at), 3000);
  assert.equal(resultWaitMs(at, at + 2000), 1000);
  assert.equal(resultWaitMs(at, at + 3500), 0, 'the cap');
  fake.stages[0].settle.res();
  await settled();
  assert.equal(resultWaitMs(at, at + 100), 0, 'every card in (or failed): open');
  endResultLoad();
  await settled();
  assert.equal(fake.stages[0].destroyed, true, 'nobody holds the Stage: it goes');
  setDynModule(null);
});

test('a failed preload opens the result screen too (the cards keep their 2D art)', async () => {
  const fake = fakeModule(['char_a']);
  setDynModule(fake);
  startResultLoad(() => [{ charId: 'char_a', outfit: null }], { index: noIndex });
  await settled();
  assert.ok(resultWaitMs(1, 1) > 0);
  fake.stages[0].settle.rej(new Error('slow link'));
  await settled();
  assert.equal(resultWaitMs(1, 2), 0);
  endResultLoad();
  setDynModule(null);
});
