// server/match/match/oneForAll.js — (fork) Match methods of One for All (DESIGN §91.9): a Grand Alliance whose strategy
// is one room-wide secret vote, and everyone plays the winner.
//
// [ASSUMED] A remake-only mode, the user's decisions of 2026-11-12 — no official source:
//   * Everyone votes at once on the strategy draft screen, one 50 s clock (BAND_TURN_SECONDS); a single human: no clock
//     (soloUntimed). Both squads vote together. Confirm (g.band) LOCKS the vote; a locked vote cannot change. The vote
//     ends at once when every voter still deciding has locked (a dropped seat — the AI plays it — is not waited for).
//   * Secret: m.public carries only counts (voters, locked) until the reveal; a player's own vote is in its m.private.
//   * At the close, a vote not locked counts the strategy the player highlighted (g.bandFocus), else a RANDOM strategy;
//     a dropped seat (botControlled) votes at random unless it had locked. Random = the allowed strategies of the mode
//     minus those built around a bond the mode switches off (never 本局禁用), from rngDraft, in seat order.
//   * AI seats (room.addBot) never vote; a seat that left (g.leave, not alive) before the close loses its vote.
//   * Most votes wins; a tie is drawn from rngDraft among the tied strategies (gd.bandIds order). The reveal shows the
//     winner like a majority (no roulette).
//   * Every seat gets the winner through the usual path (_applyBand semantics: starting LP for a living seat, a departed
//     one keeps its 0), then BATTLE_CHECK runs ONE_FOR_ALL_CHECK_SECONDS for the 协议启动！ reveal.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { OK, fail, BAND_TURN_SECONDS } from './common.js';

export class MatchOneForAll {
  /** Constructor part (after _initLargeRoom): the room's One for All flag. Only a Grand Alliance can have it. */
  _initOneForAll(opts) {
    this.oneForAll = this.largeRoom === true && opts.oneForAll === true;
  }

  /** The strategy draft of a One for All match: the secret vote (replaces the turn order and the squad lanes). */
  _enterBandVote() {
    this.phase = PHASE.BAND_DRAFT;
    this._rerollStartAt.clear();
    const voters = this.order.filter((ps) => !ps.isBot && ps.alive).map((ps) => ps.playerId);
    const untimed = this.soloUntimed;
    this.draft = {
      vote: true, untimed, voters, turnDeadline: 0,
      // the turn-draft fields other code reads (draftTurn, bandTaken, _applyBand): no order to walk, no picks until the close
      order: voters.slice(), idx: voters.length, picks: {}, skipsLeft: {},
      /** playerId → the locked vote */
      locks: new Map(),
      /** playerId → the strategy highlighted in the draft screen (g.bandFocus) */
      focus: new Map(),
      reveal: null,
    };
    if (untimed) this.setDeadline(0);
    else {
      this.setDeadline(BAND_TURN_SECONDS, () => this._closeVote());
      this.draft.turnDeadline = this.deadline;
    }
    this.markPublic();
    for (const ps of this.order) this.markPrivate(ps);
    this._maybeCloseVote();
  }

  /** Voters still deciding: in the vote, alive, played by the human (a dropped seat is not waited for), not locked. */
  _pendingVoters() {
    const d = this.draft;
    return d.voters.filter((pid) => {
      const ps = this.players.get(pid);
      return ps && ps.alive && !ps.botControlled && !d.locks.has(pid);
    });
  }

  /** Ends the vote when nobody is left deciding (everyone locked, dropped or gone). */
  _maybeCloseVote() {
    const d = this.draft;
    if (this.phase !== PHASE.BAND_DRAFT || !d?.vote || d.reveal) return;
    if (!this._pendingVoters().length) this.later(0, () => this._closeVote());
  }

  /** g.band in vote mode: locks the player's vote. */
  _lockVote(ps, bandId) {
    const d = this.draft;
    if (!d.voters.includes(ps.playerId) || !ps.alive) return fail(ERR.WRONG_PHASE);
    if (d.locks.has(ps.playerId)) return fail(ERR.ALREADY);
    if (typeof bandId !== 'string' || !this.gd.bandAllowed(bandId)) return fail(ERR.BAD_TARGET);
    d.locks.set(ps.playerId, bandId);
    this.markPrivate(ps);
    this.markPublic();
    this._maybeCloseVote();
    return OK;
  }

  /** A seat left (not alive) during the vote: its vote is dropped. */
  _voteLeave(ps) {
    const d = this.draft;
    if (!d?.vote || d.reveal) return;
    d.voters = d.voters.filter((pid) => pid !== ps.playerId);
    d.locks.delete(ps.playerId);
    d.focus.delete(ps.playerId);
    this.markPublic();
    this._maybeCloseVote();
  }

  /** The strategies a random vote may get: allowed, never one built around a bond the mode switches off. */
  _randomVotePool() {
    const ids = this.gd.bandIds();
    const off = this.gd.modeInactiveBonds;
    const ok = ids.filter((id) => !this.gd.bandBondIds(id).some((b) => off.has(b)));
    return ok.length ? ok : ids;
  }

  /**
   * The vote is over: settle every voter's vote, tally, draw a tie, give every seat the winner and go to BATTLE_CHECK.
   * @returns {{ picks: Record<string,string>, random: string[], counts: Record<string,number>, winner: string }|null}
   */
  _closeVote() {
    const d = this.draft;
    if (this.phase !== PHASE.BAND_DRAFT || !d?.vote || d.reveal) return null;
    const pool = this._randomVotePool();
    const picks = {};
    const random = [];
    for (const ps of this.order) { // seat order: the random draws replay the same
      const pid = ps.playerId;
      if (!d.voters.includes(pid) || !ps.alive) continue;
      let id = d.locks.get(pid);
      if (!id && !ps.botControlled) {
        const f = d.focus.get(pid);
        if (typeof f === 'string' && this.gd.bandAllowed(f)) id = f;
      }
      if (!id) { id = this.rngDraft.pick(pool); random.push(pid); }
      picks[pid] = id;
    }
    const counts = {};
    for (const id of Object.values(picks)) counts[id] = (counts[id] || 0) + 1;
    const top = Math.max(0, ...Object.values(counts));
    const tied = this.gd.bandIds().filter((id) => counts[id] === top && top > 0);
    // nobody left to vote (every seat gone or an AI seat): a random strategy, as a vote nobody cast would get
    const winner = tied.length === 1 ? tied[0] : tied.length ? this.rngDraft.pick(tied) : this.rngDraft.pick(pool);
    d.reveal = { picks, random, counts, winner };
    for (const ps of this.order) {
      d.picks[ps.playerId] = winner;
      ps.bandId = winner;
      if (ps.alive) ps.lp = this.gd.startLp(winner); // a seat gone before the close keeps its 0 (_applyBand, §37.65)
    }
    this.finishBandDraft(false);
    return d.reveal;
  }

  /** m.public.draft of a One for All match: counts only before the reveal, the reveal during BATTLE_CHECK. */
  _voteView() {
    const d = this.draft;
    if (this.phase === PHASE.BATTLE_CHECK) return d?.vote && d.reveal ? { mode: 'vote', reveal: d.reveal } : null;
    return {
      mode: 'vote', voters: d.voters.length, locked: d.voters.filter((pid) => d.locks.has(pid)).length,
      order: d.voters.slice(), picks: {}, turn: null, skipsLeft: {}, turnDeadline: d.turnDeadline || 0,
      turnSeconds: d.untimed ? 0 : this.bandTurnMs() / 1000, untimed: !!d.untimed,
    };
  }

  /** m.private.vote: the player's own locked vote (null before Confirm; the highlight stays the page's), never anyone else's. */
  _ownVote(playerId) {
    const d = this.draft;
    if (this.phase !== PHASE.BAND_DRAFT || !d?.vote || !d.voters.includes(playerId)) return null;
    const locked = d.locks.get(playerId);
    return { bandId: locked || null, locked: !!locked };
  }
}
