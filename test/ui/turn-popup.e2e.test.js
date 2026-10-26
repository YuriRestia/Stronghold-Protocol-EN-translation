// Browser check of the 机变 「轮到你选」 disc (opt-in, needs Chrome, ~40 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/turn-popup.e2e.test.js
//
// Through the dev mock's shared 机变 draft: the pick goes to p4, then back to me (p1) — the disc with the official cube
// shows and leaves; a solo draft shows it (with the 轮到你 sound) as it opens, the same as co-op (the maintainer's
// decision of 2026-10-22); a draft that opens on my turn (solo, and co-op with me first) plays the 机变阶段 banner, then
// the disc and its sound — never both on screen, the disc in ≤ TURN_CUE_WAIT_MS (§35.18's leftover) —, also on the
// server's path from ROUND_START (the round plate, the banner it held back, then the disc; with the draft 2 s, 1.7 s and
// 1 s after the plate: the wait runs from each overlay on screen, not from the turn), while a turn coming round mid-draft
// has it at once; none without the art pack or with reduced motion. Static counterpart:
// test/ui/turn-popup.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('轮到你选 disc (headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  /**
   * The mock's 机变 draft in a fresh context, past the service worker (its own fetches would skip the interception);
   * `noart` fails /assets/ui/ (the CI view), `reduce` asks for reduced motion.
   */
  async function open({ variant = '', noart = false, reduce = false } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width: 1920, height: 1080 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error' && !(noart && /Failed to load resource/.test(m.text()))) problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    // the mock loads more than the default 250 resource entries: room for the sprites' entries the wait below reads
    await page.evaluateOnNewDocument(() => performance.setResourceTimingBufferSize(5000));
    if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (noart) {
      await page.setRequestInterception(true);
      page.on('request', (r) => (/\/assets\/ui\//.test(r.url()) ? r.abort() : r.continue()));
    }
    await page.goto(`${base}/dev/game-mock.html?shot=1&render=fallback&phase=SP_DRAFT${variant ? `&variant=${variant}` : ''}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.spov', { timeout: 30000 });
    if (!noart) await page.waitForFunction(() => performance.getEntriesByType('resource').filter((e) => /effectChoose\//.test(e.name)).length >= 5, { timeout: 15000 });
    await sleep(300);
    return { page, problems, context };
  }

  /** The draft's turn goes to p4, then comes back to me (p1). */
  const myTurnAgain = (page) => page.evaluate(async () => {
    const M = globalThis.__MOCK__;
    M.mutate((s) => { s.pub.sp.turn = 'p4'; }); M.pushPublic();
    await new Promise((r) => setTimeout(r, 300));
    M.mutate((s) => { s.pub.sp.turn = 'p1'; }); M.pushPublic();
  });

  // first: a later page of the same browser was seen getting the sprites past the interception (headless Chrome on
  // Windows), so the CI view is checked before any other page
  test('without the art pack: no disc', async () => {
    const { page, problems, context } = await open({ noart: true });
    await myTurnAgain(page);
    await sleep(500);
    assert.equal(await page.$('[data-testid="turn-popup"]'), null);
    assert.deepEqual(problems, []);
    await context.close();
  });

  test('when the pick comes round to me, the disc with the official cube shows over the cards and leaves', async () => {
    const { page, problems, context } = await open();
    await myTurnAgain(page);
    await page.waitForSelector('[data-testid="turn-popup"]', { timeout: 3000 });
    const s = await page.$eval('[data-testid="turn-popup"]', (el) => ({
      text: el.querySelector('.sptp__text').textContent,
      art: [...el.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length,
      clicks: getComputedStyle(el).pointerEvents,
    }));
    assert.equal(s.text, '轮到你选');
    assert.ok(s.art >= 8, `the official sprites drawn (${s.art})`);
    assert.equal(s.clicks, 'none', 'the cards stay usable under it');
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-popup"]'), { timeout: 3000 });
    assert.deepEqual(problems, []);
    await context.close();
  });

  test('a solo draft: the disc and the 轮到你 sound as it opens, the same as co-op (the maintainer, 2026-10-22)', async () => {
    const { page, problems, context } = await open({ variant: 'solo' });
    await page.evaluate(async () => {
      const { audio } = await import('/js/audio.js');
      globalThis.__sfx = [];
      const sfx = audio.sfx.bind(audio);
      audio.sfx = (name, ...rest) => { globalThis.__sfx.push(name); return sfx(name, ...rest); };
    });
    // a solo turn has no turn order: the next 机变 draft opens (the phase leaves SP_DRAFT, then comes back)
    await page.evaluate(async () => {
      const M = globalThis.__MOCK__;
      M.mutate((s) => { s.pub.phase = 'PREP'; }); M.pushPublic();
      await new Promise((r) => setTimeout(r, 300));
      M.mutate((s) => { s.pub.phase = 'SP_DRAFT'; }); M.pushPublic();
    });
    await page.waitForSelector('[data-testid="turn-popup"]', { timeout: 3000 });
    assert.equal(await page.$eval('[data-testid="turn-popup"] .sptp__text', (e) => e.textContent), '轮到你选');
    assert.ok((await page.evaluate(() => globalThis.__sfx)).includes('yourTurn'), 'the 轮到你 sound in solo too');
    await page.waitForFunction(() => !document.querySelector('[data-testid="turn-popup"]'), { timeout: 3000 });
    // a pick ends it: the next draft's disc comes with the next draft only
    await page.evaluate(() => { globalThis.__sfx.length = 0; globalThis.__MOCK__.mutate((s) => { s.pub.sp.picks = { p1: 0 }; }); globalThis.__MOCK__.pushPublic(); });
    await sleep(500);
    assert.equal(await page.$('[data-testid="turn-popup"]'), null);
    assert.deepEqual(await page.evaluate(() => globalThis.__sfx.filter((n) => n === 'yourTurn')), []);
    assert.deepEqual(problems, []);
    await context.close();
  });

  // the 机变阶段 banner and the disc as a draft opens on my turn: a timeline of what is on screen and which sounds play,
  // from the moment the phase comes back to SP_DRAFT (the dev mock's draft, re-opened through PREP)
  const draftOpens = (page, { solo }) => page.evaluate(async (solo) => {
    const M = globalThis.__MOCK__;
    const { audio } = await import('/js/audio.js');
    const ev = [];
    let t0 = 0;
    const at = () => Math.round(performance.now() - t0);
    const sfx = audio.sfx.bind(audio);
    audio.sfx = (name, ...rest) => { if (t0) ev.push([at(), `sfx:${name}`]); return sfx(name, ...rest); };
    let both = false;
    const seen = { banner: null, disc: false };
    const look = () => {
      const b = document.querySelector('.pbanner'), d = !!document.querySelector('[data-testid="turn-popup"]');
      const title = b?.querySelector('.pbanner__title')?.textContent || null;
      if (title !== seen.banner) { ev.push([at(), title ? `banner:${title}` : 'banner-']); seen.banner = title; }
      if (d !== seen.disc) { ev.push([at(), d ? 'disc+' : 'disc-']); seen.disc = d; }
      if (b && d) both = true;
    };
    const mo = new MutationObserver(look);
    mo.observe(document.body, { childList: true, subtree: true });
    M.mutate((s) => { s.pub.phase = 'PREP'; }); M.pushPublic();
    await new Promise((r) => setTimeout(r, 300));
    t0 = performance.now();
    ev.length = 0;
    seen.banner = null;
    M.mutate((s) => { s.pub.phase = 'SP_DRAFT'; if (!solo) s.pub.sp.turn = 'p1'; }); M.pushPublic();
    await new Promise((r) => setTimeout(r, 3600));
    // mid-draft (co-op): the turn goes to p4, then comes back to me — no banner, the disc at once
    let back = null;
    if (!solo) {
      M.mutate((s) => { s.pub.sp.turn = 'p4'; }); M.pushPublic();
      await new Promise((r) => setTimeout(r, 300));
      back = at();
      M.mutate((s) => { s.pub.sp.turn = 'p1'; }); M.pushPublic();
      await new Promise((r) => setTimeout(r, 1800));
    }
    mo.disconnect();
    return { ev, both, back };
  }, solo);

  for (const solo of [true, false]) {
    test(`${solo ? 'solo' : 'co-op, my turn first'}: as the draft opens, the 机变阶段 banner, then the disc and its sound (never both on screen)`, async () => {
      const { TURN_CUE_WAIT_MS, TURN_POPUP_MS } = await import('../../public/js/ui/turnPopup.js');
      const { page, problems, context } = await open({ variant: solo ? 'solo' : '' });
      await sleep(2200); // the mount's own banner gone
      const { ev, both, back } = await draftOpens(page, { solo });
      const when = (name, from = 0) => ev.find(([t, n]) => n === name && t >= from)?.[0];
      assert.ok(ev.some(([t, n]) => n === 'banner:机变阶段' && t < 300), `the 机变阶段 banner opens the draft ${JSON.stringify(ev)}`);
      const gone = when('banner-');
      const disc = when('disc+');
      const sound = when('sfx:yourTurn');
      assert.equal(both, false, `the disc never under the banner ${JSON.stringify(ev)}`);
      assert.ok(gone != null && disc != null && disc >= gone, `the disc after the banner ${JSON.stringify(ev)}`);
      assert.ok(disc <= TURN_CUE_WAIT_MS + 400, `the disc in ≤ ${TURN_CUE_WAIT_MS} ms (+ slack): ${disc} ms`);
      assert.ok(sound != null && sound >= gone - 50 && Math.abs(sound - disc) < 200, `the 轮到你 sound with the disc ${JSON.stringify(ev)}`);
      assert.ok(ev.filter(([, n]) => n === 'sfx:yourTurn').length >= 1);
      const left = when('disc-', disc);
      assert.ok(left != null && left - disc <= TURN_POPUP_MS + 400, `the disc leaves after ~${TURN_POPUP_MS} ms ${JSON.stringify(ev)}`);
      if (!solo) {
        const again = when('disc+', back);
        assert.ok(again != null && again - back < 600, `mid-draft the disc comes at once ${JSON.stringify(ev)}`);
        assert.equal(ev.filter(([t, n]) => t >= back && n.startsWith('banner:')).length, 0, 'no banner mid-draft');
      }
      assert.deepEqual(problems, []);
      await context.close();
    });
  }

  // the server's own path (server/match/match/phases.js afterRoundStart): ROUND_START with the round plate, then SP_DRAFT
  // on my turn DELAYS.ROUND_START (2 s) later — or sooner (1.7 s, 1 s), standing in for a plate that mounted late (a slow
  // phone, render lag, network jitter). The plate holds the 机变阶段 banner back, so the disc waits for the plate, then the
  // banner: a timeline of the plate, the banner (while leaving too: .pbanner stays until it is gone) and the disc
  const fromRoundStart = (page, { gap, solo }) => page.evaluate(async (gap, solo) => {
    const M = globalThis.__MOCK__;
    const ev = [];
    const t0 = performance.now();
    const at = () => Math.round(performance.now() - t0);
    const both = [];
    const seen = { plate: false, banner: null, disc: false };
    const look = () => {
      const p = !!document.querySelector('[data-testid="round-popup"]');
      const b = document.querySelector('.pbanner'), d = !!document.querySelector('[data-testid="turn-popup"]');
      const title = b ? (b.querySelector('.pbanner__title')?.textContent || '?') + (b.classList.contains('is-leaving') ? ' (leaving)' : '') : null;
      if (p !== seen.plate) { ev.push([at(), p ? 'plate+' : 'plate-']); seen.plate = p; }
      if (title !== seen.banner) { ev.push([at(), title ? `banner:${title}` : 'banner-']); seen.banner = title; }
      if (d !== seen.disc) { ev.push([at(), d ? 'disc+' : 'disc-']); seen.disc = d; }
      if (d && (p || b)) both.push([at(), p ? 'plate' : title]);
    };
    const mo = new MutationObserver(look);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    M.mutate((s) => { s.pub.phase = 'ROUND_START'; s.pub.round = 3; }); M.pushPublic();
    await new Promise((r) => setTimeout(r, gap));
    const draftAt = at();
    M.mutate((s) => { s.pub.phase = 'SP_DRAFT'; if (!solo) s.pub.sp.turn = 'p1'; }); M.pushPublic();
    await new Promise((r) => setTimeout(r, 5200));
    mo.disconnect();
    return { ev, both, draftAt };
  }, gap, solo);

  for (const [gap, solo] of [[2000, false], [1700, false], [1000, true]]) {
    test(`from ROUND_START (${solo ? 'solo' : 'co-op, my turn first'}, SP_DRAFT ${gap} ms after it): the round plate, the 机变阶段 banner, then the disc — never two at once`, async (t) => {
      const { TURN_CUE_WAIT_MS } = await import('../../public/js/ui/turnPopup.js');
      const { page, problems, context } = await open({ variant: solo ? 'solo' : '' });
      await sleep(2200); // the mount's own banner gone
      const { ev, both, draftAt } = await fromRoundStart(page, { gap, solo });
      t.diagnostic(`SP_DRAFT at ${draftAt}: ${JSON.stringify(ev)}`);
      const when = (name, from = 0) => ev.find(([t, n]) => n === name && t >= from)?.[0];
      const plateIn = when('plate+'), plateOut = when('plate-');
      assert.ok(plateIn != null && plateIn < 300, `the round plate opens the round ${JSON.stringify(ev)}`);
      assert.ok(when('banner:机变阶段') != null && when('banner:机变阶段') >= plateOut, `the 机变阶段 banner after the plate ${JSON.stringify(ev)}`);
      const gone = when('banner-', plateOut);
      const disc = when('disc+');
      assert.deepEqual(both, [], `the disc never with the plate or the banner, leaving included ${JSON.stringify(ev)}`);
      assert.ok(gone != null && disc != null && disc >= gone, `the disc after the banner is gone ${JSON.stringify(ev)}`);
      assert.ok(disc >= draftAt, `the disc with the draft only ${JSON.stringify(ev)}`);
      // the wait counts from the banner on screen (after the plate), not from the turn
      assert.ok(disc - plateOut <= TURN_CUE_WAIT_MS + 400, `the disc ≤ ${TURN_CUE_WAIT_MS} ms (+ slack) after the plate: ${disc - plateOut} ms ${JSON.stringify(ev)}`);
      assert.deepEqual(problems, []);
      await context.close();
    });
  }

  test('reduced motion: no disc', async () => {
    const { page, problems, context } = await open({ reduce: true });
    await myTurnAgain(page);
    await sleep(500);
    assert.equal(await page.$('[data-testid="turn-popup"]'), null);
    assert.deepEqual(problems, []);
    await context.close();
  });
});
