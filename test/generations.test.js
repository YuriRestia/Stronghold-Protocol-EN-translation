// test/generations.test.js — zero-downtime restarts: shared/gen.js, public/js/gen.js, scripts/router.mjs,
// scripts/generations.mjs (pure parts), server/generation.js + lobby.retire(), buildGuard retire — and one end-to-end
// run of two real generations behind the real router.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitGenPath, genPath, rewriteIndexHtml, isGenSharedPath } from '../shared/gen.js';
import { genOf, publicPath, goHome, RETIRED_FLAG } from '../public/js/gen.js';
import { parseGenerations, route, createRouter } from '../scripts/router.mjs';
import { newGenId, allocPort, withNewGen, reapPlan, releasesToPrune } from '../scripts/generations.mjs';
import { startBuildGuard } from '../public/js/ui/buildGuard.js';
import { startServer } from '../server/index.js';
import { S2C } from '../shared/protocol.js';
import { ERR, ERR_TEXT } from '../shared/constants.js';
import { TestClient } from './helpers/wsClient.js';
import { StubMatch } from '../server/match/StubMatch.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('shared/gen.js', () => {
  test('splitGenPath strips the prefix', () => {
    assert.deepEqual(splitGenPath('/js/main.js'), { gen: null, rest: '/js/main.js', base: '', redirect: null });
    assert.deepEqual(splitGenPath('/_build/g1/_/js/main.js'), { gen: 'g1', rest: '/js/main.js', base: '/_build/g1/_', redirect: null });
    assert.deepEqual(splitGenPath('/_build/g1/shared/i18n.js'), { gen: 'g1', rest: '/shared/i18n.js', base: '/_build/g1', redirect: null });
    assert.deepEqual(splitGenPath('/_build/g1/'), { gen: 'g1', rest: '/', base: '/_build/g1', redirect: null });
    assert.equal(splitGenPath('/_build/g1').redirect, '/_build/g1/');
    assert.equal(splitGenPath('/_build/g1/_').rest, '/');
    assert.equal(splitGenPath('/_build/../x').gen, null, 'not a generation id');
    assert.equal(splitGenPath('/_build/a b/x').gen, null);
  });
  test('genPath prefixes per-generation paths only', () => {
    assert.equal(genPath(null, '/data/x.json'), '/data/x.json');
    assert.equal(genPath('g1', '/data/x.json'), '/_build/g1/_/data/x.json');
    assert.equal(genPath('g1', '/ws'), '/_build/g1/_/ws');
    assert.equal(genPath('g1', '/shared/x.js'), '/_build/g1/shared/x.js');
    for (const p of ['/assets/a.png', '/media/bgm/x', '/fonts/f.css', '/icons/a.png', '/manifest.json', '/resource-sw.js']) {
      assert.equal(genPath('g1', p), p, p);
      assert.ok(isGenSharedPath(p));
    }
    assert.equal(genPath('g1', '//evil.example/x'), '//evil.example/x');
    assert.equal(genPath('g1', '/_build/g0/_/x'), '/_build/g0/_/x', 'never double-prefixed');
  });
  test('rewriteIndexHtml moves modules, styles and the import map, not icons or fonts', () => {
    const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'index.html'), 'utf8');
    const out = rewriteIndexHtml(html, 'g1');
    assert.match(out, /src="\/_build\/g1\/_\/js\/main\.js"/);
    assert.match(out, /"preact": "\/_build\/g1\/_\/vendor\/preact\.module\.js"/);
    assert.match(out, /href="\/_build\/g1\/_\/css\/theme\.css"/);
    assert.match(out, /href="\/fonts\/fonts\.css"/);
    assert.match(out, /href="\/icons\/favicon\.ico"/);
    assert.match(out, /href="\/manifest\.json"/);
    assert.doesNotMatch(out, /"\/(js|css|vendor)\//, 'no unprefixed module path left');
  });
});

describe('public/js/gen.js', () => {
  test('genOf reads the generation from a module URL', () => {
    assert.equal(genOf('https://h/_build/250101-000000/_/js/gen.js'), '250101-000000');
    assert.equal(genOf('https://h/js/gen.js'), null);
    assert.equal(genOf('file:///x/public/js/gen.js'), null);
    assert.equal(genOf('nonsense'), null);
  });
  test('publicPath drops the prefix (invite links)', () => {
    assert.equal(publicPath('/_build/g1/'), '/');
    assert.equal(publicPath('/'), '/');
  });
  test('goHome goes to / with the query and sets the moved flag', () => {
    const store = new Map();
    let went = null;
    goHome({ location: { search: '?room=ABCD', hash: '#x', assign: (u) => { went = u; } }, sessionStorage: { setItem: (k, v) => store.set(k, v) } });
    assert.equal(went, '/?room=ABCD#x');
    assert.equal(store.get(RETIRED_FLAG), '1');
  });
});

describe('scripts/router.mjs route()', () => {
  const table = parseGenerations(JSON.stringify({ current: 'g2', gens: { g1: { port: 3101 }, g2: { port: 3102 }, 'bad id': { port: 1 } } }));
  test('parseGenerations validates', () => {
    assert.deepEqual(Object.keys(table.gens), ['g1', 'g2']);
    assert.equal(parseGenerations('{'), null);
    assert.equal(parseGenerations(JSON.stringify({ current: 'gx', gens: { g1: { port: 3101 } } })), null, 'current must exist');
  });
  test('routes', () => {
    assert.deepEqual(route('/?room=AB', table), { kind: 'home', location: '/_build/g2/?room=AB' });
    assert.deepEqual(route('/_build/g1/_/ws', table), { kind: 'proxy', port: 3101 });
    assert.deepEqual(route('/_build/g9/_/js/main.js', table), { kind: 'ended' });
    assert.deepEqual(route('/assets/x.png', table), { kind: 'proxy', port: 3102 });
    assert.deepEqual(route('/healthz', table), { kind: 'health' });
    assert.deepEqual(route('/', null), { kind: 'down' });
  });
});

describe('scripts/generations.mjs decisions', () => {
  test('ids, ports, table update', () => {
    assert.equal(newGenId(new Date(Date.UTC(2026, 9, 11, 3, 4, 5))), '261011-030405');
    assert.equal(allocPort(null), 3101);
    assert.equal(allocPort({ gens: { a: { port: 3101 }, b: { port: 3103 } } }), 3102);
    const t = withNewGen({ current: 'a', gens: { a: { port: 3101 }, b: { port: 3102, retiringSince: 5 } } }, 'c', 3103, 100, '/r/c');
    assert.equal(t.current, 'c');
    assert.equal(t.gens.a.retiringSince, 100);
    assert.equal(t.gens.b.retiringSince, 5, 'an older retirement keeps its start');
    assert.equal(t.gens.c.retiringSince, undefined);
  });
  test('reapPlan', () => {
    const table = { current: 'c', gens: {
      c: { port: 1 }, busy: { port: 2, retiringSince: 0 }, empty: { port: 3, retiringSince: 0 }, dead: { port: 4, retiringSince: 0 },
      old: { port: 5, retiringSince: 0 }, lingering: { port: 6, retiringSince: 0, idleSince: 0 } } };
    const now = 5 * 60_000;
    const health = { busy: { humanMatches: 1, sockets: 4 }, empty: { humanMatches: 0, sockets: 0 }, dead: null,
      old: { humanMatches: 1, sockets: 1 }, lingering: { humanMatches: 0, sockets: 2 } };
    const p = reapPlan(table, health, now, { maxAgeMs: 4 * 60_000, idleGraceMs: 3 * 60_000 });
    // busy: still a human match but past maxAge here → stopped; run again with a larger maxAge
    assert.deepEqual(p.stop.sort(), ['busy', 'dead', 'empty', 'lingering', 'old']);
    const q = reapPlan(table, health, now, { maxAgeMs: 60 * 60_000, idleGraceMs: 10 * 60_000 });
    assert.deepEqual(q.stop.sort(), ['dead', 'empty']);
    assert.ok(q.table.gens.busy && q.table.gens.c && q.table.gens.lingering);
    assert.equal(q.table.gens.lingering.idleSince, 0);
  });
  test('releasesToPrune keeps the table and the newest idle ones', () => {
    const names = ['261001-000000', '261002-000000', '261003-000000', '261004-000000', 'notes.txt'];
    assert.deepEqual(releasesToPrune(names, { gens: { '261004-000000': {} } }, 2), ['261001-000000']);
  });
});

describe('buildGuard retire', () => {
  const fakeTimers = () => ({ setInterval: () => 1, clearInterval: () => {} });
  test('outside a match: home() at once', async () => {
    let home = 0;
    const g = startBuildGuard({ ...fakeTimers(), fetchFn: async () => ({ ok: true, json: async () => ({ build: 'b' }) }), home: () => home++, inMatch: () => false });
    g.retire();
    assert.equal(home, 1);
    assert.equal(g.retired(), true);
  });
  test('in a match: waits for settle() after the match', async () => {
    let home = 0;
    let playing = true;
    const g = startBuildGuard({ ...fakeTimers(), fetchFn: async () => ({ ok: true, json: async () => ({ build: 'b' }) }), home: () => home++, inMatch: () => playing });
    g.retire();
    assert.equal(home, 0);
    assert.equal(g.settle(), false);
    playing = false;
    assert.equal(g.settle(), true);
    assert.equal(home, 1);
  });
  test('the health URL is configurable', async () => {
    const urls = [];
    startBuildGuard({ ...fakeTimers(), healthUrl: '/_build/g1/_/healthz', fetchFn: async (u) => { urls.push(u); return { ok: false }; } });
    await sleep(0);
    assert.deepEqual(urls, ['/_build/g1/_/healthz']);
  });
  test('a 410 (generation dropped by the router) moves the page like sys.retire, never a 404 / 503', async () => {
    let home = 0;
    let status = 503;
    const g = startBuildGuard({ ...fakeTimers(), fetchFn: async () => ({ ok: false, status }), home: () => home++, inMatch: () => false });
    await sleep(0);
    assert.equal(home, 0, '503 (restarting) never moves');
    status = 410;
    await g.check();
    assert.equal(home, 1);
  });
});

describe('two generations behind the router', () => {
  let dir, file, g1, g2, router, base;
  const clients = [];
  const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const writeTable = (t) => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(t)); fs.renameSync(`${file}.tmp`, file); };
  const get = (p, opts) => fetch(`${base}${p}`, { redirect: 'manual', ...opts });
  const wsAt = async (gen, name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${router.server.address().port}/_build/${gen}/_/ws`);
    clients.push(c);
    await c.hello(name);
    return c;
  };
  const gen = (id) => startServer({ port: 0, host: '127.0.0.1', quiet: true, noticeFile: null, MatchClass: StubMatch,
    gen: id, genFile: file, genPollMs: 25 });

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-gens-'));
    file = path.join(dir, 'generations.json');
    g1 = await gen('g1');
    writeTable({ current: 'g1', gens: { g1: { port: g1.port } } });
    router = createRouter({ file, pollMs: 25, log: { info() {}, warn() {} } });
    await new Promise((r) => router.server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${router.server.address().port}`;
  });
  after(async () => {
    for (const c of clients) await c.close().catch(() => {});
    await router?.close();
    await g1?.close();
    await g2?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('/ redirects into the current generation; its page and modules load under the prefix', async () => {
    const home = await get('/?room=ABCD');
    assert.equal(home.status, 302);
    assert.equal(home.headers.get('location'), '/_build/g1/?room=ABCD');
    const page = await get('/_build/g1/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/_build\/g1\/_\/js\/main\.js"/);
    for (const p of ['/_build/g1/_/js/main.js', '/_build/g1/_/js/gen.js', '/_build/g1/shared/gen.js', '/_build/g1/_/sim/constants.js', '/_build/g1/_/data.js']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      await r.arrayBuffer();
    }
    const h = await (await get('/_build/g1/_/healthz')).json();
    assert.equal(h.gen, 'g1');
    assert.equal(h.retiring, false);
    assert.equal((await get('/_build/g1')).headers.get('location'), '/_build/g1/');
    const ended = await get('/_build/nope/_/js/main.js');
    assert.equal(ended.status, 410);
    assert.match(await ended.text(), /has ended/);
    assert.equal((await get('/index.html')).status, 302, 'the page itself always runs inside a generation');
  });

  test('a new generation takes over: matches play on in the old one, everything else moves', async () => {
    // on g1: a running solo match, and a lobby player
    const player = await wsAt('g1', 'Player');
    await ok(player, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await ok(player, { t: 'room.start' });
    const idle = await wsAt('g1', 'Idle');
    assert.equal((await (await get('/_build/g1/_/healthz')).json()).humanMatches, 1);

    g2 = await gen('g2');
    writeTable({ current: 'g2', gens: { g1: { port: g1.port, retiringSince: Date.now() }, g2: { port: g2.port } } });
    await Promise.all([player.waitFor('sys.retire'), idle.waitFor('sys.retire')]);

    assert.equal((await get('/')).headers.get('location'), '/_build/g2/');
    const h1 = await (await get('/_build/g1/_/healthz')).json();
    assert.equal(h1.retiring, true);
    assert.equal(h1.humanMatches, 1, 'the match still runs on g1');
    // g1 refuses anything new
    const r = await idle.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    assert.equal(r.t, 'error');
    assert.equal(r.code, 'RETIRING');
    // a reconnect into the running match still works, and hears sys.retire again
    const again = await wsAt('g1', 'Again');
    await again.waitFor('sys.retire');
    // g2 takes new players
    const fresh = await wsAt('g2', 'Fresh');
    await ok(fresh, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await fresh.expectNone('sys.retire');
    // a dropped generation's pages get the "ended" page
    writeTable({ current: 'g2', gens: { g2: { port: g2.port } } });
    await sleep(80);
    assert.equal((await get('/_build/g1/_/healthz')).status, 410);
  });
});

test('protocol: sys.retire and ERR.RETIRING exist', () => {
  assert.ok(S2C.includes('sys.retire'));
  assert.equal(ERR.RETIRING, 'RETIRING');
  assert.ok(ERR_TEXT.RETIRING);
});
