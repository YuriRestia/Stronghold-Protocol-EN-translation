// test/render/feedback5-prisoners.browser.test.js — community report of 2026-10-06 「囚徒类敌人出门就是已解放的模型」 in
// headless Chrome, on the 2D and the 3D board: the real sim runs in the page (the client runner's loadBrowserSim) and
// feeds the render demo's field view. Three operators block three 孤岛风云 prisoners — 普通囚犯, 强壮囚犯 and 拳师囚犯, one
// of each clip-naming family — and each model follows its official prefab's modes: the grey confined set out of the gate, the
// blinking orange set from the warning (before the last confined attack), the red set once freed (sim fx 'phase' /
// 'liberate' with their `form` → render/units.js FORMS). 普通囚犯 used to come out on its red (freed) set and none ever
// changed. Screenshots (cropped to the prisoners) → test/e2e/out/prisoners-<board>-<confined|warning|freed>.png.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/feedback5-prisoners.browser.test.js
// Needs the downloaded assets; the 3D board also the local-client board art and WebGL2 (else that half is skipped).
// Chrome path: $CHROME_PATH or the macOS default.

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

/** Each prisoner's clip suffix per mode (confined / warning / freed), as test/render/feedback5-prisoners.test.js. */
const SETS = {
  enemy_1116_liprr: ['3', '2', ''],
  enemy_1119_vofsd: ['', '2', '3'],
  enemy_1118_lidbox_2: ['_grey', '_orange', '_red'],
};
const KEYS = Object.keys(SETS);
// three block-1 operators along act2 m01's road (9,10) → (9,8) → (12,7) → (12,5) → (9,5) → (9,2): 山 on (9,8), 宴 on
// (12,6), 斯卡蒂 on (10,5), each facing the coming enemies; the prisoners walk in 1 s apart, harmless and tanky, and each
// is blocked by its own operator — they stand apart and keep attacking until freed
const SPEC = buildBattleSpec({
  battleId: 'e2e.prisoners', fieldId: 'n:P1', kind: 'normal', seed: 5, modeId: 'mode_multi_hard', round: 12, stageId: 'act2autochess_m01', timeLimit: 400,
  players: [{ playerId: 'P1', seat: 0, side: 'L', colOffset: 0, units: [
    { uid: 1, kind: 'chess', chessId: 'chess_char_5_17_a', row: 9, col: 8, dir: 'RIGHT' },
    { uid: 2, kind: 'chess', chessId: 'chess_char_1_18_a', row: 12, col: 6, dir: 'RIGHT' },
    { uid: 3, kind: 'chess', chessId: 'chess_char_3_05_a', row: 10, col: 5, dir: 'DOWN' },
  ], bonds: {}, playerEffects: [] }],
  spawns: KEYS.map((enemyKey, i) => ({ time: i, enemyKey, routeIndex: 0, count: 1, mods: { hpMul: 200, atkMul: 0.01 } })),
  routes: [{ motion: 'WALK', start: [9, 10], end: [9, 2], checkpoints: [] }], flags: {},
});
const setOf = (key, clip) => {
  const m = /^(?:Idle|Move|Attack|Die|Default)(.*)$/.exec(clip || '');
  return m ? SETS[key].indexOf(m[1]) : -1;
};

describe('the 孤岛风云 prisoners draw confined → warning → freed (headless Chrome, real sim)', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--force-device-scale-factor=1'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  for (const board of ['2d', '3d']) {
    test(`${board} board: grey out of the gate, orange from the warning, red once freed — each model as its sim form`, async (t) => {
      const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
      const problems = [];
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
      try {
        await page.setViewport({ width: 1600, height: 900 });
        await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0&board=${board}`);
        await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 40000 });
        const on3d = await page.evaluate(() => !!window.__demo.view.stats().board3d?.on);
        if (board === '3d' && !on3d) { t.skip('no 3D board here (local board art or WebGL2 missing)'); return; }
        assert.equal(on3d, board === '3d', 'the board mode asked for');
        await page.evaluate(async (spec) => {
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
          window.__pr = { b, v, meta, log: [] };
        }, SPEC);
        /** Step the sim `ticks` ticks, feeding the view; log each prisoner's sim form and drawn clip. */
        const run = (ticks) => page.evaluate(async (ticks, keys) => {
          const { b, v, meta, log } = window.__pr;
          const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
          for (let i = 0; i < ticks; i++) {
            b.step();
            if (i % 3 !== 2) continue;
            const ev = b.drainEvents();
            if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: meta.fieldId, gt: b.time, ev });
            v.pushSnapshot(b.snapshot());
            await raf();
            for (const e of b.enemies) {
              if (!keys.includes(e.defId) || !e.alive) continue;
              const view = v.debug.views.get(e.id);
              if (view?.spineReady) log.push({ t: +b.time.toFixed(2), key: e.defId, form: e.form ?? null, clip: view.actor?.current ?? null, attacks: e.stats.attacks });
            }
          }
          return b.time;
        }, ticks, KEYS);
        /** Screenshot cropped to the prisoners' drawn bodies. */
        const shot = async (name) => {
          const r = await page.evaluate((keys) => {
            const { b, v } = window.__pr;
            const rects = b.enemies.filter((e) => keys.includes(e.defId) && e.alive).map((e) => v.debug.views.get(e.id)?.bounds()).filter(Boolean);
            if (!rects.length) return null;
            const x0 = Math.min(...rects.map((q) => q.x)), y0 = Math.min(...rects.map((q) => q.y));
            const x1 = Math.max(...rects.map((q) => q.x + q.width)), y1 = Math.max(...rects.map((q) => q.y + q.height));
            return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
          }, KEYS);
          const pad = 60;
          const clip = r ? { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(1600, r.w + 2 * pad), height: Math.min(900, r.h + 2 * pad) } : undefined;
          await page.screenshot({ path: path.join(OUT, `prisoners-${board}-${name}.png`), ...(clip ? { clip } : {}) });
        };
        await run(30 * 3);
        await new Promise((r) => setTimeout(r, 2500));   // the Spine models load
        await run(30 * 3);
        await shot('confined');
        // until 普通囚犯 shows its warning, then until every prisoner is freed
        for (let k = 0; k < 20; k++) {
          await run(30);
          const lp = await page.evaluate(() => window.__pr.b.enemies.find((e) => e.defId === 'enemy_1116_liprr')?.form ?? null);
          if (lp === 'warning') break;
        }
        await shot('warning');
        for (let k = 0; k < 60; k++) {
          await run(30);
          const done = await page.evaluate((keys) => keys.every((key) => window.__pr.b.enemies.find((e) => e.defId === key)?.form === 'liberty'), KEYS);
          if (done) break;
        }
        await run(30);
        await shot('freed');
        const log = await page.evaluate(() => window.__pr.log);
        for (const key of KEYS) {
          const rows = log.filter((x) => x.key === key && x.clip);
          for (const [i, form] of [[0, null], [1, 'warning'], [2, 'liberty']]) {
            // the view draws the sim's state a moment later (the render delay): rows within 1 s of the change are skipped
            const first = rows.find((x) => x.form === form)?.t ?? Infinity;
            const seen = rows.filter((x) => x.form === form && (form === null || x.t >= first + 1));
            assert.ok(seen.length > 0, `${key}: drawn while its sim form is ${form ?? 'confined'}`);
            const wrong = seen.filter((x) => setOf(key, x.clip) !== i);
            assert.deepEqual(wrong.slice(0, 3), [], `${key} ${form ?? 'confined'}: the ${['grey', 'orange', 'red'][i]} set (${[...new Set(seen.map((x) => x.clip))]})`);
          }
        }
        assert.deepEqual(problems, []);
      } finally {
        await page.close();
      }
    });
  }
});
