// test/render/token-models.browser.test.js — the 40 original summon models extracted from the local client (tools/local-extract/
// extract.py TOKEN_SPINES → data/assets.json tokens[id].spineLocal, docs/ASSETS.md "Token models from the local client")
// drawn on the prep board of the dev render demo (public/dev/render-demo.html) in headless Chrome: every summon placed on
// a board tile draws its official model (the local entry, not the avatar diamond), on its own idle clip (the mapped ones
// too: 电弧's 戴乌 C_Skill1_Idle, 酒神's 本能的召唤 Loop, 战术锚点 Default), really puts pixels over its tile, and faces
// its deploy direction (Front facing right, mirrored for LEFT) — no console error, no failed request.
// Screenshots → test/e2e/out/token-models-<batch>-<dir>.png.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/token-models.browser.test.js
// Needs the downloaded assets and the extracted token models (tools/local-extract --only spine/token). Run browser test
// files one at a time. Chrome path: $CHROME_PATH or the macOS default.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MODELS = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-token-spines.json'), 'utf8')).models;
const IDS = Object.keys(MODELS).sort();
const extracted = IDS.every((id) => existsSync(path.join(ROOT, 'public/assets/local/spine/token', id)));
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = !enabled ? 'set RENDER_E2E=1 (needs Chrome and downloaded assets)' : !extracted ? 'token models not extracted (tools/local-extract --only spine/token)' : false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the local-client summon models on the prep board (headless Chrome)', { skip }, () => {
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

  test('every summon draws its official model on its idle clip, over its tile, facing its deploy direction', async (t) => {
    const page = await browser.newPage();
    const problems = [];
    let least = { drawn: Infinity };
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=prep&panel=0&pen=0&board=2d`);
    await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 40000 });
    assert.equal(await page.evaluate(() => window.__demo.error || null), null, 'demo boot');
    assert.ok(await page.evaluate(async () => { const { assets } = await import('/js/assets.js'); return !!(await assets.local()); }), 'data/local-assets.json');
    for (let b = 0; b * 10 < IDS.length; b++) {
      const group = IDS.slice(b * 10, b * 10 + 10);
      for (const dir of ['RIGHT', 'LEFT']) {
        await page.evaluate((group, dir) => {
          let uid = 900;
          const cols = [1, 3, 5, 7, 9];
          const board = group.map((id, i) => ({ uid: uid++, kind: 'token', id, golden: false, tier: 1, items: [], count: 1, row: i < 5 ? 11 : 9, col: cols[i % 5], dir }));
          window.__demo.view.setPrep({ hand: Array(10).fill(null), temp: Array(5).fill(null), board, nextEnemies: [] }, { editable: false });
        }, group, dir);
        await sleep(3000);
        const got = await page.evaluate((group) => {
          const R = window.__demo.view.debug, app = R.app, rd = app.renderer, gl = rd.gl, res = rd.resolution, H = rd.view.height;
          const out = {};
          for (const v of R.views.values()) {
            const id = v?.info?.defId;
            if (!group.includes(id)) continue;
            const sp = v.actor?.spine;
            // share of the pixels over the body that change when the view is hidden (≈ 0: nothing drawn)
            const bb = v.bounds();
            const x0 = Math.max(0, Math.floor(bb.x * res)), y0 = Math.max(0, Math.floor(bb.y * res));
            const w = Math.max(1, Math.min(Math.floor(bb.width * res), rd.view.width - x0)), h = Math.max(1, Math.min(Math.floor(bb.height * res), H - y0));
            const read = () => { R.ctx.impostors?.flush?.(); rd.render(app.stage); const px = new Uint8Array(w * h * 4); gl.readPixels(x0, H - y0 - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
            const a = read();
            v.root.visible = false;
            const c = read();
            v.root.visible = true;
            let diff = 0;
            for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 40) diff++;
            out[id] = { ready: !!(v.actor && v.spineReady), local: !!v.actor?.entry?.local, skel: v.actor?.entry?.skel || null,
              anim: sp?.state?.tracks?.[0]?.animation?.name || null, sx: sp ? Math.sign(sp.scale.x) : 0, drawn: diff / (w * h) };
          }
          return out;
        }, group);
        await page.screenshot({ path: path.join(OUT, `token-models-${b + 1}-${dir.toLowerCase()}.png`) });
        for (const id of group) {
          const g = got[id];
          assert.ok(g, `${id}: a prep view`);
          assert.ok(g.ready && g.local, `${id} (${dir}): the official model (${JSON.stringify(g)})`);
          assert.equal(g.skel, `/assets/local/spine/token/${id}/${MODELS[id].skel}`, id);
          assert.equal(g.anim, MODELS[id].anims.idle, `${id}: its idle clip`);
          assert.equal(g.sx, dir === 'LEFT' ? -1 : 1, `${id}: Front facing right, mirrored facing left`);
          assert.ok(g.drawn > 0.02, `${id} (${dir}): draws over its tile (${g.drawn.toFixed(4)})`);
          if (g.drawn < least.drawn) least = { id, dir, drawn: g.drawn };
        }
      }
    }
    assert.deepEqual(problems, []);
    t.diagnostic(`least drawn: ${least.id} ${least.dir} ${least.drawn.toFixed(4)} of its body rect`);
    await page.close();
  });
});
