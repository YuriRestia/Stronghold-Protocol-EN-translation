// test/render/fxchill.test.js — the 'chill' fx of coldWind (render/fx/simfx.js + zones.js snowfall), PR #386 by
// @leiming2333: 谢拉格's 盟约寒风 blows a blizzard UP the field (the official direction, the owner's confirmation of
// 2026-10-08) with a stronger cold flash; an operator's own coldWind (灵知 S3, 麦哲伦 S1's pulse every 3 s — emitted with
// the unit's `id`) keeps the light downward flurry and the softer flash. Against the headless fake PIXI
// (test/render/fakepixi.js), like fxchen3wave.test.js.

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

const W = 1600, H = 900;
const cam = presetCamera('normal', { width: W, height: H });

function makeFx(quality = 'high') {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  const unit = { id: 7, x: 5, y: 10, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, info: { defId: 'x' }, onHit() {} };
  return new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality, damageNumbers: true },
    timeScale: () => 1, loadLevel: () => 0, subProfOf: () => null, view: (id) => (id === unit.id ? unit : null),
    screenSize: () => ({ width: W, height: H }), fieldTop: () => 120,
  });
}
const live = (fx) => fx.parts.filter((p) => p.sp && p.sp.visible !== false);

describe('coldWind: 谢拉格\'s 盟约寒风 blows up the field, an operator\'s own cold keeps the light flurry', () => {
  test('the bond\'s gust (the device emits no anchor unit): 48 flakes and 10 streaks rising from the bottom, the stronger flash', () => {
    const fx = makeFx();
    // server/sim/content/devices.js startColdWind: the field centre, the player, the cold stacks, the cold duration
    fx.simFx('coldWind', 8, 9, { x: 8, y: 9, playerId: 'p1', n: 3, duration: 5 });
    const ps = live(fx);
    assert.equal(ps.length, 58, '48 flakes + 10 streaks at quality high');
    assert.ok(ps.every((p) => p.vy < 0), 'every particle rises (screen y grows downward)');
    assert.ok(ps.every((p) => p.vx > 0), 'on a crosswind');
    assert.ok(ps.every((p) => p.y >= H * 0.55 - 1e-9), 'lifted off the lower part of the screen (some start below it)');
    assert.equal(ps.filter((p) => p.sp.texture === fx.tex.streak).length, 10, 'gust streaks');
    assert.deepEqual([fx.tintA, fx.tintDur], [0.45, 1]);
    const low = makeFx('low');
    low.simFx('coldWind', 8, 9, { x: 8, y: 9, playerId: 'p1', n: 3, duration: 5 });
    assert.equal(live(low).length, 26, 'quality low: 22 flakes + 4 streaks');
  });

  test('an operator\'s own coldWind (灵知 S3, 麦哲伦\'s pulse: `id` = the unit): the light flurry drifting down, the softer flash', () => {
    const fx = makeFx();
    fx.simFx('coldWind', 5, 10, { x: 5, y: 10, id: 7, n: 2 });
    const ps = live(fx);
    assert.equal(ps.length, 26);
    assert.ok(ps.every((p) => p.vy > 0), 'falling as before');
    assert.equal(ps.filter((p) => p.sp.texture === fx.tex.streak).length, 0, 'no gust streaks');
    assert.deepEqual([fx.tintA, fx.tintDur], [0.35, 0.8]);
  });
});
