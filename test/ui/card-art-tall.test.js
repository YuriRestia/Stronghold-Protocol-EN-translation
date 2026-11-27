// test/ui/card-art-tall.test.js — the tall cards' 2D art (the solo room's, the result screen's: the official 232 × 458
// window's shape): an illustration's linked art keeps its registered box, every other art sits where the client's prefab
// puts it on the official card (tools/card-art-framing.mjs officialRect, stills[art].official), and an art without that
// keeps its room framing by height (dynCards.js cardArtRect(…, 'tall')).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { officialRect, turnedFace, PORTRAIT_UI } from '../../tools/card-art-framing.mjs';
import { unityToCard } from '../../public/js/render/dynillust/framing.js';
import { cardArtRect } from '../../public/js/ui/dynCards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const table = JSON.parse(readFileSync(path.join(ROOT, 'data/card-art-framing.json'), 'utf8'));
const linked = new Set(Object.values(table.registered).map((e) => e.art));
const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('officialRect: the prefab through the card\'s own holder, the same mapping the animated illustrations use', () => {
  // Executor's Elite 2 prefab [src: official chararts/char_279_excu.ab illust_char_279_excu_2 RectTransform]
  const f = { x: -25.1, y: 58.7, w: 1957, h: 1957, box: [0, 0, 1, 1] };
  const [L, T, W, H] = officialRect(f);
  // the renderer's map for a view of that size and offset whose camera spans the whole view
  const m = unityToCard({ cameraSize: f.h / 2, adjust: [[f.x, f.y, f.w, f.h]] }, 232, 458);
  near(116 + L, m.x0 - m.scale * (f.w / 2));
  near(229 + T, m.y0 - m.scale * (f.h / 2));
  near(W, m.scale * f.w); near(H, m.scale * f.h);
  // a file that holds only part of the canvas: that part's place
  const p = officialRect({ ...f, box: [0.25, 0.5, 0.75, 1] });
  near(p[0], L + W / 4); near(p[1], T + H / 2); near(p[2], W / 2); near(p[3], H / 2);
});

test('the table: hand-framed (linked) arts have no official box, the others a finite one of their own shape', () => {
  let n = 0;
  for (const [art, e] of Object.entries(table.stills)) {
    if (linked.has(art)) { assert.equal(e.official, undefined, `${art} is linked`); continue; }
    if (!e.official) continue;
    n++;
    assert.ok(e.official.length === 4 && e.official.every(Number.isFinite) && e.official[2] > 0 && e.official[3] > 0, art);
    // the art's own shape; the client stretches one itself (Aak's Elite 2 prefab, 1379 × 1428 for a square picture)
    const tol = art === 'char_225_haak_default.webp' ? 0.04 : 0.02;
    assert.ok(Math.abs(e.official[2] / e.official[3] / (e.rect[2] / e.rect[3]) - 1) < tol, `${art}: the art's own shape`);
    // some of the art shows on the card
    const [L, T, W, H] = e.official;
    assert.ok(L < 116 && L + W > -116 && T < 229 && T + H > -229, `${art}: on the card`);
  }
  assert.ok(n > 300, `${n} official boxes`);
});

test('turnedFace: the face of a portrait turned clockwise; the head\'s top above it', () => {
  const up = turnedFace(100, 200, 100, 0);           // the eyes 0.32 down the portrait, the head's top 0.06
  near(up.x, 100); near(up.y, 182); near(up.top, 156);
  const right = turnedFace(100, 200, 100, 90);
  near(right.x, 118); near(right.y, 200); near(right.top, 174);
  const down = turnedFace(100, 200, 100, 180);
  near(down.x, 100); near(down.y, 218);
});

test('an upside-down operator: the portrait\'s area in the middle of the card (Leonhardt\'s Elite 2)', () => {
  const turned = Object.entries(table.stills).filter(([, e]) => e.focus);
  assert.deepEqual(turned.map(([a]) => a), ['char_373_lionhd_default.webp']);
  const { rect, focus } = turned[0][1];
  near(rect[0] + focus[0] * rect[2], 0, 0.1); near(rect[1] + focus[1] * rect[3], 0, 0.1);
});

test('the still-only arts\' faces: at a size the official portraits have, inside the official card\'s window', () => {
  // W's chibi outfit: no face crop in the portrait, kept as it was
  const none = new Set(['char_1035_wisdel_game_9.webp']);
  let n = 0;
  for (const [art, e] of Object.entries(table.stills)) {
    if (linked.has(art) || !e.official || none.has(art)) continue;
    n++;
    const x = e.official[0] + e.face[0] * e.official[2], y = e.official[1] + e.face[1] * e.official[3];
    assert.ok(Math.abs(x) < 116 + 5 && y > -229 && y < -229 + 0.5 * 458, `${art}: the face at ${x.toFixed(0)}, ${y.toFixed(0)}`);
    // the portrait's height in UI units (0.26 of it between the eyes and the head's top; 0.73 the card's holder scale)
    const ui = ((e.face[1] - e.face[2]) / 0.26) * e.official[3] / 0.73;
    assert.ok(ui > PORTRAIT_UI[0] - 5 && ui < PORTRAIT_UI[1] + 5, `${art}: a portrait of ${ui.toFixed(0)} units`);
  }
  assert.ok(n > 400);
});

test('cardArtRect tall: linked, then official, then the room framing by height; the wide shape ignores official', () => {
  const own = [-300, -200, 600, 700], official = [-200, -229, 400, 458], reg = [-50, -100, 700, 600];
  // the official window's shape, a wider and a narrower card: contained, centred (u = min(w / 232, h / 458))
  for (const [w, h] of [[232, 458], [360, 560], [327, 946]]) {
    const u = Math.min(w / 232, h / 458);
    for (const [entry, box, k] of [
      [{ own, official, reg, key: 'k', separate: false }, reg, u],
      [{ own, official, reg: null, key: null, separate: true }, official, u],
      [{ own, official: null, reg: null, key: null, separate: true }, own, h / 458],
    ]) {
      const p = cardArtRect(entry, w, h, 'tall');
      near((p.left * w) / 100, w / 2 + k * box[0]); near((p.top * h) / 100, h / 2 + k * box[1]);
      near((p.width * w) / 100, k * box[2]); near((p.height * h) / 100, k * box[3]);
    }
  }
  const plain = { own, reg: null, key: null };
  assert.deepEqual(cardArtRect({ ...plain, official }, 900, 506), cardArtRect(plain, 900, 506));
  assert.equal(cardArtRect(null, 232, 458, 'tall'), null);
});
