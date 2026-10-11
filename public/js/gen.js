// public/js/gen.js — the server generation this page belongs to (zero-downtime restarts, shared/gen.js).
// Behind scripts/router.mjs a page is served at /_build/<gen>/ and its modules from /_build/<gen>/_/…; every root-absolute
// URL the client builds by hand (/data, /sim, /i18n, /packs, /healthz, /ws, /vendor, /css) goes through genUrl() so it
// reaches the same generation. The generation is read from this module's own URL: no global, no server injection.
// Without a prefix (dev, tests, a direct visit) GEN is null and genUrl() returns its argument.

import { GEN_ROOT, splitGenPath, genPath } from '../../shared/gen.js';

/** @param {string} [moduleUrl] @returns {string|null} */
export function genOf(moduleUrl) {
  try {
    const p = new URL(String(moduleUrl)).pathname;
    return p.startsWith(GEN_ROOT) ? splitGenPath(p).gen : null;
  } catch { return null; }
}

export const GEN = genOf(import.meta.url);

/** A root-absolute path in this page's generation ('/data/x.json' → '/_build/<gen>/_/data/x.json'). @param {string} p */
export function genUrl(p) { return genPath(GEN, p); }

/** The page path without its generation prefix: what an invite link names (the router sends it to the current one). */
export function publicPath(pathname = globalThis.location?.pathname || '/') {
  const g = splitGenPath(pathname);
  return g.gen ? g.rest : pathname;
}

/** sessionStorage flag: the page was sent to the new generation (main.js shows a toast after the reload). */
export const RETIRED_FLAG = 'sp-gen-moved';

/**
 * Leave a retired generation for `/` (the router's current one), keeping the query and hash (?room=…, ?lang=…).
 * @param {{ location?: Location, sessionStorage?: Storage }} [g]
 */
export function goHome(g = globalThis) {
  try { g.sessionStorage?.setItem(RETIRED_FLAG, '1'); } catch { /* private mode */ }
  const loc = g.location;
  if (loc) loc.assign(`/${loc.search || ''}${loc.hash || ''}`);
}
