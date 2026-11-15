// test/render/vfx-aglna2-kit.test.js — (fork) 予愿安洁莉娜 (char_1015_aglna2) S2 under 官方特效 (user, 2026-11-15: "she's
// missing her landing animation when she return to the original position"): the skill's start rows fly_end_01–03 are the
// ON_BUFF_START of aglna2_s_2[chant_end] (ChantWithProjectileBeforeSkill._buffOnAfterEndAnim, with Skill_2_Begin), so the
// cast holds them back (skills.js HELD_START) and the chant's 'rise' stage plays them (`startRows`, skillfx.js _heldStart).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxWiring } from '../../public/js/render/vfx/wiring.js';
import { FX_BINDINGS, HELD_START } from '../../public/js/render/vfx/skills.js';

const LANDING = ['aglna2_skill_02_fly_end_01', 'aglna2_skill_02_fly_end_02', 'aglna2_skill_02_fly_end_03'];
const LOOPS = ['aglna2_skill_02_buff_weapon_02', 'aglna2_skill_02_buff_weapon_01', 'aglna2_skill_02_buff_01'];

describe('skills.js: 予愿安洁莉娜 S2\'s landing (data)', () => {
  test('the chant\'s rise plays the held start rows; only S2 holds them', () => {
    assert.deepEqual(FX_BINDINGS.skchr_aglna2_2.aglna2Chant.startRows, { form: 'rise' });
    assert.ok(HELD_START.has('skchr_aglna2_2'));
    assert.ok(!HELD_START.has('skchr_aglna2_1') && !HELD_START.has('skchr_aglna2_3'));
  });
});

// the official index's rows of skchr_aglna2_2 (public/assets/local/fx/index.json, 2026-11-15), trimmed to what the plan reads
function makeIndex() {
  const prefabs = Object.fromEntries([...LANDING, ...LOOPS].map((k) => [k, { file: `prefabs/${k}.json`, looping: LOOPS.includes(k), spawn: 2 }]));
  const loop = (k, buff) => ({ role: 'loop', keys: [k], on: 'owner', buff, from: `template ${buff}` });
  const land = (k) => ({ role: 'start', keys: [k], event: 'ON_BUFF_START', on: 'owner', buff: 'aglna2_s_2[chant_end]',
    from: 'ChantWithProjectileBeforeSkill._buffOnAfterEndAnim → template aglna2_s_2[chant_end]' });
  const s2 = { rootClass: 'CastSkill', rootAbility: 'ActiveBuffAbility', effects: [...LOOPS, ...LANDING], projectiles: [], mode: null,
    uses: [loop(LOOPS[0], 'aglna2_s_2[eff2]'), loop(LOOPS[1], 'aglna2_s_2[eff1]'), loop(LOOPS[2], 'aglna2_s_2[eff2]'), ...[LANDING[0], ...LANDING].map(land)] };
  return {
    units: { char_1015_aglna2: { kind: 'char', modes: [{ name: 'Default', attack: { class: 'RangedAttack', cast: [], hit: [] }, combat: null }], talents: {},
      startEffect: null, deadEffect: null, skills: { skchr_aglna2_2: s2 } } },
    projectiles: {}, skins: {}, skinPairs: {}, prefabs, generic: {},
  };
}

async function setup() {
  const index = makeIndex();
  const handles = [];
  const ofx = {
    active: true, time: 0, lite: false, tier: 'full', timers: [], ctx: {},
    lib: { has: (k) => !!index.prefabs[k], def: (k) => (index.prefabs[k] ? { isLoop: index.prefabs[k].looping, spawn: 2 } : null), index: async () => index, preload: async (k) => k.length, defs: new Map() },
    spawn(key, place, opts) { const h = { key, place, opts, stopped: false, get alive() { return !this.stopped; }, stop() { this.stopped = true; }, kill() { this.stopped = true; } }; handles.push(h); return h; },
  };
  const rec = { skill: { skillId: 'skchr_aglna2_2', index: 1, skillType: 'MANUAL', durationType: 'NONE', duration: 22, bb: {} } };
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: (info) => (info.defId === 'char_1015_aglna2' ? rec : null), view: (id) => views.get(id) || null });
  await w.ready();
  const v = { id: 1, x: 5, y: 4, z: 0, visFacing: 1, isEnemy: false, alive: true, flags: 0, sp: 0, spMax: 10, dir: 'RIGHT',
    info: { id: 1, spine: 'char_1015_aglna2', defId: 'char_1015_aglna2', side: 'ally', kind: 'op', skillIndex: 1 } };
  views.set(1, v);
  const frame = (dt = 1 / 30) => { w.sync(views.values()); w.tick(); ofx.time += dt; };
  return { w, v, frame, keys: () => handles.map((h) => h.key) };
}

describe('予愿安洁莉娜 S2 under the official layer (runtime)', () => {
  test('the cast starts the loops but not the landing; the chant\'s takeoff end draws nothing; its rise plays the landing on her', async () => {
    const { w, v, frame, keys } = await setup();
    frame();
    w.skill(v, true);
    for (const k of LOOPS) assert.ok(keys().includes(k), `${k} at the cast`);
    for (const k of LANDING) assert.ok(!keys().includes(k), `${k} not at the cast`);
    frame();
    assert.equal(w.simFx('aglna2Chant', 5, 4, { id: 1, form: 'chantEnd' }), true, 'claimed: the clip change only');
    for (const k of LANDING) assert.ok(!keys().includes(k), `${k} not at the takeoff end`);
    assert.equal(w.simFx('aglna2Chant', 5, 4, { id: 1, form: 'rise', land: false, follow: null }), true);
    for (const k of LANDING) assert.ok(keys().includes(k), `${k} at the rise`);
  });
});
