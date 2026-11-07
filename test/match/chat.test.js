// (fork) match chat, the kill wallet: server/match/chatWallet.js, shared/text.js and the page's own helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteChatKills, scheduledEnemies, sendChat, settleChatWallet } from '../../server/match/chatWallet.js';
import { Lobby } from '../../server/lobby.js';
import { validateC2S, S2C } from '../../shared/protocol.js';
import { cleanChat, cleanText, letterCount, chopChat } from '../../shared/text.js';
import { sanitizeName } from '../../server/net.js';
import { CHAT_COOLDOWN_MS, CHAT_MAX_LETTERS, PHASE, chatBubbleMs } from '../../shared/constants.js';
import { activeBubbles } from '../../public/js/ui/gameLogic/watch.js';
import { chatEntry, chatMuted, fitChatInput, toggleChatMute } from '../../public/js/chatState.js';
import { makeMatch } from './harness.js';

function fixture(chatLeft = 10) {
  let now = 100000;
  const sent = [];
  const ps = { playerId: 'p_0', seat: 1, isBot: false, chatLeft, chatRound: 1, chatPending: null, lastChatAt: -Infinity, dirtied: 0, dirty() { this.dirtied++; } };
  const m = { sched: { now: () => now }, broadcast: (msg, except) => sent.push({ msg, except }), players: new Map([['p_0', ps]]) };
  return { m, ps, sent, wait: () => { now += CHAT_COOLDOWN_MS; } };
}
const field = (count, players = ['p_0']) => ({ players, spec: { spawns: [{ enemyKey: 'a', count }, { enemyKey: 'b', count: 1 }] } });

test('protocol: g.chat takes any string, nothing else; m.chat is a known frame', () => {
  assert.equal(validateC2S({ t: 'g.chat', x: 'x'.repeat(5000) }), null);
  assert.ok(validateC2S({ t: 'g.chat', x: 5 }));
  assert.ok(validateC2S({ t: 'g.chat' }));
  assert.ok(S2C.includes('m.chat'));
});

test('text: cleaned, trimmed, counted in code points', () => {
  assert.equal(cleanText('  hi \t  there\n'), 'hi there');
  assert.equal(cleanText('a\u202eb\u200bc\u0000d\ud800'), 'abcd', 'bidi, zero-width, control, lone surrogate');
  assert.equal(cleanText('e\u0301'), '\u00e9', 'NFC');
  assert.equal(cleanText(' \u200b \n '), '');
  assert.equal(letterCount('医疗'), 2);
  assert.equal(letterCount('😀'), 1);
  assert.equal(chopChat('😀😀😀', 2), '😀😀', 'never splits a surrogate pair');
  assert.equal(chopChat('ab cd', 3), 'ab', 'no space left dangling at the cut');
});

test('invisible filler: gone from chat, an all-filler line is refused and costs nothing; nicknames are unchanged', () => {
  const fillers = [0x3164, 0x2800, 0x115f, 0x1160, 0xffa0, 0x34f, 0xfe0f, 0xe0020, 0xfffc];
  for (const cp of fillers) {
    const f = String.fromCodePoint(cp);
    assert.equal(cleanChat(f + f + f), '', cp.toString(16));
    const { m, ps, sent } = fixture(10);
    assert.deepEqual(sendChat(m, ps, f + ' ' + f), { ok: true });
    assert.equal(sent.length, 0, cp.toString(16));
    assert.equal(ps.chatLeft, 10, 'a blank line costs nothing');
  }
  const hangul = String.fromCodePoint(0x3164);
  assert.equal(cleanChat(`a${hangul}b ${hangul} c`), 'ab c', 'filler inside a line costs nothing either');
  assert.equal(cleanChat('\u0301\u0301'), '', 'combining marks with nothing to sit on');
  const heart = '\u2764\ufe0f';
  assert.equal(cleanChat(heart), heart, 'an emoji keeps what makes it draw as one');
  assert.equal(chopChat('\u0301a', 1), '', 'a cut that leaves nothing visible sends nothing');
  assert.equal(sanitizeName(hangul + 'x'), hangul + 'x', 'nicknames keep their own rules');
  assert.equal(cleanText(hangul), hangul);
});

test('a line is cleaned, charged by its letters and goes to everyone but the sender, by seat', () => {
  const { m, ps, sent } = fixture(10);
  assert.deepEqual(sendChat(m, ps, '   gg  wp   '), { ok: true });
  assert.deepEqual(sent, [{ msg: { t: 'm.chat', p: 1, x: 'gg wp' }, except: 'p_0' }]);
  assert.equal(ps.chatLeft, 5, 'spaces at the ends are free, the one inside counts');
  assert.equal(ps.dirtied, 0, 'spending costs no m.private of its own');
});

test('over the wallet: chopped to what is left, never refused', () => {
  const { m, ps, sent } = fixture(6);
  assert.deepEqual(sendChat(m, ps, 'a cheater wrote all of this'), { ok: true });
  assert.equal(sent[0].msg.x, 'a chea');
  assert.equal(ps.chatLeft, 0);
});

test('no wallet, an empty line, a bot or the cooldown: nothing sent, no error frame', () => {
  const { m, ps, sent, wait } = fixture(0);
  assert.deepEqual(sendChat(m, ps, 'hello'), { ok: true }, 'zero letters');
  ps.chatLeft = 10;
  assert.deepEqual(sendChat(m, ps, ' \u200b '), { ok: true }, 'nothing printable');
  assert.equal(sent.length, 0);
  assert.equal(ps.chatLeft, 10, 'an empty line costs nothing');
  sendChat(m, ps, 'one');
  assert.deepEqual(sendChat(m, ps, 'two'), { ok: true }, 'cooldown');
  assert.equal(sent.length, 1);
  assert.equal(ps.chatLeft, 7);
  wait();
  sendChat(m, ps, 'two');
  assert.equal(sent.length, 2);
  const bot = { ...ps, isBot: true };
  assert.deepEqual(sendChat(m, bot, 'beep'), { ok: true });
  assert.equal(sent.length, 2);
});

test('the wallet holds the round\'s kills, at most the enemies scheduled, and replaces what was left', () => {
  const { m, ps } = fixture(4);
  assert.equal(scheduledEnemies(field(5)), 6, 'every spawn entry, by count');
  assert.equal(scheduledEnemies({ players: [] }), Infinity, 'a server-run field reports for itself');
  noteChatKills(m, field(5), { perPlayer: { p_0: { creditedKills: 3 } } });
  settleChatWallet(ps, 2);
  assert.equal(ps.chatLeft, 3, 'nothing carries over');
  assert.equal(ps.chatRound, 2);
  noteChatKills(m, field(5), { perPlayer: { p_0: { creditedKills: 1e9 } } });
  settleChatWallet(ps, 3);
  assert.equal(ps.chatLeft, 6, 'a faked report buys the enemies sent');
  noteChatKills(m, { players: ['p_0'] }, { perPlayer: { p_0: { creditedKills: 1e9 } } });
  settleChatWallet(ps, 4);
  assert.equal(ps.chatLeft, CHAT_MAX_LETTERS, 'the safety ceiling');
});

test('zero kills is zero letters; 联防 kills add to the battle\'s; a stand-in result keeps the old wallet', () => {
  const { m, ps } = fixture(4);
  noteChatKills(m, field(5), { perPlayer: { p_0: { creditedKills: 0 } } });
  settleChatWallet(ps, 2);
  assert.equal(ps.chatLeft, 0);
  noteChatKills(m, field(5), { perPlayer: { p_0: { creditedKills: 2 } } });
  noteChatKills(m, field(1), { perPlayer: { p_0: { creditedKills: 9 } } });
  settleChatWallet(ps, 3);
  assert.equal(ps.chatLeft, 4, '2 + 2, each field clamped to its own schedule');
  noteChatKills(m, field(5), { synthetic: true, perPlayer: { p_0: { creditedKills: 0 } } });
  settleChatWallet(ps, 4);
  assert.equal(ps.chatLeft, 4);
  assert.equal(ps.chatRound, 3);
});

test('in a match: nothing to spend in round 1; the next prep\'s wallet is round 1\'s kills, for the living only', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 67, fake: true }).start();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round === 1);
  const [a, b] = ['p_0', 'p_1'].map((id) => m.players.get(id));
  assert.equal(a.privateView().chatLeft, 0);
  assert.equal(a.privateView().chatRound, 0);
  assert.deepEqual(m.handle('p_0', { t: 'g.chat', x: 'hello' }), { ok: true });
  assert.equal(h.lastBc('m.chat'), null, 'round 1: emotes only');
  b.alive = false;
  b.chatLeft = 7;
  h.drive(() => m.phase === PHASE.PREP && m.round === 2);
  assert.equal(a.chatRound, 1);
  assert.equal(a.chatLeft, Math.min(CHAT_MAX_LETTERS, a.creditedKills));
  assert.equal(b.chatLeft, 7, 'defeated: last words, no refill');
  a.chatLeft = 3;
  assert.deepEqual(m.handle('p_0', { t: 'g.chat', x: 'gg!!!' }), { ok: true });
  assert.deepEqual(h.lastBc('m.chat'), { t: 'm.chat', p: a.seat, x: 'gg!' });
});

test('lobby: the sender\'s socket gets no frame, every other member does', () => {
  const socket = () => ({ readyState: 1, bufferedAmount: 0, frames: [], send(data, cb) { this.frames.push(data); cb?.(); } });
  const members = ['a', 'b', 'spectator'].map((playerId) => ({ playerId, connected: true, ws: socket() }));
  const lobby = { memberSessions: () => members, peerRelay: { enabled: false }, stampPublic: (_r, msg, bytes) => ({ msg, bytes }), log: console };
  Lobby.prototype.broadcastRoom.call(lobby, {}, { t: 'm.chat', p: 0, x: 'hi' }, null, 'a');
  assert.deepEqual(members.map((s) => s.ws.frames.length), [0, 1, 1]);
  Lobby.prototype.broadcastRoom.call(lobby, {}, { t: 'm.ticker', text: 'x' });
  assert.deepEqual(members.map((s) => s.ws.frames.length), [1, 2, 2], 'other frames reach everyone');
});

test('page: a text bubble lives by its length, and only the newest bubble of a player shows', () => {
  const text = chatEntry('p', 'x'.repeat(50), 1000);
  assert.equal(text.ttl, chatBubbleMs(50));
  const emote = { seq: text.seq + 1, playerId: 'p', id: 'e', at: 2000 };
  assert.equal(activeBubbles([text], 1000 + chatBubbleMs(50) - 1).get('p').text.length, 50);
  assert.equal(activeBubbles([text], 1000 + chatBubbleMs(50)).size, 0);
  assert.deepEqual(activeBubbles([text, emote], 2500).get('p'), { id: 'e', seq: emote.seq, at: 2000 });
  assert.equal(activeBubbles([text, emote], 5001).size, 0, 'the expired emote does not bring the old line back');
});

test('page: mute a player', () => {
  let mute = [];
  assert.equal(chatMuted(mute, 'a'), false);
  mute = toggleChatMute(mute, 'a');
  assert.equal(chatMuted(mute, 'a'), true);
  assert.equal(chatMuted(mute, 'b'), false);
  assert.equal(chatMuted(toggleChatMute(mute, 'a'), 'a'), false);
});

test('page: the box takes no more than the wallet', () => {
  assert.equal(fitChatInput('hello', 5).value, 'hello');
  assert.equal(fitChatInput('hellox', 5).value, 'hello', 'the next letter stays out');
  assert.equal(fitChatInput('hello ', 5).value, 'hello', 'so does a space, free as it would be');
  assert.equal(fitChatInput('  hello', 5).value, '  hello', 'spaces in front cost nothing');
  assert.equal(fitChatInput('hello wor', 7).value, 'hello w', 'a paste keeps what fits');
  assert.equal(fitChatInput('hi ', 5).value, 'hi ', 'under the limit a space can start the next word');
  const mid = fitChatInput('heXllo', 5, 3);
  assert.deepEqual(mid, { value: 'hello', caret: 2 }, 'typing in the middle drops what was typed, not the end');
  assert.equal(fitChatInput('😀😀😀', 2).value, '😀😀', 'emoji stay whole');
  assert.equal(fitChatInput('医疗医疗', 3).value, '医疗医');
  assert.equal(fitChatInput('x'.repeat(100000), 3).value, 'xxx', 'a huge paste');
});
