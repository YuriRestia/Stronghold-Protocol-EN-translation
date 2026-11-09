// test/ui/regions-direct.test.js — (fork) a region's own socket host in the page (public/js/regions.js): the socket and
// the ping test go there, and a browser that cannot reach it falls back to the region's host.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createRegions, parseConfig, DIRECT_CONNECT_MS, DIRECT_RETRY_MS, FALLBACK_ATTEMPTS_FIRST, RECHECK_MS } from '../../public/js/regions.js';

const CONFIG = {
  self: 'sg', auto: true,
  list: [{ id: 'sg', host: 'example.com', socket: 'sg.example.com' }, { id: 'us', host: 'us.example.com' }],
};
const DIRECT = 'wss://sg.example.com/ws';
const VIA_HOST = 'wss://example.com/ws';

function memory() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

class FakeNet {
  constructor(url = null, answer = null) { this.url = url; this.answer = answer; this.switched = 0; this.listeners = new Map(); this.attempt = 0; }
  on(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t).add(fn); }
  off(t, fn) { this.listeners.get(t)?.delete(fn); }
  emit(t, m) { for (const fn of [...(this.listeners.get(t) || [])]) fn(m); }
  setName() {}
  close() { this.closed = true; }
  async request(t, f) { if (this.answer) return this.answer(this, t, f); return { t: 'ok' }; }
  switchServer() { this.switched++; this.onSwitch?.(); }
}
const err = (code) => Object.assign(new Error(code), { code });

/** Timers that run only when the test says so. */
function clock() {
  let t = 1_000_000;
  const timers = new Map();
  let next = 1;
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const id = next++; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    advance(ms) {
      t += ms;
      for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.fn(); }
    },
  };
}

/** A ping socket: answers pongs, unless its host is in `blocked` (then it errors at once). Counts what it was asked. */
function pingSockets(blocked = new Set()) {
  const asked = [];
  class WS {
    constructor(url) {
      asked.push(url);
      queueMicrotask(() => ([...blocked].some((b) => url.includes(b)) ? this.onerror?.() : this.onopen?.()));
    }
    send(text) { const { c } = JSON.parse(text); queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ t: 'pong', c }) })); }
    close() {}
  }
  return { WS, asked, blocked };
}
const settle = () => new Promise((done) => setTimeout(done, 0));

function setup({ remoteAnswer = null, WebSocket = pingSockets(new Set(['example.com'])).WS, busy = () => false } = {}) {
  const c = clock();
  const local = memory();
  const net = new FakeNet();
  const probes = [];
  const identity = { t: null, getToken() { return this.t; }, clearToken() { this.t = null; }, saveToken(x) { this.t = x; }, loadName: () => 'Doc' };
  const regions = createRegions({
    net, identity, local, session: memory(), search: '',
    socketPath: () => '/ws', secure: () => true,
    makeNet: (url) => {
      const p = new FakeNet(url, remoteAnswer);
      const req = p.request.bind(p);
      p.request = async (t, f) => { const r = await req(t, f); p.emit('welcome', { token: 'new-token' }); return r; };
      probes.push(p);
      return p;
    },
    makeError: (code) => err(code),
    now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
    WebSocket, busy,
  });
  net.onSwitch = () => regions.getUrl();
  regions.onHealth({ regions: CONFIG });
  return { regions, net, local, clock: c, probes, identity };
}

describe('a region\'s socket host', () => {
  test('a region with a socket host is reached there; one without keeps its host, as before', () => {
    const { regions } = setup();
    assert.equal(regions.getUrl(), DIRECT);
    assert.equal(regions.snapshot().route, 'direct');
    assert.deepEqual(parseConfig({ self: 'sg', list: [{ id: 'sg', host: 'a.example' }, { id: 'us', host: 'b.example' }] }).list,
      [{ id: 'sg', host: 'a.example' }, { id: 'us', host: 'b.example' }]);
    // a socket host that is no host, or the region's own, is left out
    assert.deepEqual(parseConfig({ self: 'sg', list: [{ id: 'sg', host: 'a.example', socket: 'not a host' }, { id: 'us', host: 'b.example', socket: 'b.example' }] }).list,
      [{ id: 'sg', host: 'a.example' }, { id: 'us', host: 'b.example' }]);
  });

  test('no welcome from the socket host in time: the browser uses the region\'s host, for a while', () => {
    const { regions, net, clock: c } = setup();
    assert.equal(regions.getUrl(), DIRECT);
    c.advance(DIRECT_CONNECT_MS - 1);
    assert.equal(net.switched, 0);
    c.advance(1);
    assert.equal(net.switched, 1);
    assert.equal(regions.getUrl(), VIA_HOST);
    assert.equal(regions.snapshot().route, 'host');
    c.advance(DIRECT_RETRY_MS);
    assert.equal(regions.getUrl(), DIRECT, 'tried again later');
  });

  test('a socket host that refuses outright falls back before the region is given up', () => {
    const { regions, net } = setup();
    regions.getUrl();
    regions.onStatus({ status: 'reconnecting', attempt: FALLBACK_ATTEMPTS_FIRST - 1 });
    assert.equal(net.switched, 0);
    regions.onStatus({ status: 'reconnecting', attempt: FALLBACK_ATTEMPTS_FIRST });
    assert.equal(net.switched, 1);
    assert.equal(regions.getUrl(), VIA_HOST);
  });

  test('once the socket host welcomed this page, a later outage there is not a blocked route', () => {
    const { regions, net, clock: c } = setup();
    regions.getUrl();
    regions.onWelcome({ token: 't1' });
    c.advance(DIRECT_CONNECT_MS * 2);
    regions.onStatus({ status: 'reconnecting', attempt: 10 });
    assert.equal(net.switched, 0);
    assert.equal(regions.getUrl(), DIRECT);
  });
});

describe('the ping test and joins on another region', () => {
  test('the ping goes to the socket host; no answer there but one on the host switches to it', async () => {
    const asked = [];
    class WS {
      constructor(url) {
        asked.push(url);
        this.url = url;
        queueMicrotask(() => (url === DIRECT ? this.onerror?.() : this.onopen?.()));
      }
      send(text) { const { c } = JSON.parse(text); queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ t: 'pong', c }) })); }
      close() {}
    }
    const { regions } = setup({ WebSocket: WS });
    const rtts = await regions.measure();
    assert.ok(asked.includes(DIRECT) && asked.includes(VIA_HOST), asked.join(' '));
    assert.ok(Number.isFinite(rtts.sg));
    assert.equal(regions.getUrl(), VIA_HOST);
  });

  test('a join on another region whose socket host cannot be reached retries on its host once', async () => {
    const cfg = { ...CONFIG, list: [{ id: 'sg', host: 'example.com' }, { id: 'us', host: 'us.example.com', socket: 'us-socket.example.com' }] };
    const remoteAnswer = (p) => { if (p.url.includes('us-socket')) throw err('TIMEOUT'); return { t: 'ok' }; };
    const { regions, probes, net } = setup({ remoteAnswer });
    regions.onHealth({ regions: cfg });
    regions.getUrl();
    net.onSwitch = () => { regions.getUrl(); net.emit('welcome', { token: 'new-token' }); };
    await regions.join('room.join', { code: 'NXYZ' });
    assert.deepEqual(probes.map((p) => p.url), ['wss://us-socket.example.com/ws', 'wss://us.example.com/ws']);
    assert.equal(regions.getUrl(), 'wss://us.example.com/ws');
  });
});

describe('a browser that fell back tries the socket host again', () => {
  /** Fall back through the watch, with the socket host blocked for the ping too. */
  async function fallen(opts = {}) {
    const ping = pingSockets(new Set(['sg.example.com']));
    const t = setup({ WebSocket: ping.WS, ...opts });
    await t.regions.measure(); // the page's first ping test, done before anything is counted
    t.regions.getUrl();
    t.clock.advance(DIRECT_CONNECT_MS);
    assert.equal(t.regions.getUrl(), VIA_HOST);
    return { ...t, ping };
  }

  test('once the socket host answers again, the next background check moves the socket back', async () => {
    const { regions, net, clock: c, ping, local } = await fallen();
    const switched = net.switched;
    ping.blocked.clear();
    c.advance(RECHECK_MS);
    await settle();
    assert.equal(net.switched, switched + 1, 'moved back at once, outside a room');
    assert.equal(regions.getUrl(), DIRECT);
    assert.equal(local.getItem('sp.regionRoute'), null);
  });

  test('while it is still blocked, nothing changes and it is checked again later', async () => {
    const { regions, net, clock: c, ping } = await fallen();
    const switched = net.switched;
    const before = ping.asked.length;
    c.advance(RECHECK_MS);
    await settle();
    assert.equal(ping.asked.length, before + 1, 'one background ping');
    assert.equal(net.switched, switched);
    assert.equal(regions.getUrl(), VIA_HOST);
    c.advance(RECHECK_MS);
    await settle();
    assert.equal(ping.asked.length, before + 2, 'and again ten minutes later');
  });

  test('never in a room or a match: no ping, no move', async () => {
    let inRoom = false;
    const { regions, net, clock: c, ping } = await fallen({ busy: () => inRoom });
    inRoom = true;
    ping.blocked.clear();
    const before = ping.asked.length;
    const switched = net.switched;
    c.advance(RECHECK_MS);
    await settle();
    assert.equal(ping.asked.length, before);
    assert.equal(net.switched, switched);
    assert.equal(regions.getUrl(), VIA_HOST);
  });

  test('a page load of a browser that fell back checks at once', async () => {
    const { regions, ping, local } = await fallen();
    ping.blocked.clear();
    regions.onHealth({ regions: CONFIG });
    await settle();
    assert.equal(local.getItem('sp.regionRoute'), null);
    assert.equal(regions.getUrl(), DIRECT);
  });
});
