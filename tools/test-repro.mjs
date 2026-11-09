#!/usr/bin/env node
// tools/test-repro.mjs — (fork) run exactly the browser tests a question needs, and say exactly what failed:
//
//   node tools/test-repro.mjs <file> --list                     the file's tests in file order (index, skipped or not)
//   node tools/test-repro.mjs <file> --test "<pattern>" [--runs N] [--before "<pattern>"]… [--orders]
//                                    reproduce one test: alone, then right after each earlier test that may leave state
//   node tools/test-repro.mjs --report <junit.xml> [--hook DIR]  the failure report of any `node --test` run's JUnit file
//   node tools/test-repro.mjs --rerun-failed <failures.json>    rerun only the failed tests of a report
//   node tools/test-repro.mjs --changed <git range> [file…] [--dry-run] [--yes]
//                                    run only the tests a change can affect (`HEAD` = the working tree against HEAD);
//                                    a selection expected to take over 15 minutes starts only with --yes
//   common: [--cpu 4] [--own-flags] [--budget K [--budget-floor S]] [--no-coverage] [--out DIR] [--lanes DIR | --no-lock]
//
//   --test       a regular expression naming exactly one test (matched like --test-name-pattern: the test's own name,
//                or its suites' and its names joined by spaces)
//   --runs       runs per case (default 5 for --test, 1 otherwise); each run is a fresh `node --test` of the file
//   --before     a case per matching test that comes before the target in the file: that test, then the target
//   --orders     a case per test that comes before the target in the file
//   --cpu        Chrome CPU throttling rate on every page the file opens (4 = four times slower), to imitate load
//   --own-flags  Chrome with the file's own flags only (no added GPU flags), as `npm run test:browser` starts it
//   --budget K   each test with a measured time gets the timeout max(floor, K × that time) (--budget-floor, seconds,
//                default 20); a test it stops is reported as "stopped by budget", not as a failure
//   --no-coverage  do not record which code each test ran (the coverage map --changed reads)
//   --lanes      the folder of the lane locks (default $SP_LANE_DIR): fix-browser-3.lock (and fix-browser-2.lock for a
//                two-slot file, tools/browser-suite.mjs --slots); waits while perf-quiet exists there
//
// How a run works: `node --test` with a --test-name-pattern anchored on the run's full test names, so node runs just
// those tests, in the file's order, with the file's own before / after hooks, server and browser. Through
// tools/test-repro-hook.mjs every run records each test's start and end, a failed test's screenshots and console, and
// (unless --no-coverage) which lines of which repository files each test ran, merged into the coverage map
// test/e2e/out/coverage/<file>.json. Before a run the expected time (the file's setup plus the measured time of each
// selected test, tools/browser-suite.json) is printed, after it the actual time. After every run: the failure report,
// a table plus failures.json (per failed test: file, full name, first error line, when it started counted from the
// file's start, how long it ran, the file's total, the tests that ran before it in that file, screenshots and console).
// --rerun-failed reads that file: each failed test alone; one that passes alone is "depends on earlier tests" and runs
// again after exactly the tests that ran before it. --changed: the selection of tools/test-select.mjs (every choice
// printed with its reason; a file with no coverage yet, or a change to shared setup, runs whole).
// Exit code: 1 when a test failed (or a budget stopped one), 2 on a usage error.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, BROWSER_ENV, slotsOfFile, loadTable, browserFileList } from './browser-suite.mjs';
import { parseJUnit } from './test-timings.mjs';
import { parseDiff, selectInFile, MAPPED, isTestFile } from './test-select.mjs';

const HOOK = path.join(ROOT, 'tools/test-repro-hook.mjs');
const LANES = ['fix-browser-3.lock', 'fix-browser-2.lock', 'fix-browser.lock'];
export const COVERAGE_DIR = 'test/e2e/out/coverage';

export const USAGE = `usage: node tools/test-repro.mjs <file> --list
       node tools/test-repro.mjs <file> --test "<pattern>" [--runs N] [--before "<pattern>"]… [--orders]
       node tools/test-repro.mjs --report <junit.xml> [--hook DIR]
       node tools/test-repro.mjs --rerun-failed <failures.json>
       node tools/test-repro.mjs --changed <git range> [file…] [--dry-run] [--yes]
  common: [--cpu RATE] [--own-flags] [--budget K [--budget-floor S]] [--no-coverage] [--out DIR] [--lanes DIR | --no-lock]`;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const o = {
    mode: 'cases', file: null, files: [], test: null, runs: null, before: [], orders: false, cpu: 1, out: null, list: false,
    lanes: undefined, lock: true, ownFlags: false, report: null, hook: null, rerun: null, changed: null, dryRun: false,
    budget: null, budgetFloor: 20, coverage: true, yes: false,
  };
  const value = (i, flag) => {
    const v = argv[i + 1];
    if (v == null || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--test') o.test = value(i++, a);
    else if (a === '--before') o.before.push(value(i++, a));
    else if (a === '--runs') o.runs = Number(value(i++, a));
    else if (a === '--cpu') o.cpu = Number(value(i++, a));
    else if (a === '--out') o.out = value(i++, a);
    else if (a === '--lanes') o.lanes = value(i++, a);
    else if (a === '--report') { o.report = value(i++, a); o.mode = 'report'; } else if (a === '--hook') o.hook = value(i++, a);
    else if (a === '--rerun-failed') { o.rerun = value(i++, a); o.mode = 'rerun'; } else if (a === '--changed') { o.changed = value(i++, a); o.mode = 'changed'; } else if (a === '--budget') o.budget = Number(value(i++, a));
    else if (a === '--budget-floor') o.budgetFloor = Number(value(i++, a));
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--yes') o.yes = true;
    else if (a === '--no-coverage') o.coverage = false;
    else if (a === '--no-lock') o.lock = false;
    else if (a === '--orders') o.orders = true;
    else if (a === '--own-flags') o.ownFlags = true;
    else if (a === '--list') { o.list = true; o.mode = o.mode === 'cases' ? 'list' : o.mode; } else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else o.files.push(a.split('\\').join('/').replace(/^\.\//, ''));
  }
  if ([o.report, o.rerun, o.changed].filter(Boolean).length > 1) throw new Error('one of --report, --rerun-failed, --changed');
  if (o.mode === 'cases' || o.mode === 'list') {
    if (!o.files.length) throw new Error('no test file');
    if (o.files.length > 1) throw new Error(`one file only (got ${o.files[0]} and ${o.files[1]})`);
    o.file = o.files[0];
    if (o.mode === 'cases' && !o.test) throw new Error('--test "<pattern>" is required (or --list)');
  } else if (o.mode !== 'changed' && o.files.length) throw new Error(`no file with --${o.mode === 'rerun' ? 'rerun-failed' : o.mode} (got ${o.files[0]})`);
  o.runs ??= o.mode === 'cases' ? 5 : 1;
  if (!Number.isInteger(o.runs) || o.runs < 1 || o.runs > 100) throw new Error('--runs: a whole number from 1 to 100');
  if (!Number.isFinite(o.cpu) || o.cpu < 1 || o.cpu > 20) throw new Error('--cpu: a rate from 1 (none) to 20');
  if (o.budget != null && !(Number.isFinite(o.budget) && o.budget >= 1)) throw new Error('--budget: a factor of at least 1');
  if (!(Number.isFinite(o.budgetFloor) && o.budgetFloor > 0)) throw new Error('--budget-floor: seconds, more than 0');
  for (const p of [o.test, ...o.before]) if (p != null) new RegExp(p); // a bad pattern fails here, not after Chrome started
  return o;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The --test-name-pattern that runs exactly these tests (paths of names) and none of their suites' other tests. */
export function namePattern(paths) {
  return `^(?:${paths.map((p) => escapeRe(p.join(' '))).join('|')})$`;
}

/** A test's full name as node:test's t.fullName gives it. */
export const fullName = (p) => p.join(' > ');

/** Whether a pattern selects a test the way --test-name-pattern does: its own name or its names joined by spaces. */
export function matches(pattern, p) {
  const re = new RegExp(pattern);
  return re.test(p.at(-1)) || re.test(p.join(' '));
}

/** Chrome flags of `extra` the launch's own `args` does not set (by flag name): the file's own flags always win. */
export function gpuFlagsToAdd(args, extra) {
  const own = new Set(args.map((a) => String(a).split('=')[0]));
  return extra.filter((a) => !own.has(a.split('=')[0]));
}

/**
 * The cases of a repro over the file's tests (in file order, as --list gives them).
 * @param {{ path: string[], skip: boolean }[]} tests
 * @param {{ test: string, before?: string[], orders?: boolean }} o
 * @returns {{ target: { path: string[], index: number }, cases: { id: string, label: string, paths: string[][] }[] }}
 */
export function buildCases(tests, { test, before = [], orders = false }) {
  const indexed = tests.map((t, index) => ({ ...t, index }));
  const hits = indexed.filter((t) => matches(test, t.path));
  if (!hits.length) throw new Error(`--test "${test}": no test of the file matches (see --list)`);
  const live = hits.filter((t) => !t.skip);
  if (!live.length) throw new Error(`--test "${test}": only skipped tests match: ${hits.map((t) => fullName(t.path)).join(' | ')}`);
  if (live.length > 1) throw new Error(`--test "${test}" matches ${live.length} tests; name one:\n${live.map((t) => `  #${t.index} ${fullName(t.path)}`).join('\n')}`);
  const target = live[0];
  const cases = [{ id: 'alone', label: 'alone', paths: [target.path] }];
  const preds = new Map();
  for (const p of before) {
    const m = indexed.filter((t) => t.index !== target.index && !t.skip && matches(p, t.path));
    if (!m.length) throw new Error(`--before "${p}": no test of the file matches`);
    const earlier = m.filter((t) => t.index < target.index);
    if (!earlier.length) throw new Error(`--before "${p}": its tests come after the target in the file, and node runs a file's tests in file order`);
    for (const t of earlier) preds.set(t.index, t);
  }
  if (orders) for (const t of indexed) if (t.index < target.index && !t.skip) preds.set(t.index, t);
  for (const t of [...preds.values()].sort((a, b) => a.index - b.index)) {
    cases.push({ id: `after-${t.index}`, label: `after #${t.index} ${t.path.at(-1)}`, paths: [t.path, target.path] });
  }
  return { target: { path: target.path, index: target.index }, cases };
}

const readRecords = (text) => String(text).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * One run's outcome from the reporter's JSON lines.
 * @param {string} text report.jsonl @param {{ paths: string[][] }} c @param {string[]} target
 * @returns {{ ok: boolean, error: string | null }}
 */
export function runResult(text, c, target) {
  const recs = readRecords(text);
  const mine = recs.find((r) => samePath(r.path, target));
  const otherFail = recs.find((r) => !r.ok && !samePath(r.path, target));
  if (!mine) return { ok: false, error: `the target did not run${otherFail ? ` (${otherFail.path.at(-1)}: ${otherFail.error})` : ''}` };
  if (mine.skip) return { ok: false, error: 'the target was skipped: is CHROME_PATH set and the file\'s switch on?' };
  const before = c.paths.filter((p) => !samePath(p, target));
  const missing = before.filter((p) => !recs.some((r) => samePath(r.path, p) && !r.skip));
  if (missing.length) return { ok: false, error: `the test before it did not run: ${missing.map((p) => p.at(-1)).join(', ')}` };
  if (mine.ok) return { ok: true, error: null };
  const note = otherFail ? ` (the test before it failed too: ${otherFail.error})` : '';
  return { ok: false, error: `${mine.error || 'failed'}${note}` };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ');

/** The result table (markdown). @param {{ label: string, runs: number, pass: number, fail: number, first: string }[]} rows */
export function formatTable(rows) {
  return [
    '| case | runs | pass | fail | first failure |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${cell(r.label)} | ${r.runs} | ${r.pass} | ${r.fail} | ${cell(r.first || '')} |`),
  ].join('\n');
}

/** The lane lock names a file of `slots` slots takes (the light slot first). */
export const laneLocks = (slots) => LANES.slice(0, Math.max(1, Math.min(slots, LANES.length)));

// ---- timings, budget --------------------------------------------------------------------------------------------------

/**
 * The expected time of a run of `names` (full names) of a file: its setup (before / after hooks) plus each test's
 * measured time; a whole-file run (names null) takes the file's measured time.
 * @param {{ measured?: Record<string, number>, tests?: Record<string, Record<string, number>>, setupMs?: Record<string, number>, defaultMs?: number }} table
 * @returns {{ ms: number, untimed: number }}
 */
export function expectedMs(table, file, names) {
  const setup = table.setupMs?.[file] ?? 0;
  if (names == null) return { ms: setup + (table.measured?.[file] ?? table.defaultMs ?? 30000), untimed: table.measured?.[file] == null ? 1 : 0 };
  const t = table.tests?.[file] ?? {};
  let ms = setup;
  let untimed = 0;
  for (const n of names) if (Number.isFinite(t[n])) ms += t[n]; else { untimed++; ms += table.defaultMs ?? 30000; }
  return { ms, untimed };
}

/** Each named test's budget: max(floor, k × its measured time); untimed tests get none. */
export function budgets(table, file, names, k, floorMs) {
  const t = table.tests?.[file] ?? {};
  const out = {};
  for (const n of names) if (Number.isFinite(t[n])) out[n] = Math.round(Math.max(floorMs, k * t[n]));
  return out;
}

const secs = (ms) => (ms == null ? '?' : ms >= 100000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

// ---- failure report ---------------------------------------------------------------------------------------------------

/**
 * What the hook left in a run directory (a test-repro run, or one file of a suite run): each test's start / end since
 * the file's process started, a failed test's screenshots, the console log, the budgets it applied.
 */
export function readHookDir(dir) {
  const lines = (f) => (fs.existsSync(path.join(dir, f)) ? readRecords(fs.readFileSync(path.join(dir, f), 'utf8')) : []);
  const timing = lines('timing.jsonl');
  const hook = lines('hook.jsonl');
  const tests = {};
  for (const t of timing) if (t.test) tests[t.test] = t;
  const shots = {};
  for (const h of hook) if (h.shot) (shots[h.test] ??= []).push(h.shot);
  const budget = {};
  for (const h of hook) if (h.budget && (h.own == null || h.ms < h.own)) budget[h.budget] = h.ms;
  return { file: timing.find((t) => t.file)?.file ?? null, tests, shots, budget, console: fs.existsSync(path.join(dir, 'console.txt')) ? path.join(dir, 'console.txt') : null, launches: hook.filter((h) => h.launch), pages: hook.filter((h) => h.page) };
}

/**
 * Per failed test: file, full name, first error line, when it started counted from the file's start (exact from the
 * hook; from a JUnit report alone the sum of the tests before it, without the file's setup: marked approximate), how
 * long it ran, the file's total, the tests that ran before it in that file, its screenshots and console.
 * @param {{ file: string, path: string[], ms: number, status: string, error: string|null, failureType?: string|null, suiteMs?: number|null, suiteStart?: number|null }[]} cases
 *   in run order
 * @param {Record<string, ReturnType<typeof readHookDir>>} [hooks] per file
 * @param {{ tests?: Record<string, Record<string, number>> }} [table]
 */
export function buildFailures(cases, hooks = {}, table = {}) {
  const out = [];
  const files = [...new Set(cases.map((c) => c.file))];
  for (const file of files) {
    const list = cases.filter((c) => c.file === file && c.status !== 'skip');
    const h = hooks[file] ?? null;
    const timed = h ? Object.values(h.tests) : [];
    const suites = new Map();
    for (const c of list) {
      if (c.path.length > 1) suites.set(`${c.path[0]}\u0000${c.suiteStart}`, c.suiteMs ?? 0);
      else suites.set(`case\u0000${fullName(c.path)}`, c.ms);
    }
    const fileMs = timed.length ? Math.max(...timed.map((t) => t.end)) : [...suites.values()].reduce((a, b) => a + b, 0) || null;
    let cum = 0;
    const ran = [];
    for (const c of list) {
      const name = fullName(c.path);
      if (c.status === 'fail') {
        const ht = h?.tests?.[name];
        const budgetMs = c.failureType === 'testTimeoutFailure' ? h?.budget?.[name] ?? null : null;
        out.push({
          file, test: name, path: c.path, error: c.error ?? null, failureType: c.failureType ?? null,
          budget: budgetMs != null ? { afterMs: budgetMs, expectedMs: table.tests?.[file]?.[name] ?? null } : null,
          startMs: ht ? ht.start : cum, startExact: !!ht, ms: ht ? ht.end - ht.start : c.ms, fileMs: fileMs ?? null,
          before: [...ran], shots: h?.shots?.[name] ?? [], console: h?.console ?? null,
        });
      }
      cum += c.ms;
      ran.push(name);
    }
  }
  return out;
}

/** The failure table (markdown). */
export function formatFailures(failures) {
  if (!failures.length) return 'no failures';
  return [
    '| file | test | what | started at | ran for | file total | ran before it |',
    '|---|---|---|---|---|---|---|',
    ...failures.map((f) => `| ${cell(f.file)} | ${cell(f.test.split(' > ').at(-1))} | ${cell(f.budget ? `stopped by budget after ${secs(f.budget.afterMs)} (expected ${secs(f.budget.expectedMs)})` : f.error)} | ${f.startExact ? '' : '≈ '}${secs(f.startMs)} | ${secs(f.ms)} | ${secs(f.fileMs)} | ${f.before.length ? `${f.before.length}: ${cell(f.before.map((b) => b.split(' > ').at(-1).slice(0, 40)).join('; '))}` : 'none'} |`),
  ].join('\n');
}

function writeFailures(dir, failures, notes = []) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'failures.json'), `${JSON.stringify({ at: new Date().toISOString(), failures }, null, 2)}\n`);
  const approx = failures.some((f) => !f.startExact) ? ['≈: counted from the JUnit times of the tests before it; the file\'s own setup (its before hooks) is not placed'] : [];
  const art = failures.filter((f) => f.shots.length || f.console).map((f) => `  ${f.test.split(' > ').at(-1).slice(0, 60)}: ${[...f.shots, f.console ? `console ${f.console} (lines tagged [${f.test.slice(0, 30)}…])` : null].filter(Boolean).join(', ')}`);
  const text = [formatFailures(failures), ...approx, ...(art.length ? ['artifacts:', ...art] : []), ...notes, `failures.json: ${path.join(dir, 'failures.json')}`].join('\n');
  console.log(`\n${text}`);
  return text;
}

// ---- coverage map -----------------------------------------------------------------------------------------------------

const covPath = (file) => path.join(ROOT, COVERAGE_DIR, `${file.replace(/[\\/]/g, '__')}.json`);
export const loadCoverage = (file) => { try { return JSON.parse(fs.readFileSync(covPath(file), 'utf8')); } catch { return null; } };

/** Whether a test file starts a separate server process (whose code the map cannot see). */
const separateServerOf = (file) => { try { return slotsOfFile(file) === 2 || /\bspawn\(|\bfork\(/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')); } catch { return false; } };

/**
 * A run's coverage.json merged into the file's coverage map: each test it ran replaces that test's entry (with the git
 * blob id of every file it used, so a later diff knows whether the record matches its old side); the others stay.
 */
export function mergeCoverage(prev, run, { separateServer = false } = {}) {
  const shaOf = (c) => {
    const out = {};
    for (const f of new Set([...Object.keys(c.used ?? {}), ...(c.loaded ?? [])])) if (run.files?.[f]?.sha) out[f] = run.files[f].sha;
    return out;
  };
  const map = prev ? JSON.parse(JSON.stringify(prev)) : { file: run.file, tests: {}, setup: null };
  for (const [n, c] of Object.entries(run.tests ?? {})) map.tests[n] = { at: run.at, used: c.used, loaded: c.loaded, sha: shaOf(c) };
  if (run.setup && (Object.keys(run.setup.used ?? {}).length || run.setup.loaded?.length)) map.setup = { at: run.at, used: run.setup.used, loaded: run.setup.loaded, sha: shaOf(run.setup) };
  map.unmapped = [...new Set([...(map.unmapped ?? []), ...(run.unmapped ?? [])])].sort();
  const differs = Object.entries(run.files ?? {}).filter(([, i]) => i.status === 'differs').map(([f]) => f);
  map.differs = [...new Set([...(map.differs ?? []).filter((f) => !(f in (run.files ?? {}))), ...differs])].sort();
  map.separateServer = separateServer;
  map.at = run.at;
  return map;
}

function saveCoverage(runDir) {
  const f = path.join(runDir, 'coverage.json');
  if (!fs.existsSync(f)) return null;
  const run = JSON.parse(fs.readFileSync(f, 'utf8'));
  const map = mergeCoverage(loadCoverage(run.file), run, { separateServer: separateServerOf(run.file) });
  fs.mkdirSync(path.join(ROOT, COVERAGE_DIR), { recursive: true });
  fs.writeFileSync(covPath(run.file), JSON.stringify(map));
  return Object.keys(run.tests ?? {}).length;
}

// ---- running ----------------------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hookEnv = () => ({ NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(HOOK).href}`.trim() });

/** The file's tests in file order, with the line of each test() call (node:test swapped for recorders: nothing runs). */
export function listTests(file) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-repro-list-')), 'tests.json');
  const r = spawnSync(process.execPath, [file], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ...BROWSER_ENV, ...hookEnv(), SP_REPRO_MODE: 'list', SP_REPRO_LIST_OUT: out },
  });
  if (!fs.existsSync(out)) throw new Error(`could not list the tests of ${file}:\n${(r.stderr || '').slice(-800)}`);
  const tests = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  return tests;
}

async function takeLanes(dir, names, owner) {
  let said = false;
  for (;;) {
    while (fs.existsSync(path.join(dir, 'perf-quiet'))) { if (!said) { console.log('perf-quiet is set: waiting'); said = true; } await sleep(5000); }
    const taken = [];
    for (const n of names) {
      try { fs.mkdirSync(path.join(dir, n)); taken.push(n); } catch { break; }
    }
    if (taken.length === names.length) {
      for (const n of taken) fs.writeFileSync(path.join(dir, n, 'owner'), owner);
      return () => { for (const n of taken) fs.rmSync(path.join(dir, n), { recursive: true, force: true }); };
    }
    for (const n of taken) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
    if (!said) { console.log(`waiting for ${names.join(' + ')} in ${dir}`); said = true; }
    await sleep(5000);
  }
}

/**
 * One `node --test` of `file` running exactly `paths` (null: the whole file), with the hook. Returns the reporter's
 * records, what the hook left, and the wall time.
 */
function runFile(file, paths, o, dir, budget = null) {
  fs.mkdirSync(dir, { recursive: true });
  const report = path.join(dir, 'report.jsonl');
  let budgetFile = null;
  if (budget && Object.keys(budget).length) { budgetFile = path.join(dir, 'budget.json'); fs.writeFileSync(budgetFile, JSON.stringify(budget)); }
  const args = [
    '--test', '--test-concurrency=1', ...(paths ? [`--test-name-pattern=${namePattern(paths)}`] : []),
    `--test-reporter=${pathToFileURL(HOOK).href}`, `--test-reporter-destination=${report}`,
    '--test-reporter=spec', `--test-reporter-destination=${path.join(dir, 'spec.txt')}`,
    file,
  ];
  const t0 = Date.now();
  spawnSync(process.execPath, args, {
    cwd: ROOT, stdio: 'ignore',
    env: {
      ...process.env, ...BROWSER_ENV, ...hookEnv(), NO_COLOR: '1',
      SP_REPRO_MODE: 'run', SP_REPRO_FILE: path.join(ROOT, file), SP_REPRO_CPU: String(o.cpu), SP_REPRO_DIR: dir,
      SP_REPRO_GPU: o.ownFlags ? '0' : '1', SP_REPRO_COVERAGE: o.coverage ? '1' : '0', ...(budgetFile ? { SP_REPRO_BUDGET: budgetFile } : {}),
    },
  });
  const records = fs.existsSync(report) ? readRecords(fs.readFileSync(report, 'utf8')) : [];
  const hook = readHookDir(dir);
  if (o.coverage) saveCoverage(dir);
  return { records, hook, ms: Date.now() - t0, text: fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '' };
}

/** A run's reporter records as report cases (the shape of parseJUnit). */
const casesOf = (file, records) => records.map((r) => ({ file, path: r.path, ms: r.ms ?? 0, status: r.skip ? 'skip' : r.ok ? 'pass' : 'fail', error: r.error ?? null, failureType: r.failureType ?? null }));

async function withLanes(o, files, fn) {
  const lanesDir = o.lanes ?? process.env.SP_LANE_DIR;
  let release = () => {};
  if (o.lock && lanesDir) {
    const names = laneLocks(Math.max(...files.map((f) => slotsOfFile(f))));
    const owner = `${process.env.SP_LANE_OWNER || 'test-repro'} ${files.join(' ')} (${process.pid}) ${new Date().toISOString()}\n`;
    release = await takeLanes(lanesDir, names, owner);
    console.log(`lanes: ${names.join(' + ')} in ${lanesDir}`);
  } else console.log(o.lock ? 'lanes: none taken (no --lanes and no SP_LANE_DIR)' : 'lanes: none taken (--no-lock)');
  let released = false;
  const done = () => { if (!released) { released = true; release(); } };
  process.on('exit', done);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { done(); process.exit(130); });
  const quiet = async () => { while (lanesDir && fs.existsSync(path.join(lanesDir, 'perf-quiet'))) await sleep(5000); };
  try { return await fn(quiet); } finally { done(); }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFor = (o, name) => path.resolve(o.out ?? path.join(ROOT, 'test/e2e/out/repro', name, stamp()));
const baseOf = (file) => path.basename(file).replace(/\.(test\.js|mjs|js)$/, '');

/** The budgets of a run, and a line saying which tests have none. */
function budgetOf(o, table, file, names) {
  if (o.budget == null) return null;
  const b = budgets(table, file, names, o.budget, o.budgetFloor * 1000);
  const none = names.filter((n) => !(n in b));
  if (none.length) console.log(`budget: ${none.length} test(s) have no measured time and no budget: ${none.map((n) => n.split(' > ').at(-1).slice(0, 50)).join('; ')}`);
  return b;
}

// ---- modes ------------------------------------------------------------------------------------------------------------

async function casesMode(o, table) {
  let tests;
  try { tests = listTests(o.file); } catch (err) { console.error(err.message); return 2; }
  if (o.list) {
    for (const [i, t] of tests.entries()) console.log(`#${i}${t.skip ? ' (skipped)' : ''} ${fullName(t.path)}`);
    return 0;
  }
  let plan;
  try { plan = buildCases(tests, o); } catch (err) { console.error(err.message); return 2; }
  const outRoot = outFor(o, baseOf(o.file));
  const target = plan.target.path;
  const exp = plan.cases.reduce((s, c) => s + expectedMs(table, o.file, c.paths.map(fullName)).ms, 0) * o.runs;
  console.log(`target #${plan.target.index}: ${fullName(target)}`);
  console.log(`${plan.cases.length} case(s) × ${o.runs} run(s), cpu ${o.cpu > 1 ? `${o.cpu}x throttle` : 'not throttled'}, ${o.ownFlags ? "the file's own Chrome flags" : 'GPU flags added'}; expected about ${secs(exp)} by the measured times; out: ${outRoot}`);
  return withLanes(o, [o.file], async (quiet) => {
    const t0 = Date.now();
    const rows = [];
    const firstArtifacts = [];
    const failures = [];
    let launches = 0;
    let pages = 0;
    let throttled = 0;
    let added = null;
    for (const c of plan.cases) {
      const row = { label: c.label, runs: 0, pass: 0, fail: 0, first: '' };
      const budget = budgetOf(o, table, o.file, c.paths.map(fullName));
      for (let i = 1; i <= o.runs; i++) {
        await quiet();
        const dir = path.join(outRoot, c.id, `run-${i}`);
        const r = runFile(o.file, c.paths, o, dir, budget);
        const res = runResult(r.text, c, target);
        row.runs++;
        for (const h of r.hook.launches) { launches++; added ??= h.added; }
        for (const p of r.hook.pages) { pages++; if (p.throttled) throttled++; }
        for (const f of buildFailures(casesOf(o.file, r.records), { [o.file]: r.hook }, table)) failures.push({ ...f, case: c.label, run: i, dir });
        if (res.ok) row.pass++;
        else {
          row.fail++;
          if (!row.first) {
            row.first = `run ${i}: ${res.error}`;
            const shots = Object.values(r.hook.shots).flat();
            firstArtifacts.push(`${c.label}, run ${i}: ${dir}${shots.length ? ` (${shots.map((s) => path.basename(s)).join(', ')})` : ' (no screenshot)'}; ${r.hook.console ? 'console.txt' : 'no console output'}, spec.txt`);
          }
        }
        console.log(`  ${c.label} run ${i}: ${res.ok ? 'pass' : `FAIL ${res.error}`} (${secs(r.ms)})`);
      }
      rows.push(row);
    }
    const table1 = formatTable(rows);
    const notes = [
      `chrome: ${launches ? `the file's own flags + ${added?.length ? added.join(' ') : (o.ownFlags ? 'nothing (--own-flags)' : 'nothing (it sets the GPU flags itself)')}` : 'no puppeteer-core launch seen (the hook could not reach the browser)'}`,
      `cpu: ${o.cpu > 1 ? (throttled ? `${o.cpu}x on ${throttled} of ${pages} pages` : 'NOT applied: the hook reached no page (the file starts Chrome some other way)') : 'not throttled'}`,
      `time: ${secs(Date.now() - t0)} (expected ${secs(exp)})`,
      ...(firstArtifacts.length ? ['first failures:', ...firstArtifacts.map((a) => `  ${a}`)] : []),
    ];
    console.log(`\n${table1}\n\n${notes.join('\n')}`);
    const failText = writeFailures(outRoot, failures);
    fs.writeFileSync(path.join(outRoot, 'summary.md'), `${o.file}: ${fullName(target)}\n\n${table1}\n\n${notes.join('\n')}\n\n${failText}\n`);
    return rows.some((r) => r.fail) ? 1 : 0;
  });
}

/** After a suite run (tools/browser-suite.mjs): the failure report of its JUnit file and hook records, and the coverage map. */
export function reportFromSuite({ junit, hookDir, out, table, coverage }) {
  const cases = parseJUnit(fs.readFileSync(junit, 'utf8'));
  const hooks = {};
  let merged = 0;
  if (fs.existsSync(hookDir)) {
    for (const d of fs.readdirSync(hookDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = path.join(hookDir, d.name);
      const h = readHookDir(dir);
      if (h.file) hooks[h.file] = h;
      if (coverage && saveCoverage(dir) != null) merged++;
    }
  }
  if (coverage) console.log(`coverage map: ${merged} file(s) recorded (${COVERAGE_DIR})`);
  return writeFailures(out, buildFailures(cases, hooks, table));
}

function reportMode(o, table) {
  const cases = parseJUnit(fs.readFileSync(o.report, 'utf8'));
  const failed = cases.filter((c) => c.status === 'fail').length;
  console.log(`${o.report}: ${cases.length} tests in ${new Set(cases.map((c) => c.file)).size} files, ${failed} failed`);
  // a suite run's hook folder (tools/browser-suite.mjs <out>/hook): exact times, artifacts, and its coverage merged
  reportFromSuite({ junit: o.report, hookDir: o.hook ?? '', out: path.resolve(o.out ?? path.dirname(o.report)), table, coverage: !!o.hook && o.coverage });
  return failed ? 1 : 0;
}

/**
 * The plan of --rerun-failed: per failure, the run alone, and the run after exactly the tests that ran before it.
 * @param {{ file: string, test: string, before: string[] }[]} failures
 */
export function rerunPlan(failures) {
  const seen = new Set();
  return failures.filter((f) => { const k = `${f.file}\u0000${f.test}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((f) => ({ file: f.file, test: f.test, alone: [f.test], after: [...f.before, f.test] }));
}

async function rerunMode(o, table) {
  const { failures = [] } = JSON.parse(fs.readFileSync(o.rerun, 'utf8'));
  const plan = rerunPlan(failures);
  if (!plan.length) { console.log('no failures to rerun'); return 0; }
  const outRoot = outFor(o, 'rerun-failed');
  let worst = 0;
  for (const p of plan) {
    const a = expectedMs(table, p.file, p.alone).ms;
    const b = p.after.length > 1 ? expectedMs(table, p.file, p.after).ms : 0;
    worst += (a + b) * o.runs;
    console.log(`  ${p.file}: ${p.test.split(' > ').at(-1)} — alone ≈ ${secs(a)}${p.after.length > 1 ? `, then after its ${p.after.length - 1} predecessor(s) ≈ ${secs(b)} only if it passes alone` : ''}`);
  }
  console.log(`${plan.length} failed test(s); cost: at most ${secs(worst)} (expected, by the measured times); out: ${outRoot}`);
  return withLanes(o, [...new Set(plan.map((p) => p.file))], async (quiet) => {
    const t0 = Date.now();
    const rows = [];
    const all = [];
    let bad = false;
    for (const [k, p] of plan.entries()) {
      let tests;
      try { tests = listTests(p.file); } catch (err) { rows.push({ label: p.test, runs: 0, pass: 0, fail: 0, first: err.message }); bad = true; continue; }
      const byName = new Map(tests.map((t) => [fullName(t.path), t.path]));
      const missing = p.after.filter((n) => !byName.has(n));
      if (missing.length) { rows.push({ label: p.test.split(' > ').at(-1), runs: 0, pass: 0, fail: 0, first: `not in the file any more: ${missing.map((n) => n.split(' > ').at(-1)).join('; ')}` }); bad = true; continue; }
      const verdict = { label: p.test.split(' > ').at(-1), runs: 0, pass: 0, fail: 0, first: '' };
      const target = byName.get(p.test);
      const one = async (names, tag) => {
        let ok = 0;
        for (let i = 1; i <= o.runs; i++) {
          await quiet();
          const dir = path.join(outRoot, `${k + 1}-${tag}`, `run-${i}`);
          const paths = names.map((n) => byName.get(n));
          const r = runFile(p.file, paths, o, dir, budgetOf(o, table, p.file, names));
          const res = runResult(r.text, { paths }, target);
          for (const f of buildFailures(casesOf(p.file, r.records), { [p.file]: r.hook }, table)) all.push({ ...f, case: tag, run: i, dir });
          console.log(`  ${verdict.label} ${tag} run ${i}: ${res.ok ? 'pass' : `FAIL ${res.error}`} (${secs(r.ms)})`);
          verdict.runs++;
          if (res.ok) { ok++; verdict.pass++; } else { verdict.fail++; verdict.first ||= `${tag}: ${res.error}`; }
        }
        return ok === o.runs;
      };
      const alone = await one(p.alone, 'alone');
      if (!alone) { verdict.label += ' — fails alone'; bad = true; } else if (p.after.length === 1) verdict.label += ' — passes alone (it ran first in the file: load or timing)';
      else {
        const after = await one(p.after, 'after-predecessors');
        verdict.label += after ? ' — passes alone and after its predecessors: not reproduced (load or timing? try --cpu 4)' : ' — depends on earlier tests (passes alone, fails after them)';
        if (!after) bad = true;
      }
      rows.push(verdict);
    }
    console.log(`\n${formatTable(rows)}\ntime: ${secs(Date.now() - t0)} (at most ${secs(worst)} expected)`);
    writeFailures(outRoot, all);
    return bad ? 1 : 0;
  });
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gitTry = (args) => { try { return git(args); } catch { return null; } };

/**
 * The selection of a change: per candidate test file, the tests to run (with reasons) or the whole file (with the
 * reason), the files with no coverage record, and the changed files nothing maps.
 */
export function planChanged({ diff, candidates, coverageOf, testsOf, sources, readFile }) {
  const ignored = [];
  const unmapped = [];
  const changes = [];
  for (const d of diff) {
    const f = d.file;
    if (/\.(md|txt)$/i.test(f) || /^(docs|\.github|\.claude)\//.test(f) || /^(LICENSE|NOTICE)/.test(f)) { ignored.push(f); continue; }
    if (!MAPPED(f)) { unmapped.push(f); continue; }
    changes.push({ file: f, hunks: d.hunks, ...sources(f) });
  }
  const files = [];
  const appChanged = changes.some((c) => !c.file.startsWith('test/') && !c.file.startsWith('plugins/'));
  const helpers = changes.filter((c) => /^test\//.test(c.file) && !isTestFile(c.file)).map((c) => c.file);
  const changedTests = changes.filter((c) => isTestFile(c.file)).map((c) => c.file);
  const set = candidates.length ? candidates : changedTests;
  for (const file of [...new Set([...set, ...changedTests.filter((f) => set.includes(f) || !candidates.length)])]) {
    if (unmapped.length) { files.push({ file, whole: true, reasons: [`not mapped to tests: ${unmapped.join(', ')} (harness, data or settings)`], tests: [] }); continue; }
    const cov = coverageOf(file);
    const own = changedTests.includes(file);
    if (!cov && !own) {
      const text = readFile(file) ?? '';
      const imports = helpers.filter((h) => text.includes(path.posix.basename(h)));
      if (appChanged || imports.length) files.push({ file, whole: true, unknown: true, reasons: [`no coverage recorded yet${appChanged ? ' and app code changed' : ` and it imports ${imports.join(', ')}`}`], tests: [] });
      continue;
    }
    const tests = testsOf(file);
    const sel = selectInFile({ testFile: file, tests, coverage: cov, changes });
    if (sel.all) { files.push({ file, whole: true, reasons: sel.reasons, tests: [] }); continue; }
    const order = tests.map((t) => fullName(t.path));
    const picked = [...sel.tests.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (picked.length || sel.reasons.length) files.push({ file, whole: false, tests: picked.map((n) => ({ name: n, why: sel.tests.get(n) })), reasons: sel.reasons });
  }
  return { files, ignored, unmapped };
}

async function changedMode(o, table) {
  const range = o.changed;
  const [oldRef, newRef] = range.includes('..') ? range.split(/\.\.\.?/) : [range, null];
  const diffText = git(['diff', '-U0', '--no-color', '--no-renames', ...(newRef ? [`${oldRef}..${newRef}`] : [oldRef]), '--']);
  const diff = parseDiff(diffText);
  const all = browserFileList();
  const candidates = o.files.length ? o.files : all;
  for (const f of o.files) if (!fs.existsSync(path.join(ROOT, f))) { console.error(`no such file: ${f}`); return 2; }
  const listCache = new Map();
  const testsOf = (f) => { if (!listCache.has(f)) { try { listCache.set(f, listTests(f)); } catch { listCache.set(f, []); } } return listCache.get(f); };
  const srcCache = new Map();
  const sources = (f) => {
    if (!srcCache.has(f)) {
      const oldText = gitTry(['show', `${oldRef}:${f}`]);
      const newText = newRef ? gitTry(['show', `${newRef}:${f}`]) : (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : null);
      const oldSha = gitTry(['rev-parse', `${oldRef}:${f}`])?.trim() ?? null;
      srcCache.set(f, { oldText, newText, oldSha });
    }
    return srcCache.get(f);
  };
  const readFile = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return null; } };
  const plan = planChanged({ diff, candidates, coverageOf: loadCoverage, testsOf, sources, readFile });
  console.log(`--changed ${range}: ${diff.length} changed file(s): ${diff.map((d) => d.file).join(', ') || 'none'}`);
  if (plan.ignored.length) console.log(`  not code (no test runs it): ${plan.ignored.join(', ')}`);
  if (plan.unmapped.length) {
    console.log(`a change to ${plan.unmapped.join(', ')} (harness, data or settings) can affect every test: nothing started. Run the suite (npm run test:browser) or name the files to run.`);
    return 2;
  }
  let expect = 0;
  const runs = [];
  const lines = [];
  let unknownMs = 0;
  for (const f of plan.files) {
    if (f.whole) {
      const e = expectedMs(table, f.file, null).ms;
      expect += e;
      runs.push({ file: f.file, names: null });
      const line = `  ${f.file}: WHOLE FILE (≈ ${secs(e)}) — ${f.reasons.join('; ')}`;
      lines.push(line);
      if (f.unknown) unknownMs += e; else console.log(line);
    } else if (f.tests.length) {
      const e = expectedMs(table, f.file, f.tests.map((t) => t.name)).ms;
      expect += e;
      runs.push({ file: f.file, names: f.tests.map((t) => t.name) });
      const say = (l) => { lines.push(l); console.log(l); };
      say(`  ${f.file}: ${f.tests.length} of ${testsOf(f.file).length} test(s) (≈ ${secs(e)})`);
      for (const t of f.tests) say(`    ${t.name.split(' > ').at(-1)} — ${t.why[0]}${t.why.length > 1 ? ` (+${t.why.length - 1} more)` : ''}`);
      for (const r of f.reasons) say(`    note: ${r}`);
    } else { const l = `  ${f.file}: nothing to run — ${f.reasons.join('; ')}`; lines.push(l); console.log(l); }
  }
  const unknown = plan.files.filter((f) => f.unknown);
  if (unknown.length) {
    console.log(`  ${unknown.length} file(s) have no coverage record yet and run whole (≈ ${secs(unknownMs)}): ${unknown.slice(0, 4).map((f) => f.file).join(', ')}${unknown.length > 4 ? ', …' : ''}`);
    console.log('  (run them once — npm run test:browser, or test-repro — to record which code each test uses)');
  }
  const covered = candidates.filter((f) => loadCoverage(f)).length;
  console.log(`selection: ${runs.length} run(s), expected about ${secs(expect)} (coverage recorded for ${covered} of ${candidates.length} candidate file(s))`);
  const outRoot = outFor(o, 'changed');
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'plan.txt'), `--changed ${range}\n${lines.join('\n')}\n`);
  console.log(`the whole plan: ${path.join(outRoot, 'plan.txt')}`);
  if (o.dryRun || !runs.length) return 0;
  // a long selection is the user's call (more than 15 minutes needs a go-ahead): say so instead of starting it
  if (expect > 15 * 60 * 1000 && !o.yes) { console.log(`expected over 15 minutes (${secs(expect)}): nothing started. Add --yes to run it, or name fewer files.`); return 2; }
  return withLanes(o, runs.map((r) => r.file), async (quiet) => {
    const t0 = Date.now();
    const failures = [];
    for (const r of runs) {
      await quiet();
      const tests = testsOf(r.file);
      const byName = new Map(tests.map((t) => [fullName(t.path), t.path]));
      const names = r.names ? r.names.filter((n) => byName.has(n)) : tests.filter((t) => !t.skip).map((t) => fullName(t.path));
      const dir = path.join(outRoot, baseOf(r.file));
      const res = runFile(r.file, r.names ? names.map((n) => byName.get(n)) : null, o, dir, budgetOf(o, table, r.file, names));
      const fails = buildFailures(casesOf(r.file, res.records), { [r.file]: res.hook }, table);
      failures.push(...fails);
      const ran = res.records.filter((x) => !x.skip).length;
      console.log(`  ${r.file}: ${ran} ran, ${fails.length} failed (${secs(res.ms)})${ran ? '' : ' — tests 0: is CHROME_PATH set?'}`);
    }
    console.log(`time: ${secs(Date.now() - t0)} (expected ${secs(expect)})`);
    writeFailures(outRoot, failures);
    return failures.length ? 1 : 0;
  });
}

async function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (err) { console.error(`${err.message}\n${USAGE}`); return 2; }
  if (o.file && !fs.existsSync(path.join(ROOT, o.file))) { console.error(`no such file: ${o.file}`); return 2; }
  const table = loadTable();
  if (o.mode === 'report') return reportMode(o, table);
  if (o.mode === 'rerun') return rerunMode(o, table);
  if (o.mode === 'changed') return changedMode(o, table);
  return casesMode(o, table);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
