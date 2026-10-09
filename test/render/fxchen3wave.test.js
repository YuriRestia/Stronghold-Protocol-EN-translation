// test/render/fxchen3wave.test.js — 赤刃明霄陈 S3 赤霄·天喟 的「龙剑气」(用户报告: 三技能的龙剑气看不到).
//
// The wave is a kit-managed probe in the sim (server/sim/content/kits/ops/op-chen3.js): it leaves her tile forward at
// 1.5 tiles/s, turns 90° at the field's edge / high ground / gates, and lives as long as the skill. It is not in the
// snapshot's projectile list, so the client can only draw it from `fx` events — and before this change the sim sent
// none for the wave itself (one `dash` puff at the cast, one `slash` spark per enemy hit): the 龙剑气 was invisible.
// The sim now emits `fx('chen3Wave', { x, y, fromX, fromY, dr, dc, id, skill })` every 0.12 s — its position, the
// previous point (the trail) and its direction (the crescent's heading) — and render/fx.js draws the 'qi' archetype.
// Against the headless fake PIXI (test/render/fakepixi.js), like fxflame.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, FX;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
});
after(() => fake.restore());

const DT = 1 / 120;
const cam = presetCamera('normal', { width: 1600, height: 900 });
const unit = (id, x, y, o = {}) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, info: { defId: 'x' }, onHit() {}, ...o });

function makeFx(views, ts = 1) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  const map = new Map(views.map((v) => [v.id, v]));
  const fx = new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality: 'high', damageNumbers: true },
    timeScale: () => ts, loadLevel: () => 0, subProfOf: () => null, view: (id) => map.get(id) || null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
  return { fx, map };
}
const run = (fx, seconds) => { for (let t = 0; t < seconds - 1e-9; t += DT) fx.update(DT); };
/** One sim event of the wave: its position, the previous point and the direction (`dc` cols, `dr` rows). */
const wave = (fx, id, x, y, fromX, fromY, dc = 1, dr = 0) => fx.simFx('chen3Wave', x, y, { x, y, fromX, fromY, dr, dc, id, skill: 'chen3:wave' });
/** Screen box of the drawn trail/head: min/max of every live particle position. */
const drawn = (fx) => {
  const list = fx.parts.filter((p) => p.sp && p.sp.visible !== false);
  if (!list.length) return null;
  const xs = list.map((p) => p.sp.position.x), ys = list.map((p) => p.sp.position.y);
  return { n: list.length, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('赤刃明霄陈 S3 龙剑气: 波自己会被画出来 (issue: 看不到)', () => {
  test('its own archetype — a travelling blade, not the generic sparkle or a dust puff', () => {
    assert.equal(FX.FX_KINDS.chen3Wave.a, 'qi');
    assert.equal(FX.fxSpec('chen3Wave').a, 'qi');
    assert.equal(FX.fxSpec('chen3Wave').pt, true, 'drawn at the wave (never anchored to the caster)');
  });

  test('one event draws a trail and a crescent head at the wave, not at her', () => {
    const her = unit(1, 3, 10), waveAt = { x: 8, y: 10 };
    const { fx } = makeFx([her]);
    assert.equal(drawn(fx), null, 'nothing before the event');
    wave(fx, her.id, waveAt.x, waveAt.y, 7.8, 10);
    run(fx, 1 / 60);
    const box = drawn(fx);
    assert.ok(box && box.n >= 2, `the trail and the head are drawn (${box && box.n} pieces)`);
    const at = cam.project(waveAt.x, waveAt.y, 0.35, { x: 0, y: 0, s: 0, depth: 0 });
    const hers = cam.project(her.x, her.y, 0.5, { x: 0, y: 0, s: 0, depth: 0 });
    const near = (v, t) => Math.abs(v - t) <= 90;
    assert.ok(near(box.x1, at.x) || near(box.x0, at.x), `drawn around the wave (${Math.round(box.x0)}…${Math.round(box.x1)} vs ${Math.round(at.x)})`);
    assert.ok(Math.abs(box.x1 - hers.x) > 60, 'not at her tile');
  });

  // streak() reuses the effect system's projection scratch: a head placed from it sat on the trail's start, one event
  // (~0.2 tile) behind the wave
  test('the crescent head sits on the wave itself (not on the trail\'s start) and points the way it travels', () => {
    const her = unit(1, 3, 10);
    const { fx } = makeFx([her]);
    const heads = () => fx.parts.filter((p) => p.sp.visible !== false && p.sp.texture === fx.tex.slash);
    wave(fx, her.id, 8, 10, 7.6, 10, 1, 0);                    // moving right (+col)
    const right = heads();
    assert.equal(right.length, 1, 'one crescent head');
    const at = cam.project(8, 10, 0.35, { x: 0, y: 0, s: 0, depth: 0 });
    assert.ok(Math.abs(right[0].x - at.x) < 0.5 && Math.abs(right[0].y - at.y) < 0.5,
      `head at the wave (${right[0].x.toFixed(1)}, ${right[0].y.toFixed(1)}) vs (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`);
    assert.ok(Math.abs(right[0].sp.rotation - Math.PI / 2) < 0.35, `bulge to the right (rot ${right[0].sp.rotation.toFixed(2)})`);
    run(fx, 1);
    wave(fx, her.id, 8, 10, 8, 9.6, 0, 1);                     // moving up the screen (+row: the far side)
    const up = heads();
    assert.equal(up.length, 1);
    assert.ok(Math.abs(up[0].sp.rotation) < 0.35, `bulge up (rot ${up[0].sp.rotation.toFixed(2)})`);
  });

  test('the events of a sweep join into one trail that goes the way it travels', () => {
    const her = unit(1, 3, 10);
    const { fx } = makeFx([her]);
    let prev = 3;
    const fronts = [];
    for (let i = 0; i < 8; i++) {           // 0.12 s apart at 1.5 tiles/s ⇒ 0.18 tile a step
      const x = 3 + 0.18 * (i + 1);
      wave(fx, her.id, x, 10, prev, 10);
      prev = x;
      run(fx, 0.12);
      fronts.push(drawn(fx).x1);
    }
    const box = drawn(fx);
    assert.ok(box && box.n >= 4, `the recent steps are still alive (${box && box.n} pieces)`);
    // the drawn front walks forward with the wave (each event is drawn ahead of the last, the older ones still fading)
    for (let i = 1; i < fronts.length; i++) {
      assert.ok(fronts[i] > fronts[i - 1] - 1, `step ${i}: the front moved on (${Math.round(fronts[i - 1])} → ${Math.round(fronts[i])})`);
    }
    assert.ok(fronts[fronts.length - 1] - fronts[0] > 60, `the sweep crossed the field (${Math.round(fronts[0])} → ${Math.round(fronts[fronts.length - 1])} px)`);
  });

  test('a wave boxed in (no movement) and a junk extra never throw', () => {
    const her = unit(1, 3, 10);
    const { fx } = makeFx([her]);
    wave(fx, her.id, 8, 10, 8, 10, 0, 0);                    // standing still: no direction
    wave(fx, her.id, 8, 10, undefined, undefined);
    fx.simFx('chen3Wave', 8, 10, { id: her.id });            // bare event
    fx.simFx('chen3Wave', NaN, NaN, { id: her.id, dr: 1, dc: 0 });
    run(fx, 0.2);
    assert.ok(fx.counts.particles > 0, 'still drawn');
  });

  test('the whole thing is gone once the events stop', () => {
    const her = unit(1, 3, 10);
    const { fx } = makeFx([her]);
    wave(fx, her.id, 8, 10, 7.8, 10);
    run(fx, 0.05);
    assert.ok(drawn(fx).n > 0);
    run(fx, 1);                                              // every trail/head particle expires (life 0.34 s max)
    assert.equal(drawn(fx), null, 'nothing is left hanging on the field');
  });
});
