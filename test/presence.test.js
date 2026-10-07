// test/presence.test.js — sys.online (server/presence.js): the online count and the 搜寻队友 queue per difficulty.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { S2C } from '../shared/protocol.js';
import { TestClient } from './helpers/wsClient.js';
import { queuedOthers } from '../public/js/ui/presence.js';

const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };

describe('sys.online', () => {
  let srv;
  const open = new Set();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.id = (await c.hello(name)).playerId;
    return c;
  };
  // partialMergeAfterMs 0: two lone searchers never merge, so they stay in the queue
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, noticeFile: null, MatchClass: StubMatch,
      presencePollMs: 30, matchTickMs: 30, partialMergeAfterMs: 0 });
  });
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
    await new Promise((r) => setTimeout(r, 80));
  });
  after(async () => { await srv?.close(); });

  test('is a documented server → client type', () => {
    assert.ok(S2C.includes('sys.online'));
  });

  test('a socket gets the count before its hello (the title screen), and again when it changes', async () => {
    const pre = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(pre);
    await pre.waitFor('sys.online', (m) => m.online === 1, 1000);
    await pre.terminate();
    open.delete(pre);
    await new Promise((r) => setTimeout(r, 80));
    const a = await player('A');
    const first = await a.waitFor('sys.online', (m) => m.online === 1, 1000);
    assert.deepEqual(first.searching, {});
    await player('B');
    await a.waitFor('sys.online', (m) => m.online === 2, 1000);
  });

  test('searching rooms count their humans per difficulty; a paused room does not', async () => {
    const h1 = await player('H1');
    const g1 = await player('G1');
    const h2 = await player('H2');
    await ok(h1, { t: 'room.create', mode: 'coop', difficulty: 'HARD' });
    const { code } = await h1.waitFor('room.state', (s) => s.hostId === h1.id);
    await ok(g1, { t: 'room.join', code });
    await ok(g1, { t: 'room.ready', ready: true });
    await h1.waitFor('room.state', (s) => s.seats.some((x) => x && x.playerId === g1.id && x.ready));
    await ok(h1, { t: 'room.search', on: true });
    await ok(h2, { t: 'room.create', mode: 'coop', difficulty: 'ABYSS' });
    await h2.waitFor('room.state', (s) => s.hostId === h2.id);
    await ok(h2, { t: 'room.search', on: true });
    await h2.waitFor('sys.online', (m) => m.searching.HARD === 2 && m.searching.ABYSS === 1, 1000);
    // un-ready pauses the HARD room: it leaves the queue
    await ok(g1, { t: 'room.ready', ready: false });
    await h2.waitFor('sys.online', (m) => !m.searching.HARD && m.searching.ABYSS === 1, 1000);
  });

  test('queuedOthers subtracts the viewer\'s own room and never goes negative', () => {
    assert.equal(queuedOthers({ HARD: 5 }, 'HARD', 2), 3);
    assert.equal(queuedOthers({ HARD: 5 }, 'NORMAL'), 0);
    assert.equal(queuedOthers({ HARD: 1 }, 'HARD', 2), 0);
    assert.equal(queuedOthers(undefined, 'HARD'), 0);
  });

  test('ui/presence.js passes t() params as an object', () => {
    const src = readFileSync(new URL('../public/js/ui/presence.js', import.meta.url), 'utf8');
    assert.deepEqual([...src.matchAll(/\bt\('[^']*\{[^}]+\}[^']*',\s*([^{\s][^)]*)\)/g)].map((m) => m[0]), []);
  });
});
