// test/render/dynillust-worker-csp.browser.test.js — the animated illustrations' Worker (render/dynillust/worker.js)
// under the real server and its CSP (server/http/csp.js: script-src without 'unsafe-eval'). The Worker must start its
// Pixi renderer and draw: the host reports one Worker whose test square reads back red. Without Pixi's no-eval patch
// (render/app/pixiNoEval.js) the renderer cannot start there, and the host must fall back to the main-thread stage
// instead of handing the Worker cards it cannot draw. Opt in with RENDER_E2E=1 and CHROME_PATH (GPU Chrome).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { gpuArgs } from '../../tools/perfbench.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = process.env.RENDER_E2E !== '1' || !existsSync(CHROME);

/** In the page: a host with one Worker, its stats once every Worker has answered. */
const bootHost = async () => {
  const { DynIllustHost } = await import('/js/render/dynillust/host.js');
  const H = new DynIllustHost({ workers: 1, manifest: async () => ({ groups: { dynillust: {} } }) });
  await H.ready;
  const s = H.stats();
  H.destroy();
  return s;
};

test('the illustration Worker draws under the site CSP, and falls back when its renderer cannot start', { skip, timeout: 90000 }, async () => {
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  let browser;
  mkdirSync('test/e2e/out', { recursive: true });
  const profile = mkdtempSync('test/e2e/out/dynillust-csp-profile-');
  try {
    await srv.assetIndex?.whenReady();
    const base = `http://127.0.0.1:${srv.port}`;
    const page0 = await fetch(`${base}/dev/uikit.html`);
    const csp = page0.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'/, 'the page is served with the site CSP');
    assert.doesNotMatch(csp, /unsafe-eval/, 'the site CSP allows no eval');
    browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: profile, args: [...gpuArgs(), '--mute-audio', '--no-first-run'] });

    // the shipped Worker: it boots, its renderer draws the red test square
    const page = await browser.newPage();
    await page.goto(`${base}/dev/uikit.html`, { waitUntil: 'load' });
    const ok = await page.evaluate(bootHost);
    assert.equal(ok.workers, 1, JSON.stringify(ok));
    assert.equal(ok.fallback, false);
    const [r, g, , a] = ok.probe[0];
    assert.ok(r > 200 && g < 50 && a > 200, `test square read back ${ok.probe[0]}`);

    // the same Worker without the no-eval patch, under the server's own response headers: its renderer cannot start,
    // so it must not take cards: the page falls back to its own stage
    const page2 = await browser.newPage();
    await page2.setRequestInterception(true);
    page2.on('request', async (req) => {
      if (!req.url().endsWith('/js/render/dynillust/worker.js')) { req.continue(); return; }
      const res = await fetch(req.url());
      const body = (await res.text()).replace('installPixiNoEval(P);', '/* patch left out for the test */');
      // (fetch gave the body decoded: no content-encoding / length of the original)
      const headers = Object.fromEntries([...res.headers].filter(([k]) => !['content-encoding', 'content-length'].includes(k)));
      req.respond({ status: 200, headers, body });
    });
    await page2.goto(`${base}/dev/uikit.html`, { waitUntil: 'load' });
    const bad = await page2.evaluate(bootHost);
    assert.equal(bad.workers, 0, JSON.stringify(bad));
    assert.equal(bad.fallback, true);
  } finally {
    await browser?.close();
    await srv.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
