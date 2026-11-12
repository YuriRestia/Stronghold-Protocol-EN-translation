// (fork) Room chat in two real browsers (user, 2026-11-11; docs/design/network.md "Room chat"): a line reaches the other
// screen's log and the sender's seat bubble as plain text (no markup, no emoji, fancy letters folded), mute hides a
// player's lines and bubbles, the 7th line in 15 s pauses the sender's box, a reload gets the lines back, and a short
// screen shows the Chat button with an unread count that opens the log as a sheet.
//   SP_E2E=1 node --test test/ui/room-chat.e2e.test.js
// Screenshots: test/e2e/out/room-chat-*.png.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { Client, ROOT, hasChrome, startRealServer, problemsOf, sleep } from '../e2e/client.mjs';

const ENABLED = process.env.SP_E2E === '1' && hasChrome() && existsSync(path.join(ROOT, 'public/assets'));

const request = (c, t, body) => c.page.evaluate(async (t, body) => {
  const { net } = await import('/js/net.js');
  return net.request(t, body).then(() => 'ok', (e) => e?.code || 'error');
}, t, body);
/** The log as one client shows it: each line's text, and whether any line holds an element it should not. */
const logOf = (c) => c.page.evaluate(() => ({
  lines: [...document.querySelectorAll('.clog__line')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  markup: !!document.querySelector('.clog__x *'),
}));
const say = async (c, text) => {
  await c.page.click('[data-testid="room-chat-input"]');
  await c.page.keyboard.type(text);
  await c.page.keyboard.press('Enter');
};
const waitLine = (c, part, what) => c.page.waitForFunction((part) => [...document.querySelectorAll('.clog__line')]
  .some((e) => e.textContent.includes(part)), { timeout: 10000 }, part).catch((e) => { throw new Error(`${c.label}: ${what}: ${e.message}`); });

describe('room chat (real server)', { skip: !ENABLED && 'set SP_E2E=1 (Chrome + public/assets)' }, () => {
  test('log, bubbles, plain text, mute, the spam pause, a reload, a short screen', { timeout: 4 * 60 * 1000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'room-chat', w: 1546, h: 905 });
    const guest = new Client(P, srv.base, 'guest', { prefix: 'room-chat', w: 1280, h: 720 });
    try {
      await host.open();
      await host.enter('凯尔希');
      assert.equal(await request(host, 'room.create', { mode: 'coop', difficulty: 'NORMAL' }), 'ok');
      const { code } = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
      await host.page.waitForSelector('[data-testid="room-chat"]');
      await guest.open();
      await guest.enter('阿米娅');
      assert.equal(await request(guest, 'room.join', { code }), 'ok');
      await guest.page.waitForSelector('[data-testid="room-chat"]');
      await waitLine(host, '阿米娅 加入了同盟', 'the join line');

      // a line: plain text on the other screen and in the sender's own log, a bubble over the sender's seat on both
      await say(guest, '<b>gl</b> hf 😂 𝓻𝓮𝓪𝓭𝔂');
      await waitLine(host, '阿米娅: gl hf ready', 'the guest\'s line on the host\'s screen');
      await waitLine(guest, '阿米娅: gl hf ready', 'the guest\'s own line');
      for (const c of [host, guest]) {
        assert.equal((await logOf(c)).markup, false, `${c.label}: a line is text, never markup`);
        await c.page.waitForFunction(() => [...document.querySelectorAll('.rseat__bubble')].some((b) => b.textContent.includes('gl hf ready')), { timeout: 5000 });
      }
      await host.shot('line');

      // (fork, user 2026-11-12) the docked chat as an MMO chat box: a press outside fades it and lets presses through to
      // the cards under it, a press into the input row brings it back; the top-right grip resizes it, never below the size
      // that keeps the input row whole; ▾ folds it to the input row with an unread count; a double click on the grip resets
      const box = (c) => c.page.evaluate(() => {
        const el = document.querySelector('[data-testid="room-chat"]');
        const r = el.getBoundingClientRect();
        const row = ['.clog__box', '.clog__cnt', '.clog__send', '.clog__in .ewheel__btn', '.clog__fold']
          .map((s) => document.querySelector(s)?.getBoundingClientRect()).filter(Boolean).map((q) => ({ l: q.left, r: q.right }));
        return { cls: el.className, w: Math.round(r.width), h: Math.round(r.height), left: r.left, right: r.right, top: r.top, row,
          under: (() => { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 12); return hit ? !!hit.closest('.clog') : null; })(),
          style: el.getAttribute('style') || '' };
      });
      const outside = () => host.page.mouse.click(1546 / 2, 45); // the empty middle of the top bar, well clear of the chat
      await outside();
      await host.page.waitForFunction(() => document.querySelector('[data-testid="room-chat"]').classList.contains('is-idle'), { timeout: 3000 });
      assert.equal((await box(host)).under, false, 'faded, the log lets presses through to what is under it');
      await host.click('[data-testid="room-chat-input"]');
      assert.ok(!(await box(host)).cls.includes('is-idle'), 'a press into the input row brings it back');
      assert.equal((await box(host)).under, true);
      // drag the grip up and right
      const drag = async (dx, dy) => {
        const g = await host.page.$eval('[data-testid="room-chat-grip"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await host.page.mouse.move(g.x, g.y);
        await host.page.mouse.down();
        await host.page.mouse.move(g.x + dx / 2, g.y + dy / 2, { steps: 4 });
        await host.page.mouse.move(g.x + dx, g.y + dy, { steps: 4 });
        await host.page.mouse.up();
      };
      const b0 = await box(host);
      await drag(220, -160);
      const bigger = await box(host);
      assert.ok(Math.abs(bigger.w - (b0.w + 220)) <= 2 && Math.abs(bigger.h - (b0.h + 160)) <= 2, `resized by the drag: ${JSON.stringify([b0, bigger])}`);
      assert.ok(Math.abs(bigger.left - b0.left) <= 1, 'the left edge stays put');
      const saved = await host.page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.roomChatSize')));
      assert.deepEqual(saved, { w: bigger.w, h: bigger.h }, 'the size is remembered');
      // far too small: stops at the size that keeps the input row whole (nothing overlaps, all inside the box)
      await drag(-3000, 3000);
      const small = await box(host);
      assert.ok(small.w < b0.w && small.h < bigger.h, `shrunk: ${JSON.stringify(small)}`);
      for (let i = 1; i < small.row.length; i++) assert.ok(small.row[i].l >= small.row[i - 1].r - 0.5, `input row items overlap at the minimum: ${JSON.stringify(small.row)}`);
      assert.ok(small.row[small.row.length - 1].r <= small.right + 0.5, 'the last button stays inside the box');
      assert.ok(small.row[0].r - small.row[0].l >= 60, 'the message box keeps room to type');
      // too big: never over the top bar
      await drag(3000, -3000);
      const top = await host.page.evaluate(() => document.querySelector('.rs-top').getBoundingClientRect().bottom);
      assert.ok((await box(host)).top >= top, 'never over the top bar');
      // fold: the input row only; a new line shows as an unread count on ▴
      await host.click('[data-testid="room-chat-fold"]');
      assert.match((await box(host)).cls, /is-folded/);
      assert.ok((await box(host)).h < 80, 'folded to the input row');
      assert.ok((await box(host)).w <= small.w + 1, 'folded to the smallest width, whatever size it had');
      await sleep(1600);
      await say(guest, 'folded?');
      await host.page.waitForFunction(() => document.querySelector('[data-testid="room-chat-unread"]')?.textContent === '1', { timeout: 5000 });
      await host.click('[data-testid="room-chat-fold"]');
      assert.ok(!(await box(host)).cls.includes('is-folded'));
      assert.equal(await host.page.$('[data-testid="room-chat-unread"]'), null, 'unfolded: read');
      // a double click on the grip goes back to the default dock
      const g = await host.page.$eval('[data-testid="room-chat-grip"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      for (let i = 0; i < 2; i++) { await host.page.mouse.move(g.x, g.y); await host.page.mouse.down(); await host.page.mouse.up(); await sleep(60); }
      await sleep(200);
      assert.equal((await box(host)).style, '', 'the default dock again');
      assert.equal(await host.page.evaluate(() => localStorage.getItem('sp.pref.roomChatSize')), 'null');
      await say(host, 'welcome 加油，我们能赢！');
      await waitLine(guest, '凯尔希: welcome 加油，我们能赢！', 'the host\'s line, fullwidth punctuation kept');

      // mute: the guest's lines leave the host's log and no new bubble shows; unmuting brings the lines back
      await host.page.click('.rseat__mute');
      await host.page.waitForFunction(() => ![...document.querySelectorAll('.clog__line')].some((e) => e.textContent.includes('gl hf ready')), { timeout: 5000 });
      await sleep(1600);
      await say(guest, 'can you hear me');
      await waitLine(guest, 'can you hear me', 'the guest still sees its own line');
      await sleep(800);
      assert.ok(!(await logOf(host)).lines.some((l) => l.includes('can you hear me')), 'a muted player\'s line never reaches the log');
      await host.page.click('.rseat__mute');
      await waitLine(host, 'gl hf ready', 'unmuted: the earlier lines are back');

      // the spam limit: the 7th line inside 15 s pauses the sender's box (the page keeps its own 1.5 s gap)
      for (let i = 0; i < 6; i++) { await sleep(1600); await say(guest, `line ${i}`); }
      await guest.page.waitForFunction(() => document.querySelector('[data-testid="room-chat-input"]')?.disabled === true, { timeout: 10000 });
      await waitLine(guest, '发送太快了', 'the pause line in the sender\'s log');
      assert.ok(!(await logOf(host)).lines.some((l) => l.includes('发送太快了')), 'only the sender hears of its pause');
      await guest.shot('paused');

      // a reload: the lines the host got before come back from the server's memory — the muted guest's line too, since a
      // mute is this page's own and resets with it (match chat's rule)
      const before = (await logOf(host)).lines.filter((l) => /^\d\d:\d\d/.test(l)).length;
      await host.page.reload({ waitUntil: 'domcontentloaded' });
      await host.page.waitForSelector('[data-testid="room-chat"]', { timeout: 30000 });
      await waitLine(host, 'gl hf ready', 'the history after a reload');
      const after = (await logOf(host)).lines.filter((l) => /^\d\d:\d\d/.test(l));
      assert.equal(after.length, before + 1, 'every line it was sent, once');
      assert.ok(after.some((l) => l.includes('can you hear me')), 'the line it had muted');

      // a short screen: the Chat button with the unread count, the log as a sheet
      await guest.page.setViewport({ width: 844, height: 390 });
      await guest.page.waitForSelector('[data-testid="room-chat-open"]', { timeout: 5000 });
      await say(host, 'phone check');
      await guest.page.waitForFunction(() => document.querySelector('.clog-mini__badge')?.textContent === '1', { timeout: 10000 });
      await guest.shot('phone-closed');
      await guest.page.click('[data-testid="room-chat-open"]');
      await waitLine(guest, '凯尔希: phone check', 'the sheet shows the log');
      await guest.shot('phone-open');
      assert.deepEqual(problemsOf([host, guest]), []);
    } finally {
      await host.close();
      await guest.close();
      await srv.stop();
    }
  });
});
