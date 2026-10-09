// public/js/resources/store.js — the preload store: downloads the manifest's files into Cache Storage and says which ones
// are already there (shared/resources.js has the rules, docs in its header). No DOM: test/resources.test.js drives it
// with an in-memory `caches` and `fetch`.
//
// One cache holds every file, keyed by its site path (no query); each entry carries the hash of its bytes in an
// `X-SP-Resource` header, and a file counts as saved only while that hash is the manifest's. No shared index: the worker
// saves files the game fetches too (public/resource-sw.js capture), and per-entry headers mean the two writers can never
// overwrite each other's records. A run first drops entries whose hash is outdated, then fetches what is missing as
// `<path>?v=<hash>` — immutable at Cloudflare, so the VPS sends each version once per edge — with `cache: 'no-store'`
// (no second copy in the HTTP cache; the worker passes such requests through), checks size and SHA-1, and stores it.
// Audio is fetched through the extension-less /media/… route like the game does (public/js/media.js: download managers
// would otherwise pop up for each of ~11 000 .mp3 files).
// Based on xinhai-ai/Stronghold-Protocol public/js/resources/store.js (GPL-3.0-or-later, see NOTICE.md).

import { ALL_PACKS, CACHE_NAME, MAX_FILE_BYTES, PACKS_PATH } from '../../../shared/resources.js';
import { mediaUrl } from '../media.js';

/** Files above this share one lane (a 20 MB texture should not race four others for memory and bandwidth). */
const BIG_FILE_BYTES = 4 << 20;
/** The worker re-reads the manifest at most this often during a run (onFlush), so it serves what was saved. */
const NOTIFY_MS = 4000;
const MAX_FAILURES = 10;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** First `len` hex of the SHA-1 of `bytes`. */
export async function sha1Prefix(bytes, len = 12) {
  return hex(await globalThis.crypto.subtle.digest('SHA-1', bytes)).slice(0, len);
}

export function abortError() {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

export function isQuotaError(err) {
  return err?.name === 'QuotaExceededError' || /quota/i.test(String(err?.message || ''));
}

/** Per-pack counters: { files, bytes, doneFiles, doneBytes } for every pack of ALL_PACKS. */
function emptyPacks() {
  return Object.fromEntries(ALL_PACKS.map((p) => [p, { files: 0, bytes: 0, doneFiles: 0, doneBytes: 0 }]));
}

export class PreloadStore {
  /**
   * @param {{ version: string, files: { path: string, size: number, hash: string, pack: string }[] }} manifest parseManifest()
   * @param {{ caches?: any, fetcher?: typeof fetch, origin?: string, smallLanes?: number, now?: () => number }} [opts]
   */
  constructor(manifest, { caches = globalThis.caches, fetcher = globalThis.fetch?.bind(globalThis), origin = globalThis.location?.origin,
    smallLanes = 4, now = () => Date.now() } = {}) {
    this.manifest = manifest;
    this.caches = caches;
    this.fetcher = fetcher;
    this.origin = origin || 'http://localhost';
    this.smallLanes = Math.max(1, smallLanes);
    this.now = now;
    this.byPath = new Map(manifest.files.map((f) => [f.path, f]));
  }

  /** Cache key (absolute URL) of a site path. */
  urlOf(path) { return this.origin + path; }

  /** Write the packs the worker may capture into (the player's selection; [] = none). */
  async setCapturePacks(packs) {
    if (!this.caches) return;
    const cache = await this.caches.open(CACHE_NAME);
    await cache.put(this.urlOf(PACKS_PATH), new Response(JSON.stringify({ packs: [...packs] }), { headers: { 'Content-Type': 'application/json' } }));
  }

  /** The cached paths split by state: `present` (current), `stale` (outdated or unmarked), `orphans` (not in the manifest). */
  async #scan(cache) {
    const keys = await cache.keys();
    const present = new Set();
    const stale = [];
    const orphans = [];
    // the hash is a header: one match per cached entry of the manifest (Cache Storage keeps headers with the key)
    await Promise.all(keys.map(async (req) => {
      let path;
      try { path = new URL(req.url).pathname; } catch { return; }
      if (path.startsWith('/__sp-')) return;
      const f = this.byPath.get(path);
      if (!f) { orphans.push(path); return; }
      const hit = await cache.match(req);
      if (hit?.headers.get('X-SP-Resource') === f.hash) present.add(path);
      else stale.push(path);
    }));
    return { present, stale, orphans };
  }

  #tally(present) {
    const packs = emptyPacks();
    for (const f of this.manifest.files) {
      const p = packs[f.pack];
      p.files++;
      p.bytes += f.size;
      if (present.has(f.path)) { p.doneFiles++; p.doneBytes += f.size; }
    }
    return packs;
  }

  /** What is saved: { version, packs, savedBytes } (savedBytes counts current files of every pack). */
  async status() {
    if (!this.caches) return { version: this.manifest.version, packs: this.#tally(new Set()), savedBytes: 0 };
    const cache = await this.caches.open(CACHE_NAME);
    const { present } = await this.#scan(cache);
    const packs = this.#tally(present);
    return { version: this.manifest.version, packs, savedBytes: Object.values(packs).reduce((n, p) => n + p.doneBytes, 0) };
  }

  /**
   * Download every missing file of `packs` (visuals first, then music, then the voice packs). Aborting `signal` stops
   * within the files in flight; a failing file is counted and retried by the next run, a full disk stops the run.
   * @param {{ packs: string[], signal?: AbortSignal, onProgress?: (s: any) => void, onFlush?: () => void }} opts
   *   onFlush: every few seconds and at the end (the worker re-reads which files it may serve)
   *   laneLimit: how many small-file lanes may run right now (the page lowers it during a match; default all)
   * @returns {Promise<{ version: string, packs: any, savedBytes: number, failed: number, failures: { path: string, message: string }[], complete: boolean }>}
   */
  async download({ packs, signal, onProgress, onFlush, laneLimit = null }) {
    const cache = await this.caches.open(CACHE_NAME);
    const { present, stale, orphans } = await this.#scan(cache);
    // outdated bytes go first (the worker skips them anyway; this frees the space)
    for (const path of stale) await cache.delete(this.urlOf(path));
    const want = new Set(packs);
    const rank = (f) => ALL_PACKS.indexOf(f.pack);
    const work = this.manifest.files.filter((f) => want.has(f.pack) && !present.has(f.path) && f.size <= MAX_FILE_BYTES)
      .sort((a, b) => rank(a) - rank(b));
    const counters = this.#tally(present);
    let failed = 0;
    const failures = [];
    let lastFlush = this.now();
    let dirty = stale.length > 0;
    const flushing = Promise.resolve();
    let lastEmit = 0;
    const snapshot = () => ({ version: this.manifest.version, packs: Object.fromEntries(Object.entries(counters).map(([k, v]) => [k, { ...v }])),
      savedBytes: Object.values(counters).reduce((n, p) => n + p.doneBytes, 0), failed, failures: failures.slice() });
    const emit = (force = false) => {
      const now = this.now();
      if (!onProgress || (!force && now - lastEmit < 150)) return;
      lastEmit = now;
      onProgress(snapshot());
    };
    const flush = () => {
      if (!dirty) return flushing;
      dirty = false;
      lastFlush = this.now();
      try { onFlush?.(); } catch { /* a listener */ }
      return flushing;
    };
    /** @type {Error|null} the error that stops every lane (an abort, a full disk) */
    let stop = null;
    const check = () => { if (stop) throw stop; if (signal?.aborted) throw abortError(); };
    const one = async (f) => {
      check();
      try {
        const meanwhile = await cache.match(this.urlOf(f.path));
        if (meanwhile?.headers.get('X-SP-Resource') === f.hash) {
          const c = counters[f.pack];
          c.doneFiles++;
          c.doneBytes += f.size;
          emit();
          return;
        }
        const res = await this.fetcher(mediaUrl(`${f.path}?v=${f.hash}`, this.origin), { cache: 'no-store', credentials: 'same-origin', signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength !== f.size || await sha1Prefix(bytes) !== f.hash) throw new Error('checksum mismatch');
        check();
        const headers = { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
          'Content-Length': String(bytes.byteLength), 'X-SP-Resource': f.hash };
        await cache.put(this.urlOf(f.path), new Response(bytes, { status: 200, headers }));
        dirty = true;
        const c = counters[f.pack];
        c.doneFiles++;
        c.doneBytes += f.size;
        if (this.now() - lastFlush >= NOTIFY_MS) await flush();
      } catch (err) {
        if (signal?.aborted || err?.name === 'AbortError') throw abortError();
        if (isQuotaError(err)) {
          const quota = new Error('quota exceeded');
          quota.name = 'QuotaExceededError';
          throw quota;
        }
        failed++;
        if (failures.length < MAX_FAILURES) failures.push({ path: f.path, message: String(err?.message || err) });
      }
      emit();
    };
    const drain = async (list, lanes, limited) => {
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(lanes, list.length) }, async (_, lane) => {
        for (;;) {
          // a lane above the current limit waits (it keeps its place; the others take the files meanwhile)
          while (limited && laneLimit && lane >= Math.max(1, laneLimit()) && next < list.length) {
            check();
            await new Promise((r) => setTimeout(r, 500));
          }
          const i = next++;
          if (i >= list.length) return;
          await one(list[i]);
        }
      }));
    };
    emit(true);
    try {
      const big = work.filter((f) => f.size > BIG_FILE_BYTES);
      const small = work.filter((f) => f.size <= BIG_FILE_BYTES);
      // the first fatal error (an abort, a full disk) wins; the other lanes stop at their next file
      await Promise.all([drain(small, this.smallLanes, true), drain(big, 1, false)].map((p) => p.catch((err) => { stop ??= err; })));
      if (stop) throw stop;
    } finally {
      // the worker re-reads what it may serve, also after an abort or a full disk
      dirty = true;
      await flush();
    }
    const complete = failed === 0;
    // a complete run may drop what the manifest no longer lists; a partial one never deletes anything
    if (complete && orphans.length) for (const path of orphans) await cache.delete(this.urlOf(path));
    const result = { ...snapshot(), complete };
    onProgress?.(result);
    return result;
  }

  /** Delete the saved files of `packs` (an unticked voice pack). */
  async removePacks(packs) {
    const drop = new Set(packs);
    if (!drop.size || !this.caches) return 0;
    const cache = await this.caches.open(CACHE_NAME);
    let n = 0;
    for (const f of this.manifest.files) if (drop.has(f.pack) && await cache.delete(this.urlOf(f.path))) n++;
    return n;
  }

  /** Delete the whole cache (Settings ▸ Preload assets ▸ Clear cache). */
  async clear() {
    if (this.caches) await this.caches.delete(CACHE_NAME);
  }
}
