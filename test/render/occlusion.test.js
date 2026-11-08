// test/render/occlusion.test.js — pure parts of the depth / occlusion model and the attack wind-up:
// raised blocks are split per row and keyed against units, units stand on block tops, the wind-up plan lands
// the strike frame on the event, and the interp buffer clamps hp and looks ahead without consuming.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStage, buildTileQuads, splitQuadGroups, sortQuadOrder, rowDepthKey, boxDepthKey, ROW_KEY } from '../../public/js/render/tiles.js';
import { unitDepthKey, PLANE_DEPTH, skinPlaneDepth, groundZ, placeOnGround } from '../../public/js/render/units.js';
import { windUpPlan, MAX_WIND_SPEEDUP } from '../../public/js/render/spine.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { SnapshotBuffer } from '../../public/js/render/interp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stages = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
const cam = presetCamera('normal', { width: 1920, height: 1080 });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('block quads per row', () => {
  test('every raised block goes to its own row group; nothing raised stays in the ground mesh', () => {
    for (const [id, st] of Object.entries(stages)) {
      const G = parseStage(st);
      const quads = buildTileQuads(G, null);
      const { ground, rows } = splitQuadGroups(quads);
      assert.equal(ground.length + [...rows.values()].reduce((n, l) => n + l.length, 0), quads.length, id);
      assert.ok(ground.every((q) => q.kind !== 'block'), `${id}: block quad in ground`);
      for (const [r, list] of rows) {
        assert.ok(list.length > 0 && list.every((q) => q.row === r && q.kind === 'block'), `${id} row ${r}`);
      }
      // the hand bench row (7) is raised on every stage
      assert.ok(rows.has(7), `${id}: hand row has blocks`);
    }
  });

  test('sortQuadOrder: far rows first, then sides before tops within a tile', () => {
    const qs = [
      { kind: 'block', row: 9, col: 4, order: 0 },
      { kind: 'block', row: 10, col: 4, order: 0 },
      { kind: 'block', row: 9, col: 4, order: 1 },
    ];
    const order = sortQuadOrder([0, 1, 2], qs, 4);
    assert.deepEqual(order, [1, 2, 0]);
  });
});

describe('depth keys', () => {
  test('a unit behind a block row sorts before it; a unit in or in front of the row sorts after', () => {
    for (let r = 7; r <= 12; r++) {
      const block = rowDepthKey(cam, r) + ROW_KEY.blocks;
      for (const c of [0, 4, 9]) {
        assert.ok(unitDepthKey(cam, c, r + 1) < block, `unit behind row ${r} col ${c}`);
        assert.ok(unitDepthKey(cam, c, r + 0.55) < block, `unit just behind row ${r}`);
        assert.ok(unitDepthKey(cam, c, r) > block, `unit in row ${r}`);
        assert.ok(unitDepthKey(cam, c, r + 0.45) > block, `unit at back of row ${r}`);
        assert.ok(unitDepthKey(cam, c, r - 1) > block, `unit in front of row ${r}`);
      }
    }
  });

  test('row sub-keys: blocks < devices < surface; gate boxes after their row, before units in them', () => {
    for (let r = 0; r <= 12; r++) {
      const k = rowDepthKey(cam, r);
      assert.ok(k + ROW_KEY.blocks < k + ROW_KEY.devices && k + ROW_KEY.devices < k + ROW_KEY.surface);
      const box = boxDepthKey(cam, r);
      assert.ok(box > k + ROW_KEY.surface, `box after row ${r}`);
      assert.ok(box < unitDepthKey(cam, 4, r + 0.3), `box before unit in row ${r}`);
      assert.ok(box < rowDepthKey(cam, r - 1), `box before the next row in front`);
    }
  });

  test('official sort: by the model plane (enemies 0.052 nearer than operators), never across a row edge', () => {
    const A = PLANE_DEPTH.ally, E = PLANE_DEPTH.enemy;
    // an enemy in an operator's row draws over her, whichever side it stands on (the official close-up: the robot
    // covers 薇薇安娜's antlers on a normal attack)
    assert.ok(unitDepthKey(cam, 4.7, 9, 0, E) > unitDepthKey(cam, 4, 9, 0, A));
    assert.ok(unitDepthKey(cam, 3.6, 9, 0, E) > unitDepthKey(cam, 4, 9, 0, A));
    // up to its 0.052 of depth (0.104 rows at 30°) farther back, still over her; a row behind, not
    assert.ok(unitDepthKey(cam, 4.7, 9.08, 0, E) > unitDepthKey(cam, 4, 9, 0, A));
    assert.ok(unitDepthKey(cam, 4.7, 10, 0, E) < unitDepthKey(cam, 4, 9, 0, A));
    // the raised blocks keep their margins for every plane depth
    for (let r = 1; r <= 12; r++) {
      const block = rowDepthKey(cam, r) + ROW_KEY.blocks;
      for (const pl of [A, E, -0.277]) {
        assert.ok(unitDepthKey(cam, 4, r + 0.55, 0, pl) < block, `unit just behind row ${r} (${pl})`);
        assert.ok(unitDepthKey(cam, 4, r + 0.45, 0, pl) > block, `unit at back of row ${r} (${pl})`);
      }
    }
  });

  test('skinPlaneDepth: a plane point of the skin along the 30° view (薇薇安娜 −0.100, an enemy −0.152)', () => {
    assert.ok(near(skinPlaneDepth({ points: { HitPoint: { front: { pos: [0, 0.232324, -0.249603] } } } }), -0.1, 1e-3));
    assert.ok(near(skinPlaneDepth({ points: { HitPoint: { all: { pos: [0, 0.423538, -0.42] } } } }), -0.152, 1e-3));
    assert.equal(skinPlaneDepth(null), null);
    assert.equal(skinPlaneDepth({ points: {} }), null);
  });

  test('a lifted (dragged) piece sorts above its ground neighbours only within its own depth band', () => {
    assert.ok(unitDepthKey(cam, 4, 10, 1) > unitDepthKey(cam, 4, 10, 0));
    assert.ok(unitDepthKey(cam, 4, 10, 1) > unitDepthKey(cam, 4, 10.5, 0));
    // the lift bonus (units.js: 40) is below one row of depth at the official 30° pitch (100·sin 30° = 50): a
    // dragged piece at row 10 never ties with (nor passes) a ground unit one row in front
    assert.ok(unitDepthKey(cam, 4, 10, 1) < unitDepthKey(cam, 4, 9, 0) - 1);
    assert.ok(unitDepthKey(cam, 4, 10, 1) < unitDepthKey(cam, 4, 8.9, 0));
  });
});

describe('standing on raised tiles', () => {
  test('groundZ reads the tile height at the rounded cell; junk → 0', () => {
    const ctx = { heightAt: (r, c) => (r === 10 && c === 4 ? 0.3 : r === 5 ? NaN : 0) };
    assert.equal(groundZ(ctx, 4.2, 9.6), 0.3);
    assert.equal(groundZ(ctx, 5, 10), 0);
    assert.equal(groundZ(ctx, 1, 5), 0);
    assert.equal(groundZ({}, 4, 10), 0);
  });

  test('placeOnGround: raised z goes to the row surface layer, else to the fallback; only reparents on change', () => {
    const mk = (name) => ({ name, kids: [], addChild(o) { o.parent?.kids.splice(o.parent.kids.indexOf(o), 1); o.parent = this; this.kids.push(o); } });
    const flat = mk('flat'), surf10 = mk('s10');
    const ctx = { surfaceLayer: (row) => (row === 10 ? surf10 : null) };
    const obj = { parent: null };
    placeOnGround(ctx, obj, flat, 10.2, 0.3);
    assert.equal(obj.parent, surf10);
    placeOnGround(ctx, obj, flat, 10.2, 0.3);
    assert.equal(surf10.kids.length, 1);
    placeOnGround(ctx, obj, flat, 10.2, 0);
    assert.equal(obj.parent, flat);
    placeOnGround(ctx, obj, flat, 8, 0.3); // row without blocks → fallback
    assert.equal(obj.parent, flat);
    placeOnGround({}, obj, flat, 10, 0.3);
    assert.equal(obj.parent, flat);
  });

  test('act2 walls (h) are raised so operators on them get z > 0', () => {
    const G = parseStage(stages.act2autochess_m01);
    const walls = [];
    for (let r = 9; r <= 12; r++) for (let c = 0; c < 21; c++) if (G[r][c].glyph === 'h') walls.push(G[r][c]);
    assert.ok(walls.length > 0);
    for (const t of walls) assert.ok(t.h > 0.12, `wall ${t.r},${t.c} h ${t.h}`);
  });
});

describe('attack wind-up', () => {
  test('the strike frame lands exactly on the event whenever the wind-up can start from the clip start', () => {
    for (const loop of [0.6, 1, 1.7]) for (const hit of [0.1, 0.35, 0.5]) for (const iv of [0.4, 1, 2.5]) {
      for (const lead of [0.01, 0.05, 0.1, 0.2, 0.4]) {
        const h = hit * loop;
        const { ts, tsWind, start } = windUpPlan(loop, h, iv, lead);
        assert.ok(Number.isFinite(ts) && Number.isFinite(tsWind) && Number.isFinite(start));
        assert.ok(ts >= 0.35 && ts <= 4, `ts ${ts}`);
        assert.ok(tsWind >= ts - 1e-12 && tsWind <= ts * MAX_WIND_SPEEDUP + 1e-12, `tsWind ${tsWind}`);
        assert.ok(start >= 0 && start <= h + 1e-12, `start ${start}`);
        if (lead * ts <= h) assert.ok(near(start + lead * tsWind, h, 1e-9), `strike at event: ${start}+${lead}*${tsWind} vs ${h}`);
      }
    }
  });

  test('a comfortable lead plays the whole wind-up at normal speed', () => {
    const p = windUpPlan(1, 0.4, 1, 0.4);
    assert.equal(p.start, 0);
    assert.ok(near(p.tsWind, 1));
  });

  test('a short lead speeds up (capped) and skips only what it must', () => {
    const p = windUpPlan(1, 0.4, 1, 0.05);
    assert.ok(near(p.tsWind, MAX_WIND_SPEEDUP));
    assert.ok(near(p.start, 0.4 - 0.05 * MAX_WIND_SPEEDUP));
  });
});

describe('interp: hp clamp and look-ahead', () => {
  const snap = (t, units) => ({ fieldId: 'n:1', t, units });
  test('snapshot hp = maxHp + 1 (sim rounding) is clamped; negative hp → 0', () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, [[1, 0, 10, 101, 100, 0, 10, 0, 0], [2, 1, 10, -3, 100, 0, 10, 0, 0]]), 0);
    b.push(snap(0.1, [[1, 0, 10, 101, 100, 0, 10, 0, 0], [2, 1, 10, -3, 100, 0, 10, 0, 0]]), 0.05);
    for (const t of [0, 0.05, 0.1, 0.2]) {
      const out = b.sample(t);
      assert.equal(out.get(1).hp, 100);
      assert.equal(out.get(2).hp, 0);
    }
  });

  test('forEachUpcoming visits (from, to] in order without consuming; junk-safe', () => {
    const b = new SnapshotBuffer();
    b.push(snap(0, []), 0);
    b.pushEvents([['atk', 1]], 0, 0.5);
    b.pushEvents([['atk', 2]], 0, 1.0);
    b.pushEvents([['atk', 3]], 0, 2.0);
    const seen = [];
    b.forEachUpcoming(0.5, 1.5, (ev, t) => seen.push([ev[1], t]));
    assert.deepEqual(seen, [[2, 1.0]]);
    assert.equal(b.events.length, 3);
    assert.deepEqual(b.takeEvents(1.0).map((e) => e[1]), [1, 2]);
    assert.equal(b.events.length, 1);
    assert.doesNotThrow(() => b.forEachUpcoming(NaN, NaN, () => { throw new Error('called'); }));
  });
});
