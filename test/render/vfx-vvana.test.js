// test/render/vfx-vvana.test.js — (fork) 薇薇安娜 (char_4098_vvana) as the official client draws her, and the outfit pairs:
// S1 — a plain cast is the attack it replaces (S1_Attack2, Attack), 蓄力 (every charge stored) its own idle and loop, the
// cast after it S1_Attack (Skill_1_Attack, the _s_ effects): render/units.js vvanaSkillRole, render/vfx/skills.js
// COND_BUFFS / CHARGED_CASTS; S2 — Attack_Once / Attack_Twice drawn by the hits that land (wiring.js hitSuperset); S3 —
// the first cast of a deployment in mode S3_1 (_A clips), later ones in S3_2 (_B): CAST_MODES / castModePlan; outfit
// pairs per outfit id (index.json skinPairs): a suffix two operators share keeps each one's own.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hitSuperset, FxWiring } from '../../public/js/render/vfx/wiring.js';
import { skillPlan, attackFx, castModePlan, CAST_MODES, CHARGED_CASTS, COND_BUFFS } from '../../public/js/render/vfx/skills.js';
import { vvanaSkillRole } from '../../public/js/render/units.js';
import { enginePivotLocal } from '../../public/js/render/vfx/geom.js';
import { ENGINE_MESH_RULES } from '../../public/js/render/vfx/effect.js';

const cast = (k) => ({ effects: [k], directionType: 0, oneshot: 0, startEvent: 2, endEvent: 3 });
const hit = (k, group = null) => ({ effects: [k], directionType: 0, oneshot: 1, endEvent: 3, group });

describe('S2: a random pick the damage count shows (hitSuperset)', () => {
  const once = { class: 'MeleeAttack', node: 'A/Attack_Once', cast: [cast('s'), cast('s2')], hit: [hit('h1')] };
  const twice = { class: 'MultiMeleeAttack', node: 'A/Attack_Twice', cast: [cast('s'), cast('s2')], hit: [hit('h1', 0), hit('h2', 1)] };
  test('the widest of subs that differ only in their hits', () => {
    assert.equal(hitSuperset([once, twice]), twice);
    assert.equal(hitSuperset([twice, once]), twice);
  });
  test('none for other cast rows, other hit effects or equal hits', () => {
    assert.equal(hitSuperset([{ ...once, cast: [cast('x')] }, twice]), null);
    assert.equal(hitSuperset([{ ...once, hit: [hit('other')] }, twice]), null);
    assert.equal(hitSuperset([once, { ...once, node: 'B' }]), null);
    assert.equal(hitSuperset([once]), null);
  });
});

describe('the actor roles per cast (vvanaSkillRole)', () => {
  test('S1: the cast is her attack — no Begin, its swing kept', () => {
    const r = vvanaSkillRole(0, 1, false);
    assert.deepEqual([r.begin, r.loop, r.via, r.keepAttack], [null, 'Attack', 'attack', true]);
  });
  test('S3: the _A set on the first cast of a deployment (down: its own attack), _B on every later one (its Begin_B too); no End', () => {
    assert.deepEqual(vvanaSkillRole(2, 1, false), { begin: 'Skill_3_Begin_A', loop: 'Skill_3_Attack_A', end: null, idle: 'Skill_3_Idle_A' });
    assert.equal(vvanaSkillRole(2, 1, true).loop, 'Skill_Down_3_Attack_A');
    assert.deepEqual(vvanaSkillRole(2, 2, true), { begin: 'Skill_3_Begin_B', loop: 'Skill_3_Attack_B', end: null, idle: 'Skill_3_Idle_B' });
    assert.equal(vvanaSkillRole(2, 5, false).loop, 'Skill_3_Attack_B');
  });
  test('S2 keeps the manifest\'s roles', () => assert.equal(vvanaSkillRole(1, 1, false), null));
});

// a pocket index shaped as the client 26-10-29's (index.json units.char_4098_vvana, skills.skchr_vvana_1 / _3)
function vvIndex() {
  const keys = ['l_start', 'l_hit_01', 'l_hit_02', 's_start', 's_hit_01', 's_hit_02', 's_hit_03', 's_buff', 'l_buff', 'a3', 'b3'];
  const prefabs = Object.fromEntries(keys.map((k) => [k, { file: `prefabs/${k}.json`, looping: /buff/.test(k) }]));
  const emitter = (node, ability, role, k, extra = {}) => ({ role, keys: [k], from: role === 'hit' ? 'MultiHitUberEffectEmitter._hitGroups' : 'MultiHitUberEffectEmitter._castEffects', node, ability, oneshot: role === 'hit', list: role === 'hit' ? 'hit' : 'cast', ...extra });
  return {
    units: {
      char_4098_vvana: {
        modes: [{ name: 'Default', attack: { class: 'MeleeAttack' } }, { name: 'S1', attack: { class: 'MeleeAttack' } }, { name: 'S2', attack: { class: 'MeleeAttack' } },
          { name: 'S3_1', attack: { class: 'MultiMeleeAttack', cast: [cast('a3')] } }, { name: 'S3_2', attack: { class: 'MultiMeleeAttack', cast: [cast('b3')] } }],
        skills: {
          skchr_vvana_1: { rootClass: 'ReplacementSkillFixed', uses: [
            { role: 'ready', keys: ['l_buff'], from: 'ReadySkillEffect._effects', node: 'skchr_vvana_1' },
            { role: 'loop', keys: ['s_buff'], from: 'ToggleablePassiveBuffAbility._unmanagedBuffsWhenToggleOn → template vvana_s_1[mode]', event: 'ON_BUFF_START', action: 'CreateBuff', on: 'owner', buff: 'vvana_s_1[mode]', node: 'ExtraAbility0', life: { type: 'INFINITY' } },
            emitter('S1_Attack2', 'MultiMeleeAttack', 'loop', 'l_start'),
            emitter('S1_Attack2', 'MultiMeleeAttack', 'hit', 'l_hit_01', { group: 0, groups: 2 }),
            emitter('S1_Attack2', 'MultiMeleeAttack', 'hit', 'l_hit_02', { group: 1, groups: 2 }),
            emitter('S1_Attack', 'MultiMeleeAttack', 'loop', 's_start'),
            emitter('S1_Attack', 'MultiMeleeAttack', 'hit', 's_hit_01', { group: 0, groups: 3 }),
            emitter('S1_Attack', 'MultiMeleeAttack', 'hit', 's_hit_02', { group: 1, groups: 3 }),
            emitter('S1_Attack', 'MultiMeleeAttack', 'hit', 's_hit_03', { group: 2, groups: 3 }),
          ] },
          skchr_vvana_3: { rootClass: 'CastSkill', uses: [], mode: null },
        },
      },
    },
    skills: {}, projectiles: {}, prefabs,
  };
}

describe('S1: 蓄力 and the two casts (COND_BUFFS, CHARGED_CASTS)', () => {
  const idx = vvIndex();
  const plan = skillPlan(idx, 'char_4098_vvana', 'skchr_vvana_1', { rec: { skillType: 'AUTO', durationType: 'NONE', duration: 0 } });
  test('the toggle\'s loop is the full-charges state, not the cast\'s', () => {
    assert.deepEqual(plan.cond.map((e) => e.key), ['s_buff']);
    assert.ok(!plan.loop.some((e) => e.key === 's_buff'));
    assert.deepEqual(COND_BUFFS['vvana_s_1[mode]'].full, ['vvana_skill_01_s_buff']);
  });
  test('a plain cast draws S1_Attack2 (2 groups), the cast after 蓄力 S1_Attack (3 groups)', () => {
    const cc = CHARGED_CASTS.skchr_vvana_1;
    const plain = attackFx(plan, { node: cc.plain }), charged = attackFx(plan, { node: cc.charged });
    assert.deepEqual([plain.node, plain.cast.map((e) => e.key), plain.hit.length], ['S1_Attack2', ['l_start'], 2]);
    assert.deepEqual([charged.node, charged.cast.map((e) => e.key), charged.hit.length], ['S1_Attack', ['s_start'], 3]);
  });
});

describe('S3: the cast\'s mode (CAST_MODES, castModePlan)', () => {
  const idx = vvIndex();
  const plan = skillPlan(idx, 'char_4098_vvana', 'skchr_vvana_3', { rec: { skillType: 'MANUAL', durationType: 'NONE', duration: 15 } });
  test('S3_1 then S3_2, each its mode index', () => {
    assert.deepEqual(CAST_MODES.skchr_vvana_3, ['S3_1', 'S3_2']);
    assert.equal(plan.modeName, null, 'the data names no mode');
    const a = castModePlan(idx, plan, 'S3_1'), b = castModePlan(idx, plan, 'S3_2');
    assert.deepEqual([a.mode, a.modeName, b.mode, b.modeName], [3, 'S3_1', 4, 'S3_2']);
    assert.equal(castModePlan(idx, plan, 'S9'), null);
  });
});

describe('outfit pairs per outfit id (index.json skinPairs)', () => {
  const index = {
    units: {}, skills: {}, projectiles: {}, skins: {}, generic: { hit: {}, die: {}, birth: {}, status: {} },
    // by suffix (older clients): both operators' pairs merged — the leak
    skinFx: { 'epoque#59': { common_char_birth_01: 'vvana_birth_01_epoque#59', horn_hit: 'horn_hit_epoque#59' } },
    skinPairs: { 'char_4098_vvana@epoque#59': { common_char_birth_01: 'vvana_birth_01_epoque#59' } },
    prefabs: Object.fromEntries(['common_char_birth_01', 'vvana_birth_01_epoque#59', 'horn_hit', 'horn_hit_epoque#59'].map((k) => [k, { file: `prefabs/${k}.json` }])),
  };
  const ofx = { active: true, time: 0, lib: { has: (k) => !!index.prefabs[k], index: async () => index, defs: new Map() }, spawn: () => null };
  const v = (model) => ({ id: 1, info: { model } });
  test('the wearer\'s own pair; another operator of the suffix keeps the plain key; name twins stay by suffix', async () => {
    const w = new FxWiring(ofx, { record: () => null, view: () => null });
    await w.ready();
    assert.equal(w.skinKey('common_char_birth_01', v('char_4098_vvana@epoque#59')), 'vvana_birth_01_epoque#59');
    assert.equal(w.skinKey('common_char_birth_01', v('char_4039_horn@epoque#59')), 'common_char_birth_01');
    assert.equal(w.skinKey('horn_hit', v('char_4039_horn@epoque#59')), 'horn_hit_epoque#59');
  });
  test('an index without skinPairs keeps skinFx whole', async () => {
    const old = { ...index, skinPairs: undefined };
    const w = new FxWiring({ ...ofx, lib: { ...ofx.lib, index: async () => old } }, { record: () => null, view: () => null });
    await w.ready();
    assert.equal(w.skinKey('common_char_birth_01', v('char_4039_horn@epoque#59')), 'vvana_birth_01_epoque#59');
  });
});

describe('the client engine\'s mesh particle rules (effect.js ENGINE_MESH_RULES, geom.js enginePivotLocal)', () => {
  test('the pivot packed as (x, −z, y) and scaled by the particle\'s size (UnityPlayer.dll DrawMeshParticles)', () => {
    assert.deepEqual(enginePivotLocal([0, 0, 5.52], 0.15, 0.3, 0.5).map((v) => +v.toFixed(4)), [0, -1.656, 0]);
    assert.deepEqual(enginePivotLocal([1, 2, 0], 2, 3, 4), [2, -0, 8]);
  });
  test('还愿礼 S2\'s staircase is drawn by them', () => {
    assert.deepEqual(ENGINE_MESH_RULES['vvana_skill_02_buff_01_epoque#59'], ['stairs ab']);
  });
});
