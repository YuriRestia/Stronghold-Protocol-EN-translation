// (fork) Animated illustration review pages (crew-docs l2d-art-proposal §8, the user's decision D12): every dynamic
// illustration of this server's index (data/local-assets.json `dynillust`) on the REAL screens — screens/settle.js
// SettleFlow's team page (4 cards a page), screens/room.js RoomScreen with 4 seats and as a Grand Alliance room with 8 —
// fed with made-up players whose room card is that operator in that outfit (D6's default, so the card shows it), with
// 动态立绘 on 所有人. The cards behave exactly as in the game (ui/dynCards.js, render/dynillust/). See dyn-review.html.

import '/js/ui/compat.js';
import { render } from '/vendor/preact.module.js';
import { html, UiHosts } from '/js/ui/components.js';
import { installDeviceSupport } from '/js/ui/device.js';
import { store } from '/js/store.js';
import { net } from '/js/net.js';
import { data } from '/js/data.js';
import { assets } from '/js/assets.js';
import { settingsStore } from '/js/ui/settingsStore.js';
import { GAME_FILES } from '/js/ui/gameComponents.js';
import { initLang } from '/js/ui/lang.js';
import { ensurePixi } from '/js/render/app/pixi.js';
import { SettleFlow } from '/js/screens/settle.js';
import { RoomScreen } from '/js/screens/room.js';
import { setDynModule, setDynQuality, setDynFraming } from '/js/ui/dynCards.js';
import { cardStore, CARD_KEY } from '/js/ui/seatArt.js';
import { outfitStore } from '/js/ui/outfits.js';

const P = new URLSearchParams(location.search);
// &main: the cards drawn on the page's own thread, not in Workers (render/dynillust/index.js __dynMainThread)
if (P.has('main')) globalThis.__dynMainThread = true;
// &glow=0…4: the room cards' border glow look (ui/cardEntrance.js GLOW_STYLES; 0 the current one), for the user's pick
if (P.has('glow')) globalThis.__dynGlow = P.get('glow');const SCREEN =['result', 'room', 'ga'].includes(P.get('screen')) ? P.get('screen') : 'result';
const PER = SCREEN === 'ga' ? 8 : 4;
const DEVICE = P.get('device') === 'phone' ? 'phone' : 'pc';
const FRAME = P.has('frame');
const SLOW = Math.max(0, Number(P.get('slow')) || 0); // MB/s, 0 = the connection as it is
const SHOT = P.has('shot');
// &tier=half|full: the renderer's page tier on any device (the half-size art comparison); default as in the game
const TIER = ['half', 'full'].includes(P.get('tier')) ? P.get('tier') : null;
// &framing=card|home|home-illust: every card's framing (dynCards.js setDynFraming; the framing comparison stills)
const FRAMING = ['card', 'home', 'home-illust'].includes(P.get('framing')) ? P.get('framing') : null;
// &fr=key~zoom~fx~fy|…: a card-framing zoom about (fx, fy) per illustration key (the framing tool's candidates)
const FR = new Map((P.get('fr') || '').split('|').filter(Boolean).map((s) => {
  const [key, z, fx, fy] = s.split('~');
  return [key, { mode: 'card', zoom: Number(z) || 1, fx: Number(fx), fy: Number(fy) }];
}));
const app = document.getElementById('app');
const bar = document.getElementById('rvbar');

// ---- hand framing (the user, 2026-11-23: "have a way for me to drag and zoom the live2d to a good position and export
// all of them for you"): on the room and Grand Alliance pages each wide card takes a drag (pan) and the mouse wheel (zoom
// about the pointer); double-click resets it to the table's. The card framing is zoomed by z and moved by (tx, ty) card
// fractions — x' = z·x + tx·w — kept as the renderer's { mode: 'card', zoom, fx, fy } (fx = tx / (1 − z)), applied live
// to the running illustration (setFraming), kept per illustration key in this browser, exported as a framing table.
const FRAMES_KEY = 'dynReview.framings';
let TABLE = {};
const framings = (() => { try { return JSON.parse(localStorage.getItem(FRAMES_KEY) || '{}') || {}; } catch { return {}; } })();
const saveFramings = () => { try { localStorage.setItem(FRAMES_KEY, JSON.stringify(framings)); } catch { /* private mode */ } };
/** zoom / pan (z, tx, ty) ↔ the renderer's zoom about a point; z kept off 1 by a hair so a pan at 1× stays representable. */
const toFraming = ({ z, tx, ty }) => { const zz = Math.abs(1 - z) < 1e-3 ? (tx || ty ? 1.001 : 1) : z; return zz === 1 ? { mode: 'card', zoom: 1, fx: 0.5, fy: 0.5 } : { mode: 'card', zoom: +zz.toFixed(4), fx: +(tx / (1 - zz)).toFixed(4), fy: +(ty / (1 - zz)).toFixed(4) }; };
const fromFraming = (f) => { const z = f?.zoom > 0 ? f.zoom : 1; return { z, tx: z === 1 ? 0 : f.fx * (1 - z), ty: z === 1 ? 0 : f.fy * (1 - z) }; };
/** The table's framing of `key` (data/dyn-card-framing.json; zoom 1 = the plain card framing). */
const tableFraming = (k) => { const c = TABLE[k]; return c && c.zoom > 0 ? { mode: 'card', zoom: c.zoom, fx: c.fx, fy: c.fy } : { mode: 'card', zoom: 1, fx: 0.5, fy: 0.5 }; };
/** The framing a card shows now: the user's, else the table's. */
const frameOf = (k) => framings[k] || tableFraming(k);
/** The framing the cards mount with (setDynFraming): the URL's &fr / &framing first, then the user's; null = the table's. */
const decideFraming = (k) => {
  if (FR.has(k)) return FR.get(k);
  if (FRAMING) return FRAMING;
  return framings[k] || null;
};

const go = (patch) => { const u = new URL(location.href); for (const [k, v] of Object.entries(patch)) { if (v == null) u.searchParams.delete(k); else u.searchParams.set(k, String(v)); } u.searchParams.delete('frame'); location.href = u.toString(); };
let review = null; // { pages, page, names, stage }

/** A fetch that shares one throttled pipe of `mbps` MB/s between every request (the late-switch check). */
function slowFetch(mbps) {
  let busyUntil = 0;
  return async (url, opts) => {
    const r = await fetch(url, opts);
    const b = await r.arrayBuffer();
    const start = Math.max(performance.now(), busyUntil);
    busyUntil = start + (b.byteLength / (mbps * 1e6)) * 1000;
    await new Promise((res) => setTimeout(res, Math.max(0, busyUntil - performance.now())));
    return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers });
  };
}

/** The renderer this page uses: the page's own, or one on a throttled connection. */
async function installRenderer() {
  await ensurePixi();
  const R = await import('/js/render/dynillust/index.js');
  if (!SLOW) return R.getDynIllustStage();
  const st = new R.DynIllustStage({ manifest: () => assets.local(), fetch: slowFetch(SLOW) });
  st.index();
  const key = (charId, skinId = null) => {
    const g = st._group;
    if (!g || !charId) return null;
    const want = skinId || `${charId}#2`;
    for (const [k, e] of Object.entries(g)) if (e && e.charId === charId && e.skinId === want) return k;
    return null;
  };
  setDynModule({ getDynIllustStage: () => st, dynIllustKey: key });
  return st;
}

/**
 * The illustration's name, in English from the official EN game data by id (dyn-review-names.json, written by
 * tools/dyn-review-names.mjs): the operator's and the outfit's, 'Elite 2 art', or a CN-only outfit's EN brand and number.
 * A skin the file lacks (a newer extraction): the game data's names in the page's language.
 */
let NAMES = {};
function nameOf(e) {
  const n = NAMES[e.skinId];
  if (n) return `${n.op} · ${n.outfit}${n.cnOnly ? ' (CN only)' : ''}`;
  const chess = data.list('chess').find((c) => c && c.charId === e.charId) || Object.values(data.get('backups')?.units || {}).find((u) => u && u.charId === e.charId);
  const outfit = e.skinId === `${e.charId}#2` ? 'Elite 2 art' : data.lookup('outfits', e.skinId)?.name || e.skinId;
  return `${chess?.name || e.charId} · ${outfit}`;
}

function fakeRoom(group, ids) {
  return {
    code: 'REVIEW', hostId: ids[0], mode: 'coop', difficulty: 'HARD', inMatch: false, ...(SCREEN === 'ga' ? { capacity: 8 } : {}),
    seats: group.map((e, i) => ({
      seat: i, playerId: ids[i], name: review.names[i], isBot: false, ready: true, connected: true, card: e.charId,
      outfits: e.skinId === `${e.charId}#2` ? {} : { [e.charId]: e.skinId },
    })),
  };
}

function fakeResult(group, ids) {
  const players = group.map((e, i) => ({
    playerId: ids[i], seat: i, name: review.names[i], isBot: false, left: false, alive: true, victory: i % 2 === 0, lp: 10, bandId: null,
    roundsPassed: i % 2 === 0 ? 14 : 11, eliminatedRound: null, title: null, lineup: [], bonds: [],
    stats: { dmgDealt: 0, kills: 0, leaks: 0, gold: 0, refreshes: 0, merges: 0, itemsEquipped: 0, bossDamage: 0, activatedLayers: 0, lpLost: 0, perfectRounds: 0 },
    trophies: 5, reward: 0,
  }));
  return { victory: true, roundsPassed: 14, hiddenReached: false, hiddenCleared: false, reason: 'victory', difficulty: 'HARD', modeId: 'mode_multi_hard', durationMs: 52 * 60000, players };
}

let replay = 0;
function Screen() {
  const { pages, page } = review;
  const group = pages[page] || [];
  const ids = group.map((_, i) => `rv${page}_${i}`);
  if (SCREEN === 'result') {
    return html`<${SettleFlow} key=${`${page}|${replay}`} res=${fakeResult(group, ids)} myId=${null} backLabel="Back" onBack=${() => {}} />`;
  }
  return html`<${RoomScreen} key=${`${page}|${replay}`} />`;
}

function draw() {
  const { pages, page } = review;
  const group = pages[page] || [];
  const ids = group.map((_, i) => `rv${page}_${i}`);
  store.set({ me: { playerId: SCREEN === 'result' ? 'viewer' : ids[0], name: 'Reviewer', token: null }, room: fakeRoom(group, ids) });
  // the room's own seat (the first) reads this browser's card pick and outfits: that illustration's, in memory only
  const mine = group[0];
  if (SCREEN !== 'result' && mine) {
    cardStore.set({ [CARD_KEY]: mine.charId });
    outfitStore.set({ outfits: mine.skinId === `${mine.charId}#2` ? {} : { [mine.charId]: mine.skinId } });
  }
  render(html`<div class="app-root"><div class="app-bg" aria-hidden="true"></div><${Screen} /><${UiHosts} /></div>`, app);
}

/** Every card on the page: play its special idle / Start now (review only: CardIllustState.playSpecial / playStart). */
function act(what) {
  const st = review?.stage;
  if (!st?.cards) return 0;
  // the stage that draws in Workers (render/dynillust/host.js) does it there; the main-thread stage has the slots here
  if (typeof st.act === 'function') return st.act(what);
  let n = 0;
  for (const c of st.cards) {
    const s = c.slot;
    if (!s?.card || !s.inst) continue;
    if (what === 'special') s.card.playSpecial(s.inst); else s.card.playStart(s.inst);
    n++;
  }
  st._kick?.();
  return n;
}
/**
 * The §7 gates' probe: the page's frame intervals over `secs` (requestAnimationFrame): fps, median and p95 ms, the frames
 * over the 60 fps budget (16.7 ms), the longest; and the renderer's own stats.
 */
function measure(secs = 5) {
  return new Promise((res) => {
    const d = []; let last = performance.now(); const end = last + secs * 1000;
    const f = (t) => {
      d.push(t - last); last = t;
      if (t < end) { requestAnimationFrame(f); return; }
      const s = d.slice(1).sort((a, b) => a - b);
      const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
      res({ frames: s.length, fps: +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1), median: q(0.5), p95: q(0.95),
        over: s.filter((x) => x > 1000 / 60 + 1).length, max: +s[s.length - 1].toFixed(2), stats: review?.stage?.stats?.() || null,
        live: [...document.querySelectorAll('.dyn-art')].filter((x) => x.dataset.dyn === 'live').length });
    };
    requestAnimationFrame(f);
  });
}
/**
 * Another page without a reload (the user, 2026-11-23: "is there a way to click next that doesnt have to reload the whole
 * page"): the screen re-mounts with the page's cards and the URL's &page follows (a reload lands there). The pages left
 * behind stay loaded: freeing them (the renderer's release) and coming back drew the cards black (2026-11-23, reported to
 * the renderer's owner), and the 98 illustrations fit the review machine's GPU.
 */
function goPage(n) {
  if (!review || !(n >= 0 && n < review.pages.length) || n === review.page) return;
  review.page = n;
  review.names = review.allNames[n] || [];
  const u = new URL(location.href); u.searchParams.set('page', String(n + 1)); history.replaceState(null, '', u);
  draw();
  renderBar(null);
  frameEditor();
}
globalThis.__review = { special: () => act('special'), start: () => act('start'), replay: () => { replay++; draw(); }, state: () => review, measure, goPage };

/** Apply `key`'s framing to its running cards now (the renderer's setFraming: the camera moves, nothing restarts). */
function applyFraming(k) {
  const f = frameOf(k);
  for (const c of review.stage?.cards || []) if (c.key === k) c.setFraming?.(f);
}

/**
 * The hand-framing layer over the wide cards: a box per card that takes a drag (pan) and the wheel (zoom about the
 * pointer); double-click resets to the table's value. The zoom shows at its corner, ✎ once set here.
 */
function frameEditor() {
  if (SHOT || FRAME || SCREEN === 'result' || !review) return;
  let layer = document.querySelector('.rvzoom');
  if (!layer) {
    layer = Object.assign(document.createElement('div'), { className: 'rvzoom' });
    document.body.append(layer);
    let drag = null, raf = 0;
    const keyOf = (el) => el?.closest('.rvz')?.dataset.k;
    // a gesture: the view (z, tx, ty) changed for `k` — live on the running cards (one setFraming a frame)
    const set = (k, v, el) => {
      framings[k] = toFraming(v);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; applyFraming(k); label(el, k); });
    };
    const label = (el, k) => { const b = el?.querySelector('b'); if (b) b.textContent = `${Math.round(frameOf(k).zoom * 100)}%${framings[k] ? ' ✎' : ''}`; };
    // the end of a gesture: kept, and the 2D art placed at the same value
    const done = () => { saveFramings(); draw(); renderBar(null); };
    layer.addEventListener('pointerdown', (ev) => {
      const el = ev.target.closest('.rvz'); const k = keyOf(el);
      if (!k || ev.button !== 0 || ev.target.closest('button')) return;
      el.setPointerCapture(ev.pointerId);
      drag = { k, el, x: ev.clientX, y: ev.clientY, v: fromFraming(frameOf(k)), r: el.getBoundingClientRect() };
      el.classList.add('is-drag');
    });
    layer.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const { k, el, v, r } = drag;
      set(k, { z: v.z, tx: v.tx + (ev.clientX - drag.x) / r.width, ty: v.ty + (ev.clientY - drag.y) / r.height }, el);
    });
    const up = () => { if (!drag) return; drag.el.classList.remove('is-drag'); drag = null; done(); };
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', up);
    let wheelT = 0;
    layer.addEventListener('wheel', (ev) => {
      const el = ev.target.closest('.rvz'); const k = keyOf(el);
      if (!k) return;
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const v = fromFraming(frameOf(k));
      // fine steps (the user, 2026-11-23: "skipping too many steps"): 2 % a wheel notch (deltaY 100), 0.5 % with Shift;
      // a notch is clamped to one step whatever the device reports
      const notch = Math.max(-1, Math.min(1, (ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY) / 100));
      const z = Math.min(3, Math.max(0.6, v.z * Math.exp(-notch * (ev.shiftKey ? 0.005 : 0.02))));
      // the point under the pointer stays put: p = z·q + t
      const px = (ev.clientX - r.left) / r.width, py = (ev.clientY - r.top) / r.height;
      const qx = (px - v.tx) / v.z, qy = (py - v.ty) / v.z;
      set(k, { z, tx: px - z * qx, ty: py - z * qy }, el);
      clearTimeout(wheelT); wheelT = setTimeout(done, 300);
    }, { passive: false });
    layer.addEventListener('dblclick', (ev) => {
      const el = ev.target.closest('.rvz'); const k = keyOf(el);
      if (!k) return;
      delete framings[k];
      applyFraming(k); label(el, k); done();
    });
    // the cards rise in and the window resizes: follow them
    setInterval(placeEditor, 400);
  }
  const group = review.pages[review.page] || [];
  layer.innerHTML = group.map((e, i) => `<div class="rvz" data-i="${i}" data-k="${e.key}" title="Drag to move, wheel to zoom (Shift: finer), double-click to reset — ${review.names[i] || e.key}"><b>${Math.round(frameOf(e.key).zoom * 100)}%${framings[e.key] ? ' ✎' : ''}</b></div>`).join('');
  placeEditor();
}
function placeEditor() {
  const layer = document.querySelector('.rvzoom');
  if (!layer) return;
  for (const el of document.querySelectorAll('.rs-seats .rseat')) {
    const i = el.style.getPropertyValue('--i').trim();
    const t = layer.querySelector(`.rvz[data-i="${i}"]`);
    const art = el.querySelector('.rseat__art') || el;
    if (!t) continue;
    const r = art.getBoundingClientRect();
    Object.assign(t.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
}

/** Every illustration's framing as a file and on the clipboard: the cards table of data/dyn-card-framing.json (zoom,
 * fx, fy), with `edited` on the ones set here and the names. */
function exportFramings() {
  const names = new Map(review.pages.flatMap((pg, p) => pg.map((e, i) => [e.key, review.allNames[p]?.[i] || e.key])));
  const cards = {};
  for (const e of review.pages.flat()) {
    const f = frameOf(e.key);
    cards[e.key] = { zoom: f.zoom, fx: f.fx, fy: f.fy, edited: !!framings[e.key], name: names.get(e.key) };
  }
  const out = { exported: new Date().toISOString(), edited: Object.values(cards).filter((c) => c.edited).length, total: Object.keys(cards).length, cards };
  const text = JSON.stringify(out, null, 1);
  navigator.clipboard?.writeText(text).catch(() => {});
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'dyn-card-framing-edits.json' });
  document.body.append(a); a.click(); a.remove();
  return out;
}
globalThis.__review.exportFramings = exportFramings;

const viewportText = () => `Window ${innerWidth}×${innerHeight} @${+(devicePixelRatio || 1).toFixed(3)}`;
addEventListener('resize', () => { const el = bar?.querySelector('[data-vp]'); if (el) el.textContent = viewportText(); });

function renderBar(target) {
  if (SHOT || !bar) return;
  const total = review ? review.pages.length : 0;
  const page = review ? review.page : 0;
  const call = (fn) => (target ? () => target.__review?.[fn]?.() : () => globalThis.__review[fn]());
  const btn = (label, on, fn) => `<button type="button" class="${on ? 'on' : ''}" data-act="${fn}">${label}</button>`;
  bar.innerHTML = `<b>REVIEW</b>`
    + btn('Result', SCREEN === 'result', 's:result') + btn('Room', SCREEN === 'room', 's:room') + btn('Grand Alliance', SCREEN === 'ga', 's:ga')
    + '<span class="sep"></span>' + btn('PC', DEVICE === 'pc', 'd:pc') + btn('Phone', DEVICE === 'phone', 'd:phone')
    + '<span class="sep"></span>' + btn('‹ Prev', false, 'prev') + `<span>${total ? page + 1 : 0} / ${total}</span>` + btn('Next ›', false, 'next')
    + '<span class="sep"></span>' + btn('Special idle now', false, 'special') + btn('Start now', false, 'start') + btn('Replay entrance', false, 'replay')
    + btn(SLOW ? `Slow ${SLOW} MB/s` : 'Slow connection', !!SLOW, 'slow')
    + btn(TIER === 'half' ? 'Half-size art' : 'Half-size art: off', TIER === 'half', 'tier')
    + (SCREEN !== 'result' ? '<span class="sep"></span>' + btn(`Export framings (${Object.keys(framings).length} edited)`, false, 'export') + btn('Clear my framings', false, 'clear') : '')
    // the window as this browser sees it (CSS px and the pixel ratio): the screens the review captures are taken at
    + `<span class="sep"></span><span data-vp>${viewportText()}</span>`
    + `<span class="names">${review ? (review.pages[page] || []).map((e, i) => `${i + 1}. ${review.allNames[page]?.[i] || e.charId}`).join(' · ') : 'loading…'}</span>`;
  bar.onclick = (ev) => {
    const a = ev.target.closest('button')?.dataset.act;
    if (!a) return;
    if (a.startsWith('s:')) go({ screen: a.slice(2), page: 1 });
    else if (a.startsWith('d:')) go({ device: a.slice(2) });
    else if (a === 'prev' || a === 'next') {
      const n = a === 'prev' ? page - 1 : page + 1;
      // the phone's frame turns its own page; the bar follows it
      if (target) { target.__review?.goPage?.(n); review = target.__review?.state?.() || review; renderBar(target); } else goPage(n);
    }
    else if (a === 'slow') go({ slow: SLOW ? null : 1 });
    else if (a === 'tier') go({ tier: TIER === 'half' ? null : 'half' });
    else if (a === 'export') exportFramings();
    else if (a === 'clear') {
      if (!confirm('Clear every framing you set on this page (all illustrations)?')) return;
      const keys = Object.keys(framings);
      for (const k of keys) delete framings[k];
      saveFramings();
      for (const k of keys) applyFraming(k);
      draw(); renderBar(null); frameEditor();
    } else call(a)();
  };
}
addEventListener('keydown', (e) => {
  if (e.key === '`') bar?.classList.toggle('hidden');
  if (!review || FRAME) return;
  if (e.key === 'ArrowLeft') goPage(review.page - 1);
  if (e.key === 'ArrowRight') goPage(review.page + 1);
});

async function boot() {
  if (DEVICE === 'phone' && !FRAME) {
    // the phone: this page again in a landscape phone's viewport (812 × 375), the bar driving the frame
    const u = new URL(location.href); u.searchParams.set('frame', '1'); u.searchParams.set('shot', '1');
    app.innerHTML = `<div class="rvphone"><iframe title="phone" src="${u}"></iframe></div>`;
    const frame = app.querySelector('iframe');
    const fit = () => { const k = Math.min(1, (innerWidth - 24) / 812, (innerHeight - 90) / 375); frame.style.transform = `scale(${k})`; };
    fit(); addEventListener('resize', fit);
    frame.addEventListener('load', () => {
      const poll = setInterval(() => { const r = frame.contentWindow?.__review?.state?.(); if (r) { clearInterval(poll); review = r; renderBar(frame.contentWindow); } }, 200);
    });
    renderBar(null);
    return;
  }
  net.request = async () => ({});
  store.set({ session: { entered: true }, connection: { status: 'online', ping: 20, attempt: 0, retryAt: 0, lastError: null, everOnline: true },
    clock: { offset: 0, rtt: 20, synced: true } });
  // 动态立绘 on every card, the result cards' default art (the room card), not saved
  settingsStore.set({ dynIllust: P.has('off') ? 'off' : 'all', resultArt: 'card' }); // &off: the 2D cards (the perf baseline)
  if (SCREEN !== 'result') {
    TABLE = await fetch('/data/dyn-card-framing.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => j?.cards || {}).catch(() => ({}));
    setDynFraming(decideFraming);
  } else if (FR.size) setDynFraming((key) => FR.get(key) || FRAMING);
  else if (FRAMING) setDynFraming(FRAMING);
  if (TIER) setDynQuality(TIER);
  else if (FRAME) setDynQuality('half');
  // the page's language as the game picks it (?lang=, a stored choice, else English: ui/lang.js START_LANG)
  await initLang().catch((err) => console.warn('[review] language setup failed', err));
  NAMES = await fetch('/dev/dyn-review-names.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  await data.loadAll([...GAME_FILES, 'outfits']);
  installDeviceSupport();
  const stage = await installRenderer();
  const man = await assets.local();
  const g = man?.groups?.dynillust || {};
  // &stills=charId,charId@brand#n,…: those operators (E2 art, or that outfit) in place of the index — the still-only cards'
  // full art framed on the face (the user's pick of 2026-11-23)
  const STILLS = (P.get('stills') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const entries = STILLS.length
    ? STILLS.map((s) => ({ key: s, charId: s.split('@')[0], skinId: s.includes('@') ? s : `${s}#2` }))
    : Object.entries(g).map(([key, e]) => ({ key, ...e })).sort((a, b) => (a.charId + a.skinId).localeCompare(b.charId + b.skinId));
  const pages = [];
  for (let i = 0; i < entries.length; i += PER) pages.push(entries.slice(i, i + PER));
  const page = Math.max(0, Math.min(pages.length - 1, (Number(P.get('page')) || 1) - 1));
  const allNames = pages.map((pg) => pg.map(nameOf));
  review = { pages, page, stage, allNames, names: allNames[page] || [] };
  draw();
  renderBar(null);
  frameEditor();
}
boot().catch((err) => console.error('[review] boot failed', err));
