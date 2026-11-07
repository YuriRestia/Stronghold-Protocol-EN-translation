// server/match/match/botBattles.js — (fork) Match methods: the real battles of fields no connected human plays, run in a
// human's browser instead of on the server (docs/host-browser-bots.md Part B13). Off unless opts.botBattles / SP_BOT_BATTLES
// says 'host'. A b.botBattle frame carries the field's spec, a Worker runs it at once and answers b.botBattleResult, and the
// server holds that result until the battle's natural end (_armRelease), so pacing and the teammates' progress UI look as
// they do for a server-run field. Timeout, a refused result or a lost executor: the next human, then a synthetic result.
// The server never simulates such a field. A boss field shares its pool with the other fields, so it runs live in the Worker on
// the field's clock and reports as a human's browser does (b.progress, b.result): the existing boss rules apply to it, and a lost
// or silent executor hands it to the next human. A plugin or old-version room's Worker loads that room's content (botHost.js).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { syntheticResult, validateClientResult } from '../fields.js';
import { requiresTraitLayerAuthority } from '../operatorTraits.js';

/** Wall-clock ms an executor has to answer one field. Its browser may be working through 3 bot fields, on a phone. */
export const BOT_BATTLE_ANSWER_MS = 30000;
/** Timeouts after which a human stops being asked for the rest of the match (docs/host-browser-bots.md B9). */
export const BOT_HOST_STRIKES = 2;

export class MatchBotBattles {
  /** Whether a field `_authorityFor` found no human for goes to a browser instead of the server. */
  _botBattleOnHost(f) {
    if (this.botBattles !== 'host') return false;
    // layer traits keep today's rule on a human's field; a field of bots only is exempt, capped by the same allowance
    return !requiresTraitLayerAuthority(f.spec, this.gd) || f.players.every((pid) => this.players.get(pid)?.isBot);
  }

  /**
   * What a frame says about the content its Worker needs: nothing in a vanilla room, whose `cs` is just the official hash (the Worker
   * loads the official data), and the room's set in a plugin or old-version room.
   */
  _botContent() {
    return this.requireCs ? { cs: this.cs } : {};
  }

  /**
   * Who does bot work now (design B9): the room's host, else the lowest seat. Connected, tab visible, not demoted, not tried yet.
   * @param {Set<string>} [tried]
   */
  _botExecutorFor(tried) {
    const usable = (ps) => ps && !ps.isBot && !ps.left && ps.connected && !this._botHostDemoted.has(ps.playerId) && !this._botHostHidden.has(ps.playerId) && !tried?.has(ps.playerId);
    const host = this.hostId ? this.players.get(this.hostId) : null;
    if (usable(host)) return host.playerId;
    let best = null;
    for (const ps of this.players.values()) if (usable(ps) && (!best || ps.seat < best.seat)) best = ps;
    return best ? best.playerId : null;
  }

  /** A timeout or a failed job: after BOT_HOST_STRIKES of them a human is not asked again this match. */
  _botHostStrike(pid) {
    const strikes = (this._botHostStrikes.get(pid) || 0) + 1;
    this._botHostStrikes.set(pid, strikes);
    if (strikes >= BOT_HOST_STRIKES) this._botHostDemoted.add(pid);
    return strikes;
  }

  /** Send the field to the next executor; with nobody left it gets a synthetic result (no kills, no leaks). */
  _assignBotHost(f) {
    const pid = this._botExecutorFor(f.botTried);
    if (!pid) { this._botBattleGiveUp(f); return; }
    if (f.kind === 'boss' || f.kind === 'hidden') { this._assignBotBoss(f, pid); return; }
    f.mode = 'host';
    f.authority = null;
    f.executor = pid;
    (f.botTried ||= new Set()).add(pid);
    this.botBattleStats.sent++;
    // armed first: an answer that comes back with the frame itself cannot race the timeout. Real time: a browser's work does not
    // speed up with the match's timer scale.
    f.botTimer = this.later(this.botBattleAnswerMs, () => {
      f.botTimer = null;
      this.botBattleStats.timeouts++;
      const strikes = this._botHostStrike(pid);
      this.log.warn?.(`[match ${this.roomCode}] ${f.fieldId}: ${pid} did not answer its bot battle (${strikes})`);
      this._botBattleRelease(f);
      this._assignBotHost(f);
    });
    const { cs: _cs, ...spec } = f.spec;
    if (!this.sendTo(pid, { t: 'b.botBattle', battleId: f.battleId, spec, ...this._botContent() })) {
      this._botBattleDrop(f);
      this._assignBotHost(f);
    }
  }

  /** A boss field on a human's browser: the field's authority in all but the seat, and it reports what any authority reports. */
  _assignBotBoss(f, pid) {
    (f.botTried ||= new Set()).add(pid);
    f.botHost = true;
    this.botBattleStats.sent++;
    this._assignClient(f, pid);
    const { cs: _cs, ...spec } = f.spec;
    if (!this.sendTo(pid, { t: 'b.botBattle', battleId: f.battleId, spec, live: { elapsed: this._fieldElapsed(f), speed: this.gameSpeed }, ...this._botContent() })) this._assignBotHost(f);
  }

  /** A boss field's executor left, went silent or sent an implausible result: the next human, else what the field has so far. */
  _botBossHandover(f, why) {
    const prev = f.authority;
    if (why === 'silent' && prev) { this.botBattleStats.timeouts++; this._botHostStrike(prev); }
    if (why === 'invalid') this.botBattleStats.rejected++;
    if (prev) this.sendTo(prev, { t: 'b.end', battleId: f.battleId, fieldId: f.fieldId, reason: 'takeover' });
    f.authority = null;
    this._assignBotHost(f);
  }

  /** Forget the running executor without telling it. */
  _botBattleDrop(f) {
    if (f.botTimer) { this.cancel(f.botTimer); f.botTimer = null; }
    f.executor = null;
  }

  /** Forget the running executor and tell it to stop. */
  _botBattleRelease(f) {
    const pid = f.executor;
    this._botBattleDrop(f);
    if (pid) this.sendTo(pid, { t: 'b.botBattleCancel', battleId: f.battleId });
  }

  _botBattleGiveUp(f) {
    this.botBattleStats.synthetic++;
    this.log.warn?.(`[match ${this.roomCode}] ${f.fieldId}: nobody can run this bot battle`);
    const bossLike = f.kind === 'boss' || f.kind === 'hidden';
    f.mode = 'server';
    f.executor = null;
    f.result = syntheticResult(f.players, { ...(bossLike ? { bossBy: f.bossBy } : {}), time: this._fieldElapsed(f) });
    f.resultSource = 'none';
    // in a callback of its own: this can run inside _launch, with the fields after this one still to start
    this.later(0, () => { this._fieldDone(f); if (bossLike) this._checkFinalEnd(); });
  }

  /** b.botBattleResult: a report, never an error. A stale battle or another sender is ignored. */
  _onBotBattleResult(ps, msg) {
    const f = this._fieldByBattle(msg.battleId);
    if (!f || f.done || f.mode !== 'host' || f.executor !== ps.playerId) return;
    this._botBattleDrop(f);
    const v = msg.error || !msg.result ? { ok: false, reason: 'the browser could not run it' } : validateClientResult(f.spec, msg.result, { gd: this.gd, botField: true });
    if (!v.ok) {
      this.botBattleStats.rejected++;
      this.log.warn?.(`[match ${this.roomCode}] ${f.fieldId}: no bot battle result from ${ps.playerId} (${v.reason})`);
      this._assignBotHost(f);
      return;
    }
    // from here on it is what a finished server run is: released at the battle's natural end, progress from the timeline
    f.mode = 'server';
    f.result = v.result;
    f.resultSource = 'host';
    f.timeline = msg.timeline || null;
    f.endGt = v.result.time;
    this.botBattleStats.done++;
    this._armRelease(f);
    this._armProgressTicker();
  }

  /** An executor disconnected or left: its fields go to the next human at once. */
  _botBattleHostLost(ps) {
    for (const f of this.fields) {
      if (!f.cc || f.done) continue;
      if (f.botHost && f.mode === 'client' && f.authority === ps.playerId) { this._botBossHandover(f, 'lost'); continue; }
      if (f.mode !== 'host' || f.executor !== ps.playerId) continue;
      this._botBattleDrop(f);
      this._assignBotHost(f);
    }
  }
}
