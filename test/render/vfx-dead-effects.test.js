// (fork) Tools 2, enemy VFX audit row 95: a death effect another unit's skill plays (render/vfx/indexGaps.js DEAD_EFFECTS)
// — Alistair's 【莫非王土】 (store / storeA) breaks the equipment it animates with trap_die_01–03, in place of the generic
// death, and only when that skill was cast in the piece's death frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FxWiring } from '../../public/js/render/vfx/wiring.js';
import { DEAD_EFFECTS, indexGapKeys } from '../../public/js/render/vfx/indexGaps.js';

const TRAP = ['enemy_vtlionk_skill_02_trap_die_01', 'enemy_vtlionk_skill_02_trap_die_02', 'enemy_vtlionk_skill_02_trap_die_03'];
const KEYS = [...TRAP, 'g_die', 'g_enemy', 'own_die'];

function makeIndex() {
  const enemy = (o) => ({ kind: 'enemy', modes: [{ name: 'Default', attack: null, combat: null }], skills: {}, talents: {}, startEffect: null, deadEffect: null, ...o });
  const skill = { rootClass: 'EnemySkill', rootAbility: 'AbilitySelectableGroup', projectiles: [], mode: null, uses: [] };
  return {
    units: {
      enemy_9032_aclionk: enemy({ skills: { equip: skill, store: skill, storea: skill } }),
      enemy_10028_vtswd: enemy(),
      enemy_10029_vtshld: enemy(),
      enemy_1272_nhtank: enemy(),
      enemy_1007_slime: enemy({ deadEffect: 'own_die' }),
    },
    projectiles: {},
    skins: {},
    generic: { hit: { enemy: 'g_enemy' }, die: { enemy: 'g_die', char: 'g_die' }, birth: {}, status: {} },
    prefabs: Object.fromEntries(KEYS.map((k) => [k, { file: `prefabs/${k}.json`, looping: false }])),
  };
}

const RECS = {
  enemy_9032_aclionk: { skills: [{ prefabKey: 'equip', bb: {} }, { prefabKey: 'store', bb: {} }, { prefabKey: 'storeA', bb: {} }] },
};

async function setup() {
  const index = makeIndex();
  const spawned = [];
  const ofx = {
    active: true, time: 0, lite: false, tier: 'full', timers: [], ctx: {},
    lib: { has: (k) => !!index.prefabs[k], def: (k) => (index.prefabs[k] ? { isLoop: false, spawn: 2 } : null), index: async () => index, preload: async (keys) => keys.length, defs: new Map() },
    spawn(key) { spawned.push(key); return { key, alive: true, stop() {}, kill() {} }; },
  };
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: (info) => RECS[info.defId] || null, view: (id) => views.get(id) || null });
  await w.ready();
  const view = (id, key, x) => {
    const v = { id, x, y: 5, z: 0, visFacing: 1, isEnemy: true, alive: true, flags: 0, info: { id, spine: key, defId: key, side: 'enemy', kind: 'enemy' } };
    views.set(id, v);
    return v;
  };
  const frame = () => { w.sync(views.values()); w.tick(); ofx.time += 1 / 30; };
  return { w, view, frame, spawned };
}

test("a piece Alistair animates (store / storeA cast in its death frame) breaks with trap_die_01–03, not the generic death", async () => {
  const { w, view, frame, spawned } = await setup();
  const boss = view(1, 'enemy_9032_aclionk', 3), sword = view(2, 'enemy_10028_vtswd', 5), vest = view(3, 'enemy_10029_vtshld', 6);
  frame();
  w.enemyCast(boss, 1);   // the sim's castSlot (store), then b.kill on the piece in the same tick
  assert.equal(w.death(sword), true);
  assert.deepEqual(spawned, TRAP);
  frame();
  spawned.length = 0;
  w.enemyCast(boss, 2);   // storeA (≤ 50 % HP)
  assert.equal(w.death(vest), true);
  assert.deepEqual(spawned, TRAP);
});

test("a piece's death with no store cast in its frame (OpFor: BlackCloud's grab), another cast, other enemies: unchanged", async () => {
  const { w, view, frame, spawned } = await setup();
  const boss = view(1, 'enemy_9032_aclionk', 3), sword = view(2, 'enemy_10028_vtswd', 5), vest = view(3, 'enemy_10029_vtshld', 6);
  const tank = view(4, 'enemy_1272_nhtank', 8), slime = view(5, 'enemy_1007_slime', 9);
  frame();
  w.enemyCast(boss, 1);
  frame();   // the cast was a frame earlier
  w.death(sword);
  assert.deepEqual(spawned, ['g_die']);
  spawned.length = 0;
  w.enemyCast(boss, 0);   // 【王权号令】 (equip) is not the cause
  w.death(vest);
  assert.deepEqual(spawned, ['g_die']);
  spawned.length = 0;
  w.enemyCast(boss, 1);
  w.death(tank);
  w.death(slime);
  assert.deepEqual(spawned, ['g_die', 'own_die'], 'a non-listed enemy keeps the generic death, one with its own keeps that');
});

test('DEAD_EFFECTS: the three pieces, preloaded with them', () => {
  assert.deepEqual(Object.keys(DEAD_EFFECTS), ['enemy_10028_vtswd', 'enemy_10029_vtshld', 'enemy_10030_vtwand']);
  for (const s of Object.values(DEAD_EFFECTS)) assert.deepEqual([s.keys, s.by, s.skills], [TRAP, 'enemy_9032_aclionk', ['store', 'storea']]);
  assert.deepEqual(indexGapKeys('enemy_10030_vtwand', null), TRAP);
  assert.deepEqual(indexGapKeys('enemy_1272_nhtank', null), []);
});
