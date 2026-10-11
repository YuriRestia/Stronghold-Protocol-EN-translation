// shared/gen.js — URL layout of a server "generation" (zero-downtime restarts: scripts/router.mjs, scripts/generations.mjs).
// A generation is one server process of one release. Behind the router every page of a generation lives under its own
// prefix, so a deploy never swaps the modules under an open tab and a running match keeps its own server:
//
//     /_build/<gen>/_/…       the public tree (/_build/<gen>/_/js/main.js = /js/main.js) and /data /sim /i18n /packs
//                             /healthz /ws /data.js
//     /_build/<gen>/shared/…  shared/ — the client's `../../shared/x.js` imports climb out of `_/`, exactly as they climb
//                             out of public/ on disk (at the bare root a browser clamps that extra `..` away)
//     /_build/<gen>/          the page itself (index.html)
//
// /assets /media /fonts /icons (and /manifest.json, /resource-sw.js) stay unprefixed: they are shared by every generation
// and cached by Cloudflare. Without a prefix (dev, tests, a direct visit) nothing changes.

/** A generation id: what scripts/generations.mjs mints (UTC yymmdd-hhmmss), or any short safe name. */
export const GEN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
export const GEN_ROOT = '/_build/';
/** The absorber segment between the prefix and the public tree. */
export const GEN_APP = '_';
/** Top-level paths shared by every generation (never prefixed). */
export const GEN_SHARED_DIRS = Object.freeze(['assets', 'media', 'fonts', 'icons']);
export const GEN_SHARED_FILES = Object.freeze(['/manifest.json', '/resource-sw.js', '/favicon.ico']);

/**
 * Split a raw request path into its generation and the path the server serves.
 * @param {string} rawPath e.g. '/_build/g1/_/js/main.js'
 * @returns {{ gen: string|null, rest: string, base: string, redirect: string|null }}
 *   gen: the prefix's generation (null: no prefix); rest: the unprefixed path ('/js/main.js'); base: the prefix that
 *   belongs in front of `rest` ('/_build/g1/_', '/_build/g1' for shared/ or the page); redirect: set for '/_build/g1'
 *   (no trailing slash) — answer 301 to it.
 */
export function splitGenPath(rawPath) {
  const p = String(rawPath || '/');
  if (!p.startsWith(GEN_ROOT)) return { gen: null, rest: p, base: '', redirect: null };
  const after = p.slice(GEN_ROOT.length);
  const slash = after.indexOf('/');
  const gen = slash < 0 ? after : after.slice(0, slash);
  if (!GEN_ID_RE.test(gen)) return { gen: null, rest: p, base: '', redirect: null };
  const pre = `${GEN_ROOT}${gen}`;
  if (slash < 0) return { gen, rest: '/', base: pre, redirect: `${pre}/` };
  const rest = after.slice(slash);
  if (rest === `/${GEN_APP}` || rest.startsWith(`/${GEN_APP}/`)) {
    return { gen, rest: rest.slice(GEN_APP.length + 1) || '/', base: `${pre}/${GEN_APP}`, redirect: null };
  }
  return { gen, rest, base: pre, redirect: null };
}

/** True for a path every generation shares (served unprefixed). @param {string} p */
export function isGenSharedPath(p) {
  if (GEN_SHARED_FILES.includes(p)) return true;
  const top = p.split('/')[1] || '';
  return GEN_SHARED_DIRS.includes(top);
}

/**
 * The URL of a root-absolute path inside generation `gen` (null/'' → the path itself).
 * @param {string|null} gen @param {string} p '/data/x.json'
 */
export function genPath(gen, p) {
  if (!gen || typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.startsWith(GEN_ROOT) || isGenSharedPath(p)) return p;
  if (p.startsWith('/shared/')) return `${GEN_ROOT}${gen}${p}`;
  return `${GEN_ROOT}${gen}/${GEN_APP}${p}`;
}

/**
 * index.html for a page served under generation `gen`: its root-absolute module, style and import-map paths
 * (`"/js/…"`, `"/css/…"`, `"/vendor/…"`) point into the generation; icons, fonts and the manifest stay shared.
 * @param {string} htmlText @param {string} gen
 */
export function rewriteIndexHtml(htmlText, gen) {
  return String(htmlText).replace(/"\/(js|css|vendor)\//g, `"${GEN_ROOT}${gen}/${GEN_APP}/$1/`);
}
