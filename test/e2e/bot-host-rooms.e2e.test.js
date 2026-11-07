// test/e2e/bot-host-rooms.e2e.test.js — (fork) piece 11 of docs/host-browser-bots.md: the rooms that play in a match host's child
// process. A real server with SP_BOT_EXECUTION=host, two real browsers: an old official version, a data plugin and a sandbox script
// plugin with sim and meta entries. The AI seats' preps and battles must run in the host's Worker, on the room's own content. The
// child checks every revealing move against what it computes itself, so a Worker that plays on different content or rules goes
// stale: stale, failover and error counts of 0 are the parity this test asserts.
// The sandbox case needs a real install: its child may not read outside the install root, so a worktree whose node_modules is a
// junction refuses the plugin (ERR_ACCESS_DENIED).
//   SP_E2E=1 CHROME_PATH=… node --test test/e2e/bot-host-rooms.e2e.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, hasChrome, sleep } from './client.mjs';
import { scriptFixture } from '../helpers/scriptFixtures.js';
import { writePlugin } from '../helpers/pluginFixtures.js';

const enabled = process.env.SP_E2E === '1' && hasChrome();
const BOT_FRAMES = ['b.botReceived', 'b.botMoves', 'b.botBattleResult'];
const saved = { exec: process.env.SP_BOT_EXECUTION, scripts: process.env.SP_PLUGIN_SCRIPTS };

before(() => { process.env.SP_BOT_EXECUTION = 'host'; });
after(() => {
  for (const [k, v] of [['SP_BOT_EXECUTION', saved.exec], ['SP_PLUGIN_SCRIPTS', saved.scripts]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const hookBotFrames = (c) => c.page.evaluate((types) => {
  const n = globalThis.__SP__.net;
  const orig = n.send.bind(n);
  globalThis.__botSent = [];
  n.send = (t, f) => {
    if (types.includes(t)) globalThis.__botSent.push({ t, batch: f?.batch, error: f?.error, moves: f?.moves?.map((m) => m.t), hasResult: !!f?.result });
    return orig(t, f);
  };
}, BOT_FRAMES);
const botSent = (c) => c.page.evaluate(() => globalThis.__botSent);
const request = (c, t, f) => c.page.evaluate((type, fields) => globalThis.__SP__.net.request(type, fields, { timeout: 90000 }), t, f);

/** The room up to its start: host, guest, the room's content chosen by `choose`, two AI seats. */
async function roomOf(t, srv, choose) {
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.url, 'host', { prefix: 'bothost-rooms', w: 1280, h: 720 });
  const guest = new Client(P, srv.url, 'guest', { prefix: 'bothost-rooms', w: 1280, h: 720 });
  t.after(async () => { await guest.close().catch(() => {}); await host.close().catch(() => {}); });
  await host.open();
  await host.enter('凯尔希');
  const { code } = await host.createCoop();
  await guest.open(`?room=${code}`);
  await guest.enter('阿米娅');
  await guest.waitFor((s) => s.room?.code === code, 'guest joined');
  await choose(host, guest);
  for (const c of [host, guest]) await c.page.waitForFunction(() => globalThis.__SP__.store.get().room?.seats?.filter((s) => s && !s.isBot).every((s) => s.content === 'ready' || s.content == null), { timeout: 90000 });
  for (let i = 0; i < 2; i++) { await request(host, 'room.addBot', {}); await sleep(200); }
  await hookBotFrames(host);
  await hookBotFrames(guest);
  await guest.click('.room-bar__right button', '准备就绪');
  await sleep(400);
  await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
  return { host, guest, code };
}

/** Play until `rounds` preps are done, humans readying as soon as the bots have. */
async function play({ host, guest, code }, srv, rounds) {
  for (const c of [host, guest]) await c.waitFor((s) => s.phase === 'INFO_CHECK' || s.phase === 'BAND_DRAFT' || s.phase === 'PREP', 'match started', 60000);
  for (const c of [host, guest]) await c.click('.brief__foot .btn--primary', '准备就绪', { optional: true, timeout: 5000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const st = await host.st();
    if (st.round > rounds) break;
    if (st.phase === 'PREP') {
      const diag = await srv.lobby.getRoom(code).match.diag();
      // bots done, or nothing to wait for: the prep moves on
      if (!diag || diag.botTaskStats) {
        const finals = (await botSent(host)).filter((m) => m.t === 'b.botMoves' && m.batch === 'final').length;
        if (finals >= st.round * 2) for (const c of [host, guest]) await c.page.evaluate(() => globalThis.__SP__.net.request('g.ready', { ready: true }).catch(() => null));
      }
    }
    await sleep(250);
  }
  return srv.lobby.getRoom(code).match.diag();
}

/** The same questions for every kind of room. */
async function assertPlayedInBrowser(room, srv, label) {
  const diag = await play(room, srv, 3);
  const sent = await botSent(room.host);
  const count = (t, pred = () => true) => sent.filter((m) => m.t === t && pred(m)).length;
  console.log(`${label}: ${JSON.stringify({ execution: diag.botExecution, tasks: diag.botTaskStats, battles: diag.botBattleStats, finals: count('b.botMoves', (m) => m.batch === 'final'), failed: count('b.botMoves', (m) => m.error) })}`);
  assert.equal(diag.botExecution, 'host', 'the child plays its bots through the browser');
  assert.ok(diag.botTaskStats.sent >= 6, `${diag.botTaskStats.sent} tasks`);
  assert.equal(diag.botTaskStats.stale, 0, 'the Worker computed what the child computes');
  assert.equal(diag.botTaskStats.errors, 0);
  assert.equal(diag.botTaskStats.failovers, 0);
  assert.equal(diag.botTaskStats.noHost, 0);
  assert.equal(diag.botBattleStats.rejected, 0);
  assert.ok(diag.botBattleStats.done >= 2, `${diag.botBattleStats.done} bot battles`);
  assert.ok(sent.some((m) => m.moves?.includes('g.move')), 'real board moves');
  assert.equal(count('b.botMoves', (m) => m.error), 0);
  assert.equal((await botSent(room.guest)).filter((m) => m.t === 'b.botMoves').length, 0);
}

const startServerFor = async (t, extra = {}) => {
  const { startServer } = await import('../../server/index.js');
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, assetIndex: false, ...extra, matchHost: { matchOptions: { timerScale: 0.25, combatSpeed: 8 } } });
  t.after(() => srv.close());
  return srv;
};

test('an old official version: bots play in the Worker on that version\'s data', { skip: !enabled && 'set SP_E2E=1 and CHROME_PATH', timeout: 420000 }, async (t) => {
  const srv = await startServerFor(t);
  const room = await roomOf(t, srv, async (host, guest) => {
    await request(host, 'room.proposeVersion', { version: 'act2autochess@V2_1' });
    const vote = await guest.page.waitForFunction(() => globalThis.__SP__.store.get().room?.versionVote?.id, { timeout: 15000 });
    const id = await vote.jsonValue();
    await request(guest, 'room.versionVote', { voteId: id, agree: true });
    await host.page.waitForFunction(() => globalThis.__SP__.store.get().room?.version === 'act2autochess@V2_1', { timeout: 30000 });
  });
  await assertPlayedInBrowser(room, srv, 'old version');
});

test('a data plugin: bots play in the Worker on the room\'s data', { skip: !enabled && 'set SP_E2E=1 and CHROME_PATH', timeout: 420000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-bot-data-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // a bond number the match reads, so the room's data differs from the official data
  writePlugin(path.join(dir, 'cheap'), { manifest: 2, name: { zh: '数值', en: 'Numbers' }, version: '1.0.0', app: '*', api: 1, class: 'content', scope: ['room'],
    authors: ['e2e'], permissions: ['data.patch'], data: ['p.json'] },
  { 'p.json': { patch: 1, ops: [['bb', 'base_def'], ['buffs', 0, 'bb', 'base_def']].map((p) => ({ op: 'set', file: 'bonds', id: 'deputShip', path: p, value: 0.3 })) } });
  const srv = await startServerFor(t, { pluginsDir: dir });
  const room = await roomOf(t, srv, async (host) => {
    await request(host, 'room.setPlugins', { plugins: [{ id: 'cheap' }] });
    await host.page.waitForFunction(() => globalThis.__SP__.store.get().room?.content?.vanilla === false, { timeout: 30000 });
  });
  await assertPlayedInBrowser(room, srv, 'data plugin');
});

test('a sandbox script plugin with sim and meta entries: bots play in the Worker with the room\'s scripts', { skip: !enabled && 'set SP_E2E=1 and CHROME_PATH', timeout: 420000 }, async (t) => {
  const f = scriptFixture(t, { mode: 'sandbox' });
  // the meta hook gives every seat funds each round, so a Worker that did not run it computes other purchases and goes stale
  f.put('training', `export default sp => {
    sp.content.register({ install(b) { b.on('battleStart', () => { for (const u of b.allyUnits) b.addBuff(u, { key: 'training', mods: { atkFlat: 2 } }); }); } });
    sp.meta.register('global:training', { onRoundStart(ctx) { ctx.addFunds(3); } });
  }`, { permissions: ['sim.code', 'meta.code'], entry: { sim: 'index.js', meta: 'index.js' } });
  process.env.SP_PLUGIN_SCRIPTS = 'sandbox';
  const srv = await startServerFor(t, { pluginsDir: f.pluginsDir });
  const room = await roomOf(t, srv, async (host, guest) => {
    await request(host, 'room.setPlugins', { plugins: [{ id: 'training' }] });
    for (const c of [host, guest]) await c.page.waitForFunction(() => globalThis.__SP__.store.get().room?.content?.execution === 'sandbox', { timeout: 30000 });
  });
  await assertPlayedInBrowser(room, srv, 'sandbox script plugin');
});
