// Browser check of the in-match 观战席 capsule (GitHub #120, PR #120 by @salt-fishes; opt-in, ~10 s) on the in-match mock
// harness (public/dev/game-mock.html):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/spectator-roster.e2e.test.js
//
// The room screen lists the spectator seats and lets the host remove one, but the route after 开始 is the game screen: a
// running match showed nothing of them. Now the top bar carries a capsule beside the latency — an eye and how many are
// watching, nothing at all while the room has no spectator; a tap opens the roster (names, an offline mark, the host's ✕ on
// every row: room.removeSpectator). Asserted: no capsule without spectators (and none in the default mock), the count and
// the rows, the ✕ only for the host, the request the ✕ sends, the roster and the count following the room.state that
// comes back, the capsule gone with the last seat, and the roster closing with Esc / 关闭. No console error. The server side
// (the seat freed at any time, room.closed {kicked}, no frame after it) is test/lobby.test.js and test/match/lobby-integration.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the 观战席 capsule of the match top bar', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  async function open(query) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/dev/game-mock.html?render=fallback&${query}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.gtop', { timeout: 15000 });
    await sleep(400);
    return { page, problems };
  }
  const pill = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-testid="spectators"]');
    return el ? { text: el.textContent.trim(), me: el.classList.contains('is-me') } : null;
  });
  const roster = (page) => page.evaluate(() => {
    const ul = document.querySelector('[data-testid="spectator-roster"]');
    if (!ul) return null;
    return [...ul.querySelectorAll('li')].map((li) => ({
      name: li.querySelector('.spec__name')?.textContent.trim(), offline: li.classList.contains('is-offline'), remove: !!li.querySelector('[data-testid="spectator-remove"]'),
    }));
  });
  const requests = (page) => page.evaluate(() => globalThis.__MOCK__.S().requests.filter((r) => r[0] === 'room.removeSpectator'));

  test('no spectator, no capsule: the default match top bar is as it was', async () => {
    const { page, problems } = await open('phase=COMBAT');
    assert.equal(await pill(page), null);
    assert.ok(await page.$('.gtop__net .ping'), 'the latency pill is still there');
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('the host: the capsule counts the seats, the roster lists them with a ✕ each, removing one updates both, the last one removes the capsule', async () => {
    const { page, problems } = await open('phase=COMBAT&variant=spectators');
    assert.deepEqual(await pill(page), { text: '2', me: false }, 'an eye and the count');
    assert.ok(await page.$('.gtop__net [data-testid="spectators"]'), 'beside the latency pill');
    assert.equal(await roster(page), null, 'closed until asked');
    await page.click('[data-testid="spectators"]');
    await page.waitForSelector('[data-testid="spectator-roster"]', { timeout: 5000 });
    assert.deepEqual(await roster(page), [
      { name: '观战者甲', offline: false, remove: true }, { name: '观战者乙', offline: true, remove: true },
    ]);
    // ✕ on the first row: room.removeSpectator { playerId } goes out, the room.state that follows takes the row away
    await page.click('[data-testid="spectator-roster"] li:first-child [data-testid="spectator-remove"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="spectator-roster"] li').length === 1, { timeout: 5000 });
    assert.deepEqual(await requests(page), [['room.removeSpectator', { playerId: 'sp_1' }]]);
    assert.deepEqual((await roster(page)).map((r) => r.name), ['观战者乙']);
    assert.equal((await pill(page)).text, '1');
    // Esc closes the roster, the capsule stays
    await page.keyboard.press('Escape');
    await sleep(250);
    assert.equal(await roster(page), null);
    assert.equal((await pill(page)).text, '1');
    // the last seat: the open roster and the capsule go with it
    await page.click('[data-testid="spectators"]');
    await page.waitForSelector('[data-testid="spectator-roster"]', { timeout: 5000 });
    await page.click('[data-testid="spectator-remove"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="spectators"]') && !document.querySelector('.modal'), { timeout: 5000 });
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('a player who is not the host sees the roster but no ✕; 关闭 closes it', async () => {
    const { page, problems } = await open('phase=COMBAT&variant=spectators,notHost');
    assert.equal((await pill(page)).text, '2');
    await page.click('[data-testid="spectators"]');
    await page.waitForSelector('[data-testid="spectator-roster"]', { timeout: 5000 });
    assert.deepEqual((await roster(page)).map((r) => r.remove), [false, false], 'only the host removes');
    assert.match(await page.evaluate(() => document.querySelector('.modal')?.textContent ?? ''), /创建者可以把观战者移出/);
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /关闭/.test(b.textContent))?.click());
    await sleep(250);
    assert.equal(await roster(page), null);
    assert.deepEqual(await requests(page), []);
    assert.deepEqual(problems, []);
    await page.close();
  });
});
