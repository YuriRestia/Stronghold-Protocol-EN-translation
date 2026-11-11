#!/usr/bin/env node
// (fork) The SERVER COST rule's merge check (changes/README.md "Server cost"): a branch that touches server, network or
// bot-budget code must carry a changelog fragment whose `Server cost:` block has the numbers, not `none`.
//
//   node tools/server-cost-check.mjs [<base> [<head>]] [--json] [--worktree]
//
// base defaults to dev-0.2, head to HEAD; the check looks at head's own changes (git diff base...head: since the
// merge-base). --worktree also counts uncommitted and untracked files (head must then be HEAD).
// Exit 0: OK (nothing server-touching, or a fragment of the range has the numbers and none is malformed);
// 1: a violation; 2: a usage or git error. Output: one `server-cost: <file>: <reason>` line per finding, then a
// summary line starting `server-cost: OK` or `server-cost: FAIL`; --json prints one object instead:
// {"ok","base","head","touched":[{"file","reasons"}],"fragments":[{"file","cost","problems"}],"problems"}.
import { readFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFragment } from './changelog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** git output and read files are capped (storage rule; a diff this big is not a branch to check by eye anyway). */
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILE = 4 * 1024 * 1024;

/** The host-browser bot budget files (docs/host-browser-bots.md): bots' CPU on the host's page. */
export const BOT_BUDGET_FILES = Object.freeze(['public/js/battle/botHost.js', 'public/js/battle/botWorker.js']);
/** Where an added line can add server traffic or load outside server/: shipped shared, page and script code. */
const LINE_SCOPES = [/^shared\//, /^public\/js\//, /^scripts\//];
/** Added-line patterns, each [reason, regex]. */
export const LINE_TRIGGERS = Object.freeze([
  ['sends over the WebSocket (.send / broadcast)', /\.send\s*\(|\bbroadcast\w*\s*\(/],
  ['starts a repeating timer (setInterval)', /\bsetInterval\s*\(/],
  ['writes files (writeFile / appendFile / createWriteStream)', /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream)\s*\(/],
]);

/** A changed line that is only a comment or blank (JS / shell / Python comment styles). */
export const isCommentOrBlank = (l) => {
  const t = l.trim();
  return !t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#');
};

/**
 * Why a changed file counts as server-touching ([] = it does not).
 * @param {string} file repository path
 * @param {{ added: string[], removed: string[] }} lines its changed lines
 */
export function touchReasons(file, { added = [], removed = [] }) {
  const reasons = [];
  if (file.startsWith('server/')) {
    if ([...added, ...removed].some((l) => !isCommentOrBlank(l))) reasons.push('server code');
  }
  if (/^shared\/protocol[^/]*$/.test(file)) reasons.push('the wire protocol (shared/protocol*)');
  if (BOT_BUDGET_FILES.includes(file)) reasons.push('the host-browser bot budget');
  if (!file.startsWith('server/') && LINE_SCOPES.some((re) => re.test(file))) {
    const code = added.filter((l) => !isCommentOrBlank(l));
    for (const [why, re] of LINE_TRIGGERS) if (code.some((l) => re.test(l))) reasons.push(why);
  }
  return reasons;
}

/**
 * The verdict for a range: touched files and the range's fragments (parsed).
 * @param {{ file: string, reasons: string[] }[]} touched
 * @param {{ file: string, cost: string, problems: string[] }[]} fragments
 */
export function verdict(touched, fragments) {
  const problems = [];
  for (const f of fragments) problems.push(...f.problems.map((p) => (p.startsWith(f.file.replace(/^changes\//, '')) ? `changes/${p}` : `${f.file}: ${p}`)));
  if (touched.length) {
    if (!fragments.length) problems.push('no changes/*.md fragment in the range: server, network or bot code changed, so one with a numeric "Server cost:" block is needed');
    else if (!fragments.some((f) => f.cost === 'numbers')) {
      problems.push(`server, network or bot code changed, but no fragment's "Server cost:" has the numbers (${fragments.map((f) => `${f.file}: ${f.cost}`).join(', ')})`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Parse `git diff -U0` output into file → { added, removed } (deleted files under their old name). */
export function parseDiff(text) {
  const files = new Map();
  let cur = null;
  let oldName = null;
  for (const l of text.split('\n')) {
    if (l.startsWith('diff --git ')) { cur = null; oldName = null; continue; }
    if (l.startsWith('--- ')) { oldName = l.slice(4).replace(/^a\//, ''); continue; }
    if (l.startsWith('+++ ')) {
      const n = l.slice(4) === '/dev/null' ? oldName : l.slice(4).replace(/^b\//, '');
      cur = { added: [], removed: [] };
      files.set(n, cur);
      continue;
    }
    if (!cur || l.startsWith('@@')) continue;
    if (l.startsWith('+')) cur.added.push(l.slice(1));
    else if (l.startsWith('-')) cur.removed.push(l.slice(1));
  }
  return files;
}

function git(args, root) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Run the check.
 * @param {{ base?: string, head?: string, worktree?: boolean, root?: string }} o
 */
export function check({ base = 'dev-0.2', head = 'HEAD', worktree = false, root = ROOT } = {}) {
  const sha = (r) => git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`], root).trim();
  const baseSha = sha(base), headSha = sha(head);
  if (worktree && headSha !== sha('HEAD')) throw new Error('--worktree needs head = HEAD');
  const mb = git(['merge-base', baseSha, headSha], root).trim();
  const range = worktree ? [mb] : [mb, headSha];
  const diff = parseDiff(git(['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', ...range], root));
  if (worktree) {
    for (const f of git(['ls-files', '--others', '--exclude-standard'], root).split('\n').filter(Boolean)) {
      const p = join(root, f);
      if (statSync(p).size > MAX_FILE) { diff.set(f, { added: ['(file too big to read)'], removed: [] }); continue; }
      diff.set(f, { added: readFileSync(p, 'utf8').split('\n'), removed: [] });
    }
  }
  const touched = [];
  const fragments = [];
  for (const [file, lines] of [...diff].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const reasons = touchReasons(file, lines);
    if (reasons.length) touched.push({ file, reasons });
    if (/^changes\/[^/]+\.md$/.test(file) && file !== 'changes/README.md') {
      let text;
      try {
        text = worktree ? (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null) : git(['show', `${headSha}:${file}`], root);
      } catch { text = null; }
      if (text == null) continue; // deleted (folded) in the range
      const p = parseFragment(file.slice('changes/'.length), text);
      fragments.push({ file, cost: p.cost.kind, problems: p.errors });
    }
  }
  const v = verdict(touched, fragments);
  return { ok: v.ok, base: baseSha, head: worktree ? `${headSha}+worktree` : headSha, touched, fragments, problems: v.problems };
}

export const USAGE = `Usage: node tools/server-cost-check.mjs [<base> [<head>]] [--json] [--worktree]
  base defaults to dev-0.2, head to HEAD (head's own changes since the merge-base)
  --worktree  also count uncommitted and untracked files (head must be HEAD)
  --json      print one JSON object instead of lines
Exit 0 OK, 1 a branch touching server, network or bot code without a numeric "Server cost:" fragment, 2 usage/git error.`;

/** The CLI. @returns {number} exit code */
export function main(args, { root = ROOT, out = (s) => process.stdout.write(s) } = {}) {
  const flags = args.filter((a) => a.startsWith('-'));
  const pos = args.filter((a) => !a.startsWith('-'));
  if (flags.some((f) => f === '--help' || f === '-h')) { out(USAGE + '\n'); return 0; }
  const bad = flags.filter((f) => f !== '--json' && f !== '--worktree');
  if (bad.length || pos.length > 2) { out(`server-cost: ${bad.length ? `unknown option ${bad.join(' ')}` : 'at most two revisions'}\n${USAGE}\n`); return 2; }
  let r;
  try {
    r = check({ base: pos[0] || 'dev-0.2', head: pos[1] || 'HEAD', worktree: flags.includes('--worktree'), root });
  } catch (e) {
    const msg = String(e?.stderr || e?.message || e).trim().split('\n')[0];
    out(flags.includes('--json') ? JSON.stringify({ ok: false, error: msg }) + '\n' : `server-cost: error: ${msg}\n`);
    return 2;
  }
  if (flags.includes('--json')) { out(JSON.stringify(r) + '\n'); return r.ok ? 0 : 1; }
  for (const t of r.touched) out(`server-cost: ${t.file}: ${t.reasons.join('; ')}\n`);
  for (const p of r.problems) out(`server-cost: ${p}\n`);
  const costs = r.fragments.map((f) => `${f.file} (${f.cost})`).join(', ') || 'no fragment';
  out(r.ok
    ? `server-cost: OK — ${r.touched.length} server-touching file(s); ${costs}\n`
    : `server-cost: FAIL — ${r.touched.length} server-touching file(s); ${costs}. Add the numbers to the fragment's "Server cost:" block (changes/README.md "Server cost")\n`);
  return r.ok ? 0 : 1;
}

const invoked = (() => { try { return pathToFileURL(realpathSync(process.argv[1] || '')).href; } catch { return null; } })();
if (invoked === import.meta.url) process.exitCode = main(process.argv.slice(2));
