// test/ui/solo-queue-fallback.test.js — (fork, 2026-11-15) 单人匹配's one-time warning (public/js/ui/soloQueue.js
// fallbackLines): queue.state `at` names the ticked versions that wait at a lower difficulty than the one picked
// (server/lobby.js queueJoin, DESIGN §90.3); the client toasts one line per difficulty used, once per join, and the
// 选择模拟协议 dialog stays as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { fallbackLines } = await import('../../public/js/ui/soloQueue.js');
const { versionLabel } = await import('../../public/js/versions.js');
const { setLang, addMessages } = await import('../../shared/i18n.js');
addMessages('en', JSON.parse(fs.readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8')));

test('fallbackLines: every season but 第二期下半 at 终极 → one 绝境 line naming the three older ones', () => {
  setLang('zh');
  const at = { 'act2autochess@V2_1': 'HARD', act1autochess: 'HARD', 'act1autochess@V1_1': 'HARD' };
  const lines = fallbackLines(at, 'ABYSS');
  assert.equal(lines.length, 1);
  for (const v of Object.keys(at)) assert.ok(lines[0].includes(versionLabel(v)), `${v} named`);
  assert.ok(!lines[0].includes(versionLabel('act2autochess')), '第二期下半 keeps 终极 and is not named');
  assert.match(lines[0], /终极/);
  assert.match(lines[0], /绝境/);
});

test('fallbackLines: one line per difficulty used; nothing for no `at`, junk, or a value equal to the pick', () => {
  setLang('zh');
  assert.equal(fallbackLines({ act1autochess: 'HARD', 'act1autochess@V1_1': 'NORMAL' }, 'ABYSS').length, 2);
  assert.deepEqual(fallbackLines(undefined, 'ABYSS'), []);
  assert.deepEqual(fallbackLines(null, 'ABYSS'), []);
  assert.deepEqual(fallbackLines({ act1autochess: 'HARD' }, null), [], 'no difficulty: nothing to compare');
  assert.deepEqual(fallbackLines({ act1autochess: 'NOPE', x: 5 }, 'ABYSS'), []);
  assert.deepEqual(fallbackLines({ act1autochess: 'ABYSS' }, 'ABYSS'), []);
});

test('fallbackLines: English text from the en pack', () => {
  setLang('en');
  const [line] = fallbackLines({ act1autochess: 'HARD' }, 'ABYSS');
  setLang('zh');
  assert.match(line, /^No .+ in .+: matched at .+ instead$/);
  assert.ok(!/[一-鿿]/.test(line), `no Chinese left: ${line}`);
});

test('the toast fires only as the queue starts (once per join), and the dialog has no warning box', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/ui/soloQueue.js'), 'utf8');
  assert.ok(src.includes("if (!was) for (const line of fallbackLines(msg.at, soloQueue.get().difficulty)) toast(line, 'warn');"));
  const lobby = fs.readFileSync(path.join(ROOT, 'public/js/screens/lobby.js'), 'utf8');
  assert.ok(!lobby.includes('没有{wanted}'), 'the 选择模拟协议 dialog is unchanged');
});
