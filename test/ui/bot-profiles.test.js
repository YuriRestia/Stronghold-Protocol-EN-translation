// (fork, GitHub #107) The room screen's bot profiles: the host's pick on an AI seat (room.setBot) and 「用 AI 填满空位」
// (room.fillBots, a drop-down of shared/botProfiles.js FILL_PRESETS); server: test/lobby-bot-profiles.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/screens/room.js'), 'utf8');
const mod = () => import(pathToFileURL(path.join(ROOT, 'public/js/screens/room.js')).href);

const room = (o = {}) => ({
  code: 'ABCD', hostId: 'h', mode: 'coop', difficulty: 'NORMAL',
  seats: [{ seat: 0, playerId: 'h', name: 'Host', isBot: false, ready: false, connected: true }, { seat: 1, playerId: 'ai_1', name: 'AI·A', isBot: true, ready: true, connected: true, bot: 'fish-tier6' }, null, null],
  ...o,
});

test('fillAiShown: the host of a co-op room with a free seat, not while searching', async () => {
  const { fillAiShown, roomFacts } = await mod();
  const shown = (r, me) => fillAiShown(r, roomFacts(r, me));
  assert.equal(shown(room(), 'h'), true);
  assert.equal(shown(room(), 'g'), false, 'not the host');
  assert.equal(shown(room({ searching: true }), 'h'), false, '搜寻队友 fills the seats');
  assert.equal(shown(room({ mode: 'solo', seats: [room().seats[0]] }), 'h'), false);
  const full = room().seats.map((s, i) => s || { seat: i, playerId: `ai_${i}`, name: 'AI', isBot: true, ready: true, connected: true });
  assert.equal(shown(room({ seats: full }), 'h'), false, 'no free seat');
});

test('room.js sends room.setBot / room.fillBots, lists the shared profiles and presets through t()', () => {
  assert.match(SRC, /net\.request\('room\.setBot', \{ seat, bot \}\)/);
  assert.match(SRC, /net\.request\('room\.fillBots', \{ preset, lang: getLang\(\) \}\)/);
  assert.match(SRC, /ROOM_BOTS\.map\(\(b\) => html`<option key=\$\{b\.id\} value=\$\{b\.id\}>\$\{t\(b\.label\)\}/);
  assert.match(SRC, /FILL_PRESETS\.map\(\(p\) => html`<option key=\$\{p\.id\} value=\$\{p\.id\}>\$\{t\(p\.label\)\}/);
  for (const zh of ['用 AI 填满空位', 'AI 方案']) assert.ok(SRC.includes(`t('${zh}')`), zh);
});
