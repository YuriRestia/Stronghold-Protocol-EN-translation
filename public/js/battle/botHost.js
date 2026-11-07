// public/js/battle/botHost.js — (fork) the page's side of the bot work this browser does for the match
// (docs/host-browser-bots.md Part B1). It passes frames straight between the socket and one module Worker
// (battle/botWorker.js). Nothing here reaches the page's game store: no screen can draw a bot's shop or a teammate's hand
// from these frames.
//
// b.botBattle → the Worker → b.botBattleResult, or `{ error: true }` when this browser cannot run it, so the server asks the
// next human at once. b.botTask → b.botReceived → the Worker → b.botMoves (plan) → b.botAck → b.botMoves (final). A hidden tab
// may be frozen, so it says so (b.botHidden) instead of taking work, and the server moves the work on at once.
//
// The socket going down or the match ending drops everything: an answer could not be delivered, and the Worker is terminated.
// It is built on the first job, so a match that never asks costs nothing.
//
//   installBotHost({ net, runner, createWorker, log, doc }) → { busy(), task(), ack(), hurry(), cancel(), clear(), dispose() } | null

import { battleRunner } from './runner.js';
import { genUrl } from '../gen.js';

export const BOT_WORKER_URL = genUrl('/js/battle/botWorker.js'); // (fork) in this page's server generation

/**
 * @param {{ net?: any, runner?: any, createWorker?: () => Worker, log?: any, doc?: any }} [deps] `doc`: the page's document (tests)
 * @returns {null | { busy: () => number, task: Function, ack: Function, hurry: Function, cancel: Function, clear: () => void, dispose: () => void }}
 */
export function installBotHost({ net, runner = battleRunner, createWorker = () => new Worker(BOT_WORKER_URL, { type: 'module' }), log = console, doc = globalThis.document } = {}) {
  if (!net || typeof net.on !== 'function' || !runner || typeof runner.ensureSim !== 'function') return null;
  /** @type {any} the live Worker; replaced as a whole, so a late callback of the old one finds itself unknown */
  let w = null;
  /** The browser cannot run a module Worker: every job is answered as failed at once. */
  let broken = false;
  /** @type {Map<string, { fail: (why: string) => void, onMessage?: (msg: any) => void }>} jobs the Worker owes an answer */
  const jobs = new Map();
  /** This match has asked for bot work, so the server wants to hear about the tab. */
  let asked = false;
  let reportedHidden = false;

  const isHidden = () => doc?.hidden === true;
  const reportTab = () => {
    if (reportedHidden === isHidden()) return;
    reportedHidden = isHidden();
    net.send('b.botHidden', { hidden: reportedHidden });
  };

  const answerBattle = (battleId, fields) => net.send('b.botBattleResult', { battleId, ...fields });

  const failAll = (why) => {
    const open = [...jobs.values()];
    jobs.clear();
    for (const job of open) job.fail(why);
  };

  const kill = () => {
    const dead = w;
    w = null;
    if (dead) { try { dead.port.terminate(); } catch { /* ignore */ } }
  };

  const onWorkerMessage = (inst, msg) => {
    if (!msg || w !== inst) return;
    if (msg.t === 'ready') { inst.ready(); return; }
    const job = jobs.get(msg.id);
    if (!job) return; // an answer to a job that was dropped
    if (msg.t === 'failed') {
      jobs.delete(msg.id);
      log.warn?.('[botHost] a job failed', msg.message);
      job.fail(msg.message);
      return;
    }
    job.onMessage?.(msg);
  };

  /** The live Worker, created on the first job; null when this browser cannot run one. */
  const worker = () => {
    if (w || broken) return w;
    const inst = { port: null, ready: () => {}, loaded: null };
    const scriptRan = new Promise((resolve) => { inst.ready = resolve; });
    try {
      inst.port = createWorker();
    } catch (err) {
      log.warn?.('[botHost] module Worker unavailable', err);
      broken = true;
      return null;
    }
    inst.port.onmessage = (ev) => onWorkerMessage(inst, ev && ev.data);
    inst.port.onerror = (ev) => {
      if (w !== inst) return;
      log.warn?.('[botHost] the Worker failed', ev && ev.message);
      broken = true;
      kill();
      failAll('the Worker failed');
    };
    w = inst;
    // the page's own copy of the data: no second fetch, no second parse. Official data only until piece 11.
    inst.loaded = scriptRan.then(() => runner.ensureSim()).then((sim) => {
      if (!sim || !sim.raw || (typeof sim.cs === 'string' && sim.cs !== '')) throw new Error('no official simulation data');
      if (w === inst) inst.port.postMessage({ t: 'data', raw: sim.raw });
    });
    inst.loaded.catch((err) => {
      if (w !== inst) return;
      log.warn?.('[botHost] simulation data unavailable', err);
      kill();
      failAll('no simulation data');
    });
    return inst;
  };

  /** Hand a job over once the Worker can read it; a job dropped meanwhile never goes. */
  const post = (id, msg) => {
    const inst = worker();
    if (!inst) { const job = jobs.get(id); jobs.delete(id); job?.fail('no module Worker'); return; }
    inst.loaded.then(() => { if (w === inst && jobs.has(id)) inst.port.postMessage(msg); }, () => { /* failAll answered it */ });
  };

  /** A bot-only boss field: it reports through the frames a human's battle uses. A failure stays silent: the server's watchdog moves it on. */
  const startLive = (battleId, spec, { elapsed, speed }) => {
    jobs.set(battleId, {
      live: true,
      fail: () => {},
      onMessage(m) {
        if (m.t === 'live-progress') { net.send('b.progress', m.msg); return; }
        if (m.t !== 'live-done') return;
        jobs.delete(battleId);
        net.send('b.progress', m.msg);
        net.send('b.result', { battleId, result: m.result });
      },
    });
    post(battleId, { t: 'live', id: battleId, spec, elapsed, speed });
  };

  const onBattle = (msg) => {
    if (!msg || typeof msg.battleId !== 'string' || !msg.spec || typeof msg.spec !== 'object') return;
    const { battleId, spec } = msg;
    asked = true;
    if (isHidden()) { reportTab(); return; }
    if (broken || (typeof spec.cs === 'string' && spec.cs !== '')) { answerBattle(battleId, { error: true }); return; }
    if (msg.live) { startLive(battleId, spec, msg.live); return; }
    jobs.set(battleId, {
      fail: () => answerBattle(battleId, { error: true }),
      onMessage(m) {
        if (m.t !== 'battle-done') return;
        jobs.delete(battleId);
        answerBattle(battleId, { result: m.result, timeline: m.timeline });
      },
    });
    post(battleId, { t: 'battle', id: battleId, spec });
  };

  const drop = (id) => {
    if (jobs.delete(id)) w?.port.postMessage({ t: 'cancel', id });
  };

  const clear = () => {
    kill();
    jobs.clear();
    asked = false;
    reportedHidden = false;
  };

  const startTask = (id, world, { budgetMs, onBatch, onFail }) => {
    jobs.set(id, {
      fail: onFail,
      onMessage(m) {
        if (m.t !== 'batch') return;
        if (m.batch === 'final') jobs.delete(id);
        onBatch(m);
      },
    });
    post(id, { t: 'task', id, world, budgetMs });
  };

  const onTask = (msg) => {
    if (!msg || typeof msg.taskId !== 'string' || !msg.world || typeof msg.world !== 'object') return;
    const { taskId } = msg;
    asked = true;
    net.send('b.botReceived', { taskId });
    if (isHidden()) { reportTab(); return; }
    if (broken) { net.send('b.botMoves', { taskId, error: true }); return; }
    startTask(taskId, msg.world, {
      budgetMs: msg.budgetMs,
      onBatch: (b) => net.send('b.botMoves', { taskId, batch: b.batch, moves: b.moves, ...(b.memo ? { memo: b.memo } : {}) }),
      onFail: () => net.send('b.botMoves', { taskId, error: true }),
    });
  };

  const ack = (id, { stale = false } = {}) => {
    if (stale) jobs.delete(id);
    if (w) w.port.postMessage({ t: 'ack', id, stale });
  };
  const hurry = (id) => { if (jobs.has(id) && w) w.port.postMessage({ t: 'hurry', id }); };

  const offBattle = net.on('b.botBattle', onBattle);
  const offCancel = net.on('b.botBattleCancel', (msg) => { if (msg && typeof msg.battleId === 'string') drop(msg.battleId); });
  const offStatus = net.on('status', (snap) => { if (!snap || snap.status !== 'online') clear(); });
  const hasLive = () => [...jobs.values()].some((job) => job.live);
  const offPool = net.on('b.pool', (msg) => { if (msg && w && hasLive()) w.port.postMessage({ t: 'pool', hp: msg.hp, acked: msg.acked }); });
  const offEnd = net.on('b.end', (msg) => {
    if (!msg || !jobs.get(msg.battleId)?.live) return;
    if (msg.reason === 'takeover') { drop(msg.battleId); return; }
    w?.port.postMessage({ t: 'end', id: msg.battleId, reason: msg.reason });
  });
  const offTask = net.on('b.botTask', onTask);
  // Started when the page has time, so the briefing's own loading goes first; the first job builds it anyway if it comes sooner.
  const offWarm = net.on('b.botWarm', () => {
    asked = true;
    if (isHidden()) { reportTab(); return; }
    const start = () => { if (asked) worker(); };
    if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(start, { timeout: 5000 });
    else setTimeout(start, 1000);
  });
  const offAck = net.on('b.botAck', (msg) => { if (msg && typeof msg.taskId === 'string') ack(msg.taskId, { stale: !!msg.stale }); });
  const offHurry = net.on('b.botHurry', (msg) => { if (msg && typeof msg.taskId === 'string') hurry(msg.taskId); });
  const offDrop = net.on('b.botCancel', (msg) => { if (msg && typeof msg.taskId === 'string') drop(msg.taskId); });
  const onVisibility = () => { if (asked) reportTab(); };
  doc?.addEventListener?.('visibilitychange', onVisibility);

  return {
    /** Jobs the Worker owes an answer (tests). */
    busy: () => jobs.size,
    /**
     * A bot seat's prep. `onBatch` gets the plan batch, then (after `ack`) the final one; `onFail` gets the reason.
     * The socket frames use this too; tests call it directly.
     */
    task: startTask,
    /** The server's answer to the plan batch: go on, or stop on `stale`. */
    ack,
    hurry,
    cancel: drop,
    /** The match on screen is over (main.js): nothing of it may keep the Worker busy. */
    clear,
    dispose() {
      offBattle();
      offCancel();
      offStatus();
      offPool();
      offEnd();
      offTask();
      offWarm();
      offAck();
      offHurry();
      offDrop();
      doc?.removeEventListener?.('visibilitychange', onVisibility);
      clear();
    },
  };
}
