// test/test-repro.test.js — (fork) tools/test-repro.mjs: its arguments, the cases it builds over a file's tests, the
// name pattern that runs exactly a case's tests, the reading of a run, and its reporter / lister (tools/test-repro-hook.mjs).
// No Chrome is started: the file runs below are of a plain node:test fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  parseArgs, namePattern, matches, fullName, buildCases, runResult, formatTable, gpuFlagsToAdd, laneLocks, listTests,
} from '../tools/test-repro.mjs';
import reproReporter, { errorLine } from '../tools/test-repro-hook.mjs';
import { ROOT } from '../tools/browser-suite.mjs';

const S = 'user playtest #2 — UI fixes (mock harness, headless Chrome)';
const plate = (r) => [S, `7: 出售 / 销毁 are amber / red plates, not a white block (${r})`];
const TESTS = [
  { path: plate('engine'), skip: false },
  { path: plate('fallback'), skip: false },
  { path: [S, '8: every underframe stays clickable (engine)'], skip: true },
  { path: [S, '8: every underframe stays clickable (fallback)'], skip: false },
  { path: [S, '9: the detail card shows the bonds'], skip: false },
  { path: ['a top-level test'], skip: false },
];

test('arguments: the defaults, repeated --before, a Windows path', () => {
  const o = parseArgs(['test\\ui\\playtest2.e2e.test.js', '--test', 'fallback', '--before', 'engine', '--before', '^9:']);
  assert.deepEqual(
    [o.file, o.test, o.before, o.runs, o.cpu, o.orders, o.list, o.lock, o.out, o.lanes],
    ['test/ui/playtest2.e2e.test.js', 'fallback', ['engine', '^9:'], 5, 1, false, false, true, null, undefined],
  );
  assert.equal(o.ownFlags, false, 'GPU flags added by default');
  const p = parseArgs(['./a.e2e.test.js', '--test', 'x', '--runs', '3', '--cpu', '4', '--orders', '--out', 'o', '--lanes', 'L', '--no-lock', '--own-flags']);
  assert.deepEqual([p.file, p.runs, p.cpu, p.orders, p.out, p.lanes, p.lock, p.ownFlags], ['a.e2e.test.js', 3, 4, true, 'o', 'L', false, true]);
  assert.equal(parseArgs(['a.e2e.test.js', '--list']).list, true, '--list needs no --test');
});

test('arguments: every mistake fails before anything runs', () => {
  const bad = [
    [[], /no test file/],
    [['a.js'], /--test .* is required/],
    [['a.js', '--test'], /--test needs a value/],
    [['a.js', '--test', '--orders'], /--test needs a value/],
    [['a.js', '--test', 'x', '--runs', '0'], /--runs/],
    [['a.js', '--test', 'x', '--runs', '2.5'], /--runs/],
    [['a.js', '--test', 'x', '--cpu', '0.5'], /--cpu/],
    [['a.js', '--test', 'x', '--cpu', 'fast'], /--cpu/],
    [['a.js', '--test', 'x', '--speed'], /unknown option --speed/],
    [['a.js', 'b.js', '--test', 'x'], /one file only/],
    [['a.js', '--test', '(unclosed'], /Invalid regular expression/],
    [['a.js', '--test', 'x', '--before', '[z-a]'], /Invalid regular expression/],
  ];
  for (const [argv, re] of bad) assert.throws(() => parseArgs(argv), re, argv.join(' '));
});

test('the name pattern: anchored on the full names, special characters escaped, never a whole suite', () => {
  const p = namePattern([plate('engine'), plate('fallback')]);
  const re = new RegExp(p);
  // node:test runs a test when the pattern matches its own name or its suites' and its names joined by spaces
  const runs = (path) => re.test(path.at(-1)) || re.test(path.join(' '));
  assert.ok(runs(plate('engine')) && runs(plate('fallback')));
  assert.equal(re.test(S), false, 'the suite name alone (which would run all its tests)');
  for (const t of TESTS.slice(2)) assert.equal(runs(t.path), false, fullName(t.path));
  assert.equal(new RegExp(namePattern([['a (b) [c] $d.e*', 'f+g?|h']])).test('a (b) [c] $d.e* f+g?|h'), true);
  assert.equal(new RegExp(namePattern([['a.b']])).test('aXb'), false, 'a dot is a dot');
  assert.equal(fullName(plate('engine')), `${S} > ${plate('engine')[1]}`, 'as t.fullName gives it');
});

test('matching a --test / --before pattern: the own name, or the names joined by spaces', () => {
  assert.ok(matches('^7: .*\\(fallback\\)$', plate('fallback')));
  assert.ok(matches('Chrome\\) 7:', plate('fallback')), 'across the suite name');
  assert.equal(matches('^user', ['other']), false);
});

test('cases: alone, then after each --before test that comes earlier in the file', () => {
  const { target, cases } = buildCases(TESTS, { test: 'plates.*\\(fallback\\)', before: ['plates.*\\(engine\\)'] });
  assert.deepEqual(target, { path: plate('fallback'), index: 1 });
  assert.deepEqual(cases, [
    { id: 'alone', label: 'alone', paths: [plate('fallback')] },
    { id: 'after-0', label: `after #0 ${plate('engine')[1]}`, paths: [plate('engine'), plate('fallback')] },
  ]);
});

test('cases: --orders takes every earlier test that runs (not the skipped ones), in file order, each once', () => {
  const { cases } = buildCases(TESTS, { test: '^9:', orders: true, before: ['\\(fallback\\)$'] });
  assert.deepEqual(cases.map((c) => c.id), ['alone', 'after-0', 'after-1', 'after-3']);
  for (const c of cases.slice(1)) assert.deepEqual(c.paths.at(-1), TESTS[4].path, 'the target last');
  assert.deepEqual(buildCases(TESTS, { test: '^7:.*engine', orders: true }).cases.map((c) => c.id), ['alone'], 'the first test has no predecessor');
});

test('cases: a target that is ambiguous, absent or skipped, and a --before that is not earlier, are refused', () => {
  assert.throws(() => buildCases(TESTS, { test: 'plates' }), /matches 2 tests; name one:\n {2}#0 .*\(engine\)\n {2}#1 .*\(fallback\)/);
  assert.throws(() => buildCases(TESTS, { test: 'nothing like it' }), /no test of the file matches/);
  assert.throws(() => buildCases(TESTS, { test: 'clickable \\(engine\\)' }), /only skipped tests match/);
  assert.equal(buildCases(TESTS, { test: 'clickable' }).target.index, 3, 'a skipped twin does not make it ambiguous');
  assert.throws(() => buildCases(TESTS, { test: '\\(engine\\)$', before: ['^9:'] }), /come after the target/);
  assert.throws(() => buildCases(TESTS, { test: '^9:', before: ['nope'] }), /--before "nope": no test of the file matches/);
});

test('a run: pass, fail with its message, and every way the case did not really run', () => {
  const alone = { paths: [plate('fallback')] };
  const pair = { paths: [plate('engine'), plate('fallback')] };
  const T = plate('fallback');
  const line = (o) => `${JSON.stringify(o)}\n`;
  const okE = line({ path: plate('engine'), ok: true, skip: false });
  const failE = line({ path: plate('engine'), ok: false, skip: false, error: 'engine broke' });
  const okF = line({ path: T, ok: true, skip: false });
  const failF = line({ path: T, ok: false, skip: false, error: 'destroy plate reads red' });
  assert.deepEqual(runResult(okF, alone, T), { ok: true, error: null });
  assert.deepEqual(runResult(okE + okF, pair, T), { ok: true, error: null });
  assert.deepEqual(runResult(okE + failF, pair, T), { ok: false, error: 'destroy plate reads red' });
  assert.match(runResult(failE + failF, pair, T).error, /^destroy plate reads red \(the test before it failed too: engine broke\)$/);
  assert.match(runResult('', alone, T).error, /^the target did not run$/, 'no report (tests 0)');
  assert.match(runResult(failE, pair, T).error, /did not run \(.*engine broke\)/);
  assert.match(runResult(line({ path: T, ok: true, skip: true }), alone, T).error, /skipped: is CHROME_PATH set/);
  assert.match(runResult(okF, pair, T).error, /the test before it did not run/, 'the order effect needs its predecessor');
  assert.deepEqual(runResult(`garbage\n${okF}`, alone, T), { ok: true, error: null });
});

test('the table, the GPU flags (the file\'s own win) and the lane locks', () => {
  assert.equal(formatTable([{ label: 'after #0 a | b', runs: 5, pass: 0, fail: 5, first: 'run 1: x\ny' }, { label: 'alone', runs: 5, pass: 5, fail: 0, first: '' }]),
    '| case | runs | pass | fail | first failure |\n|---|---|---|---|---|\n| after #0 a \\| b | 5 | 0 | 5 | run 1: x y |\n| alone | 5 | 5 | 0 |  |');
  assert.deepEqual(gpuFlagsToAdd(['--mute-audio', '--no-sandbox', '--use-angle=swiftshader'], ['--no-first-run', '--mute-audio', '--enable-gpu', '--use-angle=d3d11']),
    ['--no-first-run', '--enable-gpu']);
  assert.deepEqual([laneLocks(1), laneLocks(2), laneLocks(0)], [['fix-browser-3.lock'], ['fix-browser-3.lock', 'fix-browser-2.lock'], ['fix-browser-3.lock']]);
});

test('the reporter: one line per test with its full path, suites left out, the error\'s own first line', async () => {
  const cause = new Error('destroy plate reads red\n  at foo');
  const events = [
    { type: 'test:start', data: { nesting: 0, name: 'S' } },
    { type: 'test:start', data: { nesting: 1, name: 'a' } },
    { type: 'test:pass', data: { nesting: 1, name: 'a', details: { duration_ms: 12.4 } } },
    { type: 'test:start', data: { nesting: 1, name: 'b' } },
    { type: 'test:fail', data: { nesting: 1, name: 'b', details: { duration_ms: 3, error: Object.assign(new Error('test failed'), { cause }) } } },
    { type: 'test:fail', data: { nesting: 0, name: 'S', details: { type: 'suite' } } },
    { type: 'test:start', data: { nesting: 0, name: 'top' } },
    { type: 'test:pass', data: { nesting: 0, name: 'top', skip: 'off', details: {} } },
  ];
  async function* source() { yield* events; }
  let out = '';
  for await (const chunk of reproReporter(source())) out += chunk;
  assert.deepEqual(out.trim().split('\n').map((l) => JSON.parse(l)), [
    { path: ['S', 'a'], ok: true, skip: false, ms: 12 },
    { path: ['S', 'b'], ok: false, skip: false, error: 'destroy plate reads red', ms: 3 },
    { path: ['top'], ok: true, skip: true },
  ]);
  assert.equal(errorLine('plain'), 'plain');
});

test('listing and running a real file: file order and skips, no hook runs while listing, and the pattern runs only the case', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-repro-test-'));
  try {
    const marks = path.join(dir, 'marks.txt');
    const file = path.join(dir, 'fixture.test.mjs');
    fs.writeFileSync(file, `import { describe, test, before, afterEach } from 'node:test';
import fs from 'node:fs';
const mark = (s) => fs.appendFileSync(${JSON.stringify(marks)}, s + '\\n');
describe('S (1)', () => {
  before(() => mark('before'));
  afterEach(() => mark('afterEach'));
  for (const r of ['engine', 'fallback']) test(\`7: plate (\${r})\`, () => mark(r));
  test.skip('8: skipped', () => mark('8'));
  test('9: last', { skip: process.env.SP_E2E !== '1' && 'off' }, () => mark('9'));
});
describe('off', { skip: 'no' }, () => { test('inside', () => {}); });
test('top', () => mark('top'));
`);
    const tests = listTests(file);
    assert.deepEqual(tests.map((t) => [fullName(t.path), t.skip]), [
      ['S (1) > 7: plate (engine)', false], ['S (1) > 7: plate (fallback)', false], ['S (1) > 8: skipped', true],
      ['S (1) > 9: last', false], ['off > inside', true], ['top', false],
    ], 'the browser switches are on while listing');
    assert.equal(fs.existsSync(marks), false, 'listing runs no hook and no test');

    const { cases, target } = buildCases(tests, { test: 'fallback', orders: true });
    const env = { ...process.env, NO_COLOR: '1' };
    delete env.NODE_TEST_CONTEXT; // this file's own runner context: the run below is a runner of its own
    const report = path.join(dir, 'report.jsonl');
    const r = spawnSync(process.execPath, ['--test', `--test-name-pattern=${namePattern(cases[1].paths)}`,
      `--test-reporter=${pathToFileURL(path.join(ROOT, 'tools/test-repro-hook.mjs')).href}`, `--test-reporter-destination=${report}`, file], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readFileSync(marks, 'utf8').trim().split('\n'), ['before', 'engine', 'afterEach', 'fallback', 'afterEach'], 'the pair, in file order, with the suite\'s hooks');
    assert.deepEqual(runResult(fs.readFileSync(report, 'utf8'), cases[1], target.path), { ok: true, error: null });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
