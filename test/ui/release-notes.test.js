// (fork) changelogPath below: a Chinese page reads the original, any other the English translation
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../../shared/constants.js';
import { releaseSections, forkReleaseSections, releaseLink, changelogPath } from '../../public/js/ui/releaseNotesModel.js';

test('release sections start at the running version, excluding future notes and code headings', () => {
  const log = '## 0.3.4 — 未发布\nFuture\n## 0.3.3 — today\n### Fixes\n- a\n```\n## 1.0.0 — example\n```\n## 0.3.2 — yesterday\nOld';
  const sections = releaseSections(log, '0.3.3');
  assert.deepEqual(sections.map((s) => s.version), ['0.3.3', '0.3.2']);
  assert.match(sections[0].body, /## 1.0.0/);
  assert.deepEqual(releaseSections(log, '9.0.0'), []);
  assert.equal(releaseSections(readFileSync('CHANGELOG.md', 'utf8'), APP_VERSION)[0].version, APP_VERSION);
});

test('release links reject active content and resolve repository docs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', '#anchor']) assert.equal(releaseLink(url), null);
  assert.equal(releaseLink('https://prts.wiki/w/机制'), 'https://prts.wiki/w/%E6%9C%BA%E5%88%B6');
  assert.equal(releaseLink('docs/PLAYING.md'), 'https://github.com/sganggs/Stronghold-Protocol/blob/master/docs/PLAYING.md');
});

test('(fork) the changelog a language reads', () => {
  for (const l of ['zh', 'zh-TW']) assert.equal(changelogPath(l), '/CHANGELOG.md');
  for (const l of ['en', 'ja', 'ko']) assert.equal(changelogPath(l), '/CHANGELOG.en.md');
});

test('(fork) the panel shows the unreleased section first, without its In development part', () => {
  const log = '## 0.3.4 — Unreleased\n### Fish Edition\n- a\n### In development (not released with the version)\n- dev\n### Merged PRs\n- b\n## 0.3.3 — today\n- c\n## 0.3.2 — yesterday\nOld';
  const sections = forkReleaseSections(log, '0.3.3');
  assert.deepEqual(sections.map((s) => s.version), ['0.3.4', '0.3.3', '0.3.2']);
  assert.match(sections[0].body, /Fish Edition[\s\S]*- a[\s\S]*Merged PRs[\s\S]*- b/);
  assert.doesNotMatch(sections[0].body, /In development|- dev/);
  assert.deepEqual(forkReleaseSections(log, '0.3.4').map((s) => s.version), ['0.3.4', '0.3.3', '0.3.2']);
  assert.deepEqual(forkReleaseSections('## 0.4.0 — 2027-01-01\nx\n## 0.3.3 — today\ny', '0.3.3').map((s) => s.version), ['0.3.3'], 'a released newer section is not shown');
  assert.deepEqual(forkReleaseSections(log, '9.0.0'), []);
  for (const [file, dev] of [['CHANGELOG.md', /^### 开发中/m], ['CHANGELOG.en.md', /^### In development/m]]) {
    const real = forkReleaseSections(readFileSync(file, 'utf8'), APP_VERSION);
    assert.match(real[0].body, /^### Fish Edition$/m, file);
    // only an unreleased section ahead of the running version hides its development part; once released (0.3.4-3) it is the shipped section
    if (/— (?:未发布|Unreleased)\s*$/.test(real[0].title)) assert.doesNotMatch(real[0].body, dev, file);
    assert.ok(real.some((s) => s.version === APP_VERSION), file);
  }
});
