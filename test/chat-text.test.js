// (fork) Chat is plain text (user, 2026-11-11; shared/text.js cleanChat / chatLine / chatDraft): the abuse strings of the
// room-chat proposal's table, the languages that must pass untouched, and the line cap (100 letters as a reader counts
// them, never more than 300 code points). docs/design/network.md "Chat text".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatDraft, chatLine, chopChat, cleanChat, letterCount } from '../shared/text.js';
import { CHAT_LINE_CODEPOINTS, CHAT_LINE_LETTERS } from '../shared/constants.js';

const ABUSE = [
  ['HTML tags', '<b>gg</b> <img src=x onerror=alert(1)> ez', 'gg ez'],
  ['a script tag (the text between tags stays, as text)', '<script>steal()</script>hi', 'steal() hi'],
  ['emoji', 'nice \u{1F602}\u{1F525}\u{1F44D} run', 'nice run'],
  ['a flag and keycaps', 'from \u{1F1EF}\u{1F1F5} rank #️⃣1️⃣', 'from rank #1'],
  ['a ZWJ family emoji', 'team \u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}', 'team'],
  ['an RTL override', 'gg ‮ez‬ wp', 'gg ez wp'],
  ['zero-width characters', 'n​o‌o‍b⁠s', 'noobs'],
  ['invisible Hangul fillers', 'ㅤㅤㅤ', ''],
  ['fancy-font, double-struck and fullwidth letters', '\u{1D4D7}\u{1D4EE}\u{1D4F5}\u{1D4F5}\u{1D4F8} \u{1D568}\u{1D560}\u{1D563}\u{1D55D}\u{1D555} ｆｕｌｌｗｉｄｔｈ', 'Hello world fullwidth'],
  ['circled and squared letters', 'Ⓖⓖ \u{1F136}\u{1F136}', 'Gg GG'],
  ['a box-drawing kaomoji', '(╯°□°)╯︵ ┻━┻', '()('],
  ['blank braille cells', '⠀⠀⠀', ''],
  ['private-use (icon font) characters', 'look  here', 'look here'],
  ['line breaks and tabs', 'a\n\n\tb\r\nc', 'a b c'],
  ['control characters and a lone surrogate', 'a\u0000b\u0007c\uD800d', 'abcd'],
  ['variation selectors and tag characters', 'x️y\u{E0041}z', 'xyz'],
];
const KEPT = [
  ['"less than" is not a tag', 'I <3 this, 2 < 5'],
  ['Japanese (fullwidth punctuation kept)', 'よろしくお願いします！'],
  ['Chinese', '加油，我们能赢。'],
  ['Korean', '잘 부탁해요~'],
  ['Vietnamese', 'Chúc mừng, tiếng Việt!'],
  ['Thai', 'ที่นี่ สวัสดี'],
  ['Hindi', 'नमस्ते, स्त्री'],
  ['prices and maths', '$5 = 3+2, 50% off, €10, 2×3÷1±0 | a~b'],
];

test('every abuse string of the proposal comes out as plain text', () => {
  for (const [what, typed, want] of ABUSE) assert.equal(cleanChat(typed), want, what);
});

test('Zalgo: at most 2 marks stay on a letter', () => {
  const zalgo = 'h' + '̸̡̢̛̗̘̙̜' + 'e' + '̶̢̧̛̖̗' + 'p';
  const out = cleanChat(zalgo);
  assert.equal(out, 'h̸̡e̶̢p');
  assert.equal(letterCount(out), 3);
});

test('real writing in every language passes untouched', () => {
  for (const [what, text] of KEPT) assert.equal(cleanChat(text), text.normalize('NFC'), what);
});

test('letters are counted as a reader sees them (grapheme clusters)', () => {
  assert.equal(letterCount('hello'), 5);
  assert.equal(letterCount('加油'), 2);
  assert.equal(letterCount('é'), 1, 'an accented letter in decomposed form is one');
  assert.equal(letterCount('ที่'), 1, 'a Thai syllable with two marks is one');
  assert.equal(letterCount('स्त'), 1, 'a Hindi conjunct is one');
});

test('a line: at most 100 letters, never more than 300 code points, no space left at the cut', () => {
  assert.equal(chatLine('x'.repeat(250)), 'x'.repeat(CHAT_LINE_LETTERS));
  assert.equal(letterCount(chatLine('漢'.repeat(150))), CHAT_LINE_LETTERS);
  const conj = chatLine('स्त'.repeat(150));
  assert.equal([...conj].length, CHAT_LINE_CODEPOINTS, 'conjuncts of 3 code points: 100 letters, 300 code points');
  const marks = chatLine('é̂'.repeat(150));
  assert.ok([...marks].length <= CHAT_LINE_CODEPOINTS);
  assert.ok(Buffer.byteLength(conj) <= 900, 'the worst line stays under 1 KB');
  assert.equal(chatLine('ab cd', 3), 'ab', 'a wallet under the cap cuts first');
  assert.equal(chatLine('x'.repeat(300), 500), 'x'.repeat(CHAT_LINE_LETTERS), 'a wallet over the cap still takes one line');
  assert.equal(chopChat('😀😀😀', 2), '😀😀', 'the cut itself never splits a cluster');
  assert.equal(chatLine('😂😂'), '', 'a line of nothing allowed is not sent');
  assert.equal(chatLine('x'.repeat(100000)), 'x'.repeat(CHAT_LINE_LETTERS), 'a huge paste is read only so far');
});

test('the box filters as typed but keeps the spaces (a trailing space starts the next word)', () => {
  assert.equal(chatDraft('hi '), 'hi ');
  assert.equal(chatDraft('  hi😂 '), '  hi ');
  assert.equal(chatDraft('a\nb'), 'a b');
  assert.equal(chatDraft('<b>x'), ' x', 'a finished tag goes as soon as it is typed');
  assert.equal(chatDraft('<b'), '<b', 'an unfinished one is just text');
});
