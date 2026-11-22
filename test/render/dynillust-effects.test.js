// test/render/dynillust-effects.test.js — the official-effect player in illustration mode (render/vfx/effect.js
// illustMode, used by render/dynillust/effects.js): the layer never finishes, its owner turns nodes on and off, an
// FxDelay node waits from its own enable each time (FxDelay.OnEnable / _DelayFunc), and a node its owner places (a
// BoneFollower) carries its children. Battle effects keep their old FxDelay timing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, compileEffect } from '../../public/js/render/vfx/effect.js';
import { mat4 } from '../../public/js/render/vfx/math.js';
import { illustBasis, CAM_DIST } from '../../public/js/render/dynillust/effects.js';

const node = (id, parent, extra = {}) => ({ id, name: 'n' + id, parent, children: [], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
function desc(nodes) {
  for (const n of nodes) if (n.parent != null) nodes[n.parent].children.push(n.id);
  return { format: 'fx-prefab', version: 1, key: 'illust', nodes, materials: [], clips: [], textures: [], meshes: [], refs: [], stats: {} };
}
const delay = (s) => ({ behaviours: [{ class: 'FxDelay', enabled: true, fields: { _delayTime: s } }] });
function step(fx, s, dt = 0.05) { for (let t = 0; t < s - 1e-9; t += dt) fx.update(dt); }

describe('effect.js illustration mode', () => {
  // 0 root · 1 "Special Only Effects" · 2 action root (inactive until the owner turns it on) · 3 FxDelay 0.5 s child
  const make = () => new Effect(compileEffect(desc([node(0, null), node(1, 0), node(2, 1, { active: false }), node(3, 2, delay(0.5))])), { seed: 1 }).illustMode();

  test('the layer never finishes', () => {
    const fx = make();
    step(fx, 30);
    assert.equal(fx.done, false);
    assert.equal(fx.state, 'play');
  });

  test('an action root goes on and off as its owner says', () => {
    const fx = make();
    step(fx, 0.1);
    assert.equal(fx.hier[2], 0);
    fx.setActive(2, true); step(fx, 0.05);
    assert.equal(fx.hier[2], 1);
    fx.setActive(2, false); step(fx, 0.05);
    assert.equal(fx.hier[2], 0);
  });

  test('an FxDelay node waits its delay from its enable, and again after each re-enable', () => {
    const fx = make();
    step(fx, 3);                         // long after the layer started: nothing waits for the start
    fx.setActive(2, true);
    step(fx, 0.4);
    assert.equal(fx.hier[3], 0);
    step(fx, 0.15);
    assert.equal(fx.hier[3], 1);
    fx.setActive(2, false); step(fx, 0.1);
    assert.equal(fx.hier[3], 0);
    fx.setActive(2, true); step(fx, 0.4);
    assert.equal(fx.hier[3], 0);
    step(fx, 0.2);                       // one step past the delay (float sums sit at the boundary)
    assert.equal(fx.hier[3], 1);
  });

  test('battle effects keep timing FxDelay from the effect start', () => {
    const fx = new Effect(compileEffect(desc([node(0, null), node(1, 0, delay(0.5))])), { seed: 1 });
    step(fx, 0.45);
    assert.equal(fx.hier[1], 0);
    step(fx, 0.1);
    assert.equal(fx.hier[1], 1);
  });

  test('a node the owner places carries its children', () => {
    const fx = new Effect(compileEffect(desc([node(0, null), node(1, 0), node(2, 1, { pos: [0, 1, 0] })])), { seed: 1 }).illustMode();
    const w = mat4(); w[12] = 3; w[13] = 4; w[14] = 5;
    fx.worldOv = new Map([[1, w]]);
    step(fx, 0.05);
    assert.deepEqual([...fx.world[1].slice(12, 15)], [3, 4, 5]);
    assert.deepEqual([...fx.world[2].slice(12, 15)], [3, 5, 5]);
  });

  test('the illustration camera: far along −z, its view spanning 2 · cameraSize there', () => {
    const b = illustBasis(10.3, 458);
    assert.deepEqual(b.pos, [0, 0, -CAM_DIST]);
    assert.deepEqual(b.fwd, [0, 0, 1]);
    assert.ok(Math.abs(2 * CAM_DIST * b.tanHalf - 2 * 10.3) < 1e-9);
  });
});
