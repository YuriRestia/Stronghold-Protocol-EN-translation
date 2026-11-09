// test/test-select.test.js — (fork) the surgical reruns of tools/test-repro.mjs without Chrome: which tests a change
// selects (tools/test-select.mjs), the failure report and the per-test times of a JUnit file (tools/test-timings.mjs),
// budgets, the coverage map, and the hook's coverage painting — plus one budget run of a plain node:test fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseDiff, oldLinesOf, newLinesOf, newToOld, toIntervals, jsOutline, cssRules, selectInFile } from '../tools/test-select.mjs';
import { parseJUnit, perTestMsOf, xmlText } from '../tools/test-timings.mjs';
import { buildFailures, formatFailures, expectedMs, budgets, rerunPlan, mergeCoverage, planChanged, readHookDir, parseArgs } from '../tools/test-repro.mjs';
import { paintLines, repoPathOfUrl, blobSha } from '../tools/test-repro-hook.mjs';
import { reweigh, ROOT } from '../tools/browser-suite.mjs';

// ---- the diff ---------------------------------------------------------------------------------------------------------

const DIFF = `diff --git a/test/ui/x.e2e.test.js b/test/ui/x.e2e.test.js
index 1..2 100644
--- a/test/ui/x.e2e.test.js
+++ b/test/ui/x.e2e.test.js
@@ -5 +5 @@ function open() {
-  else await sleep(700);
+  else await settle();
@@ -9,0 +10,3 @@
+function settle() {
+  return 1;
+}
@@ -20,2 +22,0 @@
-gone
-gone
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-a
+b
`;

test('the diff: files and hunks; the old lines a hunk changed and the new lines it wrote; unchanged lines mapped back', () => {
  const d = parseDiff(DIFF);
  assert.deepEqual(d.map((f) => f.file), ['test/ui/x.e2e.test.js', 'README.md']);
  const h = d[0].hunks;
  assert.deepEqual(h, [
    { oldStart: 5, oldCount: 1, newStart: 5, newCount: 1 },
    { oldStart: 9, oldCount: 0, newStart: 10, newCount: 3 },
    { oldStart: 20, oldCount: 2, newStart: 22, newCount: 0 },
  ]);
  assert.deepEqual([oldLinesOf(h[0]), oldLinesOf(h[1]), oldLinesOf(h[2])], [[5], [9, 10], [20, 21]], 'an insertion: the old lines around it');
  assert.deepEqual([newLinesOf(h[0]), newLinesOf(h[1]), newLinesOf(h[2])], [[5], [10, 11, 12], [22, 23]], 'a deletion (git numbers it by the line before): the new lines around it');
  assert.deepEqual([4, 5, 9, 11, 13, 22, 23, 30].map((n) => newToOld(h, n)), [4, null, 9, null, 10, 19, 22, 29]);
  assert.deepEqual(toIntervals([5, 3, 4, 9, 10, 1]), [[1, 1], [3, 5], [9, 10]]);
});

// ---- outlines ---------------------------------------------------------------------------------------------------------

const TEST_SRC = `import { test, describe, before } from 'node:test';
const SIZES = [1, 2];
function open(kind) {
  if (kind === 'prep') return 1;
  else return helper();
}
const helper = () => 2;
describe('S', () => {
  before(() => open('prep'));
  test('one', () => { open('prep'); });
  for (const r of ['a', 'b']) test(\`two \${r}\`, () => {
    open('battle');
  });
  test('three', () => SIZES.length);
});
`;

test('a JS outline: test() calls, hooks, named declarations outside tests, identifier uses', () => {
  const o = jsOutline(TEST_SRC);
  assert.deepEqual(o.tests, [{ start: 10, end: 10 }, { start: 11, end: 13 }, { start: 14, end: 14 }]);
  assert.deepEqual(o.hooks, [{ start: 9, end: 9 }]);
  assert.deepEqual(o.decls.map((d) => [d.name, d.start, d.end]), [['SIZES', 2, 2], ['open', 3, 6], ['helper', 7, 7]]);
  assert.ok(o.refs.some((r) => r.name === 'SIZES' && r.line === 14));
  assert.equal(jsOutline('this is ( not js'), null);
});

test('CSS rules: style rules (inside @media too), at-rule bodies apart, comments and strings skipped', () => {
  const css = `/* a { b } */
.a { color: red; }
@media (max-width: 9px) {
  .b,
  .c { color: "}"; }
}
@keyframes k { from { opacity: 0 } to { opacity: 1 } }
:root { --x: 1; }
`;
  assert.deepEqual(cssRules(css), [
    { start: 2, end: 2, kind: 'style' }, { start: 4, end: 5, kind: 'style' }, { start: 7, end: 7, kind: 'other' },
    { start: 7, end: 7, kind: 'other' }, { start: 7, end: 7, kind: 'other' }, { start: 8, end: 8, kind: 'style' },
  ]);
});

// ---- selection --------------------------------------------------------------------------------------------------------

const F = 'test/ui/x.e2e.test.js';
const T = (n) => ['S', n];
const LIST = [{ path: T('one'), line: 10 }, { path: T('two a'), line: 11 }, { path: T('two b'), line: 11 }, { path: T('three'), line: 14 }];
const iv = (...lines) => toIntervals(lines);
const COV = {
  tests: {
    'S > one': { used: { [F]: iv(3, 4, 10), 'public/js/a.js': iv(1, 2), 'public/css/c.css': iv(2) }, loaded: ['public/js/a.js', 'public/css/c.css'], sha: { [F]: 'old', 'public/js/a.js': 'a1', 'public/css/c.css': 'c1' } },
    'S > two a': { used: { [F]: iv(3, 5, 7, 12), 'public/js/a.js': iv(5) }, loaded: ['public/js/a.js', 'public/css/c.css'], sha: { [F]: 'old', 'public/js/a.js': 'a1', 'public/css/c.css': 'c1' } },
    'S > two b': { used: { [F]: iv(3, 5, 7, 12), 'public/js/a.js': iv(5) }, loaded: ['public/js/a.js', 'public/css/c.css'], sha: { [F]: 'old', 'public/js/a.js': 'a2', 'public/css/c.css': 'c1' } },
    'S > three': { used: { [F]: iv(14) }, loaded: [], sha: { [F]: 'old' } },
  },
  setup: { used: { [F]: iv(1, 2, 3, 7, 8, 9) }, loaded: [], sha: { [F]: 'old' } },
};
const ORDER = LIST.map((t) => t.path.join(' > '));
const pick = (r) => [...r.tests.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((n) => n.split(' > ')[1]);

test('selection, a test file\'s own lines: inside test() → that test (a loop\'s tests together); a hook → the whole file', () => {
  const own = (hunks) => selectInFile({ testFile: F, tests: LIST, coverage: COV, changes: [{ file: F, hunks, oldSha: 'old', newText: TEST_SRC, oldText: TEST_SRC }] });
  assert.deepEqual(pick(own([{ oldStart: 12, oldCount: 1, newStart: 12, newCount: 1 }])), ['two a', 'two b']);
  assert.deepEqual(pick(own([{ oldStart: 14, oldCount: 1, newStart: 14, newCount: 1 }])), ['three']);
  const hook = own([{ oldStart: 9, oldCount: 1, newStart: 9, newCount: 1 }]);
  assert.equal(hook.all, true);
  assert.match(hook.reasons[0], /before \/ after hook/);
});

test('selection, a helper\'s branch: only the tests that ran the changed old line (the else branch: the "two" tests, not "one")', () => {
  const r = selectInFile({ testFile: F, tests: LIST, coverage: COV, changes: [{ file: F, hunks: [{ oldStart: 5, oldCount: 1, newStart: 5, newCount: 1 }], oldSha: 'old', newText: TEST_SRC }] });
  assert.deepEqual(pick(r), ['two a', 'two b']);
  assert.match(r.tests.get('S > two a')[0], /ran the changed line\(s\) 5/);
  assert.equal(r.all, false);
});

test('selection, a constant changed (it runs only at load): the tests that ran a line using it', () => {
  const r = selectInFile({ testFile: F, tests: LIST, coverage: COV, changes: [{ file: F, hunks: [{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }], oldSha: 'old', newText: TEST_SRC }] });
  assert.deepEqual(pick(r), ['three']);
  // a top-level statement that is no declaration (an import): the whole file
  const imp = selectInFile({ testFile: F, tests: LIST, coverage: COV, changes: [{ file: F, hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }], oldSha: 'old', newText: TEST_SRC }] });
  assert.equal(imp.all, true);
});

test('selection, app code: the tests whose pages ran the changed function; a test recorded at another version is picked as is', () => {
  const app = (hunks, oldSha = 'a1') => selectInFile({ testFile: F, tests: LIST, coverage: COV, changes: [{ file: 'public/js/a.js', hunks, oldSha }] });
  assert.deepEqual(pick(app([{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }])), ['one', 'two b'], '"two b" ran another version of a.js');
  assert.match(app([{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }]).tests.get('S > two b')[0], /another version/);
  const none = app([{ oldStart: 40, oldCount: 1, newStart: 40, newCount: 1 }]);
  assert.deepEqual(pick(none), ['two b']);
  assert.match(none.reasons[0], /no recorded test of this file ran the changed lines/);
  // a file the test file never loaded: nothing
  assert.equal(selectInFile({ testFile: F, tests: LIST, coverage: COV, changes: [{ file: 'public/js/other.js', hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }] }] }).tests.size, 0);
});

test('selection, CSS: a change inside a rule → the tests that matched it; outside a style rule → every test that loaded the sheet', () => {
  const css = '.x { a: 1; }\n.uframe { b: 2; }\n@keyframes k { to { c: 3 } }\n';
  const run = (hunks) => pick(selectInFile({ testFile: F, tests: LIST, coverage: COV, changes: [{ file: 'public/css/c.css', hunks, oldSha: 'c1', oldText: css }] }));
  assert.deepEqual(run([{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }]), ['one'], '.uframe matched by "one" only');
  assert.deepEqual(run([{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }]), [], '.x matched by none');
  assert.deepEqual(run([{ oldStart: 3, oldCount: 1, newStart: 3, newCount: 1 }]), ['one', 'two a', 'two b'], 'keyframes: whoever loaded the sheet');
});

test('selection: server code of a separate server process, a file never recorded, a test file not parsing', () => {
  const sep = selectInFile({ testFile: F, tests: LIST, coverage: { ...COV, separateServer: true }, changes: [{ file: 'server/match/x.js', hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }] }] });
  assert.equal(sep.all, true);
  assert.match(sep.reasons[0], /separate server process/);
  // no coverage: by name (open → used by every test; helper → through open)
  const byName = selectInFile({ testFile: F, tests: LIST, coverage: null, changes: [{ file: F, hunks: [{ oldStart: 7, oldCount: 1, newStart: 7, newCount: 1 }], newText: TEST_SRC }] });
  assert.deepEqual(pick(byName), ['one', 'two a', 'two b'], 'helper is used by open, which "one" and "two" call');
  assert.match(byName.tests.get('S > one')[0], /by name/);
  assert.equal(selectInFile({ testFile: F, tests: LIST, coverage: null, changes: [{ file: F, hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }], newText: 'not ( js' }] }).all, true);
});

test('the plan of --changed: docs ignored, harness / data changes stop everything, a file without coverage runs whole when app code changed', () => {
  const base = { candidates: [F, 'test/ui/y.e2e.test.js'], coverageOf: (f) => (f === F ? COV : null), testsOf: () => LIST, readFile: () => '', sources: () => ({ oldSha: 'a1', oldText: '', newText: '' }) };
  const one = (file) => ({ file, hunks: [{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }] });
  const app = planChanged({ ...base, diff: [one('public/js/a.js'), one('README.md'), one('FORK-CHANGELOG.md')] });
  assert.deepEqual(app.ignored, ['README.md', 'FORK-CHANGELOG.md']);
  assert.deepEqual(app.files.map((f) => [f.file, f.whole, f.tests.map((t) => t.name)]), [[F, false, ['S > one', 'S > two b']], ['test/ui/y.e2e.test.js', true, []]]);
  assert.match(app.files[1].reasons[0], /no coverage recorded yet and app code changed/);
  const tools = planChanged({ ...base, diff: [one('tools/browser-suite.mjs')] });
  assert.deepEqual(tools.unmapped, ['tools/browser-suite.mjs']);
  assert.ok(tools.files.every((f) => f.whole));
  // only a test file changed: the other candidate is not touched at all
  const own = planChanged({ ...base, diff: [{ file: F, hunks: [{ oldStart: 14, oldCount: 1, newStart: 14, newCount: 1 }] }], sources: () => ({ oldSha: 'old', newText: TEST_SRC }) });
  assert.deepEqual(own.files.map((f) => [f.file, f.tests.map((t) => t.name)]), [[F, ['S > three']]]);
});

// ---- JUnit, the failure report, times, budgets ------------------------------------------------------------------------

const XML = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
\t<testcase name="top" time="1.5" classname="test" file="${ROOT}\\test\\a.test.js"/>
\t<testsuite name="S" time="20.0" timestamp="2026-11-09T08:40:34.519Z">
\t\t<testcase name="engine" time="15.4" classname="S" file="${ROOT}\\test\\ui\\p.e2e.test.js"/>
\t\t<testcase name="fallback" time="2.6" classname="S" file="${ROOT}\\test\\ui\\p.e2e.test.js">
\t\t\t<failure type="testCodeFailure" message="plate reads red ({&amp;quot;r&amp;quot;:72})">x</failure>
\t\t</testcase>
\t\t<testsuite name="inner" time="1.0">
\t\t\t<testcase name="deep" time="0.5" classname="inner" file="${ROOT}\\test\\ui\\p.e2e.test.js"><skipped type="skipped"/></testcase>
\t\t</testsuite>
\t</testsuite>
</testsuites>`;

test('JUnit: full names from nested suites, outcomes, the failure\'s message decoded, suite start and total', () => {
  const c = parseJUnit(XML);
  assert.deepEqual(c.map((x) => [x.file, x.path.join(' > '), x.ms, x.status]), [
    ['test/a.test.js', 'top', 1500, 'pass'], ['test/ui/p.e2e.test.js', 'S > engine', 15400, 'pass'],
    ['test/ui/p.e2e.test.js', 'S > fallback', 2600, 'fail'], ['test/ui/p.e2e.test.js', 'S > inner > deep', 500, 'skip'],
  ]);
  assert.equal(c[2].error, 'plate reads red ({"r":72})');
  assert.deepEqual([c[2].suiteStart, c[2].suiteMs], [Date.parse('2026-11-09T08:40:34.519Z'), 20000]);
  assert.equal(xmlText('a &amp;lt; b &#65;'), 'a < b A');
  const t = perTestMsOf([XML]);
  assert.deepEqual(t.tests['test/ui/p.e2e.test.js'], { 'S > engine': 15400, 'S > fallback': 2600 });
  assert.deepEqual(t.setupMs, { 'test/a.test.js': 0, 'test/ui/p.e2e.test.js': 2000 }, 'the suite\'s 20 s minus its tests\' 18 s');
  const table = reweigh({ measured: { 'test/ui/p.e2e.test.js': 1 }, tests: { 'test/old.e2e.test.js': { x: 1 } } }, {}, ['test/ui/p.e2e.test.js'], t);
  assert.deepEqual(Object.keys(table.tests), ['test/ui/p.e2e.test.js'], 'a file that is gone drops out');
});

test('the failure report: from JUnit alone (start ≈ the tests before it), and exact from the hook, with a budget told apart', () => {
  const f = buildFailures(parseJUnit(XML));
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].file, f[0].test, f[0].startMs, f[0].startExact, f[0].ms, f[0].fileMs, f[0].before], ['test/ui/p.e2e.test.js', 'S > fallback', 15400, false, 2600, 20000, ['S > engine']]);
  const hooks = { 'test/ui/p.e2e.test.js': { tests: { 'S > fallback': { start: 19100, end: 21800 } }, shots: { 'S > fallback': ['shot-1.png'] }, budget: {}, console: 'console.txt' } };
  const g = buildFailures(parseJUnit(XML), hooks)[0];
  assert.deepEqual([g.startMs, g.startExact, g.ms, g.fileMs, g.shots, g.console], [19100, true, 2700, 21800, ['shot-1.png'], 'console.txt']);
  const timedOut = parseJUnit(XML).map((c) => (c.status === 'fail' ? { ...c, failureType: 'testTimeoutFailure', error: 'test timed out after 20000ms' } : c));
  const b = buildFailures(timedOut, { 'test/ui/p.e2e.test.js': { ...hooks['test/ui/p.e2e.test.js'], budget: { 'S > fallback': 20000 } } }, { tests: { 'test/ui/p.e2e.test.js': { 'S > fallback': 2600 } } })[0];
  assert.deepEqual(b.budget, { afterMs: 20000, expectedMs: 2600 });
  const text = formatFailures([f[0], b]);
  assert.match(text, /\| test\/ui\/p\.e2e\.test\.js \| fallback \| plate reads red \(\{"r":72\}\) \| ≈ 15\.4 s \| 2\.6 s \| 20\.0 s \| 1: engine \|/);
  assert.match(text, /stopped by budget after 20\.0 s \(expected 2\.6 s\)/);
});

test('expected times, budgets and the --rerun-failed plan', () => {
  const table = { defaultMs: 30000, measured: { f: 100000 }, setupMs: { f: 4000 }, tests: { f: { a: 10000, b: 2000 } } };
  assert.deepEqual(expectedMs(table, 'f', ['a', 'b']), { ms: 16000, untimed: 0 });
  assert.deepEqual(expectedMs(table, 'f', ['a', 'zz']), { ms: 44000, untimed: 1 });
  assert.deepEqual(expectedMs(table, 'f', null), { ms: 104000, untimed: 0 });
  assert.deepEqual(budgets(table, 'f', ['a', 'b', 'zz'], 3, 20000), { a: 30000, b: 20000 }, 'k × time, never under the floor; untimed: none');
  assert.deepEqual(rerunPlan([{ file: 'f', test: 'S > b', before: ['S > a'] }, { file: 'f', test: 'S > b', before: ['S > a'] }, { file: 'f', test: 'S > a', before: [] }]), [
    { file: 'f', test: 'S > b', alone: ['S > b'], after: ['S > a', 'S > b'] }, { file: 'f', test: 'S > a', alone: ['S > a'], after: ['S > a'] },
  ]);
  for (const [argv, re] of [[['--rerun-failed', 'x.json', 'y.js'], /no file with --rerun-failed/], [['--report', 'a', '--changed', 'b'], /one of/], [['f.js', '--test', 'x', '--budget', '0.5'], /--budget/]]) {
    assert.throws(() => parseArgs(argv), re);
  }
  assert.deepEqual([parseArgs(['--changed', 'HEAD~1..HEAD', 'a.js', '--dry-run']).files, parseArgs(['--changed', 'HEAD']).runs], [['a.js'], 1]);
});

test('the coverage map: a run replaces the tests it ran (with the blob id of every file each used) and keeps the others', () => {
  const prev = { file: F, tests: { 'S > one': { at: 'old', used: {}, loaded: [], sha: {} }, 'S > three': { at: 'old', used: {}, loaded: [], sha: {} } } };
  const run = {
    file: F, at: 'new', unmapped: ['/data.js'],
    tests: { 'S > one': { used: { 'public/js/a.js': [[1, 2]] }, loaded: ['public/css/c.css'] } },
    setup: { used: { [F]: [[1, 9]] }, loaded: [] },
    files: { 'public/js/a.js': { sha: 'a9', status: 'ok' }, 'public/css/c.css': { sha: 'c9', status: 'differs' }, [F]: { sha: 'f9', status: 'ok' } },
  };
  const m = mergeCoverage(prev, run, { separateServer: false });
  assert.deepEqual(m.tests['S > one'].sha, { 'public/js/a.js': 'a9', 'public/css/c.css': 'c9' });
  assert.equal(m.tests['S > three'].at, 'old');
  assert.deepEqual([m.setup.sha, m.unmapped, m.differs], [{ [F]: 'f9' }, ['/data.js'], ['public/css/c.css']]);
});

// ---- the hook's coverage helpers --------------------------------------------------------------------------------------

test('coverage painting: an else branch that did not run is not "run", whatever its keyword and comment', () => {
  const text = 'function open(k) {\n  if (k) return 1;\n  else await sleep(700); // a long comment that ran with the enclosing function\n}\n';
  const fn = { startOffset: 0, endOffset: text.length - 1, count: 1 };
  const elseAt = text.indexOf('await sleep');
  const r = paintLines(text, [fn, { startOffset: elseAt, endOffset: text.indexOf(';', elseAt) + 1, count: 0 }]);
  assert.deepEqual(r.used, [1, 2, 4]);
  assert.deepEqual(r.known, [1, 2, 3, 4]);
  assert.deepEqual(paintLines(text, [fn]).used, [1, 2, 3, 4]);
});

test('served URLs to repository files: a generation prefix and a query stripped, /sim/ and /match/ under server/, /data.js none', () => {
  const have = new Set(['public/js/ui/a.js', 'shared/b.js', 'server/sim/Battle.js', 'public/css/c.css']);
  const ex = (r) => have.has(r);
  assert.equal(repoPathOfUrl('http://127.0.0.1:5/g/abc123/js/ui/a.js?v=2', ex), 'public/js/ui/a.js');
  assert.equal(repoPathOfUrl('http://127.0.0.1:5/shared/b.js', ex), 'shared/b.js');
  assert.equal(repoPathOfUrl('http://127.0.0.1:5/sim/Battle.js', ex), 'server/sim/Battle.js');
  assert.equal(repoPathOfUrl('http://127.0.0.1:5/css/c.css', ex), 'public/css/c.css');
  assert.equal(repoPathOfUrl('http://127.0.0.1:5/data.js', ex), null);
  assert.equal(repoPathOfUrl('blob:http://x/1', ex), null);
  assert.equal(blobSha('hello\r\n'), blobSha('hello\n'), 'line endings as git stores them');
  assert.equal(blobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391', 'git\'s empty blob');
});

test('a budget run: the hook times each test from the file\'s start, a budget stops a slow test, and the report tells it from a failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-budget-'));
  try {
    const file = path.join(dir, 'fixture.test.mjs');
    fs.writeFileSync(file, `import { test, describe } from 'node:test';
describe('S', () => {
  test('quick', () => {});
  test('slow', async () => { await new Promise((r) => setTimeout(r, 3000)); });
  test('broken', () => { throw new Error('really broken'); });
});
`);
    fs.writeFileSync(path.join(dir, 'budget.json'), JSON.stringify({ 'S > slow': 300 }));
    const hookUrl = pathToFileURL(path.join(ROOT, 'tools/test-repro-hook.mjs')).href;
    const env = { ...process.env, NODE_OPTIONS: `--import=${hookUrl}`, SP_REPRO_MODE: 'run', SP_REPRO_FILE: file, SP_REPRO_DIR: path.join(dir, 'run'), SP_REPRO_BUDGET: path.join(dir, 'budget.json'), SP_REPRO_COVERAGE: '0' };
    delete env.NODE_TEST_CONTEXT;
    const report = path.join(dir, 'report.jsonl');
    const r = spawnSync(process.execPath, ['--test', `--test-reporter=${hookUrl}`, `--test-reporter-destination=${report}`, file], { env, encoding: 'utf8', timeout: 60000 });
    assert.notEqual(r.status, 0);
    const recs = fs.readFileSync(report, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const cases = recs.map((x) => ({ file: 'f', path: x.path, ms: x.ms ?? 0, status: x.ok ? 'pass' : 'fail', error: x.error, failureType: x.failureType }));
    const hook = readHookDir(path.join(dir, 'run'));
    assert.deepEqual(Object.keys(hook.tests), ['S > quick', 'S > slow', 'S > broken']);
    assert.deepEqual(hook.budget, { 'S > slow': 300 });
    const f = buildFailures(cases, { f: hook }, { tests: { f: { 'S > slow': 100 } } });
    assert.deepEqual(f.map((x) => [x.test, !!x.budget, x.startExact]), [['S > slow', true, true], ['S > broken', false, true]]);
    assert.ok(f[0].ms < 2500, `stopped near its budget, not after 3 s (${f[0].ms} ms)`);
    assert.ok(f[1].startMs >= f[0].startMs, 'started after the slow one');
    assert.match(formatFailures(f), /stopped by budget after 0\.3 s \(expected 0\.1 s\)[\s\S]*really broken/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
