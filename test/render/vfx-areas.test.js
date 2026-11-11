// test/render/vfx-areas.test.js — lingering areas under 官方特效 (0.3.1, the maintainer's report of 2026-10-16; history
// 0.3.1 §34.5, DESIGN §33.16): an enemy's kit zone bound to the official prefab its talent or skill plays there
// (skills.js ENEMY_FX_BINDINGS — 萨卡兹枯朽战士's death pool by the frame's 'die', 萨卡兹枯朽战车's by its 'cast',
// 假想敌：蚀裂's cloud by its kind alone, 鼠王's 沙狱 by its id), an aura's tick its talent loops stand for (深溟巢涌者's
// pulse and its hit on the units in it, 鼎沸's boil and its debuff loop), the operators' area bindings and covers (号角 S1,
// 浊心斯卡蒂 S3, 银灰 S2, 琴柳, 珊比, 假日威龙陈), a bound area's point on the ground and its reached effects played once,
// an attack-rooted enemy skill fired by its kit, 盐风主教昆图斯's 'tide' under its 【大潮】 window (ENEMY_FX_COVER, 0.3.2), a
// ground-placed effect's root at its point — and the procedural looks kept with the layer off or the prefabs not installed.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FxWiring, seedOf } from '../../public/js/render/vfx/wiring.js';
import { UF } from '../../shared/constants.js';
import { AURA_HOLD_S } from '../../public/js/render/vfx/skillfx.js';
import {
  ENEMY_FX_BINDINGS, ENEMY_FX_KINDS, auraTargets, enemyBindingKeys, modeLoopKeys, bindingEffects, FX_BINDINGS, FX_COVER, coverOf,
  ENEMY_FX_COVER, enemyCoverOf,
} from '../../public/js/render/vfx/skills.js';
import { compileEffect, Effect } from '../../public/js/render/vfx/effect.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX = path.join(ROOT, 'public/assets/local/fx/index.json');
const HAS_INDEX = existsSync(INDEX);

const LOOPING = new Set(['ymgtop_spin', 'enemy_nhpbr_attack_range', 'enemy_nhtank_attack_range', 'enemy_actoxi_idle', 'enemy_wintun_range', 'dsubrl_aura', 'cjhot_aura',
  'enemy_cjhot_debuff', 'horn_skill_01_hit_02_buff', 'skadi2_skill_03_buff', 'svrash_skill_02_buff', 'tinman_skill_01_range_01', 'sleach_skill_02_flag_01',
  'sleach_skill_02_ground_01', 'sleach_skill_03_flag_01', 'sleach_skill_03_range_loop_01', 'thumpy_skill_03_range_01', 'svash2_skill_03_range_01']);
const KEYS = [...LOOPING, 'svash2_skill_03_trail_02', 'svash2_skill_03_hit_01', 'svash2_skill_03_deploy_01', 'oxi_skill_03_trail_01', 'oxi_skill_03_hit_01', 'mousek_skill_02_range', 'mousek_skill_02_start', 'bombd_cast', 'enemy_dsubrl_attack_hit', 'horn_skill_01_hit_02', 'g_hit', 'g_enemy', 'g_heal',
  'tank_shell_hit', 'sleach_skill_03_range_start_01', 'chen2_skill_02_range_01', 'enemy_dslily_skill_02_start_l', 'enemy_dslily_skill_02_range',
  'enemy_dslily_skill_01_start'];
const GROUND = new Set(['enemy_nhpbr_attack_range', 'enemy_nhtank_attack_range', 'enemy_actoxi_idle', 'enemy_wintun_range', 'mousek_skill_02_range']);

function makeIndex({ installed = KEYS } = {}) {
  const prefabs = Object.fromEntries(installed.map((k) => [k, { file: `prefabs/${k}.json`, looping: LOOPING.has(k), ...(GROUND.has(k) ? { spawn: 5 } : {}) }]));
  const melee = (hit) => [{ name: 'Default', attack: null, combat: { class: 'MeleeAttack', cast: [], hit: [{ effects: [hit], directionType: 0 }] } }];
  const enemy = (o) => ({ kind: 'enemy', modes: melee('g_enemy'), skills: {}, talents: {}, startEffect: null, deadEffect: null, ...o });
  const aura = (k) => ({ role: 'loop', keys: [k], from: 'AuraAbility._effects', node: 'Talents/AOE' });
  return {
    units: {
      // 萨卡兹枯朽战士: PollutedDie fires its pool projectile at its death (no uses of its own)
      enemy_1267_nhpbr: enemy({ talents: { PollutedDie: { nodes: [{ node: 'Talent/PollutedDie', class: 'Talent', ability: 'BslimeTalent_1', when: null }], uses: [], projectiles: ['projectile_enemy_nhpbr_polluted'] } } }),
      // 萨卡兹枯朽战车: 秽蚀轰击 (PollutedRangedAtk) fires the shell and the pool projectile
      enemy_1272_nhtank: enemy({ skills: { pollutedrangedatk: { rootClass: 'EnemySkill', rootAbility: 'AbilityParallelGroup', projectiles: ['projectile_enemy_nhtank_polluted'], mode: null, uses: [] } } }),
      enemy_9006_actoxi: enemy({ projectiles: ['projectile_enemy_actoxi'] }),
      enemy_10044_wintun: enemy({ skills: { blockedboom: { rootClass: 'EnemySkill', rootAbility: 'ProjectileToTileAbility', projectiles: ['projectile_enemy_wintun_range'], mode: null, uses: [] } } }),
      // 鼠王 【沙狱】: a RangedAttack-rooted skill — its cast row on the boss, its castTarget row (the sandstorm) on the target
      enemy_1509_mousek: enemy({ modes: [{ name: 'Default', attack: { class: 'RangedAttack', cast: [], hit: [{ effects: ['g_enemy'], directionType: 0 }] }, combat: null }],
        skills: { sandstorm: { rootClass: 'EnemySkill', rootAbility: 'RangedAttack', projectiles: [], mode: null, uses: [
          { role: 'start', keys: ['mousek_skill_02_start'], from: 'UberEffectEmitter._castEffects', node: 'SandStorm', ability: 'RangedAttack', startEvent: 'ON_CAST_START', endEvent: 'ON_CAST_END', oneshot: true, list: 'cast' },
          { role: 'hit', keys: ['mousek_skill_02_range'], from: 'UberEffectEmitter._castTargetEffects', node: 'SandStorm', ability: 'RangedAttack', startEvent: 'ON_CAST_START', list: 'castTarget' },
        ] } } }),
      // 暴鸰: a RangedAttack-rooted skill whose attack (the bomb) comes 0.27 s after its cast — no kit fx stands for it
      enemy_1040_bombd: enemy({ modes: [{ name: 'Default', attack: null, combat: null }], skills: { boomb: { rootClass: 'EnemySkill', rootAbility: 'RangedAttack', projectiles: [], mode: null, uses: [
        { role: 'start', keys: ['bombd_cast'], from: 'UberEffectEmitter._castEffects', node: 'Boomb', ability: 'RangedAttack', startEvent: 'ON_SPELL_ON', endEvent: 'ON_CAST_END', oneshot: true, list: 'cast' },
      ] } } }),
      // 深溟巢涌者: the AOE aura's loop while it stands, its tick's hit on every unit in it
      enemy_1234_dsubrl: enemy({ talents: { AOE: { nodes: [{ node: 'Talents/AOE', class: 'AppearSyncedTalent', ability: 'AuraAbility', when: 'deploy' }], uses: [
        aura('dsubrl_aura'),
        { role: 'trigger', keys: ['enemy_dsubrl_attack_hit'], from: 'AuraAbility._buffs → template enemy_dsubrl_aoe[aura]', event: 'ON_BUFF_TRIGGER', on: 'targets', node: 'Talents/AOE' },
      ] } } }),
      // 鼎沸: the aoe aura's loop, its buff's loop on the units in it
      enemy_10054_cjhot: enemy({ talents: { aoe: { nodes: [{ node: 'Talents/AOE', class: 'AppearSyncedTalent', ability: 'AuraAbility', when: 'deploy' }], uses: [
        aura('cjhot_aura'),
        { role: 'loop', keys: ['enemy_cjhot_debuff'], from: 'AuraAbility._buffs', on: 'targets', node: 'Talents/AOE' },
      ] } } }),
      // 水遁忍者: its spin is its mode M1, whose RotateEffect talent loops at its feet
      enemy_10116_ymgtop: enemy({ modes: [{ name: 'Default', attack: null, combat: { class: 'MeleeAttack', cast: [], hit: [{ effects: ['g_enemy'], directionType: 0 }] } },
        { name: 'M1', attack: { class: 'MeleeAttack', cast: [], hit: [] }, combat: { class: 'EmptyAbility' } }],
        talents: { RotateEffect: { nodes: [{ node: 'Modes/M1/Body/Talents/RotateEffect', class: 'Talent', ability: 'PassiveBuffAbility', mode: 'M1', when: 'passive' }], uses: [
          { role: 'loop', keys: ['ymgtop_spin'], from: 'PassiveBuffAbility._buffs → template ymgtop_m1_t[rotate_effect]', event: 'ON_BUFF_TRIGGER', action: 'CreateBuff', on: 'owner', node: 'Modes/M1/Body/Talents/RotateEffect', mode: 'M1', life: { type: 'INFINITY', tick: 0.1 } },
        ] } } }),
      // 盐风主教昆图斯: 【大潮】 (TidewaterG2, a MeleeAttack-rooted skill) — its cast rows (the attack's cast / range) are the
      // wave; 【崩坍】's own cast row (the real rows: fx/index.json units.enemy_1521_dslily.skills)
      enemy_1521_dslily: enemy({ skills: {
        tidewaterg2: { rootClass: 'EnemySkill', rootAbility: 'MeleeAttack', projectiles: [], mode: null, uses: [
          { role: 'start', keys: ['enemy_dslily_skill_02_start_l'], from: 'UberEffectEmitter._castEffects', node: 'TidewaterG2', ability: 'MeleeAttack', startEvent: 'ON_CAST_START', oneshot: true, list: 'cast' },
          { role: 'range', keys: ['enemy_dslily_skill_02_range'], from: 'UberEffectEmitter._castEffects', node: 'TidewaterG2', ability: 'MeleeAttack', startEvent: 'ON_CAST_START', oneshot: true, list: 'cast' },
        ] },
        rockfallg2: { rootClass: 'EnemySkill', rootAbility: 'MeleeAttack', projectiles: [], mode: null, uses: [
          { role: 'start', keys: ['enemy_dslily_skill_01_start'], from: 'UberEffectEmitter._castEffects', node: 'RockfallG2', ability: 'MeleeAttack', startEvent: 'ON_CAST_START', oneshot: true, list: 'cast' },
        ] },
      } }),
      char_1045_svash2: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: { skchr_svash2_3: { rootClass: 'CastSkill', mode: null, projectiles: [], uses: [] } } },
      char_4247_oxi: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: { skchr_oxi_3: { rootClass: 'CastSkillWithSuspendable', mode: null, projectiles: [], uses: [] } } },
      char_4039_horn: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: { skchr_horn_1: { rootClass: 'ReplacementSkillFixed', mode: null, projectiles: ['projectile_chr_horn_s1_light'], uses: [] } } },
      char_1012_skadi2: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: { skchr_skadi2_3: { rootClass: 'CastSkill', mode: null, projectiles: [], uses: [aura('skadi2_skill_03_buff')] } } },
      char_172_svrash: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: { skchr_svrash_2: { rootClass: 'ToggleSkill', mode: null, projectiles: [], uses: [
        { role: 'loop', keys: ['svrash_skill_02_buff'], from: 'PassiveBuffAbility._buffs', node: 'skchr_svrash_2', on: 'owner' }] } } },
      char_4151_tinman: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: { skchr_tinman_1: { rootClass: 'CastSkill', mode: null, projectiles: ['projectile_chr_tinman_s1'], uses: [] } } },
      char_479_sleach: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: {
        skchr_sleach_2: { rootClass: 'CastSkill', mode: null, projectiles: [], uses: [] }, skchr_sleach_3: { rootClass: 'CastSkill', mode: null, projectiles: [], uses: [] } } },
      char_4235_thumpy: { kind: 'char', modes: melee('g_hit'), startEffect: null, deadEffect: null, skills: { skchr_thumpy_3: { rootClass: 'CastSkill', mode: null, projectiles: [], uses: [
        { role: 'loop', keys: ['thumpy_skill_03_range_01'], from: 'ActiveBuffAbility._buffs → template thumpy[skill_3_buff]', event: 'ON_BUFF_START', node: 'SwitchMode', on: 'owner' }] } } },
    },
    skills: {},
    projectiles: {
      projectile_enemy_nhpbr_polluted: { main: null, toTargetOnStart: ['enemy_nhpbr_attack_range'], effects: ['enemy_nhpbr_attack_range'] },
      projectile_enemy_nhtank_polluted: { main: null, onReached: ['enemy_nhtank_attack_range'], effects: ['enemy_nhtank_attack_range'] },
      projectile_enemy_actoxi: { main: null, onReached: ['enemy_actoxi_idle'], effects: ['enemy_actoxi_idle'] },
      projectile_enemy_wintun_range: { main: null, onReached: ['enemy_wintun_range'], effects: ['enemy_wintun_range'] },
      projectile_chr_svash2_s3_bird_self: { main: null, lifeTime: 0.3, movement: { speed: 10 }, onHit: ['svash2_skill_03_hit_01'], effects: [] },
      projectile_chr_horn_s1_light: { main: null, onReached: ['horn_skill_01_hit_02_buff', 'horn_skill_01_hit_02'], effects: [] },
      projectile_chr_tinman_s1: { main: null, onReached: ['tinman_skill_01_range_01'], effects: [] },
    },
    skins: {},
    generic: { hit: { phys: 'g_hit', arts: 'g_hit', enemy: 'g_enemy', heal: 'g_heal' }, die: {}, birth: {}, status: {} },
    prefabs,
  };
}

const opRec = (skillId, o = {}) => ({ skill: { skillId, index: 0, skillType: 'MANUAL', durationType: 'NONE', duration: 0, bb: {}, ...o } });
const RECS = {
  enemy_1272_nhtank: { skills: [{ prefabKey: 'PollutedRangedAtk', bb: {} }] },
  enemy_10044_wintun: { skills: [{ prefabKey: 'BlockedBoom', bb: {} }] },
  enemy_1509_mousek: { skills: [{ prefabKey: 'SandStorm', bb: { duration: 15 } }] },
  enemy_1040_bombd: { skills: [{ prefabKey: 'boomb', bb: {} }] },
  enemy_1521_dslily: { skills: [{ prefabKey: 'TidewaterG2', bb: {} }, { prefabKey: 'RockfallG2', bb: {} }] },
  enemy_10116_ymgtop: { talents: { bb: { 'EndRotate.rotate_duration': 5 } }, skills: [{ prefabKey: 'SwitchModeTrigger', bb: {} }] },
  char_4039_horn: opRec('skchr_horn_1'),
  char_4247_oxi: opRec('skchr_oxi_3'),
  char_1045_svash2: opRec('skchr_svash2_3', { durationType: 'NONE', duration: 48 }),
  char_1012_skadi2: opRec('skchr_skadi2_3', { duration: 20 }),
  char_172_svrash: opRec('skchr_svrash_2'),
  char_4151_tinman: opRec('skchr_tinman_1'),
  char_479_sleach: { skills: [{ skillId: 'skchr_sleach_1', index: 0 }, { skillId: 'skchr_sleach_2', index: 1, skillType: 'MANUAL', duration: 15, bb: {} }, { skillId: 'skchr_sleach_3', index: 2, skillType: 'MANUAL', duration: 10, bb: {} }] },
  char_4235_thumpy: { skills: [{ skillId: 'skchr_thumpy_1', index: 0 }, { skillId: 'skchr_thumpy_2', index: 1 }, { skillId: 'skchr_thumpy_3', index: 2, skillType: 'MANUAL', duration: 20, bb: {} }] },
};

async function setup({ active = true, installed, heightAt = null } = {}) {
  const index = makeIndex({ installed });
  const spawned = [];
  const handles = [];
  const ofx = {
    active, time: 0, lite: false, tier: active ? 'full' : 'off', timers: [], ctx: heightAt ? { heightAt } : {},
    lib: {
      has: (k) => !!index.prefabs[k], def: (k) => (index.prefabs[k] ? { isLoop: index.prefabs[k].looping, spawn: index.prefabs[k].spawn ?? 2 } : null),
      index: async () => index, preload: async (keys) => keys.length, defs: new Map(),
    },
    spawn(key, place, opts) {
      if (!this.active) return null;
      const h = { key, place, opts, stopped: false, get alive() { return !this.stopped; }, stop() { this.stopped = true; }, kill() { this.stopped = true; } };
      spawned.push(key); handles.push(h);
      return h;
    },
  };
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: (info) => RECS[info.defId] || null, view: (id) => views.get(id) || null });
  await w.ready();
  const view = (id, key, x, y = 9, o = {}) => {
    const isEnemy = /^enemy_/.test(key);
    const v = { id, x, y, z: 0, visFacing: 1, isEnemy, alive: true, flags: 0, sp: 0, spMax: 10, dir: isEnemy ? undefined : 'RIGHT',
      info: { id, spine: key, defId: key, side: isEnemy ? 'enemy' : 'ally', kind: isEnemy ? 'enemy' : 'op', skillIndex: o.skillIndex ?? 0 }, ...(o.v || {}) };
    views.set(id, v);
    return v;
  };
  const frame = (dt = 1 / 30) => { w.sync(views.values()); w.tick(); ofx.time += dt; };
  return { w, ofx, views, view, frame, spawned, handles, index };
}

const live = (handles, key) => handles.filter((h) => h.key === key && h.alive);
const zone = (o) => ({ r: 2, dur: 8, ...o });

describe('skills.js: the enemies\' kit-fx bindings', () => {
  test('every binding names its kind, owner and prefabs; the kinds index lists the units', () => {
    for (const [key, kinds] of Object.entries(ENEMY_FX_BINDINGS)) {
      for (const [kind, b] of Object.entries(kinds)) {
        assert.ok(['id', 'died', 'cast', 'near', 'any'].includes(b.owner), `${key} ${kind} owner`);
        assert.ok(b.talent || b.projectile || b.keys || b.modeLoops || b.endMode, `${key} ${kind} plays something`);
        assert.ok(ENEMY_FX_KINDS[kind].includes(key));
        if (b.owner === 'cast') assert.equal(typeof b.skill, 'string', 'a cast owner names the skill (its prefabKey, lower case)');
      }
    }
    assert.deepEqual(ENEMY_FX_KINDS.pulse, ['enemy_1234_dsubrl', 'enemy_1234_dsubrl_2']);
  });

  test("a binding's prefabs: a projectile's field it names (toTargetOnStart), else its reached effects; an aura's buff effects on its units", () => {
    const idx = makeIndex();
    assert.deepEqual(bindingEffects(idx, ENEMY_FX_BINDINGS.enemy_1267_nhpbr.zone), ['enemy_nhpbr_attack_range']);
    assert.deepEqual(bindingEffects(idx, ENEMY_FX_BINDINGS.enemy_1272_nhtank.zone), ['enemy_nhtank_attack_range']);
    assert.deepEqual(bindingEffects(idx, { projectile: 'projectile_enemy_nhpbr_polluted' }), [], 'no reached effect of its own');
    assert.deepEqual(auraTargets(idx, 'enemy_1234_dsubrl', 'AOE'), { shots: ['enemy_dsubrl_attack_hit'], loops: [] });
    assert.deepEqual(auraTargets(idx, 'enemy_10054_cjhot', 'aoe'), { shots: [], loops: ['enemy_cjhot_debuff'] });
    assert.deepEqual(enemyBindingKeys(idx, 'enemy_1234_dsubrl'), ['enemy_dsubrl_attack_hit']);
    assert.deepEqual(enemyBindingKeys(idx, 'enemy_1509_mousek'), ['mousek_skill_02_range']);
    assert.deepEqual(enemyBindingKeys(idx, 'char_4039_horn'), []);
    assert.deepEqual(modeLoopKeys(idx, 'enemy_10116_ymgtop', 'RotateEffect'), ['ymgtop_spin']);
    assert.deepEqual(enemyBindingKeys(idx, 'enemy_10116_ymgtop'), ['ymgtop_spin']);
  });
});

describe('an enemy\'s zone under the official layer', () => {
  test("萨卡兹枯朽战士: its death pool, in the frame of its 'die', plays its talent projectile's area at the point for the zone's time", async () => {
    const { w, view, frame, spawned, handles, ofx } = await setup();
    const e = view(1, 'enemy_1267_nhpbr', 7.7);
    frame();
    w.death(e);   // the sim's 'die' (render/app.js: wiring.death, else wiring.release) — the pool follows in the same frame
    assert.equal(w.simFx('zone', 7.71, 9, zone({ kind: 'pollution' })), true, 'the procedural pool is skipped');
    assert.deepEqual(spawned.filter((k) => k !== 'g_enemy'), ['enemy_nhpbr_attack_range']);
    const h = live(handles, 'enemy_nhpbr_attack_range')[0];
    assert.equal(h.opts.loop, true);
    assert.deepEqual(h.place.pos.slice(0, 2).map((x) => Math.round(x * 100) / 100), [-2.29, 0], 'at the pool: Unity x = board x − 10, y = board y − 9');
    ofx.time += 7.9; frame();
    assert.ok(h.alive);
    ofx.time += 0.2; frame();
    assert.ok(!h.alive, "gone with the zone's time (the projectile's life from the blackboard)");
  });

  test("a pool far from the death, a later frame's pool, another unit's death: not its zone (the procedural one stays)", async () => {
    const { w, view, frame } = await setup();
    const e = view(1, 'enemy_1267_nhpbr', 3), other = view(2, 'enemy_1272_nhtank', 7.7);
    frame();
    w.death(e);
    assert.equal(w.simFx('zone', 7.7, 9, zone({ kind: 'pollution' })), false, 'three tiles off the death');
    frame();
    assert.equal(w.simFx('zone', 3, 9, zone({ kind: 'pollution' })), false, "the frame's deaths are forgotten at its end");
    w.death(other);
    assert.equal(w.simFx('zone', 7.7, 9, zone({ kind: 'pollution' })), false, "a tank's death leaves no pool: no 'cast' in the frame");
  });

  test("萨卡兹枯朽战车 / 咸鳞汁推荐者: a zone in the frame of the skill's 'cast' is that skill's area; without the cast it is not", async () => {
    const { w, view, frame, spawned } = await setup();
    const t = view(1, 'enemy_1272_nhtank', 9), b = view(2, 'enemy_10044_wintun', 6);
    frame();
    assert.equal(w.simFx('zone', 7, 9, zone({ r: 1.7, dur: 10, kind: 'pollution' })), false, 'no cast this frame');
    w.enemyCast(t, 0);
    assert.equal(w.simFx('zone', 7, 9, zone({ r: 1.7, dur: 10, kind: 'pollution' })), true);
    assert.ok(spawned.includes('enemy_nhtank_attack_range'));
    frame();
    w.enemyCast(b, 0);
    assert.equal(w.simFx('zone', 6, 9, zone({ r: 1.5, dur: 30, kind: 'barrel' })), true);
    assert.ok(spawned.includes('enemy_wintun_range'));
    assert.equal(w.simFx('zone', 6, 9, zone({ r: 1.5, dur: 30, kind: 'pollution' })), false, 'another kind than its own');
  });

  test("a 秽蚀轰击 cast in the frame does not take a 枯朽战士's death pool; the zone's source id keeps the tank pool on that tile", async () => {
    const { w, view, frame, spawned } = await setup();
    const tank = view(1, 'enemy_1272_nhtank', 0), war = view(2, 'enemy_1267_nhpbr', 20);
    frame();
    w.enemyCast(tank, 0);
    w.death(war);
    assert.equal(w.simFx('zone', 20, 9, zone({ kind: 'pollution' })), true);
    assert.equal(w.simFx('zone', 0.2, 9, zone({ r: 1.7, dur: 10, kind: 'pollution' })), true);
    assert.deepEqual(spawned.filter((k) => k.startsWith('enemy_nh')), ['enemy_nhpbr_attack_range', 'enemy_nhtank_attack_range']);
    const onTile = await setup();
    const tank2 = onTile.view(1, 'enemy_1272_nhtank', 0), war2 = onTile.view(2, 'enemy_1267_nhpbr', 5);
    onTile.frame();
    onTile.w.enemyCast(tank2, 0);
    onTile.w.death(war2);
    assert.equal(onTile.w.simFx('zone', 5, 9, zone({ kind: 'pollution', id: 1 })), true, 'the source id is the tank');
    assert.deepEqual(onTile.spawned.filter((k) => k.startsWith('enemy_nh')), ['enemy_nhtank_attack_range']);
    const miss = await setup({ installed: KEYS.filter((k) => k !== 'enemy_nhtank_attack_range') });
    const tank3 = miss.view(1, 'enemy_1272_nhtank', 0), war3 = miss.view(2, 'enemy_1267_nhpbr', 20);
    miss.frame();
    miss.w.enemyCast(tank3, 0);
    miss.w.death(war3);
    assert.equal(miss.w.simFx('zone', 20, 9, zone({ kind: 'pollution' })), true, 'the tank prefab is missing: the death pool still plays');
    assert.deepEqual(miss.spawned.filter((k) => k.startsWith('enemy_nh')), ['enemy_nhpbr_attack_range']);
  });

  test("盐风主教昆图斯 【大潮】: its window's official wave stands for the kit's 'tide' (ENEMY_FX_COVER); not another skill's window, not uninstalled or off", async () => {
    assert.ok(enemyCoverOf('enemy_1521_dslily', 'TidewaterG2', 'tide') && enemyCoverOf('enemy_1521_dslily', 'tidewater', 'tide'));
    assert.ok(!enemyCoverOf('enemy_1521_dslily', 'rockfallg2', 'tide') && !enemyCoverOf('enemy_9033_acdeer', 'tidewaterg2', 'tide'));
    assert.deepEqual(Object.keys(ENEMY_FX_COVER.enemy_1521_dslily), ['tidewater', 'tidewaterg1', 'tidewaterg2']);
    const { w, view, frame, spawned } = await setup();
    const boss = view(1, 'enemy_1521_dslily', 10, 5);
    frame();
    assert.equal(w.simFx('tide', 10, 5, { id: 1 }), false, 'no window open: the procedural tide');
    w.enemyCast(boss, 0);   // the sim's 'cast' — the kit's 'tide' follows in the same tick
    assert.equal(w.simFx('tide', 10, 5, { id: 1 }), true, "the tide's window: no generic zone over the wave");
    frame(); frame();   // no 'atk' (the skill took the attack's turn): its attack's cast / range rows play at the next sync
    assert.deepEqual(spawned.filter((k) => k.startsWith('enemy_dslily')), ['enemy_dslily_skill_02_start_l', 'enemy_dslily_skill_02_range']);
    const rock = await setup();
    const b2 = rock.view(1, 'enemy_1521_dslily', 10, 5);
    rock.frame();
    rock.w.enemyCast(b2, 1);
    assert.equal(rock.w.simFx('tide', 10, 5, { id: 1 }), false, "崩坍's window: not the tide's");
    const lite = await setup({ installed: KEYS.filter((k) => !k.startsWith('enemy_dslily_skill_02')) });
    const b3 = lite.view(1, 'enemy_1521_dslily', 10, 5);
    lite.frame();
    lite.w.enemyCast(b3, 0);
    assert.equal(lite.w.simFx('tide', 10, 5, { id: 1 }), false, "the wave's prefabs not installed: the procedural tide");
    // the window open with its attack's rows planned, but those rows no longer installed: the install check decides
    const gone = await setup();
    const b5 = gone.view(1, 'enemy_1521_dslily', 10, 5);
    gone.frame();
    gone.w.enemyCast(b5, 0);
    const win = gone.w.skills.units.get(1)?.ewin;
    assert.ok(win && !win.draws && win.plan?.attacks?.[0], 'the window is open, has not drawn, and plans its attack');
    for (const k of ['enemy_dslily_skill_02_start_l', 'enemy_dslily_skill_02_range']) delete gone.index.prefabs[k];
    assert.equal(gone.w.simFx('tide', 10, 5, { id: 1 }), false, "the tide's window with its rows uninstalled: the procedural tide");
    const off = await setup({ active: false });
    const b4 = off.view(1, 'enemy_1521_dslily', 10, 5);
    off.frame();
    off.w.enemyCast(b4, 0);
    assert.equal(off.w.simFx('tide', 10, 5, { id: 1 }), false, '官方特效 off: the procedural tide');
  });

  test("假想敌：蚀裂's cloud lands on its killer after its death (no id, no frame): its kind is its own", async () => {
    const { w, frame, spawned } = await setup();
    frame();
    assert.equal(w.simFx('zone', 4, 10, zone({ r: 0.8, kind: 'poison' })), true);
    assert.deepEqual(spawned, ['enemy_actoxi_idle']);
  });

  test("鼠王's 沙狱 (id = it): the sandstorm once on its target for its own life; the boss's next attacks in the 15 s window are its own", async () => {
    const { w, view, frame, spawned, handles } = await setup();
    const boss = view(1, 'enemy_1509_mousek', 10), ally = view(2, 'char_4039_horn', 4, 10);
    frame();
    w.enemyCast(boss, 0, 15);
    assert.equal(w.simFx('zone', 4, 10, { r: 1, dur: 15, kind: 'sandStorm', id: 1 }), true);
    const h = live(handles, 'mousek_skill_02_range')[0];
    assert.ok(h && h.opts.important && !h.opts.loop, 'a one-shot of its own life, never capped');
    frame(); frame();   // no 'atk' in the cast's frame: the kit fired the skill's one attack itself
    const before = spawned.length;
    w.attack(boss, ally, 'enemy', 3);
    assert.ok(!spawned.slice(before).includes('mousek_skill_02_range') && !spawned.slice(before).includes('mousek_skill_02_start'), 'a normal attack, not the sandstorm again');
    assert.equal(w.skills.state(boss).plan, null);
  });

  test("an attack-rooted skill no kit fx stands for keeps its window's rows for its attack (暴鸰's bomb, 0.27 s after the cast)", async () => {
    const { w, view, frame, spawned } = await setup();
    const d = view(1, 'enemy_1040_bombd', 8), ally = view(2, 'char_4039_horn', 7);
    frame();
    w.enemyCast(d, 0);
    for (let i = 0; i < 8; i++) frame(1 / 30);
    const n = spawned.length;
    w.attack(d, ally, 'droneBomb', 1);
    assert.ok(spawned.slice(n).includes('bombd_cast'), "the bomb is the skill's attack: the window's rows play with it");
  });

  test('with the layer off, or the prefabs not installed, every procedural zone stays', async () => {
    const off = await setup({ active: false });
    const e = off.view(1, 'enemy_1267_nhpbr', 7.7);
    off.frame(); off.w.death(e);
    assert.equal(off.w.simFx('zone', 7.7, 9, zone({ kind: 'pollution' })), false);
    const lite = await setup({ installed: KEYS.filter((k) => !/^enemy_(nhpbr|actoxi)/.test(k)) });
    const e2 = lite.view(1, 'enemy_1267_nhpbr', 7.7);
    lite.frame(); lite.w.death(e2);
    assert.equal(lite.w.simFx('zone', 7.7, 9, zone({ kind: 'pollution' })), false);
    assert.equal(lite.w.simFx('zone', 4, 10, zone({ kind: 'poison' })), false);
  });
});

describe("an enemy aura's tick", () => {
  test("深溟巢涌者: its pulse is skipped while its aura loops are drawn, and the tick's damage plays the aura's hit on the unit in it", async () => {
    const { w, view, frame, spawned } = await setup();
    const e = view(1, 'enemy_1234_dsubrl', 8), a = view(2, 'char_4039_horn', 7), far = view(3, 'char_172_svrash', 3);
    w.spawned(e); frame();
    assert.ok(spawned.includes('dsubrl_aura'), 'the aura loops while it stands (talentfx.js)');
    assert.equal(w.simFx('pulse', 8, 9, { r: 1.6, id: 1, element: 'neural' }), true);
    assert.equal(w.damage(a, 'arts', null, 1), true, 'its hit stands for the spark');
    assert.equal(spawned.at(-1), 'enemy_dsubrl_attack_hit');
    assert.equal(w.damage(far, 'arts', null, 1), false, 'out of its radius');
    assert.equal(w.damage(a, 'true', null, 1), false, 'a second hit on the same ally keeps its spark');
    frame();
    assert.equal(w.damage(a, 'arts', null, 1.1), false, "a later frame's damage is not the tick's");
    const slop = view(4, 'char_4039_horn', 9.7);   // 1.7 past r 1.6: the old +0.6 would have taken it
    assert.equal(w.simFx('pulse', 8, 9, { r: 1.6, id: 1 }), true);
    assert.equal(w.damage(slop, 'arts', null, 1.2), false, 'past the sim radius');
  });

  test('two auras in the frame each play their hit on the unit inside both; a hit one took is offered to the other', async () => {
    const { w, view, frame, spawned } = await setup();
    const a = view(1, 'enemy_1234_dsubrl', 8), b = view(4, 'enemy_1234_dsubrl', 8.2), ally = view(2, 'char_4039_horn', 9.2);
    w.spawned(a); w.spawned(b); frame();
    assert.equal(w.simFx('pulse', 8, 9, { r: 1.6, id: 1 }), true);
    assert.equal(w.simFx('pulse', 8.2, 9, { r: 1.6, id: 4 }), true);
    assert.equal(w.damage(ally, 'arts', null, 1), true);
    assert.equal(w.damage(ally, 'true', null, 1), false, 'the second hit is not another tick');
    assert.equal(spawned.filter((k) => k === 'enemy_dsubrl_attack_hit').length, 2);
    const boil = await setup();
    const near = boil.view(1, 'enemy_10054_cjhot', 8), far = boil.view(2, 'enemy_10054_cjhot', 12);
    const op = boil.view(3, 'char_4039_horn', 8.2), op2 = boil.view(4, 'char_4039_horn', 12.2);
    boil.w.spawned(near); boil.w.spawned(far); boil.frame();
    assert.equal(boil.w.simFx('explode', 8.1, 9, { r: 1.6, kind: 'boil' }), true);
    assert.equal(boil.w.simFx('explode', 12, 9, { r: 1.6, kind: 'boil' }), true);
    assert.equal(boil.w.damage(op, 'arts', null, 1), true);
    assert.equal(boil.w.damage(op2, 'arts', null, 1), true, 'the other aura still has its own hit');
    assert.equal(boil.spawned.filter((k) => k === 'enemy_cjhot_debuff').length, 2);
  });

  test('鼎沸 (no id): its boil at its feet is its tick; the units it hurts carry its buff loop until AURA_HOLD_S after the last tick', async () => {
    const { w, view, frame, handles, ofx } = await setup();
    const e = view(1, 'enemy_10054_cjhot', 8), a = view(2, 'char_4039_horn', 7.2);
    w.spawned(e); frame();
    assert.equal(w.simFx('explode', 8.1, 9, { r: 1.6, kind: 'boil' }), true);
    assert.equal(w.damage(a, 'arts', null, 1), true);
    const h = live(handles, 'enemy_cjhot_debuff')[0];
    assert.ok(h && h.opts.loop && h.opts.important, 'a held loop on the unit');
    ofx.time += 1; frame();
    assert.equal(w.simFx('explode', 8.1, 9, { r: 1.6, kind: 'boil' }), true);
    assert.equal(w.damage(a, 'arts', null, 2), true);
    assert.equal(live(handles, 'enemy_cjhot_debuff').length, 1, 'refreshed, never twice');
    ofx.time += AURA_HOLD_S + 0.05; frame();
    assert.ok(!h.alive, 'it left the aura (or the aura ended)');
    assert.equal(w.simFx('explode', 3, 9, { r: 1.6, kind: 'boil' }), false, 'a boil nowhere near one');
  });

  test("水遁忍者: its spin's telegraph starts its mode M1 — the RotateEffect loop at its feet — for the record's time, or until 失衡's spinStop", async () => {
    const { w, view, frame, handles, ofx } = await setup();
    const e = view(1, 'enemy_10116_ymgtop', 8);
    w.spawned(e); frame();
    assert.equal(live(handles, 'ymgtop_spin').length, 0, 'not while it walks');
    assert.equal(w.simFx('telegraph', 8, 9, { r: 1, kind: 'spin', id: 1 }), true, 'the procedural telegraph is skipped');
    frame();
    const h = live(handles, 'ymgtop_spin')[0];
    assert.ok(h && h.opts.loop, 'its mode M1: the talent of the mode loops on it');
    ofx.time += 4.8; frame();
    assert.ok(h.alive);
    ofx.time += 0.3; frame(); frame();
    assert.ok(!h.alive, "EndRotate.rotate_duration (5 s here) ended it");
    assert.equal(w.simFx('telegraph', 8, 9, { r: 1, kind: 'spin', id: 1 }), true);
    frame();
    const h2 = live(handles, 'ymgtop_spin')[0];
    assert.equal(w.simFx('phase', 8, 9, { kind: 'spinStop', id: 1 }), false, 'the stop keeps its procedural cue');
    frame();
    assert.ok(!h2.alive, '失衡 stopped the spin');
    const lite = await setup({ installed: KEYS.filter((k) => k !== 'ymgtop_spin') });
    const e2 = lite.view(1, 'enemy_10116_ymgtop', 8);
    lite.w.spawned(e2); lite.frame();
    assert.equal(lite.w.simFx('telegraph', 8, 9, { r: 1, kind: 'spin', id: 1 }), false, 'not installed: the procedural telegraph');
  });

  test('an aura whose loops are not drawn (not installed) keeps its procedural pulse and sparks', async () => {
    const lite = await setup({ installed: KEYS.filter((k) => k !== 'dsubrl_aura') });
    const e = lite.view(1, 'enemy_1234_dsubrl', 8), a = lite.view(2, 'char_4039_horn', 7);
    lite.w.spawned(e); lite.frame();
    assert.equal(lite.w.simFx('pulse', 8, 9, { r: 1.6, id: 1 }), false);
    assert.equal(lite.w.damage(a, 'arts', null, 1), false);
  });
});

describe('凛御银灰 S3: the bird of each attack', () => {
  const casting = async (o = {}) => {
    const t = await setup(o);
    const s = t.view(1, 'char_1045_svash2', 5, 9, { v: o.v });
    const a = t.view(2, 'enemy_1040_bombd', 6, 9);
    const b = t.view(3, 'enemy_1040_bombd', 7, 9);
    t.frame();
    t.w.skill(s, true);
    return { ...t, s, a, b };
  };

  test('the cast: the aura range stays for the skill, the bird lands once, no flight before an attack', async () => {
    const { spawned, handles } = await casting();
    assert.ok(spawned.includes('svash2_skill_03_deploy_01'));
    assert.equal(live(handles, 'svash2_skill_03_range_01').length, 1);
    assert.ok(!spawned.includes('svash2_skill_03_trail_02'));
  });

  test('one attack on two enemies is one flight, placed on him; nothing moves it along a line', async () => {
    const { w, s: su, a, b, spawned, handles } = await casting();
    w.attack(su, a, 'none', 1);
    w.attack(su, b, 'none', 1);
    assert.equal(spawned.filter((k) => k === 'svash2_skill_03_trail_02').length, 1);
    const trail = handles.find((h) => h.key === 'svash2_skill_03_trail_02');
    assert.equal(trail.place.pos[0], 5 - 10, 'from him');
    assert.equal(w.skills.units.get(1).plan.line.artYaw, -Math.PI / 2);
    assert.equal(w.skills.shots.size, 0);
  });

  test('an art authored off its main direction turns by artYaw: the bird heads for the target', async () => {
    const yawOf = (toward) => {
      const place = { yaw: 0 };
      FxWiring.prototype._orient.call(null, { rotateType: 4 }, place, { x: 7, y: 9 }, { toward, artYaw: -Math.PI / 2 }, { dir: 'RIGHT' });
      return place.yaw;
    };
    // the clip runs along the root's +Y (static_offset +90°): after the root's yaw, heading = yaw + 90°
    assert.equal(yawOf({ x: 8, y: 9 }) + Math.PI / 2, 0, 'a target on the right: heading right');
    assert.equal(yawOf({ x: 7, y: 10 }) + Math.PI / 2, Math.PI / 2, 'a target above: heading up');
    assert.equal(yawOf({ x: 6, y: 9 }) + Math.PI / 2, Math.PI, 'a target on the left: heading left');
  });

  test('each hit waits for the bird: its way at the projectile speed, at most its life', async () => {
    const { w, s: su, a, view, frame, spawned, ofx } = await casting();
    const far = view(5, 'enemy_1040_bombd', 9, 9);
    w.attack(su, a, 'none', 1);
    w.attack(su, far, 'none', 1);
    w.damage(a, 'phys', su, 1);
    w.damage(far, 'phys', su, 1);
    const hits = () => spawned.filter((k) => k === 'svash2_skill_03_hit_01').length;
    assert.equal(hits(), 0, 'not at the damage');
    ofx.time += 0.11;
    frame();
    assert.equal(hits(), 1, 'the near enemy, 1 tile at 10 tiles / s');
    ofx.time += 0.2;
    frame();
    assert.equal(hits(), 2, 'the far one at the end of its 0.3 s life');
  });

  test('the skill off: no flight; without the extracted prefabs nothing of it plays', async () => {
    const off = await setup();
    const s = off.view(1, 'char_1045_svash2', 5);
    const e = off.view(2, 'enemy_1040_bombd', 6);
    off.frame();
    off.w.attack(s, e, 'none', 1);
    assert.ok(!off.spawned.includes('svash2_skill_03_trail_02'));
    const none = await casting({ installed: KEYS.filter((k) => !k.startsWith('svash2_')) });
    none.w.attack(none.s, none.a, 'none', 1);
    none.w.damage(none.a, 'phys', none.s, 1);
    assert.deepEqual(none.spawned.filter((k) => k.startsWith('svash2_')), []);
  });
});

describe('凛御银灰: the attack clip follows the ability that fired', () => {
  const group = {
    name: 'Default',
    attack: { class: 'AbilityRandomGroup', select: { method: 'random' }, abilities: [
      { class: 'MeleeAttack', animKey: '', node: 'Modes/Default/Body/Attack/AttackA', cast: [], hit: [] },
      { class: 'MeleeAttack', animKey: '', node: 'Modes/Default/Body/Attack/AttackB', cast: [], hit: [] },
      { class: 'MeleeAttack', animKey: '', node: 'Modes/Default/Body/Attack/AttackC', cast: [], hit: [] },
    ] },
  };
  const expected = (id, nth) => ['Attack_A', 'Attack_B', 'Attack_C'][seedOfForTest(id, nth) % 3];
  const seedOfForTest = (id, nth) => seedOf(id, nth) >>> 0;

  test('the letter of the ability the seeded pick fires, attack after attack; both clips and effects share it', async () => {
    const { w, index, view, frame } = await setup();
    index.units.char_1045_svash2.modes = [group];
    const s = view(1, 'char_1045_svash2', 5);
    const e = view(2, 'enemy_1040_bombd', 6);
    frame();
    for (let n = 0; n < 6; n++) {
      assert.equal(w.attackClip(s, e, 'none'), expected(1, n), `attack ${n}`);
      w.attackN.set(1, n + 1);
    }
  });

  test('not while the skill is on, not for an enemy or another kind of group', async () => {
    const { w, index, view, frame } = await setup();
    index.units.char_1045_svash2.modes = [group];
    const s = view(1, 'char_1045_svash2', 5);
    const e = view(2, 'enemy_1040_bombd', 6);
    frame();
    assert.equal(w.attackClip(e, s, 'none'), null);
    w.skill(s, true);
    assert.equal(w.attackClip(s, e, 'none'), null);
    const t = await setup();
    const h = t.view(1, 'char_4039_horn', 5);
    t.frame();
    assert.equal(t.w.attackClip(h, null, 'none'), null);
  });

  test('a skill with no mode of its own: the pick only when its role is the attack\'s', async () => {
    const { w, index, view, frame } = await setup();
    index.units.char_1045_svash2.modes = [group];
    const s = view(1, 'char_1045_svash2', 5);
    const e = view(2, 'enemy_1040_bombd', 6);
    frame();
    w.skill(s, true);
    s.actor = { roles: { skill: { via: 'attack' } } };
    assert.equal(w.attackClip(s, e, 'none'), expected(1, 0));
    s.actor = { roles: { skill: { loop: 'Skill_1_A' } } };
    assert.equal(w.attackClip(s, e, 'none'), null);
  });
});

describe('attack clips by the official pick (ATTACK_CLIPS)', () => {
  const melee = (animKey, name = animKey, cast = []) => ({ class: 'MeleeAttack', animKey, node: `Modes/Default/Body/Attack/${name}`, cast, hit: [] });
  const group = (method, abilities, extra = {}) => ({ class: 'AbilityRandomGroup', select: { method, ...extra }, abilities });
  const emitter = (loopTypeName, replaceAnims, sourceAnimKey) => ({ class: 'UberAnimationEffectEmitter', sourceAnimKey, loopTypeName, replaceAnims });
  const row = (effect) => [{ startEvent: 3, effects: [effect] }];
  async function unit(key, modes, o = {}) {
    const t = await setup();
    t.index.units[key] = { kind: 'char', modes };
    const s = t.view(1, key, 5, 9, o);
    if (o.dir) s.dir = o.dir;
    const e = t.view(2, 'enemy_1040_bombd', 6);
    t.frame();
    return { ...t, s, e };
  }
  const walk = (t, kind, n, f) => {
    for (let i = 0; i < n; i++) {
      f(i, t.w.attackClip(t.s, t.e, kind));
      t.w.attackN.set(1, i + 1);
    }
  };

  test('random, never twice: the clip, the wind-up\'s effects and the strike\'s effects are one pick', async () => {
    const t = await unit('char_391_rosmon', [{ name: 'Default', attack: group('random', [
      melee('Attack_A', 'Attack_A', row('fx_a')), melee('Attack_B', 'Attack_B', row('fx_b')),
    ], { diffFromLast: true }) }]);
    const m = t.index.units.char_391_rosmon.modes[0];
    let prev = null;
    walk(t, 'none', 12, (n, clip) => {
      const wind = t.w._attackSet(t.index.units.char_391_rosmon, m, t.s, t.e, 'none', n);
      const strike = t.w._attackSet(t.index.units.char_391_rosmon, m, t.s, t.e, 'none', n);
      const fx = clip === 'Attack_A' ? 'fx_a' : 'fx_b';
      assert.equal(wind.cast[0].effects[0], fx, `wind-up ${n}`);
      assert.equal(strike.cast[0].effects[0], fx, `strike ${n}`);
      assert.equal(t.w.attackClip(t.s, t.e, 'none'), clip, 'asking again changes nothing');
      assert.notEqual(clip, prev, `attack ${n} differs from the last`);
      prev = clip;
    });
  });

  test('a loop group goes in turn; Chongyue\'s skill window keeps its role\'s clip', async () => {
    const pair = () => group('loop', [melee('Attack_A'), melee('Attack_B')]);
    const t = await unit('char_2024_chyue', [{ name: 'Default', attack: pair() }, { name: 'Changed', attack: pair() }]);
    walk(t, 'none', 4, (n, clip) => assert.equal(clip, ['Attack_A', 'Attack_B'][n % 2]));
    t.s.flags = UF.SKILL;
    assert.equal(t.w.attackClip(t.s, t.e, 'none'), null);
  });

  test('parallel sub-abilities: the one with the emitter names the clip (Haruka S3)', async () => {
    const first = { ...melee('Skill_3_Loop_A', 'FirstAttack'), emitters: [emitter('RANDOM', ['Skill_3_Loop_A', 'Skill_3_Loop_B'], 'Skill_3_Loop_A')] };
    const t = await unit('char_4202_haruka', [{ name: 'Default', attack: group('parallel', [first, melee('', 'Shield')]) }]);
    walk(t, 'none', 4, (n, clip) => assert.equal(clip, ['Skill_3_Loop_A', 'Skill_3_Loop_B'][seedOf(1, n) % 2]));
  });

  test('an empty animKey goes by its node (伺夜 S3), the skin\'s and the mode\'s tables by mode (f12yin, wang)', async () => {
    const vigil = await unit('char_427_vigil', [{ name: 'Default', attack: melee('') }, { name: 'S3', attack: group('sequential', [melee('', 'Attack_A'), melee('', 'Attack_B'), melee('', 'Attack_C')]) }], { skillIndex: 2 });
    assert.equal(vigil.w.attackClip(vigil.s, vigil.e, 'none'), null, 'its Default has one attack');
    vigil.w.skills.state = () => ({ on: true, plan: { modeName: 'S3' }, U: null });
    vigil.w.skills.attackFx = () => null;
    walk(vigil, 'none', 3, (n, clip) => assert.equal(clip, `Skill3_Attack_${'ABC'[n]}`));
    const shan = await unit('char_264_f12yin', [{ name: 'Default', attack: group('loop', [melee('Attack_1'), melee('Attack_2')]) }]);
    walk(shan, 'none', 2, (n, clip) => assert.equal(clip, ['Attack_A', 'Attack_B'][n]));
    const em = () => ({ ...melee('Attack_A'), emitters: [emitter('LOOP', ['Attack_A', 'Attack_B'], 'Attack_A')] });
    const wang = await unit('char_2027_wang', [{ name: 'Default', attack: em() }, { name: 'S2', attack: em() }], { skillIndex: 1 });
    walk(wang, 'none', 2, (n, clip) => assert.equal(clip, ['Attack_1_A', 'Attack_1_B'][n]));
    wang.w.skills.state = () => ({ on: true, plan: { modeName: 'S2' }, U: null });
    wang.w.skills.attackFx = () => null;
    wang.w.attackN.set(1, 0);
    walk(wang, 'none', 2, (n, clip) => assert.equal(clip, ['Attack_2_A', 'Attack_2_B'][n]));
  });

  test('an emitter\'s list: in turn or seeded, as its rows are', async () => {
    const lin = await unit('char_4046_ebnhlz', [{ name: 'Default', attack: { ...melee('Skill_3_A'), emitters: [emitter('LOOP', ['Skill_3_A', 'Skill_3_B', 'Skill_3_C'], 'Skill_3_A')] } }]);
    walk(lin, 'none', 4, (n, clip) => assert.equal(clip, ['Skill_3_A', 'Skill_3_B', 'Skill_3_C', 'Skill_3_A'][n]));
    const em = emitter('RANDOM', ['Attack_1', 'Attack_2'], 'Attack_1');
    const a = { ...melee('Attack_1'), emitters: [em] };
    const v = await unit('char_1019_siege2', [{ name: 'Default', attack: a }]);
    walk(v, 'none', 6, (n, clip) => {
      assert.equal(clip, ['Attack_1', 'Attack_2'][seedOf(1, n) % 2]);
      assert.ok(v.w._rowOk({ anim: clip }, em, v.s, n, 0), 'its row plays');
      assert.ok(!v.w._rowOk({ anim: clip === 'Attack_1' ? 'Attack_2' : 'Attack_1' }, em, v.s, n, 0), 'the other does not');
    });
  });

  test('one attack on several targets is one clip: asked again in its frame, at the strike only', async () => {
    const t = await unit('char_4010_etlchi', [{ name: 'Default', attack: group('loop', [melee('Skill_3_Loop_A'), melee('Skill_3_Loop_B')]) }]);
    t.w.attack(t.s, t.e, 'none', 1);
    assert.equal(t.w.attackN.get(1), 1);
    assert.equal(t.w.attackClip(t.s, t.e, 'none', undefined, true), 'Skill_3_Loop_A', 'the next target of this attack');
    assert.equal(t.w.attackClip(t.s, t.e, 'none'), 'Skill_3_Loop_B', 'the look-ahead: the coming attack');
  });

  test('facing down: Wisadel\'s down clips, the down list of char_4229_aphris\'s mode only the table names', async () => {
    const three = () => group('loop', [melee('Attack_A'), melee('Attack_B'), melee('Attack_C')]);
    const w1 = await unit('char_1035_wisdel', [{ name: 'Default', attack: three() }], { dir: 'DOWN' });
    walk(w1, 'none', 3, (n, clip) => assert.equal(clip, `Attack_Down_${'ABC'[n]}`));
    const w2 = await unit('char_1035_wisdel', [{ name: 'Default', attack: three() }]);
    walk(w2, 'none', 3, (n, clip) => assert.equal(clip, `Attack_${'ABC'[n]}`));
    const sk1 = { ...melee('Attack'), emitters: [emitter('LOOP', ['Skill_1_Loop_A', 'Skill_1_Loop_B'], 'Attack'), emitter('LOOP', ['Skill_Down_1_Loop_A', 'Skill_Down_1_Loop_B'], 'Attack_Down')] };
    const modes = () => [{ name: 'Default', attack: melee('Attack') }, { name: 'Sk1', attack: sk1 }];
    const a1 = await unit('char_4229_aphris', modes());
    assert.equal(a1.w.attackClip(a1.s, a1.e, 'none'), null, 'skill off: its Default has one attack');
    a1.s.flags = UF.SKILL;
    walk(a1, 'none', 2, (n, clip) => assert.equal(clip, ['Skill_1_Loop_A', 'Skill_1_Loop_B'][n]));
    const a2 = await unit('char_4229_aphris', modes(), { dir: 'DOWN' });
    a2.s.flags = UF.SKILL;
    walk(a2, 'none', 2, (n, clip) => assert.equal(clip, ['Skill_Down_1_Loop_A', 'Skill_Down_1_Loop_B'][n]));
  });

  test('仇白: her random pick is her Combat, only on the enemy she blocks', async () => {
    const t = await unit('char_4082_qiubai', [{ name: 'Default', attack: { class: 'RangedAttack', animKey: 'Attack', node: 'Attack', cast: [], hit: [] }, combat: group('loop', [melee('Combat_A'), melee('Combat_B')]) }]);
    assert.equal(t.w.attackClip(t.s, t.e, 'arrow'), null, 'not blocking: her one shot');
    t.s.flags = UF.BLOCKED;
    walk(t, 'none', 2, (n, clip) => assert.equal(clip, ['Combat_A', 'Combat_B'][n]));
  });

  test('no pick decides it: a state-driven group, an operator off the table, the skill\'s own rows', async () => {
    const trig = await unit('char_4202_haruka', [{ name: 'Default', attack: group('trigger', [melee('Attack', 'AttackAndShield'), melee('Attack', 'ShieldOnly')]) }]);
    assert.equal(trig.w.attackClip(trig.s, trig.e, 'none'), null);
    const off = await unit('char_009_off_table', [{ name: 'Default', attack: group('random', [melee('Attack_A'), melee('Attack_B')]) }]);
    assert.equal(off.w.attackClip(off.s, off.e, 'none'), null);
    const rep = await unit('char_391_rosmon', [{ name: 'Default', attack: group('random', [melee('Attack_A'), melee('Attack_B')]) }]);
    rep.w.skills.attackFx = () => ({ replace: true });
    assert.equal(rep.w.attackClip(rep.s, rep.e, 'none'), null);
  });
});

describe('塔露拉 S3: the 簇火 fly their lanes', () => {
  const volley = (o = {}) => ({ id: 1, skill: 'oxi:heatwave', n: 2, lanes: [[2, 9, 0, 1], [2, 10, 0.3, 2]], dx: 1, dy: 0, len: 10, speed: 2.5, ...o });
  const fake = (time) => ({ time, anchor: [0, 0, 0], def: {}, stopped: null, stop(o) { this.stopped = o; } });

  test('each lane flies the main effect from its birth delay on, at the fx\'s speed; nothing procedural is drawn', async () => {
    const { w, view, frame, spawned, handles, ofx } = await setup();
    view(1, 'char_4247_oxi', 5);
    frame();
    assert.equal(w.simFx('heatwave', 5, 9, volley()), true);
    frame();
    assert.deepEqual(spawned, ['oxi_skill_03_trail_01'], 'the second lane waits for its birth delay');
    ofx.time += 0.3;
    frame();
    assert.equal(spawned.length, 2);
    assert.deepEqual(handles[1].place.pos.slice(0, 2), [2 - 10, 10 - 9], 'starts on its own tile, in the effects\' frame');
    const fx = fake(2);
    handles[0].opts.track(fx);
    assert.deepEqual(fx.anchor, [2 + 2.5 * 2 - 10, 0, 0], 'along +x at speed × time');
    assert.equal(fx.yaw, 0);
    assert.equal(fx.stopped, null);
  });

  test('its way runs out: the flight stops at len / speed and is forgotten', async () => {
    const { w, view, frame, handles, ofx } = await setup();
    view(1, 'char_4247_oxi', 5);
    frame();
    w.simFx('heatwave', 5, 9, volley({ lanes: [[2, 9, 0, 1]] }));
    frame();
    const fx = fake(4);
    handles[0].opts.track(fx);
    assert.deepEqual(fx.stopped, { hit: true });
    assert.equal(w.skills.shots.size, 0);
    assert.ok(ofx.time < 1);
  });

  test('facing left the art turns, and the tile\'s height carries it', async () => {
    const { w, view, frame, handles } = await setup({ heightAt: (r, c) => (c < 2 ? 1 : 0) });
    view(1, 'char_4247_oxi', 5);
    frame();
    w.simFx('heatwave', 5, 9, volley({ lanes: [[3, 9, 0, 1]], dx: -1 }));
    frame();
    const fx = fake(1);
    handles[0].opts.track(fx);
    assert.equal(fx.anchor[0], 3 - 2.5 - 10);
    assert.equal(fx.anchor[2], -1, 'over the high ground');
    assert.ok(Math.abs(Math.abs(fx.yaw) - Math.PI) < 1e-9, 'heads for -x');
  });

  test('the blast that names a shot ends its flight, plays the official explosion on the enemy; a shot not yet born never flies', async () => {
    const { w, view, frame, spawned, handles, ofx } = await setup();
    view(1, 'char_4247_oxi', 5);
    const e = view(2, 'enemy_1040_bombd', 7);
    frame();
    w.simFx('heatwave', 5, 9, volley());
    frame();
    assert.equal(w.simFx('blast', 7, 9, { id: 1, r: 1.5, skill: 'oxi:heatwave', target: e.info.id, shot: 1 }), true);
    assert.equal(handles[0].stopped, true, 'the flying effect stops');
    assert.ok(spawned.includes('oxi_skill_03_hit_01'));
    assert.equal(w.simFx('blast', 7, 10, { id: 1, r: 1.5, skill: 'oxi:heatwave', target: e.info.id, shot: 2 }), true);
    ofx.time += 0.4;
    frame();
    assert.equal(spawned.filter((k) => k === 'oxi_skill_03_trail_01').length, 1, 'shot 2 was gone before its birth');
  });

  test('(fork) 过载 draws nothing — the official raises a sound only —, while her skill runs or not; no procedural stand-in', async () => {
    const { w, view, frame, spawned } = await setup();
    view(1, 'char_4247_oxi', 5);
    frame();
    assert.equal(w.simFx('overload', 5, 9, { x: 5, y: 9, id: 1 }), true, 'claimed');
    assert.deepEqual(spawned, [], 'nothing played');
    view(2, 'enemy_1040_bombd', 7);
    frame();
    assert.equal(w.simFx('overload', 7, 9, { x: 7, y: 9, id: 2 }), false, "another unit's overload: the kit's own");
  });

  test('without the extracted prefabs the procedural cue stays; a cleared field stops the flights', async () => {
    const none = await setup({ installed: KEYS.filter((k) => !k.startsWith('oxi_')) });
    none.view(1, 'char_4247_oxi', 5);
    none.frame();
    assert.equal(none.w.simFx('heatwave', 5, 9, volley()), false);
    assert.equal(none.w.simFx('blast', 7, 9, { id: 1, r: 1.5, skill: 'oxi:heatwave', shot: 1 }), false);
    const { w, view, frame, spawned, handles, ofx } = await setup();
    view(1, 'char_4247_oxi', 5);
    frame();
    w.simFx('heatwave', 5, 9, volley());
    frame();
    w.skills.clear();
    assert.equal(handles[0].stopped, true);
    ofx.time += 0.4;
    frame();
    assert.equal(spawned.length, 1, 'the unborn one stays unborn');
  });

  test('preloading: the unit\'s keys hold both prefabs', async () => {
    const { w, view } = await setup();
    const v = view(1, 'char_4247_oxi', 5);
    const keys = w.keysFor([v], false);
    for (const k of ['oxi_skill_03_trail_01', 'oxi_skill_03_hit_01']) assert.ok(keys.includes(k), k);
  });
});

describe('operators\' areas', () => {
  test('号角 S1: the flare is the light projectile\'s reached effects at the shot\'s landing point for its time', async () => {
    const { w, view, frame, spawned } = await setup();
    view(1, 'char_4039_horn', 4);
    frame();
    assert.equal(w.simFx('zone', 9.9, 9, { id: 1, r: 1.7, duration: 6 }), true);
    assert.deepEqual(spawned, ['horn_skill_01_hit_02_buff', 'horn_skill_01_hit_02']);
    assert.ok(FX_BINDINGS.skchr_horn_1.zone);
  });

  test('浊心斯卡蒂 S3 and 银灰 S2: the cast\'s tide / snow is covered by the skill\'s own loops (FX_COVER); 珊比 S3 / 假日威龙陈 S2 / S3 likewise', async () => {
    assert.ok(coverOf('skchr_skadi2_3', 'tide') && coverOf('skchr_svrash_2', 'snow') && coverOf('skchr_thumpy_3', 'zone'));
    assert.ok(coverOf('skchr_chen2_2', 'zone') && coverOf('skchr_chen2_3', 'zone') && FX_COVER.skchr_chen2_3);
    const { w, view, frame } = await setup();
    const s = view(1, 'char_1012_skadi2', 5), g = view(2, 'char_172_svrash', 6);
    frame();
    w.skill(s, true); w.skill(g, true);
    assert.equal(w.simFx('tide', 5, 9, { id: 1 }), true);
    assert.equal(w.simFx('snow', 6, 9, { id: 2 }), true);
    const lite = await setup({ installed: KEYS.filter((k) => !/^(skadi2|svrash)_/.test(k)) });
    const s2 = lite.view(1, 'char_1012_skadi2', 5);
    lite.frame(); lite.w.skill(s2, true);
    assert.equal(lite.w.simFx('tide', 5, 9, { id: 1 }), false, "the skill's effects not installed: the procedural tide");
  });

  test('琴柳 S2 / S3 (自选): the flag and its ground at the flag\'s tile while the skill lasts; S3\'s strike there', async () => {
    const { w, view, frame, spawned } = await setup();
    const a = view(1, 'char_479_sleach', 6, 9, { skillIndex: 2 });
    frame();
    w.skill(a, true);
    assert.equal(w.simFx('zone', 7, 9, { radius: 1.5, dur: 10, id: 1, skill: 'sleach:flag' }), true);
    assert.deepEqual(spawned.filter((k) => /^sleach/.test(k)), ['sleach_skill_03_flag_01', 'sleach_skill_03_range_loop_01']);
    assert.equal(w.simFx('aoe', 7, 9, { radius: 1.5, id: 1, skill: 'sleach:strike' }), true);
    assert.equal(spawned.at(-1), 'sleach_skill_03_range_start_01');
  });
});

describe("a bound area's place", () => {
  test("its point lies on the field's tile there, not at its owner's height (锡人 on the high ground, his flask on the road)", async () => {
    const { w, view, frame, handles } = await setup({ heightAt: (r, c) => (c <= 4 ? 0.42 : 0) });
    const t = view(1, 'char_4151_tinman', 4, 10, { v: { z: 0.42 } });
    frame(); w.skill(t, true);
    assert.equal(w.simFx('zone', 6, 9, { radius: 1, dur: 8, id: 1, skill: 'tinman1' }), true);
    const h = live(handles, 'tinman_skill_01_range_01')[0];
    assert.equal(h.place.groundZ, -0, 'on the road (before 0.3.1: the 0.42 of his tile)');
    const plain = await setup();
    const t2 = plain.view(1, 'char_4151_tinman', 4, 10, { v: { z: 0.42 } });
    plain.frame(); plain.w.skill(t2, true);
    plain.w.simFx('zone', 6, 9, { radius: 1, dur: 8, id: 1, skill: 'tinman1' });
    assert.equal(live(plain.handles, 'tinman_skill_01_range_01')[0].place.groundZ, -0.42, 'no field heights (a test layer): its owner\'s, as before');
  });

  test("the flight's arrival leaves the reached effects to the binding that places them (锡人's flask drew twice)", async () => {
    const { w, view, frame, spawned, index, ofx } = await setup();
    const t = view(1, 'char_4151_tinman', 4), e = view(2, 'enemy_1267_nhpbr', 6);
    frame(); w.skill(t, true);
    w._arrive(index.projectiles.projectile_chr_tinman_s1, e, [-4, 0, 0], null, null, t);
    assert.ok(!spawned.includes('tinman_skill_01_range_01'), 'the skill lasts: its kit\'s zone places them');
    assert.equal(w.skills.bindsReached(t, index.projectiles.projectile_chr_tinman_s1), true);
    w.skill(t, false);
    ofx.time += 2; frame();   // past COVER_AFTER_S after its end
    w._arrive(index.projectiles.projectile_chr_tinman_s1, e, [-4, 0, 0], null, null, t);
    assert.ok(spawned.includes('tinman_skill_01_range_01'), 'out of its skill: the arrival plays them as before');
  });

  test("an effect's root sits on its point (the client sets its localPosition): a ground-placed one, a hit's and a projectile's (§34.6.1)", () => {
    const desc = (cls, spawn) => ({ root: 0, nodes: [
      { id: 0, name: 'root', parent: -1, active: true, pos: [0, 0, 10], rot: [0, 0, 0, 1], scale: [1, 1, 1], behaviours: [{ class: cls, fields: cls === 'ParticleEffect' ? { _spawnLocation: spawn } : {} }] },
      { id: 1, name: 'static_offset', parent: 0, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
    ], materials: [] });
    const at = (cls, spawn) => {
      const fx = new Effect(compileEffect(desc(cls, spawn)), { seed: 1 });
      fx.place({ pos: [1, 2, 0], groundZ: 0 });
      fx._matrices();
      return Array.from(fx.world[0].slice(12, 15)).map((x) => Math.round(x * 100) / 100);
    };
    assert.deepEqual(at('ParticleEffect', 5), [1, 2, 0], 'GROUND_CENTER: at the anchor (萨卡兹枯朽战士\'s pool is saved 10 tiles under the board)');
    assert.deepEqual(at('ParticleEffect', 2), [1, 2, 0], 'a HitPoint effect: at the anchor too (§34.6.1: every root)');
    assert.deepEqual(at('ProjectileEffect', 0), [1, 2, 0], "a projectile's own effect: on the projectile's body (§34.6.1)");
  });
});

describe('the extracted effects (when fx was extracted on this machine)', { skip: !HAS_INDEX && 'no public/assets/local/fx/index.json (tools/local-extract: extract.py --only fx --fx-set used)' }, () => {
  const idx = HAS_INDEX ? JSON.parse(readFileSync(INDEX, 'utf8')) : null;
  test("every enemy binding's prefabs and the new operator bindings resolve to extracted prefabs of the client", () => {
    for (const [key, kinds] of Object.entries(ENEMY_FX_BINDINGS)) {
      assert.ok(idx.units[key] || idx.units[key.replace(/_\d+$/, '')], `${key} is a unit of the index`);
      for (const [kind, b] of Object.entries(kinds)) {
        if (b.endMode) continue;
        if (b.modeLoops) {
          const keys = modeLoopKeys(idx, key, b.modeLoops);
          assert.ok(keys.length && keys.every((k) => idx.prefabs[k]), `${key}: ${b.modeLoops}'s loops ${keys.join(' ')}`);
          continue;
        }
        const keys = b.talent ? (() => { const a = auraTargets(idx, key, b.talent); return [...a.shots, ...a.loops]; })() : bindingEffects(idx, b);
        assert.ok(keys.length, `${key} ${kind} has prefabs`);
        for (const k of keys) assert.ok(idx.prefabs[k], `${key} ${kind}: ${k} extracted`);
        if (b.talent) assert.ok(idx.units[key].talents[b.talent], `${key}: talent ${b.talent}`);
        if (b.owner === 'cast') assert.ok(idx.units[key].skills[b.skill], `${key}: skill ${b.skill}`);
      }
    }
    for (const sid of ['skchr_horn_1', 'skchr_sleach_2', 'skchr_sleach_3', 'skchr_oxi_3']) {
      for (const [kind, b] of Object.entries(FX_BINDINGS[sid])) {
        const keys = bindingEffects(idx, b);
        // (fork) `none`: the official draws nothing there (塔露拉 S3's 过载) — it names no prefab at all
        if (b.none) { assert.deepEqual([keys.length, b.keys, b.projectile], [0, undefined, undefined], `${sid} ${kind}: none names nothing`); continue; }
        assert.ok(keys.length && keys.every((k) => idx.prefabs[k]), `${sid} ${kind}: ${keys.join(' ')}`);
      }
    }
  });

  test("萨卡兹枯朽战士's pool: the talent fires the projectile whose start effect it is; the prefab lies 10 tiles under its root's placement", () => {
    const u = idx.units.enemy_1267_nhpbr;
    assert.deepEqual(u.talents.PollutedDie.projectiles, ['projectile_enemy_nhpbr_polluted']);
    assert.deepEqual(idx.projectiles.projectile_enemy_nhpbr_polluted.toTargetOnStart, ['enemy_nhpbr_attack_range']);
    assert.equal(idx.prefabs.enemy_nhpbr_attack_range.spawn, 5);
  });
});
