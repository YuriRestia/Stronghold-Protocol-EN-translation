// test/render/elembar.browser.test.js — user playtest #6 report 11 in headless Chrome ("干员血条右边的元素损伤条积累速度
// 不对，损伤条远远没扣完但是实际已经爆条"): a real battle (古米 against 底海滑动者) is simulated in Node, its frames are fed
// to the real field view (public/dev/render-demo.html, real Spine models) the way the client runner does (local feed,
// one tick per animation frame), and the drawn element gauge is read back every frame:
//   · the white bar is the sim's remaining 元素值 at the frame shown (within 1 %, never below it, never empty before the
//     burst), and the burst shows as the bar refilling over the 爆发冷却 in the element's colour (never white);
//   · a row of five operators with gauges (desktop and a 844×390 phone at DPR 3): each gauge row lies under its own
//     unit's bars and inside their span (the v2.3 ring sat on the next operator's tier chip and bars).
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/elembar.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshots → test/e2e/out/elembar-*.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle } from '../helpers/battleHarness.js';
import { ELEMENT_ORDER } from '../../server/sim/constants.js';
import { ELEMENT_RING } from '../../public/js/render/textures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and downloaded assets)';
const NEURAL_TINT = ELEMENT_RING.neural.tint;

/** Real frames: 古米 blocking 底海滑动者 (15 % ATK 神经 per hit) until past its first burst. */
function recordBattle(seconds = 54) {
  const h = makeBattle({ units: [{ chessId: 'chess_char_1_10_a', row: 10, col: 5 }], seed: 3, autoFinish: false, timeLimit: 600 });
  h.step();
  h.spawn('enemy_1148_dssbr', { pos: [10, 5.6], routeIndex: 0, mods: { speedMul: 0, hpMul: 1000 } });
  const u = h.allies()[0];
  const meta = { ...h.b.fieldMeta(), stageId: 'act2autochess_m01' };
  h.b.drainEvents();
  const frames = [];
  for (let i = 0; i < seconds * 30; i++) {
    h.step();
    if (u.alive) u.hp = u.s.maxHp;
    let bv = 0, el = null;
    for (const k of ELEMENT_ORDER) if (u.elem[k] > bv) { bv = u.elem[k]; el = k; }
    const { t, ...rest } = h.b.snapshot();
    frames.push({ snap: { ...rest, t: 'b.snap', gt: t }, ev: h.b.drainEvents(), gt: t, el, left: el ? 1 - bv / u.gaugeMax : null, lock: !!u.s.flags.burstLock });
  }
  return { meta, frames, opId: u.id };
}

/** Page side: the drawn gauge of unit `id` (null: none) — element, the white bar's share, the render clock. */
function readGauge(id) {
  const v = window.__demo.view;
  const x = v.debug.views.get(id);
  const r = x && x._elBar;
  if (!r || !r.root.visible) return { el: null, renderT: v.debug.interp.renderT };
  return { el: x.el, share: r.fill.visible ? r.fill.width / (r.bg.width - 2) : 0, tint: r.fill.tint, renderT: v.debug.interp.renderT };
}

describe('element gauge row in headless Chrome (user playtest #6)', { skip }, () => {
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

  const open = async (viewport) => {
    const page = await browser.newPage(); await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    await page.setViewport(viewport);
    await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
    await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
    return { page, problems };
  };

  test('a real battle: the white bar drawn every frame is the sim\'s remaining 元素值; the burst refills it', async () => {
    const { meta, frames, opId } = recordBattle();
    const { page, problems } = await open({ width: 1280, height: 720 });
    try {
      await page.evaluate((meta) => {
        const v = window.__demo.view;
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 2 });
      }, meta);
      const byT = new Map(frames.map((f) => [f.gt, f]));
      const rows = [];
      const CHUNK = 30;
      for (let i = 0; i < frames.length; i += CHUNK) {
        const got = await page.evaluate(async (chunk, id, readSrc) => {
          const read = new Function(`return (${readSrc})`)();
          const v = window.__demo.view, out = [];
          for (const f of chunk) {
            if (f.ev.length) v.pushEvents({ t: 'b.ev', fieldId: f.snap.fieldId, gt: f.gt, ev: f.ev });
            v.pushSnapshot(f.snap);
            await new Promise((r) => requestAnimationFrame(() => r()));
            const g = read(id);
            const s = v.debug.interp.snaps;
            let shown = s[0]?.t;
            for (const x of s) if (x.t <= g.renderT) shown = x.t;
            out.push({ ...g, shownT: shown });
          }
          return out;
        }, frames.slice(i, i + CHUNK), opId, readGauge.toString());
        rows.push(...got);
      }
      let checked = 0, refills = 0, prevLock = false, lastBefore = null;
      for (const row of rows) {
        const f = byT.get(row.shownT);
        if (!f) continue;
        if (f.lock) {
          assert.equal(row.el, 'neural', 'the 爆发冷却 shows');
          if (!prevLock) { refills++; assert.ok(row.share < 0.03, `the refill starts empty (${row.share})`); }
          assert.equal(row.tint, NEURAL_TINT, 'the refill is drawn in the 神经 colour, not white');
        } else if (f.el) {
          checked++;
          assert.equal(row.el, f.el);
          assert.equal(row.tint, 0xffffff, 'the 元素值 left is white');
          assert.ok(row.share >= f.left - 1e-6 && row.share - f.left < 0.01 + 1e-6, `gt ${f.gt}: bar ${row.share} vs sim ${f.left}`);
          assert.ok(row.share > 0, 'never empty before the burst');
          lastBefore = row.share;
        } else assert.equal(row.el, null);
        prevLock = f.lock;
      }
      assert.ok(checked > 1000, `${checked} frames checked`);
      assert.equal(refills, 1, 'one 神经 burst');
      assert.ok(lastBefore <= 0.05, `the burst comes off a sliver (${lastBefore})`);
      await page.screenshot({ path: path.join(OUT, 'elembar-cooldown.png') });
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });

  for (const [name, viewport] of [['desktop', { width: 1280, height: 720 }], ['phone', { width: 844, height: 390, deviceScaleFactor: 3 }]]) {
    test(`a row of operators (${name}): every gauge row lies under its own unit's bars, inside their span`, async () => {
      const { page, problems } = await open(viewport);
      try {
        await page.evaluate(() => {
          const v = window.__demo.view;
          const U = (id, side, spine, x, y) => ({ id, kind: side === 'enemy' ? 'enemy' : 'op', side, defId: spine, spine, avatar: spine, x, y, maxHp: 1000, facing: 1, dir: side === 'enemy' ? undefined : 'RIGHT', tier: 3 });
          const units = [3, 4, 5, 6, 7].map((c, i) => U(i + 1, 'ally', i % 2 ? 'char_1016_agoat2' : 'char_102_texas', c, 10))
            .concat([U(6, 'enemy', 'enemy_1000_gopro_2', 3, 11.4), U(7, 'enemy', 'enemy_1000_gopro_2', 6, 11.4)]);
          v.enterBattle({ fieldId: 'eb', kind: 'normal', rect: { r0: 9, r1: 12, c0: 0, c1: 10 }, stageId: 'act2autochess_m01', units });
          v.setCamera('normal', { rect: { r0: 9, r1: 12, c0: 0, c1: 10 }, side: 'L', instant: true });
          v.setLocalFeed({ on: true, speed: 2 });
          window.__units = units;
        });
        const feed = (from, to) => page.evaluate(async (from, to) => {
          const v = window.__demo.view, units = window.__units;
          for (let gt = from; gt <= to + 1e-9; gt += 1 / 30) {
            v.pushSnapshot({ t: 'b.snap', fieldId: 'eb', gt: +gt.toFixed(4), units: units.map((u) => [u.id, u.x, u.y, u.side === 'enemy' ? 700 : 1000, 1000, 5, 10, 0, 0]), dp: 5, killed: 0, total: 2,
              elem: [[1, 'neural', 0.1, 0, 0], [2, 'erosion', 0.5, 0, 0], [3, 'burn', 0.9, 0, 0], [4, 'apoptosis', 0.97, 0, 0], [5, 'neural', 1, 12, 10], [6, 'neural', 0.25, 0, 0], [7, 'erosion', 0.75, 0, 0]] });
            await new Promise((r) => requestAnimationFrame(() => r()));
          }
        }, from, to);
        await feed(1, 2.5);
        await new Promise((r) => setTimeout(r, 1500)); // Spine models load
        await feed(2.5, 7);
        const geo = await page.evaluate(() => {
          const out = {};
          for (const [id, x] of window.__demo.view.debug.views) {
            const r = x._elBar;
            if (!r || !r.root.visible) continue;
            const x0 = x.hpBg.position.x + 1, bw = x.hpBg.width - 2;
            const barsBottom = x.spFill.visible ? x.spFill.position.y + x.spFill.height / 2 : x.hpBg.position.y + x.hpBg.height / 2;
            out[id] = { x0, bw, barsBottom, discL: r.disc.position.x - r.disc.width * 0.336, discTop: r.disc.position.y - r.disc.height * 0.336,
              barR: r.bg.position.x + r.bg.width, share: r.fill.visible ? r.fill.width / (r.bg.width - 2) : 0, el: x.el, tint: r.fill.tint };
          }
          return out;
        });
        const want = { 1: 0.9, 2: 0.5, 3: 0.1, 4: 0.03, 6: 0.75, 7: 0.25 };
        for (const [id, left] of Object.entries(want)) {
          const g = geo[id];
          assert.ok(g, `unit ${id} shows its gauge`);
          assert.ok(Math.abs(g.share - left) < 1e-6, `unit ${id}: bar ${g.share} = remaining ${left}`);
          assert.ok(g.discL >= g.x0 - 1 && g.barR <= g.x0 + g.bw + 1.5, `unit ${id}: inside its bars' span`);
          assert.ok(g.discTop >= g.barsBottom, `unit ${id}: under its bars`);
          assert.equal(g.tint, 0xffffff, `unit ${id}: 元素值 left is white`);
        }
        assert.ok(geo[5].share > 0.4 && geo[5].share < 0.6, `the 爆发冷却 half refilled (${geo[5].share})`);
        assert.equal(geo[5].tint, NEURAL_TINT, 'the 爆发冷却 refill in the element\'s colour, unlike unit 1\'s white 神经 bar');
        await page.screenshot({ path: path.join(OUT, `elembar-row-${name}.png`) });
        assert.deepEqual(problems, []);
      } finally {
        await page.close();
      }
    });
  }
});
