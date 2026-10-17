// The 战术决策 overlay with the same card twice, in headless Chrome (puppeteer-core + system Chrome) through the mock
// harness (public/dev/game-mock.html ?phase=SP_DRAFT&variant=tactic: the official 战术决策 of match 7 R11 — 补给 in
// slots 1 and 2; the user: "战术决策也按官方改成可以重复吧"). Opt-in: SP_E2E=1.
//
//   SP_E2E=1 node --test test/ui/feedback1-tactic.e2e.test.js
//
// Two identical cards render as two cards with the same face (name, 全队获得, text) under the official header; a
// teammate taking the first leaves the second pickable; two taps on the second pick it — its own index goes to the
// server (g.choice), only it shows my avatar. Screenshots: test/e2e/out/fb1-tactic-*.png.
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

describe('战术决策: the same card twice (mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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
    team: !!c.querySelector('.spcard__tag--team'), desc: c.querySelector('.spcard__desc')?.textContent, w: c.getBoundingClientRect().width,
  })));

  for (const [name, w, h, touch] of [['756x366', 756, 366, true], ['1920x1080', 1920, 1080, false]]) {
    test(`${name}: two 补给 are two cards; the second stays pickable after the first is taken, and picking it sends its own index`, { timeout: 120000 }, async () => {
      const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
      const problems = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
      await gotoMock(page, `${base}/dev/game-mock.html?shot=1&phase=SP_DRAFT&variant=tactic`);
      await page.waitForSelector('.spov__grid .spcard', { timeout: 20000 });
      await sleep(600);
      const head = await page.$eval('.spov__title', (e) => e.textContent);
      assert.ok(head.includes('战术决策') && head.includes('进行协同调整，做好迎战准备。'), `the official header: ${head}`);
      // the teammate p4 has taken the first 补给 (slot 0)
      await page.evaluate(() => { const S = globalThis.__MOCK__.S(); S.pub.sp = { ...S.pub.sp, picks: { p4: 0 }, turn: 'p1' }; globalThis.__MOCK__.pushPublic(); });
      await sleep(300);
      let c = await cards(page);
      assert.equal(c.length, 6);
      assert.deepEqual(c.map((x) => x.name), ['补给', '补给', '谢拉格驰援', '列装', '莫斯提马的盟誓', '升华']);
      assert.deepEqual([c[0].team, c[0].desc, Math.round(c[0].w)], [c[1].team, c[1].desc, Math.round(c[1].w)], 'the same face');
      assert.ok(c[0].team && /2.*次刷新/.test(c[0].desc), `补给: ${c[0].desc}`);
      assert.ok(c[0].taken && c[0].badge && c[0].disabled, 'the first twin: taken, with the taker\'s avatar');
      assert.ok(!c[1].taken && !c[1].badge && !c[1].disabled, 'the second twin: free');
      await page.screenshot({ path: path.join(OUT, `fb1-tactic-${name}.png`) });
      // two taps on the second twin
      const tap = async (i) => { const btn = (await page.$$('.spov__grid .spcard'))[i]; if (touch) await btn.tap(); else await btn.click(); await sleep(250); };
      await tap(1);
      c = await cards(page);
      assert.deepEqual(c.map((x) => x.armed), [false, true, false, false, false, false], 'only the tapped twin is armed');
      await page.screenshot({ path: path.join(OUT, `fb1-tactic-${name}-armed.png`) });
      await tap(1);
      const picks = await page.evaluate(() => ({ ...globalThis.__MOCK__.S().pub.sp.picks }));
      assert.deepEqual(picks, { p4: 0, p1: 1 }, 'g.choice sent the second twin\'s index');
      await sleep(250);
      c = await cards(page);
      assert.ok(c[1].mine && c[1].badge, 'the second twin is mine');
      assert.ok(c[0].taken && !c[0].mine, 'the first twin stays the teammate\'s');
      assert.deepEqual(problems, []);
      await page.close();
    });
  }
});
