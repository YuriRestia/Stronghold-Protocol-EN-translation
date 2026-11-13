// test/render/battle-visuals.test.js — two HUD / model details of the battle view: an ally in 起飞 (UF.LIFTOFF) is
// drawn at its official take-off height on a linear tween of the official length (units.js TAKEOFF: 蒂比 0.8 over
// 0.8333 s; 司霆惊蛰 0.4, born after a 0.2 s wait over 0.8 s, then per skill; 凯尔希·残光 stays on the ground; an
// operator without an entry falls back to FLY_HOVER — Nodes.ModifyGraphicHolderHeight → Unit.SetGraphicHolderHeightOffset,
// docs/research/12 §7), and a 屏障 (b.snap `sh`, server/sim/snapshot.js shieldView) is drawn over the
// current HP from its right end leftwards, covering r / (1 + r) of it for a barrier of r × max HP.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { normalizeSnapshot } from '../../public/js/render/interp.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { UF } from '../../shared/constants.js';

let fake, UnitView, FLY_HOVER, TAKEOFF, barrierShare;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, FLY_HOVER, TAKEOFF, barrierShare } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, ...o });
const view = (charId = null, info = {}) => new UnitView(fakeViewCtx(fake.P, { cam, lookupDef: () => (charId ? { charId } : null) }),
  { id: 1, side: 'ally', kind: 'op', defId: charId || 'char_x', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT', ...info });
const FPS = 30;
/** Runs `n` frames of 1/30 s with these flags from frame `t0`, returns the hover after each. */
const run = (v, n, flags, t0 = 0) => {
  const out = [];
  for (let i = t0; i < t0 + n; i++) { v.sync(sample({ flags }), i / FPS); v.update(1 / FPS, cam(), i / FPS); out.push(v.hover); }
  return out;
};
/** The frames strictly between `from` and `to`, and whether each step between them is the same (a linear tween). */
const between = (hs, from, to) => hs.filter((h) => h > Math.min(from, to) + 1e-9 && h < Math.max(from, to) - 1e-9);
const linear = (hs, perFrame) => hs.every((h, i) => i === 0 || Math.abs(Math.abs(h - hs[i - 1]) - perFrame) < 1e-6);

test('the take-off table holds the official values (docs/research/12 §7)', () => {
  assert.deepEqual(TAKEOFF.char_4191_tippi, { h: 0.8, up: [0.8333], down: [0.8333] });
  assert.deepEqual(TAKEOFF.char_1043_leizi2, { h: 0.4, up: [0.3, 0.2667, 0.2667], down: [0.1667, 0.1333, 0.1667], born: 0.8, bornDelay: 0.2 });
  assert.deepEqual(TAKEOFF.char_1052_kalts2, { h: 0 });
  assert.equal(TAKEOFF.char_1015_aglna2, undefined, '安洁莉娜 is not in the table yet (FLY_HOVER fallback)');
});

test('起飞: the snapshot flags it and 蒂比 rises linearly to 0.8 over 0.8333 s, then lands the same way', () => {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } }, autoFinish: false, timeLimit: 60,
    units: [{ chessId: 'chess_char_2_13_a', row: 10, col: 3 }], enemies: [{ key: 'enemy_dummy', pos: [10, 6] }] });
  h.step(1);
  const u = h.unit('chess_char_2_13_a');
  assert.equal(u.def.charId, 'char_4191_tippi');
  u.skill.activate('test', { free: true });
  h.step(1);
  const tuple = h.b.snapshot().units.find((x) => x[0] === u.id);
  assert.ok(tuple[7] & UF.LIFTOFF, 'UF.LIFTOFF while her skill runs');
  assert.equal(tuple[7] & UF.LIFTOFF_LOW, 0, 'a skill\'s 起飞 is not the low hover');
  const v = view('char_4191_tippi');
  try {
    const step = 0.8 / 0.8333 / FPS;
    const up = run(v, 60, UF.LIFTOFF);
    assert.ok(Math.abs(v.hover - 0.8) < 1e-9, `hover ${v.hover}`);
    const rising = between(up, 0, 0.8);
    assert.ok(Math.abs(rising.length - 0.8333 * FPS) <= 1, `rise takes 0.8333 s (${rising.length} frames)`);
    assert.ok(linear(rising, step), `linear rise (${rising.map((x) => x.toFixed(3)).join(' ')})`);
    const down = run(v, 60, 0, 60);
    assert.equal(v.hover, 0, 'back on the ground');
    const landing = between(down, 0, 0.8);
    assert.ok(Math.abs(landing.length - 0.8333 * FPS) <= 1 && linear(landing, step), 'linear landing over 0.8333 s');
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

test('起飞 from a talent only (司霆惊蛰): born rise to 0.4 after 0.2 s over 0.8 s, then per-skill landing and take-off', () => {
  const h = makeBattle({ autoFinish: false, timeLimit: 60, units: [{ diy: { slot: 6, charId: 'char_1043_leizi2', skillIndex: 0 }, row: 10, col: 3 }] });
  h.step(1);
  const u = h.b.allyUnits.find((x) => x.def.charId === 'char_1043_leizi2');
  assert.ok(u.s.flags.liftoff, 'her talent lifts her');
  const tuple = h.b.snapshot().units.find((x) => x[0] === u.id);
  assert.equal(tuple[7] & (UF.LIFTOFF | UF.LIFTOFF_LOW), UF.LIFTOFF | UF.LIFTOFF_LOW);
  const v = view('char_1043_leizi2', { skillIndex: 0 });
  try {
    const LOW = UF.LIFTOFF | UF.LIFTOFF_LOW;
    const born = run(v, 45, LOW);
    const first = born.findIndex((x) => x > 0);
    assert.ok(Math.abs((first + 1) / FPS - 0.2) <= 1.5 / FPS, `waits 0.2 s first (frame ${first})`);
    const rising = between(born, 0, 0.4);
    assert.ok(Math.abs(rising.length - 0.8 * FPS) <= 1 && linear(rising, 0.4 / 0.8 / FPS), `born rise over 0.8 s (${rising.length} frames)`);
    assert.ok(Math.abs(v.hover - 0.4) < 1e-9, `hover ${v.hover}`);
    // her skill starts: she lands over S1's 0.1667 s; it ends: she takes off again over 0.3 s, with no born wait
    const land = run(v, 15, 0, 45);
    assert.equal(v.hover, 0);
    assert.ok(Math.abs(between(land, 0, 0.4).length - 0.1667 * FPS) <= 1, 'lands over 0.1667 s');
    const again = run(v, 30, LOW, 60);
    assert.ok(again[0] > 0, 'no born wait the second time');
    assert.ok(Math.abs(between(again, 0, 0.4).length - 0.3 * FPS) <= 1, 'takes off over 0.3 s');
    assert.ok(Math.abs(v.hover - 0.4) < 1e-9);
  } finally { v.destroy(); }
});

test('凯尔希·残光 stays on the ground in 起飞; an operator without a table entry falls back to FLY_HOVER', () => {
  const k = view('char_1052_kalts2');
  const x = view('char_1015_aglna2');
  try {
    run(k, 60, UF.LIFTOFF);
    assert.equal(k.hover, 0);
    run(x, 90, UF.LIFTOFF);
    assert.ok(Math.abs(x.hover - FLY_HOVER) < 1e-3, `fallback hover ${x.hover}`);
  } finally { k.destroy(); x.destroy(); }
});
