// S.W.E.E.P.报告 → 干员调配 and back, in a real browser (fork), on a desktop and on a landscape phone (844 × 390):
//   - an operator of 对应干员 opens the loadout at its row (selected, in view; a filter that hid it is cleared; the
//     card view opens its drawer, the phone its detail)
//   - 返回 and Esc bring the report back with its tab, bond, scroll and the focus on that operator
//   - opened the normal way, the loadout's 返回 leaves the report closed
// SP_E2E=1 node --test test/ui/sweep-roster-link.e2e.test.js   (SP_SRL_SHOTS=<dir>: screenshots, in English)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Client, hasChrome, startRealServer, problemsOf, sleep } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();
const shots = process.env.SP_SRL_SHOTS;

const hideAll = (page) => page.evaluate(async () => (await import('/js/ui/loadoutSync.js')).loadoutStore
  .set({ filters: { tier: null, prof: null, bond: null, query: 'zzzz', changedOnly: false } }));
const loState = (page) => page.evaluate(async () => {
  const s = (await import('/js/ui/loadoutSync.js')).loadoutStore.get();
  return { sel: s.sel, query: s.filters.query, reveal: s.reveal };
});

async function shot(c, name) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await c.page.screenshot({ path: path.join(shots, `${name}.png`) });
}

/** Report on 盟约报告, the third bond picked, the grid scrolled: what the return must bring back. */
async function openReport(c) {
  await c.click('.lobby-sweep');
  await c.page.waitForSelector('.sw-tabs', { visible: true });
  await c.click('.sw-tab', null, { nth: 0 });
  await c.page.waitForFunction(() => document.querySelector('.sw-body')?.dataset.tab === 'bonds' && document.querySelectorAll('.sw-tile').length > 4, { timeout: 30000 });
  const tiles = await c.page.$$('.sw-tile');
  await tiles[3].evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await tiles[3].click();
  await c.page.waitForFunction(() => document.querySelectorAll('.sw-op.is-link').length > 1);
  await c.page.$eval('.sw-right', (e) => { e.scrollTop = Math.min(120, e.scrollHeight - e.clientHeight); });
  return c.page.evaluate(() => ({
    bond: document.querySelector('.sw-tile.is-on')?.getAttribute('title'),
    scroll: document.querySelector('.sw-right').scrollTop,
    ops: [...document.querySelectorAll('.sw-op.is-link')].map((e) => e.dataset.chess),
  }));
}

async function clickOp(c, chessId) {
  await c.page.$eval(`.sw-op[data-chess="${chessId}"]`, (e) => e.scrollIntoView({ block: 'nearest' }));
  await c.page.click(`.sw-op[data-chess="${chessId}"]`);
  await c.page.waitForSelector('.lo-back[data-return="true"]', { visible: true, timeout: 30000 });
  await c.page.waitForFunction(() => !document.querySelector('.sw-tabs'));
}

async function assertBack(c, before, chessId, how) {
  await c.page.waitForSelector('.sw-tabs', { visible: true });
  await c.page.waitForFunction(() => !document.querySelector('.lo'));
  await c.page.waitForFunction((bond) => document.querySelector('.sw-tile.is-on')?.getAttribute('title') === bond && document.querySelector('.sw-op'), { timeout: 30000 }, before.bond);
  await sleep(100);
  const now = await c.page.evaluate(() => ({ tab: document.querySelector('.sw-body')?.dataset.tab, scroll: document.querySelector('.sw-right').scrollTop,
    focus: document.activeElement?.dataset?.chess || null }));
  assert.equal(now.tab, 'bonds', `${how}: tab`);
  assert.ok(Math.abs(now.scroll - before.scroll) <= 2, `${how}: scroll ${now.scroll} vs ${before.scroll}`);
  assert.equal(now.focus, chessId, `${how}: focus on the operator`);
}

for (const [label, w, h] of [['desktop', 1600, 900], ['phone', 844, 390]]) {
  test(`S.W.E.E.P. → 干员调配 → back (${label} ${w}×${h})`, { skip: !enabled, timeout: 4 * 60 * 1000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, `srl-${label}`, { w, h });
    try {
      await c.open('?lang=en');
      await c.page.waitForSelector('.title-login input', { timeout: 20000 });
      await c.click('.title-login input');
      await c.page.keyboard.type('Sweep Link');
      await c.click('.title-login button');
      await c.page.waitForSelector('.lobby-screen', { timeout: 20000 });

      // 1. list view, a filter that hides the operator: cleared, the row selected and in view
      const before = await openReport(c);
      const target = before.ops[2];
      const slot = await c.page.evaluate(async (id) => {
        const { loadoutSlotOf } = await import('/js/screens/sweep.js');
        const { data } = await import('/js/data.js');
        return loadoutSlotOf(data.lookup('chess', id), data.list('chess'));
      }, target);
      assert.ok(slot);
      await hideAll(c.page);
      const sel = '.sw-op[data-chess="' + target + '"]';
      await c.page.$eval(sel, (e) => e.scrollIntoView({ block: 'nearest' }));
      await c.page.hover(sel);
      await sleep(250);
      assert.equal(await c.page.$eval(sel, (e) => getComputedStyle(e).cursor), 'pointer');
      await shot(c, `${label}-1-report-hover`);
      await clickOp(c, target);
      // (fork) the card view (the only view since 2026-11-08): its card selected and in view beside the drawer, which
      // holds its detail, on every width
      await c.page.waitForFunction((id) => document.querySelector(`.lo-op.is-sel[data-chess="${id}"]`), { timeout: 30000 }, slot);
      await c.page.waitForSelector('[data-testid="loadout-drawer"]', { visible: true, timeout: 30000 });
      const st = await loState(c.page);
      assert.deepEqual(st, { sel: slot, query: '', reveal: null });
      const cardInView = () => c.page.$eval('.lo-op.is-sel', (e) => {
        const r = e.getBoundingClientRect(); const deck = e.closest('.lo-deck'); const box = deck.getBoundingClientRect();
        const drawer = deck.parentElement.querySelector('.lo-drawer');
        const left = drawer ? drawer.getBoundingClientRect().right : box.left;
        return r.left >= left - 1 && r.right <= box.right + 1;
      });
      await sleep(300);
      assert.ok(await cardInView(), 'the card is scrolled into view beside the drawer');
      await shot(c, `${label}-2-loadout`);
      if (label === 'phone') {
        // the deck behind the drawer: the operator is in view there too once it folds
        await c.click('.lo-drawer__close');
        await c.page.waitForSelector('[data-testid="loadout-drawer"]', { hidden: true });
        await sleep(300);
        assert.ok(await cardInView(), 'phone deck: the card is in view');
        await shot(c, `${label}-3-loadout-deck`);
      }
      assert.match(await c.page.$eval('.lo-back', (e) => e.getAttribute('title')), /S\.W\.E\.E\.P\./);
      await c.click('.lo-back');
      await assertBack(c, before, target, '返回');
      await shot(c, `${label}-4-back`);

      // 2. Esc peels the drawer first, then goes back (the card view; its old desktop-only step 3 is this one now)
      await clickOp(c, before.ops[0]);
      await c.page.waitForSelector('[data-testid="loadout-drawer"]', { visible: true, timeout: 30000 });
      await sleep(300);
      await shot(c, `${label}-5-deck`);
      await c.page.keyboard.press('Escape');
      await c.page.waitForSelector('[data-testid="loadout-drawer"]', { hidden: true });
      await c.page.keyboard.press('Escape');
      await assertBack(c, before, before.ops[0], 'Esc');

      // 4. the normal way: the loadout's 返回 leaves the report closed
      await c.page.keyboard.press('Escape');
      await c.page.waitForSelector('.sw-tabs', { hidden: true });
      await c.click('[data-testid="loadout-open"]');
      await c.page.waitForSelector('.lo-back', { visible: true });
      assert.equal(await c.page.$('.lo-back[data-return]'), null);
      await c.click('.lo-back');
      await c.page.waitForFunction(() => !document.querySelector('.lo'));
      await sleep(300);
      assert.equal(await c.page.$('.sw-tabs'), null, 'the report stays closed');
      assert.deepEqual(problemsOf([c]), []);
    } finally {
      await c.close();
      await srv.stop();
    }
  });
}
