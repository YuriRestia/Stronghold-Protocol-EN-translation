// server/sim/polygon.js — (fork) convex areas spanned by a set of points: the client's Thorn2PolygonRange (引星棘刺
// char_1039_thorn2 S3 “我的海疆”, 2026-11-12). Pure and deterministic: + − × ÷ only, no trigonometry, so every engine
// gives the same bits (detmath.js header).
//
// The client (Thorn2PolygonRange.InitPolygonCollidersIfNot → _DoCalculateHull → _OptimizeLineCollider): the grid
// positions of the operators the alchemy units land on (VisualObject.gridPosition → GridPosition.asLocalPosition: tile
// centres) make a convex hull (a Graham scan: left turns kept, _Cross ≤ 0 popped, so counter-clockwise); with exactly 3
// points on one line the middle one is dropped (Vector2.Distance sums, MathUtil.Equals). That hull is `resultForEffect`
// (m_resultOrigin), the corners the S3 line (Thorn2S3Renderer, thorn2_skill_03_line) runs through. The collider is
// the hull with every edge pushed OUT by _polygonColliderOffset (0.325): for each edge p→q, n = normalize(q.y − p.y,
// −(q.x − p.x)), the points p + 0.325·n and q + 0.325·n (_OptimizeLineCollider's loop, 1e-5 length guard). With 2
// points that is a strip 0.65 wide covering exactly the segment (no overrun past the ends). The client's separate
// 2-point branch (a strip _polygonLineColliderWide × 0.5 each side) tests result.Count == 2 right after result.Clear(),
// so it never runs. An enemy is in the area when its collider (a circle, or a huge unit's rectangle) overlaps it
// (CheckTargetIn: Polygon2DPhysicsUtil PolygonCircle / PolygonRectangle).
//
//   convexHull(points)       [[x, y]…] → the hull's corners, in order, without repeats or straight-edge points
//   thorn2Area(points)       { hull, shape }: hull = the line's corners, shape = the convex collider ([] for no point)
//   circleInConvex(shape, x, y, r) / rectInConvex(shape, R)   the overlap tests (R = { x0, x1, y0, y1 })

/** Thorn2PolygonRange's prefab fields (projectile_chr_thorn2_s3_polygon): the strip's width (only read by the client's
 * unreachable 2-point branch) and how far every edge of the area is pushed out. */
export const POLYGON_LINE_WIDE = 0.325;
export const POLYGON_OFFSET = 0.325;

const EPS = 1e-5;
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * The convex hull of `points` ([x, y]…): its corners in turn (counter-clockwise in x-right / y-up terms), no repeated
 * point, no point on a straight stretch of an edge. One point → [p]; all on one line → its two ends.
 */
export function convexHull(points) {
  const pts = [];
  const seen = new Set();
  for (const p of Array.isArray(points) ? points : []) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const k = `${p[0]},${p[1]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pts.push([p[0], p[1]]);
  }
  if (pts.length < 3) return pts.length === 2 ? pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]) : pts;
  // monotone chain: the same hull as the client's Graham scan, with no angle (atan2) to compute
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= EPS) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = half(pts).concat(half(pts.slice().reverse()));
  return hull.length >= 2 ? hull : [pts[0], pts[pts.length - 1]];
}

/**
 * The S3 area of the points ([x, y]…, the operators' tile centres): `hull` the line's corners (convexHull,
 * counter-clockwise), `shape` the collider — every hull edge pushed out by POLYGON_OFFSET (two points per edge, so a
 * 2-point hull gives a strip 2 × POLYGON_OFFSET wide over the segment). One point: the point itself [ASSUMED: the
 * client returns before the edge loop there and leaves the single point as the collider's polygon].
 */
export function thorn2Area(points) {
  const hull = convexHull(points);
  if (hull.length < 2) return { hull, shape: hull.map((p) => [p[0], p[1]]) };
  const o = POLYGON_OFFSET, shape = [];
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    let nx = q[1] - p[1], ny = -(q[0] - p[0]);
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > EPS) { nx /= len; ny /= len; } else { nx = 0; ny = 0; }
    shape.push([p[0] + o * nx, p[1] + o * ny], [q[0] + o * nx, q[1] + o * ny]);
  }
  return { hull, shape };
}

/** Is (x, y) inside the convex polygon `shape` (either winding; its edges count as inside)? */
function insideConvex(shape, x, y) {
  let sign = 0;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i], b = shape[(i + 1) % shape.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) <= 1e-12) continue;
    const s = c > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Does the circle (x, y, r) overlap the convex polygon `shape`? */
export function circleInConvex(shape, x, y, r) {
  if (!Array.isArray(shape) || !shape.length) return false;
  if (shape.length >= 3 && insideConvex(shape, x, y)) return true;
  const r2 = r * r + 1e-9;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i], b = shape[(i + 1) % shape.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], L = ex * ex + ey * ey;
    let t = L > 0 ? ((x - a[0]) * ex + (y - a[1]) * ey) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + ex * t - x, py = a[1] + ey * t - y;
    if (px * px + py * py <= r2) return true;
  }
  return false;
}

/** Does the axis-aligned rectangle R ({ x0, x1, y0, y1 }) overlap the convex polygon `shape`? (separating axes) */
export function rectInConvex(shape, R) {
  if (!Array.isArray(shape) || !shape.length || !R) return false;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of shape) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  if (maxX < R.x0 || minX > R.x1 || maxY < R.y0 || minY > R.y1) return false;
  const corners = [[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]];
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i], b = shape[(i + 1) % shape.length];
    const nx = a[1] - b[1], ny = b[0] - a[0];
    if (nx === 0 && ny === 0) continue;
    let pMin = Infinity, pMax = -Infinity, qMin = Infinity, qMax = -Infinity;
    for (const [x, y] of shape) { const d = x * nx + y * ny; pMin = Math.min(pMin, d); pMax = Math.max(pMax, d); }
    for (const [x, y] of corners) { const d = x * nx + y * ny; qMin = Math.min(qMin, d); qMax = Math.max(qMax, d); }
    if (pMax < qMin - 1e-12 || qMax < pMin - 1e-12) return false;
  }
  return true;
}
