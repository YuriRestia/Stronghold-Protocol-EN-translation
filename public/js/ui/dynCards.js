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
//     settlement pause; the result screen opens as soon as they are in, at most RESULT_WAIT_MS after the pause
//     (screens/game.js). The room / Grand Alliance cards load once the room screen has what it needs (loadLater.js) and
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
import { loadDissolve, coverUv, drawDissolve, dissolvePicture, freeDissolvePicture } from './cardEntrance.js';
import { choiceOf } from './outfits.js';
import { seatOperator, cardContext, cardOperators, CARD_KEY, cardStore } from './seatArt.js';
import { whenScreenSettled } from '../loadLater.js';
import { uiUrl } from './assetUrls.js';
import * as stub from './dynStub.js';

/**
 * How long the result screen waits for its cards' illustrations after the settlement pause, at most (a cap: it opens the
 * moment they are ready). [src: crew-docs/l2d-art-proposal.md §1 D11 — the user, 2026-11-22: "Give it another 3s"]
 */
export const RESULT_WAIT_MS = 3000;

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
    const next = qualityOverride || (vals.length ? (vals.includes('full') ? 'full' : 'half') : pageTier);
    if (next !== pageTier) { pageTier = next; dynTierStore.set({ tier: next }); }
  }, 0);
}
function setWant(token, tier) {
  if (tier) wants.set(token, tier); else wants.delete(token);
  tierChanged();
}

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

/**
 * The match starts (screens/game.js): free every illustration no card still shows — nothing of them is held through
 * the match (the renderer's release(keep)). A page that never loaded the renderer does nothing.
 */
export function releaseIllusts() {
  if (!mod || mod === stub) return;
  try { mod.getDynIllustStage().release([]); } catch (err) { console.warn('[dynillust] release', err); }
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

let resultLoad = null; // { pending: boolean }

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
  const state = { pending: true };
  resultLoad = state;
  const done = () => { if (state.pending) { state.pending = false; resultGateStore.set({ n: resultGateStore.get().n + 1 }); } };
  // the result cards' tier from their size before they exist; the cards confirm it when they mount
  if (!qualityOverride) { pageTier = resultCardTier(); dynTierStore.set({ tier: pageTier }); }
  readyStage().then(({ R, st }) => {
    if (resultLoad !== state) return null;
    const cards = cardsOf().slice().sort((a, b) => Number(!!b.mine) - Number(!!a.mine));
    const keys = [...new Set(cards.map((c) => illustKey(R, c.art)).filter(Boolean))];
    return keys.length ? st.preload(keys) : null;
  }).then(done, done);
}

/**
 * How long the result screen still waits (ms; 0 = open it): the result cards' load still running, at most
 * RESULT_WAIT_MS after the result arrived (`resultAt`).
 */
export function resultWaitMs(resultAt, now = Date.now()) {
  if (!resultLoad || !resultLoad.pending || !(resultAt > 0)) return 0;
  return Math.max(0, resultAt + RESULT_WAIT_MS - now);
}

/** Forget the match's result load (the next match began, or the page left the match). */
export function endResultLoad() {
  resultLoad = null;
}

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
export const GROUP_CAP_MS = 8000; // [ASSUMED: proposed to the user 2026-11-22, not yet OK'd — 8 s covers a typical PC's cold Grand Alliance load, 4.9–5.3 s measured at 1080p]
/** A smooth frame: 30 fps, the flip's gate (no frame over 33 ms: the lead's brief of 2026-11-22), +1 ms of frame-timer jitter as the review page's gates allow [src: public/dev/dyn-review.js measure]. */
export const FLIP_SMOOTH_MS = 1000 / 30 + 1;
export const FLIP_SMOOTH_FRAMES = 10; // [ASSUMED: proposed to the user 2026-11-22, not yet OK'd — about 0.17–0.33 s of smooth frames before the cards show]
export const FLIP_GIVE_UP_MS = 3000; // [ASSUMED: proposed to the user 2026-11-22, not yet OK'd — the user's PC settled 0.06–0.28 s after the start; a 4× slower CPU never settles with 8 cards]
let group = null; // { entries: Set, flipped, timer, check, hold, wait, gaveUp }

function startCard(e) { try { e.card?.start(); } catch (err) { console.warn('[dynillust] start', err); } }
function showCard(e) { try { e.show?.(); } catch (err) { console.warn('[dynillust] show', err); } }
function giveUpCard(e) { try { e.giveUp?.(); } catch (err) { console.warn('[dynillust] give up', err); } }

/**
 * After `entries` started (hidden): show them in one frame once FLIP_SMOOTH_FRAMES frames in a row took at most
 * FLIP_SMOOTH_MS and each has its dissolve prepared (`e.prepared`), or keep their 2D art FLIP_GIVE_UP_MS after the
 * start. The first interval measured is the start frame's own, so the count begins a frame later. Returns a cancel.
 */
function whenSmooth(entries, onGiveUp) {
  let t0 = 0, last = 0, n = 0, smooth = 0, id = 0, done = false;
  const tick = (t) => {
    id = 0;
    if (done) return;
    if (!t0) t0 = last = t;
    else { n++; smooth = n >= 2 && t - last <= FLIP_SMOOTH_MS ? smooth + 1 : 0; last = t; }
    const cur = entries.filter((e) => !e.gone);
    if (!cur.length) { done = true; return; }
    if (smooth >= FLIP_SMOOTH_FRAMES && cur.every((e) => e.prepared !== false)) { done = true; for (const e of cur) showCard(e); return; }
    if (t0 && t - t0 >= FLIP_GIVE_UP_MS) { done = true; for (const e of cur) giveUpCard(e); onGiveUp?.(); return; }
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => { done = true; if (id) cancelAnimationFrame(id); };
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
 *   backdrop: the official card background behind the live illustration (BACKDROP; the room and Grand Alliance cards)
 */
export function IllustArt({ art, animate, wait = 'now', backdrop = false, class: cls = '', children }) {
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
  const root = useRef(null), dis = useRef(null);
  useEffect(() => {
    setState(on ? 'loading' : 'off');
    setShown(wait !== 'settled');
    setReveal('fade');
    setCovered(false);
    if (!on) return undefined;
    let card = null, live = true, kept = false, raf = 0, cur = 'loading', isCovered = false;
    const entry = wait === 'settled' ? { card: null, state: 'loading', alone: false, prepared: false, show: () => { if (live) showNow(); }, giveUp: () => keep2d() } : null;
    // a page that never got smooth: the card keeps its 2D art and its illustration stops (no low-FPS illustration)
    const keep2d = () => {
      if (!live || kept) return;
      kept = true;
      try { card?.unmount(); card?.canvas?.remove(); } catch (err) { console.warn('[dynillust] unmount', err); }
      if (dis.current) dis.current.style.opacity = '0';
      isCovered = false;
      setCovered(false);
      setState('off');
    };
    // the dissolve's picture: the card's art box exactly as it shows — its background, then the 2D art (object-fit cover
    // at its object-position, its filter) — composed and put on the GPU while the cards wait, again at the show if the
    // box changed size
    let pic = null, picKey = '';
    const compose = () => {
      const img = entry.img, box = img?.offsetParent;
      const r = img?.isConnected ? img.getBoundingClientRect() : null;
      if (!img || !box || !r || !(r.width > 0 && r.height > 0) || !img.naturalWidth) return null;
      const dpr = globalThis.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      const key = `${W}x${H}|${img.currentSrc || img.src}`;
      if (pic && key === picKey) return { W, H };
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      paintBackground(g, box, W, H);
      const cs = globalThis.getComputedStyle(img);
      const [px, py] = objectPosition(cs.objectPosition);
      const uv = coverUv(img.naturalWidth, img.naturalHeight, r.width, r.height, px, py);
      if (cs.filter && cs.filter !== 'none') g.filter = cs.filter;
      g.drawImage(img, uv.u0 * img.naturalWidth, uv.t0 * img.naturalHeight, (uv.u1 - uv.u0) * img.naturalWidth, (uv.t1 - uv.t0) * img.naturalHeight, 0, 0, W, H);
      pic = dissolvePicture(c, entry.mask, pic);
      picKey = key;
      return pic ? { W, H } : null;
    };
    const prepare = () => {
      const img = root.current?.querySelector?.('.dyn-art__still img');
      const cs = img && globalThis.getComputedStyle ? globalThis.getComputedStyle(img) : null;
      if (!img || !cs || cs.objectFit !== 'cover' || reducedMotion()) { entry.prepared = true; return; }
      entry.img = img;
      // the card background the illustration shows over (BACKDROP) decoded now, not in the frame the cards show
      const bgUrl = backdrop ? uiUrl(data.get('assets'), BACKDROP.sprite) : null;
      const bgImg = bgUrl && typeof Image === 'function' ? Object.assign(new Image(), { src: bgUrl }) : null;
      Promise.all([loadDissolve(), img.decode ? img.decode().catch(() => {}) : null, bgImg?.decode ? bgImg.decode().catch(() => {}) : null])
        .then(([mask]) => {
          if (!live) return;
          entry.mask = mask;
          // the dissolve's first frame drawn now on the (still invisible) canvas
          const size = compose();
          if (size && dis.current && drawDissolve(dis.current, pic, 0, size.W, size.H)) { drawnKey = picKey; cover(); }
        }, (err) => console.warn('[dynillust] dissolve', err))
        .finally(() => { entry.prepared = true; });
    };
    let drawnKey = '';
    // once the illustration runs (started hidden) and the first frame is drawn: the canvas covers the card, identical
    // to its 2D art, and the illustration and its background take their place under it
    const cover = () => {
      if (!live || kept || isCovered || cur !== 'live' || !drawnKey || !dis.current) return;
      isCovered = true;
      dis.current.style.opacity = '1';
      setReveal('dissolve');
      setCovered(true);
    };
    const showNow = () => {
      const cv = dis.current;
      const size = isCovered && cv ? compose() : null;
      if (size) {
        const { W, H } = size;
        // the box changed size since: its first frame again
        if (drawnKey === picKey || drawDissolve(cv, pic, 0, W, H)) {
          setShown(true);
          const t0 = performance.now();
          const step = () => {
            raf = 0;
            if (!live) return;
            const k = (performance.now() - t0) / (FLIP_DISSOLVE_S * 1000);
            drawDissolve(cv, pic, k, W, H);
            if (k < 1) { raf = requestAnimationFrame(step); return; }
            cv.style.opacity = '0'; cv.width = 1; cv.height = 1;
            freeDissolvePicture(pic); pic = null;
          };
          raf = requestAnimationFrame(step);
          return;
        }
      }
      setShown(true);
    };
    const go = () => readyStage(tier).then(({ R, st }) => {
      const key = live ? illustKey(R, art) : null;
      if (!key || !host.current) { if (live) setState('off'); return null; }
      // the renderer's card: its own 2D canvas in the art window, under the card's overlays (§33.19); 'live' = drawn
      card = st.mount(key, { onState: (s) => { if (!live || kept) return; cur = s; setState(s); if (entry) { groupState(entry, s); if (s === 'live') cover(); } } });
      if (card.canvas) host.current.append(card.canvas);
      if (entry) { entry.card = card; prepare(); joinGroup(entry); } else card.start();
      return card.ready;
    }).catch((err) => { console.warn('[dynillust] card', err); if (live) setState('off'); });
    // every card on the screen waits for the same moment and then loads at once (the renderer fetches and builds them in
    // parallel); a loadLater task per card made them load one by one — its queue runs one task at a time
    // the renderer's code (PIXI, pixi-spine — main.js prefetched their files after the entry film — the module and the
    // index) gets ready during that wait; only the illustrations' own files wait for the screen
    if (wait === 'settled') opening.then(() => { readyStage().catch(() => {}); return whenScreenSettled(); }).then(() => { if (live) go(); });
    else go();
    return () => {
      live = false;
      if (raf) cancelAnimationFrame(raf);
      freeDissolvePicture(pic); pic = null;
      if (entry) leaveGroup(entry);
      try { card?.unmount(); card?.canvas?.remove(); } catch (err) { console.warn('[dynillust] unmount', err); }
    };
  }, [id, on, wait, tier]);
  // what the card shows: 'ready' while it runs hidden before its group shows
  const vis = state === 'live' && !shown ? 'ready' : state;
  // in place (under the dissolve's cover, or shown)
  const placed = state === 'live' && (shown || covered);
  const bg = backdrop && placed ? uiUrl(data.get('assets'), BACKDROP.sprite) : null;
  return html`<div ref=${root} class=${`dyn-art${placed ? ' is-live' : ''}${wait === 'settled' ? ' dyn-art--flip' : ''}${reveal === 'dissolve' ? ' dyn-art--dissolve' : ''}${cls ? ` ${cls}` : ''}`} data-dyn=${vis}>
    <div class="dyn-art__still">${children}</div>
    ${bg ? html`<div class="dyn-art__bg" aria-hidden="true"><i style=${backdropStyle(bg)}></i></div>` : null}
    ${on ? html`<div class="dyn-art__live" ref=${host} aria-hidden="true"></div>` : null}
    ${on && wait === 'settled' ? html`<canvas class="dyn-art__dissolve" ref=${dis} aria-hidden="true"></canvas>` : null}
  </div>`;
}

/** Split a CSS value at its top-level commas. */
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Paint an element's own background into a 2D context of w × h: its colour, then a top-to-bottom linear-gradient (the
 * room card's art box: `linear-gradient(180deg, …)`, css/screens/room.css .rseat__art); any other image keeps the colour.
 */
export function paintBackground(g, el, w, h) {
  const cs = globalThis.getComputedStyle?.(el);
  if (!cs) return;
  const col = cs.backgroundColor;
  if (col && col !== 'transparent' && col !== 'rgba(0, 0, 0, 0)') { g.fillStyle = col; g.fillRect(0, 0, w, h); }
  const m = /^linear-gradient\((.*)\)$/.exec(String(cs.backgroundImage || '').trim());
  if (!m) return;
  let stops = splitTop(m[1]);
  const dir = stops[0];
  if (/deg$|^to /.test(dir)) { if (dir !== '180deg' && dir !== 'to bottom') return; stops = stops.slice(1); }
  if (!stops.length) return;
  const grad = g.createLinearGradient(0, 0, 0, h);
  stops.forEach((s, i) => {
    const sm = /^(.*\))\s+(-?[\d.]+)%$/.exec(s) || /^(\S+)\s+(-?[\d.]+)%$/.exec(s);
    const color = sm ? sm[1] : s;
    const at = sm ? parseFloat(sm[2]) / 100 : (stops.length > 1 ? i / (stops.length - 1) : 0);
    grad.addColorStop(Math.max(0, Math.min(1, at)), color);
  });
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
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
