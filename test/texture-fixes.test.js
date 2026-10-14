// test/texture-fixes.test.js — (fork) tools/assets/texture-fixes.mjs: art fixes painted into downloaded atlas pages.
// Synthetic pages throughout; the real Suzuran page is checked when it is on disk (public/assets, `npm run assets`).
// Run: node --test test/texture-fixes.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, rename, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIM_FIXES, regionRects, paintRim, applyRimFixes } from '../tools/assets/texture-fixes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = [250, 234, 229], DARK = [40, 10, 10];
const sharp = await import('sharp').then((m) => m.default || m, () => null);   // optional dependency

/** A 12×12 RGBA patch: skin, a 1 px dark outer rim, a 4×4 hole in the middle ringed by a 1 px dark line. */
function patch() {
  const W = 12, data = new Uint8Array(W * W * 4);
  const set = (x, y, [r, g, b], a = 255) => { const p = (y * W + x) * 4; data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a; };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) set(x, y, x === 0 || y === 0 || x === W - 1 || y === W - 1 ? DARK : SKIN);
  for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) set(x, y, DARK);
  for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) set(x, y, [0, 0, 0], 0);
  return { W, data, px: (x, y) => [...data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)] };
}

describe('regionRects', () => {
  test('finds named regions by page, a rotated one with its size swapped', () => {
    const atlas = 'a.png\nsize: 64,64\nformat: RGBA8888\nskip\n  rotate: false\n  xy: 0, 0\n  size: 4, 4\n' +
      'lid\n  rotate: true\n  xy: 10, 20\n  size: 5, 7\n  orig: 5, 7\n\nb.png\nsize: 32,32\nlid2\n  rotate: false\n  xy: 1, 2\n  size: 3, 4\n';
    const r = regionRects(atlas, ['lid', 'lid2']);
    assert.deepEqual(r.get('a.png'), [{ name: 'lid', x: 10, y: 20, w: 7, h: 5 }]);
    assert.deepEqual(r.get('b.png'), [{ name: 'lid2', x: 1, y: 2, w: 3, h: 4 }]);
  });
});

describe('paintRim', () => {
  test('paints the outer rim skin-coloured, keeps the line around the hole, and finds nothing the second time', () => {
    const p = patch();
    assert.ok(paintRim(p.data, p.W, { x: 0, y: 0, w: p.W, h: p.W }, 1) > 0);
    assert.deepEqual(p.px(0, 0).slice(0, 3), SKIN, 'outer rim: skin');
    assert.deepEqual(p.px(11, 6).slice(0, 3), SKIN);
    assert.deepEqual(p.px(3, 3), [...DARK, 255], 'hole line: as drawn');
    assert.equal(p.px(5, 5)[3], 0, 'the hole stays transparent');
    assert.equal(paintRim(p.data, p.W, { x: 0, y: 0, w: p.W, h: p.W }, 1), 0, 'idempotent');
  });

  test('a region with no eye hole is left alone', () => {
    const p = patch();
    for (let i = 3; i < p.data.length; i += 4) p.data[i] = 255;
    assert.equal(paintRim(p.data, p.W, { x: 0, y: 0, w: p.W, h: p.W }, 1), 0);
  });
});

describe('applyRimFixes on Suzuran\'s page', () => {
  const dir = path.join(ROOT, 'public/assets/spine/op/char_358_lisa/front');
  // the original download when one was kept aside (.cache, local only), else the page on disk
  const orig = path.join(ROOT, '.cache/char_358_lisa.orig.png');
  const page = existsSync(orig) ? orig : path.join(dir, 'char_358_lisa.png');
  const have = existsSync(path.join(dir, 'char_358_lisa.atlas')) && existsSync(page);

  test('no dark outer rim left, the eye-hole line kept, and a second run changes nothing', { skip: !have || !sharp ? 'model or sharp missing' : false }, async () => {
    const key = 'op:char_358_lisa:front';
    const atlas = readFileSync(path.join(dir, 'char_358_lisa.atlas'), 'utf8');
    const tmp = await mkdtemp(path.join(tmpdir(), 'sp-rim-'));
    try {
      await copyFile(page, path.join(tmp, 'char_358_lisa.png'));
      const io = { readFile, writeFile, rename };
      const first = await applyRimFixes(key, atlas, (p) => path.join(tmp, p), io);
      assert.equal(first.problem, null);
      const again = await applyRimFixes(key, atlas, (p) => path.join(tmp, p), io);
      assert.equal(again.problem, null);
      assert.equal(again.painted, 0, 'idempotent');
      const { data, info } = await sharp(path.join(tmp, 'char_358_lisa.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const r of [...regionRects(atlas, RIM_FIXES[key].regions).values()].flat()) {
        // dark drawn pixels (any alpha: the hole line is soft) on the region's border rows / columns (the outer rim) vs
        // anywhere (the hole line)
        let rim = 0, dark = 0;
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
          const p = ((r.y + y) * info.width + r.x + x) * 4;
          if (data[p + 3] < 8 || (data[p] + data[p + 1] + data[p + 2]) / 3 >= 150) continue;
          dark++;
          if (x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1) rim++;
        }
        assert.equal(rim, 0, `${r.name}: no dark outer rim`);
        assert.ok(dark > 0, `${r.name}: the line around the eye hole is kept`);
      }
    } finally { await rm(tmp, { recursive: true, force: true }); }
  });
});
