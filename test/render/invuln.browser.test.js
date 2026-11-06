// test/render/invuln.browser.test.js — in headless Chrome with the real models: an invulnerable operator (a 无敌 buff)
// gets the two gold ribbons (render/units.js InvulnRibbons), split into the half behind the model and the half in front,
// spinning; a unit that is not invulnerable has none.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/invuln.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshots → test/e2e/out/invuln-*.png.

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

describe('invulnerability ribbons in headless Chrome', { skip }, () => {
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

  test('an invulnerable operator wears the two spinning ribbons; the one next to her does not', async () => {
    const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 600,
      units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 4 }, { chessId: 'chess_char_3_01_a', row: 10, col: 6 }] });
    h.step();
    const b = h.b;
    const mint = h.unit('chess_char_3_08_a'), other = h.unit('chess_char_3_01_a');
    const meta = { ...b.fieldMeta(), stageId: 'act2autochess_m01' };
    b.drainEvents();
    const frames = [];
    for (let i = 0; i < 60; i++) {
      if (i === 5) b.addBuff(mint, { key: 'test:invuln', duration: Infinity, flags: { invulnerable: true } });
      b.step();
      const { t, ...rest } = b.snapshot();
      frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev: b.drainEvents(), gt: t });
    }
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    try {
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      await page.evaluate((meta) => {
        const v = window.__demo.view;
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 1 });
      }, meta);
      const read = (ids) => {
        const v = window.__demo.view;
        const m = v.debug.views.get(ids[0]), o = v.debug.views.get(ids[1]);
        const n = (g) => (g && g.geometry ? g.geometry.graphicsData.length : 0);
        return { x: m.screen.x, top: m.screen.top, y: m.screen.y, back: n(m.ribbons?.back), front: n(m.ribbons?.front), other: o.ribbons ? n(o.ribbons.back) + n(o.ribbons.front) : 0 };
      };
      const state = await page.evaluate(async (all, ids, readSrc) => {
        const v = window.__demo.view;
        for (const f of all) {
          if (f.ev.length) v.pushEvents({ t: 'b.ev', fieldId: f.snap.fieldId, gt: f.gt, ev: f.ev });
          v.pushSnapshot(f.snap);
          await new Promise((r) => requestAnimationFrame(() => r()));
        }
        await new Promise((r) => setTimeout(r, 800));
        return (0, eval)(`(${readSrc})`)(ids);
      }, frames, [mint.id, other.id], read.toString());
      const clip = { x: Math.max(0, state.x - 90), y: Math.max(0, state.top - 30), width: 180, height: Math.max(60, state.y - state.top + 60) };
      for (const k of ['a', 'b', 'c']) {
        await page.screenshot({ clip, path: path.join(OUT, `invuln-${k}.png`) });
        await new Promise((r) => setTimeout(r, 260));
      }
      await page.screenshot({ path: path.join(OUT, 'invuln.png') });
      assert.ok(state.back > 0 && state.front > 0, `both halves drawn: ${JSON.stringify(state)}`);
      assert.equal(state.other, 0, 'not on the other operator');
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });

  test('a multi-tile boss wears them three times as big', async () => {
    const BOSS = 'enemy_9013_acstmk'; // 假想敌：胄, a 巨型 enemy (data hitArea)
    const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 600, units: [{ chessId: 'chess_char_3_08_a', row: 11, col: 2 }] });
    h.step();
    const b = h.b;
    const boss = h.spawn(BOSS, { pos: [9, 9], routeIndex: 0, mods: { speedMul: 0 } });
    const mint = h.unit('chess_char_3_08_a');
    const meta = { ...b.fieldMeta(), stageId: 'act2autochess_m01' };
    b.drainEvents();
    const frames = [];
    for (let i = 0; i < 60; i++) {
      if (i === 5) for (const u of [boss, mint]) b.addBuff(u, { key: 'test:invuln', duration: Infinity, flags: { invulnerable: true } });
      b.step();
      const { t, ...rest } = b.snapshot();
      frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev: b.drainEvents(), gt: t });
    }
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
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
        await new Promise((r) => setTimeout(r, 800));
        const bv = v.debug.views.get(ids[0]), mv = v.debug.views.get(ids[1]);
        const w = (g) => (g ? g.getLocalBounds().width : 0);
        return { bossK: bv.ribbonK, mintK: mv.ribbonK, bossW: Math.max(w(bv.ribbons?.back), w(bv.ribbons?.front)), mintW: Math.max(w(mv.ribbons?.back), w(mv.ribbons?.front)), x: bv.screen.x, top: bv.screen.top, y: bv.screen.y };
      }, frames, [boss.id, mint.id]);
      await page.screenshot({ clip: { x: Math.max(0, state.x - 260), y: Math.max(0, state.top - 40), width: 520, height: Math.max(120, state.y - state.top + 80) }, path: path.join(OUT, 'invuln-boss.png') });
      assert.equal(state.bossK, 3);
      assert.equal(state.mintK, 1);
      assert.ok(state.bossW > state.mintW * 2, `the boss's ribbons are wider: ${JSON.stringify(state)}`);
    } finally {
      await page.close();
    }
  });
});
