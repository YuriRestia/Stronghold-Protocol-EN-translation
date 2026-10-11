// test/render/fortress-shot.test.js — (fork) 重炮手 (fortress) visuals, cosmetic only.
//
// 号角's model carries two attack clip sets: `_A` melee (while blocking) and `_B` the cannon (Attack_B, Skill_1_B,
// Skill_2_B_Loop, Skill_3_B_Loop animate the F_Muzzle bone, the `_A` clips do not). The manifest's roles name the `_A`
// set, so her cannon shots — her skills' included — played the melee swing. SpineActor.rangedShot picks the `_B` twin.
// A fortress's cannon round flies on an arc (FORTRESS_SHELL) instead of the 'arrow' tracer, at the sim's arrow speed.
//
// Real manifest entries, headless fake PIXI (test/render/fakepixi.js), like feedback4-texas-skill-clip.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

let fake, SpineActor, FX;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  FX = await import('../../public/js/render/fx.js');
});
after(() => fake.restore());

function actor(charId, skillIndex, rangedShot) {
  const entry = assets.chars[charId].spine.front;
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(skillIndex);
  a.rangedShot = rangedShot;
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('号角: the cannon plays the _B clips, the melee the _A ones — normal attacks and every skill', () => {
  for (const [ranged, atk] of [[true, 'Attack_B'], [false, 'Attack_A']]) {
    const a = actor('char_4039_horn', 2, ranged);
    a.attack(1.2);
    assert.equal(a.current, atk, `normal attack, ranged=${ranged}`);
  }
  for (const [idx, b, a_] of [[1, 'Skill_2_B_Loop', 'Skill_2_A_Loop'], [2, 'Skill_3_B_Loop', 'Skill_3_A_Loop']]) {
    for (const [ranged, clip] of [[true, b], [false, a_]]) {
      const a = actor('char_4039_horn', idx, ranged);
      a.setSkill(true);
      run(a, 0.5);
      a.attack(0.6);
      assert.equal(a.current, clip, `S${idx + 1} attack, ranged=${ranged}`);
    }
  }
  // S1 (no Begin, no own Idle): its one-shot clip at the skill start follows the same set
  for (const [ranged, clip] of [[true, 'Skill_1_B'], [false, 'Skill_1_A']]) {
    const a = actor('char_4039_horn', 0, ranged);
    a.setSkill(true);
    assert.equal(a.current, clip, `S1 clip, ranged=${ranged}`);
  }
});

test('the wind-up picks the same clip; a model without _A/_B twins is unchanged (Ashlock)', () => {
  const h = actor('char_4039_horn', 2, true);
  assert.ok(h.windUp(1.2, 0.2));
  assert.equal(h.current, 'Attack_B');
  const ash = actor('char_431_ashlok', 0, true);
  ash.attack(1.2);
  assert.equal(ash.current, 'Attack01');
});

test('a fortress shooter lobs its round on an arc; any other arrow stays a straight tracer', () => {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  const cam = presetCamera('normal', { width: 1600, height: 900 });
  const fx = new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality: 'high', damageNumbers: true },
    timeScale: () => 1, loadLevel: () => 0, subProfOf: () => null, view: () => null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
  const unit = (id, x, o = {}) => ({ id, x, y: 2, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, isEnemy: false, maxHp: 3000, info: { defId: 'char_x' }, onHit() {}, ...o });
  const tgt = unit('e', 4, { isEnemy: true });
  fx.attack(unit('horn', 1, { fortress: true }), tgt, 'arrow');
  fx.attack(unit('sniper', 1), tgt, 'arrow');
  const [shell, tracer] = fx.projs;
  assert.equal(shell.spec.look, 'shell');
  assert.ok(shell.arc > 0, 'on an arc');
  assert.equal(shell.dur, tracer.dur, 'the same flight time: the sim lands it');
  assert.equal(tracer.spec.look, 'tracer');
  assert.equal(tracer.arc, 0);
});
