// server/sim/notes.js — free-flight notes (丰川祥子's 颂乐音符; kits/ops/op-oblvns.js), the official note projectiles of her
// client data: battle/prefabs/[uc]projectiles.ab `projectile_chr_oblvns*` (read from the EN client 2026-10-15, owner's
// decision: the prefab wins where PRTS differs) and PRTS 丰川祥子 备注 (the state machine, the 1 s off-range rule).
//
// A note is no homing projectile (projectiles.js): it flies on its own and picks its targets.
//   【自由移动】 wander: from its launch direction, either straight (speed → finalSpeed at accel/s) or on an 扩张正弦方向
//      path (PRTS 特殊机制: origin = where it entered the state, x along the heading at `sx` tiles/s, y = ±sin(x) with the
//      n-th period's amplitude amp × n, n ≤ 3, the sign 50/50 — the prefab `_moveType` 6, `count` 3, `speed_scale` = amp);
//   every `tick` s (Body `_tickTime`) it updates: without a trace target it takes the nearest selectable enemy within
//      `radius` (Selector CircleCollider2D r) of itself; with one, once `minFree` s of wander have passed (Body
//      `_switchToTracingTime`, the first entry only), it switches to
//   【追踪移动】 trace: speed `trace` toward the target, its heading turned by `turn` of the way per frame (PRTS 转向速度:
//      dir ← dir × (1 − t) + to-target × t; the prefab `_turnSpeed` × 1/30 s); a target lost (dead, unselectable) ⇒
//      back to wander with the current heading (a fresh sine origin);
//   hit: when the note reaches its target's body (≤ HIT_REACH of its 判定中心, [ASSUMED]: the prefab only says
//      `_alwaysHitTraceTargetWhenReached`) the owner's `onHit(note, enemy)` runs once, then — with a `passby` state
//      (piano: the prefab's StriaghtFinal 3.0 for 0.5 s with the 0.8 collider, `_hitPassbyTime` from passby_delay) — it
//   【已命中】 flies straight on and strikes every other enemy its collider touches once; else it is gone.
// It is gone after LIFETIME (prefab `_lifeTime` 10 s), when it has had no trace target for more than OFF_RANGE_GRACE s
// outside its owner's attack range (PRTS "音符位于自身攻击范围外时，若连续1s以上不存在追踪目标则消失"), and — the
// notes not tracing — when its owner leaves the field (PRTS "自身退场时，清除所有不处于【追踪移动】状态的音符").
// The sim moves it every tick (TICK); positions are field tiles (x = column, y = row), headings unit vectors.
// Deterministic: detmath only, the battle's rng for the 50/50 sine sign; notes update in creation order.

import { hypot, sin, roundHalfEven } from './detmath.js';
import { bodyDist } from './body.js';
import { canTargetEnemy } from './targeting.js';
import { TICK, COLS } from './constants.js';

/** Prefab `_lifeTime` (lifeTimeType 2: seconds). */
export const NOTE_LIFETIME = 10;
/** PRTS 备注: "若连续1s以上不存在追踪目标则消失" outside the owner's attack range. */
export const OFF_RANGE_GRACE = 1;
/** [ASSUMED] a tracing note strikes its target once it is this close to the target's body (tiles). */
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
      state: 'free', age: 0, freeT: 0, firstFree: true, tickT: 0,
      target: target && target.alive ? target : null, tseq: target ? target.deploySeq : 0,
      speed: kind.free.kind === 'straight' ? kind.free.speed : kind.free.sx,
      sine: null, offRange: 0, hit: new Set(), passT: 0, onHit: onHit ?? null, data, dead: false,
    };
    this._enterFree(n);
    this.list.push(n);
    return n;
  }

  /** Notes of `owner` still flying (talent 1 counts them). */
  countOf(owner) {
    let k = 0;
    for (const n of this.list) if (!n.dead && n.owner === owner) k++;
    return k;
  }

  /** The owner left the field: every note of it that is not tracing goes (PRTS 备注). */
  ownerLeft(owner) {
    for (const n of this.list) if (n.owner === owner && n.state !== 'trace') n.dead = true;
  }

  clear() { this.list = []; }

  _enterFree(n) {
    n.state = 'free';
    const f = n.kind.free;
    if (f.kind === 'sine') {
      const sign = this.battle.rng() < 0.5 ? 1 : -1;
      n.sine = { ox: n.x, oy: n.y, ux: n.hx, uy: n.hy, s: 0, sign };
    } else n.sine = null;
  }

  _valid(n, e) {
    return !!e && e.alive && e.deployed && !e.hidden && e.deploySeq === n.tseq && canTargetEnemy(n.owner, e, PROFILE);
  }

  /** The nearest selectable enemy whose body is within the note's radius (ties: the earlier spawn). */
  _nearest(n, r, skip = null) {
    let best = null, bd = Infinity;
    for (const e of this.battle.enemies) {
      if (skip && skip.has(e) || !canTargetEnemy(n.owner, e, PROFILE)) continue;
      const d = bodyDist(e, n.x, n.y);
      if (d > r + 1e-9) continue;
      if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && e.spawnSeq < best.spawnSeq)) { bd = d; best = e; }
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
            const e = this._nearest(n, n.kind.radius);
            if (e) { n.target = e; n.tseq = e.deploySeq; }
          }
          if (n.target && (!n.firstFree || n.freeT >= n.kind.minFree - 1e-9)) { n.state = 'trace'; n.firstFree = false; }
        }
      }
      if (n.state === 'free') this._moveFree(n, dt);
      else this._moveTrace(n, dt);
      if (n.dead) continue;
      // the off-range rule: no trace target, outside the owner's attack range, for more than a second
      const o = n.owner;
      if (!n.target && !(o && o.alive && o.deployed && inRange(o, n.x, n.y))) {
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
    // 转向速度 per frame (1/30 s); a tick is one frame here
    const t = Math.min(1, n.kind.turn * (dt / TICK));
    let hx = n.hx * (1 - t) + (tx / td) * t, hy = n.hy * (1 - t) + (ty / td) * t;
    const h = hypot(hx, hy) || 1;
    n.hx = hx / h; n.hy = hy / h;
    const step = n.kind.trace * dt;
    n.x += n.hx * step; n.y += n.hy * step;
    if (bodyDist(e, n.x, n.y) <= HIT_REACH + 1e-9 || td <= step + 1e-9) this._strike(n, e);
  }

  _strike(n, e) {
    n.hit.add(e);
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
