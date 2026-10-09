// server/sim/fear.js — 恐惧 movement of enemies (DESIGN §5.5; user playtest #6 item 13).
//
// Official rule (gamedata_const termDescriptionDict ba.fear "无法被阻挡并四散逃跑"; PRTS 术语释义 恐惧 "受影响的目标大体上会
// 尝试尽可能远离效果来源"; PRTS 诱发移动 §恐惧 — the fear controller):
//   * 恐惧可达地块: when a fear is applied the controller records the tiles whose CENTRE lies within 10 tiles of the hit
//     position (the feared unit's position then), inside the 90° fan pointing away from the effect source (±45°), that
//     can reach the unit's goal, are passable terrain (obstacles or not) and are not the protection objective (no
//     地穴 in this mode). Without a source, with the unit itself as the source (自惧 / "对自身施加…恐惧", e.g. the
//     “萨科塔” enemies' SelfFear) or with the source exactly on the hit position there is NO reachable tile.
//   * 恐惧移动: the unit picks a random reachable tile as a temporary checkpoint, offset at random inside a square of
//     side 0.5 around the tile centre, and moves there; on arrival it picks the next one, until the fear ends. A picked
//     tile farther than 5 path steps is dropped from the list for good and the unit's own tile is used instead; with
//     no reachable tile the checkpoint is always its own tile (same offset) — so a self-feared unit flutters around
//     inside its tile ("小范围乱飞"). A new fear refreshes the list from the current position (Battle.applyStatus
//     stamps `buff.data.fear` on every application). Waiting checkpoints keep counting down meanwhile; when the fear
//     ends the unit re-plans its route from where it stands ("恐惧效果结束时立刻清除【恐惧移动】" — so does a running
//     诱导, ai.js moveAttracted). 恐惧 outranks 诱导 (PRTS 诱移优先级).
// Path steps (the 5-step limit): 4-neighbour steps over the unit's passable, obstacle-free tiles, the checkpoint tile
// included (ground: walkable, blocks and crates excluded — a crate's move cost 1000 is beyond any 5-step budget and a
// block has no path; flyers: fly-passable), like the official SPFA's unit edges.
// The temporary path: ground units walk the grid's smoothed flow-field waypoints to the checkpoint's tile (stepping
// back to their tile centre first when the straight line from an off-centre position would clip a tile they cannot
// walk, as ai.js planLeg), flyers fly straight. Like every enemy path it re-plans from where the unit stands when
// something else moved it (a push / pull — Battle.displace) or an obstacle changed (grid.version): to the same
// checkpoint while it stays reachable, else to a new pick. Speed = the unit's own (move-speed buffs such as the
// SelfFear ×1.5 included). Deterministic: every draw is battle.rng().

import { MOVE_SCALE, COLS } from './constants.js';
import { straightClear } from './grid.js';
import { hypot } from './detmath.js';

/** 半径10格 — the fan's radius (tiles). */
export const FEAR_RADIUS = 10;
/** 左右各45° — cos of the fan's half angle. */
export const FEAR_HALF_COS = Math.SQRT1_2;
/** 寻路距离5格内 — the farthest checkpoint in path steps. */
export const FEAR_REACH = 5;
/** 0.5边长正方形的随机偏移 — side of the random offset square around a checkpoint tile's centre. */
export const FEAR_JITTER = 0.5;

/**
 * Stamp a fear application on its buff (Battle.applyStatus): the hit position, the source's position and whether
 * the unit feared itself. Every application gets a new per-battle `seq`, which makes the mover rebuild its tiles.
 */
export function stampFear(b, target, buff, source) {
  const self = !source || source === target;
  b._fearSeq = (b._fearSeq || 0) + 1;
  buff.data = {
    ...buff.data,
    fear: {
      seq: b._fearSeq, hx: target.x, hy: target.y, self,
      sx: self ? target.x : Number(source.x), sy: self ? target.y : Number(source.y),
    },
  };
}

/** The latest fear stamp among the unit's fear buffs (null when none carries one — e.g. a raw addBuff). */
function stampOf(e) {
  let best = null;
  for (const b of e.buffs) {
    const f = (b.status === 'fear' || b.key === 'fear') && b.data ? b.data.fear : null;
    if (f && (!best || f.seq > best.seq)) best = f;
  }
  return best;
}

/** The goal tile of the enemy's route (its final leg), or null. */
function goalOf(e) {
  const legs = e.route && e.route.legs;
  if (!legs) return null;
  for (let i = legs.length - 1; i >= 0; i--) if (legs[i].final && legs[i].r != null) return legs[i];
  return null;
}

/** Passable terrain for this unit, obstacles or not ("不论该格是否有障碍物"). */
const passable = (g, fly, r, c) => (fly ? g.flyPassable(r, c) : g.walkable(r, c, true));

/**
 * 恐惧可达地块 of a stamp: tile keys in row-major order (deterministic).
 * @returns {number[]}
 */
export function reachableTiles(b, e, st) {
  if (!st || st.self) return [];
  const dx = st.hx - st.sx, dy = st.hy - st.sy, d = hypot(dx, dy);
  if (!(d > 1e-9)) return [];
  const ux = dx / d, uy = dy / d;
  const g = b.grid, R = g.rect, fly = e.motion === 'FLY';
  const goal = goalOf(e);
  let field = null, field2 = null;
  if (!fly && goal) { field = g.flowField(goal.r, goal.c); field2 = g.flowField(goal.r, goal.c, { ignoreObstacles: true }); }
  const out = [];
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      const vx = c - st.hx, vy = r - st.hy, L = hypot(vx, vy);
      if (L > FEAR_RADIUS + 1e-9) continue;
      if (L > 1e-9 && vx * ux + vy * uy < FEAR_HALF_COS * L - 1e-9) continue;
      if (!passable(g, fly, r, c) || g.tile(r, c).special === 'end') continue;
      const k = r * COLS + c;
      if (field && field.dist[k] < 0 && field2.dist[k] < 0) continue;   // 该格可抵达其终点
      out.push(k);
    }
  }
  return out;
}

/** Whether the unit can stand on / step through tile key `k` (its passable terrain; ground: no block, no crate). */
function openTile(g, fly, k) {
  const r = (k / COLS) | 0, c = k - r * COLS;
  return passable(g, fly, r, c) && (fly || !g.isObstacle(r, c));
}

/**
 * Path steps (4-neighbour, the unit's open tiles, `to` included) from tile key `from` to `to`, or Infinity beyond
 * `limit` — an obstacle tile has no path ("寻路距离"), so a pick on one is dropped like a far one.
 */
function stepsBetween(b, e, from, to, limit) {
  if (from === to) return 0;
  const g = b.grid, fly = e.motion === 'FLY';
  const open = (k) => openTile(g, fly, k);
  if (!open(to)) return Infinity;
  let frontier = [from];
  const seen = new Set(frontier);
  for (let d = 1; d <= limit && frontier.length; d++) {
    const next = [];
    for (const k of frontier) {
      const r = (k / COLS) | 0, c = k - r * COLS;
      for (const [dr, dc] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (!g.inRect(rr, cc)) continue;
        const kk = rr * COLS + cc;
        if (seen.has(kk)) continue;
        if (kk === to) return d;
        seen.add(kk);
        if (open(kk)) next.push(kk);
      }
    }
    frontier = next;
  }
  return Infinity;
}

/** The unit's tile (row, col, key), clamped to the rect. */
function hereOf(g, e) {
  const r = Math.max(g.rect.r0, Math.min(g.rect.r1, Math.round(e.y)));
  const c = Math.max(g.rect.c0, Math.min(g.rect.c1, Math.round(e.x)));
  return { r, c, k: r * COLS + c };
}

/**
 * The temporary path from where the unit stands to its checkpoint (`m.k` tile, `m.goal` point): ground units follow
 * the smoothed flow-field waypoints (null when an obstacle now cuts the tile off), flyers fly straight. Records the
 * grid version; moveFeared records where each step left the unit and re-plans when either changes behind its back.
 * @returns {boolean} false when a ground unit can no longer reach the checkpoint tile
 */
function planPath(b, e, m) {
  const g = b.grid, h = hereOf(g, e);
  const pts = [];
  if (e.motion !== 'FLY' && m.k !== h.k) {
    if (!openTile(g, false, m.k)) return false;
    const r = (m.k / COLS) | 0, c = m.k - r * COLS;
    const wp = g.waypoints(h.r, h.c, r, c);
    if (!wp) return false;
    for (let j = 1; j < wp.length - 1; j++) pts.push({ x: wp[j][1], y: wp[j][0] });
    // the smoothed chain is line-of-sight clear from the tile CENTRE only (as ai.js planLeg)
    const first = pts.length ? pts[0] : { x: c, y: r };
    if ((e.x !== h.c || e.y !== h.r) && !straightClear(g, e.x, e.y, first)) pts.unshift({ x: h.c, y: h.r });
  }
  pts.push(m.goal);
  m.pts = pts;
  m.i = 0;
  m.ver = g.version;
  return true;
}

/** Choose the next temporary checkpoint (a random reachable tile within 5 path steps, else the own tile) and plan to it. */
function pickCheckpoint(b, e, m) {
  const here = hereOf(b.grid, e).k;
  let k = here;
  if (m.tiles.length) {
    const i = Math.floor(b.rng() * m.tiles.length);
    const cand = m.tiles[i];
    if (stepsBetween(b, e, here, cand, FEAR_REACH) <= FEAR_REACH) k = cand;
    else m.tiles.splice(i, 1);   // "…格子会永久从当次恐惧的恐惧可达地块中剔除"
  }
  const ox = (b.rng() - 0.5) * FEAR_JITTER, oy = (b.rng() - 0.5) * FEAR_JITTER;
  const aim = (key) => {
    const r = (key / COLS) | 0, c = key - r * COLS;
    m.k = key;
    m.goal = { x: c + ox, y: r + oy };
    return planPath(b, e, m);
  };
  // (a pick within 5 open steps has a path unless the unit itself stands on a block; the own tile needs none)
  if (!aim(k)) aim(here);
}

/**
 * One tick of fear movement for enemy `e` (ai.js updateEnemy, while `e.s.flags.fear`). Sets `e.moving`.
 */
export function moveFeared(b, e, dt) {
  const st = stampOf(e);
  let m = e.mem.fearMove;
  if (!m || (st && m.seq !== st.seq)) {
    m = e.mem.fearMove = { seq: st ? st.seq : -1, tiles: reachableTiles(b, e, st), pts: null, i: 0 };
  }
  // pushed / pulled (Battle.displace) or an obstacle changed since the last tick: re-plan the walk from here — to the
  // same checkpoint while it stays reachable, else a new pick (a stale path would walk through walls)
  if (m.pts && (m.ver !== b.grid.version || e.x !== m.px || e.y !== m.py) && !planPath(b, e, m)) m.pts = null;
  // a waiting checkpoint of the route keeps counting down ("停驻时间会相应扣除恐惧生效时间")
  const R = e.route, leg = R && R.legs ? R.legs[R.legIdx] : null;
  if (leg && leg.t === 'wait') {
    if (R.waitLeft == null) R.waitLeft = leg.time;
    R.waitLeft -= dt;
    if (R.waitLeft <= 1e-9) { R.waitLeft = null; R.legIdx++; }
  }
  if (R) R.pts = null;   // the route re-plans from wherever the fear leaves the unit
  const speed = e.s.moveSpeed * MOVE_SCALE;
  let moved = false;
  if (speed > 0) {
    let dist = speed * dt;
    for (let guard = 8; dist > 1e-9 && guard > 0; guard--) {
      if (!m.pts || m.i >= m.pts.length) pickCheckpoint(b, e, m);
      const p = m.pts[m.i];
      const dx = p.x - e.x, dy = p.y - e.y, d = hypot(dx, dy);
      if (d <= dist) { e.x = p.x; e.y = p.y; dist -= d; m.i++; } else { e.x += (dx / d) * dist; e.y += (dy / d) * dist; dist = 0; }
      moved = moved || d > 1e-9;
    }
  }
  m.px = e.x; m.py = e.y;
  e.moving = moved;
}

/** The fear ended: forget the controller; the route re-plans from here (route.pts was cleared while feared). */
export function endFear(e) {
  e.mem.fearMove = null;
  if (e.route) e.route.pts = null;
}
