// test/news.test.js — (fork) the lobby's live update news: shared/news.js (the check), scripts/news.mjs (the operator's
// command), server/news.js (sys.news after hello and on change), scripts/deploy-regions.mjs news (both servers) and the
// banner's choice (ui/matchSearch.js updateNewsView: the live news in the page's language, else its English, else the
// release's own).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { newsProblems, parseNews, newsEntry, NEWS_MAX_BYTES, NEWS_LINE_MAX } from '../shared/news.js';
import { S2C } from '../shared/protocol.js';
import { parseArgs as regionArgs, parseHosts, newsCommand, newsUploadCommand } from '../scripts/deploy-regions.mjs';
import { updateNewsView, UPDATE_NEWS_ID, UPDATE_NEWS_PREF } from '../public/js/ui/matchSearch.js';
import { TestClient } from './helpers/wsClient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'news.mjs');

const entry = (title, points = ['A point'], highlights = []) => ({ title, highlights, points });
const NEWS = Object.freeze({
  id: '0.3.4-2',
  langs: {
    en: entry('Update 0.3.4-2', ['<@ba.rem>Hotfix:</> skills cast on time'], ['Big news']),
    ja: entry('0.3.4-2 アップデート'),
  },
});

describe('shared/news.js', () => {
  test('a valid file passes and is trimmed', () => {
    assert.deepEqual(newsProblems(NEWS), []);
    const n = parseNews({ id: 'a', langs: { en: { title: ' T ', points: [' p '] } } });
    assert.deepEqual(n, { id: 'a', langs: { en: { title: 'T', highlights: [], points: ['p'] } } });
  });

  test('every rule refuses with a reason', () => {
    const long = 'x'.repeat(NEWS_LINE_MAX + 1);
    for (const [bad, why] of [
      [null, /JSON object/],
      [{ langs: { en: entry('T') } }, /"id"/],
      [{ id: 'has space', langs: { en: entry('T') } }, /"id"/],
      [{ id: 'a', langs: [] }, /"langs"/],
      [{ id: 'a', langs: {} }, /no language/],
      [{ id: 'a', langs: { 'EN!': entry('T') } }, /language code/],
      [{ id: 'a', langs: { en: entry('') } }, /title/],
      [{ id: 'a', langs: { en: entry('x'.repeat(61)) } }, /title is 61/],
      [{ id: 'a', langs: { en: entry('T', [long]) } }, /points\[0\] is 201/],
      [{ id: 'a', langs: { en: entry('T', ['two\nlines']) } }, /line break/],
      [{ id: 'a', langs: { en: entry('T', [], []) } }, /no highlights and no points/],
      [{ id: 'a', langs: { en: entry('T', Array(17).fill('p')) } }, /17 lines/],
      [{ id: 'a', langs: { en: entry('T', [3]) } }, /non-empty text/],
      [{ id: 'a', langs: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`l${String.fromCharCode(97 + i)}`, entry('T')])) }, /17 languages/],
      [{ id: 'a', langs: { en: entry('T'), pad: 'x'.repeat(NEWS_MAX_BYTES) } }, /bytes/],
    ]) {
      assert.match(newsProblems(bad).join(' | '), why, JSON.stringify(bad).slice(0, 80));
      assert.equal(parseNews(bad), null);
    }
  });

  test('a page shows its language, then its chain, then English; none of them: nothing', () => {
    assert.equal(newsEntry(NEWS, ['ja']).title, '0.3.4-2 アップデート');
    assert.equal(newsEntry(NEWS, ['ko']).title, 'Update 0.3.4-2', 'a language the news lacks: its English');
    assert.equal(newsEntry({ id: 'x', langs: { ja: entry('J') } }, ['ko']), null, 'no English either: the release\'s own');
    assert.equal(newsEntry(null, ['en']), null);
  });

  test('sys.news is a documented server → client type', () => {
    assert.ok(S2C.includes('sys.news'));
  });
});

describe('the banner (ui/matchSearch.js updateNewsView)', () => {
  test('no live news: the release\'s own announcement and id', () => {
    const v = updateNewsView(null, 'en');
    assert.equal(v.id, UPDATE_NEWS_ID);
    assert.equal(UPDATE_NEWS_PREF, `news.${UPDATE_NEWS_ID}`);
    assert.equal(v.rich, false);
    assert.ok(v.highlights.length && v.points.length);
  });
  test('live news in the page\'s language, its own id, rich lines', () => {
    const v = updateNewsView(parseNews(NEWS), 'ja');
    assert.deepEqual([v.id, v.title, v.rich], ['0.3.4-2', '0.3.4-2 アップデート', true]);
    assert.deepEqual(updateNewsView(parseNews(NEWS), 'ko').points, ['<@ba.rem>Hotfix:</> skills cast on time'], 'the English for a language it lacks');
    assert.equal(updateNewsView(parseNews({ id: 'x', langs: { ja: entry('J') } }), 'ko').id, UPDATE_NEWS_ID, 'no entry at all: the release\'s');
  });
});

describe('scripts/news.mjs', () => {
  let dir;
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-cli-')); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (file, ...args) => spawnSync(process.execPath, [SCRIPT, '--file', file, ...args], { encoding: 'utf8' });

  test('set (a file or stdin), show and clear', () => {
    const file = path.join(dir, 'logs', 'news.json');
    const src = path.join(dir, 'in.json');
    fs.writeFileSync(src, '\uFEFF' + JSON.stringify(NEWS));
    const r = run(file, 'set', src);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /News saved[\s\S]*Update 0\.3\.4-2/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), parseNews(NEWS));
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['news.json'], 'no temp file left behind');
    assert.match(run(file, 'show').stdout, /"0\.3\.4-2"[\s\S]*Big news/);
    const viaStdin = execFileSync(process.execPath, [SCRIPT, '--file', file, 'set', '-'], { input: JSON.stringify({ ...NEWS, id: 'stdin' }), encoding: 'utf8' });
    assert.match(viaStdin, /News saved/);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).id, 'stdin');
    assert.match(run(file, 'clear').stdout, /cleared/);
    assert.equal(fs.existsSync(file), false);
    assert.match(run(file, 'show').stdout, /No live news/);
  });

  test('a refused file changes nothing and says why; check writes nothing', () => {
    const file = path.join(dir, 'keep.json');
    fs.writeFileSync(file, JSON.stringify(parseNews(NEWS)));
    const before = fs.readFileSync(file, 'utf8');
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify({ id: 'bad id', langs: { en: entry('T', ['a\tb']) } }));
    const r = run(file, 'set', bad);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refused[\s\S]*"id"[\s\S]*control character/);
    fs.writeFileSync(bad, '{not json');
    assert.match(run(file, 'set', bad).stderr, /Not valid JSON/);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'the live news is untouched');
    const ok = path.join(dir, 'ok.json');
    fs.writeFileSync(ok, JSON.stringify({ ...NEWS, id: 'checked' }));
    assert.match(run(file, 'check', ok).stdout, /^OK/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  });
});

describe('scripts/deploy-regions.mjs news', () => {
  const env = {};
  test('a file, --show or --clear, and the commands it runs', () => {
    assert.deepEqual(regionArgs(['news', '--hosts', 'spa,usspa', 'news.json'], env), { cmd: 'news', hosts: parseHosts('spa,usspa'), action: 'set', file: 'news.json' });
    assert.equal(regionArgs(['news', '--show', '--hosts', 'spa'], env).action, 'show');
    assert.equal(regionArgs(['news', '--hosts', 'spa', '--clear'], env).action, 'clear');
    for (const argv of [['news', '--hosts', 'spa'], ['news', '--hosts', 'spa', '--show', 'x.json'], ['news', '--hosts', 'spa', '--show', '--clear']]) {
      assert.match(String(regionArgs(argv, env).error), /news needs one of/, argv.join(' '));
    }
    assert.match(newsUploadCommand(), /mktemp \/tmp\/sp-news-XXXXXX\.json/);
    const set = newsCommand('set', '/tmp/sp-news-Ab12Cd.json');
    assert.match(set, /sudo -u stronghold node scripts\/news\.mjs set - < \/tmp\/sp-news-Ab12Cd\.json/);
    assert.match(set, /s=\$\?; rm -f \/tmp\/sp-news-Ab12Cd\.json; exit \$s$/, 'the upload goes either way, the exit status stays');
    assert.throws(() => newsCommand('set', '/tmp/x; rm -rf /'), /not a news upload path/);
    assert.match(newsCommand('show'), /news\.mjs show/);
  });
});

describe('server delivery (sys.news)', () => {
  let dir, file, srv;
  const clients = [];
  const connect = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    clients.push(c);
    await c.hello(name);
    return c;
  };
  const write = (news) => execFileSync(process.execPath, [SCRIPT, '--file', file, 'set', '-'], { input: JSON.stringify(news), encoding: 'utf8' });

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-srv-'));
    file = path.join(dir, 'news.json');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, newsFile: file, newsPollMs: 30, noticeFile: null, maintenanceFile: null });
  });
  after(async () => {
    for (const c of clients) await c.close();
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('no file: nothing is sent', async () => {
    const a = await connect('A');
    await a.expectNone('sys.news', () => true, 150);
  });

  test('a new file reaches online players once, and players who join later', async () => {
    const a = await connect('B');
    write(NEWS);
    const got = await a.waitFor('sys.news', () => true, 2000);
    assert.deepEqual(got.news, parseNews(NEWS));
    await a.expectNone('sys.news', () => true, 150);
    const late = await connect('C');
    assert.equal((await late.waitFor('sys.news', () => true, 1000)).news.id, NEWS.id);
  });

  test('a hand-broken file keeps the last good news; clear sends null', async () => {
    const a = await connect('D');
    await a.waitFor('sys.news', () => true, 1000);
    fs.writeFileSync(file, '{"id": "broken"');
    await a.expectNone('sys.news', () => true, 200);
    assert.equal(srv.news.news.id, NEWS.id);
    fs.rmSync(file);
    const cleared = await a.waitFor('sys.news', (m) => m.news === null, 2000);
    assert.equal(cleared.news, null);
    const e = await connect('E');
    await e.expectNone('sys.news', () => true, 150);
  });
});
