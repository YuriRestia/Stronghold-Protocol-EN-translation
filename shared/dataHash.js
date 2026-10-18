// shared/dataHash.js — (fork) content-hashed URLs of the big data files (host bandwidth).
//
// data/assets.json, data/local-assets.json, data/local-fx.json and the preload's resource-manifest.json are served
// `no-cache` at their plain /data/ URLs, so a CDN in front of the server sends every request on to it. The same files
// are also served at `/data/h/<hash>/<name>`: when <hash> is the one the server holds now (a served manifest's view
// hash, server/http/assetViews.js; the preload manifest's version, server/resources.js) the answer is `immutable` for a
// year, so a CDN keeps it; any other hash gets the current file with `no-cache`, like the plain URL.
//
// The page learns the hashes from a <meta name="sp-data-hashes"> tag the server writes into index.html
// (server/http/static.js) and builds the URLs with public/js/dataUrls.js; without the tag it uses the plain URLs.

/** URL root of the hashed copies. */
export const DATA_HASH_ROOT = '/data/h/';

/** Name of the index.html meta tag that carries the hashes (`name:hash,name:hash`). */
export const DATA_HASH_META = 'sp-data-hashes';

/** The files served at a hashed URL, by their name under /data/. */
export const DATA_HASHED_FILES = Object.freeze(['assets.json', 'local-assets.json', 'local-fx.json', 'resource-manifest.json']);

const HASH_RE = /^[0-9a-f]{8,64}$/;

/**
 * The /data/ path of `name`: its hashed copy when `hash` is a valid hash of a hashed file, else the plain path.
 * @param {string} name a file name under /data/ @param {string | null | undefined} [hash]
 */
export function dataHashPath(name, hash) {
  return typeof hash === 'string' && HASH_RE.test(hash) && DATA_HASHED_FILES.includes(name)
    ? `${DATA_HASH_ROOT}${hash}/${name}` : `/data/${name}`;
}

/**
 * '/data/h/<hash>/assets.json' → { hash, name: 'assets.json' }; any other path (another file, a malformed hash) → null.
 * @param {string} path a decoded URL path (no query)
 */
export function splitDataHash(path) {
  const p = String(path ?? '');
  if (!p.startsWith(DATA_HASH_ROOT)) return null;
  const rest = p.slice(DATA_HASH_ROOT.length);
  const slash = rest.indexOf('/');
  if (slash < 0) return null;
  const hash = rest.slice(0, slash);
  const name = rest.slice(slash + 1);
  return HASH_RE.test(hash) && DATA_HASHED_FILES.includes(name) ? { hash, name } : null;
}

/** { 'assets.json': 'ab…' } → 'assets.json:ab…' (the meta tag's content; unknown names and bad hashes left out). */
export function formatDataHashes(hashes) {
  return DATA_HASHED_FILES.filter((n) => typeof hashes?.[n] === 'string' && HASH_RE.test(hashes[n])).map((n) => `${n}:${hashes[n]}`).join(',');
}

/** The meta tag's content → { name: hash } (anything malformed left out). */
export function parseDataHashes(text) {
  const out = {};
  if (typeof text !== 'string') return out;
  for (const part of text.split(',')) {
    const i = part.indexOf(':');
    const name = part.slice(0, i).trim();
    const hash = part.slice(i + 1).trim();
    if (i > 0 && DATA_HASHED_FILES.includes(name) && HASH_RE.test(hash)) out[name] = hash;
  }
  return out;
}
