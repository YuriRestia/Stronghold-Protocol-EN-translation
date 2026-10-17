// server/sim/notes.js — free-flight notes (丰川祥子's 颂乐音符; kits/ops/op-oblvns.js), the official note projectiles of her
// client data: battle/prefabs/[uc]projectiles.ab `projectile_chr_oblvns*` (read from the EN client 2026-10-15, owner's
// decision: the prefab wins where PRTS differs) and PRTS 丰川祥子 备注 (the state machine, the 1 s off-range rule).
//
// A note is no homing projectile (projectiles.js): it flies on its own and picks its targets.
//   【自由移动】 wander: from its launch direction, either straight (speed → finalSpeed at accel/s) or on an 扩张正弦方向
//      path (PRTS 特殊机制: origin = where it entered the state, x along the heading at `sx` tiles/s, y = ±sin(x) with the
//      n-th period's amplitude amp × n, n ≤ 3, the sign 50/50 — the prefab `_moveType` 6, `count` 3, `speed_scale` = amp);
//   every `tick` s (Body `_tickTime`) it updates: without a trace target, while it is over its owner's attack range (own
//      + lent tiles) it takes her target (_ownerPick: the enemy she blocks, else one in her own range, else one in her
//      lent range — ownerTarget, owner 2026-10-16; outside it, owner 2026-10-17: its own pick), else the nearest selectable enemy
//      (S3: the highest RES / DEF first, owner 2026-10-17) within `radius` (Selector CircleCollider2D r) of itself (PRTS); with one, once `minFree` s of wander have passed (Body
//      `_switchToTracingTime`, on EVERY entry: owner 2026-10-16, the 血狼破军 flowchart — PRTS only names the first), it
//      switches to
//   【追踪移动】 trace: speed `trace` toward the target, its velocity turned by `turn` of the way per frame (PRTS 弹道
//      转向速度: d ← d × (1 − t) + to-target × t, the velocity trace × d; the prefab `_turnSpeed` × 1/30 s). d is NOT
//      renormalised (PRTS's worked example: speed 10 → 9.52 after one turn): a hard turn brakes the note, a target
//      behind it stops and reverses it (owner 2026-10-16: kept at full speed it orbited a target it could not reach,
//      and one dead behind never turned at all); a target lost (dead, unselectable) ⇒
//      back to wander with the current heading (a fresh sine origin, the minimum free time again);
//   hit: when the note reaches its target's centre (≤ HIT_REACH of its position, not its hit rectangle's edge: a huge
//      boss is struck at its middle, like a projectile; [ASSUMED]: the prefab only says `_alwaysHitTraceTargetWhenReached`) the owner's `onHit(note, enemy)` runs once, then — with a `passby` state
//      (piano: the prefab's StriaghtFinal 3.0 for 0.5 s with the 0.8 collider, `_hitPassbyTime` from passby_delay) — it
//   【已命中】 flies straight on and strikes every other enemy its collider touches once; else it is gone.
// It is gone after LIFETIME (prefab `_lifeTime` 10 s), when it has had no trace target for more than OFF_RANGE_GRACE s
// outside its owner's attack range (PRTS "音符位于自身攻击范围外时，若连续1s以上不存在追踪目标则消失"). Its owner
// leaving the field does NOT clear it (owner 2026-10-16, against PRTS "自身退场时，清除所有不处于【追踪移动】状态的音符"):
// it flies on, the off-range rule reading the range she had when she left [ASSUMED] (ownerLeft).
// The sim moves it every tick (TICK); positions are field tiles (x = column, y = row), headings unit vectors.
// Deterministic: detmath only, the battle's rng for the 50/50 sine sign; notes update in creation order.
// Client events (cosmetic): ['fx', 'note', x, y, { id, owner, look, on: 'born' | 'hit', tgt? }] at a note's birth and
// at each strike — the renderer's hit burst (render/fx/notes.js) and the official born / hit sounds (audio.js).

import { hypot, sin, roundHalfEven } from './detmath.js';
import { bodyDist } from './body.js';
import { canTargetEnemy, sortEnemyTargets } from './targeting.js';
import { TICK, COLS } from './constants.js';

/**
 * A note owner's target (owner 2026-10-16, over PRTS's "距离音符自身最近" — with two of her, the back one's notes flew to
 * the front one's enemies): the first non-empty group of (1) the enemies she blocks, (2) those in her own attack range
 * (her current grid: the skill's while one runs), (3) those only in the range another member lends her (talent 2,
 * `extraRangeKeys`); within the group the highest `prefer` stat ('res' / 'def': S3's physical / arts notes), then her
 * usual order (sortEnemyTargets: taunt, nearest the blue box, earliest spawn). Null: none.
 * @param {any} b battle @param {any} o owner @param {'res'|'def'|null} [prefer]
 */
export function ownerTarget(b, o, prefer = null) {
  if (!o || !o.alive || !o.deployed) return null;
  const extra = o.extraRangeKeys ? new Set(o.extraRangeKeys) : null;
  const own = extra ? (o.rangeKeys || []).filter((k) => !extra.has(k)) : (o.rangeKeys || []);
  const groups = [
    () => b.blockedTargets(o, PROFILE),
    () => b.enemiesInKeys(own, o, PROFILE),
    () => (extra ? b.enemiesInKeys(o.extraRangeKeys, o, PROFILE) : []),
  ];
  for (const g of groups) {
    const cands = g();
    if (!cands.length) continue;
    sortEnemyTargets(b, o, cands, null);
    if (!prefer) return cands[0];
    let best = cands[0];
    for (const e of cands) if (e.s[prefer] > best.s[prefer] + 1e-9) best = e;   // ties keep the usual order
    return best;
  }
  return null;
}

/** Prefab `_lifeTime` (lifeTimeType 2: seconds). */
export const NOTE_LIFETIME = 10;
/** PRTS 备注: "若连续1s以上不存在追踪目标则消失" outside the owner's attack range. */
export const OFF_RANGE_GRACE = 1;
/** [ASSUMED] a tracing note strikes its target once it is this close to the target's centre (tiles). */
export const HIT_REACH = 0.1;
const TWO_PI = 6.283185307179586;
/** 扩张正弦方向: the amplitude grows over the first three periods ("1≤n≤3"), then stays. */
const SINE_PERIODS = 3;

let seq = 0;

/**
 * A note's motion parameters (one per projectile prefab). Speeds in tiles/s, times in s, `turn` per frame (1/30 s).
 * @typedef {{ tick: number, minFree: number, radius: number,
 *   free: { kind: 'straight', speed: number, accel?: number, max?: number } | { kind: 'sine', sx: number, amp: number },
 *   trace: number, turn: number, passby?: { speed: number, time: number, radius: number } | null }} NoteKind
 */

export class NoteSystem {
  constructor(battle) {
    this.battle = battle;
    /** @type {object[]} */
    this.list = [];
  }

  /**
   * Launch a note. `kind` its NoteKind; `x, y` the start; `dx, dy` the launch heading; `target` an enemy to trace
   * from the start (the attack's target) or null; `onHit(note, enemy)` its damage; `data` the owner's payload (the
   * snapshot reads `look`, `idx`).
   */
  add({ owner, kind, x, y, dx, dy, target = null, onHit, data = null }) {
    const d = hypot(dx, dy) || 1;
    const n = {
      id: ++seq, owner, kind, x, y, hx: dx / d, hy: dy / d,
      state: 'free', age: 0, freeT: 0, tickT: 0, range: null,
      target: target && target.alive ? target : null, tseq: target ? target.deploySeq : 0,
      speed: kind.free.kind === 'straight' ? kind.free.speed : kind.free.sx,
      vx: 0, vy: 0, sine: null, offRange: 0, hit: new Set(), passT: 0, onHit: onHit ?? null, data, dead: false,
    };
    this._enterFree(n);
    this.list.push(n);
    this._noteEvent(n, 'born', null);
    return n;
  }

  /** Notes of `owner` still flying (talent 1 counts them). */
  countOf(owner) {
    let k = 0;
    for (const n of this.list) if (!n.dead && n.owner === owner) k++;
    return k;
  }

  /**
   * The owner left the field: its notes fly on under the normal rules (owner 2026-10-16, against PRTS's "清除所有不处于
   * 【追踪移动】状态的音符": the owner has seen them outlive her) — the off-range rule now reads the range tiles she had
   * when she left ([ASSUMED], owner's call). A hit still deals its damage and still fills the Fever gauge.
   */
  ownerLeft(owner) {
    const keys = owner && (owner.rangeKeySet || (owner.rangeKeys ? new Set(owner.rangeKeys) : null));
    const frozen = keys ? new Set(keys) : new Set();
    for (const n of this.list) if (n.owner === owner) n.range = frozen;
  }

  clear() { this.list = []; this._pick = null; }

  _enterFree(n) {
    n.state = 'free';
    // every entry waits the minimum free time again (owner 2026-10-16, the 血狼破军 flowchart: free → minimum free
    // time → target? → lock; PRTS only names the first entry)
    n.freeT = 0;
    const f = n.kind.free;
    if (f.kind === 'sine') {
      const sign = this.battle.rng() < 0.5 ? 1 : -1;
      n.sine = { ox: n.x, oy: n.y, ux: n.hx, uy: n.hy, s: 0, sign };
    } else n.sine = null;
  }

  _valid(n, e) {
    return !!e && e.alive && e.deployed && !e.hidden && e.deploySeq === n.tseq && canTargetEnemy(n.owner, e, PROFILE);
  }

  /**
   * The owner's own target for a note looking for one (ownerTarget, by the note's `data.prefer`); null when she is off
   * the field or has none — the note then picks the nearest one around itself (PRTS). Cached per owner and stat per
   * tick (many notes ask at once).
   */
  _ownerPick(n) {
    const o = n.owner, b = this.battle;
    if (!o || !o.alive || !o.deployed) return null;
    const prefer = n.data?.prefer ?? null;
    const c = this._pick || (this._pick = new Map());
    const key = prefer ? `${o.id}:${prefer}` : o.id;
    const hit = c.get(key);
    if (hit && hit.t === b.time) return hit.e && hit.e.alive ? hit.e : null;
    const e = ownerTarget(b, o, prefer);
    if (c.size > 64) c.clear();
    c.set(key, { t: b.time, e });
    return e;
  }

  /** Is the note over its owner's attack range? (her current tiles, own + lent; the frozen ones once she has left) */
  _inside(n) {
    const o = n.owner;
    return n.range ? n.range.has(roundHalfEven(n.y) * COLS + roundHalfEven(n.x)) : !!(o && o.alive && o.deployed && inRange(o, n.x, n.y));
  }

  /**
   * The note's own pick: a selectable enemy whose body is within the note's radius — the highest `prefer` stat first
   * (S3's 'res' / 'def', owner 2026-10-17: kept outside her range too), then the nearest, then the earlier spawn.
   */
  _nearest(n, r, prefer = null, skip = null) {
    let best = null, bd = Infinity, bs = -Infinity;
    for (const e of this.battle.enemies) {
      if (skip && skip.has(e) || !canTargetEnemy(n.owner, e, PROFILE)) continue;
      const d = bodyDist(e, n.x, n.y);
      if (d > r + 1e-9) continue;
      const st = prefer ? e.s[prefer] : 0;
      if (st > bs + 1e-9 || (Math.abs(st - bs) <= 1e-9 &&
        (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && e.spawnSeq < best.spawnSeq)))) { bs = st; bd = d; best = e; }
    }
    return best;
  }

  update(dt) {
    if (!this.list.length) return;
    for (const n of this.list) {
      if (n.dead) continue;
      n.age += dt;
      if (n.age >= NOTE_LIFETIME - 1e-9) { n.dead = true; continue; }
      if (n.state === 'passby') { this._passby(n, dt); continue; }
      if (n.target && !this._valid(n, n.target)) {
        n.target = null;
        if (n.state === 'trace') this._enterFree(n);
      }
      // the state update, every `tick` s (the first one at launch)
      n.tickT -= dt;
      if (n.tickT <= 1e-9) {
        n.tickT += n.kind.tick;
        if (n.state === 'free') {
          if (!n.target) {
            // over her range: her target first (owner 2026-10-17); outside it the note picks for itself
            const e = (this._inside(n) ? this._ownerPick(n) : null) || this._nearest(n, n.kind.radius, n.data?.prefer ?? null);
            if (e) { n.target = e; n.tseq = e.deploySeq; }
          }
          if (n.target && n.freeT >= n.kind.minFree - 1e-9) { n.state = 'trace'; n.vx = n.hx; n.vy = n.hy; }
        }
      }
      if (n.state === 'free') this._moveFree(n, dt);
      else this._moveTrace(n, dt);
      if (n.dead) continue;
      // the off-range rule: no trace target, outside the owner's attack range, for more than a second
      if (!n.target && !this._inside(n)) {
        n.offRange += dt;
        if (n.offRange > OFF_RANGE_GRACE + 1e-9) n.dead = true;
      } else n.offRange = 0;
    }
    if (this.list.some((n) => n.dead)) this.list = this.list.filter((n) => !n.dead);
  }

  _moveFree(n, dt) {
    n.freeT += dt;
    const f = n.kind.free;
    if (f.kind === 'straight') {
      if (f.accel) n.speed = Math.min(f.max ?? n.speed, n.speed + f.accel * dt);
      n.x += n.hx * n.speed * dt; n.y += n.hy * n.speed * dt;
      return;
    }
    const s = n.sine;
    s.s += f.sx * dt;
    const period = Math.min(SINE_PERIODS, Math.floor(s.s / TWO_PI) + 1);
    const lat = s.sign * f.amp * period * sin(s.s);
    // the heading is the path's tangent (the renderer draws it): d/ds of (s, lat)
    const nx = s.ox + s.ux * s.s - s.uy * lat, ny = s.oy + s.uy * s.s + s.ux * lat;
    const vx = nx - n.x, vy = ny - n.y, v = hypot(vx, vy);
    if (v > 1e-12) { n.hx = vx / v; n.hy = vy / v; }
    n.x = nx; n.y = ny;
  }

  _moveTrace(n, dt) {
    const e = n.target;
    const tx = e.x - n.x, ty = e.y - n.y, td = hypot(tx, ty) || 1;
    // 转向速度 per frame (1/30 s; a tick is one frame here) on the un-normalised direction d (header)
    const t = Math.min(1, n.kind.turn * (dt / TICK));
    n.vx = n.vx * (1 - t) + (tx / td) * t; n.vy = n.vy * (1 - t) + (ty / td) * t;
    const v = hypot(n.vx, n.vy);
    if (v > 1e-9) { n.hx = n.vx / v; n.hy = n.vy / v; }   // the heading drawn (and kept when it falls back to free)
    const step = n.kind.trace * v * dt;
    n.x += n.vx * n.kind.trace * dt; n.y += n.vy * n.kind.trace * dt;
    // the target's centre (like a homing projectile's arrival), not its hit rectangle's edge: a huge boss is struck
    // at its middle
    if (hypot(e.x - n.x, e.y - n.y) <= HIT_REACH + 1e-9 || td <= step + 1e-9) this._strike(n, e);
  }

  _noteEvent(n, on, e) {
    const b = this.battle;
    if (!b.recordEvents) return;
    b.fx('note', { x: n.x, y: n.y, id: n.id, owner: n.owner ? n.owner.id : null, look: n.data?.look ?? '', on, ...(e ? { tgt: e.id } : null) });
  }

  _strike(n, e) {
    n.hit.add(e);
    this._noteEvent(n, 'hit', e);
    if (n.onHit) this.battle._safe(() => n.onHit(n, e), 'note.onHit', n.owner);
    const p = n.kind.passby;
    if (p && !n.dead) { n.state = 'passby'; n.target = null; n.passT = p.time; n.speed = p.speed; }
    else n.dead = true;
  }

  /** 【已命中】: straight on, striking each other enemy the collider touches once. */
  _passby(n, dt) {
    const p = n.kind.passby;
    n.passT -= dt;
    n.x += n.hx * p.speed * dt; n.y += n.hy * p.speed * dt;
    for (const e of this.battle.enemies) {
      if (n.hit.has(e) || !canTargetEnemy(n.owner, e, PROFILE)) continue;
      if (bodyDist(e, n.x, n.y) > p.radius + 1e-9) continue;
      n.hit.add(e);
      this._noteEvent(n, 'hit', e);
      if (n.onHit) this.battle._safe(() => n.onHit(n, e), 'note.onHit', n.owner);
    }
    if (n.passT <= 1e-9) n.dead = true;
  }
}

/** The notes select like a ranged attack that hits flyers (lord: canHitFly). */
const PROFILE = Object.freeze({ canHitFly: true });

/** Is (x, y) on one of the unit's current range tiles? (the position rounded half to even, as a body: body.js) */
function inRange(u, x, y) {
  const set = u.rangeKeySet || (u.rangeKeys ? new Set(u.rangeKeys) : null);
  return !!set && set.has(roundHalfEven(y) * COLS + roundHalfEven(x));
}
