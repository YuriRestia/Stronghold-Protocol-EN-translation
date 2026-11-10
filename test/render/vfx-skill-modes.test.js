// test/render/vfx-skill-modes.test.js — (fork) the attack mode a skill switches to (shared/fxModes.js): a mode the fx
// index guessed from a mode's name loses to a skill the client data gives it. 莫斯提马's prefab has the modes Default and
// "S2"; the data gives "S2" to her S3, and her S2 (Lock of Shattered Time) had taken it by name: it drew and sounded like
// S3's ripple. The effects layer (skillPlan) and the sound plan (charModesFromIndex) read the same rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillModeOf } from '../../shared/fxModes.js';
import { skillPlan } from '../../public/js/render/vfx/skills.js';
import { charModesFromIndex } from '../../tools/assets/plan.mjs';

const mostima = () => ({
  kind: 'char',
  modes: [{ name: 'Default', attack: { class: 'MeleeAttack', cast: [], hit: [] } }, { name: 'S2', attack: { class: 'MeleeAttack', cast: [], hit: [] } }],
  skills: {
    skchr_mostma_2: { mode: 1, modeBy: 'name', rootClass: 'CastSkill', uses: [] },
    skchr_mostma_3: { mode: 1, modeBy: 'data', rootClass: 'CastSkill', uses: [] },
    skcom_atk_up: { mode: null, rootClass: 'CastSkill', uses: [] },
  },
});

test('a name-guessed mode yields to the skill the data gives it; data and unclaimed name guesses stay', () => {
  const u = mostima();
  assert.equal(skillModeOf(u, 'skchr_mostma_2'), null, 'S2 keeps her default attack');
  assert.equal(skillModeOf(u, 'skchr_mostma_3'), 1, 'S3 is the ripple mode');
  assert.equal(skillModeOf(u, 'skcom_atk_up'), null);
  assert.equal(skillModeOf(u, 'nope'), null);
  u.skills.skchr_mostma_3.mode = null;
  assert.equal(skillModeOf(u, 'skchr_mostma_2'), 1, 'nobody claims it by data: the name guess stands');
  assert.equal(skillModeOf(null, 'x'), null);
});

test('the effects layer: Mostima S2 plans no mode, S3 the ripple mode', () => {
  const idx = { units: { char_213_mostma: mostima() }, projectiles: {}, prefabs: {} };
  assert.equal(skillPlan(idx, 'char_213_mostma', 'skchr_mostma_2').mode ?? null, null);
  const s3 = skillPlan(idx, 'char_213_mostma', 'skchr_mostma_3');
  assert.equal(s3.mode, 1);
  assert.equal(s3.modeName, 'S2');
});

test('the sound plan: Mostima S2 gets no mode attack sound slot, S3 does', () => {
  const m = charModesFromIndex({ units: { char_213_mostma: mostima() } }).get('char_213_mostma');
  assert.equal(m.skillMode.get('skchr_mostma_2'), null);
  assert.equal(m.skillMode.get('skchr_mostma_3'), 1);
});
