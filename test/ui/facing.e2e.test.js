// The facing wheel's keyboard in the mock match (headless Chrome, the DOM field — no art / WebGL needed): GitHub #394 /
// PR #395 (the drag / Tab flow of this file is the PR's, by @Xinglan233). Enter follows the focus while the wheel is
// open — the wheel takes the focus when it opens, so arrows + Enter confirm (also with a HUD button focused before the
// drop); Tab reaches ✕ first and Enter on it cancels; Enter on any other button (准备, 设置 …) does nothing; Esc cancels.
// Unit side: test/ui/feedback5-hotkeys.test.js (facingEnter).
// SP_E2E=1 CHROME_PATH=/path/to/chrome node --test test/ui/facing.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('facing wheel keyboard (mock match, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  async function setup(t) {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.setViewport({ width: 1920, height: 1080 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/dev/game-mock.html?shot=1&render=fallback&phase=PREP`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.ff-piece');
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__MOCK__.S().priv)));
    const moves = () => page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([type]) => type === 'g.move'));
    const sent = () => page.evaluate(() => globalThis.__MOCK__.S().requests.map(([type]) => type));
    const initial = await state();
    // room under the deploy cap (sell a board operator through the underframe), then a free legal tile
    const sell = initial.board.find((p) => p.kind === 'chess' && !p.golden);
    await page.click(`.ff-piece[data-uid="${sell.uid}"]`);
    await page.waitForSelector('.uframe__btn--sell');
    await page.click('.uframe__btn--sell');
    await page.waitForFunction((uid) => !globalThis.__MOCK__.S().priv.board.some((p) => p.uid === uid), {}, sell.uid);
    const ready = await state();
    const piece = ready.hand.find((p) => p?.kind === 'chess');
    const tile = [[9, 9], [9, 8], [12, 6], [11, 7], [10, 7], [9, 7]].find(([r, c]) => !ready.board.some((p) => p.row === r && p.col === c));
    assert.ok(piece && tile, 'an operator and a free legal tile exist');
    const center = (sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const open = async () => {
      const from = await center(`.ff-piece[data-uid="${piece.uid}"]`);
      const to = await center(`.ff-tile[data-row="${tile[0]}"][data-col="${tile[1]}"]`);
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(from.x + 20, from.y, { steps: 4 }); // a drag also when the piece re-orients on its own tile
      await page.mouse.move(to.x, to.y, { steps: 12 }); await sleep(80); await page.mouse.up();
      await page.waitForSelector('.fwheel__dia');
      await sleep(200);
    };
    const preview = async (key) => {
      await page.keyboard.press(key);
      await page.waitForSelector(`.fwheel.is-${key.slice(5).toLowerCase()}`);
    };
    const active = () => page.evaluate(() => {
      const a = document.activeElement;
      return { wheel: !!a?.matches('.fwheel'), cancel: !!a?.closest('.fwheel__cancel'), button: a?.tagName === 'BUTTON' && !a.closest('.fwheel'), cls: a?.className || a?.tagName };
    });
    const tabUntil = async (want) => {
      for (let i = 0; i < 80; i++) {
        if (want(await active())) return;
        await page.keyboard.press('Tab');
      }
      assert.fail('Tab never reached the wanted element');
    };
    const isOpen = () => page.evaluate(() => !!document.querySelector('.fwheel'));
    const closed = async () => { await page.waitForFunction(() => !document.querySelector('.fwheel')); await sleep(150); };
    return { page, state, moves, sent, errors, ready, piece, tile, open, preview, active, tabUntil, isOpen, closed };
  }

  test('the wheel takes the focus: arrows + Enter confirm once in all four directions', async (t) => {
    const h = await setup(t);
    for (const dir of ['UP', 'RIGHT', 'DOWN', 'LEFT']) {
      await h.open();
      assert.equal((await h.active()).wheel, true, 'the wheel has the focus when it opens');
      await h.page.keyboard.press('Enter');
      await sleep(150);
      assert.equal(await h.isOpen(), true, 'Enter with no direction previewed does nothing');
      await h.preview(`Arrow${dir[0] + dir.slice(1).toLowerCase()}`);
      const count = (await h.moves()).length;
      await h.page.keyboard.press('Enter');
      await h.closed();
      assert.equal((await h.moves()).length, count + 1, 'one intent per confirmation');
      assert.deepEqual((await h.moves()).at(-1)[1].dir, dir);
      const board = (await h.state()).board.filter((p) => p.uid === h.piece.uid);
      assert.deepEqual([board.length, board[0].row, board[0].col, board[0].dir], [1, ...h.tile, dir]);
    }
    assert.deepEqual(h.errors, []);
  });

  test('Tab reaches ✕ first and Enter on it cancels; Esc cancels; Space on ✕ stays swallowed', async (t) => {
    const h = await setup(t);
    await h.open();
    await h.preview('ArrowRight');
    await h.page.keyboard.press('Tab');
    assert.equal((await h.active()).cancel, true, 'the first Tab from the wheel lands on ✕');
    await h.page.keyboard.press('Space');
    await sleep(150);
    assert.equal(await h.isOpen(), true, 'Space does not activate the focused ✕ (no ready / shop keys while choosing)');
    await h.page.keyboard.press('Enter');
    await h.closed();
    assert.deepEqual(await h.moves(), [], 'cancelling sends no deployment');
    assert.deepEqual(await h.state(), h.ready, 'the operator stays where it was');
    await h.open();
    await h.preview('ArrowLeft');
    await h.page.keyboard.press('Escape');
    await h.closed();
    assert.deepEqual(await h.moves(), []);
    assert.deepEqual(h.errors, []);
  });

  test('Enter on another focused button (准备, 设置 …) does nothing while the wheel is open', async (t) => {
    const h = await setup(t);
    await h.open();
    await h.preview('ArrowRight');
    const before = await h.sent();
    // walk the focus past ✕ to the HUD behind the wheel: every button reached gets an Enter
    const seen = new Set();
    for (let i = 0; i < 80 && seen.size < 6; i++) {
      await h.page.keyboard.press('Tab');
      const a = await h.active();
      if (!a.button || seen.has(a.cls)) continue;
      seen.add(a.cls);
      await h.page.keyboard.press('Enter');
      await sleep(120);
      assert.equal(await h.isOpen(), true, `Enter on ${a.cls} keeps the wheel open`);
      assert.equal(await h.page.evaluate(() => !!document.querySelector('.modal')), false, `Enter on ${a.cls} opens nothing`);
    }
    assert.ok(seen.size >= 2, `Tab reached HUD buttons behind the wheel (${[...seen].join(' | ')})`);
    assert.ok([...seen].some((c) => /readybtn|gm__gear/.test(c)), '准备 or 设置 among them');
    assert.deepEqual(await h.sent(), before, 'no intent of any kind (no g.move, no ready, no shop)');
    assert.equal((await h.state()).ready, h.ready.ready, 'still not ready');
    await h.page.keyboard.press('Escape');
    await h.closed();
    assert.deepEqual(await h.moves(), []);
    assert.deepEqual(h.errors, []);
  });

  test('a HUD button focused before the drop does not swallow the confirming Enter', async (t) => {
    const h = await setup(t);
    await h.page.focus('.gm__gear');
    await h.open();
    assert.equal((await h.active()).wheel, true);
    await h.preview('ArrowDown');
    await h.page.keyboard.press('Enter');
    await h.closed();
    assert.equal((await h.moves()).length, 1);
    assert.equal(await h.page.evaluate(() => !!document.querySelector('.modal')), false, 'the settings did not open');
    assert.deepEqual(h.errors, []);
  });
});
