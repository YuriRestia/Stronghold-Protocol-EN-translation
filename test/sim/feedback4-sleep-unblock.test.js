// GitHub #140 (a player who tested the official mode; the owner's decision of 2026-10-06): 瑕光's S2 put 4 enemies to
// sleep and she could still block the next one; once the skill ended they could no longer be blocked. PRTS 异常效果:
// SLEEPING 沉睡 = 「无法行动+无敌+不可阻挡」, and BLOCK_FREE 不可阻挡 = 「无法阻挡/被阻挡，自动解除阻挡」. So a sleeping enemy
// is let go by its blocker (the slot frees for the next enemy), is never blocked while asleep, stays where it is (it
// cannot move), and when it wakes it is blocked again only by a blocker with a free slot — else it walks on, like any
// unblocked enemy (DESIGN §24.9). Sleeping operators already released what they block (unchanged).
//
// Flat stage: enemies walk row 9 from the gate (9,10) to the goal (9,2), i.e. towards smaller columns (0.5 tile/s).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const OP = 'test_sleep_blocker';
const foe = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 1, ...o });
/** A block-1 operator at (9,6) that never attacks; enemies A and B (B immune to sleep where a test needs it). */
function lane(enemies, enemyDefs = {}) {
  return makeBattle({
    defs: {
      chess: { [OP]: chessRec({ id: OP, stats: { atk: 0, blockCnt: 1, maxHp: 1e6, respawnTime: 999 }, skill: null }) },
      enemies: { enemy_a: foe('enemy_a'), enemy_b: foe('enemy_b'), ...enemyDefs },
    },
    units: [{ chessId: OP, row: 9, col: 6 }], enemies, timeLimit: 120, content: 'none',
  });
}
const kill = (h, e) => h.b.loseHp(e, 1e12);

test('沉睡 frees the block slot: the sleeper is let go at once and stays put, the next enemy is blocked; awake with no room it walks on', () => {
  const h = lane([{ key: 'enemy_a', time: 0 }, { key: 'enemy_b', time: 1 }]);
  const u = h.unit(OP);
  const A = () => h.enemy('enemy_a'), B = () => h.enemy('enemy_b');
  assert.ok(h.runUntil(() => A()?.blockedBy === u, 30), 'A is blocked');
  const ax = A().x, ay = A().y;
  assert.ok(h.b.applyStatus(A(), 'sleep', { duration: 6, source: u }), 'A falls asleep');
  assert.equal(A().blockedBy, null, 'released at once (不可阻挡)');
  assert.deepEqual(u.blocking, [], 'the slot is free');
  assert.ok(h.runUntil(() => B()?.blockedBy === u, 10), 'B is blocked in the freed slot');
  assert.ok(A().s.flags.sleep, 'A still asleep');
  assert.equal(A().blockedBy, null, 'the sleeper is not blocked and takes no slot');
  assert.deepEqual(u.blocking, [B()]);
  assert.ok(A().x === ax && A().y === ay, 'the sleeper stays where it fell asleep');
  checkInvariants(h.b);
  // A wakes while B holds the only slot: it is not blocked and walks on past the operator
  assert.ok(h.runUntil(() => !A().s.flags.sleep, 10), 'A wakes');
  h.step();
  assert.equal(A().blockedBy, null, 'no room: A is not blocked');
  assert.equal(B().blockedBy, u, 'B keeps the slot');
  h.run(2);
  assert.ok(A().x < ax - 0.5, `A walked on (x ${A().x.toFixed(2)} from ${ax.toFixed(2)})`);
  assert.equal(A().blockedBy, null);
  assert.equal(B().blockedBy, u);
  checkInvariants(h.b);
});

test('沉睡: never blocked while asleep, even beside a blocker with room — blocked again where it stands once it wakes', () => {
  const h = lane([{ key: 'enemy_a', time: 0 }, { key: 'enemy_b', time: 1 }]);
  const u = h.unit(OP);
  const A = () => h.enemy('enemy_a'), B = () => h.enemy('enemy_b');
  assert.ok(h.runUntil(() => A()?.blockedBy === u, 30));
  const ax = A().x;
  assert.ok(h.b.applyStatus(A(), 'sleep', { duration: 5, source: u }));
  assert.ok(h.runUntil(() => B()?.blockedBy === u, 10), 'B takes the slot');
  kill(h, B());
  h.step(2);
  assert.ok(!B().alive && u.blocking.length === 0, 'the slot is free again');
  h.run(1);
  assert.ok(A().s.flags.sleep, 'A still asleep');
  assert.equal(A().blockedBy, null, 'a sleeper is not blocked although the operator has room');
  assert.equal(u.blocking.length, 0);
  assert.ok(h.runUntil(() => !A().s.flags.sleep, 10), 'A wakes');
  h.step();
  assert.equal(A().blockedBy, u, 'blocked again the moment it wakes (a free slot, still in contact)');
  assert.equal(A().x, ax, 'it never moved');
  h.run(2);
  assert.equal(A().blockedBy, u);
  assert.equal(A().x, ax);
  checkInvariants(h.b);
});

test('沉睡 through a plain buff (flags.sleep) is let go on the enemy\'s next update; 晕眩 / a refused sleep keep the block', () => {
  // a custom sleep buff: no applyStatus release — ai.js updateEnemy lets it go on its next update
  const h = lane([{ key: 'enemy_a', time: 0 }]);
  const u = h.unit(OP);
  const A = () => h.enemy('enemy_a');
  assert.ok(h.runUntil(() => A()?.blockedBy === u, 30));
  h.b.addBuff(A(), { key: 'test:sleep', duration: 2, flags: { sleep: true } });
  h.step();
  assert.equal(A().blockedBy, null, 'released');
  assert.deepEqual(u.blocking, []);
  h.run(2.2);
  assert.ok(!A().s.flags.sleep && A().blockedBy === u, 'awake beside a free blocker: blocked again');
  checkInvariants(h.b);
  // 晕眩 is not 不可阻挡: a stunned enemy stays blocked; a sleep-immune enemy refuses the sleep and stays blocked
  const h2 = lane([{ key: 'enemy_a', time: 0 }, { key: 'enemy_x', time: 8 }], { enemy_x: foe('enemy_x', { immunities: { sleepImmune: true } }) });
  const u2 = h2.unit(OP);
  const A2 = () => h2.enemy('enemy_a'), X = () => h2.enemy('enemy_x');
  assert.ok(h2.runUntil(() => A2()?.blockedBy === u2, 30));
  assert.ok(h2.b.applyStatus(A2(), 'stun', { duration: 2 }));
  h2.step(3);
  assert.equal(A2().blockedBy, u2, 'stunned: still blocked');
  kill(h2, A2());
  assert.ok(h2.runUntil(() => X()?.blockedBy === u2, 30));
  assert.equal(h2.b.applyStatus(X(), 'sleep', { duration: 3 }), false, 'immune');
  h2.step(3);
  assert.equal(X().blockedBy, u2, 'no sleep, still blocked');
  checkInvariants(h2.b);
});

test('沉睡: the blocker\'s blocked-target list (Battle.blockedTargets — blocked-first targeting, the DEFAULT trigger, hitAllBlocked) drops the sleeper and takes the next enemy', () => {
  const h = lane([{ key: 'enemy_a', time: 0 }, { key: 'enemy_b', time: 1 }]);
  const u = h.unit(OP);
  const A = () => h.enemy('enemy_a'), B = () => h.enemy('enemy_b');
  assert.ok(h.runUntil(() => A()?.blockedBy === u, 30));
  h.b.applyStatus(A(), 'sleep', { duration: 6 });
  assert.deepEqual(h.b.blockedTargets(u, u.profile), [], 'no blocked target while A sleeps and B is not there yet');
  assert.ok(h.runUntil(() => B()?.blockedBy === u, 10));
  assert.deepEqual(h.b.blockedTargets(u, u.profile), [B()], 'B is the blocked target');
});

test('#140: 瑕光 S2 puts the 3 enemies she blocks to sleep and still blocks the next 3; when S2 ends the sleepers wake with no room and walk on', () => {
  const ds = getDefaultSource();
  const id = 'chess_char_3_12_a';
  const rec = ds.rawChess(id);
  assert.equal(rec.stats.blockCnt, 3, 'block 3');
  const skillIndex = rec.skills.find((s) => s.skillId === 'skchr_blemsh_2').index;
  const h = makeBattle({
    // (a MANUAL 重装 skill: cast by a blocked enemy's hit — TAKE_DAMAGE)
    defs: { enemies: { enemy_x: foe('enemy_x', { atk: 100, bat: 1 }), enemy_y: foe('enemy_y', { atk: 100, bat: 1 }) } }, timeLimit: 90,
    units: [{ chessId: id, row: 9, col: 8, skillIndex }],
    enemies: [{ key: 'enemy_x', time: 0, count: 3, interval: 0.5 }, { key: 'enemy_y', time: 6, count: 3, interval: 0.5 }],
  });
  const u = h.unit(id);
  const xs = () => h.b.enemies.filter((e) => e.defId === 'enemy_x');
  const ys = () => h.b.enemies.filter((e) => e.defId === 'enemy_y');
  assert.ok(h.runUntil(() => xs().length === 3 && xs().every((e) => e.blockedBy === u), 30), 'she blocks the first three');
  u.skill.gainSp(u.skill.spCost * u.skill.maxCharges + 1, 'test');
  assert.ok(h.runUntil(() => u.skill.active, 5), 'S2 cast');
  h.step();
  const pos = new Map(xs().map((e) => [e, e.x]));
  assert.ok(xs().every((e) => e.s.flags.sleep && !e.blockedBy), 'the three sleep and are let go');
  assert.equal(u.blocking.length, 0, 'all three slots free');
  // the next three walk in during S2 and are blocked
  assert.ok(h.runUntil(() => ys().length === 3 && ys().every((e) => e.blockedBy === u), 12), 'she blocks the next three during S2');
  assert.ok(u.skill.active, 'S2 still running');
  assert.ok(xs().every((e) => e.s.flags.sleep && !e.blockedBy && e.x === pos.get(e)), 'the sleepers stay put, unblocked');
  checkInvariants(h.b);
  // S2 ends: the sleepers wake beside her, her three slots full — not blocked, they walk on (the reporter's "技能结束后
  // 则无法被阻挡")
  assert.ok(h.runUntil(() => !u.skill.active, 12), 'S2 ends');
  h.step();
  assert.ok(xs().every((e) => !e.s.flags.sleep), 'awake');
  assert.ok(xs().every((e) => !e.blockedBy), 'no room: none of them is blocked');
  assert.deepEqual(new Set(u.blocking), new Set(ys()), 'she keeps the three she holds');
  h.run(3);
  for (const e of xs()) assert.ok(e.x < pos.get(e) - 1, `walked on (x ${e.x.toFixed(2)})`);
  checkInvariants(h.b);
});
