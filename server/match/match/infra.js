// server/match/match/infra.js — Match methods: infrastructure — error isolation (guard, reportError), timers tracked
// for dispose (later, cancel, scaled) and the phase deadline (setDeadline), soloUntimed, uids, the player lists
// (alivePlayers, humans), a seat's bot strategy (botFor), the bonds this match's pool holds (bondInPool, bondLive), a
// player's boss-round group, deploy field and deploy map, and the guarded meta dispatch (dispatch, dispatchItem →
// effectsMeta.js EffectDispatcher).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { buildDeployMap } from '../board.js';
import { CC, riskLeakWeight } from '../../../shared/ruleData.js';
import { tagHas, tagLevel } from '../../../shared/rules.js';

/** The effect id of ccPatriot Undying 1's round-9 card (its bounty keeps it). */
export const RISK_PATRIOT_CARD = 'risk:patriot';

/** A player's total stacks: Σ of its alliance layers. */
const stackTotal = (p) => Object.values(p.layers || {}).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
/** The stacks of a player's highest stacked active alliance (0 without one). */
const topActiveStacks = (p) => Object.entries(p.bonds || {}).reduce((m, [id, b]) => (b && b.active && Number.isFinite(p.layers?.[id]) ? Math.max(m, p.layers[id]) : m), 0);

/** A bounty entry of an SPA-CC sub-wave: no Funds, one battle. */
const riskCard = (id, key, count, extra = {}) => ({ id, roundsLeft: 1, card: { effectId: id, enemyKey: key, count, coin: 0, payout: 'kill', rounds: 1, ...extra } });

export class MatchInfra {
  /** Run a callback with error isolation, then flush the views. */
  guard(fn) {
    if (this.disposed) return;
    try { fn(); } catch (e) { this.reportError('guard', e); }
    try { this.flush(); } catch (e) { this.reportError('flush', e); }
  }

  reportError(label, e) {
    this.errorCount++;
    const msg = `${label}: ${e && e.message ? e.message : e}`;
    if (this.errors.length < 50) this.errors.push({ label, message: String(e && e.message ? e.message : e), stack: e && e.stack ? String(e.stack).split('\n').slice(0, 6).join('\n') : null });
    this.log.error?.(`[match ${this.roomCode}] ${msg}`, e && e.stack ? String(e.stack).split('\n').slice(1, 4).join(' | ') : '');
  }

  /** Schedule a guarded callback (tracked for dispose). */
  later(ms, fn) {
    if (this.disposed) return null;
    let h = null;
    h = this.sched.setTimeout(() => {
      this._timers.delete(h);
      if (this.disposed) return;
      this.guard(fn);
    }, ms);
    if (h) this._timers.add(h);
    return h;
  }

  cancel(h) {
    if (!h) return;
    this.sched.clearTimeout(h);
    this._timers.delete(h);
  }

  scaled(ms) { return Math.max(0, Math.round(ms * this.timerScale)); }

  /**
   * Set the phase deadline (seconds; null/0 ⇒ untimed) and its timeout callback. `silent`: the timer runs but no
   * deadline is published (m.public.deadline 0 ⇒ no countdown) — the fixed presentation steps of a solo match.
   */
  setDeadline(seconds, fn, { silent = false } = {}) {
    this.cancel(this._phaseTimer);
    this._phaseTimer = null;
    if (this.test === true) { this._testHeld = null; this._testArmed = null; }
    // Test matches can hold the callback (g.test timers off). A normal match never enters this branch:
    // scaling the delay to 0 would fire it at once, and cancelling it without keeping fn would stick
    // a phase whose only advance is this timer (BATTLE_CHECK → startRound). [ASSUMED] re-arm uses the
    // original duration, not the leftover.
    if (this.test === true && this.testTimers === false && seconds > 0 && typeof fn === 'function') {
      this.deadline = 0;
      const held = { seconds, fn, silent: !!silent };
      this._testHeld = held;
      this._testArmed = held;
      return;
    }
    if (!(seconds > 0) || typeof fn !== 'function') {
      this.deadline = 0;
      if (this.test === true) { this._testHeld = null; this._testArmed = null; }
      return;
    }
    const ms = this.scaled(seconds * 1000);
    this.deadline = silent ? 0 : this.sched.now() + ms;
    this._phaseTimer = this.later(ms, () => { this._phaseTimer = null; if (this.test === true) { this._testArmed = null; this._testHeld = null; } fn(); });
    if (this.test === true) this._testArmed = { seconds, fn, silent: !!silent };
  }

  /**
   * Solo timers (research 01 §843 / 06 §3: 下半 独立模拟 has no time limit on 休整期 / 机变 — "休整期及机变阶段没有时间
   * 限制"; the strategy draft is free too): a solo match publishes a deadline ONLY for its battles. INFO_CHECK waits
   * for 准备就绪 (co-op keeps the official 25 s guard), BAND_DRAFT / SP_DRAFT / PREP are untimed, and the fixed
   * presentation steps (BATTLE_CHECK, ROUND_START, SETTLE) run silently (no countdown). The same holds for any match
   * with a single human (loneHuman: a 同盟 room started alone or with AI teammates only — user playtest #4 item 3):
   * the timers only ever made humans wait on each other; AI seats act at once. The `untimed` lobby rule does the same for
   * any match: a phase then ends when every alive player is ready (a disconnected human is waited for until the
   * reconnect window turns the drop into onLeave).
   */
  get soloUntimed() {
    // Maintainer decision: historical solo uses its timer unless 「不限时」 is opted into;
    // the single-human convenience rule still applies to co-op. (fork) The `untimed` lobby rule switches it off for both.
    if (this.lobbyRules?.untimed) return true;
    return this.isSolo ? this.gd.config.version?.rules?.soloTimed !== true || this.opts.soloUnlimited === true : this.loneHuman;
  }

  nextUid() { return ++this.uidSeq; }

  /**
   * A player's bounties for this round's wave plus the SPA-CC Risk tag extras (shared/rules.js; numbers: CC). Every wave
   * builder takes its bounties from here; `boss`: the wave of a final boss round (Final Assault / Hidden Core).
   *   ccFamiglia Cleaner   rounds 10–13: the alive player with the fewest stacks in all (Σ of its alliance layers; a tie:
   *                        the earliest seat, Fish 2026-10-15) gets CC.silencers.count 家族暗影灭迹人 (solo: soloCount), no
   *                        bounty; Unending 3 /
   *                        Seasonal 3: and Zaaro (his leak costs CC.famiglia.zaaro.leakLp, riskLoss)
   *   ccPatriot            Undying 1: the round-9 Improv's Patriot card (riskPatriotCard) is an ordinary bounty card;
   *                        Undying 2: 2 Guerrilla Shieldguards join the Patriot who took it; Undying 3: in the final boss
   *                        rounds Patriot and his escort come again, once per field, taken or not (bossSubWave)
   *   ccDelegation         the final boss rounds: Degenbrecher (at the round's start), 2 Delegation Shieldbearers and 2
   *                        Delegation Centurion Champions once per field (bossSubWave); the Degenbrecher's HP × 1 / 2 / 3
   *                        per alive player, her ATK × 1.5 from United 2
   * @param {import('../PlayerState.js').PlayerState} ps
   * @param {{ boss?: boolean, field?: string[] }} [o] `field`: the boss field's player ids, left first (bossSubWave)
   */
  waveBounties(ps, { boss = false, field = null } = {}) {
    const extra = boss ? this.bossSubWave(field || [ps.playerId]).get(ps.playerId) || [] : this.riskBounties(ps);
    return extra.length ? [...ps.bounties, ...extra] : ps.bounties;
  }

  /** A player's SPA-CC extras in a normal round: Patriot's escort with the Patriot this player took, Cleaner's sub-wave. */
  riskBounties(ps) {
    if (!this.lobbyRules || !ps.alive) return [];
    const out = [];
    const pt = CC.patriot;
    if (tagHas(this.lobbyRules, 'ccPatriot', 'undying2') && this.gd.enemy(pt.escort.key)
      && ps.bounties.some((b) => b.card && b.card.effectId === RISK_PATRIOT_CARD && b.roundsLeft > 0)) {
      out.push(riskCard('risk:patriotEscort', pt.escort.key, pt.escort.count));
    }
    out.push(...this.silencerBounties(ps));
    const v = this.vengeanceCount([ps]);
    if (v > 0) out.push(riskCard('risk:vengeance', CC.vengeance.key, v));
    return out;
  }

  /**
   * ccVengeance: how many Reid, "Hateful Avenger" a battle gets, by the highest stacked active alliance among the alive
   * `players` (Fish 2026-10-23). Invincible Blade 1: 1 at CC.vengeance.perStacks stacks or more — in the final boss
   * rounds (`boss`) always 1; Invincible Blade 3: 1 more per perStacks above perStacks. At most 20 (a bounty card's cap).
   */
  vengeanceCount(players, { boss = false } = {}) {
    const V = CC.vengeance;
    if (!tagHas(this.lobbyRules, 'ccVengeance', 'blade1') || !this.gd.enemy(V.key)) return 0;
    const top = players.reduce((m, p) => (p && p.alive ? Math.max(m, topActiveStacks(p)) : m), 0);
    if (!boss && top < V.perStacks) return 0;
    const more = tagHas(this.lobbyRules, 'ccVengeance', 'blade3') ? Math.max(0, Math.floor((top - V.perStacks) / V.perStacks)) : 0;
    return Math.min(20, 1 + more);
  }

  /**
   * The SPA-CC sub-waves of a final boss round's field (Patriot Undying 3: Patriot and his escort; Delegation: the
   * Degenbrecher, Shieldbearers and Centurion Champions with their multipliers) — once per field, not per player, every
   * unit on a route that goes to the left portal first and then the right (Fish 2026-10-15; waves.js `leftFirst`). They
   * go with the field's first living player (left). Map playerId → bounty cards.
   * @param {string[]} field the field's player ids, left first
   */
  bossSubWave(field) {
    const out = new Map();
    if (!this.lobbyRules) return out;
    const first = (field || []).map((id) => this.players.get(id)).find((p) => p && p.alive);
    if (!first) return out;
    const cards = [];
    const pt = CC.patriot;
    if (tagHas(this.lobbyRules, 'ccPatriot', 'undying3') && this.gd.enemy(pt.key)) {
      cards.push(riskCard('risk:patriot', pt.key, 1, { leftFirst: true }));
      if (this.gd.enemy(pt.escort.key)) cards.push(riskCard('risk:patriotEscort', pt.escort.key, pt.escort.count, { leftFirst: true }));
    }
    const dg = CC.delegation;
    if (tagHas(this.lobbyRules, 'ccDelegation', 'united1')) {
      const has = (n) => tagHas(this.lobbyRules, 'ccDelegation', n);
      // the Degenbrecher only: HP × hpMul per alive player (her copies share one HP bar), ATK × degenAtkMul from United 2
      const alive = [...this.players.values()].filter((p) => p && p.alive).length || 1;
      const hpMul = (has('united3') ? dg.hpMul.united3 : has('united2') ? dg.hpMul.united2 : dg.hpMul.united1) * alive;
      const degenMods = { hpMul, ...(has('united2') ? { atkMul: dg.degenAtkMul } : {}) };
      // the Degenbrecher at the round's start (waves.js bountyPlan `atStart`): United 2's hold is never waiting on her
      for (const w of dg.wave) if (this.gd.enemy(w.key)) cards.push(riskCard(`risk:delegation:${w.key}`, w.key, w.count, { leftFirst: true, ...(w.key === dg.degen ? { atStart: true, riskMods: degenMods } : {}) }));
    }
    // ccVengeance: always at least 1, by the highest active alliance of any alive player, once per field
    const v = this.vengeanceCount(this.alivePlayers(), { boss: true });
    if (v > 0) cards.push(riskCard('risk:vengeance', CC.vengeance.key, v, { leftFirst: true }));
    if (cards.length) out.set(first.playerId, cards);
    return out;
  }

  silencerBounties(ps) {
    const s = CC.silencers;
    if (!tagHas(this.lobbyRules, 'ccFamiglia', 'cleaner') || !s.rounds.includes(this.round) || !this.gd.enemy(s.key)) return [];
    const alive = this.alivePlayers();
    if (!alive.length) return [];
    let low = alive[0];
    for (const p of alive) if (stackTotal(p) < stackTotal(low)) low = p;
    if (low !== ps) return [];
    const out = [{ id: 'risk:silencers', roundsLeft: 1, card: { effectId: 'risk:silencers', enemyKey: s.key, count: this.isSolo ? s.soloCount : s.count, coin: 0, payout: 'kill', rounds: 1 } }];
    // ccFamiglia Unending 3 / Seasonal 3: Zaaro joins the sub-wave
    const z = CC.famiglia.zaaro;
    if ((tagHas(this.lobbyRules, 'ccFamiglia', 'unending3') || tagHas(this.lobbyRules, 'ccFamiglia', 'seasonal3')) && this.gd.enemy(z.key)) {
      out.push({ id: 'risk:zaaro', roundsLeft: 1, card: { effectId: 'risk:zaaro', enemyKey: z.key, count: 1, coin: 0, payout: 'kill', rounds: 1 } });
    }
    return out;
  }

  /**
   * ccPatriot Undying 1: the Patriot card the round-9 Improv always offers (spDraft.js), or null. A bounty card worth 0
   * Funds; whoever takes it gets him in this round's battle (Match.ccPatriotTaken).
   */
  riskPatriotCard() {
    const pt = CC.patriot;
    if (!tagHas(this.lobbyRules, 'ccPatriot', 'undying1') || this.round !== pt.round) return null;
    const e = this.gd.enemy(pt.key);
    if (!e) return null;
    return { kind: 'bounty', id: RISK_PATRIOT_CARD, name: e.name, desc: '', descRaw: null, tier: null, coin: 0, payout: 'kill', rounds: 1, enemyKey: pt.key, count: 1, risk: true,
      ...(tagHas(this.lobbyRules, 'ccPatriot', 'undying2') ? { skipAtk: true } : {}) };
  }

  /**
   * ccPatriot Undying 1: whether the final boss gets the penalty — the round-9 Improv offered Patriot and nobody took him
   * (a mode without a round-9 Improv offers nothing, so no penalty).
   */
  riskPatriotSkipped() {
    return tagHas(this.lobbyRules, 'ccPatriot', 'undying1') && !!this.ccPatriotOffered && !this.ccPatriotTaken;
  }

  /** The LP one leak of `enemyKey` costs in a normal round or a 联防 (1; a Patriot / tier-3 Zaaro under their tags more). */
  riskLeakWeight(enemyKey) { return riskLeakWeight(this.lobbyRules, enemyKey); }

  /**
   * The LP a player's round costs (settle(), the live pendingLp): `base` (min(cap, …) as before) with the SPA-CC tags —
   * a leaked Patriot (ccPatriot) or Zaaro (ccFamiglia tier 3) costs its leakLp instead of 1, still within the cap; ccLastLine adds
   * CC.lastLineLp when the player's own battle leaked at all, past the cap (and even when the 联防 caught every leak).
   * @param {object[]} leaked the player's own battle's leaked list
   * @param {number} base the loss without the tags
   * @param {boolean} [weigh] whether `base` came from `leaked` (false: 联防 survivors)
   */
  riskLoss(leaked, base, weigh = true) {
    if (!this.lobbyRules) return base;
    const counted = (leaked || []).filter((l) => l && l.counted !== false);
    let loss = base;
    if (weigh) {
      // a leaked Patriot (ccPatriot) / Zaaro (ccFamiglia tier 3) costs its leakLp instead of 1, still within the cap
      let extra = 0;
      for (const l of counted) extra += this.riskLeakWeight(l.enemyKey) - 1;
      if (extra > 0) loss = Math.min(this.gd.lpCapPerRound, base + extra);
    }
    if (tagLevel(this.lobbyRules, 'ccLastLine') > 0 && counted.length > 0) loss += CC.lastLineLp;
    return loss;
  }

  alivePlayers() { return this.order.filter((p) => p.alive); }

  /** A player's starting LP: its strategy's (GameData.startLp), twice that with the `doubleLp` cheat. */
  startLp(bandId) { return this.gd.startLp(bandId) * (this.lobbyRules?.doubleLp ? 2 : 1); }

  /** The strategy that plays a bot-controlled seat: its SP_BOT_STRATEGY_SEATS override, else the match's (#816 P1). */
  botFor(ps) { return this.seatBots[ps.seat] ?? this.bot; }

  /** Whether any chess of a bond is in this match's pool (a 驰援 card of a fully banned bond is never offered). */
  bondInPool(bondId) {
    for (const id of this.pool.entries.keys()) {
      const c = this.gd.chess(id);
      if (c && Array.isArray(c.bonds) && c.bonds.includes(bondId)) return true;
    }
    return false;
  }

  /**
   * Whether a bond can matter in this match: not in the mode's static inactive list (标准: 拉特兰 / 阿戈尔 / 卡西米尔 /
   * 奥术 … never activate, research 02 §2.1) and still with chess in the pool. 机变 tactic cards whose every target bond
   * is dead are not offered (choices.js).
   */
  bondLive(bondId) {
    return !this.gd.modeInactiveBonds.has(bondId) && this.bondInPool(bondId);
  }
  humans() { return this.order.filter((p) => !p.isBot && !p.left); }

  /** [ASSUMED] Touch's initial, match-long team grant survives its holder's elimination/quit; focus alone grants none. */
  teamMedicGranted() { return this.order.some(p => (this.gd.band(p.bandId)?.effectRef ?? p.bandId) === 'band_amedic'); }

  /**
   * The boss-round group of a player (`bossWaves`: the per-match random pairs, planned in startRound
   * before the players' round start) and its side — 'L', or 'R' for the second player of a pair (the mirrored right
   * half) — or null outside a boss round / for a player without a field.
   * @returns {{ wave: object, players: string[], side: 'L'|'R' } | null}
   */
  bossGroupOf(ps) {
    if (!ps || !Array.isArray(this.bossWaves)) return null;
    const g = this.bossWaves.find((x) => Array.isArray(x.players) && x.players.includes(ps.playerId));
    return g ? { wave: g.wave, players: g.players, side: g.players.indexOf(ps.playerId) === 1 ? 'R' : 'L' } : null;
  }

  /**
   * The field a player deploys on (server/match/board.js DEPLOY_FIELDS): in a boss round (最终攻势 / 隐秘核心, from its
   * ROUND_START on — the pairing exists before PlayerState.startRound's recompute) the player's half of the boss field,
   * 'bossL' or 'bossR' (bossGroupOf); otherwise its own normal board. User playtest #5 item 7.
   * @returns {'normal'|'bossL'|'bossR'}
   */
  deployFieldOf(ps) {
    const g = this.bossGroupOf(ps);
    return !g ? 'normal' : g.side === 'R' ? 'bossR' : 'bossL';
  }

  /**
   * A fresh deploy map of a player on `field` (default: the field it deploys on now) under its device / tile overrides.
   * Pure — no PlayerState cache is touched (the read-only checker invariants.js uses it; PlayerState.deployMap caches).
   */
  deployMapFor(ps, field = this.deployFieldOf(ps)) {
    return buildDeployMap(this.stage, { deviceOverrides: ps.deviceOverrides, tileOverrides: ps.tileOverrides, field });
  }

  dispatch(ps, hook, ev = {}, opts = {}) {
    this.externalAI?.observe(ps, hook, ev);
    try { return this.dispatcher.dispatch(ps, hook, ev, opts); } catch (e) { this.reportError(`dispatch ${hook}`, e); return ev; }
  }

  dispatchItem(ps, item, holder, hook, ev) {
    try { return this.dispatcher.dispatchItem(ps, item, holder, hook, ev); } catch (e) { this.reportError(`dispatchItem ${hook}`, e); return ev; }
  }
}
