// server/sim/bossRisk.js — the SPA-CC Risk tags that act on the final boss's shared HP pool (shared/rules.js; numbers:
// shared/ruleData.js CC). The pool is shared by every player's field, so these are decided where the pool lives — the
// server (server/match/finalAssault.js SharedBossPool) — and every field applies the outcome (server/sim/content/risk.js):
//   ccOzArts     once CC.ozArts.share of the pool has been taken as Arts damage (all fields together): +res RES
//   ccOzPhys     the same for Physical damage: +def DEF
//   ccLockout    every CC.lockout.every[level] of the pool lost: invulnerable for CC.lockout.seconds game seconds. The pool
//                stops at each step (a hard gate: a big hit does not skip a step) until the invulnerability ends
//   ccDelegation United 2: the final boss cannot die while a Degenbrecher of the sub-wave lives on any field (the pool
//                stops at 1 HP; `holds` = the fields that report one alive). Every United level: the Degenbrechers of all
//                the boss fields share one HP bar — each field reports the HP it took from its own (`degen`, cumulative,
//                both of her lives) and applies the others' (server/sim/content/risk.js installDegenLink)
// The view the fields get (`view()`; b.pool `risk`, the boss spec's `risk`): { res, def, inv, floor, hold, degen? } —
// `degen`: fieldId → that field's cumulative damage to its Degenbrecher (Delegation only); `floor` is
// the HP the pool cannot go below right now (the next gate, or 1 while held), so a field clamps its own damage to it
// before the server has heard of it.

import { CC } from '../../shared/ruleData.js';
import { tagLevel, tagHas } from '../../shared/rules.js';

/** The boss-pool Risk config of `rules`, or null when none of these tags is on. */
export function bossRiskConfig(rules) {
  if (!rules) return null;
  const every = CC.lockout.every[tagLevel(rules, 'ccLockout')] || 0;
  const cfg = {
    arts: tagLevel(rules, 'ccOzArts') > 0 ? CC.ozArts : null,
    phys: tagLevel(rules, 'ccOzPhys') > 0 ? CC.ozPhys : null,
    every,
    hold: tagHas(rules, 'ccDelegation', 'united2'),
    degen: tagHas(rules, 'ccDelegation', 'united1'),
  };
  return cfg.arts || cfg.phys || cfg.every > 0 || cfg.hold || cfg.degen ? cfg : null;
}

/** The view a field starts from (before the server's first b.pool). */
export function initialRiskView(cfg, maxHp) {
  if (!cfg) return null;
  const v = { res: false, def: false, inv: false, hold: false, floor: cfg.every > 0 ? gateHp(maxHp, cfg.every, 1) : 0 };
  if (cfg.degen) { v.degen = {}; v.degenGate = {}; }
  return v;
}

/** The pool HP of lockout step `k` (1 = the first), or 0 when there is none. */
function gateHp(maxHp, every, k) {
  const h = Math.round(maxHp * (1 - k * every) * 1000) / 1000; // no float dust (1000 × 0.32 = 319.99…)
  return h > 1e-6 ? h : 0;
}

/** The server's state of the boss-pool Risk tags (one per pool). */
export class BossRiskState {
  constructor(cfg, maxHp) {
    this.cfg = cfg;
    this.maxHp = maxHp;
    this.res = false;
    this.def = false;
    this.inv = false;
    /** the next lockout step (1 = the first) */
    this.step = 1;
    /** field ids reporting a living Degenbrecher (United 2) */
    this.holds = new Set();
    /** Arts / Physical damage dealt to the pool by server-run battles */
    this.direct = { arts: 0, phys: 0 };
    /** fieldId → the latest { arts, phys } its client reported (cumulative) */
    this.reported = new Map();
    /** fieldId → the HP its battle took from its Degenbrecher so far (cumulative; the linked HP bar) */
    this.degen = new Map();
    /** fieldId → the gate steps (United 3) its Degenbrecher has finished casting; one field's cast opens every field's */
    this.degenGate = new Map();
  }

  get gate() { return this.cfg.every > 0 ? gateHp(this.maxHp, this.cfg.every, this.step) : 0; }

  get floor() { return Math.max(this.gate, this.cfg.hold && this.holds.size ? 1 : 0); }

  /** How much of `amount` the pool at `hp` takes now (none while invulnerable; never below the floor). */
  limit(hp, amount) {
    if (this.inv) return 0;
    return Math.max(0, Math.min(amount, hp - this.floor));
  }

  /**
   * After the pool took damage: the changes it caused, as a list of 'res' | 'def' | 'inv' (the caller starts the
   * invulnerability's timer and broadcasts).
   */
  after(hp, type, dealt) {
    const out = [];
    if ((type === 'arts' || type === 'phys') && dealt > 0) this.direct[type] += dealt;
    this._shares(out);
    const g = this.gate;
    if (!this.inv && g > 0 && hp <= g + 1e-6) { this.inv = true; out.push('inv'); }
    return out;
  }

  /** A client's cumulative Arts / Physical damage to the pool (b.progress); returns the changes like after(). */
  note(fieldId, arts, phys) {
    const prev = this.reported.get(fieldId) || { arts: 0, phys: 0 };
    const a = Number(arts), p = Number(phys);
    this.reported.set(fieldId, {
      arts: Number.isFinite(a) ? Math.max(prev.arts, Math.min(a, this.maxHp)) : prev.arts,
      phys: Number.isFinite(p) ? Math.max(prev.phys, Math.min(p, this.maxHp)) : prev.phys,
    });
    const out = [];
    this._shares(out);
    return out;
  }

  /** Whether a field holds the pool (a Degenbrecher alive there); returns true when the view changed. */
  hold(fieldId, on) {
    if (!this.cfg.hold || fieldId == null) return false;
    const had = this.holds.size > 0;
    if (on) this.holds.add(fieldId); else this.holds.delete(fieldId);
    return had !== this.holds.size > 0;
  }

  /**
   * A field's cumulative damage to its Degenbrecher and the gate steps she has finished (United 3); neither is ever
   * lowered (a takeover's re-simulation starts from 0). Returns whether the view changed.
   */
  noteDegen(fieldId, dealt, gate = 0) {
    if (!this.cfg.degen || fieldId == null) return false;
    let changed = false;
    const d = Number(dealt), g = Number(gate);
    if (Number.isFinite(d) && d > (this.degen.get(fieldId) || 0)) { this.degen.set(fieldId, d); changed = true; }
    if (Number.isFinite(g) && g > (this.degenGate.get(fieldId) || 0)) { this.degenGate.set(fieldId, Math.floor(g)); changed = true; }
    return changed;
  }

  /** The invulnerability ended: the next step's gate. */
  release() {
    if (!this.inv) return;
    this.inv = false;
    this.step++;
  }

  total(type) {
    let n = this.direct[type];
    for (const r of this.reported.values()) n += r[type];
    return n;
  }

  _shares(out) {
    const { arts, phys } = this.cfg;
    if (arts && !this.res && this.total('arts') >= arts.share * this.maxHp) { this.res = true; out.push('res'); }
    if (phys && !this.def && this.total('phys') >= phys.share * this.maxHp) { this.def = true; out.push('def'); }
  }

  view() {
    const v = { res: this.res, def: this.def, inv: this.inv, hold: this.cfg.hold && this.holds.size > 0, floor: this.floor };
    if (this.cfg.degen) { v.degen = Object.fromEntries(this.degen); v.degenGate = Object.fromEntries(this.degenGate); }
    return v;
  }
}
