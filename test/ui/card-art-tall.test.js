// test/ui/card-art-tall.test.js — the tall cards' 2D art (the solo room's, the result screen's: the official 232 × 458
// window's shape): shared/cardArtFraming.js tallRect ('upper' = the face rule on the tall shape, 'full' = contain) and
// dynCards.js cardArtRect(…, 'tall'). Every one of data/card-art-framing.json's 538 arts is checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tallRect, WIN_W, WIN_H, TOP_MIN } from '../../shared/cardArtFraming.js';
import { cardArtRect, setTallArtMode, tallArtMode } from '../../public/js/ui/dynCards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const table = JSON.parse(readFileSync(path.join(ROOT, 'data/card-art-framing.json'), 'utf8'));
const AR = WIN_W / WIN_H;
/** A rect in window units → card heights (card height 1, width AR). */
const inCard = ([L, T, W, H]) => ({ x: L / WIN_H + AR / 2, y: T / WIN_H + 0.5, w: W / WIN_H, h: H / WIN_H });

test("'upper' covers the whole tall card and keeps the head and the face inside, for every art of the table", () => {
  let n = 0;
  for (const [art, e] of Object.entries(table.stills)) {
    const aspect = e.rect[2] / e.rect[3];
    const r = inCard(tallRect({ aspect, face: e.face, mode: 'upper', wideH: e.rect[3] / WIN_H }));
    assert.ok(Math.abs(r.w / r.h - aspect) < 0.005, `${art}: the art's own aspect`);
    assert.ok(r.x <= 1e-6 && r.x + r.w >= AR - 1e-6, `${art}: covers the card's width`);
    assert.ok(r.y <= 1e-6 && r.y + r.h >= 1 - 1e-6, `${art}: covers the card's height`);
    const [fx, fy, top] = e.face;
    // the head's top keeps TOP_MIN from the card's top, unless the art's own margin above the head is smaller (a cover
    // cannot move the art down: such an art has the head at its very top edge)
    assert.ok(r.y + top * r.h >= Math.min(TOP_MIN, top * r.h) - 1e-6, `${art}: the head's top is inside`);
    assert.ok(r.y + fy * r.h > 0 && r.y + fy * r.h < 1 && r.x + fx * r.w > 0 && r.x + fx * r.w < AR, `${art}: the face is on the card`);
    n++;
  }
  assert.equal(n, Object.keys(table.stills).length);
});

test("'upper' keeps the wide card's scale (the scene's coverage) and never goes below a cover", () => {
  const wide = tallRect({ aspect: 1, face: [0.5, 0.3, 0.1], mode: 'upper', wideH: 1.8 });
  assert.ok(Math.abs(wide[3] / WIN_H - 1.8) < 1e-3, 'the wide scale');
  const small = tallRect({ aspect: 1, face: [0.5, 0.3, 0.1], mode: 'upper', wideH: 0.4 });
  assert.ok(small[3] / WIN_H >= 1 - 1e-3, 'a cover at least');
  // a wide art: its width alone covers, the face centred as far as the art allows
  const w = inCard(tallRect({ aspect: 1.5, face: [0.2, 0.3, 0.1], mode: 'upper' }));
  assert.ok(w.x <= 0 && w.x + w.w >= AR);
});

test("'full' puts the whole art inside the card, centred, and is the same for any face", () => {
  for (const aspect of [0.4, 0.506, 1, 1.5]) {
    const r = inCard(tallRect({ aspect, mode: 'full' }));
    assert.ok(r.x >= -1e-6 && r.x + r.w <= AR + 1e-6 && r.y >= -1e-6 && r.y + r.h <= 1 + 1e-6, `aspect ${aspect} inside`);
    assert.ok(Math.abs(r.x * 2 + r.w - AR) < 0.005 && Math.abs(r.y * 2 + r.h - 1) < 0.005, `aspect ${aspect} centred`);
    assert.ok(Math.abs(r.w - AR) < 0.005 || Math.abs(r.h - 1) < 0.005, `aspect ${aspect} touches the card on one axis`);
  }
  assert.deepEqual(tallRect({ aspect: 1, mode: 'full', face: [0.1, 0.9, 0.8] }), tallRect({ aspect: 1, mode: 'full' }));
  assert.equal(tallRect({ aspect: 0, mode: 'upper' }), null);
});

test('cardArtRect(…, tall): the box in % of the card, from the window units; a linked illustration art keeps its registered box', () => {
  const e = Object.values(table.stills)[0];
  const entry = { own: e.rect, face: e.face, key: null };
  // a card of the window's own shape, and a wider one: the same box, centred (u = min(w / 232, h / 458))
  for (const [w, h] of [[232, 458], [360, 560]]) {
    const p = cardArtRect(entry, w, h, 'tall', 'upper');
    const u = Math.min(w / WIN_W, h / WIN_H);
    const [L, , , H] = tallRect({ aspect: e.rect[2] / e.rect[3], face: e.face, mode: 'upper', wideH: e.rect[3] / WIN_H });
    assert.ok(Math.abs(p.left - (100 * (w / 2 + u * L)) / w) < 1e-6 && Math.abs(p.height - (100 * u * H) / h) < 1e-6 && p.width > 0);
  }
  const reg = [-50, -100, 700, 600];
  const linked = cardArtRect({ ...entry, reg, key: 'k', separate: false }, 232, 458, 'tall', 'full');
  assert.ok(Math.abs(linked.width - (100 * 700) / 232) < 1e-6, 'registered box, whatever the mode');
  assert.equal(cardArtRect(null, 232, 458, 'tall'), null);
  // the wide shape is untouched: the default shape
  assert.deepEqual(cardArtRect(entry, 900, 506), cardArtRect(entry, 900, 506, 'wide'));
});

test('the mode: upper by default, full when set, anything else back to upper', () => {
  assert.equal(tallArtMode, 'upper');
  setTallArtMode('full');
  const entry = { own: Object.values(table.stills)[0].rect, face: null, key: null };
  assert.notDeepEqual(cardArtRect(entry, 232, 458, 'tall'), cardArtRect(entry, 232, 458, 'tall', 'upper'));
  setTallArtMode('nonsense');
  assert.deepEqual(cardArtRect(entry, 232, 458, 'tall'), cardArtRect(entry, 232, 458, 'tall', 'upper'));
});
