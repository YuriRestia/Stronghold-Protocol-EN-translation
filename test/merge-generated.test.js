// (fork) tools/merge-generated.mjs: generated JSON (data/assets.json, the audio pool snapshot) merges entry by entry,
// so parallel branches that change different units stop conflicting (docs/ASSETS.md "Merging branches").
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeJson, mergeTexts, changedUnits, same, FILES } from '../tools/merge-generated.mjs';
import { contentHash } from '../tools/assets/manifest.mjs';
import { formatSnapshot } from '../tools/assets/pool-snapshot.mjs';

const TOOL = fileURLToPath(new URL('../tools/merge-generated.mjs', import.meta.url));

describe('mergeJson', () => {
  test('an entry only one side changed takes that side; both sides\' new entries are kept', () => {
    const base = { a: 1, units: { x: { attack: 'x1' } } };
    const ours = { a: 1, units: { x: { attack: 'x1' }, y: { attack: 'y1' } } };
    const theirs = { a: 2, units: { x: { attack: 'x2' }, z: { attack: 'z1' } } };
    const r = mergeJson(base, ours, theirs);
    assert.deepEqual(r.conflicts, []);
    assert.deepEqual(r.value, { a: 2, units: { x: { attack: 'x2' }, y: { attack: 'y1' }, z: { attack: 'z1' } } });
    assert.deepEqual(Object.keys(r.value.units), ['x', 'y', 'z'], 'ours\' key order, then theirs\' new keys');
  });

  test('a removal on one side is kept; the same change on both sides is no conflict', () => {
    const r = mergeJson({ a: 1, b: 2, c: 3 }, { a: 1, c: 4 }, { a: 1, b: 2, c: 4 });
    assert.deepEqual(r, { value: { a: 1, c: 4 }, conflicts: [] });
  });

  test('both sides changing one entry differently is a conflict (ours kept); arrays are single entries', () => {
    const r = mergeJson({ u: { list: [1, 2], n: 1 } }, { u: { list: [1, 2, 3], n: 1 } }, { u: { list: [0, 1, 2], n: 2 } });
    assert.deepEqual(r.conflicts, ['u.list']);
    assert.deepEqual(r.value, { u: { list: [1, 2, 3], n: 2 } });
  });

  test('same() ignores key order', () => {
    assert.ok(same({ a: 1, b: { c: [1, { d: 2 }] } }, { b: { c: [1, { d: 2 }] }, a: 1 }));
    assert.ok(!same({ a: [1, 2] }, { a: [2, 1] }));
  });
});

describe('data/assets.json', () => {
  const head = (body, stats) => ({ version: 1, hash: 'old', generator: 'tools/fetch-assets.mjs', stats, ...body });

  test('the merged manifest gets a fresh hash and recounted stats (files / bytes: base plus both sides\' change)', () => {
    const base = head({ chars: { a: {} } }, { files: 10, bytes: 1000, chars: 1 });
    const ours = head({ chars: { a: {}, b: {} } }, { files: 12, bytes: 1300, chars: 2 });
    const theirs = head({ chars: { a: {}, c: {} } }, { files: 11, bytes: 1050, chars: 2 });
    const { text, conflicts } = mergeTexts('data/assets.json', JSON.stringify(base), JSON.stringify(ours), JSON.stringify(theirs));
    assert.deepEqual(conflicts, []);
    assert.ok(text.endsWith('}\n') && !text.slice(0, -1).includes('\n'), 'one line, as fetch-assets writes it');
    const m = JSON.parse(text);
    assert.deepEqual(Object.keys(m).slice(0, 4), ['version', 'hash', 'generator', 'stats']);
    const { version: _v, hash, generator: _g, stats, ...body } = m;
    assert.deepEqual(body, { chars: { a: {}, b: {}, c: {} } });
    assert.equal(hash, contentHash(body));
    assert.equal(stats.chars, 3);
    assert.equal(stats.files, 13);
    assert.equal(stats.bytes, 1350);
  });

  test('the committed manifest merged with itself comes back byte for byte (hash and stats included)', () => {
    const t = readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8');
    const r = mergeTexts('data/assets.json', t, t, t);
    assert.equal(r.text, t);
    assert.deepEqual(r.conflicts, []);
  });

  test('changedUnits names units by their sound entries, models and outfits', () => {
    const a = { audio: { sfx: { units: { u1: { attack: 1 }, u2: { attack: 1 } }, outfits: { 'u3@s': { attack: 1 } } } }, chars: { u4: { spine: 1 } } };
    const b = { audio: { sfx: { units: { u1: { attack: 2 }, u2: { attack: 1 } }, outfits: { 'u3@s': { attack: 2 } } } }, chars: { u4: { spine: 2 }, u5: {} } };
    assert.deepEqual(changedUnits(a, b), ['u1', 'u3', 'u4', 'u5']);
  });
});

test('only the registered files are merged', () => {
  assert.deepEqual(Object.keys(FILES).sort(), ['data/assets.json', 'test/audio-pools-data.snapshot.json']);
  assert.throws(() => mergeTexts('data/chess.json', '{}', '{}', '{}'), /not a registered generated file/);
  const attrs = readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8');
  for (const f of Object.keys(FILES)) assert.match(attrs, new RegExp(`^${f.replace(/[.]/g, '\\.')}\\s+merge=generated-json$`, 'm'), f);
});

test('as a git merge driver: two branches that each add a unit to a one-line manifest merge without a conflict', () => {
  let gitOk = true;
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitOk = false; }
  if (!gitOk) return;
  const dir = mkdtempSync(join(tmpdir(), 'sp-merge-generated-'));
  try {
    const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 'test@example.invalid'); g('config', 'user.name', 'test'); g('config', 'core.autocrlf', 'false');
    g('config', 'merge.generated-json.driver', `node "${TOOL.replace(/\\/g, '/')}" --driver %O %A %B %P`);
    mkdirSync(join(dir, 'data')); mkdirSync(join(dir, 'test'));
    writeFileSync(join(dir, '.gitattributes'), 'data/assets.json merge=generated-json\ntest/audio-pools-data.snapshot.json merge=generated-json\n');
    const man = (units) => JSON.stringify({ version: 1, hash: 'x', generator: 'tools/fetch-assets.mjs', stats: { files: 1, bytes: 1 }, audio: { sfx: { units } } }) + '\n';
    const snap = (refs) => formatSnapshot({ refs, outfitRefs: {}, pools: {} });
    const put = (units, refs) => { writeFileSync(join(dir, 'data/assets.json'), man(units)); writeFileSync(join(dir, 'test/audio-pools-data.snapshot.json'), snap(refs)); g('add', '-A'); };
    put({ a: { attack: 'a' } }, { a: 1 }); g('commit', '-q', '-m', 'base');
    g('checkout', '-q', '-b', 'one'); put({ a: { attack: 'a' }, b: { attack: 'b' } }, { a: 1, b: 1 }); g('commit', '-q', '-m', 'one');
    g('checkout', '-q', 'main'); put({ a: { attack: 'a' }, c: { attack: 'c' } }, { a: 1, c: 1 }); g('commit', '-q', '-m', 'two');
    g('merge', '-q', '--no-edit', 'one');
    const m = JSON.parse(readFileSync(join(dir, 'data/assets.json'), 'utf8'));
    assert.deepEqual(Object.keys(m.audio.sfx.units), ['a', 'c', 'b']);
    const { version: _v, hash, generator: _g, stats: _s, ...body } = m;
    assert.equal(hash, contentHash(body));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'test/audio-pools-data.snapshot.json'), 'utf8')).refs, { a: 1, b: 1, c: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
