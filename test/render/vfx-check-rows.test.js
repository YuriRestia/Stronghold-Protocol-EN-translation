// (fork, 2026-11-13) The enemy VFX audit's "XS-S, check" rows (crew-docs/enemy-vfx-audit.md): official effects that no
// wiring named, now played the way the official client plays them. A stand-in effect system, a small index.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxWiring } from '../../public/js/render/vfx/wiring.js';
import { ENEMY_FX_BINDINGS, ENEMY_FX_KINDS, bindingEffects } from '../../public/js/render/vfx/skills.js';
import { DUO_PROJECTILES } from '../../public/js/render/vfx/indexGaps.js';

const LOOPING = new Set(['bslime_die_01_start', 'enemy_acstmr_explode_range', 'enemy_msfyin_idle_01', 'enemy_nhstlk_attack_buff_01', 'enemy_ymtro_buff_02', 'enemy_ymtro_buff_03']);
const KEYS = [...LOOPING, 'enemy_ymtro_buff_01', 'snslime_die_01_start', 'enemy_sgrobh_attack_01', 'enemy_sgrobh_attack_02', 'enemy_sgrobh_attack_hit_01', 'g_hit', 'g_enemy', 'g_heal'];

function makeIndex() {
  const prefabs = Object.fromEntries(KEYS.map((k) => [k, { file: `prefabs/${k}.json`, looping: LOOPING.has(k), spawn: 5 }]));
  const melee = [{ name: 'Default', attack: null, combat: { class: 'MeleeAttack', cast: [], hit: [{ effects: ['g_enemy'], directionType: 0 }] } }];
  const slime = (p) => ({ kind: 'enemy', modes: melee, skills: {}, startEffect: null, deadEffect: null, projectiles: [p],
    talents: { Boom: { nodes: [{ node: 'Talents/Boom', class: 'Talent', ability: 'BslimeTalent_1', when: null }], uses: [], projectiles: [p] } } });
  return {
    units: {
      enemy_1021_bslime: slime('projectile_bslime'), enemy_1067_snslime: slime('projectile_snslime'),
      enemy_9016_acstmr: { kind: 'enemy', modes: melee, skills: {}, startEffect: null, deadEffect: null, projectiles: ['projectile_enemy_acstmr_s1'],
        talents: { killed: { nodes: [{ node: 'Modes/Boom/Body/Talents/killed', class: 'Talent', ability: 'BslimeTalent_1', mode: 'Boom', when: null }], uses: [], projectiles: ['projectile_enemy_acstmr_s1'] } } },
      // the index-gap fallback's carriers (indexGaps.js ENEMY_STATE_KEYS): no plan names their rows' buffs
      enemy_1196_msfyin: { kind: 'enemy', modes: melee, skills: {}, talents: {}, startEffect: null, deadEffect: null, projectiles: [] },
      enemy_1270_nhstlk: { kind: 'enemy', modes: melee, skills: {}, talents: {}, startEffect: null, deadEffect: null, projectiles: [] },
      enemy_1302_ymtro_2: { kind: 'enemy', modes: melee, skills: {}, talents: {}, startEffect: null, deadEffect: null, projectiles: [] },
      // Unicycle Toy: a DuoRangedAttack whose `_duoProjectileKey` the index does not carry (indexGaps.js DUO_PROJECTILES)
      enemy_10018_sgrobh: { kind: 'enemy', skills: {}, startEffect: null, deadEffect: null, talents: {}, projectiles: ['projectile_enemy_sgrobh_1', 'projectile_enemy_sgrobh_2'],
        modes: [{ name: 'Default', attack: { class: 'DuoRangedAttack', projectileKey: 'projectile_enemy_sgrobh_1', cast: [], hit: [] }, combat: null }] },
    },
    skills: {},
    projectiles: {
      projectile_bslime: { main: null, lifeTime: 1, toTargetOnStart: ['bslime_die_01_start'], effects: ['bslime_die_01_start'] },
      projectile_snslime: { main: null, lifeTime: 1, toTargetOnStart: ['snslime_die_01_start'], effects: ['snslime_die_01_start'] },
      projectile_enemy_sgrobh_1: { main: null, lifeTime: 1.5, link: 'enemy_sgrobh_attack_01', behaviours: [{ class: 'HarpoonRenderer', fields: { _mainEffect: 'enemy_sgrobh_attack_01' } }], onHit: ['enemy_sgrobh_attack_hit_01'], effects: ['enemy_sgrobh_attack_01', 'enemy_sgrobh_attack_hit_01'] },
      projectile_enemy_sgrobh_2: { main: null, lifeTime: 1.5, link: 'enemy_sgrobh_attack_02', behaviours: [{ class: 'HarpoonRenderer', fields: { _mainEffect: 'enemy_sgrobh_attack_02' } }], onHit: ['enemy_sgrobh_attack_hit_01'], effects: ['enemy_sgrobh_attack_02', 'enemy_sgrobh_attack_hit_01'] },
      projectile_enemy_acstmr_s1: { main: null, lifeTime: 9.95, onReached: ['enemy_acstmr_explode_range'], effects: ['enemy_acstmr_explode_range'] },
    },
    skins: {},
    generic: { hit: { phys: 'g_hit', arts: 'g_hit', enemy: 'g_enemy', heal: 'g_heal' }, die: {}, birth: {}, status: {} },
    prefabs,
  };
}

async function setup() {
  const index = makeIndex();
  const spawned = [], handles = [];
  const ofx = {
    active: true, time: 0, lite: false, tier: 'full', timers: [], ctx: {},
    lib: {
      has: (k) => !!index.prefabs[k], def: (k) => (index.prefabs[k] ? { isLoop: index.prefabs[k].looping, spawn: index.prefabs[k].spawn } : null),
      index: async () => index, preload: async (keys) => keys.length, defs: new Map(),
    },
    spawn(key, place, opts) {
      const h = { key, place, opts, stopped: false, get alive() { return !this.stopped; }, stop() { this.stopped = true; }, kill() { this.stopped = true; } };
      spawned.push(key); handles.push(h);
      return h;
    },
  };
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: () => null, view: (id) => views.get(id) || null });
  await w.ready();
  const view = (id, key, x, y = 9, enemy = true) => {
    const side = enemy ? 'enemy' : 'player';
    const v = { id, x, y, z: 0, visFacing: 1, isEnemy: enemy, alive: true, flags: 0, info: { id, spine: key, defId: key, side, kind: enemy ? 'enemy' : 'char' } };
    views.set(id, v);
    return v;
  };
  const frame = (dt = 1 / 30) => { w.sync(views.values()); w.tick(); ofx.time += dt; };
  return { w, ofx, view, frame, spawned, handles, index };
}

const boom = (id) => ({ r: 1.25, kind: 'deathBoom', id });

describe('the Originium Slugs\' death blast (Boom talent projectile, start effect on its target)', () => {
  test('the bindings name the talent projectile\'s start effect', () => {
    const idx = makeIndex();
    assert.deepEqual(bindingEffects(idx, ENEMY_FX_BINDINGS.enemy_1021_bslime.explode), ['bslime_die_01_start']);
    assert.deepEqual(bindingEffects(idx, ENEMY_FX_BINDINGS.enemy_1067_snslime.explode), ['snslime_die_01_start']);
    assert.ok(ENEMY_FX_KINDS.explode.includes('enemy_1021_bslime') && ENEMY_FX_KINDS.explode.includes('enemy_1067_snslime'));
  });

  test("in the frame of its 'die', the slug's blast plays where it fell instead of the procedural one", async () => {
    const { w, ofx, view, frame, spawned, handles } = await setup();
    const e = view(1, 'enemy_1021_bslime', 6);
    frame();
    w.death(e);
    assert.equal(w.simFx('explode', 6, 9, boom(1)), true, 'the procedural blast is skipped');
    assert.deepEqual(spawned.filter((k) => !k.startsWith('g_')), ['bslime_die_01_start']);
    const h = handles.find((x) => x.key === 'bslime_die_01_start');
    assert.equal(h.opts.loop, true, 'its smoke loops: held, then stopped');
    ofx.time += 1.9; frame();
    assert.ok(h.alive);
    ofx.time += 0.2; frame();
    assert.ok(!h.alive);
  });

  test('the glacial slug\'s blast plays once, for its own life', async () => {
    const { w, view, frame, spawned, handles } = await setup();
    const e = view(2, 'enemy_1067_snslime', 4);
    frame();
    w.death(e);
    assert.equal(w.simFx('explode', 4, 9, boom(2)), true);
    assert.deepEqual(spawned.filter((k) => !k.startsWith('g_')), ['snslime_die_01_start']);
    assert.ok(!handles.find((x) => x.key === 'snslime_die_01_start').opts.loop);
  });

  test("another enemy's deathBoom, or a slug that did not die in that frame: not the slug's blast", async () => {
    const { w, view, frame, spawned } = await setup();
    view(3, 'enemy_1021_bslime', 6);
    frame();
    assert.equal(w.simFx('explode', 6, 9, boom(3)), false, 'no death in the frame: the procedural blast stays');
    assert.equal(w.simFx('explode', 2, 9, boom(99)), false);
    assert.deepEqual(spawned.filter((k) => !k.startsWith('g_')), []);
  });
});

describe("Armor Piercer's arrival (its Boom talent projectile's reached effect on the 3x3)", () => {
  test("the shell standing on the tile: the range loops there for its projectile's 9.95 s", async () => {
    const { w, ofx, view, frame, spawned, handles } = await setup();
    view(5, 'enemy_9016_acstmr', 7, 6);
    frame();
    assert.equal(w.simFx('explode', 7, 6, { r: 1.5, kind: 'helmShell', tiles: 'box' }), true);
    assert.deepEqual(spawned.filter((k) => !k.startsWith('g_')), ['enemy_acstmr_explode_range']);
    const h = handles.find((x) => x.key === 'enemy_acstmr_explode_range');
    assert.equal(h.opts.loop, true);
    ofx.time += 9.8; frame();
    assert.ok(h.alive);
    ofx.time += 0.3; frame();
    assert.ok(!h.alive);
  });

  test("a blade's dive blast (kind 'bladeDive') or a blast with no shell near: not the shell's", async () => {
    const { w, view, frame, spawned } = await setup();
    view(6, 'enemy_9016_acstmr', 2, 2);
    frame();
    assert.equal(w.simFx('explode', 7, 6, { r: 1.5, kind: 'helmShell', tiles: 'box' }), false);
    assert.equal(w.simFx('explode', 2, 2, { r: 1.5, kind: 'bladeDive', tiles: 'box' }), false);
    assert.deepEqual(spawned.filter((k) => !k.startsWith('g_')), []);
  });
});

describe("Unicycle Toy's two harpoons (DuoRangedAttack: the second target of one attack flies its duo projectile)", () => {
  const links = (spawned) => spawned.filter((k) => /^enemy_sgrobh_attack_0/.test(k));

  test('one attack on two targets: harpoon 1 at the first, harpoon 2 at the second', async () => {
    const { w, view, frame, spawned } = await setup();
    const toy = view(7, 'enemy_10018_sgrobh', 8, 5);
    const a = view(8, 'char_a', 5, 5, false), b = view(9, 'char_b', 6, 6, false);
    frame();
    w.attack(toy, a, 'enemy', 1);
    w.attack(toy, b, 'enemy', 1);
    assert.deepEqual(links(spawned), ['enemy_sgrobh_attack_01', 'enemy_sgrobh_attack_02']);
  });

  test('one target per attack: always harpoon 1 (the duo key is for the second target only)', async () => {
    const { w, view, frame, spawned } = await setup();
    const toy = view(7, 'enemy_10018_sgrobh', 8, 5);
    const a = view(8, 'char_a', 5, 5, false);
    frame();
    w.attack(toy, a, 'enemy', 1);
    frame();
    w.attack(toy, a, 'enemy', 2);
    assert.deepEqual(links(spawned), ['enemy_sgrobh_attack_01', 'enemy_sgrobh_attack_01']);
  });
});

describe('the index-gap fallback (indexGaps.js ENEMY_STATE_KEYS): a b.snap fxs row no plan names', () => {
  const live = (handles, key) => handles.filter((h) => h.key === key && h.alive);

  test("a prop's idle loop on itself, by its unit; gone with the row", async () => {
    const { view, frame, handles } = await setup();
    const p = view(10, 'enemy_1196_msfyin', 5, 5);
    p.fxs = [['msf_basic', null, null]];
    frame();
    const [h] = live(handles, 'enemy_msfyin_idle_01');
    assert.ok(h && h.opts.loop, 'the idle loop plays, looped');
    p.fxs = [];
    frame();
    assert.ok(!h.alive);
  });

  test("Rotchaser's bleed on the operator it bled (src: the Rotchaser)", async () => {
    const { view, frame, handles } = await setup();
    view(11, 'enemy_1270_nhstlk', 6, 5);
    const op = view(12, 'char_a', 5, 5, false);
    op.fxs = [['enemy_nhstlk_t[bleeding]', 11, null]];
    frame();
    assert.equal(live(handles, 'enemy_nhstlk_attack_buff_01').length, 1);
    assert.equal(Math.abs(live(handles, 'enemy_nhstlk_attack_buff_01')[0].place.pos[0]), op.x, 'on the operator (x 5), not the Rotchaser (x 6)');
  });

  test("Sand Voyager's effect follows its passenger count (the row's look)", async () => {
    const { view, frame, handles } = await setup();
    const bus = view(13, 'enemy_1302_ymtro_2', 4, 4);
    bus.fxs = [['durbus_passengers', null, 2]];
    frame();
    assert.equal(live(handles, 'enemy_ymtro_buff_02').length, 1);
    bus.fxs = [['durbus_passengers', null, 3]];
    frame();
    assert.deepEqual([live(handles, 'enemy_ymtro_buff_02').length, live(handles, 'enemy_ymtro_buff_03').length], [0, 1]);
  });

  test('the duo table names a projectile of its own unit', () => {
    const idx = makeIndex();
    for (const [u, pk] of Object.entries(DUO_PROJECTILES)) assert.ok(idx.units[u].projectiles.includes(pk), `${u}: ${pk}`);
  });
});
