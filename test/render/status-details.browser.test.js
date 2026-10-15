// test/render/status-details.browser.test.js — the status icons' time rings and numbers in headless Chrome: a real battle
// is simulated in Node (four standing 源石虫 under 脆弱 40 % over a weaker 30 %, 减速 50 %, 虚弱 25 % and 束缚) and its frames
// are fed to the real field view (public/dev/render-demo.html, real Spine models) the way the client runner does. Each
// icon shows a ring for the time it has left and, for a status with a strength, its number under it.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/status-details.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/status-details.png.

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

/**
 * Real frames: four standing 源石虫; after half a second (the views exist by then: a 'status' tuple for a unit the view
 * has not built yet is dropped, as for any unit event) each gets its own statuses; `seconds` in all.
 */
function recordBattle(seconds = 3) {
  const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 600, content: 'none' });
  h.step();
  const at = [[10, 8], [10, 6], [10, 4], [12, 6]];
  const es = at.map((p) => h.spawn('enemy_1007_slime', { pos: p, routeIndex: 0, mods: { speedMul: 0, hpMul: 1000 } }));
  h.step();
  const b = h.b;
  const meta = { ...b.fieldMeta(), stageId: 'act2autochess_m01' };
  b.drainEvents();
  const frames = [];
  for (let i = 0; i < seconds * 30; i++) {
    if (i === 15) {
      b.applyStatus(es[0], 'fragile', { duration: 12, value: 0.3 });
      b.applyStatus(es[0], 'fragile', { duration: 6, value: 0.4 });
      b.applyStatus(es[1], 'slow', { duration: 8, value: 0.5 });
      b.applyStatus(es[2], 'weaken', { duration: 10, value: 0.25 });
      b.applyStatus(es[3], 'bind', { duration: 5 });
    }
    b.step();
    const { t, ...rest } = b.snapshot();
    frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev: b.drainEvents(), gt: t });
  }
  return { meta, frames, enemyIds: es.map((e) => e.id) };
}

describe('status icon rings and numbers in headless Chrome', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  test('each status icon has its ring, and 脆弱 / 减速 / 虚弱 their numbers', async () => {
    const { meta, frames, enemyIds } = recordBattle();
    const page = await browser.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
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
      let marks = null;
      const CHUNK = 30;
      for (let i = 0; i < frames.length; i += CHUNK) {
        marks = await page.evaluate(async (chunk, ids) => {
          const v = window.__demo.view;
          for (const f of chunk) {
            if (f.ev.length) v.pushEvents({ t: 'b.ev', fieldId: f.snap.fieldId, gt: f.gt, ev: f.ev });
            v.pushSnapshot(f.snap);
            await new Promise((r) => requestAnimationFrame(() => r()));
          }
          return ids.map((id) => {
            const u = v.debug.views.get(id);
            return (u?.iconMarks || []).map((m, k) => ({ icon: u.icons[k].visible, ring: m.arc.visible, label: m.label.visible ? m.text : null }))
              .filter((m) => m.icon);
          });
        }, frames.slice(i, i + CHUNK), enemyIds);
      }
      await page.screenshot({ path: path.join(OUT, 'status-details.png') });
      const [frag, slow, weak, bind] = marks;
      assert.ok(frag.some((m) => m.ring && m.label === '40%'), `脆弱 40 %: ${JSON.stringify(frag)}`);
      assert.ok(slow.some((m) => m.ring && m.label === '50%'), `减速 50 %: ${JSON.stringify(slow)}`);
      assert.ok(weak.some((m) => m.ring && m.label === '25%'), `虚弱 25 %: ${JSON.stringify(weak)}`);
      assert.ok(bind.some((m) => m.ring && m.label == null), `束缚 ring only: ${JSON.stringify(bind)}`);
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
