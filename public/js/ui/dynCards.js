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
// createDynIllustStage → Stage.preload / Stage.mount → Card { ready, start(), state, unmount() }. One Stage serves the
// whole app while a screen with cards (or a result load) holds it, and is destroyed when none does — the match screens
// never hold it, so nothing of it lives through a match. Until setDynModule() installs the renderer, ui/dynStub.js
// stands in: same API, every card 2D.

import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { createStore, useStore } from '../store.js';
import { data, useData } from '../data.js';
import { settingsStore } from './settingsStore.js';
import { touchDevice } from '../render/vfx/tier.js';
import { screenShortSide, PHONE_MAX_SIDE } from './device.js';
import { choiceOf } from './outfits.js';
import { seatOperator, cardContext, cardOperators, CARD_KEY, cardStore } from './seatArt.js';
import { loadLater } from '../loadLater.js';
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

let mod = stub;

/**
 * Install the renderer module — `{ dynIllustKey, createDynIllustStage }` (render/dynillust/index.js) — or null for the
 * stand-in (ui/dynStub.js). A Stage already up is dropped: the next holder builds one from the new module.
 */
export function setDynModule(next) {
  mod = next && typeof next.createDynIllustStage === 'function' && typeof next.dynIllustKey === 'function' ? next : stub;
  if (stage) { try { stage.destroy(); } catch (err) { console.warn('[dynillust] stage destroy', err); } }
  stage = null;
  preloaded.clear();
}

/** The dynillust key of an art (its outfit, else the operator's default — the contract's null), or null: none here. */
export function illustKey(art) {
  if (!art) return null;
  try { return mod.dynIllustKey(art.charId, art.outfit || null) || null; } catch { return null; }
}

/** Whether this server has any illustration (data/local-assets.json group `dynillust`): the settings rows show only then. */
export function useDynAvailable() {
  useData('local');
  const g = data.get('local')?.groups?.dynillust;
  return !!g && typeof g === 'object' && Object.keys(g).length > 0;
}

let stage = null;
let holders = 0;
let dropTimer = 0;
const preloaded = new Map(); // key → the preload promise (true: in, false: failed), per Stage

/** Take the Stage (built on first use: the page, the phone's half-resolution pages — spec §4.3). */
function holdStage() {
  holders++;
  if (dropTimer) { clearTimeout(dropTimer); dropTimer = 0; }
  if (!stage) {
    stage = mod.createDynIllustStage({ parent: globalThis.document?.body, quality: phoneDevice() ? 'half' : 'full' });
    preloaded.clear();
  }
  return stage;
}

/** Give it back; when nobody holds it, it goes — after the current render, so a screen handing over to the next keeps it. */
function releaseStage() {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || dropTimer) return;
  dropTimer = setTimeout(() => {
    dropTimer = 0;
    if (holders > 0 || !stage) return;
    try { stage.destroy(); } catch (err) { console.warn('[dynillust] stage destroy', err); }
    stage = null;
    preloaded.clear();
  }, 0);
}

/**
 * Preload keys on the held Stage (once each per Stage): a promise that settles when every one is in or failed.
 * @param {string[]} keys
 */
function preload(keys) {
  const s = stage;
  const fresh = keys.filter((k) => k && !preloaded.has(k));
  if (s && fresh.length) {
    const p = Promise.resolve().then(() => s.preload(fresh)).then(() => true, (err) => { console.warn('[dynillust] preload', err); return false; });
    for (const k of fresh) preloaded.set(k, p);
  }
  return Promise.all(keys.filter(Boolean).map((k) => preloaded.get(k)));
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
 * useResultPreload). Holds the Stage until endResultLoad().
 * @param {() => any[]} cardsOf the arts that animate, computed once the illustration index is here
 * @param {{ index?: () => Promise<any> }} [o] index: loads the illustration index (data/local-assets.json)
 */
export function startResultLoad(cardsOf, { index = () => data.load('local') } = {}) {
  endResultLoad();
  const state = { pending: true, held: true };
  resultLoad = state;
  holdStage();
  const done = () => { if (state.pending) { state.pending = false; resultGateStore.set({ n: resultGateStore.get().n + 1 }); } };
  Promise.resolve().then(index).catch(() => null)
    .then(() => (resultLoad === state ? preload(cardsOf().map(illustKey).filter(Boolean)) : null))
    .then(done, done);
}

/**
 * How long the result screen still waits (ms; 0 = open it): the result cards' load still running, at most
 * RESULT_WAIT_MS after the result arrived (`resultAt`).
 */
export function resultWaitMs(resultAt, now = Date.now()) {
  if (!resultLoad || !resultLoad.pending || !(resultAt > 0)) return 0;
  return Math.max(0, resultAt + RESULT_WAIT_MS - now);
}

/** Forget the match's result load and give its Stage back (the next match began, or the page left the match). */
export function endResultLoad() {
  if (resultLoad?.held) { resultLoad.held = false; releaseStage(); }
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
  useData('local');
  const key = animate ? illustKey(art) : null;
  const host = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!key || !host.current) return undefined;
    let card = null, live = true;
    const s = holdStage();
    const go = () => {
      if (!live || stage !== s) return;
      card = s.mount(host.current, key);
      card.start();
      Promise.resolve(card.ready).then((ok) => { if (live && ok) setShown(true); }, () => {});
    };
    if (wait === 'settled') opening.then(() => loadLater(() => { if (live) go(); return Promise.resolve(card?.ready); }));
    else go();
    return () => {
      live = false;
      try { card?.unmount(); } catch (err) { console.warn('[dynillust] unmount', err); }
      releaseStage();
    };
  }, [key, wait]);
  return html`<div class=${`dyn-art${shown ? ' is-live' : ''}${cls ? ` ${cls}` : ''}`} data-dyn=${key ? (shown ? 'live' : 'loading') : 'off'}>
    <div class="dyn-art__still">${children}</div>
    ${key ? html`<div class="dyn-art__live" ref=${host} aria-hidden="true"></div>` : null}
  </div>`;
}
