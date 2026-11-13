// test/doc-map.test.js — (fork) docs/doc-map.json stays true: every mapped doc and heading exists, every path glob
// matches at least one tracked file, every major code area has an entry, and every server-cost fact names a source
// doc that exists. A rename that breaks the map fails here; fix the map in the same branch (AGENTS.md "Read first").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entriesFor, globRe, loadDocMap, requiredSections, sectionRange } from '../tools/doc-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = loadDocMap(ROOT);
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);

/** Code areas that must each have at least one entry (one sample file per area). */
const AREAS = ['server/sim/Battle.js', 'server/sim/content/kits', 'server/sim/content/enemies', 'server/sim/content/bonds', 'server/match/bot.js',
  'server/match/match', 'server/lobby.js', 'server/http', 'shared/protocol.js', 'public/js/battle', 'public/js/render/vfx', 'public/js/render',
  'public/js/ui', 'public/js/screens', 'public/js/audio.js', 'public/js/assets.js', 'public/i18n', 'data', 'tools/assets', 'tools/changelog.mjs',
  'changes', '.github/workflows'];

test('the map is well formed', () => {
  assert.equal(map.version, 1);
  const ids = new Set();
  for (const e of map.entries) {
    assert.match(e.id, /^[a-z0-9-]+$/, `id ${e.id}`);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.paths.length && e.read.length && e.why, `${e.id}: paths, read and why`);
    for (const r of e.read) assert.ok(r.headings.length, `${e.id}: ${r.doc} names headings`);
  }
});

test('every mapped doc and heading exists (headings are exact heading lines)', () => {
  const missing = [];
  for (const e of map.entries) {
    for (const r of e.read) {
      if (!existsSync(join(ROOT, r.doc))) { missing.push(`${e.id}: ${r.doc} (no such doc)`); continue; }
      const text = readFileSync(join(ROOT, r.doc), 'utf8');
      for (const h of r.headings) if (!sectionRange(text, h)) missing.push(`${e.id}: ${r.doc} has no heading ${JSON.stringify(h)}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every path glob matches at least one tracked file', () => {
  const dead = [];
  for (const e of map.entries) for (const g of e.paths) if (!tracked.some((f) => globRe(g).test(f))) dead.push(`${e.id}: ${g}`);
  assert.deepEqual(dead, []);
});

test('every major code area has an entry', () => {
  const bare = [];
  for (const a of AREAS) {
    const files = tracked.filter((f) => f === a || f.startsWith(`${a}/`));
    assert.ok(files.length, `the area sample ${a} still exists (update AREAS if it moved)`);
    if (!files.some((f) => entriesFor(map, f).length)) bare.push(a);
  }
  assert.deepEqual(bare, []);
});

test('every server-cost fact names a source doc that exists', () => {
  const facts = map.facts['server-cost'];
  assert.ok(facts.length >= 3);
  for (const f of facts) {
    const docs = f.src.match(/[\w./-]+\.(?:md|mjs|js)/g) || [];
    assert.ok(docs.length, `fact without a source path: ${f.fact}`);
    for (const d of docs) assert.ok(existsSync(join(ROOT, d)), `${d} (source of: ${f.fact.slice(0, 60)}...)`);
  }
});

test('globs and section ranges', () => {
  assert.ok(globRe('server/**').test('server/a/b.js'));
  assert.ok(globRe('server/sim/*.js').test('server/sim/Battle.js'));
  assert.ok(!globRe('server/sim/*.js').test('server/sim/content/x.js'));
  assert.ok(globRe('public/js/render/**/x.js').test('public/js/render/x.js'));
  const text = '# T\n## A\na\n```\n## not a heading\n```\n### A1\nb\n## B\nc\n';
  assert.deepEqual(sectionRange(text, '## A'), { start: 2, end: 8 });
  assert.deepEqual(sectionRange(text, '### A1'), { start: 7, end: 8 });
  assert.deepEqual(sectionRange(text, '## B'), { start: 9, end: 11 });
  assert.equal(sectionRange(text, '## C'), null);
  const secs = requiredSections(ROOT, 'public/js/render/vfx/system.js', map);
  assert.ok(secs.some((s) => s.doc === 'docs/design/vfx-format.md' && s.start > 0), 'the vfx runtime maps to its format doc');
});
