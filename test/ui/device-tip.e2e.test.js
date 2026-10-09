// Browser checks of the stage-device tip (GitHub #228, idea of PR #229 by @rickylxw; the terrain tip of #184 for devices) on
// the in-match mock harness (public/dev/game-mock.html):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/device-tip.e2e.test.js
//
// A tap on a STAGE DEVICE standing on the board — 阻隔工事 here (the mock's default stage act2autochess_m01 keeps its
// blowers and its dormant turrets off the prep field, so ?stage=act1autochess_m01 boards crates within it) — opens the
// device's own card, on both field implementations: the engine canvas (render/app.js `tileClick`, reached by clicking
// the tile's own screen position) and the DOM fallback (ui/fallbackField.js, the tile div). Asserted: the card names
// the device and its mechanism, an ordinary tile closes it again, and no scenario logs a console error. The words and
// the numbers are unit-tested in test/ui/device-tip.test.js (deviceInfo / deviceTipAt, against every device of the real
// stages and a real battle) — this file is about the tap reaching them.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tiles of the boarded stage (act1autochess_m01) the tip must answer for, and one ordinary tile it must not. */
const CRATE_STAGE = 'act1autochess_m01';
const CRATE = { row: 10, col: 5, name: '阻隔工事' };
const FLOOR = { row: 12, col: 9, name: null };

describe('stage device tip in the browser', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  test('the fallback (DOM) board: a tap on the crate opens its card, an ordinary tile opens nothing', async () => {
    const { page, problems } = await open(`/dev/game-mock.html?phase=PREP&render=fallback&stage=${CRATE_STAGE}`);
    await page.waitForSelector('.ff-tile', { timeout: 15000 });
    await sleep(400);
    const tap = (row, col) => page.evaluate(([r, c]) => {
      const el = document.querySelector(`.ff-tile[data-row="${r}"][data-col="${c}"]`);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
      return true;
    }, [row, col]);

    assert.ok(await tap(CRATE.row, CRATE.col), 'the mock board draws the crate tile');
    await page.waitForSelector('.dpanel', { timeout: 5000 });
    const text = await card(page);
    assert.match(text, new RegExp(CRATE.name), text);
    assert.match(text, /场地装置/, text);
    assert.match(text, /绕开它走/, text);

    // an ordinary tile: nothing to explain, and the card that was open closes with the press
    assert.ok(await tap(FLOOR.row, FLOOR.col));
    await sleep(200);
    assert.equal(await card(page), null, 'an ordinary tile opens nothing');
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('the engine canvas: the same tap on a tile\'s own screen position opens the card', async () => {
    const { page, problems } = await open(`/dev/game-mock.html?phase=PREP&stage=${CRATE_STAGE}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.__SP_VIEW__?.tileScreen, { timeout: 30000 });
    await sleep(1200); // models / camera
    const at = (row, col) => page.evaluate(([r, c]) => {
      const t = globalThis.__SP_VIEW__.tileScreen(r, c);
      return t && { x: t.x, y: t.y };
    }, [row, col]);
    const pt = await at(CRATE.row, CRATE.col);
    assert.ok(pt, 'the crate tile has a screen position');
    await page.mouse.click(pt.x, pt.y);
    await page.waitForSelector('.dpanel', { timeout: 5000 });
    const text = await card(page);
    assert.match(text, new RegExp(CRATE.name), text);
    assert.match(text, /绕开它走/, text);

    const floor = await at(FLOOR.row, FLOOR.col);
    await page.mouse.click(floor.x, floor.y);
    await sleep(250);
    assert.equal(await card(page), null, 'the floor tile closes it again');
    assert.deepEqual(problems, []);
    await page.close();
  });

  // A battle: the crates are device UNITS that come in with 'spawn' events after the field meta (the mock's ?variant=devices
  // streams them like the sim). The tap finds the unit, the card draws its live HP, and it closes when the crate is destroyed.
  const hpText = (page) => page.evaluate(() => document.querySelector('.dpanel .dhp')?.textContent.replace(/\s+/g, ' ').trim() ?? null);

  test('a battle on the fallback board: the crate unit\'s card shows its live HP and closes when it is destroyed', async () => {
    const { page, problems } = await open(`/dev/game-mock.html?phase=COMBAT&variant=devices&render=fallback&stage=${CRATE_STAGE}`);
    await page.waitForSelector('.ff-tile', { timeout: 15000 });
    await page.waitForFunction(() => globalThis.__MOCK__?.S()?.battle?.devices?.length > 0, { timeout: 10000 });
    await sleep(600);                                          // the spawn events and the first snapshots
    const tap = (row, col) => page.evaluate(([r, c]) => {
      const el = document.querySelector(`.ff-tile[data-row="${r}"][data-col="${c}"]`);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
      return true;
    }, [row, col]);
    const unit = await page.evaluate(() => { const d = globalThis.__MOCK__.S().battle.devices[0]; return { row: d.y, col: d.x }; });
    assert.ok(await tap(unit.row, unit.col), 'the board draws the crate unit\'s tile');
    await page.waitForSelector('.dpanel', { timeout: 5000 });
    const text = await card(page);
    assert.match(text, new RegExp(CRATE.name), text);
    assert.match(text, /绕开它走/, text);
    assert.equal(await hpText(page), '100 / 100');
    assert.ok(await page.evaluate(() => globalThis.__MOCK__.hurtDevice(0, 40)));
    await page.waitForFunction(() => /60 \/ 100/.test(document.querySelector('.dpanel .dhp')?.textContent || ''), { timeout: 5000 });
    // destroyed: its HP bar runs out, then its card closes with it (the tuple leaves the snapshots)
    assert.ok(await page.evaluate(() => globalThis.__MOCK__.hurtDevice(0, 100)));
    await page.waitForFunction(() => !document.querySelector('.dpanel'), { timeout: 5000 });
    // a destroyed crate explains nothing any more: the tap falls through to the (ordinary) tile under it
    await sleep(1500);
    assert.ok(await tap(unit.row, unit.col));
    await sleep(250);
    assert.equal(await card(page), null, 'the wreck opens nothing');
    // another crate still answers
    const other = await page.evaluate(() => { const d = globalThis.__MOCK__.S().battle.devices[1]; return { row: d.y, col: d.x }; });
    assert.ok(await tap(other.row, other.col));
    await page.waitForSelector('.dpanel', { timeout: 5000 });
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('a battle on the engine canvas: a tap on the crate unit\'s tile opens its card with the HP bar', async () => {
    const { page, problems } = await open(`/dev/game-mock.html?phase=COMBAT&variant=devices&render=engine&stage=${CRATE_STAGE}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.__SP_VIEW__?.tileScreen, { timeout: 30000 });
    await page.waitForFunction(() => globalThis.__MOCK__?.S()?.battle?.devices?.length > 0, { timeout: 10000 });
    await sleep(2500);                                         // models / camera / the spawn events
    const unit = await page.evaluate(() => { const d = globalThis.__MOCK__.S().battle.devices[0]; return { row: d.y, col: d.x }; });
    const at = () => page.evaluate(([r, c]) => {
      const t = globalThis.__SP_VIEW__.tileScreen(r, c);
      return t && { x: t.x, y: t.y };
    }, [unit.row, unit.col]);
    let text = null;
    for (let i = 0; i < 3 && text === null; i++) {
      const p = await at();
      assert.ok(p, 'the crate tile has a screen position');
      await page.mouse.click(p.x, p.y);
      try { await page.waitForSelector('.dpanel', { timeout: 3000 }); } catch { continue; }
      text = await card(page);
    }
    assert.ok(text !== null, 'the tap opened a card');
    assert.match(text, new RegExp(CRATE.name), text);
    assert.equal(await hpText(page), '100 / 100');
    assert.deepEqual(problems, []);
    await page.close();
  });
});
