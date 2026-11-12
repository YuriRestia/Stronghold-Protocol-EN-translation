// (fork) .github/workflows/golden-refresh.yml and its helper tools/golden-moved.mjs: the golden files are recomputed on
// GitHub by a button, only the changed files come back as a short-lived artifact, and nothing is committed or pushed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVersions, resolveFamilies, movedScenarios, compareDirs, markdownSummary, collect } from '../tools/golden-moved.mjs';
import { VERSIONS, DEFAULT_VERSION } from '../shared/versions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wf = readFileSync(path.join(ROOT, '.github/workflows/golden-refresh.yml'), 'utf8').replace(/\r\n?/g, '\n');

test('golden refresh workflow: a button only, read-only, never commits or pushes', () => {
  const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\nconcurrency:'));
  assert.match(on, /\n {2}workflow_dispatch:/);
  for (const ev of ['push:', 'pull_request', 'schedule:', 'workflow_run:']) assert.ok(!on.includes(ev), `no ${ev} trigger`);
  assert.match(wf, /\npermissions:\n {2}contents: read\n/);
  assert.ok(!/contents: write|git push|git commit|create-pull-request/.test(wf), 'never writes to the repository');
  assert.match(wf, /npm run golden:update -- --version "\$v"/, 'the same command a Dev runs, per version');
  assert.match(wf, /retention-days: 3/);
  assert.match(wf, /if: steps\.collect\.outputs\.changed != '0'/, 'no artifact when nothing moved');
  assert.match(wf, /timeout-minutes: \d+/);
  // inputs reach the shell only through env (no ${{ inputs.* }} inside a run script)
  for (const block of wf.split(/\n\s+run: \|/).slice(1)) assert.ok(!/\$\{\{\s*inputs\./.test(block.split(/\n\s+- (name|uses):/)[0]), 'no input expression in a script');
  // the same setup as ci.yml's golden job
  const ci = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  for (const line of ['uses: actions/checkout@v7', 'uses: actions/setup-node@v7', 'node-version: 22', 'npm ci --no-audit --no-fund']) {
    assert.ok(ci.includes(line) && wf.includes(line), line);
  }
});

test('golden-moved: versions and families inputs are checked', () => {
  assert.deepEqual(resolveVersions('all'), VERSIONS.map((v) => v.id));
  assert.deepEqual(resolveVersions(''), VERSIONS.map((v) => v.id));
  assert.equal(resolveVersions('all')[0], DEFAULT_VERSION);
  assert.deepEqual(resolveVersions(' act1autochess , act1autochess '), ['act1autochess']);
  // the summary step gets the resolved list back space- or line-separated
  assert.deepEqual(resolveVersions('act1autochess act1autochess@V1_1'), ['act1autochess', 'act1autochess@V1_1']);
  assert.deepEqual(resolveVersions('act1autochess\nact1autochess@V1_1\n'), ['act1autochess', 'act1autochess@V1_1']);
  assert.throws(() => resolveVersions('act9autochess'), /unknown version/);
  assert.throws(() => resolveVersions('act1autochess; rm -rf /'), /unknown version/);
  assert.equal(resolveFamilies('all'), null);
  assert.equal(resolveFamilies('roster,bonds'), 'roster,bonds');
  assert.throws(() => resolveFamilies('roster $(id)'), /families/);
});

test('golden-moved: moved, added and removed scenarios; notes are not a move', () => {
  const doc = (s) => ({ family: 'bonds', scenarios: s });
  const before = doc({ a: { about: 'x', fast: true, hp: 1 }, b: { hp: 2 }, c: { hp: 3 } });
  const after = doc({ a: { about: 'changed note', fast: false, hp: 1 }, b: { hp: 5 }, d: { hp: 4 } });
  assert.deepEqual(movedScenarios(before, after), { moved: ['b'], added: ['d'], removed: ['c'] });
  assert.deepEqual(movedScenarios(null, doc({ a: {} })), { moved: [], added: ['a'], removed: [] });
});

test('golden-moved: only changed files are collected, at their repository paths, with a summary', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'golden-moved-'));
  try {
    const before = path.join(tmp, 'before'), after = path.join(tmp, 'after'), out = path.join(tmp, 'out');
    const v1 = VERSIONS.find((v) => v.dir);
    const slug = v1.dir.split('/').filter(Boolean).pop();
    for (const d of [before, after]) mkdirSync(path.join(d, slug), { recursive: true });
    const put = (d, f, s) => writeFileSync(path.join(d, f), JSON.stringify({ scenarios: s }));
    put(before, 'roster.json', { r1: { hp: 1 } }); put(after, 'roster.json', { r1: { hp: 1 } });       // unchanged
    put(before, 'bonds.json', { b1: { hp: 1 } }); put(after, 'bonds.json', { b1: { hp: 9 } });         // moved
    put(before, `${slug}/fields.json`, { f1: {} }); put(after, `${slug}/fields.json`, { f1: {}, f2: {} }); // added
    writeFileSync(path.join(before, 'README.md'), 'not a golden file');
    const rows = compareDirs(before, after);
    const key = (r) => r[0];
    assert.deepEqual(rows.map((r) => [r.file, r.version, r.family]).sort((a, b) => key(a).localeCompare(key(b))),
      [['bonds.json', DEFAULT_VERSION, 'bonds'], [`${slug}/fields.json`, v1.id, 'fields']].sort((a, b) => key(a).localeCompare(key(b))));
    const summary = markdownSummary(rows, { ref: 'feature/x', versions: [DEFAULT_VERSION, v1.id] });
    assert.match(summary, /2 golden file\(s\) changed/);
    assert.match(summary, /`test\/golden\/bonds\.json` \| act2autochess \| bonds \| 1 \| 0 \| 0 \| `b1`/);
    assert.equal(collect(rows, after, out, summary), 2);
    assert.ok(existsSync(path.join(out, 'test', 'golden', 'bonds.json')));
    assert.ok(existsSync(path.join(out, 'test', 'golden', slug, 'fields.json')));
    assert.ok(!existsSync(path.join(out, 'test', 'golden', 'roster.json')), 'an unchanged file is left out');
    assert.ok(existsSync(path.join(out, 'golden-refresh-summary.md')));
    assert.match(markdownSummary([], {}), /No golden file changed/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
