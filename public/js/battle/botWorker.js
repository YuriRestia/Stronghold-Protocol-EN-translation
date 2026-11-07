// public/js/battle/botWorker.js — (fork) a module Worker that does the bot work the server hands this browser
// (docs/host-browser-bots.md Part B1): a bot seat's whole prep on a restored copy of the match, and a bot field's real battle.
// It never touches the page's game store, so no screen can draw what it holds. One job at a time, in the order they came:
// a bot's moves change what the next one sees, and battle work and prep work belong to different phases anyway.
//
//   postMessage → { t: 'ready' }                                once, when this script has been evaluated
//   onmessage ← { t: 'data', raw }                              the page's /data/*.json (once, before any job)
//             ← { t: 'battle', id, spec }                       a bot field's BattleSpec
//             ← { t: 'live', id, spec, elapsed, speed }         a bot-only boss field, played on its clock beside other work
//             ← { t: 'pool', hp, acked }                        the server's b.pool; { t: 'end', id, reason } its b.end
//             ← { t: 'task', id, world, budgetMs? }             a bot seat's prep (server/match/botWorld.js buildWorld)
//             ← { t: 'ack', id, stale? }                        the server took the plan batch: go on, or stop on `stale`
//             ← { t: 'hurry', id }                              stop rehearsing at the best layout so far
//             ← { t: 'cancel', id }                             drop that job, running or waiting
//   postMessage → { t: 'battle-done', id, result, timeline }
//               | { t: 'live-progress', id, msg } (4 Hz)
//               | { t: 'live-done', id, msg, result }
//               | { t: 'batch', id, batch: 'plan', moves, ms }  then, after the ack:
//               | { t: 'batch', id, batch: 'final', moves, memo, ms, finished }
//               | { t: 'failed', id, message }
//
// A running job stops at its next slice when cancelled. `budgetMs` bounds the rehearsal; past it the best layout so far stands.

// /match and /sim are served from server/, so they are no public/ path a static import could resolve
const { genUrl } = await import('../gen.js');
const { setSimData } = await import(genUrl('/sim/simdata.js'));
const { createBotWorkerEnv, createBotRun, createBotBattleRun, createBotBossRun } = await import(genUrl('/match/botWorkerEnv.js'));

/** Wall-clock ms of work between two looks at the message queue. */
const SLICE_MS = 50;

/** @type {null | ReturnType<typeof createBotWorkerEnv>} */
let world = null;
/** @type {any[]} */
const queue = [];
let running = null;
/** @type {Map<string, (ack: any) => void>} */
const waitingAck = new Map();

/** Let waiting messages (a cancel, an ack) be read. A channel, since a nested timer waits at least 4 ms each time. */
const breathe = () => new Promise((resolve) => {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => { port1.close(); resolve(); };
  port2.postMessage(0);
});

/** @param {any} job @param {(budgetMs: number) => boolean} step @param {number} [deadline] */
async function slices(job, step, deadline = Infinity) {
  for (;;) {
    if (step(SLICE_MS)) return true;
    await breathe();
    if (job.cancelled || job.hurried || performance.now() >= deadline) return false;
  }
}

/** Live boss fields, stepped together on a timer: they do not wait in the queue, and nothing in the queue waits for them. */
const LIVE_TICK_MS = 50;
const LIVE_REPORT_MS = 250;
/** @type {Map<string, any>} */
const live = new Map();
let liveTimer = null;

function pumpLive() {
  const now = performance.now();
  for (const job of [...live.values()]) {
    try {
      job.run.stepTo((job.elapsed + (now - job.t0) / 1000) * job.speed, LIVE_TICK_MS / 2);
      if (job.run.finished) finishLive(job);
      else if (now - job.reportedAt >= LIVE_REPORT_MS) {
        job.reportedAt = now;
        self.postMessage({ t: 'live-progress', id: job.id, msg: job.run.progress() });
      }
    } catch (e) {
      live.delete(job.id);
      self.postMessage({ t: 'failed', id: job.id, message: String((e && e.message) || e) });
    }
  }
  if (!live.size && liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

function finishLive(job) {
  live.delete(job.id);
  self.postMessage({ t: 'live-done', id: job.id, msg: job.run.progress(), result: job.run.result() });
}

function startLive(msg) {
  try {
    if (!world) throw new Error('simulation data not loaded');
    const now = performance.now();
    live.set(msg.id, { id: msg.id, elapsed: msg.elapsed, speed: msg.speed, t0: now, reportedAt: 0,
      fieldId: msg.spec.fieldId, run: createBotBossRun(msg.spec, { ds: world.ds, battleId: msg.id }) });
    if (!liveTimer) liveTimer = setInterval(pumpLive, LIVE_TICK_MS);
  } catch (e) {
    self.postMessage({ t: 'failed', id: msg.id, message: String((e && e.message) || e) });
  }
}

async function runBattle(job) {
  const run = createBotBattleRun(job.spec, { ds: world.ds });
  await slices(job, run.run);
  if (!job.cancelled) self.postMessage({ t: 'battle-done', id: job.id, ...run.output() });
}

async function runTask(job) {
  const run = createBotRun(job.world, world.envFor(job.world.match.modeId));
  const t0 = performance.now();
  if (job.world.pick) { // a band or card pick: one move, nothing to rehearse
    self.postMessage({ t: 'batch', id: job.id, batch: 'final', ms: performance.now() - t0, finished: true, ...run.pick() });
    return;
  }
  const plan = run.plan();
  self.postMessage({ t: 'batch', id: job.id, batch: 'plan', ms: performance.now() - t0, ...plan });
  const ack = await new Promise((resolve) => waitingAck.set(job.id, resolve));
  waitingAck.delete(job.id);
  if (job.cancelled || ack.stale) return;
  const t1 = performance.now();
  const deadline = Number.isFinite(job.budgetMs) ? t1 + job.budgetMs : Infinity;
  const finished = await slices(job, run.rehearse, deadline);
  if (job.cancelled) return;
  self.postMessage({ t: 'batch', id: job.id, batch: 'final', ms: performance.now() - t1, finished, ...run.finish() });
}

async function pump() {
  if (running) return;
  while (queue.length) {
    running = queue.shift();
    try {
      if (!world) throw new Error('simulation data not loaded');
      await (running.t === 'battle' ? runBattle(running) : runTask(running));
    } catch (e) {
      if (!running.cancelled) self.postMessage({ t: 'failed', id: running.id, message: String((e && e.message) || e) });
    }
    running = null;
  }
}

self.onmessage = (ev) => {
  const msg = ev && ev.data;
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'data':
      setSimData(msg.raw);
      world = createBotWorkerEnv(msg.raw);
      break;
    case 'battle':
    case 'task':
      queue.push({ ...msg, cancelled: false });
      pump();
      break;
    case 'ack':
      waitingAck.get(msg.id)?.(msg);
      break;
    case 'live':
      startLive(msg);
      break;
    case 'pool':
      for (const job of live.values()) job.run.syncPool(msg.hp, msg.acked ? msg.acked[job.fieldId] : undefined);
      break;
    case 'end': {
      const job = live.get(msg.id);
      if (!job) break;
      job.run.forceEnd(msg.reason);
      finishLive(job);
      break;
    }
    case 'hurry': {
      const job = running && running.id === msg.id ? running : queue.find((x) => x.id === msg.id);
      if (job) job.hurried = true;
      break;
    }
    case 'cancel': {
      live.delete(msg.id);
      const i = queue.findIndex((job) => job.id === msg.id);
      if (i >= 0) queue.splice(i, 1);
      if (running && running.id === msg.id) running.cancelled = true;
      waitingAck.get(msg.id)?.({ stale: true });
      break;
    }
    default:
  }
};

// The page holds its first job until this arrives: a message posted to a module Worker before its graph is evaluated is lost.
self.postMessage({ t: 'ready' });
