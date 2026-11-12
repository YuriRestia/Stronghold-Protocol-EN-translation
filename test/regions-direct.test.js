// test/regions-direct.test.js — (fork) a region's own socket host (SP_REGION_SOCKETS, server/regions.js): the operator's
// setting, the page's connect-src, /healthz, and the link between the servers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { regionConfigFrom, regionConnectSources, regionsReport, parseRegionSockets, peerHostOf } from '../server/regions.js';
import { PeerLink, FALLBACK_AFTER_FAILS, DIRECT_RETRY_MS, BACKOFF_MAX_MS } from '../server/peerLink.js';
import { siteCsp } from '../server/http/csp.js';

const SECRET = 'x'.repeat(40);
const BASE = { SP_REGIONS: 'sg=example.com,us=us.example.com', SP_PEER_SECRET: SECRET };

describe('the operator\'s socket hosts', () => {
  test('without SP_REGION_SOCKETS nothing changes: no socket in the list, the same connect-src and peer host', () => {
    const c = regionConfigFrom({ ...BASE, SP_REGION: 'sg' });
    assert.deepEqual(c.list, [{ id: 'sg', host: 'example.com' }, { id: 'us', host: 'us.example.com' }]);
    assert.deepEqual(regionConnectSources(c), ['wss://us.example.com']);
    assert.equal(peerHostOf(c, 'sg'), 'example.com');
  });

  test('a listed region gets its socket host; an unknown region, a bad host or its own host is ignored', () => {
    const warned = [];
    const list = [{ id: 'sg', host: 'a.example' }, { id: 'us', host: 'b.example' }];
    const got = parseRegionSockets('sg=direct.a.example, eu=c.example, us=b.example, us=bad host', list, { warn: (t) => warned.push(t) });
    assert.deepEqual(got, { sg: 'direct.a.example' });
    assert.equal(warned.length, 3);
    assert.deepEqual(parseRegionSockets(undefined, list), {});
  });

  test('the page may reach every socket host, its own region\'s included, and /healthz tells the page about them', () => {
    const c = regionConfigFrom({ ...BASE, SP_REGION: 'sg', SP_REGION_SOCKETS: 'sg=sg.example.com' });
    assert.deepEqual(c.list[0], { id: 'sg', host: 'example.com', socket: 'sg.example.com' });
    const sources = regionConnectSources(c);
    assert.deepEqual(sources, ['wss://sg.example.com', 'wss://us.example.com']);
    assert.match(siteCsp('public', { connectSources: sources }), /connect-src 'self' wss:\/\/sg\.example\.com wss:\/\/us\.example\.com/);
    const report = regionsReport(c);
    assert.equal(report.list[0].socket, 'sg.example.com');
    assert.equal(JSON.stringify(report).includes(SECRET), false);
  });

  test('a local socket host is plain ws', () => {
    const c = regionConfigFrom({ SP_REGIONS: 'sg=127.0.0.1:3001,us=127.0.0.1:3002', SP_REGION: 'sg', SP_REGION_SOCKETS: 'sg=localhost:3001' });
    assert.deepEqual(regionConnectSources(c), ['ws://localhost:3001', 'ws://127.0.0.1:3002']);
  });
});

describe('the link between the servers', () => {
  async function postedTo(env) {
    const config = regionConfigFrom(env);
    const urls = [];
    const fetch = async (url) => { urls.push(url); return { ok: true, json: async () => ({ region: 'sg', cmds: [] }) }; };
    const link = new PeerLink({ config, network: { connectionCount: 0 }, lobby: {}, fetch, pollMs: 60_000 });
    await link.poll();
    return urls;
  }

  test('posts to the arbiter\'s socket host when it has one, else to its host', async () => {
    assert.deepEqual(await postedTo({ ...BASE, SP_REGION: 'us', SP_REGION_SOCKETS: 'sg=sg.example.com' }), ['https://sg.example.com/_peer/sync']);
    assert.deepEqual(await postedTo({ ...BASE, SP_REGION: 'us' }), ['https://example.com/_peer/sync']);
  });
});

// (fork) the link's fallback: the direct socket host first, the arbiter's own host (through Cloudflare) while it fails
describe('the link falls back to the arbiter\'s own host', () => {
  const DIRECT = 'https://sg.example.com/_peer/sync';
  const OWN = 'https://example.com/_peer/sync';
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

  function setup({ sockets = 'sg=sg.example.com' } = {}) {
    const config = regionConfigFrom({ ...BASE, SP_REGION: 'us', ...(sockets ? { SP_REGION_SOCKETS: sockets } : {}) });
    const before = structuredClone(config);
    const down = new Set([DIRECT]);
    const urls = [];
    const logs = [];
    let now = 1_000_000;
    const fetch = async (url) => {
      urls.push(url);
      if (down.has(url)) throw new Error('The operation was aborted due to timeout');
      return { ok: true, json: async () => ({ region: 'sg', gen: null, cmds: [] }) };
    };
    const log = { info: (t) => logs.push(t), warn: (t) => logs.push(t), error: (t) => logs.push(t) };
    const link = new PeerLink({ config, network: { connectionCount: 0 }, lobby: {}, fetch, log, now: () => now, pollMs: 60_000 });
    return { config, before, down, urls, logs, link, advance: (ms) => { now += ms; } };
  }

  test(`after ${FALLBACK_AFTER_FAILS} failed direct posts it posts through the arbiter's host at once, and says so once`, async () => {
    const s = setup();
    s.link.start(); // the first post
    await flush();
    await s.link.poll();
    await s.link.poll(); // the third failure switches and posts again at once
    await flush();
    s.link.stop();
    assert.deepEqual(s.urls, [DIRECT, DIRECT, DIRECT, OWN]);
    assert.equal(s.logs.filter((l) => l.includes('posting through example.com')).length, 1);
    assert.equal(s.logs.filter((l) => l.includes('link to the arbiter failed')).length, 1);
    assert.equal(s.logs.filter((l) => l.includes('link to the arbiter is back')).length, 1);
    const r = s.link.report();
    assert.equal(r.up, true);
    assert.equal(r.fallback, true);
    assert.equal(JSON.stringify(r).includes('example.com'), false, '/healthz names no address');
    await s.link.poll();
    assert.deepEqual(s.urls.slice(4), [OWN], 'stays on the fallback');
    assert.equal(s.logs.filter((l) => l.includes('posting through')).length, 1, 'no line per post');
  });

  test(`on the fallback it tries the direct host every ${DIRECT_RETRY_MS / 60_000} min, quietly, and stays while that fails`, async () => {
    const s = setup();
    for (let i = 0; i < 4; i++) await s.link.poll();
    assert.deepEqual(s.urls, [DIRECT, DIRECT, DIRECT, OWN]);
    const logged = s.logs.length;
    s.advance(DIRECT_RETRY_MS - 1);
    await s.link.poll();
    assert.equal(s.urls.at(-1), OWN, 'not yet');
    s.advance(1);
    await s.link.poll();
    assert.equal(s.urls.at(-1), DIRECT, 'the direct try');
    await s.link.poll();
    await s.link.poll();
    assert.deepEqual(s.urls.slice(-2), [OWN, OWN], 'back on the fallback for another 5 min');
    assert.equal(s.logs.length, logged, 'a failed direct try logs nothing');
    assert.equal(s.link.report().fallback, true);
  });

  test('once the direct host answers again it goes back to it and says so once', async () => {
    const s = setup();
    for (let i = 0; i < 4; i++) await s.link.poll();
    s.down.clear();
    s.advance(DIRECT_RETRY_MS);
    await s.link.poll();
    await s.link.poll();
    assert.deepEqual(s.urls.slice(-2), [DIRECT, DIRECT]);
    assert.equal(s.link.report().fallback, undefined);
    assert.equal(s.logs.filter((l) => l.includes('works again')).length, 1);
    // a later outage starts the count afresh
    s.down.add(DIRECT);
    for (let i = 0; i < 4; i++) await s.link.poll();
    assert.deepEqual(s.urls.slice(-4), [DIRECT, DIRECT, DIRECT, OWN]);
  });

  test('players keep the direct host: the fallback changes nothing they read', async () => {
    const s = setup();
    const sources = regionConnectSources(s.config);
    const report = JSON.stringify(regionsReport(s.config));
    for (let i = 0; i < 4; i++) await s.link.poll();
    assert.equal(s.link.report().fallback, true);
    assert.deepEqual(s.config, s.before, 'the region list the server hands out is untouched');
    assert.equal(peerHostOf(s.config, 'sg'), 'sg.example.com');
    assert.deepEqual(regionConnectSources(s.config), sources, 'the page may still reach the socket hosts');
    assert.equal(JSON.stringify(regionsReport(s.config)), report, '/healthz still sends browsers to sg.example.com');
    assert.equal(regionsReport(s.config).list[0].socket, 'sg.example.com');
  });

  test('without a socket host there is nothing to fall back to: every post goes to the host', async () => {
    const s = setup({ sockets: null });
    s.down.add(OWN);
    for (let i = 0; i < 6; i++) await s.link.poll();
    assert.deepEqual(s.urls, Array(6).fill(OWN));
    assert.equal(s.link.report().fallback, undefined);
  });

  test(`while posts keep failing they slow down from 2 s to ${BACKOFF_MAX_MS / 1000} s, and speed up once one gets through`, async () => {
    const s = setup({ sockets: null });
    s.down.add(OWN);
    s.link.pollMs = 2000;
    for (let t = 0; t <= 60_000; t += 2000) {
      s.link.tick();
      await flush();
      s.advance(2000);
    }
    // posts at 0, 2, 4, 6 s, then after 4, 8, 16 and 30 s: 10, 18, 34 (64 is past the minute)
    assert.equal(s.urls.length, 7);
    s.down.clear();
    s.advance(30_000);
    s.link.tick();
    await flush();
    s.link.tick();
    await flush();
    assert.equal(s.urls.length, 9, 'back to every tick');
  });
});
