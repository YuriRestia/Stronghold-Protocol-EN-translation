// test/e2e/bot-host.e2e.test.js — (fork) piece 6 of docs/host-browser-bots.md: a real server with SP_BOT_EXECUTION=host and two
// real browsers on the real app. The AI seats' preps and battles run in the host's Worker; when the host leaves mid-game the
// other browser takes over. Humans ready up through the page's own socket: the UI is coop.e2e.mjs's job.
//   SP_E2E=1 CHROME_PATH=… node --test test/e2e/bot-host.e2e.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, sleep, startRealServer } from './client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();
const BOT_FRAMES = ['b.botReceived', 'b.botMoves', 'b.botHidden', 'b.botBattleResult'];

/** Record what this page's botHost sends, without changing it. */
const hookBotFrames = (c) => c.page.evaluate((types) => {
  const n = globalThis.__SP__.net;
  const orig = n.send.bind(n);
  globalThis.__botSent = [];
  n.send = (t, f) => {
    if (types.includes(t)) globalThis.__botSent.push({ t, batch: f?.batch, error: f?.error, hidden: f?.hidden, moves: f?.moves?.map((m) => m.t), hasResult: !!f?.result, timeline: f?.timeline?.length, at: Date.now() });
    return orig(t, f);
  };
}, BOT_FRAMES);
const botSent = (c) => c.page.evaluate(() => globalThis.__botSent);
const countOf = (sent, t, pred = () => true) => sent.filter((m) => m.t === t && pred(m)).length;
const requestReady = (c) => c.page.evaluate(() => globalThis.__SP__.net.request('g.ready', { ready: true }).catch(() => null));

/** Wait for a prep of at least `round`, or fail with what the page shows. */
const toPrep = (c, round) => c.waitFor((s) => s.phase === 'PREP' && s.round >= round, `prep of round ${round}`, 90000);

test('two browsers: bots play in the host\'s Worker, and the other browser takes over when the host leaves', { skip: !enabled && 'set SP_E2E=1 and CHROME_PATH', timeout: 600000 }, async (t) => {
  const srv = await startRealServer({ fast: { timerScale: 0.25, combatSpeed: 8 }, env: { SP_BOT_EXECUTION: 'host' } });
  t.after(() => srv.stop());
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.base, 'host', { prefix: 'bothost' });
  const guest = new Client(P, srv.base, 'guest', { w: 1280, h: 720, prefix: 'bothost' });
  t.after(async () => { await guest.close().catch(() => {}); await host.close().catch(() => {}); });

  await host.open();
  await host.enter('凯尔希');
  const room = await host.createCoop();
  await host.click('button', '添加 AI 队友');
  await sleep(300);
  await host.click('button', '添加 AI 队友');
  await guest.open(`?room=${room.code}`);
  await guest.enter('阿米娅');
  await guest.waitFor((s) => s.room?.code === room.code, 'guest joined');
  await hookBotFrames(host);
  await hookBotFrames(guest);
  await guest.click('.room-bar__right button', '准备就绪');
  await sleep(400);
  await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
  for (const c of [host, guest]) await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
  for (const c of [host, guest]) await c.click('.brief__foot .btn--primary', '准备就绪');

  // rounds with the host at work
  for (let round = 1; round <= 3; round++) {
    await toPrep(host, round);
    await host.waitFor(() => true, 'tick', 1000);
    const seen = countOf(await botSent(host), 'b.botMoves', (m) => m.batch === 'final');
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      if (countOf(await botSent(host), 'b.botMoves', (m) => m.batch === 'final') >= seen + 2) break;
      const s = await host.st();
      if (s.phase !== 'PREP' || s.round !== round) break;
      await sleep(150);
    }
    for (const c of [host, guest]) await requestReady(c);
    await host.waitFor((s) => s.phase !== 'PREP' || s.round !== round, `round ${round} prep ends`, 60000);
  }
  const worked = await botSent(host);
  const firstReceipt = worked.find((m) => m.t === 'b.botReceived');
  const firstAnswer = worked.find((m) => m.t === 'b.botMoves');
  console.log(`first bot task of the match, Worker warmed at the briefing, real time: ${firstAnswer.at - firstReceipt.at} ms`);
  const trace = (sent) => sent.map((m) => `${m.at - firstReceipt.at}:${m.t.slice(5)}${m.batch ? `.${m.batch}` : ''}${m.error ? '!' : ''}${m.hidden !== undefined ? `=${m.hidden}` : ''}`).join(' ');
  console.log(`host frames: ${trace(worked)}`);
  console.log(`guest frames: ${trace(await botSent(guest))}`);
  assert.ok(countOf(worked, 'b.botMoves', (m) => m.batch === 'final') >= 4, 'the host played the bots\' preps');
  assert.ok(worked.some((m) => m.t === 'b.botMoves' && m.moves?.includes('g.move')), 'with real board moves');
  assert.ok(worked.some((m) => m.t === 'b.botMoves' && m.moves?.includes('g.ready')), 'and Ready');
  assert.ok(worked.some((m) => m.t === 'b.botMoves' && m.moves?.includes('g.band')), 'and the bots\' band picks');
  assert.equal(countOf(worked, 'b.botMoves', (m) => m.error), 0);
  assert.equal(countOf(worked, 'b.botBattleResult', (m) => m.error), 0);
  assert.equal(countOf(await botSent(guest), 'b.botMoves'), 0, 'the guest was not asked while the host was there');

  // bot fields' battles ran on the host before it leaves
  const s3 = await host.st();
  await toPrep(host, s3.round + (s3.phase === 'PREP' ? 0 : 1));
  const battles = countOf(await botSent(host), 'b.botBattleResult', (m) => m.hasResult);
  assert.ok(battles >= 2, `${battles} bot battles`);

  // the host leaves: its browser goes away, and the guest does the work from here on
  const before = (await guest.st()).round;
  await host.close();
  await guest.waitFor((s) => s.phase === 'PREP' || s.round > before, 'the game goes on', 60000);
  const t1 = Date.now();
  while (Date.now() - t1 < 40000) {
    if (countOf(await botSent(guest), 'b.botMoves', (m) => m.batch === 'final') >= 2) break;
    await sleep(200);
  }
  await requestReady(guest);
  const next = (await guest.st()).round + 1;
  await toPrep(guest, next);
  const taken = await botSent(guest);
  console.log(`guest after the host left: ${countOf(taken, 'b.botReceived')} tasks, ${countOf(taken, 'b.botMoves', (m) => m.batch === 'final')} finals, ${countOf(taken, 'b.botBattleResult')} bot battles`);
  assert.ok(countOf(taken, 'b.botMoves', (m) => m.batch === 'final') >= 2, 'the guest played the bots');
  assert.ok(countOf(taken, 'b.botBattleResult', (m) => m.hasResult) >= 1, 'and their battles');
  assert.equal(countOf(taken, 'b.botMoves', (m) => m.error), 0);

  // a checkout without art or sound shows many load errors, in Spine and in the page's asset loaders: only this feature's count here
  const errors = guest.problems.filter((p) => /botHost|botWorker|\/match\/|botTask|botMoves|botBattle/.test(p));
  assert.deepEqual(errors, []);
  const serverErrors = srv.logs.filter((l) => /\berror\b/i.test(l) && /bot|match/i.test(l));
  assert.deepEqual(serverErrors.slice(0, 5), []);
});
