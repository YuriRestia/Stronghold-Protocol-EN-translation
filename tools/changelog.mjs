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
 * (fork, SERVER COST rule, 2026-11-11) Fragments written before the rule whose change did touch server, network or
 * bot code and that were never measured: the only ones `Server cost: unmeasured (pre-rule)` is accepted from. Never
 * add a fragment written after 2026-11-11 here.
 */
export const PRE_RULE_UNMEASURED = Object.freeze([
  // the audit of the fragments on dev-0.2 at the rule's start (tools/server-cost-check.mjs over each one's merge):
  'grand-alliance-squad-moves.md', // server/lobby.js, shared/protocol.js
  'host-bots-play-ioleta-adaptive.md', // server/index.js, server/match/Match.js
  'load-tolerant-script-and-studio-check-tests.md', // server/studio/
  'periodic-tick-hit-effects.md', // server/sim/ (battle events, kits)
  'skill-start-animations.md', // server/sim/ai.js, simdata.js, skills.js
  'summon-and-talent-effects.md', // server/sim/ kits
  'target-mark-effects.md', // server/sim/ (fx states, kits)
]);

/** What a numeric `Server cost:` block must state, each as [label, test]. */
export const COST_ITEMS = Object.freeze([
  ['"typical" and "worst" case', (t) => /\btypical\b/i.test(t) && /\bworst\b/i.test(t)],
  ['per player', (t) => /\bper player\b/i.test(t)],
  ['per room', (t) => /\bper room\b/i.test(t)],
  ['300 players', (t) => /\b300\b/.test(t)],
  ['bandwidth in MB/s', (t) => /\d\s*MB\/s\b/.test(t)],
  ['bandwidth in GB/day', (t) => /\d\s*GB\/day\b/.test(t)],
  ['server CPU as % of one core', (t) => /\bCPU\b/i.test(t) && /\d\s*%/.test(t)],
  ['memory in MB', (t) => /\bmemory\b/i.test(t) && /\d\s*MB\b(?!\/)/.test(t)],
  ['disk in MB/day', (t) => /\d\s*MB\/day\b/.test(t)],
  ['bot budget in ms/round', (t) => /\d\s*ms\/round\b/.test(t)],
  ['a "Cap:" line (what bounds the worst case)', (t) => /^\s*(?:[-*]\s+)?(?:\*\*)?Cap:/mi.test(t)],
  ['"measured" or "estimated"', (t) => /\b(?:measured|estimated)\b/i.test(t)],
]);

/**
 * The `Server cost:` block of a fragment: the line starting `Server cost:` and everything after it.
 * `none` (optionally with a reason in parentheses) when no server, network or bot code is touched; otherwise the numbers.
 * @param {string} name file name
 * @param {string} block the block's text (from `Server cost:` to the end), or null when the fragment has none
 * @returns {{ kind: 'none'|'pre-rule'|'numbers'|'missing'|'invalid', text: string, problems: string[] }}
 */
export function parseServerCost(name, block) {
  if (block == null) return { kind: 'missing', text: '', problems: [`${name}: no "Server cost:" line (changes/README.md "Server cost")`] };
  const text = block.trim();
  const first = text.split('\n')[0].replace(/^Server cost:\s*/, '');
  const more = text.split('\n').slice(1).some((l) => l.trim());
  if (/^none\b/i.test(first) && !more) return { kind: 'none', text, problems: [] };
  if (/^unmeasured \(pre-rule\)$/i.test(first.trim()) && !more) {
    return PRE_RULE_UNMEASURED.includes(name) ? { kind: 'pre-rule', text, problems: [] }
      : { kind: 'invalid', text, problems: [`${name}: "unmeasured (pre-rule)" is only for the fragments listed in tools/changelog.mjs PRE_RULE_UNMEASURED`] };
  }
  const problems = [];
  if (/\bMbit\/s\b|\bMbps\b|\bMb\/s\b/.test(text)) problems.push(`${name}: Server cost: bandwidth in MB/s and GB/day, never Mbit/s`);
  for (const [label, ok] of COST_ITEMS) if (!ok(text)) problems.push(`${name}: Server cost: missing ${label}`);
  return { kind: problems.length ? 'invalid' : 'numbers', text, problems };
}

/**
 * Check and parse one fragment. Format: `## YYYY-MM-DD`, then one or more `### Heading` sections, each with at least
 * one `- ` bullet; nothing else at heading level 1 or 2; LF line ends; last, the `Server cost:` block.
 * @param {string} name file name
 * @param {string} text
 * @returns {{ date: string|null, body: string, cost: ReturnType<typeof parseServerCost>, errors: string[] }} body = the
 *   `###` sections, trimmed, plus a numeric Server cost block (a `none` one is left out of the changelog)
 */
export function parseFragment(name, text) {
  const errors = [];
  if (!NAME.test(name)) errors.push(`${name}: name must be lowercase words joined by hyphens, ending .md`);
  if (text.includes('\r')) errors.push(`${name}: CR line ends (use LF)`);
  if (Buffer.byteLength(text) > MAX_FRAGMENT) errors.push(`${name}: over ${MAX_FRAGMENT} bytes`);
  const all = text.replace(/\r/g, '').split('\n');
  const costAt = all.findIndex((l) => /^Server cost:/.test(l));
  if (costAt >= 0 && all.slice(costAt + 1).some((l) => /^Server cost:/.test(l))) errors.push(`${name}: more than one "Server cost:" line`);
  const cost = parseServerCost(name, costAt >= 0 ? all.slice(costAt).join('\n') : null);
  errors.push(...cost.problems);
  const lines = costAt >= 0 ? all.slice(0, costAt) : all;
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const m = DATE.exec(lines[i] || '');
  const date = m && realDate(m[1]) ? m[1] : null;
  if (!date) errors.push(`${name}: the first line must be "## YYYY-MM-DD" (a real date)`);
  const rest = lines.slice(i + 1);
  const sectionsText = rest.join('\n').trim();
  const body = cost.kind === 'numbers' ? `${sectionsText}\n\n${cost.text}` : sectionsText;
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
  return { date, body, cost, errors };
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
