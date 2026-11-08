// GitHub #173 「网页版游戏文件未加载」: the page runs but its game data never arrives (every /data/*.json request fails —
// a blocked request, a proxy, a server without its data folder). useData counts a file that failed ('missing') as
// settled like a loaded one, so 干员调配 drew an empty roster (「没有符合条件的干员」) and the 导入 of a loadout said the data
// had no loadout usable in this version; the 干员持有 / 自选编队 imports, sanitised against the absent data, stored an
// empty list over the saved one. Now the tab says that the game data did not load (which files, what to try) and every
// import is refused with the same words, before anything is parsed or applied — the saved settings stay as they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// the reporter's case: every data request of the page fails (the screen reads the browser data store singleton)
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).startsWith('[data]')) warn(...a); };

const { data } = await import('../../public/js/data.js');
const { missingGameData, importRefusal, DataMissing } = await import('../../public/js/screens/loadout.js');
const { setLang, setMessages } = await import('../../shared/i18n.js');

const TABS = ['loadout', 'ownership', 'diy'];
const statusOf = (map, dflt = 'ready') => (name) => map[name] ?? dflt;
const NOT_LOADED = '导入失败：游戏数据没有载入，未做任何改动。请刷新页面；仍不行时，请检查广告拦截插件和网络';
const LOADING = '干员数据仍在载入，请稍候再导入';

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
  .filter((x) => typeof x === 'string').map((s) => s.trim()).filter(Boolean).join(' | ');

test('a data file that never arrived is settled like a loaded one: the tab names the files it cannot work without', async () => {
  await data.loadAll('chess', 'bonds', 'assets', 'local', 'backups'); // the screen's useData(...) files
  for (const name of ['chess', 'bonds', 'assets', 'local', 'backups']) assert.equal(data.status(name), 'missing', name);
  // (default: the browser store) chess.json for every tab, backups.json too for 自选编队 (its slots and picks' forms)
  assert.deepEqual(missingGameData('loadout'), ['chess']);
  assert.deepEqual(missingGameData('ownership'), ['chess']);
  assert.deepEqual(missingGameData('diy'), ['chess', 'backups']);
  for (const tab of TABS) {
    assert.deepEqual(missingGameData(tab, statusOf({})), [], `${tab}: loaded`);
    assert.deepEqual(missingGameData(tab, statusOf({}, 'loading')), [], `${tab}: still loading (the spinner, not this message)`);
  }
  // only the art / bond files missing: every tab still works
  for (const tab of TABS) assert.deepEqual(missingGameData(tab, statusOf({ bonds: 'missing', assets: 'missing', local: 'missing' })), []);
  const noBackups = statusOf({ backups: 'missing' });
  assert.deepEqual(TABS.map((tab) => missingGameData(tab, noBackups)), [[], [], ['backups']]);
});

test('every import is refused while the files load or when the game data did not load — no other reason', () => {
  const missing = statusOf({ chess: 'missing', backups: 'missing' });
  for (const kind of TABS) {
    assert.deepEqual(importRefusal(kind, false, statusOf({})), { text: LOADING, tone: 'warn' }, `${kind}: loading`);
    assert.deepEqual(importRefusal(kind, true, missing), { text: NOT_LOADED, tone: 'error' }, `${kind}: not loaded`);
    assert.deepEqual(importRefusal(kind, true), { text: NOT_LOADED, tone: 'error' }, `${kind}: the browser store`);
    assert.equal(importRefusal(kind, true, statusOf({})), null, `${kind}: loaded`);
  }
  const noBackups = statusOf({ backups: 'missing' });
  assert.equal(importRefusal('loadout', true, noBackups), null);
  assert.equal(importRefusal('ownership', true, noBackups), null);
  assert.deepEqual(importRefusal('diy', true, noBackups), { text: NOT_LOADED, tone: 'error' });
});

test('the screen: the import asks importRefusal before parsing or applying anything; a tab without its data shows DataMissing', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/screens/loadout.js'), 'utf8');
  const at = src.indexOf('const ioApply = () => {');
  assert.ok(at > 0, 'ioApply');
  const body = src.slice(at, src.indexOf('\n  };\n', at));
  // (fork) one import for every page: each chosen part is refused before ANY part is applied (applyPart)
  const guard = body.indexOf('const refused = importRefusal(p, ready);');
  assert.ok(guard > 0, 'the guard');
  assert.match(body.slice(guard), /^const refused = importRefusal\(p, ready\);\s*if \(refused\) \{ toast\(refused\.text, refused\.tone\); return; \}/);
  assert.ok(body.indexOf('applyPart[p](') > guard, 'the parts apply only after every guard');
  assert.ok(!/if \(!ready\)/.test(body), 'one guard for both cases');
  assert.match(src, /const lost = ready \? missingGameData\(tab\) : \[\];/);
  assert.match(src, /: lost\.length \? html`<\$\{DataMissing\} files=\$\{lost\} \/>`\s*: tab === 'ownership'/); // (fork) 自选编队 lives on the card view now
});

test('the message names the files and what to try, in Chinese and in English', () => {
  const one = DataMissing({ files: ['chess'] });
  assert.equal(one.props.role, 'alert');
  assert.equal(textOf(one), '游戏数据没有载入 | /data/chess.json 没有下载成功，这一页无法显示；已保存的设置不受影响。请刷新页面；仍不行时，请检查广告拦截插件和网络。');
  assert.match(textOf(DataMissing({ files: ['chess', 'backups'] })), /\/data\/chess\.json、\/data\/backups\.json 没有下载成功/);
  const en = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
  setMessages('en', en);
  setLang('en');
  try {
    assert.equal(textOf(DataMissing({ files: ['chess', 'backups'] })), 'The game data did not load | /data/chess.json, /data/backups.json could not be downloaded, '
      + 'so this page cannot be shown. Your saved settings are unaffected. Reload the page; if that does not help, check your ad blocker and your network.');
    assert.equal(importRefusal('loadout', true).text, 'Import failed: the game data did not load. Nothing was changed. Reload the page; if that does not help, check your ad blocker and your network');
  } finally {
    setLang('zh');
  }
});
