// (fork) Enemy VFX audit, S rows: fx 'tick' of an enemy (sim battle.tickFx) plays its skill plans' pulse rows
// (SkillFx._tick → _enemyTick: U.enemy, its skills by slot) on the unit it names — Jetman's take-off jets, Blackhorn
// Rhuul's mark and hit on its blocker. Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillFx } from '../../public/js/render/vfx/skillfx.js';

function rig(records) {
  const played = [];
  const views = new Map();
  const w = {
    ofx: { time: 0, tier: 1, lib: new Set() },
    view: (id) => views.get(id) || null,
    playOn: (k, v, o) => { const h = { k, id: v.id, o, alive: true, stop() { this.alive = false; h.stopped = true; } }; played.push(h); return h; },
    _dirIndex: () => 1,
  };
  const s = new SkillFx(w);
  s.of = (v) => (v && records.get(v.id)) || null;
  return { s, w, played, views };
}

const jets = [
  { key: 'enemy_balloon_take_off_01_start_l', role: 'trigger', at: 'owner', reason: 'tick' },
  { key: 'enemy_balloon_take_off_01_start_r', role: 'trigger', at: 'owner', reason: 'tick' },
];
const elk = [
  { key: 'enemy_xdelk_skill_hit_01', role: 'hit', at: 'target', reason: 'hit-no-attack' },
  { key: 'enemy_xdelk_buff_03', role: 'hit', at: 'target', reason: 'hit-no-attack', hold: 'cast' },
];

test("an enemy's tick plays its skill plan's pulse rows on the unit it names (no key: all of them)", () => {
  const { s, played, views } = rig(new Map([[4, { plan: null, enemy: [{ slot: 0, prefabKey: 'takeoff', plan: { pulse: jets } }] }]]));
  const jet = { id: 4, alive: true, x: 3, y: 9 };
  views.set(4, jet);
  assert.equal(s._tick({ id: 4, on: 4, skill: 'balloon:takeoff' }), true);
  assert.deepEqual(played.map((h) => [h.k, h.id]), [['enemy_balloon_take_off_01_start_l', 4], ['enemy_balloon_take_off_01_start_r', 4]]);
});

test("`key` plays only that row, on the target; a 'cast' hold ends after the cast time; a plan with no pulse is skipped", () => {
  const { s, w, played, views } = rig(new Map([[7, { plan: null, enemy: [{ slot: 0, prefabKey: 'attack', plan: { pulse: [] } }, { slot: 1, prefabKey: 'skill', plan: { pulse: elk } }] }]]));
  const rhuul = { id: 7, alive: true, x: 4, y: 9 }, op = { id: 2, alive: true, x: 5, y: 9 };
  views.set(7, rhuul); views.set(2, op);
  s._tick({ id: 7, on: 2, skill: 'elk:charge', key: 'enemy_xdelk_buff_03' });
  assert.deepEqual(played.map((h) => [h.k, h.id]), [['enemy_xdelk_buff_03', 2]]);
  assert.equal(w.ofx.timers?.length, 1, 'its stop is timed');
  s._tick({ id: 7, on: 2, skill: 'elk:clash', key: 'enemy_xdelk_skill_hit_01' });
  assert.deepEqual(played.map((h) => h.k), ['enemy_xdelk_buff_03', 'enemy_xdelk_skill_hit_01']);
});

test("`key` finds an attack's hit row too (a skill blow the kit deals itself: the Corrupted Knight's hammer)", () => {
  const hit = { key: 'dekght_skill_01_hit', role: 'hit', at: 'target' }, range = { key: 'dekght_skill_01_range', role: 'hit', at: 'target' };
  const { s, played, views } = rig(new Map([[3, { plan: null, enemy: [{ slot: 0, prefabKey: 'chargeattack', plan: { pulse: [], attacks: [{ hit: [[hit, range]] }] } }] }]]));
  views.set(3, { id: 3, alive: true, x: 4, y: 9 }); views.set(2, { id: 2, alive: true, x: 5, y: 9 });
  s._tick({ id: 3, on: 2, skill: 'dekght:charge', key: 'dekght_skill_01_range' });
  assert.deepEqual(played.map((h) => [h.k, h.id]), [['dekght_skill_01_range', 2]]);
  s._tick({ id: 3, on: 2, skill: 'dekght:charge' });
  assert.equal(played.length, 1, 'no key: only pulse rows, never the attack rows');
});

test('an enemy with no pulse rows, or a tick on a unit gone, plays nothing (still claimed)', () => {
  const { s, played, views } = rig(new Map([[9, { plan: null, enemy: [{ slot: 0, prefabKey: 'attack', plan: { pulse: [] } }] }]]));
  views.set(9, { id: 9, alive: true, x: 1, y: 9 });
  assert.equal(s._tick({ id: 9, on: 9, skill: 'x' }), true);
  assert.equal(s._tick({ id: 9, on: 99, skill: 'x' }), true);
  assert.deepEqual(played, []);
});
