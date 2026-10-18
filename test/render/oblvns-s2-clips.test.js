// test/render/oblvns-s2-clips.test.js — (fork) 丰川祥子's S2 timbres drawn on their official mode clips (render/units.js
// FORMS char_4182_oblvns; charpack Modes/S2_Atk, S2_AttackSpeed AnimatorHooker._replaceAnimPairs): piano Attack →
// Skill_2_Loop_A, Idle → Skill_2_Idle_A; organ the _B pair. Before, the lord's ranged _A → _B twin rule put her on organ's
// idle at once and her attacks replayed that idle — no attack clip in either timbre. The sim's S2 cast cue names the
// timbre (['skill', id, 1, { form }], render/app.js). Headless fake PIXI (test/render/fakepixi.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { UF } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const SAKI = 'char_4182_oblvns';

let fake, UnitView;
before(async () => { fake = installFakePixi(); ({ UnitView } = await import('../../public/js/render/units.js')); });
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const frames = (v, s, dt = 1 / 60) => { for (let i = 0; i < Math.round(s / dt); i++) v.update(dt, cam(), i * dt); };

function store() {
  const entry = assets.chars[SAKI].spine.front;
  const names = Object.keys(entry.animations || {});
  return {
    picture: () => null, image: async () => null, spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} },
  };
}

async function sakiko(skillIndex) {
  const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
  const v = new UnitView(ctx, { id: 3, side: 'ally', kind: 'op', defId: 'chess_char_6_diy1_a', spine: SAKI, skillIndex, tier: 6, x: 5, y: 9, maxHp: 3000, facing: 1, profession: 'WARRIOR', subProfession: 'lord' });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}

test('S2 piano (from deployment): her attacks play Skill_2_Loop_A, the stance Skill_2_Idle_A — never the organ _B pair', async () => {
  const v = await sakiko(1);
  assert.equal(v.form, 'piano');
  frames(v, 1.2);
  v.actor.setBase('idle');
  frames(v, 0.3);
  assert.equal(v.actor.current, 'Skill_2_Idle_A', 'piano stance');
  v.onAttack({ x: 7, y: 9, flags: 0 }, 2, 'note');
  frames(v, 0.05);
  assert.equal(v.actor.current, 'Skill_2_Loop_A', 'the piano attack clip');
  frames(v, 2);
  assert.equal(v.actor.current, 'Skill_2_Idle_A', 'back to the piano stance');
});

test('S2 organ (the cast cue form): attacks play Skill_2_Loop_B, the stance Skill_2_Idle_B, the skill flag on', async () => {
  const v = await sakiko(1);
  frames(v, 1.2);
  v.setForm('organ');
  v.flags |= UF.SKILL; v.setSkill(true);
  frames(v, 0.3);
  assert.equal(v.actor.current, 'Skill_2_Idle_B', 'organ stance');
  v.onAttack({ x: 7, y: 9, flags: 0 }, 2, 'note');
  frames(v, 0.05);
  assert.equal(v.actor.current, 'Skill_2_Loop_B', 'the organ attack clip, not the idle replayed');
  frames(v, 2);
  assert.equal(v.actor.current, 'Skill_2_Idle_B');
});

test('another skill keeps her own clips (no S2 form)', async () => {
  const v = await sakiko(2);
  assert.equal(v.form, null);
});
