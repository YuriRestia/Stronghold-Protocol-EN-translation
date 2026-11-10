// shared/news.js — (fork) the lobby's live update news: the file an operator puts on the servers (scripts/news.mjs,
// logs/news.json) and the `sys.news` frame the server sends (server/news.js). One check for the script, the server and
// the page, so a file the script accepts is one every page can show.
//
// The file: { id, langs: { <lang>: { title, highlights: [line…], points: [line…] } } }
//   id          names this announcement: closing the banner remembers it (`news.<id>`), so a new id shows again to
//               everyone and the same id with a fixed typo does not
//   langs       one entry per UI language code ('en', 'zh', 'ja', 'ko', 'zh-TW', or a language pack's own code); the
//               page shows its language, else its language chain, else 'en', else the news built into the release
//   highlights  the headline lines (the banner's bold mint lines); points: the bulleted list under them
// A line is plain text, plus the game's own colour tags (`<@ba.vup>blue</>`, ui/richText.js): the banner renders text
// nodes only, and anything that is not a known tag stays literal text — no HTML, no links.

export const NEWS_MAX_BYTES = 32 * 1024;
export const NEWS_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
export const NEWS_LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;
export const NEWS_MAX_LANGS = 16;
export const NEWS_TITLE_MAX = 60;
export const NEWS_LINE_MAX = 200;
export const NEWS_MAX_HIGHLIGHTS = 8;
export const NEWS_MAX_POINTS = 16;
// control characters (line breaks included): one line is one line
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** UTF-8 bytes of a string (no TextEncoder: shared code also runs where the type lib lacks it). @param {string} str */
function utf8Bytes(str) {
  let n = 0;
  for (const ch of str) { const c = ch.codePointAt(0) ?? 0; n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
}

/**
 * Every problem of a news file, in plain English (empty when it is valid).
 * @param {unknown} raw parsed JSON
 * @returns {string[]}
 */
export function newsProblems(raw) {
  const out = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['the file must be a JSON object { id, langs }'];
  const { id, langs } = /** @type {any} */ (raw);
  let size = 0;
  try { size = utf8Bytes(JSON.stringify(raw)); } catch { out.push('the file is not plain JSON'); }
  if (size > NEWS_MAX_BYTES) out.push(`the file is ${size} bytes; at most ${NEWS_MAX_BYTES}`);
  if (typeof id !== 'string' || !NEWS_ID_RE.test(id)) out.push('"id" must be 1-40 letters, digits, dots, dashes or underscores, e.g. "0.3.4-1"');
  if (!langs || typeof langs !== 'object' || Array.isArray(langs)) return [...out, '"langs" must be an object of languages'];
  const codes = Object.keys(langs);
  if (!codes.length) out.push('"langs" has no language');
  if (codes.length > NEWS_MAX_LANGS) out.push(`"langs" has ${codes.length} languages; at most ${NEWS_MAX_LANGS}`);
  for (const code of codes) {
    const at = `langs.${code}`;
    if (!NEWS_LANG_RE.test(code)) { out.push(`${at}: not a language code (en, zh, ja, ko, zh-TW …)`); continue; }
    const e = langs[code];
    if (!e || typeof e !== 'object' || Array.isArray(e)) { out.push(`${at} must be { title, highlights, points }`); continue; }
    const line = (v, where, max) => {
      if (typeof v !== 'string' || !v.trim()) out.push(`${where} must be a non-empty text`);
      else if (v.length > max) out.push(`${where} is ${v.length} characters; at most ${max}`);
      else if (CONTROL.test(v)) out.push(`${where} has a line break or a control character`);
    };
    line(e.title, `${at}.title`, NEWS_TITLE_MAX);
    /** @type {[string, number][]} */
    const lists = [['highlights', NEWS_MAX_HIGHLIGHTS], ['points', NEWS_MAX_POINTS]];
    for (const [key, max] of lists) {
      const list = e[key] ?? [];
      if (!Array.isArray(list)) { out.push(`${at}.${key} must be a list of lines`); continue; }
      if (list.length > max) out.push(`${at}.${key} has ${list.length} lines; at most ${max}`);
      list.forEach((v, i) => line(v, `${at}.${key}[${i}]`, NEWS_LINE_MAX));
    }
    if (!(e.highlights ?? []).length && !(e.points ?? []).length) out.push(`${at} has no highlights and no points`);
  }
  return out;
}

/**
 * The news as the page uses it, or null when the file is not valid (newsProblems says why).
 * @param {unknown} raw
 * @returns {{ id: string, langs: Record<string, { title: string, highlights: string[], points: string[] }> } | null}
 */
export function parseNews(raw) {
  if (newsProblems(raw).length) return null;
  const { id, langs } = /** @type {any} */ (raw);
  /** @type {Record<string, { title: string, highlights: string[], points: string[] }>} */
  const out = {};
  for (const [code, e] of Object.entries(langs)) {
    out[code] = { title: e.title.trim(), highlights: (e.highlights ?? []).map((s) => s.trim()), points: (e.points ?? []).map((s) => s.trim()) };
  }
  return { id, langs: out };
}

/**
 * The entry a page in `chain` (its language first, then its fallbacks) shows: the first language of the chain the news
 * has, else its English; null = none (the page shows the news built into the release).
 * @param {{ langs: Record<string, any> } | null | undefined} news
 * @param {string[]} chain
 */
export function newsEntry(news, chain) {
  if (!news?.langs) return null;
  for (const code of [...chain, 'en']) if (news.langs[code]) return news.langs[code];
  return null;
}
