// ui/dynCards.js — (fork) the operators' official dynamic illustrations (动态立绘: Spine 3.8 skeletons with their Unity
// effects and backgrounds) on the result, room and Grand Alliance cards: one card component for the three screens, the
// setting that decides which cards play one, which art each card shows, and when the illustrations load.
// Spec: crew-docs/l2d-art-proposal.md §1 (the user's decisions D5–D11 of 2026-11-22), §5. DESIGN §10 (Result, Room).
//
//   设置「动态立绘」 (`dynIllust`, D7): 关 / 仅自己 / 所有人 — 'auto' is 仅自己 on a phone and 所有人 elsewhere.
//   设置「结算卡片立绘」 (`resultArt`, D6): a result card shows the player's room card in its outfit, or the ace of the
//     final lineup — for every card, from this viewer's side.
//   Loading (D10 / D11): nothing during the match. The result cards' illustrations start loading the moment the server
//     says the last battle is over (m.public `ending`, server/match/results.js endingView) and load through the
//     settlement pause; the result screen opens as soon as every one is ready, at most RESULT_WAIT_MS after the pause
//     (screens/game.js). The room / Grand Alliance cards load once the room screen has what it needs (loadLater.js) and
//     after the entry film's files (D10, the first-impression rule). A card whose illustration is not ready shows its 2D
//     art and switches when it is (D11), playing its intro into idle.
//
// The renderer (render/dynillust/, its mount API in the data contract) draws the illustrations; until it is installed
// with setDynApi() every card keeps its 2D art.

import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { createStore, useStore } from '../store.js';
import { settingsStore } from './settingsStore.js';
import { touchDevice } from '../render/vfx/tier.js';
import { screenShortSide, PHONE_MAX_SIDE } from './device.js';
import { choiceOf } from './outfits.js';
import { seatOperator, cardContext, cardOperators, CARD_KEY, cardStore } from './seatArt.js';
import { loadLater } from '../loadLater.js';

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
 * The official skin whose illustration a card plays: the outfit worn, else the operator's E2 art (`<charId>#2`) — the
 * default look's full artwork, as the outfit picker previews it (docs/OUTFITS.md "默认 … previews the E2 artwork").
 * @param {string|null|undefined} charId @param {string|null|undefined} outfit a skinId (docs/OUTFITS.md)
 */
export function illustSkinId(charId, outfit) {
  if (typeof charId !== 'string' || !charId) return null;
  return typeof outfit === 'string' && outfit ? outfit : `${charId}#2`;
}

/**
 * A card's art: the chess record it draws, the owner's outfit for it (null = the default look) and the illustration's
 * skin. The outfit follows ui/outfits.js choiceOf: one's own choice, another seat's from room.state seats[].outfits.
 * @param {any} chess a chess record (or null: no art)
 * @param {string|null} ownerId
 * @param {(ownerId: string|null) => Record<string, string>} [choices]
 * @returns {{ chess: any, charId: string, outfit: string|null, skinId: string } | null}
 */
export function cardArtOf(chess, ownerId, choices = choiceOf) {
  const charId = chess && typeof chess.charId === 'string' ? chess.charId : null;
  if (!charId) return null;
  const outfit = (choices(ownerId) || {})[charId] || null;
  return { chess, charId, outfit, skinId: illustSkinId(charId, outfit) };
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
 * shows the player's assistant, spec §2); 'ace' — the best unit of the final lineup. An AI seat has no room card: its
 * card shows the ace either way (the remake's card before).
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

// ---- the renderer --------------------------------------------------------------------------------------------------

/**
 * What the screens need of the renderer (render/dynillust/, the data contract's mount API):
 *   has(skinId)            this server has that illustration (its index is loaded: `ready()`)
 *   any()                  this server has at least one (the settings show their rows only then)
 *   ready()                a promise for the index
 *   load(skinId, { signal })  download, decode, build, upload and warm one illustration: a promise for when a mount
 *                          shows it at once; a signal aborts it (the card left the screen)
 *   mount(el, skinId, { onShown })  draw it in `el` (the card's art box, official framing): fade in, intro, idle;
 *                          returns { destroy() }. onShown: the illustration covers the card (the 2D art can go).
 * Without one, no card animates.
 */
const NONE = Object.freeze({
  has: () => false,
  any: () => false,
  ready: () => Promise.resolve(),
  load: () => Promise.reject(new Error('no dynamic illustration renderer')),
  mount: () => null,
});
let api = NONE;

/** Install the renderer (null: none — every card 2D). */
export function setDynApi(next) {
  api = next || NONE;
  loads.clear();
  loadStore.set({ ready: {} });
  availableStore.set({ on: false });
  const mine = api;
  Promise.resolve(api.ready()).then(() => { if (api === mine) availableStore.set({ on: !!api.any() }); }, () => {});
}

/** Whether this server has any illustration (the index says so): the settings rows show only then. */
export const availableStore = createStore({ on: false });
export function useDynAvailable() { return useStore((s) => s.on, Object.is, availableStore); }

// ---- loading -------------------------------------------------------------------------------------------------------

/** skinId → 'ready' | 'failed' (missing: not loaded, or loading). */
export const loadStore = createStore({ ready: {} });
const loads = new Map(); // skinId → { promise, ctrl, users }

const mark = (skinId, state) => loadStore.set({ ready: { ...loadStore.get().ready, [skinId]: state } });

/**
 * Load one illustration (once; later calls share it). Resolves true when it is ready, false when this server has none
 * or it failed (the card keeps its 2D art).
 * @param {string} skinId
 * @returns {Promise<boolean>}
 */
export function loadIllust(skinId) {
  if (!skinId) return Promise.resolve(false);
  const known = loads.get(skinId);
  if (known) return known.promise;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const promise = Promise.resolve(api.ready())
    .then(() => {
      if (!api.has(skinId)) return false;
      return Promise.resolve(api.load(skinId, { signal: ctrl?.signal })).then(() => true);
    })
    .then((ok) => { if (loads.get(skinId)?.promise === promise) mark(skinId, ok ? 'ready' : 'failed'); return ok; },
      (err) => {
        if (loads.get(skinId)?.promise === promise) {
          if (ctrl?.signal.aborted) loads.delete(skinId); // a card that left: a later card asks again
          else { mark(skinId, 'failed'); console.warn('[dynillust] load failed', skinId, err); }
        }
        return false;
      });
  loads.set(skinId, { promise, ctrl });
  return promise;
}

/** skinId → how many cards on screen want it (IllustArt), so a card that leaves stops only the loads nobody wants. */
const wanted = new Map();
const want = (skinId) => { wanted.set(skinId, (wanted.get(skinId) || 0) + 1); };
const unwant = (skinId) => {
  const n = (wanted.get(skinId) || 0) - 1;
  if (n > 0) { wanted.set(skinId, n); return; }
  wanted.delete(skinId);
  const l = loads.get(skinId);
  if (!l || loadStore.get().ready[skinId] || resultLoad?.ids.has(skinId)) return;
  l.ctrl?.abort();
  loads.delete(skinId);
};

/** The entry film's files (main.js openingLoaded): the room's illustrations wait for them (the first-impression rule). */
let opening = Promise.resolve();
export function afterOpening(promise) { opening = Promise.resolve(promise).catch(() => {}); }

/** Room / Grand Alliance: load once the screen has what it needs and the entry film's files are in (spec §5.3). */
export function loadWhenSettled(skinId) {
  return new Promise((resolve) => {
    // a card that left meanwhile (the match started) loads nothing: no illustration loads during the match (D10)
    opening.then(() => loadLater(() => (wanted.get(skinId) > 0 ? loadIllust(skinId) : Promise.resolve(false)).then(resolve)));
  });
}

// ---- the result screen's wait (D10 / D11) --------------------------------------------------------------------------

let resultLoad = null; // { ids: Set<string>, pending: number }

/**
 * Start loading the result cards' illustrations (the moment m.public `ending` arrives; once per match: screens/settle.js
 * useResultPreload).
 * @param {string[]} skinIds the cards that animate
 */
export function startResultLoad(skinIds) {
  const ids = [...new Set(skinIds.filter(Boolean))];
  const state = { ids: new Set(ids), pending: ids.length };
  resultLoad = state;
  for (const id of ids) loadIllust(id).finally(() => { state.pending--; resultGateStore.set({ n: resultGateStore.get().n + 1 }); });
}

/** A tick per settled result load: screens/game.js re-checks its wait. */
export const resultGateStore = createStore({ n: 0 });

/**
 * How long the result screen still waits (ms; 0 = open it): the result cards' loads still running, at most
 * RESULT_WAIT_MS after the result arrived (`resultAt`).
 */
export function resultWaitMs(resultAt, now = Date.now()) {
  if (!resultLoad || resultLoad.pending <= 0 || !(resultAt > 0)) return 0;
  return Math.max(0, resultAt + RESULT_WAIT_MS - now);
}

/** Forget the match's result load (a new match). */
export function endResultLoad() { resultLoad = null; }

// ---- the card ------------------------------------------------------------------------------------------------------

/**
 * A card's art box: the 2D art (children) and, when the card animates and its illustration is ready, the illustration
 * mounted over it — the same on the result, room and Grand Alliance cards (D5). A card whose illustration is still
 * loading keeps its 2D art and switches when it is ready (D11). No tap action (D9).
 * @param {{ skinId: string|null, animate: boolean, wait?: 'now'|'settled', class?: string, children?: any }} props
 *   wait: 'now' loads at once (the result screen), 'settled' after the screen has what it needs (room)
 */
export function IllustArt({ skinId, animate, wait = 'now', class: cls = '', children }) {
  const host = useRef(null);
  const state = useStore((s) => (skinId ? s.ready[skinId] : undefined), Object.is, loadStore);
  const [shown, setShown] = useState(false);
  const on = !!(animate && skinId);
  useEffect(() => {
    if (!on) return undefined;
    want(skinId);
    if (!loadStore.get().ready[skinId]) { if (wait === 'settled') loadWhenSettled(skinId); else loadIllust(skinId); }
    return () => unwant(skinId);
  }, [on, skinId, wait]);
  useEffect(() => {
    setShown(false);
    if (!on || state !== 'ready' || !host.current) return undefined;
    const h = api.mount(host.current, skinId, { onShown: () => setShown(true) });
    return () => { try { h?.destroy(); } catch (err) { console.warn('[dynillust] destroy', err); } };
  }, [on, skinId, state]);
  return html`<div class=${`dyn-art${shown ? ' is-live' : ''}${cls ? ` ${cls}` : ''}`} data-dyn=${on ? (state || 'loading') : 'off'}>
    <div class="dyn-art__still">${children}</div>
    ${on && state === 'ready' ? html`<div class="dyn-art__live" ref=${host} aria-hidden="true"></div>` : null}
  </div>`;
}
