// server/sim/polygon.js — (fork) convex areas spanned by a set of points: the client's Thorn2PolygonRange (引星棘刺
// char_1039_thorn2 S3 “我的海疆”, 2026-11-12). Pure and deterministic: + − × ÷ only, no trigonometry, so every engine
// gives the same bits (detmath.js header).
//
// The client (Thorn2PolygonRange.InitPolygonCollidersIfNot → _DoCalculateHull → _OptimizeLineCollider): the tiles of
// the operators the alchemy units land on, as map points (tile centres), make a convex hull (a Graham scan: the lowest
// point first, the rest sorted by angle, right turns popped); points on a straight edge are dropped (_Cross ≈ 0, 1e-5).
// That hull is `resultForEffect`, the corners the S3 line (Thorn2S3Renderer, thorn2_skill_03_line) runs through. The
// collider is the hull itself when it has 3+ corners; when every point lies on one line it is a strip along it,
// _polygonLineColliderWide (0.325) wide and running _polygonColliderOffset (0.325) past each end. An enemy is in the
// area when its collider (a circle, or a huge unit's rectangle) overlaps it (CheckTargetIn: Polygon2DPhysicsUtil
// PolygonCircle / PolygonRectangle).
//
//   convexHull(points)       [[x, y]…] → the hull's corners, in order, without repeats or straight-edge points
//   thorn2Area(points)       { hull, shape }: hull = the line's corners, shape = the convex collider ([] for no point)
//   circleInConvex(shape, x, y, r) / rectInConvex(shape, R)   the overlap tests (R = { x0, x1, y0, y1 })

/** Thorn2PolygonRange's prefab fields (projectile_chr_thorn2_s3_polygon): the strip's width and its overrun. */
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
 * The S3 area of the points ([x, y]…, the operators' tile centres): `hull` the line's corners (convexHull), `shape` the
 * collider — the hull when it has 3+ corners, else the strip around its segment (POLYGON_LINE_WIDE wide, POLYGON_OFFSET
 * past each end). One point: a square of the strip's overrun around it [ASSUMED: the client's strip has no direction
 * there; its box collider (_SetBoxCollider) is the only shape left].
 */
export function thorn2Area(points) {
  const hull = convexHull(points);
  if (hull.length >= 3) return { hull, shape: hull };
  if (hull.length === 1) {
    const [x, y] = hull[0], o = POLYGON_OFFSET;
    return { hull, shape: [[x - o, y - o], [x + o, y - o], [x + o, y + o], [x - o, y + o]] };
  }
  if (hull.length !== 2) return { hull, shape: [] };
  const [a, b] = hull;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len, o = POLYGON_OFFSET, w = POLYGON_LINE_WIDE / 2;
  const s = [a[0] - ux * o, a[1] - uy * o], e = [b[0] + ux * o, b[1] + uy * o];
  const nx = -uy * w, ny = ux * w;
  return { hull, shape: [[s[0] + nx, s[1] + ny], [e[0] + nx, e[1] + ny], [e[0] - nx, e[1] - ny], [s[0] - nx, s[1] - ny]] };
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
