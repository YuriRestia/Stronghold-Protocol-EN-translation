// tools/package-update.mjs — what `node tools/package.mjs --update --from <base>[,<base>…]` (docs/DEPLOY.md §7) needs
// besides the stage: read an earlier release — its full zip, or the folder that zip was extracted to — into
// {path → size + sha256}, compare the new full stage with every base, and write MANIFEST.json / UPDATE.json.
// tools/package.mjs builds the stage, copies what ships, checks and zips it; server/update.js finishes the update on
// the player's machine (and reads the two files back).
//
// A file ships when it is new or differs from at least one base, so one update zip works over each of them (0.2.0 and
// every later 0.2.x given as a base); `removed` lists the files some base shipped that the new version does not, with
// the bytes each base had (the player's copy is deleted only when it still holds them). A removed path that differs
// from a new one only in case is the same file on Windows / macOS: it is left out of `removed` (`caseOnly`).
// The zip reader handles what tools/package.mjs and GitHub hand out: stored and deflated entries, zip64, UTF-8 names.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { UPDATE_FILE, UPDATE_FORMAT, digestFile } from '../server/update.js';

/** Read `len` bytes at `pos` of an open file. */
function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = fs.readSync(fd, buf, got, len - got, pos + got);
    if (n <= 0) throw new Error('unexpected end of the zip file');
    got += n;
  }
  return buf;
}

const SIG = { eocd: 0x06054b50, loc64: 0x07064b50, eocd64: 0x06064b50, central: 0x02014b50, local: 0x04034b50 };
const U32 = 0xffffffff;

/**
 * Call `onFile(name, data)` for every file entry of a zip (directories skipped), in central-directory order.
 * @param {string} zipPath
 * @param {(name: string, data: Buffer) => void} onFile
 */
export function readZip(zipPath, onFile) {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 22 + 65535);
    const tail = readAt(fd, size - tailLen, tailLen);
    let e = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === SIG.eocd) { e = i; break; }
    if (e < 0) throw new Error('not a zip file (no end of central directory)');
    let count = tail.readUInt16LE(e + 10);
    let cdSize = tail.readUInt32LE(e + 12);
    let cdOffset = tail.readUInt32LE(e + 16);
    if (count === 0xffff || cdSize === U32 || cdOffset === U32) {
      const locPos = size - tailLen + e - 20;
      const loc = locPos >= 0 ? readAt(fd, locPos, 20) : null;
      if (!loc || loc.readUInt32LE(0) !== SIG.loc64) throw new Error('zip64 locator missing');
      const rec = readAt(fd, Number(loc.readBigUInt64LE(8)), 56);
      if (rec.readUInt32LE(0) !== SIG.eocd64) throw new Error('zip64 end record missing');
      count = Number(rec.readBigUInt64LE(32));
      cdSize = Number(rec.readBigUInt64LE(40));
      cdOffset = Number(rec.readBigUInt64LE(48));
    }
    const cd = readAt(fd, cdOffset, cdSize);
    let p = 0;
    for (let n = 0; n < count; n++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== SIG.central) throw new Error('damaged central directory');
      const madeBy = cd.readUInt16LE(p + 4);
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const crc = cd.readUInt32LE(p + 16);
      let packedSize = cd.readUInt32LE(p + 20);
      let rawSize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const external = cd.readUInt32LE(p + 38);
      let offset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      if (packedSize === U32 || rawSize === U32 || offset === U32) {
        // the zip64 extra field carries the values the header marks 0xFFFFFFFF, in this order
        for (let q = p + 46 + nameLen, end = q + extraLen; q + 4 <= end;) {
          const id = cd.readUInt16LE(q);
          const len = cd.readUInt16LE(q + 2);
          if (id === 1) {
            let r = q + 4;
            if (rawSize === U32) { rawSize = Number(cd.readBigUInt64LE(r)); r += 8; }
            if (packedSize === U32) { packedSize = Number(cd.readBigUInt64LE(r)); r += 8; }
            if (offset === U32) { offset = Number(cd.readBigUInt64LE(r)); r += 8; }
            break;
          }
          q += 4 + len;
        }
      }
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      if ((madeBy >> 8) === 3 && ((external >>> 16) & 0o170000) === 0o120000) throw new Error(`${name}: a symbolic link (release zips have none)`);
      if (flags & 1) throw new Error(`${name}: encrypted`);
      const local = readAt(fd, offset, 30);
      if (local.readUInt32LE(0) !== SIG.local) throw new Error(`${name}: damaged local header`);
      const packed = readAt(fd, offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), packedSize);
      let data;
      if (method === 0) data = packed;
      else if (method === 8) {
        try { data = zlib.inflateRawSync(packed); } catch (err) { throw new Error(`${name}: ${err.message}`, { cause: err }); }
      } else throw new Error(`${name}: compression method ${method} (only stored and deflated entries)`);
      if (data.length !== rawSize) throw new Error(`${name}: ${data.length} bytes, the directory says ${rawSize}`);
      if (typeof zlib.crc32 === 'function' && (zlib.crc32(data) >>> 0) !== crc) throw new Error(`${name}: CRC mismatch (a damaged zip)`);
      onFile(name, data);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** -1 / 0 / 1 for two x.y.z[-pre] versions (a pre-release sorts before its release). */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(v));
    if (!m) throw new Error(`not a version: ${v}`);
    return { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Files under `dir` (following symlinks) as posix paths relative to it. */
function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    let st;
    try { st = fs.statSync(path.join(dir, child)); } catch { continue; }
    if (st.isDirectory()) walk(dir, child, out);
    else if (st.isFile()) out.push(child);
  }
  return out;
}

/**
 * An earlier release as a base: its full zip, or the folder it was extracted to (the Stronghold-Protocol folder or the
 * one holding it — an unmodified extraction). `skip(rel)` leaves paths out (per-machine files, OS clutter, the update
 * files themselves).
 * @param {string} source
 * @param {{ folder?: string, skip?: (rel: string) => boolean }} [opts]
 * @returns {{ source: string, version: string, files: Map<string, { size: number, sha256: string }>, art: number, update: boolean }}
 */
export function readBase(source, { folder = 'Stronghold-Protocol', skip = () => false } = {}) {
  const abs = path.resolve(source);
  let st;
  try { st = fs.statSync(abs); } catch { throw new Error(`base ${source}: not found`); }
  const files = new Map();
  let pkg = null;
  let update = false;
  const add = (rel, d, read) => {
    if (rel === 'package.json') { try { pkg = JSON.parse(read().toString('utf8')); } catch { pkg = {}; } }
    if (rel === UPDATE_FILE) update = true;
    if (!skip(rel)) files.set(rel, d);
  };
  if (st.isDirectory()) {
    let root = abs;
    if (!fs.existsSync(path.join(root, 'package.json')) && fs.existsSync(path.join(root, folder, 'package.json'))) root = path.join(root, folder);
    if (!fs.existsSync(path.join(root, 'package.json'))) throw new Error(`base ${source}: no package.json (pass a release's full zip or the folder it was extracted to)`);
    for (const rel of walk(root)) {
      const p = path.join(root, ...rel.split('/'));
      const d = digestFile(p);
      if (!d) throw new Error(`base ${source}: cannot read ${rel}`);
      add(rel, d, () => fs.readFileSync(p));
    }
  } else {
    const prefix = `${folder}/`;
    try {
      readZip(abs, (name, data) => {
        if (!name.startsWith(prefix)) throw new Error(`${name} is outside the ${folder}/ folder (not a release zip)`);
        add(name.slice(prefix.length), { size: data.length, sha256: sha(data) }, () => data);
      });
    } catch (e) {
      throw new Error(`base ${source}: ${e.message}`, { cause: e });
    }
    if (!pkg) throw new Error(`base ${source}: no ${folder}/package.json (not a release zip)`);
  }
  const version = pkg?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) throw new Error(`base ${source}: package.json names no version`);
  let art = 0;
  for (const rel of files.keys()) if (rel.startsWith('public/assets/')) art++;
  return { source: abs, version, files, art, update };
}

/**
 * Compare the new full stage with the bases. `removable(rel)`: false for a path no update deletes (it goes to `left`).
 * @param {Map<string, { size: number, sha256: string }>} next every file of the new version (the update files left out)
 * @param {{ version: string, files: Map<string, { size: number, sha256: string }> }[]} bases
 * @param {{ removable?: (rel: string) => boolean }} [opts]
 * @returns {{ ship: string[], removed: { path: string, sha256: string[] }[], caseOnly: string[], left: string[],
 *             perBase: { version: string, added: number, changed: number, unchanged: number, removed: number }[] }}
 */
export function diffBases(next, bases, { removable = () => true } = {}) {
  const ship = new Set();
  const perBase = [];
  for (const b of bases) {
    const n = { version: b.version, added: 0, changed: 0, unchanged: 0, removed: 0 };
    for (const [rel, d] of next) {
      const o = b.files.get(rel);
      if (!o) { n.added++; ship.add(rel); } else if (o.size !== d.size || o.sha256 !== d.sha256) { n.changed++; ship.add(rel); } else n.unchanged++;
    }
    for (const rel of b.files.keys()) if (!next.has(rel)) n.removed++;
    perBase.push(n);
  }
  const lower = new Set([...next.keys()].map((f) => f.toLowerCase()));
  const removed = new Map();
  const caseOnly = new Set();
  const left = new Set();
  for (const b of bases) {
    for (const [rel, d] of b.files) {
      if (next.has(rel)) continue;
      if (lower.has(rel.toLowerCase())) { caseOnly.add(rel); continue; }
      if (!removable(rel)) { left.add(rel); continue; }
      if (!removed.has(rel)) removed.set(rel, new Set());
      removed.get(rel).add(d.sha256);
    }
  }
  return {
    ship: [...ship].sort(),
    removed: [...removed.keys()].sort().map((rel) => ({ path: rel, sha256: [...removed.get(rel)].sort() })),
    caseOnly: [...caseOnly].sort(),
    left: [...left].sort(),
    perBase,
  };
}

const fileLine = ([rel, d]) => `${JSON.stringify(rel)}:{"size":${d.size},"sha256":"${d.sha256}"}`;
const block = (lines) => (lines.length ? `\n${lines.join(',\n')}\n` : '');

/** {path → {size, sha256}} as a JSON object, one file per line (sorted): readable, small diffs between releases. */
function filesJson(files) {
  return `{${block([...files].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(fileLine))}}`;
}

/** MANIFEST.json's text (server/update.js parseManifest reads it). @param {{ app: string, files: Map }} m */
export function manifestText({ app, files }) {
  return `{"format":${UPDATE_FORMAT},"app":${JSON.stringify(app)},"files":${filesJson(files)}}\n`;
}

/**
 * UPDATE.json's text (server/update.js parseUpdate reads it).
 * @param {{ app: string, from: string[], files: Map, removed: { path: string, sha256: string[] }[] }} u
 */
export function updateText({ app, from, files, removed }) {
  let bytes = 0;
  for (const d of files.values()) bytes += d.size;
  const gone = removed.map((r) => `{"path":${JSON.stringify(r.path)},"sha256":${JSON.stringify(r.sha256)}}`);
  return `{"format":${UPDATE_FORMAT},"app":${JSON.stringify(app)},"from":${JSON.stringify(from)},"count":${files.size},"bytes":${bytes},`
    + `\n"removed":[${block(gone)}],\n"files":${filesJson(files)}}\n`;
}
