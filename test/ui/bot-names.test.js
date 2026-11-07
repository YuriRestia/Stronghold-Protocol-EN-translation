// An AI teammate shows its operator's name in the page's language; a human's name is never translated, even one equal to an
// operator's (the bug of 99af5f99: a player named 能天使 became "Exusiai"). What decides is the seat's isBot, never the text.
// Real pages: bot-names.e2e.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  setNameResolver, setLang, addMessages, t, botName, shownName, playerParam, wireMessage, msg,
} from '../../shared/i18n.js';

const NAMES = { 华法琳: 'Warfarin', 能天使: 'Exusiai' };

before(() => {
  addMessages('en', { '{name}：{names}': '{name}: {names}' });
  setNameResolver((name) => NAMES[name] || name);
  setLang('en');
});
after(() => {
  setNameResolver(null);
  setLang('zh');
});

test('an AI seat shows the operator\'s name in the language, its prefix kept', () => {
  assert.equal(shownName({ isBot: true, name: 'AI·华法琳' }), 'AI·Warfarin');
  assert.equal(botName('AI·华法琳'), 'AI·Warfarin');
  assert.equal(shownName({ isBot: true, name: 'AI·2' }), 'AI·2', 'a number after the prefix stays');
  assert.equal(shownName({ isBot: true, name: 'AI·未知' }), 'AI·未知', 'a name the pack does not have stays');
});

test('a human named after an operator keeps the name exactly as typed', () => {
  for (const name of ['华法琳', '能天使', 'AI·华法琳', 'AI·能天使', 'Warfarin']) {
    assert.equal(shownName({ isBot: false, name }), name);
    assert.equal(shownName({ name }), name, 'no isBot is not a bot');
    assert.equal(playerParam({ isBot: false, name }), name);
  }
});

test('only isBot true counts, so a stray truthy value is not a bot', () => {
  assert.equal(shownName({ isBot: 'false', name: 'AI·华法琳' }), 'AI·华法琳');
  assert.equal(shownName({ isBot: 1, name: 'AI·华法琳' }), 'AI·华法琳');
});

test('a human who takes over an AI seat shows their own name', () => {
  const seat = { isBot: true, name: 'AI·华法琳' };
  assert.equal(shownName(seat), 'AI·Warfarin');
  Object.assign(seat, { isBot: false, name: '华法琳' }); // server/aiTakeover.js
  assert.equal(shownName(seat), '华法琳');
});

test('a missing name falls back', () => {
  assert.equal(shownName(null, '博士'), '博士');
  assert.equal(shownName({ isBot: true }, '博士'), '博士');
  assert.equal(shownName({ name: '' }, '博士'), '博士');
});

test('server messages: the AI param is shown in the language, the human param as typed', () => {
  const bot = { isBot: true, name: 'AI·华法琳' };
  const human = { isBot: false, name: '华法琳' };
  assert.equal(t('{name}：{names}', { name: playerParam(bot), names: [playerParam(human), playerParam(bot)] }), 'AI·Warfarin: 华法琳, AI·Warfarin');
  assert.equal(t('{name}：{names}', { name: playerParam(human), names: [] }), '华法琳: ');
});

test('the wire keeps the AI marker, and the plain text stays the server\'s', () => {
  setLang('zh');
  try {
    const w = wireMessage(msg('{name}博士的目标生命值已耗尽', { name: playerParam({ isBot: true, name: 'AI·华法琳' }) }));
    assert.deepEqual(w.params, { name: { bot: 'AI·华法琳' } });
    assert.equal(w.text, 'AI·华法琳博士的目标生命值已耗尽');
    const h = wireMessage(msg('{name}博士的目标生命值已耗尽', { name: playerParam({ isBot: false, name: '华法琳' }) }));
    assert.deepEqual(h.params, { name: '华法琳' });
  } finally {
    setLang('en');
  }
});

test('in the default language nothing changes', () => {
  setLang('zh');
  try {
    assert.equal(shownName({ isBot: true, name: 'AI·华法琳' }), 'AI·华法琳');
  } finally {
    setLang('en');
  }
});

test('tickers: the server marks only an AI seat', () => {
  const src = readFileSync(new URL('../../server/match/match/messaging.js', import.meta.url), 'utf8');
  assert.match(src, /\.\.\.\(bot \? \{ arg0Bot: true \} : \{\}\)/);
  for (const [file, re] of [
    ['server/match/match/bossRounds.js', /tickerFor\('BOSS_HIT', \[ps\.name\], \{ bot: ps\.isBot/],
    ['server/match/match/settle.js', /tickerFor\('CHAR_DAMAGE', \[ps\.name,.*\{ bot: ps\.isBot/],
    ['server/match/player/acquire.js', /tickerFor\('GOLDEN_CHAR', \[this\.name,.*\{ bot: this\.isBot/],
    ['server/match/player/economy.js', /tickerFor\('SHOP_LEVEL', \[this\.name,.*\{ bot: this\.isBot/],
  ]) assert.match(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), re, file);
});

test('the screens that show a player use shownName, not the raw name', () => {
  for (const [file, raw] of [
    ['public/js/screens/result.js', /rcard__name">\$\{p\.name/],
    ['public/js/screens/settle.js', /tcard__name"><span>\$\{p\.name/],
    ['public/js/ui/teamPanel.js', /team__name">\$\{p\.name/],
    ['public/js/screens/briefing.js', /title=\$\{p\.name\}/],
    ['public/js/screens/bandDraft.js', /<span>\$\{p\.name \|\|/],
    ['public/js/ui/aiTakeover.js', /· \$\{p\.name\}/],
  ]) assert.doesNotMatch(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), raw, file);
});

test('AI seats\' icons: decided by isBot, and every AI name has art', async () => {
  const { botCharId } = await import('../../public/js/ui/seatArt.js');
  const { BOT_NAMES } = await import('../../server/lobby.js');
  const { BOT_OPERATORS } = await import('../../shared/constants.js');
  assert.equal(botCharId({ isBot: true, name: 'AI·华法琳' }), 'char_171_bldsk');
  for (const seat of [{ isBot: false, name: 'AI·华法琳' }, { name: 'AI·华法琳' }, { isBot: false, name: '华法琳' }, { isBot: true, name: 'AI·2' }, { isBot: true, name: 'AI·constructor' }, null]) {
    assert.equal(botCharId(seat), null, JSON.stringify(seat));
  }
  for (const name of BOT_NAMES) assert.ok(botCharId({ isBot: true, name }), `${name} has an operator`);
  assert.equal(BOT_NAMES.length, Object.keys(BOT_OPERATORS).length);
  const chars = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8')).chars;
  for (const name of BOT_NAMES) assert.ok(chars[botCharId({ isBot: true, name })]?.avatar, `${name} has art`);
});
