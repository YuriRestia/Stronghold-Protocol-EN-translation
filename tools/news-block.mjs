// tools/news-block.mjs — (fork) the optional `News:` block of a `Kind: player` changelog fragment: the change's line(s)
// for the lobby's update news, in every language the game ships, written when the change is made so a release never
// waits on translation (changes/README.md "News lines"). tools/changelog.mjs checks it and never folds it;
// scripts/release-news.mjs builds the release's news from it.
//
//   News:
//
//   - point: {name:char_1033_swire2}'s champagne bomb leaves with her
//     zh: {name:char_1033_swire2}的香槟炸弹会随她一起离场
//     ja: …
//     ko: …
//     zh-TW: …
//
// `- highlight:` (a bold line on top) or `- point:` (a bullet) starts an item with its English line; the other four
// languages follow, indented. Names are never typed by hand: `{name:<id>}` is the game's own name of an operator, token,
// enemy, item, bond … by its game-data id, and `{term:<Chinese UI text>}` a UI term ("{term:大同盟}" = Grand Alliance)
// from the language packs, both in each line's language. Only where the game data has no name in a language,
// `{name:<id>|<text>}` writes it out (refused when the game data has one). Colour tags as the game uses them
// (`<@ba.vup>…</>`).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEWS_LINE_MAX } from '../shared/news.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The languages every News item carries, English first. */
export const NEWS_LANGS = Object.freeze(['en', 'zh', 'ja', 'ko', 'zh-TW']);
export const NEWS_KINDS = Object.freeze(['highlight', 'point']);
const PLACEHOLDER = /\{(name|term):([^{}|]+)(?:\|([^{}]*))?\}/g;
/** The placeholders of a line without their `|text` (compared across languages). */
const KEYS = /\{(?:name|term):[^{}|]+/g;
const TAG = /<[@$][A-Za-z0-9_.]+>|<\/>/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Parse a fragment's `News:` block (its text from the `News:` line on).
 * @param {string} name file name (for messages) @param {string} block
 * @returns {{ items: { kind: 'highlight'|'point', lines: Record<string, string> }[], errors: string[] }}
 */
export function parseNewsBlock(name, block) {
  const errors = [], items = [];
  const lines = String(block).replace(/\r/g, '').split('\n');
  if (lines[0].replace(/^News:/, '').trim()) errors.push(`${name}: "News:" stands alone on its line; the items follow as "- point: …" / "- highlight: …"`);
  let cur = null;
  for (const raw of lines.slice(1)) {
    if (!raw.trim()) continue;
    const start = /^- (highlight|point|\S+):\s*(.*)$/.exec(raw);
    if (start) {
      if (!NEWS_KINDS.includes(start[1])) { errors.push(`${name}: News item "${raw.slice(0, 40)}": starts with "- highlight:" or "- point:"`); cur = null; continue; }
      cur = { kind: /** @type {'highlight'|'point'} */ (start[1]), lines: { en: start[2].trim() } };
      items.push(cur);
      continue;
    }
    const tr = /^\s+([A-Za-z-]+):\s*(.*)$/.exec(raw);
    if (tr && cur) {
      const lang = tr[1];
      if (!NEWS_LANGS.includes(lang) || lang === 'en') errors.push(`${name}: News item "${cur.lines.en.slice(0, 40)}": unknown language "${lang}" (${NEWS_LANGS.slice(1).join(', ')})`);
      else if (lang in cur.lines) errors.push(`${name}: News item "${cur.lines.en.slice(0, 40)}": "${lang}" twice`);
      else cur.lines[lang] = tr[2].trim();
      continue;
    }
    errors.push(`${name}: News block line "${raw.slice(0, 60)}": not "- point: …", "- highlight: …" or an indented "zh: …" line`);
  }
  if (!items.length && !errors.length) errors.push(`${name}: the "News:" block has no "- point:" or "- highlight:" item`);
  return { items, errors };
}

/** Collect id → name pairs from a game-data tree: keyed objects with a `name`, and objects with charId/id and a name. */
function collectNames(tree, out = new Map(), depth = 0) {
  if (!tree || typeof tree !== 'object' || depth > 6) return out;
  if (Array.isArray(tree)) { for (const v of tree) collectNames(v, out, depth + 1); return out; }
  if (typeof tree.name === 'string' && tree.name) {
    for (const k of ['charId', 'id', 'tokenId', 'enemyId']) if (typeof tree[k] === 'string' && !out.has(tree[k])) out.set(tree[k], tree.name);
  }
  for (const [k, v] of Object.entries(tree)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.name === 'string' && v.name && /^[a-z]+_[A-Za-z0-9_@#]+$|Ship$/.test(k) && !out.has(k)) out.set(k, v.name);
    collectNames(v, out, depth + 1);
  }
  return out;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * The game's own names, as each language shows them: `name(id, lang)` and `term(zh, lang)` → { text } | { error }.
 * Sources (all in git): data/*.json (Chinese names by id), data/i18n/<lang>.json (the official game data's names in
 * that language), public/i18n/<lang>.json (the UI packs). zh-TW falls back to the Chinese name, as the game does.
 * @param {string} [root]
 */
export function createNames(root = ROOT) {
  let zhById = null;
  const lang = new Map();
  const zhNames = () => {
    if (!zhById) {
      zhById = new Map();
      const dir = join(root, 'data');
      for (const f of (existsSync(dir) ? readdirSync(dir) : []).filter((n) => n.endsWith('.json')).sort()) {
        try { collectNames(readJson(join(root, 'data', f)), zhById); } catch { /* not a data table */ }
      }
    }
    return zhById;
  };
  const packs = (code) => {
    if (!lang.has(code)) {
      const dataFile = join(root, 'data', 'i18n', `${code}.json`), uiFile = join(root, 'public', 'i18n', `${code}.json`);
      const data = existsSync(dataFile) ? readJson(dataFile) : {};
      lang.set(code, { names: data.names || {}, byId: collectNames(data.files || {}), ui: existsSync(uiFile) ? readJson(uiFile) : {} });
    }
    return lang.get(code);
  };
  const str = (v) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    /** @param {string} id @param {string} code @param {string} [own] the `|text` of the placeholder */
    name(id, code, own) {
      const zh = zhNames().get(id);
      if (!zh) return { error: `{name:${id}}: no such id in the game data (data/*.json)` };
      const found = (c) => { const p = packs(c); return str(p.names[zh]) ?? str(p.ui[zh]) ?? str(p.byId.get(id)); };
      let text = code === 'zh' ? zh : found(code);
      if (text && code !== 'en' && code !== 'zh' && text === found('en')) text = null; // an English copy, not a translation
      if (own != null) {
        if (text) return { error: `{name:${id}|${own}}: the game data names it "${text}" in ${code}; write {name:${id}}` };
        return str(own) ? { text: own.trim() } : { error: `{name:${id}|}: empty name` };
      }
      if (text) return { text };
      if (code === 'zh-TW') return { text: zh };
      return { error: `{name:${id}}: the game data has no ${code} name for ${zh}; write it out as {name:${id}|<name>}` };
    },
    term(zh, code) {
      if (code === 'zh') return { text: zh };
      const p = packs(code);
      const text = str(p.ui[zh]) ?? str(p.names[zh]);
      if (text) return { text };
      if (code === 'zh-TW') return { text: zh };
      return { error: `{term:${zh}}: the ${code} language pack has no "${zh}"` };
    },
  };
}

/** A line with its placeholders filled in for `code`. @param {string} line @param {string} code @param {ReturnType<typeof createNames>} names */
export function expandLine(line, code, names) {
  const errors = [];
  const text = String(line).replace(PLACEHOLDER, (all, kind, key, own) => {
    const got = kind === 'name' ? names.name(key.trim(), code, own) : names.term(key.trim(), code);
    if ('error' in got) { errors.push(got.error); return all; }
    return got.text;
  });
  return { text, errors };
}

const sorted = (s, re) => (String(s).match(re) || []).sort().join(' ');

/**
 * Check the items (every language present, the same placeholders and colour tags in each, within the line limit once
 * filled in) and return them filled in per language.
 * @param {string} name @param {{ kind: string, lines: Record<string, string> }[]} items
 * @param {ReturnType<typeof createNames>} names
 * @returns {{ errors: string[], expanded: { kind: 'highlight'|'point', lines: Record<string, string> }[] }}
 */
export function checkNewsItems(name, items, names) {
  const errors = [], expanded = [];
  for (const it of items) {
    const label = `${name}: News ${it.kind} "${String(it.lines.en || '').slice(0, 40)}"`;
    const missing = NEWS_LANGS.filter((l) => !String(it.lines[l] || '').trim());
    if (missing.length) { errors.push(`${label}: no ${missing.join(', ')} line (every item carries ${NEWS_LANGS.join(', ')})`); continue; }
    const out = {};
    for (const l of NEWS_LANGS) {
      if (sorted(it.lines[l], KEYS) !== sorted(it.lines.en, KEYS)) errors.push(`${label}: the ${l} line has other {name:…}/{term:…} than the English one`);
      const { text, errors: e } = expandLine(it.lines[l], l, names);
      errors.push(...e.map((x) => `${label}: ${l}: ${x}`));
      if (sorted(text, TAG) !== sorted(expandLine(it.lines.en, 'en', names).text, TAG)) errors.push(`${label}: the ${l} line has other colour tags than the English one`);
      if (text.length > NEWS_LINE_MAX) errors.push(`${label}: the ${l} line is ${text.length} characters once filled in; at most ${NEWS_LINE_MAX}`);
      if (CONTROL.test(text)) errors.push(`${label}: the ${l} line has a control character`);
      out[l] = text;
    }
    expanded.push({ kind: /** @type {'highlight'|'point'} */ (it.kind), lines: out });
  }
  return { errors, expanded };
}
