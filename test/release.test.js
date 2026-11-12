// test/release.test.js — (fork) the pure parts of the one-command release (scripts/release.mjs, release-art.mjs):
// the art diff and its gate, the CI decision, the fold-or-skip step, the sudo rewrite and the command line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseReleaseArgs, githubRepo, ciDecision, ciShips, foldPlan, foldMessage, sudoLine, DEFAULT_HOSTS,
  clipInfo, clipVerdict, stripClipStamp,
} from '../scripts/release.mjs';
import {
  parseFileList, neededArt, artPlan, differingLists, parseSha256, artGate, urlToPath, SHARED_LISTS, PUBLIC_FILE_LIMIT,
} from '../scripts/release-art.mjs';
import { prepareCommand, statusCommand, sudoCheckCommand } from '../scripts/deploy-regions.mjs';
import {
  nextNewsId, draftNewsLines, draftNews, editorText, parseEditorText, newsFromEdit, builtInNews, newsFile,
} from '../scripts/release-news.mjs';
import { newsProblems, NEWS_MAX_POINTS } from '../shared/news.js';

describe('art diff (release-art.mjs)', () => {
  const manifest = { ops: { a: { img: '/assets/a.png', voice: ['/assets/v%20b.ogg?x=1'] } }, font: '/fonts/f.woff2', other: 'https://x/y.png', n: 3 };

  test('the server list parses path and size, tabs inside a name kept, junk lines skipped', () => {
    const m = parseFileList('public/assets/a.png\t10\r\npublic/assets/b\tc.png\t7\n\nnot a line\npublic/x\tNaN\n');
    assert.deepEqual([...m], [['public/assets/a.png', 10], ['public/assets/b\tc.png', 7]]);
  });

  test('needed: every /assets/ and /fonts/ URL (decoded, query dropped) plus the PC\'s local files', () => {
    assert.equal(urlToPath('/assets/v%20b.ogg?x=1'), 'public/assets/v b.ogg');
    const need = neededArt(manifest, ['public/assets/local/fx/x.png']);
    assert.deepEqual([...need].sort(), ['public/assets/a.png', 'public/assets/local/fx/x.png', 'public/assets/v b.ogg', 'public/fonts/f.woff2']);
  });

  test('plan: missing and other-size files go, same-size stay, nowhere stops, kept files never go', () => {
    const needed = ['public/assets/new.ogg', 'public/assets/same.png', 'public/assets/resized.png', 'public/assets/gone.png',
      'public/assets/spine/op/char_4247_oxi/front/x.skel', 'public/assets/server-only.png', 'public/assets/local/fx/index.json'];
    const pc = new Map([['public/assets/new.ogg', 5], ['public/assets/same.png', 9], ['public/assets/resized.png', 4],
      ['public/assets/spine/op/char_4247_oxi/front/x.skel', 100], ['public/assets/local/fx/index.json', 50], ['data/local-fx.json', 70]]);
    const server = new Map([['public/assets/same.png', 9], ['public/assets/resized.png', 3], ['public/assets/server-only.png', 1],
      ['public/assets/spine/op/char_4247_oxi/front/x.skel', 90], ['public/assets/local/fx/index.json', 50]]);
    const p = artPlan({ needed, pc, server, listsDiffer: ['data/local-fx.json'] });
    assert.deepEqual(p.upload, ['data/local-fx.json', 'public/assets/new.ogg', 'public/assets/resized.png']);
    assert.equal(p.bytes, 70 + 5 + 4);
    assert.deepEqual(p.nowhere, ['public/assets/gone.png']);
    assert.deepEqual(p.kept, ['public/assets/spine/op/char_4247_oxi/front/x.skel']);
    assert.ok(!p.upload.includes('public/assets/local/fx/index.json'), 'a shared list goes by content, not by size');
  });

  test('a kept file the server lacks altogether is uploaded', () => {
    const f = 'public/assets/spine/enemy/enemy_10138_xdsnow/a.png';
    assert.deepEqual(artPlan({ needed: [f], pc: new Map([[f, 2]]), server: new Map() }).upload, [f]);
  });

  test('lists: by sha256, both sides; a list missing on the PC never goes', () => {
    const sums = parseSha256(`${'a'.repeat(64)}  data/local-fx.json\n${'b'.repeat(64)} *data/clip-bounds.json\r\nsha256sum: x: No such file\n`);
    assert.deepEqual(sums, { 'data/local-fx.json': 'a'.repeat(64), 'data/clip-bounds.json': 'b'.repeat(64) });
    const pc = { 'data/local-fx.json': 'a'.repeat(64), 'data/local-assets.json': 'c'.repeat(64), 'public/assets/local/fx/index.json': undefined };
    assert.deepEqual(differingLists(pc, sums), ['data/local-assets.json']);
    assert.equal(SHARED_LISTS.length, 4);
  });

  test('gate: missing URLs and the preloader file limit', () => {
    const full = new Map([['public/assets/a.png', 1], ['public/assets/v b.ogg', 1], ['public/fonts/f.woff2', 1]]);
    assert.deepEqual(artGate(manifest, full, 100), { missing: [], publicFiles: 100, ok: true, problems: [] });
    const g = artGate(manifest, new Map([['public/assets/a.png', 1], ['public/assets/v b.ogg', 0]]), PUBLIC_FILE_LIMIT);
    assert.equal(g.ok, false);
    assert.deepEqual(g.missing.sort(), ['/assets/v%20b.ogg?x=1', '/fonts/f.woff2'], 'a zero-size file counts as missing, as in prepare');
    assert.equal(g.problems.length, 2);
  });
});

describe('clip bounds', () => {
  const head = (t) => `{"format":1,"step":4,"generated":"${t}","count":1410,"clips":13670,"names":[]}`;

  test('the same table made at another time is the same; a newer different server table is kept', () => {
    assert.deepEqual(clipInfo(head('2026-11-09T16:42:21.888Z')), { generated: '2026-11-09T16:42:21.888Z', count: 1410, clips: 13670 });
    assert.deepEqual(clipInfo('garbage'), {});
    assert.equal(stripClipStamp(head('a')), stripClipStamp(head('b')));
    assert.equal(clipVerdict({ sum: 'x', generated: '2026-11-09' }, { sum: 'x', generated: '2026-11-10' }), 'same');
    assert.equal(clipVerdict({ sum: 'x', generated: '2026-11-09' }, { sum: 'y', generated: '2026-11-10' }), 'server-newer');
    assert.equal(clipVerdict({ sum: 'x', generated: '2026-11-12' }, { sum: 'y', generated: '2026-11-10' }), 'upload');
    assert.equal(clipVerdict({ sum: 'x', generated: '2026-11-12' }, {}), 'upload', 'none on the server');
  });
});

describe('CI decision', () => {
  const run = (o) => ({ headSha: 'abc', event: 'push', status: 'completed', conclusion: 'success', workflowName: 'CI', createdAt: '2026-11-13T01:00:00Z', url: 'u', ...o });

  test('none / running / green / red', () => {
    assert.equal(ciDecision([], 'abc').state, 'none');
    assert.equal(ciDecision([run({ headSha: 'other' }), run({ event: 'workflow_dispatch' })], 'abc').state, 'none', 'other commits and manual runs do not count');
    assert.equal(ciDecision([run({}), run({ workflowName: 'Py', status: 'in_progress', conclusion: '' })], 'abc').state, 'running');
    assert.equal(ciDecision([run({}), run({ workflowName: 'Py', conclusion: 'skipped' })], 'abc').state, 'green');
    const red = ciDecision([run({}), run({ workflowName: 'Py', conclusion: 'failure' })], 'abc');
    assert.equal(red.state, 'red');
    assert.deepEqual(red.failed, ['Py (failure)']);
  });

  test('the newest run of a workflow wins (a re-run after a failure)', () => {
    const d = ciDecision([run({ conclusion: 'failure', createdAt: '2026-11-13T01:00:00Z' }), run({ createdAt: '2026-11-13T02:00:00Z' })], 'abc');
    assert.equal(d.state, 'green');
    assert.equal(d.runs.length, 1);
  });

  test('ships on green, on --skip-ci, or on a typed override only', () => {
    assert.equal(ciShips('green'), true);
    for (const s of ['red', 'running', 'none', 'timeout']) {
      assert.equal(ciShips(s), false, s);
      assert.equal(ciShips(s, { override: true }), true, `${s} overridden`);
      assert.equal(ciShips(s, { skipCi: true }), true, `${s} skipped`);
    }
  });
});

describe('fold or skip', () => {
  test('no fragment: says so and goes on; fragments: folds them', () => {
    assert.deepEqual(foldPlan([]), { fold: false, say: 'changelog: nothing to fold (no fragments in changes/)' });
    const p = foldPlan(['a.md', 'b.md']);
    assert.equal(p.fold, true);
    assert.match(p.say, /2 fragment\(s\) to fold: a\.md, b\.md/);
  });

  test('the fold commit message is one line', () => {
    assert.equal(foldMessage(1, '2026-11-13'), 'Fold 1 changelog fragment into FORK-CHANGELOG for the 2026-11-13 release');
    assert.ok(!foldMessage(3, '2026-11-13').includes('\n'));
  });
});

describe('sudo over ssh', () => {
  test('a host with a password reads it on stdin; one without never prompts', () => {
    const line = prepareCommand({ gen: '261113-0100-ab', commit: 'c0ffee', noArt: true });
    assert.match(sudoLine(line, true), /^sudo -S -p '' bash -c '/);
    assert.match(sudoLine(line, false), /^sudo -n bash -c '/);
    assert.match(sudoLine(sudoCheckCommand('g'), true), /^sudo -S -p '' bash -c/);
    assert.equal(sudoLine(statusCommand(), false).startsWith('sudo -n bash'), true);
    assert.equal(sudoLine('cd /x && ls', true), 'cd /x && ls', 'no leading sudo: unchanged');
    assert.equal(sudoLine("sudo -u stronghold ls", true), "sudo -u stronghold ls", 'another sudo option: unchanged');
  });

  test('the password is never part of the command line', () => {
    assert.ok(!sudoLine(statusCommand(), true).includes('secret'));
  });
});

describe('command line', () => {
  test('defaults and options', () => {
    const o = parseReleaseArgs([], {});
    assert.equal(o.dryRun, false);
    assert.equal(o.ciTimeoutMin, 45);
    assert.deepEqual(o.hosts, [{ host: 'spa', noArt: false }, { host: 'usspa', noArt: true }]);
    assert.equal(DEFAULT_HOSTS, 'spa,usspa:no-art');
    const d = parseReleaseArgs(['--dry-run', '--skip-ci', '--ci-timeout', '20', '--hosts', 'a,b:no-art'], {});
    assert.deepEqual([d.dryRun, d.skipCi, d.ciTimeoutMin, d.hosts.length], [true, true, 20, 2]);
    assert.equal(parseReleaseArgs([], { SP_DEPLOY_HOSTS: 'x' }).hosts[0].host, 'x');
  });

  test('refusals', () => {
    assert.match(parseReleaseArgs(['--activate'], {}).error, /unknown option/);
    assert.match(parseReleaseArgs(['--ci-timeout'], {}).error, /needs a value/);
    assert.match(parseReleaseArgs(['--ci-timeout', '0'], {}).error, /minutes/);
    assert.match(parseReleaseArgs(['--hosts', 'a;rm'], {}).error, /not an ssh host/);
  });

  test('the fork from origin', () => {
    assert.equal(githubRepo('https://github.com/YuriRestia/Stronghold-Protocol-EN-translation.git'), 'YuriRestia/Stronghold-Protocol-EN-translation');
    assert.equal(githubRepo('git@github.com:o/r.git'), 'o/r');
    assert.equal(githubRepo('https://example.com/o/r'), null);
  });
});

describe('update news draft (release-news.mjs)', () => {
  test('the real built-in banner reads back in English, every line translated', () => {
    const root = new URL('..', import.meta.url);
    const b = builtInNews(readFileSync(new URL('public/js/ui/matchSearch.js', root), 'utf8'), JSON.parse(readFileSync(new URL('public/i18n/en.json', root), 'utf8')));
    assert.ok(b && b.langs.en.highlights.length && b.langs.en.points.length);
    for (const l of [...b.langs.en.highlights, ...b.langs.en.points]) assert.doesNotMatch(l, /[\u4e00-\u9fff]/, l);
    assert.deepEqual(newsProblems(newsFromEdit({ id: nextNewsId(b.id), title: 'Update', ...b.langs.en })), []);
  });

  const frag = (name, ...heads) => ({ name, text: `## 2026-11-13\n\n${heads.map((h) => `### ${h}\n\n- x\n`).join('\n')}\nServer cost: none\n` });

  test('the id follows the version bump pattern, from the live news or the built-in id', () => {
    assert.equal(nextNewsId('0.3.4-2'), '0.3.4-3');
    assert.equal(nextNewsId('0.3.4'), '0.3.4-1');
    assert.equal(builtInNews('nothing', {}), null);
    const src = "export const UPDATE_NEWS_ID = '0.3.4-2';\nconst UPDATE_HIGHLIGHTS = [\n  N_('新'), // en\n];\nconst UPDATE_POINTS = [\n  N_('点\\'一'),\n  N_('无译'),\n];\n";
    const b = builtInNews(src, { '新': 'New', "点'一": "Point's one" });
    assert.deepEqual(b, { id: '0.3.4-2', langs: { en: { highlights: ['New'], points: ["Point's one", '无译'] } } });
    assert.equal(draftNews(b, []).id, '0.3.4-3');
    assert.equal(draftNews(null, []).id, '0-1');
    assert.equal(newsFile('0.3.4-3'), 'logs/news-0.3.4-3.json');
  });

  test('draft: fragment headings first, backend-only ones set aside, the live points after, cut to the limit', () => {
    const { points, skipped } = draftNewsLines([frag('a.md', 'A quick start keeps your custom squad', "The fork's online checks (GitHub CI) pass again"), frag('b.md', 'A quick start keeps your custom squad', 'Golden files refresh')]);
    assert.deepEqual(points, ['A quick start keeps your custom squad']);
    assert.deepEqual(skipped.map((s) => s.name), ['a.md', 'b.md']);
    const old = Array.from({ length: 16 }, (_, i) => `old ${i}`);
    const live = { id: '0.3.4-5', langs: { en: { title: 'Update 0.3.4-5', highlights: ['H'], points: old }, ja: { title: 'J', points: ['j'] } } };
    const d = draftNews(live, [frag('c.md', 'New one', 'old 3')]);
    assert.deepEqual([d.id, d.title, d.highlights, d.fresh], ['0.3.4-6', 'Update 0.3.4-6', ['H'], 2]);
    assert.deepEqual(d.points.slice(0, 3), ['New one', 'old 3', 'old 0']);
    assert.equal(d.points.length, NEWS_MAX_POINTS);
    assert.deepEqual(d.cut, ['old 15'], 'old 3 moved up, not repeated');
  });

  test('the Notepad text round-trips; notes, bullets, a BOM and CRLF are fine', () => {
    const d = { id: '0.3.4-3', title: 'Update 0.3.4-3', highlights: ['<@sp.leaf>Talulah</> joins'], points: ['One', 'Two'], cut: ['Three'], skipped: [{ line: 'CI', name: 'x.md' }] };
    const text = editorText(d, ['a problem']);
    assert.match(text, /Wording rules/);
    assert.match(text, /# PROBLEMS/);
    const e = parseEditorText(String.fromCharCode(0xFEFF) + text.replace('One', '- One'));
    assert.deepEqual(e, { id: '0.3.4-3', title: 'Update 0.3.4-3', highlights: ['<@sp.leaf>Talulah</> joins'], points: ['One', 'Two'] });
    const news = newsFromEdit(e);
    assert.deepEqual(Object.keys(news.langs), ['en'], 'English only: the other languages fall back to it');
    assert.deepEqual(newsProblems(news), []);
    assert.ok(newsProblems(newsFromEdit({ ...e, id: '' })).length, 'a missing id is refused');
  });
});
