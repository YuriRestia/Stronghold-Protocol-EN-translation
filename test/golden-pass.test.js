// (fork) tools/golden.mjs skips a plain comparison whose inputs have not changed since a passing one: the input hash
// must move with every input file, and a stored pass covers only the same inputs, version and families (a whole-corpus
// pass also covers --fast / --only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GOLDEN_INPUTS, goldenInputHash, goldenScope, coveringPass, goldenJobs, MAX_JOBS } from '../tools/golden.mjs';

function tree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-golden-pass-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const rel of GOLDEN_INPUTS) {
    if (/\.(m?js|json)$/.test(rel)) fs.writeFileSync(path.join(root, rel.replace(/\//g, '_')), '');
    else fs.mkdirSync(path.join(root, rel), { recursive: true });
  }
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools/golden.mjs'), 'one');
  fs.writeFileSync(path.join(root, 'server/sim.js'), 'tick');
  fs.mkdirSync(path.join(root, 'data/versions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/versions/a.json'), '{}');
  return root;
}

test('the input hash is stable and moves with any input file: engine, data, corpus, a new or a removed file', (t) => {
  const root = tree(t), h0 = goldenInputHash(root);
  assert.equal(goldenInputHash(root), h0, 'same tree, same hash');
  const hashes = new Set([h0]);
  const step = (what, fn) => { fn(); const h = goldenInputHash(root); assert.ok(!hashes.has(h), what); hashes.add(h); };
  step('engine file edited', () => fs.writeFileSync(path.join(root, 'server/sim.js'), 'tick2'));
  step('nested data file edited', () => fs.writeFileSync(path.join(root, 'data/versions/a.json'), '{"x":1}'));
  step('the tool edited', () => fs.writeFileSync(path.join(root, 'tools/golden.mjs'), 'two'));
  step('stored digests added', () => fs.writeFileSync(path.join(root, 'test/golden/roster.json'), '{}'));
  step('a file renamed', () => fs.renameSync(path.join(root, 'server/sim.js'), path.join(root, 'server/sim2.js')));
  step('a file removed', () => fs.rmSync(path.join(root, 'server/sim2.js')));
});

test('the repository hash covers the real inputs and takes well under the comparison it saves', () => {
  const t0 = performance.now(), h = goldenInputHash();
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(performance.now() - t0 < 30_000, 'hashing the inputs is cheap next to a 33 CPU-minute comparison');
});

test('a stored pass covers only the same inputs, version and families; a whole-corpus pass also covers a subset', () => {
  const full = goldenScope({ families: ['roster', 'bonds'] });
  const pass = { hash: 'h', ...full, at: 'then' };
  assert.equal(coveringPass('h', full, [pass]), pass);
  assert.equal(coveringPass('h', goldenScope({ families: ['bonds', 'roster'], fast: true }), [pass]), pass, 'family order, --fast');
  assert.equal(coveringPass('h', goldenScope({ families: ['roster', 'bonds'], only: new Set(['roster-001']) }), [pass]), pass, '--only');
  assert.equal(coveringPass('other', full, [pass]), null, 'changed inputs');
  assert.equal(coveringPass('h', goldenScope({ families: ['roster'] }), [pass]), null, 'other families');
  assert.equal(coveringPass('h', goldenScope({ families: ['roster', 'bonds'], version: 'act1autochess' }), [pass]), null, 'other version');
  const fastPass = { hash: 'h', ...goldenScope({ families: ['roster', 'bonds'], fast: true }) };
  assert.equal(coveringPass('h', full, [fastPass]), null, 'a --fast pass never covers the whole corpus');
});

test('golden never runs more than 4 worker threads, whatever is asked (user, 2026-11-11)', () => {
  assert.equal(MAX_JOBS, 4);
  for (const asked of [undefined, '', 'x', 0, 7, '16', 64]) assert.ok(goldenJobs(asked) >= 1 && goldenJobs(asked) <= 4, String(asked));
  assert.equal(goldenJobs(16), 4);
  assert.equal(goldenJobs(2), 2);
  assert.equal(goldenJobs(1), 1);
});
