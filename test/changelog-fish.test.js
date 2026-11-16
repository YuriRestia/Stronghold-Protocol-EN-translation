// (fork, GitHub #158) Fish Edition changelog fragments: the format check, the fold, the served changelog, and the
// fragments in the repo (each with its other language).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkFragment, foldFragments, readFragments, changelogWithFragments } from '../server/changelogFish.js';
import { problems, folded } from '../tools/changelog-fish.mjs';

const LOG = `# 更新日志

## 0.3.4（开发中）

### Fish Edition

在 0.3.3 之上的改动：

- 旧条目一（#140）。
- 旧条目二（#141）。

### 其他

- 别的。

## 0.3.3

### Fish Edition

- 更早（#100）。
`;

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clfish-'));

test('a fragment is bullets with indented continuations, nothing else', () => {
  assert.equal(checkFragment('- one (#1).\n- two\n  continued.\n'), null);
  assert.match(checkFragment('### heading\n- x'), /must start/);
  assert.match(checkFragment('- x\nloose line'), /neither a bullet/);
  assert.match(checkFragment(''), /must start/);
});

test('fold: newest pull request first, at the top of the first version\'s Fish Edition list only', () => {
  const out = foldFragments(LOG, [{ text: '- 新 B（#160）。' }, { text: '- 新 A（#159）。\n  续行。' }]);
  const lines = out.split('\n');
  const i = lines.indexOf('- 新 B（#160）。');
  assert.deepEqual(lines.slice(i, i + 4), ['- 新 B（#160）。', '- 新 A（#159）。', '  续行。', '- 旧条目一（#140）。']);
  assert.ok(out.indexOf('新 B') < out.indexOf('## 0.3.3'));
  assert.equal(out.split('新 B').length, 2);
  assert.ok(out.endsWith('- 更早（#100）。\n'));
});

test('fold: a Fish Edition section without bullets gets them after its intro; no section → null', () => {
  const bare = '# x\n\n## 1\n\n### Fish Edition\n\nIntro.\n\n### Other\n\n- y\n';
  assert.equal(foldFragments(bare, [{ text: '- n (#2).' }]), '# x\n\n## 1\n\n### Fish Edition\n\nIntro.\n\n- n (#2).\n\n### Other\n\n- y\n');
  assert.equal(foldFragments('# x\n\n## 1\n\n### Other\n\n- y\n', [{ text: '- n' }]), null);
  assert.equal(foldFragments(LOG, []), LOG);
});

test('readFragments: one language, sorted by PR, skipping README and listing bad ones', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'README.md'), '# not a fragment');
  fs.writeFileSync(path.join(d, '150-a.md'), '- 甲（#150）。\n');
  fs.writeFileSync(path.join(d, '150-a.en.md'), '- A (#150).\n');
  fs.writeFileSync(path.join(d, '161-b.md'), '- 乙（#161）。\n');
  fs.writeFileSync(path.join(d, '161-b.en.md'), 'oops\n');
  const zh = readFragments(d, 'zh'), en = readFragments(d, 'en');
  assert.deepEqual(zh.fragments.map((f) => f.file), ['161-b.md', '150-a.md']);
  assert.deepEqual(en.fragments.map((f) => f.file), ['150-a.en.md']);
  assert.deepEqual(en.bad.map((b) => b.file), ['161-b.en.md']);
  assert.ok(problems(d).some((p) => p.startsWith('161-b.en.md')));
  assert.equal(changelogWithFragments(LOG, path.join(d, 'missing'), 'zh'), LOG);
  assert.match(changelogWithFragments(LOG, d, 'zh'), /- 乙（#161）。\n- 甲（#150）。\n- 旧条目一/);
});

test('problems: a fragment without its other language, a stray file', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, '170-x.md'), '- x\n');
  fs.writeFileSync(path.join(d, 'Notes.txt'), 'x');
  const p = problems(d);
  assert.ok(p.some((x) => /170-x\.md: no English/.test(x)));
  assert.ok(p.some((x) => /^Notes\.txt/.test(x)));
});

test('the repo\'s changes-fish/ fragments are well formed, paired, and fold into both changelogs', () => {
  assert.deepEqual(problems(), []);
  const out = folded();
  for (const lang of ['zh', 'en']) {
    for (const f of readFragments(path.resolve('changes-fish'), lang).fragments) assert.ok(out[lang].includes(f.text), f.file);
  }
});
