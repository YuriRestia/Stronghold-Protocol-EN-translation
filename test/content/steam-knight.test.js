// test/content/steam-knight.test.js — the Steam Knight ally slice (server/sim/content/steamKnight.js): dev sandbox only,
// behind battle.flags.steamKnight. Run: node --test test/content/steam-knight.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { spawnSteamKnight, STEAM_KNIGHT_ID } from '../../server/sim/content/steamKnight.js';

// panel values of a test run (the sandbox panel sets them for real: none has an official source)
const PANEL = { enabled: true, dashSpeed: 6, dmgPerTile: 0.5, sideDamage: 0.5, shoveDist: 1.5, stanceAfterLanding: 1, waitLimit: 3 };
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
  h.runUntil((b) => { const p = k.mem.sk.phase; if (phases[phases.length - 1] !== p) phases.push(p); return b.time > 31; }, 40);
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
  h.runUntil(() => e.blockedBy === k, 8);   // he walks slowly (his Boost's 0.3 move speed)
  assert.equal(e.blockedBy, k, `blocked by contact (gap ${Math.hypot(e.x - k.x, e.y - k.y).toFixed(2)}, phase ${k.mem.sk.phase}, e at ${e.x},${e.y} alive ${e.alive})`);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});
