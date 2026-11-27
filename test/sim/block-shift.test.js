// test/sim/block-shift.test.js — (fork, GitHub #61) block shifting (battle/blocking.js _blockShift; arknights.wiki.gg Shift
// §Block "shifting"): an enemy a ground unit starts blocking inside its tile moves just past the nearest edge
// (BLOCK_EDGE_OUT) and stays blocked; not against a wall, not from the exact centre; one that would stand where another
// enemy blocked from the same side stands steps BLOCK_SPREAD to the side.
// Fish's scenarios (fish-edition/MISC_USER_QUESTIONS.md), mirrored: the enemy comes from the right, along a 3×1
// corridor A (col 6) · B (col 5) · C (col 4), a wall past C (col 3), the path leaving C downwards. On A 水月 (block 0, like
// Ascalon) facing the enemy: her range reaches B behind her, not C. On B 泡泡, on C 蛇屠箱: 1×1 ranges, block 3.
// Run: node --test test/sim/block-shift.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, flatStage, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { BLOCK_EDGE_OUT, BLOCK_SPREAD } from '../../server/sim/constants.js';

const MIZUKI = 'chess_char_4_09_a', BUBBLE = 'chess_char_2_08_a', CUORA = 'chess_char_3_16_a';
const NAME = { [MIZUKI]: 'Mizuki', [BUBBLE]: 'Bubble', [CUORA]: 'Cuora' };
const A = 6, B = 5, C = 4;
const STAGE = flatStage({ rows: {
  9: '#####################',
  10: '####rrrrS############',
  11: '##Err################',
  12: '#####################',
} });

/** The corridor with all three deployed; `walk`: the enemy walks in (else it stands where it is put). */
function corridor({ walk = false } = {}) {
  const h = makeBattle({
    stage: STAGE, autoFinish: false, timeLimit: 120, flags: { dpPerSec: 0, dpMax: 999 },
    defs: { enemies: { enemy_w: enemyRec({ key: 'enemy_w', hp: 1e9, atk: 0, speed: walk ? 1 : 0, mass: 0 }) } },
    routes: [{ motion: 'WALK', start: [10, 8], end: [11, 2], checkpoints: [] }],
    units: [{ chessId: MIZUKI, row: 10, col: A, dir: 'RIGHT' }, { chessId: BUBBLE, row: 10, col: B }, { chessId: CUORA, row: 10, col: C }],
  });
  h.step();
  return h;
}
const down = (h, id) => { h.b.dealDamage(null, h.unit(id), { type: 'true', amount: 1e9 }); h.step(); assert.ok(!h.unit(id).alive, `${id} down`); };
const back = (h, id) => { assert.ok(h.b.redeploy(h.unit(id), { free: true }), `${id} back`); h.step(3); };
/** Who can attack `e`: its blocker, and every unit whose range holds it. */
const attackers = (h, e) => [MIZUKI, BUBBLE, CUORA].filter((id) => {
  const u = h.unit(id);
  return u.alive && (e.blockedBy === u || h.b.enemiesInKeys(u.baseRangeKeys, u, u.profile).includes(e));
}).map((id) => NAME[id]);
/** Did `e` get a block shift (its `displace` fx; a walk sends none). */
const shifted = (h, e) => h.eventsOf('fx').some((f) => f[1] === 'displace' && f[4]?.id === e.id);
const walkIn = (h) => { const e = h.spawn('enemy_w', { routeIndex: 0 }); assert.ok(h.runUntil(() => e.blockedBy, 20), 'blocked'); h.step(5); return e; };

test('scenario 1: walked into 泡泡: blocked before her tile, no shift; 水月 and 泡泡 reach it', () => {
  const h = corridor({ walk: true });
  const e = walkIn(h);
  assert.equal(e.blockedBy, h.unit(BUBBLE));
  assert.ok(e.x - B > 0.5, `outside her tile (${e.x})`);
  assert.equal(shifted(h, e), false, 'no shift');
  assert.deepEqual(attackers(h, e), ['Mizuki', 'Bubble']);
  checkInvariants(h.b);
});

test('scenario 2: 泡泡 deployed onto an enemy in the half of her tile towards A: shifted to that edge, blocked; 水月 and 泡泡 reach it', () => {
  const h = corridor();
  down(h, BUBBLE);
  const e = h.spawn('enemy_w', { pos: [10, B + 0.3] });
  h.step();
  back(h, BUBBLE);
  assert.equal(e.blockedBy, h.unit(BUBBLE));
  assert.ok(Math.abs(e.x - (B + BLOCK_EDGE_OUT)) < 1e-9 && e.y === 10, `just past the edge (${e.x})`);
  assert.ok(shifted(h, e), 'its shift, for the client');
  assert.deepEqual(attackers(h, e), ['Mizuki', 'Bubble']);
  checkInvariants(h.b);
});

test('scenario 3: … in the half towards C: shifted to that edge, blocked by 泡泡; all three reach it (水月 by the 0.1 collider)', () => {
  const h = corridor();
  down(h, BUBBLE);
  const e = h.spawn('enemy_w', { pos: [10, B - 0.2] });   // (nearer C than 0.707 蛇屠箱 would block it first: scenario 4)
  h.step();
  assert.equal(e.blockedBy, null);
  back(h, BUBBLE);
  assert.equal(e.blockedBy, h.unit(BUBBLE));
  assert.ok(Math.abs(e.x - (B - BLOCK_EDGE_OUT)) < 1e-9, `just past the edge (${e.x})`);
  assert.deepEqual(attackers(h, e), ['Mizuki', 'Bubble', 'Cuora']);
  checkInvariants(h.b);
});

test('scenario 4: walked past B into 蛇屠箱: blocked before her tile, no shift; 泡泡 redeployed changes nothing; all three reach it', () => {
  const h = corridor({ walk: true });
  down(h, BUBBLE);
  const e = walkIn(h);
  assert.equal(e.blockedBy, h.unit(CUORA));
  const x = e.x;
  assert.ok(x - C > 0.5, `outside her tile (${x})`);
  back(h, BUBBLE);
  assert.equal(e.blockedBy, h.unit(CUORA), 'still 蛇屠箱\'s');
  assert.equal(e.x, x, 'not moved');
  assert.equal(shifted(h, e), false, 'no shift');
  assert.deepEqual(attackers(h, e), ['Mizuki', 'Bubble', 'Cuora']);
  checkInvariants(h.b);
});

test('scenario 5: 蛇屠箱 deployed onto an enemy in the half of her tile towards B: shifted onto B\'s side, still hers after 泡泡 comes back; all three reach it', () => {
  const h = corridor();
  down(h, BUBBLE);
  down(h, CUORA);
  const e = h.spawn('enemy_w', { pos: [10, C + 0.3] });
  h.step();
  back(h, CUORA);
  assert.equal(e.blockedBy, h.unit(CUORA));
  assert.ok(Math.abs(e.x - (C + BLOCK_EDGE_OUT)) < 1e-9, `just past the edge (${e.x})`);
  back(h, BUBBLE);
  assert.equal(e.blockedBy, h.unit(CUORA), 'still 蛇屠箱\'s');
  assert.deepEqual(attackers(h, e), ['Mizuki', 'Bubble', 'Cuora']);
  checkInvariants(h.b);
});

test('scenario 6: … in the half towards the wall: the wall holds it on her tile, blocked; only 蛇屠箱 reaches it', () => {
  const h = corridor();
  down(h, BUBBLE);
  down(h, CUORA);
  const e = h.spawn('enemy_w', { pos: [10, C - 0.3] });
  h.step();
  back(h, CUORA);
  assert.equal(e.blockedBy, h.unit(CUORA));
  assert.ok(Math.abs(e.x - (C - 0.3)) < 1e-9, `not moved into the wall (${e.x})`);
  back(h, BUBBLE);
  assert.equal(e.blockedBy, h.unit(CUORA));
  assert.deepEqual(attackers(h, e), ['Cuora']);
  checkInvariants(h.b);
});

test('the exact centre: deployed onto an enemy on her tile\'s centre, it stays there, blocked', () => {
  const h = corridor();
  down(h, BUBBLE);
  const e = h.spawn('enemy_w', { pos: [10, B] });
  h.step();
  back(h, BUBBLE);
  assert.equal(e.blockedBy, h.unit(BUBBLE));
  assert.deepEqual([e.x, e.y], [B, 10]);
});

test('two enemies deployed onto from the same spot: the first goes to the edge, the second steps BLOCK_SPREAD to the side; apart, nobody steps', () => {
  const open = () => {
    const h = makeBattle({
      content: 'none', autoFinish: false, timeLimit: 60, flags: { dpPerSec: 0 },
      defs: { enemies: { enemy_w: enemyRec({ key: 'enemy_w', hp: 1e9, atk: 0, speed: 0, mass: 0 }) } },
      units: [{ chessId: BUBBLE, row: 10, col: 5 }],
    });
    h.step();
    down(h, BUBBLE);
    return h;
  };
  const h = open();
  const [e1, e2] = [h.spawn('enemy_w', { pos: [10, 5.3] }), h.spawn('enemy_w', { pos: [10, 5.3] })];
  h.step();
  back(h, BUBBLE);
  assert.ok(e1.blockedBy && e2.blockedBy, 'both blocked');
  const [first, second] = h.unit(BUBBLE).blocking;
  assert.deepEqual([first.x, first.y], [5 + BLOCK_EDGE_OUT, 10], 'the first: the edge');
  assert.ok(Math.abs(second.x - (5 + BLOCK_EDGE_OUT)) < 1e-9 && Math.abs(Math.abs(second.y - 10) - BLOCK_SPREAD) < 1e-9, `the second: beside it (${second.x}, ${second.y})`);
  // blocked from the right (blocking direction −x): its left is −y
  assert.ok(second.y < 10, 'left first');
  const g = open();
  const [f1, f2] = [g.spawn('enemy_w', { pos: [10.3, 5.6] }), g.spawn('enemy_w', { pos: [9.7, 5.6] })];
  g.step();
  back(g, BUBBLE);
  assert.ok(f1.blockedBy && f2.blockedBy);
  assert.deepEqual([[f1.x, f1.y], [f2.x, f2.y]], [[5.6, 10.3], [5.6, 9.7]], 'already apart: not moved');
});
