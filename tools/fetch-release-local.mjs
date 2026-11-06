#!/usr/bin/env node
// tools/fetch-release-local.mjs — the local-client art (public/assets/local/ + data/local-assets.json) of a full
// release zip, for an install that has no Arknights client to extract it from (a Linux server running from source or
// from the lite package; docs/DEPLOY.md §6 says to copy these two from the full package of the same version).
//
//   node tools/fetch-release-local.mjs [options]
//
// It reads only the zip's central directory (a few MB) and then the entries it needs with HTTP range requests — about
// 200 MB of the ~800 MB zip — so the zip itself is never downloaded or unpacked whole. The rest of the source tree
// (code, data, other assets: any dev or gameplay changes of this checkout) is not touched; both targets are
// git-ignored.
//
// Steps:
//   1. The release: v<package.json version> by default (the same version as this code, as DEPLOY.md asks), --tag to
//      pick another, --latest for the newest. Its full zip is Stronghold-Protocol-<tag>.zip (not -lite / -update).
//   2. The zip's central directory → the entries under <top>/public/assets/local/ and <top>/data/local-assets.json.
//   3. Each entry into .cache/release-local/<tag>/ (CRC-checked; an entry already there with the right size and CRC
//      is kept, so an interrupted run resumes), adjacent entries fetched together in ranges of up to 16 MB.
//   4. Swapped in: a current public/assets/local/ and data/local-assets.json are moved to
//      .cache/release-local/previous-<time>/ (never deleted), then the staged ones take their place.
//
// Options:
//   --tag <tag>      release tag (e.g. v0.3.1); default v<package.json version>
//   --latest         the newest release instead
//   --repo <o/name>  GitHub repository (default sganggs/Stronghold-Protocol)
//   --url <zip url>  a full-package zip at any URL (must answer range requests); overrides --tag / --latest / --repo
//   --dry-run        list what would be fetched (entries, bytes), change nothing
//   --quiet          fewer lines
//   -h, --help
//
// Exit code: 0 = installed (or nothing to do / dry run), 1 = failed (nothing was swapped in).
// Afterwards `node tools/doctor.mjs` shows the local entry count and whether the 3D board is available.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_REPO = 'sganggs/Stronghold-Protocol';
const GROUP_MAX = 16 * 1024 * 1024;   // one range request at most
const GROUP_GAP = 256 * 1024;         // entries this close are fetched in one range (the gap is read and dropped)
const RETRIES = 3;

// ---------------------------------------------------------------------------------------------------
// HTTP range reads
// ---------------------------------------------------------------------------------------------------

/**
 * Bytes [start, end) of `url`, with retries.
 * @returns {Promise<{ buf: Buffer, total: number }>} `total` = the whole file's size (Content-Range)
 */
export async function readRange(url, start, end, { fetchImpl = fetch } = {}) {
  const range = `bytes=${start}-${end - 1}`;
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await fetchImpl(url, { headers: { Range: range } });
      if (res.status === 404) throw Object.assign(new Error(`not found: ${url}`), { fatal: true });
      if (res.status !== 206) throw Object.assign(new Error(`${url}: HTTP ${res.status}, expected 206 (the server must answer range requests)`), { fatal: res.status === 200 });
      const total = Number(/\/(\d+)$/.exec(res.headers.get('content-range') || '')?.[1]);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== end - start) throw new Error(`${url}: got ${buf.length} bytes of ${range}`);
      return { buf, total };
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------------------------------
// Zip central directory
// ---------------------------------------------------------------------------------------------------

/** End of central directory (with the zip64 record when present) → { cdOffset, cdSize, count }. */
export async function readEocd(url, opts) {
  // the size first (a 1-byte read: GitHub's storage refuses suffix ranges like bytes=-N), then the tail
  const { total } = await readRange(url, 0, 1, opts);
  const from = Math.max(0, total - (65536 + 22));
  const { buf: tail } = await readRange(url, from, total, opts);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { at = i; break; }
  if (at < 0) throw new Error('not a zip: no end-of-central-directory record');
  let count = tail.readUInt16LE(at + 10), cdSize = tail.readUInt32LE(at + 12), cdOffset = tail.readUInt32LE(at + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = at - 20;
    if (loc < 0 || tail.readUInt32LE(loc) !== 0x07064b50) throw new Error('zip64 locator missing');
    const z64 = Number(tail.readBigUInt64LE(loc + 8));
    const { buf } = await readRange(url, z64, z64 + 56, opts);
    if (buf.readUInt32LE(0) !== 0x06064b50) throw new Error('zip64 end-of-central-directory record missing');
    count = Number(buf.readBigUInt64LE(32)); cdSize = Number(buf.readBigUInt64LE(40)); cdOffset = Number(buf.readBigUInt64LE(48));
  }
  return { cdOffset, cdSize, count, total };
}

/** The central directory's entries: { name, method, flags, crc, csize, size, offset } in file order. */
export function parseCentralDirectory(cd) {
  const out = [];
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
    const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16);
    let csize = cd.readUInt32LE(p + 20), size = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28), elen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nlen);
    // zip64 extra field (0x0001): the 64-bit values, in this order, for the 32-bit ones that are 0xFFFFFFFF
    for (let e = p + 46 + nlen, eEnd = e + elen; e + 4 <= eEnd;) {
      const id = cd.readUInt16LE(e), len = cd.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (offset === 0xffffffff) { offset = Number(cd.readBigUInt64LE(q)); }
      }
      e += 4 + len;
    }
    out.push({ name, method, flags, crc, csize, size, offset });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/**
 * The entries to install, each with its repo-relative `rel` path: files under `<top>/public/assets/local/` and
 * `<top>/data/local-assets.json` (`<top>/` is the zip's one top folder, or none). Directories, and any name that
 * would leave the target (`..`, absolute, backslashes), are skipped.
 */
export function selectLocalEntries(entries) {
  const out = [];
  for (const e of entries) {
    if (e.name.endsWith('/')) continue;
    const m = /^(?:[^/]+\/)?((?:public\/assets\/local\/.+)|(?:data\/local-assets\.json))$/.exec(e.name);
    if (!m) continue;
    const rel = m[1];
    if (rel.includes('\\') || rel.split('/').some((s) => s === '..' || s === '.' || s === '')) continue;
    out.push({ ...e, rel });
  }
  return out;
}

/** Where each entry's bytes end in the zip: the next entry's local header (any entry), or the central directory. */
export function withEnds(selected, all, cdOffset) {
  const starts = all.map((e) => e.offset).sort((a, b) => a - b);
  const next = (o) => {
    let lo = 0, hi = starts.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= o) lo = mid + 1; else hi = mid; }
    return lo < starts.length ? starts[lo] : cdOffset;
  };
  return selected.map((e) => ({ ...e, end: next(e.offset) }));
}

/** Range groups: entries in offset order, merged while the gap is small and the range stays under GROUP_MAX. */
export function groupRanges(entries, { max = GROUP_MAX, gap = GROUP_GAP } = {}) {
  const sorted = [...entries].sort((a, b) => a.offset - b.offset);
  const groups = [];
  for (const e of sorted) {
    const g = groups[groups.length - 1];
    if (g && e.offset - g.end <= gap && e.end - g.start <= max) { g.end = Math.max(g.end, e.end); g.entries.push(e); }
    else groups.push({ start: e.offset, end: e.end, entries: [e] });
  }
  return groups;
}

let CRC_TABLE;
/** CRC-32 (zlib.crc32 on Node ≥ 22.2, a table otherwise). */
export function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One entry's file bytes out of a range buffer that starts at zip offset `base`. */
export function extractEntry(buf, base, e) {
  const p = e.offset - base;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`${e.name}: bad local header`);
  if (e.flags & 1) throw new Error(`${e.name}: encrypted entries are not supported`);
  const data = buf.subarray(p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28)).subarray(0, e.csize);
  if (data.length !== e.csize) throw new Error(`${e.name}: truncated`);
  const out = e.method === 0 ? Buffer.from(data) : e.method === 8 ? zlib.inflateRawSync(data) : null;
  if (!out) throw new Error(`${e.name}: compression method ${e.method} is not supported`);
  if (out.length !== e.size || crc32(out) !== e.crc) throw new Error(`${e.name}: CRC / size mismatch`);
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Release lookup
// ---------------------------------------------------------------------------------------------------

export const zipUrl = (repo, tag) => `https://github.com/${repo}/releases/download/${tag}/Stronghold-Protocol-${tag}.zip`;

/** The newest release's tag (the /releases/latest redirect; no API token needed). */
export async function latestTag(repo, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://github.com/${repo}/releases/latest`, { method: 'HEAD', redirect: 'manual' });
  const m = /\/releases\/tag\/([^/?#]+)/.exec(res.headers.get('location') || '');
  if (!m) throw new Error(`no latest release found for ${repo} (HTTP ${res.status})`);
  return decodeURIComponent(m[1]);
}

// ---------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { tag: null, latest: false, repo: DEFAULT_REPO, url: null, dryRun: false, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i]; if (!v) throw new Error(`${a} needs a value`); return v; };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--latest') o.latest = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a.startsWith('--tag')) o.tag = val();
    else if (a.startsWith('--repo')) o.repo = val();
    else if (a.startsWith('--url')) o.url = val();
    else throw new Error(`unknown option ${a} (see --help)`);
  }
  return o;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/** True when `file` already holds exactly entry `e` (size and CRC). */
function staged(file, e) {
  try { const st = fs.statSync(file); return st.size === e.size && crc32(fs.readFileSync(file)) === e.crc; } catch { return false; }
}

/**
 * Fetch and install. `root` = the checkout (tests point it at a temp dir), `fetchImpl` = fetch.
 * @returns {Promise<{ tag: string, url: string, files: number, bytes: number, downloaded: number, fetched: number, installed: boolean, previous: string|null }>}
 */
export async function run(opts = {}, { root = ROOT, fetchImpl = fetch, log = console.log, now = () => new Date() } = {}) {
  const say = opts.quiet ? () => {} : log;
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  let tag = opts.tag, url = opts.url;
  if (!url) {
    if (!tag) tag = opts.latest ? await latestTag(opts.repo, { fetchImpl }) : `v${version}`;
    url = zipUrl(opts.repo, tag);
  } else if (!tag) tag = 'url-' + (/([^/]+?)(?:\.zip)?(?:[?#].*)?$/.exec(url)?.[1] || 'zip');
  if (tag !== `v${version}` && !opts.url) log(`[local] note: ${tag} is not this checkout's version (v${version}); DEPLOY.md asks for the same version`);
  say(`[local] ${url}`);

  const eocd = await readEocd(url, { fetchImpl });
  const { buf: cd } = await readRange(url, eocd.cdOffset, eocd.cdOffset + eocd.cdSize, { fetchImpl });
  const all = parseCentralDirectory(cd);
  if (all.length !== eocd.count) throw new Error(`central directory: ${all.length} entries, the zip says ${eocd.count}`);
  const sel = withEnds(selectLocalEntries(all), all, eocd.cdOffset);
  if (!sel.some((e) => e.rel === 'data/local-assets.json')) throw new Error(`${tag}: this zip has no data/local-assets.json (a lite or update package?)`);
  const bytes = sel.reduce((n, e) => n + e.size, 0);
  say(`[local] zip ${mb(eocd.total)}, ${all.length} entries; local art: ${sel.length} files, ${mb(bytes)} (${mb(sel.reduce((n, e) => n + e.csize, 0))} to download)`);

  if (sel.every((e) => staged(path.join(root, e.rel), e))) {
    say(`[local] already installed: every file of ${tag}'s local art is in place`);
    return { tag, url, files: sel.length, bytes, downloaded: 0, fetched: 0, installed: false, previous: null };
  }
  const stage = path.join(root, '.cache', 'release-local', tag.replace(/[^\w.-]/g, '_'));
  const todo = sel.filter((e) => !staged(path.join(stage, e.rel), e));
  if (todo.length < sel.length) say(`[local] ${sel.length - todo.length} files already staged in ${path.relative(root, stage)}`);
  if (opts.dryRun) {
    say(`[local] dry run: would fetch ${todo.length} files (${mb(todo.reduce((n, e) => n + e.csize, 0))}) and install ${sel.length}`);
    return { tag, url, files: sel.length, bytes, downloaded: 0, fetched: 0, installed: false, previous: null };
  }

  const groups = groupRanges(todo);
  const want = groups.reduce((n, g) => n + g.end - g.start, 0);
  let fetched = 0, done = 0, lastPct = -1;
  for (const g of groups) {
    const { buf } = await readRange(url, g.start, g.end, { fetchImpl });
    fetched += buf.length;
    for (const e of g.entries) {
      const file = path.join(stage, e.rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, extractEntry(buf, g.start, e));
      done++;
    }
    const pct = Math.floor((100 * fetched) / Math.max(1, want));
    if (pct >= lastPct + 10) { say(`[local] ${pct}% (${mb(fetched)} of ${mb(want)}, ${done}/${todo.length} files)`); lastPct = pct; }
  }

  // swap in: the current ones are moved aside, never deleted
  const liveDir = path.join(root, 'public', 'assets', 'local'), liveMan = path.join(root, 'data', 'local-assets.json');
  let previous = null;
  if (fs.existsSync(liveDir) || fs.existsSync(liveMan)) {
    previous = path.join(root, '.cache', 'release-local', `previous-${now().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(previous, { recursive: true });
    if (fs.existsSync(liveDir)) fs.renameSync(liveDir, path.join(previous, 'public-assets-local'));
    if (fs.existsSync(liveMan)) fs.renameSync(liveMan, path.join(previous, 'local-assets.json'));
    say(`[local] the previous local art is kept in ${path.relative(root, previous)}`);
  }
  fs.mkdirSync(path.dirname(liveDir), { recursive: true });
  fs.renameSync(path.join(stage, 'public', 'assets', 'local'), liveDir);
  fs.mkdirSync(path.dirname(liveMan), { recursive: true });
  fs.renameSync(path.join(stage, 'data', 'local-assets.json'), liveMan);
  fs.rmSync(stage, { recursive: true, force: true });
  say(`[local] installed ${sel.length} files from ${tag} into public/assets/local/ and data/local-assets.json`);
  return { tag, url, files: sel.length, bytes, downloaded: todo.length, fetched, installed: true, previous };
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`[local] ${e.message}`); process.exit(1); }
  if (o.help) {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    console.log(src.slice(1, src.findIndex((l) => l.startsWith('import'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n').trim());
    return;
  }
  try {
    const r = await run(o);
    if (r.installed && !o.quiet) console.log('[local] check it with: node tools/doctor.mjs');
  } catch (e) {
    console.error(`[local] failed: ${e.message}`);
    console.error('[local] nothing was swapped in; re-running resumes from the staged files');
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
