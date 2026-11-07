// (fork) match chat in a real browser: a page in a co-op match beside WebSocket teammates and a spectator. CHAT_SHOT=<dir>
// also saves what it looks like, on desktop and on a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { seedReleaseRead } from '../helpers/releaseNotes.js';

const chrome = process.env.CHROME_PATH;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('typing, the counter, bubbles, escaping, hotkeys and mute', { skip: process.env.SP_E2E !== '1' || !chrome || !existsSync(chrome), timeout: 120000 }, async () => {
  const { startServer } = await import('../../server/index.js');
  const { TestClient } = await import('../helpers/wsClient.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, botRehearsal: 0 });
  const clients = [];
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--no-proxy-server', `--explicitly-allowed-ports=${srv.port}`] });
  const shot = async (page, name) => { if (process.env.CHAT_SHOT) await page.screenshot({ path: `${process.env.CHAT_SHOT}/${name}.png` }); };
  try {
    const client = async (name) => { const c = await TestClient.connect(srv.url.replace('http', 'ws') + '/ws'); clients.push(c); c.id = (await c.hello(name)).playerId; return c; };
    const host = await client('Host');
    await host.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const room = [...srv.lobby.rooms.values()][0];
    const watcher = await client('Watcher');
    await watcher.request({ t: 'room.spectate', code: room.code });

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1280, height: 720 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('sp.name', 'Doctor');
      localStorage.setItem('sp.pref.lang', JSON.stringify('en'));
      sessionStorage.setItem('sp.entered', '1');
    });
    await seedReleaseRead(page);
    await page.goto(srv.url + '/?lang=en');
    await page.waitForFunction(async () => { const { net } = await import('/js/net.js'); return net.status === 'online'; }, { timeout: 30000 });
    await page.evaluate(async (code) => {
      const { net } = await import('/js/net.js');
      await net.request('room.join', { code });
      await net.request('room.ready', { ready: true });
    }, room.code);
    await host.request({ t: 'room.start' });
    const m = room.match;
    m.startRound(1);
    m.phase = 'PREP';
    m.setDeadline(0);
    m.flush(true);
    const me = m.order.find((p) => p.name === 'Doctor');
    const mate = m.order.find((p) => p.name === 'Host');
    await page.waitForSelector('.ewheel__btn', { timeout: 60000 });

    // round 1: no letters
    const openText = async () => {
      if (!(await page.$('.ewheel__panel'))) await page.click('.ewheel__btn');
      await page.waitForSelector('.ewheel__tab.is-text');
      await page.click('.ewheel__tab.is-text');
    };
    await page.click('.ewheel__btn');
    await page.waitForSelector('.ewheel__item');
    await shot(page, 'emotes-tab');
    await openText();
    await page.waitForSelector('.ewheel__lock');
    assert.equal(await page.$eval('.ewheel__lock', (el) => el.textContent), 'No kills yet. Emotes only.');
    assert.equal(await page.$('.ewheel__item'), null, 'the emotes are behind the switch');
    await shot(page, 'locked');

    // 12 kills: the box stops at 12 letters, and typing presses no hotkeys
    me.chatLeft = 12; me.chatRound = 1; me.dirty(); m.flush(true);
    await page.waitForFunction(() => document.querySelector('.ewheel__tab.is-text .num')?.textContent === '12');
    await page.waitForSelector('.ewheel__input');
    const refreshes = me.stats.refreshes;
    const funds = me.funds;
    await page.focus('.ewheel__input');
    await page.keyboard.type('  red dragon fire breath  ');
    assert.equal(await page.$eval('.ewheel__left', (el) => el.textContent), '0');
    assert.equal(await page.$eval('.ewheel__input', (el) => el.value), '  red dragon f', 'the box itself stops at the limit');
    await shot(page, 'typing');
    assert.equal(me.stats.refreshes, refreshes);
    assert.equal(me.funds, funds);
    assert.equal(me.ready, false, 'the space bar stays in the box');
    host.clearInbox(); watcher.clearInbox();
    await page.keyboard.press('Enter');
    const line = await host.waitFor('m.chat');
    assert.deepEqual({ p: line.p, x: line.x }, { p: me.seat, x: 'red dragon f' });
    assert.equal((await watcher.waitFor('m.chat')).x, 'red dragon f', 'a spectator reads');
    await page.waitForFunction(() => document.querySelector('.cbubble')?.textContent === 'red dragon f');
    assert.equal(me.chatLeft, 0);
    await shot(page, 'sent');
    await page.waitForFunction(() => document.querySelector('.ewheel__tab.is-text .num')?.textContent === '0');

    // every m.private puts the page's count right: a sent line stays spent, a line the server dropped comes back
    const pokePrivate = () => { me.funds += 1; me.dirty(); m.flush(true); };
    const badge = (n) => page.waitForFunction((want) => document.querySelector('.ewheel__tab.is-text .num')?.textContent === want, {}, String(n));
    me.chatLeft = 10; me.dirty(); m.flush(true);
    await badge(10);
    await sleep(3100);
    // a line of nothing but filler: the page does not offer to send it
    await page.waitForSelector('.ewheel__input');
    await page.focus('.ewheel__input');
    for (let i = 0; i < 3; i++) await page.keyboard.sendCharacter(String.fromCodePoint(0x3164));
    assert.equal(await page.$eval('.ewheel__send', (el) => el.disabled), true);
    assert.equal(await page.$eval('.ewheel__left', (el) => el.textContent), '10');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('ab');
    await page.keyboard.press('Enter');
    await badge(8);
    await host.waitFor('m.chat', (f) => f.x === 'ab');
    assert.equal(me.chatLeft, 8);
    pokePrivate();
    await sleep(300);
    await badge(8);
    await sleep(3100);
    me.lastChatAt = m.sched.now(); // the server's cooldown drops the next line, and says nothing
    await page.keyboard.type('xyz');
    await page.keyboard.press('Enter');
    await badge(5);
    await sleep(300);
    assert.equal(me.chatLeft, 8, 'the server dropped it');
    pokePrivate();
    await badge(8);
    me.chatLeft = 0; me.dirty(); m.flush(true);
    await badge(0);

    // a line from a teammate: seen as text, never as markup
    mate.chatLeft = 200; mate.chatRound = 1;
    await host.request({ t: 'g.chat', x: '  <img src=x onerror="window.__xss=1"><b>hi</b>  ' });
    await page.waitForFunction(() => [...document.querySelectorAll('.cbubble')].some((el) => el.textContent.includes('<b>hi</b>')));
    assert.equal(await page.evaluate(() => document.querySelector('.cbubble b, .cbubble img') === null && window.__xss === undefined), true);
    await shot(page, 'teammate');

    // a spectator cannot write
    assert.ok((await watcher.request({ t: 'g.chat', x: 'hello' }).catch((e) => e))?.code, 'refused');

    // muted, with the button beside the teammate's avatar: the line arrives and stays unseen; one for each other human
    assert.equal(await page.$$eval('.team__mute', (els) => els.length), 1);
    await page.click('.team__mute');
    await page.waitForSelector('.team__mute.is-on');
    await shot(page, 'muted');
    await sleep(2600);
    await page.evaluate(async () => { window.__chatSeen = 0; const { net } = await import('/js/net.js'); net.on('m.chat', () => { window.__chatSeen++; }); });
    await host.request({ t: 'g.chat', x: 'muted line' });
    await page.waitForFunction(() => window.__chatSeen === 1);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.cbubble')].some((el) => el.textContent.includes('muted line'))), false);

    await page.click('.team__mute');
    await page.waitForFunction(() => !document.querySelector('.team__mute.is-on'));

    // the switch is remembered, and Esc in the box closes the panel
    me.chatLeft = 5; me.dirty(); m.flush(true);
    await openText();
    await page.waitForSelector('.ewheel__input');
    await page.focus('.ewheel__input');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.ewheel__panel'));

    if (process.env.CHAT_SHOT) {
      me.chatLeft = 40; me.dirty(); m.flush(true);
      await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
      await sleep(1500);
      await openText();
      await page.waitForSelector('.ewheel__input');
      await sleep(3200);
      await host.request({ t: 'g.chat', x: 'a teammate wrote this on a phone' });
      await page.waitForFunction(() => [...document.querySelectorAll('.cbubble')].some((el) => el.textContent.includes('on a phone')));
      await shot(page, 'phone');
    }
    assert.deepEqual(errors, []);
    m.finish({ victory: false, reason: 'test' });
  } finally {
    for (const c of clients) await c.close().catch(() => {});
    await browser.close();
    await srv.close();
  }
});
