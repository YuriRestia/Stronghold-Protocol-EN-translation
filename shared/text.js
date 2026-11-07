// shared/text.js — cleaning free text a player typed (nicknames, match chat). Runs on the server, which decides, and in
// the browser, whose chat counter must count exactly what the server will charge.

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

/** How many letters a cleaned text costs: one per code point, so a CJK character or an emoji is one, spaces too. */
export const letterCount = (s) => [...s].length;

// Chat only: characters that draw nothing but are not whitespace, so a line of them would cost letters and pop an empty
// bubble: everything Unicode calls default-ignorable (the Hangul fillers \u3164 \u115f \u1160 \uffa0, variation
// selectors, tag characters), the blank braille cell and the object replacement character. \ufe0f stays: it makes an
// emoji draw as an emoji. Nicknames keep cleanText alone.
const CHAT_FILLER_RE = /(?!\ufe0f)[\p{Default_Ignorable_Code_Point}\u2800\ufffc]/gu;
/** Something that draws by itself: not a space, not a combining mark, not \ufe0f on its own. */
const VISIBLE_RE = /[^\s\p{M}\ufe0f]/u;

/** cleanText plus the fillers above; '' when nothing visible is left. @param {string} raw @returns {string} */
export function cleanChat(raw) {
  const s = cleanText(raw.replace(CHAT_FILLER_RE, ''));
  return VISIBLE_RE.test(s) ? s : '';
}

/**
 * The first `n` code points of a cleaned chat line, without a space left dangling at the cut; '' when the cut leaves
 * nothing visible. @param {string} s @param {number} n @returns {string}
 */
export function chopChat(s, n) {
  const cut = [...s].slice(0, Math.max(0, n)).join('').trim();
  return VISIBLE_RE.test(cut) ? cut : '';
}
