// test/rejected-frames-log.test.js — (fork) live report 2026-11-13 (room FKCJ): every browser's 联防 answer failed
// validateC2S and the server logged nothing, so 4 minutes of "did not answer" looked like silent browsers. A refused frame of
// a match member is now logged: one line per message type, at most REJECTED_LOG_MAX per match, then one "more suppressed".
// Run: node --test test/rejected-frames-log.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Network, SessionRegistry } from '../server/net.js';
import { Lobby, REJECTED_LOG_MAX } from '../server/lobby.js';

const bigLeft = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p_${i}`, 1]));

test('net: a frame validateC2S refuses still gets BAD_MSG and is handed to handler.onRejected', (t) => {
  const seen = [];
  const handler = { onMessage() {}, onRejected: (session, type, reason) => seen.push([session.playerId, type, reason]) };
  const server = new Network({ registry: new SessionRegistry(), handler });
  t.after(() => { clearInterval(server.heartbeatTimer); clearInterval(server.sweepTimer); });
  const sent = [];
  const ws = { readyState: 1, bufferedAmount: 0, send: (raw) => sent.push(JSON.parse(raw)), close() {} };
  const conn = { closing: false, alive: false, ws, bucket: { take: () => true }, heavy: { take: () => true }, dropWindowAt: 0, drops: 0, ip: '?',
    session: { playerId: 'p_1', ws, lastSeen: 0 } };
  const frame = { t: 'b.progress', battleId: 'bt_1', gt: 1, killed: 0, total: 9, left: bigLeft, rid: 1 };
  server.onFrame(conn, Buffer.from(JSON.stringify(frame)), false);
  assert.equal(sent.at(-1)?.t, 'error');
  assert.deepEqual(seen.map(([p, ty]) => [p, ty]), [['p_1', 'b.progress']]);
  assert.ok(typeof seen[0][2] === 'string' && seen[0][2].length > 0, 'the reason names the field');
});

/** Lobby.onRejected on a bare lobby shape: a room with a running match, the log captured. */
function lobbyShape() {
  const warn = [];
  const match = {};
  const room = { code: 'FKCJ', disposed: false, match };
  const self = { rooms: new Map([['FKCJ', room]]), _rejectedLog: new WeakMap(), log: { warn: (l) => warn.push(l) } };
  const reject = (t, pid = 'p_1', session = { playerId: pid, roomCode: 'FKCJ' }) => Lobby.prototype.onRejected.call(self, session, t, 'bad field timeline');
  return { warn, room, reject };
}

test('lobby: one line per message type per match, capped, then a single "more suppressed"', () => {
  const { warn, room, reject } = lobbyShape();
  reject('b.botBattleResult');
  reject('b.botBattleResult', 'p_2'); // the same type again: no new line
  assert.deepEqual(warn, ['[match FKCJ] rejected b.botBattleResult from p_1: bad field timeline']);
  for (let i = 0; i < REJECTED_LOG_MAX + 20; i++) reject(`t.${i}`);
  assert.equal(warn.length, REJECTED_LOG_MAX + 1, 'at most REJECTED_LOG_MAX lines, then one more');
  assert.equal(warn.at(-1), '[match FKCJ] rejected frames: more suppressed');
  // a new match in the same room starts over
  room.match = {};
  reject('b.botBattleResult');
  assert.equal(warn.length, REJECTED_LOG_MAX + 2);
});

test('lobby: nothing is logged outside a running match', () => {
  const { warn, room, reject } = lobbyShape();
  reject('b.progress', 'p_1', { playerId: 'p_1', roomCode: null });
  room.match = null;
  reject('b.progress');
  assert.deepEqual(warn, []);
});
