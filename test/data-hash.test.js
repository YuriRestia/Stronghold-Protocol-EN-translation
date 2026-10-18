// (fork) Content-hashed URLs of the big data files (shared/dataHash.js, host bandwidth): /data/h/<hash>/<name> is
// immutable while <hash> is current (a CDN keeps it), any other hash gets the current file with no-cache, a generation's
// index.html names the hashes, and the page builds its URLs from them (public/js/dataUrls.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createStaticHandler } from '../server/index.js';
import { dataHashPath, splitDataHash, formatDataHashes, parseDataHashes } from '../shared/dataHash.js';
import { readDataHashes, dataUrl, hasDataHash } from '../public/js/dataUrls.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEW_HASH = '0123456789abcdef';
const RES_HASH = 'abcdef012345';

test('dataHashPath / splitDataHash round-trip, and refuse what they do not know', () => {
  assert.equal(dataHashPath('assets.json', VIEW_HASH), `/data/h/${VIEW_HASH}/assets.json`);
  assert.deepEqual(splitDataHash(`/data/h/${VIEW_HASH}/assets.json`), { hash: VIEW_HASH, name: 'assets.json' });
  assert.equal(dataHashPath('chess.json', VIEW_HASH), '/data/chess.json', 'only the big files are hashed');
  assert.equal(dataHashPath('assets.json', 'NOT-HEX'), '/data/assets.json');
  assert.equal(dataHashPath('assets.json', null), '/data/assets.json');
  for (const p of ['/data/assets.json', `/data/h/${VIEW_HASH}/chess.json`, `/data/h/${VIEW_HASH}/sub/assets.json`, '/data/h/zz/assets.json', '/data/h/assets.json']) {
    assert.equal(splitDataHash(p), null, p);
  }
  const text = formatDataHashes({ 'assets.json': VIEW_HASH, 'resource-manifest.json': RES_HASH, 'chess.json': VIEW_HASH, 'local-fx.json': 'bad!' });
  assert.equal(text, `assets.json:${VIEW_HASH},resource-manifest.json:${RES_HASH}`);
  assert.deepEqual(parseDataHashes(text), { 'assets.json': VIEW_HASH, 'resource-manifest.json': RES_HASH });
  assert.deepEqual(parseDataHashes('garbage,:x,assets.json:'), {});
});

test('the page builds hashed URLs only for the files its meta tag names', () => {
  const doc = { querySelector: (s) => (s === 'meta[name="sp-data-hashes"]' ? { getAttribute: () => `assets.json:${VIEW_HASH}` } : null) };
  const hashes = readDataHashes(doc);
  assert.deepEqual(hashes, { 'assets.json': VIEW_HASH });
  assert.equal(dataUrl('assets.json', hashes), `/data/h/${VIEW_HASH}/assets.json`);
  assert.equal(dataUrl('local-fx.json', hashes), '/data/local-fx.json');
  assert.equal(hasDataHash('assets.json', hashes), true);
  assert.equal(hasDataHash('local-fx.json', hashes), false);
  assert.deepEqual(readDataHashes(null), {});
  assert.deepEqual(readDataHashes({ querySelector: () => null }), {});
});

function serve({ views, resources }) {
  const handler = createStaticHandler({ publicDir: path.join(ROOT, 'public'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sp-dh-')), sharedDir: path.join(ROOT, 'shared'), views, resources });
  const srv = http.createServer((req, res) => {
    const [p, q] = req.url.split('?');
    const gen = p.startsWith('/_build/g1/') ? { gen: 'g1', base: '/_build/g1' } : null;
    handler(req, res, gen ? p.slice('/_build/g1'.length) : p, q || '', gen);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

function get(srv, url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.address().port, path: url, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, cc: res.headers['cache-control'], etag: res.headers.etag, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const fakeViews = (ready = true) => ({
  get: async (name) => (ready && name === 'assets.json' ? { body: Buffer.from('{"view":1}'), hash: VIEW_HASH } : null),
});

/** A stand-in of server/resources.js createResourceManifest (its serve() / version() contract). */
function fakeResources() {
  const body = Buffer.from('{"files":[]}');
  return {
    version: () => RES_HASH,
    get: async () => ({}),
    async serve(req, res, _which = 'full', o = {}) {
      const cc = o.hash && o.hash === RES_HASH && o.cacheControl ? o.cacheControl : 'no-cache';
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': cc, ETag: `"res-${RES_HASH}"` });
      res.end(body);
    },
  };
}

test('/data/h/: the current hash is immutable, another hash the current file with no-cache, plain URLs unchanged', async () => {
  const srv = await serve({ views: fakeViews(), resources: fakeResources() });
  try {
    const cur = await get(srv, `/data/h/${VIEW_HASH}/assets.json`);
    assert.equal(cur.status, 200);
    assert.match(cur.cc, /immutable/);
    assert.equal(cur.body, '{"view":1}');
    const old = await get(srv, '/data/h/ffffffffffffffff/assets.json');
    assert.equal(old.status, 200);
    assert.equal(old.cc, 'no-cache', 'an old page\'s hash never caches today\'s bytes for a year');
    assert.equal(old.body, '{"view":1}');
    assert.equal((await get(srv, '/data/assets.json')).cc, 'no-cache');
    const res = await get(srv, `/data/h/${RES_HASH}/resource-manifest.json`);
    assert.match(res.cc, /immutable/);
    assert.equal((await get(srv, '/data/h/000000000000/resource-manifest.json')).cc, 'no-cache');
    assert.equal((await get(srv, '/data/resource-manifest.json')).cc, 'no-cache');
    // no view for the file (absent local art): the plain file's answer, never immutable
    const local = await get(srv, `/data/h/${VIEW_HASH}/local-assets.json`);
    assert.equal(local.status, 200);
    assert.doesNotMatch(local.cc || '', /immutable/);
    assert.deepEqual(JSON.parse(local.body).groups, {});
  } finally { srv.close(); }
});

test('a generation\'s index.html names the ready hashes; without views only the preload manifest', async () => {
  const srv = await serve({ views: fakeViews(), resources: fakeResources() });
  try {
    const page = await get(srv, '/_build/g1/');
    assert.equal(page.status, 200);
    assert.match(page.body, new RegExp(`<meta name="sp-data-hashes" content="assets.json:${VIEW_HASH},resource-manifest.json:${RES_HASH}" />\\s*</head>`));
    assert.equal((await get(srv, '/')).body.includes('sp-data-hashes'), false, 'a plain index.html keeps the plain URLs');
  } finally { srv.close(); }
  const bare = await serve({ views: fakeViews(false), resources: fakeResources() });
  try {
    assert.match((await get(bare, '/_build/g1/')).body, new RegExp(`content="resource-manifest.json:${RES_HASH}"`));
  } finally { bare.close(); }
});
