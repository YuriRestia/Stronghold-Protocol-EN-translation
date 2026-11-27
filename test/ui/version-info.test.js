// (fork) The title screen's version and contact links (public/js/ui/about.js).
//   GitHub #98: the version line says Fish Edition and the running commit; the repository link and About point to our repository.
//   GitHub #99: "What's new" lists the latest commits (server/serverInfo.js, test/server-info.test.js).
//   GitHub #100: links that open a new issue with its form and version filled in (About, What's new, 设置 → 问题反馈).
//   Contact goes through GitHub issues: no personal address anywhere in the panel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../../shared/constants.js';
import { REPO, ISSUES_URL, versionText, newIssueUrl, linkRefs } from '../../public/js/ui/about.js';

const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('#98: the repository and the reported version are Fish Edition\'s', () => {
  assert.equal(REPO, 'https://github.com/evenifyouforget/Stronghold-Protocol-EN');
  assert.equal(ISSUES_URL, `${REPO}/issues`);
  assert.equal(versionText(null), `${APP_VERSION} Fish Edition`);
  assert.equal(versionText(false), `${APP_VERSION} Fish Edition`);
  assert.equal(versionText({ commit: '0123456789abcdef' }), `${APP_VERSION} Fish Edition (0123456)`);
  const title = read('public/js/screens/title.js');
  assert.match(title, /<a class="title-repo" href=\$\{REPO\} target="_blank" rel="noopener noreferrer">\$\{t\('项目仓库'\)\}<\/a>/);
  assert.match(title, /<\$\{VersionButton\} \/>/);
  assert.doesNotMatch(title, /sganggs\/Stronghold-Protocol"/);
});

test('#100: a new issue opens its form in the player\'s language with the version filled in', () => {
  const info = { commit: 'abcdef0123456789' };
  const v = encodeURIComponent(`${APP_VERSION} Fish Edition (abcdef0)`);
  assert.equal(newIssueUrl('bug', 'en', info), `${ISSUES_URL}/new?template=BugReport.en.yml&version=${v}`);
  assert.equal(newIssueUrl('feature', 'ja', info), `${ISSUES_URL}/new?template=FeatureRequest.en.yml&version=${v}`);
  assert.equal(newIssueUrl('bug', 'zh', info), `${ISSUES_URL}/new?template=BugReport.yml&version=${v}`);
  assert.equal(newIssueUrl('feature', 'zh-TW', null), `${ISSUES_URL}/new?template=FeatureRequest.yml&version=${encodeURIComponent(`${APP_VERSION} Fish Edition`)}`);
  // each form exists and has the field the query fills
  for (const form of ['BugReport.yml', 'BugReport.en.yml', 'FeatureRequest.yml', 'FeatureRequest.en.yml']) {
    assert.match(read(`.github/ISSUE_TEMPLATE/${form}`), /^\s+id: version$/m, form);
  }
  const settings = read('public/js/ui/settings.js');
  assert.match(settings, /import \{ ISSUES_URL, IssueLinks \} from '\.\/about\.js';/);
  assert.match(settings, /<\$\{IssueLinks\} class="set-diag__issues" \/>/);
});

test('contact is an issue on our repository, never a personal address', () => {
  const about = read('public/js/ui/about.js');
  assert.doesNotMatch(about, /mailto:|@gmail|\{email\}|yuri_pi/);
  // every language's intro and Rights holders section send people to {issues}
  const intros = [...about.matchAll(/^ {4}intro: '(.*)',$/gm)].map((m) => m[1]);
  assert.equal(intros.length, 5);
  for (const s of intros) assert.match(s, /\{issues\}/);
  const rights = [...about.matchAll(/^ {6}\['(Rights holders|权利人|權利人|権利者の方へ|권리자 안내)', '(.*)'\],$/gm)].map((m) => m[2]);
  assert.equal(rights.length, 5);
  for (const s of rights) assert.match(s, /\{issues\}/);
});

test('#99: a change links its pull request, the number GitHub appends on merge; other numbers stay text', () => {
  const [before, link, after] = linkRefs("Sync Yuri's dev-0.2: English templates (Yuri #17) (#54)");
  assert.equal(before, "Sync Yuri's dev-0.2: English templates (Yuri #17) (");
  assert.equal(link.props.href, `${REPO}/pull/54`);
  assert.equal(link.props.children, '#54');
  assert.equal(after, ')');
  assert.deepEqual(linkRefs('Merge branch main'), ['Merge branch main']);
  assert.deepEqual(linkRefs('Fixes #12 in the shop'), ['Fixes #12 in the shop']);
});
