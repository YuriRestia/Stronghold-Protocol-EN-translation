// test/ui/rules-modz.e2e.test.js — (Fish Edition) the Custom Lobby Modifications dialog's tabs and its Mod Z / W picker
// (ui/lobbyRules.js ModZPicker; shared/rules.js `modZ`: the modules the room equips, one per operator), in headless
// Chrome against a real server.
import { seedReleaseRead } from '../helpers/releaseNotes.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

test('rules dialog: tabs with in-force counts; Mod Z / W equipped per operator, one module each', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run', timeout: 90000 }, async () => {
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('sp.name', 'Kaltsit');
      sessionStorage.setItem('sp.entered', '1');
      localStorage.setItem('sp.pref.lang', JSON.stringify('en'));
    });
    await seedReleaseRead(page);
    await page.goto(`http://127.0.0.1:${srv.port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'), { timeout: 30000 });
    assert.equal(await page.evaluate(() => globalThis.__SP__.net.request('room.create', { mode: 'coop', difficulty: 'NORMAL' }).then(() => 'ok', (e) => e?.code || String(e))), 'ok');
    await page.waitForSelector('.room-screen .rules-open', { visible: true, timeout: 15000 });
    await page.click('.room-screen .rules-open');
    await page.waitForSelector('.rules-dialog .rules-tabs');
    const tabs = () => page.$$eval('.rules-dialog .rules-tabs [role=tab]', (els) => els.map((e) => e.textContent.trim()));
    assert.deepEqual(await tabs(), ['Cheats', 'Mod Z / W', 'Alliance', 'Less luck', 'Risk']);
    assert.ok(await page.$('.rules-dialog [data-rule="extraDeploy"], .rules-dialog .rules-sec'), 'the cheats tab first');
    assert.equal(await page.$('.rules-dialog [data-modz]'), null, 'one tab at a time');

    const tab = (label) => page.evaluate((l) => [...document.querySelectorAll('.rules-dialog .rules-tabs [role=tab]')].find((b) => b.textContent.trim().startsWith(l)).click(), label);
    await tab('Mod Z');
    await page.waitForSelector('.rules-dialog [data-modz]');
    assert.equal((await page.$$('.rules-dialog [data-modz]')).length, 14, 'one button per module');
    await page.click('.rules-dialog [data-modz="uniequip_fishz_weedy"]');
    await page.waitForFunction(() => (globalThis.__SP__.store.get().room?.rules?.modZ ?? []).includes('uniequip_fishz_weedy'), { timeout: 10000 });
    await page.click('.rules-dialog [data-modz="uniequip_fishz_typhon"]');
    await page.waitForFunction(() => (globalThis.__SP__.store.get().room?.rules?.modZ ?? []).length === 2, { timeout: 10000 });
    await page.click('.rules-dialog [data-modz="uniequip_fishw_typhon"]');
    await page.waitForFunction(() => (globalThis.__SP__.store.get().room?.rules?.modZ ?? []).includes('uniequip_fishw_typhon'), { timeout: 10000 });
    assert.deepEqual(await page.evaluate(() => globalThis.__SP__.store.get().room.rules.modZ), ['uniequip_fishw_typhon', 'uniequip_fishz_weedy'], 'Typhon W replaces his Z');
    assert.match(await tabs().then((l) => l[1]), /2$/, 'the tab counts the allowed modules');
    assert.match(await page.$eval('.room-screen .rules-summary', (e) => e.textContent), /Mod Z \/ W \(draft\): Typhon W, Weedy Z/);
    await page.click('.rules-dialog [data-modz="uniequip_fishz_weedy"]');
    await page.waitForFunction(() => (globalThis.__SP__.store.get().room?.rules?.modZ ?? []).length === 1, { timeout: 10000 });

    await tab('Risk');
    await page.waitForFunction(() => !document.querySelector('.rules-dialog [data-modz]'));
    assert.ok(await page.$('.rules-dialog .rules-sec'), 'the risk tab shows its section');
    await page.screenshot({ path: process.env.SP_SHOT ?? '/dev/null' }).catch(() => {});
  } finally { await browser.close(); await srv.close(); }
});
