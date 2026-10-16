// SP_E2E=1 node --test test/ui/preload-import.browser.test.js
// (fork) The preload manager's zip import (ui/preload.js ImportZip → resources/index.js importPreloadZip), which replaced
// upstream's title-screen 导入素材包 and 下载完整素材: a zip laid out like `npm run package:preload` writes it (one folder,
// public/assets/…, README.txt) goes in through the manager's picker; the matching files are saved in the preload's cache
// and answered by the worker without asking the server; a file whose bytes differ is reported and not saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server/index.js';
import { writeZip } from '../../tools/preload-pack.mjs';
import { CHROME, hasChrome } from '../e2e/client.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Two small art files that exist here (fonts are always present; a UI picture when setup ran). */
function pickFiles() {
  const fonts = path.join(ROOT, 'public', 'fonts');
  const font = fs.readdirSync(fonts).find((f) => /\.woff2?$/.test(f));
  const icons = path.join(ROOT, 'public', 'assets', 'ui');
  let pic = null;
  if (fs.existsSync(icons)) {
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (pic) return;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.png$/.test(e.name) && fs.statSync(p).size < 200_000 && !/[[\]%\s]/.test(e.name)) pic = p;
      }
    };
    walk(icons);
  }
  return [font ? path.join(fonts, font) : null, pic].filter(Boolean)
    .map((abs) => ({ abs, site: `/${path.relative(path.join(ROOT, 'public'), abs).split(path.sep).join('/')}` }));
}

test('the preload manager imports a preload zip: matching files are saved and served by the worker, a changed one is refused', {
  skip: process.env.SP_E2E !== '1' || !hasChrome(), timeout: 120000,
}, async (t) => {
  const files = pickFiles();
  assert.ok(files.length >= 1, 'a font to import');
  const requests = [];
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const serve = srv.server.listeners('request')[0];
  srv.server.removeAllListeners('request');
  srv.server.on('request', (req, res) => { requests.push(req.url.split('?')[0]); serve.call(srv.server, req, res); });
  t.after(() => srv.close());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-preload-import-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const zipPath = path.join(tmp, 'Stronghold-Protocol-v9.9.9-preload.zip');
  const top = 'Stronghold-Protocol-v9.9.9-preload';
  // the font as the server has it; the picture (when setup ran) with other bytes: "didn't match"
  const [good, bad] = files;
  writeZip(zipPath, [
    { name: `${top}/README.txt`, data: Buffer.from('preload pack\n') },
    { name: `${top}/public${good.site}`, data: fs.readFileSync(good.abs) },
    ...(bad ? [{ name: `${top}/public${bad.site}`, data: Buffer.from('not the picture') }] : []),
  ]);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url);
  assert.equal(await page.$('[data-testid="asset-import"]'), null, 'no title-screen import button');
  assert.equal(await page.$('[data-testid="asset-download"]'), null, 'no title-screen download button');
  await page.waitForSelector('.title-preload__go');
  await page.click('.title-preload__go');
  await page.waitForSelector('[data-testid="preload-import-input"]');
  const picker = await page.$('[data-testid="preload-import-input"]');
  await picker.uploadFile(zipPath);
  await page.waitForFunction(() => /导入完成/.test(document.querySelector('[data-testid="preload-import-status"]')?.textContent || ''), { timeout: 60000 });
  const status = await page.$eval('[data-testid="preload-import-status"]', (el) => el.textContent);
  assert.match(status, new RegExp(`保存 1 个文件，${bad ? 1 : 0} 个与本服务器版本不符，1 个不属于预载`));
  // the worker answers an imported file from the preload's cache
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 20000 }).catch(() => null);
  if (await page.evaluate(() => navigator.serviceWorker.controller == null)) { await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 20000 }); }
  const before = requests.length;
  const got = await page.evaluate(async (site) => (await fetch(site)).status, good.site);
  assert.equal(got, 200);
  assert.ok(!requests.slice(before).includes(good.site), 'the imported file is not requested from the server');
  const saved = await page.evaluate(async (site) => {
    const c = await caches.open('sp-resources-v1');
    return (await c.match(location.origin + site))?.headers.get('X-SP-Resource') || null;
  }, good.site);
  assert.match(saved || '', /^[0-9a-f]{12}$/, 'saved with its preload hash');
  assert.deepEqual(errors, []);
});
