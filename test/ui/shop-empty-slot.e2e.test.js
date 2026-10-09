// Browser check of the shop bar's empty slot (GitHub #332 / PR #333; opt-in, ~8 s) on the in-match mock harness:
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/shop-empty-slot.e2e.test.js
//
// A 调度中心 upgrade opens the new level's extra slot EMPTY (server/match/player/economy.js _openLevelSlots: a null slot
// in m.private shop.slots) and the next refresh or round start fills it. The bar used to draw every null slot like a
// bought one — the SOLD OUT frame with 「已招募」 — which on this slot says that somebody was recruited where nothing was.
// Asserted: the null slot is a bare frame (no text, a tooltip saying it fills at the next refresh), a bought slot still
// says 已招募, a real card is still a card, the empty frame is not a buyable card (`.scard:not(.scard--sold)` skips it)
// and a tap on it opens nothing; the refresh the mock answers fills it.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the empty slot of the shop bar', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  const cards = (page) => page.evaluate(() => [...document.querySelectorAll('.shopbar__cards .scard')].map((el) => ({
    empty: el.classList.contains('scard--empty'), sold: el.classList.contains('scard--sold'), text: el.textContent.replace(/\s+/g, ' ').trim(),
    title: el.getAttribute('title') || '',
  })));

  test('a null slot is a bare frame, a bought one still says 已招募, and a refresh fills the empty one', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/dev/game-mock.html?phase=PREP&render=fallback`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.shopbar__cards .scard', { timeout: 15000 });
    await sleep(400);
    const before = await cards(page);
    const n = before.length;
    assert.ok(n >= 4 && !before[0].sold, `the mock's shop has ${n} operator cards, the first one for sale`);

    // the upgrade's new slot: a null at the end of the operator slots; one more slot bought
    await page.evaluate(() => globalThis.__MOCK__.mutate((S) => {
      const slots = S.priv.shop.slots;
      const chess = slots.filter((s) => !s || s.kind !== 'item');
      const item = slots.filter((s) => s && s.kind === 'item');
      chess[0] = { ...chess[0], sold: true };
      S.priv.shop.slots = [...chess, null, ...item];
    }));
    await sleep(300);
    const after = await cards(page);
    assert.equal(after.length, n + 1);
    const empty = after.filter((c) => c.empty);
    assert.equal(empty.length, 1, 'one empty frame');
    assert.equal(empty[0].text, '', 'no SOLD OUT, no 已招募 on it');
    assert.match(empty[0].title, /空栏位/);
    assert.ok(empty[0].sold, 'it carries the inert frame class every `:not(.scard--sold)` rule skips (no hover lift, not a buyable card)');
    assert.equal(after[0].empty, false);
    assert.match(after[0].text, /已招募/, 'a bought slot still says so');
    assert.equal(after.filter((c) => !c.sold).length, before.filter((c) => !c.sold).length - 1, 'the rest are real cards');
    assert.equal(after[after.length - 1].empty, true, 'the new slot is the last operator slot');

    // a tap on the empty frame opens nothing
    await page.evaluate(() => document.querySelector('.shopbar__cards .scard--empty').click());
    await sleep(250);
    assert.equal(await page.$('.dpanel'), null);

    // a refresh fills it: the mock rolls every slot
    await page.evaluate(() => [...document.querySelectorAll('.toolbtn')].find((b) => /刷新/.test(b.textContent))?.click());
    await page.waitForFunction(() => document.querySelectorAll('.shopbar__cards .scard--empty').length === 0, { timeout: 5000 });
    assert.equal((await cards(page)).length, n + 1);
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('the upgrade itself: tapping the level card twice opens the fifth slot empty, the cards shown stay', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/dev/game-mock.html?phase=PREP&render=fallback`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.shopbar__cards .scard', { timeout: 15000 });
    // level 3 with its four operator slots, funds for the upgrade (the mock answers like the server: level 4 has five)
    await page.evaluate(() => globalThis.__MOCK__.mutate((S) => {
      const shop = S.priv.shop;
      const chess = shop.slots.filter((s) => s && s.kind === 'chess' && !s.sold).slice(0, 4);
      shop.level = 3; shop.upgradePrice = 11; S.priv.funds = 50;
      shop.slots = [...chess, shop.slots.find((s) => s && s.kind === 'item')];
    }));
    await sleep(300);
    const before = await cards(page);
    assert.equal(before.length, 4);
    assert.ok(before.every((c) => !c.sold), 'four real cards');
    await page.click('.lvcard');                      // two taps: select, confirm
    await sleep(200);
    await page.click('.lvcard');
    await page.waitForFunction(() => document.querySelectorAll('.shopbar__cards .scard--empty').length === 1, { timeout: 5000 });
    const after = await cards(page);
    assert.equal(after.length, 5);
    assert.deepEqual(after.map((c) => c.empty), [false, false, false, false, true]);
    assert.deepEqual(after.slice(0, 4).map((c) => c.text), before.map((c) => c.text), 'the cards shown stay as they were');
    assert.ok(after.slice(0, 4).every((c) => !/已招募/.test(c.text)));
    assert.deepEqual(problems, []);
    await page.close();
  });
});
