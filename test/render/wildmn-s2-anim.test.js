// §37.107: 野鬃 S2's clips — Skill_2 / Skill_2_Down are the S2 mode's attack (charpack Modes/S2/Body/Attack), and the
// skill's start (an ActiveBuffAbility) plays no clip. Manifest metadata only; no client files or art fixtures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakePixi } from './fakepixi.js';
import { skillAttackMode } from '../../public/js/render/skillAttack.js';

const assets = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
const ID = 'char_496_wildmn';
let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

function actor({ face = 'front', down = false, slot = 1, rec = null } = {}) {
  const entry = structuredClone(assets.chars[ID].spine[face]);
  const a = new SpineActor({ animations: Object.keys(entry.animations).map(name => ({ name })) }, entry);
  a.setSkillIndex(slot);
  a.skillAttackMode = () => {
    const m = skillAttackMode(null, { info: { spine: ID }, rec, skillIndex: a.skillIndex });
    return m ? { ...m, down } : null;
  };
  return a;
}

test('野鬃 S2: the mapping is the S2 mode attack, Skill_2 with its down clip', () => {
  assert.deepEqual(skillAttackMode(null, { info: { spine: ID }, skillIndex: 1 }),
    { animKey: 'Skill_2', downKey: 'Skill_2_Down', modeAttack: true });
  // S1 keeps its own Begin / Idle / Loop / End path
  assert.equal(skillAttackMode(null, { info: { spine: ID }, skillIndex: 0 }), null);
  // a plugin skill in the slot does not inherit the official mapping
  const rec = { skills: [{ index: 1, skillId: 'plugin_other_skill' }] };
  assert.equal(skillAttackMode(null, { info: { spine: ID }, rec, skillIndex: 1 }), null);
});

test('野鬃 S2: the skill start plays no clip (no lunge at nothing), attacks play Skill_2', () => {
  for (const face of ['front', 'back']) {
    const a = actor({ face });
    a.setSkill(true);
    assert.equal(a.mode, 'base', `${face}: no one-shot cast at the start`);
    assert.equal(a.current, 'Idle', `${face}: the S2 mode keeps the plain Idle (no _replaceAnimPairs)`);
    assert.equal(a._skillOnceClip(), null, 'no early skill swing either');
    for (let n = 0; n < 2; n++) {
      assert.equal(a.windUp(1.2, 0.1), true);
      a.attack(1.2);
      assert.equal(a.current, 'Skill_2');
      assert.equal(a.strikePose().time, a.entry.hits.Skill_2[0]);
      a.update(2);
      assert.equal(a.current, 'Idle');
    }
    a.setSkill(false);
    assert.equal(a._attackClip(), a.roles.attack);
  }
});

test('野鬃 S2: facing down she strikes with Skill_2_Down', () => {
  const a = actor({ down: true });
  a.setSkill(true);
  assert.equal(a._attackClip().loop, 'Skill_2_Down');
  a.attack(1.2);
  assert.equal(a.current, 'Skill_2_Down');
  // the back model has no down clip: Skill_2
  const b = actor({ face: 'back', down: true });
  b.setSkill(true);
  assert.equal(b._attackClip().loop, 'Skill_2');
});
