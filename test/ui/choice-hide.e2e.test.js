// The 机变 overlay's 隐藏 button: the overlay steps aside so the match UI behind it (敌方情报, the board) can be checked
// before picking, and the 返回选择 pill brings it back with the pending choice intact.
// SP_E2E=1 CHROME_PATH=/path/to/chrome node --test test/ui/choice-hide.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('hide the 机变 overlay', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  for (const [width, height, touch] of [[1280, 720, false], [640, 360, true]]) {
    test(`hide → 敌方情报 → Esc → 返回选择 → pick at ${width}×${height}`, async () => {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const activate = (selector) => touch ? page.tap(selector) : page.click(selector);
      try {
        await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
        await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=SP_DRAFT&variant=bounty&lang=zh`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.spov .spcard.is-pickable');
        assert.ok(await page.$('.gm.has-sp'));
        // a selected card is dropped by hiding, so the overlay never comes back half-confirmed
        await activate('.spcard.is-pickable');
        await page.waitForSelector('.spcard.is-armed');
        await activate('[data-testid="sp-hide"]');
        await page.waitForSelector('.spov', { hidden: true });
        await page.waitForSelector('.sppeek.is-mine [data-testid="sp-show"]');
        await page.waitForSelector('.gm:not(.has-sp)'); // the bond strip and effects come back while hidden
        // the top bar is reachable: 敌方情报 opens, Esc closes it
        await activate('[data-testid="check-player"]');
        await page.waitForSelector('.edrawer');
        await page.keyboard.press('Escape');
        await page.waitForSelector('.edrawer', { hidden: true });
        assert.ok(await page.$('.sppeek'), 'Esc does not bring the overlay back by itself');
        // 返回选择: the overlay returns with nothing selected and the pick still works
        await activate('[data-testid="sp-show"]');
        await page.waitForSelector('.spov .spcard.is-pickable');
        assert.equal(await page.$('.spcard.is-armed'), null);
        await page.waitForSelector('.gm.has-sp');
        await activate('.spcard.is-pickable');
        await activate('.spcard.is-armed');
        await page.waitForSelector('.spcard.is-mine');
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    });
  }
});
