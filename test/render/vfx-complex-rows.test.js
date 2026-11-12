// (fork) Enemy VFX audit, complex S rows (Tools 2): a b.snap fxs row whose official effect is a buff's hit row (each.hit
// with a `buff`) — Jesselton Williams's armour piercing (an enemy skill), 'Gunshatter''s trample (a talent) — plays it
// once on the carrier, like the state rows the plans already list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillFx } from '../../public/js/render/vfx/skillfx.js';
import { TalentFx } from '../../public/js/render/vfx/talentfx.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

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
  return { s, w, played, views };
}

const hitRow = (key, buff) => ({ key, buff, role: 'hit', loop: false });

test("an enemy skill's buff hit row (each.hit): played once on the target the row names, not again while it holds", () => {
  const records = new Map([[5, { plan: null, enemy: [
    { slot: 0, prefabKey: 'ironsandstorm', plan: { state: [] } },
    { slot: 1, prefabKey: 'armorpiercing', plan: { state: [], each: { cast: [], hit: [[hitRow('enemy_jakill_skill_01_hit_reborn', 'jakill_skill_1_reborn_hit[eff]'), { key: 'plain_hit', role: 'hit' }]] } } },
  ] }]]);
  const { s, played, views } = rig(records);
  const jk = { id: 5, alive: true }, op = { id: 8, alive: true, fxs: [['jakill_skill_1_reborn_hit[eff]', 5, null]] };
  views.set(5, jk); views.set(8, op);
  s._states([jk, op]);
  s._states([jk, op]);
  assert.deepEqual(played.map((h) => [h.k, h.id, h.o.loop]), [['enemy_jakill_skill_01_hit_reborn', 8, false]]);
});

test('a hit row with no buff is never a state row', () => {
  const records = new Map([[5, { plan: null, enemy: [{ slot: 0, prefabKey: 'x', plan: { state: [], each: { cast: [], hit: [[{ key: 'plain_hit', role: 'hit' }]] } } }] }]]);
  const { s, played, views } = rig(records);
  const e = { id: 5, alive: true }, op = { id: 8, alive: true, fxs: [['jakill_skill_1_reborn_hit[eff]', 5, null]] };
  views.set(5, e); views.set(8, op);
  s._states([e, op]);
  assert.deepEqual(played, []);
});

test("TalentFx.targetRows: a talent's buff hit rows join its target rows ('Gunshatter''s trample hit)", () => {
  const t = new TalentFx({ idx: { prefabs: {} } });
  const plan = { state: [], targets: [], start: [], loop: [], unmapped: [], each: { cast: [], hit: [[hitRow('enemy_actrpa_skill_a_hit', 'actrpc_s_1[damage]'), { key: 'no_buff', role: 'hit' }]] } };
  t.of = () => ({ binds: [{ plan }] });
  assert.deepEqual(t.targetRows({ id: 3 }, 'actrpc_s_1[damage]').map((e) => e.key), ['enemy_actrpa_skill_a_hit']);
  assert.deepEqual(t.targetRows({ id: 3 }, 'other[x]'), []);
});

test('the complex rows are state buffs', () => {
  for (const b of ['enemy_acelem[to_parasitic]', 'enemy_blkswb_s[effect]', 'jakill_skill_1_reborn_hit[eff]', 'enemy_wlfmster_fearcage',
    'enemy_wlfmster_damage_record', 'enemy_wlfmster_fear', 'actrpa_s_1[damage]', 'actrpc_s_1[damage]']) assert.ok(STATE_BUFFS[b], b);
  // the Torturer's one buff: its mark on the units around it, its heal on itself — by the row's look
  assert.deepEqual(STATE_BUFFS['enemy_spnaxe_buffs[mark]'].looks, { mark: ['enemy_spnaxe_2_buff_1'], heal: ['enemy_spnaxe_heal'] });
});
