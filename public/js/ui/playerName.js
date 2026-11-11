import { NAME_MAX_LEN } from '../../../shared/constants.js';
import { cleanName } from '../../../shared/text.js';

// The same plain-text rules as server/net.js sanitizeName (shared/text.js cleanName, the chat rules), so a name the
// client accepts is never changed or rejected by the server's hello validation.
// Lone surrogates are removed by a scan, not a regex: the lookbehind such a regex needs is a *syntax error* in Safari
// < 16.4, which would stop the whole client from loading there.
export function stripLoneSurrogates(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) { out += str[i] + str[i + 1]; i++; }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    out += str[i];
  }
  return out;
}

/**
 * Normalise a nickname like the server does (fork: plain text, shared/text.js cleanName — no tags, emoji, symbols or
 * invisible characters, whitespace collapsed, trimmed), then clamp to NAME_MAX_LEN UTF-16 code units — the protocol's
 * `hello.name` limit — without splitting a surrogate pair.
 * @param {any} raw
 * @returns {string}
 */
export function sanitizeName(raw) {
  let s = cleanName(stripLoneSurrogates(String(raw ?? '')));
  if (s.length > NAME_MAX_LEN) {
    s = s.slice(0, NAME_MAX_LEN);
    // Don't leave half a surrogate pair at the end.
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
    s = s.trim();
  }
  return s;
}

/** @param {any} raw @returns {boolean} */
export const isValidName = (raw) => sanitizeName(raw).length > 0;
