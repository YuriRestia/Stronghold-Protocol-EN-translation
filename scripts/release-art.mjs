// scripts/release-art.mjs — (fork) the art step of scripts/release.mjs, as pure functions (no ssh, no disk writes):
// which files the art server lacks, which it has at another size, and the gate before `prepare`.
//
// Art rules (crew-docs/deploy-runbook.md "Art rules"): the pack is worked out file by file against the server's own
// list, never from a fixed folder list; every URL the release's data/assets.json names must be on the server
// (`missing: 0`) before `prepare`, or prepare's ensureAssets downloads art from GitHub and rebuilds the clip bounds on
// the live server; a file neither the PC nor the server has stops the release; nothing extra goes inside public/ (the
// preloader refuses a list of 60,000 files or more).
import { missingAssets } from './generations.mjs';

/** The lists every release ships beside the art: replaced when their content differs (sha256), never by size alone. */
export const SHARED_LISTS = Object.freeze([
  'data/local-fx.json',
  'data/local-assets.json',
  'public/assets/local/fx/index.json',
  'public/assets/local/fx/textures.json',
]);
export const CLIP_BOUNDS = 'data/clip-bounds.json';

/**
 * Files whose server copy is the right one although it differs from the PC's (2026-11-10 and 11-12 deploys: Singapore
 * has the newer char_4247_oxi front model; both sides have a consistent enemy_10138_xdsnow atlas). Never uploaded.
 * PC fix, then drop the entry: node tools/fetch-assets.mjs --refresh-index.
 */
export const KEEP_SERVER_COPY = Object.freeze([
  /^public\/assets\/spine\/op\/char_4247_oxi\/front\//,
  /^public\/assets\/spine\/enemy\/enemy_10138_xdsnow\//,
]);

/** The preloader refuses a resource list of this many files or more (`find public -type f | wc -l`). */
export const PUBLIC_FILE_LIMIT = 60000;
/** Over this, the pack waits for a typed "y" (storage rule: over 1 GB asks first). */
export const ASK_ABOVE_BYTES = 1e9;
/** Never more than this in one release, whatever the answer (a bigger pack is a wrong list, not a release). */
export const MAX_PACK_BYTES = 4e9;

/**
 * `find … -printf '%p\t%s\n'` output → Map(path → size).
 * @param {string} text
 */
export function parseFileList(text) {
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    const t = line.replace(/\r$/, '');
    const i = t.lastIndexOf('\t');
    if (i <= 0) continue;
    const size = Number(t.slice(i + 1));
    if (Number.isFinite(size)) out.set(t.slice(0, i), size);
  }
  return out;
}

/** `/assets/a%20b.png?x` → `public/assets/a b.png`. @param {string} url */
export const urlToPath = (url) => `public${decodeURI(String(url).split(/[?#]/)[0])}`;

/**
 * Every file the release needs on the art server: each /assets/ and /fonts/ URL of its data/assets.json, plus every
 * file under public/assets/local on the PC (the extracted art, listed by data/local-*.json).
 * @param {unknown} manifest the release's data/assets.json
 * @param {Iterable<string>} localFiles the PC's files under public/assets/local, as `public/assets/local/...`
 * @returns {Set<string>}
 */
export function neededArt(manifest, localFiles) {
  const needed = new Set();
  for (const u of missingAssets(manifest, () => 0)) needed.add(urlToPath(u));
  for (const f of localFiles) needed.add(f);
  return needed;
}

const kept = (p, keep) => keep.some((re) => re.test(p));

/**
 * What to upload. A file goes in the pack when the PC has it and the server lacks it or has another size; the shared
 * lists go by content (`listsDiffer`), never by size; a KEEP_SERVER_COPY file never goes.
 * @param {{ needed: Iterable<string>, pc: Map<string, number>, server: Map<string, number>, listsDiffer?: Iterable<string>, keep?: readonly RegExp[] }} o
 *   pc: the PC's size of each needed file (absent: the PC lacks it)
 * @returns {{ upload: string[], bytes: number, nowhere: string[], kept: string[] }}
 *   nowhere: needed, on neither side (stops the release)
 */
export function artPlan({ needed, pc, server, listsDiffer = [], keep = KEEP_SERVER_COPY }) {
  const upload = new Set(), keptOut = [], nowhere = [];
  const lists = new Set(SHARED_LISTS);
  for (const f of needed) {
    if (lists.has(f)) continue;
    const mine = pc.get(f), theirs = server.get(f);
    if (mine === undefined) { if (theirs === undefined) nowhere.push(f); continue; }
    if (theirs === mine) continue;
    if (theirs !== undefined && kept(f, keep)) { keptOut.push(f); continue; }
    upload.add(f);
  }
  for (const f of listsDiffer) upload.add(f);
  const list = [...upload].sort();
  let bytes = 0;
  for (const f of list) bytes += pc.get(f) ?? 0;
  return { upload: list, bytes, nowhere: nowhere.sort(), kept: keptOut.sort() };
}

/**
 * The shared lists (and the clip bounds) whose server copy differs from the PC's: by sha256, both sides read.
 * @param {Record<string, string | undefined>} pcHash path → hex (absent: not on the PC; never uploaded)
 * @param {Record<string, string | undefined>} serverHash path → hex (absent: not on the server)
 */
export function differingLists(pcHash, serverHash) {
  return Object.keys(pcHash).filter((p) => pcHash[p] && pcHash[p] !== serverHash[p]).sort();
}

/** `sha256sum` output → { path: hex }. @param {string} text */
export function parseSha256(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\r?$/.exec(line);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

/**
 * The gate before `prepare`: the URLs of the release's data/assets.json the server lacks (what prepare's ensureAssets
 * would download) and the public/ file count. Pass: no URL missing, fewer files than PUBLIC_FILE_LIMIT.
 * @param {unknown} manifest @param {Map<string, number>} server @param {number} publicFiles
 */
export function artGate(manifest, server, publicFiles) {
  const missing = missingAssets(manifest, (u) => server.get(urlToPath(u)) ?? 0);
  const problems = [];
  if (missing.length) problems.push(`${missing.length} file(s) of data/assets.json are not on the server (e.g. ${missing.slice(0, 3).join(', ')})`);
  if (!(publicFiles < PUBLIC_FILE_LIMIT)) problems.push(`public/ holds ${publicFiles} files; the preloader refuses ${PUBLIC_FILE_LIMIT} or more (an art backup inside public/?)`);
  return { missing, publicFiles, ok: !problems.length, problems };
}

/** `12345678` → `12.3 MB`. @param {number} n */
export const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
