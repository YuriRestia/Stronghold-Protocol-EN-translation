#!/usr/bin/env node
// (fork) FORK-CHANGELOG.md from fragments (changes/README.md).
//
// A branch never edits FORK-CHANGELOG.md: it adds one small file, changes/<what-it-changes>.md, with the date and its
// sections. Parallel branches then never conflict on the changelog. On dev-0.2 the lead folds the fragments in:
//
//   npm run changelog                 check every fragment (exit 1 on a bad one); writes nothing
//   npm run changelog -- --dry-run    print FORK-CHANGELOG.md with the fragments folded in; writes nothing
//   npm run changelog -- --write      fold them into FORK-CHANGELOG.md and delete them: only on dev-0.2, and only when
//                                     changes/ and FORK-CHANGELOG.md have no uncommitted changes
//   npm run changelog -- --help       this usage (exit 1, like an unknown option; nothing is touched)
//
// Fragments of one date go to the top of that date's section in FORK-CHANGELOG.md (newest first, by the time git
// added the file; a date the changelog lacks gets its own section in date order).
import { readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CHANGES_DIR = join(ROOT, 'changes');
export const CHANGELOG = join(ROOT, 'FORK-CHANGELOG.md');
/** FORK-CHANGELOG.md is ~150 kB; a fragment a few kB. Bigger is a bug (storage rule: every write is capped). */
const MAX_CHANGELOG = 16 * 1024 * 1024;
const MAX_FRAGMENT = 256 * 1024;
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const DATE = /^## (\d{4}-\d{2}-\d{2})$/;

const realDate = (s) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

/**
 * Check and parse one fragment. Format: `## YYYY-MM-DD`, then one or more `### Heading` sections, each with at least
 * one `- ` bullet; nothing else at heading level 1 or 2; LF line ends.
 * @param {string} name file name
 * @param {string} text
 * @returns {{ date: string|null, body: string, errors: string[] }} body = the `###` sections, trimmed
 */
export function parseFragment(name, text) {
  const errors = [];
  if (!NAME.test(name)) errors.push(`${name}: name must be lowercase words joined by hyphens, ending .md`);
  if (text.includes('\r')) errors.push(`${name}: CR line ends (use LF)`);
  if (Buffer.byteLength(text) > MAX_FRAGMENT) errors.push(`${name}: over ${MAX_FRAGMENT} bytes`);
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const m = DATE.exec(lines[i] || '');
  const date = m && realDate(m[1]) ? m[1] : null;
  if (!date) errors.push(`${name}: the first line must be "## YYYY-MM-DD" (a real date)`);
  const rest = lines.slice(i + 1);
  const body = rest.join('\n').trim();
  let sections = 0, bullets = 0, open = false;
  for (const l of rest) {
    if (/^### \S/.test(l)) {
      if (open && !bullets) errors.push(`${name}: section before "${l}" has no "- " bullet`);
      sections++; bullets = 0; open = true;
    } else if (/^#{1,2}( |$)/.test(l)) errors.push(`${name}: only one "## date" line; sections are "### Heading" (found "${l}")`);
    else if (/^- \S/.test(l)) { if (!open) errors.push(`${name}: bullet before the first "### Heading"`); bullets++; }
    else if (l.trim() && !open) errors.push(`${name}: text before the first "### Heading": "${l.slice(0, 60)}"`);
  }
  if (!sections) errors.push(`${name}: needs at least one "### Heading" section`);
  else if (!bullets) errors.push(`${name}: the last section has no "- " bullet`);
  return { date, body, errors };
}

/**
 * Fold fragments into the changelog text. `fragments` are { date, body, order } with a larger `order` = newer; within
 * one date the newest goes first, above the sections already there.
 * @param {string} changelog
 * @param {{ date: string, body: string, order: number, name?: string }[]} fragments
 */
export function foldFragments(changelog, fragments) {
  const text = changelog.replace(/\r/g, '');
  const lines = text.split('\n');
  const first = lines.findIndex((l) => DATE.test(l));
  const head = (first < 0 ? lines : lines.slice(0, first)).join('\n').replace(/\n+$/, '');
  /** @type {{ date: string, body: string }[]} */
  const days = [];
  if (first >= 0) {
    let cur = null;
    for (const l of lines.slice(first)) {
      const m = DATE.exec(l);
      if (m) { cur = { date: m[1], lines: [] }; days.push(cur); } else cur.lines.push(l);
    }
    for (const d of days) d.body = d.lines.join('\n').trim();
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const sorted = [...fragments].sort((a, b) => b.order - a.order || String(a.name).localeCompare(String(b.name)));
  for (const date of [...new Set(sorted.map((f) => f.date))]) {
    const add = sorted.filter((f) => f.date === date).map((f) => f.body.trim());
    const d = byDate.get(date);
    if (d) d.body = [...add, d.body].filter(Boolean).join('\n\n');
    else { const nd = { date, body: add.join('\n\n') }; days.push(nd); byDate.set(date, nd); }
  }
  // newest date first; dates already in the file keep their relative order (a stable sort)
  days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return [head, ...days.map((d) => `## ${d.date}\n\n${d.body}`)].join('\n\n') + '\n';
}

/** When git added the fragment (seconds); not committed yet = now. */
function addedAt(file, root = ROOT) {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%ct', '-1', '--', file], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return Number(out);
  } catch { /* not a git checkout: by name only */ }
  return Math.floor(Date.now() / 1000);
}

/** The fragment files (README.md is the format, not a fragment). */
export function fragmentFiles(dir = CHANGES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
}

export const USAGE = `Usage: node tools/changelog.mjs [--check | --dry-run | --write]
  (no option), --check  check every fragment in changes/ (exit 1 on a bad one); writes nothing
  --dry-run             print FORK-CHANGELOG.md with the fragments folded in; writes nothing
  --write               fold the fragments into FORK-CHANGELOG.md and delete them (dev-0.2 only, with changes/ and
                        FORK-CHANGELOG.md committed)
  --help                this text`;
const MODES = new Set(['--check', '--dry-run', '--write']);

/** The checkout's branch, and whether changes/ or FORK-CHANGELOG.md has uncommitted changes (null: not a git checkout). */
function gitState(root) {
  try {
    const run = (a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { branch: run(['rev-parse', '--abbrev-ref', 'HEAD']).trim(), dirty: run(['status', '--porcelain', '--untracked-files=all', '--', 'changes', 'FORK-CHANGELOG.md']).trim() };
  } catch { return null; }
}

/**
 * The command. Folding (and deleting the fragments) happens only with `--write`; any other option, `--help` included,
 * prints the usage and exits 1 without touching a file.
 * @param {string[]} args
 * @param {{ root?: string, log?: (s: string) => void, out?: (s: string) => void, branch?: string }} [o] root: the checkout
 *   (tests); branch: the branch `--write` must be on
 * @returns {number} exit code
 */
export function main(args, { root = ROOT, log = (x) => console.log(x), out = (x) => process.stdout.write(x), branch = 'dev-0.2' } = {}) {
  const unknown = args.filter((a) => !MODES.has(a));
  const modes = args.filter((a) => MODES.has(a));
  if (unknown.length || modes.length > 1) {
    if (!(unknown.length === 1 && (unknown[0] === '--help' || unknown[0] === '-h') && !modes.length)) {
      log(unknown.length ? `changelog: unknown option ${unknown.join(' ')}` : `changelog: one of ${modes.join(', ')}, not several`);
    }
    log(USAGE);
    return 1;
  }
  const mode = modes[0] || '--check';
  const dir = join(root, 'changes'), logPath = join(root, 'FORK-CHANGELOG.md');
  const files = fragmentFiles(dir);
  const parsed = files.map((name) => {
    const path = join(dir, name);
    return { name, path, ...parseFragment(name, readFileSync(path, 'utf8')) };
  });
  const errors = parsed.flatMap((p) => p.errors);
  for (const e of errors) log(`changelog: ${e}`);
  if (errors.length) return 1;
  if (mode === '--check') {
    log(`changelog: ${files.length} fragment(s) OK${files.length ? '; fold them on dev-0.2 with --write' : ''}`);
    return 0;
  }
  if (mode === '--write') {
    const g = gitState(root);
    if (!g) { log('changelog: --write needs a git checkout; nothing written'); return 1; }
    if (g.branch !== branch) { log(`changelog: --write runs on ${branch} only (this checkout is on ${g.branch}); nothing written`); return 1; }
    if (g.dirty) { log(`changelog: changes/ or FORK-CHANGELOG.md has uncommitted changes; commit them first. Nothing written:
${g.dirty}`); return 1; }
  }
  if (!files.length) { log('changelog: no fragments in changes/'); return 0; }
  const text = foldFragments(readFileSync(logPath, 'utf8'), parsed.map((p) => ({ ...p, order: addedAt(p.path, root) })));
  if (Buffer.byteLength(text) > MAX_CHANGELOG) { log(`changelog: result over ${MAX_CHANGELOG} bytes; nothing written`); return 1; }
  if (mode === '--dry-run') { out(text); return 0; }
  writeFileSync(logPath + '.tmp', text);
  renameSync(logPath + '.tmp', logPath);
  for (const p of parsed) unlinkSync(p.path);
  log(`changelog: folded ${files.length} fragment(s) into FORK-CHANGELOG.md and deleted them: ${files.join(', ')}`);
  return 0;
}

const invoked = (() => { try { return pathToFileURL(realpathSync(process.argv[1] || '')).href; } catch { return null; } })();
if (invoked === import.meta.url) process.exitCode = main(process.argv.slice(2));
