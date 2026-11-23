// (fork) Port of the narrow fix the upstream maintainer asked for on GitHub PR #872 (issue #871): Swire the Elegant Wit's
// S2 champagne bomb leaves the field with her (knocked out, retreated, sold), tested in the official client on
// 2026-10-23. Only her own bombs go, on her own exit; other summons and other operators' exits are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';

const TRAP = 'token_10031_swire2_gdtrap';
const SW = 'chess_char_3_04_a';
const bombs = (h, owner) => h.b.allyUnits.filter((a) => a.defId === TRAP && a.alive && a.deployed && (!owner || a.ownerUnit === owner));
const done = (h) => { checkInvariants(h.b); assert.deepEqual(h.b.errors, []); };

/** Two S2 Swires (uids 1 and 3) and a plain operator (uid 2), each Swire with her first bomb on the field. */
function field() {
  const h = makeBattle({ autoFinish: false, units: [
    { uid: 1, chessId: SW, row: 10, col: 4, skillIndex: 1, potential: 1 },
    { uid: 3, chessId: SW, row: 12, col: 4, skillIndex: 1, potential: 1 },
    { uid: 2, chessId: 'chess_char_2_06_a', row: 11, col: 2 }] });
  h.b.start(); h.step();
  const a = h.unit(1), b = h.unit(3);
  assert.equal(bombs(h, a).length, 1, 'Swire 1 threw her bomb'); assert.equal(bombs(h, b).length, 1, 'Swire 3 threw her bomb');
  return { h, a, b };
}

for (const [how, leave] of [
  ['knocked out', (h, u) => h.b.kill(u)],
  ['retreated', (h, u) => h.b.retreat(u)],
  ['sold', (h, u) => h.b.retreat(u, { reason: 'merchant' })],
]) {
  test(`Swire the Elegant Wit ${how}: her unexploded bomb leaves with her, the other Swire's stays`, () => {
    const { h, a, b } = field();
    const mine = bombs(h, a)[0];
    leave(h, a);
    assert.equal(bombs(h, a).length, 0, 'her bomb left');
    assert.ok(!mine.alive || !mine.deployed);
    assert.equal(bombs(h, b).length, 1, 'the other Swire keeps hers');
    h.run(1);
    assert.equal(bombs(h, a).length, 0, 'no new bomb from a Swire who is gone');
    done(h);
  });
}

test('another operator leaving the field does not take a Swire bomb with it', () => {
  const { h, a, b } = field();
  h.b.kill(h.unit(2));
  assert.equal(bombs(h, a).length, 1); assert.equal(bombs(h, b).length, 1);
  done(h);
});
