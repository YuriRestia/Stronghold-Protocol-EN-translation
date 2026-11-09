// test/regions-direct.test.js — (fork) a region's own socket host (SP_REGION_SOCKETS, server/regions.js): the operator's
// setting, the page's connect-src, /healthz, and the link between the servers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { regionConfigFrom, regionConnectSources, regionsReport, parseRegionSockets, peerHostOf } from '../server/regions.js';
import { PeerLink } from '../server/peerLink.js';
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
