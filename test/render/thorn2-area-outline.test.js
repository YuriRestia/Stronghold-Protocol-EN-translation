// test/render/thorn2-area-outline.test.js — (fork) 引星棘刺 S3 on the procedural tier (officialFx off): the sim sends one
// `zone` per targeted operator, each carrying the area's corners (`poly`) and one `polyKey`; the renderer draws that
// area once as an outline through the corners (a line for 2, a small ring for 1) instead of a ring per operator —
// render/fx/simfx.js 'zone', render/fx/zones.js areaField / _drawAreas.
// Run: node --test test/render/thorn2-area-outline.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FxSystem } from '../../public/js/render/fx.js';
import { AREA_MAX_CORNERS } from '../../public/js/render/fx/zones.js';
import { presetCamera } from '../../public/js/render/projection.js';

/** An FxSystem shell with fake sprites and a Graphics that records its calls. */
function fxShell() {
  const cam = presetCamera('normal', { width: 1280, height: 720 });
  class Sprite {
    constructor() { this.anchor = { set() {} }; this.position = { set() {} }; this.scale = { set() {} }; this.alpha = 1; this.tint = 0; this.destroyed = false; }
    destroy() { this.destroyed = true; }
  }
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  const fx = Object.create(FxSystem.prototype);
  Object.assign(fx, {
    P: { Sprite, BLEND_MODES: { ADD: 1 } },
    tex: { soft: {}, ring: {} },
    zones: [],
    domains: new Map(),
    areas: new Map(),
    domainGfx: { clear() { calls.length = 0; }, lineStyle: rec('lineStyle'), beginFill: rec('beginFill'), endFill: rec('endFill'), drawPolygon: rec('drawPolygon'), moveTo: rec('moveTo'), lineTo: rec('lineTo') },
    ctx: { cam: () => cam, heightAt: () => 0, timeScale: () => 1, view: () => null },
    _p: { x: 0, y: 0, s: 0, depth: 0 }, _q: { x: 0, y: 0, s: 0, depth: 0 },
    _onGround() {},
    _groundZ: () => 0,
  });
  return { fx, calls };
}

test('three zones of one cast (one polyKey) draw one outlined area through the corners, no rings', () => {
  const { fx, calls } = fxShell();
  const poly = [[10, 3], [12, 5], [8, 5]];
  for (const [r, c] of poly) fx.simFx('zone', c, r, { id: 7, r: 1.5, duration: 23, poly, polyKey: 'thorn2:sea:7:1' });
  assert.equal(fx.zones.length, 0, 'no per-operator ring');
  assert.equal(fx.areas.size, 1, 'one area for the three events');
  fx._updateDomains(0.5);
  const polys = calls.filter((c) => c[0] === 'drawPolygon');
  assert.equal(polys.length, 1, 'drawn once');
  assert.equal(polys[0][1].length, 6, 'through its 3 corners');
  assert.ok(calls.some((c) => c[0] === 'beginFill'), 'with a faint fill');
  fx.simFx('zone', 5, 9, { id: 7, r: 1.5, duration: 23, poly: [[9, 5], [11, 5]], polyKey: 'thorn2:sea:7:2' });
  fx._updateDomains(0.1);
  assert.equal(calls.filter((c) => c[0] === 'drawPolygon').length, 1, 'the next cast\'s 2-point area is a line, not a polygon');
  assert.equal(calls.filter((c) => c[0] === 'lineTo').length, 1);
});

test('a 1-point area (he alone in range) is a small ring on his tile; it fades out after its duration', () => {
  const { fx, calls } = fxShell();
  fx.simFx('zone', 3, 10, { id: 7, r: 1.5, duration: 2, poly: [[10, 3]], polyKey: 'thorn2:sea:7:1' });
  fx._updateDomains(0.5);
  const polys = calls.filter((c) => c[0] === 'drawPolygon');
  assert.equal(polys.length, 1);
  assert.equal(polys[0][1].length, 16, 'an 8-corner ring');
  for (let i = 0; i < 20 && fx.areas.size; i++) fx._updateDomains(0.5);
  assert.equal(fx.areas.size, 0, 'gone after its duration and fade');
});

test('a zone without poly stays a ring zone; corners past the cap are dropped', () => {
  const { fx } = fxShell();
  fx.simFx('zone', 5, 10, { id: 1, r: 1.1, duration: 12 });
  assert.equal(fx.zones.length, 1);
  assert.equal(fx.areas.size, 0);
  const many = Array.from({ length: AREA_MAX_CORNERS + 5 }, (_, i) => [i, i % 3]);
  fx.areaField('k', many, 0xffffff, 3);
  assert.equal(fx.areas.get('k').pts.length, AREA_MAX_CORNERS);
});
