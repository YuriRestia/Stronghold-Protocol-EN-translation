// test/ui/dyn-cover-framing.test.js — the wide room cards' framing per animated illustration (tools/dyn-cover-framing.mjs,
// data/dyn-card-framing.json; the user's "card zoom" framed on the operator's face, 2026-11-23): the face stays put or
// moves into its line, the head always fits, the pick, and the generated table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planFraming, pickFraming, framingTable, ZOOMS, BAND, TOP_MIN, FACE_MAX, PLAIN } from '../../tools/dyn-cover-framing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('a zoom about the planned point puts the face on its line and keeps the head inside', () => {
  // a face already on the line: zoom 1 keeps it; a zoom keeps the face put
  const ok = { x: 0.5, y: 0.3, top: 0.15 };
  assert.deepEqual(planFraming(ok, 1), { zoom: 1, fx: 0.5, fy: 0.3, faceY: 0.3, top: 0.15 });
  const z = planFraming(ok, 1.2);
  assert.ok(Math.abs(z.fy + 1.2 * (ok.y - z.fy) - 0.3) < 1e-9, 'the face stays at 0.3');
  // a face too high: zoom 1 is no option, a zoom moves it down onto the line
  const high = { x: 0.4, y: 0.12, top: 0.05 };
  assert.equal(planFraming(high, 1), null);
  const p = planFraming(high, 1.2);
  assert.ok(Math.abs(p.fy + 1.2 * (high.y - p.fy) - BAND[0]) < 1e-9, 'moved to the line');
  assert.equal(p.fx, 0.4, 'x stays the face\'s');
  // a tall head: the line drops (up to FACE_MAX) so the head's top stays inside
  const tall = { x: 0.5, y: 0.2, top: -0.05 };
  const t = planFraming(tall, 1.1);
  assert.ok(t.top >= TOP_MIN - 1e-9 && t.faceY <= FACE_MAX, JSON.stringify(t));
  // no face bones: the fixed focus
  assert.deepEqual(planFraming(null, 1.2), { zoom: 1.2, fx: 0.5, fy: 0.25, faceY: null, top: null });
});

test('the pick: the smallest zoom covering the card with the head inside, else the best covering one', () => {
  const tries = {
    1: { zoom: 1, top: 0.1, uncovered: 9 },
    1.1: { zoom: 1.1, top: 0.08, uncovered: 0.4 },
    1.2: { zoom: 1.2, top: 0.05, uncovered: 0 },
  };
  assert.equal(pickFraming(tries).zoom, 1.1);
  // a cut head never wins, even covering
  assert.equal(pickFraming({ 1: { zoom: 1, top: 0.1, uncovered: 5 }, 1.35: { zoom: 1.35, top: -0.01, uncovered: 0 } }).zoom, 1);
  assert.equal(pickFraming({}), null);
  assert.deepEqual(ZOOMS, [1, 1.1, 1.2, 1.35]);
});

test('data/dyn-card-framing.json: generated, one sane entry per illustration of the index', () => {
  const t = JSON.parse(readFileSync(path.join(ROOT, 'data/dyn-card-framing.json'), 'utf8'));
  assert.match(t._source, /tools\/dyn-cover-framing\.mjs: generated/);
  const keys = Object.keys(t.cards);
  assert.ok(keys.length >= 90, `${keys.length} illustrations`);
  for (const [k, c] of Object.entries(t.cards)) {
    // the generated zoom steps, or a user's own framing (any zoom)
    assert.ok(ZOOMS.includes(c.zoom) || (c.by === 'user' && c.zoom > 0), `${k} zoom ${c.zoom}`);
    assert.ok(Number.isFinite(c.fx) && Number.isFinite(c.fy), `${k} focus`);
  }
  // the same table the tool writes from a measurement
  assert.deepEqual(framingTable({ rows: [{ key: 'b', pick: { zoom: 1.1, fx: 0.51234, fy: -0.2 } }, { key: 'a', pick: null }] }).cards,
    { b: { zoom: 1.1, fx: 0.5123, fy: -0.2 } });
  // the user's plain-framing list (2026-11-23, "no zooming needed"): zoom 1 whatever the measurement picked
  // (its measured face framing kept as `face`, for the review page's Zoomed switch)
  assert.deepEqual(framingTable({ rows: [{ key: PLAIN[0], pick: { zoom: 1.35, fx: 0.4, fy: 0.1 } }] }).cards,
    { [PLAIN[0]]: { zoom: 1, fx: 0.5, fy: 0.5, face: { zoom: 1.35, fx: 0.4, fy: 0.1 } } });
  // (unless the user framed it by hand since: their framing wins, `by: 'user'`)
  for (const k of PLAIN) assert.ok(t.cards[k].by === 'user' || (t.cards[k].zoom === 1 && t.cards[k].fx === 0.5 && t.cards[k].fy === 0.5), `${k} at the plain card framing`);
  // the user's hand framings replace the measured ones
  const ed = framingTable({ rows: [{ key: 'q', pick: { zoom: 1.2, fx: 0.5, fy: 0.3 } }] }, { exported: 'x', cards: { q: { zoom: 1.0023, fx: 2.78651, fy: -7.0493, edited: true }, r: { zoom: 2, fx: 0, fy: 0, edited: false } } });
  assert.deepEqual(ed.cards, { q: { zoom: 1.0023, fx: 2.7865, fy: -7.0493, by: 'user' } });
  assert.equal(PLAIN.length, 23);
  // every illustration of the local index, when this checkout has one
  const local = path.join(ROOT, 'data/local-assets.json');
  const idx = existsSync(local) ? JSON.parse(readFileSync(local, 'utf8')).groups?.dynillust : null;
  if (idx) for (const k of Object.keys(idx)) assert.ok(t.cards[k], `${k} has a framing`);
});
