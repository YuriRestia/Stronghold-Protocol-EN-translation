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
import { setDynModule, setDynQuality } from '/js/ui/dynCards.js';
import { cardStore, CARD_KEY } from '/js/ui/seatArt.js';
import { outfitStore } from '/js/ui/outfits.js';

const P = new URLSearchParams(location.search);
// &main: the cards drawn on the page's own thread, not in Workers (render/dynillust/index.js __dynMainThread)
if (P.has('main')) globalThis.__dynMainThread = true;
const SCREEN =['result', 'room', 'ga'].includes(P.get('screen')) ? P.get('screen') : 'result';
const PER = SCREEN === 'ga' ? 8 : 4;
const DEVICE = P.get('device') === 'phone' ? 'phone' : 'pc';
const FRAME = P.has('frame');
const SLOW = Math.max(0, Number(P.get('slow')) || 0); // MB/s, 0 = the connection as it is
const SHOT = P.has('shot');
// &tier=half|full: the renderer's page tier on any device (the half-size art comparison); default as in the game
const TIER = ['half', 'full'].includes(P.get('tier')) ? P.get('tier') : null;
const app = document.getElementById('app');
const bar = document.getElementById('rvbar');

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
globalThis.__review = { special: () => act('special'), start: () => act('start'), replay: () => { replay++; draw(); }, state: () => review, measure };

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
    + `<span class="names">${review ? (review.pages[page] || []).map((e, i) => `${i + 1}. ${review.allNames[page]?.[i] || e.charId}`).join(' · ') : 'loading…'}</span>`;
  bar.onclick = (ev) => {
    const a = ev.target.closest('button')?.dataset.act;
    if (!a) return;
    if (a.startsWith('s:')) go({ screen: a.slice(2), page: 1 });
    else if (a.startsWith('d:')) go({ device: a.slice(2) });
    else if (a === 'prev') go({ page: Math.max(1, page) });
    else if (a === 'next') go({ page: Math.min(total, page + 2) });
    else if (a === 'slow') go({ slow: SLOW ? null : 1 });
    else if (a === 'tier') go({ tier: TIER === 'half' ? null : 'half' });
    else call(a)();
  };
}
addEventListener('keydown', (e) => {
  if (e.key === '`') bar?.classList.toggle('hidden');
  if (!review || FRAME) return;
  if (e.key === 'ArrowLeft') go({ page: Math.max(1, review.page) });
  if (e.key === 'ArrowRight') go({ page: Math.min(review.pages.length, review.page + 2) });
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
  const entries = Object.entries(g).map(([key, e]) => ({ key, ...e })).sort((a, b) => (a.charId + a.skinId).localeCompare(b.charId + b.skinId));
  const pages = [];
  for (let i = 0; i < entries.length; i += PER) pages.push(entries.slice(i, i + PER));
  const page = Math.max(0, Math.min(pages.length - 1, (Number(P.get('page')) || 1) - 1));
  const allNames = pages.map((pg) => pg.map(nameOf));
  review = { pages, page, stage, allNames, names: allNames[page] || [] };
  draw();
  renderBar(null);
}
boot().catch((err) => console.error('[review] boot failed', err));
