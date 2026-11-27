// GitHub #232 (reporter @ccyl; a minimal engine repro and the cause by @kukiC): a 隐匿 enemy kept frozen beside an
// operator who was knocked out hides again 3 s after the block ends; the operator redeploys on its tile, the enemy in its
// block radius and a slot free, and still cannot block it — nor so reveal it — until the freeze ends; the same with a
// stun. ai.js updateEnemy returned before the contact check (Battle._checkBlock) while the enemy held the `stun` flag
// (冻结 / 沉睡 / 浮空 are folded into it, units.js). Official: PRTS 异常效果 — STUNNED / FROZEN switch the state machine
// (no attack, no skill, enemies cannot move); only 不可阻挡 (BLOCK_FREE 「无法阻挡/被阻挡，自动解除阻挡」, also held by
// SLEEPING and LEVITATE) refuses a block; 术语释义 冻结 「无法移动、攻击及使用技能」 names no block, 沉睡 adds 「无法阻挡/被
// 阻挡」; 作战机制 §碰撞体积与位置识别: an operator deployed onto an enemy blocks it, one standing still included. Now a
// stunned / frozen enemy is blocked by contact where it stands, like a standing enemy: never one short of contact, never
// 沉睡 / 浮空 / 恐惧 / 不可阻挡; the 隐匿 timings are unchanged.
//
// Flat stage: enemies walk row 9 from the gate (9,10) to the goal (9,2), i.e. towards smaller columns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { enemyStealthed, canTargetEnemy } from '../../server/sim/targeting.js';
import { STEALTH_RESTORE, BLOCK_RADIUS, BLOCK_EDGE_OUT } from '../../server/sim/constants.js';

const OP = 'test_reblock';      // block 2, comes back 4 s after a knock-out (on its tile: GitHub #60)
const OP1 = 'test_reblock_1';   // block 1
const foe = (key) => enemyRec({ key, hp: 1e7, speed: 1 });
const op = (id, blockCnt) => chessRec({ id, stats: { atk: 0, blockCnt, maxHp: 1e6, respawnTime: 4 }, skill: null });

function lane({ unit = OP, enemies = [{ key: 'enemy_a', time: 0 }] } = {}) {
  return makeBattle({
    defs: { chess: { [OP]: op(OP, 2), [OP1]: op(OP1, 1) }, enemies: { enemy_a: foe('enemy_a'), enemy_b: foe('enemy_b') } },
    units: [{ chessId: unit, row: 9, col: 6 }], enemies, timeLimit: 120, content: 'none',
  });
}
/** A 隐匿 source with the default restore (STEALTH_RESTORE s after a block ends). */
const hide = (h, e) => h.b.addBuff(e, { key: 'test:stealth', persist: true, flags: { stealth: true } });
const dist = (e, u) => Math.hypot(e.x - u.x, e.y - u.y);
/** Knock the operator out and wait for its redeploy on the same tile. */
function knockOutAndBack(h, u) {
  const r = u.tileR, c = u.tileC;
  h.b.kill(u);
  assert.ok(!u.alive, 'knocked out');
  assert.ok(h.runUntil(() => u.alive && u.deployed, 10), 'redeployed after its timer');
  assert.deepEqual([u.tileR, u.tileC], [r, c], 'on its own tile');
}

for (const status of ['freeze', 'stun']) {
  for (const hidden of [true, false]) {
    test(`#232: ${status}${hidden ? ' + 隐匿' : ''} — the operator redeployed beside the held enemy blocks it while it is still held${hidden ? ', which reveals it; the 隐匿 timings stay' : ''}`, () => {
      const h = lane();
      const u = h.unit(OP);
      const A = () => h.enemy('enemy_a');
      assert.ok(h.runUntil(() => A()?.blockedBy === u, 30), 'blocked at contact');
      const e = A();
      if (hidden) hide(h, e);
      assert.equal(enemyStealthed(e), false, 'blocked: its 隐匿 is off');
      assert.ok(h.b.applyStatus(e, status, { duration: 100 }), status);
      h.step(3);
      assert.equal(e.blockedBy, u, `${status}: the block it holds stays`);
      const x0 = e.x, y0 = e.y;
      assert.ok(dist(e, u) < BLOCK_RADIUS.ground, 'in the block radius');
      // the reporter's steps: the blocker falls, the 3 s window runs out, the enemy hides again
      h.b.kill(u);
      assert.equal(e.blockedBy, null, 'the knock-out ends the block');
      h.run(STEALTH_RESTORE + 0.2);
      assert.equal(enemyStealthed(e), hidden, hidden ? 'hidden again 3 s after the block ended' : 'no 隐匿');
      assert.ok(h.runUntil(() => u.alive && u.deployed, 10), 'redeployed after its timer');
      const blocks = h.hooksOf('blocked').length;
      h.step();
      assert.equal(e.blockedBy, u, `blocked by the redeployed operator while still ${status === 'freeze' ? 'frozen' : 'stunned'}`);
      assert.deepEqual(u.blocking, [e], 'one slot taken');
      assert.equal(h.hooksOf('blocked').length, blocks + 1, 'the blocked hook fires');
      assert.ok(e.s.flags[status] && e.s.flags.stun, `the ${status} goes on`);
      assert.equal(enemyStealthed(e), false, 'revealed by the block');
      assert.ok(canTargetEnemy(u, e, u.profile), 'targetable');
      assert.ok(e.x === x0 && e.y === y0, 'it never moved');
      checkInvariants(h.b);
      if (hidden) {
        // the window after a block is the usual one: off for STEALTH_RESTORE s from the block's end, then hidden again
        h.b.kill(u);
        h.run(STEALTH_RESTORE - 0.1);
        assert.equal(enemyStealthed(e), false, 'revealed through the window');
        h.run(0.2);
        assert.equal(enemyStealthed(e), true, 'hidden again once it is over');
      }
    });
  }
}

test('contact only: an enemy stunned on its way, short of the blocker, is not blocked meanwhile; afterwards it walks in and is blocked at the same point as one never stunned', () => {
  const blockedAt = (stunAt) => {
    const h = lane();
    const u = h.unit(OP);
    const A = () => h.enemy('enemy_a');
    if (stunAt != null) {
      assert.ok(h.runUntil(() => A() && A().x <= stunAt, 30));
      const e = A(), x = e.x;
      assert.ok(dist(e, u) > BLOCK_RADIUS.ground + 0.2, `short of contact (${dist(e, u).toFixed(3)} tile)`);
      assert.ok(h.b.applyStatus(e, 'stun', { duration: 3 }));
      h.run(2.9);
      assert.equal(e.blockedBy, null, 'not blocked while stunned short of contact');
      assert.equal(e.x, x, 'it stands');
    }
    assert.ok(h.runUntil(() => A()?.blockedBy === u, 30), 'blocked');
    return { x: A().x, d: dist(A(), u) };
  };
  const free = blockedAt(null);
  const stunned = blockedAt(7.0);
  assert.ok(free.d < BLOCK_RADIUS.ground && free.d > BLOCK_RADIUS.ground - 0.05, `stops at contact (${free.d.toFixed(3)} tile)`);
  assert.ok(Math.abs(stunned.x - free.x) < 1e-9, `the same contact point (${stunned.x} vs ${free.x})`);
});

for (const status of ['bind', 'stun', 'freeze']) {
  test(`capacity: an enemy held by ${status} where it passes a full blocker is blocked the moment the slot frees${status === 'bind' ? ' (束缚 does not stun: the reference)' : ', while still held — like the 束缚 one'}`, () => {
    const h = lane({ unit: OP1, enemies: [{ key: 'enemy_a', time: 0 }, { key: 'enemy_b', time: 1 }] });
    const u = h.unit(OP1);
    const A = () => h.enemy('enemy_a'), B = () => h.enemy('enemy_b');
    assert.ok(h.runUntil(() => A()?.blockedBy === u, 30), 'A takes the only slot');
    assert.ok(h.runUntil(() => B() && B().x <= 6.2, 30), 'B walks on through the full blocker');
    const b = B();
    assert.equal(b.blockedBy, null, 'no room: B is not blocked');
    assert.ok(dist(b, u) < BLOCK_RADIUS.ground, 'B in the block radius');
    assert.ok(h.b.applyStatus(b, status, { duration: 20 }), status);
    h.step(2);
    const x = b.x;
    assert.equal(b.blockedBy, null, 'still no room');
    h.b.loseHp(A(), 1e12);
    h.step(2);
    assert.ok(!A().alive, 'A falls: the slot frees');
    assert.equal(b.blockedBy, u, `B is blocked (${status})`);
    assert.ok(b.findBuff(status), `the ${status} goes on`);
    // inside the blocker's tile: just past its nearest edge — a block shift, not a push, so held or not (GitHub #61)
    assert.ok(x - u.x > 0 && x - u.x < 0.5, `B stood inside the tile (${x})`);
    assert.equal(b.x, u.x + BLOCK_EDGE_OUT, 'shifted to the edge');
    checkInvariants(h.b);
  });
}

test('refusals unchanged: 沉睡 / 浮空 / 恐惧 + 冻结 / 不可阻挡 + 晕眩 beside the redeployed operator with room — none is blocked', () => {
  const cases = {
    sleep: (h, e) => h.b.applyStatus(e, 'sleep', { duration: 60 }),
    levitate: (h, e) => h.b.applyStatus(e, 'levitate', { duration: 60 }),
    'fear + freeze': (h, e) => h.b.applyStatus(e, 'fear', { duration: 60 }) && h.b.applyStatus(e, 'freeze', { duration: 60 }),
    'unblockable + stun': (h, e) => { h.b.addBuff(e, { key: 'test:free', duration: 60, flags: { unblockable: true } }); return h.b.applyStatus(e, 'stun', { duration: 60 }); },
  };
  for (const [name, put] of Object.entries(cases)) {
    const h = lane();
    const u = h.unit(OP);
    const A = () => h.enemy('enemy_a');
    assert.ok(h.runUntil(() => A()?.blockedBy === u, 30), `${name}: blocked first`);
    const e = A();
    assert.ok(put(h, e), `${name}: applied`);
    knockOutAndBack(h, u);
    h.step(2);
    assert.ok(e.s.flags.stun, `${name}: the enemy is held`);
    assert.equal(e.blockedBy, null, `${name}: not blocked`);
    assert.deepEqual(u.blocking, [], `${name}: no slot taken`);
    checkInvariants(h.b);
  }
});
