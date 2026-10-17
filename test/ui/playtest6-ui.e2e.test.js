// Browser regressions of user playtest #6, UI items 6 / 10, through the mock harness (public/dev/game-mock.html) in
// headless Chrome (puppeteer-core + system Chrome). Opt-in: SP_E2E=1.
//
//   SP_E2E=1 node --test test/ui/playtest6-ui.e2e.test.js
//
//   6  every 机变 card shows its whole effect text inside the card: all 51 shop items (道具补给 / 机密商店), all 129
//      bounty and all 43 tactic cards, at the phone landscape viewports (the smallest supported 640×360, 667×375,
//      720×360, the user's Android 756×366, 800×360, 844×390, 932×430) and at 1280×720 / 1920×1080 — the text is not
//      clamped, ends inside the card's padding, and is at least 7.5 px (phones) / .19rem (16:9); every card is measured
//      once taken (the taker's round avatar at its top-right) and once not, and a taken card's name and tags never run
//      under the badge — measured with the page's web font Noto Sans SC when Google Fonts can be reached (QA: with it
//      海沟实验体 took 8 lines at 640×360). v2.4.1 at 756×366: 0.2 lines of it were visible (screenshot 2).
//  10  a tap anywhere on the armed shop card (operator and item) buys, the 确认购买 strip included, on touch at
//      640×360 / 756×366 / 800×360 / 844×390 / 932×430 and with the mouse at 1920×1080: every point of a 12 × 12 grid over the
//      armed card hit-tests to the card, and real taps on the strip's centre / right end and the card's bottom-right
//      buy. v2.4.1: 120 of 144 points (the ⓘ corner's hidden 44 px touch area over the bottom-right quarter) — the strip's
//      centre did not buy; at 640×360 the left-docked detail card opened by the first tap also covered the top quarter of
//      the first cards (84 / 96 of 144).
// Screenshots: test/e2e/out/p6-*.png.

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

/** name, width, height, touch */
const PHONES = [['756x366', 756, 366, true], ['800x360', 800, 360, true], ['844x390', 844, 390, true], ['932x430', 932, 430, true]];
/** narrower phones (text only): the smallest supported phone (DESIGN §10, devices.e2e) and the iPhone SE / 8 */
const NARROW = [['640x360', 640, 360, true], ['667x375', 667, 375, true], ['720x360', 720, 360, true]];
/** two pick maps over the 4 mock players (p1 = me): every one of 6 cards is taken in one pass and free in the other */
const TAKEN = [{ p4: 0, p3: 1, ai_2: 2, p1: 3 }, { p4: 4, p3: 5 }];
const DESKTOP = [['1280x720', 1280, 720, false], ['1920x1080', 1920, 1080, false]];
/** public/index.html's Google Fonts stylesheet */
const WEB_FONTS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Oxanium:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap';

describe('user playtest #6 — UI items 6 / 10 (mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  async function open(query, { w, h, touch, webFont = false }) {
    const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    await gotoMock(page, `${base}/dev/game-mock.html?shot=1&${query}`);
    await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)'), { timeout: 20000 });
    // the real page's web font (index.html loads it from Google Fonts; Android's CJK font has its metrics): the mock has
    // no <link> for it, and the system fallback wraps differently (QA: 海沟实验体 took 8 lines at 640×360 with it) —
    // measured with it whenever it can be fetched
    const noto = webFont && await Promise.race([
      page.addStyleTag({ url: WEB_FONTS }).then(() => page.evaluate(async () => {
        await Promise.all(['400', '700', '900'].map((wt) => document.fonts.load(`${wt} 12px "Noto Sans SC"`, '获得伤害减免')));
        return document.fonts.check('12px "Noto Sans SC"', '获得');
      })).catch(() => false),
      sleep(8000).then(() => false),
    ]);
    await page.evaluate(() => document.fonts.ready);
    await sleep(900);
    return { page, problems, noto };
  }

  /** Each 机变 card's text: clamped?, bottom beyond the card's padding (px), font size; taken?, name / tags under the badge? */
  const cardTexts = (page) => page.evaluate(() => [...document.querySelectorAll('.spcard')].map((c) => {
    const r = c.getBoundingClientRect();
    const d = c.querySelector('.spcard__desc');
    if (!d) return { name: c.querySelector('.spcard__name')?.textContent, missing: true };
    const dr = d.getBoundingClientRect();
    const cs = getComputedStyle(d);
    const badge = c.querySelector('.spcard__taker')?.getBoundingClientRect();
    let under = false;
    for (const el of badge ? c.querySelectorAll('.spcard__name, .spcard__tag') : []) {
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const a of [...range.getClientRects(), el.getBoundingClientRect()]) {
        if (a.right > badge.left + 0.5 && a.left < badge.right - 0.5 && a.bottom > badge.top + 0.5 && a.top < badge.bottom - 0.5) under = true;
      }
    }
    return { name: c.querySelector('.spcard__name')?.textContent, text: d.textContent.length, clamped: d.scrollHeight > d.clientHeight + 1,
      beyond: dr.bottom - (r.bottom - parseFloat(getComputedStyle(c).paddingBottom)), font: parseFloat(cs.fontSize), rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      taken: !!badge, under };
  }));

  test('6: every 机变 card shows its whole effect text inside the card, taken or not, on phones and on desktop', { timeout: 15 * 60 * 1000 }, async () => {
    const report = [];
    for (const [name, w, h, touch] of [...NARROW, ...PHONES, ...DESKTOP]) {
      const { page, problems, noto } = await open('phase=SP_DRAFT&variant=supply', { w, h, touch, webFont: true });
      if (name === '756x366' || name === '640x360') await page.screenshot({ path: path.join(OUT, `p6-supply-${name}.png`) });
      const sets = await page.evaluate(async () => {
        const { data } = await import('/js/data.js');
        const ch = data.get('choices');
        return {
          supply: data.list('items').filter((i) => !i.isGolden && i.itemType === 'EQUIP' && !i.shopExcluded).map((i) => ({ itemId: i.id })),
          bounty: ch.cards.bounty.map((b) => ({ effectId: b.effectId })),
          tactic: ch.cards.tactic.map((t) => ({ effectId: t.effectId })),
        };
      });
      for (const [family, list] of Object.entries(sets)) {
        let n = 0;
        let taken = 0;
        for (let i = 0; i < list.length; i += 6) {
          for (const picks of TAKEN) {
            await page.evaluate((cards, family, picks) => {
              const S = globalThis.__MOCK__.S();
              S.pub.sp = { ...S.pub.sp, family, cards, picks };
              globalThis.__MOCK__.pushPublic();
            }, list.slice(i, i + 6), family, picks);
            await sleep(120);
            for (const t of await cardTexts(page)) {
              n++;
              if (t.taken) taken++;
              const tag = `${name} ${family} ${t.name}${t.taken ? ' (taken)' : ''}`;
              assert.ok(!t.missing && t.text > 0, `${tag}: an effect text`);
              assert.ok(!t.clamped, `${tag}: the whole text (not clamped)`);
              assert.ok(t.beyond <= 0.5, `${tag}: inside the card (${t.beyond.toFixed(1)} px beyond its padding)`);
              assert.ok(touch ? t.font >= 7.5 : t.font >= 0.19 * t.rem - 0.01, `${tag}: ${t.font} px`);
              assert.ok(!t.under, `${tag}: the name and tags keep clear of the taker's badge`);
            }
          }
        }
        assert.equal(n, list.length * TAKEN.length, `${name} ${family}: every card rendered`);
        assert.equal(taken, list.length, `${name} ${family}: every card measured taken once`);
      }
      report.push(`${name}: ${Object.values(sets).reduce((a, l) => a + l.length, 0)} texts in full, taken or not (${noto ? 'Noto Sans SC' : 'system font — Google Fonts unreachable'})`);
      assert.deepEqual(noto ? problems : problems.filter((x) => !/Failed to load resource/.test(x)), [], name);
      await page.close();
    }
    console.log(report.join('\n'));
  });

  test('6: the taken-by badge and the two-tap strip stay on the new card (756×366)', async () => {
    const { page, problems } = await open('phase=SP_DRAFT&variant=supply', { w: 756, h: 366, touch: true });
    assert.ok(await page.$('.spcard.is-taken .spcard__taker'), 'the taker\'s badge');
    const tap = async (sel) => {
      const r = await page.$eval(sel, (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.bottom - 4 }; });
      await page.touchscreen.tap(r.x, r.y);
      await sleep(350);
    };
    await tap('.spcard.is-pickable');
    assert.ok(await page.$('.spcard.is-armed .spcard__confirm'), 'first tap: selected, 确认选择 strip');
    await page.screenshot({ path: path.join(OUT, 'p6-supply-armed-756x366.png') });
    await tap('.spcard.is-armed'); // on the strip
    await page.waitForSelector('.spcard.is-mine', { timeout: 3000 });
    assert.deepEqual(problems, []);
    await page.close();
  });

  /** Arm the first buyable card matching `sel`, then hit-test a 12 × 12 grid over it: a point counts when the tap target
   *  there (the nearest button / role=button) is the armed card itself — not an inner control such as the old ⓘ, and not
   *  the detail card its first tap opened. */
  async function armAndProbe(page, sel, touch) {
    const tapAt = async (x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await sleep(400); };
    const b = await page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await tapAt(b.x + b.w * 0.85, b.y + b.h * 0.85); // the old ⓘ corner: arms like the rest of the card
    return page.evaluate(() => {
      const a = document.querySelector('.scard.is-armed');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      const N = 12;
      let hit = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const el = document.elementFromPoint(r.left + (i + 0.5) * r.width / N, r.top + (j + 0.5) * r.height / N);
        if (el && el.closest('button, [role="button"], a, input') === a) hit++;
      }
      const s = a.querySelector('.scard__confirm')?.getBoundingClientRect();
      return { hit, n: N * N, box: { x: r.left, y: r.top, w: r.width, h: r.height }, strip: s && { x: s.left, y: s.top, w: s.width, h: s.height } };
    });
  }

  test('10: a tap anywhere on the armed shop card buys — the 确认购买 strip included (touch on phones, mouse on desktop)', { timeout: 10 * 60 * 1000 }, async () => {
    const report = [];
    const SPOTS = ['strip centre', 'strip right', 'card bottom-right'];
    for (const [name, w, h, touch] of [NARROW[0], ...PHONES, DESKTOP[1]]) {
      const { page, problems } = await open('phase=PREP', { w, h, touch });
      await page.evaluate(() => globalThis.__MOCK__.mutate((S) => { S.priv.funds = 99; S.priv.hand = S.priv.hand.map(() => null); }));
      await sleep(200);
      for (const [kind, sel] of [['operator', '.shopbar__cards .scard:not(.scard--sold):not(.is-disabled)'], ['item', '.shopbar__item .scard:not(.scard--sold):not(.is-disabled)']]) {
        for (const spot of SPOTS) {
          // a fresh card for every spot: the next operator card; the item slot comes back with a refresh (R)
          if (!(await page.$(sel))) { await page.keyboard.press('KeyR'); await sleep(350); }
          const slotIdx = await page.evaluate((s) => {
            const el = document.querySelector(s);
            const S = globalThis.__MOCK__.S();
            const isItem = !!el.closest('.shopbar__item');
            const cards = [...document.querySelectorAll(isItem ? '.shopbar__item .scard' : '.shopbar__cards .scard')];
            const slots = S.priv.shop.slots.map((x, i) => ({ x, i })).filter(({ x }) => (isItem ? x && x.kind === 'item' : !x || x.kind !== 'item'));
            return slots[cards.indexOf(el)]?.i ?? null;
          }, sel);
          assert.ok(Number.isInteger(slotIdx), `${name} ${kind}: a card to buy`);
          const probe = await armAndProbe(page, sel, touch);
          assert.ok(probe, `${name} ${kind}: the card is armed by a tap on its bottom-right`);
          assert.equal(probe.hit, probe.n, `${name} ${kind}: ${probe.hit}/${probe.n} points of the armed card are the card`);
          const funds0 = await page.evaluate(() => globalThis.__MOCK__.S().priv.funds);
          const { box, strip } = probe;
          const at = spot === 'strip centre' ? [strip.x + strip.w / 2, strip.y + strip.h / 2]
            : spot === 'strip right' ? [strip.x + strip.w * 0.9, strip.y + strip.h * 0.6] : [box.x + box.w * 0.94, box.y + box.h * 0.94];
          if (touch) await page.touchscreen.tap(at[0], at[1]); else await page.mouse.click(at[0], at[1]);
          await sleep(450);
          const after = await page.evaluate((i) => ({ funds: globalThis.__MOCK__.S().priv.funds, sold: !!globalThis.__MOCK__.S().priv.shop.slots[i]?.sold }), slotIdx);
          assert.ok(after.sold && after.funds < funds0, `${name} ${kind}: a ${touch ? 'tap' : 'click'} on the ${spot} buys`);
          if (spot === 'strip centre' && kind === 'operator') report.push(`${name}: ${probe.hit}/${probe.n}`);
          await page.evaluate(() => globalThis.__MOCK__.mutate((S) => { S.priv.funds = 99; S.priv.hand = S.priv.hand.map(() => null); }));
          await sleep(150);
        }
      }
      assert.deepEqual(problems, [], name);
      await page.close();
    }
    console.log(report.join('\n'));
  });
});
