// test/sim/polygon.test.js — (fork) server/sim/polygon.js: the client's Thorn2PolygonRange area (引星棘刺 S3) — the hull
// of the operators' tiles, the strip when they stand in one line, and the collider overlap tests; body.js bodyInConvex.

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

test('thorn2Area: the hull is the collider with 3+ corners; a strip 0.325 wide running 0.325 past each end in one line', () => {
  assert.equal(POLYGON_LINE_WIDE, 0.325);
  assert.equal(POLYGON_OFFSET, 0.325);
  const tri = thorn2Area([[3, 10], [6, 12], [10, 12]]);
  assert.equal(tri.hull.length, 3);
  assert.deepEqual(tri.shape, tri.hull);
  const strip = thorn2Area([[2, 5], [6, 5], [4, 5]]);
  assert.deepEqual(strip.hull, [[2, 5], [6, 5]], 'the line runs between the two ends');
  const xs = strip.shape.map((p) => p[0]), ys = strip.shape.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) - (2 - 0.325)) < 1e-12 && Math.abs(Math.max(...xs) - (6 + 0.325)) < 1e-12, 'overrun');
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 0.325) < 1e-12, 'width');
  const one = thorn2Area([[4, 4]]);
  assert.equal(one.hull.length, 1);
  assert.equal(one.shape.length, 4);
  assert.deepEqual(thorn2Area([]), { hull: [], shape: [] });
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
  assert.ok(bodyInConvex({ x: 8, y: 12.09 }, tri));
  assert.ok(!bodyInConvex({ x: 8, y: 12.2 }, tri));
  assert.ok(!bodyInConvex({ x: 3, y: 9 }, tri));
  const huge = { x: 3, y: 8.6, hitArea: { w: 4.95, h: 2.95, dx: 0, dy: 0 } };
  assert.ok(bodyInConvex(huge, tri), 'its rectangle reaches the corner');
});
