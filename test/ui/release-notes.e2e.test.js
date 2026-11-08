import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { APP_VERSION } from '../../shared/constants.js';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// (fork) no automatic opening: only the title footer's button opens the notes (ui/releaseNotes.js)
test('release notes: never open on their own, the button opens them with history, a match takes them down', {
  skip: !(process.env.SP_E2E === '1' && existsSync(CHROME)), timeout: 90000,
}, async () => {
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--no-sandbox', '--no-proxy-server'] });
  try {
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${srv.port}`;
    for (const doc of ['CHANGELOG.md', 'CHANGELOG.en.md']) {
      const response = await page.goto(`${base}/${doc}?v=old`);
      assert.equal(response.headers()['cache-control'], 'no-cache', doc);
      assert.match(await response.text(), /## 0\.3\.3/, doc);
    }
    assert.equal((await page.goto(`${base}/package.json`)).status(), 404);
    await page.evaluateOnNewDocument(() => { sessionStorage.setItem('sp.entryFilm.off', '1'); });
    await page.goto(`${base}/?lang=zh`);
    await page.waitForSelector('.release-notes-entry');
    assert.equal(await page.$('.release-notes'), null, 'a fresh install does not open them');
    await page.click('.release-notes-entry');
    await page.waitForSelector('.release-notes');
    assert.match(await page.$eval('.release-notes', (e) => e.textContent), new RegExp(APP_VERSION.replaceAll('.', '\\.')));
    await page.evaluate(() => [...document.querySelectorAll('.release-notes button')].find((b) => b.textContent.includes('更早版本')).click());
    assert.match(await page.$eval('.release-notes', (e) => e.textContent), /0\.3\.2/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.release-notes', { hidden: true });
    await page.reload();
    await page.waitForSelector('.release-notes-entry');
    assert.equal(await page.$('.release-notes'), null);
    await page.click('.release-notes-entry');
    await page.waitForSelector('.release-notes');
    await page.evaluate(async () => {
      const { store } = await import('/js/store.js');
      store.set({ session: { entered: true }, room: { inMatch: true } });
    });
    await page.waitForSelector('.release-notes', { hidden: true });
  } finally { await browser.close(); await srv.close(); }
});
