// test/render/patriot.browser.test.js — 爱国者 (the fork's SPA-CC pilot enemy, tools/build-data.mjs FORK_ENEMY_KEYS) drawn
// with its real Spine model in headless Chrome: a battle simulated in Node, fed to the real field view
// (public/dev/render-demo.html) the way the client runner does.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/patriot.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/patriot.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and downloaded assets)';

/** Real frames: 爱国者 walking in towards 薄绿. */
function recordBattle(seconds = 4) {
  const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 600, units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 4 }] });
  h.step();
  const pid = h.spawn('enemy_1506_patrt', { pos: [10, 8], routeIndex: 0 }).id;
  h.step();
  const b = h.b;
  const meta = { ...b.fieldMeta(), stageId: 'act2autochess_m01' };
  b.drainEvents();
  const frames = [];
  const id = () => pid;
  for (let i = 0; i < seconds * 30; i++) {
    b.step();
    const { t, ...rest } = b.snapshot();
    frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev: b.drainEvents(), gt: t });
  }
  return { meta, frames, id };
}

describe('爱国者 in headless Chrome', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--no-first-run'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  test('his Spine model loads (no placeholder) and the page has no errors', async () => {
    const { meta, frames, id } = recordBattle();
    const page = await browser.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      await page.evaluate((meta) => {
        const v = window.__demo.view;
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 1 });
      }, meta);
      for (let i = 0; i < frames.length; i += 30) {
        await page.evaluate(async (chunk) => {
          const v = window.__demo.view;
          for (const f of chunk) {
            if (f.ev.length) v.pushEvents({ t: 'b.ev', fieldId: f.snap.fieldId, gt: f.gt, ev: f.ev });
            v.pushSnapshot(f.snap);
            await new Promise((r) => requestAnimationFrame(() => r()));
          }
        }, frames.slice(i, i + 30));
      }
      await new Promise((r) => setTimeout(r, 1500));
      const state = await page.evaluate((pid) => {
        const u = window.__demo.view.debug.views.get(pid);
        return { has: !!u, spine: !!u?.actor?.spine, placeholder: !!u?._unknown };
      }, id());
      await page.screenshot({ path: path.join(OUT, 'patriot.png') });
      assert.ok(state.has, 'his view exists');
      assert.ok(state.spine, `his Spine model: ${JSON.stringify(state)}`);
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });

  test('the revive: his kneeling clip and an HP bar that refills; then the spear\'s wind-up reticle on a high-ground unit', async () => {
    // 能天使 on the high ground (row 10, col 2), 薄绿 blocking him; KO at 1 s, revive to 61 s, then the spear
    const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 900,
      units: [{ chessId: 'chess_char_3_01_a', row: 10, col: 2 }, { chessId: 'chess_char_3_08_a', row: 10, col: 5 }] });
    h.step();
    const pid = h.spawn('enemy_1506_patrt', { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } }).id;
    h.step();
    const b = h.b;
    for (const u of b.allies()) { b.addBuff(u, { key: 'test:wall', persist: true, mods: { hpFlat: 1e8 } }); u.hp = u.s.maxHp; }
    const meta = { ...b.fieldMeta(), stageId: 'act2autochess_m01' };
    b.drainEvents();
    const frames = [];
    const p = b.enemies.find((e) => e.id === pid);
    let markAt = -1;
    for (let i = 0; i < 90 * 30; i++) {
      if (i === 30) b.dealDamage(null, p, { amount: p.hp + 1, type: 'true', sourceless: true });
      b.step();
      const { t, ...rest } = b.snapshot();
      const ev = b.drainEvents();
      if (markAt < 0 && ev.some((x) => x[0] === 'fx' && x[1] === 'patriotSpearMark')) markAt = i;
      frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev, gt: t });
      if (markAt >= 0 && i >= markAt + 30) break;
    }
    assert.ok(markAt > 0, 'a spear was thrown in the replay');
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      await page.evaluate((meta) => {
        const v = window.__demo.view;
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 1 });
      }, meta);
      const feed = (chunk) => page.evaluate(async (c) => {
        const v = window.__demo.view;
        for (const f of c) {
          if (f.ev.length) v.pushEvents({ t: 'b.ev', fieldId: f.snap.fieldId, gt: f.gt, ev: f.ev });
          v.pushSnapshot(f.snap);
          await new Promise((r) => requestAnimationFrame(() => r()));
        }
      }, chunk);
      const mid = 30 + 30 * 30;   // 30 s into the revive
      for (let i = 0; i < mid; i += 60) await feed(frames.slice(i, Math.min(mid, i + 60)));
      await new Promise((r) => setTimeout(r, 400));
      const revive = await page.evaluate((id) => { const u = window.__demo.view.debug.views.get(id); return { hp: u.hp / u.maxHp, clip: u.actor?.current?.name ?? u.actor?.clip ?? null }; }, pid);
      await page.screenshot({ path: path.join(OUT, 'patriot-revive.png') });
      for (let i = mid; i < markAt + 20; i += 60) await feed(frames.slice(i, Math.min(markAt + 20, i + 60)));
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({ path: path.join(OUT, 'patriot-spear.png') });
      assert.ok(Math.abs(revive.hp - 0.5) < 0.1, `HP bar at the revive's midpoint: ${revive.hp}`);
    } finally {
      await page.close();
    }
  });
});

