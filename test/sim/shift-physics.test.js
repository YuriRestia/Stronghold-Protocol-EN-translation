// test/sim/shift-physics.test.js — (fork, GitHub #60) a push / pull is a slide, not a jump (battle/displacement.js
// _shiftStart / _shiftStep; arknights.wiki.gg Shift): the momentum of the push's 受力等级 (PUSH_MOMENTUM, mass 1), slowed
// every frame by ground friction 0.5 × 9.81 tiles/s², moved at the sim's 30 fps — which runs the official distances;
// pushes add up as momentum; a pull slides at a constant speed; walls stop the slide.
// Run: node --test test/sim/shift-physics.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { PUSH_TILES, PUSH_TILES_EFFECT, PUSH_MOMENTUM, SHIFT_FRICTION, PULL_TIME_K, TICK } from '../../server/sim/constants.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≈ ${b}`);

/** One still enemy (weight `mass`) at `pos` = [row, col] on an open stage. */
function field({ mass = 0, pos = [10, 3] } = {}) {
  const h = makeBattle({
    content: 'none', autoFinish: false, timeLimit: 120,
    defs: { enemies: { enemy_w: enemyRec({ key: 'enemy_w', hp: 1e7, speed: 0, mass }) } }, enemies: [{ key: 'enemy_w', pos }],
  });
  h.step();
  return { h, e: h.enemy('enemy_w') };
}
/** The positions (x) of `e` frame by frame until its slide is over. */
function track(h, e) {
  const xs = [e.x];
  for (let k = 0; k < 120 && e.shift; k++) { h.step(); xs.push(e.x); }
  return xs;
}

test('the model reproduces the push table at 30 fps: momentum, then friction each frame', () => {
  assert.equal(SHIFT_FRICTION, 4.905);
  for (const level of [-2, -1, 0, 1, 2, 3]) {
    let v = PUSH_MOMENTUM[level], d = 0, frames = 0;
    while (v > 0) { d += v * TICK; v -= SHIFT_FRICTION * TICK; frames++; }
    near(d, PUSH_TILES[level], 0.01, `受力等级 ${level}`);
    // the first frame lost: the 特效 column
    near(d - PUSH_MOMENTUM[level] * TICK, PUSH_TILES_EFFECT[level], 0.005, `受力等级 ${level}, 特效`);
  }
});

test('a push moves the enemy frame by frame, never in one jump, and slows down to a stop', () => {
  const { h, e } = field({ mass: 0 });
  const x0 = e.x;
  const moved = h.b.push(e, 0, { from: { x: x0 - 1, y: e.y } });   // 受力等级 0: 4 tiles/s
  near(moved, PUSH_TILES[0], 0.01, 'the return: the whole slide');
  near(e.x - x0, PUSH_MOMENTUM[0] * TICK, 1e-9, 'the hit frame: one frame of travel');
  const xs = track(h, e);
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(steps.every((s) => s <= PUSH_MOMENTUM[0] * TICK + 1e-9), 'no jump');
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] <= steps[i - 1] + 1e-9, 'slowing down');
  near(e.x - x0, moved, 1e-9, 'it ends where the push said');
  assert.equal(xs.length - 1, Math.round(0.8 / TICK), 'the 位移时间 (0.8 s) after the hit frame');
  checkInvariants(h.b);
});

test('an effect push loses its first frame of travel (the 特效 column)', () => {
  const { h, e } = field({ mass: 0 });
  const x0 = e.x;
  const moved = h.b.push(e, 0, { from: { x: x0 - 1, y: e.y }, effect: true });
  assert.equal(e.x, x0, 'nothing on the hit frame');
  near(moved, PUSH_TILES_EFFECT[0], 0.005);
  track(h, e);
  near(e.x - x0, moved, 1e-9);
});

test('momentum stacks: a second push on a sliding enemy sends it farther than the two pushes apart', () => {
  const one = field({ mass: 0 });
  const x1 = one.e.x;
  one.h.b.push(one.e, 0, { from: { x: x1 - 1, y: one.e.y } });
  track(one.h, one.e);
  const single = one.e.x - x1;
  const two = field({ mass: 0 });
  const x2 = two.e.x;
  two.h.b.push(two.e, 0, { from: { x: x2 - 1, y: two.e.y } });
  two.h.step(3);
  const sofar = two.e.x - x2;
  const more = two.h.b.push(two.e, 0, { from: { x: two.e.x - 1, y: two.e.y } });
  track(two.h, two.e);
  near(two.e.x - x2, sofar + more, 1e-9, 'it ends where the second push said');
  assert.ok(two.e.x - x2 > 2 * single, `${(two.e.x - x2).toFixed(3)} > 2 × ${single.toFixed(3)}`);
});

test('a wall stops the slide where it stands; the push returns what it will travel', () => {
  const { h, e } = field({ mass: 0, pos: [10, 3] });
  const x0 = e.x;
  // to the left: the field's edge
  const moved = h.b.push(e, 3, { from: { x: x0 + 1, y: e.y } });
  assert.ok(moved < PUSH_TILES[3], `short of the table (${moved})`);
  track(h, e);
  near(x0 - e.x, moved, 1e-9);
  assert.equal(e.shift, null, 'over');
});

test('a pull slides at a constant speed over 0.65·√distance (at most 1 s)', () => {
  const { h, e } = field({ mass: 1, pos: [10, 8] });
  const x0 = e.x;
  const to = { x: x0 - 4, y: e.y };
  const moved = h.b.pull(e, 0, { to, stop: 0 });   // 受力等级 −1: 35 % of 4 tiles
  near(moved, 0.35 * 4, 1e-9);
  const xs = track(h, e);
  const steps = xs.slice(1).map((x, i) => xs[i] - x);
  const T = Math.min(1, PULL_TIME_K * Math.sqrt(4));
  near(xs.length * TICK, T, TICK + 1e-9, 'over its time');
  near(steps[0], steps[1], 1e-9, 'a constant speed');
  near(x0 - e.x, moved, 1e-9);
});

test('a pull ends a push\'s slide; a static body and 浮空 are never slid', () => {
  const { h, e } = field({ mass: 0, pos: [10, 6] });
  h.b.push(e, 0, { from: { x: e.x - 1, y: e.y } });
  h.step(2);
  const x = e.x;
  h.b.pull(e, 1, { to: { x: x - 2, y: e.y }, stop: 0 });
  track(h, e);
  near(e.x, x - 2, 1e-9, 'pulled all the way, the push forgotten');
  const f = field({ mass: 0 });
  f.h.b.push(f.e, 3, { from: { x: f.e.x - 1, y: f.e.y } });
  f.h.b.applyStatus(f.e, 'levitate', { duration: 1, force: true });
  f.h.step();
  assert.equal(f.e.shift, null, '浮空 clears the force');
});

test('a sliding enemy is not blocked on the way: it slides past a blocker, and is blocked only where the slide ends', () => {
  const guard = chessRec({ id: 't_guard', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  const h = makeBattle({
    content: 'none', autoFinish: false, timeLimit: 120,
    defs: { enemies: { enemy_w: enemyRec({ key: 'enemy_w', hp: 1e7, speed: 0, mass: 0 }) }, chess: { t_guard: guard } },
    units: [{ chessId: 't_guard', row: 10, col: 5 }], enemies: [{ key: 'enemy_w', pos: [10, 3] }],
  });
  h.step();
  const e = h.enemy('enemy_w');
  h.b.push(e, 3, { from: { x: e.x - 1, y: e.y } });
  let blockedOnTheWay = false;
  for (let k = 0; k < 60 && e.shift; k++) { h.step(); if (e.shift && e.blockedBy) blockedOnTheWay = true; }
  assert.equal(blockedOnTheWay, false);
  assert.ok(e.x > 6, `past the guard's tile (${e.x.toFixed(2)})`);
  assert.equal(e.blockedBy, null, 'out of its reach where it stopped');
});
