// Adversarial cross-check of grid.js against an independent port of the official client pathing (research 08 §3.4,
// `Torappu.Battle.SPFA`: FIFO SPFA from the destination over the WHOLE level map, UP/RIGHT/DOWN/LEFT, crates cost 1000,
// strict improvement; row-major in-place Bresenham smoothing with the diagonal corner rule), run on the raw level files
// in .cache/gamedata (skipped when absent), extended by our blockable-ground preference (grid.js header: a second,
// preference field = 0.1.0's — equal-length ties to the chain with the fewest non-blockable tiles, a line of sight that
// covers non-blockable tiles, diagonal-step corners included, only on the own raw chain — whose pointer replaces the
// official one where its route crosses fewer non-blockable tiles, or as few while only skipping the official waypoint
// (on the straight line to it, leading there), and no more 深水区 than the official route (GitHub #375); "crosses" =
// positive-length intersection with the tile, found here by clipping the segment against each tile, independently of
// grid.js crossTiles):
//   * the 8 active stages with their match-start devices: the smoothed chain from EVERY walkable tile of the normal,
//     联防 and boss rects to every goal equals the full-map reference one (the sim's rect limit changes nothing);
//   * 400 random crate / block layouts: identical chains to the same algorithm limited to the rect;
//   * against the PURE official algorithm: identical route lengths everywhere, never more non-blockable tiles crossed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid } from '../../server/sim/grid.js';
import { getDefaultSource, hasGeneratedData } from '../../server/sim/simdata.js';
import { GEO } from '../../shared/constants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEVELS = join(ROOT, '.cache', 'gamedata', 'levels', 'activities');
const STAGES = ['act1autochess_m01', 'act1autochess_m02', 'act1autochess_m03', 'act1autochess_m04', 'act2autochess_m01', 'act2autochess_m02', 'act2autochess_m03', 'act2autochess_m04'];
const file = (sid) => join(LEVELS, sid.slice(0, 13), `level_${sid}.json`);
const SKIP = { skip: (!hasGeneratedData() && 'no generated data') || (!STAGES.every((s) => existsSync(file(s))) && 'no .cache/gamedata levels') };
const FOUR = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * The official algorithm on a raw level (non-hidden crates cost 1000; platforms / mounds blocked like the sim [ASSUMED]).
 * `prefer` adds the blockable-ground preference (see the header). Returns dest → (start → chain string), with
 * `.dist(start)` / `.crossedNb(start)` (non-blockable tiles the route crosses, start excluded) on each dest.
 */
function official(sid, { crates: extraCrates = [], blocks: extraBlocks = [], rect = null, prefer = true } = {}) {
  const lv = JSON.parse(readFileSync(file(sid), 'utf8'));
  const md = lv.mapData;
  const H = md.map.length, W = md.map[0].length;
  const tile = (r, c) => md.tiles[md.map[H - 1 - r][c]];
  const crates = new Set(), blocked = new Set();
  for (const t of lv.predefines?.tokenInsts || []) {
    if (t.hidden) continue;
    const k = `${t.position.row},${t.position.col}`;
    if (t.inst.characterKey === 'trap_1105_accrate') crates.add(k);
    if (t.inst.characterKey === 'trap_1106_achplat' || t.inst.characterKey === 'trap_032_mound') blocked.add(k);
  }
  for (const [r, c] of extraCrates) crates.add(`${r},${c}`);
  for (const [r, c] of extraBlocks) blocked.add(`${r},${c}`);
  const inside = (r, c) => (rect ? r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1 : r >= 0 && r < H && c >= 0 && c < W);
  const passable = (r, c) => inside(r, c) && ['ALL', 'WALK_ONLY'].includes(tile(r, c).passableMask) && !blocked.has(`${r},${c}`);
  // non-blockable walkable terrain: not LOWLAND buildable for melee (floor, gates, goal, teleports) — and the 深水区,
  // which refuses deployment whatever its buildableType (PRTS 深水区 地形信息 "拒绝部署（待补充）"; player report #3
  // after 0.1.0)
  const nb = (r, c) => {
    const t = tile(r, c);
    if (t.tileKey === 'tile_deepsea') return true;
    return !(t.heightType === 'LOWLAND' && (t.buildableType === 'ALL' || t.buildableType === 'MELEE'));
  };
  /** 深水区 — the preference may not cross more of it than the official route (#375) */
  const deep = (r, c) => ['tile_deepsea', 'tile_deepwater'].includes(tile(r, c).tileKey);
  const bres = ([r0, c0], [r1, c1], clear) => {
    const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0), sr = r1 > r0 ? 1 : -1, sc = c1 > c0 ? 1 : -1;
    let err = dc - dr, r = r0, c = c0;
    const out = [[r, c]];
    while (r !== r1 || c !== c1) {
      const e2 = 2 * err;
      let nr = r, nc = c;
      if (e2 > -dr) { err -= dr; nc += sc; }
      if (e2 < dc) { err += dc; nr += sr; }
      if (nr !== r && nc !== c) out.push([nr, c], [r, nc]);
      r = nr; c = nc;
      out.push([r, c]);
    }
    return clear ? out.every(([a, b]) => clear(a, b)) : out;
  };
  // tiles the centre-to-centre segment a → b passes through with positive length (Liang–Barsky clip per tile)
  const through = ([r0, c0], [r1, c1]) => {
    const out = [];
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
        let t0 = 0, t1 = 1;
        for (const [pp, qq] of [[-(c1 - c0), c0 - (c - 0.5)], [c1 - c0, c + 0.5 - c0], [-(r1 - r0), r0 - (r - 0.5)], [r1 - r0, r + 0.5 - r0]]) {
          if (pp === 0) { if (qq < 0) t1 = -1; continue; }
          if (pp < 0) t0 = Math.max(t0, qq / pp); else t1 = Math.min(t1, qq / pp);
        }
        if (t1 - t0 > 1e-9) out.push([r, c]);
      }
    }
    return out;
  };
  const key = (p) => p.join();
  const unkey = (k) => k.split(',').map(Number);
  const losClear = (y, x) => passable(y, x) && !crates.has(`${y},${x}`);
  return (dest) => {
    const D = dest.join();
    const spfa = (usePen) => {
      const dist = new Map([[D, 0]]);
      const pen = new Map([[D, 0]]);
      const par = new Map();
      const q = [dest];
      const inq = new Set([D]);
      while (q.length) {
        const cur = q.shift();
        const ck = cur.join();
        inq.delete(ck);
        for (const [dr, dc] of FOUR) {
          const nb2 = [cur[0] + dr, cur[1] + dc];
          const nk = nb2.join();
          if (!passable(nb2[0], nb2[1])) continue;
          const nd = dist.get(ck) + (crates.has(nk) ? 1000 : 1);
          const np = pen.get(ck) + (usePen && nb(nb2[0], nb2[1]) ? 1 : 0);
          if (!dist.has(nk) || nd < dist.get(nk) || (usePen && nd === dist.get(nk) && np < pen.get(nk))) {
            dist.set(nk, nd);
            pen.set(nk, np);
            par.set(nk, cur);
            if (!inq.has(nk)) { q.push(nb2); inq.add(nk); }
          }
        }
      }
      return { dist, par };
    };
    // row-major in-place smoothing; `guard` (0.1.0's preference smoothing): the line of sight toward ancestor a may
    // also cover non-blockable tiles (Bresenham footprint, diagonal-step corners included) only on the tile's own raw
    // chain between the tile and a — the jump stops at the first ancestor it cannot see so
    const smooth = ({ dist, par }, guard) => {
      const nxt = new Map(par);
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
          const k = `${r},${c}`;
          if (!nxt.has(k)) continue;
          const chain = new Set();
          if (guard) for (let x = [r, c]; x; x = par.get(x.join())) chain.add(x.join());
          const sees = (a) => bres([r, c], a, (y, x) => losClear(y, x)
            && (!guard || !nb(y, x) || (chain.has(`${y},${x}`) && dist.get(`${y},${x}`) >= dist.get(a.join()))));
          let b = nxt.get(k);
          while (nxt.has(b.join()) && sees(nxt.get(b.join()))) b = nxt.get(b.join());
          nxt.set(k, b);
        }
      }
      return nxt;
    };
    const off = spfa(false);
    const dist = off.dist;
    const segNb = (a, b) => through(a, b).filter(([y, x]) => !(y === a[0] && x === a[1]) && nb(y, x)).length;
    const segWet = (a, b) => through(a, b).filter(([y, x]) => !(y === a[0] && x === a[1]) && deep(y, x)).length;
    let nxt = smooth(off, false);
    if (prefer) {
      // per tile in increasing distance: the preference pointer when its route crosses fewer non-blockable tiles (or as
      // few while it only skips the official waypoint: o strictly inside the segment a → p, and o's chosen pointer is p)
      // and no more 深水区 than the official pointer's route
      const nxtP = smooth(spfa(true), true);
      const cost = new Map([[D, 0]]);
      const wet = new Map([[D, 0]]);
      const chosen = new Map();
      const skips = (a, o, p) => {
        const t = through(a, p);
        return key(o) !== key(a) && key(o) !== key(p) && (o[0] - a[0]) * (p[1] - a[1]) === (o[1] - a[1]) * (p[0] - a[0]) && t.some((x) => key(x) === key(o));
      };
      for (const k of [...dist.keys()].sort((a, b) => dist.get(a) - dist.get(b))) {
        if (k === D) continue;
        const a = unkey(k), o = nxt.get(k), p = nxtP.get(k);
        const co = segNb(a, o) + cost.get(key(o)), cp = segNb(a, p) + cost.get(key(p));
        const wo = segWet(a, o) + wet.get(key(o)), wp = segWet(a, p) + wet.get(key(p));
        const useP = wp <= wo && (cp < co || (cp === co && key(o) !== key(p) && key(chosen.get(key(o)) ?? []) === key(p) && skips(a, o, p)));
        chosen.set(k, useP ? p : o);
        cost.set(k, useP ? cp : co);
        wet.set(k, useP ? wp : wo);
      }
      nxt = chosen;
    }
    const chainOf = (start) => {
      if (!dist.has(start.join())) return null;
      const out = [start];
      let k = start.join();
      while (k !== D && out.length < 100) { const n = nxt.get(k); out.push(n); k = n.join(); }
      return out;
    };
    const fn = (start) => { const ch = chainOf(start); return ch ? ch.map((p) => `(${p})`).join(' ') : null; };
    fn.dist = (start) => dist.get(start.join()) ?? -1;
    fn.crossedNb = (start) => {
      const ch = chainOf(start);
      if (!ch) return null;
      let n = 0;
      for (let i = 1; i < ch.length; i++) n += segNb(ch[i - 1], ch[i]);
      return n;
    };
    return fn;
  };
}

function simGrid(sid, rect, extra = {}) {
  const st = getDefaultSource().getStage(sid);
  const g = new Grid(st, rect);
  for (const d of st.raw.devices) {
    if (!d.active || !d.pos) continue;
    if (d.role === 'crate') g.setObstacle(d.pos[0], d.pos[1], true, 'crate');
    if (d.role === 'platform' || d.role === 'mound') g.setObstacle(d.pos[0], d.pos[1], true);
  }
  for (const [r, c] of extra.crates || []) g.setObstacle(r, c, true, 'crate');
  for (const [r, c] of extra.blocks || []) g.setObstacle(r, c, true);
  return g;
}

function compare(sid, rect, dests, extra = {}, officialRect = null) {
  const off = official(sid, { ...extra, rect: officialRect, prefer: true });
  const g = simGrid(sid, rect, extra);
  let n = 0;
  for (const dest of dests) {
    const chainOf = off(dest);
    for (let r = rect.r0; r <= rect.r1; r++) {
      for (let c = rect.c0; c <= rect.c1; c++) {
        if (!g.walkable(r, c)) continue;
        const wp = g.waypoints(r, c, dest[0], dest[1]);
        assert.equal(wp ? wp.map((p) => `(${p})`).join(' ') : null, chainOf([r, c]), `${sid} (${r},${c}) → (${dest}) ${JSON.stringify(extra)}`);
        n++;
      }
    }
  }
  return n;
}

test('every walkable tile of the normal / 联防 / boss fields of the 8 stages follows the full-map reference chain', SKIP, () => {
  let n = 0;
  for (const sid of STAGES) {
    n += compare(sid, GEO.NORMAL_RECT, [[9, 2]]);
    n += compare(sid, GEO.UNITE_RECT, [[9, 2]]);
    n += compare(sid, GEO.BOSS_RECT, [[1, 3], [1, 17], [2, 2], [2, 18]]);
  }
  assert.ok(n > 1500, `${n} chains`);
});

test('random crate / block layouts: identical flow fields and smoothing to the reference algorithm (same rect)', SKIP, () => {
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  let n = 0;
  for (let t = 0; t < 400; t++) {
    const sid = STAGES[t % STAGES.length];
    const crates = [], blocks = [];
    for (let i = 0; i < 6; i++) crates.push([9 + Math.floor(rnd() * 4), Math.floor(rnd() * 11)]);
    for (let i = 0; i < 2; i++) blocks.push([9 + Math.floor(rnd() * 4), 3 + Math.floor(rnd() * 7)]);
    n += compare(sid, GEO.NORMAL_RECT, [[9, 2]], { crates, blocks }, GEO.NORMAL_RECT);
  }
  assert.ok(n > 5000, `${n} chains`);
});

test('vs the PURE official algorithm: same route length from every tile, never more non-blockable tiles crossed', SKIP, () => {
  let n = 0, fewer = 0;
  const fields = [[GEO.NORMAL_RECT, [[9, 2]]], [GEO.UNITE_RECT, [[9, 2]]], [GEO.BOSS_RECT, [[1, 3], [1, 17], [2, 2], [2, 18]]]];
  for (const sid of STAGES) {
    const pure = official(sid, { prefer: false });
    const ours = official(sid, { prefer: true });
    for (const [rect, dests] of fields) {
      const g = simGrid(sid, rect);
      for (const dest of dests) {
        const p = pure(dest), o = ours(dest);
        const f = g.flowField(dest[0], dest[1]);
        for (let r = rect.r0; r <= rect.r1; r++) {
          for (let c = rect.c0; c <= rect.c1; c++) {
            if (!g.walkable(r, c) || p.dist([r, c]) < 0) continue;
            assert.equal(f.dist[r * 21 + c], p.dist([r, c]), `${sid} (${r},${c}) → (${dest}): official length`);
            const a = p.crossedNb([r, c]), b = o.crossedNb([r, c]);
            assert.ok(b <= a, `${sid} (${r},${c}) → (${dest}): ${b} non-blockable tiles vs official ${a}`);
            if (b < a) fewer++;
            n++;
          }
        }
      }
    }
  }
  assert.ok(n > 1500 && fewer > 0, `${n} chains, ${fewer} with fewer non-blockable tiles`);
  // the user's report: 战场#01 lower gate — official climbs the col-9 floor lane, ours keeps to the col-8 road
  assert.equal(official('act1autochess_m01', { prefer: false })([9, 2])([9, 10]), '(9,10) (9,9) (12,8) (12,4) (9,4) (9,2)');
  assert.equal(official('act1autochess_m01', { prefer: true })([9, 2])([9, 10]), '(9,10) (9,8) (12,8) (12,4) (9,4) (9,2)');
});
