// (fork) ui/dynCards.js: the 动态立绘 setting (D7), which art a result / room card shows (D6), and the loading rules
// (D10 / D11) — crew-docs/l2d-art-proposal.md §1, §5. The renderer is a fake of the mount API here
// (docs/design/vfx-format.md §33.19: getDynIllustStage / dynIllustKey), installed with setDynModule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_WAIT_MS, dynIllustMode, cardAnimates, phoneDevice, cardArtOf, resultCardArt, illustKey,
  setDynModule, startResultLoad, resultWaitMs, endResultLoad, releaseIllusts, BACKDROP, backdropStyle, cardTier, HALF_MAX_SCALE,
  FLIP_FADE_S, FLIP_SMOOTH_MS, FLIP_HOLD_MAX_MS, joinGroup, groupState, leaveGroup,
} from '../../public/js/ui/dynCards.js';

test('the tier by card size: half up to one device px per official unit of the 232 × 458 window, full above', () => {
  assert.equal(HALF_MAX_SCALE, 1);
  // measured windows (work/dev-52 tierdata): the room card at 1280×720 and 1366×768, the result card at 1920×1080
  assert.equal(cardTier(223, 435, 1), 'half');
  assert.equal(cardTier(238, 465, 1), 'full', '1.01 px a unit');
  assert.equal(cardTier(347, 540, 1), 'full');
  // the Grand Alliance card at 1546×905 (272 × 249 CSS px at 1.5): its height decides — 374 / 458 = 0.82
  assert.equal(cardTier(272, 249, 1.5), 'half');
  // the renderer draws at most at 2× (MAX_DPR): a phone at 3× counts as 2×
  assert.equal(cardTier(116, 229, 3), 'half');
  assert.equal(cardTier(0, 300, 1), null, 'not laid out yet');
});

test('the backdrop: the official card background around group_char\'s window, as the prefab places them', () => {
  assert.deepEqual(BACKDROP.bg, { pos: [0, -13], size: [300, 528] });
  assert.deepEqual(BACKDROP.win, { pos: [0, -14], size: [232, 458] });
  const s = backdropStyle('/x.png');
  // the background starts 34 units left of the window and 36 above it; 300 / 232 wide, 528 / 458 tall
  assert.match(s, /left:-14\.655%;top:-7\.860%;width:129\.310%;height:115\.284%;/);
  // the 9-slice borders 212 / 78 / 43 / 75 in units of the window's width (232 = 100cqw)
  assert.match(s, /border-width:91\.379cqw 33\.621cqw 18\.534cqw 32\.328cqw;/);
  assert.match(s, /border-image:url\("\/x\.png"\) 212 78 43 75 fill/);
});
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
  const R = { dynIllustKey: (c, s) => { asked.push([c, s]); return c === 'char_a' ? `k_${s || 'e2'}` : null; } };
  assert.equal(illustKey(R, { charId: 'char_a', outfit: 'char_a@x#1' }), 'k_char_a@x#1');
  assert.equal(illustKey(R, { charId: 'char_a', outfit: null }), 'k_e2', 'no outfit: the contract\'s null (the E2 art)');
  assert.equal(illustKey(R, { charId: 'char_b', outfit: null }), null, 'none on this server: 2D');
  assert.equal(illustKey(R, null), null);
  assert.deepEqual(asked, [['char_a', 'char_a@x#1'], ['char_a', null], ['char_b', null]]);
});

test('the stand-in renderer: no key, every Card stays 2D', async () => {
  assert.equal(stub.dynIllustKey('char_a', null), null);
  const st = stub.getDynIllustStage();
  await st.index(); await st.preload(['x']);
  const card = st.mount('x');
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

/** A fake renderer module with the mount API; `st` records the quality, preloads and releases. */
function fakeModule(have) {
  const st = { quality: null, preloads: [], releases: [], settle: null,
    index: () => Promise.resolve({}),
    preload(keys) { this.preloads.push(keys); return new Promise((res, rej) => { st.settle = { res, rej }; }); },
    release(keep) { this.releases.push(keep); },
    mount: () => ({ canvas: null, ready: Promise.resolve(true), state: 'ready', start() {}, unmount() {} }) };
  return { st, getDynIllustStage: () => st, dynIllustKey: (charId) => (have.includes(charId) ? `k_${charId}` : null) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const settled = async () => { for (let i = 0; i < 5; i++) await flush(); };
const card = (charId, mine = false) => ({ art: { charId, outfit: null }, mine });

test('the result screen waits for its cards (own card first), at most RESULT_WAIT_MS after the result, and opens once they are in (D11)', async () => {
  assert.equal(RESULT_WAIT_MS, 3000);
  const fake = fakeModule(['char_a', 'char_b']);
  setDynModule(fake);
  endResultLoad();
  assert.equal(resultWaitMs(1000, 1000), 0, 'no load started: no wait');
  startResultLoad(() => [card('char_a'), card('char_b', true), card('char_c')]);
  await settled();
  assert.deepEqual(fake.st.preloads, [['k_char_b', 'k_char_a']], 'the cards this server has, once each, one\'s own first');
  assert.equal(fake.st.quality, 'full', 'a desktop: full pages');
  const at = 50_000;
  assert.equal(resultWaitMs(at, at), 3000);
  assert.equal(resultWaitMs(at, at + 2000), 1000);
  assert.equal(resultWaitMs(at, at + 3500), 0, 'the cap');
  fake.st.settle.res();
  await settled();
  assert.equal(resultWaitMs(at, at + 100), 0, 'every card in (or failed): open');
  releaseIllusts();
  assert.deepEqual(fake.st.releases, [[]], 'the match starts: everything no card shows is freed');
  endResultLoad();
  setDynModule(null);
});

test('a failed preload opens the result screen too (the cards keep their 2D art)', async () => {
  const fake = fakeModule(['char_a']);
  setDynModule(fake);
  startResultLoad(() => [card('char_a')]);
  await settled();
  assert.ok(resultWaitMs(1, 1) > 0);
  fake.st.settle.rej(new Error('slow link'));
  await settled();
  assert.equal(resultWaitMs(1, 2), 0);
  endResultLoad();
  setDynModule(null);
});

test('the room\'s group flip: every card waits for the others, then all start in one frame; a failed one does not hold them; a later one swaps alone', () => {
  const frames = new Map();
  let fid = 0;
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (f) => { frames.set(++fid, f); return fid; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  let now = 0;
  const tick = (ms = 16) => { now += ms; const fs = [...frames.values()]; frames.clear(); for (const f of fs) f(now); };
  try {
    assert.equal(FLIP_FADE_S, 0.15);
    const starts = [], shows = [];
    const mk = (n) => ({ card: { start: () => starts.push(n) }, show: () => shows.push(n), state: 'loading', alone: false });
    const a = mk('a'), b = mk('b'), c = mk('c');
    for (const e of [a, b, c]) joinGroup(e);
    groupState(a, 'ready'); groupState(b, 'ready'); tick(); tick();
    assert.deepEqual(starts, [], 'c is still loading: nobody starts');
    groupState(c, 'failed'); tick(); tick();
    assert.deepEqual(starts, ['a', 'b'], 'all the ready ones in the same frame; the failed one keeps its 2D');
    assert.deepEqual(shows, [], 'started behind their 2D art');
    tick(); tick();
    assert.deepEqual(shows, [], 'the first frame after the start is not measured: one smooth frame is not two');
    tick();
    assert.deepEqual(shows, ['a', 'b'], 'two smooth frames in a row: both show in the same frame');
    const d = mk('d');
    joinGroup(d); tick();
    assert.deepEqual(starts, ['a', 'b'], 'joined after the flip: waits for its own ready');
    groupState(d, 'ready');
    assert.deepEqual(starts, ['a', 'b', 'd'], 'and then swaps alone');
    assert.deepEqual(shows, ['a', 'b', 'd'], 'shown as it starts');
    for (const e of [a, b, c, d]) leaveGroup(e);
    const e2 = mk('e');
    joinGroup(e2); groupState(e2, 'ready'); tick(); tick();
    assert.deepEqual(starts, ['a', 'b', 'd', 'e'], 'a new screen forms a new group');
    leaveGroup(e2);
    assert.equal(frames.size, 0, 'a group with no card left stops waiting');
  } finally { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf; }
});

test('the group shows once two frames in a row are smooth after its slow first ones, at most FLIP_HOLD_MAX_MS after the start', () => {
  const frames = new Map();
  let fid = 0;
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (f) => { frames.set(++fid, f); return fid; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  let now = 0;
  const tick = (ms) => { now += ms; const fs = [...frames.values()]; frames.clear(); for (const f of fs) f(now); };
  try {
    assert.ok(FLIP_SMOOTH_MS > 1000 / 30 && FLIP_SMOOTH_MS < 35, 'a 30 fps frame with 1 ms of jitter');
    assert.equal(FLIP_HOLD_MAX_MS, 500);
    const shows = [];
    const mk = (n) => ({ card: { start() {} }, show: () => shows.push(n), state: 'loading', alone: false });
    // the trace's pattern: 75, 62, 54, 46, 37 ms, then smooth; one smooth frame between slow ones does not count
    let g = [mk('a'), mk('b')];
    for (const e of g) joinGroup(e);
    for (const e of g) groupState(e, 'ready');
    tick(16); tick(16); // the check frame, then the start frame
    for (const ms of [75, 62, 30, 54, 46, 37]) { tick(ms); assert.deepEqual(shows, [], `still slow (${ms} ms)`); }
    tick(33.4);
    assert.deepEqual(shows, [], 'one smooth frame');
    tick(29);
    assert.deepEqual(shows, ['a', 'b'], 'two in a row');
    for (const e of g) leaveGroup(e);
    // a PC whose frames stay slow shows the group FLIP_HOLD_MAX_MS after the start
    shows.length = 0;
    g = [mk('c'), mk('d')];
    for (const e of g) joinGroup(e);
    for (const e of g) groupState(e, 'ready');
    tick(16); tick(16);
    for (let t = 0; t + 60 < FLIP_HOLD_MAX_MS; t += 60) tick(60);
    assert.deepEqual(shows, []);
    tick(60);
    assert.deepEqual(shows, ['c', 'd']);
    for (const e of g) leaveGroup(e);
  } finally { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf; }
});
