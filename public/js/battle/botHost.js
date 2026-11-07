// public/js/battle/botHost.js — (fork) the page's side of the bot work this browser does for the match
// (docs/host-browser-bots.md Part B1). It passes frames straight between the socket and one module Worker
// (battle/botWorker.js). Nothing here reaches the page's game store: no screen can draw a bot's shop or a teammate's hand
// from these frames.
//
// b.botBattle → the Worker → b.botBattleResult, or `{ error: true }` when this browser cannot run it, so the server asks the
// next human at once. A bot seat's prep (`task`) has the same shape, and the live frames for it arrive with piece 6.
//
// The socket going down or the match ending drops everything: an answer could not be delivered, and the Worker is terminated.
// It is built on the first job, so a match that never asks costs nothing.
//
//   installBotHost({ net, runner, createWorker, log }) → { busy(), task(), ack(), cancel(), clear(), dispose() } | null

import { battleRunner } from './runner.js';
import { genUrl } from '../gen.js';

export const BOT_WORKER_URL = genUrl('/js/battle/botWorker.js'); // (fork) in this page's server generation

/**
 * @param {{ net?: any, runner?: any, createWorker?: () => Worker, log?: any }} [deps]
 * @returns {null | { busy: () => number, task: Function, ack: Function, cancel: Function, clear: () => void, dispose: () => void }}
 */
export function installBotHost({ net, runner = battleRunner, createWorker = () => new Worker(BOT_WORKER_URL, { type: 'module' }), log = console } = {}) {
  if (!net || typeof net.on !== 'function' || !runner || typeof runner.ensureSim !== 'function') return null;
  /** @type {any} the live Worker; replaced as a whole, so a late callback of the old one finds itself unknown */
  let w = null;
  /** The browser cannot run a module Worker: every job is answered as failed at once. */
  let broken = false;
  /** @type {Map<string, { fail: (why: string) => void, onMessage?: (msg: any) => void }>} jobs the Worker owes an answer */
  const jobs = new Map();

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

  const onBattle = (msg) => {
    if (!msg || typeof msg.battleId !== 'string' || !msg.spec || typeof msg.spec !== 'object') return;
    const { battleId, spec } = msg;
    if (broken || (typeof spec.cs === 'string' && spec.cs !== '')) { answerBattle(battleId, { error: true }); return; }
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
  };

  const offBattle = net.on('b.botBattle', onBattle);
  const offCancel = net.on('b.botBattleCancel', (msg) => { if (msg && typeof msg.battleId === 'string') drop(msg.battleId); });
  const offStatus = net.on('status', (snap) => { if (!snap || snap.status !== 'online') clear(); });

  return {
    /** Jobs the Worker owes an answer (tests). */
    busy: () => jobs.size,
    /**
     * A bot seat's prep. `onBatch` gets the plan batch, then (after `ack`) the final one; `onFail` gets the reason.
     * @param {string} id @param {any} world
     * @param {{ budgetMs?: number, onBatch: (batch: any) => void, onFail: (why: string) => void }} o
     */
    task(id, world, { budgetMs, onBatch, onFail }) {
      jobs.set(id, {
        fail: onFail,
        onMessage(m) {
          if (m.t !== 'batch') return;
          if (m.batch === 'final') jobs.delete(id);
          onBatch(m);
        },
      });
      post(id, { t: 'task', id, world, budgetMs });
    },
    /** The server's answer to the plan batch: go on, or stop on `stale`. @param {string} id @param {{ stale?: boolean }} [o] */
    ack(id, { stale = false } = {}) {
      if (stale) jobs.delete(id);
      if (w) w.port.postMessage({ t: 'ack', id, stale });
    },
    cancel: drop,
    /** The match on screen is over (main.js): nothing of it may keep the Worker busy. */
    clear,
    dispose() {
      offBattle();
      offCancel();
      offStatus();
      clear();
    },
  };
}
