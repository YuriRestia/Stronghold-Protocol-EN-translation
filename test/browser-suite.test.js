// test/browser-suite.test.js — (fork) tools/browser-suite.mjs: which files the browser suite runs, in what order, the
// fixers' gate, and the speed bars that only `npm run test:perf` checks. No Chrome is started.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, BROWSER_ENV, BROWSER_PERF_FILES, browserFileList, loadTable, runOrder, selectFiles, runArgs, reweigh, slotsFor, slotsOfFile,
} from '../tools/browser-suite.mjs';

const all = browserFileList();
const table = loadTable();
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the list: every browser test file by the naming rule, and nothing that is not a test file', () => {
  assert.ok(all.length > 100, `${all.length} files`);
  for (const f of ['test/e2e/coop-coop.e2e.test.js', 'test/render/browser.test.js', 'test/p2p.browser.test.js', 'test/render/board3d.browser.test.js']) {
    assert.ok(all.includes(f), f);
  }
  assert.ok(!all.some((f) => f.includes('node_modules') || f.includes('\\')), 'repository paths with forward slashes');
  assert.ok(!all.includes('test/e2e/client.mjs') && !all.includes('test/e2e/mockPage.mjs'), 'helpers are not test files');
  assert.deepEqual([...all].sort(), all, 'sorted');
  // a test file that starts Chrome is in the list (client-wait / client-close only fake a page: `new Client(null, …)`)
  const tests = fs.globSync('test/**/*.test.js', { cwd: ROOT }).map((f) => f.split(path.sep).join('/'));
  const missing = tests.filter((f) => f !== 'test/e2e/client-wait.test.js' && f !== 'test/browser-suite.test.js' && /puppeteer\.launch\(|new Client\((?!null)/.test(src(f)) && !all.includes(f));
  assert.deepEqual(missing, []);
});

test('the table: the gate, the speed-bar files and every weight name a current browser file', () => {
  const known = new Set(all);
  assert.deepEqual(table.gate.filter((f) => !known.has(f)), []);
  assert.deepEqual(BROWSER_PERF_FILES.filter((f) => !known.has(f)), []);
  assert.deepEqual(Object.keys(table.measured).filter((f) => !known.has(f)), [], 're-weigh drops removed files');
  assert.ok(table.gate.length >= 8 && table.gate.length < 25, `a short gate (${table.gate.length} files)`);
  const gateMin = table.gate.reduce((s, f) => s + (table.measured[f] ?? table.defaultMs), 0) / 60000;
  assert.ok(gateMin < 15, `the gate weighs ${gateMin.toFixed(1)} lane-minutes`);
  assert.ok(Number.isInteger(table.concurrency) && table.concurrency >= 1);
});

test('run order: slowest first by the table, an untimed file at the default, ties by name', () => {
  const t = { defaultMs: 50, measured: { 'a.js': 10, 'b.js': 300, 'c.js': 50 } };
  assert.deepEqual(runOrder(['a.js', 'b.js', 'c.js', 'd.js', 'b.js'], t), ['b.js', 'c.js', 'd.js', 'a.js']);
  const order = runOrder(all, table);
  assert.equal(order.length, all.length);
  const ms = (f) => table.measured[f] ?? table.defaultMs;
  for (let i = 1; i < order.length; i++) assert.ok(ms(order[i - 1]) >= ms(order[i]), `${order[i - 1]} before ${order[i]}`);
});

test('selection: the whole list, the gate, or the gate plus named files; a name that is no browser file is refused', () => {
  assert.equal(selectFiles({}, all, table), all);
  assert.deepEqual(selectFiles({ gate: true }, all, table), table.gate);
  const extra = all.find((f) => !table.gate.includes(f));
  assert.deepEqual(selectFiles({ gate: true, extra: [`./${extra}`] }, all, table), [...table.gate, extra]);
  assert.deepEqual(selectFiles({ extra: [extra.split('/').join('\\')] }, all, table), [extra], 'Windows paths too');
  assert.throws(() => selectFiles({ extra: ['test/ui/nope.e2e.test.js'] }, all, table), /not a browser test file: test\/ui\/nope/);
  assert.throws(() => selectFiles({ extra: ['test/sim/perf.test.js'] }, all, table), /not a browser test file/);
  assert.throws(() => selectFiles({ gate: true }, all, { gate: ['test/ui/gone.e2e.test.js'] }), /gone/);
});

test('the run: the given lanes, every browser family switched on, spec + TAP + JUnit reports, the files last in order', () => {
  const args = runArgs(['x.e2e.test.js', 'y.browser.test.js'], { concurrency: 3, out: 'OUT' });
  assert.equal(args[0], '--test');
  assert.ok(args.includes('--test-concurrency=3'));
  for (const r of ['spec', 'tap', 'junit']) assert.ok(args.includes(`--test-reporter=${r}`), r);
  assert.ok(args.includes(`--test-reporter-destination=${path.join('OUT', 'browser-junit.xml')}`));
  assert.deepEqual(args.slice(-2), ['x.e2e.test.js', 'y.browser.test.js']);
  assert.deepEqual(Object.keys(BROWSER_ENV).sort(), ['RENDER_E2E', 'SIM_E2E', 'SP_E2E', 'SP_P2P_E2E', 'SP_REAL_E2E']);
});

test('re-weighing: a timed file takes the report value, the others keep theirs, removed files are dropped', () => {
  const t = { defaultMs: 1, concurrency: 2, gate: ['a.js'], measured: { 'a.js': 10, 'b.js': 20, 'gone.js': 5 } };
  assert.deepEqual(reweigh(t, { 'b.js': 99, 'c.js': 7 }, ['a.js', 'b.js', 'c.js']),
    { defaultMs: 1, concurrency: 2, gate: ['a.js'], measured: { 'a.js': 10, 'b.js': 99, 'c.js': 7 } });
});

test('speed bars: each listed file gates them on SP_PERF, and `npm run test:perf` runs those files', () => {
  for (const f of BROWSER_PERF_FILES) {
    const s = src(f);
    assert.match(s, /from '\.\.\/helpers\/perf\.js'/, f);
    assert.match(s, /\bPERF(_ON|_ONLY)?\b[,)]/, `${f} uses PERF / PERF_ON`);
  }
  const perf = src('tools/test-perf.mjs');
  assert.match(perf, /BROWSER_PERF_FILES/);
  assert.match(perf, /RENDER_E2E === '1'/);
  const pkg = JSON.parse(src('package.json'));
  assert.equal(pkg.scripts['test:perf'], 'node tools/test-perf.mjs');
  assert.equal(pkg.scripts['test:browser'], 'node tools/browser-suite.mjs');
});

test('lane slots: a real server or two players\' browsers take two, any other browser file one', () => {
  assert.equal(slotsFor("const srv = await startRealServer({ fast: {} });"), 2);
  assert.equal(slotsFor("const a = new Client(P, b, 'host'); const g = new Client(P, b, 'guest');"), 2);
  assert.equal(slotsFor("const c = new Client(P, b, 'solo');"), 1);
  assert.equal(slotsFor("const { startServer } = await import('../../server/index.js');"), 1);
  // a thin file over a shared flow module counts as the flow: the four co-op files run test/e2e/coopFlows.mjs
  for (const f of ['coop-coop', 'coop-facing', 'coop-result', 'coop-solo']) assert.equal(slotsOfFile(`test/e2e/${f}.e2e.test.js`), 2, f);
  assert.equal(slotsOfFile('test/ui/hotkeys.e2e.test.js'), 1);
  assert.equal(slotsFor(src('test/e2e/bot-host.e2e.test.js')), 2);
  assert.equal(slotsFor(src('test/ui/hotkeys.e2e.test.js')), 1);
});
