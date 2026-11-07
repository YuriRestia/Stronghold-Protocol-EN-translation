// test/ui/regions.test.js — (fork) which server a page's socket uses (public/js/regions.js, DESIGN §8.7), with a fake socket.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createRegions, pickRegion, parseConfig, K_PREF, FALLBACK_ATTEMPTS, FALLBACK_ATTEMPTS_FIRST, SETTLE_GRACE_MS } from '../../public/js/regions.js';
import { ERR } from '../../shared/constants.js';

const CONFIG = { self: 'sg', list: [{ id: 'sg', host: 'a.example' }, { id: 'us', host: 'b.example' }], auto: true };

function memory(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

class FakeNet {
  constructor({ answers = {} } = {}) { this.answers = answers; this.calls = []; this.switched = 0; this.listeners = new Map(); this.name = 'Doc'; }
  on(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t).add(fn); }
  off(t, fn) { this.listeners.get(t)?.delete(fn); }
  emit(t, m) { for (const fn of [...(this.listeners.get(t) || [])]) fn(m); }
  setName(n) { this.named = n; }
  close() { this.closed = true; }
  async request(t, f) {
    this.calls.push([t, f]);
    const a = this.answers[t];
    if (a instanceof Error) throw a;
    if (typeof a === 'function') return a(f, this);
    return { t: 'ok' };
  }
  switchServer() { this.switched++; this.onSwitch?.(); }
}
const err = (code) => Object.assign(new Error(code), { code });

function setup({ local = {}, session = {}, search = '', remote = {}, net: netAnswers = {}, token = null, busy = false, inMatch = false, now = () => Date.now() } = {}) {
  const net = new FakeNet({ answers: netAnswers });
  const probes = [];
  const identity = {
    t: token,
    getToken() { return this.t; },
    clearToken() { this.t = null; this.cleared = true; },
    saveToken(x) { this.t = x; },
    loadName: () => 'Doc',
  };
  const notes = [];
  const regions = createRegions({
    net, identity, local: memory(local), session: memory(session), search,
    socketPath: () => '/ws', secure: () => true,
    makeNet: (url) => {
      const p = new FakeNet({ answers: remote });
      p.url = url;
      const req = p.request.bind(p);
      p.request = async (t, f) => { p.emit('welcome', { token: 'new-token' }); return req(t, f); };
      probes.push(p);
      return p;
    },
    makeError: (code) => err(code),
    busy: () => busy,
    inMatch: () => inMatch,
    now,
    notify: (what, region) => notes.push([what, region]),
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
  });
  net.onSwitch = () => { regions.getUrl(); net.emit('welcome', { token: identity.t }); };
  return { regions, net, identity, probes, notes };
}
const withConfig = (opts = {}) => {
  const s = setup({ ...opts, local: { 'sp.regions': JSON.stringify(opts.config ?? CONFIG), ...(opts.local || {}) } });
  s.regions.getUrl();
  return s;
};

describe('choosing a region', () => {
  test('without regions the socket is the page\'s own, exactly as before', () => {
    const { regions } = setup();
    assert.equal(regions.getUrl(), null);
    assert.equal(regions.snapshot().enabled, false);
  });

  test('a /healthz body that is not a regions list counts as none', () => {
    for (const bad of [null, {}, { self: 'sg', list: [] }, { self: 'eu', list: CONFIG.list }, { self: 'sg', list: [{ id: 1 }, { id: 2 }] }]) assert.equal(parseConfig(bad), null);
    assert.equal(parseConfig(CONFIG).self, 'sg');
  });

  test('the ping test keeps the current region unless another clearly beats it', () => {
    assert.equal(pickRegion({ sg: 300, us: 20 }, 'sg'), 'us');
    assert.equal(pickRegion({ sg: 40, us: 25 }, 'sg'), 'sg', '15 ms is not enough to move');
    assert.equal(pickRegion({ sg: 45, us: 25 }, 'sg'), 'us');
    assert.equal(pickRegion({ sg: Infinity, us: 25 }, 'sg'), 'us', 'the old one no longer answers');
    assert.equal(pickRegion({ sg: 30, us: 40 }, null), 'sg');
    assert.equal(pickRegion({ sg: Infinity, us: Infinity }, null), null);
  });

  test('home: forced tab, then the setting, then the ping test, then the page\'s server', () => {
    const base = { local: { 'sp.regionBest': 'us' } };
    assert.equal(withConfig(base).regions.home(), 'us', 'best by ping');
    assert.equal(withConfig({ local: { 'sp.regionBest': 'us', [K_PREF]: 'sg' } }).regions.home(), 'sg', 'the setting wins');
    assert.equal(withConfig({ ...base, session: { 'sp.regionForce': 'sg' } }).regions.home(), 'sg', 'the tab wins');
    assert.equal(withConfig().regions.home(), 'sg');
  });

  test('with auto-pick off a browser stays on the page\'s server, except a tab that asks with ?region=', () => {
    const config = { ...CONFIG, auto: false };
    assert.equal(withConfig({ config, local: { 'sp.regionBest': 'us', [K_PREF]: 'us' } }).regions.home(), 'sg');
    assert.equal(withConfig({ config, search: '?region=us' }).regions.home(), 'us');
    assert.equal(withConfig({ config, search: '?region=auto', session: { 'sp.regionForce': 'us' } }).regions.home(), 'sg');
  });

  test('the socket URL follows home, and a token goes back to the server that issued it', () => {
    const { regions, identity } = withConfig({ local: { 'sp.regionBest': 'us' } });
    assert.equal(regions.getUrl(), 'wss://b.example/ws');
    identity.t = 'tok';
    regions.onWelcome({ token: 'tok' });
    const again = setup({ local: { 'sp.regions': JSON.stringify(CONFIG), 'sp.regionTokens': JSON.stringify({ tok: 'us' }) }, token: 'tok' });
    assert.equal(again.regions.getUrl(), 'wss://b.example/ws', 'a reload in a US room');
  });

  test('turning regions off on the server clears them here', () => {
    const { regions } = withConfig();
    regions.onHealth({ ok: true });
    assert.equal(regions.snapshot().enabled, false);
    assert.equal(regions.getUrl(), null);
  });
});

describe('joining by key', () => {
  test('a key of this server is a plain request', async () => {
    const { regions, net, probes } = withConfig();
    await regions.join('room.join', { code: 'ABCD' });
    assert.deepEqual(net.calls, [['room.join', { code: 'ABCD' }]]);
    assert.equal(probes.length, 0);
    assert.equal(net.switched, 0);
  });

  test('a key of the other server joins there first, then leaves here and moves the socket', async () => {
    const { regions, net, probes, identity } = withConfig({ busy: true });
    net.status = 'online';
    await regions.join('room.join', { code: 'NNNN' });
    assert.equal(probes[0].url, 'wss://b.example/ws');
    assert.deepEqual(probes[0].calls, [['room.join', { code: 'NNNN' }]]);
    assert.deepEqual(net.calls, [['room.leave', undefined]]);
    assert.equal(identity.t, 'new-token');
    assert.equal(net.switched, 1);
    assert.equal(regions.snapshot().current, 'us');
    assert.equal(probes[0].closed, true);
  });

  test('no room here, or a socket that is away: nothing to wait for', async () => {
    const free = withConfig();
    free.net.status = 'online';
    await free.regions.join('room.join', { code: 'NNNN' });
    assert.deepEqual(free.net.calls, []);
    const away = withConfig({ busy: true });
    away.net.status = 'reconnecting';
    await away.regions.join('room.join', { code: 'NNNN' });
    assert.deepEqual(away.net.calls, []);
    assert.equal(away.net.switched, 1);
  });

  test('a token from before the regions were known stays with the page\'s server', () => {
    const { regions, identity } = setup({ token: 'old', local: { 'sp.regionBest': 'us' } });
    assert.equal(regions.getUrl(), null);
    regions.onHealth({ regions: CONFIG });
    identity.t = 'old';
    assert.equal(regions.getUrl(), 'wss://a.example/ws', 'not the faster server: the seat is here');
  });

  test('a refused key costs nothing: no leave, no move, the reason is passed on', async () => {
    const { regions, net } = withConfig({ remote: { 'room.join': err(ERR.ROOM_FULL) } });
    await assert.rejects(regions.join('room.join', { code: 'NNNN' }), (e) => e.code === ERR.ROOM_FULL);
    assert.deepEqual(net.calls, []);
    assert.equal(net.switched, 0);
  });

  test('a room its key\'s server does not know gets one try on the others', async () => {
    const { regions, net } = withConfig({ remote: { 'room.join': err(ERR.ROOM_NOT_FOUND) } });
    await regions.join('room.join', { code: 'NNNN' });
    assert.deepEqual(net.calls, [['room.join', { code: 'NNNN' }]], 'found here after all');
    assert.equal(net.switched, 0);
  });

  test('a key found nowhere says so', async () => {
    const { regions } = withConfig({ remote: { 'room.join': err(ERR.ROOM_NOT_FOUND) }, net: { 'room.join': err(ERR.ROOM_NOT_FOUND) } });
    await assert.rejects(regions.join('room.join', { code: 'NNNN' }), (e) => e.code === ERR.ROOM_NOT_FOUND);
  });

  test('a server that cannot be reached is named as such', async () => {
    const { regions } = withConfig({ remote: { 'room.join': err('TIMEOUT') }, net: { 'room.join': err(ERR.ROOM_NOT_FOUND) } });
    await assert.rejects(regions.join('room.join', { code: 'NNNN' }), (e) => e.code === 'REGION_DOWN');
  });

  test('from inside a match another server\'s key is refused, as the server would', async () => {
    const { regions, probes } = withConfig({ inMatch: true });
    await assert.rejects(regions.join('room.join', { code: 'NNNN' }), (e) => e.code === ERR.ROOM_STARTED);
    assert.equal(probes.length, 0);
  });

  test('without regions a join is exactly net.request', async () => {
    const { regions, net } = setup();
    await regions.join('room.spectate', { code: 'NNNN', testAck: true });
    assert.deepEqual(net.calls, [['room.spectate', { code: 'NNNN', testAck: true }]]);
  });
});

describe('moves and failures', () => {
  test('room.move joins the target with the ticket', async () => {
    const { regions, probes, net } = withConfig();
    assert.equal(await regions.follow({ region: 'us', code: 'NNNN', ticket: 'tk' }), true);
    assert.deepEqual(probes[0].calls, [['room.join', { code: 'NNNN', ticket: 'tk' }]]);
    assert.equal(net.switched, 1);
  });

  test('a move that fails tells the player and stays home', async () => {
    const { regions, notes, net } = withConfig({ remote: { 'room.join': err(ERR.ROOM_FULL) } });
    assert.equal(await regions.follow({ region: 'us', code: 'NNNN', ticket: 'tk' }), false);
    assert.deepEqual(notes, [['move-failed', 'us']]);
    assert.equal(net.switched, 0);
  });

  test('another region that stays away: back to the page\'s server, sooner when it was never reached', () => {
    const { regions, net, notes } = withConfig({ local: { 'sp.regionBest': 'us' } });
    regions.onStatus({ status: 'reconnecting', attempt: FALLBACK_ATTEMPTS_FIRST - 1 });
    assert.equal(net.switched, 0);
    regions.onStatus({ status: 'reconnecting', attempt: FALLBACK_ATTEMPTS_FIRST });
    assert.equal(net.switched, 1);
    assert.deepEqual(notes, [['down', 'us']]);
    assert.equal(regions.home(), 'sg');
    assert.equal(regions.snapshot().current, 'sg');
  });

  test('a server restart gets its time once it has been reached', () => {
    const { regions, net } = withConfig({ local: { 'sp.regionBest': 'us' } });
    regions.onWelcome({ token: 't' });
    regions.onStatus({ status: 'reconnecting', attempt: FALLBACK_ATTEMPTS - 1 });
    assert.equal(net.switched, 0);
    regions.onStatus({ status: 'reconnecting', attempt: FALLBACK_ATTEMPTS });
    assert.equal(net.switched, 1);
  });

  test('a seat on that server is not given up over an outage: the page keeps trying', () => {
    const { regions, net, notes } = withConfig({ local: { 'sp.regionBest': 'us' }, busy: true });
    regions.onWelcome({ token: 't' });
    regions.onStatus({ status: 'reconnecting', attempt: FALLBACK_ATTEMPTS + 20 });
    assert.equal(net.switched, 0);
    assert.deepEqual(notes, []);
  });

  test('the page\'s own server is never given up', () => {
    const { regions, net } = withConfig();
    regions.onStatus({ status: 'reconnecting', attempt: 99 });
    assert.equal(net.switched, 0);
  });

  test('a tab that asks for a region before the regions are known moves as soon as they are', () => {
    const { regions, net } = setup({ search: '?region=us' });
    assert.equal(regions.getUrl(), null);
    regions.onHealth({ regions: CONFIG });
    assert.equal(net.switched, 1);
    assert.equal(regions.snapshot().current, 'us');
  });

  test('a token may hold a seat: nothing moves until its server has answered and resent no room', () => {
    let clock = 1000;
    const local = { 'sp.regions': JSON.stringify(CONFIG), 'sp.regionBest': 'us', 'sp.regionTokens': JSON.stringify({ tok: 'sg' }) };
    const { regions, net, identity } = setup({ local, token: 'tok', now: () => clock });
    assert.equal(regions.getUrl(), 'wss://a.example/ws', 'the token goes back to its own server');
    regions.onHealth({ regions: CONFIG });
    assert.equal(net.switched, 0, 'no answer yet: a reload in a room must not lose the seat');
    regions.onWelcome({ token: 'tok' });
    assert.equal(net.switched, 0, 'a resumed room may still be on its way');
    clock += SETTLE_GRACE_MS + 1;
    assert.equal(regions.settle(), true, 'no room came: home');
    assert.equal(net.switched, 1);
    assert.equal(identity.cleared, true);
  });

  test('settle goes home, but never out from under a room', () => {
    const away = withConfig({ local: { 'sp.regionBest': 'us' }, busy: true });
    assert.equal(away.regions.settle(), false);
    const free = withConfig({ session: { 'sp.regionForce': 'sg' }, local: { 'sp.regionBest': 'us' } });
    assert.equal(free.regions.settle(), false, 'already home');
  });
});

describe('the ping test', () => {
  class PingSocket {
    static delay = {};
    constructor(url) {
      this.url = url;
      setTimeout(() => this.onopen?.(), 0);
    }
    send() { this.onmessage?.({ data: JSON.stringify({ t: 'pong' }) }); }
    close() {}
  }

  test('it measures on sockets of its own, stores the pick, and sends no hello', async () => {
    let clock = 0;
    const sent = [];
    class S extends PingSocket {
      send(text) {
        sent.push(JSON.parse(text).t);
        clock += this.url.includes('b.example') ? 5 : 100;
        super.send(text);
      }
    }
    const local = memory({ 'sp.regions': JSON.stringify(CONFIG) });
    const net = new FakeNet();
    const regions = createRegions({
      net, identity: { getToken: () => null, clearToken() {} }, local, session: memory(), search: '',
      socketPath: () => '/ws', secure: () => true, makeNet: () => new FakeNet(), makeError: err,
      WebSocket: S, now: () => clock, setTimeout: (fn) => globalThis.setTimeout(fn, 1000), clearTimeout: (id) => globalThis.clearTimeout(id),
    });
    regions.getUrl();
    await regions.probe();
    assert.ok(sent.length > 0);
    assert.ok(sent.every((t) => t === 'ping'));
    assert.ok(local.getItem('sp.regionBest'));
  });

  test('it stays quiet when it could change nothing', async () => {
    assert.equal(await withConfig({ config: { ...CONFIG, auto: false } }).regions.probe(), null);
    assert.equal(await withConfig({ local: { [K_PREF]: 'us' } }).regions.probe(), null);
    assert.equal(await withConfig({ session: { 'sp.regionForce': 'us' } }).regions.probe(), null);
  });
});
