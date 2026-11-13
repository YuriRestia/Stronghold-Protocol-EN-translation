// test/render/vfx-clear-stale-draw.test.js — (fork) OfficialFx.clear drops the geometry prepared for the last drawn frame
// (render/vfx/system.js). The prep board advances no frameNo (update runs in battle only) and renderPass keeps drawing
// while the warm queue has work, so a draw after the clear repeated the old geometry. Player report 2026-11-13: a battle
// that ended in a hidden tab left its enemies' death bursts frozen on the bench and the lanes for the shop phase (the
// backlog's deaths drawn on return, prep's clear, then wiring.more's late warm-up of the backlog spawns' prefabs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileEffect } from '../../public/js/render/vfx/effect.js';
import { OfficialFx } from '../../public/js/render/vfx/system.js';

const MAT = {
  name: 'm', shader: 'Torappu/Particles/Additive', passes: [{ blend: ['SrcAlpha', 'One', 'Zero', 'OneMinusSrcAlpha'], blendOp: 'Add', zTest: 'Disabled', zWrite: false, cull: 'Off', colorMask: 15 }],
  queue: 'Transparent', keywords: [], floats: {}, colors: { _TintColor: [1, 1, 1, 1] }, textures: { _MainTex: { tex: 't', st: [1, 1, 0, 0] } },
};
// a death burst: one emitter, a burst of long-lived particles (still alive when the field switches to prep)
function burst(key) {
  const pe = { class: 'ParticleEffect', enabled: true, fields: { _delayToPlay: 0, _delayToFinish: 0, _maxLifetime: -1, _isLoop: 0, _rotateType: 0, _spawnLocation: 2, _holdByOwner: 0, _inactiveOnFinish: 1 } };
  const nodes = [
    { id: 0, name: 'root', parent: null, children: [1], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], behaviours: [pe] },
    { id: 1, name: 'ps1', parent: 0, children: [], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1],
      particleSystem: { lengthInSec: 2, looping: false, prewarm: false, startDelay: 0, playOnAwake: true, simulationSpeed: 1, moveWithTransform: 0, scalingMode: 1,
        InitialModule: { startLifetime: 2, startSpeed: 0, startSize: 1, startColor: [1, 1, 1, 1], maxNumParticles: 100 },
        EmissionModule: { rateOverTime: 0, m_Bursts: [{ time: 0, countCurve: 8, cycleCount: 1, repeatInterval: 0.01, probability: 1 }] } },
      particleSystemRenderer: { m_Enabled: true, renderMode: 'billboard', renderAlignment: 'view', materials: [0, null] }, behaviours: [] },
  ];
  return compileEffect({ format: 'fx-prefab', version: 1, key, nodes, materials: [MAT], clips: [], textures: ['t'], meshes: [], refs: [], stats: {} });
}

const DEFS = new Map([['enemy_die', burst('enemy_die')]]);
const cam = { tilt: 30, dist: 40, scale: 20, cx: 400, cy: 300, position: () => ({ x: 10, y: 9, z: 0 }) };
const renderer = { gl: {}, context: { webGLVersion: 2 }, batch: { flush() {} }, screen: { width: 800, height: 600 } };

function rig() {
  const ofx = new OfficialFx({ P: { Container: class {} }, renderer: null, cam: () => cam, tier: 'full',
    lib: { available: true, defs: DEFS, has: (k) => DEFS.has(k), def: (k) => DEFS.get(k) || null, load: async (k) => DEFS.get(k) || null } });
  const draws = [];
  // a GL stand-in: records the items each draw gets; a texture that is still loading keeps its warm-queue entry
  ofx.glr = { parallel: false, upload() {}, depthPrepass() {}, program() {}, building: () => false, texture: () => false,
    draw: (items) => { draws.push(items.length); } };
  return { ofx, draws };
}

test('a death burst drawn in battle is not drawn again after the clear while warm-up work is queued (prep: no update)', () => {
  const { ofx, draws } = rig();
  assert.ok(ofx.active);
  assert.ok(ofx.spawn('enemy_die', { pos: [10, 9, 0] }), 'the burst starts');
  ofx.update(0.05);
  ofx.renderPass('over', renderer);
  assert.ok(draws.length > 0 && draws.every((n) => n > 0), 'the battle frame draws the burst');

  // prep: everything cleared, then a late warm-up (wiring.more) lands; no ofx.update runs on the prep board
  ofx.clear();
  ofx.warmQueue.push({ id: 't|late', tex: 'late', tries: 0 });
  draws.length = 0;
  for (let i = 0; i < 3; i++) ofx.renderPass('over', renderer);
  assert.ok(ofx.warmQueue.length > 0, 'the warm-up is still working (renderPass runs its pass)');
  assert.deepEqual(draws, [], 'nothing of the cleared burst is drawn');
  assert.deepEqual(ofx.items.over, [], 'its prepared geometry is gone');
});

test('clear() empties the prepared lists and asks the next draw to prepare again', () => {
  const { ofx } = rig();
  ofx.items.ground.push({ stale: 1 });
  ofx.items.over.push({ stale: 2 });
  ofx.prepared = ofx.frameNo;
  ofx.clear();
  assert.deepEqual(ofx.items, { ground: [], over: [] });
  assert.notEqual(ofx.prepared, ofx.frameNo);
});
