// test/release.test.js — (fork) the pure parts of the one-command release (scripts/release.mjs, release-art.mjs):
// the art diff and its gate, the CI decision, the fold-or-skip step, the sudo rewrite and the command line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseReleaseArgs, githubRepo, ciDecision, ciShips, foldPlan, foldMessage, sudoLine, DEFAULT_HOSTS,
  clipInfo, clipVerdict, stripClipStamp, unpackCommand, BACKUPS_KEPT, parseDfAvail,
} from '../scripts/release.mjs';
import {
  parseFileList, neededArt, artPlan, differingLists, parseSha256, artGate, urlToPath, SHARED_LISTS, PUBLIC_FILE_LIMIT,
} from '../scripts/release-art.mjs';
import { prepareCommand, statusCommand, sudoCheckCommand } from '../scripts/deploy-regions.mjs';
import {
  nextNewsId, draftNews, editorText, parseEditorText, newsFromEdit, builtInNews, newsFile, newsDraftFile, untranslatedLines, bumpNews, NEWS_FILE_MAX,
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

describe('server writes are capped', () => {
  test('the unpack backs up first, keeps the newest backup folders only, and always deletes the tar', () => {
    const line = unpackCommand('/home/ubuntu/sp-release-AbC123.tar', ['data/local-fx.json'], '20261113-0123');
    assert.match(line, /mkdir -p \/root\/release-backups\/20261113-0123/);
    assert.match(line, new RegExp(`head -n -${BACKUPS_KEPT} \\| xargs -r rm -rf --`));
    assert.equal(BACKUPS_KEPT, 5);
    assert.match(line, /trap .*rm -f \/home\/ubuntu\/sp-release-AbC123\.tar.* EXIT/);
    assert.doesNotMatch(unpackCommand('/home/u/sp-release-x.tar', [], '20261113-0123'), /release-backups/, 'nothing replaced: no backup');
    assert.throws(() => unpackCommand('/home/u/sp-release-x.tar', [], '../x'), /not a backup stamp/);
  });

  test('the news file has a size cap', () => {
    assert.equal(NEWS_FILE_MAX, 64 * 1024);
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
  /** Fake game names (the real ones: test/news-block.test.js): op_a has no Japanese name. */
  const names = {
    name(id, code, own) {
      const v = { en: 'Ann', zh: '安', ko: '안', 'zh-TW': '安' }[code];
      if (id !== 'op_a') return { error: `{name:${id}}: no such id` };
      if (own != null) return v ? { error: 'named' } : { text: own };
      return v ? { text: v } : { error: `{name:${id}}: no ${code} name` };
    },
    term: (zh) => ({ text: zh }),
  };
  const others = ['zh', 'ja', 'ko', 'zh-TW'];
  /** A player fragment; `news`: [kind, en] pairs, each with a line per language ("<lang> <en>"). */
  const frag = (name, news = [], heads = ['h']) => ({
    name,
    text: `## 2026-11-13\n\n${heads.map((h) => `### ${h}\n\n- x\n`).join('\n')}\nKind: player\n\nServer cost: none\n`
      + (news.length ? `\nNews:\n\n${news.map(([k, en]) => [`- ${k}: ${en}`, ...others.map((l) => `  ${l}: ${l} ${l === 'ja' ? en.replace('{name:op_a}', '{name:op_a|アン}') : en}`)].join('\n')).join('\n')}\n` : ''),
  });
  const all = (en) => Object.fromEntries([['en', en], ...others.map((l) => [l, `${l} ${en}`])]);
  const live = (points, extra = {}) => ({
    id: '0.3.4-5',
    langs: {
      en: { title: 'Update 0.3.4-5', highlights: ['H'], points },
      zh: { title: '0.3.4-5 更新', highlights: ['zh H'], points: points.map((p) => `zh ${p}`) },
      ...extra,
    },
  });

  test('the real built-in banner: English and every pack that translates all of it', () => {
    const root = new URL('..', import.meta.url);
    const pack = (l) => JSON.parse(readFileSync(new URL(`public/i18n/${l}.json`, root), 'utf8'));
    const b = builtInNews(readFileSync(new URL('public/js/ui/matchSearch.js', root), 'utf8'), { en: pack('en'), ja: pack('ja'), ko: pack('ko') });
    assert.ok(b && b.langs.en.highlights.length && b.langs.en.points.length);
    for (const l of [...b.langs.en.highlights, ...b.langs.en.points]) assert.doesNotMatch(l, /[一-鿿]/, l);
    const d = draftNews(b, [], { names });
    const { news, errors } = newsFromEdit(parseEditorText(editorText(d)), new Set(), names);
    assert.deepEqual([errors, newsProblems(news)], [[], []]);
  });

  test('the id follows the version bump pattern; the built-in banner per language', () => {
    assert.equal(nextNewsId('0.3.4-2'), '0.3.4-3');
    assert.equal(nextNewsId('0.3.4'), '0.3.4-1');
    assert.equal(builtInNews('nothing', {}), null);
    const src = "export const UPDATE_NEWS_ID = '0.3.4-2';\nconst UPDATE_HIGHLIGHTS = [\n  N_('新'), // en\n];\nconst UPDATE_POINTS = [\n  N_('点\\'一'),\n  N_('无译'),\n];\n";
    const b = builtInNews(src, { en: { '新': 'New', "点'一": "Point's one" }, ja: { '新': '新しい' }, ko: { '新': '새', "点'一": '하나', '无译': '없음' } });
    assert.deepEqual(b, { id: '0.3.4-2', langs: {
      zh: { highlights: ['新'], points: ["点'一", '无译'] },
      en: { highlights: ['New'], points: ["Point's one", '无译'] },
      ko: { highlights: ['새'], points: ['하나', '없음'] },
    } }, 'ja misses a line, so it is left out');
    assert.equal(draftNews(b, [], { names }).id, '0.3.4-3');
    assert.equal(draftNews(null, [], { names }).id, '0-1');
    assert.equal(newsFile('0.3.4-3'), 'logs/news-0.3.4-3.json');
    assert.equal(newsDraftFile('0.3.4-3'), 'logs/news-0.3.4-3.draft.txt');
  });

  test('draft: the News blocks first in every language, then the previous lines with theirs, cut to the limit', () => {
    const old = Array.from({ length: 16 }, (_, i) => `old ${i}`);
    const prev = live(old, { ja: { title: '0.3.4-5 アップデート', points: ['only one'] } });
    const d = draftNews(prev, [
      frag('c.md', [['point', '{name:op_a} is new'], ['point', 'old 3'], ['highlight', 'Big']]),
      frag('n.md', [], ['A change that is not news']),
      { name: 'i.md', text: frag('i.md').text.replace('Kind: player', 'Kind: internal') },
    ], { names });
    assert.deepEqual([d.id, d.titles.en, d.titles.zh, d.titles.ko, d.fresh], ['0.3.4-6', 'Update 0.3.4-6', '0.3.4-6 更新', '0.3.4-6 업데이트', 3]);
    assert.deepEqual(d.points[0].lines, { en: 'Ann is new', zh: 'zh 安 is new', ja: 'ja アン is new', ko: 'ko 안 is new', 'zh-TW': 'zh-TW 安 is new' });
    assert.deepEqual(d.highlights.map((h) => h.lines.en), ['Big', 'H']);
    assert.deepEqual(d.highlights[1].lines, { en: 'H', zh: 'zh H' }, 'previous lines keep the translations they have');
    assert.deepEqual(d.points.slice(0, 3).map((p) => p.lines.en), ['Ann is new', 'old 3', 'old 0']);
    assert.equal(d.points[2].lines.ja, undefined, 'a list of another length is not aligned');
    assert.equal(d.points.length, NEWS_MAX_POINTS);
    assert.deepEqual(d.cut.map((c) => c.lines.en), ['old 15'], 'old 3 moved up, not repeated');
    assert.deepEqual(d.noNews, [{ name: 'n.md', line: 'A change that is not news' }]);
    assert.throws(() => draftNews(prev, [frag('bad.md', [['point', '{name:nope} x']])], { names }), /bad\.md: its News block is not valid/);
  });

  test('the Notepad text: each line with its translations under it; it round-trips with a BOM and CRLF', () => {
    const d = draftNews(live(['One']), [frag('c.md', [['highlight', '<@sp.leaf>{name:op_a}</> joins']])], { names: { ...names, name: () => ({ text: 'Ann' }) } });
    const text = editorText(d, ['a problem']);
    assert.match(text, /Wording rules/);
    assert.match(text, /# PROBLEMS/);
    assert.ok(text.includes('\r\n'));
    assert.match(text, /\[highlights\]\r\n# h1\r\n- <@sp\.leaf>Ann<\/> joins\r\n {4}zh: zh <@sp\.leaf>Ann<\/> joins\r\n {4}ja: /);
    const e = parseEditorText(String.fromCharCode(0xFEFF) + text);
    assert.equal(e.id, '0.3.4-6');
    assert.equal(e.titles['zh-TW'], '0.3.4-6 更新');
    assert.deepEqual(e.highlights.map((h) => [h.label, h.lines.en, h.lines.ko]), [['h1', '<@sp.leaf>Ann</> joins', 'ko <@sp.leaf>Ann</> joins'], ['h2', 'H', '']]);
    assert.deepEqual(e.points.map((p) => [p.label, p.lines.zh]), [['p1', 'zh One']]);
  });

  test('untranslated lines: a new line, English rewritten under the old translations, an emptied translation', () => {
    const d = draftNews(live(['One']), [frag('c.md', [['point', 'Two']])], { names });
    const text = editorText(d);
    assert.deepEqual(untranslatedLines(parseEditorText(text), d), [], 'the draft as it is: live lines that are English in some language stay so');
    const e = parseEditorText(text.replace('- Two', '- Two, reworded').replace(/\[points\]/, '[points]\r\n- Brand new'));
    assert.deepEqual(untranslatedLines(e, d).map((u) => [u.label, u.why]), [
      ['p1', 'no zh, ja, ko, zh-TW'],
      ['p2', 'the English was rewritten, its translations were not'],
    ]);
    assert.deepEqual(untranslatedLines(parseEditorText(text.replace('ko: ko Two', 'ko: ')), d).map((u) => [u.label, u.why]), [['p1', 'no ko']]);
    assert.deepEqual(untranslatedLines(parseEditorText(text.replace('- One', '- One, reworded')), d).map((u) => [u.label, u.why]), [['p2', 'no ja, ko, zh-TW']]);
  });

  test('the news file: every language; --english-only lines show their English everywhere; names filled in', () => {
    const e = { id: '1-2', titles: { en: 'Update 1-2', zh: '1-2 更新' }, highlights: [{ kind: 'highlight', label: 'h1', lines: { en: '{name:op_a} new' } }], points: [{ kind: 'point', label: 'p1', lines: all('P') }] };
    const { news, errors } = newsFromEdit(e, new Set(['h1']), names);
    assert.deepEqual(errors, []);
    assert.deepEqual(Object.keys(news.langs), ['en', 'zh', 'ja', 'ko', 'zh-TW']);
    assert.deepEqual([news.langs.ja.highlights, news.langs.ja.points, news.langs.ja.title], [['Ann new'], ['ja P'], 'Update 1-2']);
    assert.deepEqual(newsProblems(news), []);
  });

  describe('bumpNews', () => {
    const quietly = async (fn) => {
      const { log } = console;
      console.log = () => {};
      try { return await fn(); } finally { console.log = log; }
    };
    /** A project folder with the fragments; the editor applies `edits` in turn. */
    const run = async (fragments, edits, o = {}) => {
      const root = mkdtempSync(join(tmpdir(), 'sp-news-'));
      mkdirSync(join(root, 'changes'));
      for (const f of fragments) writeFileSync(join(root, 'changes', f.name), f.text);
      const seen = [];
      const editor = async (file) => { const t = readFileSync(file, 'utf8'); seen.push(t); writeFileSync(file, (edits.shift() || ((x) => x))(t)); };
      const go = (more = {}) => quietly(() => bumpNews({ root, fragments: fragments.map((f) => f.name), dryRun: false, live: live(['One']), ask: async () => true, prompt: async () => '', interactive: true, names, editor, ...o, ...more }));
      return { root, seen, go, cleanup: () => rmSync(root, { recursive: true, force: true }) };
    };
    const saved = (root, id) => JSON.parse(readFileSync(join(root, newsFile(id)), 'utf8'));

    test('accepted as drafted: saved with every language, fresh lines first', async () => {
      const r = await run([frag('c.md', [['point', '{name:op_a} is new']])], []);
      try {
        const out = await r.go();
        assert.equal(out.file, 'logs/news-0.3.4-6.json');
        const n = saved(r.root, '0.3.4-6');
        assert.deepEqual(n.langs.ko.points, ['ko 안 is new', 'One'], 'the previous point keeps English where it had no Korean');
        assert.deepEqual(n.langs.zh.points, ['zh 安 is new', 'zh One']);
        assert.deepEqual(newsProblems(n), []);
      } finally { r.cleanup(); }
    });

    test('a rewritten line stops the release and is kept; the rerun opens the kept text; filled in, it saves', async () => {
      const r = await run([frag('c.md', [['point', 'Two']])], [(t) => t.replace('- Two', '- Two, better')]);
      try {
        await assert.rejects(r.go(), (err) => /p1: Two, better {2}\(the English was rewritten/.test(err.message) && /--english-only p1/.test(err.message) && /news-0\.3\.4-6\.draft\.txt/.test(err.message));
        assert.ok(!existsSync(join(r.root, newsFile('0.3.4-6'))), 'nothing saved');
        const kept = readFileSync(join(r.root, newsDraftFile('0.3.4-6')), 'utf8');
        assert.match(kept, /- Two, better/);
        writeFileSync(join(r.root, newsDraftFile('0.3.4-6')), kept.replace(/zh: zh Two\r\n/, 'zh: 二，更好\r\n').replace(/ja: ja Two\r\n/, 'ja: 二\r\n').replace(/ko: ko Two\r\n/, 'ko: 둘\r\n').replace(/zh-TW: zh-TW Two\r\n/, 'zh-TW: 二\r\n'));
        await r.go();
        assert.match(r.seen[1], /- Two, better\r\n {4}zh: 二，更好/, 'the rerun opened the kept text');
        assert.deepEqual(saved(r.root, '0.3.4-6').langs.ko.points[0], '둘');
        assert.ok(!existsSync(join(r.root, newsDraftFile('0.3.4-6'))), 'the kept text is gone once saved');
      } finally { r.cleanup(); }
    });

    test('--english-only ships a new line in English everywhere; an unknown label is refused', async () => {
      const add = (t) => t.replace('[points]', '[points]\r\n- Brand new');
      let r = await run([frag('c.md', [['point', 'Two']])], [add]);
      try {
        await r.go({ englishOnly: ['p1'] });
        assert.deepEqual(saved(r.root, '0.3.4-6').langs.ja.points, ['Brand new', 'ja Two', 'One']);
      } finally { r.cleanup(); }
      r = await run([frag('c.md', [['point', 'Two']])], []);
      try {
        await assert.rejects(r.go({ englishOnly: ['p9'] }), /--english-only names lines the news does not have: p9/);
      } finally { r.cleanup(); }
    });

    test('server-only wording typed in Notepad is refused and shown again', async () => {
      const r = await run([frag('c.md', [['point', 'Two']])], [(t) => t.replace(/(- Two\r\n(?: {4}\S+: .*\r\n){4})/, '$1- Faster on the usspa box\r\n    zh: a\r\n    ja: b\r\n    ko: c\r\n    zh-TW: d\r\n'), (t) => t.replace(/- Faster on the usspa box\r\n(?: {4}\S+: .*\r\n){4}/, '')]);
      try {
        await r.go();
        assert.match(r.seen[1], /# PROBLEMS[\s\S]*server-only wording/);
        assert.deepEqual(saved(r.root, '0.3.4-6').langs.en.points, ['Two', 'One']);
      } finally { r.cleanup(); }
    });
  });
});

// (fork, 2026-11-13) The first live run stopped with "not enough free space ... app NaN MB free": the app folder's df ran
// without sudo, could not stat the folder, and the missing number read as NaN.
test('free space: a number, or an error naming the path and why, never NaN', () => {
  assert.deepEqual(parseDfAvail({ status: 0, stdout: '    Avail\n33300516864\n', stderr: '' }, '$HOME'), { free: 33300516864 });
  const denied = parseDfAvail({ status: 1, stdout: '', stderr: "df: /opt/stronghold/app: Permission denied\n" }, '/opt/stronghold/app');
  assert.deepEqual(denied, { error: 'could not read free space on /opt/stronghold/app: df: /opt/stronghold/app: Permission denied' });
  for (const res of [{ status: 0, stdout: 'Avail\n', stderr: '' }, { status: 0, stdout: 'Avail\n12\n34\n', stderr: '' }, { status: 0, stdout: 'Avail\nlots\n', stderr: '' }, { status: null, stdout: '', stderr: '' }, undefined]) {
    const got = parseDfAvail(res, '/x');
    assert.ok('error' in got && /^could not read free space on \/x: /.test(got.error), JSON.stringify(res));
  }
  const src = readFileSync(new URL('../scripts/release.mjs', import.meta.url), 'utf8');
  assert.match(src, /sudo df -B1 --output=avail \$\{APP\}/, 'the app folder is read under sudo');
  assert.doesNotMatch(src, /df -B1 --output=avail "\$HOME" \$\{APP\}/, 'never both paths in one unprivileged df');
});
