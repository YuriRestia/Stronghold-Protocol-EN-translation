// (fork) One for All (Grand Alliance draft mode, crew-docs one-for-all-design.md §2.2): the vote variant of the strategy
// draft in the real screen, driven by the game mock's `vote` variant (m.public.draft { mode: 'vote', voters, locked },
// m.private.vote). It shows only the player's own card, the locked-in count with its dots, no 已被选择 and no skip;
// confirming locks the vote (the existing pick message) and the screen moves to the locked state.
// SP_E2E=1 node --test test/ui/one-for-all-vote.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gpuArgs } from '../../tools/perfbench.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const OUT = fileURLToPath(new URL('../e2e/out/one-for-all-vote/', import.meta.url));

describe('One for All vote draft (game mock)', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [...gpuArgs(), '--no-sandbox', '--no-proxy-server'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  test('only my own card, the count with its dots, no taken marks or skip; confirm locks the vote', async () => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=BAND_DRAFT&variant=vote`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.draft--vote .dband');
      const seen = await page.evaluate(() => ({
        rows: document.querySelectorAll('.draft-order .dorder').length,
        self: document.querySelectorAll('.draft-order .dorder.is-self').length,
        cur: document.querySelectorAll('.draft-order .dorder.is-cur').length,
        count: document.querySelector('[data-testid="vote-count-n"]')?.textContent.trim(),
        dots: document.querySelectorAll('.draft-vote__dots i').length,
        on: document.querySelectorAll('.draft-vote__dots i.is-on').length,
        bands: document.querySelectorAll('.draft-grid .dband').length,
        taken: document.querySelectorAll('.dband__taken, .dband.is-taken').length,
        skip: document.querySelectorAll('.draft-skip').length,
        sel: document.querySelectorAll('.dband.is-sel').length,
        tip: document.querySelector('[data-testid="draft-tip"]')?.textContent || '',
        names: [...document.querySelectorAll('.draft-order .dorder__name')].map((el) => el.textContent),
      }));
      assert.equal(seen.rows, 1, 'the order list shows only my own card');
      assert.equal(seen.self, 1);
      assert.equal(seen.cur, 1, 'my card is deciding');
      assert.equal(seen.count, '3 / 8');
      assert.equal(seen.dots, 8);
      assert.equal(seen.on, 3);
      assert.equal(seen.bands, 40, 'all 40 strategies');
      assert.equal(seen.taken, 0, 'no 已被选择 in a vote');
      assert.equal(seen.skip, 0, 'no skip in a vote');
      assert.equal(seen.sel, 0, 'nothing highlighted until a portrait is tapped');
      assert.match(seen.tip, /超时未选中策略将随机投票/);
      await page.screenshot({ path: `${OUT}vote-1-choosing.jpg`, type: 'jpeg', quality: 85 });

      await page.click('.dband[data-band="band_bldsk"]');
      await page.waitForSelector('.draft-detail .draft-confirm:not([disabled])');
      assert.match(await page.$eval('[data-testid="draft-tip"]', (el) => el.textContent), /超时将投给当前选中的「/);
      await page.click('.draft-detail .draft-confirm');
      await page.waitForSelector('.draft-done');
      const locked = await page.evaluate(() => ({
        sent: globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.band').map(([, f]) => f.bandId),
        focus: globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.bandFocus').map(([, f]) => f.bandId),
        rows: document.querySelectorAll('.draft-order .dorder').length,
        count: document.querySelector('[data-testid="vote-count-n"]')?.textContent.trim(),
        title: document.querySelector('.draft-done__title')?.textContent,
        head: document.querySelector('.dturn')?.textContent || '',
      }));
      assert.deepEqual(locked.sent, ['band_bldsk'], 'confirm sends the existing pick message once');
      assert.deepEqual(locked.focus, ['band_bldsk'], 'the highlight is reported only once tapped');
      assert.equal(locked.rows, 1);
      assert.equal(locked.count, '4 / 8');
      assert.equal(locked.title, '已锁定投票');
      assert.match(locked.head, /投票已锁定/);
      await page.screenshot({ path: `${OUT}vote-2-locked.jpg`, type: 'jpeg', quality: 85 });
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });
});
