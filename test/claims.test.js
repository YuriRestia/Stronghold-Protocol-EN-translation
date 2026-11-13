// test/claims.test.js — (fork) sourced claims (tools/claims.mjs) and their use in tools/changelog.mjs: numbers with a
// unit and official-behaviour statements carry [src: ...] or [unverified]; the fold strips the markers; a branch's new
// [ASSUMED lines need "user OK <date>".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assumedViolations, logicalLines, stripMarkers, unsourced } from '../tools/claims.mjs';
import { foldFragments, parseFragment } from '../tools/changelog.mjs';

test('numbers with a unit need a source; ids, versions, dates, sections and code do not count', () => {
  const bad = unsourced('- It waits 0.3 s.\n- Uses 12 files.\n- About 40 % less.\n- 2× faster.\n- 1.6 KB per hello.\n');
  assert.deepEqual(bad.map((b) => b.line), [1, 2, 3, 4, 5]);
  const ok = ['- See §14 and v0.3.0, 2026-11-13, #506, line :120.', '- `ffmpeg -t 30`', '- {name:char_4247_oxi}',
    '- [link](docs/x.md#5-s)', '- Waits 0.3 s [src: server/sim/x.js:12]', '- About 40 % [unverified]', '- Three enemies.'];
  for (const l of ok) assert.deepEqual(unsourced(l), [], l);
});

test('timing-only mode ignores sizes; official mode catches behaviour claims', () => {
  assert.deepEqual(unsourced('- 12 files and 40 %', { timingOnly: true }), []);
  assert.equal(unsourced('- It fires every 1.5 seconds', { timingOnly: true }).length, 1);
  assert.equal(unsourced('- The official game plays it twice', { official: true }).length, 1);
  assert.equal(unsourced('- Official effects are on in the sandbox', { official: true }).length, 0);
  assert.equal(unsourced('- The official game plays it twice [src: official skill_table.json S2 duration]', { official: true }).length, 0);
});

test('a wrapped bullet is one logical line; table rows and paragraphs stand alone; code blocks are skipped', () => {
  const t = '- one 2 s\n  continued [src: a.js:1]\n\n| A | 1 MB |\n|---|---|\n| B | 2 MB [unverified] |\n\n```\nsleep 5 s\n```\npara 3 ms\nnext line\n';
  const u = logicalLines(t);
  assert.deepEqual(u.map((x) => x.line), [1, 4, 6, 11]);
  assert.deepEqual(unsourced(t).map((x) => x.line), [4, 11]);
});

test('stripMarkers leaves the public text', () => {
  assert.equal(stripMarkers('Fires 0.3 s apart [src: official enemy_x.json interval]. Done [unverified]'), 'Fires 0.3 s apart. Done');
});

test('a new fragment: an unsourced timing or cost number is an error; the fold strips the markers', () => {
  // the README's numbers example (every line sourced) without its markers
  const readme = readFileSync(new URL('../changes/README.md', import.meta.url), 'utf8');
  const cost = stripMarkers(/```markdown\n(Server cost:\n[\s\S]*?)```/.exec(readme)[1]).trim();
  const frag = (line, c = 'Server cost: none') => `## 2026-11-14\n\n### Thing\n\n- ${line}\n\nKind: player\n\n${c}\n`;
  const bad = parseFragment('new-thing.md', frag('It now waits 0.3 s.'));
  assert.ok(bad.errors.some((e) => /a section: "0\.3 s" has no source/.test(e)), bad.errors.join('\n'));
  const good = parseFragment('new-thing.md', frag('It now waits 0.3 s [src: official enemy_database.json interval].'));
  assert.ok(!good.errors.some((e) => /has no source/.test(e)), good.errors.join('\n'));
  assert.equal(good.body, '### Thing\n\n- It now waits 0.3 s.');
  assert.ok(!foldFragments('# Changelog\n', [{ ...good, order: 1 }]).includes('[src:'));
  const costBad = parseFragment('new-thing.md', frag('Done.', cost));
  assert.equal(costBad.cost.kind, 'numbers', costBad.errors.join('\n'));
  assert.equal(costBad.errors.filter((e) => /Server cost: ".*" has no source/.test(e)).length, 8, costBad.errors.join('\n'));
  assert.ok(parseFragment('enemy-ready-glow.md', frag('It now waits 0.3 s.')).errors.every((e) => !/has no source/.test(e)), 'fragments from before the rule are exempt');
});

test('[ASSUMED gate: a new assumption needs the user\'s dated OK; mentions of the convention pass', () => {
  const diff = ['+++ b/server/sim/x.js', '@@ -1,0 +5,5 @@', '+// [ASSUMED] the delay is 2 s', '+// [ASSUMED: same as CN] user OK 2026-11-13',
    '+- [ASSUMED]:', '+write it under [ASSUMED], and mark it', '+the form `[ASSUMED: text]` in docs', '+// [ASSUMED: guess]', '+++ b/data/config.json', '@@ -1,0 +1 @@', '+"[ASSUMED] x"'].join('\n');
  assert.deepEqual(assumedViolations(diff).map((v) => [v.file, v.line]), [['server/sim/x.js', 5], ['server/sim/x.js', 10]]);
});
