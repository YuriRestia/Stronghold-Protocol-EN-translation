// Player report F5 after the 0.1.0 release in headless Chrome through the render demo (public/dev/render-demo.html,
// real Spine models): the real sim's frames (Battle.snapshot / drainEvents, fed like the client runner's local feed) of
// an operator that jumped onto a teammate's home tile (a 突袭 landing) and was knocked out there. Officially it goes back
// to its own home ("若干员被击倒的位置为其他干员或召唤物的初始位置，则在被击倒后，尝试返回其自身的初始位置", PRTS
// 卫戍协议/帮助): the knocked-down model and its ring are drawn on its own home (b.snap `down` row / col), a press there
// selects it, the teammate's home stays empty, and it redeploys on that tile.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/feedback1f-down-tile.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshots → test/e2e/out/feedback1f-down-*.png.

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

describe('a knocked-out operator is drawn on the tile it lies on (real sim frames, headless Chrome)', { skip }, () => {
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

  test('fell on a teammate\'s home → drawn, picked and redeployed on its own home', async () => {
    // 宴 (home 12,3) and 休谟斯 (home 10,3), real chess on 战场#01; no enemies, the battle keeps running
    const h = makeBattle({ stageId: 'act2autochess_m01', units: [{ chessId: 'chess_char_1_18_a', row: 12, col: 3 }, { chessId: 'chess_char_2_09_a', row: 10, col: 3 }], autoFinish: false, timeLimit: 300 });
    const b = h.b;
    b.step();
    const A = h.unit('chess_char_1_18_a'), B = h.unit('chess_char_2_09_a');
    const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    const feed = async (n) => {
      for (let i = 0; i < n; i++) {
        b.step();
        const ev = b.drainEvents();
        await page.evaluate((snap, ev) => {
          const v = window.__demo.view;
          if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: snap.fieldId, gt: snap.t, ev });
          v.pushSnapshot({ t: 'b.snap', gt: snap.t, ...snap });
          return new Promise((r) => requestAnimationFrame(() => r()));
        }, b.snapshot(), ev);
      }
    };
    const viewOf = (id) => page.evaluate((id) => { const x = window.__demo.view.debug.views.get(id); return x ? { x: x.x, y: x.y, alive: x.alive, down: x.down ? x.down.state : null, ring: !!x._downRing?.root?.visible } : null; }, id);
    const pickAt = (r, c) => page.evaluate((r, c) => {
      const v = window.__demo.view, t = v.tileScreen(r, c), rc = v.debug.app.view.getBoundingClientRect();
      return v.debug.pick.battleUnitAt(t.x - rc.left, t.y - rc.top)?.id ?? null;
    }, r, c);
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      const meta = { ...b.fieldMeta(), fieldId: b.fieldId };
      await page.evaluate((meta) => {
        const v = window.__demo.view;
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 2 });
      }, meta);
      await feed(20);
      await new Promise((r) => setTimeout(r, 1500)); // Spine models load
      // A away from its home (11,6), B lands on A's home (12,3) — a 突袭-like redeployment — and is knocked out there
      b.retreat(A, { reason: 'raid' });
      assert.ok(b.redeploy(A, { free: true, tile: [11, 6] }));
      b.retreat(B, { reason: 'raid' });
      assert.ok(b.redeploy(B, { free: true, tile: [12, 3] }));
      await feed(30);
      assert.deepEqual(await viewOf(B.id).then((v) => [v.x, v.y]), [3, 12], 'B stands on A\'s home');
      b.kill(B);
      await feed(90);
      await new Promise((r) => setTimeout(r, 1200)); // the Die clip runs out (its last frame stays)
      await feed(10);
      const vb = await viewOf(B.id);
      await page.screenshot({ path: path.join(OUT, 'feedback1f-down-home.png') });
      assert.equal(vb.alive, false);
      assert.equal(vb.down, 0, 'knocked down, counting');
      assert.ok(vb.ring, 'its redeploy ring');
      assert.deepEqual([vb.x, vb.y], [3, 10], 'drawn on its own home (10,3), not on A\'s (12,3)');
      assert.equal(await pickAt(10, 3), B.id, 'a press on its own home selects it');
      assert.equal(await pickAt(12, 3), null, 'A\'s home is empty');
      // its timer runs out (休谟斯 70 s at 2×): it redeploys on its own home
      while (!B.alive && b.time < 200) b.step();
      assert.ok(B.alive, 'redeployed');
      assert.deepEqual([B.tileR, B.tileC], [10, 3]);
      await feed(30);
      const back = await viewOf(B.id);
      await page.screenshot({ path: path.join(OUT, 'feedback1f-down-redeployed.png') });
      assert.equal(back.alive, true);
      assert.equal(back.down, null);
      assert.deepEqual([back.x, back.y], [3, 10]);
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
