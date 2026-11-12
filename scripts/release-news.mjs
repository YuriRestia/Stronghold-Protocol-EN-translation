// scripts/release-news.mjs — (fork) step 1 of scripts/release.mjs: the lobby's live update news for the release
// (shared/news.js format, put on the servers with `deploy-regions.mjs news`), in every language the game ships.
//
// Each release: a new id in the version bump pattern (0.3.4-2 → 0.3.4-3, so the banner shows again to everyone). The
// draft is built from the `News:` blocks of the release's `Kind: player` fragments (tools/news-block.mjs: each line
// already in en, zh, ja, ko and zh-TW, written with the change), new lines first, then the previous news' lines (the live
// news, else the release's built-in banner) with their translations. Notepad shows each line with its translations under
// it. A line whose English was rewritten or added there has no translation yet: the release stops and names it, and the
// edited text is kept in logs/news-<id>.draft.txt (a crew session can fill the translations in there; the next run opens
// it again), or `--english-only h1,p3` ships those lines in English for now. The result is checked with newsProblems and
// saved as logs/news-<id>.json (logs/ is not in git). Nothing goes live here: live news is shared by every generation, so
// old-generation players would read about a release they don't have yet. The release prints the command to put it live
// right after you activate.
//
// Wording rules (the user's; shown in the editor):
//   - player-facing changes only: no backend-only lines (server links, CI, tests, tooling, bandwidth or downloads)
//   - no "Many fixes" line, no minor fixes; the game's own terms ("High Ground", operator names as in the game)
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operatorOnly, parseFragment } from '../tools/changelog.mjs';
import { NEWS_LANGS, createNames, expandLine } from '../tools/news-block.mjs';
import { newsProblems, parseNews, NEWS_MAX_BYTES, NEWS_MAX_HIGHLIGHTS, NEWS_MAX_POINTS, NEWS_LINE_MAX } from '../shared/news.js';

const MAX_EDITS = 3;
/** The Notepad text (and the kept draft) is at most this long. */
export const MAX_EDIT_BYTES = 256 * 1024;
/** logs/news-<id>.json: valid news is at most NEWS_MAX_BYTES compact; this leaves room for the indentation. */
export const NEWS_FILE_MAX = 2 * NEWS_MAX_BYTES;
/** The languages after English, in the order Notepad shows them. */
const OTHERS = NEWS_LANGS.filter((l) => l !== 'en');
/** A news title per language when the previous news has none (the built-in banner's pattern). */
const TITLES = { en: (id) => `Update ${id}`, zh: (id) => `${id} 更新`, ja: (id) => `${id} アップデート`, ko: (id) => `${id} 업데이트`, 'zh-TW': (id) => `${id} 更新` };
const BOM = 0xFEFF;
const SEP = String.fromCharCode(1);

/** The next id in the version bump pattern: `0.3.4-2` → `0.3.4-3`, `0.3.4` → `0.3.4-1`. @param {string} id */
export function nextNewsId(id) {
  const m = /^(.*?)-(\d+)$/.exec(String(id));
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${id}-1`;
}

/** Where the release saves the news, relative to the project folder (logs/ is git-ignored). @param {string} id */
export const newsFile = (id) => `logs/news-${id}.json`;
/** The kept Notepad text of a release that stopped on untranslated lines. @param {string} id */
export const newsDraftFile = (id) => `logs/news-${id}.draft.txt`;

/**
 * The news built into the release (public/js/ui/matchSearch.js: UPDATE_NEWS_ID and the msgids of UPDATE_HIGHLIGHTS /
 * UPDATE_POINTS) in Chinese (the msgids) and every language of `packs` that translates all of its lines, the draft's
 * base when the servers have no live news; null when the source has no UPDATE_NEWS_ID.
 * @param {string} src matchSearch.js @param {Record<string, Record<string, unknown>>} packs { en: en.json, ja: …, … }
 */
export function builtInNews(src, packs) {
  const text = String(src);
  const id = /export const UPDATE_NEWS_ID = '([^']+)'/.exec(text)?.[1];
  if (!id) return null;
  const msgids = (name) => {
    const at = text.indexOf(`const ${name} = [`);
    if (at < 0) return [];
    return [...text.slice(at, text.indexOf('];', at)).matchAll(/N_\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'"));
  };
  /** @type {Record<string, { highlights: string[], points: string[] }>} */
  const langs = { zh: { highlights: msgids('UPDATE_HIGHLIGHTS'), points: msgids('UPDATE_POINTS') } };
  for (const [code, pack] of Object.entries(packs || {})) {
    const tr = (k) => (typeof pack?.[k] === 'string' && pack[k] ? pack[k] : null);
    const h = langs.zh.highlights.map(tr), p = langs.zh.points.map(tr);
    if (code === 'en') langs.en = { highlights: h.map((v, i) => v ?? langs.zh.highlights[i]), points: p.map((v, i) => v ?? langs.zh.points[i]) };
    else if (![...h, ...p].includes(null)) langs[code] = { highlights: h, points: p }; // a pack that misses a line is left out
  }
  return { id, langs };
}

/** @typedef {{ kind: 'highlight'|'point', lines: Record<string, string>, label?: string }} NewsItem */

/**
 * The previous news' lines as items: each English line with its translations at the same place (a language whose list
 * has another length is not aligned, so that list's lines count as untranslated).
 * @param {{ langs: Record<string, { highlights?: string[], points?: string[] }> } | null} news
 * @returns {{ highlights: NewsItem[], points: NewsItem[] }}
 */
export function previousItems(news) {
  /** @type {{ highlights: NewsItem[], points: NewsItem[] }} */
  const out = { highlights: [], points: [] };
  const en = news?.langs?.en;
  if (!en) return out;
  for (const [key, kind] of /** @type {const} */ ([['highlights', 'highlight'], ['points', 'point']])) {
    (en[key] || []).forEach((line, i) => {
      const lines = { en: line };
      for (const l of OTHERS) {
        const list = news.langs[l]?.[key];
        if (Array.isArray(list) && list.length === en[key].length && list[i]) lines[l] = list[i];
      }
      out[key].push({ kind, lines });
    });
  }
  return out;
}

/**
 * The draft of the release's news: the next id, a title per language, the fragments' News lines first (filled in per
 * language), then the previous news' lines, each list cut to its limit (the cut lines become notes). A player fragment
 * without a News block is named in the notes (not every change is news).
 * @param {{ id: string, langs: Record<string, any> } | null} previous
 * @param {{ name: string, text: string }[]} fragments
 * @param {{ names?: ReturnType<typeof createNames> }} [o]
 */
export function draftNews(previous, fragments, { names = createNames() } = {}) {
  const id = nextNewsId(previous?.id || '0');
  /** @type {Record<string, string>} */
  const titles = {};
  for (const l of NEWS_LANGS) {
    const old = previous?.langs?.[l]?.title;
    titles[l] = typeof old === 'string' && previous?.id && old.includes(previous.id) ? old.split(previous.id).join(id) : TITLES[l](id);
  }
  /** @type {{ highlights: NewsItem[], points: NewsItem[] }} */
  const fresh = { highlights: [], points: [] };
  const noNews = [];
  for (const { name, text } of fragments) {
    const f = parseFragment(name, String(text), { names });
    if (f.kind !== 'player') continue;
    if (f.news.length && f.errors.some((e) => /News/.test(e))) throw new Error(`${name}: its News block is not valid; run npm run changelog -- --check`);
    for (const it of f.newsLines || []) fresh[it.kind === 'highlight' ? 'highlights' : 'points'].push(it);
    if (!f.news.length) for (const m of String(text).matchAll(/^### (.+?)\s*$/gm)) noNews.push({ name, line: m[1].trim() });
  }
  const prev = previousItems(previous);
  const merge = (a, b, max) => {
    const all = [...a, ...b.filter((x) => !a.some((y) => y.lines.en === x.lines.en))];
    return [all.slice(0, max), all.slice(max)];
  };
  const [highlights, cutH] = merge(fresh.highlights, prev.highlights, NEWS_MAX_HIGHLIGHTS);
  const [points, cutP] = merge(fresh.points, prev.points, NEWS_MAX_POINTS);
  return { id, titles, highlights, points, cut: [...cutH, ...cutP], noNews, fresh: fresh.highlights.length + fresh.points.length };
}

const RULES = [
  '# The lobby update news for this release. Edit it, SAVE, close Notepad, then press Enter in the release window.',
  '# Lines starting with # are notes and are ignored.',
  '# Each line: "- English", then its translations under it, indented ("    zh: …", "    ja: …", "    ko: …", "    zh-TW: …").',
  '# A line whose English you rewrite, or a new line, needs its translations too: without them the release stops and',
  '# names it (h1 = first highlight, p1 = first point). Fill them in, or ship it in English for now: --english-only h1,p3',
  '# An empty translation of a line carried from the live news stays English there, as players see it today.',
  '# Names as in a News block: {name:<game-data id>} and {term:<Chinese UI text>} are filled in per language.',
  '# Wording rules:',
  '#   - only what players notice: no server, CI, test, tooling, bandwidth or download lines',
  '#   - no "Many fixes" line and no minor fixes; the game\'s own names ("High Ground", operator names as in the game)',
  `#   - plain text and the game's colour tags (<@sp.leaf>Talulah</>); at most ${NEWS_LINE_MAX} characters a line`,
  `#   - at most ${NEWS_MAX_HIGHLIGHTS} highlights (bold lines on top) and ${NEWS_MAX_POINTS} points`,
];

/** One item as Notepad shows it. @param {NewsItem} it */
const itemText = (it) => [`- ${it.lines.en || ''}`, ...OTHERS.map((l) => `    ${l}: ${it.lines[l] ?? ''}`)];

/**
 * The text opened in Notepad: the title in each language, then each line with its translations under it.
 * @param {{ id: string, titles: Record<string, string>, highlights: NewsItem[], points: NewsItem[], cut?: NewsItem[], noNews?: { name: string, line: string }[] }} d
 * @param {string[]} [problems]
 */
export function editorText(d, problems = []) {
  const out = [...RULES];
  if (problems.length) out.push('#', '# PROBLEMS (fix them, save, close):', ...problems.map((p) => `#   ${p}`));
  out.push('', `id: ${d.id}`, '', '[title]', ...NEWS_LANGS.map((l) => `${l}: ${d.titles[l] ?? ''}`), '', '[highlights]');
  d.highlights.forEach((it, i) => out.push(`# h${i + 1}`, ...itemText(it)));
  out.push('', '[points]');
  d.points.forEach((it, i) => out.push(`# p${i + 1}`, ...itemText(it)));
  out.push('');
  if (d.cut?.length) out.push(`# Cut to stay within ${NEWS_MAX_HIGHLIGHTS} highlights / ${NEWS_MAX_POINTS} points (move one above to keep it):`, ...d.cut.map((it) => `# ${it.lines.en}`), '');
  if (d.noNews?.length) out.push('# Player changes without a News line (add one above if it is news; it then needs its translations):', ...d.noNews.map((s) => `# ${s.line}  (${s.name})`), '');
  return out.join('\r\n');
}

/**
 * The edited text → { id, titles, highlights, points }, each item labelled by its place (h1, h2 …, p1 …).
 * @param {string} text
 */
export function parseEditorText(text) {
  /** @type {{ id: string, titles: Record<string, string>, highlights: NewsItem[], points: NewsItem[] }} */
  const d = { id: '', titles: {}, highlights: [], points: [] };
  let body = String(text);
  if (body.charCodeAt(0) === BOM) body = body.slice(1); // Notepad's byte order mark
  let section = null, cur = null;
  const langLine = /^\s*(en|zh|ja|ko|zh-TW):\s*(.*)$/;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === '[title]' || line === '[highlights]' || line === '[points]') { section = line.slice(1, -1); cur = null; continue; }
    if (!section) { const kv = /^id:\s*(.*)$/.exec(line); if (kv) d.id = kv[1].trim(); continue; }
    const lang = langLine.exec(raw);
    if (section === 'title') { if (lang) d.titles[lang[1]] = lang[2].trim(); continue; }
    if (lang && lang[1] !== 'en' && cur && /^\s/.test(raw)) { cur.lines[lang[1]] = lang[2].trim(); continue; }
    const list = d[section];
    cur = { kind: section === 'highlights' ? 'highlight' : 'point', lines: { en: line.replace(/^[-*]\s+/, '') }, label: `${section[0]}${list.length + 1}` };
    list.push(cur);
  }
  return d;
}

/**
 * The lines that have no translation for what they say now: a missing language (except where the same line of the
 * draft, carried from the live news, has none either), or an English line that is not one of the draft's while its
 * translations are a draft line's (the English was rewritten, the translations were not).
 * @param {ReturnType<typeof parseEditorText>} e @param {{ highlights: NewsItem[], points: NewsItem[] }} draft
 * @returns {{ label: string, en: string, why: string }[]}
 */
export function untranslatedLines(e, draft) {
  const drafted = [...draft.highlights, ...draft.points];
  const key = (it) => OTHERS.map((l) => it.lines[l] ?? '').join(SEP);
  const blank = (it, l) => !String(it?.lines[l] ?? '').trim();
  const out = [];
  for (const it of [...e.highlights, ...e.points]) {
    const same = drafted.find((x) => x.lines.en === it.lines.en);
    // a line of the live news that is English in a language there stays so (the page shows English for it today)
    const missing = OTHERS.filter((l) => blank(it, l) && !(same && blank(same, l)));
    if (missing.length) { out.push({ label: it.label, en: it.lines.en, why: `no ${missing.join(', ')}` }); continue; }
    if (!same && drafted.some((x) => key(x) === key(it))) out.push({ label: it.label, en: it.lines.en, why: 'the English was rewritten, its translations were not' });
  }
  return out;
}

/**
 * The news file from an edit, every language, names filled in: a line in `englishOnly` (labels) shows its English in
 * every language. `errors`: placeholders that could not be filled in.
 * @param {ReturnType<typeof parseEditorText>} e @param {Set<string>} [englishOnly]
 * @param {ReturnType<typeof createNames>} [names]
 */
export function newsFromEdit(e, englishOnly = new Set(), names = createNames()) {
  const errors = [];
  const fill = (line, l, where) => {
    const r = expandLine(line, l, names);
    errors.push(...r.errors.map((x) => `${where}: ${x}`));
    return r.text;
  };
  const langs = {};
  for (const l of NEWS_LANGS) {
    const pick = (it) => {
      const en = englishOnly.has(it.label);
      return fill(l === 'en' || en ? it.lines.en : it.lines[l] || it.lines.en, en ? 'en' : l, `${it.label} ${l}`);
    };
    langs[l] = { title: e.titles[l] || e.titles.en || '', highlights: e.highlights.map(pick), points: e.points.map(pick) };
  }
  return { news: { id: e.id, langs }, errors };
}

/** Read the fragments of changes/. @param {string} root @param {string[]} files */
export const readFragments = (root, files) => files.map((name) => ({ name, text: readFileSync(join(root, 'changes', name), 'utf8') }));

/** Open `file` in Notepad and wait for Enter (the Windows 11 Notepad may return before it is closed). */
async function edit(file, prompt) {
  const ed = spawn('notepad.exe', [file], { stdio: 'ignore', detached: true });
  ed.on('error', () => {});
  ed.unref();
  await prompt(`  Notepad opened ${file}. Edit, SAVE and close it, then press Enter here: `);
}

/** The UI packs of the languages after Chinese (the built-in banner's translations). @param {string} root */
function packsOf(root) {
  const out = {};
  for (const l of NEWS_LANGS) {
    if (l === 'zh') continue;
    try { out[l] = JSON.parse(readFileSync(join(root, 'public', 'i18n', `${l}.json`), 'utf8')); } catch { /* no pack */ }
  }
  return out;
}

/**
 * Check one edited text: the lines without translations (not in `englishOnly`) stop the release; else the news with
 * its problems (newsProblems, unfilled names, operator-only wording).
 * @param {string} text @param {ReturnType<typeof draftNews>} d @param {Set<string>} englishOnly
 * @param {ReturnType<typeof createNames>} names
 */
export function checkEdit(text, d, englishOnly, names) {
  const e = parseEditorText(text);
  const labels = new Set([...e.highlights, ...e.points].map((it) => it.label));
  const unknown = [...englishOnly].filter((l) => !labels.has(l));
  if (unknown.length) return { fatal: `--english-only names lines the news does not have: ${unknown.join(', ')} (lines are h1, h2 … and p1, p2 …)` };
  const open = untranslatedLines(e, d).filter((u) => !englishOnly.has(u.label));
  if (open.length) return { open };
  const { news, errors } = newsFromEdit(e, englishOnly, names);
  const all = Object.values(news.langs).flatMap((x) => [x.title, ...x.highlights, ...x.points]).join(String.fromCharCode(10));
  const leaks = operatorOnly(all).map((h) => `server-only wording (${h.label}) does not belong in player news: "${h.text}"`);
  return { news, problems: [...errors, ...newsProblems(news), ...leaks] };
}

/** The stop message for lines without translations. @param {{ label: string, en: string, why: string }[]} open @param {string} id */
export const untranslatedMessage = (open, id) => `these news lines have no translation yet; nothing was saved as ${newsFile(id)}:\n`
  + open.map((u) => `    ${u.label}: ${u.en}  (${u.why})`).join('\n')
  + `\n  Your edit is kept in ${newsDraftFile(id)}. Either a crew session fills in their zh / ja / ko / zh-TW lines there`
  + ' (names as in a News block: {name:<id>}, {term:<Chinese UI text>}) and you run the release again, which opens it again;'
  + `\n  or ship them in English for now: run again with --english-only ${open.map((u) => u.label).join(',')}`;

/**
 * Step 1's news part. No fragments: nothing new to announce. Dry run: prints the draft only. Otherwise the draft (or the
 * kept text of a run that stopped) is edited in Notepad, checked and saved; the release prints the command to put it live
 * after activate.
 * @param {{ root: string, fragments: string[], dryRun: boolean, live: unknown, ask: (q: string) => Promise<boolean>,
 *   prompt?: (q: string) => Promise<string>, englishOnly?: string[], names?: ReturnType<typeof createNames>,
 *   editor?: (file: string, prompt: (q: string) => Promise<string>) => Promise<void>, interactive?: boolean }} o
 *   live: the current live news file on the servers (parsed JSON), or null; englishOnly: labels shipped in English;
 *   editor / interactive: swapped in tests
 * @returns {Promise<{ say: string, id?: string, file?: string }>}
 */
export async function bumpNews(o) {
  if (!o.fragments.length) {
    // the changelog may have been folded by hand before the release: the news can still be written from the live one
    console.log('  news: no fragments to draft from');
    if (o.dryRun) { console.log('  (dry run) a release asks whether to write the update news anyway (drafted from the live news)'); return { say: 'no fragments (a release asks)' }; }
    if (!(await o.ask('  Write update news for this release anyway?'))) return { say: 'unchanged (no fragments)' };
  }
  const names = o.names || createNames(o.root);
  const live = o.live ? parseNews(o.live) : null;
  const builtIn = live ? null : builtInNews(readFileSync(join(o.root, 'public', 'js', 'ui', 'matchSearch.js'), 'utf8'), packsOf(o.root));
  const d = draftNews(live || builtIn, readFragments(o.root, o.fragments), { names });
  const english = [...d.highlights, ...d.points].filter((it) => OTHERS.some((l) => !it.lines[l])).length;
  const draftPath = join(o.root, newsDraftFile(d.id));
  const kept = existsSync(draftPath);
  console.log(`  news: ${live ? `live news ${live.id}` : `no live news, so the built-in ${builtIn?.id ?? '(none)'} is the base`} → ${d.id}; `
    + `${d.fresh} new line(s) from News blocks, ${d.noNews.length} player change(s) without one, ${english} live line(s) still English in some language${kept ? `; continuing the kept ${newsDraftFile(d.id)}` : ''}`);
  if (o.dryRun) {
    console.log(`  (dry run) a release opens the ${kept ? 'kept text' : 'draft'} in Notepad, checks it and saves it as ${newsFile(d.id)}; it goes live only when you run the news command after activate`);
    return { say: `would draft ${d.id}` };
  }
  if (!(o.interactive ?? process.stdin.isTTY) || !o.prompt) throw new Error('the update news is edited in Notepad: run the release in a terminal');

  const englishOnly = new Set(o.englishOnly || []);
  let text = editorText(d);
  if (kept) {
    text = readFileSync(draftPath, 'utf8');
    if (Buffer.byteLength(text) > MAX_EDIT_BYTES) throw new Error(`${newsDraftFile(d.id)} is over ${MAX_EDIT_BYTES} bytes; delete it to start from a fresh draft`);
  }
  const tmp = join(tmpdir(), `sp-release-news-${process.pid}.txt`);
  let news = null;
  try {
    for (let attempt = 1; attempt <= MAX_EDITS && !news; attempt++) {
      writeFileSync(tmp, text);
      await (o.editor || edit)(tmp, o.prompt);
      text = readFileSync(tmp, 'utf8');
      if (Buffer.byteLength(text) > MAX_EDIT_BYTES) throw new Error(`the edited news is over ${MAX_EDIT_BYTES} bytes; nothing was saved`);
      const r = checkEdit(text, d, englishOnly, names);
      if (r.fatal) throw new Error(r.fatal);
      if (r.open) {
        mkdirSync(join(o.root, 'logs'), { recursive: true });
        writeFileSync(draftPath, text);
        throw new Error(untranslatedMessage(r.open, d.id));
      }
      if (!r.problems.length) { news = r.news; break; }
      console.log(`  the news was refused:\n    ${r.problems.join('\n    ')}`);
      const body = (text.charCodeAt(0) === BOM ? text.slice(1) : text).split(/\r?\n/).filter((l) => !l.startsWith('#'));
      text = [...RULES, '#', '# PROBLEMS (fix them, save, close):', ...r.problems.map((p) => `#   ${p}`), ...body].join('\r\n');
    }
  } finally { try { unlinkSync(tmp); } catch { /* gone */ } }
  if (!news) throw new Error(`the update news is still not valid after ${MAX_EDITS} edits; nothing was saved`);

  for (const l of NEWS_LANGS) {
    const e = news.langs[l];
    console.log(`\n  [${l}] ${e.title}\n${e.highlights.map((h) => `    ★ ${h}`).join('\n')}\n${e.points.map((p) => `    • ${p}`).join('\n')}`);
  }
  if (englishOnly.size) console.log(`\n  in English in every language: ${[...englishOnly].join(', ')}`);
  if (!(await o.ask('\n  Use this update news?'))) throw new Error('the update news was not accepted; nothing was saved');
  const file = newsFile(news.id);
  const body = `${JSON.stringify(news, null, 2)}\n`;
  if (Buffer.byteLength(body) > NEWS_FILE_MAX) throw new Error(`the news file would be over ${NEWS_FILE_MAX} bytes; nothing was saved`);
  mkdirSync(join(o.root, 'logs'), { recursive: true });
  writeFileSync(join(o.root, file), body);
  try { unlinkSync(draftPath); } catch { /* none kept */ }
  console.log(`  saved ${file} (${NEWS_LANGS.join(', ')}): it goes live with the news command printed at the end, after you activate`);
  return { say: `${news.id} saved to ${file}`, id: news.id, file };
}
