// Browser E2E of the 时装 / Outfits view of the 干员调配 overlay (fork feature, docs/OUTFITS.md) against the real server,
// headless Chrome / Edge (puppeteer-core). Opt-in: SP_E2E=1 [CHROME_PATH=…] node --test test/ui/outfits.e2e.test.js
// The switch above the detail header, the cards (默认 + the operator's outfits), wearing one (the header portrait and the
// row avatar switch to it, the choice persists and reaches the server's room.state), the artwork and the sprite preview.
// Screenshots go to test/e2e/out/outfits-*.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const MLYNAR_CHESS = 'chess_char_5_19_a';
const MLYNAR = 'char_4064_mlynar@epoque#28';

describe('时装 / Outfits view (real server, headless browser)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv, browser, base;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  test('switch → outfit cards → wear W Dali: header, row and room.state follow; artwork + sprite shown; persisted', async () => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('sp.name', 'Outfits');
      localStorage.setItem('sp.pref.lang', '"en"');
      sessionStorage.setItem('sp.entered', '1');
    });
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'), { timeout: 30000 });
    await page.click('.lobby-screen [data-testid="loadout-open"]');
    // the row of Młynar (its id is the chess id), then the switch
    const row = `[data-chess="${MLYNAR_CHESS}"]`;
    await page.waitForSelector(row, { timeout: 20000 });
    await page.click(`${row} .lo-card__name, ${row}`);
    await page.waitForSelector('[data-testid="outfit-switch-outfit"]', { visible: true });
    const headBefore = await page.$eval('.lo-dhead__art img', (i) => i.getAttribute('src'));
    const rowBefore = await page.$eval(`${row} img`, (i) => i.getAttribute('src'));
    await page.click('[data-testid="outfit-switch-outfit"]');
    await page.waitForSelector('[data-testid="outfit-panel"] .ofit-card[data-outfit="default"]', { timeout: 10000 });
    await page.waitForSelector(`[data-outfit="${MLYNAR}"]`, { timeout: 10000 });
    const cards = await page.$$eval('.ofit-card', (els) => els.map((e) => ({ id: e.dataset.outfit, on: e.classList.contains('is-on'), name: e.querySelector('.ofit-card__name')?.textContent })));
    assert.equal(cards[0].id, 'default');
    assert.ok(cards[0].on, '默认 worn by default');
    assert.ok(cards.length >= 3, `Młynar has outfits: ${JSON.stringify(cards)}`);
    assert.equal(cards.find((c) => c.id === MLYNAR).name, 'W Dali', 'the official EN name');
    // the default card previews the E2 artwork
    assert.match(await page.$eval('.ofit-art img', (i) => i.getAttribute('src')), /char_4064_mlynar_default\.webp$/);
    await page.screenshot({ path: path.join(OUT, 'outfits-default.png') });
    // wear W Dali
    await page.click(`[data-outfit="${MLYNAR}"]`);
    await page.waitForFunction((id) => document.querySelector(`[data-outfit="${id}"]`)?.classList.contains('is-on'), {}, MLYNAR);
    await page.waitForFunction(() => /char_4064_mlynar_epoque_28\.webp$/.test(document.querySelector('.ofit-art img')?.getAttribute('src') || ''), { timeout: 5000 });
    // no hover preview (2026-10-12): hovering another card leaves the worn outfit's artwork
    await page.hover('.ofit-card[data-outfit="default"]');
    await new Promise((r) => setTimeout(r, 200));
    assert.match(await page.$eval('.ofit-art img', (i) => i.getAttribute('src')), /char_4064_mlynar_epoque_28\.webp$/, 'hover changes nothing');
    // the switch carries no count
    assert.equal((await page.$eval('[data-testid="outfit-switch-outfit"]', (b) => b.textContent)).replace(/\D/g, ''), '');
    await page.waitForFunction(() => !!document.querySelector('.ofit-sprite canvas'), { timeout: 20000 });
    // the sprite's canvas fills its box
    const fit = await page.$eval('.ofit-sprite', (el) => { const c = el.querySelector('canvas').getBoundingClientRect(), b = el.getBoundingClientRect(); return { cw: c.width, ch: c.height, bw: b.width, bh: b.height }; });
    assert.ok(Math.abs(fit.cw - fit.bw) <= 3 && Math.abs(fit.ch - fit.bh) <= 3, `canvas ${fit.cw}×${fit.ch} in box ${fit.bw}×${fit.bh}`);
    // the artwork opens full size
    await page.click('[data-testid="outfit-art"]');
    await page.waitForSelector('[data-testid="outfit-art-viewer"] img', { visible: true, timeout: 5000 });
    // the whole artwork fits (no part cropped by the dialog)
    const vb = await page.$eval('[data-testid="outfit-art-viewer"]', (el) => { const i = el.querySelector('img').getBoundingClientRect(), b = el.closest('.modal__body').getBoundingClientRect(); return { it: i.top, ib: i.bottom, bt: b.top, bb: b.bottom }; });
    assert.ok(vb.it >= vb.bt - 1 && vb.ib <= vb.bb + 1, `viewer art ${vb.it}–${vb.ib} inside ${vb.bt}–${vb.bb}`);
    await page.screenshot({ path: path.join(OUT, 'outfits-viewer.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="outfit-art-viewer"]'), { timeout: 5000 });
    const headAfter = await page.$eval('.lo-dhead__art img', (i) => i.getAttribute('src'));
    const rowAfter = await page.$eval(`${row} img`, (i) => i.getAttribute('src'));
    assert.notEqual(headAfter, headBefore);
    assert.match(headAfter, /\/assets\/outfit\/portrait\/char_4064_mlynar_epoque_28\.png$/, 'the header portrait');
    assert.notEqual(rowAfter, rowBefore);
    assert.match(rowAfter, /\/assets\/outfit\/avatar\/char_4064_mlynar_epoque_28\.png$/, 'the row avatar');
    await page.screenshot({ path: path.join(OUT, 'outfits-worn.png') });
    // persisted, and the server took it (the next room.state of a room carries it)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.outfits')));
    assert.deepEqual(stored.outfits, { char_4064_mlynar: MLYNAR });
    await page.waitForFunction(() => globalThis.__SP__ && document.querySelector('.lo') && true);
    // back to the loadout body
    await page.click('[data-testid="outfit-switch-loadout"]');
    await page.waitForSelector('.lo-detail__body .lo-skills', { timeout: 5000 });
    const bad = problems.filter((p) => !/fonts\.(googleapis|gstatic)|favicon/.test(p));
    assert.deepEqual(bad, [], 'no page errors');
    await ctx.close();
  });

  test('自选编队: the picker lists the outfits of the operator being picked; wearing one there dresses the slot', async () => {
    const SIEGE = 'char_112_siege';
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('sp.name', 'Outfits');
      localStorage.setItem('sp.pref.lang', '"en"');
      sessionStorage.setItem('sp.entered', '1');
    });
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'), { timeout: 30000 });
    await page.click('.lobby-screen [data-testid="loadout-open"]');
    await page.waitForSelector('.lo .lo-tab[data-tab="diy"]', { visible: true, timeout: 20000 });
    await page.click('.lo .lo-tab[data-tab="diy"]');
    await page.click('.diy-slot[data-slot="chess_char_5_diy1_a"] .diy-slot__fill');
    await page.waitForSelector('[data-testid="diy-picker"]', { visible: true, timeout: 8000 });
    await page.click(`[data-testid="diy-picker"] .diy-opt[data-char="${SIEGE}"]`);
    await page.waitForSelector('[data-testid="diy-pick-outfits"] .ofit-card[data-outfit="default"]', { visible: true, timeout: 10000 });
    const ids = await page.$$eval('[data-testid="diy-pick-outfits"] .ofit-card', (els) => els.map((e) => e.dataset.outfit));
    assert.ok(ids.length >= 3 && ids[0] === 'default', `Siege's cards: ${ids}`);
    // wear one in the picker: at once, before the pick is confirmed
    await page.click(`[data-testid="diy-pick-outfits"] .ofit-card[data-outfit="${ids[1]}"]`);
    await page.waitForFunction((id) => document.querySelector(`[data-testid="diy-pick-outfits"] [data-outfit="${id}"]`)?.classList.contains('is-on'), {}, ids[1]);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.outfits')));
    assert.equal(stored.outfits[SIEGE], ids[1]);
    await page.screenshot({ path: path.join(OUT, 'outfits-diy-picker.png') });
    // 预览 opens the full panel over the picker; Esc closes only it
    await page.click('[data-testid="diy-pick-outfit-preview"]');
    await page.waitForSelector('.ofit-dialog [data-testid="outfit-panel"]', { visible: true, timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.ofit-dialog'), { timeout: 5000 });
    assert.ok(await page.$('[data-testid="diy-picker"]'), 'the picker stays open');
    // confirm: the slot shows the outfit's portrait
    await page.click('[data-testid="diy-confirm"]');
    await page.waitForSelector('[data-testid="diy-picker"]', { hidden: true, timeout: 3000 });
    const art = await page.$eval(`.diy-slot[data-char="${SIEGE}"] .diy-slot__art img`, (i) => i.getAttribute('src'));
    assert.match(art, /\/assets\/outfit\/portrait\//, `the slot's portrait: ${art}`);
    assert.deepEqual(problems, [], 'no page errors');
    await ctx.close();
  });
});
