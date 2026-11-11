// test/render/vfx-pathfx.test.js — (fork) the official line / path effects whose points a kit fx carries (effect-gaps
// audit 2, fix #8): render/vfx/pathfx.js edgeLoops / pathCorners and PathFx — 国度's kingdom (tiles + edge), 予愿安洁莉娜
// S3's range line that follows her, 谬因 S2's beam line through her 中继器.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { edgeLoops, pathCorners, tileSig, PathFx, PATH_BINDINGS, pathBindingKeys } from '../../public/js/render/vfx/pathfx.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xy = (loop) => loop.map((p) => [p.x, p.y]);

describe('edgeLoops', () => {
  test('one tile: its four corners, clockwise on screen, closed', () => {
    assert.deepEqual(xy(edgeLoops([[4, 3]])[0]), [[2.5, 3.5], [3.5, 3.5], [3.5, 4.5], [2.5, 4.5], [2.5, 3.5]]);
  });
  test('a 2×3 block: one outline of 4 corners (straight runs merged)', () => {
    const tiles = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]];
    const loops = edgeLoops(tiles);
    assert.equal(loops.length, 1);
    assert.deepEqual(xy(loops[0]), [[-0.5, -0.5], [2.5, -0.5], [2.5, 1.5], [-0.5, 1.5], [-0.5, -0.5]]);
  });
  test('an L shape: 6 corners', () => {
    assert.equal(edgeLoops([[0, 0], [1, 0], [1, 1]])[0].length, 7);
  });
  test('two tiles touching at a corner keep an outline each; a ring keeps its hole', () => {
    assert.equal(edgeLoops([[0, 0], [1, 1]]).length, 2);
    const ring = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (r !== 1 || c !== 1) ring.push([r, c]);
    const loops = edgeLoops(ring);
    assert.equal(loops.length, 2, 'outer edge and the hole');
    assert.deepEqual(loops.map((l) => l.length - 1).sort(), [4, 4]);
  });
  test('the official authored shapes: the prefabs\' placeholder lines are tile-edge outlines too', () => {
    // dminon_range_line_01's m_Positions (an editor sample): 8 corners round a 3-row block with a notch
    const file = path.join(ROOT, 'public/assets/local/fx/prefabs/dminon_range_line_01.json');
    if (!existsSync(file)) return;
    const p = JSON.parse(readFileSync(file, 'utf8'));
    const ln = p.nodes.find((n) => n.lineRenderer).lineRenderer;
    assert.deepEqual(ln.m_Positions[0], ln.m_Positions.at(-1), 'closed by repeating the first point, as edgeLoops does');
    for (const q of ln.m_Positions) assert.ok(Math.abs(q[0] % 1) === 0.5 && Math.abs(q[1] % 1) === 0.5, 'on tile corners');
  });
  test('the same tiles in any order give the same outline; nothing for no tiles', () => {
    const a = [[2, 2], [2, 3], [3, 2]];
    assert.deepEqual(edgeLoops(a), edgeLoops([...a].reverse()));
    assert.equal(tileSig(a), tileSig([...a].reverse()));
    assert.deepEqual(edgeLoops([]), []);
  });
});

test('pathCorners: start, every turn, end', () => {
  const p = [[9, 2], [9, 3], [9, 4], [10, 4], [11, 4], [11, 5], [11, 6]];
  assert.deepEqual(pathCorners(p), [0, 2, 4, 6]);
  assert.deepEqual(pathCorners([[1, 1], [1, 2]]), [0, 1]);
});

test('PATH_BINDINGS names official prefabs only (extracted when the local fx folder is present)', () => {
  const keys = pathBindingKeys();
  assert.ok(keys.includes('dminon_range_line_01') && keys.includes('aglna2_skill_03_range_line_01') && keys.includes('aphris_skill_02_line_01'));
  const dir = path.join(ROOT, 'public/assets/local/fx/prefabs');
  if (!existsSync(dir)) return;
  for (const k of keys) assert.ok(existsSync(path.join(dir, `${k}.json`)), `${k} extracted`);
});

/** A fake wiring: every spawn / playOn is a handle; a spawn's `track` is run against a fake effect by `frame()`. */
function fakeWiring(have = null) {
  const spawned = [], played = [], tracks = [];
  const handle = (key) => { const h = { key, alive: true, stop() { this.alive = false; } }; return h; };
  const ofx = {
    time: 0, timers: [], ctx: { heightAt: (r, c) => (r === 5 && c === 5 ? 0.42 : 0) },
    lib: { has: (k) => (have ? have.includes(k) : true) },
    spawn(key, place, opts) {
      const h = handle(key);
      spawned.push({ key, place, h });
      if (opts?.track) tracks.push({ h, fn: opts.track });
      return h;
    },
  };
  const views = new Map();
  const w = {
    ofx, skinKey: (k) => k, skinOf: () => null, unitOf: () => null, pose: (v) => v, view: (id) => views.get(id) || null,
    playOn(key, v, o) { const h = handle(key); played.push({ key, at: [v.x, v.y, v.z], loop: !!o?.loop, h }); return h; },
  };
  /** Run every live track once; returns the points each line effect was given. */
  const frame = () => tracks.filter((t) => t.h.alive).map((t) => {
    const fx = { anchor: [0, 0, 0], pts: null, setLinePoints(p) { this.pts = p.map((q) => q.slice()); return this; } };
    t.fn(fx);
    return { key: t.h.key, pts: fx.pts };
  });
  const tick = (dt) => { ofx.time += dt; const due = ofx.timers.filter((t) => t.at <= ofx.time); ofx.timers = ofx.timers.filter((t) => t.at > ofx.time); for (const t of due) t.fn(); };
  return { w, views, spawned, played, frame, tick };
}
const U = (id, skillId, v) => ({ id, skillId, v });

describe('PathFx', () => {
  test('国度\'s kingdom: the tile effect on each tile, one edge line round them; tiles come and go with the fx; gone after `dur`', () => {
    const { w, played, frame, tick } = fakeWiring();
    const p = new PathFx(w);
    const v = { id: 7, x: 4, y: 5, z: 0 };
    const tiles = [[5, 5], [5, 6], [4, 5]];
    assert.equal(p.simFx('domain', 4, 5, { id: 7, key: 'domain:7', tiles, dur: 0.75 }, U(7, 'skchr_dminon_2', v)), true, 'claims the fx');
    assert.deepEqual(played.map((x) => x.key), ['dminon_talent_range_01', 'dminon_talent_range_01', 'dminon_talent_range_01']);
    assert.deepEqual(played[0].at, [5, 5, 0.42], 'on the tile, at its height');
    const lines = frame();
    assert.equal(lines.length, 1);
    assert.equal(lines[0].key, 'dminon_range_line_01');
    assert.equal(lines[0].pts.length, 7, 'an L: 6 corners, closed');
    assert.deepEqual(lines[0].pts[0], [4.5 - 10, 3.5 - 9, -0.01], 'Unity frame: (x − 10, y − 9, −height − lift)');
    // the same tiles again: nothing new; one tile fewer: its effect goes
    tick(0.5);
    p.simFx('domain', 4, 5, { id: 7, key: 'domain:7', tiles, dur: 0.75 }, U(7, 'skchr_dminon_2', v));
    assert.equal(played.length, 3);
    tick(0.5);
    p.simFx('domain', 4, 5, { id: 7, key: 'domain:7', tiles: tiles.slice(0, 2), dur: 0.75 }, U(7, 'skchr_dminon_2', v));
    assert.equal(played.filter((x) => x.h.alive).length, 2);
    assert.equal(frame()[0].pts.length, 5, 'the outline follows: a 1×2 block');
    tick(1);
    assert.equal(played.filter((x) => x.h.alive).length, 0, 'no fx for its `dur`: the field is gone');
    assert.equal(frame().length, 0);
  });
  test('without the prefabs the procedural field stays (the fx is not claimed)', () => {
    const { w } = fakeWiring([]);
    const p = new PathFx(w);
    assert.equal(p.simFx('domain', 0, 0, { id: 7, key: 'domain:7', tiles: [[1, 1]] }, U(7, 'skchr_dminon_1', { id: 7 })), false);
  });
  test('予愿安洁莉娜 S3: the 3-9 and the 8 tiles around her, outlined as she flies, until her skill ends; the takeoff stays the kit\'s', () => {
    const { w, frame } = fakeWiring();
    const p = new PathFx(w);
    const v = { id: 3, x: 4, y: 10, z: 0 };
    const range = [[10, 5], [10, 6], [10, 7]];
    assert.equal(p.simFx('takeoff', 4, 10, { id: 3, range, around: 1 }, U(3, 'skchr_aglna2_3', v)), false, 'not claimed');
    let lines = frame();
    assert.equal(lines.length, 1);
    assert.equal(lines[0].key, 'aglna2_skill_03_range_line_01');
    assert.equal(lines[0].pts.length, 9, 'the 3×3 around her with the row ahead sticking out of its middle: 8 corners, closed');
    // she flies away from her 3-9: two outlines
    v.x = 9; v.y = 4;
    p.sync();
    lines = frame();
    assert.equal(lines.length, 2, 'the 3-9 and the 3×3 around her apart');
    p.skillOff(3);
    assert.equal(frame().length, 0, 'gone with the skill');
  });
  test('谬因 S2: one line from her muzzle through the turns to the end, the start, a waypoint on each 中继器 and the end point; gone with the skill', () => {
    const { w, views, played, frame } = fakeWiring();
    const p = new PathFx(w);
    const v = { id: 1, x: 2, y: 9, z: 0, info: { id: 1 } };
    views.set(1, v);
    const pathT = [[9, 2], [9, 3], [9, 4], [10, 4], [11, 4], [11, 5], [11, 6]];
    assert.equal(p.simFx('beam', 2, 9, { id: 1, skill: 'aphris:beam', path: pathT, relays: [2] }, U(1, 'skchr_aphris_2', v)), true);
    const [line] = frame();
    assert.equal(line.key, 'aphris_skill_02_line_01');
    assert.equal(line.pts.length, 4, 'muzzle, (9, 4), (11, 4), (11, 6)');
    assert.deepEqual(line.pts.slice(1).map((q) => [q[0] + 10, q[1] + 9, q[2]]), [[4, 9, -0.65], [4, 11, -0.65], [6, 11, -0.65]], 'at the waypoints\' fixed height 0.65');
    assert.deepEqual(played.map((x) => x.key), ['aphris_skill_02_start_01', 'token_aphris_pc_skill_02_buff_01', 'aphris_skill_02_line_point_01']);
    assert.deepEqual(played[1].at, [4, 9, 0.65], 'the waypoint on the 中继器 tile');
    p.skillOff(1);
    assert.equal(frame().length, 0);
    assert.ok(played.every((x) => !x.h.alive));
  });
  test('a skill PATH_BINDINGS does not name is left alone', () => {
    const { w, played } = fakeWiring();
    const p = new PathFx(w);
    assert.equal(p.simFx('beam', 0, 0, { id: 1, path: [[0, 0], [0, 1]] }, U(1, 'skchr_other_2', { id: 1 })), false);
    assert.equal(played.length, 0);
    assert.ok(Object.keys(PATH_BINDINGS).includes('skchr_aphris_2'));
  });
});
