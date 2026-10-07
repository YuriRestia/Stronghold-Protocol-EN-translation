// test/sim/feedback5-bounty-payee.test.js — community report of 2026-10-06 「被源石地板烫死的悬赏没给赏金」. The bounty pays
// whenever the body dies (the owner's decision, relayed 2026-10-06; 0.1.1 "a bounty coin is paid once, at the final
// death"; 0.1.3 §23.25 "Killing the body pays once"); PRTS 卫戍协议：盟约 决策: "该敌人于对应玩家所属区域倒下时，使相应玩家获得
// 额外资金". Battle._bountyPayee: an operator of a player in the battle that dealt the blow pays its player; any other
// death pays the card's owner when that player fights there — on its own field a 活性源石 death always paid (pinned) —
// and in 联防, where the owner is the leaker (unite.js planUnite) and fights elsewhere, the helper whose half it fell on.
// Until 0.2.0 that last case fell back to the leaker, who has no per-player entry in the 联防 battle: the coins were
// dropped (in 0.1.x the 联防 field was the round's map, as it is again since 0.2.1, so 战场#04's 活性源石 burned leaked
// bounty enemies for nothing).
// Run: node --test test/sim/feedback5-bounty-payee.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';

const coins = (h) => {
  const out = {};
  for (const e of h.eventsOf('bounty')) out[e[1]] = (out[e[1]] || 0) + e[2];
  return out;
};
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
const helper = (playerId, seat, side, colOffset, units = []) => ({ playerId, seat, side, colOffset, units, bonds: {}, layers: {} });
// a 联防 field: helpers A (left half) and B (right half), a bounty enemy the leaker L sent in (planUnite's shape)
function unite(players, pos) {
  return makeBattle({
    kind: 'unite', content: 'none', autoFinish: false, timeLimit: 60, players,
    defs: { enemies: { enemy_b: enemyRec({ key: 'enemy_b', hp: 100, speed: 0 }), enemy_x: enemyRec({ key: 'enemy_x', hp: 100, speed: 0 }) } },
    enemies: [{ key: 'enemy_b', pos, sourcePlayerId: 'L', mods: { bountyId: 'card1' }, bounty: { coins: 2, ownerPlayerId: 'L' }, tag: 'bounty' }],
  });
}
const target = (h) => h.b.enemies.find((e) => e.defId === 'enemy_b');

test('own field (战场#04): a bounty enemy the 活性源石 alone burns to death pays its owner — as before', () => {
  const h = makeBattle({
    stageId: 'act1autochess_m04', autoFinish: false, timeLimit: 60,
    defs: { enemies: { enemy_b: enemyRec({ key: 'enemy_b', hp: 100, speed: 0.5 }) } },
    enemies: [{ key: 'enemy_b', route: { motion: 'WALK', start: [10, 7], end: [9, 2], checkpoints: [] }, mods: { bountyId: 'card1' }, bounty: { coins: 2, ownerPlayerId: 'p1' }, tag: 'bounty', ownerPlayerId: 'p1' }],
  });
  assert.ok(h.runUntil(() => !h.b.enemies.some((e) => e.alive) && h.b.time > 1, 30));
  assert.deepEqual(h.eventsOf('die').map((d) => d[2]), ['killed'], 'it died, no leak');
  assert.deepEqual(coins(h), { p1: 2 });
  assert.equal(h.result().perPlayer.p1.coins, 2);
  done(h);
});

test('联防: a leaked bounty enemy that dies with no operator behind it pays the helper of the half it fell on', () => {
  const ways = [
    ['killed by nobody', (h, e) => h.b.kill(e, null)],
    ['无来源 terrain-tagged damage', (h, e) => h.b.dealDamage(null, e, { amount: 500, type: 'true', canDodge: false, tags: ['terrain'] })],
    ['another enemy\'s hit', (h, e) => h.b.dealDamage(h.spawn('enemy_x', { pos: [10, 3] }), e, { amount: 500, type: 'true' })],
    ['its own HP loss', (h, e) => h.b.loseHp(e, 500, { source: e })],
  ];
  for (const [label, how] of ways) {
    // one helper: the whole field is hers
    const h1 = unite([helper('A', 0, 'L', 0)], [10, 6]);
    h1.step();
    how(h1, target(h1));
    assert.ok(!target(h1).alive, label);
    assert.deepEqual(coins(h1), { A: 2 }, `one helper, ${label}`);
    assert.equal(h1.result().perPlayer.A.coins, 2);
    done(h1);
    // two helpers: by the half it fell on (the right-hand helper's half from column 11)
    for (const [col, who] of [[5, 'A'], [15, 'B']]) {
      const h2 = unite([helper('A', 0, 'L', 0), helper('B', 1, 'R', 8)], [10, col]);
      h2.step();
      how(h2, target(h2));
      assert.deepEqual(coins(h2), { [who]: 2 }, `two helpers, column ${col}, ${label}`);
      done(h2);
    }
  }
});

test('联防: a helper\'s operator that knocks it out still takes the coins, whatever half it fell on', () => {
  const GUN = chessRec({ id: 't_gun', profession: 'SNIPER', projectile: 'none', stats: { atk: 50, maxHp: 1e7, bat: 1, blockCnt: 0 }, rangeGrid: [[0, 0]], skill: null });
  const h = makeBattle({
    kind: 'unite', content: 'none', autoFinish: false, timeLimit: 60,
    players: [helper('A', 0, 'L', 0, [{ uid: 1, kind: 'chess', chessId: 't_gun', row: 10, col: 4 }]), helper('B', 1, 'R', 8)],
    defs: { chess: { t_gun: GUN }, enemies: { enemy_b: enemyRec({ key: 'enemy_b', hp: 100, speed: 0 }) } },
    enemies: [{ key: 'enemy_b', pos: [10, 15], sourcePlayerId: 'L', mods: { bountyId: 'card1' }, bounty: { coins: 2, ownerPlayerId: 'L' }, tag: 'bounty' }],
  });
  h.step();
  const gun = h.b.allies().find((u) => u.ownerId === 'A');
  assert.ok(gun, 'A\'s operator');
  h.b.dealDamage(gun, target(h), { amount: 500, type: 'phys' });
  assert.deepEqual(coins(h), { A: 2 }, 'the killer\'s player, on B\'s half');
  done(h);
});

test('Final Assault pair field: the card\'s owner fights there, so a death nobody caused pays the owner on either half', () => {
  const h = makeBattle({
    kind: 'boss', content: 'none', autoFinish: false, timeLimit: 60,
    players: [helper('A', 0, 'L', 0), helper('B', 1, 'R', 8)],
    defs: { enemies: { enemy_b: enemyRec({ key: 'enemy_b', hp: 100, speed: 0 }) } },
    enemies: [{ key: 'enemy_b', pos: [3, 15], ownerPlayerId: 'A', mods: { bountyId: 'card1' }, bounty: { coins: 2, ownerPlayerId: 'A' }, tag: 'bounty' }],
  });
  h.step();
  h.b.kill(target(h), null);
  assert.deepEqual(coins(h), { A: 2 });
  done(h);
});
