// (fork) Enemy VFX audit, complex S rows (Tools 2): a b.snap fxs row whose official effect is a talent buff's hit row
// (each.hit with a `buff`) — 'Gunshatter''s trample — plays it once on the carrier, like the state rows the plans list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TalentFx } from '../../public/js/render/vfx/talentfx.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

const hitRow = (key, buff) => ({ key, buff, role: 'hit', loop: false });

test("TalentFx.targetRows: a talent's buff hit rows join its target rows ('Gunshatter''s trample hit)", () => {
  const t = new TalentFx({ idx: { prefabs: {} } });
  const plan = { state: [], targets: [], start: [], loop: [], unmapped: [], each: { cast: [], hit: [[hitRow('enemy_actrpa_skill_a_hit', 'actrpc_s_1[damage]'), { key: 'no_buff', role: 'hit' }]] } };
  t.of = () => ({ binds: [{ plan }] });
  assert.deepEqual(t.targetRows({ id: 3 }, 'actrpc_s_1[damage]').map((e) => e.key), ['enemy_actrpa_skill_a_hit']);
  assert.deepEqual(t.targetRows({ id: 3 }, 'other[x]'), []);
});

test('the complex rows are state buffs', () => {
  for (const b of ['enemy_wlfmster_fearcage', 'enemy_wlfmster_damage_record', 'enemy_wlfmster_fear', 'actrpa_s_1[damage]', 'actrpc_s_1[damage]', 'acloon_s_2']) assert.ok(STATE_BUFFS[b], b);
  // the Torturer's one buff: its mark on the units around it, its heal on itself — by the row's look
  assert.deepEqual(STATE_BUFFS['enemy_spnaxe_buffs[mark]'].looks, { mark: ['enemy_spnaxe_2_buff_1'], heal: ['enemy_spnaxe_heal'] });
});
