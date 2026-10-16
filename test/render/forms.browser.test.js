// test/render/forms.browser.test.js — user playtest #5 item 1 in headless Chrome: a 掠海漂移体 hovering down act2 m01's
// lower lane is stunned, drops to 爬行模式 for good (sim content/enemies.js kitSyufo: a ground unit from then on, blocked
// and hit by 山), and its view follows — the real sim runs in the page (the client runner's loadBrowserSim) and feeds the
// render demo's field view: before the drop the hover clips (*_01), on the drop 'Change', then the crawl clips (*_02)
// while 山 blocks it (render/app.js fx 'phase' → render/units.js setForm / FORMS). It used to keep hovering.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/forms.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/forms-syufo-crawl.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBattleSpec } from '../../server/sim/spec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and downloaded assets)';

// 山 on (9,8) facing the gate; one tanky, harmless 掠海漂移体 walking the lower lane (9,10) → (9,2)
const SPEC = buildBattleSpec({
  battleId: 'e2e.forms', fieldId: 'n:P1', kind: 'normal', seed: 5, modeId: 'mode_multi_hard', round: 12, stageId: 'act2autochess_m01', timeLimit: 400,
  players: [{ playerId: 'P1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: 'chess_char_5_17_a', row: 9, col: 8, dir: 'RIGHT' }], bonds: {}, playerEffects: [] }],
  spawns: [{ time: 0, enemyKey: 'enemy_2025_syufo', routeIndex: 0, count: 1, mods: { hpMul: 50, atkMul: 0.01 } }],
  routes: [{ motion: 'WALK', start: [9, 10], end: [9, 2], checkpoints: [] }], flags: {},
});

describe('掠海漂移体 drops to 爬行模式: its model crawls (headless Chrome, real sim)', { skip }, () => {
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

  test('hover clips before the stun, \'Change\' on the drop, then the crawl clips while 山 blocks and hits it', async () => {
    const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      const log = await page.evaluate(async (spec) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { data } = await import('/js/data.js');
        const { spec: S, ds } = await loadBrowserSim();
        const b = S.createBattleFromSpec(spec, ds, { quiet: true });
        const v = window.__demo.view;
        v.setStage(data.lookup('stages', spec.stageId));
        b.step();
        const meta = b.fieldMeta();
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 2 });
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        const out = [];
        let stunAt = null;
        for (let i = 0; i < 30 * 14; i++) {
          b.step();
          const e = b.enemies.find((x) => x.defId === 'enemy_2025_syufo');
          if (stunAt == null && e && b.time >= 6) { stunAt = b.time; b.applyStatus(e, 'stun', { duration: 1, source: null }); }
          if (i % 3 === 2) {
            const ev = b.drainEvents();
            if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: meta.fieldId, gt: b.time, ev });
            v.pushSnapshot(b.snapshot());
            await raf();
            if (i === 30 * 3) await new Promise((r) => setTimeout(r, 2000));   // the Spine models load
            const view = e && v.debug.views.get(e.id);
            if (e && i % 6 === 5) out.push({ t: +b.time.toFixed(2), flying: e.isFlying, blocked: !!e.blockedBy, clip: view?.actor?.current ?? null, form: view?.form ?? null, spine: !!view?.spineReady });
          }
        }
        return { out, stunAt };
      }, SPEC);
      await page.screenshot({ path: path.join(OUT, 'forms-syufo-crawl.png') });
      const before = log.out.filter((x) => x.spine && x.t < log.stunAt);
      assert.ok(before.length > 0, 'the model loaded before the stun');
      assert.ok(before.every((x) => x.flying && /_01$/.test(x.clip)), `hovering: the *_01 clips (${[...new Set(before.map((x) => x.clip))]})`);
      const after = log.out.filter((x) => x.t > log.stunAt);
      assert.ok(after.some((x) => x.clip === 'Change'), `the drop plays 'Change' (${[...new Set(after.map((x) => x.clip))]})`);
      const late = after.filter((x) => x.t > log.stunAt + 3);
      assert.ok(late.length > 0 && late.every((x) => !x.flying && x.form === 'crawl' && /_02$/.test(x.clip)), `crawling: the *_02 clips (${[...new Set(late.map((x) => x.clip))]})`);
      assert.ok(late.some((x) => x.blocked), '山 blocks it once it crawls');
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
