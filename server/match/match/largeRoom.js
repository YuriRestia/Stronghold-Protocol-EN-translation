// server/match/match/largeRoom.js — (fork) Match methods of an 8-seat room (shared/largeRoom.js, DESIGN §91):
// squads, the parallel per-squad drafts, the relay 联防, idle seats and an absent player's board under the AI.
//
// [ASSUMED] A remake-only mode, the maintainer's decision of 2026-11-08 — no official source; every rule below is the
// owner's call or the simplest reading of it:
//   * Squads: seats 1–4 = squad A, 5–8 = squad B, where the players sat. Both squads with players ⇒ `this.squads` (two
//     playerId lists); everyone in one squad ⇒ null and today's rules (no relay, one draft), still humans only.
//   * Pool: one pool for the whole room, copies × players ÷ 4 above 4 (shared/largeRoom.js roomScaleFor), rounded up —
//     everyone fights over it, across squads (weishuxieyi's approach; the forks' separate pools are not used).
//   * Drafts: each squad drafts on its own, both at once — the strategy draft in turn inside a squad (队友已选 inside the
//     squad), the 机变 draft with its own 6 cards per squad. An AI-played seat (a dropped player, or a departed one: eliminated) takes the
//     rule's pick at once (the highlighted / default strategy, a random card): two Workers picking in two squads at once
//     would cancel each other (match/botTasks.js runs one bot task at a time).
//   * 联防: relay across the room. Round 1 as today; what still gets through goes to the next 2 perfect players, who have
//     not helped yet, with the round's normal time limit; after RELAY_MAX_ROUNDS it is settled. Helpers of both rounds
//     keep their kill bounties.
//   * A dropped player keeps playing during the rejoin window: the AI plays the board, and its prep and battles run in a
//     browser — a squadmate's first, then anyone's in the room (match/botBattles.js _botExecutorFor), never on the
//     server; with no browser at all the battle gets host-side bots' synthetic result. A reconnect hands the board back.
//     A departure (g.leave, the window running out, removal for idling) eliminates the player as in every room type
//     (user, 2026-11-11): a running battle plays out in a browser; from the next round on no AI board, no prep, no battles.
//   * Idle: a seat that the prep deadline had to ready up IDLE_PREP_ROUNDS times in a row is removed (warned one round
//     earlier); any intent of its own resets the count.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE } from '../../../shared/constants.js';
import { msg } from '../../../shared/i18n.js';
import { squadOfSeat, roomScaleFor, RELAY_MAX_ROUNDS, IDLE_PREP_ROUNDS } from '../../../shared/largeRoom.js';
import { generateDraft, applyCard } from '../choices.js';
import { helperOrder } from '../unite.js';
import { onPickCard } from '../botEmotes.js';

export class MatchLargeRoom {
  /** Constructor part: the room flag, the squads and the room scale (before the pools are built). */
  _initLargeRoom(opts) {
    this.largeRoom = opts.largeRoom === true && !this.isSolo;
    /** @type {string[][] | null} playerIds of squad A and squad B, when both have players */
    this.squads = null;
    /** pool copies, Hidden Core threshold and overtime drain multiplier (1 outside a large room of more than 4) */
    this.roomScale = 1;
    /** the lobby's idle removal (server/lobby.js idleKick) */
    this.onIdle = this.largeRoom && typeof opts.onIdle === 'function' ? opts.onIdle : null;
    if (!this.largeRoom) return;
    this.roomScale = roomScaleFor(this.order.length);
    const lanes = [[], []];
    for (const ps of this.order) {
      ps.squad = squadOfSeat(ps.seat);
      ps.idlePreps = 0;
      lanes[ps.squad].push(ps.playerId);
    }
    if (lanes[0].length && lanes[1].length) this.squads = lanes;
  }

  /** Squad index of a player in a match with squads, else null. */
  squadOf(playerId) {
    if (!this.squads) return null;
    const ps = this.players.get(playerId);
    return ps && Number.isInteger(ps.squad) ? ps.squad : null;
  }

  // ---- strategy draft, one lane per squad ---------------------------------------------------------------------------

  _enterBandDraftLanes() {
    this.phase = PHASE.BAND_DRAFT;
    this._rerollStartAt.clear();
    const skips = this.gd.bandDraft.skipsPerPlayer;
    const lanes = this.squads.map((ids, squad) => {
      const order = ids.slice();
      this.rngDraft.shuffle(order);
      return { squad, order, idx: 0, skipsLeft: Object.fromEntries(order.map((pid) => [pid, skips])), turnDeadline: 0, token: 0, timer: null, done: false };
    });
    this.draft = {
      lanes, order: lanes.flatMap((l) => l.order), idx: 0, picks: {}, skipsLeft: Object.assign({}, ...lanes.map((l) => l.skipsLeft)),
      untimed: this.soloUntimed, turnDeadline: 0, focus: new Map(),
    };
    this.setDeadline(0);
    for (const lane of lanes) this._startBandLane(lane);
    this.markPublic();
  }

  /** The lane (squad draft) a player drafts in, or null. */
  _laneOf(stage, playerId) {
    return stage?.lanes ? stage.lanes.find((l) => l.order.includes(playerId)) || null : null;
  }

  _laneTurn(lane) { return lane && !lane.done ? lane.order[lane.idx] ?? null : null; }

  _syncLaneDeadline(stage) {
    // m.public.deadline: the latest lane's countdown (each lane publishes its own turnDeadline; the page shows its own)
    this.deadline = Math.max(0, ...stage.lanes.map((l) => (l.done ? 0 : l.turnDeadline || 0)));
  }

  _startBandLane(lane) {
    const d = this.draft;
    if (!d || !lane || this.phase !== PHASE.BAND_DRAFT) return;
    if (lane.timer) { this.cancel(lane.timer); lane.timer = null; }
    while (lane.idx < lane.order.length && d.picks[lane.order[lane.idx]]) lane.idx++; // loop-cap: lane order
    if (lane.idx >= lane.order.length) {
      lane.done = true;
      lane.turnDeadline = 0;
      this._syncLaneDeadline(d);
      if (d.lanes.every((l) => l.done)) this.later(0, () => this.finishBandDraft(false));
      this.markPublic();
      return;
    }
    const token = ++lane.token;
    const pid = lane.order[lane.idx];
    const live = () => this.phase === PHASE.BAND_DRAFT && this.draft === d && token === lane.token && !d.picks[pid];
    if (!d.untimed) {
      const ms = this.bandTurnMs();
      lane.turnDeadline = this.sched.now() + ms;
      lane.timer = this.later(ms, () => { if (live()) this._applyBand(this.players.get(pid), this.timeoutBand(pid)); });
    } else lane.turnDeadline = 0;
    this._syncLaneDeadline(d);
    const cur = this.players.get(pid);
    // an AI-played seat takes the rule's pick at once (header)
    if (cur && cur.botControlled) this.later(0, () => { if (live()) this._applyBand(cur, this.timeoutBand(pid)); });
    this.markPublic();
  }

  _skipBandLane(ps, lane) {
    const d = this.draft;
    if (!(lane.skipsLeft[ps.playerId] > 0)) return 'none';
    if (lane.order.length - lane.idx <= 1) return 'alone';
    lane.skipsLeft[ps.playerId]--;
    d.skipsLeft[ps.playerId] = lane.skipsLeft[ps.playerId];
    lane.order.splice(lane.idx, 1);
    lane.order.push(ps.playerId);
    this._startBandLane(lane);
    return null;
  }

  _bandLaneViews(d) {
    return d.lanes.map((l) => ({
      squad: l.squad, order: l.order.slice(), turn: this._laneTurn(l),
      picks: Object.fromEntries(l.order.filter((pid) => d.picks[pid]).map((pid) => [pid, d.picks[pid]])),
      skipsLeft: { ...l.skipsLeft }, turnDeadline: l.done ? 0 : l.turnDeadline || 0,
    }));
  }

  // ---- 机变 draft, one lane per squad with its own cards ------------------------------------------------------------

  /** @returns {boolean} whether the lanes started (false: no card to draft, the caller moves on) */
  _enterSpDraftLanes() {
    const lanes = [];
    for (let squad = 0; squad < this.squads.length; squad++) {
      const order = this.squads[squad].filter((pid) => this.players.get(pid)?.alive);
      if (!order.length) continue;
      const draft = generateDraft(this.gd, this.rngDraft, this.round, { stageId: this.stageId, bondAvailable: (bondId) => this.bondLive(bondId), itemAvailable: (id) => this.itemPool.canGain(id) });
      if (!draft) continue;
      this.rngDraft.shuffle(order);
      lanes.push({ ...draft, squad, order, idx: 0, picks: {}, taken: {}, turnDeadline: 0, token: 0, timer: null, done: false });
    }
    if (!lanes.length) return false;
    this.phase = PHASE.SP_DRAFT;
    const first = lanes[0];
    this.sp = { ...first, lanes, order: lanes.flatMap((l) => l.order), picks: {}, taken: {}, untimed: this.soloUntimed, turnDeadline: 0 };
    this.setDeadline(0);
    for (const lane of lanes) this._startSpLane(lane);
    this.markPublic();
    return true;
  }

  _spLaneAvailable(lane, card) { return !!card && lane.taken[card.idx] == null && (card.kind !== 'item' || this.itemPool.canGain(card.id)); }

  _startSpLane(lane) {
    const s = this.sp;
    if (!s || !lane || this.phase !== PHASE.SP_DRAFT) return;
    if (lane.timer) { this.cancel(lane.timer); lane.timer = null; }
    while (lane.idx < lane.order.length) { // loop-cap: lane order
      const ps = this.players.get(lane.order[lane.idx]);
      if (ps && ps.alive && lane.picks[ps.playerId] == null) break;
      lane.idx++;
    }
    const available = lane.cards.filter((c) => this._spLaneAvailable(lane, c));
    if (lane.idx >= lane.order.length || !available.length) {
      lane.done = true;
      lane.turnDeadline = 0;
      this._syncLaneDeadline(s);
      if (s.lanes.every((l) => l.done)) this.later(0, () => this.finishSpDraft());
      this.markPublic();
      return;
    }
    const token = ++lane.token;
    const pid = lane.order[lane.idx];
    const live = () => this.phase === PHASE.SP_DRAFT && this.sp === s && token === lane.token && lane.picks[pid] == null;
    const randomPick = () => {
      const avail = lane.cards.filter((c) => this._spLaneAvailable(lane, c)).map((c) => c.idx);
      if (avail.length) this._applyLaneCard(this.players.get(pid), lane, avail[Math.floor(this.rngDraft() * avail.length)]);
      else this._startSpLane(lane);
    };
    if (!s.untimed) {
      const secs = lane.idx === 0 ? this.gd.timer('spFirst') : this.gd.timer('spTurn');
      const ms = this.scaled(secs * 1000);
      lane.turnDeadline = this.sched.now() + ms;
      lane.timer = this.later(ms, () => { if (live()) randomPick(); });
    } else lane.turnDeadline = 0;
    this._syncLaneDeadline(s);
    const cur = this.players.get(pid);
    if (cur && cur.botControlled) this.later(0, () => { if (live()) randomPick(); });
    this.markPublic();
  }

  _pickLaneCard(ps, lane, idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= lane.cards.length) return 'bad';
    if (!this._spLaneAvailable(lane, lane.cards[idx])) return 'sold';
    this._applyLaneCard(ps, lane, idx);
    return null;
  }

  _applyLaneCard(ps, lane, idx) {
    const s = this.sp;
    if (!s || !ps || lane.picks[ps.playerId] != null) return;
    const card = lane.cards[idx];
    if (!card || !this._spLaneAvailable(lane, card)) return;
    lane.picks[ps.playerId] = idx;
    lane.taken[idx] = ps.playerId;
    s.picks[ps.playerId] = idx;
    try { applyCard(this, ps, card); } catch (e) { this.reportError(`applyCard ${card.id}`, e); }
    this.markPrivate(ps);
    this.markPublic();
    onPickCard(this, ps, card);
    this._startSpLane(lane);
  }

  _spLaneViews(s, cardView) {
    return s.lanes.map((l) => ({
      squad: l.squad, family: l.family, name: l.name, desc: l.desc, eventId: l.eventId,
      cards: l.cards.map((c) => ({ ...cardView(c), soldOut: c.kind === 'item' && !this.itemPool.canGain(c.id) })),
      order: l.order.slice(), turn: this._laneTurn(l), picks: { ...l.picks }, taken: { ...l.taken },
      turnDeadline: l.done ? 0 : l.turnDeadline || 0,
    }));
  }

  _clearLaneTimers(stage) {
    for (const l of stage?.lanes || []) if (l.timer) { this.cancel(l.timer); l.timer = null; }
  }

  // ---- relay 联防 ---------------------------------------------------------------------------------------------------

  /**
   * A 联防 field ended: with squads, what still got through goes to the next perfect players who have not helped yet
   * (relay, at most RELAY_MAX_ROUNDS); otherwise, or after the last round, settle as today.
   */
  _afterUnite(plan, res) {
    if (!this.squads || this.phase !== PHASE.UNITE || this.ended) { this.settle(plan, res); return; }
    const round = plan.relayRound || 1;
    if (round >= 2) {
      // the relay's last round: settle once, with both rounds' helpers (their bounties) and the last round's survivors
      const first = plan.relayPrev;
      if (!res || res.synthetic) { this.settle(first.plan, first.res); return; }
      const perPlayer = {};
      for (const [pid, pp] of Object.entries(first.res?.perPlayer || {})) perPlayer[pid] = { ...pp, leaked: [] };
      Object.assign(perPlayer, res.perPlayer || {});
      this.settle({ ...plan, helpers: [...first.plan.helpers, ...plan.helpers] }, { ...res, perPlayer });
      return;
    }
    const next = round < RELAY_MAX_ROUNDS && res && !res.synthetic ? this._relayPlan(plan, res) : null;
    if (!next) { this.settle(plan, res); return; }
    this.startUnite(next);
  }

  /** The relay's next round: what got through, against the best 2 perfect players who have not helped. */
  _relayPlan(plan, res) {
    const used = new Set(plan.helpers.map((p) => p.playerId));
    const perfects = this.alivePlayers().filter((ps) => {
      if (ps.left || used.has(ps.playerId) || plan.leakers.includes(ps)) return false; // a departed player never helps
      const r = this.lastResults.get(ps.playerId);
      if (!r) return false;
      const counted = (r.leaked || []).filter((l) => l && l.counted !== false);
      return counted.length === 0 && r.perfect !== false;
    });
    if (!perfects.length) return null;
    // the enemies still standing: the field's counted leaks (with their stats) and those never spawned before the limit
    const pool = plan.leaked.slice();
    const takeMods = (enemyKey, sourcePlayerId) => {
      const i = pool.findIndex((l) => l.enemyKey === enemyKey && l.sourcePlayerId === sourcePlayerId);
      return i < 0 ? null : pool.splice(i, 1)[0];
    };
    const leaked = [];
    for (const pp of Object.values(res.perPlayer || {})) {
      for (const l of (pp && pp.leaked) || []) {
        if (!l || l.counted === false || l.uniteRuntime || !l.sourcePlayerId || !this.gd.enemy(l.enemyKey)) continue;
        const was = takeMods(l.enemyKey, l.sourcePlayerId);
        leaked.push({ enemyKey: l.enemyKey, mods: l.mods ? { ...l.mods } : was?.mods ?? null, lpr: l.lpr ?? was?.lpr ?? 1, sourcePlayerId: l.sourcePlayerId, tag: l.tag ?? was?.tag ?? null, bounty: was?.bounty ?? null });
      }
    }
    for (const u of res.unspawned || []) {
      if (!u || !u.sourcePlayerId || !this.gd.enemy(u.enemyKey)) continue;
      const was = takeMods(u.enemyKey, u.sourcePlayerId);
      leaked.push({ enemyKey: u.enemyKey, mods: was?.mods ?? null, lpr: was?.lpr ?? 1, sourcePlayerId: u.sourcePlayerId, tag: u.tag ?? was?.tag ?? null, bounty: was?.bounty ?? null });
    }
    if (!leaked.length) return null;
    const helpers = helperOrder(this, perfects, this.lastResults);
    return { helpers, leakers: plan.leakers, leaked, notReentered: plan.notReentered, relayRound: (plan.relayRound || 1) + 1, relayPrev: { plan, res } };
  }

  // ---- idle seats and absent players --------------------------------------------------------------------------------

  /**
   * The prep deadline readied `ps` up: one more idle round; warned one round before the removal. A seat the AI plays —
   * AI 托管 the player chose, a drop, a departure (botControlled) — is never counted: its board still plays.
   */
  _noteIdlePrep(ps) {
    if (!this.largeRoom || !this.onIdle || ps.isBot || ps.botControlled || !ps.connected || !ps.alive) return;
    ps.idlePreps = (ps.idlePreps || 0) + 1;
    if (ps.idlePreps === IDLE_PREP_ROUNDS - 1) {
      this.toast(ps, 'warn', msg('你已连续 {n} 个整备阶段没有操作。再有一次将被移出房间并淘汰出局。', { n: ps.idlePreps })); // en: "You have done nothing for {n} prep rounds in a row. One more and you will be removed from the room and eliminated."
    }
    if (ps.idlePreps >= IDLE_PREP_ROUNDS) {
      const pid = ps.playerId;
      this.later(0, () => { if (!this.ended && !this.disposed) this.onIdle?.(pid); });
    }
  }

  /** A large room: a dropped player's board goes to the AI at once (a reconnect hands it back). */
  _largeDisconnect(ps) {
    if (!this.largeRoom || ps.autoplay) return;
    ps._autoplayByDrop = true;
    this.setAutoplay(ps, true);
  }

  _largeReconnect(ps) {
    if (!this.largeRoom || !ps._autoplayByDrop) return;
    ps._autoplayByDrop = false;
    this.setAutoplay(ps, false);
  }
}
