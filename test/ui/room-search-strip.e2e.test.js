// Browser E2E of the room's 搜寻队友 switch (ui/matchSearch.js SearchBar) against the real server, headless Chrome.
// Opt-in: SP_E2E=1 node --test test/ui/room-search-strip.e2e.test.js
//
// The layout that came with upstream 0.3.3 paints an absolute .rs__bg over every sibling that is not positioned, and the
// switch's strip once was one: it showed only its positioned track, with no label, state or border, yet it still took
// clicks because .rs__bg has pointer-events: none. So a plain hit test cannot see the bug, and neither can the text-fit
// checker: these checks give .rs__bg its pointer events back and hit test the text.
// Also: the switch sits right above the big button and nothing of it is left in the room's centre, it really switches
// the button, and the phone sizes stay readable and tappable.

import { seedReleaseRead } from '../helpers/releaseNotes.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { textProblems } from '../e2e/text-fit.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LANGS = {
  en: { label: 'Find Teammates', on: 'On', off: 'Off', start: 'Start Simulation', stop: 'Stop searching' },
  zh: { label: '搜寻队友', on: '开启', off: '关闭', start: '开始模拟', stop: '停止搜寻' },
};
const SCREENS = { desktop: { width: 1440, height: 900 }, phone: { width: 844, height: 390, hasTouch: true, isMobile: true } };

describe('the room\'s 搜寻队友 switch (real server, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  const openHost = async (lang, screen) => openHostIn(await browser.createBrowserContext(), lang, screen);
  async function openHostIn(ctx, lang, screen, who = 'Kaltsit', create = true) {
    const page = await ctx.newPage();
    await page.setViewport({ ...SCREENS[screen], deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((l, n) => {
      localStorage.setItem('sp.name', n);
      sessionStorage.setItem('sp.entered', '1');
      localStorage.setItem('sp.pref.lang', JSON.stringify(l));
    }, lang, who);
    await seedReleaseRead(page);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'), { timeout: 30000 });
    if (!create) return { ctx, page };
    const res = await page.evaluate(() => globalThis.__SP__.net.request('room.create', { mode: 'coop', difficulty: 'NORMAL' }).then(() => 'ok', (e) => e?.code || String(e)));
    assert.equal(res, 'ok');
    await page.waitForSelector('.room-screen .searchbar__switch', { visible: true, timeout: 15000 });
    await page.waitForFunction(() => !document.getAnimations()
      .some((a) => /^(rs|tr|rseat)-/.test(String(a.animationName)) && a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity), { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    return { ctx, page };
  }

  /** What the player sees of the strip: text, the top element at each text's centre with .rs__bg hittable, sizes. */
  const strip = (page) => page.evaluate(() => {
    const bg = document.querySelector('.rs__bg');
    bg.style.pointerEvents = 'auto';
    const painted = (sel) => {
      const e = document.querySelector(sel);
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === e || e.contains(top));
    };
    const sw = document.querySelector('.searchbar__switch');
    const out = {
      label: document.querySelector('.searchbar__label').textContent.trim(),
      state: document.querySelector('.searchbar__state').textContent.trim(),
      checked: sw.getAttribute('aria-checked'),
      go: document.querySelector('.rs-foot__right .rs-go').textContent.trim(),
      painted: Object.fromEntries(['.searchbar__label', '.searchbar__state'].map((s) => [s, painted(s)])),
      above: (() => {
        const a = sw.getBoundingClientRect(), g = document.querySelector('.rs-foot__right .rs-go').getBoundingClientRect();
        return { column: sw.parentElement === document.querySelector('.rs-foot__right'), gap: Math.round(g.top - a.bottom), left: Math.round(a.left - g.left), right: Math.round(a.right - g.right) };
      })(),
      besides: document.querySelector('.rs-foot__right').children.length,
      unpositioned: [...document.querySelector('.room-screen').children]
        .filter((k) => getComputedStyle(k).position === 'static').map((k) => k.className),
      labelPx: parseFloat(getComputedStyle(document.querySelector('.searchbar__label')).fontSize),
      switchH: sw.getBoundingClientRect().height,
      inside: (() => { const r = sw.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })(),
    };
    bg.style.pointerEvents = '';
    return out;
  });
  const pressSwitch = async (page) => {
    const [x, y] = await page.$eval('.searchbar__switch', (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.click(x, y);
    await sleep(150);
  };

  for (const [lang, want] of Object.entries(LANGS)) {
    for (const screen of Object.keys(SCREENS)) {
      test(`${lang}, ${screen}: the switch shows its text above the background and works`, async () => {
        const { ctx, page } = await openHost(lang, screen);
        try {
          let s = await strip(page);
          assert.equal(s.label, want.label);
          assert.equal(s.state, want.on);
          assert.equal(s.checked, 'true');
          assert.deepEqual(s.painted, { '.searchbar__label': true, '.searchbar__state': true }, 'the switch\'s text is under .rs__bg');
          assert.equal(s.above.column, true, 'the switch sits in the button\'s column');
          assert.ok(s.above.gap >= 0 && s.above.gap <= 12, `directly above the button (gap ${s.above.gap} px)`);
          assert.ok(Math.abs(s.above.left) <= 1 && Math.abs(s.above.right) <= 1, `as wide as the button (${s.above.left}, ${s.above.right})`);
          assert.equal(s.besides, 2, 'only the switch and the button: no description beside them');
          assert.equal(await page.$('.room-screen > .searchbar, .room-screen .searchbar'), null, 'nothing of the old strip in the room\'s centre');
          assert.deepEqual(s.unpositioned, [], 'a child of the screen .rs__bg paints over');
          assert.ok(s.inside, 'the switch is on screen');
          if (screen === 'phone') {
            assert.ok(s.labelPx >= 11, `label ${s.labelPx} px`);
            assert.ok(s.switchH >= 27, `switch ${s.switchH} px tall`);
          }
          assert.match(s.go, new RegExp(want.label));
          assert.ok(await page.$('.rs-foot__right .rs-go.proto-start.rs-go'), 'the big button has the look of 开始模拟');

          await pressSwitch(page);
          s = await strip(page);
          assert.equal(s.state, want.off);
          assert.equal(s.checked, 'false');
          assert.equal(s.painted['.searchbar__label'], true);
          assert.match(s.go, new RegExp(want.start));

          await pressSwitch(page);
          s = await strip(page);
          assert.equal(s.state, want.on);
          assert.match(s.go, new RegExp(want.label));
        } finally {
          await ctx.close();
        }
      });
    }
  }

  // the switch is on by default, and room-fit.e2e.test.js runs with it off: its fit on the phones, where it takes height from
  // the seat cards, in every language at every 文字大小, for a host alone and with a doctor who is not ready
  for (const lang of ['zh', 'zh-TW', 'en', 'ja', 'ko']) {
    test(`phones, ${lang} at every 文字大小: the switch, the big button and the room around them keep their text inside their boxes`, async () => {
      const ctx = await browser.createBrowserContext();
      const { page } = await openHostIn(ctx, lang, 'phone');
      const guest = await openHostIn(await browser.createBrowserContext(), lang, 'phone', 'Amiya', false);
      const bad = [];
      try {
        for (const size of [[640, 360], [667, 375], [844, 390]]) {
          for (const ts of ['sm', 'md', 'lg', 'xl']) {
            await page.evaluate(async (v) => (await import('/js/ui/settings.js')).updateSettings({ textSize: v }), ts);
            await page.setViewport({ width: size[0], height: size[1], hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
            await page.waitForSelector('.room-screen .searchbar__switch', { visible: true, timeout: 15000 });
            await sleep(150);
            for (const p of await page.evaluate(textProblems, '.room-screen', '[data-testid="room-version"] .rs-pill__vername')) bad.push(`${ts} ${size.join('×')} alone: ${p}`);
          }
        }
        const code = await page.evaluate(() => globalThis.__SP__.store.get().room.code);
        const joined = await guest.page.evaluate((c) => globalThis.__SP__.net.request('room.join', { code: c }).then(() => 'ok', (e) => e?.code || String(e)), code);
        assert.equal(joined, 'ok');
        await page.waitForFunction(() => document.querySelectorAll('.room-screen .seat:not(.seat--empty)').length === 2, { timeout: 15000 });
        for (const ts of ['sm', 'xl']) {
          await page.evaluate(async (v) => (await import('/js/ui/settings.js')).updateSettings({ textSize: v }), ts);
          await sleep(150);
          for (const p of await page.evaluate(textProblems, '.room-screen', '[data-testid="room-version"] .rs-pill__vername')) bad.push(`${ts} with a doctor: ${p}`);
        }
        assert.deepEqual(bad, []);
      } finally {
        await guest.ctx.close();
        await ctx.close();
      }
    });
  }

  for (const screen of Object.keys(SCREENS)) {
    test(`${screen}: filling the last seat keeps the switch's space, so the seat cards do not stretch`, async () => {
      const { ctx, page } = await openHost('en', screen);
      try {
        const seats = () => page.$eval('.rs-seats', (e) => e.getBoundingClientRect().height);
        const before = await seats();
        for (let i = 0; i < 3; i++) {
          const res = await page.evaluate(() => globalThis.__SP__.net.request('room.addBot', {}).then(() => 'ok', (e) => e?.code || String(e)));
          assert.equal(res, 'ok');
        }
        await page.waitForFunction(() => document.querySelectorAll('.room-screen .seat:not(.seat--empty)').length === 4, { timeout: 15000 });
        await sleep(200);
        assert.ok(Math.abs(await seats() - before) <= 1, `seats ${before} px, then ${await seats()} px`);
        const left = await page.evaluate(() => ({
          role: !!document.querySelector('.room-screen [role="switch"]'),
          gap: getComputedStyle(document.querySelector('.searchbar__switch--gap')).visibility,
          label: document.querySelector('.rs-foot__right .rs-go').textContent,
        }));
        assert.deepEqual([left.role, left.gap], [false, 'hidden'], 'no switch to press, only its empty place');
        assert.match(left.label, /Start Simulation/);
      } finally {
        await ctx.close();
      }
    });
  }

  test('while searching the big button reads dark on amber, not mint on amber', async () => {
    const { ctx, page } = await openHost('en', 'desktop');
    try {
      await page.click('.rs-foot__right .rs-go');
      await page.waitForFunction((t) => document.querySelector('.rs-foot__right .rs-go')?.textContent.includes(t), { timeout: 8000 }, LANGS.en.stop);
      await page.waitForFunction(() => {
        const b = document.querySelector('.rs-foot__right .rs-go');
        return b.dataset.tone === 'stop' && b.getAttribute('aria-busy') !== 'true' && !b.getAnimations().some((a) => a.playState === 'running');
      }, { timeout: 8000 });
      const look = await page.$eval('.rs-foot__right .rs-go', (b) => getComputedStyle(b).color);
      // the old is-active text was bright mint on amber, rgb(84, 211, 176)
      const [r, g, b] = look.match(/\d+/g).map(Number);
      assert.ok(r + g + b < 120, `the amber button's own dark text, got ${look}`);
      const s = await strip(page);
      assert.equal(s.checked, 'true');
      assert.equal(s.painted['.searchbar__label'], true);
      await page.click('.rs-foot__right .rs-go');
      await page.waitForFunction((t) => document.querySelector('.rs-foot__right .rs-go')?.textContent.includes(t), { timeout: 8000 }, LANGS.en.label);
    } finally {
      await ctx.close();
    }
  });
});
