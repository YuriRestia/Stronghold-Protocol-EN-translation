// test/render/playtest6-enemies.browser.test.js — user playtest #6 items 9 and 13 in headless Chrome: the real sim runs
// in the page (the client runner's loadBrowserSim) and feeds the render demo's field view with the real Spine models.
//   #9  威龙 (enemy_1005_yokai_3) is drawn at its official prefab scale: its body is ≈ 1.08× as wide as a 妖怪's on screen
//       (official 0.16 vs 0.20 on skeletons 689 vs 509 units wide), not 1.35× (enemies.json modelScale; render/units.js).
//   #13 a “萨科塔之翼” below half HP flutters at random inside its tile for 5 s: its model turns left and right.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/playtest6-enemies.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/playtest6-drones.png.

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

// three slow flyers side by side on act2 m01's normal field: 妖怪, 威龙, “萨科塔之翼”
const fly = (r) => ({ motion: 'FLY', start: [r, 9], end: [r, 2], checkpoints: [] });
const SPEC = buildBattleSpec({
  battleId: 'e2e.pt6', fieldId: 'n:P1', kind: 'normal', seed: 9, modeId: 'mode_multi_hard', round: 6, stageId: 'act2autochess_m01', timeLimit: 400,
  players: [{ playerId: 'P1', seat: 0, side: 'L', colOffset: 0, units: [], bonds: {}, playerEffects: [] }],
  spawns: [
    { time: 0, enemyKey: 'enemy_1005_yokai', routeIndex: 0, count: 1, mods: { hpMul: 50, speedMul: 0.15 } },
    { time: 0, enemyKey: 'enemy_1005_yokai_3', routeIndex: 1, count: 1, mods: { hpMul: 50, speedMul: 0.15 } },
    { time: 0, enemyKey: 'enemy_10083_hlbird', routeIndex: 2, count: 1, mods: { hpMul: 50, speedMul: 1 } },
  ],
  routes: [fly(12), fly(10.5), fly(9)], flags: {},
});

describe('enemy model sizes and the 萨科塔 flutter (headless Chrome, real sim + real models)', { skip }, () => {
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

  test('威龙 ≈ 1.08× a 妖怪 on screen; the feared bird turns left and right inside its tile', async () => {
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
        const feed = async () => {
          b.step();
          const ev = b.drainEvents();
          if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: meta.fieldId, gt: b.time, ev });
          v.pushSnapshot(b.snapshot());
          await raf();
        };
        const byKey = (k) => b.enemies.find((x) => x.defId === k);
        for (let i = 0; i < 30; i++) await feed();
        await new Promise((r) => setTimeout(r, 2500));                 // the Spine models load
        for (let i = 0; i < 30; i++) await feed();
        const size = {};
        for (const k of ['enemy_1005_yokai', 'enemy_1005_yokai_3', 'enemy_10083_hlbird']) {
          const view = v.debug.views.get(byKey(k).id);
          const bd = view.actor.spine.getLocalBounds();
          size[k] = { spine: !!view.spineReady, modelK: view.modelK, widthTiles: (bd.width * Math.abs(view.actor.spine.scale.x)) / view.screen.s };
        }
        // #13: below half HP the bird fears itself
        const bird = byKey('enemy_10083_hlbird');
        const bv = v.debug.views.get(bird.id);
        b.dealDamage(null, bird, { amount: bird.s.maxHp * 0.6, type: 'true' });
        const tr = Math.round(bird.y), tc = Math.round(bird.x);
        const faces = [];
        let maxOff = 0;
        for (let i = 0; i < 30 * 4.5; i++) {
          await feed();
          if (i > 30) maxOff = Math.max(maxOff, Math.abs(bird.x - tc), Math.abs(bird.y - tr));
          if (i % 2 === 0) faces.push(bv.visFacing);
        }
        let flips = 0;
        for (let i = 1; i < faces.length; i++) if (faces[i] !== faces[i - 1]) flips++;
        return { size, flips, maxOff, feared: !!bird.s.flags.fear };
      }, SPEC);
      await page.screenshot({ path: path.join(OUT, 'playtest6-drones.png') });
      const s = log.size;
      assert.ok(s.enemy_1005_yokai.spine && s.enemy_1005_yokai_3.spine, 'models loaded');
      assert.ok(Math.abs(s.enemy_1005_yokai_3.modelK - 0.5926) < 1e-6 && Math.abs(s.enemy_1005_yokai.modelK - 0.7407) < 1e-6);
      const ratio = s.enemy_1005_yokai_3.widthTiles / s.enemy_1005_yokai.widthTiles;
      assert.ok(ratio > 0.9 && ratio < 1.25, `威龙 / 妖怪 drawn width ${ratio.toFixed(2)} (official ≈ 1.08; it was ≈ 1.35)`);
      assert.ok(s.enemy_1005_yokai_3.widthTiles < 1.8, `威龙 ${s.enemy_1005_yokai_3.widthTiles.toFixed(2)} tiles wide`);
      assert.ok(log.flips >= 2, `the bird's model turns (${log.flips} flips)`);
      assert.ok(log.maxOff <= 0.26, `inside its tile's 0.5 square (${log.maxOff.toFixed(3)})`);
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
