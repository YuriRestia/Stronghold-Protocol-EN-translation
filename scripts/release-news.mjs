// scripts/release-news.mjs — (fork) step 1 of scripts/release.mjs: the lobby's live update news for the release
// (shared/news.js format, put on the servers with `deploy-regions.mjs news`), drafted from the changelog fragments.
//
// Each release: a new id in the version bump pattern (0.3.4-2 → 0.3.4-3, so the banner shows again to everyone), the
// English lines drafted from the fragments' `### ` headings (new ones first, then the live news' current ones), opened
// in Notepad with the wording rules for you to edit, checked with newsProblems and saved as logs/news-<id>.json (logs/
// is not in git). Nothing goes live here: live news is shared by every generation, so old-generation players would read
// about a release they don't have yet. The release prints the command to put it live right after you activate. The
// other languages are dropped on a bump: they show the English until someone translates them.
//
// Wording rules (the user's; shown in the editor):
//   - player-facing changes only: no backend-only lines (server links, CI, tests, tooling, bandwidth or downloads)
//   - no "Many fixes" line, no minor fixes; the game's own terms ("High Ground", operator names as in the EN game)
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newsProblems, parseNews, NEWS_MAX_HIGHLIGHTS, NEWS_MAX_POINTS, NEWS_LINE_MAX } from '../shared/news.js';

const MAX_EDITS = 3;
const MAX_EDIT_BYTES = 256 * 1024;

/** Headings that are not for players (the draft leaves them out as notes; the user can put any back). */
export const BACKEND_ONLY = /\b(CI|golden|tests?|checks?|workflow|GitHub|servers?|peer|deploy|tooling|bandwidth|downloads?|loop check|sim|release)\b/i;

/** The next id in the version bump pattern: `0.3.4-2` → `0.3.4-3`, `0.3.4` → `0.3.4-1`. @param {string} id */
export function nextNewsId(id) {
  const m = /^(.*?)-(\d+)$/.exec(String(id));
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${id}-1`;
}

/** Where the release saves the news, relative to the project folder (logs/ is git-ignored). @param {string} id */
export const newsFile = (id) => `logs/news-${id}.json`;

/**
 * The news built into the release (public/js/ui/matchSearch.js: UPDATE_NEWS_ID and the msgids of UPDATE_HIGHLIGHTS /
 * UPDATE_POINTS) in English (public/i18n/en.json), the draft's base when the servers have no live news; null when the
 * source has no UPDATE_NEWS_ID.
 * @param {string} src matchSearch.js @param {Record<string, unknown>} pack en.json
 */
export function builtInNews(src, pack) {
  const text = String(src);
  const id = /export const UPDATE_NEWS_ID = '([^']+)'/.exec(text)?.[1];
  if (!id) return null;
  const msgids = (name) => {
    const at = text.indexOf(`const ${name} = [`);
    if (at < 0) return [];
    return [...text.slice(at, text.indexOf('];', at)).matchAll(/N_\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'"));
  };
  const en = (k) => (typeof pack?.[k] === 'string' ? pack[k] : k);
  return { id, langs: { en: { highlights: msgids('UPDATE_HIGHLIGHTS').map(en), points: msgids('UPDATE_POINTS').map(en) } } };
}

/**
 * The draft's lines from the fragments: one per `### ` heading, backend-only headings set aside.
 * @param {{ name: string, text: string }[]} fragments
 * @returns {{ points: string[], skipped: { line: string, name: string }[] }}
 */
export function draftNewsLines(fragments) {
  const points = [], skipped = [];
  for (const { name, text } of fragments) {
    for (const m of String(text).matchAll(/^### (.+?)\s*$/gm)) {
      const line = m[1].trim();
      if (BACKEND_ONLY.test(line)) skipped.push({ line, name });
      else if (!points.includes(line)) points.push(line);
    }
  }
  return { points, skipped };
}

/**
 * The draft of the release's news: the next id after the previous news' (the live news, else the release's built-in
 * one), an English title, its highlights, the fragments' lines first, then its points, cut to NEWS_MAX_POINTS (the cut
 * ones become notes).
 * @param {{ id: string, langs: Record<string, { highlights?: string[], points?: string[] }> } | null} previous
 * @param {{ name: string, text: string }[]} fragments
 */
export function draftNews(previous, fragments) {
  const id = nextNewsId(previous?.id || '0');
  const en = previous?.langs?.en || {};
  const { points: fresh, skipped } = draftNewsLines(fragments);
  const all = [...fresh, ...(en.points || []).filter((p) => !fresh.includes(p))];
  return {
    id, title: `Update ${id}`, highlights: [...(en.highlights || [])],
    points: all.slice(0, NEWS_MAX_POINTS), cut: all.slice(NEWS_MAX_POINTS), skipped, fresh: fresh.length,
  };
}

const RULES = [
  '# The lobby update news for this release. Edit it, SAVE, close Notepad, then press Enter in the release window.',
  '# Lines starting with # are notes and are ignored. One line per highlight or point.',
  '# Wording rules:',
  '#   - only what players notice: no server, CI, test, tooling, bandwidth or download lines',
  '#   - no "Many fixes" line and no minor fixes; the game\'s own names ("High Ground", operator names as in the EN game)',
  `#   - plain text and the game's colour tags (<@sp.leaf>Talulah</>); at most ${NEWS_LINE_MAX} characters a line`,
  `#   - at most ${NEWS_MAX_HIGHLIGHTS} highlights (bold lines on top) and ${NEWS_MAX_POINTS} points`,
  '# Other languages show these English lines until someone translates them.',
];

/** The text opened in Notepad. @param {{ id: string, title: string, highlights: string[], points: string[], cut?: string[], skipped?: { line: string }[] }} d @param {string[]} [problems] */
export function editorText(d, problems = []) {
  const out = [...RULES];
  if (problems.length) out.push('#', '# PROBLEMS (fix them, save, close):', ...problems.map((p) => `#   ${p}`));
  out.push('', `id: ${d.id}`, `title: ${d.title}`, '', '[highlights]', ...d.highlights, '', '[points]', ...d.points, '');
  if (d.cut?.length) out.push(`# Cut to stay within ${NEWS_MAX_POINTS} points (move a line above to keep it):`, ...d.cut.map((l) => `# ${l}`), '');
  if (d.skipped?.length) out.push('# Left out as backend-only (move a line above to keep it):', ...d.skipped.map((s) => `# ${s.line}`), '');
  return out.join('\r\n');
}

/** The edited text → { id, title, highlights, points }. @param {string} text */
export function parseEditorText(text) {
  const d = { id: '', title: '', highlights: [], points: [] };
  let body = String(text);
  if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1); // Notepad's byte order mark
  let section = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const kv = /^(id|title):\s*(.*)$/.exec(line);
    if (kv && !section) { d[kv[1]] = kv[2].trim(); continue; }
    if (line === '[highlights]') { section = 'highlights'; continue; }
    if (line === '[points]') { section = 'points'; continue; }
    if (section) d[section].push(line.replace(/^[-*]\s+/, ''));
  }
  return d;
}

/** The news file from an edit: English only (the other languages fall back to it). @param {ReturnType<typeof parseEditorText>} e */
export const newsFromEdit = (e) => ({ id: e.id, langs: { en: { title: e.title, highlights: e.highlights, points: e.points } } });

/** Read the fragments of changes/. @param {string} root @param {string[]} files */
export const readFragments = (root, files) => files.map((name) => ({ name, text: readFileSync(join(root, 'changes', name), 'utf8') }));

/** Open `file` in Notepad and wait for Enter (the Windows 11 Notepad may return before it is closed). */
async function edit(file, prompt) {
  const ed = spawn('notepad.exe', [file], { stdio: 'ignore', detached: true });
  ed.on('error', () => {});
  ed.unref();
  await prompt(`  Notepad opened ${file}. Edit, SAVE and close it, then press Enter here: `);
}

/**
 * Step 1's news part. No fragments: nothing new to announce. Dry run: prints the draft only. Otherwise the draft is
 * edited in Notepad, checked and saved; the release prints the command to put it live after activate.
 * @param {{ root: string, fragments: string[], dryRun: boolean, live: unknown, ask: (q: string) => Promise<boolean>, prompt?: (q: string) => Promise<string> }} o
 *   live: the current live news file on the servers (parsed JSON), or null
 * @returns {Promise<{ say: string, id?: string, file?: string }>}
 */
export async function bumpNews(o) {
  if (!o.fragments.length) {
    // the changelog may have been folded by hand before the release: the news can still be written from the live one
    console.log('  news: no fragments to draft from');
    if (o.dryRun) { console.log('  (dry run) a release asks whether to write the update news anyway (drafted from the live news)'); return { say: 'no fragments (a release asks)' }; }
    if (!(await o.ask('  Write update news for this release anyway?'))) return { say: 'unchanged (no fragments)' };
  }
  const live = o.live ? parseNews(o.live) : null;
  const builtIn = live ? null : builtInNews(readFileSync(join(o.root, 'public', 'js', 'ui', 'matchSearch.js'), 'utf8'),
    JSON.parse(readFileSync(join(o.root, 'public', 'i18n', 'en.json'), 'utf8')));
  const d = draftNews(live || builtIn, readFragments(o.root, o.fragments));
  console.log(`  news: ${live ? `live news ${live.id}` : `no live news, so the built-in ${builtIn?.id ?? '(none)'} is the base`} → ${d.id}; draft: ${d.fresh} new line(s) from the fragments, ${d.skipped.length} left out as backend-only`);
  for (const p of d.points.slice(0, d.fresh)) console.log(`    + ${p}`);
  for (const s of d.skipped) console.log(`    - ${s.line}  (${s.name})`);
  if (o.dryRun) { console.log(`  (dry run) a release opens this draft in Notepad, checks it and saves it as ${newsFile(d.id)}; it goes live only when you run the news command after activate`); return { say: `would draft ${d.id}` }; }
  if (!process.stdin.isTTY || !o.prompt) throw new Error('the update news is edited in Notepad: run the release in a terminal');

  const tmp = join(tmpdir(), `sp-release-news-${process.pid}.txt`);
  let news = null, problems = [];
  try {
    let draft = d;
    for (let attempt = 1; attempt <= MAX_EDITS && !news; attempt++) {
      writeFileSync(tmp, editorText(draft, problems));
      await edit(tmp, o.prompt);
      const text = readFileSync(tmp, 'utf8');
      if (text.length > MAX_EDIT_BYTES) throw new Error('the edited news is over 256 kB');
      const e = parseEditorText(text);
      const candidate = newsFromEdit(e);
      problems = newsProblems(candidate);
      if (!problems.length) news = candidate;
      else { console.log(`  the news was refused:\n    ${problems.join('\n    ')}`); draft = { ...e, cut: [], skipped: d.skipped }; }
    }
  } finally { try { unlinkSync(tmp); } catch { /* gone */ } }
  if (!news) throw new Error(`the update news is still not valid after ${MAX_EDITS} edits; nothing was saved`);

  const en = news.langs.en;
  console.log(`\n  ${en.title}\n${en.highlights.map((h) => `    ★ ${h}`).join('\n')}\n${en.points.map((p) => `    • ${p}`).join('\n')}\n`);
  if (!(await o.ask('  Use this update news?'))) throw new Error('the update news was not accepted; nothing was saved');
  const file = newsFile(news.id);
  mkdirSync(join(o.root, 'logs'), { recursive: true });
  writeFileSync(join(o.root, file), `${JSON.stringify(news, null, 2)}\n`);
  console.log(`  saved ${file}: it goes live with the news command printed at the end, after you activate`);
  return { say: `${news.id} saved to ${file}`, id: news.id, file };
}
