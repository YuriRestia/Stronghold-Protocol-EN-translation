// test/render/flash.browser.test.js — user playtest #4 item 13 in headless Chrome ("屏幕很偶尔的情况下会有个巨大的ui的一部分
// 遮挡一两秒": once in a while a huge piece of UI covered the screen for a second or two).
// Found by sampling long real-server sessions every 80 ms (DOM boxes > 25 % of the viewport, images drawn > 300 px, Pixi
// objects > 25 % of the viewport or showing a whole atlas page, CSS animations scaling ≥ 2): the only unexpected hit
// was the bond-layer pop of render/fx.js — the first in-battle layer gain of each bond (b.ev 'layer') popped the bond's
// icon, a PIXI.Texture.from(url) that is 1×1 until its image has loaded, and pop() sized the sprite from that: 46× too
// big, ~5000 px over the whole screen for the pop's 1.4 s (test/render/fxpop.test.js has the unit test). Here the real
// mock battle (public/dev/game-mock.html) gets 'layer' events for bonds whose icons were never loaded on the page.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/flash.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshots → test/e2e/out/flash-*.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and downloaded assets)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('user playtest #4 item 13: no screen-sized UI flash (mock battle, headless Chrome)', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--force-device-scale-factor=1'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  for (const [w, h] of [[1920, 1080], [1280, 720]]) {
    test(`${w}×${h}: a bond layer gained in battle pops its icon at ~46 px — also the first time (icon still loading)`, async () => {
      const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
      const problems = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      await page.setViewport({ width: w, height: h });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/game-mock.html?shot=1&render=engine&phase=COMBAT`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)') && globalThis.__SP_VIEW__?.raw?.mode === 'battle', { timeout: 30000 });
      await sleep(1500);
      const r = await page.evaluate(async () => {
        const { net } = await import('/js/net.js');
        const R = globalThis.__SP_VIEW__.raw, S = globalThis.__MOCK__.S();
        const icons = (await import('/js/assets.js')).assets;
        // bonds with an icon that no view has turned into a texture yet (the bond strip's <img>s do not count)
        const bonds = ['yanShip', 'preciShip', 'abyssShip', 'kazimierzShip'].filter((b) => icons.bondIcon?.(b) && !PIXI.utils.TextureCache[icons.bondIcon(b)]);
        const gt = (await new Promise((resolve) => { const off = net.on('b.snap', (m) => { off(); resolve(m.gt); }); })) + 0.05;
        net._emit('b.ev', { t: 'b.ev', fieldId: S.battle.fieldRef.id, gt, ev: bonds.map((b, i) => ['layer', 'p1', b, i + 1]) });
        const t0 = performance.now();
        const icon = (p) => p.c.children.find((c) => c.texture && c.texture !== R.debug.fx.tex.glow);
        let worst = 0, seen = 0;
        // every frame of the pops' life (1.4 s): the icon sprite's drawn box
        while (performance.now() - t0 < 1600) {
          await new Promise((res) => requestAnimationFrame(res));
          for (const p of R.debug.fx.pops) {
            const sp = icon(p);
            if (!sp || !sp.visible || !(sp.worldAlpha > 0.02)) continue;
            const b = sp.getBounds();
            seen = Math.max(seen, R.debug.fx.pops.length);
            worst = Math.max(worst, b.width, b.height);
          }
        }
        return { bonds, worst: Math.round(worst), seen, loaded: bonds.map((b) => !!PIXI.utils.TextureCache[icons.bondIcon(b)]?.valid) };
      });
      await page.screenshot({ path: path.join(OUT, `flash-bond-pop-${w}.png`) });
      await page.close();
      assert.ok(r.bonds.length >= 2 && r.seen >= 2, `premise: bond icons popped for the first time (${JSON.stringify(r)})`);
      assert.ok(r.loaded.every(Boolean), `premise: their images loaded during the pop (${JSON.stringify(r)})`);
      assert.ok(r.worst > 20 && r.worst < 80, `the icon is ~46 px (× the pop's scale-in), never screen-sized: ${r.worst} px`);
      assert.deepEqual(problems, []);
    });
  }
});
