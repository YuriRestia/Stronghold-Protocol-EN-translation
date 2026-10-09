// server/resources.js — /data/resource-manifest.json, the file list of the optional asset preload (shared/resources.js).
//
// Lists every file under public/assets and public/fonts with its size and the first 12 hex of its SHA-1. Hashing ~820 MB
// takes a while, so the hashes are kept in a cache file keyed by size + mtime (only new or changed files are read again)
// and the manifest is built once per process, in the background at boot (`warm()`); a request that arrives first waits
// for it. Assets only change with a deploy (`npm run setup` / fetch-assets), which restarts the server anyway.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { HASH_LEN, MAX_FILE_BYTES, RESOURCES_FORMAT, packOf, resourceKey } from '../shared/resources.js';
import { acceptsGzip, isNotModified } from './http/files.js';

/** The trees the preload covers, relative to publicDir. */
export const RESOURCE_TREES = Object.freeze(['assets', 'fonts']);
const HASH_CACHE_VERSION = 1;

/** Every file of the trees as [site path, absolute path, stat], sorted by path; dot files are skipped. */
async function listFiles(publicDir) {
  const out = [];
  const walk = async (abs, rel) => {
    let entries;
    try { entries = await fsp.readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.endsWith('~')) continue;
      const child = path.join(abs, e.name);
      const childRel = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(child, childRel);
      else if (e.isFile()) out.push([childRel, child]);
    }
  };
  for (const tree of RESOURCE_TREES) await walk(path.join(publicDir, tree), `/${tree}`);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

/** First HASH_LEN hex of the SHA-1 of a file, streamed. */
export async function hashFile(abs) {
  const h = crypto.createHash('sha1');
  for await (const chunk of fs.createReadStream(abs, { highWaterMark: 1 << 20 })) h.update(chunk);
  return h.digest('hex').slice(0, HASH_LEN);
}

async function readHashCache(file) {
  if (!file) return {};
  try {
    const doc = JSON.parse(await fsp.readFile(file, 'utf8'));
    return doc && doc.version === HASH_CACHE_VERSION && doc.files && typeof doc.files === 'object' ? doc.files : {};
  } catch { return {}; }
}

/**
 * Build the manifest document.
 * @param {{ publicDir: string, hashCacheFile?: string|null, concurrency?: number, log?: any }} opts
 * @returns {Promise<{ format: number, version: string, totalBytes: number, files: [string, number, string][] }>}
 */
export async function buildResourceManifest({ publicDir, hashCacheFile = null, concurrency = 8, log = null }) {
  const t0 = Date.now();
  const listed = await listFiles(publicDir);
  const cached = await readHashCache(hashCacheFile);
  const nextCache = {};
  const files = [];
  let skipped = 0;
  let hashed = 0;
  let next = 0;
  const slots = new Array(listed.length);
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, listed.length)) }, async () => {
    for (let i = next++; i < listed.length; i = next++) {
      const [rel, abs] = listed[i];
      let st;
      try { st = await fsp.stat(abs); } catch { continue; }
      if (st.size > MAX_FILE_BYTES) { skipped++; continue; }
      const key = resourceKey(rel);
      if (!key) continue;
      const stamp = `${st.size}:${Math.floor(st.mtimeMs)}`;
      let hash = cached[rel]?.stamp === stamp ? cached[rel].hash : null;
      if (!hash) {
        try { hash = await hashFile(abs); hashed++; } catch { continue; }
      }
      nextCache[rel] = { stamp, hash };
      slots[i] = [key, st.size, hash];
    }
  }));
  let totalBytes = 0;
  for (const s of slots) if (s) { files.push(s); totalBytes += s[1]; }
  const version = crypto.createHash('sha1').update(files.map((f) => f.join('|')).join('\n')).digest('hex').slice(0, HASH_LEN);
  if (hashCacheFile && hashed > 0) {
    try {
      await fsp.mkdir(path.dirname(hashCacheFile), { recursive: true });
      await fsp.writeFile(hashCacheFile, JSON.stringify({ version: HASH_CACHE_VERSION, files: nextCache }));
    } catch (err) { log?.warn?.(`[resources] hash cache not written: ${err?.message || err}`); }
  }
  log?.info?.(`[resources] preload manifest: ${files.length} files, ${(totalBytes / 1e6).toFixed(0)} MB, ${hashed} hashed`
    + `${skipped ? `, ${skipped} over ${MAX_FILE_BYTES >> 20} MiB skipped` : ''} (${Date.now() - t0} ms)`);
  return { format: RESOURCES_FORMAT, version, totalBytes, files };
}

/** Per-pack totals of a manifest (shared/resources.js SUMMARY_URL). */
export function summarize(doc) {
  const packs = {};
  for (const [p, size] of doc.files) {
    const k = packOf(p);
    packs[k] ??= { files: 0, bytes: 0 };
    packs[k].files++;
    packs[k].bytes += size;
  }
  return { version: doc.version, packs };
}

const encoded = (doc, tag) => {
  const body = Buffer.from(JSON.stringify(doc));
  return { body, gzip: zlib.gzipSync(body), etag: `"${tag}-${doc.version}"` };
};

/**
 * The manifest (and its per-pack summary), built once per process and served gzip + ETag (no-cache: a client
 * revalidates with a cheap 304).
 * @param {{ publicDir: string, hashCacheFile?: string|null, log?: any }} opts
 */
export function createResourceManifest(opts) {
  let pending = null;
  const get = () => {
    pending ??= buildResourceManifest(opts).then((doc) => ({ full: encoded(doc, 'res'), summary: encoded(summarize(doc), 'ress') }))
      .catch((err) => { pending = null; throw err; });
    return pending;
  };
  return {
    /** Start building in the background (boot). */
    warm() { get().catch((err) => opts.log?.warn?.(`[resources] manifest build failed: ${err?.message || err}`)); },
    get,
    /**
     * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
     * @param {'full'|'summary'} [which]
     */
    async serve(req, res, which = 'full') {
      const m = (await get())[which];
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: m.etag, Vary: 'Accept-Encoding' };
      // no Last-Modified is sent, so only If-None-Match can match (a stray If-Modified-Since is ignored)
      if (typeof req.headers['if-none-match'] === 'string' && isNotModified({ headers: { 'if-none-match': req.headers['if-none-match'] } }, m.etag, null)) { res.writeHead(304, headers); res.end(); return; }
      const gz = acceptsGzip(req.headers['accept-encoding']);
      const body = gz ? m.gzip : m.body;
      res.writeHead(200, { ...headers, ...(gz ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    },
  };
}
