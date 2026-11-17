// test/ui/improv-peek.e2e.test.js — GitHub #105: 查看阵地 pulls the Improv overlay away so the fields, the bonds and the
// team panel can be seen and used; its tab brings it back. Mock harness (public/dev/game-mock.html), headless Chrome.
// Opt-in: SP_E2E=1 (CHROME_PATH overrides).
//
//   SP_E2E=1 node --test test/ui/improv-peek.e2e.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { gotoMock } from '../e2e/mockPage.mjs';
import { OUT } from '../e2e/client.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('the Improv overlay pulls down (GitHub #105, mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--no-sandbox'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  test('查看阵地 hides the cards and lets presses through; the tab brings them back', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await gotoMock(page, `${base}/dev/game-mock.html?shot=1&phase=SP_DRAFT&variant=bounty&render=fallback`);
    await page.waitForSelector('.spcard', { timeout: 20000 });
    const state = () => page.evaluate(() => {
      const gm = document.querySelector('.gm');
      const mid = document.elementFromPoint(innerWidth / 2, innerHeight * 0.6);
      return { cards: document.querySelectorAll('.spcard').length, peek: gm.classList.contains('is-sppeek'), tab: !!document.querySelector('.spov__peekbar'),
        covered: !!mid?.closest('.spov'), bonds: getComputedStyle(document.querySelector('.gm__bonds') || document.body).opacity };
    });
    const before = await state();
    assert.ok(before.cards > 0);
    assert.equal(before.covered, true, 'the overlay covers the field');
    // (the overlay's entry animation can make puppeteer's own click miss: press it in the page)
    await page.evaluate(() => document.querySelector('[data-testid="sp-peek"]').click());
    await page.waitForSelector('.spov__peekbar');
    const peek = await state();
    assert.deepEqual({ cards: peek.cards, peek: peek.peek, tab: peek.tab, covered: peek.covered }, { cards: 0, peek: true, tab: true, covered: false });
    await page.screenshot({ path: `${OUT}/improv-peek.png` });
    await page.evaluate(() => document.querySelector('[data-testid="sp-peek-back"]').click());
    await page.waitForSelector('.spcard');
    const back = await state();
    assert.equal(back.peek, false);
    assert.equal(back.cards, before.cards);
  });
});
