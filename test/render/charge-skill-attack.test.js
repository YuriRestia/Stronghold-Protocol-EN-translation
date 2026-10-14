// test/render/charge-skill-attack.test.js — (fork) 风笛 Bagpipe's S2 高效冲击 ("next attack ×2") showed no skill clip:
// a charge / instant skill with an attack of its own fires 'skill' 1, the attack and 'skill' 0 in one sim tick
// (server/sim/skills.js), so setSkill(false) cut the Skill_2_Loop double shot straight into Skill_2_End and idle.
// The attack now plays out first, then the End clip.
//
// Real manifest entry, headless fake PIXI (test/render/fakepixi.js), like feedback4-texas-skill-clip.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

function actor(charId, skillIndex) {
  const entry = assets.chars[charId].spine.front;
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(skillIndex);
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('风笛 S2: the skill\'s attack plays its Skill_2_Loop shot to the end, then Skill_2_End, then idle', () => {
  const a = actor('char_222_bpipe', 1);
  assert.deepEqual([a.roles.skill.begin, a.roles.skill.loop, a.roles.skill.end], ['Skill_2_Begin', 'Skill_2_Loop', 'Skill_2_End'], 'the manifest roles');
  run(a, 1);
  a.setSkill(true);
  a.attack(1.1);
  a.setSkill(false);   // same tick: the charge is spent by that attack
  assert.equal(a.mode, 'attack');
  assert.equal(a.current, 'Skill_2_Loop', 'the double shot, not the End clip');
  run(a, 0.3);
  assert.equal(a.current, 'Skill_2_Loop', 'still shooting');
  run(a, 1.2);
  assert.notEqual(a.current, 'Skill_2_Loop', 'the shot is over');
  run(a, 1);
  assert.equal(a.mode, 'base');
  assert.equal(a.current, 'Idle');
});
