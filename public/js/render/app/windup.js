// The attack wind-up look-ahead of the battle view (render/app.js windUpAttacks): an 'atk' still queued in the snapshot
// buffer starts its Spine clip early enough for the strike frame to land when the event is rendered (the look-ahead is
// the interpolation delay, ~0.2 game s). Its own module so the queue walk is testable (test/render/enemy-strike-clip).

import { CHAIN_KINDS } from './tune.js';
import { rotateOffset } from '../../ui/facing.js';
import { UF } from '../../../../shared/constants.js';

// (fork) the sim's regular enemy collider (server/sim/constants.js ENEMY_COLLIDER_RADIUS) and tick (30 per game s)
const COLLIDER = 0.1;
const TICK = 1 / 30;

/** (fork) The board tiles ("row,col") a unit on (row, col) facing `dir` reaches with `grid` ([dr, dc] facing RIGHT). */
export function rangeTiles(grid, row, col, dir) {
  const out = new Set();
  if (!Array.isArray(grid)) return out;
  for (const p of grid) {
    if (!Array.isArray(p) || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) continue;
    const [dr, dc] = rotateOffset(p[0], p[1], dir);
    out.add(`${row + dr},${col + dc}`);
  }
  return out;
}

/** (fork) A regular enemy at (x, y) is on one of `tiles` (its 0.1 collider: server/sim/battle/queries.js _buildEnemyIndex). */
export function colliderOn(tiles, x, y) {
  const rho = COLLIDER;
  const r0 = Math.floor(y - rho + 0.5 + 1e-9), r1 = Math.ceil(y + rho - 0.5 - 1e-9);
  const c0 = Math.floor(x - rho + 0.5 + 1e-9), c1 = Math.ceil(x + rho - 0.5 - 1e-9);
  for (let r = r0; r <= r1; r++) {
    const dy = y < r - 0.5 ? r - 0.5 - y : y > r + 0.5 ? y - r - 0.5 : 0;
    for (let c = c0; c <= c1; c++) {
      const dx = x < c - 0.5 ? c - 0.5 - x : x > c + 0.5 ? x - c - 0.5 : 0;
      if (dx > 0 && dy > 0 && dx * dx + dy * dy >= rho * rho) continue;
      if (tiles.has(`${r},${c}`)) return true;
    }
  }
  return false;
}

/**
 * (fork) Game s from `from` until one of the enemies `ids` is on `tiles`: through the buffered snapshots (`snaps`, oldest
 * first, each { t, units: Map id → [id, x, y, hp, maxHp, sp, spMax, flags, …] }), then along its last velocity, up to
 * `horizon`. An enemy whose newest flags have a bit of `skip` is no target (server/sim/targeting.js canTargetEnemy: a
 * flyer for a unit that cannot hit air, a stealthed or sleeping one). 0 when one is there already, null when none comes.
 */
export function entryLead(snaps, from, ids, tiles, horizon, skip = 0) {
  const n = snaps.length;
  if (!n || !tiles.size) return null;
  const s1 = snaps[n - 1], s0 = n > 1 ? snaps[n - 2] : null;
  const at = (id, t) => {
    if (t >= s1.t) return null;
    for (let i = n - 1; i > 0; i--) {
      const a = snaps[i - 1], b = snaps[i];
      if (t < a.t) continue;
      const pa = a.units.get(id), pb = b.units.get(id);
      if (!pa || !pb) { const p = pb || pa; return p ? [p[1], p[2]] : null; }
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return [pa[1] + (pb[1] - pa[1]) * k, pa[2] + (pb[2] - pa[2]) * k];
    }
    const p = snaps[0].units.get(id);
    return p ? [p[1], p[2]] : null;
  };
  let best = null;
  for (const id of ids) {
    const p1 = s1.units.get(id);
    if (!p1 || !(p1[3] > 0) || (p1[7] & skip)) continue;
    const p0 = s0 ? s0.units.get(id) : null;
    const dt = s0 ? s1.t - s0.t : 0;
    const vx = p0 && dt > 0 ? (p1[1] - p0[1]) / dt : 0, vy = p0 && dt > 0 ? (p1[2] - p0[2]) / dt : 0;
    for (let tau = 0; tau <= horizon && (best == null || tau < best); tau += TICK) {
      const t = from + tau;
      const q = at(id, t);
      const x = q ? q[0] : p1[1] + vx * (t - s1.t);
      const y = q ? q[1] : p1[2] + vy * (t - s1.t);
      if (colliderOn(tiles, x, y)) { best = tau; break; }
    }
  }
  return best;
}

/**
 * `views` (id → UnitView), `woundUp` (a WeakSet of the 'atk' tuples already wound up), `castStart(view, targetView, kind,
 * opts)` (render/vfx/wiring.js castStart: the official cast effects that start with the clip). The 'atk' target view is
 * passed into `windUp` so the model faces it when the clip starts (UnitView.onAttack's rule, GitHub #869). Returns
 * `run(interp, renderT)`, walking the events queued in (renderT, renderT + 1.5]. (fork) `skip(e)`: an 'atk' to leave alone.
 */
export function createWindUpLookahead({ views, woundUp, castStart, skip = null, attackClip = null, skillNext = null, rangeGridOf = null }) {
  let upcomingT = 0;
  // the look-ahead's skill state: a ['skill', id, on] queued before an 'atk' of that unit (an instant skill sends 1, its
  // attack and 0 in one tick) — the official cast effects of the wind-up are the skill's own then
  const upSkill = new Map();
  // … and its casts: a ['cast', id, slot] in the tick of an 'atk' of that enemy — an attack-class skill cast in the
  // attack's `before` hook; a `strike` slot winds that attack up on the slot's clip (UnitView.onCast, DESIGN §35.48).
  // A cast in the attack's turn (['cast', id, slot, dur, clip]: no 'atk' with it) winds up its own clip, so the clip's
  // strike frame lands with the cast (UnitView.windUpCast, DESIGN §35.57)
  const upCast = new Map();
  const rates = new Map();
  // (fork) each unit's last 'atk' (kind, target id): the predicted skill swing's (run)
  const lastAtk = new Map();
  function onUpcoming(e, t) {
    if (e[0] === 'skill') { upSkill.set(e[1], !!e[2]); return; }
    if (e[0] === 'cast') {
      upCast.set(e[1], { slot: e[2] | 0, t });
      if (e.length > 4 && !woundUp.has(e)) {
        const v = views.get(e[1]);
        if (v && v.windUpCast && v.windUpCast(t - upcomingT, e[2] | 0, Number(e[4]) || 0)) woundUp.add(e);
      }
      return;
    }
    if (e[0] !== 'atk' || woundUp.has(e) || CHAIN_KINDS.has(e[3])) return;
    if (skip && skip(e)) return;   // (fork) an attack the caller winds up no clip for (render/app.js)
    const v = views.get(e[1]);
    if (!v || !v.windUp) return;
    const cast = upCast.get(e[1]);
    let interval;
    for (const rate of rates.get(e[1]) || []) {
      if (rate.t > t) break;
      interval = rate.value;
    }
    // (fork) the target too: a lord's melee twin (UnitView.windUp); upstream: the model faces it as the clip starts
    const target = views.get(e[2]) || null;
    lastAtk.set(e[1], { kind: e[3], target: e[2] });
    // (fork) the predicted skill swing (below) already plays this attack's clip and cast effects: only its timing
    if (v.actor?.skillSwung && v.actor.wound) {
      v.actor.skillConfirmed = true;
      v.windUp(t - upcomingT, e[3], null, interval, target);
      woundUp.add(e);
      return;
    }
    const skillOn = upSkill.has(e[1]) ? upSkill.get(e[1]) : undefined;
    // (fork) the clip of the ability this attack's effects come from (vfx/wiring.js attackClip); an attack still wound up
    // keeps its own until it lands, its pick being one attack count behind this one's
    if (attackClip && v.actor && !v.actor.wound) v.actor.attackVariant = attackClip(v, target, e[3], skillOn);
    // (fork) an instant skill that turns on with this attack winds up on its own clip (SpineActor.skillAhead)
    if (v.actor && !v.actor.wound) v.actor.skillAhead = skillOn === true;
    if (v.windUp(t - upcomingT, e[3], cast && cast.t === t ? cast.slot : null, interval, target)) {
      woundUp.add(e);
      const a = v.actor;
      castStart(v, target, e[3], a ? { skip: a.windSkip || 0, left: a.windCastLeft || 0, skillOn } : { skillOn });
    }
  }
  return {
    run(interp, renderT) {
      const snaps = interp.snaps || [];
      upcomingT = renderT;
      upSkill.clear();
      upCast.clear();
      rates.clear();
      // Rates are emitted after ally attacks, so inspect the entire tick before winding up its attack.
      interp.forEachUpcoming(renderT, renderT + 1.5, (e, t) => {
        if (e[0] !== 'rate') return;
        if (!rates.has(e[1])) rates.set(e[1], []);
        rates.get(e[1]).push({ t, value: e[2] });
      });
      interp.forEachUpcoming(renderT, renderT + 1.5, onUpcoming);
      // (fork) a skill that replaces the coming attack, its SP full (skillNext: 维娜·维多利亚 S1): its clip starts from frame
      // 0 a whole wind-up before the predicted strike, its cast effects with it (SpineActor.skillSwingLead)
      if (skillNext) for (const [id, v] of views) {
        const a = v.actor;
        if (!a || typeof a.skillSwingLead !== 'function') continue;
        a.skillNext = v.spMax > 0 && v.sp >= v.spMax && !!skillNext(v);
        if (!a.skillNext || a.skillSwung || a.wound) continue;
        // when an enemy reaches its range: the first attack of a fight (or after a pause) has no last strike to time from
        const r = rangeGridOf ? rangeGridOf(v) : null;
        const grid = r && r.grid;
        const me = snaps.length ? snaps[snaps.length - 1].units.get(id) : null;
        let entry;
        if (grid && me) {
          const ids = [];
          for (const [eid, ev] of views) if (ev.isEnemy && ev.alive !== false) ids.push(eid);
          const skip = UF.STEALTH | UF.SLEEP | (r.hitsFly ? 0 : UF.FLYING);
          entry = entryLead(snaps, renderT, ids, rangeTiles(grid, Math.round(me[2]), Math.round(me[1]), v.info?.dir), 1.5, skip);
        }
        const lead = a.skillSwingLead(entry);
        if (lead == null || !(lead >= 0)) continue;
        const last = lastAtk.get(id);
        const target = last ? views.get(last.target) || null : null;
        const kind = last ? last.kind : 'none';
        a.skillAhead = true;
        if (v.windUp(lead, kind, null, undefined, target)) {
          a.skillSwung = true;
          // the last normal attack's pick (attackClip) is no pick of this one: it would replace the skill clip at the strike
          a.attackVariant = null;
          castStart(v, target, kind, { skip: a.windSkip || 0, left: a.windCastLeft || 0, skillOn: true });
        } else a.skillAhead = false;
      }
    },
  };
}
