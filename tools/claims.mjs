// tools/claims.mjs — (fork, 2026-11-13) sourced claims. A line that states a number with a unit (time, size, rate, %,
// ×, counts of files/units/tests) or how the official game behaves carries its source: `[src: path:line]`,
// `[src: doc §heading]`, `[src: official <file> <field>]`, or `[unverified]`. Strict but cheap: a false positive is
// fixed by adding the marker. Used by tools/changelog.mjs --check (fragments), the crew's claim-check.mjs (reports)
// and cover-tests.mjs (the [ASSUMED gate).
//   node tools/claims.mjs check <file|->          claims without a source (exit 1 when any)
//   node tools/claims.mjs assumed [<base>] [<head>] new "[ASSUMED" lines without "user OK <date>" (exit 1 when any)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MARKER = /\[(?:src:\s*[^\]\s][^\]]*|unverified)\]/i;
const MARKERS = /[ \t]*\[(?:src:[^\]]*|unverified)\]/gi;
/** The text without its source markers (what a public changelog shows). */
export const stripMarkers = (t) => t.replace(MARKERS, '');

const NUM = String.raw`(?<![\w.#§:/\\-])\d+(?:[.,]\d+)*(?:\s?[-–]\s?\d+(?:[.,]\d+)*)?\s?`;
const TIME = String.raw`(?:ms|s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?|frames?|fps)`;
const MEASURE = String.raw`(?:${TIME}|[KMGT]i?B(?:\/(?:s|day|round|match|player|hello))?|kB|bytes?|Mbit\/s|%|×|x|files?|units?|tests?|lines?|messages?|requests?|cores?|workers?)`;
/** A timing number: "2 s", "150 ms", "1.5 seconds", "30 fps". */
export const TIMING = new RegExp(`${NUM}${TIME}(?![\\w/])`, 'i');
/** A number with a unit: timings, sizes and rates, %, ×, counts of files/units/tests/lines/messages. */
export const MEASURED = new RegExp(`${NUM}${MEASURE}(?![\\w])`, 'i');
/** A statement of what the official game does. */
export const OFFICIAL = /\bas in the official\b|\bthe official (?:game|client|data|code)\b|\bofficial(?:ly)?\b[^.;]*\b(?:does|do|did|uses?|plays?|shows?|has|have|lasts?|fires?|triggers?|waits?|spawns?|keeps?|behaves?|never|always)\b/i;

/** Text that never holds a claim: inline code, link targets, URLs, {placeholders}, the markers themselves. */
const neutral = (t) => t.replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ')
  .replace(/\{[^}]*\}/g, ' ').replace(MARKERS, ' ');

/**
 * Logical lines: a bullet or numbered item with its continuation lines, a table row, a heading, or a paragraph.
 * Fenced code blocks and table separator rows are skipped. Each is { line (1-based, its first line), text }.
 */
export function logicalLines(text) {
  const out = [];
  let cur = null, fence = false;
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; cur = null; continue; }
    if (fence) continue;
    if (!l.trim()) { cur = null; continue; }
    if (/^\s*\|?\s*:?-{3,}/.test(l)) { cur = null; continue; }
    const starts = /^\s*(?:[-*+] |\d+[.)] |\||#{1,6} )/.test(l) || /^[A-Z][\w ]*:\s*$/.test(l);
    if (!cur || starts || /^\s*\|/.test(cur.text)) { cur = { line: i + 1, text: l }; out.push(cur); } else cur.text += `\n${l}`;
  }
  return out;
}

/**
 * The logical lines that state a claim and carry no source marker.
 * @param {string} text
 * @param {{ timingOnly?: boolean, official?: boolean, lineOffset?: number }} [o] timingOnly: only timing numbers count
 *   (fragment sections); official: official-behaviour statements count too (reports)
 * @returns {{ line: number, text: string, why: string }[]}
 */
export function unsourced(text, { timingOnly = false, official = false, lineOffset = 0 } = {}) {
  const out = [];
  for (const u of logicalLines(text)) {
    if (MARKER.test(u.text)) continue;
    const t = neutral(u.text);
    const num = (timingOnly ? TIMING : MEASURED).exec(t);
    const off = official && !num ? OFFICIAL.exec(t) : null;
    if (num || off) out.push({ line: u.line + lineOffset, text: u.text.split('\n')[0].trim().slice(0, 140), why: num ? `"${num[0].trim()}"` : `"${off[0].trim()}"` });
  }
  return out;
}

// ---- the [ASSUMED gate ----

/** "user OK 2026-11-13" (the user's approval of an assumption, with its date). */
export const ASSUMED_OK = /\buser OK \d{4}-\d{2}-\d{2}\b/i;
/** An assumption, not a mention: "[ASSUMED] text" or "[ASSUMED: text]"; "[ASSUMED]:", "under [ASSUMED]," and a bare
 *  "[ASSUMED]" at the end of a line (template headings, prose about the convention) are mentions. */
const ASSUMPTION = /\[ASSUMED[^\]\n]*[^\]\s][^\]\n]*\]|\[ASSUMED\][ \t]+[^\s:：,，.。)）]/;
const ASSUMED_EXEMPT = /^(?:tools\/claims\.mjs|test\/claims\.test\.js|data\/|test\/golden\/)|\.snapshot\.json$/;

/** Added lines of a unified diff (git diff -U0 / git log -p) as { file, line, text }. */
export function addedLines(diff) {
  const out = [];
  let file = null, n = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.startsWith('+++ b/') ? l.slice(6) : null; continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { n = Number(h[1]); continue; }
    if (file && l.startsWith('+')) { out.push({ file, line: n, text: l.slice(1) }); n++; }
  }
  return out;
}

/** The added lines that state an assumption without the user's dated OK. */
export function assumedViolations(diff) {
  return addedLines(diff).filter((a) => !ASSUMED_EXEMPT.test(a.file) && ASSUMPTION.test(a.text.replace(/`[^`]*`/g, " ")) && !ASSUMED_OK.test(a.text));
}

const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 60_000, windowsHide: true });

/**
 * The branch's own new [ASSUMED lines: patches of its non-merge commits since <base> (commits from an upstream/*
 * remote excluded: upstream's own [ASSUMED notes come with their merges), plus uncommitted changes when head is HEAD.
 * @returns {{ skipped?: string, violations: ReturnType<typeof assumedViolations> }}
 */
export function branchAssumed(root, { base, head = 'HEAD' } = {}) {
  const refs = base ? [base] : ['refs/heads/dev-0.2', 'refs/remotes/origin/dev-0.2'];
  const ref = refs.find((r) => git(root, ['rev-parse', '--verify', '--quiet', `${r}^{commit}`]).status === 0);
  if (!ref) return { skipped: `no ${refs.join(' or ')} in this checkout`, violations: [] };
  const log = git(root, ['log', '-p', '-U0', '--no-merges', '--no-color', '--no-ext-diff', '--format=', `${ref}..${head}`, '--not', '--remotes=upstream']);
  if (log.status !== 0) return { skipped: `git log failed: ${(log.stderr || log.error?.message || '').trim().slice(0, 200)}`, violations: [] };
  let diff = log.stdout;
  if (head === 'HEAD') {
    const wt = git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', 'HEAD']);
    if (wt.status === 0) diff += `\n${wt.stdout}`;
  }
  const seen = new Set();
  return { base: ref, violations: assumedViolations(diff).filter((v) => !seen.has(`${v.file}\n${v.text}`) && seen.add(`${v.file}\n${v.text}`)) };
}

export const ASSUMED_HELP = 'a new [ASSUMED] line needs the user\'s OK on that line ("user OK YYYY-MM-DD"): ask the user, or source the claim instead ([src: ...])';

function cli(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'check' && rest.length === 1) {
    const text = rest[0] === '-' ? readFileSync(0, 'utf8') : readFileSync(rest[0], 'utf8');
    const bad = unsourced(text, { official: true });
    for (const b of bad) console.log(`${rest[0]}:${b.line}: ${b.why} has no source: ${b.text}`);
    console.log(bad.length ? `claims: ${bad.length} claim(s) without [src: ...] or [unverified]` : 'claims: every claim is sourced');
    return bad.length ? 1 : 0;
  }
  if (cmd === 'assumed' && rest.length <= 2) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const r = branchAssumed(process.cwd() || root, { base: rest[0], head: rest[1] });
    if (r.skipped) { console.log(`claims: [ASSUMED gate skipped: ${r.skipped}`); return 0; }
    for (const v of r.violations) console.log(`${v.file}:${v.line}: ${v.text.trim().slice(0, 160)}`);
    console.log(r.violations.length ? `claims: ${r.violations.length} new [ASSUMED line(s) since ${r.base}; ${ASSUMED_HELP}` : `claims: no unapproved [ASSUMED lines since ${r.base}`);
    return r.violations.length ? 1 : 0;
  }
  console.log('Usage: node tools/claims.mjs check <file|->\n       node tools/claims.mjs assumed [<base>] [<head>]');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = cli(process.argv.slice(2));
