#!/usr/bin/env node
// tools/test-tier.mjs — the test step of .github/workflows/ci.yml (GitHub #43): the files of `npm test` (TEST_FILES), all
// of them or a quick tier, whole or one shard of them.
//
//   node tools/test-tier.mjs                  every test file (what `npm test` runs)
//   node tools/test-tier.mjs --quick          without the slow files (SLOW_TEST_FILES): ci.yml job `quick`, the check of
//                                             pull requests into a branch other than main (mini/*, a stack)
//   node tools/test-tier.mjs --shard 2/3      the 2nd third of the files (ci.yml job `test`: the full suite on 3
//                                             runners per OS × Node pair)
//   npm run test:quick                        the same as --quick
//
// Node's test runner (`run()`, one child process per file as with `node --test`) gets the file list itself, so no
// command line carries ~900 paths (Windows caps one at 32 767 characters), and --shard can't land behind the globs,
// where `node --test` ignores it (so `npm test -- --test-shard=1/3` would run every file).
// Shards: Node's own split, file i of the sorted list to shard (i mod n) + 1. With n = 3 the four full-match files land
// on three shards and the slowest shard carries ~1.15× the mean (measured 2026-10-22).
// --quick warns (a GitHub annotation on a runner; it never fails the run) about a file outside SLOW_TEST_FILES whose
// tests took over SLOW_WARN_SECONDS, so the list keeps up with new slow tests.

import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { spec, tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
import { ROOT, TEST_FILES } from './ci.mjs';

/**
 * The test files the quick tier leaves out: those that took 10 s or more on their own (909 files timed one by one,
 * six at a time, on 2026-10-22: these 55 took ~75 % of the suite's time, the four full-match files a quarter of it).
 * The full tier still runs them before anything reaches main. test/ci.test.js checks that each one exists.
 */
export const SLOW_TEST_FILES = [
  'test/golden.test.js',
  'test/i18n-packs.test.js',
  'test/lobby-plugins.test.js',
  'test/lobby.test.js',
  'test/match/bosshp.test.js',
  'test/match/bot-smarter.test.js',
  'test/match/bot.test.js',
  'test/match/clientCombat-review.test.js',
  'test/match/clientCombat.test.js',
  'test/match/dsl-host.test.js',
  'test/match/fullmatch-coop.test.js',
  'test/match/fullmatch-coop2.test.js',
  'test/match/fullmatch-coop3.test.js',
  'test/match/fullmatch.test.js',
  'test/match/fuzz.test.js',
  'test/match/playtest6-bosspool.test.js',
  'test/match/plugin-host.test.js',
  'test/match/realtime.test.js',
  'test/match/rehearsal-delegate.test.js',
  'test/match/sim-host.test.js',
  'test/official-tables.test.js',
  'test/plugin-package.test.js',
  'test/plugins/boss-centre.test.js',
  'test/plugins/check-status.test.js',
  'test/plugins/contentBattle.test.js',
  'test/plugins/contentSet.test.js',
  'test/plugins/dsl-data.test.js',
  'test/plugins/forgeImport.test.js',
  'test/plugins/gameplay-records.test.js',
  'test/plugins/loopCaps.test.js',
  'test/plugins/offers-pilot.test.js',
  'test/plugins/operator-traits.test.js',
  'test/plugins/records.test.js',
  'test/plugins/registry.test.js',
  'test/plugins/rules.test.js',
  'test/plugins/sandbox-host.test.js',
  'test/plugins/script-integration.test.js',
  'test/plugins/script-review.test.js',
  'test/plugins/script-sandbox-integration.test.js',
  'test/plugins/theme-notices.test.js',
  'test/render/cosmetic-refresh.test.js',
  'test/render/impostor-fork-models.test.js',
  'test/sim/facing-invariance.test.js',
  'test/sim/feedback1e-healers.test.js',
  'test/sim/fuzz.test.js',
  'test/studio/catalog.test.js',
  'test/studio/gameplay-review.test.js',
  'test/studio/gameplay-templates.test.js',
  'test/studio/gameplay.test.js',
  'test/studio/presentation.test.js',
  'test/studio/presentationReview.test.js',
  'test/studio/presentationRework.test.js',
  'test/studio/presentationThirdReview.test.js',
  'test/studio/review.test.js',
  'test/studio/trial.test.js',
];

/** --quick: a file outside SLOW_TEST_FILES whose tests took longer than this gets a warning. */
export const SLOW_WARN_SECONDS = 20;

/**
 * @param {string[]} argv
 * @returns {{ quick: boolean, shard: { index: number, total: number } | null, help: boolean }}
 */
export function parseArgs(argv) {
  const o = { quick: false, shard: /** @type {{ index: number, total: number } | null} */ (null), help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quick') o.quick = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--shard' || a.startsWith('--shard=')) {
      const v = a === '--shard' ? argv[++i] : a.slice('--shard='.length);
      const m = /^(\d+)\/(\d+)$/.exec(v || '');
      const index = m ? Number(m[1]) : 0;
      const total = m ? Number(m[2]) : 0;
      if (!(total >= 1 && index >= 1 && index <= total)) throw new Error(`--shard needs k/n with 1 ≤ k ≤ n (got ${v ?? 'nothing'})`);
      o.shard = { index, total };
    } else throw new Error(`unknown option ${a} (node tools/test-tier.mjs --help)`);
  }
  return o;
}

/** The test files, sorted, '/'-separated, relative to ROOT: TEST_FILES expanded (node_modules left out, as --test does). */
export function testFiles(root = ROOT) {
  return fs.globSync(TEST_FILES, { cwd: root, exclude: (p) => path.basename(String(p?.name ?? p)) === 'node_modules' })
    .map((f) => f.split(path.sep).join('/')).sort();
}

/** The files of a run: all, or without SLOW_TEST_FILES (--quick). @param {string[]} files @param {boolean} quick */
export function selectFiles(files, quick) {
  if (!quick) return files.slice();
  const slow = new Set(SLOW_TEST_FILES);
  return files.filter((f) => !slow.has(f));
}

/**
 * --quick: the files outside SLOW_TEST_FILES whose top-level tests took over SLOW_WARN_SECONDS in all.
 * @param {Map<string, number>} msByFile @returns {{ file: string, s: number }[]}
 */
export function slowUnlisted(msByFile) {
  const slow = new Set(SLOW_TEST_FILES);
  return [...msByFile].filter(([f, ms]) => !slow.has(f) && ms > SLOW_WARN_SECONDS * 1000)
    .map(([file, ms]) => ({ file, s: Math.round(ms / 1000) })).sort((a, b) => b.s - a.s);
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); return 2; }
  if (opts.help) {
    console.log('node tools/test-tier.mjs [--quick] [--shard k/n]  — the test files of npm test, a quick tier, one shard');
    return 0;
  }
  const files = selectFiles(testFiles(), opts.quick);
  let failed = false;
  /** @type {Map<string, number>} top-level test time per file (ROOT-relative) */
  const msByFile = new Map();
  const stream = run({
    files: files.map((f) => path.join(ROOT, f)), concurrency: true, cwd: ROOT,
    ...(opts.shard ? { shard: opts.shard } : {}),
  });
  stream.on('test:fail', (d) => {
    if (d.todo) return;
    failed = true;
    // on a runner, each failed test (not a parent failing for its subtests) as an annotation: the API serves those,
    // where the job log may not be reachable
    if (process.env.GITHUB_ACTIONS && d.details?.error?.failureType !== 'subtestsFailed') console.log(failAnnotation(d));
  });
  stream.on('test:pass', (d) => {
    if (d.nesting !== 0 || !d.file) return;
    const f = path.relative(ROOT, d.file).split(path.sep).join('/');
    msByFile.set(f, (msByFile.get(f) || 0) + (d.details?.duration_ms || 0));
  });
  // the reporter `node --test` picks: spec on a terminal, TAP otherwise (a CI log)
  const out = process.stdout.isTTY ? stream.compose(new spec()) : stream.compose(tap);
  await new Promise((resolve, reject) => { out.pipe(process.stdout, { end: false }); out.on('end', resolve); out.on('error', reject); });
  if (opts.quick) {
    for (const { file, s } of slowUnlisted(msByFile)) {
      const msg = `${file} took ${s} s: add it to SLOW_TEST_FILES in tools/test-tier.mjs (or make it faster)`;
      console.log(process.env.GITHUB_ACTIONS ? `::warning file=${file},title=slow test file::${msg}` : `warning: ${msg}`);
    }
  }
  return failed ? 1 : 0;
}

/**
 * A GitHub `::error` workflow command for a failed test: its file and line, its name, the error's first lines.
 * @param {{ name: string, file?: string, line?: number, details?: { error?: any } }} d a `test:fail` event's data
 * @returns {string}
 */
export function failAnnotation(d) {
  const esc = (s, prop = false) => {
    const t = String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    return prop ? t.replace(/:/g, '%3A').replace(/,/g, '%2C') : t;
  };
  const err = d.details?.error;
  const cause = err?.cause ?? err;
  const msg = String(cause?.stack || cause?.message || cause || 'failed').split('\n').slice(0, 12).join('\n');
  const file = d.file ? path.relative(ROOT, d.file).split(path.sep).join('/') : '';
  const where = file ? `file=${esc(file, true)},${d.line ? `line=${d.line},` : ''}` : '';
  return `::error ${where}title=${esc(`test failed: ${d.name}`, true)}::${esc(msg)}`;
}

function isMain() {
  try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isMain()) main().then((code) => { process.exitCode = code; }, (e) => { console.error(e?.stack || e); process.exitCode = 1; });
