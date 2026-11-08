// GitHub #538: a loadout file that carries `ops` (including `ops: {}`) replaces 潜能 / 练度. That list includes
// 自选 operators, which only backups.json names. Importing it while that file is missing used to drop them and still
// save, clearing a 练度 the file did not mean to erase. The whole import is refused first, with the 自选编队 data check.
// No browser: the refusal is a function, and ioApply must call it after a successful parse and before any write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).startsWith('[data]')) warn(...a); };

const { loadoutOpsImportRefusal } = await import('../../public/js/screens/loadout.js');

const NOT_LOADED = '导入失败：游戏数据没有载入，未做任何改动。请刷新页面；仍不行时，请检查广告拦截插件和网络';
const LOADING = '干员数据仍在载入，请稍候再导入';
const statusOf = (map, dflt = 'ready') => (name) => map[name] ?? dflt;

test('a loadout ops payload is refused with the DIY data check; entries-only is not', () => {
  const noBackups = statusOf({ backups: 'missing' });
  const bothMissing = statusOf({ chess: 'missing', backups: 'missing' });
  const ready = statusOf({});
  assert.equal(loadoutOpsImportRefusal(null, true, noBackups), null, 'no ops key: current 练度 stays');
  assert.equal(loadoutOpsImportRefusal(undefined, true, noBackups), null);
  assert.deepEqual(loadoutOpsImportRefusal({}, true, noBackups), { text: NOT_LOADED, tone: 'error' }, 'ops: {} still replaces 练度');
  assert.deepEqual(loadoutOpsImportRefusal({ char_112_siege: { potential: 1 } }, true, noBackups), { text: NOT_LOADED, tone: 'error' });
  assert.deepEqual(loadoutOpsImportRefusal({ char_112_siege: { potential: 1 } }, true, bothMissing), { text: NOT_LOADED, tone: 'error' });
  assert.deepEqual(loadoutOpsImportRefusal({}, false, ready), { text: LOADING, tone: 'warn' }, 'still loading: nothing is written');
  assert.equal(loadoutOpsImportRefusal({ char_112_siege: { potential: 1 } }, true, ready), null, 'both files ready: the import may proceed');
  assert.equal(loadoutOpsImportRefusal(null, false, noBackups), null, 'entries-only does not wait on backups');
});

// (fork) one import for every page (ui/backupModel.js readBackup parses first: ioApply runs only on `ioRead.ok`); the
// 调配 part's apply asks the refusal before its DIY id list or any write
test('the 调配 part asks loadoutOpsImportRefusal on a parsed file, before cultivationCharIds or applyLoadoutEntries', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/screens/loadout.js'), 'utf8');
  const io = src.indexOf('const ioApply = () => {');
  assert.ok(io > 0, 'ioApply');
  assert.match(src.slice(io, src.indexOf('\n  };\n', io)), /^const ioApply = \(\) => \{\s*if \(!ioRead\?\.ok \|\| !ioChosen\.length\) return;/, 'only a file that parsed');
  const at = src.indexOf('    loadout: (res) => {', src.indexOf('const applyPart = {'));
  assert.ok(at > 0, 'applyPart.loadout');
  const body = src.slice(at, src.indexOf('\n    },\n', at));
  const guard = body.indexOf('loadoutOpsImportRefusal(res.ops, ready)');
  const ids = body.indexOf('cultivationCharIds(');
  const apply = body.indexOf('applyLoadoutEntries(');
  assert.ok(guard > 0, 'the guard');
  assert.ok(ids > guard && apply > guard, 'no write and no DIY id list until the refusal returns null');
  assert.match(body.slice(guard), /^loadoutOpsImportRefusal\(res\.ops, ready\);\s*if \(opsRefused\) return opsRefused;/);
});
