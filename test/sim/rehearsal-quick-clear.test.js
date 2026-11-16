// test/sim/rehearsal-quick-clear.test.js — GitHub #117: a rehearsal breaks its last tie by the quicker clear
// (server/sim/rehearsal.js quickClear, QUICK_CLEAR), worth less than one kill; leaks, leader damage and the stacks
// gained still rank first, so a board that stalls for stacks is still picked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RehearsalScore, quickClear, QUICK_CLEAR } from '../../server/sim/rehearsal.js';

const fake = ({ time = 30, reason = 'cleared', killed = 10, leaks = 0, gain = 0, timeLimit = 60 } = {}) => ({
  kind: 'normal', timeLimit,
  result: () => ({ reason, time, perPlayer: { p: { killed, leaked: Array.from({ length: leaks }, () => ({ counted: true })), layerGains: gain ? { x: gain } : {} } } }),
});
const pick = (...battles) => { const s = new RehearsalScore('p'); battles.forEach((b, i) => s.note(b, i)); return s.index; };

test('quickClear: the unused share of the limit, only for a clear', () => {
  assert.equal(quickClear(fake(), fake().result()), QUICK_CLEAR * 0.5);
  assert.equal(quickClear(fake({ reason: 'timeout' }), fake({ reason: 'timeout' }).result()), 0);
  assert.equal(quickClear(fake({ time: 90 }), fake({ time: 90 }).result()), 0);
  assert.ok(QUICK_CLEAR < 1, 'less than one kill');
});

test('equal boards: the quicker clear wins, also from a later position', () => {
  assert.equal(pick(fake({ time: 50 }), fake({ time: 20 })), 1);
  assert.equal(pick(fake({ time: 20 }), fake({ time: 50 })), 0);
  assert.equal(pick(fake({ time: 30 }), fake({ time: 30 })), 0, 'a tie keeps the first');
  assert.equal(pick(fake({ time: 59, reason: 'timeout' }), fake({ time: 58 })), 1);
});

test('stacks, kills and leaks still outrank speed', () => {
  assert.equal(pick(fake({ time: 55, gain: 3 }), fake({ time: 10 })), 0, 'a stalling board that gains stacks');
  assert.equal(pick(fake({ time: 55, killed: 11 }), fake({ time: 5, killed: 10 })), 0);
  assert.equal(pick(fake({ time: 31 }), fake({ time: 30 })), 0, 'a second is less than the candidate order\'s step');
  assert.equal(pick(fake({ time: 55 }), fake({ time: 5, leaks: 1 })), 0);
});
