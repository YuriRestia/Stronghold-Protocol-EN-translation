// server/match/match/botTasks.js — (fork) Match methods: a bot seat's prep played in a human's browser
// (docs/host-browser-bots.md). The real bot code runs against a restored copy of the match (server/match/shadowMatch.js);
// this side reserves what the copy needs, sends the snapshot (server/match/botWorld.js) and applies the returned moves
// as the same `g.*` intents a human sends.
//
// Seat streams: a refresh's cards come from `rngShop`, and the bot reacts to them in the same prep, so the copy has to
// roll what the server will roll. While a bot seat's moves run, on both sides, that seat draws from random streams of its
// own and takes uids from a reserved block (`withSeatStreams`). Human seats keep the shared streams.
//
// A bot's band or card pick is a small task on the same frames: one `final` batch with one move (design B10).
//
// Live frames: b.botTask → b.botReceived (at once) → b.botMoves { batch: 'plan' } → b.botAck → b.botMoves { batch: 'final' }.
// b.botHurry stops the rehearsal at the best layout so far, b.botCancel drops the task. No receipt, a silent executor, a
// failed task, a hidden tab or a lost connection moves the seat to the next human with a fresh snapshot; moves already
// applied stay. With nobody left, the seat keeps its board and readies up: the server makes no bot decision.
//
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { validateC2S } from '../../../shared/protocol.js';
import { createRng, deriveSeed } from '../../sim/rng.js';
import { buildWorld, seatHash, applyMemo } from '../botWorld.js';
import { DELAYS, OK, fail } from './common.js';

/** Uids reserved per task: far more pieces than a prep can create (a batch holds at most MAX_BATCH_MOVES moves). */
export const BOT_UID_BLOCK = 4096;
/** The most moves one batch may carry. The traced maximum is 43 for a whole prep; a batch past this is refused. */
export const MAX_BATCH_MOVES = 200;
/** Fresh snapshots a seat gets per prep before it keeps its board and readies up (design B7). */
export const MAX_BOT_ATTEMPTS = 3;
/** Wall-clock ms for b.botReceived. 2 s lost tasks in a real game: a page's main thread can be that busy at the start of a prep. */
export const BOT_RECEIPT_MS = 5000;
/** Wall-clock ms for the plan batch after the receipt: a first Worker start in the match, then the plan on a slow device. */
export const BOT_PLAN_MS = 10000;
/** Wall-clock ms on top of a seat's rehearsal budget for the final batch to arrive. */
export const BOT_GRACE_MS = 3000;

/** What a bot's move list may contain. Never g.leave, g.autoplay, g.pause or g.test. */
const BOT_INTENTS = new Set(['g.buy', 'g.refresh', 'g.freeze', 'g.levelUp', 'g.sell', 'g.move', 'g.equip', 'g.art',
  'g.destroy', 'g.unequip', 'g.reward', 'g.choice', 'g.ready', 'g.band']);
/** The one move with no intent: the rule-level temp resolve bot.js calls (`ps.resolveTemp`). Only this path accepts it. */
const RESOLVE_TEMP = 'bot.resolveTemp';

/** A strategy whose decision hooks throw: what the server holds in host mode. Its id and external `decide` stay usable. */
export function guardBotStrategy(strategy) {
  const hooks = {};
  for (const hook of ['pickBand', 'pickCard', 'prepBegin', 'prepEnd']) {
    hooks[hook] = { value: () => { throw new Error(`bot code on the server in host mode: ${hook}`); } };
  }
  return Object.create(strategy, hooks);
}

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

  /** Run a pick on the seat's streams when the match uses them, as its task on the executor does (the parity test compares them). */
  _onBotSeat(ps, fn) {
    return this.seatStreams ? this.withSeatStreams(this.newBotTask(ps), fn) : fn();
  }

  /** Host mode: a band or card pick. `fallback` is the rule's own pick, for when nobody can make it. */
  _startBotPick(ps, pick, live, fallback) {
    this.cancelBotTasks(); // a pick still running belongs to a turn that is over
    this._startBotTask({ ps, pick, live: () => live() && ps.botControlled, fallback });
  }

  /** Tell the first executor early, so the first pick of a match does not wait for a Worker to start. */
  _botWarm() {
    if (this.botExecution !== 'host' && this.botBattles !== 'host') return;
    if (this.botExecutor || !this.order.some((p) => p.isBot)) return;
    const pid = this._botExecutorFor();
    if (pid) this.sendTo(pid, { t: 'b.botWarm', ...this._botContent() });
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
    while (!this._botActive && this._botQueue.length) { // loop-cap: the queue (one shift a pass)
      const entry = this._botQueue.shift();
      if (this._botEntryLive(entry)) this._startBotTask(entry);
    }
  }

  _botEntryLive({ ps, token, round, live }) {
    if (live) return live();
    return this.phase === PHASE.PREP && this.round === round && ps.alive && !ps.ready && ps.botControlled && ps._botPrepToken === token;
  }

  /** Send one seat's snapshot to the executor. With no executor the seat keeps its board and readies up. */
  _startBotTask(entry) {
    const executor = this.botExecutor ? null : this._botExecutorFor(undefined, entry.ps ? [entry.ps.playerId] : null);
    if (!this.botExecutor && !executor) {
      this.botTaskStats.noHost++;
      this._finishBotSeat(entry);
      return;
    }
    const task = this.newBotTask(entry.ps);
    this._botActive = { entry, task, stale: 0, executor, tried: new Set(executor ? [executor] : []), timer: null, hurried: false };
    this._submitBotTask(this._botActive);
  }

  _submitBotTask(active) {
    let world;
    try {
      world = buildWorld(this, active.entry.ps, active.task);
      if (active.entry.pick) world.pick = active.entry.pick;
    } catch (e) {
      this.reportError(`bot ${active.entry.ps.playerId} task`, e);
      this._endBotTask(active);
      return;
    }
    if (this.botExecutor) {
      try {
        this.botExecutor.submit({ taskId: active.task.id, playerId: active.entry.ps.playerId, world });
      } catch (e) {
        this.reportError(`bot ${active.entry.ps.playerId} task`, e);
        this._endBotTask(active);
      }
      return;
    }
    active.budgetMs = active.entry.pick ? 0 : this._botSeatBudgetMs();
    active.hurried = this._botHurryRound === this.round;
    this.botTaskStats.sent++;
    // armed first: an answer that comes back with the frame itself cannot race the timeout
    this._armBotTimer(active, BOT_RECEIPT_MS);
    if (!this.sendTo(active.executor, { t: 'b.botTask', taskId: active.task.id, world, budgetMs: active.budgetMs, ...this._botContent() })) this._botFailover(active);
  }

  /**
   * A seat's rehearsal budget (design B8): 40 % of the prep time within 15–60 s (30 s untimed) is the bot budget of the whole
   * prep, shared among the seats still to play, so a fast bot's savings go to the next one. Once every human is Ready: none.
   */
  _botSeatBudgetMs() {
    if (this._botHurryRound === this.round) return 0;
    const now = this.sched.now();
    if (this._botBudgetRound !== this.round) {
      const prepMs = this.deadline > 0 ? this.deadline - now : 0;
      const total = prepMs > 0 ? Math.min(prepMs, Math.max(this.scaled(15000), Math.min(this.scaled(60000), prepMs * 0.4))) : this.scaled(30000);
      this._botBudgetRound = this.round;
      this._botBudgetUntil = now + total;
    }
    const seats = 1 + this._botQueue.filter((e) => this._botEntryLive(e)).length;
    return Math.max(0, Math.floor((this._botBudgetUntil - now) / seats));
  }

  /** `ms` is real time: a browser's work does not speed up with the match's timer scale. */
  _armBotTimer(active, ms) {
    this._clearBotTimer(active);
    active.timer = this.later(ms, () => {
      active.timer = null;
      if (this._botActive !== active) return;
      this.botTaskStats.timeouts++;
      this.log.warn?.(`[match ${this.roomCode}] bot ${active.entry.ps.playerId}: ${active.executor} went silent`);
      this._botHostStrike(active.executor);
      this._botFailover(active);
    });
  }

  _clearBotTimer(active) {
    if (active.timer) { this.cancel(active.timer); active.timer = null; }
  }

  /** The executor is out for this seat: tell it to stop, and hand the seat to the next human with a fresh snapshot. */
  _botFailover(active) {
    this._clearBotTimer(active);
    if (active.executor) this.sendTo(active.executor, { t: 'b.botCancel', taskId: active.task.id });
    const next = this._botEntryLive(active.entry) ? this._botExecutorFor(active.tried, active.entry.ps ? [active.entry.ps.playerId] : null) : null;
    if (!next) { this._endBotTask(active); return; }
    this.botTaskStats.failovers++;
    active.executor = next;
    active.tried.add(next);
    active.task = this.newBotTask(active.entry.ps);
    this._submitBotTask(active);
  }

  /** The active task, when this frame is from its executor and names it; anything else is stale or forged and changes nothing. */
  _botTaskOf(ps, taskId) {
    const active = this._botActive;
    return active && active.executor === ps.playerId && active.task.id === taskId ? active : null;
  }

  /** b.botReceived: the page has the task. Its Worker may still be starting, so the plan batch gets a longer window. */
  _onBotReceived(ps, msg) {
    const active = this._botTaskOf(ps, msg.taskId);
    // once per task, and never after its plan: a repeated receipt must not re-open the window (an executor looping frames
    // would stall an untimed prep)
    if (!active || active.receivedId === msg.taskId || active.plannedId === msg.taskId) return OK;
    active.receivedId = msg.taskId;
    this._armBotTimer(active, BOT_PLAN_MS);
    return OK;
  }

  /** b.botMoves: a batch of a seat's moves from its executor, or `error: true` when that browser could not play it. */
  _onBotMoves(ps, msg) {
    const active = this._botTaskOf(ps, msg.taskId);
    if (!active) return OK;
    // one plan batch per task: a repeat applies nothing and does not re-arm the budget window
    if (msg.batch === 'plan' && !msg.error) {
      if (active.plannedId === msg.taskId) return OK;
      active.plannedId = msg.taskId;
    }
    if (msg.error) {
      this.botTaskStats.errors++;
      this._botHostStrike(ps.playerId);
      this._botFailover(active);
      return OK;
    }
    const res = this.receiveBotBatch(msg.taskId, msg);
    if (res.error) {
      this.botTaskStats.errors++;
      this._botHostStrike(ps.playerId);
      this._botFailover(active);
      return OK;
    }
    if (msg.batch !== 'plan') return OK;
    if (res.stale) this.botTaskStats.stale++;
    this.sendTo(ps.playerId, { t: 'b.botAck', taskId: msg.taskId, ...(res.stale ? { stale: true } : {}) });
    if (!res.stale && this._botActive === active) {
      // the frame may have crossed a hurry: the Worker hears of it now
      if (this._botHurryRound === this.round && !active.hurried) this._botSendHurry(active);
      this._armBotTimer(active, active.budgetMs + BOT_GRACE_MS);
    }
    return OK;
  }

  /** b.botHidden: a hidden tab may be frozen (phones freeze them), so it is not asked while hidden and loses what it holds at once. */
  _onBotHidden(ps, msg) {
    if (!msg.hidden) { this._botHostHidden.delete(ps.playerId); return OK; }
    this._botHostHidden.add(ps.playerId);
    this.botTaskStats.hidden++;
    this._botTaskHostLost(ps);
    if (this.clientCombat) this._botBattleHostLost(ps);
    return OK;
  }

  /** An executor disconnected, left or went hidden. */
  _botTaskHostLost(ps) {
    const active = this._botActive;
    if (active && active.executor === ps.playerId) this._botFailover(active);
  }

  _botSendHurry(active) {
    active.hurried = true;
    this.sendTo(active.executor, { t: 'b.botHurry', taskId: active.task.id });
  }

  /** Every human is Ready (design B8): nobody waits out a budget. Called whenever a Ready changes. */
  _botMaybeHurry() {
    if (this.botExecution !== 'host' || this.botExecutor || this._botHurryRound === this.round || this.phase !== PHASE.PREP) return;
    const humans = this.alivePlayers().filter((p) => !p.botControlled);
    if (!humans.length || !humans.every((p) => p.ready)) return;
    this._botHurryRound = this.round;
    const active = this._botActive;
    if (active && active.executor && !active.hurried) this._botSendHurry(active);
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
    this._clearBotTimer(active);
    if (this._botActive === active) this._botActive = null;
    this._finishBotSeat(active.entry);
    this.later(0, () => this._pumpBotQueue());
  }

  /** The rule-level finish, as when the prep's own routine ends (scheduleBotPrep `ready`): no bot decision is made here. */
  _finishBotSeat(entry) {
    const { ps } = entry;
    if (!this._botEntryLive(entry)) return;
    if (entry.pick) { entry.fallback(); return; }
    this.autoPickPersonalChoice(ps, 'random');
    ps.resolveTemp();
    ps.setReady(true);
  }

  /** The prep ended, or the seat changed hands: nothing queued or running for it may still apply. */
  cancelBotTasks(playerId = null) {
    this._botQueue = playerId ? this._botQueue.filter((e) => e.ps.playerId !== playerId) : [];
    if (this._botActive && (!playerId || this._botActive.entry.ps.playerId === playerId)) {
      const active = this._botActive;
      this._clearBotTimer(active);
      this._botActive = null;
      if (active.executor) this.sendTo(active.executor, { t: 'b.botCancel', taskId: active.task.id });
      try { this.botExecutor?.cancel?.(active.task.id); } catch (e) { this.reportError('bot cancel', e); }
      this.later(0, () => this._pumpBotQueue());
    }
  }
}
