// test/render/vfx-blaze2-kit.test.js — (fork) 烛煌 (char_1040_blaze2) under 官方特效, against the user's clip
// RjrtWhMKwAU (2026-11-11): S1's ring on the operator it picks (FX_BINDINGS aoe 'blaze2Aid' → blaze2_skill_01_hit_range for
// max_duration), T2's downed ring held from the kit's 'downed' to its 'revive' (`hold: 'until'`) and the stand-up burst,
// those talent loops no longer played from the deploy (KIT_HELD_TALENT_KEYS), S2's burning tiles (FX_HIT_TILES) and her
// Revive_* clips while downed (FORMS).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FxWiring } from '../../public/js/render/vfx/wiring.js';
import { FX_BINDINGS, FX_HIT_TILES, KIT_HELD_TALENT_KEYS, bindingKeys } from '../../public/js/render/vfx/skills.js';
import { talentBindings, bindingKeys as talentKeys } from '../../public/js/render/vfx/talents.js';
import { FORMS } from '../../public/js/render/units.js';
import { UF } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX = path.join(ROOT, 'public/assets/local/fx/index.json');
const HAS_INDEX = existsSync(INDEX);
const REVIVE_LOOPS = ['blaze2_revive_buff', 'blaze2_revive_buff_03'];
const SKILLS = ['skchr_blaze2_1', 'skchr_blaze2_2', 'skchr_blaze2_3'];

describe('skills.js: 烛煌\'s bindings (data)', () => {
  test('S1: the kit\'s blaze2Aid area plays blaze2_skill_01_hit_range at its point for the skill\'s max_duration', () => {
    const b = FX_BINDINGS.skchr_blaze2_1.aoe;
    assert.deepEqual({ owner: b.owner, only: b.only, at: b.at, hold: b.hold, keys: b.keys },
      { owner: 'id', only: { skill: 'blaze2Aid' }, at: 'point', hold: 'max_duration', keys: ['blaze2_skill_01_hit_range'] });
  });

  test('T2 (a talent: under every skill): downed holds both reborn loops until the revive, which plays the stand-up burst', () => {
    for (const sid of SKILLS) {
      const { downed, revive } = FX_BINDINGS[sid];
      assert.deepEqual([downed.hold, downed.until, downed.keys], ['until', 'revive', REVIVE_LOOPS], sid);
      assert.deepEqual([revive.oneshot, revive.keys], [true, ['blaze2_revive_end_start']], sid);
    }
    assert.deepEqual([...KIT_HELD_TALENT_KEYS].sort(), [...REVIVE_LOOPS, 'blaze2_revive_end_start'].sort());
  });

  test('S2: its hits mark their tile with blaze2_skill_02_hit_plot, preloaded with the skill', () => {
    assert.deepEqual(FX_HIT_TILES.skchr_blaze2_2, ['blaze2_skill_02_hit_plot']);
    assert.ok(bindingKeys(null, 'skchr_blaze2_2').includes('blaze2_skill_02_hit_plot'));
    assert.ok(bindingKeys(null, 'skchr_blaze2_1').includes('blaze2_revive_buff_03'), 'the talent loops preload with any skill');
  });

  test('units.js FORMS: downed kneels on Revive_Begin → Revive_Idle and stands up on Revive_End — clips her model and outfits have', () => {
    const f = FORMS.char_1040_blaze2.downed;
    assert.deepEqual([f.change, f.roles.idle, f.leave, f.roles.attack, f.roles.skill], ['Revive_Begin', 'Revive_Idle', 'Revive_End', null, null]);
    const a = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
    const models = [a.chars.char_1040_blaze2, a.outfits.chars['char_1040_blaze2@winter#5'], a.outfits.chars['char_1040_blaze2@nlc#1']];
    for (const m of models) for (const c of ['Revive_Begin', 'Revive_Idle', 'Revive_End']) assert.ok(c in m.spine.front.animations, c);
  });

  test('talents.js: the reborn loops are no binding of the talent any more (they burned at her feet from the deploy)', { skip: !HAS_INDEX && 'no local fx index' }, () => {
    const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
    const keys = talentBindings(idx, 'char_1040_blaze2').flatMap((b) => talentKeys(b));
    for (const k of REVIVE_LOOPS) assert.ok(!keys.includes(k), k);
  });
});

// a minimal official layer (vfx-areas.test.js's rig): every spawn a handle, timers run by the frames
const KEYS = ['blaze2_skill_01_start', 'blaze2_skill_01_hit_range', 'blaze2_skill_02_hit_plot', 'blaze2_revive_buff', 'blaze2_revive_buff_03',
  'blaze2_revive_end_start', 'g_enemy'];
const LOOPING = new Set(['blaze2_skill_01_hit_range', 'blaze2_skill_02_hit_plot', 'blaze2_revive_buff', 'blaze2_revive_buff_03']);
function makeIndex() {
  const prefabs = Object.fromEntries(KEYS.map((k) => [k, { file: `prefabs/${k}.json`, looping: LOOPING.has(k), spawn: /range|plot/.test(k) ? 5 : 2 }]));
  const cast = (sid, key) => ({ rootClass: 'CastSkill', rootAbility: 'AnimatedActionToTargetAbility', effects: [key], projectiles: [], mode: null, uses: [
    { role: 'start', keys: [key], from: 'UberEffectEmitter._castEffects', node: sid, ability: 'AnimatedActionToTargetAbility', startEvent: 'ON_CAST_START', endEvent: 'ON_CAST_END', oneshot: true, list: 'cast' }] });
  return {
    units: {
      char_1040_blaze2: { kind: 'char', modes: [{ name: 'Default', attack: { class: 'RangedAttack', cast: [], hit: [] }, combat: null }], talents: {}, startEffect: null, deadEffect: null,
        skills: { skchr_blaze2_1: cast('skchr_blaze2_1', 'blaze2_skill_01_start'), skchr_blaze2_2: cast('skchr_blaze2_2', 'blaze2_skill_01_start') } },
      enemy_1: { kind: 'enemy', modes: [{ name: 'Default', attack: null, combat: { class: 'MeleeAttack', cast: [], hit: [{ effects: ['g_enemy'], directionType: 0 }] } }], skills: {}, talents: {} },
    },
    projectiles: {}, skins: {}, skinPairs: {}, prefabs, generic: {},
  };
}
async function setup(skillId) {
  const index = makeIndex();
  const handles = [];
  const ofx = {
    active: true, time: 0, lite: false, tier: 'full', timers: [], ctx: {},
    lib: { has: (k) => !!index.prefabs[k], def: (k) => (index.prefabs[k] ? { isLoop: index.prefabs[k].looping, spawn: index.prefabs[k].spawn } : null), index: async () => index, preload: async (k) => k.length, defs: new Map() },
    spawn(key, place, opts) { const h = { key, place, opts, stopped: false, get alive() { return !this.stopped; }, stop() { this.stopped = true; }, kill() { this.stopped = true; } }; handles.push(h); return h; },
  };
  const rec = { skill: { skillId, index: Number(skillId.slice(-1)) - 1, skillType: 'MANUAL', durationType: 'NONE', duration: 0, bb: { max_duration: 20 } } };
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: (info) => (info.defId === 'char_1040_blaze2' ? rec : null), view: (id) => views.get(id) || null });
  await w.ready();
  const view = (id, key, x, y = 4) => {
    const isEnemy = key.startsWith('enemy_');
    const v = { id, x, y, z: 0, visFacing: 1, isEnemy, alive: true, flags: 0, sp: 0, spMax: 10, dir: isEnemy ? undefined : 'RIGHT',
      info: { id, spine: key, defId: key, side: isEnemy ? 'enemy' : 'ally', kind: isEnemy ? 'enemy' : 'op', skillIndex: rec.skill.index } };
    views.set(id, v);
    return v;
  };
  const frame = (dt = 1 / 30) => { w.sync(views.values()); w.tick(); ofx.time += dt; };
  const run = (s) => { for (let i = 0; i < Math.round(s * 30); i++) frame(); };
  return { w, ofx, view, frame, run, handles, live: (k) => handles.filter((h) => h.key === k && h.alive) };
}

describe('烛煌 under the official layer (runtime)', () => {
  test('S1: the kit\'s blaze2Aid area — the ring on the ground at its point for max_duration, the procedural ring skipped', async () => {
    const { w, view, frame, run, live } = await setup('skchr_blaze2_1');
    view(1, 'char_1040_blaze2', 2);
    frame();
    assert.equal(w.simFx('aoe', 3, 4, { id: 1, r: 1.5, skill: 'blaze2Aid' }), true);
    const [h] = live('blaze2_skill_01_hit_range');
    assert.ok(h, 'the ring');
    assert.deepEqual([h.place.pos[0] !== undefined, h.opts.loop], [true, true]);
    run(19.5);
    assert.equal(live('blaze2_skill_01_hit_range').length, 1, 'still burning at 19.5 s');
    run(1);
    assert.equal(live('blaze2_skill_01_hit_range').length, 0, 'gone after max_duration');
    assert.equal(w.simFx('aoe', 3, 4, { id: 1, r: 1.5, skill: 'other' }), false, 'another area of hers stays the kit\'s own');
  });

  test('T2: downed holds both loops on her past any timer; the revive ends them and plays the stand-up burst', async () => {
    const { w, view, frame, run, live } = await setup('skchr_blaze2_1');
    view(1, 'char_1040_blaze2', 2);
    frame();
    assert.equal(w.simFx('downed', 2, 4, { id: 1, form: 'downed' }), true);
    for (const k of REVIVE_LOOPS) assert.equal(live(k).length, 1, k);
    run(30);
    for (const k of REVIVE_LOOPS) assert.equal(live(k).length, 1, `${k} after 30 s`);
    assert.equal(w.simFx('revive', 2, 4, { id: 1, r: 1.7, form: null }), true);
    for (const k of REVIVE_LOOPS) assert.equal(live(k).length, 0, `${k} ended`);
    assert.equal(live('blaze2_revive_end_start').length, 1, 'the stand-up burst');
  });

  test('T2: her death while downed ends the loops (release)', async () => {
    const { w, view, frame, live } = await setup('skchr_blaze2_3');
    const v = view(1, 'char_1040_blaze2', 2);
    frame();
    w.simFx('downed', 2, 4, { id: 1, form: 'downed' });
    w.release(v);
    for (const k of REVIVE_LOOPS) assert.equal(live(k).length, 0, k);
  });

  test('S2: a hit marks the enemy\'s tile once while the skill is on; the marks go with the skill', async () => {
    const { w, view, frame, live } = await setup('skchr_blaze2_2');
    const me = view(1, 'char_1040_blaze2', 2);
    const e = view(9, 'enemy_1', 5.2, 4.1);
    me.flags |= UF.SKILL;
    frame();
    const U = w.skills.tileOwner(me);
    assert.ok(U, 'her S2 marks tiles');
    assert.ok(w.skills.hitTile(U, e));
    assert.ok(w.skills.hitTile(U, e), 'the same tile: the same mark');
    assert.equal(live('blaze2_skill_02_hit_plot').length, 1);
    assert.equal(w.skills.hitTile(U, me), null, 'an operator is no enemy');
    e.x = 6; w.skills.hitTile(U, e);
    assert.equal(live('blaze2_skill_02_hit_plot').length, 2, 'a new tile');
    me.flags &= ~UF.SKILL;
    frame(); frame();
    assert.equal(live('blaze2_skill_02_hit_plot').length, 0, 'the skill ended');
    assert.equal(w.skills.tileOwner(me), null);
  });
});
