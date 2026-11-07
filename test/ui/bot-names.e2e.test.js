// Browser E2E of AI teammates' names against the real server, headless Chrome. Opt-in: SP_E2E=1 node --test test/ui/bot-names.e2e.test.js
//
// A human called 华法琳 and an AI seat named AI·华法琳 in one room: on an English page the AI seat reads Warfarin and the human
// keeps 华法琳, in the room, the briefing and the strategy draft; on a Chinese page both stay as they are.

import { seedReleaseRead } from '../helpers/releaseNotes.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
// without the art pack (CI) AvatarFrame falls back to its robot
const ART = existsSync(new URL('../../public/assets', import.meta.url));

describe('AI teammates\' names (real server, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  async function open(lang) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((l) => {
      localStorage.setItem('sp.name', '华法琳');
      sessionStorage.setItem('sp.entered', '1');
      localStorage.setItem('sp.pref.lang', JSON.stringify(l));
      localStorage.setItem('sp.pref.room.findMates', 'false');
    }, lang);
    await seedReleaseRead(page);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'), { timeout: 30000 });
    return { ctx, page };
  }
  const request = (page, type, body) => page.evaluate((t, b) => globalThis.__SP__.net.request(t, b).then(() => 'ok', (e) => e?.code || String(e)), type, body);
  /** Host, three AI seats: the plates' names by seat kind, once the operators' names have loaded. */
  const plates = (page) => page.evaluate(() => [...document.querySelectorAll('.room-screen .rseat')].map((c) => ({
    bot: c.classList.contains('is-bot'), name: c.querySelector('.seat__name')?.textContent.trim(),
  })));

  test('English page: the AI seats translated, the human named 华法琳 untouched, in the room, briefing and draft', async () => {
    const { ctx, page } = await open('en');
    try {
      assert.equal(await request(page, 'room.create', { mode: 'coop', difficulty: 'NORMAL' }), 'ok');
      await page.waitForSelector('.room-screen .rs-go', { visible: true, timeout: 15000 });
      for (let i = 0; i < 3; i++) assert.equal(await request(page, 'room.addBot', {}), 'ok');
      await page.waitForFunction(() => [...document.querySelectorAll('.room-screen .rseat.is-bot .seat__name')].some((e) => /Warfarin/.test(e.textContent)), { timeout: 15000 });
      const seats = await plates(page);
      const human = seats.find((s) => !s.bot);
      assert.equal(human.name.replace(/You$/, ''), '华法琳', 'the human keeps the name as typed');
      const bots = seats.filter((s) => s.bot).map((s) => s.name);
      assert.deepEqual(bots, ['AI·Warfarin', 'AI·Amiya', 'AI·Leizi']);
      if (ART) {
        // the AI seats wear their operators' icons on the card and the plate; the human named 华法琳 does not get Warfarin's
        await page.waitForFunction(() => document.querySelectorAll('.room-screen .rseat.is-bot .avatar img').length === 6, { timeout: 15000 });
        const icons = await page.$$eval('.room-screen .rseat', (cards) => cards.map((c) => ({
          bot: c.classList.contains('is-bot'), srcs: [...c.querySelectorAll('.avatar img')].map((i) => new URL(i.src).pathname), ok: [...c.querySelectorAll('.avatar img')].every((i) => i.complete && i.naturalWidth > 0),
        })));
        const botIcons = icons.filter((c) => c.bot);
        assert.deepEqual(botIcons.map((c) => [...new Set(c.srcs.map((s) => s.split('/').pop()))]), [['char_171_bldsk.png'], ['char_002_amiya.png'], ['char_306_leizi.png']]);
        assert.ok(botIcons.every((c) => c.ok), 'the icons load');
        assert.ok(!icons.find((c) => !c.bot).srcs.some((s) => s.includes('char_171_bldsk')), 'the human does not get the operator\'s icon');
      }
      assert.doesNotMatch(bots.join(' '), /[一-鿿]/, 'no Chinese left in the AI names');

      // a ticker line naming a player: translated only when the server marked the name as an AI seat's
      const ticker = await page.evaluate(async () => {
        const { tickerText } = await import('/js/ui/lang.js');
        const { data } = await import('/js/data.js');
        const b = data.get('config').broadcasts.find((x) => x.type === 'SHOP_LEVEL');
        const line = (name, bot) => tickerText({ id: b.id, type: b.type, text: 'x', args: [name, '3'], ...(bot ? { arg0Bot: true } : {}) });
        return { bot: line('AI·华法琳', true), human: line('华法琳', false), nameless: line('AI·华法琳', false) };
      });
      assert.match(ticker.bot, /AI·Warfarin/, ticker.bot);
      assert.match(ticker.human, /华法琳/, ticker.human);
      assert.match(ticker.nameless, /AI·华法琳/, 'no marker, no translation');

      assert.equal(await request(page, 'room.start', {}), 'ok');
      await page.waitForSelector('.brief-ready__pips i', { timeout: 30000 });
      const titles = await page.$$eval('.brief-ready__pips i', (els) => els.map((e) => e.title));
      assert.ok(titles.includes('华法琳'), `briefing: ${titles}`);
      assert.ok(titles.includes('AI·Warfarin'), `briefing: ${titles}`);
      assert.ok(!titles.includes('AI·华法琳'), `briefing: ${titles}`);
    } finally {
      await ctx.close();
    }
  });

  test('Chinese page: everything stays as the server sent it', async () => {
    const { ctx, page } = await open('zh');
    try {
      assert.equal(await request(page, 'room.create', { mode: 'coop', difficulty: 'NORMAL' }), 'ok');
      await page.waitForSelector('.room-screen .rs-go', { visible: true, timeout: 15000 });
      assert.equal(await request(page, 'room.addBot', {}), 'ok');
      await page.waitForSelector('.room-screen .rseat.is-bot .seat__name', { timeout: 15000 });
      const seats = await plates(page);
      assert.equal(seats.find((s) => s.bot).name, 'AI·华法琳');
      assert.equal(seats.find((s) => !s.bot).name.replace(/你$/, ''), '华法琳');
    } finally {
      await ctx.close();
    }
  });
});
