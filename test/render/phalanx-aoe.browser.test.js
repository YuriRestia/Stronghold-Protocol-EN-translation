// test/render/phalanx-aoe.browser.test.js — community report E3 after 0.1.0 ("干员卡涅利安的攻击不是真群攻") in headless
// Chrome: a real battle (卡涅利安 S2 沙缚镣锁 with five enemies spread over her range, no two within a 1.1-tile splash)
// is simulated in Node and its frames are fed to the real field view (public/dev/render-demo.html, real Spine models)
// the way the client runner does. Each of her attacks strikes every enemy on her range at once (the 阵法术师 group
// attack, sim/professions.js `rangeAoe`): the field draws a strike line from her to each of the five in the same frame
// and every one of them shows its damage number.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/phalanx-aoe.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/phalanx-aoe.png.

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
const SPREAD = [[10, 7], [10, 3], [12, 5], [9, 5], [11, 6]];

/** Real frames: 卡涅利安 (S2 on) against five standing 源石虫 spread over her x-1 range. */
function recordBattle(seconds = 8) {
  const h = makeBattle({ units: [{ chessId: 'chess_char_4_24_a', row: 10, col: 5 }], seed: 3, autoFinish: false, timeLimit: 600 });
  h.step();
  const u = h.allies()[0];
  const es = SPREAD.map((p) => h.spawn('enemy_1007_slime', { pos: p, routeIndex: 0, mods: { speedMul: 0, hpMul: 1000 } }));
  u.skill.gainSp(u.skill.spCost);
  const meta = { ...h.b.fieldMeta(), stageId: 'act2autochess_m01' };
  h.b.drainEvents();
  const frames = [];
  for (let i = 0; i < seconds * 30; i++) {
    h.b.step(); // (not h.step(): the harness would drain the events itself)
    const { t, ...rest } = h.b.snapshot();
    frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev: h.b.drainEvents(), gt: t });
  }
  return { meta, frames, opId: u.id, enemyIds: es.map((e) => e.id) };
}

describe('阵法术师 group attack in headless Chrome (community report E3)', { skip }, () => {
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

  test('every attack draws a strike to each of the five enemies on her range, and each shows its damage', async () => {
    const { meta, frames, opId, enemyIds } = recordBattle();
    const attacks = frames.filter((f) => f.ev.some((e) => e[0] === 'atk' && e[1] === opId));
    assert.ok(attacks.length >= 3, 'she attacked');
    for (const f of attacks) assert.equal(new Set(f.ev.filter((e) => e[0] === 'atk' && e[1] === opId).map((e) => e[2])).size, 5, 'one attack, five targets');
    const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
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
        v.setLocalFeed({ on: true, speed: 2 });
      }, meta);
      let maxBeams = 0, shot = false;
      const numbered = new Set();
      const CHUNK = 30;
      for (let i = 0; i < frames.length; i += CHUNK) {
        const got = await page.evaluate(async (chunk, opId) => {
          const v = window.__demo.view, fx = v.debug.fx, out = [];
          for (const f of chunk) {
            if (f.ev.length) v.pushEvents({ t: 'b.ev', fieldId: f.snap.fieldId, gt: f.gt, ev: f.ev });
            v.pushSnapshot(f.snap);
            await new Promise((r) => requestAnimationFrame(() => r()));
            const me = v.debug.views.get(opId);
            const beams = new Set(fx.beamList.filter((b) => b.a === me && b.b).map((b) => b.b.id));
            out.push({ beams: beams.size, nums: [...new Set(fx.nums.filter((n) => !n.fading && n.unit).map((n) => n.unit.id))] });
          }
          return out;
        }, frames.slice(i, i + CHUNK), opId);
        for (const g of got) {
          maxBeams = Math.max(maxBeams, g.beams);
          for (const id of g.nums) numbered.add(id);
          if (g.beams === 5 && !shot) { shot = true; await page.screenshot({ path: path.join(OUT, 'phalanx-aoe.png') }); }
        }
      }
      assert.equal(maxBeams, 5, 'one frame shows her strike on all five enemies');
      for (const id of enemyIds) assert.ok(numbered.has(id), `enemy ${id} shows a damage number`);
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
