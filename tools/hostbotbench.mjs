#!/usr/bin/env node
// tools/hostbotbench.mjs — (fork) how long host-run bots think in a real browser: the real Worker (public/js/battle/botWorker.js)
// through the real page side (botHost.js), on bot-seat snapshots of whole matches, per strategy, room size and CPU speed.
// Each prep of a fixture match (legacy bots play it, so every strategy thinks over the same boards) gives one snapshot
// per live bot seat; every snapshot runs to the end (plan, every rehearsal, finish: no budget cut), one seat at a time as
// the host does. A round's think time is the sum over its bot seats, compared with that prep's bot budget
// (docs/host-browser-bots.md B8: clamp(40 % of prep, 15 s, 60 s) with 2+ humans; 30 s in a one-human room, which is untimed).
// Writes: console text and the small --json file only; Chrome's profile goes to a folder under .cache/hbb, deleted at the end.
// `--rates 1,4` asks for a run with the CPU slowed 4×. Chrome refuses DevTools throttling on a Worker target, and the page's
// throttle did not reach its dedicated Worker (2026-11-11), so a calibration loop in the Worker checks it and a speed that
// did not take is skipped, saying so: a phone's numbers need a real phone.
//
//   CHROME_PATH=… node tools/hostbotbench.mjs [--seats 4,8] [--strategies legacy,ioleta-adaptive] [--rates 1,4]
//                                             [--seed 21] [--max-rounds 20] [--json out.json]
// GPU Chrome (gpuArgs, muted): run it under the crew lock.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../server/match/botWorld.js';
import { wire } from '../test/match/fakeBotHost.js';
import { makeMatch } from '../test/match/harness.js';
import { gpuArgs } from './perfbench.mjs';

const PROFILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'hbb');
mkdirSync(PROFILE_ROOT, { recursive: true });

/** @param {string[]} argv */
export function parseArgs(argv) {
  const o = { seats: [4, 8], strategies: ['legacy', 'ioleta-adaptive'], rates: [1, 4], seed: 21, maxRounds: 20, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--seats') o.seats = v().split(',').map(Number);
    else if (a === '--strategies') o.strategies = v().split(',');
    else if (a === '--rates') o.rates = v().split(',').map(Number);
    else if (a === '--seed') o.seed = Number(v());
    else if (a === '--max-rounds') o.maxRounds = Number(v());
    else if (a === '--json') o.json = v();
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

/** The bot budget of a prep of `prepMs` (B8; 30 s untimed). */
export const roundBudgetMs = (prepMs) => (prepMs > 0 ? Math.min(prepMs, Math.max(15000, Math.min(60000, prepMs * 0.4))) : 30000);

/** p-th percentile (nearest rank) of numbers. */
export function pct(xs, p) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

/** Every live bot seat's snapshot at every prep of one match: 1 human, the rest bots; 8 seats = a Grand Alliance room. */
export function fixtures(seats, seed, maxRounds) {
  const list = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true },
    ...Array.from({ length: seats - 1 }, (_, i) => ({ seat: i + 1, playerId: `ai_${i + 1}`, name: `A${i + 1}`, isBot: true, connected: true }))];
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats: list, seed, fake: true, ...(seats > 4 ? { largeRoom: true } : {}) }).autoHumans().start();
  const rounds = [];
  for (let round = 1; round <= maxRounds; round++) {
    if (!h.run(() => h.m.ended || (h.m.phase === 'PREP' && h.m.round === round), { maxSteps: 2e7 }) || h.m.ended || h.m.phase !== 'PREP') break;
    // the round's prep time in a room with 2+ humans (gd.prepTime); a room with one human is untimed (soloUntimed: 30 s budget)
    const prepMs = (Number(h.m.gd.prepTime(round)) || 0) * 1000;
    const worlds = h.m.order.filter((ps) => ps.isBot && ps.alive).map((ps) => wire(buildWorld(h.m, ps, { ...h.m.newBotTask(ps) })));
    if (worlds.length) rounds.push({ round, prepMs, budgetMs: roundBudgetMs(prepMs), worlds });
  }
  h.m.dispose();
  return rounds;
}

/** The snapshot with every seat on `id`. */
const asStrategy = (world, id) => ({ ...world, strategies: Object.fromEntries(Object.keys(world.strategies).map((k) => [k, id])) });

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const chrome = process.env.CHROME_PATH;
  if (!chrome || !existsSync(chrome)) throw new Error('set CHROME_PATH');
  const fx = {};
  for (const seats of o.seats) {
    const t0 = Date.now();
    fx[seats] = fixtures(seats, o.seed, o.maxRounds);
    const n = fx[seats].reduce((s, r) => s + r.worlds.length, 0);
    console.log(`fixtures ${seats} seats: ${fx[seats].length} preps, ${n} bot snapshots (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const { startServer } = await import('../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const server = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  // the profile on I: (crew rule 23), bounded by Chrome's own small disk cache, and deleted below
  const profile = mkdtempSync(path.join(PROFILE_ROOT, 'chrome-'));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 90000, protocolTimeout: 600000, userDataDir: profile,
    args: [...gpuArgs(), '--mute-audio', '--disk-cache-size=52428800'] });
  const results = [];
  try {
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    const workerP = new Promise((resolve) => page.on('workercreated', resolve));
    await page.goto(`http://127.0.0.1:${server.port}/sim/spec.js`);
    await page.evaluate(async () => {
      const { installBotHost } = await import('/js/battle/botHost.js');
      const handlers = new Map();
      const bridge = window.botTest = { handlers };
      bridge.host = installBotHost({
        net: { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, send() { return true; } },
        createWorker() { return new Worker('/js/battle/botWorker.js', { type: 'module' }); },
        log: console,
      });
      bridge.runTask = (id, world) => new Promise((resolve, reject) => {
        const t0 = performance.now();
        let planMs = 0;
        bridge.host.task(id, world, {
          onBatch(b) {
            if (b.batch === 'plan') { planMs = performance.now() - t0; bridge.host.ack(id); return; }
            resolve({ planMs, totalMs: performance.now() - t0, finished: b.finished, moves: b.moves.length });
          },
          onFail: (why) => reject(new Error(why)),
        });
      });
    });
    // warm-up: starts the Worker (its start time is not a bot's think time) and loads its data
    const first = fx[o.seats[0]][0].worlds[0];
    await page.evaluate((w) => window.botTest.runTask('warm', w), first);
    const worker = await workerP;
    // Chrome throttles a page, not a Worker target ("only supported for pages"); the page's throttle has to reach its
    // dedicated Worker, which the calibration loop checks: at 4× it must take about 4× as long as at 1×
    const cdp = await page.createCDPSession();
    let seq = 0, baseCalib = 0;
    for (const rate of o.rates) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      const calib = await worker.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 3e7; i++) x = (x + i * 7) % 1000003; return [performance.now() - t, x]; });
      if (rate === 1) baseCalib = calib[0];
      const ratio = baseCalib ? calib[0] / baseCalib : NaN;
      console.log(`CPU ${rate}x: Worker calibration loop ${calib[0].toFixed(0)} ms (${ratio.toFixed(1)}× the 1× time)`);
      if (rate > 1 && baseCalib && ratio < rate * 0.6) {
        console.log(`CPU ${rate}x: the throttle did not reach the Worker; skipping this speed`);
        continue;
      }
      for (const seats of o.seats) {
        for (const strategy of o.strategies) {
          const rounds = [];
          for (const r of fx[seats]) {
            const seatsMs = [];
            for (const w of r.worlds) {
              const out = await page.evaluate((i, x) => window.botTest.runTask(i, x), `b${++seq}`, asStrategy(w, strategy));
              if (!out.finished) problems.push(`${strategy} ${seats}p round ${r.round}: not finished`);
              seatsMs.push(out.totalMs);
            }
            const totalMs = seatsMs.reduce((a, b) => a + b, 0);
            rounds.push({ round: r.round, bots: r.worlds.length, prepMs: r.prepMs, budgetMs: r.budgetMs, totalMs, seatsMs });
          }
          const row = summarize({ rate, seats, strategy, calibMs: calib[0], rounds });
          results.push(row);
          console.log(formatRow(row));
        }
      }
    }
    if (problems.length) console.log(`problems:\n  ${problems.join('\n  ')}`);
  } finally {
    await browser.close();
    await server.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  console.log(`\n${table(results)}`);
  if (o.json) writeFileSync(o.json, JSON.stringify({ seed: o.seed, results }, null, 1));
}

/** One configuration's numbers: a round's think time (all its bot seats) and one seat's, against the budget. */
export function summarize(row) {
  const totals = row.rounds.map((r) => r.totalMs);
  const seat = row.rounds.flatMap((r) => r.seatsMs);
  const share = row.rounds.map((r) => r.totalMs / r.budgetMs);
  return { ...row, roundP50: pct(totals, 50), roundP95: pct(totals, 95), roundMax: Math.max(...totals),
    seatP50: pct(seat, 50), seatP95: pct(seat, 95), budgetP50: pct(row.rounds.map((r) => r.budgetMs), 50),
    shareP95: pct(share, 95), over: row.rounds.filter((r) => r.totalMs > r.budgetMs).length,
    over30: row.rounds.filter((r) => r.totalMs > 30000).length };
}

const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
const formatRow = (r) => `${r.rate}x ${r.seats}p ${r.strategy}: round p50 ${s(r.roundP50)} p95 ${s(r.roundP95)} max ${s(r.roundMax)}, `
  + `seat p50 ${s(r.seatP50)} p95 ${s(r.seatP95)}, timed budget ${s(r.budgetP50)}, p95 ${Math.round(r.shareP95 * 100)} % of it, ${r.over}/${r.rounds.length} rounds over it, ${r.over30} over 30 s`;

export function table(rows) {
  const head = '| CPU | Seats | Strategy | Round p50 | Round p95 | Round max | One bot p50 | One bot p95 | Timed budget | p95 of it | Rounds over it | Rounds over 30 s (one human) |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|';
  return [head, sep, ...rows.map((r) => `| ${r.rate}x | ${r.seats} | ${r.strategy} | ${s(r.roundP50)} | ${s(r.roundP95)} | ${s(r.roundMax)} | `
    + `${s(r.seatP50)} | ${s(r.seatP95)} | ${s(r.budgetP50)} | ${Math.round(r.shareP95 * 100)} % | ${r.over}/${r.rounds.length} | ${r.over30}/${r.rounds.length} |`)].join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
