// (fork) ui/dynCards.js: the 动态立绘 setting (D7), which art a result / room card shows (D6), and the loading rules
// (D10 / D11) — crew-docs/l2d-art-proposal.md §1, §5. The renderer is a fake here (setDynApi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_WAIT_MS, dynIllustMode, cardAnimates, phoneDevice, illustSkinId, cardArtOf, resultCardArt,
  setDynApi, loadIllust, loadStore, startResultLoad, resultWaitMs, endResultLoad,
} from '../../public/js/ui/dynCards.js';
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

test('settings: dynIllust / resultArt keep known values, junk takes the default', () => {
  assert.equal(sanitizeSettings({ dynIllust: 'mine', resultArt: 'ace' }).dynIllust, 'mine');
  assert.equal(sanitizeSettings({ dynIllust: 'mine', resultArt: 'ace' }).resultArt, 'ace');
  assert.equal(sanitizeSettings({ dynIllust: 'on', resultArt: 7 }).dynIllust, 'auto');
  assert.equal(sanitizeSettings({ dynIllust: 'on', resultArt: 7 }).resultArt, DEFAULT_SETTINGS.resultArt);
  assert.equal(sanitizeSettings(null).resultArt, 'card');
});

test('the illustration a card plays: the worn outfit, else the E2 art', () => {
  assert.equal(illustSkinId('char_1038_whitw2', null), 'char_1038_whitw2#2');
  assert.equal(illustSkinId('char_1038_whitw2', 'char_1038_whitw2@sale#12'), 'char_1038_whitw2@sale#12');
  assert.equal(illustSkinId(null, 'x'), null);
  const choices = (owner) => (owner === 'p1' ? { char_a: 'char_a@x#1' } : {});
  assert.deepEqual(cardArtOf({ charId: 'char_a' }, 'p1', choices), { chess: { charId: 'char_a' }, charId: 'char_a', outfit: 'char_a@x#1', skinId: 'char_a@x#1' });
  assert.equal(cardArtOf({ charId: 'char_a' }, 'p2', choices).skinId, 'char_a#2');
  assert.equal(cardArtOf(null, 'p1', choices), null);
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

function fakeApi({ have = [], ms = {} } = {}) {
  const calls = [];
  const pending = new Map();
  return {
    calls, pending,
    any: () => have.length > 0,
    has: (id) => have.includes(id),
    ready: () => Promise.resolve(),
    load: (id) => { calls.push(id); return new Promise((res, rej) => { pending.set(id, { res, rej }); if (ms[id] === 0) res(); }); },
    mount: () => ({ destroy() {} }),
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test('loading: once per illustration, ready / failed in the store; one this server lacks stays 2D without a request', async () => {
  const api = fakeApi({ have: ['x#2', 'y#2'] });
  setDynApi(api);
  const p1 = loadIllust('x#2'), p2 = loadIllust('x#2');
  assert.equal(p1, p2, 'shared');
  const none = await loadIllust('z#2');
  assert.equal(none, false);
  await flush();
  assert.deepEqual(api.calls, ['x#2'], 'z#2 never requested');
  api.pending.get('x#2').res();
  assert.equal(await p1, true);
  assert.equal(loadStore.get().ready['x#2'], 'ready');
  const py = loadIllust('y#2');
  await flush();
  api.pending.get('y#2').rej(new Error('404'));
  assert.equal(await py, false);
  assert.equal(loadStore.get().ready['y#2'], 'failed');
  setDynApi(null);
});

test('the result screen waits for its cards, at most RESULT_WAIT_MS after the result, and opens once they are ready (D11)', async () => {
  assert.equal(RESULT_WAIT_MS, 3000);
  const api = fakeApi({ have: ['a#2', 'b#2'] });
  setDynApi(api);
  endResultLoad();
  assert.equal(resultWaitMs(1000, 1000), 0, 'no load started: no wait');
  startResultLoad(['a#2', 'b#2', 'a#2', null]);
  await flush();
  const at = 50_000;
  assert.equal(resultWaitMs(at, at), 3000);
  assert.equal(resultWaitMs(at, at + 2000), 1000);
  assert.equal(resultWaitMs(at, at + 3500), 0, 'the cap');
  api.pending.get('a#2').res();
  await flush(); await flush();
  assert.equal(resultWaitMs(at, at + 100), 2900, 'one card still loading');
  api.pending.get('b#2').rej(new Error('slow link'));
  await flush(); await flush();
  assert.equal(resultWaitMs(at, at + 100), 0, 'every card settled: open (a failed card shows its 2D art)');
  endResultLoad();
  setDynApi(null);
});
