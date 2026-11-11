// render/vfx/pathfx.js — (fork) the official line / path effects whose points the game supplies (effect-gaps audit 2,
// fix #8, 2026-11-11): the client's RangeLineEffectEmitter (a LineRenderer along the outer edge of a set of tiles) and
// AphrisEffectEmitter (a line from the caster through her relays to the path's end). render/vfx/skills.js marks these
// fields unmapped ('path' / 'tiles': "its points come from the game"); this module draws them from the kit fx that carry
// the points. Client only: the sim's fx only gained fields (no new event, no golden move).
//
//   const p = new PathFx(wiring)
//   p.simFx(kind, x, y, extra, U)   a kit fx of unit record U (SkillFx.of): true when it claims the fx (the procedural
//                                   stand-in is skipped), false to let SkillFx go on (an outline added beside it)
//   p.sync()                        every frame: the outlines that follow a unit, the expiry of a field
//   p.skillOff(id) / p.reset() / p.clear()
//
// Pure helpers (tests): edgeLoops(tiles) — the closed outlines of a tile set through the tile corners —, pathCorners(tiles)
// — the start, the turns and the end of a tile path.

import { unitPoint } from './mounts.js';

const lc = (k) => (typeof k === 'string' && k ? k.toLowerCase() : null);
/** Run `fn` after `s` battle seconds on the effects' clock (skillfx.js `later`; not imported: skillfx imports this). */
const later = (ofx, s, fn) => { if (!ofx.timers) ofx.timers = []; ofx.timers.push({ at: ofx.time + Math.max(0, s), fn }); };

/**
 * Official line effects of a kit fx, by the owner's skill id → fx kind. Shapes:
 *   field   { tile, edge }: the fx's `tiles` ([row, col]…) re-sent every so often under `key` (it fades `dur` s after the
 *           last one): `tile` loops on every tile, `edge` (a RangeLineEffectEmitter's _edgeLineRendererEffectKey) runs
 *           along the field's outer edges, one line per closed outline. The procedural field is skipped.
 *   follow  { edge }: the fx's `range` tiles plus the tiles within `around` of the owner where he stands now, outlined
 *           by `edge` until his skill ends (an attack range that moves with him). The fx itself stays the kit's.
 *   beam    { line, start, waypoint, end }: the fx's `path` ([row, col]… from the owner's tile) as one line from the
 *           owner's muzzle through its turns to its last tile; `start` on the owner, `waypoint` on each tile of
 *           `relays` (indices into the path), `end` at the last tile — held until the owner's skill ends.
 */
export const PATH_BINDINGS = Object.freeze({
  // 国度 (char_4246_dminon) T1 实质坍缩 “国度”: the client's Kingdom ability (Others/Direction/CommonAbilities/Kingdom) — a
  // TileEffectEmitter's dminon_talent_range_01 on every tile of his range and a RangeLineEffectEmitter's
  // dminon_range_line_01 along its edge (it follows the range: OnCharacterAttackRangeUpdate). The kit's 'domain' fx
  // (op-dminon.js) re-sends his range every 0.5 s while he stands. A talent: the same under each of his skills.
  ...Object.fromEntries(['skchr_dminon_1', 'skchr_dminon_2', 'skchr_dminon_3'].map((s) => [s, Object.freeze({
    domain: Object.freeze({ field: Object.freeze({ tile: 'dminon_talent_range_01', edge: 'dminon_range_line_01' }) }),
  })])),
  // 予愿安洁莉娜 (char_1015_aglna2) S3 酸橙的心事: its RangeLineEffectEmitter's aglna2_skill_03_range_line_01 along her
  // running attack range — the original 3-9 of her deployment tile and the eight tiles around her as she flies
  // (op-aglna2.js s3Targeting). Her S3 start's 'takeoff' fx carries the 3-9 tiles (`range`) and `around` (1).
  skchr_aglna2_3: Object.freeze({
    takeoff: Object.freeze({ follow: Object.freeze({ edge: 'aglna2_skill_03_range_line_01' }) }),
  }),
  // 谬因 (char_4229_aphris) S2 临界瞬爆: the ChannelingMeleeAttack's AphrisEffectEmitter — line aphris_skill_02_line_01,
  // start aphris_skill_02_start_01 (startMountType 2: her muzzle), waypoint token_aphris_pc_skill_02_buff_01 on each
  // 中继器 (waypointFixedHeight 0.65), end aphris_skill_02_line_point_01. The kit's 'beam' fx carries the path.
  skchr_aphris_2: Object.freeze({
    beam: Object.freeze({ beam: Object.freeze({ line: 'aphris_skill_02_line_01', start: 'aphris_skill_02_start_01',
      waypoint: 'token_aphris_pc_skill_02_buff_01', end: 'aphris_skill_02_line_point_01', height: 0.65 }) }),
  }),
});

/** Every prefab key PATH_BINDINGS plays (coverage, tests). */
export function pathBindingKeys() {
  const out = new Set();
  for (const kinds of Object.values(PATH_BINDINGS)) {
    for (const b of Object.values(kinds)) for (const part of Object.values(b)) for (const v of Object.values(part)) if (typeof v === 'string') out.add(v);
  }
  return [...out];
}

// ---- geometry ------------------------------------------------------------------------------------------------------

const tk = (r, c) => `${r},${c}`;

/**
 * The closed outlines of a set of tiles ([row, col]…): each a list of tile corners { x, y } in board units (x = col ± 0.5,
 * y = row ± 0.5), clockwise on screen (rows grow down), its first corner repeated at the end, straight runs merged.
 * Where two tiles touch only at a corner, each keeps its own outline (the walk turns toward the tile it came along).
 * Holes come out as outlines of their own. Sorted by their first corner, so the same set gives the same list.
 */
export function edgeLoops(tiles) {
  const set = new Set();
  for (const t of Array.isArray(tiles) ? tiles : []) if (Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1])) set.add(tk(t[0], t[1]));
  if (!set.size) return [];
  // directed edges in doubled coordinates (corners at odd values): interior on the right going clockwise on screen
  const out = new Map();   // start corner → [edge…]
  const edges = [];
  const add = (x0, y0, x1, y1) => {
    const e = { x0, y0, x1, y1, used: false };
    edges.push(e);
    const k = `${x0},${y0}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(e);
  };
  for (const key of set) {
    const [r, c] = key.split(',').map(Number);
    const L = 2 * c - 1, R = 2 * c + 1, T = 2 * r - 1, B = 2 * r + 1;
    if (!set.has(tk(r - 1, c))) add(L, T, R, T);   // top: left → right
    if (!set.has(tk(r, c + 1))) add(R, T, R, B);   // right: top → bottom
    if (!set.has(tk(r + 1, c))) add(R, B, L, B);   // bottom: right → left
    if (!set.has(tk(r, c - 1))) add(L, B, L, T);   // left: bottom → top
  }
  edges.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const loops = [];
  for (const first of edges) {
    if (first.used) continue;
    const pts = [[first.x0, first.y0]];
    let e = first;
    for (let guard = 0; e && guard <= edges.length; guard++) { // loop-cap: every edge is walked once
      e.used = true;
      pts.push([e.x1, e.y1]);
      if (e.x1 === first.x0 && e.y1 === first.y0) break;
      const dx = Math.sign(e.x1 - e.x0), dy = Math.sign(e.y1 - e.y0);
      const next = (out.get(`${e.x1},${e.y1}`) || []).filter((n) => !n.used);
      // a pinch corner (two tiles meeting diagonally): the right turn keeps to the tile the walk came along
      next.sort((a, b) => cross(dx, dy, b) - cross(dx, dy, a));
      e = next[0] || null;
    }
    loops.push(merge(pts).map(([x, y]) => ({ x: x / 2, y: y / 2 })));
  }
  return loops;
}

/** z of (dx, dy) × the direction of edge n (y down: a right turn is positive). */
const cross = (dx, dy, n) => dx * Math.sign(n.y1 - n.y0) - dy * Math.sign(n.x1 - n.x0);

/** A closed corner list without the corners in the middle of a straight run (the first one repeated at the end). */
function merge(pts) {
  const ring = pts.slice(0, -1);
  const n = ring.length;
  if (n < 3) return pts;
  const keep = ring.filter((p, i) => {
    const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
  return keep.length ? [...keep, keep[0]] : pts;
}

/** The start, every turn and the end of a tile path ([row, col]… in walking order); returns indices into it. */
export function pathCorners(tiles) {
  const n = Array.isArray(tiles) ? tiles.length : 0;
  if (n < 2) return n ? [0] : [];
  const out = [0];
  for (let i = 1; i < n - 1; i++) {
    const a = tiles[i - 1], b = tiles[i], c = tiles[i + 1];
    if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) out.push(i);
  }
  out.push(n - 1);
  return out;
}

/** A tile set's signature (the same tiles in any order: the same string). */
export function tileSig(tiles) {
  return (Array.isArray(tiles) ? tiles : []).filter(Array.isArray).map((t) => tk(t[0], t[1])).sort().join(';');
}

// ---- the effects -----------------------------------------------------------------------------------------------------

/** Unity battle frame of a board point (mounts.js unitPoint: feet (x, y, z) → (x − 10, y − 9, −z)). */
const unity = (x, y, z, out = [0, 0, 0]) => { out[0] = x - 10; out[1] = y - 9; out[2] = -z; return out; };

/** Lift of an outline over the ground (the prefab's static_offset: 0.01) so it never sinks into the tiles. */
const EDGE_LIFT = 0.01;

export class PathFx {
  constructor(w) {
    this.w = w;
    this.fields = new Map();    // key → { tiles: Map(tileKey → handle), edges: [{ h, pts }], sig, until, edge }
    this.follows = new Map();   // owner id → { v, base: [[r, c]…], around, edge, sig, edges: [{ h, pts }] }
    this.beams = new Map();     // owner id → [handle…]
  }

  /** Whether the prefab is installed (the outfit's twin of it, by the unit it belongs to). */
  _key(k, v) {
    const key = this.w.skinKey?.(lc(k), v) || lc(k);
    return key && this.w.ofx.lib.has(key) ? key : null;
  }

  /** A board point's ground height (the field's tile heights), else 0. */
  _h(r, c) {
    const hAt = this.w.ofx.ctx?.heightAt;
    const h = typeof hAt === 'function' ? Number(hAt(r, c)) : NaN;
    return Number.isFinite(h) ? Math.max(0, h) : 0;
  }

  /** The Unity points of a corner outline over the tile set `set` (each corner at its highest tile of the set). */
  _edgePts(loop, set) {
    return loop.map((p) => {
      let h = 0;
      for (const [r, c] of [[p.y - 0.5, p.x - 0.5], [p.y - 0.5, p.x + 0.5], [p.y + 0.5, p.x - 0.5], [p.y + 0.5, p.x + 0.5]]) {
        if (set.has(tk(r, c))) h = Math.max(h, this._h(r, c));
      }
      return unity(p.x, p.y, h + EDGE_LIFT);
    });
  }

  /** Keep one line effect `key` per outline of `tiles` in `list` ({ h, pts }…): the points move, lines come and go. */
  _outline(list, key, tiles, owner) {
    const set = new Set(tiles.map((t) => tk(t[0], t[1])));
    const loops = edgeLoops(tiles).map((l) => this._edgePts(l, set));
    while (list.length > loops.length) list.pop().h?.stop();
    for (let i = 0; i < loops.length; i++) {
      const slot = list[i] || (list[i] = { h: null, pts: null });
      slot.pts = loops[i];
      if (slot.h && slot.h.alive !== false) continue;
      const S = slot;
      slot.h = this.w.ofx.spawn(key, { pos: S.pts[0].slice(), groundZ: 0 }, {
        loop: true, important: true, owner,
        track: (fx) => { if (S.pts && S.pts.length >= 2) { fx.anchor[0] = S.pts[0][0]; fx.anchor[1] = S.pts[0][1]; fx.anchor[2] = S.pts[0][2]; fx.setLinePoints(S.pts); } },
      });
    }
    return list.some((s) => s.h);
  }

  /** b.ev ['fx', kind, x, y, extra] of unit record U: true when the official layer draws it instead (see header). */
  simFx(kind, x, y, extra, U) {
    const b = U && U.skillId ? PATH_BINDINGS[U.skillId]?.[kind] : null;
    if (!b || !extra || typeof extra !== 'object') return false;
    if (b.field) return this._field(b.field, extra, U);
    if (b.follow) { this._follow(b.follow, extra, U); return false; }
    if (b.beam) return this._beam(b.beam, extra, U);
    return false;
  }

  /** A field the kit re-sends (国度's kingdom): its tiles and its outline, gone `dur` s after the last fx. */
  _field(spec, extra, U) {
    const tiles = (Array.isArray(extra.tiles) ? extra.tiles : []).filter((t) => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]));
    const tileKey = this._key(spec.tile, U.v), edgeKey = this._key(spec.edge, U.v);
    if (!tiles.length || (!tileKey && !edgeKey)) return false;
    const id = extra.key != null ? String(extra.key) : `field:${extra.id}`;
    const F = this.fields.get(id) || { tiles: new Map(), edges: [], sig: '', until: 0 };
    this.fields.set(id, F);
    const sig = tileSig(tiles);
    if (sig !== F.sig) {
      F.sig = sig;
      const want = new Set(tiles.map((t) => tk(t[0], t[1])));
      for (const [k, h] of F.tiles) if (!want.has(k)) { h?.stop(); F.tiles.delete(k); }
      if (tileKey) {
        for (const [r, c] of tiles) {
          const k = tk(r, c);
          if (F.tiles.has(k) && F.tiles.get(k)?.alive !== false) continue;
          F.tiles.set(k, this.w.playOn(tileKey, { id: 'fx:point', x: c, y: r, z: this._h(r, c) }, { loop: true, important: true }));
        }
      }
      if (edgeKey) this._outline(F.edges, edgeKey, tiles, extra.id);
    }
    const dur = Number(extra.dur) > 0 ? Number(extra.dur) : 0.75;
    F.until = this.w.ofx.time + dur;
    later(this.w.ofx, dur + 1e-3, () => { if (this.fields.get(id) === F && this.w.ofx.time >= F.until) this._endField(id); });
    return [...F.tiles.values()].some(Boolean) || F.edges.some((s) => s.h);
  }

  _endField(id) {
    const F = this.fields.get(id);
    if (!F) return;
    for (const h of F.tiles.values()) h?.stop();
    for (const s of F.edges) s.h?.stop();
    this.fields.delete(id);
  }

  /** An outline that follows its owner (予愿安洁莉娜 S3's range) until his skill ends. */
  _follow(spec, extra, U) {
    const base = (Array.isArray(extra.range) ? extra.range : []).filter((t) => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]));
    const edgeKey = this._key(spec.edge, U.v);
    if (!edgeKey || !U.v || (!base.length && !(extra.around >= 0))) return;
    this._endFollow(U.id);
    const around = Number.isInteger(extra.around) && extra.around >= 0 ? extra.around : -1;
    this.follows.set(U.id, { v: U.v, base, around, edge: edgeKey, sig: '', edges: [] });
    this._stepFollow(U.id);
  }

  _stepFollow(id) {
    const P = this.follows.get(id);
    if (!P) return;
    const v = P.v;
    if (!v || v.destroyed || v.alive === false) { this._endFollow(id); return; }
    const tiles = P.base.slice();
    if (P.around >= 0) {
      const r0 = Math.round(v.y), c0 = Math.round(v.x);
      for (let dr = -P.around; dr <= P.around; dr++) for (let dc = -P.around; dc <= P.around; dc++) tiles.push([r0 + dr, c0 + dc]);
    }
    const sig = tileSig(tiles);
    if (sig === P.sig && P.edges.every((s) => s.h && s.h.alive !== false)) return;
    P.sig = sig;
    this._outline(P.edges, P.edge, tiles, id);
  }

  _endFollow(id) {
    const P = this.follows.get(id);
    if (!P) return;
    for (const s of P.edges) s.h?.stop();
    this.follows.delete(id);
  }

  /** 谬因 S2's beam: the line along the fx's path and its point effects, until her skill ends. */
  _beam(spec, extra, U) {
    const path = (Array.isArray(extra.path) ? extra.path : []).filter((t) => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]));
    const v = U.v;
    if (!v || path.length < 2) return false;
    const lineKey = this._key(spec.line, v);
    if (!lineKey) return false;
    this._endBeam(U.id);
    const hs = [];
    const lift = Number(spec.height) > 0 ? Number(spec.height) : 0.65;
    const corners = pathCorners(path);
    // her muzzle, then each turn and the last tile at the waypoints' fixed height over the ground there
    const pts = [[0, 0, 0], ...corners.slice(1).map((i) => unity(path[i][1], path[i][0], this._h(path[i][0], path[i][1]) + lift))];
    const skin = this.w.skinOf(this.w.unitOf(v));
    const muzzle = () => unitPoint(skin, 'muzzle', this.w.pose(v), pts[0]);
    muzzle();
    const line = this.w.ofx.spawn(lineKey, { pos: pts[0].slice(), groundZ: -(v.z || 0) }, {
      loop: true, important: true, owner: U.id,
      track: (fx) => {
        if (!v.destroyed && v.alive !== false) muzzle();
        fx.anchor[0] = pts[0][0]; fx.anchor[1] = pts[0][1]; fx.anchor[2] = pts[0][2];
        fx.setLinePoints(pts);
      },
    });
    if (line) hs.push(line);
    const startKey = this._key(spec.start, v);
    if (startKey) { const h = this.w.playOn(startKey, v, { loop: true, important: true }); if (h) hs.push(h); }
    const wpKey = this._key(spec.waypoint, v);
    for (const i of Array.isArray(extra.relays) ? extra.relays : []) {
      const t = path[i];
      if (!wpKey || !t) continue;
      const h = this.w.playOn(wpKey, { id: 'fx:point', x: t[1], y: t[0], z: this._h(t[0], t[1]) + lift }, { loop: true, important: true });
      if (h) hs.push(h);
    }
    const endKey = this._key(spec.end, v);
    const last = path[path.length - 1];
    if (endKey) { const h = this.w.playOn(endKey, { id: 'fx:point', x: last[1], y: last[0], z: this._h(last[0], last[1]) + lift }, { loop: true, important: true }); if (h) hs.push(h); }
    this.beams.set(U.id, hs);
    return !!line;
  }

  _endBeam(id) {
    for (const h of this.beams.get(id) || []) h?.stop();
    this.beams.delete(id);
  }

  /** Every frame (SkillFx.sync): the outlines that follow their owner. */
  sync() {
    for (const id of [...this.follows.keys()]) this._stepFollow(id);
    for (const [id, hs] of [...this.beams]) {
      const v = this.w.view(id);
      if (!v) this._endBeam(id);
      else if (hs.length && hs.every((h) => !h || h.alive === false)) this.beams.delete(id);
    }
  }

  /** The owner's skill ended (b.ev ['skill', id, 0]): its following outline and its beam go. */
  skillOff(id) {
    this._endFollow(id);
    this._endBeam(id);
  }

  /** The effects were cleared under us (a tier switch): forget the handles; a field returns with its next fx. */
  reset() {
    for (const F of this.fields.values()) { F.sig = ''; F.tiles.clear(); F.edges.length = 0; }
    for (const P of this.follows.values()) { P.sig = ''; P.edges.length = 0; }
    this.beams.clear();
  }

  /** Battle reset. */
  clear() {
    for (const id of [...this.fields.keys()]) this._endField(id);
    for (const id of [...this.follows.keys()]) this._endFollow(id);
    for (const id of [...this.beams.keys()]) this._endBeam(id);
  }
}
