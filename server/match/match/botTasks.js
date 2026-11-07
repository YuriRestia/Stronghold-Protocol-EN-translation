// server/match/match/botTasks.js — (fork) Match methods: a bot seat's prep played in the host's browser
// (docs/host-browser-bots.md). The real bot code runs against a restored copy of the match (server/match/shadowMatch.js);
// this side reserves what the copy needs, sends the snapshot (server/match/botWorld.js) and applies the returned moves
// as the same `g.*` intents a human sends.
//
// Seat streams: a refresh's cards come from `rngShop`, and the bot reacts to them in the same prep, so the copy has to
// roll what the server will roll. While a bot seat's moves run, on both sides, that seat draws from random streams of its
// own and takes uids from a reserved block (`withSeatStreams`). Human seats keep the shared streams.
//
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { validateC2S } from '../../../shared/protocol.js';
import { createRng, deriveSeed } from '../../sim/rng.js';
import { buildWorld, seatHash, applyMemo } from '../botWorld.js';
import { DELAYS, fail } from './common.js';

/** Uids reserved per task: far more pieces than a prep can create (a batch holds at most MAX_BATCH_MOVES moves). */
export const BOT_UID_BLOCK = 4096;
/** The most moves one batch may carry. The traced maximum is 43 for a whole prep; a batch past this is refused. */
export const MAX_BATCH_MOVES = 200;
/** Fresh snapshots a seat gets per prep before it keeps its board and readies up (design B7). */
export const MAX_BOT_ATTEMPTS = 3;

/** What a bot's move list may contain. Never g.leave, g.autoplay, g.pause or g.test. */
const BOT_INTENTS = new Set(['g.buy', 'g.refresh', 'g.freeze', 'g.levelUp', 'g.sell', 'g.move', 'g.equip', 'g.art',
  'g.destroy', 'g.unequip', 'g.reward', 'g.choice', 'g.ready']);
/** The one move with no intent: the rule-level temp resolve bot.js calls (`ps.resolveTemp`). Only this path accepts it. */
const RESOLVE_TEMP = 'bot.resolveTemp';

export class MatchBotTasks {
  /**
   * A seat's task: its streams and uid block for this prep. The seeds are derived, so both sides start from the same
   * state; `attempt` gives a retry different rolls than the attempt that went stale.
   */
  newBotTask(ps) {
    const key = `${this.round}:${ps.seat}`;
    const attempt = this._botAttempts.get(key) ?? 0;
    this._botAttempts.set(key, attempt + 1);
    const seeds = {
      shop: deriveSeed(this.seed, `botShop:${key}:${attempt}`),
      meta: deriveSeed(this.seed, `botMeta:${key}:${attempt}`),
      bots: deriveSeed(this.seed, `botRng:${key}:${attempt}`),
    };
    const uidBase = this.uidSeq;
    this.uidSeq += BOT_UID_BLOCK;
    return {
      id: `${this.battlePrefix}.bot.${key}.${attempt}`, playerId: ps.playerId, round: this.round, attempt, seeds, uidBase,
      uidCursor: uidBase, rngShop: createRng(seeds.shop), rngMeta: createRng(seeds.meta), rngBots: createRng(seeds.bots),
    };
  }

  /** Run `fn` with the task's streams and uid block in place of the match's (always restored; synchronous only). */
  withSeatStreams(task, fn) {
    const { rngShop, rngMeta, rngBots, uidSeq } = this;
    this.rngShop = task.rngShop;
    this.rngMeta = task.rngMeta;
    this.rngBots = task.rngBots;
    this.uidSeq = task.uidCursor;
    try {
      return fn();
    } finally {
      task.uidCursor = this.uidSeq;
      this.rngShop = rngShop;
      this.rngMeta = rngMeta;
      this.rngBots = rngBots;
      this.uidSeq = uidSeq;
      if (task.uidCursor - task.uidBase > BOT_UID_BLOCK) this.reportError(`bot ${task.playerId}`, new RangeError('uid block overrun'));
    }
  }

  /** Host mode: this seat plays its prep on an executor, one seat at a time per room (each bot changes the shared pool). */
  queueBotPrep(ps) {
    ps._botPrepToken = (ps._botPrepToken || 0) + 1;
    this._botQueue.push({ ps, token: ps._botPrepToken, round: this.round });
    if (this._botActive || this._botPumpQueued) return;
    this._botPumpQueued = true;
    this.later(this.scaled(DELAYS.BOT_ACTION), () => { this._botPumpQueued = false; this._pumpBotQueue(); });
  }

  /** Start the next seat that still wants its prep. */
  _pumpBotQueue() {
    while (!this._botActive && this._botQueue.length) {
      const entry = this._botQueue.shift();
      if (this._botEntryLive(entry)) this._startBotTask(entry);
    }
  }

  _botEntryLive({ ps, token, round }) {
    return this.phase === PHASE.PREP && this.round === round && ps.alive && !ps.ready && ps.botControlled && ps._botPrepToken === token;
  }

  /** Send one seat's snapshot to the executor. With no executor the seat keeps its board and readies up. */
  _startBotTask(entry) {
    if (!this.botExecutor) { this._finishBotSeat(entry); return; }
    const task = this.newBotTask(entry.ps);
    this._botActive = { entry, task, stale: 0 };
    this._submitBotTask(this._botActive);
  }

  _submitBotTask(active) {
    try {
      this.botExecutor.submit({ taskId: active.task.id, playerId: active.entry.ps.playerId, world: buildWorld(this, active.entry.ps, active.task) });
    } catch (e) {
      this.reportError(`bot ${active.entry.ps.playerId} task`, e);
      this._endBotTask(active);
    }
  }

  /**
   * One batch of a seat's moves came back: `plan` (economy and the default layout) or `final` (the rehearsed layout and
   * Ready). A plan move that is refused, or whose result differs from what the copy computed, means the world changed
   * underneath it: applying stops, moves already applied stay, and the seat gets a fresh snapshot.
   * @returns {{ ok: true, applied: number } | { ok: true, applied: number, stale: string } | { error: string, detail?: string }}
   */
  receiveBotBatch(taskId, { batch, moves, memo } = {}) {
    const active = this._botActive;
    if (!active || active.task.id !== taskId) return { ok: true, applied: 0, stale: 'gone' };
    if ((batch !== 'plan' && batch !== 'final') || !Array.isArray(moves) || moves.length > MAX_BATCH_MOVES) return fail(ERR.BAD_MSG, 'bad bot batch');
    if (!this._botEntryLive(active.entry)) { this._endBotTask(active); return { ok: true, applied: 0, stale: 'gone' }; }
    const { ps } = active.entry;
    let applied = 0;
    let stale = null;
    for (const move of moves) {
      const reason = this._applyBotMove(active.task, ps, move);
      if (reason && batch === 'plan') { stale = reason; break; }
      if (!reason) applied++;
      if (ps.ready) break;
    }
    if (batch === 'final') applyMemo(ps, memo);
    try { this.flush(); } catch (e) { this.reportError('flush', e); }
    if (stale) {
      if (++active.stale >= MAX_BOT_ATTEMPTS) { this._endBotTask(active); return { ok: true, applied, stale }; }
      active.task = this.newBotTask(ps);
      this._submitBotTask(active);
      return { ok: true, applied, stale };
    }
    if (batch === 'final') this._endBotTask(active);
    return { ok: true, applied };
  }

  /** @returns {string|null} why the move does not stand, null when it applied as computed */
  _applyBotMove(task, ps, move) {
    if (!move || typeof move !== 'object') return 'malformed';
    const { x, ...msg } = move;
    if (msg.t !== RESOLVE_TEMP) {
      if (!BOT_INTENTS.has(msg.t)) return `not allowed: ${String(msg.t).slice(0, 32)}`;
      const bad = validateC2S(msg);
      if (bad) return `invalid: ${bad}`;
    }
    let res;
    try {
      res = this.withSeatStreams(task, () => (msg.t === RESOLVE_TEMP ? ps.resolveTemp() : this._handle(ps, msg)));
    } catch (e) {
      this.reportError(`bot ${ps.playerId} ${msg.t}`, e);
      return 'threw';
    }
    if (res && res.error) return `refused: ${res.error}`;
    if (x !== undefined && x !== seatHash(ps)) return `differs after ${msg.t}`;
    return null;
  }

  _endBotTask(active) {
    if (this._botActive === active) this._botActive = null;
    this._finishBotSeat(active.entry);
    this.later(0, () => this._pumpBotQueue());
  }

  /** The rule-level finish, as when the prep's own routine ends (scheduleBotPrep `ready`): no bot decision is made here. */
  _finishBotSeat(entry) {
    const { ps } = entry;
    if (!this._botEntryLive(entry)) return;
    this.autoPickPersonalChoice(ps, 'random');
    ps.resolveTemp();
    ps.setReady(true);
  }

  /** The prep ended, or the seat changed hands: nothing queued or running for it may still apply. */
  cancelBotTasks(playerId = null) {
    this._botQueue = playerId ? this._botQueue.filter((e) => e.ps.playerId !== playerId) : [];
    if (this._botActive && (!playerId || this._botActive.entry.ps.playerId === playerId)) {
      const active = this._botActive;
      this._botActive = null;
      try { this.botExecutor?.cancel?.(active.task.id); } catch (e) { this.reportError('bot cancel', e); }
      this.later(0, () => this._pumpBotQueue());
    }
  }
}
