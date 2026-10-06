// Browser checks of the special-terrain tip (GitHub issue #184 「建议加入对于特殊地形的单击信息提示」) on the in-match mock
// harness (public/dev/game-mock.html):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/terrain-tip.e2e.test.js
//
// A tap on the GROUND — nothing stands there — makes the tile explain itself, on both field implementations: the engine
// canvas (render/app.js `tileClick`, reached by clicking the tile's own screen position) and the DOM fallback
// (ui/fallbackField.js, the tile div). Asserted: the mock's own stage (act2autochess_m01) carries gates, a tap on 蓝门 /
// 红门 opens the card with its mechanism line, a tap on an ordinary floor tile opens nothing (and closes the card that was
// open), and no scenario logs a console error. The words and the numbers are unit-tested in test/ui/gameLogic.test.js
// (terrainInfo, against every terrain of the real stages) — this file is about the tap reaching them.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tiles of the mock's stage (act2autochess_m01) the tip must answer for, and one ordinary tile it must not. */
const GATE = { row: 9, col: 10, name: '红门' };
const GOAL = { row: 9, col: 2, name: '蓝门' };
const FLOOR = { row: 10, col: 5, name: null };

describe('special terrain tip in the browser', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  async function open(url, { w = 1600, h = 900, waitUntil = 'networkidle0' } = {}) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
    // the engine keeps fetching art (and SwiftShader is slow to build the board), so it waits on __SP_VIEW__ instead
    await page.goto(`${base}${url}`, { waitUntil, timeout: 60000 });
    return { page, problems };
  }

  /** The open detail card's text (null while none is open). */
  const card = (page) => page.evaluate(() => {
    const el = document.querySelector('.dpanel');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });

  test('the fallback (DOM) board: a tap on 蓝门 / 红门 opens the card, an ordinary tile opens nothing', async () => {
    const { page, problems } = await open('/dev/game-mock.html?phase=PREP&render=fallback');
    await page.waitForSelector('.ff-tile', { timeout: 15000 });
    await sleep(400);
    const tap = (row, col) => page.evaluate(([r, c]) => {
      const el = document.querySelector(`.ff-tile[data-row="${r}"][data-col="${c}"]`);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
      return true;
    }, [row, col]);

    assert.ok(await tap(GOAL.row, GOAL.col), 'the mock board draws the 蓝门 tile');
    await page.waitForSelector('.dpanel', { timeout: 5000 });
    let text = await card(page);
    assert.match(text, /蓝门/, text);
    assert.match(text, /目标生命值/, text);
    assert.match(text, /保护目标/, text);

    // the 红门 (the enemies' own entrance) says its own thing
    assert.ok(await tap(GATE.row, GATE.col));
    await sleep(200);
    text = await card(page);
    assert.match(text, /红门/, text);
    assert.match(text, /从这里出场/, text);

    // an ordinary floor tile: nothing to explain, and the card that was open closes with the press
    assert.ok(await tap(FLOOR.row, FLOOR.col));
    await sleep(200);
    assert.equal(await card(page), null, 'an ordinary tile opens nothing');
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('the engine canvas: the same tap on a tile\'s own screen position opens the card', async () => {
    const { page, problems } = await open('/dev/game-mock.html?phase=PREP&render=engine', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.__SP_VIEW__?.tileScreen, { timeout: 30000 });
    await sleep(1200); // models / camera
    const at = (row, col) => page.evaluate(([r, c]) => {
      const t = globalThis.__SP_VIEW__.tileScreen(r, c);
      return t && { x: t.x, y: t.y };
    }, [row, col]);
    const pt = await at(GOAL.row, GOAL.col);
    assert.ok(pt, 'the 蓝门 tile has a screen position');
    await page.mouse.click(pt.x, pt.y);
    await page.waitForSelector('.dpanel', { timeout: 5000 });
    let text = await card(page);
    assert.match(text, /蓝门/, text);
    assert.match(text, /目标生命值/, text);

    const floor = await at(FLOOR.row, FLOOR.col);
    await page.mouse.click(floor.x, floor.y);
    await sleep(250);
    assert.equal(await card(page), null, 'the floor tile closes it again');
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('Final Assault prep: the tap reports the BOARD tile, so the boss field explains ITS tile (review on #185)', async () => {
    const { page, problems } = await open('/dev/game-mock.html?phase=PREP&variant=boss&render=engine', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.__SP_VIEW__?.tileScreen, { timeout: 30000 });
    await page.waitForFunction(() => globalThis.__SP_VIEW__.raw.prepField?.().kind === 'bossPrep', { timeout: 15000 });
    await sleep(1200); // camera / models (a deployment with the local board art also builds the 3D board here)
    // A board tile of the player's half + the stage tile it draws (stage 2–5 shown as board 9–12): the card must be about
    // the stage tile. Reporting the drawn tile instead (the old groundTile) made the screen convert a second time, which
    // on this board explains a DIFFERENT tile — or none at all.
    const target = await page.evaluate(async () => {
      const { data } = await import('/js/data.js');
      const gl = await import('/js/ui/gameLogic.js');
      const S = globalThis.__MOCK__.S();
      const stage = data.lookup('stages', S.pub.stageId);
      for (let row = 9; row <= 12; row++) {
        for (let col = 0; col <= 10; col++) {
          const [sr, sc] = gl.fieldTile('bossL', row, col);
          const info = gl.terrainInfo(stage, sr, sc);
          if (!info) continue;
          const t = globalThis.__SP_VIEW__.tileScreen(row, col);
          if (t) return { row, col, sr, sc, name: info.name, x: t.x, y: t.y };
        }
      }
      return null;
    });
    assert.ok(target, 'the boss field has a special tile on the player half');
    // The boss-prep camera is still settling when the board appears (and building the 3D board shifts a machine's timing),
    // so wait for the tile's screen position to stop moving, and re-read it before each try.
    const at = () => page.evaluate(([r, c]) => {
      const t = globalThis.__SP_VIEW__.tileScreen(r, c);
      return t && { x: t.x, y: t.y };
    }, [target.row, target.col]);
    let settled = null;
    for (let i = 0; i < 40; i++) {
      const p = await at();
      if (p && settled && Math.abs(p.x - settled.x) < 1 && Math.abs(p.y - settled.y) < 1) break;
      settled = p;
      await sleep(150);
    }
    assert.ok(settled, 'the boss-field tile still has a screen position');
    let text = null;
    for (let i = 0; i < 3 && text === null; i++) {
      const p = (await at()) || settled;
      await page.mouse.click(p.x, p.y);
      try { await page.waitForSelector('.dpanel', { timeout: 3000 }); } catch { continue; }   // a tap that missed: retry
      text = await card(page);
    }
    assert.ok(text !== null, 'the tap opened the terrain card');
    assert.match(text, new RegExp(target.name), `board (${target.row},${target.col}) → stage (${target.sr},${target.sc}) is ${target.name}, card: ${text}`);
    assert.deepEqual(problems, []);
    await page.close();
  });
});
