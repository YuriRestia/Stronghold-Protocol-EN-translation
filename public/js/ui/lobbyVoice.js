// ui/lobbyVoice.js — (fork) the animated cards talk in the room and the Grand Alliance room (crew-docs
// l2d-lobby-voice-proposal.md; the user's decisions of 2026-11-23). Two kinds of line, both only from a card whose
// animated illustration is live on this screen (ui/dynCards.js IllustArt, `data-dyn="live"`), in the player's voice
// language, per-operator pick and the card's outfit voice set (audio.js voice):
//
//   Chatter — the official home screen's idle line, stretched to a room of cards. The official client plays its 闲置 line
//     once 120 s pass with no touch and no voice playing, a touch or any voice restarting the timer
//     (GameAssembly.dll HomeIllustView.Update RVA 0x1F36800: isFingerDown / VoiceManager.isPlaying → PeriodicTimer.Reset,
//     else Reset(120.0f) and LoadRandomCharData(HOME_WAIT)). Here: after CHATTER_QUIET_MS of quiet plus a random
//     0–CHATTER_JITTER_MS, one card says a random 交谈 / 闲置 line (never the same one twice in a row); the cards take turns
//     (the one silent longest speaks), and one card speaks at most once every CARD_REST_MS. A click, tap or key press —
//     typing in the room chat too — restarts the quiet, as any voice line does; nothing while the tab is hidden.
//   Join — a player who joins the room with an animated card says a random pick of 任命队长 / 部署 / 问候 once their card
//     goes live (the official home screen speaks as an animated illustration enters, PlayDynEntranceVoice RVA 0x1F35E00;
//     the user's pick of the lines). Players joining one after another talk over each other: the newest line cuts the one
//     on air off (the official 0.1 s fade, audio.js VOICE_XFADE_S), but not before that one said about JOIN_WORDS of its
//     words — 2 ÷ the line's word count (tools/assets/lobby-voice.json, the English text) × the length of the file playing;
//     faster joins wait their turn, the last plays to its end. A join cuts a chatter line off; it never cuts another
//     voice (that one is skipped, not queued). One's own card greets once per room, when it first goes live.
//
// Nothing crosses the server: joins and every seat's card are in room.state already. A line downloads only when it plays
// (audio.js voice), never with the voice muted or at 0.

import { useEffect, useRef } from '../../vendor/hooks.module.js';
import { audio } from '../audio.js';
import { outfitVoiceOf } from './outfits.js';

/** Quiet before a chatter line [src: official GameAssembly.dll HomeIllustView.Update RVA 0x1F36800, f32 120.0 → PeriodicTimer.Reset before LoadRandomCharData(HOME_WAIT)]. */
export const CHATTER_QUIET_MS = 120000;
/** The random part on top, drawn again after each line [ASSUMED: random 0–60 s] user OK 2026-11-23 */
export const CHATTER_JITTER_MS = 60000;
/** One card speaks at most once in this long [ASSUMED: 300 s] user OK 2026-11-23 */
export const CARD_REST_MS = 300000;
/** A join line is cut off after about this many of its words when the next player's line comes in (the user, 2026-11-23). */
export const JOIN_WORDS = 2;
/** The chatter lines: 交谈 (8) and 闲置 (1), the official home screen's pool (the user's pick C, 2026-11-23). */
export const CHATTER_VOICE_SLOTS = Object.freeze(['talk', 'idle']);
/** The join line: a random pick of 任命队长 / 部署 / 问候 (the user, 2026-11-23); mirrors tools/assets/audio.mjs JOIN_VOICE_SLOTS. */
export const JOIN_VOICE_SLOTS = Object.freeze(['squadFirst', 'place', 'greeting']);
/** At most this many joins wait (a Grand Alliance room's 8 seats): a cap, never a growing list. */
export const JOIN_QUEUE_MAX = 8;
/** How often the chatter's quiet is counted (ms). */
export const TICK_MS = 1000;

/**
 * The rules, without the page: cards in, lines out through `voice`. The clock and the dice are passed in (tests).
 * @typedef {{ id: string, charId: string, voiceKey: string|null, live: boolean }} LobbyCard
 */
export class LobbyVoice {
  /**
   * @param {{ voice: { voice: Function, voiceBusy: () => boolean, voiceOnAir: (t:number) => boolean, stopVoice: (t:number) => void,
   *   voiceCount: Function, readonly voiceToken: number }, now?: () => number, random?: () => number,
   *   wordsOf?: (key: string, slot: string, line: number) => number|null,
   *   setTimer?: (fn: Function, ms: number) => any, clearTimer?: (h: any) => void }} o
   */
  constructor(o) {
    this.audio = o.voice;
    this.now = o.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.random = o.random || Math.random;
    this.wordsOf = o.wordsOf || (() => null);
    this.setTimer = o.setTimer || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer || ((h) => clearTimeout(h));
    /** @type {Map<string, LobbyCard>} */
    this.cards = new Map();
    this.lastSpoke = new Map();   // card id → when it last spoke (ms)
    this.lastLine = new Map();    // card id → 'slot:line' it said last
    this.quiet = 0;
    this.target = this._nextTarget();
    this.token = 0;               // the voiceToken of our line on air (0: none)
    this.kind = null;             // 'chatter' | 'join'
    this.cutAt = null;            // when the join line on air may be cut off (ms); null while it decodes
    /** @type {string[]} */
    this.queue = [];
    this.timer = null;
    this.stopped = false;
  }

  _nextTarget() { return CHATTER_QUIET_MS + this.random() * CHATTER_JITTER_MS; }

  /** The cards on screen now (each with whether its illustration is live). */
  setCards(list) {
    this.cards = new Map((list || []).filter((c) => c && c.id && c.charId).map((c) => [c.id, { ...c, voiceKey: c.voiceKey || null, live: !!c.live }]));
  }

  /** A click, tap or key press: the chatter's quiet starts again (the official touch). */
  activity() { this.quiet = 0; }

  /** Whether our own line holds the voice channel. */
  ours() { return !!this.token && this.audio.voiceOnAir(this.token); }

  /**
   * Count the quiet; at its end one card speaks.
   * @param {number} dt ms since the last tick
   * @param {{ hidden?: boolean }} [o]
   */
  tick(dt, o = {}) {
    if (this.stopped) return;
    if (this.queue.length) this.pump(o);
    if (o.hidden || this.audio.voiceBusy()) { this.quiet = 0; return; }
    this.quiet += dt;
    if (this.quiet < this.target) return;
    // every live card still resting: the quiet holds and the next tick asks again, so a lone card speaks as it is rested
    if (this.chatter() === 'rest') return;
    this.quiet = 0;
    this.target = this._nextTarget();
  }

  /** The set a card's line comes from: its outfit's own set when that has the slot, else the operator's. */
  _setOf(card, slot) {
    if (card.voiceKey && this.audio.voiceCount(card.charId, slot, card.voiceKey) > 0) return card.voiceKey;
    return null;
  }

  /** The lines a card can say from `slots`: [{ slot, line, key }]. */
  _lines(card, slots) {
    const out = [];
    for (const slot of slots) {
      const key = this._setOf(card, slot);
      const n = this.audio.voiceCount(card.charId, slot, key);
      for (let i = 0; i < n; i += 1) out.push({ slot, line: i, key });
    }
    return out;
  }

  _pick(list) { return list.length ? list[Math.min(list.length - 1, Math.floor(this.random() * list.length))] : null; }

  /**
   * One chatter line: the live card silent the longest (rested), a random line of its pool, not its last one.
   * @returns {true|false|'rest'} spoke · nobody can · live cards, all resting
   */
  chatter() {
    const t = this.now();
    const all = [...this.cards.values()].filter((c) => c.live);
    const live = all.filter((c) => t - (this.lastSpoke.get(c.id) ?? -Infinity) >= CARD_REST_MS);
    if (!live.length) return all.length ? 'rest' : false;
    const oldest = Math.min(...live.map((c) => this.lastSpoke.get(c.id) ?? -Infinity));
    const card = this._pick(live.filter((c) => (this.lastSpoke.get(c.id) ?? -Infinity) === oldest));
    const lines = this._lines(card, CHATTER_VOICE_SLOTS);
    const fresh = lines.length > 1 ? lines.filter((l) => `${l.slot}:${l.line}` !== this.lastLine.get(card.id)) : lines;
    const l = this._pick(fresh);
    if (!l) return false;
    const ok = this.audio.voice(card.charId, l.slot, { voiceKey: l.key, line: l.line, takeover: true });
    if (!ok) return false;
    this.token = this.audio.voiceToken;
    this.kind = 'chatter';
    this.cutAt = null;
    this.lastSpoke.set(card.id, t);
    this.lastLine.set(card.id, `${l.slot}:${l.line}`);
    return true;
  }

  /** A player's card joined and went live: its join line, now or after the line on air said its words. */
  join(id, o = {}) {
    if (this.stopped || o.hidden) return;
    const card = this.cards.get(id);
    if (!card?.live || this.queue.includes(id) || this.queue.length >= JOIN_QUEUE_MAX) return;
    this.queue.push(id);
    this.pump(o);
  }

  /** Start the next join line when its turn has come. */
  pump(o = {}) {
    if (this.stopped || !this.queue.length) return;
    if (o.hidden) { this.queue.length = 0; return; }
    const t = this.now();
    if (this.ours() && this.kind === 'join') {
      if (this.cutAt == null) return;                          // still decoding: onStart sets the cut
      if (t < this.cutAt) { this._wake(this.cutAt - t); return; }
    } else if (!this.ours() && this.audio.voiceBusy()) {
      this.queue.length = 0;                                   // another voice: skipped, not queued
      return;
    }
    const id = this.queue.shift();
    const card = this.cards.get(id);
    if (!card?.live) { this.pump(o); return; }
    const slot = this._pick(JOIN_VOICE_SLOTS.filter((s) => this._lines(card, [s]).length));
    const l = slot ? this._pick(this._lines(card, [slot])) : null;
    if (!l) { this.pump(o); return; }
    const words = this.wordsOf(l.key || card.charId, l.slot, l.line);
    const share = Number.isFinite(words) && words > 0 ? Math.min(1, JOIN_WORDS / words) : 1;
    let token = 0;
    const ok = this.audio.voice(card.charId, l.slot, { voiceKey: l.key, line: l.line, takeover: true, onStart: (seconds) => {
      if (token !== this.token || this.stopped) return;
      this.cutAt = this.now() + Math.max(0, seconds) * 1000 * share;
      if (this.queue.length) this._wake(Math.max(0, this.cutAt - this.now()));
    } });
    if (!ok) { this.pump(o); return; }
    token = this.token = this.audio.voiceToken;
    this.kind = 'join';
    this.cutAt = null;
    this.lastSpoke.set(card.id, t);
    this.lastLine.set(card.id, `${l.slot}:${l.line}`);
    this.quiet = 0;
  }

  _wake(ms) {
    if (this.timer != null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => { this.timer = null; this.pump(); }, ms);
  }

  /** Leaving the room screen: our line fades out, nothing waits. */
  stop() {
    this.stopped = true;
    this.queue.length = 0;
    if (this.timer != null) { this.clearTimer(this.timer); this.timer = null; }
    if (this.token) this.audio.stopVoice(this.token);
  }
}

/** Rooms whose own-card join line this page has played (once per room, not again after a match). */
const greetedRooms = new Set();

/** The join line's word count (audio.voiceWords, tools/assets/lobby-voice.json). */
function manifestWords(key, slot, line) {
  const n = audio.getManifest?.()?.audio?.voiceWords?.[key]?.[slot]?.[line];
  return Number.isFinite(n) ? n : null;
}

/**
 * The room screen's lobby voices.
 * @param {{ roomCode: string|null, cards: Array<{ id: string, charId: string, ownerId: string }>, myId: string|null,
 *   seatsRef: { current: HTMLElement|null } }} p `cards`: the seats whose card plays its illustration on this screen
 */
export function useLobbyVoice({ roomCode, cards, myId, seatsRef }) {
  const core = useRef(null);
  const present = useRef(null);   // the players seated when the room opened: they don't greet
  const greeted = useRef(new Set());
  const list = useRef([]);
  list.current = cards || [];
  // the room's run: made on entering a room, stopped on leaving it (the match starts, the room closes)
  useEffect(() => {
    if (!roomCode) return undefined;
    const lv = new LobbyVoice({ voice: audio, wordsOf: manifestWords });
    core.current = lv;
    present.current = new Set(list.current.map((c) => c.id));
    greeted.current = new Set();
    const hidden = () => typeof document !== 'undefined' && document.hidden;
    const liveIds = () => {
      const root = seatsRef.current;
      const ids = new Set();
      if (!root) return ids;
      for (const el of root.querySelectorAll('[data-voice-seat]')) {
        if (el.querySelector('.dyn-art[data-dyn="live"]')) ids.add(el.getAttribute('data-voice-seat'));
      }
      return ids;
    };
    const sync = () => {
      const live = liveIds();
      // a player who left: back in later, they join again (and greet)
      const seated = new Set(list.current.map((c) => c.id));
      for (const id of [...present.current]) if (!seated.has(id) && id !== myId) present.current.delete(id);
      for (const id of [...greeted.current]) if (!seated.has(id) && id !== myId) greeted.current.delete(id);
      lv.setCards(list.current.map((c) => ({ id: c.id, charId: c.charId, voiceKey: outfitVoiceOf({ charId: c.charId, ownerId: c.ownerId }), live: live.has(c.id) })));
      for (const c of list.current) {
        if (!live.has(c.id) || greeted.current.has(c.id)) continue;
        const own = c.id === myId;
        // a player seated after the room opened, or one's own card once per room
        if (own ? greetedRooms.has(roomCode) : present.current.has(c.id)) continue;
        greeted.current.add(c.id);
        if (own) greetedRooms.add(roomCode);
        lv.join(c.id, { hidden: hidden() });
      }
    };
    const root = seatsRef.current;
    const mo = root && typeof MutationObserver === 'function' ? new MutationObserver(sync) : null;
    mo?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-dyn'] });
    const act = () => lv.activity();
    globalThis.addEventListener?.('pointerdown', act, { capture: true, passive: true });
    globalThis.addEventListener?.('keydown', act, { capture: true, passive: true });
    const iv = setInterval(() => { sync(); lv.tick(TICK_MS, { hidden: hidden() }); }, TICK_MS);
    sync();
    return () => {
      clearInterval(iv);
      mo?.disconnect();
      globalThis.removeEventListener?.('pointerdown', act, { capture: true });
      globalThis.removeEventListener?.('keydown', act, { capture: true });
      lv.stop();
      core.current = null;
    };
  }, [roomCode, myId]);
  return core;
}
