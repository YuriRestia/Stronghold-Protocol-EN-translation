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
import { SettleFlow, useResultHold } from '/js/screens/settle.js';
import { useState, useEffect } from '/vendor/hooks.module.js';
import { startResultLoad, endResultLoad } from '/js/ui/dynCards.js';
import { RoomScreen } from '/js/screens/room.js';
import { setDynModule, setDynQuality, setDynFraming, setCardArtSeparate, setCardArtAdjust } from '/js/ui/dynCards.js';
import { cardStore, CARD_KEY } from '/js/ui/seatArt.js';
import { outfitStore } from '/js/ui/outfits.js';

const P = new URLSearchParams(location.search);
// &main: the cards drawn on the page's own thread, not in Workers (render/dynillust/index.js __dynMainThread)
if (P.has('main')) globalThis.__dynMainThread = true;
const SCREEN =['result', 'room', 'ga'].includes(P.get('screen')) ? P.get('screen') : 'result';
// &solo (room): the solo room's one tall card (room.mode 'solo'), one operator a page
const SOLO = SCREEN === 'room' && P.has('solo');
const PER = SCREEN === 'ga' ? 8 : SOLO ? 1 : 4;
const DEVICE = P.get('device') === 'phone' ? 'phone' : 'pc';
const FRAME = P.has('frame');
const SLOW = Math.max(0, Number(P.get('slow')) || 0); // MB/s, 0 = the connection as it is
// &ending (result screen): the match's end as the game plays it — the result cards' load starts at m.public `ending`, the
// 3 s settlement pause, then the game's own hold (screens/settle.js useResultHold: the black cover while they still load,
// at most until ui/dynCards.js RESULT_GIVE_UP_MS) and the result screen; a clock shows the time since the end
const ENDING = SCREEN === 'result' && P.has('ending');
// &hang=<n>: the n-th card's download never finishes (a frozen connection), to watch the give-up: the black cover until
// RESULT_GIVE_UP_MS, then the loaded cards get at least RESULT_FIRST_FRAMES_MS to start and the hung one keeps its picture
const HANG = Math.max(0, Math.floor(Number(P.get('hang')) || 0));
const SETTLE_PAUSE_MS = 3000; // DELAYS.SETTLE [src: server/match/match/common.js:19]
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
/** The table's move / zoom on each 2D art's own placement (data/card-art-framing.json stills[art].adjust). */
let STILL_ADJ = {};
/** The framing a card shows now: the user's, else the table's (a still art's: its saved adjustment, else none). */
const frameOf = (k) => framings[k] || (k.startsWith('still:')
  ? (STILL_ADJ[k.slice(6)] ? { mode: 'card', ...STILL_ADJ[k.slice(6)] } : { mode: 'card', zoom: 1, fx: 0.5, fy: 0.5 })
  : tableFraming(k));
// the static art (the user, 2026-11-23: "how do I switch to the static art and edit it as well? im suspicious of the
// crew's framing of them now"): STATIC shows every card's 2D art (动态立绘 off; an illustration's 2D art is placed with
// the illustration's own framing, so editing it edits both), SET_STILLS pages through the still-only full arts, whose
// edits are a move / zoom on top of their generated placement ('still:<art file>' keys), shown as a CSS transform here
let STATIC = P.has('off');
const SET_STILLS = P.get('set') === 'stills';
/** The full art file a card shows (its outfit's, else the operator's own). */
const artBaseOf = (e) => {
  if (e.still) return e.still;
  const o = data.get('assets')?.outfits || {};
  const u = e.skinId && e.skinId !== `${e.charId}#2` ? o.chars?.[e.skinId]?.art : o.defaults?.[e.charId]?.art;
  return String(u || '').split('/').pop();
};
// linked or separate (the user, 2026-11-23: "a way to still link the values since the mismatched ones are the
// exception"): an illustration's 2D art follows it (linked) unless the table's `separate` lists it or it is unlinked
// here; kept in this browser, exported as `separate`
const LINKS_KEY = 'dynReview.separate';
let SEP_DEFAULT = new Set();
const sepEdits = (() => { try { return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}') || {}; } catch { return {}; } })();
const saveSep = () => { try { localStorage.setItem(LINKS_KEY, JSON.stringify(sepEdits)); } catch { /* private mode */ } };
const isSeparate = (k) => (k in sepEdits ? !!sepEdits[k] : SEP_DEFAULT.has(k));
/** What a card's gestures edit: the illustration's framing (live, and a linked 2D art with it), or the 2D art's own
 * placement (an unlinked one in static mode, still-only arts) — separate settings (the user, 2026-11-23). */
const editKey = (e) => (e.still || (STATIC && isSeparate(e.key)) ? `still:${artBaseOf(e)}` : e.key);
/** The still-only arts of data/card-art-framing.json as review entries: an outfit's (its id), else an operator's own. */
async function stillEntries() {
  const t = await fetch('/data/card-art-framing.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const stills = new Set(Object.keys(t?.stills || {}));
  const o = data.get('assets')?.outfits || {};
  const base = (u) => String(u || '').split('/').pop();
  const out = [];
  for (const [id, rec] of Object.entries(o.chars || {})) if (stills.has(base(rec?.art))) out.push({ key: id, charId: id.split('@')[0], skinId: id, still: base(rec.art) });
  for (const [cid, rec] of Object.entries(o.defaults || {})) if (stills.has(base(rec?.art))) out.push({ key: cid, charId: cid, skinId: `${cid}#2`, still: base(rec.art) });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
/** The framing the cards mount with (setDynFraming): the URL's &fr / &framing first, then the user's; null = the table's. */
// &zoomall=Z: every card at the card framing zoomed by Z about its centre (tools/card-art-framing.mjs --zoom: a zoomed-out
// capture shows the whole illustration, which the full art matches far better than a tight crop — Chongyue's E2, 2026-11-23)
const ZOOMALL = Number(P.get('zoomall')) || 0;
const decideFraming = (k) => {
  if (ZOOMALL > 0) return { mode: 'card', zoom: ZOOMALL, fx: 0.5, fy: 0.5 };
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

/**
 * &hang: a fetch whose answer never comes for the hung card's files (its illustration's folder), as a frozen connection.
 * Which card: the n-th of the page shown when the request is made.
 */
function hangFetch(base, n) {
  const dir = () => {
    const e = review?.pages[review.page]?.[n - 1];
    const path = e && review.stage?._group?.[e.key]?.path;
    return path ? (String(path).match(/dynillust\/([^/]+)\//) || [])[1] : null;
  };
  return (url, opts) => {
    const d = dir();
    return d && String(url).includes(`dynillust/${d}/`) ? new Promise(() => {}) : base(url, opts);
  };
}

/** The renderer this page uses: the page's own, or one on a throttled or frozen connection (page thread). */
async function installRenderer() {
  await ensurePixi();
  const R = await import('/js/render/dynillust/index.js');
  if (!SLOW && !HANG) return R.getDynIllustStage();
  const base = SLOW ? slowFetch(SLOW) : (url, opts) => fetch(url, opts);
  const st = new R.DynIllustStage({ manifest: () => assets.local(), fetch: HANG ? hangFetch(base, HANG) : base });
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
  const n = NAMES[e.skinId] || NAMES[String(e.skinId || '').toLowerCase()];
  if (n) return `${n.op} · ${n.outfit}${n.cnOnly ? ' (CN only)' : ''}`;
  const chess = data.list('chess').find((c) => c && c.charId === e.charId) || Object.values(data.get('backups')?.units || {}).find((u) => u && u.charId === e.charId);
  const outfit = e.skinId === `${e.charId}#2` ? 'Elite 2 art' : data.lookup('outfits', e.skinId)?.name || e.skinId;
  return `${chess?.name || e.charId} · ${outfit}`;
}

function fakeRoom(group, ids) {
  return {
    code: 'REVIEW', hostId: ids[0], mode: SOLO ? 'solo' : 'coop', difficulty: 'HARD', inMatch: false, ...(SCREEN === 'ga' ? { capacity: 8 } : {}),
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

/**
 * &ending: the match's end as screens/game.js plays it. The cards' illustrations are freed first (a cold load from the
 * HTTP cache, as after a match that kept none), the load starts at `ending`, a stand-in match screen holds through the
 * settlement pause, then the game's hold and the result screen (a spectator's 同盟, the cards' entrance). Replay
 * entrance plays it again.
 */
function EndingFlow({ group, res }) {
  const [phase, setPhase] = useState('start');
  const [t0, setT0] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    let live = true, id = 0;
    try { review.stage?.release?.([]); } catch { /* a stand-in */ }
    // a frame later, so the freed illustrations are gone before the load asks for them again
    const raf = requestAnimationFrame(() => {
      if (!live) return;
      startResultLoad(() => group.map((e) => ({ art: { charId: e.charId, outfit: e.skinId === `${e.charId}#2` ? null : e.skinId }, mine: false })));
      setT0(performance.now());
      setPhase('match');
      id = setTimeout(() => { if (live) setPhase('result'); }, SETTLE_PAUSE_MS);
    });
    const clock = setInterval(() => tick((n) => n + 1), 100);
    return () => { live = false; cancelAnimationFrame(raf); clearTimeout(id); clearInterval(clock); endResultLoad(); };
  }, []);
  const hold = useResultHold(phase === 'result');
  const showResult = phase === 'result' && !(hold.wait > 0);
  const s = t0 ? ((performance.now() - t0) / 1000).toFixed(1) : '0.0';
  const what = phase !== 'result' ? 'settlement pause' : hold.wait > 0 || hold.cover ? 'black cover: waiting for the cards' : 'result screen';
  return html`${showResult
    ? html`<${SettleFlow} res=${res} myId=${null} backLabel="Back" onBack=${() => {}} />`
    : html`<div style="position:fixed;inset:0;display:grid;place-items:center;background:#1b2226;color:#8fa;font:600 28px sans-serif">MATCH SCREEN (stand-in): the last battle is over</div>`}${hold.cover}<div style="position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:10002;padding:6px 10px;background:#000c;color:#fff;font:600 15px/1.3 sans-serif;border-radius:4px;pointer-events:none">${s} s since the match ended · ${what}${HANG ? ` · card ${HANG}'s download hangs` : ''}</div>`;
}

function Screen() {
  const { pages, page } = review;
  const group = pages[page] || [];
  const ids = group.map((_, i) => `rv${page}_${i}`);
  if (SCREEN === 'result' && ENDING) return html`<${EndingFlow} key=${`${page}|${replay}`} group=${group} res=${fakeResult(group, ids)} />`;
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
 * page"): the screen re-mounts with the page's cards, the URL's &page follows (a reload lands there), and the renderer
 * frees every illustration the new page does not show (coming back to a freed page drew it black until the loader's fix
 * of 2026-11-23, Dev 50's 565bb529a).
 */
function goPage(n) {
  if (!review || !(n >= 0 && n < review.pages.length) || n === review.page) return;
  review.page = n;
  review.names = review.allNames[n] || [];
  const u = new URL(location.href); u.searchParams.set('page', String(n + 1)); history.replaceState(null, '', u);
  draw();
  try { review.stage?.release?.(review.pages[n].map((e) => e.key)); } catch (err) { console.warn('[review] release', err); }
  renderBar(null);
  frameEditor();
}
globalThis.__review = { special: () => act('special'), start: () => act('start'), replay: () => { replay++; draw(); }, state: () => review, measure, goPage };

/** Apply `key`'s framing now: to its running cards (the renderer's setFraming: the camera moves, nothing restarts), to
 * the 2D art in static mode (a re-render: CardArt places it with the same value), or to a still's transform. */
function applyFraming(k) {
  if (k.startsWith('still:')) {
    draw(); // the card places its 2D art with the edit (setCardArtAdjust)
    return;
  }
  const f = frameOf(k);
  for (const c of review.stage?.cards || []) if (c.key === k) c.setFraming?.(f);
  if (STATIC) draw();
}
/** Static art on / off in place: the cards re-mount as 2D art or as illustrations (loaded ones come back at once). */
function setStatic(on) {
  STATIC = on;
  settingsStore.set({ dynIllust: on ? 'off' : 'all' });
  const u = new URL(location.href); if (on) u.searchParams.set('off', '1'); else u.searchParams.delete('off'); history.replaceState(null, '', u);
  replay++; draw(); renderBar(null); frameEditor();
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
    // the zoom box (typed, to a tenth of a percent) follows the gestures unless it is being typed in
    // the typed boxes (zoom %, X / Y: the move in % of the card) follow the gestures unless being typed in
    const label = (el, k) => {
      const v = fromFraming(frameOf(k));
      const vals = { z: v.z * 100, x: v.tx * 100, y: v.ty * 100 };
      for (const inp of el?.querySelectorAll('input[data-f]') || []) if (document.activeElement !== inp) inp.value = (+vals[inp.dataset.f].toFixed(1)).toString();
      const m = el?.querySelector('i'); if (m) m.textContent = framings[k] ? '✎' : '';
    };
    // a typed value: the zoom about the card's centre (the position kept), or the move
    layer.addEventListener('input', (ev) => {
      const inp = ev.target.closest('input[data-f]'); const el = inp?.closest('.rvz'); const k = keyOf(el);
      const n = Number(inp?.value);
      if (!k || !Number.isFinite(n) || inp.value === '') return;
      const v = fromFraming(frameOf(k));
      if (inp.dataset.f === 'z') {
        const z = n / 100;
        if (!(z >= 0.3 && z <= 5)) return;
        const qx = (0.5 - v.tx) / v.z, qy = (0.5 - v.ty) / v.z;
        set(k, { z, tx: 0.5 - z * qx, ty: 0.5 - z * qy }, el);
      } else set(k, { ...v, [inp.dataset.f === 'x' ? 'tx' : 'ty']: n / 100 }, el);
    });
    layer.addEventListener('change', (ev) => {
      // the link: this illustration's 2D art follows it, or keeps its own placement
      const box = ev.target.closest('input[data-link]');
      if (box) {
        sepEdits[box.dataset.link] = !box.checked;
        saveSep(); draw(); renderBar(null); frameEditor();
        return;
      }
      if (ev.target.closest('input')) done();
    });
    layer.addEventListener('keydown', (ev) => { if (ev.target.closest('input')) ev.stopPropagation(); });
    // the end of a gesture: kept, and the 2D art placed at the same value
    const done = () => { saveFramings(); draw(); renderBar(null); };
    layer.addEventListener('pointerdown', (ev) => {
      const el = ev.target.closest('.rvz'); const k = keyOf(el);
      if (!k || ev.button !== 0 || ev.target.closest('button, label')) return;
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
      if (!k || ev.target.closest('label')) return;
      delete framings[k];
      applyFraming(k); label(el, k); done();
    });
    // the cards rise in and the window resizes: follow them
    setInterval(placeEditor, 400);
  }
  const group = review.pages[review.page] || [];
  layer.innerHTML = group.map((e, i) => {
    const k = editKey(e);
    const v = fromFraming(frameOf(k));
    const num = (f, val, step) => `<input type="number" data-f="${f}" step="${step}" value="${+val.toFixed(1)}">`;
    // static mode, an illustration's card: its link (checked = the 2D art follows the illustration)
    const link = STATIC && !e.still ? `<em title="Linked: the static art follows the animation's framing"><input type="checkbox" data-link="${e.key}"${isSeparate(e.key) ? '' : ' checked'}>link</em>` : '';
    const mode = k.startsWith('still:') ? 'static' : STATIC ? 'static = live' : 'live';
    return `<div class="rvz" data-i="${i}" data-k="${k}" title="Drag to move, wheel to zoom (Shift: finer), type the values, double-click to reset — ${review.names[i] || e.key}">`
      + `<label><span>${mode}</span>${link}zoom ${num('z', v.z * 100, 0.1)}% X ${num('x', v.tx * 100, 0.1)} Y ${num('y', v.ty * 100, 0.1)}<i>${framings[k] ? '✎' : ''}</i></label></div>`;
  }).join('');
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
  const names = new Map(review.pages.flatMap((pg, p) => pg.map((e, i) => [editKey(e), review.allNames[p]?.[i] || e.key])));
  // every illustration of the table (whichever set this page shows), and the still arts edited here: a move / zoom
  // (zoom, fx, fy about the card) on top of the art's generated placement
  const cards = {};
  for (const k of Object.keys(TABLE).sort()) {
    const f = frameOf(k);
    cards[k] = { zoom: f.zoom, fx: f.fx, fy: f.fy, edited: !!framings[k], ...(names.has(k) ? { name: names.get(k) } : {}) };
  }
  const stills = {};
  for (const [k, f] of Object.entries(framings)) if (k.startsWith('still:')) stills[k.slice(6)] = { zoom: f.zoom, fx: f.fx, fy: f.fy, ...(names.has(k) ? { name: names.get(k) } : {}) };
  // the illustrations whose 2D art keeps its own placement (tools/card-art-framing.mjs --separate)
  const separate = Object.keys(TABLE).filter(isSeparate).sort();
  const out = { exported: new Date().toISOString(), edited: Object.values(cards).filter((c) => c.edited).length, stillsEdited: Object.keys(stills).length, total: Object.keys(cards).length, separate, cards, stills };
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
    + (SCREEN === 'result' ? btn('Match end', ENDING, 'ending') + btn(HANG ? `Card ${HANG} hangs` : 'Hang a card', !!HANG, 'hang') : '')
    + btn(TIER === 'half' ? 'Half-size art' : 'Half-size art: off', TIER === 'half', 'tier')
    + (SCREEN !== 'result' ? '<span class="sep"></span>'
      + btn('Static art', STATIC, 'static') + btn(SET_STILLS ? 'Still-only arts' : 'Still-only arts: off', SET_STILLS, 'stills')
      + btn(`Export framings (${Object.keys(framings).length} edited)`, false, 'export') + btn('Clear my framings', false, 'clear') : '')
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
    else if (a === 'ending') go({ ending: ENDING ? null : 1, hang: ENDING ? null : HANG || null });
    else if (a === 'hang') go({ hang: HANG ? null : 1, ending: 1 });
    else if (a === 'tier') go({ tier: TIER === 'half' ? null : 'half' });
    else if (a === 'export') exportFramings();
    else if (a === 'static') setStatic(!STATIC);
    else if (a === 'stills') go({ set: SET_STILLS ? null : 'stills', page: 1 });
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
  settingsStore.set({ dynIllust: STATIC ? 'off' : 'all', resultArt: 'card' }); // &off: the 2D cards (the perf baseline)
  if (SCREEN !== 'result') {
    TABLE = await fetch('/data/dyn-card-framing.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => j?.cards || {}).catch(() => ({}));
    const art = await fetch('/data/card-art-framing.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    SEP_DEFAULT = new Set(Array.isArray(art?.separate) ? art.separate : []);
    STILL_ADJ = Object.fromEntries(Object.entries(art?.stills || {}).filter(([, e]) => e?.adjust).map(([a, e]) => [a, e.adjust]));
    setCardArtSeparate((k) => (k in sepEdits ? !!sepEdits[k] : undefined));
    // a still edit here places the card's 2D art itself (as the game would with it saved)
    setCardArtAdjust((a) => framings[`still:${a}`] || undefined);
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
  // &set=stills: every still-only full art of data/card-art-framing.json, paged like the illustrations (the user,
  // 2026-11-23: "how do I switch to the static art and edit it as well"); `still` = its art file, the edit's key
  const stillSet = SET_STILLS ? await stillEntries() : null;
  // the players' outfit ids as the outfit data spells them: the index has 7 Ambience Synesthesia ids in lowercase
  // (`@ambiencesynesthesia#N`, the user's report of 2026-11-23: Pramanix alter showed her E2 art), which a real player
  // never wears — the made-up players wear the real spelling, as in a match
  const canon = new Map(Object.keys(data.get('assets')?.outfits?.chars || {}).map((id) => [id.toLowerCase(), id]));
  const real = (e) => (e.skinId && canon.has(e.skinId.toLowerCase()) ? { ...e, skinId: canon.get(e.skinId.toLowerCase()) } : e);
  const entries = stillSet || (STILLS.length
    ? STILLS.map((s) => ({ key: s, charId: s.split('@')[0], skinId: s.includes('@') ? s : `${s}#2` }))
    : Object.entries(g).map(([key, e]) => real({ key, ...e })).sort((a, b) => (a.charId + a.skinId).localeCompare(b.charId + b.skinId)));
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
