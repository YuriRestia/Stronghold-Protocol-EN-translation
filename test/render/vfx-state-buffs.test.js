// test/render/vfx-state-buffs.test.js — (fork) the official lasting effects of a moment the client never sees (effect gaps
// audit 2, item 4): render/vfx/skills.js places a STATE_BUFFS buff's 'conditional' rows in plan.state (stateEntries
// narrows them by look / facing / keys) and render/vfx/skillfx.js holds them on the carrier while b.snap `fxs` names
// the buff (SkillFx._states), from the plan of the unit that made it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { skillPlan, stateEntries, STATE_BUFFS, UNMAPPED, SIGNALS } from '../../public/js/render/vfx/skills.js';
import { SkillFx } from '../../public/js/render/vfx/skillfx.js';

const LUMEN = 'lumen_s_2[eff_cond]';
function index() {
  const keys = ['lumen_skill_02_buff', 'lumen_skill_02_buff_02', 'other_cond'];
  const prefabs = Object.fromEntries(keys.map((k) => [k, { file: `prefabs/${k}.json`, looping: true }]));
  const use = (k, buff) => ({ role: 'loop', keys: [k], from: `PassiveBuffAbility._buffs → template ${buff}`, event: 'ON_BUFF_TRIGGER', action: 'CreateBuff', on: 'owner', buff, node: 'skchr_lumen_2' });
  return {
    units: { char_4042_lumen: { modes: [{ name: 'Default', attack: { class: 'HealAttack' } }], skills: {
      skchr_lumen_2: { rootClass: 'CastSkill', uses: [use('lumen_skill_02_buff', LUMEN), use('lumen_skill_02_buff_02', LUMEN), use('other_cond', 'not_signalled[x]')] },
    } } },
    skills: {}, projectiles: {}, prefabs,
  };
}

describe('the planner: STATE_BUFFS rows join plan.state', () => {
  const plan = skillPlan(index(), 'char_4042_lumen', 'skchr_lumen_2', { rec: { skillType: 'AUTO', durationType: 'NONE', duration: 0 } });
  test('a signalled buff\'s conditional rows are placed, held by state on the carrier', () => {
    assert.deepEqual(plan.state.map((e) => [e.key, e.buff, e.hold, e.at]), [
      ['lumen_skill_02_buff', LUMEN, 'state', 'carrier'], ['lumen_skill_02_buff_02', LUMEN, 'state', 'carrier']]);
  });
  test('a buff no kit signals stays unmapped (conditional)', () => {
    assert.deepEqual(plan.unmapped.map((u) => [u.key, u.reason]), [['other_cond', 'conditional']]);
    assert.ok(UNMAPPED.conditional && SIGNALS.state);
  });
  test('stateEntries: the look narrows to its keys; null look all', () => {
    assert.deepEqual(stateEntries(plan.state, LUMEN, 2).map((e) => e.key), ['lumen_skill_02_buff_02']);
    assert.deepEqual(stateEntries(plan.state, LUMEN, 1).map((e) => e.key), ['lumen_skill_02_buff']);
    assert.equal(stateEntries(plan.state, LUMEN, null).length, 2);
    assert.deepEqual(stateEntries(plan.state, 'unknown[x]', null), []);
  });
  test('stateEntries: a byFacing buff picks the carrier\'s side; `keys` limits a buff to some entries', () => {
    const rows = [{ key: 'aglna2_skill_03_buff_right_01', buff: 'aglna2_s_3[mode]' }, { key: 'aglna2_skill_03_buff_left_01', buff: 'aglna2_s_3[mode]' }];
    assert.deepEqual(stateEntries(rows, 'aglna2_s_3[mode]', null, -1).map((e) => e.key), ['aglna2_skill_03_buff_left_01']);
    assert.deepEqual(stateEntries(rows, 'aglna2_s_3[mode]', null, 1).map((e) => e.key), ['aglna2_skill_03_buff_right_01']);
    const h = [{ key: 'haruka_talent_01_buff', buff: 'haruka_t_1' }, { key: 'common_buff_parry_01', buff: 'haruka_t_1', role: 'trigger' }];
    assert.deepEqual(stateEntries(h, 'haruka_t_1', null).map((e) => e.key), ['haruka_talent_01_buff']);
    assert.ok(STATE_BUFFS.haruka_t_1.keys);
  });
});

describe('SkillFx._states: b.snap fxs holds the entries on the carrier', () => {
  function rig() {
    const played = [];
    const views = new Map();
    const w = {
      ofx: { time: 0, tier: 1, lib: new Set() },
      view: (id) => views.get(id) || null,
      playOn: (k, v, o) => { const h = { k, id: v.id, o, alive: true, stop() { this.alive = false; h.stopped = true; } }; played.push(h); return h; },
      _dirIndex: () => 1,
    };
    const s = new SkillFx(w);
    const plans = new Map();
    s.of = (v) => (plans.has(v.id) ? { plan: plans.get(v.id) } : null);
    return { s, played, views, plans };
  }
  const state = [
    { key: 'g1', buff: 'ascln_s_2[enemy]', role: 'loop', loop: true },
    { key: 'ascln_buff_01', buff: 'ascln_s_2[enemy]', role: 'loop', loop: true },
    { key: 'ascln_buff_02', buff: 'ascln_s_2[enemy]', role: 'loop', loop: true },
  ];
  test('a row on an enemy plays the src operator\'s entries of the look there, a new look swaps, no row stops them', () => {
    const { s, played, views, plans } = rig();
    const op = { id: 1, alive: true }, foe = { id: 9, alive: true, fxs: [['ascln_s_2[enemy]', 1, 'on']] };
    views.set(1, op); views.set(9, foe); plans.set(1, { state });
    s._states([op, foe]);
    assert.deepEqual(played.map((h) => [h.k, h.id, h.o.loop, h.o.follow]), [['ascln_buff_01', 9, true, true]]);
    s._states([op, foe]);
    assert.equal(played.length, 1, 'held, not restarted');
    foe.fxs = [['ascln_s_2[enemy]', 1, 'max']];
    s._states([op, foe]);
    assert.deepEqual(played.slice(1).map((h) => h.k), ['ascln_buff_02']);
    assert.ok(!played[0].stopped, 'the shared key stays');
    foe.fxs = null;
    s._states([op, foe]);
    assert.ok(played.every((h) => h.stopped), 'gone with the row');
  });
  test('a looping handle that died restarts; a carrier released stops its entries', () => {
    const { s, played, views, plans } = rig();
    const u = { id: 3, alive: true, fxs: [['monstr_s_1[ready]', null, null]] };
    views.set(3, u); plans.set(3, { state: [{ key: 'm', buff: 'monstr_s_1[ready]', role: 'loop', loop: true }] });
    s._states([u]);
    played[0].alive = false;
    s._states([u]);
    assert.equal(played.length, 2, 'restarted');
    s.release(u);
    assert.ok(played[1].stopped);
  });
  test('a trigger entry plays once per row, not looped', () => {
    const { s, played, views, plans } = rig();
    const u = { id: 4, alive: true, fxs: [['philae_s_2', null, null]] };
    views.set(4, u); plans.set(4, { state: [{ key: 'burst', buff: 'philae_s_2', role: 'trigger', loop: false }] });
    s._states([u]); played[0].alive = false; s._states([u]);
    assert.equal(played.length, 1);
    assert.equal(played[0].o.loop, false);
  });
});

describe('marks on targets (effect gaps audit 2, item 5): `on: \'targets\'` rows of a STATE_BUFFS buff', () => {
  const T = 'titi_s_3[dmg_ticker]';
  const plan = (() => {
    const keys = ['mark_loop', 'wake_end', 'tick_trig', 'line_loop', 'other_tgt'];
    const prefabs = Object.fromEntries(keys.map((k) => [k, { file: `prefabs/${k}.json`, looping: true }]));
    const use = (k, role, o = {}) => ({ role, keys: [k], from: `GlobalAuraAbility._buffs → template ${T}`, on: 'targets', buff: T, node: 'skchr_titi_3', ...o });
    const idx = { units: { char_4056_titi: { modes: [{ name: 'Default', attack: { class: 'RangedAttack' } }], skills: { skchr_titi_3: { rootClass: 'CastSkill', uses: [
      use('mark_loop', 'loop', { event: 'ON_BUFF_START', action: 'CreateBuff' }),
      use('wake_end', 'end', { event: 'ON_BUFF_FINISH', action: 'CreateEffect' }),
      use('tick_trig', 'trigger', { event: 'ON_BUFF_TRIGGER', action: 'CreateEffect' }),
      use('line_loop', 'loop', { event: 'ON_BUFF_START', action: 'CreateLineEffect' }),
      use('other_tgt', 'loop', { buff: 'not_signalled[x]' }),
    ] } } } }, skills: {}, projectiles: {}, prefabs };
    return skillPlan(idx, 'char_4056_titi', 'skchr_titi_3', { rec: { skillType: 'MANUAL', durationType: 'NONE', duration: 20 } });
  })();
  test('its loops and its end join plan.state on the carrier; a line, a tick and an unsignalled buff do not', () => {
    assert.deepEqual(plan.state.map((e) => [e.key, e.role, e.at, e.hold]), [['mark_loop', 'loop', 'carrier', 'state'], ['wake_end', 'end', 'carrier', 'state']]);
    assert.deepEqual(plan.targets.map((e) => e.key), ['line_loop', 'other_tgt'], 'as before');
    assert.ok(!plan.state.some((e) => e.key === 'line_loop' || e.key === 'tick_trig'));
  });
  test('SkillFx._states: the loop while the row lasts, the end once as it goes (on the carrier, from the src\'s plan)', () => {
    const played = [];
    const views = new Map();
    const w = { ofx: { time: 0, tier: 1, lib: new Set() }, view: (id) => views.get(id) || null, _dirIndex: () => 1,
      playOn: (k, v, o) => { const h = { k, id: v.id, o, alive: true, stop() { this.alive = false; h.stopped = true; } }; played.push(h); return h; } };
    const s = new SkillFx(w);
    s.of = (v) => (v.id === 1 ? { plan } : null);
    const op = { id: 1, alive: true }, foe = { id: 9, alive: true, fxs: [[T, 1, null]] };
    views.set(1, op); views.set(9, foe);
    s._states([op, foe]); s._states([op, foe]);
    assert.deepEqual(played.map((h) => [h.k, h.id, h.o.loop]), [['mark_loop', 9, true]], 'the end waits for the row to go');
    foe.fxs = null;
    s._states([op, foe]);
    assert.deepEqual(played.map((h) => [h.k, h.id, h.o.loop, !!h.stopped]), [['mark_loop', 9, true, true], ['wake_end', 9, false, false]]);
    s._states([op, foe]);
    assert.equal(played.length, 2, 'once');
  });
});
