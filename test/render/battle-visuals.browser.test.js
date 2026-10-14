// test/render/battle-visuals.browser.test.js — in headless Chrome with the real models: 蒂比 in 起飞 drawn at a flyer's
// height, and 薄绿 at half HP holding a 屏障 of 4 × max HP drawn over her HP bar (80 % of it, from its right end).
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/battle-visuals.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/battle-visuals.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and downloaded assets)';

describe('起飞 and 屏障 in headless Chrome', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  test('蒂比 hovers in 起飞; 薄绿\'s barrier shows on her HP bar', async () => {
    const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 600,
      units: [{ chessId: 'chess_char_2_13_a', row: 10, col: 4 }, { chessId: 'chess_char_3_08_a', row: 10, col: 6 }] });
    h.step();
    const b = h.b;
    const tippi = h.unit('chess_char_2_13_a'), mint = h.unit('chess_char_3_08_a');
    const meta = { ...b.fieldMeta(), stageId: 'act2autochess_m01' };
    b.drainEvents();
    const frames = [];
    for (let i = 0; i < 90; i++) {
      if (i === 5) {
        tippi.skill.activate('test', { free: true });
        mint.hp = mint.s.maxHp / 2;
        b.addBuff(mint, { key: 'test:barrier', shield: 4 * mint.s.maxHp, duration: Infinity });
      }
      b.step();
      const { t, ...rest } = b.snapshot();
      frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev: b.drainEvents(), gt: t });
    }
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      await page.evaluate((meta) => {
        const v = window.__demo.view;
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 1 });
      }, meta);
      const state = await page.evaluate(async (all, ids) => {
        const v = window.__demo.view;
        for (const f of all) {
          if (f.ev.length) v.pushEvents({ t: 'b.ev', fieldId: f.snap.fieldId, gt: f.gt, ev: f.ev });
          v.pushSnapshot(f.snap);
          await new Promise((r) => requestAnimationFrame(() => r()));
        }
        await new Promise((r) => setTimeout(r, 600));
        const t = v.debug.views.get(ids[0]), m = v.debug.views.get(ids[1]);
        return { hover: t.hover, barrier: m.barrierFill.visible, share: m.barrierFill.width / m.hpFill.width };
      }, frames, [tippi.id, mint.id]);
      await page.screenshot({ path: path.join(OUT, 'battle-visuals.png') });
      assert.ok(state.hover > 1, `蒂比 aloft: ${state.hover}`);
      assert.ok(state.barrier && Math.abs(state.share - 0.8) < 0.02, `barrier ${JSON.stringify(state)}`);
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
