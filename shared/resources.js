// shared/resources.js — the rules of the optional asset preload (Settings ▸ Preload assets), shared by the server that
// lists the files (server/resources.js → /data/resource-manifest.json), the page that downloads them into Cache Storage
// (public/js/resources/) and the tests. public/resource-sw.js is a classic worker and keeps its own copy of `resourceKey`
// / `mediaKeys`; test/resources.test.js runs it against this module so the two cannot drift apart.
//
// Based on the preloader of xinhai-ai/Stronghold-Protocol (GPL-3.0-or-later, see NOTICE.md), simplified: one
// cache, files keyed by path, freshness decided by each file's content hash, and the downloads fetch `?v=<hash>` URLs
// (immutable at Cloudflare and in browsers — server/http/files.js cacheControlFor) so a full preload is served from the
// edge instead of the VPS.

import { AUDIO_EXTS, MEDIA_PREFIX } from './media.js';

export const MANIFEST_URL = '/data/resource-manifest.json';
/** Per-pack totals only ({ version, packs: { <pack>: { files, bytes } } }): what the title screen shows before a download. */
export const SUMMARY_URL = '/data/resource-summary.json';
export const RESOURCES_FORMAT = 2;
/** The one Cache Storage cache the preload owns. */
export const CACHE_NAME = 'sp-resources-v1';
/** Synthetic entry of that cache: { packs: [...] }, the packs the worker may save files of on the way (the player's pick). */
export const PACKS_PATH = '/__sp-resource-packs__';
/** Files above this are never preloaded (they stream as before). */
export const MAX_FILE_BYTES = 24 * 1024 * 1024;
/** Hex digits of the SHA-1 prefix every manifest entry carries. */
export const HASH_LEN = 12;

/** Voice packs, in checklist order (`/assets/audio/voice/<pack>/…`). */
export const VOICE_PACKS = Object.freeze(['cn', 'en', 'jp', 'kr', 'native']);
/** Always part of a preload: visuals (tier 1) and music, sound effects, tutorial art (tier 2). */
export const BASE_PACKS = Object.freeze(['visual', 'audio']);
export const ALL_PACKS = Object.freeze([...BASE_PACKS, ...VOICE_PACKS]);

/**
 * The pack a file belongs to. `path` is a site path (`/assets/…`, `/fonts/…`), encoded or not.
 * @param {string} path
 * @returns {string} one of ALL_PACKS
 */
export function packOf(path) {
  const p = String(path || '');
  const voice = /^\/assets\/audio\/voice\/([a-z]+)\//.exec(p);
  if (voice) return VOICE_PACKS.includes(voice[1]) ? voice[1] : 'audio';
  if (p.startsWith('/assets/audio/')) return 'audio';
  if (/^\/assets\/(?:local\/)?ui\/guide\//.test(p) || p.startsWith('/assets/local/guide/')) return 'audio';
  return 'visual';
}

/** Whether a request path is one the preload may answer: the asset and font trees and the `/media/…` audio route. */
export function isResourcePath(pathname) {
  const p = String(pathname || '');
  return p.startsWith('/assets/') || p.startsWith('/fonts/') || p.startsWith(MEDIA_PREFIX);
}

/**
 * The cache key of a site path: decoded once, then `encodeURI`d — `/assets/x/[opt]a.png` and `/assets/x/%5Bopt%5Da.png`
 * (the browser leaves `[` alone, the manifest encodes it) are one key. Null for a path that cannot be decoded.
 * @param {string} pathname
 */
export function resourceKey(pathname) {
  try { return encodeURI(decodeURI(String(pathname || ''))); } catch { return null; }
}

/**
 * The stored files a `/media/…` request may be: `/media/bgm/act1` → `/assets/audio/bgm/act1.mp3`, `.m4a` … in the
 * server's order (server/http/media.js); `/media/x.ogg` tries `.ogg` first. Empty for any other path.
 * @param {string} pathname
 * @returns {string[]} cache keys
 */
export function mediaKeys(pathname) {
  const p = String(pathname || '');
  if (!p.startsWith(MEDIA_PREFIX)) return [];
  const rest = p.slice(MEDIA_PREFIX.length);
  const segments = rest.split('/');
  if (!rest || segments.some((s) => !s || s.startsWith('.') || s.endsWith('.'))) return [];
  const last = segments[segments.length - 1];
  const given = AUDIO_EXTS.find((e) => last.toLowerCase().endsWith(e)) || '';
  const stem = given ? last.slice(0, -given.length) : last;
  if (!stem) return [];
  const base = `/assets/audio/${[...segments.slice(0, -1), stem].join('/')}`;
  const order = given ? [given, ...AUDIO_EXTS.filter((e) => e !== given)] : AUDIO_EXTS;
  return order.map((ext) => resourceKey(base + ext)).filter(Boolean);
}

/** `1.5 GB` / `820 MB` / `900 KB` — decimal units, as the plan and most OS file managers count. */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1e3) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1e3;
  let i = 0;
  while (v >= 1e3 && i < units.length - 1) { v /= 1e3; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/**
 * Check the manifest the server sent (it drives thousands of requests: a broken one must disable the preload, not
 * hammer the origin). Shape: { format, version, files: [[path, size, hash], …] }.
 * @returns {{ version: string, files: { path: string, size: number, hash: string, pack: string }[] }}
 */
export function parseManifest(doc) {
  if (!doc || typeof doc !== 'object' || doc.format !== RESOURCES_FORMAT) throw new Error('unsupported resource manifest');
  if (typeof doc.version !== 'string' || !doc.version) throw new Error('resource manifest has no version');
  if (!Array.isArray(doc.files) || doc.files.length > 60000) throw new Error('resource manifest has no file list');
  const hashRe = new RegExp(`^[0-9a-f]{${HASH_LEN}}$`);
  const files = doc.files.map((e) => {
    const [path, size, hash] = Array.isArray(e) ? e : [];
    if (typeof path !== 'string' || path.length > 512 || !isResourcePath(path) || path.startsWith(MEDIA_PREFIX)
      || /[?#\s\\]/.test(path) || resourceKey(path) !== path) throw new Error(`bad resource entry: ${String(path).slice(0, 80)}`);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new Error(`bad resource size: ${path.slice(0, 80)}`);
    if (typeof hash !== 'string' || !hashRe.test(hash)) throw new Error(`bad resource hash: ${path.slice(0, 80)}`);
    return { path, size, hash, pack: packOf(path) };
  });
  return { version: doc.version, files };
}
