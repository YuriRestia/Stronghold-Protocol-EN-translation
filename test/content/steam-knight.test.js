// test/content/steam-knight.test.js — the Steam Knight ally slice (server/sim/content/steamKnight.js): dev sandbox only,
// behind battle.flags.steamKnight. Run: node --test test/content/steam-knight.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { spawnSteamKnight, STEAM_KNIGHT_ID } from '../../server/sim/content/steamKnight.js';

// panel values of a test run (the sandbox panel sets them for real: none has an official source)
const PANEL = { enabled: true, dashSpeed: 6, dmgPerTile: 0.5, sideDamage: 0.5, shoveDist: 1.5, blockCnt: 1 };
const ENEMIES = {
  enemy_elite: enemyRec({ key: 'enemy_elite', rank: 'ELITE', hp: 1e7, speed: 0, def: 0 }),
  enemy_norm: enemyRec({ key: 'enemy_norm', hp: 1e6, speed: 0, def: 0 }),
};

function field({ panel = PANEL, enemies = [] } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed: 3,
    flags: { dpPerSec: 0, dpMax: 999, steamKnight: panel },
    units: [], enemies,
  });
  h.step();
  return h;
}

test('flag off: spawnSteamKnight does nothing', () => {
  const h = field({ panel: null });
  assert.equal(spawnSteamKnight(h.b, 'p1'), null);
});

test('the knight drops, stands in the bunker stance, dashes and hits the elite harder with distance', () => {
  const h = field();
  h.spawn('enemy_elite', { pos: [10, 9] });
  const e = h.enemy('enemy_elite');
  const k = spawnSteamKnight(h.b, 'p1');
  assert.ok(k, 'spawned');
  k.mem.sk.beginLanding(5, 10, [0, 1]);   // Vina's tile: the lane of row 10
  assert.equal(k.defId, STEAM_KNIGHT_ID);
  const phases = new Set();
  const hp0 = e.hp;
  h.runUntil((b) => { phases.add(k.mem.sk.phase); return k.mem.sk.phase === 'fight' && b.time > 3; }, 20);
  assert.ok(phases.has('drop') && phases.has('stance') && phases.has('dash') && phases.has('blow'), [...phases].join());
  assert.ok(e.hp < hp0, 'the elite took the blow');
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});

test('the side enemies are shoved and hit, a friendly operator never is, and every landing starts a bunker', () => {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed: 3, hooks: ['damaged'], captureNoisy: true,
    flags: { dpPerSec: 0, dpMax: 999, steamKnight: PANEL },
    units: [{ uid: 1, chessId: 'chess_char_4_07_b', row: 10, col: 3 }],
  });
  h.step();
  const elite = h.spawn('enemy_elite', { pos: [10, 9] });
  const side = h.spawn('enemy_norm', { pos: [11, 7] });   // one row beside the lane of row 10
  const k = spawnSteamKnight(h.b, 'p1');
  k.mem.sk.beginLanding(5, 10, [0, 1]);
  const y0 = side.y;
  const phases = [];
  h.runUntil((b) => { const p = k.mem.sk.phase; if (phases[phases.length - 1] !== p) phases.push(p); return b.time > 36; }, 45);   // the leap at 25 s, its landing, then the official 5 s stance
  assert.ok(Math.abs(side.y - y0) > 0.5 || side.hp < side.s.maxHp, 'the side enemy was thrown or hit');
  assert.ok(elite.hp < elite.s.maxHp, 'the elite took the blow');
  const hurt = h.hooksOf('damaged').filter((c) => c.source === k && c.target.side === 'ally');
  assert.equal(hurt.length, 0, 'he never damages a friendly unit');
  // the first drop and the leap's landing both run the whole bunker
  assert.ok(phases.filter((p) => p === 'dash').length >= 2, phases.join());
  assert.ok(phases.includes('leapUp'), phases.join());
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});

test('a cleared panel value switches that part off: no dash without a dash speed', () => {
  const h = field({ panel: { enabled: true } });
  h.spawn('enemy_elite', { pos: [10, 9] });
  const k = spawnSteamKnight(h.b, 'p1');
  const hp0 = h.enemy('enemy_elite').hp;
  h.run(8);
  assert.notEqual(k.mem.sk.phase, 'dash');
  assert.equal(h.enemy('enemy_elite').hp, hp0, 'no bunker blow without a dash');
});

test('he holds an enemy while he charges the pile', () => {
  const h = field();
  const k = spawnSteamKnight(h.b, 'p1');
  k.mem.sk.beginLanding(5, 10, [0, 1]);
  h.runUntil(() => k.mem.sk.phase === 'stance', 10);
  const e = h.spawn('enemy_norm', { pos: [10, 6] });
  e.x = k.x + 0.6; e.y = k.y;
  h.runUntil(() => e.blockedBy === k, 2);
  assert.equal(e.blockedBy, k, `blocked while charging (phase ${k.mem.sk.phase}, gap ${Math.hypot(e.x - k.x, e.y - k.y).toFixed(2)})`);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});

test('a stun in the stance ends the bunker: no blow from a stunned knight', () => {
  const h = field();
  const e = h.spawn('enemy_elite', { pos: [10, 9] });
  const k = spawnSteamKnight(h.b, 'p1');
  k.mem.sk.beginLanding(5, 10, [0, 1]);
  h.runUntil(() => k.mem.sk.phase === 'stance', 10);
  const hp0 = e.hp;
  h.b.addBuff(k, { key: 'test:stun', duration: 2, flags: { stun: true } });
  h.step();
  assert.equal(k.mem.sk.phase, 'fight');
  h.run(1.5);
  assert.equal(e.hp, hp0, 'no blow while stunned');
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});

test('a normal enemy within reach that nobody blocks: he steps into contact and blocks it', () => {
  const h = field();
  const k = spawnSteamKnight(h.b, 'p1');
  h.run(12);   // the landing and its bunker (no target: it ends) are over
  assert.equal(k.mem.sk.phase, 'fight');
  const e = h.spawn('enemy_norm', { pos: [Math.round(k.y), Math.round(k.x) + 1] });
  e.x = k.x + 1.2; e.y = k.y;   // inside his reach, outside the block radius
  h.runUntil(() => e.blockedBy === k, 8);   // a swing that had started ends first, then he walks (0.8 move speed)
  assert.equal(e.blockedBy, k, `blocked by contact (gap ${Math.hypot(e.x - k.x, e.y - k.y).toFixed(2)}, phase ${k.mem.sk.phase}, e at ${e.x},${e.y} alive ${e.alive})`);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});

test('he never moves while a swing plays, nor after an enemy that walks past', () => {
  const h = field();
  const k = spawnSteamKnight(h.b, 'p1');
  h.run(12);
  const e = h.spawn('enemy_norm', { pos: [Math.round(k.y), Math.round(k.x) + 1] });
  e.y = k.y + 0.9; e.x = k.x + 1;
  Object.defineProperty(e, 'moving', { get: () => true, set() {} });   // (the engine clears it on an enemy the test moves)
  const x0 = k.x, y0 = k.y;
  for (let i = 0; i < 90; i++) { e.x -= 0.02; h.step(); }
  assert.ok(Math.abs(k.x - x0) < 1e-9 && Math.abs(k.y - y0) < 1e-9, `he stayed (${k.x - x0}, ${k.y - y0})`);
});

test('the boost hit pushes a survivor by the force rule: a heavy enemy less, no force none', () => {
  const pushed = (massLevel, pushForce) => {
    const h = makeBattle({ defs: { enemies: { enemy_big: { ...enemyRec({ key: 'enemy_big', rank: 'ELITE', hp: 1e7, speed: 0, def: 0 }) } } }, timeLimit: 600, autoFinish: false, seed: 3, flags: { dpPerSec: 0, dpMax: 999, steamKnight: { ...PANEL, pushForce } }, units: [], enemies: [] });
    h.step();
    const e = h.spawn('enemy_big', { pos: [10, 8] });
    e.base.massLevel = massLevel; e._dirty = true;
    const k = spawnSteamKnight(h.b, 'p1');
    k.mem.sk.beginLanding(5, 10, [0, 1]);
    h.runUntil(() => k.mem.sk.phase === 'dash', 20);
    const x0 = e.x;
    h.runUntil(() => k.mem.sk.phase === 'blow', 5);
    h.run(0.1);
    assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
    return e.x - x0;
  };
  const light = pushed(1, 5), heavy = pushed(5, 5), none = pushed(1, undefined);
  assert.ok(light > heavy + 0.5 && heavy > 0.5, `light ${light}, heavy ${heavy}`);
  assert.equal(none, 0);
});

/** One boost along row 10 at an elite, with normal enemies in the lane; the state just before the blow and after the pushes. */
function boost({ panel, eliteHp = 1e7, normHp = 1e6, lane = [7, 7.4] }) {
  const h = makeBattle({
    defs: { enemies: { ...ENEMIES, enemy_elite: enemyRec({ key: 'enemy_elite', rank: 'ELITE', hp: eliteHp, speed: 0, def: 0 }), enemy_norm: enemyRec({ key: 'enemy_norm', hp: normHp, speed: 0, def: 0 }) } },
    timeLimit: 600, autoFinish: false, seed: 3, flags: { dpPerSec: 0, dpMax: 999, steamKnight: { ...PANEL, pushForce: 5, ...panel } }, units: [], enemies: [],
  });
  h.step();
  const elite = h.spawn('enemy_elite', { pos: [10, 9] });
  const norms = lane.map((x) => { const e = h.spawn('enemy_norm', { pos: [10, Math.round(x)] }); e.x = x; return e; });
  const k = spawnSteamKnight(h.b, 'p1');
  k.mem.sk.beginLanding(5, 10, [0, 1]);
  h.runUntil(() => k.mem.sk.phase === 'dash', 20);
  let before = null;
  h.runUntil(() => { if (k.mem.sk.phase === 'dash') before = { elite: elite.x, norms: norms.map((e) => e.x), y: norms.map((e) => e.y), dragged: k.mem.sk.dash.dragged.length }; return k.mem.sk.phase === 'blow'; }, 5);
  h.run(0.15);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  return { h, k, elite, norms, before };
}

test('the boost drags normal enemies up to the block count; they take the blow and the push with the target', () => {
  const { norms, elite, before } = boost({ panel: { blockCnt: 2, sideDamage: 0 } });
  assert.equal(before.dragged, 2);
  for (const [i, e] of norms.entries()) {
    assert.ok(before.norms[i] > 7.5 && Math.abs(before.y[i] - 10) < 0.5, `carried along the lane (${before.norms[i]})`);
    assert.ok(e.hp < e.s.maxHp, 'took the blow');
    assert.ok(e.x > before.norms[i] + 0.5, `pushed on (${before.norms[i]} → ${e.x})`);
  }
  assert.ok(elite.hp < elite.s.maxHp && elite.x > before.elite + 0.5);
  assert.equal(boost({ panel: { blockCnt: 1 } }).before.dragged, 1, 'no more than the block count');
  assert.equal(boost({ panel: { blockCnt: 2, drag: false } }).before.dragged, 0, 'the panel turns it off');
});

test('the killed are pushed too: the target and the dragged leave bodies that slide along the boost', () => {
  const { norms, elite, before, h } = boost({ panel: { blockCnt: 2, sideDamage: 0 }, eliteHp: 10, normHp: 10 });
  assert.ok(!elite.alive && norms.every((e) => !e.alive));
  assert.ok(elite.x > before.elite + 0.5, `the target's body (${before.elite} → ${elite.x})`);
  norms.forEach((e, i) => assert.ok(e.x > before.norms[i] + 0.5, `a dragged body (${before.norms[i]} → ${e.x})`));
  checkInvariants(h.b);
});

test('the Zantetsuken pushes what it hits by its own force, and not without one', () => {
  const run = (zanPushForce) => {
    const h = field({ panel: { ...PANEL, blockCnt: 1, zanPushForce } });
    const k = spawnSteamKnight(h.b, 'p1');
    h.run(12);
    const e = h.spawn('enemy_norm', { pos: [Math.round(k.y), Math.round(k.x) + 1] });
    e.x = k.x + 0.6; e.y = k.y;
    k.mem.sk.zanReady = true;
    h.runUntil(() => k.mem.sk.phase === 'zanBlow' && k.mem.sk.zanHit, 25);
    const x0 = e.x;
    h.run(0.15);
    assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
    return e.x - x0;
  };
  const weak = run(0), strong = run(2);
  assert.ok(strong > weak + 0.3 && weak > 0.3, `force 0 ${weak}, force 2 ${strong}`);
  assert.equal(run(undefined), 0);
});

test('he attacks every enemy he blocks (the Centurion rule), not just one', () => {
  const h = field({ panel: { ...PANEL, blockCnt: 2 } });
  const k = spawnSteamKnight(h.b, 'p1');
  h.run(12);   // the landing and its bunker (no target: it ends) are over
  const e1 = h.spawn('enemy_norm', { pos: [Math.round(k.y), Math.round(k.x) + 1] });
  const e2 = h.spawn('enemy_norm', { pos: [Math.round(k.y), Math.round(k.x) - 1] });
  e1.x = k.x + 0.6; e1.y = k.y; e2.x = k.x - 0.6; e2.y = k.y;   // both inside the block radius
  const hp1 = e1.hp, hp2 = e2.hp;
  h.runUntil(() => e1.hp < hp1 && e2.hp < hp2, 20);
  assert.ok(e1.hp < hp1, 'the first blocked enemy took a hit');
  assert.ok(e2.hp < hp2, 'the second blocked enemy took a hit');
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});
