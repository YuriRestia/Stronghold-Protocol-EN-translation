import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, describeCard, fmtCount } from '../public/js/challenges/texts.js';
import { ALL } from '../public/js/challenges/catalog.js';
import { generatePanel } from '../public/js/challenges/generate.js';

const prior = JSON.parse(fs.readFileSync(new URL('../public/js/challenges/prior.json', import.meta.url), 'utf8'));
const packs = Object.fromEntries(['en', 'ja', 'ko', 'zh-TW'].map((l) => [l, JSON.parse(fs.readFileSync(new URL(`../public/i18n/${l}.json`, import.meta.url), 'utf8'))]));

test('every instance a card can hold has words, and no placeholder is left unfilled', () => {
  for (const c of ALL.filter((x) => x.needsPrior)) {
    const s = describe(c.id, 'en');
    assert.equal(typeof s, 'string', `no text for ${c.id}`);
    assert.ok(s.length > 0 && !/\{\w+\}/.test(s), `${c.id}: ${s}`);
  }
  assert.equal(describe('nonsense'), null);
});

test('a card is a title and one line per condition', () => {
  const p = generatePanel({ prior, level: 1, seed: 3 });
  for (const card of p.cards) { const d = describeCard(card); assert.ok(d.title); assert.equal(d.lines.length, card.parts.length - 1); }
});

test('the new msgids are in all four language packs, with the placeholders of the source', () => {
  const src = fs.readFileSync(new URL('../public/js/ui/challenges.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../public/js/challenges/texts.js', import.meta.url), 'utf8');
  const ids = [...new Set([...src.matchAll(/\bt\('([^'\\]+)'/g)].map((m) => m[1]))];
  assert.ok(ids.length > 40);
  for (const [lang, pack] of Object.entries(packs)) for (const id of ids) {
    assert.ok(id in pack, `${lang} lacks ${id}`);
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(ph(pack[id]), ph(id), `${lang}: placeholders of ${id}`);
  }
});

test('counts are compact', () => { assert.match(fmtCount(5e6, 'en'), /5M/); assert.equal(fmtCount(300, 'en'), '300'); });
