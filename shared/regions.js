// shared/regions.js — (fork) one game on several servers ("regions"; DESIGN §8.7). The page always comes from the main
// domain, so a browser's storage, art cache and stats stay in one place; only the game socket goes to a region.
//
// A room lives on one region. The first letter of its key says which, so a key or an invite link needs no directory and
// keeps working while the servers cannot reach each other: the alphabet is cut into one contiguous run per region, in the
// order the regions are listed (two regions: A–M and N–Z, about 166,000 keys each).
//
// Plain ESM with no Node or browser API: the server and the client read the same rules.

import { CODE_ALPHABET } from './constants.js';

const ID_RE = /^[a-z][a-z0-9-]{0,15}$/;
const HOST_RE = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::\d{1,5})?$/;

/**
 * `sg=stronghold-en.dev,us=us.stronghold-en.dev` → `[{ id, host }, …]`, in that order. Unusable text, a repeated id or
 * host, or fewer than two regions: [] (one server, as without the setting).
 * @param {unknown} raw
 * @returns {{ id: string, host: string }[]}
 */
export function parseRegions(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const list = [];
  for (const part of raw.split(',')) {
    const at = part.indexOf('=');
    if (at < 0) return [];
    const id = part.slice(0, at).trim();
    const host = part.slice(at + 1).trim();
    if (!ID_RE.test(id) || !HOST_RE.test(host)) return [];
    if (list.some((r) => r.id === id || r.host === host)) return [];
    list.push({ id, host });
  }
  return list.length >= 2 ? list : [];
}

/** (fork) A host name, with an optional port, as SP_REGIONS / SP_REGION_SOCKETS take it. @param {unknown} host */
export function isRegionHost(host) {
  return typeof host === 'string' && HOST_RE.test(host);
}

/**
 * The first letters of the keys of every region, one contiguous run each, in listed order. The one table both directions read.
 * @param {{ id: string }[]} list
 * @returns {{ id: string, letters: string }[]}
 */
function letterTable(list) {
  const n = CODE_ALPHABET.length;
  return list.map((r, i) => ({ id: r.id, letters: CODE_ALPHABET.slice(Math.floor((i * n) / list.length), Math.floor(((i + 1) * n) / list.length)) }));
}

/**
 * The first letters of the keys of one region: `''` for an id not in the list.
 * @param {{ id: string }[]} list @param {string} id
 */
export function regionLetters(list, id) {
  return letterTable(list).find((r) => r.id === id)?.letters ?? '';
}

/**
 * The region a room key names, or null when it names none (no regions, or a first letter outside the alphabet).
 * @param {unknown} code @param {{ id: string }[]} list
 * @returns {string | null}
 */
export function regionOfCode(code, list) {
  if (!list?.length || typeof code !== 'string') return null;
  const first = code.trim().toUpperCase()[0];
  if (!first) return null;
  return letterTable(list).find((r) => r.letters.includes(first))?.id ?? null;
}

/** A host of this machine or the local network: spoken to without TLS (tests, a local two-server setup). */
export function isLocalHost(host) {
  const name = String(host).replace(/:\d+$/, '').toLowerCase();
  return name === 'localhost' || name.endsWith('.localhost') || /^127\./.test(name);
}

/**
 * The game socket of a region for a page on `https` or plain http.
 * @param {string} host @param {string} path e.g. '/_build/<gen>/_/ws' @param {boolean} secure the page is https
 */
export function regionSocketUrl(host, path, secure) {
  return `${secure && !isLocalHost(host) ? 'wss' : 'ws'}://${host}${path}`;
}
