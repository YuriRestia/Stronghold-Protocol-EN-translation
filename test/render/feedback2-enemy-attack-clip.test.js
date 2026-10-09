// test/render/feedback2-enemy-attack-clip.test.js — GitHub #58, client side: an enemy plays its attack clip once per
// attack at the clip's own speed (faster only when the attacks come quicker than the clip) and then its resting clip —
// Move while the sim walks it again (server/sim/ai.js attackStand stands it for exactly that clip). It used to stretch
// the clip over the whole attack interval and loop it for 1.4 intervals, so a ranged enemy seemed to slide while it
// attacked. Operators keep the clip looping over their attack rhythm. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { ANIM } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const JSHOOT = 'enemy_1019_jshoot';   // 隐形弩手: Attack 1.0 s, strike at 0.533 s; attacks every 2.7 s

let fake, SpineActor, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const entryOf = (id) => assets.enemies[id].spine;
const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor(id, perAttack) {
  const entry = entryOf(id);
  const a = new SpineActor(dataOf(entry), entry);
  a.clipPerAttack = perAttack;
  a.setBase('move');
  return a;
}
const track = (a) => a.spine.state.tracks[0];
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('an enemy: wound up before the strike, the Attack clip plays once at its own speed, then Move again — no stretching over the interval', () => {
  const a = actor(JSHOOT, true);
  assert.equal(a.current, 'Move');
  assert.ok(a.windUp(2.7, 0.2), 'winds up 0.2 s before the strike');
  assert.equal(a.current, 'Attack');
  assert.equal(track(a).loop, false, 'one clip per attack');
  run(a, 0.2);
  a.attack(2.7);
  assert.equal(track(a).timeScale, 1, 'its own speed (the 2.7 s interval used to slow it to 0.37)');
  run(a, 0.45);
  assert.equal(a.current, 'Attack', 'the clip plays to its end (0.467 s after the strike)');
  run(a, 0.05);
  assert.equal(a.current, 'Move', 'then walks on its Move clip (it used to hold the attack for 1.4 intervals: 3.8 s)');
  // the next attack starts the clip anew
  run(a, 1.5);
  assert.ok(a.windUp(2.7, 0.3));
  assert.equal(a.current, 'Attack');
  run(a, 0.3);
  a.attack(2.7);
  run(a, 0.5);
  assert.equal(a.current, 'Move');
});

test('an enemy attacking quicker than its clip plays it faster, one clip per attack; an attack seen late starts on the strike frame', () => {
  const a = actor(JSHOOT, true);
  a.attack(0.5);                                   // no wind-up seen: from the strike frame, at 1.0 / 0.5 = 2×
  assert.equal(a.current, 'Attack');
  assert.equal(track(a).loop, false);
  assert.equal(track(a).timeScale, 2);
  assert.ok(Math.abs(track(a).trackTime - 0.533) < 1e-9, 'on the strike frame');
  run(a, 0.25);
  assert.equal(a.current, 'Move', 'the rest of the clip at 2×: 0.23 s');
});

// #246 (by @TsangAsuna, accepted by the owner on 2026-10-07): seen late, an attack whose rhythm leaves room for the whole
// clip plays it complete from the wind-up — 重犯's iron ball lifts before the slam instead of the slam appearing alone
test('an attack seen late plays the whole clip from its wind-up when the rhythm leaves room for it (重犯), else from the strike frame', () => {
  const LIFBOS = 'enemy_1121_lifbos';   // 重犯: Attack_grey 2.333 s, strike at 1.0 s; attacks every 3 s
  const a = actor(LIFBOS, true);
  a.attack(3);
  assert.equal(a.current, 'Attack_grey');
  assert.equal(track(a).trackTime, 0, 'from the wind-up (the ball lifts), not the 1.0 s strike frame');
  assert.equal(track(a).timeScale, 1, 'at its own speed');
  run(a, 2.25);
  assert.equal(a.current, 'Attack_grey', 'the whole 2.333 s clip plays (it used to end 1.333 s after the strike frame)');
  run(a, 0.15);
  assert.equal(a.current, 'Move_grey', 'then the resting clip');
  const quick = actor(LIFBOS, true);
  quick.attack(2);                                 // quicker than the clip: no room for the wind-up
  assert.ok(Math.abs(track(quick).trackTime - 1) < 1e-9, 'from the strike frame');
  const op = actor(LIFBOS, false);
  op.attack(3);                                    // an operator's looping attack is unchanged
  assert.ok(Math.abs(track(op).trackTime - 1) < 1e-9);
});

test('an operator keeps its attack loop stretched over the attack rhythm (unchanged)', () => {
  const a = actor(JSHOOT, false);
  a.attack(2.7);
  assert.equal(track(a).loop, true);
  assert.ok(Math.abs(track(a).timeScale - 1 / 2.7) < 1e-9);
  run(a, 2);
  assert.equal(a.current, 'Attack', 'still in attack mode 2 s later (1.4 × the interval)');
});

test('UnitView: enemy models play a clip per attack, operator models do not', async () => {
  const entry = entryOf(JSHOOT);
  const store = { picture: () => null, image: async () => null, spineEntry: () => entry, spine: { acquire: async () => dataOf(entry), release() {} } };
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const tick = () => new Promise((r) => setImmediate(r));
  const make = async (side) => {
    const v = new UnitView(fakeViewCtx(fake.P, { assets: store, cam }), { id: side === 'enemy' ? 7 : 8, side, kind: side === 'enemy' ? 'enemy' : 'op', defId: JSHOOT, spine: JSHOOT, tier: 1, x: 8, y: 9, maxHp: 1000, facing: -1 });
    await tick(); await tick();
    assert.ok(v.actor, 'model built');
    return v;
  };
  const e = await make('enemy');
  assert.equal(e.actor.clipPerAttack, true);
  e.sync({ x: 8, y: 9, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: ANIM.MOVE, vx: 0 }, 1);
  e.onAttack(null, 1);
  assert.equal(e.actor.current, 'Attack');
  assert.equal(e.actor.spine.state.tracks[0].loop, false);
  const o = await make('ally');
  assert.equal(o.actor.clipPerAttack, false);
});
