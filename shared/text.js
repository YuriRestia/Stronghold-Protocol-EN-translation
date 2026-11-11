// shared/text.js — cleaning free text a player typed (nicknames, match chat). Runs on the server, which decides, and in
// the browser, whose chat counter must count exactly what the server will charge.

import { CHAT_LINE_LETTERS, CHAT_LINE_CODEPOINTS } from './constants.js';

// Control chars, zero-width & bidi controls, BOM.
const STRIP_RANGES = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]];
const hexEscape = (n) => '\\u' + n.toString(16).padStart(4, '0');
const STRIP_RE = new RegExp('[' + STRIP_RANGES.map(([a, b]) => (a === b ? hexEscape(a) : `${hexEscape(a)}-${hexEscape(b)}`)).join('') + ']', 'g');
const LONE_SURROGATE_RE = /[\ud800-\udfff]/gu; // with the u flag a pair is one code point, so only a lone half matches

/**
 * NFC; strip control / invisible characters and lone surrogates; collapse whitespace; trim both ends.
 * @param {string} raw @returns {string}
 */
export function cleanText(raw) {
  return raw.normalize('NFC').replace(LONE_SURROGATE_RE, '').replace(/\s+/g, ' ').replace(STRIP_RE, '').replace(/ {2,}/g, ' ').trim();
}

// (fork) Letters as a reader counts them: grapheme clusters, so an accented letter, a Thai or Hindi syllable or a Korean
// block is one, whatever code points build it (user, 2026-11-11). Plain ASCII is one per character without segmenting.
const SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : null;
const ASCII_RE = /^[\x20-\x7e]*$/;
const graphemes = (s) => (SEGMENTER ? Array.from(SEGMENTER.segment(s), (g) => g.segment) : [...s]);

/** How many letters a cleaned text costs: one per grapheme cluster (a CJK character is one, spaces too). */
export const letterCount = (s) => (ASCII_RE.test(s) ? s.length : graphemes(s).length);

// ---------------------------------------------------------------------------------------------------
// (fork) Chat: plain text only (user, 2026-11-11) — match chat and room chat. What a human writes in a book: letters of
// every script, digits, punctuation, currency signs and a few plain maths signs, with at most 2 accents / vowel marks on
// a letter. No HTML-looking tags, no emoji, pictographs or other symbols, no control, zero-width, bidi, private-use or
// invisible "filler" characters. The page renders the result as text, never as markup (textContent), so this is about
// what players see, not about script injection. Examples and the reasons: docs/design/network.md "Chat text".
// ---------------------------------------------------------------------------------------------------

/** More than this many UTF-16 units of a line are never looked at (a huge paste): the line cap is far below it. */
export const CHAT_RAW_LIMIT = 2000;
// fullwidth CJK punctuation (，！。「」) stays as typed; everything else is NFKC-folded, which turns fancy-font, fullwidth and
// circled letters (𝓗𝓮𝓵𝓵𝓸, ｆｕｌｌ, Ⓖ) into plain ones
const NOT_FW_PUNCT_RUN_RE = /[^\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65\u3000-\u303f]+/gu;
// anything that looks like an HTML tag (<b>, </script>, <img …>); "<3" and "2 < 5" are not tags
const TAG_RE = /<\s*\/?\s*[a-z!][^<>]{0,200}>/giu;
// a character outside the allowed set goes, together with any marks riding on it
const DROP_RE = /(?:\p{Default_Ignorable_Code_Point}|[^\p{L}\p{N}\p{P}\p{Sc}\p{Mn}\p{Mc}\s+<=>|~\u00d7\u00f7\u00b1])\p{M}*/gu;
const LEAD_MARKS_RE = /(^|\s)[\p{Mn}\p{Mc}]+/gu;            // marks with no letter under them
const MARK_STACK_RE = /([\p{Mn}\p{Mc}]{2})[\p{Mn}\p{Mc}]+/gu;  // at most 2 marks on one letter ("Zalgo")
/** Something that draws by itself: not a space, not a combining mark. */
const VISIBLE_RE = /[^\s\p{M}]/u;

/** A chat line as plain text (the rules above), whitespace collapsed, trimmed; '' when nothing visible is left. Not cut. */
export function cleanChat(raw) {
  const s = String(raw ?? '').slice(0, CHAT_RAW_LIMIT)
    .replace(NOT_FW_PUNCT_RUN_RE, (run) => run.normalize('NFKC'))
    .replace(TAG_RE, ' ').replace(DROP_RE, '').replace(LEAD_MARKS_RE, '$1').replace(MARK_STACK_RE, '$1')
    .replace(/\s+/gu, ' ').trim();
  return VISIBLE_RE.test(s) ? s : '';
}

/**
 * The chat box while typing: the same characters go as in cleanChat (so the box shows what will be sent, and an emoji or
 * a tag never sits there only to vanish on Enter), but spaces stay as typed — a trailing space starts the next word.
 * @param {string} raw @returns {string}
 */
export function chatDraft(raw) {
  return String(raw ?? '').slice(0, CHAT_RAW_LIMIT)
    .replace(NOT_FW_PUNCT_RUN_RE, (run) => run.normalize('NFKC'))
    .replace(TAG_RE, ' ').replace(DROP_RE, '').replace(MARK_STACK_RE, '$1').replace(/\s/gu, ' ');
}

/**
 * The first `n` letters of a cleaned chat line (never more than CHAT_LINE_CODEPOINTS code points under them), without
 * a space left dangling at the cut; '' when the cut leaves nothing visible. @param {string} s @param {number} n
 * @returns {string}
 */
export function chopChat(s, n) {
  const max = Math.max(0, Math.floor(n));
  let cut;
  if (ASCII_RE.test(s)) cut = s.slice(0, Math.min(max, CHAT_LINE_CODEPOINTS));
  else {
    cut = '';
    let letters = 0, cps = 0;
    for (const g of graphemes(s)) {
      const c = [...g].length;
      if (letters >= max || cps + c > CHAT_LINE_CODEPOINTS) break;
      cut += g; letters++; cps += c;
    }
  }
  cut = cut.trim();
  return VISIBLE_RE.test(cut) ? cut : '';
}

/**
 * (fork) A nickname as plain text (user, 2026-11-11): the same rules as chat (cleanChat: no tags, emoji, symbols, invisible
 * or filler characters, fancy letters folded), uncut — the server cuts it to NAME_MAX_LEN code points (server/net.js
 * sanitizeName), the page to as many UTF-16 units (ui/playerName.js). '' when nothing visible is left.
 * @param {string} raw @returns {string}
 */
export const cleanName = (raw) => cleanChat(raw);

/** One chat line as the server sends it: plain text, at most `n` letters (default CHAT_LINE_LETTERS). */
export const chatLine = (raw, n = CHAT_LINE_LETTERS) => chopChat(cleanChat(raw), Math.min(n, CHAT_LINE_LETTERS));
