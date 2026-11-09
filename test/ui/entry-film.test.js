// test/ui/entry-film.test.js — the entry film (ui/entryFilm.js) never sits over a room or a match, and leaves the
// player's own lobby music alone. playEntryFilm runs for real on a small stand-in DOM (the overlay is a <dialog>, the
// card and the skip label plain elements; the scene itself is a stand-in, its pictures are ui/allianceScene.js's own,
// unit-tested in test/ui/alliance-scene.test.js): a session restored into a room while the 点击进入 card waits takes the
// overlay down and a later tap plays nothing; one restored into a match while the film runs takes it down at once, stops
// the entry cue and hands the music back to the screen. holdBgm: with audio.lobbyTrack set nothing fades and playBgm
// is left alone; without it the screen's music is held and released from its top; a lobbyTrack that arrives during
// the hold is passed to the real playBgm at once. A sprite that fails to load plays no film. A phone in portrait
// when the title is entered does not start the film after it rotates to landscape. (fork) The film waits for its art and
// sound however long they take, downloading them before any tap, and is never dropped for being slow.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the stand-in browser -------------------------------------------------------------------------------------------
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parent = null; this.style = {}; this.attrs = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.id = ''; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get isConnected() { let n = this; while (n.parent) n = n.parent; return n === document.body || n === document.head; }
  append(...cs) { for (const c of cs) { c.remove(); c.parent = this; this.children.push(c); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
  set innerHTML(h) {
    this.children = [];
    for (const m of h.matchAll(/<(\w+)(?:\s+class="([^"]*)")?>([^<]*)<\/\1>/g)) { const c = new El(m[1]); c.className = m[2] || ''; c.textContent = m[3]; this.append(c); }
  }
  querySelector(sel) {
    const cls = sel.slice(1);
    const walk = (n) => { for (const c of n.children) { if (c.className.split(/\s+/).includes(cls)) return c; const r = walk(c); if (r) return r; } return null; };
    return walk(this);
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn, opts) { (this.listeners[type] ||= []).push({ fn, once: !!opts?.once }); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((l) => l.fn !== fn); }
  dispatch(type) {
    for (const l of [...(this.listeners[type] || [])]) { if (l.once) this.removeEventListener(type, l.fn); l.fn({ type, preventDefault() {} }); }
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const winListeners = new Map(); // type → Set of handlers (the page's capture listeners)
globalThis.addEventListener = (type, fn) => { if (!winListeners.has(type)) winListeners.set(type, new Set()); winListeners.get(type).add(fn); };
globalThis.removeEventListener = (type, fn) => { winListeners.get(type)?.delete(fn); };
const keyListeners = () => winListeners.get('keydown')?.size || 0;
const pressKey = () => { for (const fn of [...(winListeners.get('keydown') || [])]) fn({ type: 'keydown' }); };
globalThis.document = {
  head: new El('head'), body: new El('body'),
  createElement: (tag) => new El(tag),
  getElementById: (id) => document.head.children.find((c) => c.id === id) || null,
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.innerWidth = 1600; globalThis.innerHeight = 900;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.Image = class { set src(u) { this._src = u; setTimeout(() => this.onload?.(), 0); } get src() { return this._src; } };
globalThis.fetch = async (url) => {
  const name = String(url).split('?')[0].split('/').pop();
  try { const body = readFileSync(path.join(ROOT, 'data', name), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(body) }; } catch { return { ok: false, status: 404, json: async () => ({}) }; }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { playEntryFilm, holdBgm, watchTitleReturns } = await import('../../public/js/ui/entryFilm.js');
const { clearSpriteLoads } = await import('../../public/js/ui/allianceScene.js');
const { store, selectRoute } = await import('../../public/js/store.js');
const { audio, AudioManager } = await import('../../public/js/audio.js');
const { data } = await import('../../public/js/data.js');

const overlay = () => document.body.children.find((c) => c.className === 'spa-entry') || null;
/** A stand-in scene: counts its frames, knows whether it was taken down. */
function sceneSpy() {
  const spy = { mounted: 0, frames: 0, destroyed: 0 };
  spy.mount = () => { spy.mounted++; return { render: () => { spy.frames++; }, grain() {}, destroy: () => { spy.destroyed++; } }; };
  return spy;
}
/** A running Web Audio stand-in: every buffer source it makes, and what became of it. */
function runningContext() {
  const sources = [];
  const ctx = {
    state: 'running', currentTime: 0,
    createBufferSource: () => {
      const s = {
        started: null, stopped: null, starts: 0, out: null,
        connect(node) { s.out = node; },
        start(t) { s.starts += 1; s.started = t; },
        // Web Audio throws when stop is asked for a time before the scheduled start
        stop(t) {
          if (s.started != null && t < s.started) {
            const err = new Error('InvalidStateError');
            err.name = 'InvalidStateError';
            throw err;
          }
          s.stopped = t;
        },
        playsAt(t) {
          if (s.started == null || t < s.started) return false;
          if (s.stopped != null && s.stopped <= t) return false;
          if (s.out && s.out.connected === false) return false;
          return true;
        },
      };
      sources.push(s);
      return s;
    },
    createGain: () => { const g = { gain: { value: 1, setTargetAtTime() {} }, connected: true, connect() {}, disconnect() { g.connected = false; } }; return g; },
  };
  return { ctx, sources };
}
const enterRoom = () => store.set((s) => ({ session: { ...s.session, entered: true }, room: { id: 'r1', players: [] } }));
const enterMatch = () => store.set((s) => ({ session: { ...s.session, entered: true }, room: { id: 'r1', inMatch: true, players: [] } }));
const PROTO = Object.getPrototypeOf(audio);
const realPlayBgm = PROTO.playBgm;

beforeEach(() => {
  clearSpriteLoads();
  store.reset();
  document.body.children = [];
  delete audio.playBgm;
  PROTO.playBgm = realPlayBgm;
  Object.assign(audio, { ctx: null, lobbyTrack: null, lastBgmKey: 'lobby', volumes: { ...(audio.volumes || {}), muted: false } });
});

test('a session restored into a room while the 点击进入 card waits takes the overlay down; a later tap plays nothing', async () => {
  const keysBefore = keyListeners();
  const spy = sceneSpy();
  await playEntryFilm({ mount: spy.mount });
  const el = overlay();
  assert.ok(el && el.open, 'the card is up on the title screen');
  assert.ok(el.querySelector('.spa-entry__gate'), 'with the 点击进入 card (sound is still locked)');
  assert.equal(keyListeners(), keysBefore + 1, 'the card listens for a key');

  enterRoom();
  assert.equal(selectRoute(store.get()), 'room');
  assert.equal(overlay(), null, 'the overlay is gone at once');
  assert.equal(el.open, false);
  assert.equal(keyListeners(), keysBefore, 'and nothing listens for keys any more');

  // the tap (or key) meant for the card now reaches nothing: no film over the room
  el.dispatch('pointerdown');
  pressKey();
  await sleep(800);
  assert.equal(spy.mounted, 0, 'the film never starts');
  assert.equal(overlay(), null);
});

test('a session restored into a match while the film runs takes it down at once, stops the cue, hands the music back', async () => {
  const { ctx, sources } = runningContext();
  Object.assign(audio, { ctx, sfxGain: {}, _buffer: async () => ({ duration: 1 }), _fadeOutBgm() {} });
  const played = [];
  PROTO.playBgm = function (key) { played.push(key); };
  const spy = sceneSpy();
  const keysBefore = keyListeners();
  await playEntryFilm({ mount: spy.mount });
  const el = overlay();
  assert.ok(el, 'sound is unlocked: the film starts without the card');
  assert.equal(el.querySelector('.spa-entry__gate'), null);
  for (let i = 0; i < 100 && !spy.frames; i++) await sleep(20);
  assert.equal(spy.mounted, 1, 'the film runs');
  assert.ok(spy.frames > 0);
  const cue = sources[0];
  assert.ok(cue && cue.started != null, 'the entry cue is scheduled');
  assert.ok(Object.prototype.hasOwnProperty.call(audio, 'playBgm'), 'the screen\'s music is held');
  audio.playBgm('battle'); // the match screen asks for its music (audio.js follows the route)
  assert.deepEqual(played, [], 'held while the film runs');

  enterMatch();
  assert.equal(selectRoute(store.get()), 'game');
  assert.equal(overlay(), null, 'the overlay is gone at once (no fade over the match)');
  assert.equal(spy.destroyed, 1, 'the scene is taken down');
  assert.equal(cue.out.connected, false, 'the cue gain is disconnected');
  assert.ok(cue.stopped != null && cue.stopped >= cue.started, 'stop is not before the scheduled start');
  ctx.currentTime = cue.started + 1;
  assert.equal(cue.playsAt(ctx.currentTime), false, 'the cue is not heard after leaving');
  assert.equal(cue.starts, 1, 'nothing starts afterwards');
  assert.equal(keyListeners(), keysBefore, 'no key skips anything any more');
  assert.equal(Object.prototype.hasOwnProperty.call(audio, 'playBgm'), false, 'playBgm is audio.js\'s own again');
  assert.deepEqual(played, ['battle'], 'the match\'s music plays');
  const frames = spy.frames;
  await sleep(2600); // past the film's lobby-music moment and its end
  assert.equal(spy.frames, frames, 'no frame after the leave');
  assert.deepEqual(played, ['battle'], 'and no lobby music restarted by the film');
});

test('a skip before the entry cue starts cuts it off: no stop before its start time, nothing heard', async () => {
  const { ctx, sources } = runningContext();
  Object.assign(audio, { ctx, sfxGain: {}, _buffer: async () => ({ duration: 1 }), _fadeOutBgm() {} });
  PROTO.playBgm = function () {};
  const spy = sceneSpy();
  await playEntryFilm({ mount: spy.mount });
  for (let i = 0; i < 100 && !spy.frames; i++) await sleep(20);
  const cue = sources[0];
  assert.ok(cue && cue.started > ctx.currentTime, 'the cue is scheduled ahead');
  pressKey(); // the skip, before the cue's start time
  assert.equal(cue.out.connected, false, 'the cue gain is disconnected');
  assert.ok(cue.stopped != null && cue.stopped >= cue.started, 'stop is not before the scheduled start (no throw)');
  ctx.currentTime = cue.started + 0.2;
  assert.equal(cue.playsAt(ctx.currentTime), false, 'the cue is never heard');
  await sleep(400);
  assert.equal(overlay(), null, 'the film is gone after its fade');
});

test('the entry cue is the manifest\'s URL, content hash included: the worker answers it from a finished download (GitHub #725)', async () => {
  const { ctx } = runningContext();
  const asked = [];
  Object.assign(audio, { ctx, sfxGain: {}, _buffer: async (u) => { asked.push(u); return { duration: 1 }; }, _fadeOutBgm() {} });
  PROTO.playBgm = function () {};
  const hashed = '/assets/~0123456789abcdef/audio/sfx/customse/act1autochess/act1autochess_g_ui_load.mp3';
  await data.load('assets');
  data.setView('assets', (m) => ({ ...m, audio: { ...m.audio, sfx: { ...m.audio.sfx, ui: { ...m.audio.sfx.ui, load: hashed } } } }));
  try {
    const spy = sceneSpy();
    await playEntryFilm({ mount: spy.mount });
    for (let i = 0; i < 100 && !spy.frames; i++) await sleep(20);
    assert.deepEqual(asked.filter((u) => u.includes('g_ui_load')), [hashed]);
    pressKey();
    await sleep(400);
    assert.equal(overlay(), null);
  } finally { data.setView('assets', null); }
});

test('holdBgm leaves the player\'s own lobby music alone: no fade, playBgm untouched', () => {
  let fades = 0;
  const a = { ctx: {}, bgmSilent: false, bgmToken: 0, lastBgmKey: 'lobby', lobbyTrack: { id: 'mine', read: async () => new ArrayBuffer(0) }, _fadeOutBgm() { fades++; }, playBgm() {} };
  const own = a.playBgm;
  assert.equal(holdBgm(a), null);
  assert.equal(fades, 0, 'nothing fades');
  assert.equal(a.bgmToken, 0, 'no start is cancelled');
  assert.equal(a.playBgm, own, 'playBgm is not replaced');
});

test('holdBgm without the player\'s own music holds the screen\'s and releases it from its top', () => {
  let fades = 0;
  const played = [];
  const proto = { playBgm(key) { played.push(key); } };
  const a = Object.assign(Object.create(proto), { ctx: {}, bgmSilent: false, bgmToken: 0, lastBgmKey: 'lobby', lobbyTrack: null, _fadeOutBgm() { fades++; } });
  const release = holdBgm(a);
  assert.equal(typeof release, 'function');
  assert.equal(fades, 1, 'the playing track fades out');
  a.playBgm('lobby');
  assert.deepEqual(played, [], 'a request meanwhile is only remembered');
  release();
  assert.deepEqual(played, ['lobby'], 'the release starts it');
  assert.equal(Object.prototype.hasOwnProperty.call(a, 'playBgm'), false);
  release();
  assert.deepEqual(played, ['lobby'], 'once');
  // silent music: nothing to hold
  assert.equal(holdBgm(Object.assign(Object.create(proto), { ctx: {}, bgmSilent: true, lobbyTrack: null })), null);
});

test('holdBgm hands a lobby track that arrives late to the real playBgm at once, without another fade', () => {
  let fades = 0;
  const played = [];
  const proto = { playBgm(key) { played.push(key); } };
  const a = Object.assign(Object.create(proto), { ctx: {}, bgmSilent: false, bgmToken: 0, lastBgmKey: 'lobby', lobbyTrack: null, _fadeOutBgm() { fades++; } });
  const release = holdBgm(a);
  assert.equal(fades, 1, 'the official track fades when the hold starts');
  a.playBgm('lobby');
  assert.deepEqual(played, [], 'still held before the player\'s file is in');
  a.lobbyTrack = { id: 'mine', read: async () => new ArrayBuffer(0) };
  a.playBgm('lobby'); // setLobbyTrack → refreshBgm, after installLobbyMedia resolves
  assert.deepEqual(played, ['lobby'], 'the real playBgm runs at once');
  assert.equal(fades, 1, 'no second fade');
  assert.equal(Object.prototype.hasOwnProperty.call(a, 'playBgm'), false, 'the placeholder is gone');
  release();
  assert.deepEqual(played, ['lobby'], 'the release does not start the track again');
});

test('a sprite that fails to load plays no film', async () => {
  const Real = globalThis.Image;
  globalThis.Image = class {
    set src(u) { this._src = u; setTimeout(() => this.onerror?.(), 0); }
    get src() { return this._src; }
  };
  try {
    const spy = sceneSpy();
    await playEntryFilm({ mount: spy.mount });
    assert.equal(overlay(), null, 'the title stays uncovered');
    assert.equal(spy.mounted, 0);
  } finally {
    globalThis.Image = Real;
  }
});

/** A prefetch the test finishes by hand: holds the film's sound "still downloading". */
function holdPrefetch() {
  const asked = [];
  let finish;
  const gate = new Promise((r) => { finish = r; });
  audio.prefetch = (url) => { asked.push(url); return gate.then(() => new ArrayBuffer(1)); };
  return { asked, finish };
}

test('(fork) the film waits for its sound: nothing runs ahead of the download, and the tap is not lost', async () => {
  const { ctx, sources } = runningContext();
  Object.assign(audio, { sfxGain: {}, _buffer: async () => ({ duration: 1 }), _fadeOutBgm() {} });
  PROTO.playBgm = function () {};
  const { asked, finish } = holdPrefetch();
  try {
    const spy = sceneSpy();
    let opened = false;
    const opening = playEntryFilm({ mount: spy.mount }).then(() => { opened = true; });
    const el = overlay();
    assert.ok(el && el.open, 'the cover is up at once');
    assert.equal(el.querySelector('.spa-entry__gate').firstChild.textContent, '加载中', 'it says it is loading');
    await sleep(1500); // past the 1.2 s that used to drop the film
    assert.equal(overlay(), el, 'still up: the film is not dropped');
    assert.ok(asked.some((u) => u.includes('g_ui_load')) && asked.some((u) => u.includes('m_sys_')), 'cue and lobby music are downloading before any tap');
    assert.equal(opened, false, 'and what comes after the opening keeps waiting');

    audio.ctx = ctx; // audio.js's capture listener runs first on the tap
    el.dispatch('pointerdown');
    await sleep(700);
    assert.equal(spy.mounted, 0, 'tapped, sound still downloading: no silent film');
    assert.equal(sources.length, 0);

    finish();
    await opening;
    for (let i = 0; i < 100 && !spy.frames; i++) await sleep(20);
    assert.equal(spy.mounted, 1, 'the download in: the film starts by itself, no second tap');
    assert.ok(sources[0]?.started != null, 'with its cue');
    pressKey();
    await sleep(400);
    assert.equal(overlay(), null);
  } finally { delete audio.prefetch; }
});

test('(fork) the card asks for the tap only once the files are in', async () => {
  const { finish } = holdPrefetch();
  try {
    const spy = sceneSpy();
    const opening = playEntryFilm({ mount: spy.mount });
    const el = overlay();
    assert.equal(el.querySelector('.spa-entry__gate').firstChild.textContent, '加载中');
    finish();
    await opening;
    await sleep(0);
    assert.equal(el.querySelector('.spa-entry__gate').firstChild.textContent, '点击进入');
    assert.equal(spy.mounted, 0, 'sound is locked: the card waits for the tap');
    enterRoom();
    assert.equal(overlay(), null);
  } finally { delete audio.prefetch; }
});

test('(fork) art slower than the old 1.2 s look still gets the film; a played film is marked only once it has played', async () => {
  const Real = globalThis.Image;
  globalThis.Image = class { set src(u) { this._src = u; setTimeout(() => this.onload?.(), 1400); } get src() { return this._src; } };
  const session = new Map();
  globalThis.sessionStorage = { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)) };
  const { ctx } = runningContext();
  Object.assign(audio, { ctx, sfxGain: {}, _buffer: async () => ({ duration: 1 }), _fadeOutBgm() {} });
  PROTO.playBgm = function () {};
  try {
    const spy = sceneSpy();
    const opening = playEntryFilm({ mount: spy.mount });
    assert.ok(overlay(), 'the cover is up');
    assert.equal(session.has('sp.entryFilm.played'), false, 'not marked while it only waits');
    await opening;
    for (let i = 0; i < 100 && !spy.frames; i++) await sleep(20);
    assert.equal(spy.mounted, 1, 'the film plays');
    assert.equal(session.get('sp.entryFilm.played'), '1');
    pressKey();
    await sleep(400);
  } finally {
    globalThis.Image = Real;
    delete globalThis.sessionStorage;
  }
});

test('(fork) _buffer takes over a prefetch: one request, and a failed one is asked for again', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  const bytes = new ArrayBuffer(4);
  let up = false;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return up ? { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => bytes } : { ok: false, status: 503, headers: { get: () => null } };
  };
  try {
    const a = new AudioManager({ win: null });
    a.ctx = { decodeAudioData: (ab, ok) => ok({ duration: 1, length: 1, numberOfChannels: 1, ab }) };
    up = true;
    const url = '/assets/audio/bgm/x.mp3';
    await a.prefetch(url, { priority: 'high' });
    assert.equal(calls.length, 1);
    const buf = await a._buffer(url);
    assert.equal(buf.ab, bytes, 'decoded from the bytes already downloaded');
    assert.equal(calls.length, 1, 'no second request');

    up = false;
    const failed = '/assets/audio/bgm/y.mp3';
    assert.equal(await a.prefetch(failed), null, 'a failed download resolves null, it does not throw');
    up = true;
    const n = calls.length;
    assert.ok(await a._buffer(failed), 'the sound is asked for again');
    assert.ok(calls.length > n);
  } finally { globalThis.fetch = realFetch; }
});

test('a phone in portrait when the title is entered does not start the film after rotating to landscape', async () => {
  const prevMedia = globalThis.matchMedia;
  const prevW = globalThis.innerWidth, prevH = globalThis.innerHeight;
  globalThis.matchMedia = (q) => ({
    matches: /\bfine\b/.test(String(q)) ? false : /coarse/.test(String(q)),
    addEventListener() {}, removeEventListener() {},
  });
  globalThis.innerWidth = 400;
  globalThis.innerHeight = 800;
  const spy = sceneSpy();
  try {
    await playEntryFilm({ mount: spy.mount });
    assert.equal(overlay(), null, 'portrait: no film');
    assert.equal(spy.mounted, 0);
    globalThis.innerWidth = 800;
    globalThis.innerHeight = 400;
    for (const type of ['resize', 'orientationchange']) {
      for (const fn of [...(winListeners.get(type) || [])]) fn();
    }
    await sleep(500);
    assert.equal(overlay(), null, 'landscape later: still no film');
    assert.equal(spy.mounted, 0);
  } finally {
    globalThis.matchMedia = prevMedia;
    globalThis.innerWidth = prevW;
    globalThis.innerHeight = prevH;
  }
});

// ---- (fork) a phone that waits for its first tap (ui/device.js installFirstTapFullscreen) ---------------------------
const { installFirstTapFullscreen } = await import('../../public/js/ui/device.js');
/** Arm the first-tap fullscreen as on a phone (412×915 screen, touch first); returns the disarm. */
function armPhone(media = {}) {
  const doc = { addEventListener() {}, removeEventListener() {}, fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen: async () => {} } };
  const win = {
    document: doc, navigator: { maxTouchPoints: 5 }, screen: { width: 412, height: 915 }, localStorage: { getItem: () => null },
    matchMedia: (q) => ({ matches: /\bcoarse\b/.test(q) || !!media[q], addEventListener() {}, removeEventListener() {} }),
  };
  return installFirstTapFullscreen(win, { enter: async () => true });
}
const phoneMedia = (extra = {}) => (q) => ({
  matches: /\bfine\b/.test(String(q)) ? false : /coarse/.test(String(q)) || !!extra[q], addEventListener() {}, removeEventListener() {},
});

test('(fork) a phone waiting for its fullscreen tap is asked to tap from the first frame, even with sound unlocked', async () => {
  const disarm = armPhone();
  const prevCtx = audio.ctx;
  audio.ctx = runningContext();
  const { finish } = holdPrefetch();
  try {
    const opening = playEntryFilm({ mount: sceneSpy().mount });
    const card = overlay().querySelector('.spa-entry__gate');
    assert.ok(card, 'the gate card, not the 加载中-only wait card');
    assert.equal(card.firstChild.textContent, '点击进入');
    assert.equal(card.lastChild.textContent, '加载中', 'the files still coming, said under the prompt');
    finish();
    await opening;
    enterRoom();
  } finally { delete audio.prefetch; audio.ctx = prevCtx; disarm(); }
});

test('(fork) a portrait phone waiting for its fullscreen tap still gets the film: that tap turns the screen', async () => {
  const disarm = armPhone();
  const prevMedia = globalThis.matchMedia, prevW = globalThis.innerWidth, prevH = globalThis.innerHeight;
  globalThis.matchMedia = phoneMedia();
  globalThis.innerWidth = 400; globalThis.innerHeight = 800;
  try {
    const opening = playEntryFilm({ mount: sceneSpy().mount });
    assert.ok(overlay(), 'the 点击进入 card over the rotate hint');
    await opening;
    enterRoom();
    assert.equal(overlay(), null);
  } finally { globalThis.matchMedia = prevMedia; globalThis.innerWidth = prevW; globalThis.innerHeight = prevH; disarm(); }
});

test('(fork) no film this time, but a phone waiting for its tap: the 点击进入 card alone, gone with its click', async () => {
  const disarm = armPhone();
  const prevMedia = globalThis.matchMedia;
  globalThis.matchMedia = phoneMedia({ '(prefers-reduced-motion: reduce)': true });
  const tapCard = () => document.body.children.find((c) => c.className === 'spa-entry spa-entry--tap') || null;
  try {
    await playEntryFilm({ mount: sceneSpy().mount });
    assert.equal(overlay(), null, 'no film (reduced motion)');
    const el = tapCard();
    assert.ok(el, 'the tap card');
    assert.equal(el.querySelector('.spa-entry__gate').firstChild.textContent, '点击进入');
    el.dispatch('click');
    assert.equal(tapCard(), null);
    disarm();
    await playEntryFilm({ mount: sceneSpy().mount });
    assert.equal(tapCard(), null, 'once the tap happened (or on a desktop): nothing asks');
  } finally { globalThis.matchMedia = prevMedia; disarm(); }
});

test('(fork) a page load landing in the lobby plays it once per tab session; the login screen plays it every time', async () => {
  const session = new Map();
  globalThis.sessionStorage = { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)) };
  try {
    session.set('sp.entryFilm.played', '1');
    const spy = sceneSpy();
    store.set((s) => ({ session: { ...s.session, entered: true } }));
    assert.equal(selectRoute(store.get()), 'lobby');
    await playEntryFilm({ mount: spy.mount });
    assert.equal(overlay(), null, 'seen in this tab: the lobby stays uncovered');

    store.reset();
    assert.equal(selectRoute(store.get()), 'title');
    await playEntryFilm({ mount: spy.mount });
    assert.ok(overlay(), 'the login screen plays it although this tab has seen it');
    enterRoom();
    assert.equal(overlay(), null);

    session.clear();
    store.reset();
    await playEntryFilm({ mount: spy.mount, skip: () => true });
    assert.equal(session.has('sp.entryFilm.played'), false, 'a film that did not play leaves the session free to play it');
    assert.equal(overlay(), null);

    session.set('sp.entryFilm.off', '1');
    await playEntryFilm({ mount: spy.mount });
    assert.equal(overlay(), null, 'the browser suites\' switch');
  } finally {
    delete globalThis.sessionStorage;
  }
});

test('(fork) every return to the login screen plays the film, with no tap once sound is unlocked', async () => {
  const { ctx } = runningContext();
  Object.assign(audio, { ctx, sfxGain: {}, _buffer: async () => ({ duration: 1 }), _fadeOutBgm() {} });
  PROTO.playBgm = function () {};
  const spy = sceneSpy();
  const stop = watchTitleReturns({ mount: spy.mount });
  try {
    for (let visit = 1; visit <= 2; visit++) {
      store.set((s) => ({ session: { ...s.session, entered: true } }));
      assert.equal(overlay(), null, 'entering the lobby plays nothing');
      store.set((s) => ({ session: { ...s.session, entered: false } })); // the lobby's way back
      const el = overlay();
      assert.ok(el, `return ${visit}: the cover is up`);
      assert.equal(el.querySelector('.spa-entry__gate'), null, 'no tap card: sound is already unlocked');
      for (let i = 0; i < 100 && spy.mounted < visit; i++) await sleep(20);
      assert.equal(spy.mounted, visit, `return ${visit}: the film plays`);
      pressKey();
      await sleep(400);
      assert.equal(overlay(), null, 'skipped: the login screen');
    }
    store.set((s) => ({ session: { ...s.session, entered: true }, room: { id: 'r1', players: [] } }));
    assert.equal(overlay(), null, 'not on the way to a room');
    assert.equal(spy.mounted, 2);
  } finally { stop(); }
});

test('(fork) a prefetch of a sound already decoded requests nothing and leaves nothing behind', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(4) }; };
  try {
    const a = new AudioManager({ win: null });
    a.ctx = { decodeAudioData: (ab, ok) => ok({ duration: 1, length: 1, numberOfChannels: 1 }) };
    const url = '/assets/audio/bgm/x.mp3';
    await a._buffer(url);
    assert.equal(calls, 1);
    assert.equal(await a.prefetch(url), null);
    assert.equal(calls, 1, 'no download');
    assert.equal(a.prefetched.size, 0);
  } finally { globalThis.fetch = realFetch; }
});
