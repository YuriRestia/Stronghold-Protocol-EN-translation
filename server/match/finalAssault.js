// server/match/finalAssault.js — 最终攻势 (R14 / solo FUNNY R9) and 隐秘核心 (R15) helpers (DESIGN §6.1, research
// 00-INDEX §5, 06 §10).
//
//   * Merged LP: teamLp = Σ LP of the alive players at the start of the Final Assault (no cap); the Hidden Core
//     continues with what is left.
//   * Pairing: shuffled once per match before Final Assault prep; Hidden Core keeps those pairs. If players leave,
//     intact pairs stay together and the remaining single players pair up. An odd player uses the `_s` template
//     (solo modes always use `_s`). Field ids 'b1', 'b2'. In a pair the first player is the LEFT side, the second the
//     RIGHT side (the sim mirrors the right side: board col c → field col 20 − c with the piece direction RIGHT ↔
//     LEFT, UP / DOWN unchanged (DESIGN §3, research 09 §1.2 ConvertChessPositionInfoToBossMap); board rows 9–12 →
//     boss rows 2–5, sim/constants BOSS_ROW_OFFSET). `bossFieldPlacement` gives that mapping for UIs / tools.
//   * Shared boss HP pool (DESIGN §20.10, §25.13.4, gamedata.js bossPoolShareOf): one pool shared by every boss field
//     (official tip "所有人将一起对敌方领袖造成伤害"; notice 5114's "敌方领袖的总生命值不变" is about the mirrored copies of
//     a pair field sharing it) = bloodPoint[difficulty] × the players alive when the fight starts (bots and AI 托管 seats
//     count, eliminated and departed seats do not; solo × 1; at most 4, or the seats a Grand Alliance room started
//     with — bossPoolSeats) — the owner's decision of 2026-10-06, adopting PR #209 by
//     @qingjingshenghuo, which replaces the fixed pool of 「保持固定血量」 (config bossHpScale perPlayer false / solo 0.25
//     restores it); × the tuning bossHpMul when data/tuning.json still has one (docs/BALANCE.md); bosses are never scaled
//     by enemyScale and their parts / escorts keep their own HP.
//   * Overtime: REAL seconds. Without AI teammates (solo bots included), drain starts at the visible 120 s deadline;
//     teams with AI teammates retain the official bossTurnHpReduceTime grace to 150 s (history §29.1, maintainer
//     decision). The team loses bossOvertimeDrainPerSec (1) LP per real second (gamedata.js bossOvertimeDue);
//     m.public.deadline = the 120 s countdown, m.public.overtimeAt = the
//     drain start. Minion / boss leaks cost their `lpr`; team LP 0 ⇒ defeat (all fields force-ended; PRTS 卫戍协议：盟约 下半
//     "…使目标生命值扣除至0，则无视倒计时直接失败"); pool 0 ⇒ victory. The first of the two the server registers decides
//     (Match._finalEnding): a report that arrives after the team LP ran out credits nothing (user playtest #6 item 5).
//   * Pool HP is a float that never keeps float dust: the hit that would leave less than BOSS_POOL_MIN_HP (1) takes the
//     rest, so the pool is 0 or ≥ 1 and a leader shown at 0 HP is down (sim/constants.js; the browser's LocalBossPool
//     follows the same rule, server/sim/spec.js). Before, the per-player crediting of a report could leave 3.6e-12 that
//     the browser could never deal (user playtest #6 item 5).
//   * No IN_BATTLE layer gains (flags.layerGainsEnabled = false).
//   * BOSS_HIT tickers (BOSS_HIT_STEPS 20 / 50 / 80 %): a player's damage to the round's pool (SharedBossPool.byPlayer)
//     over its size, each threshold once per boss round — the Hidden Core never counts the Final Assault's damage
//     (player report after 0.1.0: "隐藏boss还没打就出了造成50%伤害播报").
//   * Hidden Core eligibility (after an R14 win): difficulty in hiddenCore.difficulties, the mode has a hidden round,
//     Σ activated layers of the alive players measured at the end of the boss round's prep > threshold (solo 350 /
//     co-op 1200) and team LP > minTeamLpExclusive (1, so at least 2 left: PRTS's user-contributed 「剩余生命值 > 1」,
//     which the community's measurement 路标月报#2 matches — GitHub #645).

import { BOSS_ROW_OFFSET, COLS, BOSS_POOL_MIN_HP } from '../sim/constants.js';
import { mirrorDir, normDir } from '../sim/dir.js';
import { bossPoolShareOf } from './gamedata.js';
import { CC } from '../../shared/ruleData.js';
import { BossRiskState } from '../sim/bossRisk.js';
import { scaleCount, SQUAD_SEATS } from '../../shared/largeRoom.js';

/**
 * BOSS_HIT ticker thresholds (activity_table autoChessData.broadcastList comment_boss_hit_1..3, paramList 0.2 / 0.5 /
 * 0.8: "{0}博士对敌方领袖造成的伤害超过20%!"): a player's damage to the current leader's pool over that pool
 * (SharedBossPool.byPlayer — one pool per boss round, so the Final Assault and the Hidden Core count apart).
 */
export const BOSS_HIT_STEPS = [0.2, 0.5, 0.8];

/**
 * Where a board piece (board row / col / dir) stands on a boss field for side 'L' | 'R' — the same mapping as the
 * sim (Battle.mapTile / mapDir): rows 9–12 → 2–5; the right side mirrored col c → 20 − c, RIGHT ↔ LEFT.
 * @returns {{ row: number, col: number, dir: 'UP'|'RIGHT'|'DOWN'|'LEFT' }}
 */
export function bossFieldPlacement(side, row, col, dir = 'RIGHT') {
  const d = normDir(dir);
  const r = row >= 7 ? row + BOSS_ROW_OFFSET : row;
  return side === 'R' ? { row: r, col: COLS - 1 - col, dir: mirrorDir(d) } : { row: r, col, dir: d };
}

/**
 * The seed salt of a boss round's pairing draw: the Final Assault's 'boss-pairs' (unchanged since 0.2.5), the Hidden
 * Core its own `boss-pairs:<round>` — it draws pairs and sides anew (GitHub #845, DESIGN §35.27).
 */
export function bossPairSalt(gd, round) {
  return round === gd.hiddenRound && round !== gd.bossRound ? `boss-pairs:${round}` : 'boss-pairs';
}

/** Seeded pairing; `previous` carries player-id pairs from a round's plan through its prep and combat. */
export function pairPlayers(alive, rng, previous = null) {
  const sorted = alive.slice().sort((a, b) => a.seat - b.seat);
  const groups = [];
  let singles;
  if (Array.isArray(previous)) {
    const remaining = new Map(sorted.map(p => [p.playerId, p]));
    singles = [];
    for (const ids of previous) {
      const group = [];
      for (const id of ids) if (remaining.has(id)) { group.push(remaining.get(id)); remaining.delete(id); }
      if (group.length === 2) groups.push(group); else singles.push(...group);
    }
    singles.push(...remaining.values());
  } else singles = sorted.length > 1 ? rng.shuffle(sorted) : sorted;
  for (let i = 0; i < singles.length; i += 2) groups.push(singles.slice(i, i + 2));
  return groups;
}

/**
 * (fork) Seats a Grand Alliance room started with (shared/largeRoom.js roomScaleFor: players ÷ 4 above 4), the cap of the
 * players a leader pool counts; undefined for every other room (the cap stays config aliveFull). Every caller of
 * bossPoolHp for a match passes it, so the server's pool, the audit, the AI digest and the bots' rehearsal agree.
 * @param {{ roomScale?: number }|null|undefined} m the match
 * @returns {number|undefined}
 */
export const bossPoolSeats = (m) => (m && m.roomScale > 1 ? Math.round(SQUAD_SEATS * m.roomScale) : undefined);

/**
 * Shared boss HP for a boss id with `aliveCount` alive players (GameData.bossPoolShare / bossPoolShareOf; omitted ⇒ a full
 * team); `seats` (bossPoolSeats) lifts the aliveFull cap in a Grand Alliance room. (fork) `rules`: the lobby rules (SPA-CC
 * ccBoss); `patriotSkipped`: ccPatriot Undying 1.
 */
export function bossPoolHp(gd, bossId, aliveCount, rules = null, { patriotSkipped = false, seats } = {}) {
  const boss = gd.boss(bossId);
  const diff = gd.difficulty;
  let base = boss && boss.bloodPoint && Number.isFinite(boss.bloodPoint[diff]) ? boss.bloodPoint[diff] : null;
  if (base == null && boss && boss.bloodPoint) base = Object.values(boss.bloodPoint).find((v) => Number.isFinite(v)) ?? null;
  if (base == null) base = 500000;
  const tune = typeof gd.bossHpMul === 'function' ? gd.bossHpMul(bossId) : 1;
  // SPA-CC ccBoss (shared/rules.js): the final bosses' pool +50 / 150 / 400 % (the Hidden Core's too)
  // and ccPatriot Undying 1: nobody took the round-9 Patriot → +200 %
  const risk = 1 + (CC.bossHp[rules?.ccBoss || 0] || 0) + (patriotSkipped ? CC.patriot.skipHp : 0);
  const share = typeof gd.bossPoolShare === 'function' ? gd.bossPoolShare(aliveCount, seats)
    : bossPoolShareOf(gd.mode && gd.mode.bossHpScale, gd.config && gd.config.bossHpScale, !!gd.isSolo, aliveCount, seats);
  return Math.max(1, Math.round(base * share * tune * risk));
}

/**
 * The one HP pool every boss field damages. `damage(playerId, amount)` is called by the sim (server-run fields) and by
 * Match._creditBoss (client reports, per player); the hit that would leave less than BOSS_POOL_MIN_HP takes the rest.
 */
export class SharedBossPool {
  /**
   * @param {number} hp
   * @param {{ onHit?: Function|null, risk?: object|null, onRisk?: ((changes: string[]) => void)|null }} [o] `risk`: the
   *   boss-pool Risk tags (server/sim/bossRisk.js bossRiskConfig; null = none); `onRisk` hears what they changed
   */
  constructor(hp, { onHit = null, risk = null, onRisk = null } = {}) {
    this.maxHp = Math.max(1, hp);
    this.hp = this.maxHp;
    /** playerId → damage dealt to this pool (this boss round only; the BOSS_HIT tickers' share) */
    this.byPlayer = new Map();
    this.onHit = onHit;
    this.risk = risk ? new BossRiskState(risk, this.maxHp) : null;
    this.onRisk = onRisk;
  }

  /** @param {string} [type] the damage type ('phys' / 'arts' / …; the Risk tags count Arts and Physical) */
  damage(playerId, amount, type) {
    let a = Number(amount);
    if (!Number.isFinite(a) || a <= 0 || this.hp <= 0) return 0;
    if (this.risk) {
      a = this.risk.limit(this.hp, a);
      if (!(a > 0)) return 0;
    }
    const dealt = this.hp - a < BOSS_POOL_MIN_HP ? this.hp : a;
    this.hp -= dealt; // exactly 0 when the rest is taken (x − x): no float dust
    if (playerId != null) this.byPlayer.set(playerId, (this.byPlayer.get(playerId) || 0) + dealt);
    if (this.onHit) {
      try { this.onHit(playerId, dealt); } catch { /* reported by the caller */ }
    }
    if (this.risk) this._riskChanged(this.risk.after(this.hp, type, dealt));
    return dealt;
  }

  /** A client field's cumulative Arts / Physical damage to the pool (b.progress bossArts / bossPhys). */
  noteTyped(fieldId, arts, phys) { if (this.risk) this._riskChanged(this.risk.note(fieldId, arts, phys)); }

  /** Whether field `fieldId` holds the pool (United 2: a Degenbrecher alive there). */
  setHold(fieldId, on) { if (this.risk && this.risk.hold(fieldId, !!on)) this._riskChanged(['hold']); }

  /**
   * A field's cumulative damage to its Delegation Degenbrecher (the linked HP bar: bossRisk.js). No onRisk: the next
   * b.pool carries it (b.progress reports call _broadcastPool), and server-run fields read riskView() directly.
   */
  noteDegen(fieldId, dealt, gate) { if (this.risk) this.risk.noteDegen(fieldId, dealt, gate); }

  /** The lockout's invulnerability ended (the match's timer). */
  releaseLock() { if (this.risk && this.risk.inv) { this.risk.release(); this._riskChanged(['release']); } }

  /** The view the fields apply (null without boss-pool Risk tags). */
  riskView() { return this.risk ? this.risk.view() : null; }

  _riskChanged(changes) {
    if (!changes.length || !this.onRisk) return;
    try { this.onRisk(changes); } catch { /* reported by the caller */ }
  }
}

/**
 * Hidden-core eligibility.
 * @param {import('./gamedata.js').GameData} gd
 * @param {{ layerSum: number, teamLp: number, scale?: number }} s scale: (fork) a large room's threshold multiplier
 */
export function hiddenEligible(gd, { layerSum, teamLp, scale = 1 }) {
  const hc = gd.hiddenCore;
  if (!gd.hiddenRound || !hc.difficulties.includes(gd.difficulty)) return false;
  const threshold = scaleCount(gd.isSolo ? hc.single : hc.multi, scale);
  return layerSum > threshold && teamLp > hc.minTeamLpExclusive;
}

/**
 * A boss field the server takes over mid-fight (its client left, DESIGN §14) re-simulates its spec from t = 0. The
 * damage its client already reported (`acked`, cumulative, per player in `ackedBy`) is in the shared pool, so this
 * wrapper credits the real pool only with what the re-simulation deals beyond it. Reads (hp, maxHp) go to the pool.
 */
export class CreditPool {
  /**
   * @param {SharedBossPool} pool
   * @param {{ acked?: number, ackedBy?: Record<string, number>, onCredit?: (playerId: string|null, amount: number) => void }} [o]
   */
  constructor(pool, { acked = 0, ackedBy = {}, onCredit = null } = {}) {
    this.pool = pool;
    this.acked = Math.max(0, Number(acked) || 0);
    this.ackedBy = { ...ackedBy };
    this.cum = 0;
    this.onCredit = onCredit;
  }

  get hp() { return this.pool.hp; }
  set hp(v) { /* the sim's fallback path writes hp only when damage() threw; the real pool is never written here */ void v; }
  get maxHp() { return this.pool.maxHp; }
  riskView() { return this.pool.riskView ? this.pool.riskView() : null; }
  setHold(fieldId, on) { if (this.pool.setHold) this.pool.setHold(fieldId, on); }
  noteDegen(fieldId, dealt, gate) { if (this.pool.noteDegen) this.pool.noteDegen(fieldId, dealt, gate); }

  damage(playerId, amount, type) {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return 0;
    const before = this.cum;
    this.cum += a;
    const credit = Math.max(0, this.cum - Math.max(before, this.acked));
    if (credit <= 0) return 0;
    const dealt = this.pool.damage(playerId, credit, type);
    if (dealt > 0 && this.onCredit) { try { this.onCredit(playerId, dealt); } catch { /* reported by the caller */ } }
    return dealt;
  }
}
