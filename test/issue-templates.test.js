// GitHub #693: a submitted issue must carry the version the reporter is on. The shields.io badge
// stays in the checklist as a hint of the version on our main (#79); it is not that field.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = ['BugReport.yml', 'FeatureRequest.yml'];

function versionBlock(src) {
  const parts = src.split(/\n  - type: /).slice(1);
  return parts.find((b) => b.startsWith('input\n') && b.includes('label: 版本号')) || '';
}

for (const file of FILES) {
  test(`${file}: required 版本号, badge kept as a hint`, () => {
    const src = readFileSync(new URL(`../.github/ISSUE_TEMPLATE/${file}`, import.meta.url), 'utf8');
    const field = versionBlock(src);
    assert.match(field, /^input\n/);
    assert.match(field, /\n    id: version\n/);
    assert.match(field, /\n      label: 版本号\n/);
    assert.match(field, /标题画面角落/);
    assert.match(field, /发布压缩包的文件名/);
    assert.match(field, /git rev-parse --short HEAD/);
    assert.match(field, /只作对照/);
    assert.match(field, /\n    validations:\n      required: true$/);
    assert.doesNotMatch(field, /shields\.io/);
    assert.match(src, /img\.shields\.io\/github\/package-json\/v\/evenifyouforget\/Stronghold-Protocol-EN\/main/);
  });
}

// (fork) the English forms (BugReport.en.yml, FeatureRequest.en.yml) ask for the version the same way
function versionBlockEn(src) {
  const parts = src.split(/\n  - type: /).slice(1);
  return parts.find((b) => b.startsWith('input\n') && b.includes('label: Version')) || '';
}

for (const file of ['BugReport.en.yml', 'FeatureRequest.en.yml']) {
  test(`${file}: required Version, badge kept as a hint`, () => {
    const src = readFileSync(new URL(`../.github/ISSUE_TEMPLATE/${file}`, import.meta.url), 'utf8');
    const field = versionBlockEn(src);
    assert.match(field, /^input\n/);
    assert.match(field, /\n    id: version\n/);
    assert.match(field, /corner of the title screen/);
    assert.match(field, /file name of the release zip/);
    assert.match(field, /git rev-parse --short HEAD/);
    assert.match(field, /only for comparison/);
    assert.match(field, /\n    validations:\n      required: true$/);
    assert.doesNotMatch(field, /shields\.io/);
    assert.match(src, /img\.shields\.io\/github\/package-json\/v\/evenifyouforget\/Stronghold-Protocol-EN\/main/);
  });
}
