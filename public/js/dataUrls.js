// public/js/dataUrls.js — (fork) the URL of a big data file (shared/dataHash.js): its content-hashed copy when the page's
// index.html names the file's hash in <meta name="sp-data-hashes">, so a CDN can keep it, else the plain /data/ URL.
// Always in this page's generation (gen.js): the hash names that generation's file.

import { DATA_HASH_META, dataHashPath, parseDataHashes } from '../../shared/dataHash.js';
import { genUrl } from './gen.js';

/** The hashes the page was served with ({} without the tag: dev pages, tests, an older server). */
export function readDataHashes(doc = globalThis.document) {
  try { return parseDataHashes(doc?.querySelector?.(`meta[name="${DATA_HASH_META}"]`)?.getAttribute('content') || ''); } catch { return {}; }
}

const HASHES = readDataHashes();

/**
 * The URL to fetch `/data/<name>` from: '/data/h/<hash>/<name>' when the page knows its hash, else '/data/<name>'.
 * @param {string} name a file name under /data/ @param {Record<string, string>} [hashes]
 */
export function dataUrl(name, hashes = HASHES) {
  return genUrl(dataHashPath(name, hashes[name]));
}

/** Is `name` at its hashed URL on this page? (Such a URL never changes its bytes: no revalidation needed.) */
export function hasDataHash(name, hashes = HASHES) {
  return dataHashPath(name, hashes[name]) !== `/data/${name}`;
}
