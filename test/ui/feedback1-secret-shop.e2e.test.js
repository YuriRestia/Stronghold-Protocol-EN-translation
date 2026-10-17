// The 机密商店 overlay with the same item twice, in headless Chrome (puppeteer-core + system Chrome) through the mock
// harness (public/dev/game-mock.html ?phase=SP_DRAFT&variant=shop: the official 机密商店 of match 8 R11 — 变形同构体 in
// slots 1 and 4). Opt-in: SP_E2E=1.
//
//   SP_E2E=1 node --test test/ui/feedback1-secret-shop.e2e.test.js
//
// Two identical cards render as two cards; a teammate taking the first leaves the second pickable; two taps on the
// second pick it — its own index goes to the server (g.choice), only it shows my avatar. Screenshots:
// test/e2e/out/fb1-secret-shop-*.png.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoMock } from '../e2e/mockPage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('机密商店: the same item twice (mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    mkdirSync(OUT, { recursive: true });
  });

  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  const cards = (page) => page.$$eval('.spov__grid .spcard', (els) => els.map((c) => ({
    name: c.querySelector('.spcard__name')?.textContent, taken: c.classList.contains('is-taken'), mine: c.classList.contains('is-mine'),
    armed: c.classList.contains('is-armed'), disabled: c.disabled, badge: !!c.querySelector('.spcard__taker'),
  })));

  for (const [name, w, h, touch] of [['756x366', 756, 366, true], ['1920x1080', 1920, 1080, false]]) {
    test(`${name}: two 变形同构体 are two cards; the second stays pickable after the first is taken, and picking it sends its own index`, { timeout: 120000 }, async () => {
      const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
      const problems = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
      await gotoMock(page, `${base}/dev/game-mock.html?shot=1&phase=SP_DRAFT&variant=shop`);
      await page.waitForSelector('.spov__grid .spcard', { timeout: 20000 });
      await sleep(600);
      // the teammate p4 has taken the first 变形同构体 (slot 0)
      await page.evaluate(() => { const S = globalThis.__MOCK__.S(); S.pub.sp = { ...S.pub.sp, picks: { p4: 0 }, turn: 'p1' }; globalThis.__MOCK__.pushPublic(); });
      await sleep(300);
      let c = await cards(page);
      assert.equal(c.length, 6);
      assert.equal(c[0].name, '变形同构体');
      assert.equal(c[3].name, '变形同构体');
      assert.ok(c[0].taken && c[0].badge && c[0].disabled, 'the first twin: taken, with the taker\'s avatar');
      assert.ok(!c[3].taken && !c[3].badge && !c[3].disabled, 'the second twin: free');
      await page.screenshot({ path: path.join(OUT, `fb1-secret-shop-${name}.png`) });
      // two taps on the second twin
      const tap = async (i) => { const btn = (await page.$$('.spov__grid .spcard'))[i]; if (touch) await btn.tap(); else await btn.click(); await sleep(250); };
      await tap(3);
      c = await cards(page);
      assert.deepEqual(c.map((x) => x.armed), [false, false, false, true, false, false], 'only the tapped twin is armed');
      await page.screenshot({ path: path.join(OUT, `fb1-secret-shop-${name}-armed.png`) });
      await tap(3);
      const picks = await page.evaluate(() => ({ ...globalThis.__MOCK__.S().pub.sp.picks }));
      assert.deepEqual(picks, { p4: 0, p1: 3 }, 'g.choice sent the second twin\'s index');
      await sleep(250);
      c = await cards(page);
      assert.ok(c[3].mine && c[3].badge, 'the second twin is mine');
      assert.ok(c[0].taken && !c[0].mine, 'the first twin stays the teammate\'s');
      assert.deepEqual(problems, []);
      await page.close();
    });
  }
});
