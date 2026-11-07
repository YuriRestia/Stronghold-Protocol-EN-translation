// shared/i18n.js — gettext-style translation for the browser and Node (no framework, no dependency, no Node builtin).
//
// The Chinese source string is the message id: `t('整备区已满')`, `t('还剩 {n} 秒', { n })`. A message without a
// translation in the current language falls back to the Chinese text, so an untranslated string is never blank.
// Chinese ('zh') is the default language; every other language is a pack (shared/i18nPacks.js): a file in
// public/i18n/ (or a pack folder, shared/packs.js) that the client lists from /packs/index.json and loads on demand
// (ui/lang.js). Nothing here knows a language by name (the owner's decisions of 2026-10-05 and 2026-10-07: Chinese by
// default, a language is a file in the language folder). docs/I18N.md explains how to add and translate strings and how
// to add a language.
//
// Fallback chain per string: the chosen pack → its base (pt-BR → pt; zh-TW has none) → the packs its `_meta.fallback`
// names (e.g. English) → the Chinese msgid (i18nPacks.js computeChain). A partial pack is fine: what it lacks falls
// through. A translation that drops a placeholder of its msgid, or uses one the caller does not pass, or has a broken
// plural form, is skipped like a missing one (setI18nWarn reports it; the client warns in development).
//
// Context: the same Chinese text may need two translations ('关闭' = "Close" on a button, "Off" on a switch):
// `tc('toggle', '关闭')` looks up the key 'toggle::关闭' first, then '关闭' (in each language of the chain); Chinese shows
// '关闭'. Module-level tables are evaluated once, before a language can change: mark their strings N_('…') (a no-op that
// tools/i18n.mjs extracts) and call t() where they are shown.
//
// Placeholders (the same in msgids and translations):
//   {name}                  the value of params.name (params may also be an array: {0}, {1} …)
//   {n|one|other}           two plain forms: `one` when the language's plural category of Number(params.n) is 'one'
//                           (Intl.PluralRules; in English exactly when n is 1), else `other`
//   {n|one:…|few:…|other:…} named forms for languages with more categories (zero, one, two, few, many, other; `other`
//                           is required): the form of the category, else `other`
// A value that is an array renders as a list joined with the language's separator (the translation of 'list::、', '、' in
// Chinese, ', ' without one); a value `{ dn: '…' }` (made by `dn()`) is a game-data name, translated through the name
// resolver the client installs (setNameResolver). A placeholder whose value is missing stays verbatim, so official
// templates such as '{0}博士…' survive untouched.
//
// Server → client messages (m.toast / m.ticker): the server builds `msg(msgid, params)` and sends
// `wireMessage(m)` = { text: <the Chinese rendering>, msgid, params } — `text` keeps older clients working, the client
// renders `translateWire(frame)` in its own language. A plain string message is its own msgid.

import { SOURCE_LANG, canonicalLang, primaryLang, packMeta, computeChain } from './i18nPacks.js';

/** The default language, the source language of every msgid. */
export const DEFAULT_LANG = SOURCE_LANG;

/** @typedef {import('./i18nPacks.js').LangMeta} LangMeta */

/** The source language: built in, no pack, no catalog. */
const SOURCE_META = Object.freeze({
  code: SOURCE_LANG, name: '中文', englishName: 'Chinese (Simplified)', authors: [], credits: '', version: '', app: '', // i18n-ignore: its own name
  base: null, fallback: [], complete: true, machineTranslated: false, numberUnits: ['万', '亿'], builtin: true, // i18n-ignore: the Chinese number units
});

/** @type {Map<string, LangMeta>} code → metadata: the source, the packs of the index, languages given messages */
const registry = new Map([[SOURCE_LANG, /** @type {LangMeta} */ (/** @type {unknown} */ (SOURCE_META))]]);
/** @type {Map<string, Map<string, string>>} lang → msgid → translation */
const catalogs = new Map();
let current = DEFAULT_LANG;
/** @type {Set<(lang: string, prev: string) => void>} */
const listeners = new Set();
/** @type {Set<() => void>} */
const langsListeners = new Set();
/** @type {((name: string, lang: string) => string) | null} */
let nameResolver = null;
/** @type {Map<string, string[]>} lang → its chain (cleared whenever the registry changes) */
const chains = new Map();
/** @type {Map<string, Map<string, { ok: boolean, problems: string[], extras: string[] }>>} lang → key → checkTranslation */
const checked = new Map();
/** @type {((info: { lang: string, key: string, problems: string[] }) => void) | null} */
let warnHook = null;
/** lang + key already reported (once each) */
const warned = new Set();

const report = (lang, key, problems) => {
  if (!warnHook) return;
  const id = `${lang}\u0000${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  try { warnHook({ lang, key, problems }); } catch { /* a broken hook never breaks a render */ }
};

const notifyLangs = () => {
  chains.clear();
  for (const fn of [...langsListeners]) {
    try { fn(); } catch (err) { /** @type {any} */ (globalThis).console?.error('[i18n] listener failed', err); }
  }
};

/**
 * Register languages (the client: the language entries of /packs/index.json, shared/packs.js langMetaOf). A known code
 * is merged with what is there. Listeners of onLangsChange run once.
 * @param {Partial<LangMeta>[]} entries each with a `code`
 * @returns {number} languages registered
 */
export function registerLangs(entries) {
  let n = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    const code = canonicalLang(e?.code);
    if (!code || code === SOURCE_LANG) continue;
    const prev = registry.get(code);
    registry.set(code, /** @type {LangMeta} */ ({ ...(prev || packMeta(code, null)), ...e, code }));
    n++;
  }
  if (n) notifyLangs();
  return n;
}

/**
 * The known languages, the source first, then by code: what the language menu lists.
 * @returns {LangMeta[]}
 */
export function getLangs() {
  const rest = [...registry.values()].filter((m) => m.code !== SOURCE_LANG).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return [registry.get(SOURCE_LANG), ...rest];
}

/**
 * The metadata of a known language (its names, chain fields, `complete`, `machineTranslated` …: what registerLangs or its
 * pack's `_meta` gave), or null.
 * @param {string} [lang]
 */
export const langInfo = (lang = current) => registry.get(String(lang)) || null;

/**
 * Subscribe to changes of the known languages (the index arrived, a pack loaded).
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function onLangsChange(fn) {
  langsListeners.add(fn);
  return () => { langsListeners.delete(fn); };
}

/**
 * The languages a lookup tries for `lang`, best first; the Chinese msgid comes after them (i18nPacks.js computeChain).
 * Empty for the source language.
 * @param {string} [lang]
 * @returns {string[]}
 */
export function langChain(lang = current) {
  const code = String(lang);
  if (code === SOURCE_LANG) return [];
  let c = chains.get(code);
  if (!c) {
    c = computeChain(code, (x) => registry.get(x), (x) => registry.has(x) || catalogs.has(x));
    chains.set(code, c);
  }
  return c;
}

/**
 * A known language code from loose input ('en-US' → 'en' when 'en' is known, 'zh_CN' → 'zh', 'PT-br' → 'pt-BR'), or
 * null: the exact code, then the same code in any case, then its language part.
 * @param {unknown} v
 * @returns {string|null}
 */
export function normalizeLang(v) {
  const code = canonicalLang(v);
  if (!code) return null;
  if (registry.has(code)) return code;
  const lower = code.toLowerCase();
  for (const c of registry.keys()) if (c.toLowerCase() === lower) return c;
  const p = primaryLang(code);
  return registry.has(p) ? p : null;
}

/** The current language code. */
export function getLang() { return current; }

/**
 * Switch the language (unknown codes fall back to the default). Listeners run when it actually changed.
 * @param {unknown} lang
 * @returns {boolean} true when the language changed
 */
export function setLang(lang) {
  const next = normalizeLang(lang) || DEFAULT_LANG;
  if (next === current) return false;
  const prev = current;
  current = next;
  for (const fn of [...listeners]) {
    try { fn(next, prev); } catch (err) { /** @type {any} */ (globalThis).console?.error('[i18n] listener failed', err); }
  }
  return true;
}

/**
 * Subscribe to language changes.
 * @param {(lang: string, prev: string) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Add translations for a language (merged into what is there; the language is registered — with the pack's `_meta`
 * when the dict carries one). Keys starting with '_' are metadata and skipped; only non-empty string values count.
 * @param {string} lang
 * @param {Record<string, unknown> | null | undefined} dict msgid → translation (a whole pack file)
 * @returns {number} entries added
 */
export function addMessages(lang, dict) {
  const l = canonicalLang(lang);
  if (!l || !dict || typeof dict !== 'object') return 0;
  let cat = catalogs.get(l);
  if (!cat) { cat = new Map(); catalogs.set(l, cat); }
  checked.delete(l);
  let n = 0;
  for (const [k, v] of Object.entries(dict)) {
    if (k.startsWith('_') || typeof v !== 'string' || !v) continue;
    cat.set(k, v);
    n++;
  }
  if (l !== SOURCE_LANG && !registry.get(l)?.packId && (dict._meta || !registry.has(l))) {
    // a language the pack index did not list (no index, tests): what its own `_meta` says; an index entry (made from
    // the pack's manifest by the server) stays as it is
    registry.set(l, packMeta(l, dict));
    notifyLangs();
  } else chains.clear();
  return n;
}

/**
 * Replace a language's translations.
 * @param {string} lang
 * @param {Record<string, unknown> | null | undefined} dict
 * @returns {number}
 */
export function setMessages(lang, dict) {
  const l = canonicalLang(lang);
  if (!l) return 0;
  catalogs.delete(l);
  checked.delete(l);
  return addMessages(l, dict);
}

/**
 * Whether a msgid has a translation in a language's own pack (the default language always "has" its own msgids).
 * @param {string} msgid
 * @param {string} [lang]
 */
export function hasMessage(msgid, lang = current) {
  const l = normalizeLang(lang) || DEFAULT_LANG;
  return l === DEFAULT_LANG || !!catalogs.get(l)?.has(String(msgid));
}

/**
 * Install the reporter of skipped translations (a dropped or unknown placeholder, a broken plural form): called once per
 * language and key. The client installs console.warn in development (ui/lang.js); null turns it off.
 * @param {((info: { lang: string, key: string, problems: string[] }) => void) | null} fn
 */
export function setI18nWarn(fn) { warnHook = typeof fn === 'function' ? fn : null; warned.clear(); }

/**
 * Install the translator of game-data names (`{ dn: '…' }` params and `tName`). The client maps a Chinese name to the
 * current language through the localized game data; without a resolver names stay Chinese.
 * @param {((name: string, lang: string) => string) | null} fn
 */
export function setNameResolver(fn) { nameResolver = typeof fn === 'function' ? fn : null; }

/**
 * A game-data name (operator, item, bond …) in the current language.
 * @param {unknown} name the Chinese name from the data
 * @param {string} [lang]
 * @returns {string}
 */
export function tName(name, lang = current) {
  const s = name == null ? '' : String(name);
  if (!s || lang === DEFAULT_LANG || !nameResolver) return s;
  try { return nameResolver(s, lang) || s; } catch { return s; }
}

// ---- player names: a player's name is never translated, even one that equals an operator's (a human called 能天使 stays
// 能天使; the old bug of 99af5f99). The one exception is an AI seat's server-given name, 「AI·」 + an operator's Chinese name
// (server/lobby.js BOT_NAMES), and what decides that is the seat's isBot, never the text of the name.

const BOT_NAME = /^(AI\s*·\s*)(\D.*)$/su;

/**
 * An AI seat's name split into its 「AI·」 prefix and the operator's name. Null for a name that is only a number after the
 * prefix (`AI·2`). Only for a name already known to be a bot's.
 * @param {unknown} name
 * @returns {[string, string] | null}
 */
export function botNameParts(name) {
  const m = BOT_NAME.exec(String(name ?? ''));
  return m ? [m[1], m[2]] : null;
}

/**
 * An AI seat's name in the current language: the prefix stays, the operator's name goes through tName.
 * @param {unknown} name
 * @param {string} [lang]
 * @returns {string}
 */
export function botName(name, lang = current) {
  const parts = botNameParts(name);
  return parts ? parts[0] + tName(parts[1], lang) : String(name ?? '');
}

/**
 * The name to show for a seat or player record: an AI seat's in the current language, anybody else's exactly as typed.
 * @param {{ name?: unknown, isBot?: unknown } | null | undefined} p
 * @param {string} [fallback] shown when the record has no name
 * @returns {string}
 */
export function shownName(p, fallback = '') {
  if (!p?.name) return fallback;
  return p.isBot === true ? botName(p.name) : String(p.name);
}

/**
 * A player's name as a message param (the server's msg()): `{ bot: name }` for an AI seat, which each client shows in its
 * language, the plain string for anybody else.
 * @param {{ name?: unknown, isBot?: unknown } | null | undefined} p
 * @returns {string | { bot: string }}
 */
export const playerParam = (p) => (p?.isBot === true ? { bot: String(p.name ?? '') } : String(p?.name ?? ''));

/**
 * Mark a param as a game-data name (translated by the client's name resolver).
 * @param {unknown} name
 * @returns {{ dn: string }}
 */
export const dn = (name) => ({ dn: name == null ? '' : String(name) });

const own = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/**
 * The list separator of a language: its translation of 'list::、' through its chain; '、' in Chinese; ', ' without one.
 * @param {string} lang
 */
function listSep(lang) {
  if (lang === DEFAULT_LANG) return '、';
  for (const l of langChain(lang)) {
    const s = catalogs.get(l)?.get('list::、');
    if (s) return s;
  }
  return ', ';
}

/**
 * Render one param value.
 * @param {unknown} v
 * @param {string} lang
 * @param {((name: string, lang: string) => string) | null} resolve
 * @returns {string}
 */
function renderValue(v, lang, resolve) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => renderValue(x, lang, resolve)).filter((s) => s !== '').join(listSep(lang));
  if (typeof v === 'object') {
    if (own(v, 'dn')) {
      const name = String(/** @type {any} */ (v).dn ?? '');
      if (!resolve || lang === DEFAULT_LANG || !name) return name;
      try { return resolve(name, lang) || name; } catch { return name; }
    }
    if (own(v, 'bot')) {
      const name = String(/** @type {any} */ (v).bot ?? '');
      const parts = botNameParts(name);
      if (!parts || !resolve || lang === DEFAULT_LANG) return name;
      try { return parts[0] + (resolve(parts[1], lang) || parts[1]); } catch { return name; }
    }
    return '';
  }
  return String(v);
}

/** `{name}` or a plural `{name|form|form…}` (two or more forms); group 2 is the forms with their leading '|'. */
const PLACEHOLDER = /\{([A-Za-z0-9_$]+)((?:\|[^{}|]*){2,})?\}/g;
/** The CLDR plural categories (Intl.PluralRules). */
export const PLURAL_CATEGORIES = Object.freeze(['zero', 'one', 'two', 'few', 'many', 'other']);
const NAMED_FORM = /^(zero|one|two|few|many|other):/;

/**
 * The forms of a plural placeholder ('|second|seconds' or '|one:день|few:дня|many:дней|other:дня') by category, or null
 * when malformed: two plain forms are one / other; named forms need `other` and no repeats; plain and named are not
 * mixed, and three or more plain forms are refused (the order of a language's categories is not stable across engines).
 * @param {string} forms the forms with their leading '|'
 * @returns {Record<string, string> | null}
 */
export function parsePluralForms(forms) {
  const parts = String(forms).slice(1).split('|');
  const named = parts.map((p) => NAMED_FORM.exec(p));
  if (named.every(Boolean)) {
    /** @type {Record<string, string>} */
    const out = {};
    for (let i = 0; i < parts.length; i++) {
      const cat = named[i][1];
      if (own(out, cat)) return null;
      out[cat] = parts[i].slice(named[i][0].length);
    }
    return own(out, 'other') ? out : null;
  }
  if (parts.length === 2 && !named.some(Boolean)) return { one: parts[0], other: parts[1] };
  return null;
}

/** @type {Map<string, any>} lang → Intl.PluralRules (null: the runtime does not know the language) */
const pluralRules = new Map();

/**
 * The plural category of a number in a language (Intl.PluralRules; a language the runtime does not know counts one
 * for exactly 1, other for the rest — the English rule).
 * @param {string} lang
 * @param {number} n
 * @returns {string}
 */
export function pluralCategory(lang, n) {
  if (!Number.isFinite(n)) return 'other';
  let pr = pluralRules.get(lang);
  if (pr === undefined) {
    pr = null;
    try {
      const PR = /** @type {any} */ (globalThis).Intl?.PluralRules;
      const tag = PR && [lang, primaryLang(lang)].find((x) => PR.supportedLocalesOf([x]).length);
      if (tag) pr = new PR(tag);
    } catch { /* no Intl data for it */ }
    pluralRules.set(lang, pr);
  }
  if (pr) return pr.select(n);
  return n === 1 ? 'one' : 'other';
}

/** The form of a plural placeholder for a value (null when the forms are malformed). */
function pluralForm(forms, v, lang) {
  const f = parsePluralForms(forms);
  if (!f) return null;
  const cat = pluralCategory(lang, Number(v));
  return own(f, cat) ? f[cat] : f.other;
}

/**
 * Fill a template's placeholders (pure: no global language state but the list separator and plural rules of `lang`).
 * @param {unknown} template
 * @param {Record<string, unknown> | unknown[] | null | undefined} [params]
 * @param {{ lang?: string, resolveName?: ((name: string, lang: string) => string) | null }} [opts]
 * @returns {string}
 */
export function format(template, params, opts = {}) {
  const s = template == null ? '' : String(template);
  if (!params || typeof params !== 'object' || !s.includes('{')) return s;
  const lang = normalizeLang(opts.lang) || DEFAULT_LANG;
  const resolve = opts.resolveName || null;
  return s.replace(PLACEHOLDER, (m, key, forms) => {
    if (!own(params, key)) return m;
    const v = /** @type {any} */ (params)[key];
    if (forms !== undefined) return pluralForm(forms, v, lang) ?? m;
    return renderValue(v, lang, resolve);
  });
}

/**
 * Whether a translation fits its msgid: it keeps every plain placeholder of the msgid as a plain placeholder, and its
 * plural forms parse. `extras`: the placeholder names it uses that the msgid lacks — allowed when the caller passes them
 * (a plural selector beside a markup value: '{n} {count|unit|units}'), which t() checks per call and
 * `node tools/i18n.mjs check` against the call sites.
 * @param {string} msgid the msgid (for a tc() key, the part after '::')
 * @param {string} text the translation
 * @returns {{ ok: boolean, problems: string[], extras: string[] }}
 */
export function checkTranslation(msgid, text) {
  const names = new Set();
  const plain = new Set();
  for (const m of String(msgid).matchAll(PLACEHOLDER)) {
    names.add(m[1]);
    if (m[2] === undefined) plain.add(m[1]);
  }
  const kept = new Set();
  const extras = [];
  const problems = [];
  for (const m of String(text).matchAll(PLACEHOLDER)) {
    if (m[2] === undefined) kept.add(m[1]);
    else if (!parsePluralForms(m[2])) problems.push(`malformed plural ${m[0]}`);
    if (!names.has(m[1]) && !extras.includes(m[1])) extras.push(m[1]);
  }
  for (const k of plain) if (!kept.has(k)) problems.push(`drops {${k}}`);
  return { ok: problems.length === 0, problems, extras };
}

/** The checkTranslation of a catalog entry (cached per language). */
function checkedEntry(lang, key, text) {
  let m = checked.get(lang);
  if (!m) { m = new Map(); checked.set(lang, m); }
  let c = m.get(key);
  if (!c) {
    const sep = key.indexOf('::');
    c = checkTranslation(sep >= 0 ? key.slice(sep + 2) : key, text);
    m.set(key, c);
  }
  return c;
}

/**
 * The translation of the first key (in order) that a language of the current chain has and that fits: in each
 * language the keys in order (a tc() context key, then its plain msgid), then the next language. Null: show the msgid.
 * @param {string[]} keys
 * @param {Record<string, unknown> | unknown[] | null | undefined} params
 * @returns {string|null}
 */
function lookup(keys, params) {
  for (const l of langChain(current)) {
    const cat = catalogs.get(l);
    if (!cat) continue;
    for (const key of keys) {
      const tr = cat.get(key);
      if (!tr) continue;
      const c = checkedEntry(l, key, tr);
      if (!c.ok) { report(l, key, c.problems); continue; }
      const unknown = c.extras.filter((k) => !own(params, k));
      if (unknown.length) { report(l, key, unknown.map((k) => `uses {${k}}, which the caller does not pass`)); continue; }
      return tr;
    }
  }
  return null;
}

/**
 * Translate a message into the current language (gettext style: the msgid is the Chinese text).
 * @param {unknown} msgid
 * @param {Record<string, unknown> | unknown[] | null} [params]
 * @returns {string}
 */
export function t(msgid, params) {
  const id = msgid == null ? '' : String(msgid);
  const text = current === DEFAULT_LANG ? id : lookup([id], params) ?? id;
  return params ? format(text, params, { lang: current, resolveName: nameResolver }) : text;
}

/**
 * Translate a message with a context (see the header): the key `${context}::${msgid}` first, then the msgid alone.
 * @param {string} context
 * @param {unknown} msgid
 * @param {Record<string, unknown> | unknown[] | null} [params]
 * @returns {string}
 */
export function tc(context, msgid, params) {
  const id = msgid == null ? '' : String(msgid);
  const text = current === DEFAULT_LANG ? id : lookup([`${context}::${id}`, id], params) ?? id;
  return params ? format(text, params, { lang: current, resolveName: nameResolver }) : text;
}

/** A tParts() param kept as it is: an object that is not a `{ dn }` name (a vnode), or an array holding one. */
const isMarkup = (v) => !!v && typeof v === 'object' && !own(v, 'dn') && (!Array.isArray(v) || v.some((x) => isMarkup(x)));

/**
 * A message as pieces for a renderer, for a sentence with markup inside (「第 <b>14</b> 回合」): the translation split at
 * its placeholders; a param that is markup (a vnode, or an array holding vnodes) is kept as it is, the others render as
 * in t() ({ dn } names, lists, plural forms). Adjacent text joins, empty text is dropped, so the Chinese pieces are the
 * text around the markup exactly as written before:
 *   html`<span>${tParts('第 {r} 回合 · 最终攻势', { r: html`<b class="num">${n}</b>` })}</span>`
 * @param {unknown} msgid
 * @param {Record<string, unknown> | unknown[] | null} [params]
 * @returns {unknown[]} strings and the markup params, in the order of the translation
 */
export function tParts(msgid, params) {
  const id = msgid == null ? '' : String(msgid);
  const text = current === DEFAULT_LANG ? id : lookup([id], params) ?? id;
  /** @type {unknown[]} */
  const out = [];
  const push = (s) => {
    if (s === '') return;
    if (typeof out[out.length - 1] === 'string') out[out.length - 1] += s;
    else out.push(s);
  };
  let last = 0;
  if (params && typeof params === 'object') {
    for (const m of text.matchAll(PLACEHOLDER)) {
      const [whole, key, forms] = m;
      if (!own(params, key)) continue;
      push(text.slice(last, m.index));
      const v = /** @type {any} */ (params)[key];
      if (forms !== undefined) push(pluralForm(forms, v, current) ?? whole);
      else if (isMarkup(v)) out.push(v);
      else push(renderValue(v, current, nameResolver));
      last = m.index + whole.length;
    }
  }
  push(text.slice(last));
  return out;
}

/**
 * Mark a string as a msgid without translating it (module-level tables: translate with t() where it is shown).
 * @template {string} S
 * @param {S} s
 * @returns {S}
 */
export const N_ = (s) => s;

/**
 * A structured message (server → client): the msgid with its params.
 * @param {string} msgid
 * @param {Record<string, unknown> | unknown[]} [params]
 * @returns {{ msgid: string, params: Record<string, unknown> | unknown[] | undefined }}
 */
export const msg = (msgid, params) => ({ msgid: String(msgid), params });

/** @param {unknown} m @returns {m is { msgid: string, params?: any }} */
const isMsg = (m) => !!m && typeof m === 'object' && typeof (/** @type {any} */ (m).msgid) === 'string';

/**
 * The Chinese text of a message (a plain string is returned as is).
 * @param {unknown} m a string or msg()
 * @returns {string}
 */
export function renderMessage(m) {
  if (isMsg(m)) return format(m.msgid, m.params, { lang: DEFAULT_LANG });
  return m == null ? '' : String(m);
}

/**
 * JSON-safe copy of message params: strings, finite numbers, booleans, `{ dn }` and arrays of those (anything else is
 * dropped), so a frame never carries an object the client would have to trust.
 * @param {unknown} v
 * @param {number} [depth]
 * @returns {unknown}
 */
function cleanParam(v, depth = 0) {
  if (typeof v === 'string') return v.slice(0, 200);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v) && depth < 1) return v.slice(0, 32).map((x) => cleanParam(x, depth + 1));
  if (v && typeof v === 'object' && own(v, 'dn')) return { dn: String(/** @type {any} */ (v).dn ?? '').slice(0, 200) };
  if (v && typeof v === 'object' && own(v, 'bot')) return { bot: String(/** @type {any} */ (v).bot ?? '').slice(0, 200) };
  return null;
}

/**
 * The wire fields of a message for m.toast / m.ticker: `{ text }` for a plain string, `{ text, msgid, params }` for a
 * msg() — `text` is the Chinese rendering (older clients show it as before).
 * @param {unknown} m
 * @returns {{ text: string, msgid?: string, params?: Record<string, unknown> | unknown[] }}
 */
export function wireMessage(m) {
  if (!isMsg(m)) return { text: renderMessage(m) };
  const out = { text: renderMessage(m), msgid: m.msgid };
  const p = m.params;
  if (Array.isArray(p)) return { ...out, params: p.slice(0, 16).map((x) => cleanParam(x)) };
  if (p && typeof p === 'object') {
    /** @type {Record<string, unknown>} */
    const params = {};
    for (const [k, v] of Object.entries(p).slice(0, 16)) if (/^[A-Za-z0-9_$]{1,32}$/.test(k)) params[k] = cleanParam(v);
    return { ...out, params };
  }
  return out;
}

/**
 * The text of a received m.toast / m.ticker frame in the current language: its msgid with params when present, else
 * its text taken as a msgid (static server texts are their own msgid). Missing translations show the Chinese text.
 * @param {{ text?: unknown, msgid?: unknown, params?: unknown } | null | undefined} frame
 * @returns {string}
 */
export function translateWire(frame) {
  if (!frame || typeof frame !== 'object') return '';
  const params = frame.params && typeof frame.params === 'object' ? /** @type {any} */ (frame.params) : null;
  if (typeof frame.msgid === 'string' && frame.msgid) return t(frame.msgid, params);
  return typeof frame.text === 'string' ? t(frame.text) : '';
}
