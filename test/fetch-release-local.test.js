// test/fetch-release-local.test.js — tools/fetch-release-local.mjs: the local-client art of a full release zip, read
// with range requests (a fake fetch over an in-memory zip that, like GitHub's storage, refuses suffix ranges), staged
// with CRC checks and swapped in with the previous files moved aside.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { run, crc32, parseCentralDirectory, selectLocalEntries, groupRanges, withEnds } from '../tools/fetch-release-local.mjs';

/** A zip (stored and deflated entries, one central directory) of { name: Buffer|string } — names ending '/' are dirs. */
function makeZip(files, { badCrc = null } = {}) {
  const locals = [], centrals = [];
  let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content ?? '');
    const deflate = data.length > 64;
    const body = deflate ? zlib.deflateRawSync(data) : data;
    const crc = name === badCrc ? (crc32(data) ^ 1) >>> 0 : crc32(data);
    const n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(off, 42);
    locals.push(lh, n, body); centrals.push(ch, n);
    off += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/** fetch over `zip` at any URL: explicit byte ranges only (bytes=-N → 501, as GitHub's storage answers). */
function fakeFetch(zip) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const range = init.headers?.Range;
    calls.push(range);
    const m = /^bytes=(\d+)-(\d+)$/.exec(range || '');
    if (!m) return new Response(null, { status: range ? 501 : 200 });
    const a = Number(m[1]), b = Math.min(Number(m[2]), zip.length - 1);
    return new Response(zip.subarray(a, b + 1), { status: 206, headers: { 'content-range': `bytes ${a}-${b}/${zip.length}` } });
  };
  return { impl, calls };
}

const big = (ch) => Buffer.alloc(5000, ch);
const FILES = {
  'Stronghold-Protocol/': '',
  'Stronghold-Protocol/server/index.js': 'code from the zip, never installed',
  'Stronghold-Protocol/public/assets/local/': '',
  'Stronghold-Protocol/public/assets/local/map/autochess/tiles.json': '{"tiles":1}',
  'Stronghold-Protocol/public/assets/local/spine/enemy/a.skel': big('a'),
  'Stronghold-Protocol/public/assets/local/scene/act/b.png': big('b'),
  'Stronghold-Protocol/public/assets/other/c.png': 'not local art',
  'Stronghold-Protocol/data/local-assets.json': '{"groups":{"map/autochess":{"tiles":1}}}',
  'Stronghold-Protocol/data/chess.json': '{"not":"installed"}',
};

function checkout(version = '0.2.5') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-release-local-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
  return root;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const quiet = { log: () => {}, now: () => new Date('2026-10-21T00:00:00Z') };

test('installs only public/assets/local/ and data/local-assets.json, from v<package.json version>, by range requests', async (t) => {
  const root = checkout(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const zip = makeZip(FILES);
  const f = fakeFetch(zip);
  let asked;
  const impl = (url, init) => { asked ??= url; return f.impl(url, init); };
  const r = await run({ repo: 'o/r' }, { ...quiet, root, fetchImpl: impl });
  assert.equal(asked, 'https://github.com/o/r/releases/download/v0.2.5/Stronghold-Protocol-v0.2.5.zip');
  assert.deepEqual([r.tag, r.files, r.installed, r.previous], ['v0.2.5', 4, true, null]);
  assert.equal(read(root, 'public/assets/local/map/autochess/tiles.json'), '{"tiles":1}');
  assert.equal(read(root, 'public/assets/local/spine/enemy/a.skel'), 'a'.repeat(5000), 'a deflated entry');
  assert.equal(read(root, 'data/local-assets.json'), FILES['Stronghold-Protocol/data/local-assets.json']);
  for (const rel of ['server/index.js', 'data/chess.json', 'public/assets/other/c.png']) assert.equal(fs.existsSync(path.join(root, rel)), false, rel);
  assert.ok(f.calls.every((c) => /^bytes=\d+-\d+$/.test(c)), `explicit ranges only: ${f.calls}`);
  assert.equal(fs.existsSync(path.join(root, '.cache/release-local/v0.2.5')), false, 'the staging dir is gone');
});

test('the previous local art is moved aside, never deleted; a re-run of the same release changes nothing', async (t) => {
  const root = checkout(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'public/assets/local/old'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public/assets/local/old/x.png'), 'mine');
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/local-assets.json'), '{"old":true}');
  const zip = makeZip(FILES);
  const r = await run({ repo: 'o/r' }, { ...quiet, root, fetchImpl: fakeFetch(zip).impl });
  assert.equal(path.relative(root, r.previous), path.join('.cache', 'release-local', 'previous-2026-10-21T00-00-00-000Z'));
  assert.equal(fs.readFileSync(path.join(r.previous, 'public-assets-local/old/x.png'), 'utf8'), 'mine');
  assert.equal(fs.readFileSync(path.join(r.previous, 'local-assets.json'), 'utf8'), '{"old":true}');
  assert.equal(fs.existsSync(path.join(root, 'public/assets/local/old')), false);

  const f = fakeFetch(zip);
  const again = await run({ repo: 'o/r' }, { ...quiet, root, fetchImpl: f.impl });
  assert.deepEqual([again.installed, again.downloaded, again.previous], [false, 0, null]);
  assert.equal(f.calls.length, 3, 'size, tail, central directory — no entry fetched');
});

test('an interrupted run resumes: staged files with the right CRC are not fetched again', async (t) => {
  const root = checkout(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const zip = makeZip(FILES);
  const stage = path.join(root, '.cache/release-local/v0.2.5');
  fs.mkdirSync(path.join(stage, 'public/assets/local/spine/enemy'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'public/assets/local/spine/enemy/a.skel'), big('a'));
  fs.mkdirSync(path.join(stage, 'public/assets/local/scene/act'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'public/assets/local/scene/act/b.png'), 'wrong bytes');
  const r = await run({ repo: 'o/r' }, { ...quiet, root, fetchImpl: fakeFetch(zip).impl });
  assert.deepEqual([r.files, r.downloaded], [4, 3], 'the good staged file is kept');
  assert.equal(read(root, 'public/assets/local/scene/act/b.png'), 'b'.repeat(5000), 'a wrong staged file is fetched again');
  assert.equal(read(root, 'public/assets/local/spine/enemy/a.skel'), 'a'.repeat(5000));
});

test('a CRC mismatch fails the run and swaps nothing in; a zip without data/local-assets.json is refused', async (t) => {
  const root = checkout(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'public/assets/local'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public/assets/local/keep.png'), 'mine');
  const bad = makeZip(FILES, { badCrc: 'Stronghold-Protocol/public/assets/local/scene/act/b.png' });
  await assert.rejects(run({ repo: 'o/r' }, { ...quiet, root, fetchImpl: fakeFetch(bad).impl }), /CRC/);
  assert.equal(read(root, 'public/assets/local/keep.png'), 'mine');
  const lite = { ...FILES }; delete lite['Stronghold-Protocol/data/local-assets.json'];
  await assert.rejects(run({ repo: 'o/r' }, { ...quiet, root, fetchImpl: fakeFetch(makeZip(lite)).impl }), /no data\/local-assets\.json/);
  assert.equal(read(root, 'public/assets/local/keep.png'), 'mine');
});

test('a server without range support is reported, not read whole', async (t) => {
  const root = checkout(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const impl = async () => new Response('whole file', { status: 200 });
  await assert.rejects(run({ url: 'https://example.test/x.zip' }, { ...quiet, root, fetchImpl: impl }), /HTTP 200, expected 206/);
});

test('entry selection: one optional top folder, no directories, nothing that leaves the target', () => {
  const zip = makeZip({
    'public/assets/local/a.png': 'x', 'top/public/assets/local/b/c.png': 'x', 'top/public/assets/local/d/': '',
    'top/public/assets/local/../../../evil.js': 'x', 'top/public/assets/local/e\\f.png': 'x', 'a/b/public/assets/local/g.png': 'x',
    'top/data/local-assets.json': '{}', 'top/data/local-assets.json.bak': '{}',
  });
  const cdStart = zip.readUInt32LE(zip.length - 6), cdSize = zip.readUInt32LE(zip.length - 10);
  const all = parseCentralDirectory(zip.subarray(cdStart, cdStart + cdSize));
  assert.deepEqual(selectLocalEntries(all).map((e) => e.rel), ['public/assets/local/a.png', 'public/assets/local/b/c.png', 'data/local-assets.json']);
  // range groups: adjacent entries merge until the size cap
  const ends = withEnds(all, all, cdStart);
  assert.equal(groupRanges(ends).length, 1);
  assert.equal(groupRanges(ends, { max: 1 }).length, all.length);
});
