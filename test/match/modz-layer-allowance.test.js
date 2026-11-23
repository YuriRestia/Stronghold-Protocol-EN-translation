// Mod Z / W v2: the stacks a module adds in battle are allowed by the server's check of a battle result
// (server/match/fields.js layerAllowanceOf; shared/modZ.js `layerAllow`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerAllowanceOf } from '../../server/match/fields.js';

const gd = { garrison: () => null, chess: () => ({ bonds: ['steadShip'], garrisonIds: [] }), bond: () => true };
const player = (uniEquipId) => ({ units: [{ kind: 'chess', chessId: 'chess_diy_x', diy: { charId: 'c', skillIndex: 0, uniEquipId } }], bonds: { steadShip: {}, kjeragShip: {} } });

test('Eunectes Z (+3 x 20), Phantom Z (+3 x 10), Siege W (50 Marvel) and Saileach W (no limit) add to the allowance', () => {
  assert.equal(layerAllowanceOf(player('uniequip_fishz_zumama'), gd).get('kjeragShip'), 60);
  assert.equal(layerAllowanceOf(player('uniequip_fishz_phatom'), gd).get('steadShip'), 30);
  assert.equal(layerAllowanceOf(player('uniequip_fishw_siege'), gd).get('miraShip'), 50);
  assert.equal(layerAllowanceOf(player('uniequip_fishw_sleach'), gd).get('kjeragShip'), Infinity);
});

test('a module without stack gains, an official module and no module add nothing', () => {
  for (const id of ['uniequip_fishz_typhon', 'uniequip_002_helage', null]) assert.equal(layerAllowanceOf(player(id), gd).size, 0, String(id));
});

import { specBounds } from '../../server/match/fields.js';
test('Typhon W: the server allows up to 30 extra (uncounted) leaks of the wave\'s keys only for a player with the module', () => {
  const spec = (id) => ({ spawns: [{ enemyKey: 'enemy_a', count: 5, time: 0, interval: 1 }], players: [{ playerId: 'p', units: [{ uid: 1, kind: 'chess', chessId: 'c', diy: { uniEquipId: id } }] }] });
  assert.equal(specBounds(spec('uniequip_fishw_typhon')).reviveAllow, 30);
  assert.equal(specBounds(spec('uniequip_fishz_typhon')).reviveAllow, 0);
  assert.equal(specBounds({ spawns: [], players: [] }).reviveAllow, 0);
});
