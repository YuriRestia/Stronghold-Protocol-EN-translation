// test/ui/card-art-framing.test.js — the wide room card's full art (the user's picks of 2026-11-23: the outfit's full
// art where the illustration draws, a still-only operator framed on its face): tools/card-art-framing.mjs (the units, the
// still rule, the key → art map), data/card-art-framing.json, dynCards.js cardArtRect (the same box as the tool's) and
// assetUrls.js chessFullArtUrl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toUnits, fromUnits, stillFraming, artOfKey, STILL_AR, STILL_ZOOMS } from '../../tools/card-art-framing.mjs';
import { TOP_MIN, FACE_MAX } from '../../tools/dyn-cover-framing.mjs';
import { cardArtRect, staticPlacement } from '../../public/js/ui/dynCards.js';
import { chessFullArtUrl } from '../../public/js/ui/assetUrls.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('card units: the tool\'s round trip, and the card\'s box (cardArtRect) the same as the tool\'s', () => {
  // a 16:9 card 900 px wide, an art box partly outside it
  const w = 900, h = w * 9 / 16, r = { x: -120, y: -300.5, w: 1300, h: 1250 };
  const back = fromUnits(toUnits(r, w, h), w, h);
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(near(back[k], r[k], 0.02), `${k} ${back[k]} vs ${r[k]}`);
  // a still: no zoom of its own, the box in % of the card
  const rect = toUnits(r, w, h);
  const p = cardArtRect({ own: rect, key: null }, w, h);
  assert.ok(near(p.left, (100 * back.x) / w) && near(p.top, (100 * back.y) / h) && near(p.width, (100 * back.w) / w) && near(p.height, (100 * back.h) / h));
  // the same box on a Grand Alliance card (1.6): the same height, the sides cropped (units from the centre, u = h / 458)
  const g = cardArtRect({ own: rect, key: null }, h * 1.6, h);
  assert.ok(near(g.height, p.height) && near(g.top, p.top));
  assert.equal(cardArtRect(null, w, h), null);
  // the cover's helper: css px, null without a placement (the table not loaded here)
  assert.equal(staticPlacement('/assets/outfit/art/none.webp', w, h), null);
  assert.equal(cardArtRect({ own: rect, key: null }, 0, h), null);
  // an illustration's art: linked, the registered box (its illustration's framing value on top); separate, its own box
  const reg = toUnits({ x: 10, y: 20, w: 600, h: 500 }, w, h);
  const linked = cardArtRect({ own: rect, reg, key: 'k_unknown', separate: false }, w, h);
  assert.ok(near(linked.left, (100 * fromUnits(reg, w, h).x) / w, 0.01), 'linked: the registered box (no table value: zoom 1)');
  const apart = cardArtRect({ own: rect, reg, key: 'k_unknown', separate: true }, w, h);
  assert.ok(near(apart.left, p.left), 'separate: its own box');
});

test('a still full art is framed like the linked arts: the head\'s top 0.03 from the card\'s top, the art over the card', () => {
  // an opaque square art, the face high in it
  const opaque = { w: 64, h: 64, A: new Float32Array(64 * 64).fill(1) };
  const p = stillFraming({ x: 0.5, y: 0.2, top: 0.12 }, opaque);
  assert.equal(p.zoom, 1, 'an opaque art covers at once');
  assert.equal(p.uncovered, 0);
  // the linked arts' placement (median head top 0.03, face 0.16 of the card, 2026-11-24)
  assert.ok(Math.abs(p.top - (TOP_MIN + 0.01)) < 1e-9, `head top ${p.top}`);
  assert.ok(p.faceY > 0 && p.faceY <= FACE_MAX + 1e-9, `face ${p.faceY}`);
  // the art covers the card's sides: x ≤ 0 and x + w ≥ the card's width
  assert.ok(p.rect.x <= 1e-9 && p.rect.x + p.rect.w >= STILL_AR - 1e-9);
  // an art transparent in its left 60 %: no zoom covers the card (its opaque part is narrower than the card at any step),
  // the pick is the best covering one — the largest zoom
  const part = { w: 64, h: 64, A: new Float32Array(64 * 64).map((_, i) => ((i % 64) < 38 ? 0 : 1)) };
  const q = stillFraming({ x: 0.8, y: 0.3, top: 0.2 }, part);
  assert.ok(q.uncovered > 0 && q.top >= TOP_MIN - 1e-9, JSON.stringify(q));
  assert.equal(q.zoom, STILL_ZOOMS.at(-1));
});

test('an illustration key\'s full art: the outfit\'s (letter case aside), else the Elite 2 default', () => {
  assert.equal(artOfKey(assets, 'char_003_kalts_sale#14'), assets.outfits.chars['char_003_kalts@sale#14'].art);
  assert.equal(artOfKey(assets, 'char_172_svrash_ambiencesynesthesia#4'), assets.outfits.chars['char_172_svrash@ambienceSynesthesia#4'].art);
  assert.equal(artOfKey(assets, 'char_2015_dusk_2'), assets.outfits.defaults.char_2015_dusk.art);
  assert.equal(artOfKey(assets, 'char_nobody_x#1'), null);
});

test('chessFullArtUrl: the outfit\'s full art, else the default; none for a skin picture or an outfit without one', () => {
  const chess = { charId: 'char_003_kalts' };
  assert.equal(chessFullArtUrl(assets, chess, { outfit: 'char_003_kalts@sale#14' }), assets.outfits.chars['char_003_kalts@sale#14'].art);
  assert.equal(chessFullArtUrl(assets, chess, { outfit: null }), assets.outfits.defaults.char_003_kalts.art);
  const m = { ...assets, outfits: { ...assets.outfits, chars: { ...assets.outfits.chars, 'char_003_kalts@x#1': { portrait: '/p.png' } } },
    chars: { ...assets.chars, char_003_kalts: { ...assets.chars.char_003_kalts, skins: { s1: { portrait: '/s.png' } } } } };
  assert.equal(chessFullArtUrl(m, chess, { outfit: 'char_003_kalts@x#1' }), null, 'an outfit without its full art');
  assert.equal(chessFullArtUrl(m, chess, { outfit: null, skin: 's1' }), null, 'a skin picture');
  assert.equal(chessFullArtUrl(assets, { charId: 'char_nobody' }, { outfit: null }), null);
});

test('data/card-art-framing.json: generated; every full art framed on its own (static and live apart), registrations kept', () => {
  const t = JSON.parse(readFileSync(path.join(ROOT, 'data/card-art-framing.json'), 'utf8'));
  assert.match(t._source, /tools\/card-art-framing\.mjs: generated/);
  // the static art: linked to its illustration by default, its own placement for the listed exceptions (the user,
  // 2026-11-23); registered on zoomed-out captures every match is trustworthy (Chongyue's E2: 0.41 on a tight crop,
  // 0.96 zoomed out), so none is apart by default
  assert.equal(t.l2d, undefined);
  assert.ok(Array.isArray(t.separate), JSON.stringify(t.separate));
  for (const [k, e] of Object.entries(t.registered)) assert.ok(e.score >= 0.8, `${k} registered at ${e.score}`);
  const framing = JSON.parse(readFileSync(path.join(ROOT, 'data/dyn-card-framing.json'), 'utf8')).cards;
  for (const key of Object.keys(framing)) {
    const art = path.basename(artOfKey(assets, key));
    const s = t.stills[art];
    assert.ok(s, `${key}: its full art ${art} framed as a still`);
    assert.ok(s.rect.length === 4 && s.rect[2] > 0 && s.rect[3] > 0, art);
    // the registration on the illustration, kept for reference
    assert.equal(t.registered[key]?.art, art, `${key} registered`);
  }
  for (const [art, e] of Object.entries(t.stills)) assert.ok(e.rect.length === 4 && e.rect[2] > 0 && e.rect[3] > 0, art);
  // the full arts this checkout has
  if (existsSync(path.join(ROOT, 'public/assets/outfit/art'))) assert.ok(Object.keys(t.stills).length >= 500, `${Object.keys(t.stills).length} stills`);
});
