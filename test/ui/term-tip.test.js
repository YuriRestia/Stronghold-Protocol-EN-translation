// Status keyword glossary: data/terms.json (tools/build-data.mjs buildTerms) defines every keyword the game texts tag, the
// language overlays translate it, and the popup (public/js/ui/termTip.js) is placed inside the viewport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseRichText } from '../../public/js/ui/richText.js';
import { placeTip } from '../../public/js/ui/termTip.js';

const DATA = new URL('../../data/', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(new URL(rel, DATA), 'utf8'));
const TAG = /<\$([A-Za-z0-9_.-]{1,48})>/g;
const terms = read('terms.json');

test('every keyword a data file tags has a definition, and so does every keyword a definition mentions', () => {
  const used = new Set();
  for (const f of readdirSync(DATA).filter((n) => n.endsWith('.json') && n !== 'terms.json')) {
    for (const m of readFileSync(new URL(f, DATA), 'utf8').matchAll(TAG)) used.add(m[1]);
  }
  for (const t of Object.values(terms)) for (const m of t.desc.matchAll(TAG)) used.add(m[1]);
  assert.ok(used.size >= 50, `${used.size} keywords`);
  const missing = [...used].filter((id) => !terms[id]);
  assert.deepEqual(missing, []);
  for (const [id, t] of Object.entries(terms)) assert.ok(t.name && t.desc, id);
});

test('the language overlays translate the glossary (official texts; a keyword a client lacks falls back)', () => {
  for (const lang of ['en', 'ja', 'ko', 'zh-TW']) {
    const ov = read(`i18n/${lang}.json`).files.terms;
    assert.ok(ov && Object.keys(ov).length >= 45, `${lang}: ${ov ? Object.keys(ov).length : 0} keywords translated`);
    for (const id of Object.keys(ov)) assert.ok(terms[id], `${lang}: ${id} is a glossary keyword`);
  }
  assert.equal(read('i18n/en.json').files.terms['ba.stun'].name, 'Stun');
});

test("a keyword segment carries its id; a style nested in a keyword keeps the keyword's id", () => {
  const segs = parseRichText('攻击使目标<$ba.stun>晕眩</>，<$ba.fragile>受到<@ba.vup>+20%</>伤害</>');
  assert.deepEqual(segs.filter((s) => s.term).map((s) => [s.text, s.termId]), [['晕眩', 'ba.stun'], ['受到', 'ba.fragile'], ['+20%', 'ba.fragile'], ['伤害', 'ba.fragile']]);
  assert.equal(segs.find((s) => s.text === '攻击使目标').termId, undefined);
});

test('the popup goes below the keyword when it fits, above it near the bottom, and never off screen', () => {
  const vw = 1000, vh = 600, w = 300, h = 100;
  assert.deepEqual(placeTip({ left: 100, top: 100, bottom: 120 }, w, h, vw, vh), { left: 100, top: 126 });
  assert.deepEqual(placeTip({ left: 100, top: 550, bottom: 570 }, w, h, vw, vh), { left: 100, top: 444 });
  assert.equal(placeTip({ left: 900, top: 100, bottom: 120 }, w, h, vw, vh).left, vw - w - 6);
  assert.equal(placeTip({ left: -20, top: 100, bottom: 120 }, w, h, vw, vh).left, 6);
});
