#!/usr/bin/env node
// tools/test-repro.mjs — (fork) reproduce one failing browser test in a minute or two instead of a whole-file run: the
// test alone, then right after each test that may leave state behind, in the same file process, N times each.
//
//   node tools/test-repro.mjs <file> --list               the file's tests in file order (index, skipped or not)
//   node tools/test-repro.mjs <file> --test "<pattern>" [--runs N] [--before "<pattern>"]… [--orders] [--cpu 4]
//                                    [--own-flags] [--out DIR] [--lanes DIR | --no-lock]
//
//   --test     a regular expression naming exactly one test (matched like --test-name-pattern: the test's own name, or
//              its suites' and its names joined by spaces)
//   --runs     runs per case (default 5); each run is a fresh `node --test` of the file
//   --before   a case per matching test that comes before the target in the file: that test, then the target
//   --orders   a case per test that comes before the target in the file
//   --cpu      Chrome CPU throttling rate on every page the file opens (4 = four times slower), to imitate load
//   --own-flags  Chrome with the file's own flags only (no added GPU flags), as `npm run test:browser` starts it
//   --lanes    the folder of the lane locks (default $SP_LANE_DIR); the run takes fix-browser-3.lock (and
//              fix-browser-2.lock for a two-slot file, see tools/browser-suite.mjs --slots) and waits while perf-quiet
//              exists there
//
// How a case runs: `node --test` with a --test-name-pattern anchored on the case's full test names, so node runs just
// those tests, in the file's order, with the file's own before / after hooks, server and browser: the same sequence a
// whole-file run gives them, minus the tests in between. A suite name in the pattern would pull in all its tests; the
// anchors never match one. Chrome: the file's own flags plus the GPU flags of tools/perfbench.mjs gpuArgs() it did not
// set (D3D11 on Windows, muted), through tools/test-repro-hook.mjs, which also applies --cpu, logs every page's console
// and screenshots the target test's pages when it fails. Per run: <out>/<case>/run-N/ (spec.txt, report.jsonl,
// console.txt, shot-N.png). Exit code 1 when any run of any case failed, 2 on a usage error.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, BROWSER_ENV, slotsOfFile } from './browser-suite.mjs';

const HOOK = path.join(ROOT, 'tools/test-repro-hook.mjs');
const LANES = ['fix-browser-3.lock', 'fix-browser-2.lock', 'fix-browser.lock'];

export const USAGE = `usage: node tools/test-repro.mjs <file> --list
       node tools/test-repro.mjs <file> --test "<pattern>" [--runs N] [--before "<pattern>"]… [--orders] [--cpu RATE]
                                        [--own-flags] [--out DIR] [--lanes DIR | --no-lock]`;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const o = { file: null, test: null, runs: 5, before: [], orders: false, cpu: 1, out: null, list: false, lanes: undefined, lock: true, ownFlags: false };
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
    else if (a === '--no-lock') o.lock = false;
    else if (a === '--orders') o.orders = true;
    else if (a === '--own-flags') o.ownFlags = true;
    else if (a === '--list') o.list = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (o.file) throw new Error(`one file only (got ${o.file} and ${a})`);
    else o.file = a.split('\\').join('/').replace(/^\.\//, '');
  }
  if (!o.file) throw new Error('no test file');
  if (!o.list && !o.test) throw new Error('--test "<pattern>" is required (or --list)');
  if (!Number.isInteger(o.runs) || o.runs < 1 || o.runs > 100) throw new Error('--runs: a whole number from 1 to 100');
  if (!Number.isFinite(o.cpu) || o.cpu < 1 || o.cpu > 20) throw new Error('--cpu: a rate from 1 (none) to 20');
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

/**
 * One run's outcome from the reporter's JSON lines.
 * @param {string} text report.jsonl @param {{ paths: string[][] }} c @param {string[]} target
 * @returns {{ ok: boolean, error: string | null }}
 */
export function runResult(text, c, target) {
  const recs = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const mine = recs.find((r) => same(r.path, target));
  const otherFail = recs.find((r) => !r.ok && !same(r.path, target));
  if (!mine) return { ok: false, error: `the target did not run${otherFail ? ` (${otherFail.path.at(-1)}: ${otherFail.error})` : ''}` };
  if (mine.skip) return { ok: false, error: 'the target was skipped: is CHROME_PATH set and the file\'s switch on?' };
  const before = c.paths.filter((p) => !same(p, target));
  const missing = before.filter((p) => !recs.some((r) => same(r.path, p) && !r.skip));
  if (missing.length) return { ok: false, error: `the test before it did not run: ${missing.map((p) => p.at(-1)).join(', ')}` };
  if (mine.ok) return { ok: true, error: null };
  const note = otherFail ? ` (the test before it failed too: ${otherFail.error})` : '';
  return { ok: false, error: `${mine.error || 'failed'}${note}` };
}

/** The result table (markdown). @param {{ label: string, runs: number, pass: number, fail: number, first: string }[]} rows */
export function formatTable(rows) {
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  return [
    '| case | runs | pass | fail | first failure |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${cell(r.label)} | ${r.runs} | ${r.pass} | ${r.fail} | ${cell(r.first || '')} |`),
  ].join('\n');
}

/** The lane lock names a file of `slots` slots takes (the light slot first). */
export const laneLocks = (slots) => LANES.slice(0, Math.max(1, Math.min(slots, LANES.length)));

// ---- running ----------------------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hookEnv = () => ({ NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(HOOK).href}`.trim() });

/** The file's tests in file order (node:test swapped for recorders: nothing runs). */
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

function runOnce(file, c, target, o, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const report = path.join(dir, 'report.jsonl');
  const args = [
    '--test', '--test-concurrency=1', `--test-name-pattern=${namePattern(c.paths)}`,
    `--test-reporter=${pathToFileURL(HOOK).href}`, `--test-reporter-destination=${report}`,
    '--test-reporter=spec', `--test-reporter-destination=${path.join(dir, 'spec.txt')}`,
    file,
  ];
  const t0 = Date.now();
  spawnSync(process.execPath, args, {
    cwd: ROOT, stdio: 'ignore',
    env: {
      ...process.env, ...BROWSER_ENV, ...hookEnv(), NO_COLOR: '1',
      SP_REPRO_MODE: 'run', SP_REPRO_FILE: path.join(ROOT, file), SP_REPRO_TARGET: fullName(target), SP_REPRO_CPU: String(o.cpu), SP_REPRO_DIR: dir,
      SP_REPRO_GPU: o.ownFlags ? '0' : '1',
    },
  });
  const res = runResult(fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '', c, target);
  const hook = fs.existsSync(path.join(dir, 'hook.jsonl'))
    ? fs.readFileSync(path.join(dir, 'hook.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { ...res, s: Math.round((Date.now() - t0) / 1000), hook };
}

async function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (err) { console.error(`${err.message}\n${USAGE}`); return 2; }
  if (!fs.existsSync(path.join(ROOT, o.file))) { console.error(`no such file: ${o.file}`); return 2; }
  let tests;
  try { tests = listTests(o.file); } catch (err) { console.error(err.message); return 2; }
  if (o.list) {
    for (const [i, t] of tests.entries()) console.log(`#${i}${t.skip ? ' (skipped)' : ''} ${fullName(t.path)}`);
    return 0;
  }
  let plan;
  try { plan = buildCases(tests, o); } catch (err) { console.error(err.message); return 2; }
  const outRoot = path.resolve(o.out ?? path.join(ROOT, 'test/e2e/out/repro', path.basename(o.file).replace(/\.(test\.js|mjs|js)$/, ''),
    new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)));
  const lanesDir = o.lanes ?? process.env.SP_LANE_DIR;
  let release = () => {};
  if (o.lock && lanesDir) {
    const names = laneLocks(slotsOfFile(o.file));
    const owner = `${process.env.SP_LANE_OWNER || 'test-repro'} ${o.file} (${process.pid}) ${new Date().toISOString()}\n`;
    release = await takeLanes(lanesDir, names, owner);
    console.log(`lanes: ${names.join(' + ')} in ${lanesDir}`);
  } else console.log(o.lock ? 'lanes: none taken (no --lanes and no SP_LANE_DIR)' : 'lanes: none taken (--no-lock)');
  let released = false;
  const done = () => { if (!released) { released = true; release(); } };
  process.on('exit', done);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { done(); process.exit(130); });

  console.log(`target #${plan.target.index}: ${fullName(plan.target.path)}`);
  console.log(`${plan.cases.length} case(s) × ${o.runs} run(s), cpu ${o.cpu > 1 ? `${o.cpu}x throttle` : 'not throttled'}, ${o.ownFlags ? "the file's own Chrome flags" : 'GPU flags added'}; out: ${outRoot}`);
  const rows = [];
  const firstArtifacts = [];
  let launches = 0;
  let pages = 0;
  let throttled = 0;
  let added = null;
  for (const c of plan.cases) {
    const row = { label: c.label, runs: 0, pass: 0, fail: 0, first: '' };
    for (let i = 1; i <= o.runs; i++) {
      while (lanesDir && fs.existsSync(path.join(lanesDir, 'perf-quiet'))) await sleep(5000);
      const dir = path.join(outRoot, c.id, `run-${i}`);
      const r = runOnce(o.file, c, plan.target.path, o, dir);
      row.runs++;
      for (const h of r.hook) {
        if (h.launch) { launches++; added ??= h.added; }
        if (h.page) { pages++; if (h.throttled) throttled++; }
      }
      if (r.ok) row.pass++;
      else {
        row.fail++;
        if (!row.first) {
          row.first = `run ${i}: ${r.error}`;
          const shots = r.hook.flatMap((h) => h.shots ?? []);
          firstArtifacts.push(`${c.label}, run ${i}: ${dir}${shots.length ? ` (${shots.map((s) => path.basename(s)).join(', ')})` : ' (no screenshot)'}; ${fs.existsSync(path.join(dir, 'console.txt')) ? 'console.txt' : 'no console output'}, spec.txt`);
        }
      }
      console.log(`  ${c.label} run ${i}: ${r.ok ? 'pass' : `FAIL ${r.error}`} (${r.s} s)`);
    }
    rows.push(row);
  }
  done();
  const table = formatTable(rows);
  const notes = [
    `chrome: ${launches ? `the file's own flags + ${added?.length ? added.join(' ') : (o.ownFlags ? 'nothing (--own-flags)' : 'nothing (it sets the GPU flags itself)')}` : 'no puppeteer-core launch seen (the hook could not reach the browser)'}`,
    `cpu: ${o.cpu > 1 ? (throttled ? `${o.cpu}x on ${throttled} of ${pages} pages` : 'NOT applied: the hook reached no page (the file starts Chrome some other way)') : 'not throttled'}`,
    ...(firstArtifacts.length ? ['first failures:', ...firstArtifacts.map((a) => `  ${a}`)] : []),
  ];
  console.log(`\n${table}\n\n${notes.join('\n')}`);
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'summary.md'), `${o.file}: ${fullName(plan.target.path)}\n\n${table}\n\n${notes.join('\n')}\n`);
  return rows.some((r) => r.fail) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
