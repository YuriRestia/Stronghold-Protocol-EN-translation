// test/match/bot-worker.e2e.test.js — (fork) piece 4 of docs/host-browser-bots.md: real Chrome, the real Worker
// (public/js/battle/botWorker.js) through the real page side (botHost.js). A bot's prep and a bot field's battle must come
// out exactly as in Node, from the same snapshots and specs, on the data the page loads itself.
//   SP_E2E=1 CHROME_PATH=… node --test test/match/bot-worker.e2e.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildWorld } from '../../server/match/botWorld.js';
import { createBotBattleRun, createBotBossRun, createBotRun, createBotWorkerEnv } from '../../server/match/botWorkerEnv.js';
import { wire } from './fakeBotHost.js';
import { DATA, makeMatch } from './harness.js';

const chrome = process.env.CHROME_PATH;
const enabled = process.env.SP_E2E === '1' && chrome && existsSync(chrome);
const human = { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true };
const bot = (seat) => ({ seat, playerId: `ai_${seat}`, name: `A${seat}`, isBot: true, connected: true });
const SEATS = [human, bot(1), bot(2), bot(3)];
const NODE = createBotWorkerEnv(DATA);

/** Snapshots of bot seats and bot fields' specs from a real match, at several points of the game. */
function fixtures() {
  const out = { worlds: [], specs: [] };
  // HARD too: its mode overrides config, which a Worker without the whole data set would not see
  for (const difficulty of ['NORMAL', 'HARD']) fixturesOf(difficulty, out);
  return out;
}

function fixturesOf(difficulty, { worlds, specs }) {
  const h = makeMatch({ mode: 'coop', difficulty, seats: SEATS, seed: 21, clientCombat: true, hostId: 'p_0', botBattles: 'host', botBattleAnswerMs: 1 }).autoHumans().start();
  for (const round of [2, 6, 10]) {
    h.run(() => h.m.phase === 'PREP' && h.m.round === round, { maxSteps: 2e7 });
    const ps = h.m.players.get(`ai_${(round % 3) + 1}`);
    const task = h.m.newBotTask(ps);
    worlds.push({ id: `t.${difficulty}.${round}`, world: wire(buildWorld(h.m, ps, { ...task })) });
    h.run(() => h.m.phase === 'COMBAT' && h.m.round === round, { maxSteps: 2e7 });
    const f = h.m.fields.find((x) => x.players.every((pid) => h.m.players.get(pid).isBot));
    // the same seed gives the same battle ids at both difficulties, and the page's answers are found by id
    if (f) specs.push({ battleId: `${difficulty}.${f.battleId}`, spec: wire(f.spec) });
  }
  h.m.dispose();
}

function nodeTask(world) {
  const run = createBotRun(wire(world), NODE.envFor(world.match.modeId));
  const plan = run.plan();
  run.rehearse();
  return wire({ plan: plan.moves, final: run.finish() });
}
function nodeBattle(spec) {
  const run = createBotBattleRun(spec, { ds: NODE.ds });
  run.run();
  return wire(run.output());
}

describe('the bot Worker in a real browser', { skip: !enabled && 'set SP_E2E=1 and CHROME_PATH', timeout: 300000 }, () => {
  let server, browser, page;
  const problems = [];
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    server = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run'] });
    page = await browser.newPage();
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('console', (m) => { if (m.type() === 'warn') console.log('page warning:', m.text()); });
    await page.goto(`http://127.0.0.1:${server.port}/sim/spec.js`);
    await page.evaluate(async () => {
      const { installBotHost } = await import('/js/battle/botHost.js');
      const handlers = new Map();
      const bridge = window.botTest = { sent: [], created: 0, handlers };
      bridge.host = installBotHost({
        net: { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, send(type, fields) { bridge.sent.push({ t: type, ...fields }); return true; } },
        createWorker() { bridge.created++; return new Worker('/js/battle/botWorker.js', { type: 'module' }); },
        log: console,
      });
      bridge.runTask = (id, world) => new Promise((resolve, reject) => {
        const out = {};
        const t0 = performance.now();
        bridge.host.task(id, world, {
          onBatch(b) {
            if (b.batch === 'plan') { out.plan = b.moves; out.planMs = performance.now() - t0; bridge.host.ack(id); return; }
            out.final = { moves: b.moves, memo: b.memo };
            out.finished = b.finished;
            out.totalMs = performance.now() - t0;
            resolve(out);
          },
          onFail: (why) => reject(new Error(why)),
        });
      });
      bridge.runBattle = (battleId, spec) => new Promise((resolve) => {
        const done = setInterval(() => {
          const m = bridge.sent.find((x) => x.battleId === battleId);
          if (m) { clearInterval(done); resolve(m); }
        }, 5);
        handlers.get('b.botBattle')({ battleId, spec });
      });
    });
  });
  after(async () => { await browser?.close(); await server?.close(); });

  const { worlds, specs } = enabled ? fixtures() : { worlds: [], specs: [] };

  test('a bot seat\'s prep gives the moves and memo Node gives', async () => {
    assert.equal(worlds.length, 6);
    for (const { id, world } of worlds) {
      const mine = await page.evaluate((i, w) => window.botTest.runTask(i, w), id, world);
      const node = nodeTask(world);
      assert.deepEqual(mine.plan, node.plan, `${id} plan`);
      assert.deepEqual(mine.final, node.final, `${id} final`);
      assert.equal(mine.finished, true);
      assert.ok(node.plan.length + node.final.moves.length > 0, `${id} made no moves`);
      console.log(`${id}: plan ${Math.round(mine.planMs)} ms, whole prep ${Math.round(mine.totalMs)} ms, snapshot ${Math.round(JSON.stringify(world).length / 1024)} KB`);
    }
  });

  test('a bot field\'s battle gives the result and timeline Node gives', async () => {
    assert.ok(specs.length >= 2, `${specs.length} bot fields`);
    for (const { battleId, spec } of specs) {
      const mine = await page.evaluate((i, s) => window.botTest.runBattle(i, s), battleId, spec);
      assert.equal(mine.error, undefined, battleId);
      const node = nodeBattle(spec);
      assert.deepEqual(mine.result, node.result, `${battleId} result`);
      assert.deepEqual(mine.timeline, node.timeline, `${battleId} timeline`);
    }
  });

  test('one Worker did it all, with no page errors', async () => {
    const created = await page.evaluate(() => window.botTest.created);
    assert.equal(created, 1);
    assert.deepEqual(problems, []);
  });

  test('a cancelled battle stays unanswered; the Worker still takes the next job', async () => {
    const { battleId, spec } = specs.at(-1);
    const again = await page.evaluate(async (i, s) => {
      const b = window.botTest;
      b.handlers.get('b.botBattle')({ battleId: 'gone', spec: s });
      b.handlers.get('b.botBattleCancel')({ battleId: 'gone' });
      const out = await b.runBattle(`${i}.again`, s);
      await new Promise((r) => setTimeout(r, 200));
      return { out, gone: b.sent.some((x) => x.battleId === 'gone') };
    }, battleId, spec);
    assert.equal(again.gone, false);
    assert.deepEqual(again.out.result, nodeBattle(spec).result);
  });

  test('a bot-only boss field runs live in the Worker: reports, then the result Node gives', async () => {
    const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', seats: SEATS, seed: 9108, fake: true, clientCombat: true, instant: false, hostId: 'p_0',
      script: (b) => (b.kind === 'boss' ? { bossDps: 200 } : { duration: 2 }) });
    h.autoHumans().start();
    assert.ok(h.drive(() => h.m.phase === 'FINAL_ASSAULT'));
    const f = h.m.fields.find((x) => x.players.every((pid) => h.m.players.get(pid).isBot));
    const { cs: _cs, ...spec } = wire(f.spec);
    const battleId = f.battleId;
    h.m.dispose();
    const out = await page.evaluate(async (id, s) => {
      const b = window.botTest;
      const start = b.sent.length;
      b.handlers.get('b.botBattle')({ battleId: id, spec: s, live: { elapsed: 0, speed: 2 } });
      await new Promise((r) => setTimeout(r, 1500));
      b.handlers.get('b.end')({ battleId: id, fieldId: s.fieldId, reason: 'forced' });
      const t0 = Date.now();
      while (!b.sent.slice(start).some((m) => m.t === 'b.result') && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
      return b.sent.slice(start);
    }, battleId, spec);
    const progress = out.filter((m) => m.t === 'b.progress');
    const result = out.find((m) => m.t === 'b.result');
    assert.ok(progress.length >= 3, `${progress.length} reports in 1.5 s`);
    assert.ok(result, 'a result after the end');
    assert.ok(progress.at(-1).gt > 0);
    assert.equal(result.battleId, battleId);
    // the Worker stopped at its own time, so the same battle stepped to that time gives its result
    const run = createBotBossRun(spec, { ds: NODE.ds, battleId });
    run.stepTo(result.result.time + 1 / 60); // half a tick: the time is rounded, and stepTo floors to a tick
    run.forceEnd('forced');
    assert.deepEqual(result.result, wire(run.result()));
  });

  test('/match/ serves the Worker\'s modules and nothing else', async () => {
    const get = (p) => fetch(`http://127.0.0.1:${server.port}${p}`);
    assert.equal((await get('/match/botWorkerEnv.js')).status, 200);
    assert.equal((await get('/match/match/infra.js')).status, 200);
    for (const p of ['/match/Match.js', '/match/llmGate.js', '/match/botStrategies.js']) assert.equal((await get(p)).status, 404, p);
  });
});
