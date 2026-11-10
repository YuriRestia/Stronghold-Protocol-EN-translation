// test/render/vfx-element-burst.test.js — the official element-burst effects (the user, 2026-11-10: "let's get all of the
// official element effect VFX working"). index.json generic.burst (tools/local-extract/fx.py FX_GENERIC, read from the CN
// client's ep_break_* buff templates): the sim's ['fx', 'burst', …] plays the element's `hit` once on the unit, the
// `<element>Burst` lock loops its `loop`, erosion's permanent DEF cut its `down` — each by the unit's side (an enemy unit
// or an operator). render/vfx/wiring.js burst / status; the procedural flash stays only where the client has nothing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileEffect } from '../../public/js/render/vfx/effect.js';
import { OfficialFx } from '../../public/js/render/vfx/system.js';
import { FxWiring, burstSide } from '../../public/js/render/vfx/wiring.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** fx.py FX_GENERIC['burst'] as shipped (2026-11-10). */
const BURST = {
  'burn.enemy.hit': 'common_firedamage_hit', 'burn.char.loop': 'buff_burn',
  'neural.char.loop': 'common_nerve_injury_01_hit',
  'erosion.enemy.hit': 'common_waterdamage_hit', 'erosion.char.hit': 'common_waterelementexplosion', 'erosion.char.down': 'buff_defdown',
  'apoptosis.enemy.hit': 'common_darkdamage_hit', 'apoptosis.enemy.loop': 'common_darkdamage_debuff',
  'apoptosis.char.hit': 'common_darkdamage_hit', 'apoptosis.char.loop': 'common_darkdamage_debuff',
};

const MAT = {
  name: 'm', shader: 'Torappu/Particles/Additive', passes: [{ blend: ['SrcAlpha', 'One', 'Zero', 'OneMinusSrcAlpha'], blendOp: 'Add', zTest: 'Disabled', zWrite: false, cull: 'Off', colorMask: 15 }],
  queue: 'Transparent', keywords: [], floats: {}, colors: { _TintColor: [1, 1, 1, 1] }, textures: { _MainTex: { tex: 't', st: [1, 1, 0, 0] } },
};
function prefab(key, loop) {
  const ps = {
    id: 1, name: 'ps', parent: 0, children: [], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1],
    particleSystem: { lengthInSec: 0.5, looping: loop, prewarm: false, startDelay: 0, playOnAwake: true, simulationSpeed: 1, moveWithTransform: 0, scalingMode: 1,
      InitialModule: { startLifetime: 0.3, startSpeed: 0, startSize: 1, startColor: [1, 1, 1, 1], maxNumParticles: 100 },
      EmissionModule: { rateOverTime: loop ? 10 : 0, m_Bursts: loop ? [] : [{ time: 0, countCurve: 2, cycleCount: 1, repeatInterval: 0.01, probability: 1 }] } },
    particleSystemRenderer: { m_Enabled: true, renderMode: 'billboard', renderAlignment: 'view', materials: [0, null] }, behaviours: [],
  };
  const pe = { class: 'ParticleEffect', enabled: true, fields: { _delayToPlay: 0, _delayToFinish: 0, _maxLifetime: -1, _isLoop: loop ? 1 : 0, _rotateType: 0, _spawnLocation: 2, _holdByOwner: 1, _inactiveOnFinish: [] } };
  const root = { id: 0, name: 'root', parent: null, children: [1], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], behaviours: [pe] };
  return compileEffect({ format: 'fx-prefab', version: 1, key, nodes: [root, ps], materials: [MAT], clips: [], textures: ['t'], meshes: [], refs: [], stats: {} });
}

async function setup(burst = BURST) {
  const loops = new Set(['buff_burn', 'common_nerve_injury_01_hit', 'common_darkdamage_debuff', 'buff_defdown']);
  const defs = new Map([...new Set(Object.values(BURST))].map((k) => [k, prefab(k, loops.has(k))]));
  const INDEX = {
    version: 3, units: {}, skills: {}, projectiles: {}, skins: {}, prefabs: {},
    generic: { hit: {}, die: {}, birth: {}, status: { burn: 'buff_burn' }, ...(burst ? { burst } : {}) },
  };
  const lib = { available: true, defs, has: (k) => defs.has(k), def: (k) => defs.get(k) || null, load: async (k) => defs.get(k) || null, index: async () => INDEX, preload: async (keys) => keys.length };
  const ofx = new OfficialFx({ P: { Container: class {} }, renderer: null, cam: () => ({ tilt: 30 }), lib, tier: 'full' });
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: () => null, view: (id) => views.get(id) || null });
  await w.ready();
  const unit = (id, kind, side, defId) => {
    const v = { id, x: 3, y: 4, z: 0, visFacing: 1, isEnemy: side === 'enemy', alive: true, flags: 0, dir: 'RIGHT', info: { id, defId, side, kind } };
    views.set(id, v);
    return v;
  };
  const played = [];
  const play = w.playOn.bind(w);
  w.playOn = (key, v, o) => { const h = play(key, v, o); played.push([key, v.id, !!o?.loop, !!h]); return h; };
  return { w, played, enemy: unit(1, 'enemy', 'enemy', 'enemy_1007_slime'), op: unit(2, 'op', 'ally', 'char_1037_blaze2'),
    token: unit(3, 'token', 'enemy', 'token_x') };
}

describe('official element bursts (generic.burst)', () => {
  test('the side follows the sim (isEnemyEntity): enemies are `enemy`; operators and an enemy\'s token are `char`', async () => {
    const { enemy, op, token } = await setup();
    assert.equal(burstSide(enemy), 'enemy');
    assert.equal(burstSide(op), 'char');
    assert.equal(burstSide(token), 'char', 'an enemy-side token bursts with the operator terms, as in the sim');
  });

  test('a burst plays its official hit once on the unit and stands for the procedural flash', async () => {
    const { w, played } = await setup();
    assert.equal(w.simFx('burst', 3, 4, { id: 1, element: 'burn' }), true, 'enemy 灼燃: common_firedamage_hit');
    assert.deepEqual(played, [['common_firedamage_hit', 1, false, true]]);
    played.length = 0;
    assert.equal(w.simFx('burst', 3, 4, { id: 2, element: 'apoptosis' }), true);
    assert.deepEqual(played, [['common_darkdamage_hit', 2, false, true]], 'operator 凋亡: the dark hit');
    played.length = 0;
    assert.equal(w.simFx('burst', 3, 4, { id: 2, element: 'erosion' }), true);
    assert.deepEqual(played, [['common_waterelementexplosion', 2, false, true]], 'operator 侵蚀: the water explosion');
  });

  test('a burst with only a lock loop (an operator\'s 灼燃 / 神经) plays no hit but still skips the flash', async () => {
    const { w, played } = await setup();
    assert.equal(w.simFx('burst', 3, 4, { id: 2, element: 'burn' }), true);
    assert.equal(w.simFx('burst', 3, 4, { id: 2, element: 'neural' }), true);
    assert.deepEqual(played, []);
  });

  test('where the client has nothing the procedural flash stays: an enemy\'s 神经, the legacy necrosis, an older index', async () => {
    const { w, played } = await setup();
    assert.equal(w.simFx('burst', 3, 4, { id: 1, element: 'neural' }), false);
    assert.equal(w.simFx('burst', 3, 4, { id: 1, element: 'necrosis' }), false);
    assert.equal(w.simFx('burst', 3, 4, { id: 99, element: 'burn' }), false, 'an unknown unit');
    assert.deepEqual(played, []);
    const old = await setup(null);
    assert.equal(old.w.simFx('burst', 3, 4, { id: 1, element: 'burn' }), false, 'an index without generic.burst');
  });

  test('the burst lock loops its side\'s official effect while it lasts', async () => {
    const { w, op, enemy, played } = await setup();
    assert.equal(w.status(op, 'burnBurst', true), true, 'operator 灼燃: buff_burn for the lock');
    assert.deepEqual(played.at(-1), ['buff_burn', 2, true, true], 'a held loop');
    assert.equal(w.status(enemy, 'burnBurst', true), false, 'an enemy\'s 灼燃 has no lasting look');
    assert.equal(w.status(enemy, 'apoptosisBurst', true), true, 'enemy 凋亡: the dark debuff loop');
    assert.equal(w.status(op, 'neuralBurst', true), true, 'operator 神经: common_nerve_injury_01_hit for the lock');
    assert.equal(w.status(op, 'erosionBurst', true), false, 'erosion has no lock loop');
    assert.equal(w.status(op, 'erosionDown', true), true, 'operator 侵蚀: buff_defdown for the permanent DEF cut');
    assert.equal(w.status(enemy, 'erosionDown', true), false);
    assert.equal(w.status(op, 'burnBurst', false), true, 'the lock ends: the loop stops');
    assert.equal(w.loops.has('2|burnBurst'), false);
    assert.equal(w.status(op, 'burn', true), true, 'the plain status loops are unchanged');
  });

  test('the burst keys are preloaded with the generic ones', async () => {
    const { w } = await setup();
    const keys = new Set(w.keysFor([]));
    for (const k of Object.values(BURST)) assert.ok(keys.has(k), k);
  });

  test('fx.py FX_GENERIC and the extracted index carry the same burst map, and every key is in the file list', () => {
    const py = readFileSync(path.join(ROOT, 'tools/local-extract/fx.py'), 'utf8');
    for (const [k, v] of Object.entries(BURST)) assert.ok(py.includes(`'${k}': '${v}'`), `fx.py names ${k} → ${v}`);
    const idxFile = path.join(ROOT, 'public/assets/local/fx/index.json');
    const listFile = path.join(ROOT, 'data/local-fx.json');
    if (!existsSync(idxFile) || !existsSync(listFile)) return; // no local extraction here (CI): the fx.py check stands
    const idx = JSON.parse(readFileSync(idxFile, 'utf8'));
    if (!idx.generic?.burst) return; // an extraction older than the burst group
    assert.deepEqual(idx.generic.burst, BURST);
    const prefabs = JSON.parse(readFileSync(listFile, 'utf8')).groups?.['fx/prefabs'] || {};
    for (const k of new Set(Object.values(BURST))) assert.ok(prefabs[k], `${k} is extracted`);
  });
});
