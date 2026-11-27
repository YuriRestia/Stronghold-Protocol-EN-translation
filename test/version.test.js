// Release metadata: one version everywhere (package.json, package-lock.json, shared/constants.js APP_VERSION shown on
// the title screen, the server banner and /healthz), the GPL-3.0-or-later licence (LICENSE, package.json, lockfile) and
// the notice files the README and the release bundle point at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, PROTOCOL_VERSION, DEV_BUILD } from '../shared/constants.js';
import { isDevVersion } from '../tools/package.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('one release version: package.json, package-lock.json and APP_VERSION', () => {
  // a release x.y.z (or x.y.z-N, the fork's numbered updates: 0.3.4-3, Fish's decision of 2026-11-19), or x.y.z-dev on the public
  // dev branch (the owner's decision of 2026-10-06)
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+(-\d+|-dev)?$/);
  assert.equal(DEV_BUILD, APP_VERSION.endsWith('-dev'));
  assert.equal(pkg.version, APP_VERSION);
  assert.equal(lock.version, APP_VERSION);
  assert.equal(lock.packages[''].version, APP_VERSION);
  assert.equal(PROTOCOL_VERSION, 1, 'the wire protocol number is separate from the release version');
  assert.equal(pkg.private, true, 'never published to npm');
});

test('CHANGELOG.md opens with the release version, and the README links it', () => {
  const log = read('CHANGELOG.md');
  const first = log.match(/^## (\d+\.\d+\.\d+(?:-\d+)?) — (\d{4}-\d{2}-\d{2})/m);
  assert.ok(first, 'a "## x.y.z — date" (or "## x.y.z-N — date") heading');
  if (DEV_BUILD) {
    // a dev build has no entry of its own yet: the newest one is the last release, older than the version in development
    const num = (v) => v.split(/[.-]/).slice(0, 3).map(Number);
    const [a, b] = [num(first[1]), num(APP_VERSION)];
    assert.ok(a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2]))), `the newest entry ${first[1]} precedes ${APP_VERSION}`);
  } else assert.equal(first[1], APP_VERSION, 'the newest entry is the current version');
  assert.match(log, /^## 0\.1\.0 — 2026-10-02/m, 'the first public release stays listed');
  const readme = read('README.md');
  assert.match(readme, /\[CHANGELOG\.md\]\(CHANGELOG\.md\)/);
  // shields.io escapes a '-' inside a badge field as '--'
  assert.match(readme, new RegExp(`badge/version-${APP_VERSION.replace(/-/g, '--').replace(/\./g, '\\.')}-`), 'the README badge');
});

test('the release version is what players see', () => {
  // (fork, GitHub #98) the footer's version line is ui/about.js VersionButton
  assert.match(read('public/js/screens/title.js'), /<\$\{VersionButton\} \/>/, 'title screen footer');
  assert.match(read('public/js/ui/about.js'), /v\$\{APP_VERSION\}/, 'title screen footer');
  assert.ok(!/PROTOCOL v1/.test(read('public/js/screens/title.js')), 'no protocol number posing as a version');
  // the server's entry is server/index.js; the banner and /healthz live in server/http/ (boot.js, routes.js)
  assert.match(read('server/http/boot.js'), /Stronghold Protocol: Alliance v\$\{APP_VERSION\}/, 'boot banner');
  assert.match(read('server/http/routes.js'), /app: APP_VERSION/, '/healthz');
});

test('the English title is the official one: Stronghold Protocol: Alliance (as in the reply to GitHub issue #38, which stays open)', () => {
  // EN client data, activity_table basicInfo.act2autochess.name = "Stronghold Protocol: Alliance" (CN 卫戍协议:盟约);
  // the project used to call it "Covenant". The Chinese title stays 卫戍协议：盟约; the repository keeps its name.
  const readme = read('README.md');
  assert.match(readme.split('\n')[0], /^# 卫戍协议：盟约 · Stronghold Protocol: Alliance$/, 'README title');
  assert.match(readme, /mode \*Stronghold Protocol: Alliance\*/, 'README English summary');
  assert.match(read('server/http/boot.js'), /卫戍协议：盟约 · Stronghold Protocol: Alliance v/, 'boot banner');
  assert.equal(pkg.name, 'stronghold-protocol-alliance');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.packages[''].name, pkg.name);
  for (const f of ['README.md', 'server/index.js', 'server/http/boot.js', 'package.json', 'package-lock.json', 'NOTICE.md', 'public/index.html', 'docs/DEPLOY.md']) {
    assert.ok(!/covenant/i.test(read(f)), `${f}: no "Covenant" title left`);
  }
});

test('GPL-3.0-or-later: LICENSE, package metadata and notices', () => {
  const license = read('LICENSE');
  assert.match(license.slice(0, 200), /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.equal(pkg.license, 'GPL-3.0-or-later');
  assert.equal(lock.packages[''].license, 'GPL-3.0-or-later');
  assert.match(pkg.repository.url, /github\.com\/sganggs\/Stronghold-Protocol/);
  for (const f of ['NOTICE.md', 'THIRD-PARTY-NOTICES.md', 'tools/local-extract/LICENSE-Ark-Unpacker.txt']) {
    assert.ok(existsSync(join(ROOT, f)), f);
  }
  const notice = read('NOTICE.md');
  assert.match(notice, /GPL-3\.0-or-later/);
  assert.match(notice, /非商业/);
  assert.match(notice, /section 7/, 'the Spine Runtimes linking permission');
  const aklz4 = read('tools/local-extract/aklz4.py');
  assert.match(aklz4, /SPDX-License-Identifier: BSD-3-Clause/);
  assert.match(aklz4, /Copyright \(c\) 2022, Harry Huang/);
});

test('a development build says so everywhere a player or a host looks, and never packages as a release', () => {
  if (!DEV_BUILD) return;
  const readme = read('README.md');
  assert.match(readme.split('\n').slice(0, 8).join('\n'), /开发版（dev 分支）：不稳定，请勿用于公开服务器/, 'the README warns right under the title');
  assert.match(read('public/js/screens/title.js'), /DEV_BUILD \? html`<span class="title-dev"/, 'the title screen footer carries the dev tag');
  assert.match(read('server/http/boot.js'), /if \(DEV_BUILD\) console\.log\(/, 'the boot banner warns the host');
  assert.ok(isDevVersion(APP_VERSION) && !isDevVersion('0.1.4'), 'tools/package.mjs treats the version as a development one');
  assert.match(read('tools/package.mjs'), /isDevVersion\(p\.version\) && !o\.allowDev/, 'packaging a dev version needs --allow-dev');
});
