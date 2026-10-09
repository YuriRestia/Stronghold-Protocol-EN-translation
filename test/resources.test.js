// Asset preload (Settings ▸ Preload assets): the shared path rules and the worker's copy of them, the server's manifest
// (/data/resource-manifest.json), the page store's download / freshness / pruning against an in-memory Cache Storage,
// the Service Worker's answers, and the voice-pack default that follows the voice language settings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { packOf, resourceKey, mediaKeys, parseManifest, formatBytes, CACHE_NAME, PACKS_PATH, RESOURCES_FORMAT } from '../shared/resources.js';
import { buildResourceManifest } from '../server/resources.js';
import { createStaticHandler } from '../server/index.js';
import { PreloadStore } from '../public/js/resources/store.js';
import { sanitizePreloadPref, voicePacksOf, missingBytes, preloadPref, tickedVoicePacks, setVoicePack, followVoiceSettings, pausePreload } from '../public/js/resources/index.js';
import { voiceLangStore } from '../public/js/ui/voiceLang.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://sp.test';
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);

/** Cache Storage stand-in: Map of name → Map(url → Response body bytes + headers). */
function memoryCaches() {
  const all = new Map();
  const open = async (name) => {
    if (!all.has(name)) all.set(name, new Map());
    const m = all.get(name);
    return {
      async match(url) {
        const e = m.get(typeof url === 'string' ? url : url.url);
        return e ? new Response(e.body.slice(0), { status: 200, headers: e.headers }) : undefined;
      },
      async put(url, res) { m.set(typeof url === 'string' ? url : url.url, { body: new Uint8Array(await res.arrayBuffer()), headers: Object.fromEntries(res.headers) }); },
      async delete(url) { return m.delete(typeof url === 'string' ? url : url.url); },
      async keys() { return [...m.keys()].map((url) => ({ url })); },
    };
  };
  return { all, open, delete: async (n) => all.delete(n), keys: async () => [...all.keys()] };
}

/** A manifest + matching file bodies; `fetcher` serves them (counting calls). */
function fixture(files) {
  const bodies = new Map();
  const entries = files.map(([p, text]) => {
    const body = Buffer.from(text);
    bodies.set(p, body);
    return [p, body.length, sha(body)];
  });
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(url);
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const [p] = url.split('?');
    const key = p.startsWith('/media/') ? mediaKeys(p).find((k) => bodies.has(k)) : p;
    const body = bodies.get(key);
    return body ? new Response(body, { headers: { 'Content-Type': 'application/octet-stream' } }) : new Response('nope', { status: 404 });
  };
  const doc = { format: RESOURCES_FORMAT, version: 'v1', files: entries };
  return { doc, manifest: parseManifest(doc), bodies, fetcher, calls };
}

test('packs: visuals, music / sfx / guide art, and one pack per voice language', () => {
  assert.equal(packOf('/assets/spine/char_x/a.skel'), 'visual');
  assert.equal(packOf('/fonts/bender.woff2'), 'visual');
  assert.equal(packOf('/assets/local/map/fx/%5Bopt%5Dmerged.png'), 'visual');
  assert.equal(packOf('/assets/audio/bgm/act1.mp3'), 'audio');
  assert.equal(packOf('/assets/audio/sfx/hit.mp3'), 'audio');
  assert.equal(packOf('/assets/local/guide/p1.png'), 'audio', 'tutorial art rides with tier 2');
  for (const l of ['cn', 'en', 'jp', 'kr', 'native']) assert.equal(packOf(`/assets/audio/voice/${l}/char_a/x.mp3`), l);
});

test('keys: one key for encoded and raw brackets; /media/… maps to the stored audio files', () => {
  assert.equal(resourceKey('/assets/x/[opt]a.png'), '/assets/x/%5Bopt%5Da.png');
  assert.equal(resourceKey('/assets/x/%5Bopt%5Da.png'), '/assets/x/%5Bopt%5Da.png');
  assert.deepEqual(mediaKeys('/media/bgm/act1').slice(0, 2), ['/assets/audio/bgm/act1.mp3', '/assets/audio/bgm/act1.m4a']);
  assert.equal(mediaKeys('/media/bgm/act1.ogg')[0], '/assets/audio/bgm/act1.ogg');
  assert.deepEqual(mediaKeys('/media/../x'), []);
  assert.deepEqual(mediaKeys('/assets/x.png'), []);
  assert.equal(formatBytes(470e6), '470 MB');
});

test('the worker\'s copy of the path rules matches shared/resources.js', () => {
  const sw = loadWorker();
  for (const p of ['/assets/x/[opt]a.png', '/assets/x/%5Bopt%5Da.png', '/assets/a b.png', '/assets/%E4%B8%AD.png', '/assets/%zz.png']) {
    assert.equal(sw.spResources.resourceKey(p), resourceKey(p), p);
  }
  for (const p of ['/assets/audio/voice/kr/a/1.mp3', '/assets/audio/voice/xx/a/1.mp3', '/assets/audio/bgm/a.mp3', '/assets/local/guide/p.png', '/assets/ui/guide/p.png', '/assets/spine/a.skel']) {
    assert.equal(sw.spResources.packOf(p), packOf(p), p);
  }
  for (const p of ['/media/bgm/act1', '/media/voice/en/char_a/cn_001.mp3', '/media/x.wav', '/media/.x', '/media/']) {
    assert.deepEqual([...sw.spResources.mediaKeys(p)], mediaKeys(p), p);
  }
});

test('parseManifest refuses entries it cannot trust', () => {
  const ok = { format: RESOURCES_FORMAT, version: 'v', files: [['/assets/a.png', 3, 'abcdefabcdef']] };
  assert.equal(parseManifest(ok).files[0].pack, 'visual');
  const bad = (files) => assert.throws(() => parseManifest({ ...ok, files }));
  bad([['/js/main.js', 3, 'abcdefabcdef']]);
  bad([['/media/bgm/a', 3, 'abcdefabcdef']]);
  bad([['/assets/a.png?x', 3, 'abcdefabcdef']]);
  bad([['/assets/[a].png', 3, 'abcdefabcdef']]);
  bad([['/assets/a.png', -1, 'abcdefabcdef']]);
  bad([['/assets/a.png', 3, 'XYZ']]);
  assert.throws(() => parseManifest({ ...ok, format: 1 }));
});

test('server manifest: every file with size + SHA-1, hash cache reused, served gzip with an ETag', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-res-'));
  const pub = path.join(dir, 'public');
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(pub, rel)), { recursive: true }); fs.writeFileSync(path.join(pub, rel), text); };
  write('assets/ui/a.png', 'aaa');
  write('assets/local/map/fx/[opt]m.png', 'mm');
  write('assets/audio/voice/en/char_a/cn_001.mp3', 'voice');
  write('assets/.DS_Store', 'x');
  write('fonts/f.woff2', 'font');
  write('js/main.js', 'code');
  const cache = path.join(dir, 'hashes.json');
  try {
    const m = await buildResourceManifest({ publicDir: pub, hashCacheFile: cache });
    assert.deepEqual(m.files.map((f) => f[0]), ['/assets/audio/voice/en/char_a/cn_001.mp3', '/assets/local/map/fx/%5Bopt%5Dm.png', '/assets/ui/a.png', '/fonts/f.woff2']);
    assert.deepEqual(m.files[2], ['/assets/ui/a.png', 3, sha('aaa')]);
    assert.equal(m.totalBytes, 3 + 2 + 5 + 4);
    assert.doesNotThrow(() => parseManifest(m), 'the client accepts what the server writes');
    const cached = JSON.parse(fs.readFileSync(cache, 'utf8'));
    cached.files['/assets/ui/a.png'].hash = 'fromthecache'; // proves the second build reads the cache instead of the file
    fs.writeFileSync(cache, JSON.stringify(cached));
    const again = await buildResourceManifest({ publicDir: pub, hashCacheFile: cache });
    assert.equal(again.files[2][2], 'fromthecache');

    const handler = createStaticHandler({ publicDir: pub, dataDir: path.join(dir, 'data'), sharedDir: path.join(ROOT, 'shared') });
    const srv = http.createServer((req, res) => { const [p, q] = req.url.split('?'); handler(req, res, p, q || ''); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const get = (headers = {}) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: srv.address().port, path: '/data/resource-manifest.json', headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
    try {
      const a = await get({ 'Accept-Encoding': 'gzip' });
      assert.equal(a.status, 200);
      assert.equal(a.headers['content-encoding'], 'gzip');
      assert.equal(a.headers['cache-control'], 'no-cache');
      const doc = JSON.parse((await import('node:zlib')).gunzipSync(a.body).toString());
      assert.equal(doc.files.length, 4);
      const b = await get({ 'If-None-Match': a.headers.etag });
      assert.equal(b.status, 304);
    } finally { await new Promise((r) => srv.close(r)); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('store: downloads ?v= URLs (audio via /media/), verifies, indexes, resumes, and re-fetches only changed files', async () => {
  const fx = fixture([['/assets/ui/a.png', 'aaa'], ['/assets/audio/bgm/b.mp3', 'bgm'], ['/assets/audio/voice/en/char_a/cn_1.mp3', 'en'],
    ['/assets/audio/voice/jp/char_a/cn_1.mp3', 'jp']]);
  const caches = memoryCaches();
  const st = new PreloadStore(fx.manifest, { caches, fetcher: fx.fetcher, origin: ORIGIN });
  const res = await st.download({ packs: ['visual', 'audio', 'en'] });
  assert.equal(res.complete, true);
  assert.deepEqual(fx.calls.sort(), [`/assets/ui/a.png?v=${sha('aaa')}`, `/media/bgm/b?v=${sha('bgm')}`, `/media/voice/en/char_a/cn_1?v=${sha('en')}`].sort());
  const status = await st.status();
  assert.equal(status.packs.en.doneFiles, 1);
  assert.equal(status.packs.jp.doneFiles, 0, 'an unticked pack is not downloaded');
  const saved = await (await caches.open(CACHE_NAME)).match(`${ORIGIN}/assets/ui/a.png`);
  assert.equal(saved.headers.get('X-SP-Resource'), sha('aaa'), 'each entry carries the hash of its bytes');

  fx.calls.length = 0;
  await st.download({ packs: ['visual', 'audio', 'en'] });
  assert.deepEqual(fx.calls, [], 'nothing is fetched twice');

  // a deploy changes one file: only that one goes again, and the old bytes are gone before the download
  const changed = fixture([['/assets/ui/a.png', 'AAA2'], ['/assets/audio/bgm/b.mp3', 'bgm'], ['/assets/audio/voice/en/char_a/cn_1.mp3', 'en']]);
  const st2 = new PreloadStore(changed.manifest, { caches, fetcher: changed.fetcher, origin: ORIGIN });
  assert.equal((await st2.status()).packs.visual.doneFiles, 0, 'an outdated file does not count as saved');
  await st2.download({ packs: ['visual', 'audio', 'en'] });
  assert.deepEqual(changed.calls, [`/assets/ui/a.png?v=${sha('AAA2')}`]);
  const stored = await (await caches.open(CACHE_NAME)).match(`${ORIGIN}/assets/ui/a.png`);
  assert.equal(await stored.text(), 'AAA2');
  const keys = (await (await caches.open(CACHE_NAME)).keys()).map((k) => k.url);
  assert.ok(!keys.includes(`${ORIGIN}/assets/audio/voice/jp/char_a/cn_1.mp3`), 'a complete run drops files the manifest no longer lists');
});

test('store: a bad checksum fails that file only; an abort keeps what was saved', async () => {
  const fx = fixture([['/assets/ui/a.png', 'aaa'], ['/assets/ui/b.png', 'bbb']]);
  const lying = async (url, init) => (url.startsWith('/assets/ui/b.png') ? new Response('xxx') : fx.fetcher(url, init));
  const caches = memoryCaches();
  const st = new PreloadStore(fx.manifest, { caches, fetcher: lying, origin: ORIGIN });
  const res = await st.download({ packs: ['visual'] });
  assert.equal(res.failed, 1);
  assert.equal(res.complete, false);
  assert.equal(res.failures[0].path, '/assets/ui/b.png');
  assert.equal((await st.status()).packs.visual.doneFiles, 1);

  const ctl = new AbortController();
  const slow = new PreloadStore(fixture([['/assets/ui/c.png', 'c'], ['/assets/ui/d.png', 'd']]).manifest, { caches: memoryCaches(), origin: ORIGIN, smallLanes: 1,
    fetcher: async (url, init) => { ctl.abort(); return fx.fetcher(url, init); } });
  await assert.rejects(slow.download({ packs: ['visual'], signal: ctl.signal }), { name: 'AbortError' });
});

test('store: a full disk stops the run with QuotaExceededError', async () => {
  const fx = fixture([['/assets/ui/a.png', 'aaa'], ['/assets/ui/b.png', 'bbb']]);
  const caches = memoryCaches();
  const realOpen = caches.open;
  caches.open = async (n) => {
    const c = await realOpen(n);
    const put = c.put;
    c.put = async (url, res) => {
      if (String(url).endsWith('.png')) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      return put(url, res);
    };
    return c;
  };
  const st = new PreloadStore(fx.manifest, { caches, fetcher: fx.fetcher, origin: ORIGIN });
  await assert.rejects(st.download({ packs: ['visual'] }), { name: 'QuotaExceededError' });
});

test('store: removePacks deletes one voice pack', async () => {
  const fx = fixture([['/assets/audio/voice/en/char_a/1.mp3', 'en'], ['/assets/audio/voice/jp/char_a/1.mp3', 'jp']]);
  const st = new PreloadStore(fx.manifest, { caches: memoryCaches(), fetcher: fx.fetcher, origin: ORIGIN });
  await st.download({ packs: ['en', 'jp'] });
  assert.equal(await st.removePacks(['jp']), 1);
  const s = await st.status();
  assert.equal(s.packs.jp.doneFiles, 0);
  assert.equal(s.packs.en.doneFiles, 1);
});

/** Run public/resource-sw.js in a sandbox with the given caches / fetch. */
function loadWorker({ caches = memoryCaches(), fetchImpl = async () => new Response('net') } = {}) {
  const listeners = {};
  const self = { location: { origin: ORIGIN }, caches, fetch: fetchImpl, crypto: globalThis.crypto, addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  self.self = self;
  const ctx = vm.createContext({ self, URL, Response, Headers, Promise, encodeURI, decodeURI, String, Number, Math, Set, Map, Object, Date, JSON, console, fetch: fetchImpl });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'resource-sw.js'), 'utf8'), ctx);
  return { ...self, listeners };
}

test('worker: answers current files (also via /media/ and Range), passes outdated ones, ?v= and code through', async () => {
  const fx = fixture([['/assets/ui/a.png', 'aaa'], ['/assets/audio/bgm/b.mp3', 'bgm-bytes'], ['/assets/ui/old.png', 'old']]);
  const caches = memoryCaches();
  await new PreloadStore(fx.manifest, { caches, fetcher: fx.fetcher, origin: ORIGIN }).download({ packs: ['visual', 'audio'] });
  // the server now lists a new old.png: the stored one must not be served
  const live = { ...fx.doc, files: fx.doc.files.map((f) => (f[0] === '/assets/ui/old.png' ? [f[0], 3, 'ffffffffffff'] : f)) };
  const sw = loadWorker({ caches, fetchImpl: async (url) => (url === '/data/resource-manifest.json' ? new Response(JSON.stringify(live)) : new Response('net')) });
  const ask = (p, headers = {}) => sw.spResources.answer(sw, new Request(ORIGIN + p, { headers }));
  assert.equal(await (await ask('/assets/ui/a.png')).text(), 'aaa');
  assert.equal(await (await ask('/media/bgm/b')).text(), 'bgm-bytes');
  const part = await ask('/media/bgm/b', { Range: 'bytes=0-2' });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), 'bgm');
  assert.equal(await ask('/assets/ui/old.png'), null, 'outdated bytes go to the network');
  assert.equal(await ask('/assets/ui/a.png?v=123'), null, 'the preload\'s own downloads pass through');
  assert.equal(await ask('/js/main.js'), null);
});

test('voice packs follow the voice language settings until the player edits the list', () => {
  assert.deepEqual(sanitizePreloadPref(null), { started: false, paused: false, voice: null });
  assert.deepEqual(sanitizePreloadPref({ started: true, voice: ['kr', 'xx', 'en'] }), { started: true, paused: false, voice: ['en', 'kr'] });
  assert.deepEqual(voicePacksOf({ default: 'en', byChar: { char_a: 'jp', char_b: 'native' } }), ['en', 'jp', 'native']);
  voiceLangStore.set({ default: 'jp', byChar: { char_a: 'native' } });
  followVoiceSettings();
  assert.deepEqual(tickedVoicePacks(), ['jp', 'native'], 'ticked from the current voice settings');
  voiceLangStore.set({ default: 'en', byChar: {} });
  assert.deepEqual(tickedVoicePacks(), ['en'], 'and following them while untouched');
  setVoicePack('kr', true);
  assert.deepEqual(preloadPref.get().voice, ['en', 'kr']);
  voiceLangStore.set({ default: 'cn', byChar: {} });
  assert.deepEqual(tickedVoicePacks(), ['en', 'kr'], 'an edited list stays as edited');
  followVoiceSettings();
  assert.deepEqual(tickedVoicePacks(), ['cn']);
  const packs = { visual: { bytes: 100, doneBytes: 40 }, audio: { bytes: 10, doneBytes: 10 }, cn: { bytes: 5, doneBytes: 0 }, jp: { bytes: 7, doneBytes: 0 } };
  assert.equal(missingBytes(packs, ['cn']), 65);
});

test('lifecycle: no "off" — pause keeps the set started (and in use), only Clear Cache ends it', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/resources/index.js'), 'utf8');
  assert.ok(!/export (async )?function turnOff/.test(src), 'there is no way to switch a downloaded set off without deleting it');
  preloadPref.set({ started: true, paused: false, voice: null });
  pausePreload();
  assert.deepEqual({ ...preloadPref.get(), voice: null }, { started: true, paused: true, voice: null }, 'paused, still started: the worker stays');
});

test('worker: a file the game fetches is saved on the way (picked packs only, verified), and the download then skips it', async () => {
  const fx = fixture([['/assets/ui/a.png', 'aaa'], ['/assets/audio/bgm/b.mp3', 'bgm-bytes'], ['/assets/audio/voice/jp/char_a/1.mp3', 'jp'],
    ['/assets/ui/bad.png', 'good']]);
  const caches = memoryCaches();
  const st = new PreloadStore(fx.manifest, { caches, fetcher: fx.fetcher, origin: ORIGIN });
  await st.setCapturePacks(['visual', 'audio']);
  const net = async (req) => {
    const p = new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname;
    if (p === '/data/resource-manifest.json') return new Response(JSON.stringify(fx.doc));
    if (p === '/assets/ui/bad.png') return new Response('evil');
    return fx.fetcher(p);
  };
  const sw = loadWorker({ caches, fetchImpl: net });
  const game = async (p) => {
    const ev = { request: new Request(ORIGIN + p), waits: [], waitUntil(pr) { this.waits.push(pr); } };
    const res = await sw.spResources.respond(sw, ev);
    await Promise.all(ev.waits);
    return res;
  };
  assert.equal(await (await game('/assets/ui/a.png')).text(), 'aaa', 'the game gets its bytes from the network');
  await game('/media/bgm/b');
  await game('/media/voice/jp/char_a/1');
  await game('/assets/ui/bad.png');
  const cache = await caches.open(CACHE_NAME);
  assert.equal((await cache.match(`${ORIGIN}/assets/ui/a.png`)).headers.get('X-SP-Resource'), sha('aaa'), 'saved with its hash');
  assert.ok(await cache.match(`${ORIGIN}/assets/audio/bgm/b.mp3`), '/media/ audio saved under its file path');
  assert.equal(await cache.match(`${ORIGIN}/assets/audio/voice/jp/char_a/1.mp3`), undefined, 'an unpicked voice pack is not saved');
  assert.equal(await cache.match(`${ORIGIN}/assets/ui/bad.png`), undefined, 'bytes that fail the hash are not saved');
  assert.equal(await (await sw.spResources.answer(sw, new Request(`${ORIGIN}/assets/ui/a.png`))).text(), 'aaa', 'and served from the cache next time');

  fx.calls.length = 0;
  const res = await st.download({ packs: ['visual', 'audio'] });
  assert.deepEqual(fx.calls, [`/assets/ui/bad.png?v=${sha('good')}`], 'the download fetches only what the game did not');
  assert.equal(res.packs.visual.doneFiles, 2);
});

test('worker: nothing is saved before a download was started (no packs entry)', async () => {
  const fx = fixture([['/assets/ui/a.png', 'aaa']]);
  const caches = memoryCaches();
  const sw = loadWorker({ caches, fetchImpl: async (req) => (new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname === '/data/resource-manifest.json' ? new Response(JSON.stringify(fx.doc)) : fx.fetcher('/assets/ui/a.png')) });
  const ev = { request: new Request(`${ORIGIN}/assets/ui/a.png`), waits: [], waitUntil(pr) { this.waits.push(pr); } };
  await sw.spResources.respond(sw, ev);
  await Promise.all(ev.waits);
  assert.equal(await (await caches.open(CACHE_NAME)).match(`${ORIGIN}/assets/ui/a.png`), undefined);
  assert.equal(PACKS_PATH, '/__sp-resource-packs__', 'the page and the worker use the same entry');
  assert.ok(fs.readFileSync(path.join(ROOT, 'public', 'resource-sw.js'), 'utf8').includes("const PACKS_PATH = '/__sp-resource-packs__';"));
});
