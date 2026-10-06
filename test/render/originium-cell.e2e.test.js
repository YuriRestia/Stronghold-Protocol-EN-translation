// GitHub #184 (second half), the pixels: the 2D board's 活性源石 cell must be the material the 3D board's shader draws
// (`render/board3d/materials.js infectionMaterial`) — the palette of `render/style.js ORIGINIUM`, the crust reaching the
// tile's edges (no per-tile frame: a field of 活性源石 must read as ONE floor, not as separate patches), and the cell
// joining itself without a seam (the noise wraps, so a repeated cell lines up).
//   SP_E2E=1 CHROME_PATH=… node --test test/render/originium-cell.e2e.test.js
// Both configurations are checked: the atlas a deployment WITH the board art renders (the official concrete slab + our
// crust, `DEFAULT_ART_LAYERS.infection`) and the procedural one upstream players without the art see (`MAT_DRAW.infection`).
// The couplings between the two renderers' sources are in test/render/originium-art.test.js (no browser needed).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const f3 = (v) => Math.round(v * 1000) / 1000;

describe('活性源石 cell (2D board)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;
  let configs = [];   // [{ name, art, infection, infection2, road, palette }]

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
    const page = await browser.newPage();
    await page.goto(`${base}/dev/game-mock.html?phase=PREP&render=fallback`, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ url: '/vendor/pixi.min.js' });   // textures.js builds its atlas with PIXI
    configs = await page.evaluate(async () => {
      const m = await import('/js/render/textures.js');
      const st = await import('/js/render/style.js');
      const { assets } = await import('/js/assets.js');
      const { loadBoardArt } = await import('/js/render/boardArt.js');
      // the atlas a deployment with the board art renders, and the procedural one (no art) upstream sees
      await assets.load?.().catch?.(() => null);
      const art = await loadBoardArt(assets).catch(() => null);
      const read = (atlas, name) => {
        const uv = atlas.uv[name];
        if (!uv) return null;
        const W = atlas.canvas.width, H = atlas.canvas.height;
        const x0 = Math.round(uv[0] * W), y0 = Math.round(uv[1] * H);
        const w = Math.round((uv[2] - uv[0]) * W), h = Math.round((uv[3] - uv[1]) * H);
        const img = atlas.canvas.getContext('2d').getImageData(x0, y0, w, h);
        const px = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const k = (y * w + x) * 4;
          px.push({ x, y, r: img.data[k] / 255, g: img.data[k + 1] / 255, b: img.data[k + 2] / 255, a: img.data[k + 3] / 255 });
        }
        return { w, h, px, data: Array.from(img.data) };
      };
      const cells = (atlas, name) => ({ name, art: atlas.art, artCount: atlas.artCount,
        infection: read(atlas, 'infection'), infection2: read(atlas, 'infection2'), road: read(atlas, 'road') });
      // the vein's DISPLAYED colour (what a canvas stores): the palette converted out of the shaders' working space
      const hex = st.linearToHex(st.ORIGINIUM.vein);
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const palette = { veinHex: hex, gr: rgb[1] / rgb[0], br: rgb[2] / rgb[0] };
      const out = [cells(m.tileAtlas(art || null), art ? 'board art' : 'no art installed')];
      if (art) out.push(cells(m.tileAtlas(null), 'procedural'));
      return out.map((c) => ({ ...c, palette }));
    });
    await page.close();
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** The numbers of one cell: veins, edges, ring vs middle, and the difference to another cell. */
  function stats(c) {
    const veinish = (p) => p.a > 0.6 && p.r > 0.55 && p.g > 0.2 && p.g < 0.8 && p.b < 0.5;
    const mean = (arr, k) => arr.reduce((n, p) => n + p[k], 0) / Math.max(1, arr.length);
    const hot = c.px.filter(veinish);
    const ring = c.px.filter((p) => Math.min(p.x, p.y, c.w - 1 - p.x, c.h - 1 - p.y) < c.w * 0.08);
    const lum = (arr) => arr.reduce((n, p) => n + (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) * p.a, 0) / Math.max(1, arr.length);
    const band = (pred) => { const a = c.px.filter(pred); return f3(a.filter(veinish).length / Math.max(1, a.length)); };
    // the vein CORES are opaque, so their colour does not depend on the slab underneath (the art config draws one):
    // the brightest few percent are exactly those, whichever base the cell has
    const core = [...c.px].sort((p, q) => (q.r + q.g + q.b) - (p.r + p.g + p.b)).slice(0, Math.max(1, Math.round(c.px.length * 0.03)));
    return {
      veinPct: f3(hot.length / c.px.length), ringVeinPct: f3(ring.filter(veinish).length / ring.length),
      hotGR: f3(mean(hot, 'g') / mean(hot, 'r')), hotBR: f3(mean(hot, 'b') / mean(hot, 'r')), borderLum: f3(lum(ring)),
      coreGR: f3(mean(core, 'g') / mean(core, 'r')), coreBR: f3(mean(core, 'b') / mean(core, 'r')),
      // our own crust at the tile's borders (the base slab may be official art with edges of its own, so the veins — the
      // layer this change drew — are what shows whether the tile joins the next one)
      veinsL: band((p) => p.x < 3), veinsR: band((p) => p.x >= c.w - 3),
      veinsT: band((p) => p.y < 3), veinsB: band((p) => p.y >= c.h - 3),
    };
  }
  const diff = (a, b) => f3(a.data.reduce((n, v, i) => n + Math.abs(v - b.data[i]), 0) / a.data.length);

  test('the cell wears the shared palette: the veins hit the colour the 3D shader writes', () => {
    for (const cfg of configs) {
      const s = stats(cfg.infection);
      const { gr, br, veinHex } = cfg.palette;
      assert.ok(s.veinPct >= 0.05, `${cfg.name}: the crust carries veins (${s.veinPct})`);
      assert.ok(Math.abs(s.coreGR - gr) <= 0.06, `${cfg.name}: the veins wear the palette's colour (g/r ${s.coreGR} vs ${f3(gr)} for ${veinHex})`);
      assert.ok(Math.abs(s.coreBR - br) <= 0.06, `${cfg.name}: …and its blue (b/r ${s.coreBR} vs ${f3(br)})`);
      // the whole cell is that material, not the bare slab the atlas holds for an ordinary tile
      assert.ok(diff(cfg.infection, cfg.road) > 8, `${cfg.name}: the overlay really draws over the slab (${diff(cfg.infection, cfg.road)})`);
    }
  });

  test('no per-tile frame — the crust reaches the edges, and the cell joins itself', () => {
    for (const cfg of configs) {
      const s = stats(cfg.infection);
      // veins at the border like anywhere else: the old beveled brick had a frame and none at the very edge
      assert.ok(s.ringVeinPct >= s.veinPct * 0.6, `${cfg.name}: veins reach the tile's border (${s.ringVeinPct} at the ring vs ${s.veinPct})`);
      // a repeated cell must line up: the noise wraps, so opposite edges sample the same field — the veins run through
      // the edge on both sides instead of stopping at it. Compared exactly on the cell WE compose (floor + crust); with
      // the official slab under the crust the vein/not-vein classification of the composite pixels follows the slab's
      // own shading (its edges are the official art's, on every tile of the board), so there only the ring rule above
      // applies — an edge band is 3 of 240 columns, and one slab of the noise is not the cell's average.
      if (!cfg.art) {
        for (const [a, b, where] of [[s.veinsL, s.veinsR, 'left/right'], [s.veinsT, s.veinsB, 'top/bottom']]) {
          assert.ok(Math.abs(a - b) <= 0.06, `${cfg.name}: ${where} edge veins ${a} vs ${b}`);
        }
      }
    }
  });

  test('two variants, so a field of 活性源石 does not repeat one pattern', () => {
    for (const cfg of configs) {
      assert.ok(cfg.infection2, `${cfg.name}: infection2 is an atlas cell`);
      const a = stats(cfg.infection), b = stats(cfg.infection2);
      assert.ok(Math.abs(a.veinPct - b.veinPct) <= 0.02, `${cfg.name}: the same recipe (${a.veinPct} vs ${b.veinPct})`);
      assert.ok(diff(cfg.infection, cfg.infection2) > 6, `${cfg.name}: the second variant is a different pattern (${diff(cfg.infection, cfg.infection2)})`);
    }
  });
});
