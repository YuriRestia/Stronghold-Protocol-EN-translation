// INFO_CHECK full setup reroll: unanimous human consent, keeping the room and player settings.
// [ASSUMED] Remake convenience, not official mode rules (DESIGN §28.21): the unanimous human vote, the independent
// reroll stream; (fork, user 2026-11-13) the INFO_CHECK countdown never pauses for a vote: at zero the match goes on
// with the setup on screen and an open vote fails, so no reroll can delay the start; and (PR #860) any
// seated player may open or cancel the vote, each seat may open one every 30 s, a completed reroll opens a fresh window
// (a cancelled or rejected vote does not give the cooldown back); a connection's starts also draw from its heavy bucket.
// Installed on Match.prototype like the other method containers. The lobby only refuses spectators and absent seats.
import { PHASE, ERR, SETUP_REROLL_COOLDOWN_MS as REROLL_COOLDOWN_MS } from '../../../shared/constants.js';
import { createRng, deriveSeed } from '../../sim/rng.js';
import { setupMatchWaves } from '../waves.js';
import { drawDisabledBonds, SharedPool } from '../pool.js';
import { OK, fail } from './common.js';

// One start per seat per cooldown, so a player cannot flood the others with vote prompts (the countdown runs on through
// every vote, so the start never waits on one). A completed reroll starts a new opening and therefore a new window. (SETUP_REROLL_COOLDOWN_MS, 30 s, lives
// in shared/constants.js so the client's refusal toast names the same value.) With one human every start completes at
// once and clears the seat cooldown, so the throttle there is the connection's heavy bucket: room.rerollSetup is in
// server/net.js HEAVY_TYPES (2 per second, burst 6), as each reroll rebuilds the opening and resends m.public (DESIGN §35.47).

export class MatchSetupVote {
  requestSetupReroll(playerId, revision) {
    if (this.disposed || this.ended || this.phase !== PHASE.INFO_CHECK) return fail(ERR.WRONG_PHASE);
    // (fork) a room strangers could join has no reroll (Lobby.rerollLock; user, 2026-11-13)
    if (this.rerollLock) return fail(ERR.WRONG_PHASE, `setup reroll off: ${this.rerollLock}`);
    const ps = this.players.get(playerId);
    if (!ps || ps.isBot || ps.left || !ps.connected) return fail(ERR.NOT_IN_ROOM);
    if (revision !== this.setupRevision) return fail(ERR.BAD_TARGET, 'setup revision changed');
    if (this.setupVote) return fail(ERR.WRONG_PHASE, 'setup reroll vote in progress');
    // everyone is ready and the briefing is ending (maybeEndInfo): too late for a new opening
    if (this._infoAdvanceTimer) return fail(ERR.WRONG_PHASE, 'briefing ending');
    const humans = this.humans();
    if (humans.some((p) => !p.connected)) return fail(ERR.NOT_READY, 'all humans must be connected to vote');
    const now = this.sched.now();
    const last = this._rerollStartAt.get(playerId);
    if (last !== undefined && now - last < REROLL_COOLDOWN_MS) return fail(ERR.RATE, 'setup reroll cooldown');
    this._rerollStartAt.set(playerId, now);
    this.setupVote = {
      id: ++this._setupVoteSeq,
      proposerId: playerId,
      voters: humans.map((p) => p.playerId),
      agreed: new Set([playerId]),
    };
    // (fork, user 2026-11-13: "Rerolls vote should not stop the countdown") the briefing's deadline keeps running: when it
    // fires, enterBandDraft drops the vote and the match goes on with the current setup
    if (humans.length === 1) return this.completeSetupReroll();
    this.markPublic();
    this.flush(true);
    return OK;
  }

  voteSetupReroll(ps, voteId, agree) {
    if (this.phase !== PHASE.INFO_CHECK || !this.setupVote) return fail(ERR.WRONG_PHASE);
    const vote = this.setupVote;
    if (vote.id !== voteId) return fail(ERR.BAD_TARGET, 'setup vote changed');
    if (!ps.connected || !vote.voters.includes(ps.playerId)) return fail(ERR.NOT_IN_ROOM);
    if (!agree) { this.cancelSetupVote(); return OK; }
    vote.agreed.add(ps.playerId);
    if (vote.voters.every((id) => vote.agreed.has(id))) return this.completeSetupReroll();
    this.markPublic();
    this.flush(true);
    return OK;
  }

  cancelSetupReroll(playerId, voteId) {
    if (this.disposed || this.ended || this.phase !== PHASE.INFO_CHECK || !this.setupVote) return fail(ERR.WRONG_PHASE);
    if (this.setupVote.id !== voteId) return fail(ERR.BAD_TARGET, 'setup vote changed');
    const ps = this.players.get(playerId);
    if (!ps || ps.left || !ps.connected) return fail(ERR.NOT_IN_ROOM);
    this.cancelSetupVote();
    return OK;
  }

  cancelSetupVote() {
    const vote = this.setupVote;
    if (!vote) return;
    this.setupVote = null;
    // the countdown never stopped (requestSetupReroll), so there is nothing to resume
    if (this.phase === PHASE.INFO_CHECK && !this.disposed && !this.ended) {
      this.maybeEndInfo();
      this.markPublic();
      this.flush(true);
    }
  }

  completeSetupReroll() {
    let prepared;
    try {
      const rng = createRng(deriveSeed(this.seed, `reroll-setup:${this.setupRevision + 1}`));
      const setup = setupMatchWaves(this.gd, rng);
      const stage = setup.stageId ? this.gd.stage(setup.stageId) : null;
      const bans = drawDisabledBonds(this.gd, rng);
      const pool = new SharedPool(this.gd, { banned: bans.banned });
      if (!pool.entries.size) throw new Error('rerolled chess pool is empty');
      const off = new Set([...bans.drawn, ...bans.staticOff]);
      const stocks = this.order.map((ps) => ps.buildDiyStock(off));
      prepared = { setup, stage, bans, pool, stocks };
    } catch (e) {
      this.reportError('reroll setup', e);
      this.cancelSetupVote();
      return fail(ERR.INTERNAL);
    }
    // All data-dependent work succeeds before any opening or player state changes.
    const { setup, stage, bans, pool, stocks } = prepared;
    this.stageId = setup.stageId;
    this.stage = stage;
    this.factions = setup.factions;
    this.bossId = setup.bossId;
    this.hiddenBossId = setup.hiddenBossId;
    this.disabledBonds = bans.drawn;
    this.staticInactiveBonds = bans.staticOff;
    this.bannedChess = bans.banned;
    this.pool = pool;
    this._botPath = null;
    for (const [i, ps] of this.order.entries()) {
      ps.diyStock = stocks[i].stock;
      ps.diyBanned = stocks[i].banned;
      ps.invalidateDeployMap();
      ps.infoReady = ps.botControlled;
    }
    this.setupRevision++;
    this.setupVote = null;
    // A completed reroll is a new opening, so every seat gets a fresh chance to ask for another one.
    this._rerollStartAt.clear();
    this.enterInfoCheck();
    return OK;
  }
}
