// GitHub #174: the cheat 「叠层上限 9999」 (lobby rule `bigStacks`): every bond's layer cap is 9999 instead of 999. A second,
// separate cheat, `noHitLimit`, turns the boss-hit limit (限伤, 300000 per hit on a leader) off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOND_LAYER_CAP, RULE_BIG_STACK_CAP, layerCapOf, layerGainRoom, DEFAULT_RULES, normalizeRules } from '../../shared/constants.js';
import { leaderHitCancelled } from '../../server/sim/attack/health.js';
import { makeMatch, checkInvariants } from './harness.js';

test('the rule is a cheat, off by default, and sets the cap used by layerGainRoom', () => {
  assert.equal(DEFAULT_RULES.bigStacks, false);
  assert.equal(normalizeRules({ bigStacks: true }).bigStacks, true);
  assert.equal(layerCapOf(undefined), BOND_LAYER_CAP);
  assert.equal(layerCapOf({ bigStacks: false }), BOND_LAYER_CAP);
  assert.equal(layerCapOf({ bigStacks: true }), RULE_BIG_STACK_CAP);
  assert.equal(RULE_BIG_STACK_CAP, 9999);
  assert.equal(layerGainRoom(990, 50), 9);
  assert.equal(layerGainRoom(990, 50, layerCapOf({ bigStacks: true })), 50);
  assert.equal(layerGainRoom(9990, 50, layerCapOf({ bigStacks: true })), 9);
});

function layersAfter(lobbyRules) {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11, lobbyRules }).start();
  h.toPrep(1);
  const m = h.m, ps = h.ps('p_0');
  const bondId = m.gd.bondIds[0];
  const added = ps.addLayers(bondId, 5000);
  checkInvariants(m);
  return { added, layers: ps.layers[bondId] };
}

test('a player\'s layers stop at 999 normally and at 9999 with the rule', () => {
  assert.deepEqual(layersAfter(undefined), { added: 999, layers: 999 });
  assert.deepEqual(layersAfter({ bigStacks: true }), { added: 5000, layers: 5000 });
});

test('the boss-hit limit cancels a 500000 hit on a leader, unless the rule noHitLimit is on (bigStacks alone does not lift it)', () => {
  const target = { isBoss: true, x: 0, y: 0, id: 1 };
  const battle = (rules) => ({ kind: 'boss', flags: { rules }, fx() {} });
  assert.equal(leaderHitCancelled(battle({}), target, 500000), true);
  assert.equal(leaderHitCancelled(battle({ bigStacks: true }), target, 500000), true, 'the stack cheat alone leaves the limit');
  assert.equal(leaderHitCancelled(battle({ noHitLimit: true }), target, 500000), false);
  assert.equal(DEFAULT_RULES.noHitLimit, false);
  assert.equal(leaderHitCancelled(battle({}), target, 299999), false, 'below the limit lands either way');
});
