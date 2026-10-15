// test/render/battle-visuals.test.js — two HUD / model details of the battle view: an ally in 起飞 (UF.LIFTOFF, 蒂比's
// skills) is drawn at a flyer's height (FLY_HOVER), and a 屏障 (b.snap `sh`, server/sim/snapshot.js shieldView) is drawn
// over the current HP from its right end leftwards, covering r / (1 + r) of it for a barrier of r × max HP.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { normalizeSnapshot } from '../../public/js/render/interp.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { UF } from '../../shared/constants.js';

let fake, UnitView, FLY_HOVER, barrierShare;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, FLY_HOVER, barrierShare } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, ...o });
const view = () => new UnitView(fakeViewCtx(fake.P, { cam }), { id: 1, side: 'ally', kind: 'op', defId: 'char_x', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' });

test('起飞: the snapshot flags it and the view rises to a flyer\'s height, then comes down', () => {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } }, autoFinish: false, timeLimit: 60,
    units: [{ chessId: 'chess_char_2_13_a', row: 10, col: 3 }], enemies: [{ key: 'enemy_dummy', pos: [10, 6] }] });
  h.step(1);
  const u = h.unit('chess_char_2_13_a');
  u.skill.activate('test', { free: true });
  h.step(1);
  const tuple = h.b.snapshot().units.find((x) => x[0] === u.id);
  assert.ok(tuple[7] & UF.LIFTOFF, 'UF.LIFTOFF while her skill runs');
  const v = view();
  try {
    for (let i = 0; i < 60; i++) { v.sync(sample({ flags: UF.LIFTOFF }), i / 30); v.update(1 / 30, cam(), i / 30); }
    assert.ok(Math.abs(v.hover - FLY_HOVER) < 1e-3, `hover ${v.hover}`);
    for (let i = 60; i < 120; i++) { v.sync(sample(), i / 30); v.update(1 / 30, cam(), i / 30); }
    assert.ok(v.hover < 1e-3, 'back on the ground');
  } finally { v.destroy(); }
});

test('屏障: the snapshot carries it, and the bar covers r / (1 + r) of the current HP from its right end', () => {
  const h = makeBattle({ autoFinish: false, timeLimit: 60, units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }] });
  h.step(1);
  const u = h.unit('chess_char_3_08_a');
  h.b.addBuff(u, { key: 'test:barrier', shield: 4 * u.s.maxHp, duration: Infinity });
  h.step(1);
  const snap = h.b.snapshot();
  assert.deepEqual(snap.sh, [[u.id, Math.ceil(4 * u.s.maxHp)]]);
  assert.equal(normalizeSnapshot({ ...snap, t: 1 }).sh.get(u.id), Math.ceil(4 * u.s.maxHp));
  assert.ok(Math.abs(barrierShare(4) - 0.8) < 1e-9 && Math.abs(barrierShare(1) - 0.5) < 1e-9);
  const v = view();
  try {
    // half HP, a barrier of 4 × max HP: 80 % of the half — from 0.1 to 0.5 of the bar
    v.sync(sample({ hp: 500, sh: 4000 }), 1);
    v.update(0.02, cam(), 1);
    const hp = v.hpFill, b = v.barrierFill;
    assert.equal(b.visible, true);
    assert.ok(Math.abs(b.width / hp.width - 0.8) < 1e-6, `share ${b.width / hp.width}`);
    assert.ok(Math.abs(b.position.x + b.width - (hp.position.x + hp.width)) < 1e-6, 'ends at the current HP');
    v.sync(sample({ hp: 500 }), 2);
    v.update(0.02, cam(), 2);
    assert.equal(v.barrierFill.visible, false, 'gone with the barrier');
  } finally { v.destroy(); }
});
