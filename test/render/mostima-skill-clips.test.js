// test/render/mostima-skill-clips.test.js — 莫斯提马's skill clips (the user's report of 2026-11-10: "mostima s3 doesn't play the
// attack animation", Ethereal Harmony). Official (CN client): S2 channels Skill_Begin / Skill_Loop / Skill_End; S3 switches
// her to mode S2 — she stands in Skill_2_Idle and every attack plays Skill_2_Loop; S1 plays no clip
// (tools/assets/spine.mjs PREFAB_SPINE_ROLES). By name alone S3 got the channel set, which has no OnAttack, so
// render/spine.js had no clip for her S3 attacks and she held the channel pose. Real manifest entries, headless fake PIXI.
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
const CLIPS = ['Attack', 'Default', 'Die', 'Idle', 'Skill_2_Begin', 'Skill_2_End', 'Skill_2_Idle', 'Skill_2_Loop', 'Skill_Begin', 'Skill_End', 'Skill_Loop', 'Start'];
const durations = Object.fromEntries(CLIPS.map((n) => [n, 1]));
const models = () => [['default', assets.chars.char_213_mostma],
  ...Object.entries(assets.outfits.chars).filter(([k]) => k.startsWith('char_213_mostma@'))];

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

test('莫斯提马: by name S3 holds the S2 channel set; the role fix gives S3 the Skill_2 set and S2 the channel', () => {
  const resolved = resolveRoles(CLIPS, { skillIndices: [2, 0, 1], durations });
  assert.equal(resolved.skills['2'].loop, 'Skill_Loop', 'by name alone, S3 holds the channel pose (the reported bug)');
  assert.equal(resolved.skills['1'].loop, 'Skill_2_Loop');
  const { roles, missing } = applyRoleFix(resolved, PREFAB_SPINE_ROLES.char_213_mostma, durations);
  assert.deepEqual(missing, []);
  assert.deepEqual(roles.skills['2'], { begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End', index: 2, idle: 'Skill_2_Idle' },
    'S3: mode S2 — stands in Skill_2_Idle, attacks with Skill_2_Loop');
  assert.deepEqual(roles.skills['1'], { begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End', index: 1, idle: null }, 'S2: the channel');
  assert.equal(roles.skills['0'].via, 'attack', 'S1 plays no skill clip and keeps her attack');
  assert.equal(roles.skill.index, 2, 'the primary (pool default) skill is S3');
});

test('莫斯提马: the shipped manifest carries the fix on every model and outfit', () => {
  const list = models();
  assert.ok(list.length >= 3, 'the default model and both outfits');
  for (const [k, m] of list) {
    for (const side of ['front', 'back']) {
      const an = m.spine[side].anims;
      assert.equal(an.skill.loop, 'Skill_2_Loop', `${k} ${side}: S3 swings Skill_2_Loop`);
      assert.equal(an.skill.idle, 'Skill_2_Idle', `${k} ${side}`);
      assert.equal(an.skills['1'].loop, 'Skill_Loop', `${k} ${side}: S2 channels`);
      assert.equal(an.skills['0'].via, 'attack', `${k} ${side}: S1 attacks normally`);
      assert.ok(m.spine[side].hits.Skill_2_Loop?.length, `${k} ${side}: Skill_2_Loop has its strike (OnAttack)`);
    }
  }
});

test('莫斯提马 S3 (Ethereal Harmony and default): Skill_2_Begin into Skill_2_Idle, every attack swings Skill_2_Loop, End when it ends', () => {
  for (const [k, m] of models()) {
    const entry = m.spine.front;
    const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
    a.setSkillIndex(2);
    const log = [];
    const st = a.spine.state;
    const set = st.setAnimation, add = st.addAnimation;
    st.setAnimation = (i, name, loop) => { log.push(['set', name, !!loop]); return set(i, name, loop); };
    st.addAnimation = (i, name, loop) => { log.push(['queue', name, !!loop]); return add(i, name, loop); };
    const run = (s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };
    a.setSkill(true);
    assert.deepEqual(log, [['set', 'Skill_2_Begin', false], ['queue', 'Skill_2_Idle', true]], `${k}: no channel pose`);
    run(1);
    for (let i = 0; i < 3; i++) {
      a.attack(1.2);
      assert.equal(a.current, 'Skill_2_Loop', `${k}: attack ${i + 1} swings (was: no clip, the attack skipped)`);
      assert.ok(a.strikeLead > 0, `${k}: the swing has a strike frame for the cast effects`);
      run(1.2);
    }
    run(2);
    assert.equal(a.current, 'Skill_2_Idle', `${k}: no enemy: back to the skill stance`);
    a.setSkill(false);
    assert.equal(a.current, 'Skill_2_End', `${k}: the skill ends on its End clip`);
  }
});
