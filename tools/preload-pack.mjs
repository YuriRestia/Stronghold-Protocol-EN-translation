#!/usr/bin/env node
// tools/preload-pack.mjs — (fork) the preload zip: every file of the asset preload (Settings ▸ Preload Assets,
// shared/resources.js) in one zip a player imports in the preload manager (ui/preload.js 导入 zip), so a host can offer
// the art somewhere else (a file host, a Discord link) instead of sending it from the server.
//
//   npm run package:preload [-- --out <dir>] [--force] [--dry-run]
//   → Stronghold-Protocol-v<version>-preload.zip   one folder holding public/assets/…, public/fonts/… and README.txt
//
// The file list is the server's own preload manifest (server/resources.js buildResourceManifest: every file under
// public/assets and public/fonts up to MAX_FILE_BYTES, the official effects included once extracted), so the import
// accepts exactly these bytes from a host with the same files; a host with other files skips what differs ("didn't
// match") and the preload downloads those. One zip, not split. Written here (no `zip` / `tar` needed): already
// compressed files (PNG, WebP, MP3…) are stored, the rest deflated; ZIP64 is not written, so the zip stays under 4 GiB.
// The personal-info scan refuses a file that names this machine's account (its home path or user name).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildResourceManifest } from '../server/resources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = 'Stronghold-Protocol';
export const README = 'README.txt';
/** Extensions stored as they are (deflating them saves next to nothing). */
const STORED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.woff', '.woff2']);
const LIMIT = 0xffffffff;

export const preloadPackName = (version) => `${FOLDER}-v${version}-preload`;

/** Site path (`/assets/x`) → the repository path of the file. */
const repoPath = (site) => `public${decodeURI(site)}`;

/** Names the scan refuses: this machine's account name and home folder (generic names like admin are not personal). */
export function personalNeedles(env = process.env) {
  const out = [];
  let user = '';
  try { user = os.userInfo().username; } catch { /* none */ }
  if (user.length >= 3 && !['root', 'user', 'admin', 'node', 'runner', 'ubuntu', 'ci', 'guest', 'app', 'build'].includes(user.toLowerCase())) out.push(user);
  const home = os.homedir();
  if (home && home.length > 3) out.push(home, home.split('\\').join('/'));
  for (const n of String(env.SP_PACKAGE_SCAN_NAMES || '').split(',')) if (n.trim().length >= 3) out.push(n.trim());
  return [...new Set(out)];
}

/** README.txt (English, UTF-8 with a BOM). */
export function preloadReadme({ version, files, bytes }) {
  return `\ufeff${[
    `Stronghold Protocol v${version} preload pack`,
    '',
    '[What this is]',
    `The game's art, models, effects, audio and fonts: ${files} files (${(bytes / 1e6).toFixed(0)} MB) for the game's asset preload.`,
    'Once imported, your browser reads these files itself instead of downloading them from the server.',
    'It is not an installation package and cannot run a server.',
    '',
    '[How to import]',
    '1. Open the game over HTTPS (a plain http:// LAN address cannot: the browser does not allow it).',
    '2. Settings > Preload Assets > Manage (or the Preload card on the title screen), then "Import zip" and pick this',
    '   file, or drop it on the window. Do not unzip it.',
    '3. Wait for the progress bar. Files that do not match the server\'s version are skipped and download as usual;',
    '   press Resume afterwards to fetch whatever the zip did not have.',
    'The files stay in this browser, per address. "Clear Cache" in the same window deletes them.',
    '',
    '[Copyright]',
    'The assets are (c) Hypergryph and its licensors (Yostar and others) and are not covered by this project\'s GPL-3.0',
    'licence. Non-commercial use only: do not sell or charge for them. See NOTICE.en.md of the project.',
  ].join('\n')}\n`;
}

/** The pack's plan: the preload manifest's files, their bytes, and what the scan refuses. */
export async function preloadPackPlan(root = ROOT, { scan = true, env = process.env, log = null } = {}) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '0.0.0';
  const doc = await buildResourceManifest({ publicDir: path.join(root, 'public'), hashCacheFile: path.join(root, 'node_modules', '.cache', 'sp-resource-hashes.json'), log });
  const files = doc.files.map(([site, size]) => ({ site, rel: repoPath(site), size }));
  const problems = [];
  if (!files.length) problems.push('no files under public/assets: run npm run setup first');
  if (scan) {
    const needles = personalNeedles(env).map((n) => Buffer.from(n, 'utf8').toString('latin1').toLowerCase());
    for (const f of files) {
      let text;
      try { text = fs.readFileSync(path.join(root, f.rel)).toString('latin1').toLowerCase(); } catch { problems.push(`unreadable: ${f.rel}`); continue; }
      if (needles.some((n) => text.includes(n))) problems.push(`personal info: ${f.rel}`);
    }
  }
  const bytes = files.reduce((n, f) => n + f.size, 0);
  if (bytes > LIMIT * 0.98) problems.push(`the art is ${(bytes / 1e9).toFixed(2)} GB: over what a zip without ZIP64 holds`);
  return { version, name: preloadPackName(version), files, bytes, manifestVersion: doc.version, problems };
}

/** A minimal zip writer (local headers, central directory, end record; UTF-8 names, no ZIP64). */
export function writeZip(zipPath, entries) {
  const fd = fs.openSync(zipPath, 'w');
  const central = [];
  let offset = 0;
  const write = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  const dos = (() => {
    const d = new Date();
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  })();
  try {
    for (const { name, data } of entries) {
      const raw = typeof data === 'function' ? data() : data;
      const crc = zlib.crc32(raw) >>> 0;
      let method = 0;
      let body = raw;
      if (!STORED.has(path.extname(name).toLowerCase())) {
        const d = zlib.deflateRawSync(raw, { level: 9 });
        if (d.length < raw.length * 0.95) { method = 8; body = d; }
      }
      const nameBuf = Buffer.from(name, 'utf8');
      if (offset > LIMIT - body.length - 30 - nameBuf.length) throw new Error('the zip would pass 4 GiB (no ZIP64)');
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(method, 8);
      head.writeUInt16LE(dos.time, 10); head.writeUInt16LE(dos.date, 12); head.writeUInt32LE(crc, 14);
      head.writeUInt32LE(body.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
      const at = offset;
      write(head); write(nameBuf); write(body);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
      c.writeUInt16LE(dos.time, 12); c.writeUInt16LE(dos.date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20);
      c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(at, 42);
      central.push(Buffer.concat([c, nameBuf]));
    }
    if (central.length > 0xffff) throw new Error('more than 65,535 files (no ZIP64)');
    const cdAt = offset;
    for (const c of central) write(c);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(offset - cdAt, 12); end.writeUInt32LE(cdAt, 16);
    write(end);
  } finally { fs.closeSync(fd); }
  return offset;
}

const USAGE = 'usage: node tools/preload-pack.mjs [--out <dir>] [--force] [--dry-run]';

export async function main(argv, { root = ROOT, log = console.log } = {}) {
  const o = { out: path.join(os.tmpdir(), 'stronghold-protocol-release'), force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else { console.error(USAGE); return 2; }
  }
  if (!o.out) { console.error(USAGE); return 2; }
  const p = await preloadPackPlan(root, { log: { info: log, warn: log } });
  log(`preload pack: ${p.name}.zip · ${p.files.length} files, ${(p.bytes / 1e6).toFixed(0)} MB · preload manifest ${p.manifestVersion}`);
  if (p.problems.length) {
    console.error(`PROBLEMS (${p.problems.length}):\n${p.problems.slice(0, 40).map((x) => `  ${x}`).join('\n')}`);
    return 1;
  }
  if (o.dryRun) return 0;
  const dest = path.resolve(o.out);
  const rel = path.relative(root, dest);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) { console.error(`refusing to write inside the repository: ${dest}`); return 1; }
  fs.mkdirSync(dest, { recursive: true });
  const zipPath = path.join(dest, `${p.name}.zip`);
  if (fs.existsSync(zipPath) && !o.force) { console.error(`${zipPath} exists (--force replaces it)`); return 1; }
  const top = p.name;
  const entries = [
    { name: `${top}/${README}`, data: Buffer.from(preloadReadme({ version: p.version, files: p.files.length, bytes: p.bytes }), 'utf8') },
    ...p.files.map((f) => ({ name: `${top}/${f.rel}`, data: () => fs.readFileSync(path.join(root, f.rel)) })),
  ];
  log(`zipping ${entries.length} files → ${zipPath}`);
  const bytes = writeZip(zipPath, entries);
  log(`zip: ${zipPath} (${(bytes / 1e6).toFixed(0)} MB)`);
  log('host it anywhere (a file host, a Discord link); players import it in Settings > Preload Assets');
  return 0;
}

const invoked = (() => { try { return pathToFileURL(fs.realpathSync(process.argv[1] || '')).href; } catch { return null; } })();
if (invoked === import.meta.url) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e); process.exitCode = 1; });
