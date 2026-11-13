// server/match/match/unitePhase.js — Match methods: 联防 glue (the rules: server/match/unite.js) — the UNITE phase in
// both modes (the 联防 field from the helpers' carried state and the leakers' enemies), its end, and the leakers' live
// counts (_uniteLeft, user playtest #6 item 7; _uniteTick in the server-run mode).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, GEO } from '../../../shared/constants.js';
import { deriveSeed } from '../../sim/rng.js';
import { uniteBattleOpts, uniteSurvivors } from '../unite.js';
import { FieldRunner, timelineAt, uniteBillBounds, syntheticResult, RESULT_GRACE_MS } from '../fields.js';
import { uniteLeft } from '../../sim/spec.js';
import { FLOW_TICKER_PRIORITY, DELAYS } from './common.js';
import { msg, playerParam } from '../../../shared/i18n.js';
import { onStartUnite } from '../botEmotes.js';
import { noteChatKills } from '../chatWallet.js';

/** (fork) The watchdog's second stage: how long after the field closed `_afterUnite` gets to move the phase on. */
const UNITE_SETTLE_GRACE_MS = 10_000;

export class MatchUnite {
  startUnite(plan) {
    this._armUniteWatchdog(plan, this.wave ? this.wave.timeLimit : 60);
    if (this.clientCombat) { this._startUniteClient(plan); return; }
    this.phase = PHASE.UNITE;
    this.unitePlan = plan;
    const limit = this.wave ? this.wave.timeLimit : 60;
    const battle = this.newBattle(this._uniteOpts(plan, limit));
    this.fields = [{ fieldId: 'u', kind: 'unite', players: plan.helpers.map((p) => p.playerId), battle, live: true }];
    this.deadline = this.sched.instant ? 0 : this.sched.now() + Math.round((limit / this.gameSpeed) * 1000);
    this._defaultWatch();
    this.markPublic();
    this.tickerText(msg('联防阶段：{names} 迎战突破防线的敌人', { names: plan.helpers.map(playerParam) }), FLOW_TICKER_PRIORITY);
    onStartUnite(this, plan); // an AI helper says "合作愉快" once on the open of a 联防 (enabled by default; SP_BOT_EMOTES=0 silences it)
    this._uniteLeftKey = null;
    this.runner = new FieldRunner(this, this.fields, {
      onTick: (runner) => this._uniteTick(runner),
      onDone: (runner) => {
        if (this.phase !== PHASE.UNITE) return;
        const res = runner.resultOf(this.fields[0]);
        this._collectSimErrors(this.fields[0], res);
        noteChatKills(this, this.fields[0], res);
        this.fields[0].live = false;
        this.deadline = 0;
        this.markPublic();
        this.later(this.scaled(DELAYS.COMBAT_END), () => this._afterUnite(plan, res)); // (fork) relay: match/largeRoom.js
      },
    });
    this.runner.start();
  }

  /**
   * Battle options of the 联防 field (helpers' carried end state, the leakers' enemies) on the round's battlefield, its
   * terrain, crates, water, devices and runes included (unite.js header; the owner's decision of 2026-10-07 — 0.2.0's
   * escaped-level map is withdrawn). The field meta and the client-run spec carry the match stageId, so every viewer
   * draws the battlefield the boards stand on.
   */
  _uniteOpts(plan, limit) {
    const { wave, players } = uniteBattleOpts(this, plan, limit);
    return {
      // (fork) a relay's second round (match/largeRoom.js) draws its own seed
      seed: deriveSeed(this.seed, plan.relayRound > 1 ? `u${plan.relayRound}:${this.round}` : `u:${this.round}`),
      kind: 'unite',
      modeId: this.modeId,
      round: this.round,
      stageId: this.stageId,
      rect: { ...GEO.UNITE_RECT },
      timeLimit: limit,
      players,
      spawns: this._sanitizeSpawns(wave.spawns),
      routes: wave.routes,
      sharedBoss: null,
      flags: { layerGainsEnabled: false, ...this.gd.dp },
      fieldId: 'u',
      // leaked enemies re-enter with the stats they had: the round template's stat overrides apply again
      enemyOverrides: this.wave && this.wave.overrides ? this.wave.overrides : {},
      waveId: wave.templateId,
    };
  }

  _startUniteClient(plan) {
    this.phase = PHASE.UNITE;
    this.unitePlan = plan;
    const limit = this.wave ? this.wave.timeLimit : 60;
    const f = this._ccField({ fieldId: 'u', kind: 'unite', players: plan.helpers.map((p) => p.playerId), opts: this._uniteOpts(plan, limit) });
    this.deadline = this.sched.instant ? 0 : this.sched.now() + Math.round((limit / this.gameSpeed) * 1000);
    this.watchers.clear();
    this._launch([f]);
    // helpers and everyone else (as observers, spectator seats included) simulate the same 联防 spec locally
    for (const ps of this._viewers()) {
      this.watchers.set(ps.playerId, 'u');
      this._sendStart(ps.playerId, f, { watch: !f.players.includes(ps.playerId) });
    }
    this.markPublic();
    this.tickerText(msg('联防阶段：{names} 迎战突破防线的敌人', { names: plan.helpers.map(playerParam) }), FLOW_TICKER_PRIORITY);
  }

  _finishUniteClient() {
    if (this.phase !== PHASE.UNITE) return;
    const f = this.fields[0];
    const res = f.result;
    this._collectSimErrors(f, res);
    noteChatKills(this, f, res);
    this._stopClientCombat();
    f.live = false;
    this.deadline = 0;
    this.markPublic();
    const plan = this.unitePlan;
    this.later(this.scaled(DELAYS.COMBAT_END), () => this._afterUnite(plan, res)); // (fork) relay: match/largeRoom.js
  }

  /**
   * 联防 (user playtest #6 item 7; PRTS 卫戍协议/帮助 "防卫失败的玩家可通过上方信息栏确认自身所属敌人的剩余数量"): how many of
   * a leaker's enemies are still standing on the 联防 field — not spawned yet, alive, or through the objective again —
   * plus its leaks that could not re-enter: what settle() charges it (before the per-round cap) if the 联防 ended now.
   * It falls as the helpers strike them down; a split or a summon raises nothing (a 联防 field tags its runtime spawns
   * `uniteRuntime`, spawns.js — they never crossed the leaker's own goal, so they are neither billed nor shown here).
   * Live from the field (client run: the authority's b.progress `left`; server run: the headless timeline on the field
   * clock, or the streamed battle itself), clamped to what the escaped wave sent that leaker (fields.js uniteBillBounds:
   * keySourceCounts only — the same set settlement bills); exact once the field has its result (unite.js
   * uniteSurvivors; a synthetic result charges the own leaks, as settle()). null for anyone but a leaker of the running
   * 联防.
   * @returns {number|null}
   */
  _uniteLeft(ps) {
    const plan = this.unitePlan;
    if (this.phase !== PHASE.UNITE || !plan || !ps || !plan.leakers.includes(ps)) return null;
    const pid = ps.playerId;
    const f = this.fields.find((x) => x && x.kind === 'unite') || null;
    let res = null;
    if (f && f.cc) res = f.done ? f.result : null;
    else if (f && f.battle && f.battle.finished) { try { res = f.battle.result(); } catch { res = null; } }
    if (res && res.synthetic) {
      const own = this.lastResults.get(pid);
      return own && Array.isArray(own.leaked) ? own.leaked.filter((l) => l && l.counted !== false).length : 0;
    }
    if (res) return uniteSurvivors(plan, res).get(pid) || 0;
    const sent = plan.leaked.filter((l) => l.sourcePlayerId === pid).length;
    let live = null;
    if (f && f.cc) {
      if (f.mode === 'server' && f.timeline) {
        // the sample is [gt, killed, total, resolved(, left)]: a 联防 sample's `left` is its 5th element
        const sample = timelineAt(f.timeline, this._fieldElapsed(f));
        live = sample && sample[4] && typeof sample[4] === 'object' ? sample[4] : null;
      } else live = f.progress && f.progress.left && typeof f.progress.left === 'object' ? f.progress.left : null;
    } else if (f && f.battle) {
      try { live = uniteLeft(f.battle); } catch { live = null; }
    }
    if (!this._uniteBounds || this._uniteBounds.plan !== plan) this._uniteBounds = { plan, bounds: uniteBillBounds(plan.leaked, this.gd) };
    const bound = this._uniteBounds.bounds.get(pid) ?? sent;
    const standing = live ? Math.min(bound, Math.max(0, Math.trunc(Number(live[pid]) || 0))) : sent;
    return standing + (plan.notReentered.get(pid) || 0);
  }

  /** Server-run 联防 (streaming mode): refresh m.public about once a game second when a leaker's count moved. */
  _uniteTick(runner) {
    const f = runner && runner.fields ? runner.fields[0] : null;
    if (!f || !f.battle || runner.ticks % 30 !== 0) return;
    let key = '';
    try { key = JSON.stringify(uniteLeft(f.battle)); } catch { key = ''; }
    if (key === this._uniteLeftKey) return;
    this._uniteLeftKey = key;
    this.markPublic();
  }

  /**
   * (fork) Live report 2026-11-13: an 8-player Grand Alliance stayed in 联防 with the countdown at 00 after its battle had
   * ended in every browser. Every step that ends the phase runs in a guarded timer (infra.js guard: an exception is logged
   * and swallowed), so one throw on the way (_finishUniteClient → _afterUnite → relay / settle) left the match there for
   * good. This watchdog only acts when the phase is already overdue: the field's time limit, the result grace, two browser
   * answer windows and the COMBAT_END pause after the deadline (every normal path ends long before). Stage 1 closes the
   * field with what it has (else a synthetic result, settle() then charges the leakers' own leaks) and lets the usual end
   * run; stage 2, when the phase still has not moved UNITE_SETTLE_GRACE_MS after that, settles straight away. A pause
   * or the harness hold (pause.js _freezeBattle) holds it and _resume re-arms what was left, like the field deadlines.
   */
  _armUniteWatchdog(plan, limit) {
    this._cancelUniteWatchdog();
    const lim = Number(limit) > 0 ? Number(limit) : 60;
    const ms = Math.round((lim / this.gameSpeed) * 1000) + RESULT_GRACE_MS + 2 * this.botBattleAnswerMs + this.scaled(DELAYS.COMBAT_END);
    this._setUniteWatchdog(plan, 1, ms);
  }

  _setUniteWatchdog(plan, stage, ms) {
    this._uniteWatchdogArm = { plan, stage, at: this.sched.now() + ms, left: 0 };
    this._uniteWatchdog = this.later(ms, () => { this._uniteWatchdog = null; this._uniteWatchdogArm = null; this._uniteOverdue(plan, stage); });
  }

  _cancelUniteWatchdog() {
    if (this._uniteWatchdog) { this.cancel(this._uniteWatchdog); this._uniteWatchdog = null; }
    this._uniteWatchdogArm = null;
  }

  /** Pause / hold (pause.js): stop the watchdog's clock; _releaseUniteWatchdog re-arms the time it had left. */
  _holdUniteWatchdog() {
    const a = this._uniteWatchdogArm;
    if (!this._uniteWatchdog || !a) return;
    this.cancel(this._uniteWatchdog);
    this._uniteWatchdog = null;
    a.left = Math.max(0, a.at - this.sched.now());
  }

  _releaseUniteWatchdog() {
    const a = this._uniteWatchdogArm;
    if (this._uniteWatchdog || !a) return;
    this._setUniteWatchdog(a.plan, a.stage, a.left);
  }

  _uniteOverdue(plan, stage) {
    if (this.phase !== PHASE.UNITE || this.unitePlan !== plan || this.ended) return;
    const open = this.fields.filter((f) => f && f.cc && f.kind === 'unite' && !f.done);
    this.log.warn?.(`[match ${this.roomCode}] 联防 R${this.round} overdue (stage ${stage}, ${open.length} open field(s)): ending it`);
    if (stage === 1 && open.length) {
      // armed first: if the usual end throws again, the second stage still comes
      this._setUniteWatchdog(plan, 2, this.scaled(DELAYS.COMBAT_END) + UNITE_SETTLE_GRACE_MS);
      for (const f of open) {
        this._clearFieldTimers(f);
        if (!f.result) { f.result = syntheticResult(f.players, { time: this._fieldElapsed(f) }); f.resultSource = 'none'; }
        this._fieldDone(f);
      }
      return;
    }
    const f = this.fields.find((x) => x && x.kind === 'unite') || null;
    let res = null;
    if (f && f.cc) res = f.result || null;
    else if (f && f.battle && f.battle.finished) { try { res = f.battle.result(); } catch { res = null; } }
    if (this.runner) { try { this.runner.stop(); } catch { /* ignore */ } }
    this.settle(plan, res || syntheticResult(plan.helpers.map((p) => p.playerId)));
  }
}
