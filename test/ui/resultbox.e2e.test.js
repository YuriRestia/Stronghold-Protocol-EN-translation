// Browser checks of the round's result box at settlement (ResultDialog; GitHub #235, PR #112 by @Convey123) on the
// in-match mock harness (public/dev/game-mock.html):
//   SP_E2E=1 node --test test/ui/resultbox.e2e.test.js   → screenshots in test/e2e/out/resultbox-*.png
//
// The box wears the official dialog's words only (the owner's review of PR #112): title 作战结束, then the LP THIS
// player was charged — 全员无伤！ / 生命值减少 −N — after a 联防 the authority's own per-player figure
// (m.public.uniteResult.losses). Asserted: `?phase=SETTLE&variant=unite` pops it for a leaker the helpers saved
// (losses.p1 = 0, nothing got through → 全员无伤！), `unite,through` for the same leaker charged 3 (→ 生命值减少 −3, not
// its own battle's leaks), `unite,through,helper` for a HELPER whose teammate paid (→ the official title alone),
// `unite,dead` for a player not in the round (not in `losses` → no box at all); driving the harness' own COMBAT →
// SETTLE switcher pops the round's own battle's box; the box is big, centred and click-through, closes by itself (and
// leaves the DOM), and no scenario logs a console error. The words are unit-tested in test/ui/gameLogic.test.js, the
// per-player charge server-side in test/match/playtest6-matchflow.test.js (#235).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('settlement result box in the browser', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** A mock page; `seen()` tells whether a result box was EVER in the DOM (it closes by itself after ~3 s). */
  async function open(query, { w = 1920, h = 1080 } = {}) {
    const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    await page.setViewport({ width: w, height: h });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
    await page.evaluateOnNewDocument(() => {
      globalThis.__rdSeen = 0;
      new MutationObserver(() => { if (document.querySelector('.rdialog')) globalThis.__rdSeen++; })
        .observe(document, { subtree: true, childList: true });
    });
    // not networkidle0: the box opens when the screen mounts and is gone ~3 s later, art may still be loading then
    await page.goto(`${base}/dev/game-mock.html?render=fallback&${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)'), { timeout: 15000 });
    return { page, problems, seen: () => page.evaluate(() => globalThis.__rdSeen > 0) };
  }

  /** The box as the player sees it: words + where it sits + how it behaves. */
  const boxState = (page) => page.evaluate(() => {
    const el = document.querySelector('.rdialog');
    if (!el) return null;
    const box = el.querySelector('.rdialog__box');
    const b = box.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    return {
      classes: el.className,
      title: el.querySelector('.rdialog__title').textContent,
      sub: el.querySelector('.rdialog__sub')?.textContent ?? '',
      micro: el.querySelector('.rdialog__micro')?.textContent ?? '',
      chevrons: el.querySelectorAll('.rdialog__chev').length,
      ticks: el.querySelectorAll('.rdialog__tick').length,
      titlePx: parseFloat(getComputedStyle(el.querySelector('.rdialog__title')).fontSize),
      pointerEvents: getComputedStyle(el).pointerEvents,
      centerX: Math.round(b.left + b.width / 2 - vw / 2),
      centerY: Math.round(b.top + b.height / 2 - vh / 2),
      visible: b.width > 300 && b.height > 90,
    };
  });

  test('the official dialog: 作战结束 + this player\'s own LP after a 联防 — and none for a player not in the round', async () => {
    const { page, problems } = await open('shot=1&phase=SETTLE&variant=unite');
    await page.waitForSelector('.rdialog', { timeout: 10000 });
    const ok = await boxState(page);
    // the mock's player p1 leaked and the helpers stopped every enemy: nothing got through, nobody was charged
    assert.equal(ok.title, '作战结束', JSON.stringify(ok));
    assert.equal(ok.sub, '全员无伤！', 'the official line for this player\'s own LP, and nothing else');
    assert.match(ok.micro, /BATTLE OVER/);
    assert.ok(ok.classes.includes('rdialog--mint'), `the held tone: ${ok.classes}`);
    assert.equal(ok.chevrons, 2);
    assert.equal(ok.ticks, 4);
    assert.ok(ok.titlePx >= 40, `a BIG box, not a line of small print (title ${ok.titlePx}px)`);
    assert.ok(ok.visible, 'a real plate, not a hairline');
    assert.ok(Math.abs(ok.centerX) <= 2 && Math.abs(ok.centerY) <= 2, `centred (off by ${ok.centerX},${ok.centerY})`);
    assert.equal(ok.pointerEvents, 'none', 'the settlement stays clickable under it');
    await sleep(700); // the opening wipe done: the whole plate on the screenshot
    await page.screenshot({ path: path.join(OUT, 'resultbox-unite-held.png') });
    assert.deepEqual(problems, []);
    await page.close();

    // 3 got through and p1 was charged 3: the LP settlement charged (not its own battle's leaks), no verdict line
    const t = await open('shot=1&phase=SETTLE&variant=unite,through');
    await t.page.waitForSelector('.rdialog', { timeout: 10000 });
    const bad = await boxState(t.page);
    assert.equal(bad.title, '作战结束');
    assert.equal(bad.sub, '生命值减少 −3', 'this player\'s own LP, from the authority');
    assert.ok(bad.classes.includes('rdialog--red'), `the loss tone: ${bad.classes}`);
    await sleep(700); // the opening wipe done: the whole plate on the screenshot
    await t.page.screenshot({ path: path.join(OUT, 'resultbox-unite-through.png') });
    assert.deepEqual(t.problems, []);
    await t.page.close();

    // p1 HELPED: the 联防 leaked and a teammate was charged 4 while p1 paid nothing — 全员无伤！ would be false for that
    // teammate and the official dialog has no other line, so the box keeps the official title alone
    const hp = await open('shot=1&phase=SETTLE&variant=unite,through,helper');
    await hp.page.waitForSelector('.rdialog', { timeout: 10000 });
    const spared = await boxState(hp.page);
    assert.equal(spared.title, '作战结束');
    assert.equal(spared.sub, '', 'no 全员无伤！ while a teammate was charged');
    assert.ok(spared.classes.includes('rdialog--orange'), `spared tone: ${spared.classes}`);
    await sleep(700); // the opening wipe done: the whole plate on the screenshot
    await hp.page.screenshot({ path: path.join(OUT, 'resultbox-unite-helper-spared.png') });
    assert.deepEqual(hp.problems, []);
    await hp.page.close();

    // p1 was eliminated before the round: not in `losses` → no box (and no sound), as in a round without 联防
    const d = await open('shot=1&phase=SETTLE&variant=unite,dead');
    await sleep(1500);
    assert.equal(await d.seen(), false, 'no result box for a player not in the round');
    assert.deepEqual(d.problems, []);
    await d.page.close();
  });

  test('every battle gets one: COMBAT → SETTLE through the harness switcher pops the official dialog', async () => {
    const { page, problems } = await open('phase=COMBAT');
    await sleep(600);
    assert.equal(await page.$('.rdialog'), null, 'no box while the battle runs');
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('#mockbar button')].find((b) => b.textContent.trim() === 'SETTLE');
      if (!btn) return false;
      btn.click();
      return true;
    });
    assert.ok(clicked, 'the switcher has a SETTLE button');
    await page.waitForSelector('.rdialog', { timeout: 8000 });
    const own = await boxState(page);
    assert.equal(own.title, '作战结束', `the round's own battle, no 联防: ${JSON.stringify(own)}`);
    assert.equal(own.sub, '全员无伤！');
    assert.ok(own.classes.includes('rdialog--mint'));
    await sleep(700); // the opening wipe done: the whole plate on the screenshot
    await page.screenshot({ path: path.join(OUT, 'resultbox-own-battle.png') });
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('it closes by itself: leaving, then gone (it never blocks the next phase)', async () => {
    const { page, problems } = await open('shot=1&phase=SETTLE&variant=unite');
    await page.waitForSelector('.rdialog', { timeout: 10000 });
    await page.waitForSelector('.rdialog.is-leaving', { timeout: 6000 });
    await page.waitForFunction(() => !document.querySelector('.rdialog'), { timeout: 8000 });
    assert.equal(await page.$('.rdialog'), null, 'and it leaves the DOM after ~3 s');
    assert.deepEqual(problems, []);
    await page.close();
  });
});
