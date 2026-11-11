// (fork) Changelog fragments (changes/README.md): every fragment is well-formed, and tools/changelog.mjs folds them
// into FORK-CHANGELOG.md in date order without touching the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFragment, foldFragments, fragmentFiles, CHANGES_DIR } from '../tools/changelog.mjs';

test('every fragment in changes/ is well-formed', () => {
  const bad = fragmentFiles().flatMap((f) => parseFragment(f, readFileSync(join(CHANGES_DIR, f), 'utf8')).errors);
  assert.deepEqual(bad, []);
});

test('a bad fragment is named with what is wrong', () => {
  const errs = (name, text) => parseFragment(name, text).errors.join(' | ');
  assert.match(errs('Bad_Name.md', '## 2026-11-11\n\n### A\n\n- b\n'), /lowercase words/);
  assert.match(errs('x.md', '### A\n\n- b\n'), /first line must be "## YYYY-MM-DD"/);
  assert.match(errs('x.md', '## 2026-02-30\n\n### A\n\n- b\n'), /a real date/);
  assert.match(errs('x.md', '## 2026-11-11\n\n- b\n'), /bullet before the first|needs at least one/);
  assert.match(errs('x.md', '## 2026-11-11\n\n### A\n\ntext only\n'), /no "- " bullet/);
  assert.match(errs('x.md', '## 2026-11-11\n\n### A\n\n- b\n\n## 2026-11-12\n'), /only one "## date" line/);
  assert.match(errs('x.md', '## 2026-11-11\r\n\r\n### A\r\n\r\n- b\r\n'), /CR line ends/);
  assert.deepEqual(parseFragment('ok-name.md', '\n## 2026-11-11\n\n### A\n\n- b\n  more\n  - nested\n\n### C\n\n- d\n'),
    { date: '2026-11-11', body: '### A\n\n- b\n  more\n  - nested\n\n### C\n\n- d', errors: [] });
});

const LOG = '# Fork changelog\n\nIntro.\n\n## 2026-11-11\n\n### Old today\n\n- x\n\n## 2026-11-09\n\n### Older\n\n- y\n';

test('fragments go to the top of their date, newest first; a new date gets its own section in date order', () => {
  const out = foldFragments(LOG, [
    { name: 'a.md', date: '2026-11-11', body: '### First added\n\n- a', order: 1 },
    { name: 'b.md', date: '2026-11-11', body: '### Added later\n\n- b', order: 2 },
    { name: 'c.md', date: '2026-11-10', body: '### Between\n\n- c', order: 3 },
    { name: 'd.md', date: '2026-11-12', body: '### Newest day\n\n- d', order: 0 },
  ]);
  assert.equal(out, '# Fork changelog\n\nIntro.\n\n## 2026-11-12\n\n### Newest day\n\n- d\n\n## 2026-11-11\n\n### Added later\n\n- b\n\n'
    + '### First added\n\n- a\n\n### Old today\n\n- x\n\n## 2026-11-10\n\n### Between\n\n- c\n\n## 2026-11-09\n\n### Older\n\n- y\n');
});

test('with no fragments FORK-CHANGELOG.md comes back byte for byte', () => {
  const t = readFileSync(new URL('../FORK-CHANGELOG.md', import.meta.url), 'utf8');
  assert.equal(foldFragments(t, []), t);
  assert.equal(foldFragments(LOG, []), LOG);
});
