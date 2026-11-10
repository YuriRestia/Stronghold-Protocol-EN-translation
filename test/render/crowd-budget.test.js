// test/render/crowd-budget.test.js — (fork) the crowd rules of a big field (crew-docs/ga-lag-proposal.md, fixes 1, 3, 4):
// render/crowd.js (a desktop at High draws up to ROOMY_HIGH units directly while its frames keep up, then today's
// 44 base), the impostor atlas's main page count (render/impostor.js mainPages) and the official effects' crowd budget
// (render/vfx/system.js setCrowd: one-shots repeated on one unit within CROWD_MERGE_S merge, CROWD_PARTICLES cap).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { impostorInterval, impostorBase, IMPOSTOR_BASE, ROOMY_HIGH } from '../../public/js/render/crowd.js';
import { ImpostorAtlas, MAX_MAIN_PAGES } from '../../public/js/render/impostor.js';
import { compileEffect } from '../../public/js/render/vfx/effect.js';
import { OfficialFx, CROWD_UNITS, CROWD_PARTICLES, CROWD_MERGE_S, MAX_PARTICLES } from '../../public/js/render/vfx/system.js';
import { installFakePixi } from './fakepixi.js';

describe('impostors: when a crowd switches (render/crowd.js)', () => {
  test('today\'s bases stay for phones, Medium and Low, and once frames fall behind', () => {
    assert.deepEqual({ ...IMPOSTOR_BASE }, { low: 12, medium: 26, high: 44 });
    assert.equal(impostorInterval(44, { quality: 'high' }), 0, '44 units: drawn directly');
    assert.equal(impostorInterval(45, { quality: 'high' }), 2, '45: impostors (not roomy: a phone, or frames fell behind)');
    assert.equal(impostorInterval(80, { quality: 'high' }), 3, '80 units at the 44 base: every 3rd frame, as before');
    assert.equal(impostorInterval(80, { quality: 'medium', roomy: true }), 4, 'roomy changes High only');
    assert.equal(impostorInterval(20, { quality: 'low', roomy: true }), 3);
    assert.equal(impostorInterval(30, { quality: 'high', loadLevel: 1 }), 2, 'load level 1 halves the base (22)');
  });

  test('a desktop at High with frames to spare draws a Grand Alliance relay field directly', () => {
    assert.equal(ROOMY_HIGH, 88);
    assert.equal(impostorInterval(83, { quality: 'high', roomy: true }), 0, 'the 80–83 units of the measured relay field');
    assert.equal(impostorInterval(88, { quality: 'high', roomy: true }), 0);
    assert.equal(impostorInterval(89, { quality: 'high', roomy: true }), 2);
    assert.equal(impostorBase({ quality: 'high', roomy: true, loadLevel: 1 }), 44, 'a load level halves the roomy base too');
    assert.equal(impostorInterval(10, { force: true }), 2, 'forced (dev, tests): always');
    assert.equal(impostorBase({ quality: 'bogus' }), 44, 'an unknown quality reads as High');
  });
});

describe('impostor atlas: main pages (render/impostor.js)', () => {
  const fill = (imp) => { let n = 0; while (imp.alloc(600, 600)) n++; return n; };
  test('3 main pages by default, more when asked (a desktop: 5), at most MAX_MAIN_PAGES', () => {
    const fake = installFakePixi();
    try {
      const renderer = { resolution: 1 };
      const three = new ImpostorAtlas(renderer);
      const perPage = (() => { const one = new ImpostorAtlas(renderer, { mainPages: 1 }); return fill(one); })();
      assert.ok(perPage > 0);
      assert.equal(fill(three), perPage * 3);
      assert.equal(three.pages.length, 3);
      const five = new ImpostorAtlas(renderer, { mainPages: 5 });
      assert.equal(fill(five), perPage * 5);
      assert.equal(five.pages.filter((p) => p.kind === 'main').length, 5);
      assert.equal(new ImpostorAtlas(renderer, { mainPages: 99 }).maxPages.main, MAX_MAIN_PAGES);
      assert.equal(new ImpostorAtlas(renderer, { mainPages: 5 }).maxPages.clip, 2, 'clip pages unchanged');
    } finally { fake.restore(); }
  });
});

// a one-shot hit spark: one burst emitter
const MAT = {
  name: 'm', shader: 'Torappu/Particles/Additive', passes: [{ blend: ['SrcAlpha', 'One', 'Zero', 'OneMinusSrcAlpha'], blendOp: 'Add', zTest: 'Disabled', zWrite: false, cull: 'Off', colorMask: 15 }],
  queue: 'Transparent', keywords: [], floats: {}, colors: { _TintColor: [1, 1, 1, 1] }, textures: { _MainTex: { tex: 't', st: [1, 1, 0, 0] } },
};
function spark(key) {
  const pe = { class: 'ParticleEffect', enabled: true, fields: { _delayToPlay: 0, _delayToFinish: 0, _maxLifetime: -1, _isLoop: 0, _rotateType: 0, _spawnLocation: 2, _holdByOwner: 0, _inactiveOnFinish: [] } };
  const nodes = [
    { id: 0, name: 'root', parent: null, children: [1], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], behaviours: [pe] },
    { id: 1, name: 'ps1', parent: 0, children: [], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1],
      particleSystem: { lengthInSec: 0.5, looping: false, prewarm: false, startDelay: 0, playOnAwake: true, simulationSpeed: 1, moveWithTransform: 0, scalingMode: 1,
        InitialModule: { startLifetime: 0.3, startSpeed: 0, startSize: 1, startColor: [1, 1, 1, 1], maxNumParticles: 100 },
        EmissionModule: { rateOverTime: 0, m_Bursts: [{ time: 0, countCurve: 2, cycleCount: 1, repeatInterval: 0.01, probability: 1 }] } },
      particleSystemRenderer: { m_Enabled: true, renderMode: 'billboard', renderAlignment: 'view', materials: [0, null] }, behaviours: [] },
  ];
  return compileEffect({ format: 'fx-prefab', version: 1, key, nodes, materials: [MAT], clips: [], textures: ['t'], meshes: [], refs: [], stats: {} });
}

describe('official effects: the crowd budget (render/vfx/system.js)', () => {
  const DEFS = new Map([['hit_a', spark('hit_a')], ['hit_b', spark('hit_b')]]);
  const make = () => new OfficialFx({ P: { Container: class {} }, renderer: null, cam: () => ({ tilt: 30 }), tier: 'full',
    lib: { available: true, defs: DEFS, has: (k) => DEFS.has(k), def: (k) => DEFS.get(k) || null, load: async (k) => DEFS.get(k) || null } });
  const at = { pos: [0, 0, 0] };

  test('an ordinary field plays every hit, however close together', () => {
    const ofx = make(), v = { id: 1 };
    ofx.setCrowd(CROWD_UNITS);
    const a = ofx.spawn('hit_a', at, { owner: v }), b = ofx.spawn('hit_a', at, { owner: v });
    assert.ok(a && b && a !== b);
    assert.equal(ofx.effects.length, 2);
    assert.equal(ofx.stats().crowded, false);
  });

  test('a crowded field plays a one-shot once per unit within CROWD_MERGE_S; the first stands for the second', () => {
    const ofx = make(), v = { id: 1 }, w = { id: 2 };
    ofx.setCrowd(CROWD_UNITS + 1);
    const a = ofx.spawn('hit_a', at, { owner: v });
    assert.equal(ofx.spawn('hit_a', at, { owner: v }), a, 'the same hit on the same unit: merged (truthy, no procedural spark)');
    assert.notEqual(ofx.spawn('hit_a', at, { owner: w }), a, 'another unit: its own hit');
    assert.notEqual(ofx.spawn('hit_b', at, { owner: v }), a, 'another effect: its own');
    assert.notEqual(ofx.spawn('hit_a', at, { owner: v, important: true }), a, 'an important one never merges');
    assert.ok(ofx.spawn('hit_a', at, {}), 'no owner (a tile): never merged');
    assert.equal(ofx.merged, 1);
    ofx.update(CROWD_MERGE_S + 0.02);
    const c = ofx.spawn('hit_a', at, { owner: v });
    assert.ok(c && c !== a, 'past the window: a new hit');
    assert.equal(ofx.stats().merged, 1);
    ofx.setCrowd(10);
    assert.notEqual(ofx.spawn('hit_a', at, { owner: v }), c, 'the crowd thinned out: every hit again');
  });

  test('a crowded field starts no new one-shot past CROWD_PARTICLES; loops and important ones still start', () => {
    const ofx = make(), v = { id: 1 };
    ofx.particles = CROWD_PARTICLES.full;
    assert.ok(ofx.spawn('hit_a', at, { owner: v }), 'not crowded: the MAX_PARTICLES cap only');
    assert.ok(CROWD_PARTICLES.full < MAX_PARTICLES.full && CROWD_PARTICLES.lite < MAX_PARTICLES.lite);
    ofx.setCrowd(CROWD_UNITS + 1);
    const dropped = ofx.dropped;
    assert.equal(ofx.spawn('hit_b', at, { owner: v }), null);
    assert.equal(ofx.dropped, dropped + 1);
    assert.ok(ofx.spawn('hit_b', at, { owner: v, important: true }));
    assert.ok(ofx.spawn('hit_b', at, { owner: v, loop: true }));
  });
});
