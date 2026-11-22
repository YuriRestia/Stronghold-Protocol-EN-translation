// ui/dynCards.js — (fork) the operators' official dynamic illustrations (动态立绘: Spine 3.8 skeletons with their Unity
// effects and backgrounds) on the result, room and Grand Alliance cards: one card component for the three screens, the
// setting that decides which cards play one, which art each card shows, and when the illustrations load.
// Spec: crew-docs/l2d-art-proposal.md §1 (the user's decisions D5–D11 of 2026-11-22), §5. DESIGN §10 (Result, Room).
//
//   设置「动态立绘」 (`dynIllust`, D7): 关 / 仅自己 / 所有人 — 'auto' is 仅自己 on a phone and 所有人 elsewhere.
//   设置「结算卡片立绘」 (`resultArt`, D6): a result card shows the player's room card in its outfit (the default), or the
//     ace of the final lineup — for every card, from this viewer's side.
//   Loading (D10 / D11): nothing during the match. The result cards' illustrations start loading the moment the server
//     says the last battle is over (m.public `ending`, server/match/results.js endingView) and load through the
//     settlement pause; past the pause the result screen waits behind a black cover until they are in, at most until
//     RESULT_GIVE_UP_MS after `ending` (screens/game.js; the user's correction of 2026-11-23, which replaced D11's "another
//     3 s" with the match screen held). The room / Grand Alliance cards load once the room screen has what it needs (loadLater.js) and
//     after the entry film's files (D10, the first-impression rule). A card whose illustration is not ready shows its 2D
//     art and switches when it is (D11). On the result screen how a card appears and switches (no intro, no fade on
//     appear; the official controller's crossfade on a late switch — the user, 2026-11-22) is the renderer's. The room
//     cards switch as a group, once the page runs smoothly, with the official card's dissolve (the group flip below).
//
// The renderer is reached only through the contract's mount API (docs/design/vfx-format.md §33.19): dynIllustKey and
// getDynIllustStage → stage.preload / stage.mount → Card { canvas, ready, start(), state, unmount() }. The stage is the
// page's (one WebGL context, offscreen); each card's own 2D canvas goes into the card's art window under its overlays.
// The renderer and PIXI load on first use; when the match starts, release() frees what no card shows. Where the renderer
// cannot load, ui/dynStub.js stands in: same API, every card 2D.

import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { createStore, useStore } from '../store.js';
import { data, useData } from '../data.js';
import { settingsStore } from './settingsStore.js';
import { touchDevice } from '../render/vfx/tier.js';
import { screenShortSide, PHONE_MAX_SIDE, reducedMotion } from './device.js';
import { loadDissolve, dissolveMaskUrl, artPlacement, paintBackgroundStyle, drawDissolve, dissolvePicture, freeDissolvePicture, batchDissolve, batchBloom, flushBatch, reserveTiles, BLOOM, glowStyle, sweepRange, ANIM_DELAY_S } from './cardEntrance.js';
import { choiceOf } from './outfits.js';
import { seatOperator, cardContext, cardOperators, CARD_KEY, cardStore } from './seatArt.js';
import { whenScreenSettled } from '../loadLater.js';
import { uiUrl } from './assetUrls.js';
import * as stub from './dynStub.js';

// ---- 设置「动态立绘」 (D7) ------------------------------------------------------------------------------------------

/** The modes a card can resolve to. */
export const DYN_ILLUST_MODES = Object.freeze(['off', 'mine', 'all']);

/** A phone: a touch-first device whose shorter screen side is under PHONE_MAX_SIDE (ui/device.js, the fullscreen rule). */
export function phoneDevice(touch = touchDevice(), shortSide = screenShortSide()) {
  return !!touch && shortSide > 0 && shortSide < PHONE_MAX_SIDE;
}

/**
 * The mode a setting value plays: 'auto' (and anything unknown) is 'mine' on a phone, 'all' elsewhere (D7).
 * @param {string} value settings.dynIllust
 * @returns {'off'|'mine'|'all'}
 */
export function dynIllustMode(value, phone = phoneDevice()) {
  if (value === 'off' || value === 'mine' || value === 'all') return value;
  return phone ? 'mine' : 'all';
}

/** Whether a card plays its illustration: every card on 所有人, one's own on 仅自己, none on 关 (spec §5.2). */
export function cardAnimates(mode, mine) {
  return mode === 'all' || (mode === 'mine' && !!mine);
}

/** The mode the settings ask for now (re-renders on a change). */
export function useDynIllustMode() {
  const value = useStore((s) => s.dynIllust, Object.is, settingsStore);
  return dynIllustMode(value);
}

// ---- which art a card shows (D6) ----------------------------------------------------------------------------------

/**
 * A card's art: the chess record it draws and the owner's outfit for that operator (null = the default look). The
 * outfit follows ui/outfits.js choiceOf: one's own choice, another seat's from room.state seats[].outfits — data every
 * client already holds (nothing new over the socket).
 * @param {any} chess a chess record (or null: no art)
 * @param {string|null} ownerId
 * @param {(ownerId: string|null) => Record<string, string>} [choices]
 * @returns {{ chess: any, charId: string, outfit: string|null } | null}
 */
export function cardArtOf(chess, ownerId, choices = choiceOf) {
  const charId = chess && typeof chess.charId === 'string' ? chess.charId : null;
  if (!charId) return null;
  return { chess, charId, outfit: (choices(ownerId) || {})[charId] || null };
}

/**
 * The room card's art of a seat (名片干员, ui/seatArt.js seatOperator): null for an empty seat or an AI seat.
 * @param {any} seat room.state seat, or `{ playerId }` when the room is gone
 * @param {any} ctx ui/seatArt.js cardContext()
 * @param {{ myId?: string|null, myCard?: string|null, choices?: Function }} [o]
 */
export function roomCardArt(seat, ctx, { myId = null, myCard = null, choices = choiceOf } = {}) {
  const op = seatOperator(seat, ctx, { myId, myCard });
  return op ? cardArtOf(op.chess, seat.playerId, choices) : null;
}

/**
 * A result card's art (D6, from the viewer's side, every card alike): 'card' — the player's room card (the official card
 * shows the player's assistant, spec §2; the default, the user's decision of 2026-11-22); 'ace' — the best unit of the
 * final lineup. An AI seat has no room card: its card shows the ace either way (the remake's card before).
 * @param {'card'|'ace'} resultArt settings.resultArt
 * @param {{ isBot?: boolean, playerId: string }} player
 * @param {{ aceChess?: any, seat?: any, ctx: any, myId?: string|null, myCard?: string|null, choices?: Function }} o
 */
export function resultCardArt(resultArt, player, { aceChess = null, seat = null, ctx, myId = null, myCard = null, choices = choiceOf }) {
  const ace = () => cardArtOf(aceChess, player.playerId, choices);
  if (resultArt === 'ace' || player.isBot) return ace();
  return roomCardArt(seat || { playerId: player.playerId }, ctx, { myId, myCard, choices }) || ace();
}

/**
 * The room cards as a match screen reads them (the strategy draft's name cards, the result cards): the card context of
 * the match's version (its chess and 自选编队 pool, as on the room's seat cards), this browser's own pick, and a seat by
 * player id — the room's seat, or `{ playerId }` when the room is gone (the default card chosen by the player id).
 * @param {any} gd useGameData()
 */
export function useMatchCards(gd) {
  const ctx = useMemo(() => cardContext(cardOperators(gd.list('chess'), gd.backups), { pending: !gd.backups }), [gd.ready, gd.backups]);
  const myCard = useStore((s) => s[CARD_KEY], Object.is, cardStore);
  const roomSeats = useStore((s) => s.room?.seats);
  const seatOf = (playerId) => (Array.isArray(roomSeats) && roomSeats.find((x) => x && x.playerId === playerId)) || { playerId };
  return { ctx, myCard, seatOf };
}

// ---- the renderer (the contract's mount API) -----------------------------------------------------------------------

/**
 * The renderer module (render/dynillust/index.js: `getDynIllustStage`, `dynIllustKey`), loaded on first use — a room
 * opening, the result load — with PIXI and pixi-spine first (render/app/pixi.js ensurePixi: the renderer reads the PIXI
 * global): neither is fetched at page load, behind the entry film, nor during a match. A page where it fails to load
 * keeps every card 2D (ui/dynStub.js stands in).
 */
let mod = null;
let modPromise = null;
function renderer() {
  if (mod) return Promise.resolve(mod);
  if (!modPromise) {
    modPromise = import('../render/app/pixi.js').then((p) => p.ensurePixi())
      .then(() => import('../render/dynillust/index.js'))
      .then((m) => (mod = m), (err) => { console.warn('[dynillust] renderer unavailable', err); return (mod = stub); });
  }
  return modPromise;
}

/** Install a renderer module (tests, the review pages) — null: the stand-in, every card 2D. */
export function setDynModule(next) {
  mod = next && typeof next.getDynIllustStage === 'function' && typeof next.dynIllustKey === 'function' ? next : stub;
  modPromise = Promise.resolve(mod);
}

/**
 * The page's stage, its index loaded and its quality set: one for the whole page (the renderer's), never destroyed by a
 * screen.
 */
let qualityOverride = null;
/** The review page's tier switch: the pages every card gets ('half' | 'full' | null = by the cards' size). */
export function setDynQuality(q) { qualityOverride = q === 'half' || q === 'full' ? q : null; tierChanged(); }

/**
 * A card's framing in the renderer (mount option, vfx-format.md §33.19): 'card' — the official end-of-match card's (the
 * default); 'home' — the official home screen's (DEFAULT adjust in its 16:9 window, the operator left of centre;
 * dev57-home-framing.md); 'home-illust' — the same, the operator centred; or an object { mode, centre, zoom, fx, fy }
 * (the renderer's zoom about a point of the card, framing.js cardFraming). The review page can set one for every card, or
 * one per illustration key (a function), for the framing stills and the framing tool.
 */
let framingOverride = null;
export function setDynFraming(f) {
  framingOverride = typeof f === 'function' || f === 'card' || f === 'home' || f === 'home-illust' ? f : null;
}
export function framingOpts(f) {
  if (f && typeof f === 'object') return { framing: f };
  return f === 'home' ? { framing: 'home' } : f === 'home-illust' ? { framing: 'home', centre: 'illust' } : {};
}
/**
 * A wide room card's framing per illustration (the user's pick of 2026-11-23, "card zoom", framed on the operator's face):
 * data/dyn-card-framing.json, generated by tools/dyn-cover-framing.mjs from each illustration's own rig (its face and
 * head bones) and its measured coverage — key → { zoom, fx, fy }: the card framing zoomed about (fx, fy) of the card.
 * One value per illustration drives the live illustration and everything placed to match it (the 2D cover).
 */
let coverTable = null;
let coverLoad = null;
export function loadCoverFraming() {
  coverLoad ||= fetch('/data/dyn-card-framing.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { coverTable = new Map(Object.entries(j?.cards || {})); }, () => { coverTable = new Map(); });
  return coverLoad;
}
/** The framing of illustration `key` on a wide card: { mode: 'card', zoom, fx, fy }, or null (the plain card framing). */
export function coverFraming(key) {
  const c = coverTable?.get(key);
  return c && c.zoom > 0 ? { mode: 'card', zoom: c.zoom, fx: c.fx, fy: c.fy } : null;
}
/** The zoom a cover card of `key` draws with, the review page's override first ('card': none; an object: that one), so the
 * 2D art (cardArtRect) follows the same value as the illustration. */
function coverValue(key) {
  const o = typeof framingOverride === 'function' ? framingOverride(key) : framingOverride;
  if (o === 'card') return null;
  if (o && typeof o === 'object') return o;
  return coverFraming(key);
}
/** The framing a card of illustration `key` mounts with: the review page's override, else the card's own. */
function framingFor(key, own) {
  const o = typeof framingOverride === 'function' ? framingOverride(key) : framingOverride;
  if (!o && own === 'cover') return framingOpts(coverFraming(key));
  return framingOpts(o || own);
}
/** A wide (cover) card's framing now, as setFraming takes it: [framing, centre] ('card' = no zoom). The review page's
 * zoom switch reframes the mounted cards in place with it. */
export function coverFramingNow(key) {
  const o = framingFor(key, 'cover');
  return [o.framing || 'card', o.centre];
}

/**
 * Where a wide card's 2D art sits (the user's picks of 2026-11-23: the outfit's full art, where the illustration draws;
 * a still-only operator framed on its face): data/card-art-framing.json, generated by tools/card-art-framing.mjs — the
 * full art's box in official card units from the card's centre (u = min(w / 232, h / 458) px a unit, as the renderer's
 * card framing, framing.js unityToCard), per full-art file. An illustration's art is registered on the illustration itself
 * and zoomed with that illustration's own value (coverFraming), so the 2D art and the live illustration move as one; a
 * still-only art carries its own framing.
 */
let artTable = null;
let artLoad = null;
export function loadCardArtFraming() {
  artLoad ||= Promise.all([
    fetch('/data/card-art-framing.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    loadCoverFraming(),
  ]).then(([j]) => {
    const m = new Map();
    for (const [key, e] of Object.entries(j?.l2d || {})) if (e?.art && Array.isArray(e.rect)) m.set(e.art, { rect: e.rect, key });
    for (const [art, e] of Object.entries(j?.stills || {})) if (Array.isArray(e?.rect) && !m.has(art)) m.set(art, { rect: e.rect, key: null });
    artTable = m;
  });
  return artLoad;
}
/** The table's entry for a full art (its manifest path or URL), or null. */
export function cardArtEntry(src) {
  const base = String(src || '').split(/[?#]/)[0].split('/').pop();
  return (base && artTable?.get(base)) || null;
}
/** The full art's box on a w × h card in % of the card ({ left, top, width, height }): the entry's box, then its
 * illustration's zoom about (fx, fy) of the card. */
export function cardArtRect(entry, w, h) {
  if (!entry || !(w > 0 && h > 0)) return null;
  const f = entry.key ? coverValue(entry.key) : null;
  const zoom = f?.zoom || 1, fx = f?.fx ?? 0.5, fy = f?.fy ?? 0.5;
  const u = Math.min(w / 232, h / 458);
  const [L, T, W, H] = entry.rect;
  const cx = fx * w, cy = fy * h;
  const x = cx + (w / 2 + u * L - cx) * zoom, y = cy + (h / 2 + u * T - cy) * zoom;
  return { left: (100 * x) / w, top: (100 * y) / h, width: (100 * u * W * zoom) / w, height: (100 * u * H * zoom) / h };
}

/** The full art `src`'s box on a w × h card in the card's CSS px ({ x, y, w, h }, may pass the card's edges), or null
 * without a placement (the table not loaded, or no entry: the art then shows object-fit cover). For the dissolve's cover. */
export function staticPlacement(src, w, h) {
  const p = cardArtRect(cardArtEntry(src), w, h);
  return p ? { x: (p.left * w) / 100, y: (p.top * h) / 100, w: (p.width * w) / 100, h: (p.height * h) / 100 } : null;
}

/**
 * (fork) A wide room card's 2D art: the official full art `src` placed where its illustration draws (or framed on the
 * face), inside the card's art box — its containing block, measured. `fallback` (the portrait) shows when the art has no
 * entry or fails to load; nothing shows for the moment the small table takes to arrive.
 */
export function CardArt({ src, fallback = null, class: cls = '' }) {
  const [ready, setReady] = useState(!!artTable);
  const [bad, setBad] = useState(false);
  const [box, setBox] = useState(null);
  const ref = useRef(null);
  useEffect(() => { if (!artTable) loadCardArtFraming().then(() => setReady(true)); }, []);
  useEffect(() => { setBad(false); }, [src]);
  const entry = ready && src && !bad ? cardArtEntry(src) : null;
  useEffect(() => {
    const el = ref.current?.offsetParent;
    if (!entry || !el) return undefined;
    // the percentages resolve against the box's padding box (clientWidth / clientHeight), as the illustration's canvas
    const measure = () => { const w = el.clientWidth, h = el.clientHeight; if (w > 0 && h > 0) setBox((b) => (b && b[0] === w && b[1] === h ? b : [w, h])); };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [entry]);
  if (!ready) return null;
  if (!entry) return fallback;
  const p = box ? cardArtRect(entry, box[0], box[1]) : null;
  const style = p ? `inset:auto;left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%;max-width:none;object-fit:fill` : 'visibility:hidden';
  return html`<img ref=${ref} class=${`card-art${cls ? ` ${cls}` : ''}`} src=${src} alt="" draggable=${false} style=${style} onError=${() => setBad(true)} />`;
}

// ---- the page tier: half pages when the cards are drawn small enough (the user's choice of 2026-11-22: "automatic by
// card size") ---------------------------------------------------------------------------------------------------------

/** The official card's illustration window (group_char, 232 × 458 units) [src: ui/dynCards.js BACKDROP.win]. */
const WIN_W = 232, WIN_H = 458;
/**
 * Half pages while the art window is drawn at most this many device px per official unit: there a half page still has
 * about one texel per screen pixel. Measured on the GPU preview (work/dev-52 tierdata: the sharpness of each card's
 * canvas, half ÷ full): at 0.79–1.01 px/unit half kept 74–100 % of full's detail, at 1.18 it kept 62–82 %, at 1.43 58–75 %,
 * at 1.88 36–50 % — so up to 1, full above.
 */
export const HALF_MAX_SCALE = 1;
/** The renderer draws a card at most at this device pixel ratio [src: render/dynillust/renderer.js MAX_DPR]. */
const MAX_DPR = 2;

/** A card's tier from its art window's CSS size: 'half' when drawn at ≤ HALF_MAX_SCALE device px per official unit. */
export function cardTier(cssW, cssH, dpr = globalThis.devicePixelRatio || 1) {
  const d = Math.min(MAX_DPR, Math.max(1, dpr));
  if (!(cssW > 0) || !(cssH > 0)) return null;
  return Math.min((cssW * d) / WIN_W, (cssH * d) / WIN_H) <= HALF_MAX_SCALE ? 'half' : 'full';
}

/**
 * The result card's art window before the screen exists (the result load starts in the settlement pause, D10):
 * screens/settle.css `.tcard` 3.47rem wide, `.tcard__art` 5.4rem tall.
 */
export function resultCardTier() {
  const rem = parseFloat(globalThis.getComputedStyle?.(globalThis.document?.documentElement)?.fontSize) || 0;
  return cardTier(3.47 * rem, 5.4 * rem) || 'full';
}

/** The tier each mounted card wants (its art window's size, kept current on resize). */
const wants = new Map();
let pageTier = 'full';
/** Ticks when the page tier changes: every card re-mounts at the new tier. */
export const dynTierStore = createStore({ tier: pageTier });
let tierTimer = 0;
/** The page tier: the override, else full while any card wants full, else half; cards that agree change it together. */
function tierChanged() {
  clearTimeout(tierTimer);
  tierTimer = setTimeout(() => {
    const vals = [...wants.values()];
    // the result screen with kept illustrations stays on the tier they were kept at (follow-up A: no reload of them)
    const next = qualityOverride || resultPin || (vals.length ? (vals.includes('full') ? 'full' : 'half') : pageTier);
    if (next !== pageTier) { pageTier = next; dynTierStore.set({ tier: next }); }
  }, 0);
}
function setWant(token, tier) {
  if (tier) wants.set(token, tier); else wants.delete(token);
  tierChanged();
}

/**
 * (fork) 设置「动态立绘画质」 (`dynQuality`: auto / half / full; the user, 2026-11-22): applied at load and on every change.
 * A change re-mounts the cards at the new tier through dynTierStore, with no reload; only a change of this setting
 * calls setDynQuality, so the review page's `&tier` stays as it set it.
 */
let settingQuality;
function applySettingQuality(s) {
  if (s.dynQuality === settingQuality) return;
  settingQuality = s.dynQuality;
  setDynQuality(settingQuality);
}
applySettingQuality(settingsStore.get());
settingsStore.subscribe(applySettingQuality);

async function readyStage(tier = qualityOverride || pageTier) {
  const R = await renderer();
  const st = R.getDynIllustStage();
  st.quality = tier;
  await st.index();
  return { R, st };
}

/** The dynillust key of an art (its outfit, else the operator's E2 art: the contract's null), or null: none here. */
export function illustKey(R, art) {
  if (!art || !R) return null;
  try { return R.dynIllustKey(art.charId, art.outfit || null) || null; } catch { return null; }
}

// ---- the illustrations kept through the match for its result cards (follow-up A; the user's pick, 2026-11-23, via the
// lead: "go with A") -----------------------------------------------------------------------------------------------

/**
 * The most the kept illustrations may hold on the GPU through a match (MB): the battle renderer needs the GPU meanwhile.
 * Measured per illustration: full median 40 MB, p90 67, max 123; half median 10, p90 17, max 31 [src: work/dev-55
 * gpumem.json, 2026-11-23: every texture decoded RGBA8, no mipmaps].
 */
export const KEEP_CAP_MB = 160; // [ASSUMED: 4 cards at full or 16 at half, at the median; user OK 2026-11-23: "alright, 8s and 160mb"]
/**
 * GPU bytes per downloaded byte, the measured 90th percentile, for an index entry without its own figure (full 4.3–18.9,
 * median 8.9; half 1.3–8.7, median 3.3) [src: work/dev-55 gpumem.json vs data/local-assets.json bytes / bytesHalf].
 */
const GPU_PER_BYTE = Object.freeze({ full: 12.2, half: 4.7 });
/** An index entry's GPU bytes at `tier`: its own figure (`gpu` / `gpuHalf`) when the index has one, else the bound. */
export function keptGpuBytes(entry, tier) {
  if (!entry) return Infinity;
  const own = tier === 'half' ? entry.gpuHalf : entry.gpu;
  if (own > 0) return own;
  const b = tier === 'half' ? entry.bytesHalf : entry.bytes;
  return b > 0 ? b * GPU_PER_BYTE[tier === 'half' ? 'half' : 'full'] : Infinity;
}
/** The keys to keep, in order (one's own card first), while their GPU bytes stay within the cap. */
export function pickKept(keys, tier, entryOf, capMB = KEEP_CAP_MB) {
  const keep = [];
  let sum = 0;
  for (const k of keys) {
    const b = keptGpuBytes(entryOf(k), tier);
    if (sum + b > capMB * 1048576) continue;
    sum += b; keep.push(k);
  }
  return keep;
}
/** The tier the kept illustrations are at (the room's, setting included); the result screen stays on it. */
let keptTier = null, resultPin = null;

/**
 * The match starts (screens/game.js): free every illustration except the result cards' own (`arts`, one's own first),
 * kept at the room's tier within KEEP_CAP_MB, so the result screen shows them with no load. The rest load from m.public
 * `ending` as before. A page that never loaded the renderer does nothing.
 * @param {{ charId: string, outfit: string|null }[]} [arts]
 */
export function releaseIllusts(arts = []) {
  keptTier = null; resultPin = null;
  if (!mod || mod === stub) return;
  try {
    const st = mod.getDynIllustStage(), tier = qualityOverride || pageTier;
    const keys = [...new Set((arts || []).map((a) => illustKey(mod, a)).filter(Boolean))];
    const g = data.get('local')?.groups?.dynillust || {};
    const keep = keys.length ? pickKept(keys, tier, (k) => g[k]) : [];
    st.release(keep);
    if (keep.length) keptTier = tier;
  } catch (err) { console.warn('[dynillust] release', err); }
}

/** Whether this server has any illustration (data/local-assets.json group `dynillust`): the settings rows show only then. */
export function useDynAvailable() {
  useData('local');
  const g = data.get('local')?.groups?.dynillust;
  return !!g && typeof g === 'object' && Object.keys(g).length > 0;
}

/** The entry film's files (main.js openingLoaded): the room's illustrations wait for them (the first-impression rule). */
let opening = Promise.resolve();
export function afterOpening(promise) { opening = Promise.resolve(promise).catch(() => {}); }

// ---- the result screen's wait (D10 / D11) --------------------------------------------------------------------------

let resultLoad = null; // { pending, startedAt, ready: Set<key>, gaveUp, timer }

/** A tick when the result cards' load settles: screens/game.js re-checks its wait. */
export const resultGateStore = createStore({ n: 0 });

/**
 * Start loading the result cards' illustrations (the moment m.public `ending` arrives; once per match: screens/settle.js
 * useResultPreload): the viewer's own card first, then the others — the renderer's preload settles when every key is in
 * or failed (D10).
 * @param {() => { art: any, mine: boolean }[]} cardsOf the cards that animate
 */
export function startResultLoad(cardsOf) {
  endResultLoad();
  const state = { pending: true, startedAt: Date.now(), ready: new Set(), gaveUp: false, timer: 0 };
  resultLoad = state;
  const tick = () => resultGateStore.set({ n: resultGateStore.get().n + 1 });
  const done = () => { if (state.pending) { state.pending = false; clearTimeout(state.timer); tick(); } };
  // the give-up: the result screen opens; the cards still loading keep their 2D art (resultKeyReady)
  state.timer = setTimeout(() => { if (state.pending && resultLoad === state) { state.gaveUp = true; tick(); } }, RESULT_GIVE_UP_MS);
  // the result cards' tier: the kept illustrations' (the room's), so they show with no load; else from the cards' size
  // before they exist, which the cards confirm when they mount
  if (!qualityOverride) {
    resultPin = keptTier;
    pageTier = keptTier || resultCardTier();
    dynTierStore.set({ tier: pageTier });
  }
  readyStage().then(({ R, st }) => {
    if (resultLoad !== state) return null;
    const cards = cardsOf().slice().sort((a, b) => Number(!!b.mine) - Number(!!a.mine));
    const keys = [...new Set(cards.map((c) => illustKey(R, c.art)).filter(Boolean))];
    // one preload a key, asked in that order, so the give-up knows which are in (a failed one settles too: its card
    // then fails at once and keeps its 2D art)
    return Promise.all(keys.map((k) => Promise.resolve(st.preload([k])).then(() => { state.ready.add(k); }, () => { state.ready.add(k); })));
  }).then(done, done);
}

/**
 * How long the result screen still waits (ms; 0 = open it), behind the black cover (screens/settle.js ResultCover):
 * while the result cards' load runs, at most until RESULT_GIVE_UP_MS after m.public `ending` (the user, 2026-11-23: "If
 * the delay is necessary to load the L2d, then have a black screen or something to load when the match was ending, not
 * half ass load the result screen only for it to awkwardly wait for the l2ds!").
 */
export function resultWaitMs(now = Date.now()) {
  const s = resultLoad;
  if (!s || !s.pending || s.gaveUp) return 0;
  return Math.max(0, s.startedAt + RESULT_GIVE_UP_MS - now);
}

/**
 * Whether a result card may show its illustration: always, unless the result screen opened at the give-up while its
 * illustration was still loading — then it keeps its 2D art at once (no wait on the open screen, no switch later).
 */
export function resultKeyReady(key) {
  const s = resultLoad;
  return !s || !s.gaveUp || s.ready.has(key);
}

/** Forget the match's result load (the next match began, or the page left the match). */
export function endResultLoad() {
  if (resultLoad) clearTimeout(resultLoad.timer);
  resultLoad = null;
  if (resultPin) { resultPin = null; tierChanged(); }
}

// ---- the result cards' entrance gate (the user, 2026-11-23, through the lead: "If an L2D is available, then it should
// wait for the l2d to be ready instead of rushing ahead with the static art, cause the animation there is only made to
// play once, with no second shot") ------------------------------------------------------------------------------------

/**
 * How long after the server's `ending` the result cards may wait for their illustrations, all waits included (the
 * settlement pause, the result screen's hold, the cards' first frames): one budget, never a second wait on top.
 */
export const RESULT_GIVE_UP_MS = 8000; // [ASSUMED: proposed on a measured basis (work/dev-55 rw-*.json), user OK 2026-11-23: "alright, 8s and 160mb"]
/** The least a team page that mounts late (its tab opened afterwards) still gives its cards' first frames (ms). */
export const RESULT_MOUNT_MIN_MS = 2000; // [ASSUMED: proposed to the user 2026-11-23, not yet OK'd — measured basis in the report]

/**
 * One result page's gate: its animating cards join (IllustArt `gate`), each settles when its illustration is live or
 * failed (or it has none); `ready` resolves when all have, or at the give-up — then the still-loading ones keep their 2D
 * art for good (`abandon`: no later switch, the entrance plays once). `open()` once the page's cards have joined (a page
 * with no animating card opens at once). `now` / `endingAt` for tests.
 */
export function makeEntranceGate({ now = Date.now(), endingAt = resultLoad?.startedAt || 0 } = {}) {
  const pending = new Map(); // token → abandon
  let done = false, opened = false, resolve;
  const ready = new Promise((r) => { resolve = r; });
  gateWaitStore.set({ n: gateWaitStore.get().n + 1 });
  const leave = () => gateWaitStore.set({ n: Math.max(0, gateWaitStore.get().n - 1) });
  const finish = () => {
    if (done) return;
    done = true;
    leave();
    clearTimeout(timer);
    const gaveUp = pending.size;
    for (const abandon of pending.values()) { try { abandon?.(); } catch (err) { console.warn('[dynillust] give up', err); } }
    pending.clear();
    // a User Timing mark (`dyn-result-gate`, detail: cards given up): the result timing checks measure from it
    try { performance.mark('dyn-result-gate', { detail: { gaveUp } }); } catch { /* no User Timing */ }
    resolve();
  };
  const budget = Math.max(RESULT_MOUNT_MIN_MS, (endingAt > 0 ? endingAt + RESULT_GIVE_UP_MS : now + RESULT_GIVE_UP_MS) - now);
  const timer = setTimeout(finish, budget);
  const check = () => { if (opened && !pending.size) finish(); };
  return {
    ready,
    budget,
    get done() { return done; },
    join(token, abandon) { if (!done) pending.set(token, abandon); },
    settle(token) { pending.delete(token); check(); },
    open() { opened = true; check(); },
    dispose() { clearTimeout(timer); if (!done) { done = true; leave(); } },
  };
}
/**
 * How many result pages' entrance gates are still waiting: a result cover that is up (screens/settle.js useResultHold)
 * stays over a page whose cards are still getting their first frames, so the page shows with its entrance, not before.
 */
export const gateWaitStore = createStore({ n: 0 });

// ---- the room's group flip (the user, 2026-11-22: "keep placeholder and flip at the same time") ------------------------

/**
 * The room's and the Grand Alliance room's cards keep their 2D art until every card on the screen is ready (or failed),
 * then all start in one animation frame and fade in together over FLIP_FADE_S (CSS `.dyn-art--flip`). A card that
 * fails keeps its 2D and does not hold the others. Past GROUP_CAP_MS from the first card's mount the ready ones flip and
 * a later one swaps alone when ready; so does a card mounted after the flip (a player who joins, a new outfit or
 * portrait). The result screen does not group (D11: at most 3 s after the settlement pause, a late card fades in alone).
 *
 * Start, then show (the user, 2026-11-22: "Wait until it's ready, then play the animation and switch the live 2d in in
 * the back"): the renderer's first frames with a whole group live are its slow ones (8 Grand Alliance cards: 2–5 frames
 * of 37–75 ms [src: I:/ClaudeCrew/work/dev-55 trace3.json, 2026-11-22]), so the cards start behind their still 2D art and
 * show in one frame once FLIP_SMOOTH_FRAMES frames in a row took at most FLIP_SMOOTH_MS — never before. Showing is the
 * official card's dissolve (ui/cardEntrance.js drawDissolve): the illustration appears at once behind the 2D art and the
 * 2D art dissolves away through the card's mask over FLIP_DISSOLVE_S (the user's pick of 2026-11-22, proposal C). A page
 * that is not smooth FLIP_GIVE_UP_MS after the start keeps its 2D art and stops the illustrations ("I reject low FPS
 * L2D", the user, 2026-11-22). A card that swaps alone waits for its own smooth frames the same way.
 */
export const FLIP_FADE_S = 0.15; // the fallback without the dissolve: the controller's fade [src: official GameAssembly.dll UICharacterIllustController.Config..cctor 0x147EF10 fadeDuration 0.15]
export const FLIP_DISSOLVE_S = 0.5; // DYN_ILLUST_INIT_SECONDS [src: official GameAssembly.dll UICharacterDynIllust..ctor 0x1495060]
/**
 * The border's sweep: the user's 0.35 s (2026-11-23: "the effect should only take 0.35s", after 1 s, 0.67 s and the
 * official 0.5 s), over the look's drive range (cardEntrance.js sweepRange: from where its bands reach the card to where
 * they leave it), so the whole of it is the line crossing the card.
 */
export const FLIP_SWEEP_S = 0.35; // the user's value of 2026-11-23 (official DYN_ILLUST_INIT_SECONDS 0.5, FLIP_DISSOLVE_S)
/** The dissolve's drive `s` seconds into the show: across the look's range over FLIP_SWEEP_S, then 1 (all gone). */
export function sweepDrive(s, S = glowStyle()) {
  if (s >= FLIP_SWEEP_S) return 1;
  const [a, b] = sweepRange(S);
  return a + (b - a) * Math.max(0, s) / FLIP_SWEEP_S;
}
/** The stagger between the group's cards: the result row's step [src: ui/cardEntrance.js ANIM_DELAY_S, official _animDelay]. */
export const FLIP_STEP_S = ANIM_DELAY_S;
export const GROUP_CAP_MS = 8000; // [ASSUMED: proposed to the user 2026-11-22, not yet OK'd — 8 s covers a typical PC's cold Grand Alliance load, 4.9–5.3 s measured at 1080p]
/** A smooth frame: 30 fps, the flip's gate (no frame over 33 ms: the lead's brief of 2026-11-22), +1 ms of frame-timer jitter as the review page's gates allow [src: public/dev/dyn-review.js measure]. */
export const FLIP_SMOOTH_MS = 1000 / 30 + 1;
export const FLIP_SMOOTH_FRAMES = 10; // [ASSUMED: proposed to the user 2026-11-22, not yet OK'd — about 0.17–0.33 s of smooth frames before the cards show]
export const FLIP_GIVE_UP_MS = 3000; // [ASSUMED: proposed to the user 2026-11-22, not yet OK'd — the user's PC settled 0.06–0.28 s after the start; a 4× slower CPU never settles with 8 cards]
let group = null; // { entries: Set, flipped, timer, check, hold, wait, gaveUp }

function startCard(e) { try { e.card?.start(); } catch (err) { console.warn('[dynillust] start', err); } }
/** How often the group's wait reads the Workers' card-frame log (ms): about every 15 frames at 60 fps (ours). */
const WORKER_POLL_MS = 250;
/** The page's stage when it draws in Workers (it keeps a card-frame log: frames / frameLog), else null. */
function workerStage() {
  if (!mod || mod === stub) return null;
  try {
    const st = mod.getDynIllustStage?.();
    return st && typeof st.frames === 'function' && typeof st.frameLog === 'function' && st.workers?.length ? st : null;
  } catch { return null; }
}
function showCard(e, delay = 0) { try { e.show?.(delay); } catch (err) { console.warn('[dynillust] show', err); } }
/**
 * The cards' transitions in one pass a frame: each queues its dissolve and bloom tiles, one GL pass draws them all
 * (cardEntrance.js flushBatch), then each finishes (`after` false: done). No particles: the glitter was dropped (the
 * user, 2026-11-23: "you may remove the glitter particles, it's useless now"), and its page-wide layer with it.
 */
const transitions = new Set();
let transRaf = 0;
function runTransitions() {
  transRaf = 0;
  const now = performance.now();
  for (const tr of [...transitions]) { try { if (!tr.queue(now)) transitions.delete(tr); } catch (err) { console.warn('[dynillust] transition', err); transitions.delete(tr); } }
  try { flushBatch(); } catch (err) { console.warn('[dynillust] transition', err); }
  // the cards the dissolve Worker draws: this frame's numbers in one message
  if (workerItems.length) { const items = workerItems; workerItems = []; dissolveApi?.post({ type: 'frame', items }); }
  for (const tr of [...transitions]) { try { if (!tr.after()) transitions.delete(tr); } catch (err) { console.warn('[dynillust] transition', err); transitions.delete(tr); } }
  if (transitions.size) transRaf = requestAnimationFrame(runTransitions);
}
function addTransition(tr) {
  // a User Timing mark per show (`dyn-show`): the frame checks measure from it
  if (!transitions.size) try { performance.mark('dyn-show'); } catch { /* no User Timing */ }
  transitions.add(tr);
  if (!transRaf) transRaf = requestAnimationFrame(runTransitions);
}

/**
 * The room cards' dissolve drawn in a Worker (ui/dissolveWorker.js: the same shader and tiles in its own WebGL2 context,
 * into the cards' canvases handed over with transferControlToOffscreen; it fetches, decodes and composes each picture
 * itself), so the page makes no GL call for it. On the page, the context's creation, the shader's status queries, the
 * shared canvas's first allocation and each picture's upload waited on the GPU process while the cards loaded: 180–409 ms,
 * 71 ms, 138–160 ms and 47–72 ms a card of main-thread frames [src: work/dev-55 ss-1440-3.json, ss-1440-5.json,
 * ss-1440-7.json, 2026-11-23]. The Worker reports ready only after a test draw; where it cannot (no OffscreenCanvas or
 * WebGL2 in Workers, a failed test draw, an error, or no answer within FLIP_GIVE_UP_MS) the page draws the dissolve itself,
 * as before. `globalThis.__dynMainDissolve` set before the page loads keeps it on the page (A/B runs).
 */
let dissolveBackend = null; // Promise<api | null>, one Worker for the page
let dissolveApi = null;
let workerItems = [];
let dissolveIds = 0;
/** A dissolve canvas handed over to the Worker → its card id there (a canvas can be handed over only once). */
const handedOver = new WeakMap();
function dissolveWorker() {
  if (dissolveBackend) return dissolveBackend;
  const maskUrl = dissolveMaskUrl(data.get('assets'));
  const can = !globalThis.__dynMainDissolve && !!maskUrl && typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    && typeof globalThis.HTMLCanvasElement?.prototype?.transferControlToOffscreen === 'function';
  if (!can) return (dissolveBackend = Promise.resolve(null));
  dissolveBackend = new Promise((resolve) => {
    let w = null, settled = false, failed = false, timer = 0;
    const waits = new Map();
    const done = (api) => { if (settled) return; settled = true; clearTimeout(timer); dissolveApi = api; resolve(api); };
    const fail = (why) => {
      failed = true;
      if (why) console.warn('[dynillust] dissolve Worker', why);
      for (const f of waits.values()) f({ ok: false });
      waits.clear();
      if (!settled) { try { w?.terminate(); } catch { /* gone */ } done(null); }
    };
    timer = setTimeout(() => fail('no answer'), FLIP_GIVE_UP_MS);
    try { w = new Worker(new URL('./dissolveWorker.js', import.meta.url), { type: 'module', name: 'dissolve' }); } catch (err) { fail(err); return; }
    const api = {
      get failed() { return failed; },
      attach(dis, wash) {
        const id = ++dissolveIds, a = dis.transferControlToOffscreen(), b = wash.transferControlToOffscreen();
        w.postMessage({ type: 'card', id, dis: a, wash: b }, [a, b]);
        return id;
      },
      prep(id, msg) {
        if (failed) return Promise.resolve({ ok: false });
        return new Promise((r) => { waits.set(id, r); w.postMessage({ type: 'prep', id, ...msg }); });
      },
      post(m) { if (!failed) w.postMessage(m); },
    };
    w.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.type === 'ready') { if (d.ok) done(api); else fail(d.err || 'not ready'); } else if (d.type === 'prepared') { const f = waits.get(d.id); waits.delete(d.id); f?.(d); }
    };
    w.onerror = (ev) => { ev?.preventDefault?.(); fail(ev?.message || 'error'); };
    w.postMessage({ type: 'init', maskUrl: new URL(maskUrl, globalThis.location?.href).href, glow: globalThis.__dynGlow ?? null });
  });
  return dissolveBackend;
}

/** The cards' dissolve preparations (a picture composed, uploaded and drawn once each): one per animation frame. */
const prepJobs = [];
let prepRaf = 0;
function runPrep() {
  prepRaf = 0;
  const job = prepJobs.shift();
  try { job?.(); } catch (err) { console.warn('[dynillust] dissolve', err); }
  if (prepJobs.length) prepRaf = requestAnimationFrame(runPrep);
}
function queuePrep(job) {
  prepJobs.push(job);
  if (!prepRaf) prepRaf = requestAnimationFrame(runPrep);
}

/** Page order (a card's 2D art element `e.el`): the stagger runs as the cards read, left to right, top to bottom. */
function byPage(a, b) {
  if (!a.el || !b.el || typeof a.el.compareDocumentPosition !== 'function') return 0;
  return a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1; // Node.DOCUMENT_POSITION_FOLLOWING
}
function giveUpCard(e) { try { e.giveUp?.(); } catch (err) { console.warn('[dynillust] give up', err); } }

/**
 * After `entries` started (hidden): show them in one frame once FLIP_SMOOTH_FRAMES frames in a row took at most
 * FLIP_SMOOTH_MS and each has its dissolve prepared (`e.prepared`), or keep their 2D art FLIP_GIVE_UP_MS after the
 * start. The first interval measured is the start frame's own, so the count begins a frame later. Returns a cancel.
 */
function whenSmooth(entries, onGiveUp) {
  let t0 = 0, last = 0, n = 0, smooth = 0, id = 0, done = false;
  // where the cards draw in Workers (render/dynillust/host.js), the main thread's frames say nothing about the cards':
  // each Worker's card frames must also run FLIP_SMOOTH_FRAMES in a row at FLIP_SMOOTH_MS or better (its frame log,
  // read every WORKER_POLL_MS while the group waits; a Worker that logged nothing holds nobody)
  const st = workerStage();
  const wsmooth = [];
  let workersOk = !st, polling = false, lastPoll = 0;
  if (st) { try { st.frames(true); } catch { workersOk = true; } }
  const stopLog = () => { if (st) { try { st.frames(false); } catch { /* gone */ } } };
  const poll = (t) => {
    if (!st || polling || t - lastPoll < WORKER_POLL_MS) return;
    polling = true; lastPoll = t;
    st.frameLog().then((logs) => {
      polling = false;
      (logs || []).forEach((list, i) => {
        if (!list || list.length < 2) return;
        for (let j = 1; j < list.length; j++) wsmooth[i] = list[j][0] - list[j - 1][0] <= FLIP_SMOOTH_MS ? (wsmooth[i] || 0) + 1 : 0;
      });
      workersOk = (logs || []).every((list, i) => !list || list.length < 2 || (wsmooth[i] || 0) >= FLIP_SMOOTH_FRAMES);
    }, () => { polling = false; workersOk = true; });
  };
  const tick = (t) => {
    id = 0;
    if (done) return;
    if (!t0) t0 = last = t;
    else { n++; smooth = n >= 2 && t - last <= FLIP_SMOOTH_MS ? smooth + 1 : 0; last = t; }
    poll(t);
    const cur = entries.filter((e) => !e.gone);
    if (!cur.length) { done = true; stopLog(); return; }
    if (smooth >= FLIP_SMOOTH_FRAMES && workersOk && cur.every((e) => e.prepared !== false)) {
      stopLog();
      done = true;
      // one card after another, the result row's step apart (the user, 2026-11-22: "one player card at a time, in quick
      // succession")
      cur.slice().sort(byPage).forEach((e, i) => showCard(e, i * FLIP_STEP_S * 1000));
      return;
    }
    if (t0 && t - t0 >= FLIP_GIVE_UP_MS) { done = true; stopLog(); for (const e of cur) giveUpCard(e); onGiveUp?.(); return; }
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => { if (!done) stopLog(); done = true; if (id) cancelAnimationFrame(id); };
}
/** A card on its own (after the flip): start it hidden and show it once smooth — or keep it 2D on a page that gave up. */
function startAlone(e) {
  if (e.group?.gaveUp) { giveUpCard(e); return; }
  startCard(e);
  e.wait = whenSmooth([e]);
}
function flipGroup(g) {
  if (g.flipped) return;
  g.flipped = true;
  clearTimeout(g.timer);
  g.hold = requestAnimationFrame(() => {
    g.hold = 0;
    // one frame for all: the ready cards start together (still hidden); one still loading swaps alone when ready
    const held = [];
    for (const e of g.entries) { if (e.state === 'ready') { startCard(e); held.push(e); } else e.alone = true; }
    if (held.length) g.wait = whenSmooth(held, () => { g.gaveUp = true; });
  });
}
function checkGroup(g) {
  if (g.flipped || g.check) return;
  // a frame later, so every card mounting in this burst has joined
  g.check = requestAnimationFrame(() => {
    g.check = 0;
    if ([...g.entries].every((e) => e.state === 'ready' || e.state === 'failed')) flipGroup(g);
  });
}
/** A room card's illustration is mounted (not started): it joins the screen's group, or swaps alone after the flip. */
export function joinGroup(e) {
  if (!group) {
    const g = { entries: new Set(), flipped: false, check: 0, timer: 0 };
    g.timer = setTimeout(() => flipGroup(g), GROUP_CAP_MS);
    group = g;
  }
  e.group = group;
  group.entries.add(e);
  if (group.flipped) e.alone = true;
  if (e.alone) { if (e.state === 'ready') startAlone(e); } else checkGroup(group);
}
/** The card's state changed (the renderer's onState). */
export function groupState(e, s) {
  const was = e.state;
  e.state = s;
  const g = e.group;
  if (!g) return;
  if (e.alone) { if (s === 'ready' && was !== 'ready') startAlone(e); } else checkGroup(g);
}
/** The card left (the screen closed, the seat emptied, its art changed): a group with no card left is forgotten. */
export function leaveGroup(e) {
  e.gone = true;
  e.wait?.();
  const g = e.group;
  if (!g) return;
  g.entries.delete(e);
  e.group = null;
  if (!g.entries.size) {
    clearTimeout(g.timer); if (g.check) cancelAnimationFrame(g.check); if (g.hold) cancelAnimationFrame(g.hold); g.wait?.();
    if (group === g) group = null;
  } else checkGroup(g);
}

// ---- the card ------------------------------------------------------------------------------------------------------

/**
 * A card's art box: the 2D art (children) and, when the card animates and its illustration is ready, the illustration
 * drawn over it — the same on the result, room and Grand Alliance cards (D5). A card whose illustration is still loading
 * keeps its 2D art and switches when it is ready (D11). No tap action (D9).
 * @param {{ art: { charId: string, outfit: string|null } | null, animate: boolean, wait?: 'now'|'settled', backdrop?: boolean, class?: string, children?: any }} props
 *   wait: 'now' mounts at once (the result screen: loaded in the pause), 'settled' once the screen has what it needs (room)
 *   backdrop: the official card background behind the live illustration (BACKDROP; a tall card of the official shape)
 *   gate: the result page's entrance gate (makeEntranceGate): the card joins it, settles once live or failed, and at
 *   its give-up keeps its 2D art for good
 */
export function IllustArt({ art, animate, wait = 'now', backdrop = false, framing = null, gate = null, class: cls = '', children }) {
  const on = !!(animate && art);
  const id = on ? `${art.charId}|${art.outfit || ''}` : '';
  const host = useRef(null);
  const [state, setState] = useState('off');
  const tier = useStore((s) => s.tier, Object.is, dynTierStore);
  // this card's wish for the page tier, from its art window's size (re-measured on resize; a change re-mounts the cards)
  const token = useRef(null);
  if (!token.current) token.current = {};
  useEffect(() => {
    const el = host.current;
    if (!on || !el) { setWant(token.current, null); return undefined; }
    const measure = () => { const r = el.getBoundingClientRect(); setWant(token.current, cardTier(r.width, r.height)); };
    measure();
    let t = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { clearTimeout(t); t = setTimeout(measure, 250); }) : null;
    ro?.observe(el);
    return () => { clearTimeout(t); ro?.disconnect(); setWant(token.current, null); };
  }, [on]);
  // a room card started with its group stays behind its 2D art until the group shows (flipGroup), then the 2D art
  // dissolves away over it ('dissolve'), or fades without WebGL2 / the mask sprite ('fade', CSS .dyn-art--flip)
  const [shown, setShown] = useState(wait !== 'settled');
  const [reveal, setReveal] = useState('fade');
  // the dissolve's first frame (the art box itself) covers the card while it waits: the illustration and its background
  // are already in place under it, so the show only starts the dissolve (no DOM switch in that frame)
  const [covered, setCovered] = useState(false);
  const root = useRef(null), dis = useRef(null), wash = useRef(null);
  useEffect(() => {
    setState(on ? 'loading' : 'off');
    setShown(wait !== 'settled');
    setReveal('fade');
    setCovered(false);
    if (!on) return undefined;
    let card = null, live = true, kept = false, raf = 0, cur = 'loading', isCovered = false, trans = null;
    const entry = wait === 'settled' ? { card: null, state: 'loading', alone: false, prepared: false, show: (delay) => { if (live) showNow(delay); }, giveUp: () => keep2d() } : null;
    // a page that never got smooth: the card keeps its 2D art and its illustration stops (no low-FPS illustration)
    const keep2d = () => {
      if (!live || kept) return;
      kept = true;
      try { card?.unmount(); card?.canvas?.remove(); } catch (err) { console.warn('[dynillust] unmount', err); }
      if (dis.current) dis.current.style.opacity = '0';
      if (wash.current) wash.current.style.opacity = '0';
      dropDissolve();
      isCovered = false;
      setCovered(false);
      setState('kept'); // data-dyn="kept": the 2D art stays (not 'off': the illustration was there and gave up)
    };
    // the dissolve's picture: the card's art box exactly as it shows — its background, then the 2D art (object-fit cover
    // at its object-position, its filter) — composed and put on the GPU while the cards wait, again at the show if the
    // box changed size
    let pic = null, picKey = '';
    // the dissolve Worker's api and this card's id there, when the Worker draws this card (dissolveWorker), else null
    let wapi = null, wid = 0, wEl = null;
    // the picture and tiles freed (the Worker keeps the handed-over canvases until they leave the page)
    const dropDissolve = () => {
      if (wapi) wapi.post({ type: 'drop', id: wid });
      else { reserveTiles(dis); freeDissolvePicture(pic); }
      pic = null;
    };
    // where the 2D art sits in the art box now (cardEntrance.js artPlacement), and the picture's key
    const geom = () => {
      const img = entry.img, box = img?.offsetParent;
      const r = img?.isConnected ? img.getBoundingClientRect() : null;
      if (!img || !box || !r || !(r.width > 0 && r.height > 0) || !img.naturalWidth) return null;
      const cs = globalThis.getComputedStyle(img);
      // a placed art (CardArt: object-fit fill at its own box, maybe past the card's edges) is drawn at its place in the
      // box's padding box, where the dissolve canvas sits; a cover art fills that box
      const placed = cs.objectFit === 'fill';
      const br = box.getBoundingClientRect();
      const bx = br.left + box.clientLeft, by = br.top + box.clientTop;
      const bw = placed ? box.clientWidth : r.width, bh = placed ? box.clientHeight : r.height;
      if (!(bw > 0 && bh > 0)) return null;
      const [px, py] = objectPosition(cs.objectPosition);
      const at = artPlacement({ placed, r, bx, by, bw, bh, nw: img.naturalWidth, nh: img.naturalHeight, px, py, dpr: globalThis.devicePixelRatio || 1 });
      const src = img.currentSrc || img.src;
      return { ...at, img, box, cs, src, key: `${at.W}x${at.H}|${src}${placed ? `|${Math.round(r.left - bx)},${Math.round(r.top - by)},${Math.round(r.width)}` : ''}` };
    };
    // on the page: the picture composed here and put on the page's GPU context
    const compose = () => {
      const gm = geom();
      if (!gm) return null;
      const { W, H, key } = gm;
      if (pic && key === picKey) return { W, H };
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      paintBackground(g, gm.box, W, H);
      if (gm.cs.filter && gm.cs.filter !== 'none') g.filter = gm.cs.filter;
      g.drawImage(gm.img, gm.crop.x, gm.crop.y, gm.crop.w, gm.crop.h, gm.dx, gm.dy, gm.dw, gm.dh);
      pic = dissolvePicture(c, entry.mask, pic);
      picKey = key;
      return pic ? { W, H } : null;
    };
    // in the Worker: the same picture composed there from the art's file and the box's computed background, its first
    // frame drawn on the card's canvas (and committed) before it resolves
    const prepInWorker = (gm) => {
      const bs = globalThis.getComputedStyle(gm.box);
      return wapi.prep(wid, { url: new URL(gm.src, globalThis.location?.href).href, gm: { W: gm.W, H: gm.H, dx: gm.dx, dy: gm.dy, dw: gm.dw, dh: gm.dh, crop: gm.crop },
        bg: { backgroundColor: bs.backgroundColor, backgroundImage: bs.backgroundImage }, filter: gm.cs.filter, key: gm.key })
        .then((r) => { if (r?.ok && live) { picKey = r.key; return true; } return false; });
    };
    // a dissolve that cannot be prepared falls back to the fade; it never holds the group
    const prepare = () => {
      try { prepareDissolve(); } catch (err) { console.warn('[dynillust] dissolve', err); entry.prepared = true; }
    };
    const prepareDissolve = () => {
      const img = root.current?.querySelector?.('.dyn-art__still img');
      const cs = img && globalThis.getComputedStyle ? globalThis.getComputedStyle(img) : null;
      if (!img || !cs || (cs.objectFit !== 'cover' && cs.objectFit !== 'fill') || reducedMotion()) { entry.prepared = true; return; }
      entry.img = img;
      entry.el = img;
      // the card background the illustration shows over (BACKDROP) decoded now, not in the frame the cards show
      const bgUrl = backdrop ? uiUrl(data.get('assets'), BACKDROP.sprite) : null;
      const bgImg = bgUrl && typeof Image === 'function' ? Object.assign(new Image(), { src: bgUrl }) : null;
      const decodes = [img.decode ? img.decode().catch(() => {}) : null, bgImg?.decode ? bgImg.decode().catch(() => {}) : null];
      dissolveWorker().then((api) => {
        if (!live) return undefined;
        if (!api || api.failed || !dis.current || !wash.current) return prepareOnPage(decodes);
        // the Worker draws this card: its two canvases handed over once
        wEl = dis.current;
        wid = handedOver.get(wEl) || 0;
        if (!wid) { wid = api.attach(wEl, wash.current); handedOver.set(wEl, wid); }
        wapi = api;
        return Promise.all(decodes).then(() => {
          const gm = live ? geom() : null;
          return gm ? prepInWorker(gm).then((ok) => { if (ok) { drawnKey = picKey; cover(); } }) : null;
        }).catch((err) => { console.warn('[dynillust] dissolve', err); }).finally(() => { entry.prepared = true; });
      }).catch((err) => { console.warn('[dynillust] dissolve', err); entry.prepared = true; });
    };
    const prepareOnPage = (decodes) => {
      Promise.all([loadDissolve(data.get('assets')), ...decodes])
        .then(([mask]) => {
          // one card's picture, upload and first frame per animation frame (prepQueue): eight at once took a 246 ms task
          queuePrep(() => {
            try {
              if (!live) return;
              entry.mask = mask;
              // the dissolve's first frame drawn now on the (still invisible) canvas
              const size = compose();
              // the show's set-up, here while the cards still load (one card a frame): the shared GL canvas grown for
              // this card too (before this card's first draw, which then touches the grown buffer). Done at the cards'
              // cover or just before the show (with the glitter's page-wide layer, since dropped) it cost the show's
              // first frames 60 ms of script and 125–180 ms of rendering (work/dev-55 co-*.json, 2026-11-23); here it
              // falls before the smooth frames the show waits for
              if (size) reserveTiles(dis, size.W, size.H);
              if (size && dis.current && drawDissolve(dis.current, pic, 0, size.W, size.H)) { drawnKey = picKey; cover(); }
            } finally { entry.prepared = true; }
          });
        }, (err) => { console.warn('[dynillust] dissolve', err); entry.prepared = true; });
    };
    let drawnKey = '';
    // once the illustration runs (started hidden) and the first frame is drawn: the canvas covers the card, identical
    // to its 2D art, and the illustration and its background take their place under it
    const cover = () => {
      if (!live || kept || isCovered || cur !== 'live' || !drawnKey || !dis.current) return;
      isCovered = true;
      dis.current.style.opacity = '1';
      // the bloom's canvas too, sized and in place (empty) now: showing an additive layer at the show cost a 77 ms frame
      // (in the Worker it was sized with the picture)
      const wc = wash.current;
      const place = () => {
        if (!live || kept) return;
        if (wc && wapi) wc.style.opacity = '1';
        else if (wc && dis.current && dis.current.width > 1) { wc.width = dis.current.width; wc.height = dis.current.height; wc.style.opacity = '1'; }
        setReveal('dissolve');
        setCovered(true);
      };
      // drawn in the Worker, the cover's frame reaches the screen apart from the page's: it shows over the 2D art (the
      // same picture) first, and the 2D art gives way to the illustration under it two frames later, so a cover frame
      // that came late can only show the 2D art, never the illustration
      if (wapi) requestAnimationFrame(() => requestAnimationFrame(place)); else place();
    };
    // the show, `delay` ms from now (the group's stagger): the 2D art dissolves away over FLIP_SWEEP_S with a white
    // bloom on its edge and a glow behind it that fades after (cardEntrance.js drawBloom, its own canvas, plus-lighter)
    const showNow = (delay = 0) => {
      const cv = dis.current;
      if (!isCovered || !cv) { setShown(true); return; }
      if (wapi) {
        const gm = geom();
        if (!gm) { setShown(true); return; }
        // the box changed size since: its picture again first
        if (gm.key !== picKey) { prepInWorker(gm).then((ok) => { if (!live) return; if (ok) sweep(gm.W, gm.H, delay); else setShown(true); }); return; }
        sweep(gm.W, gm.H, delay);
        return;
      }
      const size = compose();
      // the box changed size since: its first frame again
      if (size && (drawnKey === picKey || drawDissolve(cv, pic, 0, size.W, size.H))) { sweep(size.W, size.H, delay); return; }
      setShown(true);
    };
    const sweep = (W, H, delay) => {
      const cv = dis.current, wc = wash.current;
      setShown(true);
      const t0 = performance.now() + Math.max(0, delay);
      let dissolved = false, lastS = 0, k = 0, glow = 0, endFrames = 0;
      const G = glowStyle();
      if (wc && wc.style.opacity !== '1') wc.style.opacity = '1';
      // one frame of this card in the shared pass (runTransitions): queue its tiles (or the Worker's numbers), then the end
      trans = {
        queue(now) {
          if (!live) return false;
          const s = (now - t0) / 1000;
          if (s < 0) return true;
          // the glow's look (GLOW_STYLES): a dim of the old picture first, then the sweep
          const dimS = G.dim?.s || 0, sw = s - dimS;
          const dim = G.dim ? 1 - (1 - G.dim.to) * Math.min(1, s / dimS) : 1;
          k = sweepDrive(sw, G);
          if (!dissolved) { if (wapi) workerItems.push({ id: wid, kind: 'dissolve', drive: k, dim, W, H }); else batchDissolve(cv, pic, k, W, H, dim); }
          // the bloom: bands on the dissolve's edge and a glow behind it; once the picture is gone, the glow fades
          glow = k < 1 ? 1 : Math.max(0, 1 - (sw - FLIP_SWEEP_S) / G.fadeS);
          const band = k < 1 ? BLOOM.band : 0;
          if (wc) { if (wapi) workerItems.push({ id: wid, kind: 'bloom', k, glow, band, W, H }); else batchBloom(wc, k, glow, band, W, H); }
          lastS = s;
          return true;
        },
        after() {
          if (!live || lastS <= 0) return true;
          // the Worker draws a frame after the page asks for it: the cover goes a frame after its last one (k 1) was asked
          if (k >= 1 && !dissolved && (!wapi || ++endFrames > 1)) {
            dissolved = true;
            cv.style.opacity = '0';
            if (wapi) wapi.post({ type: 'end', id: wid });
            else { cv.width = 1; cv.height = 1; freeDissolvePicture(pic); pic = null; }
          }
          // done: the card keeps its tiles in the shared canvas until it unmounts (reserveTiles: no resize of its own)
          if (dissolved && !(glow > 0)) {
            if (wc) { wc.style.opacity = '0'; if (wapi) wapi.post({ type: 'washEnd', id: wid }); else { wc.width = 1; wc.height = 1; } }
            return false;
          }
          return true;
        },
      };
      addTransition(trans);
    };
    // a 'cover' card waits for its framing tables (two small files, fetched once per page; CardArt places its 2D art with
    // the same values)
    const go = () => Promise.all([readyStage(tier), framing === 'cover' ? loadCardArtFraming() : null]).then(([{ R, st }]) => {
      const key = live ? illustKey(R, art) : null;
      if (!key || !host.current) { if (live) setState('off'); gate?.settle(gateTok); return null; }
      // a result card whose illustration was still loading when the result screen opened at the give-up: its 2D art
      if (gate && !resultKeyReady(key)) { if (live) { kept = true; setState('kept'); } gate.settle(gateTok); return null; }
      // the renderer's card: its own 2D canvas in the art window, under the card's overlays (§33.19); 'live' = drawn
      card = st.mount(key, { ...framingFor(key, framing), onState: (s) => {
        if (!live || kept) return;
        cur = s; setState(s);
        if (entry) { groupState(entry, s); if (s === 'live') cover(); }
        if (s === 'live' || s === 'failed') gate?.settle(gateTok);
      } });
      if (card.canvas) host.current.append(card.canvas);
      if (entry) { entry.card = card; prepare(); joinGroup(entry); } else card.start();
      return card.ready;
    }).catch((err) => { console.warn('[dynillust] card', err); if (live) setState('off'); gate?.settle(gateTok); });
    // the result page's gate: this card holds the page's entrance until live or failed; at the gate's give-up it keeps
    // its 2D art for good (the entrance plays once, never a switch after it)
    const gateTok = {};
    gate?.join(gateTok, () => {
      if (!live || kept) return;
      kept = true;
      try { card?.unmount(); card?.canvas?.remove(); } catch (err) { console.warn('[dynillust] unmount', err); }
      setState('kept');
    });
    // every card on the screen waits for the same moment and then loads at once (the renderer fetches and builds them in
    // parallel); a loadLater task per card made them load one by one — its queue runs one task at a time
    // the renderer's code (PIXI, pixi-spine — main.js prefetched their files after the entry film — the module and the
    // index) gets ready during that wait; only the illustrations' own files wait for the screen
    if (wait === 'settled') opening.then(() => { readyStage().catch(() => {}); return whenScreenSettled(); }).then(() => { if (live) go(); });
    else go();
    return () => {
      live = false;
      gate?.settle(gateTok);
      if (raf) cancelAnimationFrame(raf);
      if (trans) { transitions.delete(trans); trans = null; }
      dropDissolve();
      // a handed-over canvas that left the page: the Worker lets it go too (one that stays is used again)
      if (wapi && wEl) { const el = wEl, api = wapi, i = wid; setTimeout(() => { if (!el.isConnected) { api.post({ type: 'forget', id: i }); handedOver.delete(el); } }, 0); }
      if (entry) leaveGroup(entry);
      try { card?.unmount(); card?.canvas?.remove(); } catch (err) { console.warn('[dynillust] unmount', err); }
    };
  }, [id, on, wait, tier, framing]);
  // what the card shows: 'ready' while it runs hidden before its group shows
  const vis = state === 'live' && !shown ? 'ready' : state;
  // in place (under the dissolve's cover, or shown)
  const placed = state === 'live' && (shown || covered);
  const bg = backdrop && placed ? uiUrl(data.get('assets'), BACKDROP.sprite) : null;
  return html`<div ref=${root} class=${`dyn-art${placed ? ' is-live' : ''}${wait === 'settled' ? ' dyn-art--flip' : ''}${reveal === 'dissolve' ? ' dyn-art--dissolve' : ''}${cls ? ` ${cls}` : ''}`} data-dyn=${vis}>
    <div class="dyn-art__still">${children}</div>
    ${bg ? html`<div class="dyn-art__bg" aria-hidden="true"><i style=${backdropStyle(bg)}></i></div>` : null}
    ${on ? html`<div class="dyn-art__live" ref=${host} aria-hidden="true"></div>` : null}
    ${on && wait === 'settled' ? html`<canvas class="dyn-art__dissolve" ref=${dis} aria-hidden="true"></canvas><canvas class="dyn-art__wash" ref=${wash} aria-hidden="true"></canvas>` : null}
  </div>`;
}

/**
 * Paint an element's own background into a 2D context of w × h (cardEntrance.js paintBackgroundStyle on its computed
 * style: its colour, then a top-to-bottom linear-gradient).
 */
export function paintBackground(g, el, w, h) {
  const cs = globalThis.getComputedStyle?.(el);
  if (cs) paintBackgroundStyle(g, cs, w, h);
}

/** CSS object-position (computed: two lengths or percentages) as fractions; anything but percentages counts as 50 %. */
export function objectPosition(v) {
  const p = String(v || '').trim().split(/\s+/);
  const f = (s) => (s && s.endsWith('%') && Number.isFinite(parseFloat(s)) ? parseFloat(s) / 100 : 0.5);
  return [f(p[0]), f(p[1] ?? p[0])];
}

/**
 * What an illustration's see-through pixels (its erasers, the renderer's rtAlpha) show: the official card draws
 * panel_player/group_bg/bg before group_char, the illustration. The room's card (auto_chess_player_showcase_item) and the
 * result card (auto_chess_settle_game_player_item) both use the same 9-slice there — `bg_normal2` / `card_bg`, the same
 * pixels and borders — white, 300 × 528 at (0, −13), around group_char's 232 × 458 window at (0, −14)
 * [src: official [uc]autochessouter.ab, both prefabs' group_bg/bg and group_char RectTransforms; Sprite bg_normal2 and
 * card_bg m_Rect 159 × 264, m_Border 75 / 43 / 78 / 212, identical PNGs]. The room and Grand Alliance cards (`backdrop`)
 * draw it mapped onto their art window, only while the illustration is live (the 2D art stays uncovered); the result
 * card has the real card background behind it (ui/cardEntrance.js CARD_BG).
 */
export const BACKDROP = Object.freeze({ sprite: 'settleCard/card_bg', bg: { pos: [0, -13], size: [300, 528] }, win: { pos: [0, -14], size: [232, 458] },
  border: { left: 75, bottom: 43, right: 78, top: 212 } });

/** The backdrop's box in % of the art window and its 9-slice borders in container units (1 official unit = 100cqw / 232). */
export function backdropStyle(url) {
  const { bg, win, border: b } = BACKDROP;
  const [ww, wh] = win.size, [bw, bh] = bg.size;
  const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;
  const u = (v) => `${((v / ww) * 100).toFixed(3)}cqw`;
  const left = (bg.pos[0] - bw / 2) - (win.pos[0] - ww / 2), top = (win.pos[1] + wh / 2) - (bg.pos[1] + bh / 2);
  return `left:${pct(left, ww)};top:${pct(top, wh)};width:${pct(bw, ww)};height:${pct(bh, wh)};`
    + `border-style:solid;border-color:transparent;border-width:${u(b.top)} ${u(b.right)} ${u(b.bottom)} ${u(b.left)};`
    + `border-image:url("${url}") ${b.top} ${b.right} ${b.bottom} ${b.left} fill`;
}
