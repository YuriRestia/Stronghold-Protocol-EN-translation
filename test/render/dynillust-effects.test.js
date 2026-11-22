// test/render/dynillust-effects.test.js — the official-effect player in illustration mode (render/vfx/effect.js
// illustMode, used by render/dynillust/effects.js): the layer never finishes, its owner turns nodes on and off, an
// FxDelay node waits from its own enable each time (FxDelay.OnEnable / _DelayFunc), and a node its owner places (a
// BoneFollower) carries its children. Battle effects keep their old FxDelay timing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, compileEffect } from '../../public/js/render/vfx/effect.js';
import { mat4 } from '../../public/js/render/vfx/math.js';
import { illustBasis, CAM_DIST, AnimatorRuntime } from '../../public/js/render/dynillust/effects.js';
import { illustDir, fileUrl, slotData } from '../../public/js/render/dynillust/loader.js';

describe('AnimatorRuntime (the index\'s Animator state machines, §33.19)', () => {
  // Lappland the Decadenza's Idle_01 controller, cut down: Idle 5 s, IdleToSpecial 7 s; OnIdle defaults to set
  const ctl = {
    node: 2,
    parameters: [{ name: 'OnIdle', type: 'trigger', default: true }, { name: 'OnSpecial', type: 'trigger', default: false }],
    layers: [{ defaultState: 0, anyState: [], states: [
      { name: 'Idle', clip: 0, speed: 1, transitions: [
        { to: 1, offset: 0, exitTime: 0.95, hasExitTime: false, conditions: [{ mode: 'if', param: 'OnSpecial' }] },
        { to: 0, offset: 0, exitTime: 0.93, hasExitTime: false, conditions: [{ mode: 'if', param: 'OnIdle' }] }] },
      { name: 'IdleToSpecial', clip: 1, speed: 1, transitions: [
        { to: 0, offset: 0, exitTime: 0.98, hasExitTime: false, conditions: [{ mode: 'if', param: 'OnIdle' }] },
        { to: 0, offset: 0, exitTime: 1, hasExitTime: true, conditions: [] }] },
    ] }],
  };
  const clips = [{ length: 5 }, { length: 7 }];
  test('a default-set trigger is used once, then the state holds', () => {
    const a = new AnimatorRuntime(ctl, clips);
    assert.deepEqual(a.step(0, true), { clip: 0, elapsed: 0 });
    assert.equal(a.values.get('OnIdle'), false);
    assert.deepEqual(a.step(2, true), { clip: 0, elapsed: 2 });
  });
  test('a trigger switches state from now; exit time returns to Idle', () => {
    const a = new AnimatorRuntime(ctl, clips);
    a.step(0, true);
    a.setTrigger('OnSpecial');
    assert.deepEqual(a.step(3, true), { clip: 1, elapsed: 0 });
    assert.equal(a.step(9.9, true).clip, 1);
    assert.equal(a.step(10.1, true).clip, 0);
  });
  test('switched off: back to the default state and default parameters', () => {
    const a = new AnimatorRuntime(ctl, clips);
    a.step(0, true); a.setTrigger('OnSpecial'); a.step(1, true);
    assert.equal(a.step(2, false), null);
    assert.deepEqual(a.step(5, true), { clip: 0, elapsed: 0 });
  });
  test('a trigger the controller lacks is ignored', () => {
    const a = new AnimatorRuntime(ctl, clips);
    a.setTrigger('OnInteract');
    assert.equal(a.has('OnInteract'), false);
  });
});

describe('loader.js (illust.json, §33.19)', () => {
  test('file URLs carry each file\'s own hash segment', () => {
    const dir = illustDir('/assets/~0123456789abcdef/local/dynillust/char_1038_whitw2_2/illust.json');
    assert.equal(dir, '/assets/local/dynillust/char_1038_whitw2_2/');
    const entry = { files: { 'p/a.webp': { hash: 'fedcba9876543210' } } };
    assert.equal(fileUrl(dir, entry, 'p/a.webp'), '/assets/~fedcba9876543210/local/dynillust/char_1038_whitw2_2/p/a.webp');
  });
  test('the index maps onto the renderer\'s fields', () => {
    const d = slotData({
      spine: { scale: 0.01, skin: '', mix: { default: 0, pairs: [['Idle', 'Special', 0.5]] },
        renderers: [{ node: 0, part: null, enabled: false, sortingOrder: 0, queue: 'Transparent' }, { node: 292, part: 1, enabled: true, sortingOrder: 10, queue: 3000 }, { node: 291, part: 0, enabled: true, sortingOrder: 0, queue: 'Transparent' }],
        separator: { slots: ['HM_Cape_B'], parts: [291, 292] }, followers: [{ node: 141, bone: 'Wolf_H2', xy: true, z: true, rotation: true, localScale: true }] },
      framing: { cameraSize: 10.3, adjust: { DEFAULT: { offset: [35.4, -19.5], size: [2038, 2038] } }, root: { pos: [-0.18, -4, 5], scale: [1, 1, 1] } },
      actions: { particles: [{ action: 'SPECIAL_IDLE', node: 261, delay: null }, { action: 'INTERACTION', node: 240, delay: 0.85 }], fixFxDelay: true, extraTracks: [{ track: 2, animation: 'Blink' }] },
    });
    assert.deepEqual(d.framing.adjust[0], [35.4, -19.5, 2038, 2038]);
    assert.deepEqual(d.skeleton.parts.map((p) => p.order), [0, 10]);
    assert.equal(d.skeleton.renderer.enabled, false);
    assert.deepEqual(d.skeleton.mixes, [['Idle', 'Special', 0.5]]);
    assert.deepEqual(d.instance.particles, [{ action: 1, node: 261 }, { action: 3, node: 240 }]);
    assert.deepEqual(d.instance.extraTracks, [{ track: 2, name: 'Blink' }]);
    assert.equal(d.effects.followers[0].bone, 'Wolf_H2');
  });
});

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
