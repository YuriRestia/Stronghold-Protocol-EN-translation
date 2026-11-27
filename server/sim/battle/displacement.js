// server/sim/battle/displacement.js — Battle methods: displacement of enemies: 受力等级 (force − weight), push (radial /
// directional), pull, the slide they start (momentum and friction, moved frame by frame: _shiftStep), the raw mover
// displace and who can be moved at all.
// Installed on Battle.prototype by server/sim/Battle.js (a method container: never instantiated; `this` is the battle).

import {
  COLS, PUSH_TILES, PUSH_TILES_EFFECT, PULL_WEAK_SHARE, PULL_CRAWL, PULL_ORIGIN, PULL_STOP_RADIUS, PUSH_DIRECTIONAL_MIN_DIST,
  PUSH_UNBALANCE, PULL_UNBALANCE, PULL_UNBALANCE_WEAK, UNBALANCE_MIN, PUSH_MOMENTUM, SHIFT_FRICTION, PULL_TIME_K, TICK,
} from '../constants.js';
import { fin } from './util.js';
import { hypot } from '../detmath.js';

/**
 * Official push distance (tiles) of a 受力等级 (constants.js PUSH_TILES: ≤ −3 → 0, ≥ 3 → the 3 value); `effect` = a 特效
 * push (PRTS 推与拉's 特效 column, PUSH_TILES_EFFECT: 见行者), else the 弹道 column.
 */
export function pushTiles(level, effect = false) {
  const l = Math.round(fin(level, -99));
  if (l <= -3) return 0;
  return (effect ? PUSH_TILES_EFFECT : PUSH_TILES)[Math.min(3, l)];
}

/** Momentum (tiles/s for the mass 1) a push of 受力等级 `level` gives (constants.js PUSH_MOMENTUM: ≤ −3 → 0, ≥ 3 → the 3 value). */
export function pushMomentum(level) {
  const l = Math.round(fin(level, -99));
  return l <= -3 ? 0 : PUSH_MOMENTUM[Math.min(3, l)];
}

/** Sub-step (tiles) of a slide's frame: the passability of the tiles it crosses is checked this often. */
const SHIFT_SUBSTEP = 0.1;
/** At most this many frames of a slide are predicted (a 3.53-tile push is 36). */
const SHIFT_MAX_FRAMES = 300;

/** 失衡 (UNBALANCE) of a push of 受力等级 `level`, game seconds (constants.js PUSH_UNBALANCE: ≤ −3 → 0, ≥ 3 → the 3 value). */
export function pushUnbalance(level) {
  const l = Math.round(fin(level, -99));
  return l <= -3 ? 0 : PUSH_UNBALANCE[Math.min(3, l)];
}

/** 失衡 of a pull of 受力等级 `level`: its force window (PULL_UNBALANCE, 0.5 s below −1), none at ≤ −3 (force 0). */
export function pullUnbalance(level) {
  const l = Math.round(fin(level, -99));
  return l <= -3 ? 0 : l < -1 ? PULL_UNBALANCE_WEAK : PULL_UNBALANCE;
}

export class BattleDisplacement {
  /**
   * 受力等级 of enemy `e` under a push / pull of 力度 `force` (微小力 −1, 小力 0, 中力 1, 较大力 2, 大力 3, 大力+1 4, 特大力 5):
   * force − its current 重量等级 (massLevel incl. 失重) — PRTS 游戏数据基础 §重量公式, 推与拉 (user playtest #6 item 14).
   */
  forceLevel(e, force) {
    return Math.round(fin(force, 0)) - (e && e.s ? e.s.massLevel : 0);
  }

  /**
   * Push enemy `e` with 力度 `force` (PRTS 推与拉 §推力): the official distance of its 受力等级 (constants.js PUSH_TILES:
   * a 中力 push moves a weight-1 enemy 1.7 tiles, a weight-2 one 0.44, weight 3 0.12, weight ≥ 4 not at all). Radial
   * (the default: away from `from`, the pusher's centre — "沿着干员向自身中心点的射线方向"; the client's buff template
   * knockback[relative]: 琳琅诗怀雅 S3, 山 S3, 莫斯提马 S3) or directional (`dir` = the pusher's direction {x, y}; template
   * knockback[dir], Knockback {_useSourceDirection: true, _decreaseForceLevelWhenNotInDirection: 2}: 推击手, 野鬃 S2
   * "往攻击方向"); a directional push on a target more than 45° off `dir` or nearer than 0.25 tile becomes radial with
   * 受力等级 −2 ("特殊修正"), including behind the pusher. The maintainer's 2026-10-19 official recordings (#782,
   * DESIGN §35.10) supersede round 40's Wild Mane-only `keepDir` exception; no other kit used it.
   * `fixed` waives both corrections (圣聆初雪 S1 "朝部署方向": KnockBackWithCharacterDirection,
   * PRTS 备注 "不会因角度过大或距离过近而变化方向与力度"); `fixedAngle` only the angle one (PRTS 见行者 S2 备注 "不会因为角度过大
   * 而改变推动的方向或削减力度" — the < 0.25 tile rule still applies). `inward` = a radial push towards `from` (薄绿 S2's "拖拽", PRTS 备注 "实际为
   * 反方向（指向薄绿方向）的推开"), never nearer than PULL_STOP_RADIUS to its centre [ASSUMED: "至面前"]. `effect` = a 特效
   * push (PRTS 推与拉: one frame less of travel than a 弹道 push — constants.js PUSH_TILES_EFFECT / PUSH_EFFECT_SKILLS).
   * The displace fx keeps the enemy's pre-hit facing by default: official footage shows this for a directional push
   * (野鬃 S2, #418) and a radial push (莫斯提马 S3). [ASSUMED] for other push sources; an explicitly different
   * client action can pass `keepFacing: false`. Pulls use the same display rule; raw displacements remain unmarked.
   * The enemy is not moved at once: it slides with the push's momentum, slowed by friction (GitHub #60; _shiftStart,
   * _shiftStep; momentum adds up over pushes). Returns the tiles it will slide — walls included, for the callers that
   * read them (a wall stop, drag damage).
   */
  push(e, force, { from = null, dir = null, fixed = false, fixedAngle = false, inward = false, effect = false, keepFacing = true } = {}) {
    if (!this._displaceable(e)) { this._staticForce(e, force, false); return 0; }
    let level = this.forceLevel(e, force);
    const fx0 = fin(from?.x, e.x), fy0 = fin(from?.y, e.y);
    const vx = e.x - fx0, vy = e.y - fy0, d = hypot(vx, vy);
    let ux, uy;
    const dirX = dir ? fin(dir.x, 0) : 0, dirY = dir ? fin(dir.y, 0) : 0;
    const dl = hypot(dirX, dirY);
    if (dl > 0) {
      ux = dirX / dl; uy = dirY / dl;
      if (from && !fixed && (d < PUSH_DIRECTIONAL_MIN_DIST || (!fixedAngle && vx * ux + vy * uy < d * Math.SQRT1_2))) {
        level -= 2;
        if (d > 1e-6) { ux = vx / d; uy = vy / d; }
      }
    } else if (d > 1e-6) { ux = vx / d; uy = vy / d; }
    else if (!inward && from && Array.isArray(from.fwd)) { ux = from.fwd[1]; uy = from.fwd[0]; }
    else return 0;
    const v0 = pushMomentum(level);
    let cap = Infinity;
    if (inward && !(dl > 0)) { ux = -ux; uy = -uy; cap = Math.max(0, d - PULL_STOP_RADIUS); }
    // 失衡 for the row's 位移时间 — also when the 特效 column or a wall shortens the slide [ASSUMED for the wall]; a slide a
    // wall stops at the first step gets the 0.1 s floor, like a body that cannot move [ASSUMED: 碰撞、停止 is 待补充]
    const hold = pushUnbalance(level);
    const moved = v0 > 0 ? this._shiftStart(e, ux * v0, uy * v0, { cap, effect, keepFacing }) : 0;
    if (hold > 0) this._unbalance(e, moved > 0 ? hold : UNBALANCE_MIN);
    return moved;
  }

  /**
   * Pull enemy `e` with 力度 `force` towards the point `to` (PRTS 推与拉 §拉力 / §捕网): 受力等级 ≥ 0 — all the way, until it
   * is within `stop` tiles of `center` (急停; `center` defaults to `to`, `stop` to PULL_STOP_RADIUS) or reaches `to`;
   * −1 — PULL_WEAK_SHARE of its starting distance to `to`; −2 — PULL_CRAWL tiles; ≤ −3 — nothing. `pullToFront` aims at
   * the official 拉力起点 in front of an operator. The displace fx keeps the pre-hit facing by default, as for pushes.
   * The supplied 歌蕾蒂娅 S1/S2 clip directly shows the target keeping its facing before and after a hook pull.
   * [ASSUMED] for other pull directions/sources: the clip does not isolate travel against the prior facing.
   * PRTS distinguishes 薄绿's inward push from a hook pull, not their model facing.
   * Pass `keepFacing: false` for a documented exception. The enemy slides there at a constant speed (constants.js
   * PULL_TIME_K; a pull ends a push's slide). Returns the tiles it will slide, walls included.
   */
  pull(e, force, { to, center = null, stop = PULL_STOP_RADIUS, keepFacing = true } = {}) {
    if (!to) return 0;
    // an enemy the puller itself blocks already stands in front of it (at contact) [ASSUMED: no pull, no unblocking]
    if (e && center && center.side === 'ally' && e.blockedBy === center) return 0;
    if (!this._displaceable(e)) { this._staticForce(e, force, true); return 0; }
    const level = this.forceLevel(e, force);
    // 失衡 for the force window, whatever the travel: the 急停 zeroes the movement, the state lasts to the window's end
    const hold = pullUnbalance(level);
    if (!(hold > 0)) return 0;
    const tx = fin(to.x, e.x), ty = fin(to.y, e.y);
    const dx = tx - e.x, dy = ty - e.y, d0 = hypot(dx, dy);
    if (!(d0 > 1e-6)) { this._unbalance(e, hold); return 0; }
    const ux = dx / d0, uy = dy / d0;
    // travel until inside the stop circle around `center` (smaller root of |e + t·u − c| = stop), else up to `to`
    let full = d0;
    const cx = fin(center?.x, tx), cy = fin(center?.y, ty), r = Math.max(0, fin(stop, 0));
    const wx = e.x - cx, wy = e.y - cy, wu = wx * ux + wy * uy, w2 = wx * wx + wy * wy;
    if (w2 <= r * r) full = 0;
    else {
      const disc = wu * wu - w2 + r * r;
      if (disc >= 0) { const t = -wu - Math.sqrt(disc); if (t >= 0) full = Math.min(full, t); }
    }
    const dist = level >= 0 ? full : level === -1 ? Math.min(full, PULL_WEAK_SHARE * d0) : Math.min(full, PULL_CRAWL);
    const T = level <= -2 ? PULL_UNBALANCE_WEAK : Math.min(PULL_UNBALANCE, PULL_TIME_K * Math.sqrt(d0));
    const speed = dist / Math.max(TICK, T);
    const moved = dist > 1e-6 ? this._shiftStart(e, ux * speed, uy * speed, { cap: dist, pull: true, keepFacing }) : 0;
    this._unbalance(e, hold);
    return moved;
  }

  /**
   * Start (or add to) the slide of enemy `e` with the velocity (vx, vy) tiles/s (GitHub #60): a push's momentum adds to
   * the slide it is in (momentum stacks), a pull replaces it. `cap` = the most it may travel (an inward push stops short
   * of its puller, a pull at its distance); `pull` = a constant speed, else friction; `effect` = an effect push, which
   * loses its first frame of travel — any other starts on the frame it lands (the hit's frame). The enemy leaves its
   * blocker and its attack, and the `displace` fx names where the slide ends and how long it takes (render/units.js
   * slideTo). Returns the tiles it will travel from here, walls included (_shiftPredict).
   */
  _shiftStart(e, vx, vy, { cap = Infinity, pull = false, effect = false, keepFacing = false } = {}) {
    const was = e.shift && !e.shift.pull && !pull ? e.shift : null;
    const sh = { vx: vx + (was ? was.vx : 0), vy: vy + (was ? was.vy : 0), left: cap, pull };
    e.shift = sh;
    e.shiftN = (e.shiftN || 0) + 1;
    let moved = 0;
    if (effect) this._shiftSlow(sh);
    else moved = this._shiftFrame(e, sh, e);
    const ahead = this._shiftPredict(e, sh);
    if (!(hypot(sh.vx, sh.vy) > 0)) e.shift = null;
    const total = moved + ahead.dist;
    if (total > 0) {
      this._unblock(e);
      // 失衡 ends the attack clip it stood for (PRTS 状态机: the states are exclusive — UNBALANCE, then DEFAULT → MOVE)
      this._cutAttackStand(e);
      e.atkStandUntil = -Infinity;
      if (e.route) e.route.pts = null;
      // `dur` (game s): how long the slide takes — the client's slide takes that long (render/units.js slideTo)
      const dur = ahead.frames * TICK;
      this.fx('displace', { x: ahead.x, y: ahead.y, id: e.id, ...(dur > 0 ? { dur } : {}), ...(keepFacing ? { keepFacing: true } : {}) });
    }
    return total;
  }

  /** The friction of one frame on a push's slide (a pull keeps its speed). */
  _shiftSlow(sh) {
    if (sh.pull) return;
    const v = hypot(sh.vx, sh.vy), nv = v - SHIFT_FRICTION * TICK;
    if (!(nv > 0)) { sh.vx = 0; sh.vy = 0; return; }
    sh.vx *= nv / v; sh.vy *= nv / v;
  }

  /**
   * One frame of the slide `sh` of enemy `e`, moving `at` ({x, y}: the enemy itself, or a copy for _shiftPredict): its
   * speed × TICK (at most what is `left`) in SHIFT_SUBSTEP steps over the tiles it may cross — a wall ends the slide
   * where it stands —, then the frame's friction. Returns the tiles moved.
   */
  _shiftFrame(e, sh, at) {
    const v = hypot(sh.vx, sh.vy);
    if (!(v > 0)) return 0;
    const ux = sh.vx / v, uy = sh.vy / v;
    const want = Math.min(v * TICK, sh.left);
    let moved = 0;
    while (moved + 1e-9 < want) { // loop-cap: a frame is at most a few SHIFT_SUBSTEPs
      const s = Math.min(SHIFT_SUBSTEP, want - moved);
      const nx = at.x + ux * s, ny = at.y + uy * s;
      const r = Math.round(ny), c = Math.round(nx);
      if (!(e.motion === 'FLY' ? this.grid.inRect(r, c) : this.grid.groundPassable(r, c))) { sh.vx = 0; sh.vy = 0; return moved; }
      at.x = nx; at.y = ny; moved += s;
    }
    sh.left -= moved;
    if (!(sh.left > 1e-9)) { sh.vx = 0; sh.vy = 0; return moved; }
    this._shiftSlow(sh);
    return moved;
  }

  /** Where the slide `sh` of `e` ends from here, how far and in how many frames (nothing moved). */
  _shiftPredict(e, sh) {
    const at = { x: e.x, y: e.y };
    const s = { ...sh };
    let dist = 0, frames = 0;
    while (hypot(s.vx, s.vy) > 0 && frames < SHIFT_MAX_FRAMES) { dist += this._shiftFrame(e, s, at); frames++; } // loop-cap: SHIFT_MAX_FRAMES
    return { x: at.x, y: at.y, dist, frames };
  }

  /**
   * The 'shift' phase of a step (battle/lifecycle.js, before the enemies act): every sliding enemy moves one frame. A
   * slide ends when its speed is spent, at a wall, or when the enemy can no longer be displaced (浮空 「触发浮空时清除受到的
   * 推/拉力」, 失衡免疫, out of the field, carried, dead); the route is planned again from where it stopped.
   */
  _shiftStep() {
    for (const e of this.enemies) {
      const sh = e.shift;
      if (!sh) continue;
      if (!this._displaceable(e) || e.hidden || e.mem?.carrier || e.s.flags.levitate) { e.shift = null; continue; }
      this._shiftFrame(e, sh, e);
      this._clampPos(e);
      if (!(hypot(sh.vx, sh.vy) > 0)) { e.shift = null; if (e.route) e.route.pts = null; }
    }
  }

  /** Official distance (tiles) a push of 力度 `force` would move `e` on open ground (0 when it cannot be displaced). */
  pushDistance(e, force, { effect = false } = {}) {
    return this._displaceable(e) ? pushTiles(this.forceLevel(e, force), effect) : 0;
  }

  /** Pull `e` "至面前" of ally `unit` (拉力起点 PULL_ORIGIN tiles ahead along its direction, 急停 around its centre). */
  pullToFront(e, unit, force) {
    if (!unit) return 0;
    const f = Array.isArray(unit.fwd) ? unit.fwd : [0, 1];
    return this.pull(e, force, { to: { x: unit.x + f[1] * PULL_ORIGIN, y: unit.y + f[0] * PULL_ORIGIN }, center: unit, stop: PULL_STOP_RADIUS });
  }

  /**
   * Can `e` be displaced at all: a living enemy, not a leader part of the boss pool, not 失衡免疫 (flag `noDisplace`:
   * 近地悬浮, 浮空, the 胄 parts …) and not a 静态刚体 (data `staticBody`). PRTS 特殊机制 静态刚体: such a unit "可以进入
   * 失衡状态 … 但物理层面上无法产生任何速度或移动" — every air unit of the mode except “炎佑”, plus the boss 昆图斯 (build-data
   * STATIC_BODIES; player report after 0.1.0, "飞机可以被薄绿的技能拉走"). A skill that reaches it still hits it (its targeting
   * is the skill's own: 锏 S3, 薄绿, the 钩索师 …); only the movement is 0, so distance-based effects (drag damage, 见行者 S2's
   * wall stun) come to nothing — but a force > 0 still puts it in the 失衡 state for its 0.1 s floor (_staticForce).
   */
  _displaceable(e) {
    return !!(e && e.alive && e.side === 'enemy' && !e.isBoss && !e.s.flags.noDisplace && !(e.def && e.def.staticBody));
  }

  /**
   * A push (`pull` false) / pull of 力度 `force` on a 静态刚体 (data `staticBody`; not 失衡免疫 `noDisplace` — PRTS 特殊机制
   * 静态刚体: unlike 失衡免疫 it "可以进入失衡状态并启用物理，但物理层面上无法产生任何速度或移动", leaving it 「在失去施力后立刻」 with
   * 「0.1 秒保底持续时间」): no movement, the state as long as the force acts — a push's is instant (推与拉 「作用时间：瞬间」) so
   * the UNBALANCE_MIN floor, a pull's is its window (pullUnbalance: 1 s, 0.5 s below −1); a force > 0 (受力等级 ≥ −2) only.
   * Leaders (the boss pool) stay out.
   */
  _staticForce(e, force, pull = false) {
    if (!(e && e.alive && e.side === 'enemy' && !e.isBoss && !e.s.flags.noDisplace && e.def && e.def.staticBody)) return;
    const level = this.forceLevel(e, force);
    if (level >= -2) this._unbalance(e, pull ? Math.max(UNBALANCE_MIN, pullUnbalance(level)) : UNBALANCE_MIN);
  }

  /**
   * Put enemy `e` in the 失衡 (UNBALANCE) state for `dur` game seconds from now (a running one is kept when it lasts longer):
   * a state machine, not a status (PRTS 异常效果: no 阻止攻击 status — no stun, no immunity, SP untouched) — ai.js
   * updateEnemy reads `unbalanceUntil`: the enemy neither walks (恐惧 / 诱导 included) nor starts a normal attack, a swing
   * short of its frame is cut; checks that ignore the state (水遁忍者's damage, content abilities) go on. The state machine
   * switch ends the attack clip it stood for (PRTS 状态机: the states are exclusive — UNBALANCE, then DEFAULT → MOVE). It
   * ends with its time, or at once with 浮空 (术语释义 浮空 「触发浮空时清除受到的推/拉力…无法陷入失衡」, ai.js), a 重生 or a route
   * APPEAR (forced state switches). No skill meanwhile either (失衡免疫 「…使用技能」): content skills, blinks and scripted moves
   * check `enemies/helpers.js unbalancedNow` (docs/SIM.md lists what deliberately keeps running).
   */
  _unbalance(e, dur) {
    if (!(dur > 0) || !e || !e.alive) return;
    const until = this.time + dur;
    if (!(e.unbalanceUntil >= until)) e.unbalanceUntil = until;
    this._cutAttackStand(e);
    e.atkStandUntil = -Infinity;
  }

  /**
   * Move an enemy `distance` tiles along `dir` = {x, y} (normalised internally) over passable tiles — the raw mover of
   * push() / pull(), which apply the official 力度 − 重量 rules (content uses those; the old `force` option is gone).
   * 失衡免疫 (flag `noDisplace`: 近地悬浮, 浮空 — PRTS 异常效果 "不会被位移影响"), 静态刚体 (data `staticBody`) and leaders
   * ⇒ no movement (_displaceable). The tiles it may cross follow its movement (`motion`): a hovering enemy walks the
   * ground, so it stays on ground-passable tiles.
   */
  displace(e, dir, distance, { dur = 0, keepFacing = false } = {}) {
    if (!this._displaceable(e) || !dir) return 0;
    const dxv = fin(dir.x, 0), dyv = fin(dir.y, 0);
    const len = hypot(dxv, dyv);
    if (!(len > 0)) return 0;
    const eff = Math.min(fin(distance, 0), 2 * COLS);
    if (!(eff > 0)) return 0;
    const ux = dxv / len, uy = dyv / len;
    let moved = 0;
    const stepLen = 0.1;
    while (moved + 1e-9 < eff) { // loop-cap: distance capped at 2*COLS, step 0.1
      const s = Math.min(stepLen, eff - moved); // (the last step is a partial one: 0.12 tiles moves 0.12, not 0.2)
      const nx = e.x + ux * s, ny = e.y + uy * s;
      const r = Math.round(ny), c = Math.round(nx);
      const ok = e.motion === 'FLY' ? this.grid.inRect(r, c) : this.grid.groundPassable(r, c);
      if (!ok) break;
      e.x = nx; e.y = ny; moved += s;
    }
    if (moved > 0) {
      e.shiftN = (e.shiftN || 0) + 1;   // (content/enemies/archetypes.js unbalanced() sees it)
      this._unblock(e);
      // 失衡 ends the attack clip it stood for (PRTS 状态机: the states are exclusive — UNBALANCE, then DEFAULT → MOVE)
      this._cutAttackStand(e);
      e.atkStandUntil = -Infinity;
      if (e.route) e.route.pts = null;
      // `dur` (game s): the 失衡 the push / pull gives — the client's slide takes that long (render/units.js slideTo)
      this.fx('displace', { x: e.x, y: e.y, id: e.id, ...(dur > 0 ? { dur } : {}), ...(keepFacing ? { keepFacing: true } : {}) });
    }
    return moved;
  }
}
