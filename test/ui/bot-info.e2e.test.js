// Real-server browser E2E — GitHub #87: an AI seat's ⓘ opens the 「AI 方案」 popup, every room bot described, the
// seat's own one marked.
//
//   SP_E2E=1 node --test test/ui/bot-info.e2e.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Client, ROOT, hasChrome, startRealServer } from '../e2e/client.mjs';
import { ROOM_BOTS } from '../../shared/botProfiles.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome() && existsSync(path.join(ROOT, 'public/assets'));
const request = (c, t, body) => c.page.evaluate(async (t, body) => {
  const { net } = await import('/js/net.js');
  return net.request(t, body).then(() => 'ok', (e) => e?.code || 'error');
}, t, body);

describe('#87 the AI profiles popup (real server)', { skip: !ENABLED && 'set SP_E2E=1 (Chrome + public/assets)' }, () => {
  test('an AI seat\'s ⓘ opens it, the seat\'s bot marked', { timeout: 3 * 60 * 1000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'bot-info' });
    try {
      await host.open();
      await host.enter('凯尔希');
      assert.equal(await request(host, 'room.create', { mode: 'coop', difficulty: 'NORMAL' }), 'ok');
      assert.equal(await request(host, 'room.addBot', {}), 'ok');
      await host.page.waitForSelector('[data-testid="seat-bot"]');
      assert.equal(await request(host, 'room.setBot', { seat: 1, bot: 'fish-tier6' }), 'ok');
      await host.page.waitForFunction(() => document.querySelector('[data-testid="seat-bot"]')?.value === 'fish-tier6');
      await host.click('[data-testid="seat-bot-info"]');
      await host.page.waitForSelector('.botinfo__bot');
      const got = await host.page.evaluate(() => ({
        bots: [...document.querySelectorAll('.botinfo__bot')].map((e) => e.dataset.bot),
        current: document.querySelector('.botinfo__bot.is-current')?.dataset.bot,
        tactics: [...document.querySelectorAll('.botinfo__bot.is-current .botinfo__tactics li')].length,
      }));
      assert.deepEqual(got, { bots: ROOM_BOTS.map((b) => b.id), current: 'fish-tier6', tactics: 2 });
      await host.shot('popup');
      await host.page.keyboard.press('Escape');
      await host.page.waitForFunction(() => !document.querySelector('.botinfo__bot'));
    } finally {
      await host.close();
      await srv.close?.();
    }
  });
});
