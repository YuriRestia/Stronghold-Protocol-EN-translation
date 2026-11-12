// (fork, 2026-11-13) tools/news-block.mjs — the `News:` block of a player changelog fragment (its update news lines in
// every language, names from the game data) — and how tools/changelog.mjs checks it. No servers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsBlock, checkNewsItems, expandLine, createNames, NEWS_LANGS } from '../tools/news-block.mjs';
import { parseFragment } from '../tools/changelog.mjs';

/** Fake game names: op_a is named in every language but Japanese; terms are tagged by language. */
const fakeNames = {
  name(id, code, own) {
    const t = { op_a: { en: 'Ann', zh: '安', ko: '안' } }[id];
    if (!t) return { error: `{name:${id}}: no such id` };
    const v = code === 'zh-TW' ? t.zh : t[code];
    if (own != null) return v ? { error: `{name:${id}|${own}}: the game data names it "${v}"` } : { text: own };
    return v ? { text: v } : { error: `{name:${id}}: no ${code} name` };
  },
  term: (zh, code) => ({ text: code === 'zh' || code === 'zh-TW' ? zh : `${code}:${zh}` }),
};

const block = (...items) => ['News:', '', ...items].join('\n');
const item = (kind, en, o = {}) => [
  `- ${kind}: ${en}`,
  ...['zh', 'ja', 'ko', 'zh-TW'].filter((l) => o[l] !== null).map((l) => `  ${l}: ${o[l] ?? `${l} ${en}`}`),
].join('\n');

describe('News block parser', () => {
  test('items with their languages; highlight and point', () => {
    const { items, errors } = parseNewsBlock('a.md', block(item('highlight', 'Big'), item('point', 'Small')));
    assert.deepEqual(errors, []);
    assert.deepEqual(items.map((i) => [i.kind, Object.keys(i.lines)]), [['highlight', NEWS_LANGS], ['point', NEWS_LANGS]]);
    assert.equal(items[1].lines['zh-TW'], 'zh-TW Small');
  });

  test('shape errors are named', () => {
    assert.match(parseNewsBlock('a.md', 'News: x\n\n- point: y\n  zh: z').errors[0], /stands alone/);
    assert.match(parseNewsBlock('a.md', block('- bullet: x')).errors[0], /starts with "- highlight:" or "- point:"/);
    assert.match(parseNewsBlock('a.md', block('- point: x', '  fr: y')).errors[0], /unknown language "fr"/);
    assert.match(parseNewsBlock('a.md', block('- point: x', '  zh: y', '  zh: z')).errors[0], /"zh" twice/);
    assert.match(parseNewsBlock('a.md', block('stray text')).errors[0], /not "- point: …"/);
    assert.match(parseNewsBlock('a.md', 'News:\n').errors[0], /has no "- point:"/);
  });
});

describe('News checks', () => {
  const check = (...items) => checkNewsItems('a.md', parseNewsBlock('a.md', block(...items)).items, fakeNames);

  test('names and terms filled in per language; zh-TW falls back to Chinese', () => {
    const { errors, expanded } = check(item('point', '{name:op_a} joins {term:大同盟}', { ja: '{name:op_a|アン}が{term:大同盟}に', zh: '{name:op_a}加入{term:大同盟}' }));
    assert.deepEqual(errors, []);
    assert.deepEqual(expanded[0].lines, { en: 'Ann joins en:大同盟', zh: '安加入大同盟', ja: 'アンがja:大同盟に', ko: 'ko 안 joins ko:大同盟', 'zh-TW': 'zh-TW 安 joins 大同盟' });
  });

  test('every language, the same placeholders and tags, the line limit, the |name override only where needed', () => {
    assert.match(check(item('point', 'x', { ko: null })).errors[0], /no ko line/);
    assert.match(check(item('point', '{name:op_a} x', { zh: 'x' })).errors.join('\n'), /zh line has other \{name:…\}/);
    assert.match(check(item('point', '<@sp.leaf>x</>', { ja: 'x' })).errors.join('\n'), /ja line has other colour tags/);
    assert.match(check(item('point', 'x'.repeat(201))).errors.join('\n'), /201 characters once filled in/);
    assert.match(check(item('point', '{name:op_a} x', { ja: '{name:op_a} x' })).errors.join('\n'), /ja: \{name:op_a\}: no ja name/);
    assert.match(check(item('point', '{name:op_a|Anna} x')).errors.join('\n'), /en: \{name:op_a\|Anna\}: the game data names it "Ann"/);
    assert.match(check(item('point', '{name:nope} x')).errors.join('\n'), /no such id/);
    assert.deepEqual(expandLine('{name:op_a} and {name:op_a}', 'ko', fakeNames), { text: '안 and 안', errors: [] });
  });

  test('the real game data: names by id in every language, and the missing Japanese Talulah', () => {
    const names = createNames();
    const swire = Object.fromEntries(NEWS_LANGS.map((l) => [l, names.name('char_1033_swire2', l).text]));
    assert.deepEqual(swire, { en: 'Swire the Elegant Wit', zh: '琳琅诗怀雅', ja: '琳琅スワイヤー', ko: '스와이어 디 엘리건트 위트', 'zh-TW': '琳瑯詩懷雅' });
    assert.equal(names.term('大同盟', 'en').text, 'Grand Alliance');
    assert.match(names.name('char_4247_oxi', 'ja').error, /write it out as \{name:char_4247_oxi\|<name>\}/);
    assert.equal(names.name('char_4247_oxi', 'ja', 'タルラ').text, 'タルラ');
    assert.match(names.name('char_4247_oxi', 'en', 'Talulah').error, /names it "Talulah"/);
  });
});

describe('changelog --check with a News block', () => {
  const frag = (kind, news) => `## 2026-11-13\n\n### Ann joins\n\n- x\n\nKind: ${kind}\n\nServer cost: none\n${news ? `\n${news}\n` : ''}`;

  test('a player fragment with a valid block passes; the block is never folded into the body', () => {
    const f = parseFragment('a.md', frag('player', block(item('point', '{name:op_a} joins', { ja: '{name:op_a|アン} joins' }))), { names: fakeNames });
    assert.deepEqual(f.errors, []);
    assert.equal(f.newsLines[0].lines.en, 'Ann joins');
    assert.doesNotMatch(f.body, /News|op_a/);
  });

  test('a player fragment without one is fine; an internal one with one is refused; bad blocks are named', () => {
    assert.deepEqual(parseFragment('a.md', frag('player'), { names: fakeNames }).errors, []);
    assert.match(parseFragment('a.md', frag('internal', block(item('point', 'x'))), { names: fakeNames }).errors.join('\n'), /belongs to a "Kind: player" fragment only/);
    assert.match(parseFragment('a.md', frag('player', block(item('point', 'x', { zh: null }))), { names: fakeNames }).errors.join('\n'), /no zh line/);
    assert.match(parseFragment('a.md', frag('player', block(item('point', 'Faster on the usspa box'))), { names: fakeNames }).errors.join('\n'), /operator-only content in a News line/);
  });
});
