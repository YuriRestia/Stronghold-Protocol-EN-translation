// (fork) ui/dynCards.js: the 动态立绘 setting (D7), which art a result / room card shows (D6), and the loading rules
// (D10 / D11) — crew-docs/l2d-art-proposal.md §1, §5. The renderer is a fake of the mount API here
// (docs/design/vfx-format.md §33.19: getDynIllustStage / dynIllustKey), installed with setDynModule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_GIVE_UP_MS, resultKeyReady, dynIllustMode, cardAnimates, phoneDevice, cardArtOf, resultCardArt, illustKey,
  setDynModule, startResultLoad, resultWaitMs, endResultLoad, releaseIllusts, BACKDROP, backdropStyle, cardTier, HALF_MAX_SCALE,
  FLIP_FADE_S, FLIP_DISSOLVE_S, FLIP_STEP_S, FLIP_SMOOTH_MS, FLIP_SMOOTH_FRAMES, FLIP_GIVE_UP_MS, joinGroup, groupState, leaveGroup, objectPosition,
  FLIP_SWEEP_S, sweepDrive, dynTierStore, setDynQuality,
} from '../../public/js/ui/dynCards.js';
import { settingsStore } from '../../public/js/ui/settingsStore.js';
import { coverUv, edgeOf, sweepRange, GLOW, BLOOM } from '../../public/js/ui/cardEntrance.js';

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
  const s = backdropStyle('/x.png', 464);
  // the background starts 34 units left of the window and 36 above it; 300 / 232 wide, 528 / 458 tall
  assert.match(s, /left:-14\.655%;top:-7\.860%;width:129\.310%;height:115\.284%;/);
  // the 9-slice borders 212 / 78 / 43 / 75 in units of the window's measured width (a 464 px window: 2 px a unit; no
  // container query units, client-static.test.js)
  assert.match(s, /border-width:424\.00px 156\.00px 86\.00px 150\.00px;/);
  assert.match(s, /border-image:url\("\/x\.png"\) 212 78 43 75 fill/);
});
import * as stub from '../../public/js/ui/dynStub.js';
import { sanitizeSettings, DEFAULT_SETTINGS, DYN_QUALITY_SETTING } from '../../public/js/ui/gameLogic/settings.js';
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

/** A fake renderer module with the mount API; `st` records the quality, preloads (one settle each) and releases. */
function fakeModule(have) {
  const st = { quality: null, preloads: [], releases: [], settles: [],
    index: () => Promise.resolve({}),
    preload(keys) { this.preloads.push(keys); return new Promise((res, rej) => { st.settles.push({ res, rej }); }); },
    release(keep) { this.releases.push(keep); },
    mount: () => ({ canvas: null, ready: Promise.resolve(true), state: 'ready', start() {}, unmount() {} }) };
  return { st, getDynIllustStage: () => st, dynIllustKey: (charId) => (have.includes(charId) ? `k_${charId}` : null) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const settled = async () => { for (let i = 0; i < 5; i++) await flush(); };
const card = (charId, mine = false) => ({ art: { charId, outfit: null }, mine });

test('the result screen waits behind its cover for its cards (own card first) until the give-up after `ending`, and opens once they are in', async () => {
  const fake = fakeModule(['char_a', 'char_b']);
  setDynModule(fake);
  endResultLoad();
  assert.equal(resultWaitMs(), 0, 'no load started: no wait');
  const t0 = Date.now();
  startResultLoad(() => [card('char_a'), card('char_b', true), card('char_c')]);
  const t1 = Date.now(); // the load started between t0 and t1
  await settled();
  assert.deepEqual(fake.st.preloads, [['k_char_b'], ['k_char_a']], 'the cards this server has, once each, one\'s own first, one key a preload');
  assert.equal(fake.st.quality, 'full', 'a desktop: full pages');
  // the wait runs to RESULT_GIVE_UP_MS after `ending` (the load's start), not from the result's arrival
  const w = resultWaitMs(t1);
  assert.ok(w <= RESULT_GIVE_UP_MS && w >= RESULT_GIVE_UP_MS - (t1 - t0), `${w} ms left at the load's start`);
  assert.equal(resultWaitMs(t1 + RESULT_GIVE_UP_MS), 0, 'the give-up');
  fake.st.settles[0].res();
  await settled();
  assert.ok(resultWaitMs() > 0, 'one card still loading: still covered');
  fake.st.settles[1].res();
  await settled();
  assert.equal(resultWaitMs(), 0, 'every card in (or failed): open');
  assert.ok(resultKeyReady('k_char_a') && resultKeyReady('k_char_x'), 'no give-up: every card may play');
  releaseIllusts();
  assert.deepEqual(fake.st.releases, [[]], 'the match starts: everything no card shows is freed');
  endResultLoad();
  setDynModule(null);
});

test('at the give-up the result screen opens and the cards still loading keep their 2D art (mock timers)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const fake = fakeModule(['char_a', 'char_b']);
  setDynModule(fake);
  try {
    startResultLoad(() => [card('char_a', true), card('char_b')]);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => { setImmediate(r); });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(fake.st.preloads.length, 2);
    fake.st.settles[0].res();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.ok(resultWaitMs() > 0);
    t.mock.timers.tick(RESULT_GIVE_UP_MS);
    assert.equal(resultWaitMs(), 0, 'given up: open');
    assert.equal(resultKeyReady('k_char_a'), true, 'in by the give-up: plays');
    assert.equal(resultKeyReady('k_char_b'), false, 'still loading: its 2D art');
  } finally { endResultLoad(); setDynModule(null); }
});

test('at the deadline a card still loading keeps its 2D art even before the give-up timer has run', async () => {
  const fake = fakeModule(['char_a', 'char_b']);
  setDynModule(fake);
  try {
    const t0 = Date.now();
    startResultLoad(() => [card('char_a', true), card('char_b')]);
    await settled();
    fake.st.settles[0].res();
    await settled();
    const at = t0 + RESULT_GIVE_UP_MS + 50; // past the deadline; the real give-up timer has not run
    assert.equal(resultWaitMs(at), 0, 'the cover lets the result screen open');
    assert.equal(resultKeyReady('k_char_b', at), false, 'so the card still loading keeps its 2D art, never loads on the open screen');
    assert.equal(resultKeyReady('k_char_a', at), true, 'one in by then plays');
  } finally { endResultLoad(); setDynModule(null); }
});

test('a hung renderer never holds the black cover past the give-up from `ending`: the pages\' gates get what is left of the same budget', async (t) => {
  const { makeEntranceGate, gateWaitStore, RESULT_FIRST_FRAMES_MS } = await import('../../public/js/ui/dynCards.js');
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => { setImmediate(r); });
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  // the cover is down once the load's wait is over and no page's gate waits (screens/settle.js useResultHold)
  const n0 = gateWaitStore.get().n;
  const covered = () => resultWaitMs() > 0 || gateWaitStore.get().n > n0;
  const fake = fakeModule(['char_a', 'char_b']);
  setDynModule(fake);
  try {
    // the cards load in 2 s; the result screen mounts after the 3 s pause; one card's renderer never gets live
    startResultLoad(() => [card('char_a', true), card('char_b')]);
    await flush();
    t.mock.timers.tick(2000);
    fake.st.settles[0].res(); fake.st.settles[1].res();
    await flush();
    assert.equal(resultWaitMs(), 0, 'all loaded: the load holds nothing');
    t.mock.timers.tick(1000);
    const g = makeEntranceGate();
    assert.equal(g.budget, RESULT_GIVE_UP_MS - 3000, 'the gate gets what is left of the 8 s from `ending`, not 8 s of its own');
    const lost = [];
    g.join({}, () => lost.push('hung')); g.open();
    assert.ok(covered(), 'its card is not live yet: the cover waits');
    t.mock.timers.tick(RESULT_GIVE_UP_MS - 3000 - 1); await flush();
    assert.ok(covered(), 'still inside the 8 s');
    t.mock.timers.tick(1); await flush();
    assert.ok(!covered(), `${RESULT_GIVE_UP_MS} ms after \`ending\`: the cover goes (it was about twice that)`);
    assert.deepEqual(lost, ['hung'], 'the hung card keeps its 2D art');
    g.dispose();
    endResultLoad();
    // a load that runs into the give-up: the page mounts then, and its loaded cards still get the floor for their first frames
    startResultLoad(() => [card('char_a', true), card('char_b')]);
    await flush();
    fake.st.settles[2].res();
    await flush();
    t.mock.timers.tick(RESULT_GIVE_UP_MS); await flush();
    assert.equal(resultWaitMs(), 0, 'the give-up: the result screen mounts');
    const h = makeEntranceGate();
    assert.equal(h.budget, RESULT_FIRST_FRAMES_MS, 'nothing left of the 8 s: the floor');
    h.join({}, () => lost.push('hung2')); h.open();
    t.mock.timers.tick(RESULT_FIRST_FRAMES_MS); await flush();
    assert.ok(!covered(), `at most ${RESULT_GIVE_UP_MS + RESULT_FIRST_FRAMES_MS} ms after \`ending\``);
    assert.deepEqual(lost, ['hung', 'hung2']);
    h.dispose();
  } finally { endResultLoad(); setDynModule(null); }
});

test('follow-up A: the result cards\' illustrations are kept through the match, one\'s own first, within the GPU cap', async () => {
  const { pickKept, keptGpuBytes, KEEP_CAP_MB } = await import('../../public/js/ui/dynCards.js');
  const MB = 1048576;
  // an index figure wins; else the download size times the measured bound; no entry: never kept
  assert.equal(keptGpuBytes({ gpu: 40 * MB, bytes: 1 }, 'full'), 40 * MB);
  assert.equal(keptGpuBytes({ gpuHalf: 10 * MB, bytesHalf: 1 }, 'half'), 10 * MB);
  assert.ok(keptGpuBytes({ bytes: 5 * MB }, 'full') > 5 * MB * 8, 'the bound is above the median ratio');
  assert.equal(keptGpuBytes(null, 'full'), Infinity);
  // in order while they fit: a big one in the middle is skipped, a smaller one after it still kept
  const entries = { own: { gpu: 60 * MB }, big: { gpu: 120 * MB }, other: { gpu: 50 * MB }, none: null };
  const keep = pickKept(['own', 'big', 'other', 'none'], 'full', (k) => entries[k], 160);
  assert.deepEqual(keep, ['own', 'other']);
  assert.ok(KEEP_CAP_MB > 0);
  // the renderer is told what to keep; without an index figure for a card, nothing is held (it loads at `ending`)
  const fake = fakeModule(['char_a']);
  setDynModule(fake);
  releaseIllusts([{ charId: 'char_a', outfit: null }]);
  assert.deepEqual(fake.st.releases.at(-1), []);
  setDynModule(null);
});

test('a failed preload opens the result screen too (the cards keep their 2D art)', async () => {
  const fake = fakeModule(['char_a']);
  setDynModule(fake);
  startResultLoad(() => [card('char_a')]);
  await settled();
  assert.ok(resultWaitMs() > 0);
  fake.st.settles[0].rej(new Error('slow link'));
  await settled();
  assert.equal(resultWaitMs(), 0);
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

test('a slow card holds the group however long it takes, then all switch together (no time limit)', async (t) => {
  const dc = await import('../../public/js/ui/dynCards.js');
  assert.equal(dc.GROUP_CAP_MS, undefined, 'no cap: a slow link switches later, never one card at a time');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const F = fakeFrames();
  try {
    const starts = [], shows = [], kept = [];
    const mk = (n) => ({ card: { start: () => starts.push(n) }, show: () => shows.push(n), giveUp: () => kept.push(n), state: 'loading', alone: false });
    const a = mk('a'), b = mk('b');
    joinGroup(a); joinGroup(b);
    groupState(a, 'ready'); F.tick(); F.tick();
    t.mock.timers.tick(60000); F.tick(); F.tick();
    assert.deepEqual(starts, [], 'b still loading a minute later: a still waits, nobody is dropped');
    assert.deepEqual(kept, []);
    groupState(b, 'ready'); F.tick(); F.tick();
    assert.deepEqual(starts, ['a', 'b'], 'the last one in: both start in the same frame');
    for (let i = 0; i < 2 + FLIP_SMOOTH_FRAMES; i++) F.tick();
    assert.deepEqual(shows, ['a', 'b'], 'and show together');
    for (const e of [a, b]) leaveGroup(e);
  } finally { F.restore(); }
});

test('a stalled download (open, no byte for DOWNLOAD_STALL_MS) drops the cards still loading; a slow one or a slow build never does', async (t) => {
  const { DOWNLOAD_STALL_MS } = await import('../../public/js/ui/dynCards.js');
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const F = fakeFrames();
  const net = { open: 0, received: 0, moves: 0 };
  setDynModule({ getDynIllustStage: () => ({ netState: async () => ({ ...net }) }), dynIllustKey: () => null });
  const step = async (ms) => {
    for (let left = ms; left > 0; left -= 250) {
      t.mock.timers.tick(Math.min(250, left));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
  };
  try {
    const starts = [], kept = [];
    const mk = (n) => ({ card: { start: () => starts.push(n) }, show() {}, giveUp: () => kept.push(n), state: 'loading', alone: false });
    const a = mk('a'), b = mk('b');
    joinGroup(a); joinGroup(b);
    groupState(a, 'ready'); F.tick(); F.tick();
    // a slow link: one download open for a minute, a chunk every 2 s
    net.open = 1;
    for (let s = 0; s < 30; s++) { net.moves++; await step(2000); }
    F.tick(); F.tick();
    assert.deepEqual(kept, [], 'bytes keep coming: never a stall');
    assert.deepEqual(starts, []);
    // a slow computer: nothing open (b is building) for a long time
    net.open = 0;
    await step(DOWNLOAD_STALL_MS * 3); F.tick(); F.tick();
    assert.deepEqual(kept, [], 'no download open: no stall');
    // the download stalls: open, nothing arrives
    net.open = 1;
    await step(DOWNLOAD_STALL_MS - 1000); F.tick(); F.tick();
    assert.deepEqual(kept, [], 'not yet');
    await step(1500); F.tick(); F.tick();
    assert.deepEqual(kept, ['b'], 'stalled: the card still loading keeps its 2D art');
    assert.deepEqual(starts, ['a'], 'and the ready ones switch together');
    groupState(b, 'ready'); F.tick(); F.tick();
    assert.deepEqual(starts, ['a'], 'its download coming back later switches nothing until the screen opens again');
    for (const e of [a, b]) leaveGroup(e);
  } finally { F.restore(); setDynModule(null); }
});

test('low FPS at 3 s: the others keep their 2D art and the viewer\'s own card gets 3 s alone; smooth, it shows', () => {
  const F = fakeFrames();
  try {
    const shows = [], kept = [];
    const mk = (n, own = false) => ({ card: { start() {} }, show: () => shows.push(n), giveUp: () => kept.push(n), state: 'loading', alone: false, own });
    const me = mk('me', true), b = mk('b'), c = mk('c');
    for (const e of [me, b, c]) joinGroup(e);
    for (const e of [me, b, c]) groupState(e, 'ready');
    F.tick(); F.tick();
    // every frame 50 ms: never smooth for FLIP_GIVE_UP_MS
    for (let ms = 0; ms <= FLIP_GIVE_UP_MS + 100; ms += 50) F.tick(50);
    assert.deepEqual(kept.sort(), ['b', 'c'], 'everyone else keeps their still art');
    assert.deepEqual(shows, [], 'the own card is still hidden');
    // alone it runs smooth: it shows
    for (let i = 0; i < 2 + FLIP_SMOOTH_FRAMES; i++) F.tick(16);
    assert.deepEqual(shows, ['me'], 'the own card shows with its dissolve');
    // a card of another player swapping in now keeps its still art
    const d = mk('d');
    joinGroup(d); groupState(d, 'ready');
    assert.ok(kept.includes('d'));
    for (const e of [me, b, c, d]) leaveGroup(e);
  } finally { F.restore(); }
});

test('low FPS: the own card not smooth in its own 3 s either keeps its 2D art too; a spectator\'s page gives up at 3 s', () => {
  const F = fakeFrames();
  try {
    const shows = [], kept = [];
    const mk = (n, own = false) => ({ card: { start() {} }, show: () => shows.push(n), giveUp: () => kept.push(n), state: 'loading', alone: false, own });
    const me = mk('me', true), b = mk('b');
    for (const e of [me, b]) joinGroup(e);
    for (const e of [me, b]) groupState(e, 'ready');
    F.tick(); F.tick();
    for (let ms = 0; ms <= FLIP_GIVE_UP_MS + 100; ms += 50) F.tick(50);
    assert.deepEqual(kept, ['b']);
    for (let ms = 0; ms <= FLIP_GIVE_UP_MS + 100; ms += 50) F.tick(50);
    assert.deepEqual(kept, ['b', 'me'], 'still art for everyone');
    assert.deepEqual(shows, []);
    const late = mk('mine-later', true);
    joinGroup(late); groupState(late, 'ready');
    assert.ok(kept.includes('mine-later'), 'the page has given up: even the own card swapping in later keeps its still art');
    for (const e of [me, b, late]) leaveGroup(e);
    // a spectator: no own card, everyone at 3 s, as before
    kept.length = 0;
    const x = mk('x'), y = mk('y');
    for (const e of [x, y]) joinGroup(e);
    for (const e of [x, y]) groupState(e, 'ready');
    F.tick(); F.tick();
    for (let ms = 0; ms <= FLIP_GIVE_UP_MS + 100; ms += 50) F.tick(50);
    assert.deepEqual(kept, ['x', 'y'], 'everyone keeps their still art at 3 s');
    for (const e of [x, y]) leaveGroup(e);
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
  for (const [key, S] of [['the look', GLOW], ['a look without its own reach', { ...GLOW, reach: undefined, dissolveSoft: undefined }]]) {
    const reach = S.reach ?? BLOOM.width;
    const [a, b] = sweepRange(S);
    assert.equal(sweepDrive(0, S), a, key);
    assert.equal(sweepDrive(-1, S), a, key);
    assert.equal(sweepDrive(FLIP_SWEEP_S, S), 1, key);
    // the band's leading side reaches the card (mask 0) at the start and leaves it (mask 1) at the end
    assert.ok(Math.abs(edgeOf(a, S) + reach) < 1e-9 && Math.abs(edgeOf(b, S) - 1 - reach) < 1e-9, key);
    for (let s = 0; s + FLIP_SWEEP_S / 20 < FLIP_SWEEP_S; s += FLIP_SWEEP_S / 20) assert.ok(sweepDrive(s + FLIP_SWEEP_S / 20, S) > sweepDrive(s, S), key);
  }
});

test('settings: 动态立绘画质 keeps auto / half / full, junk or a profile saved before it takes auto', () => {
  assert.deepEqual([...DYN_QUALITY_SETTING], ['auto', 'half', 'full']);
  assert.equal(DEFAULT_SETTINGS.dynQuality, 'auto');
  for (const q of DYN_QUALITY_SETTING) assert.equal(sanitizeSettings({ dynQuality: q }).dynQuality, q);
  assert.equal(sanitizeSettings({ dynQuality: 'ultra' }).dynQuality, 'auto');
  assert.equal(sanitizeSettings({ dynQuality: 1 }).dynQuality, 'auto');
  assert.equal(sanitizeSettings({ bgm: 0.5 }).dynQuality, 'auto', 'a profile saved before the setting');
  // what settings.js saves is sanitizeSettings(store): the choice survives a save and a load
  assert.equal(sanitizeSettings(JSON.parse(JSON.stringify(sanitizeSettings({ dynQuality: 'half' })))).dynQuality, 'half');
});

test('动态立绘画质 drives the page tier with no reload: Half / Full force it, Auto hands it back to the cards\' size', async () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const pick = (dynQuality) => settingsStore.set(sanitizeSettings({ ...settingsStore.get(), dynQuality }));
  try {
    pick('half'); await tick();
    assert.equal(dynTierStore.get().tier, 'half', 'Half: every card re-mounts on half pages');
    pick('full'); await tick();
    assert.equal(dynTierStore.get().tier, 'full', 'Full: every card re-mounts on full pages');
    pick('half'); await tick();
    pick('auto'); await tick();
    // no card measured: the page keeps its tier until one does (tierChanged); the result load picks by size again
    assert.equal(dynTierStore.get().tier, 'half');
    // another setting's change leaves the tier alone (the review page's &tier stays as it set it)
    setDynQuality('full'); await tick();
    settingsStore.set({ resultArt: 'ace' }); await tick();
    assert.equal(dynTierStore.get().tier, 'full');
  } finally {
    setDynQuality(null);
    settingsStore.set(sanitizeSettings({ ...settingsStore.get(), dynQuality: 'auto', resultArt: 'card' }));
  }
});

test('a result card joins its page\'s entrance gate as it renders, so the page can never open the gate before its cards are in it', async () => {
  const { makeEntranceGate } = await import('../../public/js/ui/dynCards.js');
  // the page's effects (joined / open) ran before the cards' effects: a gate opened then has nobody to wait for
  const late = makeEntranceGate();
  let lateOpen = false; late.ready.then(() => { lateOpen = true; });
  late.joined(); late.open();
  late.join({}, null);
  await new Promise((r) => { setImmediate(r); });
  assert.equal(lateOpen, true, 'a card joining after joined() / open() is not waited for: why the cards must join first');
  late.dispose();
  // so IllustArt joins while it renders (before any effect of the page), then its effect sets its give-up on the same token
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../public/js/ui/dynCards.js', import.meta.url), 'utf8');
  assert.match(src, /if \(gate && on && !joinedOnce\.current\) \{ joinedOnce\.current = true; preJoin\.current = \{\}; gate\.join\(preJoin\.current, null\); \}/);
  assert.match(src, /const gateTok = preJoin\.current \|\| \{\};/);
  const g = makeEntranceGate();
  let open = false; g.ready.then(() => { open = true; });
  const tok = {};
  g.join(tok, null); // the render
  g.joined(); g.open(); // the page's effects
  g.join(tok, () => {}); // the card's effect: the same token, its give-up
  await new Promise((r) => { setImmediate(r); });
  assert.equal(open, false, 'joined first: the entrance waits for the card');
  g.settle(tok);
  await new Promise((r) => { setImmediate(r); });
  assert.equal(open, true, 'and plays once it is live');
  g.dispose();
});

test('a team page mounted hidden: its cards go live while hidden (the cover\'s wait ends), its entrance waits for the page to show', async (t) => {
  const { makeEntranceGate, gateWaitStore, RESULT_GIVE_UP_MS } = await import('../../public/js/ui/dynCards.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise((r) => { setImmediate(r); });
  const n0 = gateWaitStore.get().n;
  const g = makeEntranceGate({ now: 1000, endingAt: 1000 });
  let played = false;
  g.ready.then(() => { played = true; });
  const a = {}, b = {}, lost = [];
  g.join(a, () => lost.push('a')); g.join(b, () => lost.push('b'));
  g.joined();
  assert.equal(gateWaitStore.get().n, n0 + 1, 'its cards still getting their first frames: a cover that is up waits');
  g.settle(a); g.settle(b); await flush();
  assert.equal(gateWaitStore.get().n, n0, 'all live: the cover may go');
  assert.equal(played, false, 'hidden: no entrance yet');
  t.mock.timers.tick(RESULT_GIVE_UP_MS * 2); await flush();
  assert.equal(played, false, 'the give-up does not play a hidden page');
  assert.deepEqual(lost, []);
  g.open(); await flush();
  assert.equal(played, true, 'shown: the entrance plays at once');
  g.dispose();
  // a card still loading at the give-up while the page is hidden keeps its 2D art; the page plays when shown
  const h = makeEntranceGate({ now: 1000, endingAt: 1000 });
  let hp = false;
  h.ready.then(() => { hp = true; });
  h.join({}, () => lost.push('slow'));
  h.joined();
  t.mock.timers.tick(RESULT_GIVE_UP_MS); await flush();
  assert.deepEqual(lost, ['slow']);
  assert.equal(gateWaitStore.get().n, n0);
  assert.equal(hp, false);
  h.open(); await flush();
  assert.equal(hp, true);
  h.dispose();
});

test('the result page\'s entrance gate: opens once every animating card is live or failed, at once without one, and gives up for good', async (t) => {
  const { makeEntranceGate, RESULT_GIVE_UP_MS } = await import('../../public/js/ui/dynCards.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise((r) => { setImmediate(r); });
  // two animating cards: the gate waits for both
  let g = makeEntranceGate({ now: 1000, endingAt: 1000 });
  let opened = false;
  g.ready.then(() => { opened = true; });
  const a = {}, b = {}, gaveUp = [];
  g.join(a, () => gaveUp.push('a')); g.join(b, () => gaveUp.push('b'));
  g.open(); await flush();
  assert.equal(opened, false);
  g.settle(a); await flush();
  assert.equal(opened, false);
  g.settle(b); await flush();
  assert.equal(opened, true);
  assert.deepEqual(gaveUp, [], 'nobody given up when all are ready');
  g.dispose();
  // a page with no animating card opens as soon as it is opened
  g = makeEntranceGate({ now: 1000, endingAt: 1000 });
  opened = false; g.ready.then(() => { opened = true; });
  g.open(); await flush();
  assert.equal(opened, true);
  // one card never ready: at the give-up (counted from the ending) it is abandoned (keeps its 2D art) and the page plays
  g = makeEntranceGate({ now: 1000, endingAt: 1000 });
  assert.equal(g.budget, RESULT_GIVE_UP_MS);
  opened = false; g.ready.then(() => { opened = true; });
  const c = {}; const lost = [];
  g.join(c, () => lost.push('c'));
  g.open();
  t.mock.timers.tick(RESULT_GIVE_UP_MS - 1); await flush();
  assert.equal(opened, false);
  t.mock.timers.tick(1); await flush();
  assert.equal(opened, true);
  assert.deepEqual(lost, ['c']);
  g.join({}, () => lost.push('late')); g.settle({});
  assert.deepEqual(lost, ['c'], 'a card joining after the give-up is not held');
  // without a result load (the review page) the guard counts the whole RESULT_GIVE_UP_MS from the page's mount
  g = makeEntranceGate();
  assert.equal(g.budget, RESULT_GIVE_UP_MS);
  g.dispose();
  const dc = await import('../../public/js/ui/dynCards.js');
  assert.equal(dc.RESULT_MOUNT_MIN_MS, undefined, 'no separate minimum: every result page mounts with the result screen');
});

test('the cards\' look: the user\'s pick, one thin line on the smoothed mask, no glitter, no other looks', async () => {
  const ce = await import('../../public/js/ui/cardEntrance.js');
  const S = ce.GLOW;
  assert.equal(ce.GLOW_STYLES, undefined, 'the other proposals were removed (the user, 2026-11-23: "remove")');
  assert.equal(ce.glowStyle, undefined, 'one look: no switch');
  assert.ok(S.soft, 'one line: the smoothed mask');
  const core = S.bands[S.bands.length - 1];
  assert.ok(core.hi - core.lo <= 0.02, 'a thin core (the user: "half as thin")');
  assert.equal(ce.makeSparks, undefined, 'the glitter was dropped (the user, 2026-11-23)');
});

test('the dissolve Worker loads the page\'s drawing code: cardEntrance.js imports nothing of the page', async () => {
  const fs = await import('node:fs');
  const imports = (f) => [...fs.readFileSync(new URL(f, import.meta.url), 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  // assetUrls.js has no imports of its own; data.js / device.js / the hooks touch the page and stay in cardEntranceHook.js
  assert.deepEqual(imports('../../public/js/ui/cardEntrance.js'), ['./assetUrls.js']);
  assert.deepEqual(imports('../../public/js/ui/assetUrls.js'), []);
  assert.deepEqual(imports('../../public/js/ui/dissolveWorker.js'), ['./cardEntrance.js']);
  const hook = await import('../../public/js/ui/cardEntranceHook.js');
  assert.equal(typeof hook.useCardEntrance, 'function');
});

test('the dissolve picture: the 2D art placed as it shows, its box\'s background painted the same on and off the page', async () => {
  const { artPlacement, paintBackgroundStyle } = await import('../../public/js/ui/cardEntrance.js');
  // a placed art (object-fit fill) past the card's left edge, at dpr 1.5: drawn whole at its own box
  const p = artPlacement({ placed: true, r: { left: 90, top: 210, width: 400, height: 300 }, bx: 100, by: 200, bw: 300, bh: 180, nw: 1024, nh: 768, dpr: 1.5 });
  assert.deepEqual(p, { W: 450, H: 270, dx: -15, dy: 15, dw: 600, dh: 450, crop: { x: 0, y: 0, w: 1024, h: 768 } });
  // a cover art: the crop coverUv gives, over the whole box
  const c = artPlacement({ placed: false, r: { left: 0, top: 0, width: 200, height: 100 }, bx: 0, by: 0, bw: 200, bh: 100, nw: 400, nh: 400, px: 0.5, py: 0.5, dpr: 1 });
  const uv = coverUv(400, 400, 200, 100, 0.5, 0.5);
  assert.deepEqual(c, { W: 200, H: 100, dx: 0, dy: 0, dw: 200, dh: 100, crop: { x: uv.u0 * 400, y: uv.t0 * 400, w: (uv.u1 - uv.u0) * 400, h: (uv.t1 - uv.t0) * 400 } });
  // the background: colour, then a top-to-bottom gradient with its stops; another direction keeps the colour only
  const calls = [];
  const g = { set fillStyle(v) { calls.push(['fill', v]); }, fillRect: (...a) => calls.push(['rect', ...a]),
    createLinearGradient: (...a) => { calls.push(['grad', ...a]); return { addColorStop: (at, col) => calls.push(['stop', at, col]) }; } };
  paintBackgroundStyle(g, { backgroundColor: 'rgb(1, 2, 3)', backgroundImage: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 40%, rgb(9, 9, 9) 100%)' }, 10, 20);
  assert.deepEqual(calls.filter((x) => x[0] !== 'fill' || typeof x[1] === 'string'), [
    ['fill', 'rgb(1, 2, 3)'], ['rect', 0, 0, 10, 20], ['grad', 0, 0, 0, 20], ['stop', 0.4, 'rgba(0, 0, 0, 0)'], ['stop', 1, 'rgb(9, 9, 9)'], ['rect', 0, 0, 10, 20]]);
  calls.length = 0;
  paintBackgroundStyle(g, { backgroundColor: 'transparent', backgroundImage: 'linear-gradient(90deg, red, blue)' }, 10, 20);
  assert.deepEqual(calls, []);
});
