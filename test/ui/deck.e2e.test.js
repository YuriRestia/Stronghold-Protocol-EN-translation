// test/ui/deck.e2e.test.js — GitHub #132: the shop's 牌库 button opens the shared deck popup; an m.deck answer fills it,
// by class, with each operator's copies left. Through the mock harness (public/dev/game-mock.html) in headless Chrome:
// the mock has no pool, so the test answers the popup's g.deck itself. Opt-in: SP_E2E=1 (CHROME_PATH overrides).
//
//   SP_E2E=1 node --test test/ui/deck.e2e.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { gotoMock } from '../e2e/mockPage.mjs';
import { OUT } from '../e2e/client.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('the shared deck popup (GitHub #132, mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  test('the 牌库 button asks for the deck and shows it by class', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await gotoMock(page, `${base}/dev/game-mock.html?shot=1&phase=PREP&render=fallback`);
    await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)') && !!globalThis.__SP_VIEW__, { timeout: 20000 });
    await page.evaluate(async () => {
      const { net } = await import('/js/net.js');
      const orig = net.request.bind(net);
      globalThis.__DECK__ = [];
      net.request = (t, body, ...rest) => (t === 'g.deck' ? (globalThis.__DECK__.push(body), Promise.resolve({})) : orig(t, body, ...rest));
    });
    await page.click('[data-testid="shop-deck"]');
    await page.waitForSelector('.deck');
    const asked = await page.evaluate(() => globalThis.__DECK__);
    assert.equal(asked.length, 1);
    const n = await page.evaluate(async (seq) => {
      const { net } = await import('/js/net.js');
      const { data } = await import('/js/data.js');
      const all = data.get('chess') || {};
      const pairs = (Array.isArray(all) ? all.map((c) => [c?.id ?? c?.chessId, c]) : Object.entries(all))
        .filter(([id, c]) => typeof id === 'string' && c && c.tier >= 1 && c.tier <= 6 && !c.isGolden && c.profession && data.lookup('chess', id)).slice(0, 40);
      net._emit('m.deck', { t: 'm.deck', seq, round: 3, ops: pairs.map(([id], i) => [id, i % 4, 3 + (i % 2)]) });
      const chess = pairs;
      return chess.length;
    }, asked[0].seq);
    await page.waitForSelector('.deck__op');
    const got = await page.evaluate(() => ({
      ops: document.querySelectorAll('.deck__op').length,
      groups: document.querySelectorAll('.deck__group').length,
      out: document.querySelectorAll('.deck__op.is-out').length,
    }));
    assert.equal(got.ops, n);
    assert.ok(got.groups >= 2);
    assert.equal(got.out, Math.ceil(n / 4));
    await page.screenshot({ path: `${OUT}/deck-popup.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.deck__op'));
  });
});
