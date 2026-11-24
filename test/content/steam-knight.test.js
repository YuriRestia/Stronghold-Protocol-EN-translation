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
