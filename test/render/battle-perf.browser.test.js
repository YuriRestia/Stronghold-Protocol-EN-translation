// test/render/battle-perf.browser.test.js — the battle perf page (public/dev/battle-perf.html) in headless Chrome: every
// committed spec starts, the battle runner steps the sim and the field view draws it, with a clean console; the sample
// hook tools/perfbench.mjs reads returns its figures.
//
// Opt-in (starts Chrome, needs the downloaded assets): RENDER_E2E=1 node --test test/render/battle-perf.browser.test.js
// Chrome path: $CHROME_PATH or the platform default of tools/perfbench.mjs.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gpuArgs } from '../../tools/perfbench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
}[process.platform];
const enabled = process.env.RENDER_E2E === '1' && !!CHROME && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and the downloaded assets)';
const index = JSON.parse(readFileSync(path.join(ROOT, 'public/dev/perf/index.json'), 'utf8'));

describe('battle perf page in headless Chrome', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: gpuArgs() });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  for (const s of index) {
    test(`${s.name}: the battle runs and draws, the sample hook reports`, async () => {
      const page = await browser.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
      page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/battle-perf.html?spec=${s.name}`);
      await page.waitForFunction('window.__perf && (window.__perf.ready || window.__perf.error)', { timeout: 60000 });
      assert.equal(await page.evaluate(() => window.__perf.error), null);
      await new Promise((r) => setTimeout(r, 3000));
      const r = await page.evaluate(() => window.__perf.sample(2000));
      const short = await page.evaluate(() => window.__perf.sample(0)); // still a full frame time, not 0 / 0
      await page.close();
      assert.deepEqual(problems, []);
      assert.ok(r.fps > 10, `fps ${r.fps}`);
      assert.ok(r.ticks > 60, `sim ticks ${r.ticks}`);
      assert.ok(r.units > 0, `units ${r.units}`);
      assert.ok(Number.isFinite(r.p95) && r.p95 > 0);
      assert.ok(Number.isFinite(short.fps) && short.fps > 0 && short.p95 > 0, `sample(0): ${JSON.stringify(short)}`);
    });
  }
});
