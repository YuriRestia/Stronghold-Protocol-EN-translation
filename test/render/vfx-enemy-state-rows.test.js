// (fork) Enemy VFX audit, S rows: a b.snap fxs row whose src is an enemy finds that enemy's skill plans' state rows
// (SkillFx._states: U.enemy, its skills by slot) — 'Gravestone''s shield, Fallen Snowpriest's chain buff, Garum
// Gourmet's barrel zone — besides its operator-skill plan and its talents.
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
  s.of = (v) => records.get(v.id) || null;
  return { s, played, views };
}

test("an enemy skill's buff on another enemy plays from the src enemy's skill plan; the row gone stops it", () => {
  const records = new Map([[5, { plan: null, enemy: [
    { slot: 0, prefabKey: 'attack', plan: { state: [] } },
    { slot: 1, prefabKey: 'chainbuff', plan: { state: [{ key: 'enemy_smsha_buff', buff: 'enemy_smsha_buffs', role: 'loop', loop: true }] } },
  ] }]]);
  const { s, played, views } = rig(records);
  const sha = { id: 5, alive: true }, foe = { id: 8, alive: true, fxs: [['enemy_smsha_buffs', 5, null]] };
  views.set(5, sha); views.set(8, foe);
  s._states([sha, foe]);
  assert.deepEqual(played.map((h) => [h.k, h.id, h.o.loop]), [['enemy_smsha_buff', 8, true]]);
  foe.fxs = null;
  s._states([sha, foe]);
  assert.ok(played[0].stopped);
});

test("an enemy's own skill buff (no src) plays from its own skill plan; a buff no plan names plays nothing", () => {
  const records = new Map([[6, { plan: null, enemy: [{ slot: 0, prefabKey: 'refreshshield', plan: { state: [{ key: 'enemy_mdrock_skill_buff_01', buff: 'flking_shiled', role: 'loop', loop: true }] } }] }]]);
  const { s, played, views } = rig(records);
  const g = { id: 6, alive: true, fxs: [['flking_shiled', null, null], ['unknown[x]', null, null]] };
  views.set(6, g);
  s._states([g]);
  assert.deepEqual(played.map((h) => [h.k, h.id]), [['enemy_mdrock_skill_buff_01', 6]]);
});

test("an enemy's 'ready:<prefabKey>' row plays that skill's ready rows once per flip on (prefabKey without case)", () => {
  const records = new Map([[4, { plan: null, enemy: [
    { slot: 0, prefabKey: 'stuncombat', plan: { state: [], ready: [{ key: 'hammer_skill_01_buff', role: 'ready', loop: true }] } },
  ] }]]);
  const { s, played, views } = rig(records);
  const ham = { id: 4, alive: true, fxs: [['ready:StunCombat', null, null]] };
  views.set(4, ham);
  s._states([ham]);
  s._states([ham]);
  assert.deepEqual(played.map((h) => [h.k, h.id, h.o.loop]), [['hammer_skill_01_buff', 4, true]], 'once while it holds');
  ham.fxs = null;
  s._states([ham]);
  assert.ok(played[0].stopped, 'gone with the row');
  ham.fxs = [['ready:stuncombat', null, null]];
  s._states([ham]);
  assert.equal(played.length, 2, 'again on the next flip on');
  ham.fxs = [['ready:other', null, null]];
  s._states([ham]);
  assert.equal(played.length, 2, 'a skill it does not have plays nothing');
});
