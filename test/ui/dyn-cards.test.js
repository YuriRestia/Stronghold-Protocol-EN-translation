// (fork) ui/dynCards.js: the 动态立绘 setting (D7), which art a result / room card shows (D6), and the loading rules
// (D10 / D11) — crew-docs/l2d-art-proposal.md §1, §5. The renderer is a fake of the mount API here
// (docs/design/vfx-format.md §33.19: getDynIllustStage / dynIllustKey), installed with setDynModule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_WAIT_MS, dynIllustMode, cardAnimates, phoneDevice, cardArtOf, resultCardArt, illustKey,
  setDynModule, startResultLoad, resultWaitMs, endResultLoad, releaseIllusts, BACKDROP, backdropStyle, cardTier, HALF_MAX_SCALE,
  FLIP_FADE_S, FLIP_DISSOLVE_S, FLIP_STEP_S, FLIP_SMOOTH_MS, FLIP_SMOOTH_FRAMES, FLIP_GIVE_UP_MS, joinGroup, groupState, leaveGroup, objectPosition,
  FLIP_SWEEP_S, sweepDrive,
} from '../../public/js/ui/dynCards.js';
import { coverUv, edgeOf, sweepRange, GLOW_STYLES, BLOOM, makeSparks, SPARKS } from '../../public/js/ui/cardEntrance.js';

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

// a fake frame clock: requestAnimationFrame callbacks run on tick(ms), the clock moved on by ms
function fakeFrames() {
  const frames = new Map();
  let fid = 0, now = 0;
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (f) => { frames.set(++fid, f); return fid; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  return {
    frames,
    tick: (ms = 16) => { now += ms; const fs = [...frames.values()]; frames.clear(); for (const f of fs) f(now); },
    restore: () => { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf; },
  };
}

test('the room\'s group flip: every card waits for the others, all start hidden in one frame and show together once smooth; a failed one does not hold them; a later one swaps alone', () => {
  const F = fakeFrames();
  try {
    assert.equal(FLIP_FADE_S, 0.15);
    assert.equal(FLIP_DISSOLVE_S, 0.5);
    const starts = [], shows = [];
    const mk = (n) => ({ card: { start: () => starts.push(n) }, show: () => shows.push(n), state: 'loading', alone: false });
    const a = mk('a'), b = mk('b'), c = mk('c');
    for (const e of [a, b, c]) joinGroup(e);
    groupState(a, 'ready'); groupState(b, 'ready'); F.tick(); F.tick();
    assert.deepEqual(starts, [], 'c is still loading: nobody starts');
    groupState(c, 'failed'); F.tick(); F.tick();
    assert.deepEqual(starts, ['a', 'b'], 'all the ready ones in the same frame; the failed one keeps its 2D');
    // the wait's first frame starts its clock; the next interval is the start frame's own and is not counted
    for (let i = 0; i < 1 + FLIP_SMOOTH_FRAMES; i++) F.tick();
    assert.deepEqual(shows, [], `started behind their 2D art: ${FLIP_SMOOTH_FRAMES - 1} smooth frames are not enough`);
    F.tick();
    assert.deepEqual(shows, ['a', 'b'], `${FLIP_SMOOTH_FRAMES} smooth frames in a row: both show in the same frame`);
    const d = mk('d');
    joinGroup(d); F.tick();
    assert.deepEqual(starts, ['a', 'b'], 'joined after the flip: waits for its own ready');
    groupState(d, 'ready');
    assert.deepEqual(starts, ['a', 'b', 'd'], 'and then starts alone');
    groupState(d, 'ready');
    assert.deepEqual(starts, ['a', 'b', 'd'], 'once');
    for (let i = 0; i < 2 + FLIP_SMOOTH_FRAMES; i++) F.tick();
    assert.deepEqual(shows, ['a', 'b', 'd'], 'and shows once its own frames are smooth');
    for (const e of [a, b, c, d]) leaveGroup(e);
    const e2 = mk('e');
    joinGroup(e2); groupState(e2, 'ready'); F.tick(); F.tick();
    assert.deepEqual(starts, ['a', 'b', 'd', 'e'], 'a new screen forms a new group');
    leaveGroup(e2);
    assert.equal(F.frames.size, 0, 'a group with no card left stops waiting');
  } finally { F.restore(); }
});

test('the group shows only after FLIP_SMOOTH_FRAMES smooth frames in a row with its dissolve prepared; a page never smooth keeps its 2D art, later cards too', () => {
  const F = fakeFrames();
  try {
    assert.ok(FLIP_SMOOTH_MS > 1000 / 30 && FLIP_SMOOTH_MS < 35, 'a 30 fps frame with 1 ms of jitter');
    assert.equal(FLIP_SMOOTH_FRAMES, 10);
    assert.equal(FLIP_GIVE_UP_MS, 3000);
    const shows = [], kept = [];
    const mk = (n, extra = {}) => ({ card: { start() {} }, show: () => shows.push(n), giveUp: () => kept.push(n), state: 'loading', alone: false, ...extra });
    // slow first frames, then smooth ones broken by a slow one: the run starts again
    let g = [mk('a'), mk('b', { prepared: false })];
    for (const e of g) joinGroup(e);
    for (const e of g) groupState(e, 'ready');
    F.tick(); F.tick(); F.tick(); // the check frame, the start frame, the wait's first frame
    for (const ms of [75, 62, 54, 46]) F.tick(ms);
    for (let i = 0; i < FLIP_SMOOTH_FRAMES - 1; i++) F.tick(16);
    F.tick(40);
    for (let i = 0; i < FLIP_SMOOTH_FRAMES; i++) F.tick(16);
    assert.deepEqual(shows, [], 'smooth, but b\'s dissolve is not prepared yet');
    g[1].prepared = true;
    F.tick(16);
    assert.deepEqual(shows, ['a', 'b'], 'smooth and prepared: both show in one frame');
    for (const e of g) leaveGroup(e);
    // a page that never gets smooth: FLIP_GIVE_UP_MS after the wait began, the cards keep their 2D art
    shows.length = 0;
    g = [mk('c'), mk('d')];
    for (const e of g) joinGroup(e);
    for (const e of g) groupState(e, 'ready');
    F.tick(); F.tick(); F.tick();
    for (let t = 0; t + 60 < FLIP_GIVE_UP_MS; t += 60) F.tick(60);
    assert.deepEqual(kept, []);
    F.tick(60);
    assert.deepEqual(kept, ['c', 'd']);
    assert.deepEqual(shows, [], 'never shown');
    // a card that comes later on that page keeps its 2D art without starting
    let started = false;
    const e = mk('e', { card: { start() { started = true; } } });
    joinGroup(e); groupState(e, 'ready');
    assert.deepEqual(kept, ['c', 'd', 'e']);
    assert.equal(started, false);
    for (const x of [...g, e]) leaveGroup(x);
    assert.equal(F.frames.size, 0);
  } finally { F.restore(); }
});

test('with the cards drawn in Workers, the group also waits for every Worker\'s card frames to run smooth', async () => {
  const F = fakeFrames();
  let logs = [[], []];
  setDynModule({ getDynIllustStage: () => ({ workers: [1, 2], frames() {}, frameLog: () => Promise.resolve(logs) }), dynIllustKey: () => null });
  try {
    const shows = [];
    const e = { card: { start() {} }, show: () => shows.push('a'), state: 'loading', alone: false };
    joinGroup(e); groupState(e, 'ready');
    const tick = async () => { F.tick(16); await Promise.resolve(); await Promise.resolve(); };
    // [start ms, frame ms, live slots] per Worker: the first at 60 fps, the second at 25 fps
    const run = (n, dt) => Array.from({ length: n }, (_, i) => [i * dt, 5, 1]);
    for (let i = 0; i < 60; i++) { logs = [run(16, 16), run(8, 40)]; await tick(); }
    assert.deepEqual(shows, [], 'the main thread is smooth, but a Worker at 25 fps holds the group');
    for (let i = 0; i < 40; i++) { logs = [run(16, 16), run(16, 16)]; await tick(); }
    assert.deepEqual(shows, ['a'], 'every Worker smooth: it shows');
    leaveGroup(e);
  } finally { F.restore(); setDynModule(null); }
});

test('the group shows one card after another in page order, the result row\'s step apart', () => {
  const F = fakeFrames();
  try {
    assert.equal(FLIP_STEP_S, 0.083);
    const shown = [];
    // page order by a fake compareDocumentPosition: a lower index comes first (FOLLOWING = 4)
    const el = (i) => ({ i, compareDocumentPosition: (o) => (o.i > i ? 4 : 2) });
    const mk = (n, i) => ({ card: { start() {} }, show: (d) => shown.push([n, Math.round(d)]), state: 'loading', alone: false, el: el(i) });
    const g = [mk('c', 2), mk('a', 0), mk('b', 1)];
    for (const e of g) joinGroup(e);
    for (const e of g) groupState(e, 'ready');
    for (let i = 0; i < 4 + FLIP_SMOOTH_FRAMES; i++) F.tick();
    assert.deepEqual(shown, [['a', 0], ['b', 83], ['c', 166]]);
    for (const e of g) leaveGroup(e);
  } finally { F.restore(); }
});

test('the dissolve\'s crop is the 2D art\'s object-fit: cover at its object-position', () => {
  assert.deepEqual(objectPosition('50% 12%'), [0.5, 0.12]);
  assert.deepEqual(objectPosition('50%'), [0.5, 0.5]);
  assert.deepEqual(objectPosition('10px 20px'), [0.5, 0.5]);
  // a 100 × 200 picture in a 100 × 100 box: the width fits, the height is cropped; at 12 % the crop starts 12 % down the spare
  const uv = coverUv(100, 200, 100, 100, 0.5, 0.12);
  assert.ok(Math.abs(uv.u0) < 1e-9 && Math.abs(uv.u1 - 1) < 1e-9, JSON.stringify(uv));
  assert.ok(Math.abs(uv.t0 - 0.06) < 1e-9 && Math.abs(uv.t1 - 0.56) < 1e-9, JSON.stringify(uv));
  // a wide picture: the height fits, the sides are cropped evenly at 50 %
  const w = coverUv(200, 100, 100, 100, 0.5, 0.5);
  assert.ok(Math.abs(w.u0 - 0.25) < 1e-9 && Math.abs(w.u1 - 0.75) < 1e-9 && Math.abs(w.t0) < 1e-9 && Math.abs(w.t1 - 1) < 1e-9, JSON.stringify(w));
});

test('the border\'s sweep: the user\'s 0.35 s, the whole of it the line crossing the card, ending with the picture gone', () => {
  assert.equal(FLIP_SWEEP_S, 0.35);
  for (const key of Object.keys(GLOW_STYLES)) {
    const S = GLOW_STYLES[key], reach = S.reach ?? BLOOM.width;
    const [a, b] = sweepRange(S);
    assert.equal(sweepDrive(0, S), a, key);
    assert.equal(sweepDrive(-1, S), a, key);
    assert.equal(sweepDrive(FLIP_SWEEP_S, S), 1, key);
    // the band's leading side reaches the card (mask 0) at the start and leaves it (mask 1) at the end
    assert.ok(Math.abs(edgeOf(a, S) + reach) < 1e-9 && Math.abs(edgeOf(b, S) - 1 - reach) < 1e-9, key);
    for (let s = 0; s + FLIP_SWEEP_S / 20 < FLIP_SWEEP_S; s += FLIP_SWEEP_S / 20) assert.ok(sweepDrive(s + FLIP_SWEEP_S / 20, S) > sweepDrive(s, S), key);
  }
});

test('the glitter: mostly falling, some thrown out of the sides, short-lived and few', () => {
  const sp = makeSparks();
  // no mask loaded in Node: no births, and stepping an empty list is harmless
  sp.step(0.016, 0.5, true, { left: 100, top: 50, width: 200, height: 300 });
  assert.equal(sp.count, 0);
  assert.ok(SPARKS.gravity > 0 && SPARKS.max > 0);
  assert.ok(SPARKS.sideShare > 0 && SPARKS.sideShare < 0.5, 'mostly the shower (B), a bit of the side throw (A)');
  assert.ok(SPARKS.life[1] < 0.9 && SPARKS.max <= 60, 'dies fast and spawns little (the user, 2026-11-23)');
});
