// Real-server browser E2E — GitHub #139: the room's rules button glows (`is-new`) until this browser opens the rules
// dialog once; after that it doesn't (remembered in this browser).
//
//   SP_E2E=1 node --test test/ui/rules-new-glow.e2e.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Client, ROOT, hasChrome, startRealServer } from '../e2e/client.mjs';

const ENABLED = process.env.SP_E2E === '1' && hasChrome() && existsSync(path.join(ROOT, 'public/assets'));
const request = (c, t, body) => c.page.evaluate(async (t, body) => {
  const { net } = await import('/js/net.js');
  return net.request(t, body).then(() => 'ok', (e) => e?.code || 'error');
}, t, body);
const glows = (c) => c.page.evaluate(() => {
  const b = document.querySelector('.rules-open');
  return b ? { isNew: b.classList.contains('is-new'), anim: getComputedStyle(b).animationName } : null;
});

describe('#139 the rules button glows until first opened (real server)', { skip: !ENABLED && 'set SP_E2E=1 (Chrome + public/assets)' }, () => {
  test('glows, opens, stops glowing, remembered in this browser', { timeout: 3 * 60 * 1000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'rules-glow' });
    try {
      await host.open();
      await host.enter('凯尔希');
      assert.equal(await request(host, 'room.create', { mode: 'coop', difficulty: 'NORMAL' }), 'ok');
      await host.page.waitForSelector('.rules-open');
      assert.deepEqual(await glows(host), { isNew: true, anim: 'rules-new-glow' });
      await host.shot('glow');
      await host.click('.rules-open');
      await host.page.waitForSelector('.rules-dialog');
      await host.page.keyboard.press('Escape');
      assert.equal((await glows(host)).isNew, false);
      assert.equal(await host.page.evaluate(() => localStorage.getItem('sp.pref.lobby.rulesSeen')), 'true');
    } finally {
      await host.close();
      await srv.close?.();
    }
  });
});
