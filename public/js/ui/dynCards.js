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
//     art and switches when it is (D11). How a card appears and switches (no intro, no fade on appear; the official
//     controller's crossfade on a late switch — the user, 2026-11-22) is the renderer's: nothing here animates it.
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
import { screenShortSide, PHONE_MAX_SIDE } from './device.js';
import { choiceOf } from './outfits.js';
import { seatOperator, cardContext, cardOperators, CARD_KEY, cardStore } from './seatArt.js';
import { whenScreenSettled } from '../loadLater.js';
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
 * The page's stage, its index loaded and its quality set (the phone's half-resolution pages, spec §4.3 — a phone is
 * where 动态立绘's auto is 仅自己): one for the whole page (the renderer's), never destroyed by a screen.
 */
let qualityOverride = null;
/** The review page's phone frame: the pages a phone gets ('half' | 'full' | null = by the device). */
export function setDynQuality(q) { qualityOverride = q === 'half' || q === 'full' ? q : null; }

async function readyStage() {
  const R = await renderer();
  const st = R.getDynIllustStage();
  st.quality = qualityOverride || (phoneDevice() ? 'half' : 'full');
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

// ---- the card ------------------------------------------------------------------------------------------------------

/**
 * A card's art box: the 2D art (children) and, when the card animates and its illustration is ready, the illustration
 * drawn over it — the same on the result, room and Grand Alliance cards (D5). A card whose illustration is still loading
 * keeps its 2D art and switches when it is ready (D11). No tap action (D9).
 * @param {{ art: { charId: string, outfit: string|null } | null, animate: boolean, wait?: 'now'|'settled', class?: string, children?: any }} props
 *   wait: 'now' mounts at once (the result screen: loaded in the pause), 'settled' once the screen has what it needs (room)
 */
export function IllustArt({ art, animate, wait = 'now', class: cls = '', children }) {
  const on = !!(animate && art);
  const id = on ? `${art.charId}|${art.outfit || ''}` : '';
  const host = useRef(null);
  const [state, setState] = useState('off');
  useEffect(() => {
    setState(on ? 'loading' : 'off');
    if (!on) return undefined;
    let card = null, live = true;
    const go = () => readyStage().then(({ R, st }) => {
      const key = live ? illustKey(R, art) : null;
      if (!key || !host.current) { if (live) setState('off'); return null; }
      // the renderer's card: its own 2D canvas in the art window, under the card's overlays (§33.19); 'live' = drawn
      card = st.mount(key, { onState: (s) => { if (live) setState(s); } });
      if (card.canvas) host.current.append(card.canvas);
      card.start();
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
      try { card?.unmount(); card?.canvas?.remove(); } catch (err) { console.warn('[dynillust] unmount', err); }
    };
  }, [id, on, wait]);
  return html`<div class=${`dyn-art${state === 'live' ? ' is-live' : ''}${cls ? ` ${cls}` : ''}`} data-dyn=${state}>
    <div class="dyn-art__still">${children}</div>
    ${on ? html`<div class="dyn-art__live" ref=${host} aria-hidden="true"></div>` : null}
  </div>`;
}
