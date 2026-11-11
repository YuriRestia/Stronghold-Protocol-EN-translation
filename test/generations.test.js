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
import { newGenId, allocPort, withNewGen, withPreparedGen, activateGen, withRemoteMatches, regionsWithout, reapPlan, releasesToPrune, missingAssets, MAX_AGE_MS, PREPARED_MAX_AGE_MS, prepareCheck } from '../scripts/generations.mjs';
import { parseHosts, formatHosts, prepareCommand, activateCommand, checkCommand, sudoCheckCommand, checkOnHost, announceCommand, shQuote, parseArgs, parseCheck, checkProblems, testUrls } from '../scripts/deploy-regions.mjs';
import { startBuildGuard } from '../public/js/ui/buildGuard.js';
import { startServer } from '../server/index.js';
import { S2C } from '../shared/protocol.js';
import { ERR, ERR_TEXT } from '../shared/constants.js';
import { TestClient } from './helpers/wsClient.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { botModuleFiles } from '../server/http/botModules.js';
import { WORKER_LOAD_MS } from './helpers/simHostFixture.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (fork) Wait until a server has picked up a table change (its genPollMs poll): a fixed 80 / 150 ms sleep was too short
// on a loaded machine. Returns the last value, so the assertion after it reports what it saw.
async function until(read, ok, ms = WORKER_LOAD_MS) {
  for (const end = Date.now() + ms; ; await sleep(20)) { const v = await read(); if (ok(v) || Date.now() > end) return v; }
}

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
  test('missingAssets lists absent or empty /assets and /fonts files once', () => {
    const manifest = { audio: { voice: { a: { select: ['/assets/v/1.mp3', '/assets/v/2.mp3'], start: '/assets/v/1.mp3' } } },
      fonts: { css: '/fonts/f.css' }, other: 'https://x/y', n: 3 };
    const sizes = { '/assets/v/1.mp3': 10, '/assets/v/2.mp3': 0 };
    assert.deepEqual(missingAssets(manifest, (u) => sizes[u] ?? 0), ['/assets/v/2.mp3', '/fonts/f.css']);
    assert.deepEqual(missingAssets(manifest, () => 1), []);
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
  // (fork) Event waits on the router and its generations get WORKER_LOAD_MS: the client's 2-3 s defaults (connect, hello,
  // request, sys.retire after a table poll) ran out on a loaded machine. Only expectNone keeps its short window.
  const ok = async (c, msg) => { const r = await c.request(msg, WORKER_LOAD_MS); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const writeTable = (t) => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(t)); fs.renameSync(`${file}.tmp`, file); };
  const get = (p, opts) => fetch(`${base}${p}`, { redirect: 'manual', ...opts });
  const wsAt = async (gen, name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${router.server.address().port}/_build/${gen}/_/ws`, { timeout: WORKER_LOAD_MS });
    clients.push(c);
    assert.equal((await c.request({ t: 'hello', name, version: 1 }, WORKER_LOAD_MS)).t, 'welcome'); // c.hello, with the longer wait
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

  // (fork) a generation is one release at one commit: its own code is cached for good under its prefix, everything that
  // can change (the page, sw.js, health, data/, the shared art, unprefixed dev paths) keeps asking
  test('cache policy: the generation\'s own code is immutable under its prefix, the rest is not', async () => {
    const IMMUTABLE = 'public, max-age=31536000, immutable';
    const bot = [...botModuleFiles().keys()][0];
    assert.ok(bot, 'a bot Worker module to ask for');
    const cacheOf = async (p, at = base) => {
      const r = await fetch(`${at}${p}`, { redirect: 'manual' });
      await r.arrayBuffer();
      return { status: r.status, cc: r.headers.get('cache-control') };
    };
    for (const p of ['/_build/g1/_/js/main.js', '/_build/g1/_/css/theme.css', '/_build/g1/_/vendor/htm.module.js',
      '/_build/g1/shared/gen.js', '/_build/g1/_/sim/constants.js', '/_build/g1/_/data.js', '/_build/g1/_/match/bondsMeta.js',
      `/_build/g1/_/match/${bot}`]) {
      assert.deepEqual(await cacheOf(p), { status: 200, cc: IMMUTABLE }, p);
    }
    // a 304 keeps the policy
    const first = await fetch(`${base}/_build/g1/_/js/main.js`);
    await first.arrayBuffer();
    const again = await fetch(`${base}/_build/g1/_/js/main.js`, { headers: { 'If-None-Match': first.headers.get('etag') } });
    assert.equal(again.status, 304);
    assert.equal(again.headers.get('cache-control'), IMMUTABLE);
    // the page, health, the service worker, data/, a shared file and the plain (dev) paths keep asking
    const notImmutable = ['/_build/g1/', '/_build/g1/_/index.html', '/_build/g1/_/healthz', '/_build/g1/_/sw.js', '/_build/g1/_/manifest.json',
      '/_build/g1/_/data/bonds.json', '/sw.js', '/js/main.js'];
    for (const p of notImmutable) {
      const { status, cc } = await cacheOf(p);
      assert.ok(status === 200 || status === 302, `${p}: ${status}`);
      assert.ok(!/immutable|max-age=[1-9]/.test(cc || ''), `${p}: ${cc}`);
    }
    // another generation's prefix sent straight to g1's port, and a server outside the router (npm start), ask too
    assert.equal((await cacheOf('/_build/g9/_/js/main.js', `http://127.0.0.1:${g1.port}`)).cc, 'no-cache');
    const plain = await startServer({ port: 0, host: '127.0.0.1', quiet: true, noticeFile: null, MatchClass: StubMatch, gen: null, genFile: null });
    try {
      assert.equal((await cacheOf('/_build/g1/_/js/main.js', `http://127.0.0.1:${plain.port}`)).cc, 'no-cache');
      assert.equal((await cacheOf('/js/main.js', `http://127.0.0.1:${plain.port}`)).cc, 'no-cache');
    } finally { await plain.close(); }
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
    await Promise.all([player.waitFor('sys.retire', undefined, WORKER_LOAD_MS), idle.waitFor('sys.retire', undefined, WORKER_LOAD_MS)]);

    assert.equal((await get('/')).headers.get('location'), '/_build/g2/');
    const h1 = await (await get('/_build/g1/_/healthz')).json();
    assert.equal(h1.retiring, true);
    assert.equal(h1.humanMatches, 1, 'the match still runs on g1');
    // g1 refuses anything new
    const r = await idle.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' }, WORKER_LOAD_MS);
    assert.equal(r.t, 'error');
    assert.equal(r.code, 'RETIRING');
    // a reconnect into the running match still works, and hears sys.retire again
    const again = await wsAt('g1', 'Again');
    await again.waitFor('sys.retire', undefined, WORKER_LOAD_MS);
    // g2 takes new players
    const fresh = await wsAt('g2', 'Fresh');
    await ok(fresh, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await fresh.expectNone('sys.retire');
    // a dropped generation's pages get the "ended" page
    writeTable({ current: 'g2', gens: { g2: { port: g2.port } } });
    assert.equal(await until(async () => (await get('/_build/g1/_/healthz')).status, (s) => s === 410), 410);
  });
});

describe('a new generation starting before the table lists it (deploy order)', () => {
  let dir, file, old, next;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-gens-order-'));
    file = path.join(dir, 'generations.json');
  });
  after(async () => {
    await old?.close();
    await next?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('does not retire itself while another generation is current (the reload-loop bug, 2026-10-11)', async () => {
    const opts = { port: 0, host: '127.0.0.1', quiet: true, noticeFile: null, MatchClass: StubMatch, genFile: file, genPollMs: 20 };
    old = await startServer({ ...opts, gen: 'g1' });
    fs.writeFileSync(file, JSON.stringify({ current: 'g1', gens: { g1: { port: old.port } } }));
    next = await startServer({ ...opts, gen: 'g2' }); // what `deploy` does: start, then wait for /healthz
    await sleep(150);
    const health = async (srv) => (await fetch(`http://127.0.0.1:${srv.port}/healthz`)).json();
    assert.equal((await health(next)).retiring, false, 'the new generation waits, it does not retire');
    assert.equal((await health(old)).retiring, false);
    // the deploy makes g2 current: only g1 retires
    fs.writeFileSync(file, JSON.stringify({ current: 'g2', gens: { g1: { port: old.port, retiringSince: 1 }, g2: { port: next.port } } }));
    assert.equal((await until(() => health(old), (h) => h.retiring)).retiring, true);
    assert.equal((await health(next)).retiring, false);
    // a later deploy (g3) makes g2 retire too, even though g3 is not running here
    fs.writeFileSync(file, JSON.stringify({ current: 'g3', gens: { g2: { port: next.port, retiringSince: 2 }, g3: { port: 1 } } }));
    assert.equal((await until(() => health(next), (h) => h.retiring)).retiring, true);
  });
});

test('protocol: sys.retire and ERR.RETIRING exist', () => {
  assert.ok(S2C.includes('sys.retire'));
  assert.equal(ERR.RETIRING, 'RETIRING');
  assert.ok(ERR_TEXT.RETIRING);
});

// (fork) several regions (DESIGN §8.7): one id and one commit on every server, in two steps
describe('deploying to several regions', () => {
  const table = () => ({ current: 'a', gens: { a: { port: 3101, startedAt: 1 } } });

  test('a prepared generation is listed for the router, not current, and the old one does not retire', () => {
    const t = withPreparedGen(table(), 'b', 3102, 100, '/rel/b');
    assert.equal(t.current, 'a');
    assert.equal(t.gens.b.prepared, true);
    assert.equal(t.gens.a.retiringSince, undefined);
    assert.equal(parseGenerations(JSON.stringify(t)).gens.b.port, 3102);
    assert.equal(route('/_build/b/_/ws', parseGenerations(JSON.stringify(t))).port, 3102, 'a socket of the new page finds it');
    assert.equal(route('/', parseGenerations(JSON.stringify(t))).location, '/_build/a/', 'new visitors stay on the old one');
  });

  test('activate makes it current, and every other generation retires', () => {
    const t = activateGen(withPreparedGen(table(), 'b', 3102, 100, '/rel/b'), 'b', 200);
    assert.equal(t.current, 'b');
    assert.equal(t.gens.b.prepared, undefined);
    assert.equal(t.gens.a.retiringSince, 200);
  });

  test('activating a generation that is not here changes nothing', () => {
    assert.equal(activateGen(table(), 'zzz', 200), null);
  });

  test('reap leaves a prepared generation alone, until a deploy has clearly been abandoned', () => {
    const t = withPreparedGen(table(), 'b', 3102, 100, '/rel/b');
    assert.deepEqual(reapPlan(t, { b: { humanMatches: 0, sockets: 0 } }, 200).stop, []);
    assert.deepEqual(reapPlan(t, { b: { humanMatches: 0, sockets: 0 } }, 100 + MAX_AGE_MS + 1).stop, [], 'an hour of private testing fits');
    assert.ok(PREPARED_MAX_AGE_MS >= 2 * MAX_AGE_MS);
    assert.deepEqual(reapPlan(t, { b: { humanMatches: 0, sockets: 0 } }, 100 + PREPARED_MAX_AGE_MS + 1).stop, ['b']);
  });

  test('a generation can be activated only while it is prepared (or already current) and answers as itself', () => {
    const t = withPreparedGen(table(), 'b', 3102, 100, '/rel/b');
    const ok = { gen: 'b', build: 'x' };
    assert.deepEqual(prepareCheck(t, 'b', ok), { ok: true, state: 'prepared' });
    assert.equal(prepareCheck(t, 'zz', ok).state, 'missing');
    assert.equal(prepareCheck(t, 'b', null).ok, false, 'no /healthz answer');
    assert.equal(prepareCheck(t, 'b', { gen: 'a' }).ok, false, 'another generation on that port');
    assert.equal(prepareCheck(t, 'b', { gen: 'b', retiring: true }).ok, false);
    const after = activateGen(t, 'b', 300);
    assert.deepEqual(prepareCheck(after, 'b', ok), { ok: true, state: 'current' }, 'an activate that stopped half way can be run again');
    assert.equal(prepareCheck(after, 'a', { gen: 'a' }).state, 'retiring');
    assert.equal(prepareCheck(after, 'a', { gen: 'a' }).ok, false);
    const first = withPreparedGen(null, 'b', 3101, 100, '/rel/b');
    assert.deepEqual(prepareCheck(first, 'b', ok), { ok: true, state: 'prepared' }, 'the first generation of a new server is prepared, not current');
  });

  test('a match on the other region keeps this region\'s copy of its generation alive', () => {
    const t = { current: 'b', gens: { a: { port: 3101, retiringSince: 100 }, b: { port: 3102 } } };
    const idle = { a: { humanMatches: 0, sockets: 0 } };
    assert.deepEqual(reapPlan(t, idle, 200).stop, ['a'], 'alone, it looks finished');
    assert.deepEqual(reapPlan(t, withRemoteMatches(idle, { a: 2 }), 200).stop, [], 'the page of that match comes from here');
    assert.deepEqual(reapPlan(t, withRemoteMatches(idle, { a: 2 }), 100 + MAX_AGE_MS + 1).stop, ['a'], 'the hour still ends it');
    assert.deepEqual(reapPlan(t, withRemoteMatches({ a: null }, { a: 2 }), 200).stop, ['a'], 'a generation that no longer answers here is gone');
  });
});

describe('scripts/deploy-regions.mjs', () => {
  test('hosts and their flags', () => {
    assert.deepEqual(parseHosts('spa, usspa:no-art'), [{ host: 'spa', noArt: false }, { host: 'usspa', noArt: true }]);
    assert.deepEqual(parseHosts(''), []);
  });

  test('prepare pulls, names the generation and commit, and passes --no-art only where asked', () => {
    const plain = prepareCommand({ gen: 'g1', commit: 'abc' });
    assert.match(plain, /git pull --ff-only/);
    assert.match(plain, /deploy --prepare --gen g1 --ref abc/);
    assert.doesNotMatch(plain, /--no-art/);
    assert.match(prepareCommand({ gen: 'g1', commit: 'abc', noArt: true }), /--no-art/);
    assert.match(activateCommand('g1'), /generations\.mjs activate g1/);
  });

  test('commands and their argument checks', () => {
    const env = {};
    assert.deepEqual(parseArgs(['prepare', '--hosts', 'spa,usspa:no-art'], env), { cmd: 'prepare', hosts: parseHosts('spa,usspa:no-art'), ref: 'origin/dev-0.2' });
    assert.equal(parseArgs(['deploy', '--hosts', 'spa', '--ref', 'abc123'], env).ref, 'abc123');
    assert.deepEqual(parseArgs(['activate', '261109-120000', '--hosts', 'spa,usspa:no-art'], env).gen, '261109-120000');
    assert.equal(parseArgs(['status'], { SP_DEPLOY_HOSTS: 'spa,usspa' }).hosts.length, 2, 'SP_DEPLOY_HOSTS stands in for --hosts');
    assert.deepEqual(parseArgs([], env), { error: null }, 'a bare call prints the usage');
    for (const [argv, why] of [
      [['rollback', '--hosts', 'spa'], /unknown command/],
      [['prepare'], /no servers/],
      [['prepare', '--hosts'], /--hosts needs a list/],
      [['prepare', '--hosts', 'spa', '--ref'], /--ref needs/],
      [['prepare', '--hosts', 'spa', '--ref', '--hosts'], /--ref needs/],
      [['activate', '--hosts', 'spa'], /activate needs the generation id/],
      [['activate', '../x', '--hosts', 'spa'], /not a generation id/],
      [['activate', '261109-120000', '--hosts', 'spa;rm -rf /'], /not an ssh host name/],
      [['announce', '--hosts', 'spa'], /text last/],
      [['announce', '--hosts', 'spa', '--minutes', '5'], /text last/],
      [['announce', '--hosts', 'spa', '--minutes', 'soon', 'hi'], /--minutes needs a number/],
    ]) assert.match(String(parseArgs(argv, env).error), why, argv.join(' '));
    const a = parseArgs(['announce', '--hosts', 'spa', '--minutes', '3', 'Restart soon'], env);
    assert.deepEqual([a.minutes, a.text], [3, 'Restart soon']);
    assert.equal(formatHosts(parseHosts('spa, usspa:no-art')), 'spa,usspa:no-art');
  });

  test('activate refuses unless the generation is ready on every server, with one build', () => {
    const ok = (build = 'b1') => ({ gen: 'g', ok: true, state: 'prepared', build });
    assert.deepEqual(checkProblems('g', [{ host: 'spa', check: ok() }, { host: 'usspa', check: { ...ok(), state: 'current' } }]), []);
    const p = checkProblems('g', [{ host: 'spa', check: ok() }, { host: 'usspa', check: null }]);
    assert.equal(p.length, 1);
    assert.match(p[0], /^usspa: no answer/);
    assert.match(checkProblems('g', [{ host: 'spa', check: { gen: 'g', ok: false, state: 'missing', reason: 'generation g is not on this server' } }])[0], /^spa: generation g is not on this server/);
    assert.match(checkProblems('g', [{ host: 'spa', check: ok('b1') }, { host: 'usspa', check: ok('b2') }]).join(), /different builds/);
  });

  test('the check line is read back from ssh output, and its command needs no sudo', () => {
    assert.deepEqual(parseCheck('Welcome' + String.fromCharCode(13, 10) + '[check] {"gen":"g","ok":true}' + String.fromCharCode(10)), { gen: 'g', ok: true });
    assert.equal(parseCheck('[check] {broken'), null);
    assert.equal(parseCheck('usage: …'), null);
    assert.equal(parseCheck(undefined), null);
    assert.match(checkCommand('g1'), /^cd \/opt\/stronghold\/app && node scripts\/generations\.mjs check 'g1'$/);
    assert.match(sudoCheckCommand('g1'), /^sudo -n bash -c 'cd \/opt\/stronghold\/app && node scripts\/generations\.mjs check '\\''g1'\\'''$/);
  });

  test('the check falls back to sudo -n when the login user cannot enter /opt/stronghold, and only then', () => {
    const line = '[check] {"gen":"g","ok":true,"state":"prepared","build":"b1"}';
    const calls = [];
    const fake = (answers) => (host, cmd) => { calls.push(cmd); return answers[calls.length - 1]; };
    // Singapore: /opt/stronghold is drwxr-x--- stronghold → the plain check gets no answer, sudo -n does
    let r = checkOnHost('spa', 'g', fake([{ stdout: '', stderr: 'bash: line 1: cd: /opt/stronghold/app: Permission denied' }, { stdout: line }]));
    assert.deepEqual(calls, [checkCommand('g'), sudoCheckCommand('g')]);
    assert.equal(r.check.build, 'b1');
    assert.equal(r.stderr, '', 'the permission error of the first try is not shown when sudo answered');
    // the US: the plain check answers, sudo (which wants a password there) is never tried
    calls.length = 0;
    r = checkOnHost('usspa', 'g', fake([{ stdout: line }]));
    assert.deepEqual(calls, [checkCommand('g')]);
    assert.equal(r.check.ok, true);
    // a not-ready answer is an answer: no fallback
    calls.length = 0;
    checkOnHost('usspa', 'g', fake([{ stdout: '[check] {"gen":"g","ok":false,"state":"missing"}' }]));
    assert.equal(calls.length, 1);
    // both fail → no check, and both errors for the operator
    calls.length = 0;
    r = checkOnHost('spa', 'g', fake([{ stdout: '', stderr: 'Permission denied' }, { stdout: '', stderr: 'sudo: a password is required' }]));
    assert.equal(r.check, null);
    assert.equal(r.stderr, 'Permission denied\nsudo: a password is required');
    assert.match(checkProblems('g', [{ host: 'spa', check: r.check }])[0], /^spa: no answer/);
  });

  test('the private test URLs: the page from the first region, then each other server by ?region=', () => {
    const regions = { self: 'sg', list: [{ id: 'sg', host: 'stronghold-en.dev' }, { id: 'us', host: 'us.stronghold-en.dev' }] };
    assert.deepEqual(testUrls('261109-120000', regions), [
      'https://stronghold-en.dev/_build/261109-120000/',
      'https://stronghold-en.dev/_build/261109-120000/?region=us',
    ]);
    assert.deepEqual(testUrls('g', null), []);
    assert.deepEqual(testUrls('g', { list: [] }), []);
  });

  test('announcement text cannot break out of its quotes', () => {
    const line = announceCommand(5, "it's; rm -rf /");
    assert.equal(line.startsWith("sudo bash -c '"), true);
    assert.match(line, /--minutes 5 /);
    assert.equal(shQuote("a'b"), `'a'\\''b'`);
  });
});

describe('a generation on one server only', () => {
  const others = [{ id: 'us', host: 'b.example' }];
  const answering = (body, ok = true) => async () => ({ ok, json: async () => body });

  test('a region on the same generation is fine; one without it, or away, is named', async () => {
    assert.deepEqual(await regionsWithout('g1', others, answering({ gen: 'g1' })), []);
    assert.deepEqual(await regionsWithout('g1', others, answering({ gen: 'g2' })), ['us']);
    assert.deepEqual(await regionsWithout('g1', others, answering(null, false)), ['us'], 'the router says the generation has ended');
    assert.deepEqual(await regionsWithout('g1', others, async () => { throw new Error('down'); }), ['us']);
  });
});

describe('the router and the link between regions', () => {
  test('a signed post reaches the current generation whole; a prepared one gets only its own prefix', async () => {
    const http = await import('node:http');
    const hits = { current: [], prepared: [] };
    const fake = (name) => http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { hits[name].push({ method: req.method, url: req.url, sig: req.headers['x-sp-peer-sig'], body: Buffer.concat(chunks).toString() }); res.end('{}'); });
    });
    const listen = (s) => new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s.address().port)));
    const [a, b] = [fake('current'), fake('prepared')];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-router-'));
    const file = path.join(dir, 'generations.json');
    fs.writeFileSync(file, JSON.stringify(withPreparedGen({ current: 'g1', gens: { g1: { port: await listen(a) } } }, 'g2', await listen(b), 1, '/rel')));
    const router = createRouter({ file });
    try {
      const port = await listen(router.server);
      const res = await fetch(`http://127.0.0.1:${port}/_peer/sync`, { method: 'POST', body: '{"region":"us"}', headers: { 'x-sp-peer-sig': 'abc' } });
      assert.equal(res.status, 200);
      assert.deepEqual(hits.current, [{ method: 'POST', url: '/_peer/sync', sig: 'abc', body: '{"region":"us"}' }]);
      assert.deepEqual(hits.prepared, [], 'a prepared generation does not receive the link');
      await fetch(`http://127.0.0.1:${port}/_build/g2/_/healthz`);
      assert.equal(hits.prepared.length, 1, 'but a page of that generation reaches it');
    } finally {
      await router.close();
      a.close();
      b.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
