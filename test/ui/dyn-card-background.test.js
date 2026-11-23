// test/ui/dyn-card-background.test.js — a wide room card's official home background (the user's picks of 2026-11-23):
// the table (tools/dyn-card-background.mjs → data/dyn-card-background.json), the key lookup the cards use without the
// renderer (render/dynillust/key.js), and the dissolve picture's helpers (ui/cardEntrance.js paintCover, scaleFilterPx).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { backgroundTable, PICKS, NAMES } from '../../tools/dyn-card-background.mjs';
import { findDynIllustKey } from '../../public/js/render/dynillust/key.js';
import { findDynIllustKey as fromIndex } from '../../public/js/render/dynillust/index.js';
import { paintCover, scaleFilterPx } from '../../public/js/ui/cardEntrance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the table: every illustration once, every background named, the file as the tool writes it', () => {
  const t = backgroundTable();
  const keys = Object.values(PICKS).flat();
  assert.equal(keys.length, new Set(keys).size, 'no illustration picked twice');
  assert.equal(Object.keys(t.cards).length, keys.length);
  for (const bg of Object.keys(t.backgrounds)) assert.ok(bg in NAMES, bg);
  // the user's changes of 2026-11-23
  assert.equal(t.cards['char_4179_monstr_boc#11'], 'bg_laterano_1');
  assert.equal(t.cards['char_245_cello_sale#12'], 'bg_rhodes_night');
  assert.equal(t.cards['char_1044_hsgma2_whirlwind#11'], 'bg_rogue_2');
  assert.equal(t.cards['char_1044_hsgma2_2'], 'bg_anniversary_1');
  assert.equal(t.cards['char_1013_chen2_2'], 'bg_siesta_1');
  const file = readFileSync(path.join(ROOT, 'data', 'dyn-card-background.json'), 'utf8');
  assert.equal(file, `${JSON.stringify(t, null, 1)}\n`, 'run node tools/dyn-card-background.mjs');
  assert.throws(() => backgroundTable({ bg_yan_1: ['a'], bg_sui_1: ['a'] }), /twice/);
  assert.throws(() => backgroundTable({ bg_nowhere: ['a'] }), /no name/);
});

test('the key lookup is one function, importable without the renderer', () => {
  assert.equal(fromIndex, findDynIllustKey);
  const group = { 'char_1013_chen2_2': { charId: 'char_1013_chen2', skinId: 'char_1013_chen2#2' } };
  assert.equal(findDynIllustKey(group, 'char_1013_chen2', null), 'char_1013_chen2_2');
  assert.equal(findDynIllustKey(group, 'char_1013_chen2', 'char_1013_chen2@summer#20'), null);
  assert.equal(findDynIllustKey(null, 'char_1013_chen2'), null);
});

test('paintCover draws as CSS cover at the position', () => {
  const calls = [];
  const g = { drawImage: (...a) => calls.push(a) };
  const img = { width: 1280, height: 720 };
  // a 16:10 box of 800 × 500: the image is scaled by 500 / 720 to cover the height, its width overflows
  paintCover(g, img, 800, 500, 0.5, 0.55);
  const [, x, y, w, h] = calls[0];
  assert.ok(Math.abs(h - 500) < 1e-9 && Math.abs(w - 1280 * 500 / 720) < 1e-9);
  assert.ok(Math.abs(x - (800 - w) * 0.5) < 1e-9 && Math.abs(y) < 1e-9);
  // a tall box: covers the width, the 55 % position moves it up a little more than centred
  calls.length = 0;
  paintCover(g, img, 300, 600, 0.5, 0.55);
  const [, x2, y2, w2, h2] = calls[0];
  assert.ok(Math.abs(h2 - 600) < 1e-9 && w2 > 300 && Math.abs(x2 - (300 - w2) * 0.5) < 1e-9 && y2 === 0);
  calls.length = 0;
  paintCover(g, { width: 0, height: 0 }, 100, 100);
  assert.equal(calls.length, 0, 'an empty image draws nothing');
});

test('scaleFilterPx scales a computed filter\'s px lengths to device px', () => {
  assert.equal(scaleFilterPx('drop-shadow(rgba(6, 10, 15, 0.55) 0px 0px 4.9px)', 1.5), 'drop-shadow(rgba(6, 10, 15, 0.55) 0px 0px 7.35px)');
  assert.equal(scaleFilterPx('grayscale(0.8) brightness(0.6)', 2), 'grayscale(0.8) brightness(0.6)');
  assert.equal(scaleFilterPx('none', 2), 'none');
  assert.equal(scaleFilterPx('blur(3px)', 1), 'blur(3px)');
});
