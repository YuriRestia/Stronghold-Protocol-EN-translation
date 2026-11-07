// Browser E2E of several servers, one game (DESIGN §8.7, §90.2): two real server processes and headless Chrome. The page
// always comes from the first server; only the socket moves.
// Opt-in: SP_E2E=1 node --test test/ui/regions.e2e.test.js
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { Client, startRealServer, freePort, hasChrome, sleep, problemsOf } from '../e2e/client.mjs';
import { TestClient } from '../helpers/wsClient.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();
const SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
const US_LETTERS = 'NPQRSTUVWXYZ';

/** What a page knows about its socket. */
const socketOf = (c) => c.page.evaluate(() => {
  const s = globalThis.__SP__.store.get();
  return { region: s.region?.current ?? null, home: s.region?.home ?? null, code: s.room?.code ?? null, inMatch: !!s.room?.inMatch, status: s.connection.status, host: location.host,
    seats: s.room ? s.room.seats.filter((x) => x && !x.isBot).length : 0 };
});
/** As the room screen's leave button does: ask, then drop the room locally. */
const leave = (c) => c.page.evaluate(async () => {
  const { net, store } = globalThis.__SP__;
  await net.request('room.leave', {});
  store.set({ room: null });
});
const until = async (c, pred, what, timeout = 30000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await socketOf(c);
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(s)}`);
    await sleep(150);
  }
};

describe('two servers, real browsers', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome)' }, () => {
  let puppeteer;
  let sg;
  let us;
  const clients = [];
  const sockets = [];
  const browser = async (label, query) => {
    const c = new Client(puppeteer, sg.base, label);
    await c.open(query);
    clients.push(c);
    return c;
  };

  before(async () => {
    puppeteer = (await import('puppeteer-core')).default;
    const [sgPort, usPort] = [await freePort(), await freePort()];
    const env = {
      SP_REGIONS: `sg=127.0.0.1:${sgPort},us=127.0.0.1:${usPort}`, SP_REGION_AUTO: '1', SP_CROSS_MATCH: '1', SP_PEER_SECRET: SECRET,
      SP_CROSS_AFTER_MS: '0', SP_ASSET_INDEX: '0',
    };
    sg = await startRealServer({ port: sgPort, env: { ...env, SP_REGION: 'sg' } });
    us = await startRealServer({ port: usPort, env: { ...env, SP_REGION: 'us' } });
  });
  after(async () => {
    await Promise.all(clients.map((c) => c.close().catch(() => {})));
    await Promise.all(sockets.map((c) => c.terminate().catch(() => {})));
    await Promise.all([sg?.stop(), us?.stop()]);
  });

  test('a tab that asks for the US server makes its room there, keeps the page on the main domain, and comes back after a reload', async () => {
    const host = await browser('host', '?region=us');
    await host.enter('UsHost');
    await until(host, (s) => s.region === 'us' && s.status === 'online', 'the socket on the US server');
    await host.createCoop();
    const { code, host: pageHost } = await until(host, (s) => !!s.code, 'a room');
    assert.ok(US_LETTERS.includes(code[0]), `${code} is a US key`);
    assert.equal(pageHost, new URL(sg.base).host, 'the page stays on the first server');

    await host.page.reload({ waitUntil: 'domcontentloaded' });
    await host.page.waitForFunction(() => !!globalThis.__SP__, { timeout: 30000 });
    const back = await until(host, (s) => s.code === code && s.status === 'online', 'the same room after a reload');
    assert.equal(back.region, 'us');
  });

  test('a player at home on Singapore opens an invite link to that room and joins across', async () => {
    const host = clients[0];
    const { code } = await socketOf(host);
    const friend = await browser('friend', `?room=${code}&region=sg`); // on one machine the ping test has no real answer
    await friend.enter('SgFriend');
    const joined = await until(friend, (s) => s.code === code, 'the friend in the US room');
    assert.equal(joined.region, 'us');
    await until(host, (s) => s.seats === 2, 'the host seeing the friend');

    // the setting is offered, and the ping names the server
    const named = await friend.page.$eval('[data-testid="ping-region"]', (el) => el.textContent).catch(() => null);
    assert.ok(named, 'the server name beside the ping');

    // leaving goes home: a new room is made on the player's own server
    await leave(friend);
    const home = await until(friend, (s) => !s.code && s.region === 'sg' && s.status === 'online', 'back on Singapore');
    assert.equal(home.home, 'sg');
    await friend.page.evaluate(() => globalThis.__SP__.net.request('room.create', { mode: 'coop', difficulty: 'NORMAL' }));
    const { code: mine } = await until(friend, (s) => !!s.code, 'a room at home');
    assert.ok(!US_LETTERS.includes(mine[0]), `${mine} is a Singapore key`);
    await leave(friend);
    await until(friend, (s) => !s.code, 'out of it');
  });

  test('a key that does not exist anywhere says so and changes nothing', async () => {
    const friend = clients[1];
    const answer = await friend.page.evaluate(() => globalThis.__SP__.regions.join('room.join', { code: 'ZZZZ' }).then(() => 'joined', (e) => e.code));
    assert.equal(answer, 'ROOM_NOT_FOUND');
    assert.equal((await socketOf(friend)).region, 'sg');
  });

  test('a queued Doctor on Singapore is matched with a US room: the browser moves and the match starts', async () => {
    const url = `ws://127.0.0.1:${us.port}/ws`;
    const members = [];
    for (let i = 0; i < 3; i++) {
      const c = await TestClient.connect(url);
      sockets.push(c);
      const w = await c.hello(`Us${i}`);
      c.id = w.playerId;
      members.push(c);
    }
    assert.equal((await members[0].request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' })).t, 'ok');
    const { code } = await members[0].waitFor('room.state', (s) => s.hostId === members[0].id);
    for (const c of members.slice(1)) {
      assert.equal((await c.request({ t: 'room.join', code })).t, 'ok');
      assert.equal((await c.request({ t: 'room.ready', ready: true })).t, 'ok');
    }
    assert.equal((await members[0].request({ t: 'room.search', on: true })).t, 'ok');

    const solo = clients[1];
    await solo.page.evaluate(() => globalThis.__SP__.net.request('queue.join', { difficulty: 'NORMAL' }));
    const placed = await until(solo, (s) => s.code === code && s.inMatch, 'the match on the US server', 45000);
    assert.equal(placed.region, 'us');
    assert.equal(placed.seats, 4);
    await members[0].waitFor('room.state', (s) => s.inMatch === true);
  });

  test('when the US server dies, a page falls back to Singapore and can play on', async () => {
    const lone = await browser('lone', '?region=us');
    await lone.enter('Lone');
    await until(lone, (s) => s.region === 'us' && s.status === 'online', 'on the US server');
    await us.stop({ hard: true });
    const fell = await until(lone, (s) => s.region === 'sg' && s.status === 'online', 'back on Singapore', 60000);
    assert.equal(fell.host, new URL(sg.base).host);
    await lone.page.evaluate(() => globalThis.__SP__.net.request('room.create', { mode: 'coop', difficulty: 'NORMAL' }));
    await until(lone, (s) => !!s.code, 'a room on Singapore');
  });

  test('nothing went wrong in any page: no refused connection (CSP), no script error', () => {
    const bad = problemsOf(clients).filter((p) => !/ERR_CONNECTION_REFUSED|WebSocket connection|healthz/.test(p));
    assert.deepEqual(bad, []);
  });
});
