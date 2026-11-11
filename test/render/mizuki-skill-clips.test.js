// test/render/mizuki-skill-clips.test.js — 水月's skill clips (the lead's sandbox check of 2026-11-11). Official (CN client):
// S1 is a ReplacementSkill whose charge swings her normal Attack; S2 switches her to mode S1 — every attack plays Skill_1,
// her normal Idle between, no begin or end clip; S3 begins with Skill_2_Start, switches to mode S2 — Skill_2_Loop attacks,
// Skill_2_Idle between (AnimatorHooker) — and ends on Skill_2_End (the skins' _mixSettings) (tools/assets/spine.mjs
// PREFAB_SPINE_ROLES). By name alone S1 got Skill_1, S2 the Skill_2 set and S3 the plain attack. Real manifest entries,
// headless fake PIXI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';
import { resolveRoles } from '../../tools/assets/anim-roles.mjs';
import { applyRoleFix, PREFAB_SPINE_ROLES } from '../../tools/assets/spine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const CLIPS = ['Attack', 'Default', 'Die', 'Idle', 'Skill_1', 'Skill_2_End', 'Skill_2_Idle', 'Skill_2_Loop', 'Skill_2_Start', 'Start'];
const durations = Object.fromEntries(CLIPS.map((n) => [n, 1]));
const models = () => [['default', assets.chars.char_437_mizuki],
  ...Object.entries(assets.outfits.chars).filter(([k]) => k.startsWith('char_437_mizuki@'))];

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

/** An actor of manifest entry `entry` on skill slot `index`, logging every clip it sets or queues. */
function actor(entry, index) {
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(index);
  const log = [];
  const st = a.spine.state;
  const set = st.setAnimation, add = st.addAnimation;
  st.setAnimation = (i, name, loop) => { log.push(['set', name, !!loop]); return set(i, name, loop); };
  st.addAnimation = (i, name, loop) => { log.push(['queue', name, !!loop]); return add(i, name, loop); };
  const run = (s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };
  return { a, log, run };
}

test('水月: by name the skills take the wrong sets; the role fix gives each its official clips', () => {
  const resolved = resolveRoles(CLIPS, { skillIndices: [1, 0, 2], durations });
  assert.equal(resolved.skills['0'].loop, 'Skill_1', 'by name alone, S1 swings S2\'s Skill_1 (the bug)');
  assert.equal(resolved.skills['1'].loop, 'Skill_2_Loop', 'by name alone, S2 takes S3\'s set (the bug)');
  const { roles, missing } = applyRoleFix(resolved, PREFAB_SPINE_ROLES.char_437_mizuki, durations);
  assert.deepEqual(missing, []);
  assert.deepEqual(roles.skills['0'], { begin: null, loop: 'Attack', end: null, via: 'attack', index: 0, idle: null, keepAttack: true },
    'S1: a charge is her normal swing');
  assert.deepEqual(roles.skills['1'], { begin: null, loop: 'Skill_1', end: null, index: 1, idle: 'Idle' }, 'S2: mode S1, Skill_1 attacks');
  assert.deepEqual(roles.skills['2'], { begin: 'Skill_2_Start', loop: 'Skill_2_Loop', end: 'Skill_2_End', index: 2, idle: 'Skill_2_Idle' },
    'S3: mode S2, begin, stance and end');
  assert.equal(roles.skill.index, 1, 'the primary (pool default) skill is S2');
});

test('水月: the shipped manifest carries the fix on every model and outfit', () => {
  const list = models();
  assert.ok(list.length >= 3, 'the default model and both outfits');
  for (const [k, m] of list) {
    for (const side of ['front', 'back']) {
      const an = m.spine[side].anims;
      assert.equal(an.skills['0'].loop, 'Attack', `${k} ${side}: S1 swings her attack`);
      assert.equal(an.skills['1'].loop, 'Skill_1', `${k} ${side}: S2 swings Skill_1`);
      assert.equal(an.skills['2'].begin, 'Skill_2_Start', `${k} ${side}: S3 begins`);
      assert.equal(an.skills['2'].idle, 'Skill_2_Idle', `${k} ${side}`);
      assert.equal(an.skill.loop, 'Skill_1', `${k} ${side}: the default skill is S2`);
      for (const c of ['Attack', 'Skill_1', 'Skill_2_Loop']) assert.ok(m.spine[side].hits[c]?.length, `${k} ${side}: ${c} has its strike`);
    }
  }
});

test('水月: her normal swing and impact, and each skill\'s own impact in place of the normal one (official banks)', () => {
  const u = assets.audio.sfx.units.char_437_mizuki;
  assert.match(u.attack, /p_atk_tentacle_n\.mp3$/, 'swing: ON_ABILITY_START.attack');
  assert.match(u.hit, /p_imp_tentacle_n\.mp3$/, 'impact: ON_ABILITY_ON.attack');
  // S1 skchr_mizuki_1's ON; S2 / S3 their modes' ON (attack.2 / attack.3), which have no START: the swing stays the normal one
  const own = { 0: ['p_imp_tentacle_d', 'battle.ON_ABILITY_ON.skchr_mizuki_1'], 1: ['p_imp_tentacle_h', 'battle.ON_ABILITY_ON.char_437_mizuki.attack.2'],
    2: ['p_imp_tentacle_s', 'battle.ON_ABILITY_ON.char_437_mizuki.attack.3'] };
  for (const [i, [file, pool]] of Object.entries(own)) {
    assert.match(u.hits[i], new RegExp(`${file}\\.mp3$`), `S${+i + 1} impact`);
    assert.equal(u.hitPools[i], pool, `S${+i + 1} impact pool`);
    assert.equal(u.attacks?.[i], undefined, `S${+i + 1}: no impact file in the swing slot (it rang with the normal impact)`);
  }
});

test('水月 S1: a charge swings her normal Attack, no Skill_1 clip, and the swing plays out', () => {
  for (const [k, m] of models()) {
    const { a, log, run } = actor(m.spine.front, 0);
    run(0.5);
    log.length = 0;
    a.setSkill(true);
    a.attack(1.4);
    assert.equal(a.current, 'Attack', `${k}: the charge is her normal swing`);
    a.setSkill(false);
    assert.equal(a.current, 'Attack', `${k}: the skill's end does not cut the swing`);
    assert.ok(!log.some(([, n]) => n === 'Skill_1'), `${k}: no Skill_1`);
  }
});

test('水月 S2: no cast clip, every attack swings Skill_1, her normal Idle between and after', () => {
  for (const [k, m] of models()) {
    const { a, log, run } = actor(m.spine.front, 1);
    run(0.5);
    log.length = 0;
    a.setSkill(true);
    assert.ok(!log.some(([, n]) => /^Skill_/.test(n)), `${k}: S2 plays no clip of its own (was Skill_2_Start)`);
    for (let i = 0; i < 3; i++) {
      a.attack(1.6);
      assert.equal(a.current, 'Skill_1', `${k}: attack ${i + 1} swings Skill_1`);
      assert.ok(a.strikeLead > 0, `${k}: the swing has a strike frame`);
      run(1.6);
    }
    run(1);
    assert.equal(a.current, 'Idle', `${k}: no enemy: her normal Idle`);
    a.setSkill(false);
    assert.equal(a.current, 'Idle', `${k}: no end clip`);
  }
});

test('水月 S3: Skill_2_Start into Skill_2_Idle, every attack swings Skill_2_Loop, Skill_2_End when it ends', () => {
  for (const [k, m] of models()) {
    const { a, log, run } = actor(m.spine.front, 2);
    run(0.5);
    log.length = 0;
    a.setSkill(true);
    assert.deepEqual(log, [['set', 'Skill_2_Start', false], ['queue', 'Skill_2_Idle', true]], `${k}: the begin clip (was none)`);
    run(1);
    for (let i = 0; i < 3; i++) {
      a.attack(1.4);
      assert.equal(a.current, 'Skill_2_Loop', `${k}: attack ${i + 1} swings Skill_2_Loop (was Attack)`);
      run(1.4);
    }
    run(2);
    assert.equal(a.current, 'Skill_2_Idle', `${k}: no enemy: the S3 stance`);
    a.setSkill(false);
    assert.equal(a.current, 'Skill_2_End', `${k}: the skill ends on its End clip`);
  }
});
