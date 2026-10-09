// test/sim/feedback7-raid-stealth.test.js — 突袭 and 隐匿 ground enemies: the owner's decision of 2026-10-08 (GitHub #316
// "Raid operator doesn't deploy to invisible enemy units, it does in official", confirmed by the owner's own play): a 突袭
// member jumps next to a 隐匿 (unrevealed) ground enemy, and one already in its range counts for 「若范围内没有敌人」 (no
// hop). Asleep, untargetable and flying enemies stay out, as before (bond text: 「再部署至一名地面敌人周围」).
// Run: node --test test/sim/feedback7-raid-stealth.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { enemyStealthed } from '../../server/sim/targeting.js';

const HOME = [12, 3];
const BONDS = { raidShip: { count: 2, active: true, tier: 1, layers: 0 } };
/**
 * A field where (10,7) is the only tile a melee member may land on beside the enemy at (10,8): the rest of rows 9–12 is
 * undeployable floor ('f'), its home (12,3) road.
 */
const ONE_SPOT = { rows: {
  9: '##Efffffff' + 'S' + 'fffffffS##',
  10: '##hffffrff' + 'f' + 'ffffffff##',
  11: '##hfffffff' + 'f' + 'ffffffff##',
  12: '##hrffffff' + 'S' + 'fffffffS##',
} };

/** `foe` at `pos` (with the buff flags `flags`), and optionally a visible `vis` at `visible`. */
function field({ pos = [10, 8], flags = null, fly = false, visible = null, range = [[0, 0], [0, 1]] } = {}) {
  const h = makeBattle({
    flat: ONE_SPOT, bonds: BONDS, autoFinish: false, timeLimit: 60, hooks: ['deploy'],
    defs: {
      chess: { raider: chessRec({ id: 'raider', profession: 'WARRIOR', position: 'MELEE', bonds: ['raidShip'], rangeGrid: range, skill: { spCost: 10, initSp: 10 } }) },
      enemies: {
        foe: enemyRec({ key: 'foe', hp: 1e7, speed: 0, atk: 0, motion: fly ? 'FLY' : 'WALK' }),
        vis: enemyRec({ key: 'vis', hp: 1e7, speed: 0, atk: 0 }),
      },
    },
    units: [{ chessId: 'raider', row: HOME[0], col: HOME[1], dir: 'RIGHT' }],
    enemies: [{ key: 'foe', pos }, ...(visible ? [{ key: 'vis', pos: visible }] : [])],
    setup(b) {
      if (flags) b.on('enemySpawn', (c) => { if (/foe$/.test(c.enemy.defId)) b.addBuff(c.enemy, { key: 'test:mark', persist: true, flags }); });
    },
  });
  return h;
}
const jumps = (h) => h.hooksOf('deploy').filter((c) => c.unit === h.unit('raider') && !c.initial).length;
const at = (h) => [h.unit('raider').tileR, h.unit('raider').tileC];
const foe = (h) => h.b.enemies.find((e) => e.alive && /foe$/.test(e.defId));

test('a ready 突袭 member jumps to the only landing spot beside a 隐匿 ground enemy, and does not hop again', () => {
  const h = field({ flags: { stealth: true } });
  h.run(1);
  assert.equal(enemyStealthed(foe(h)), true, 'still 隐匿 (not blocked, not revealed)');
  assert.deepEqual(at(h), [10, 7], 'landed on the one tile beside it');
  assert.equal(jumps(h), 1);
  h.run(3);
  assert.equal(jumps(h), 1, 'the 隐匿 enemy in its range is an enemy in range: no hop');
  assert.deepEqual(at(h), [10, 7]);
  checkInvariants(h.b);
});

test('a visible ground enemy: the same landing (control)', () => {
  const h = field();
  h.run(1);
  assert.deepEqual(at(h), [10, 7]);
  assert.equal(jumps(h), 1);
  checkInvariants(h.b);
});

test('a 隐匿 ground enemy already in its range: 「范围内没有敌人」 is false — it stays, though a visible one waits elsewhere', () => {
  const h = field({ pos: [12, 4], flags: { stealth: true }, visible: [10, 8] });
  h.run(3);
  assert.equal(enemyStealthed(foe(h)), true);
  assert.deepEqual(at(h), HOME);
  assert.equal(jumps(h), 0);
  checkInvariants(h.b);
});

test('asleep or flying 隐匿 enemies are still no destination', () => {
  for (const opts of [{ flags: { stealth: true, sleep: true } }, { flags: { stealth: true }, fly: true }]) {
    const h = field(opts);
    h.run(3);
    assert.deepEqual(at(h), HOME, JSON.stringify(opts));
    assert.equal(jumps(h), 0);
    checkInvariants(h.b);
  }
});
