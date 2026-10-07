// test/sim/feedback5-ulpia-own-board.test.js — community report of 2026-10-06 (item 27) 「乌尔比安使用3技能会在联防阶段跳到红门
// 后」. 乌尔比安 S3 必须开辟的通路 throws the anchor up to 6 tiles ahead (the nearest enemy of the line, else the farthest tile) and
// moves there when the tile "可以部署" (PRTS 备注 ③: the landing tile > the tile one beyond > his own tile). In a one-helper 联防
// (the helper's pieces on the left half, the enemies out of the middle gate at col 10; the fixture here is the escaped level's
// plain road, act1autochess_escaped_single — the 联防 field itself is the round's battlefield since 0.2.1) the right half is no
// tile his player deploys on, yet an anchor that met no enemy flew there and he moved behind the red gate for the whole
// skill. Now the landing must lie on his own board (Battle.onOwnBoard, the board region mapped onto the field).
// Run: node --test test/sim/feedback5-ulpia-own-board.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const ULPIA = 'chess_char_5_05_a';
const dummy = enemyRec({ key: 'enemy_anchor_dummy', hp: 1e9, speed: 0, mass: 0, atk: 0 });

/** 乌尔比安 cast S3 on `tile` of `kind`'s field; `enemy` = a parked enemy's tile or null. Returns where he stands after the cast. */
function cast({ kind = 'unite', stageId = 'act1autochess_escaped_single', tile = [10, 7], enemy = null, colOffset = 0 } = {}) {
  const h = makeBattle({
    kind, stageId, seed: 5, autoFinish: false, timeLimit: 120, defs: { enemies: { enemy_anchor_dummy: dummy } },
    players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset, units: [{ uid: 1, kind: 'chess', chessId: ULPIA, row: tile[0], col: tile[1] }], bonds: {} }],
  });
  h.step();
  const u = h.unit(ULPIA);
  const home = [u.tileR, u.tileC];
  if (enemy) { h.spawn('enemy_anchor_dummy', { pos: enemy }); h.step(); }   // (one tick: the enemy joins the tile index)
  u.skill.gainSp(999, 'test');
  // (its CUSTOM_RANGE trigger waits for an enemy on the line: with none the cast is made by hand, as a player's would be)
  if (!u.skill.active) assert.ok(u.skill.activate('test'), 'S3 cast');
  h.run(0.2);
  const at = [u.tileR, u.tileC];
  checkInvariants(h.b);
  return { h, u, home, at };
}

test('one-helper 联防: an anchor that meets no enemy flies on past the middle gate — he stays on his own half (until 0.2.0 he moved behind the red gate)', () => {
  const { h, u, home, at } = cast({ tile: [10, 7] });
  assert.deepEqual(home, [10, 7]);
  assert.ok(h.b.rect.c1 >= 13, 'the 联防 field spans both halves');
  assert.deepEqual(at, home, `stays on (10,7) — not ${at}`);
  assert.ok(h.b.onOwnBoard(u.player, 10, 7) && !h.b.onOwnBoard(u.player, 10, 13), 'cols 11+ are not his board');
  assert.equal(h.b.allyUnits.filter((a) => a.kind === 'token' && a.alive).length, 0, 'no 从不混淆的方向: nothing to return from');
});

test('one-helper 联防: an enemy on his half still draws the anchor and he moves next to it (own board)', () => {
  const { at } = cast({ tile: [10, 4], enemy: [10, 8] });
  assert.deepEqual(at, [10, 8], 'he moves onto the anchor tile on his half');
});

test('two-helper 联防: the left helper never lands on the right helper\'s half; the right helper moves on its own half', () => {
  const left = cast({ stageId: 'act1autochess_escaped_multi', tile: [10, 7] });
  assert.deepEqual(left.at, left.home, `left helper stays (${left.at})`);
  // the right-hand helper (colOffset 8): board col 3 → field col 11, enemy 3 tiles ahead on its own half
  const right = cast({ stageId: 'act1autochess_escaped_multi', tile: [10, 3], colOffset: 8, enemy: [10, 14] });
  assert.deepEqual(right.home, [10, 11]);
  assert.deepEqual(right.at, [10, 14], 'moves on its own half');
  assert.ok(right.h.b.onOwnBoard(right.u.player, 10, 14) && !right.h.b.onOwnBoard(right.u.player, 10, 7));
});

test('a normal battle is unchanged: the anchor stops at the field edge and he moves onto the farthest tile of his board', () => {
  const { at, h, u } = cast({ kind: 'normal', stageId: 'flat', tile: [10, 3] });
  assert.deepEqual(at, [10, 9], `6 tiles ahead, the last road tile before the gate column (${at})`);
  assert.ok(h.b.onOwnBoard(u.player, 10, 9));
});
