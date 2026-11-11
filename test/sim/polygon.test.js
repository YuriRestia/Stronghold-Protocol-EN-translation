// test/sim/polygon.test.js — (fork) server/sim/polygon.js: the client's Thorn2PolygonRange area (引星棘刺 S3) — the hull
// of the operators' tiles pushed out 0.325 on every edge (a 0.65 strip when they stand in one line), and the collider
// overlap tests; body.js bodyInConvex.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convexHull, thorn2Area, circleInConvex, rectInConvex, POLYGON_LINE_WIDE, POLYGON_OFFSET } from '../../server/sim/polygon.js';
import { bodyInConvex } from '../../server/sim/body.js';

const sorted = (pts) => pts.map((p) => p.join(',')).sort();

test('convexHull: the corners only — inner points, repeats and points on an edge dropped; same set in any order', () => {
  const pts = [[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [2, 0], [4, 4]];
  assert.deepEqual(sorted(convexHull(pts)), sorted([[0, 0], [4, 0], [4, 4], [0, 4]]));
  assert.deepEqual(convexHull(pts.slice().reverse()), convexHull(pts));
  assert.deepEqual(convexHull([[1, 1], [3, 3], [2, 2]]), [[1, 1], [3, 3]], 'one line: its two ends');
  assert.deepEqual(convexHull([[5, 5], [5, 5]]), [[5, 5]]);
  assert.deepEqual(convexHull([]), []);
});

test('thorn2Area: every hull edge pushed out 0.325 (the client loop); in one line a strip 0.65 wide over the segment', () => {
  assert.equal(POLYGON_LINE_WIDE, 0.325);
  assert.equal(POLYGON_OFFSET, 0.325);
  const tri = thorn2Area([[3, 10], [6, 12], [10, 12]]);
  assert.equal(tri.hull.length, 3);
  assert.equal(tri.shape.length, 6, 'two points per edge');
  for (const p of tri.hull) assert.ok(circleInConvex(tri.shape, p[0], p[1], 0), 'the corners lie inside');
  // the top edge (6,12)-(10,12) moves up by 0.325
  assert.ok(tri.shape.some(([x, y]) => x === 6 && Math.abs(y - 12.325) < 1e-12));
  assert.ok(tri.shape.some(([x, y]) => x === 10 && Math.abs(y - 12.325) < 1e-12));
  const strip = thorn2Area([[2, 5], [6, 5], [4, 5]]);
  assert.deepEqual(strip.hull, [[2, 5], [6, 5]], 'the line runs between the two ends');
  const xs = strip.shape.map((p) => p[0]), ys = strip.shape.map((p) => p[1]);
  assert.equal(Math.min(...xs), 2, 'no overrun past an end');
  assert.equal(Math.max(...xs), 6);
  assert.ok(Math.abs(Math.max(...ys) - 5.325) < 1e-12 && Math.abs(Math.min(...ys) - 4.675) < 1e-12, '0.65 wide');
  const one = thorn2Area([[4, 4]]);
  assert.deepEqual(one, { hull: [[4, 4]], shape: [[4, 4]] }, 'one point: the point itself');
  assert.ok(circleInConvex(one.shape, 4.05, 4, 0.1) && !circleInConvex(one.shape, 4.2, 4, 0.1));
  assert.deepEqual(thorn2Area([]), { hull: [], shape: [] });
});

test('thorn2Area in one row (roster-043: operators at cols 6, 7, 8 of row 11): an enemy walking across the row is in', () => {
  const { shape } = thorn2Area([[8, 11], [7, 11], [6, 11]]);
  assert.ok(bodyInConvex({ x: 7.5, y: 11.4 }, shape), 'within 0.325 + its 0.1 collider of the row');
  assert.ok(!bodyInConvex({ x: 7.5, y: 11.5 }, shape));
  assert.ok(bodyInConvex({ x: 5.95, y: 11 }, shape), 'just before the first operator, by its collider');
  assert.ok(!bodyInConvex({ x: 5.8, y: 11 }, shape), 'no overrun past the end');
});

test('circleInConvex / rectInConvex: inside, touching within the radius, outside', () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert.ok(circleInConvex(sq, 2, 2, 0.1));
  assert.ok(circleInConvex(sq, 4.09, 2, 0.1), 'its circle reaches the edge');
  assert.ok(!circleInConvex(sq, 4.2, 2, 0.1));
  assert.ok(!circleInConvex(sq, 4.08, 4.08, 0.1), 'past a corner by more than the radius');
  assert.ok(circleInConvex([[0, 0], [4, 4], [0, 4]], 1, 3, 0), 'either winding');
  assert.ok(!circleInConvex([], 0, 0, 1));
  assert.ok(rectInConvex(sq, { x0: 3.5, x1: 6, y0: -1, y1: 1 }), 'overlapping a corner');
  assert.ok(!rectInConvex([[0, 0], [4, 0], [0, 4]], { x0: 2.6, x1: 4, y0: 2.6, y1: 4 }), 'beyond the slanted edge (separating axis)');
  assert.ok(rectInConvex([[0, 0], [4, 0], [0, 4]], { x0: 1.9, x1: 4, y0: 1.9, y1: 4 }));
});

test('bodyInConvex: a regular enemy by its 0.1 circle, a huge one by its rectangle', () => {
  const tri = thorn2Area([[3, 10], [6, 12], [10, 12]]).shape;
  assert.ok(bodyInConvex({ x: 8, y: 12 }, tri), 'on the edge between two operators');
  assert.ok(bodyInConvex({ x: 8, y: 12.4 }, tri), 'the edge sits 0.325 out');
  assert.ok(!bodyInConvex({ x: 8, y: 12.45 }, tri));
  assert.ok(!bodyInConvex({ x: 3, y: 9 }, tri));
  const huge = { x: 3, y: 8.6, hitArea: { w: 4.95, h: 2.95, dx: 0, dy: 0 } };
  assert.ok(bodyInConvex(huge, tri), 'its rectangle reaches the corner');
});
