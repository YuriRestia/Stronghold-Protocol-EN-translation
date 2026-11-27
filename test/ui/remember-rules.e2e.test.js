// Real-server browser E2E — GitHub #143: a host's new room starts with the lobby rules this browser last used, and the
// rules dialog's "Clear all" sets them back to the original game (remembered too, so the next room starts plain).
// The pure parts: test/ui/remember-rules.test.js.
//
//   SP_E2E=1 node --test test/ui/remember-rules.e2e.test.js
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
/** Waits until the page's room rules satisfy `pred` (the store's room.state). */
const waitRules = (c, src, what) => c.page.waitForFunction(`(() => { const r = globalThis.__SP__.store.get().room?.rules; return !!r && (${src})(r); })()`, { timeout: 15000 })
  .catch((e) => { throw new Error(`${c.label}: ${what}: ${e.message}`); });
const pref = (c) => c.page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.lobby.rules') || 'null'));

describe('#143 remembered lobby rules (real server)', { skip: !ENABLED && 'set SP_E2E=1 (Chrome + public/assets)' }, () => {
  test('set rules, leave, a new room has them; Clear all; the next room is plain', { timeout: 3 * 60 * 1000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'remember-rules' });
    try {
      await host.open();
      await host.enter('凯尔希');
      assert.equal(await request(host, 'room.create', { mode: 'coop', difficulty: 'NORMAL' }), 'ok');
      await host.waitFor((s) => !!s.room?.code, 'room 1');
      assert.equal(await request(host, 'room.setRules', { rules: { extraFunds: true, ccLastLine: 1 } }), 'ok');
      await waitRules(host, '(r) => r.extraFunds === true', 'rules set');
      await host.page.waitForFunction(() => JSON.parse(localStorage.getItem('sp.pref.lobby.rules') || 'null')?.extraFunds === true, { timeout: 10000 });
      assert.equal((await pref(host)).ccLastLine, 1);
      assert.equal(await request(host, 'room.leave', {}), 'ok');
      await host.page.evaluate(() => globalThis.__SP__.store.set({ room: null })); // as test/ui/sweep.e2e.test.js
      // room 2: the remembered rules come back by themselves
      assert.equal(await request(host, 'room.create', { mode: 'coop', difficulty: 'NORMAL' }), 'ok');
      await waitRules(host, '(r) => r.extraFunds === true && r.ccLastLine === 1', 'room 2 restored');
      // Clear all, through the dialog
      await host.click('.rules-open');
      await host.click('.rules-clear');
      await waitRules(host, '(r) => r.extraFunds === false && r.ccLastLine === 0', 'cleared');
      await host.page.waitForFunction(() => JSON.parse(localStorage.getItem('sp.pref.lobby.rules') || 'null')?.extraFunds === false, { timeout: 10000 });
      await host.shot('cleared');
    } finally {
      await host.close();
      await srv.close?.();
    }
  });
});
