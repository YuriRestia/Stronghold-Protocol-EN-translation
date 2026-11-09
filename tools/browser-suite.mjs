#!/usr/bin/env node
// tools/browser-suite.mjs — (fork) the browser test suite: every file that starts Chrome, in one run, slowest first.
//
//   node tools/browser-suite.mjs --list               the files, in run order (one per line), and run nothing
//   node tools/browser-suite.mjs --list --gate        the same for the fixers' gate: a short smoke set
//   node tools/browser-suite.mjs [--gate] [--concurrency N] [--out DIR] [file …]
//                                                     run them: SP_E2E=1 … node --test, spec + TAP + JUnit into DIR
//   node tools/browser-suite.mjs --weigh report.xml … re-weigh tools/browser-suite.json from JUnit reports of a run
//   node tools/browser-suite.mjs --slots file …      the lane slots those files take on a shared machine (one each,
//                                                     two for a heavy one: a real server, or two players' browsers)
//
// Which files: the naming rule below (*.browser.test.js, *.e2e.test.js, *.e2e.mjs and test/render/browser.test.js),
// the same files `npm test` loads and skips without these variables. The order: the measured times of
// tools/browser-suite.json, slowest first. `node --test` starts the files in the order given, so a 10-minute file that
// started last would end the run alone; slowest first leaves only short files for the end. Files passed after the
// options are added to the run (a gate plus the files a fix touched).
//
// The speed bars of the browser files (fps floors, per-frame JS budgets) are not checked here: side by side, Chrome's
// frame rate follows the machine's load. `npm run test:perf` checks them alone (BROWSER_PERF_FILES).
//
// Locks and the perf-quiet flag belong to whoever starts the run (the crew's scripts); this tool only runs the files.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { perFileMsOf } from './test-timings.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The weights and the gate. */
export const TABLE = 'tools/browser-suite.json';

/** What a browser test file is called. */
export const BROWSER_FILE_GLOBS = ['test/**/*.browser.test.js', 'test/**/*.e2e.test.js', 'test/**/*.e2e.mjs', 'test/render/browser.test.js'];

/** The browser files whose speed bars only `npm run test:perf` checks, alone (tools/test-perf.mjs). */
export const BROWSER_PERF_FILES = [
  'test/render/board3d.browser.test.js',
  'test/render/browser.test.js',
  'test/render/fieldview.browser.test.js',
];

/** The variables that switch the browser files on (each family has its own). */
export const BROWSER_ENV = { SP_E2E: '1', SP_REAL_E2E: '1', RENDER_E2E: '1', SIM_E2E: '1', SP_P2P_E2E: '1' };

/**
 * The lane slots one browser file takes when several runs share the machine: 2 for a heavy file (it starts a real
 * server process, `startRealServer`, or drives two players' browsers at once, two `new Client(`), else 1.
 * @param {string} source the file's text
 */
export function slotsFor(source) {
  return /\bstartRealServer\(/.test(source) || (source.match(/\bnew Client\(/g) || []).length >= 2 ? 2 : 1;
}

/** The browser test files, sorted. @param {string} [root] @returns {string[]} */
export function browserFileList(root = ROOT) {
  const out = new Set();
  for (const g of BROWSER_FILE_GLOBS) {
    for (const f of fs.globSync(g, { cwd: root, exclude: (p) => path.basename(String(p?.name ?? p)) === 'node_modules' })) out.add(f.split(path.sep).join('/'));
  }
  return [...out].sort();
}

/**
 * tools/browser-suite.json: the weight of a file nobody timed, the lanes a full run uses, the gate's files and the
 * measured times (ms).
 * @param {string} [root]
 * @returns {{ defaultMs: number, concurrency: number, gate: string[], measured: Record<string, number> }}
 */
export function loadTable(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, TABLE), 'utf8'));
}

/**
 * The run order: slowest first by the table (an untimed file weighs defaultMs), then by name, so the order is stable.
 * @param {string[]} files @param {{ defaultMs: number, measured: Record<string, number> }} table
 */
export function runOrder(files, table) {
  const ms = (f) => table.measured[f] ?? table.defaultMs;
  return [...new Set(files)].sort((a, b) => ms(b) - ms(a) || (a < b ? -1 : 1));
}

/**
 * The files of one run: the whole list, or the gate, plus the files named on the command line (each must be a browser
 * test file: a typo would otherwise run nothing and look green).
 * @param {{ gate?: boolean, extra?: string[] }} opts @param {string[]} all @param {{ gate: string[] }} table
 */
export function selectFiles({ gate = false, extra = [] }, all, table) {
  const known = new Set(all);
  const norm = extra.map((f) => f.split('\\').join('/').replace(/^\.\//, ''));
  const unknown = [...norm, ...(gate ? table.gate : [])].filter((f) => !known.has(f));
  if (unknown.length) throw new Error(`not a browser test file: ${unknown.join(', ')}`);
  return gate || norm.length ? [...new Set([...(gate ? table.gate : []), ...norm])] : all;
}

/**
 * The `node` arguments of a run.
 * @param {string[]} files @param {{ concurrency: number, out: string }} o
 */
export function runArgs(files, { concurrency, out }) {
  return [
    '--test', `--test-concurrency=${concurrency}`,
    '--test-reporter=spec', `--test-reporter-destination=${path.join(out, 'browser-spec.txt')}`,
    '--test-reporter=tap', `--test-reporter-destination=${path.join(out, 'browser-tap.txt')}`,
    '--test-reporter=junit', `--test-reporter-destination=${path.join(out, 'browser-junit.xml')}`,
    ...files,
  ];
}

/**
 * The table with new measured times: files a report timed take its value (the median of several reports), the others
 * keep theirs, and files that no longer exist are dropped.
 * @param {{ measured: Record<string, number> }} table @param {Record<string, number>} timed @param {string[]} all
 */
export function reweigh(table, timed, all) {
  const known = new Set(all);
  const measured = {};
  for (const f of [...new Set([...Object.keys(table.measured), ...Object.keys(timed)])].sort()) {
    if (!known.has(f)) continue;
    measured[f] = timed[f] ?? table.measured[f];
  }
  return { ...table, measured };
}

const usage = `usage: node tools/browser-suite.mjs [--list] [--gate] [--concurrency N] [--out DIR] [file …]
       node tools/browser-suite.mjs --slots <file…>
       node tools/browser-suite.mjs --weigh <report.xml…>`;

function main(argv) {
  const o = { list: false, slots: false, gate: false, concurrency: 0, out: path.join(ROOT, 'test/e2e/out/browser-suite'), extra: [], weigh: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') o.list = true;
    else if (a === '--slots') o.slots = true;
    else if (a === '--gate') o.gate = true;
    else if (a === '--concurrency') o.concurrency = Number(argv[++i]);
    else if (a === '--out') o.out = path.resolve(argv[++i] ?? '');
    else if (a === '--weigh') o.weigh = argv.slice(i + 1);
    else if (a.startsWith('-')) { console.error(usage); return 2; }
    else o.extra.push(a);
    if (o.weigh) break;
  }
  const table = loadTable();
  const all = browserFileList();
  if (o.weigh) {
    if (!o.weigh.length) { console.error(usage); return 2; }
    const timed = perFileMsOf(o.weigh.map((f) => fs.readFileSync(f, 'utf8')));
    fs.writeFileSync(path.join(ROOT, TABLE), `${JSON.stringify(reweigh(table, timed, all), null, 2)}\n`);
    console.log(`${TABLE}: ${Object.keys(timed).length} files re-weighed`);
    return 0;
  }
  let files;
  try { files = runOrder(selectFiles(o, all, table), table); } catch (err) { console.error(err.message); return 2; }
  if (o.list) { for (const f of files) console.log(f); return 0; }
  if (o.slots) {
    if (!o.extra.length) { console.error(usage); return 2; }
    console.log(files.reduce((s, f) => s + slotsFor(fs.readFileSync(path.join(ROOT, f), 'utf8')), 0));
    return 0;
  }
  const concurrency = Number.isInteger(o.concurrency) && o.concurrency > 0 ? o.concurrency : table.concurrency;
  // an empty list would make `node --test` run every test file it finds: never start one
  if (!files.length) { console.error('no browser test files: nothing started'); return 1; }
  const minutes = files.reduce((s, f) => s + (table.measured[f] ?? table.defaultMs), 0) / 60000 / concurrency;
  console.log(`${files.length} files, ${concurrency} at a time (about ${Math.ceil(minutes)} min by the table), first: ${files[0]}`);
  fs.mkdirSync(o.out, { recursive: true });
  const r = spawnSync(process.execPath, runArgs(files, { concurrency, out: o.out }), { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...BROWSER_ENV } });
  console.log(`reports: ${o.out} (browser-spec.txt, browser-tap.txt, browser-junit.xml)`);
  return r.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
