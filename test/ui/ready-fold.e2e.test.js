// Browser check of the shop bar's fold on 准备就绪 (GitHub #138; opt-in, ~10 s) on the in-match mock harness:
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/ready-fold.e2e.test.js
//
// In prep, 准备就绪 folds the shop bar (the 展开商店 tab, the screen's `is-collapsed`), 取消准备 unfolds it again; a fold made
// by hand before the press is not undone by it going the other way round (the player folds, readies, cancels: unfolded
// — the owner's wording is 「取消准备时再展开」); the bar can still be unfolded by hand while ready. The decision itself
// (only a change inside one prep round counts) is unit-tested in test/ui/ready-fold.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the shop bar folds on 准备就绪', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  const state = (page) => page.evaluate(() => ({
    folded: !!document.querySelector('.shopbar-tab'),
    cls: document.querySelector('.gm')?.classList.contains('is-collapsed') ?? null,
    ready: document.querySelector('.readybtn')?.getAttribute('aria-pressed') === 'true',
    label: document.querySelector('.readybtn__label')?.textContent ?? null,
  }));
  const press = (page, sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
  /** 准备就绪 with funds left asks first (gameLogic readyFundsPrompt): answer it; 取消准备 asks nothing. */
  const ready = async (page) => {
    await press(page, '.readybtn');
    await sleep(250);
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /准备就绪/.test(b.textContent))?.click());
  };

  test('ready folds the shop bar, cancelling unfolds it; the tab still unfolds it by hand', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/dev/game-mock.html?phase=PREP&render=fallback`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.readybtn', { timeout: 15000 });
    await sleep(500);

    let s = await state(page);
    assert.deepEqual([s.folded, s.cls, s.ready], [false, false, false], 'the shop starts open');
    await ready(page);
    await page.waitForSelector('.shopbar-tab', { timeout: 5000 });
    s = await state(page);
    assert.deepEqual([s.folded, s.cls, s.ready, s.label], [true, true, true, '取消准备'], '准备就绪 folded the shop bar');

    // the player unfolds by hand while ready: it stays as they left it
    await press(page, '.shopbar-tab__btn');
    await sleep(300);
    s = await state(page);
    assert.deepEqual([s.folded, s.ready], [false, true]);

    await ready(page);                                        // 取消准备 with the bar already open: it stays open
    await sleep(300);
    s = await state(page);
    assert.deepEqual([s.folded, s.ready], [false, false]);

    // fold by hand, ready, cancel: unfolded again (「取消准备时再展开」)
    await press(page, '.funds__collapse');
    await page.waitForSelector('.shopbar-tab', { timeout: 5000 });
    await ready(page);
    await sleep(400);
    s = await state(page);
    assert.deepEqual([s.folded, s.ready], [true, true], 'still folded after the press');
    await ready(page);
    await sleep(400);
    s = await state(page);
    assert.deepEqual([s.folded, s.ready], [false, false], 'cancelling unfolds it');
    assert.deepEqual(problems, []);
    await page.close();
  });
});
