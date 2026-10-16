// test/render/bossbody.browser.test.js — user playtest #5 item 10 in headless Chrome through the render demo (real
// Spine models, the official boss camera): a huge boss (假想敌：胄, data/enemies.json `hitArea` 4.95 × 2.95 up 1 — the
// sim's hit rectangle, server/sim/body.js) is picked by a press anywhere on its hit area — the 5 × 3 tiles under its
// drawn body — while an operator standing on a tile inside that area is still picked on its tile, and a press beside
// the area picks nothing (render/pick.js AREA_PICK).
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/bossbody.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/bossbody.png.

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

/** Page side: the boss field of 源石流发生装置 with 假想敌：胄 at (3,10), an operator on the fence (4,8), a regular enemy. */
function installBoss() {
  const v = window.__demo.view;
  const rect = { r0: 0, r1: 5, c0: 0, c1: 20 };
  const units = [
    { id: 1, kind: 'op', side: 'ally', defId: 'char_102_texas', spine: 'char_102_texas', avatar: 'char_102_texas', x: 8, y: 4, maxHp: 1000, facing: 1, dir: 'RIGHT', tier: 3 },
    { id: 2, kind: 'enemy', side: 'enemy', defId: 'enemy_9013_acstmk', spine: 'enemy_9013_acstmk', avatar: 'enemy_9013_acstmk', x: 10, y: 3, maxHp: 600000, facing: -1, boss: true },
    { id: 3, kind: 'enemy', side: 'enemy', defId: 'enemy_1000_gopro_2', spine: 'enemy_1000_gopro_2', avatar: 'enemy_1000_gopro_2', x: 15, y: 2, maxHp: 1000, facing: -1 },
  ];
  v.enterBattle({ fieldId: 'bb', kind: 'boss', rect, stageId: 'act2autochess_m01', units });
  v.setCamera('boss', { rect, side: 'L', instant: true });
  v.setLocalFeed({ on: true, speed: 2 });
  const tup = (u) => [u.id, u.x, u.y, u.maxHp, u.maxHp, 0, 0, 0, 0];
  window.__boss = {
    step(gt) { v.pushSnapshot({ t: 'b.snap', fieldId: 'bb', gt, units: units.map(tup), dp: 5, killed: 0, total: 3 }); },
    /** The unit id picked by a press on a spot of tile (row, col) (u, v ∈ [−0.5, 0.5] across / along it). */
    pickAt(row, col) {
      const t = v.tileScreen(row, col), r = v.debug.app.view.getBoundingClientRect();
      return v.debug.pick.battleUnitAt(t.x - r.left, t.y - r.top)?.id ?? null;
    },
  };
}

describe('a huge boss is picked anywhere on its hit area (headless Chrome)', { skip }, () => {
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

  test('the 5 × 3 body picks the boss; the operator on the fence tile inside it and the tiles beside it do not', async () => {
    const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      await page.evaluate(installBoss);
      const feed = (from, to) => page.evaluate(async (from, to) => {
        for (let gt = from; gt <= to + 1e-9; gt += 1 / 30) { window.__boss.step(+gt.toFixed(4)); await new Promise((r) => requestAnimationFrame(() => r())); }
      }, from, to);
      await feed(1, 2);
      await new Promise((r) => setTimeout(r, 1500)); // Spine models load
      await feed(2, 3);
      await page.screenshot({ path: path.join(OUT, 'bossbody.png') });
      const pick = (r, c) => page.evaluate((r, c) => window.__boss.pickAt(r, c), r, c);
      for (const [r, c] of [[3, 10], [4, 9], [5, 11], [5, 12], [3, 12], [4, 11], [3, 8], [5, 8]]) assert.equal(await pick(r, c), 2, `(${r},${c}) on the boss body`);
      assert.equal(await pick(4, 8), 1, 'the operator on its fence tile inside the area');
      for (const [r, c] of [[3, 14], [2, 7], [4, 6]]) assert.equal(await pick(r, c), null, `(${r},${c}) beside the body`);
      assert.equal(await pick(2, 15), 3, 'a regular enemy on its tile');
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
