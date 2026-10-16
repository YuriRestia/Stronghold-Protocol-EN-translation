// test/render/vfx-skin-fx.test.js — (fork) the official effects of an outfit: render/vfx/wiring.js plays an effect's
// `<key>_<outfit>#N` twin (index.json skinFx, tools/local-extract/fx.py skin_variant) for a unit wearing that outfit
// (its info.model, the outfit's battle skin id), casts, flights and hits alike, and preloads it; 丰川祥子's note launch
// ('atk' kind 'note') plays her casts only — no projectile flown, no hit waiting —; the sandbox preview's noteFlight /
// noteHit draw a note by its official projectile, in the outfit's twin.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxWiring } from '../../public/js/render/vfx/wiring.js';

const row = (k) => ({ effects: [k], directionType: 0, oneshot: 1, startEvent: 4, endEvent: 3 });
const KEYS = ['p_cast', 'p_trail', 'p_hit', 'p_cast_sk#1', 'p_trail_sk#1', 'p_hit_sk#1', 'n_start', 'n_trail', 'n_hit', 'n_start_sk#1', 'n_trail_sk#1', 'n_hit_sk#1', 'g_hit'];

function makeIndex() {
  const prefabs = Object.fromEntries(KEYS.map((k) => [k, { file: `prefabs/${k}.json` }]));
  const unit = (modes) => ({ kind: 'char', modes, skills: {}, startEffect: null, deadEffect: null });
  return {
    format: 'fx-index', version: 3,
    units: {
      char_700_shot: unit([{ name: 'Default', attack: { class: 'RangedAttack', projectileKey: 'proj_p', cast: [row('p_cast')], hit: [] } }]),
      char_4182_oblvns: unit([{ name: 'Default', attack: { class: 'MultiRangedAttack', projectileKey: 'projectile_chr_oblvns', cast: [row('n_start')], hit: [] } }]),
      enemy_800_foe: { kind: 'enemy', modes: [], skills: {}, startEffect: null, deadEffect: null },
    },
    skills: {},
    projectiles: {
      proj_p: { main: 'p_trail', onHit: ['p_hit'], effects: ['p_trail', 'p_hit'] },
      projectile_chr_oblvns: { main: 'n_trail', onHit: ['n_hit'], effects: ['n_trail', 'n_hit'] },
    },
    skins: {},
    generic: { hit: { phys: 'g_hit', arts: 'g_hit', enemy: 'g_hit', heal: 'g_hit' }, die: {}, birth: {}, status: {} },
    skinFx: { 'sk#1': { p_cast: 'p_cast_sk#1', p_trail: 'p_trail_sk#1', p_hit: 'p_hit_sk#1', n_start: 'n_start_sk#1', n_trail: 'n_trail_sk#1', n_hit: 'n_hit_sk#1' } },
    prefabs,
  };
}

async function setup() {
  const index = makeIndex();
  const spawned = [], handles = [];
  const ofx = {
    active: true, time: 0, lite: false, tier: 'full', timers: [],
    lib: { has: (k) => !!index.prefabs[k], def: (k) => (index.prefabs[k] ? { spawn: 2 } : null), index: async () => index, preload: async (keys) => keys.length, defs: new Map() },
    spawn(key, place, opts) {
      const h = { key, place, opts, stopped: false, get alive() { return !this.stopped; }, stop() { this.stopped = true; }, kill() { this.stopped = true; } };
      spawned.push(key); handles.push(h);
      return h;
    },
  };
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: () => null, view: (id) => views.get(id) || null });
  await w.ready();
  const view = (id, key, x, model = null) => {
    const enemy = /^enemy_/.test(key);
    const v = { id, x, y: 10, z: 0, visFacing: enemy ? -1 : 1, isEnemy: enemy, alive: true, flags: 0, anim: 0, sp: 0, spMax: 0, energy: null,
      info: { id, spine: key, defId: key, side: enemy ? 'enemy' : 'ally', kind: enemy ? 'enemy' : 'op', skillIndex: 0, ...(model ? { model } : null) } };
    views.set(id, v);
    return v;
  };
  const frame = () => { w.sync(views.values()); w.tick(); ofx.time += 1 / 30; };
  const land = (key) => {
    const h = handles.find((x) => x.key === key);
    assert.ok(h && h.opts.track, `${key} flies`);
    h.opts.track({ time: 5, anchor: [0, 0, 0], yaw: 0, pitch: 0, mirror: false, stop() {} });
  };
  return { w, spawned, view, frame, land };
}

describe('(fork) official effects of an outfit', () => {
  test('an outfit plays its twins: cast, flight and hit; the default look keeps the base keys', async () => {
    const { w, spawned, view, frame, land } = await setup();
    const a = view(1, 'char_700_shot', 5, 'char_700_shot@sk#1'), b = view(2, 'char_700_shot', 5), t = view(3, 'enemy_800_foe', 8);
    frame();
    assert.equal(w.attack(a, t, 'arrow', 1), true);
    assert.ok(spawned.includes('p_cast_sk#1') && spawned.includes('p_trail_sk#1'));
    land('p_trail_sk#1');
    assert.ok(spawned.includes('p_hit_sk#1'), 'the hit on the enemy is the attacker\'s outfit twin');
    assert.ok(!spawned.includes('p_cast') && !spawned.includes('p_trail') && !spawned.includes('p_hit'));
    spawned.length = 0;
    w.attack(b, t, 'arrow', 2);
    assert.ok(spawned.includes('p_cast') && spawned.includes('p_trail') && !spawned.some((k) => k.includes('#')));
  });

  test('the outfit comes from the model the field view sets (an outfit id), a token look\'s id too', async () => {
    const { w, view } = await setup();
    assert.equal(w.outfitOf(view(1, 'char_4182_oblvns', 5, 'char_4182_oblvns@avemujica#1')), 'avemujica#1');
    assert.equal(w.outfitOf(view(2, 'token_10002_kalts_mon3tr', 5, 'token_10002_kalts_mon3tr_sale#14')), 'sale#14');
    assert.equal(w.outfitOf(view(3, 'char_4182_oblvns', 5)), null);
  });

  test('preload: the worn outfits\' twins join the units\' keys', async () => {
    const { w, view } = await setup();
    const keys = w.keysFor([view(1, 'char_700_shot', 5, 'char_700_shot@sk#1')], false);
    assert.ok(keys.includes('p_trail') && keys.includes('p_trail_sk#1') && keys.includes('p_hit_sk#1'));
    assert.ok(!w.keysFor([view(2, 'char_700_shot', 5)], false).some((k) => k.includes('#')));
  });

  test('丰川祥子\'s note launch: her cast (the outfit\'s) only, no projectile flown', async () => {
    const { w, spawned, view, frame } = await setup();
    const s = view(1, 'char_4182_oblvns', 5, 'char_4182_oblvns@sk#1'), t = view(2, 'enemy_800_foe', 8);
    frame();
    assert.equal(w.attack(s, t, 'note', 1), true, 'drawn: no procedural shot either');
    assert.deepEqual(spawned, ['n_start_sk#1']);
    assert.equal(w.damage(t, 'phys', null, 1.1), false, 'no official hit waits for the note\'s damage');
  });

  test('sandbox preview: noteFlight follows the note in the outfit\'s trail, noteHit plays its hit', async () => {
    const { w, spawned, view } = await setup();
    const s = view(1, 'char_4182_oblvns', 5, 'char_4182_oblvns@sk#1'), d = view(3, 'char_4182_oblvns', 5), t = view(2, 'enemy_800_foe', 8);
    const at = { x: 6, y: 10, z: 0.5, hx: 0, hy: 1 };
    const h = w.noteFlight(s, 'attack', () => at);
    assert.equal(h.key, 'n_trail_sk#1');
    const fx = { anchor: [0, 0, 0], yaw: 0, pitch: 0, mirror: false };
    h.opts.track(fx);
    assert.deepEqual(fx.anchor, [-4, 1, -0.5]);
    assert.ok(Math.abs(fx.yaw - Math.PI / 2) < 1e-9);
    assert.equal(w.noteFlight(d, 'attack', () => at).key, 'n_trail', 'the default look');
    assert.equal(w.noteFlight(s, 'unknown', () => at), null);
    assert.equal(w.noteHit(s, 'attack', t, 8, 10, 0.5), true);
    assert.ok(spawned.includes('n_hit_sk#1'));
    assert.equal(w.damage(t, 'phys', null, 2), true, 'the note\'s damage right after: no procedural spark on top');
  });
});
