// public/js/battle/botHost.js — (fork) the page's side of the bot work this browser does for the match
// (docs/host-browser-bots.md Part B1). It passes frames straight between the socket and one module Worker
// (battle/botWorker.js). Nothing here reaches the page's game store: no screen can draw a bot's shop or a teammate's hand
// from these frames.
//
// b.botBattle → the Worker → b.botBattleResult, or `{ error: true }` when this browser cannot run it, so the server asks the
// next human at once. b.botTask → b.botReceived → the Worker → b.botMoves (plan) → b.botAck → b.botMoves (final). A hidden tab
// may be frozen, so it says so (b.botHidden) instead of taking work, and the server moves the work on at once.
//
// What the screen needs now loads first (loadLater.js): the Worker's 400-odd modules would share the link with the briefing
// and the band draft's art, so b.botWarm and a bot seat's task build it only once the screen has settled, or after
// BOT_SCREEN_WAIT_MS. A battle never waits. While the Worker is still starting, the receipt says `starting: true` and
// b.botLoaded follows when it can take the task: the server counts the plan window from then, under a cap of its own.
//
// The socket going down or the match ending drops everything: an answer could not be delivered, and the Worker is terminated.
// It is built on the first job, so a match that never asks costs nothing.
//
//   installBotHost({ net, runner, createWorker, log, doc }) → { busy(), task(), ack(), hurry(), cancel(), clear(), dispose() } | null

import { contentFor as appContentFor } from '../content.js';
import { genUrl } from '../gen.js';
import { checkOperatorTraitRuntime } from './simLoader.js';
import { whenScreenSettled } from '../loadLater.js';

export const BOT_WORKER_URL = genUrl('/js/battle/botWorker.js'); // (fork) in this page's server generation

/**
 * The longest the Worker's start waits for the screen to settle. [ASSUMED] The briefing and the band draft's art took 5.6 s on
 * 10 Mbps / 40 ms without the Worker; a screen that never settles (a hung image) still gets its bots. The server's start
 * window (botTasks.js BOT_START_MS) covers this wait plus the Worker's own load.
 */
export const BOT_SCREEN_WAIT_MS = 10000;

/** What the match code reads: server/data.js DATA_FILES but the art manifest, which is the page's business. */
export const BOT_DATA_FILES = Object.freeze(['config', 'chess', 'bonds', 'garrisons', 'items', 'bands', 'effects', 'choices',
  'enemies', 'factions', 'waves', 'stages', 'bosses', 'tokens', 'backups']);

/**
 * The content a Worker is given. A room's set (a plugin or an old version) comes checked from content.js, and a browser that has no
 * consent for its scripts gets nothing, so the server asks someone else. The official data goes as bytes: the Worker parses it,
 * not the page's main thread.
 * @param {string | null} cs
 * @returns {Promise<{ content: any, transfer: ArrayBuffer[] }>}
 */
async function officialOrRoomContent(cs, contentFor = appContentFor) {
  if (cs) {
    const content = await contentFor(cs);
    if (!content) throw new Error('this page does not hold the room\'s content');
    return { content: { ...content, traitRuntimeVerified: await checkOperatorTraitRuntime(content.data) }, transfer: [] };
  }
  const files = {};
  await Promise.all(BOT_DATA_FILES.map(async (name) => {
    const res = await globalThis.fetch(genUrl(`/data/${name}.json`));
    if (!res.ok) throw new Error(`data/${name}.json: ${res.status}`);
    files[name] = await res.arrayBuffer();
  }));
  return { content: { files }, transfer: Object.values(files) };
}

/**
 * @param {{ net?: any, loadContent?: typeof officialOrRoomContent, createWorker?: () => Worker, log?: any, doc?: any,
 *   screenSettled?: (maxMs: number) => Promise<void> | true }} [deps]
 *   `loadContent`, `doc`: the room's content and the page's document (tests); `screenSettled`: when the screen has what it
 *   needs (loadLater.js), `true` for a screen that never waits
 * @returns {null | { busy: () => number, task: Function, ack: Function, hurry: Function, cancel: Function, clear: () => void, dispose: () => void }}
 */
export function installBotHost({ net, loadContent = officialOrRoomContent, createWorker = () => new Worker(BOT_WORKER_URL, { type: 'module' }), log = console, doc = globalThis.document,
  screenSettled = whenScreenSettled } = {}) {
  if (!net || typeof net.on !== 'function') return null;
  /** @type {any} the live Worker; replaced as a whole, so a late callback of the old one finds itself unknown */
  let w = null;
  /** The browser cannot run a module Worker: every job is answered as failed at once. */
  let broken = false;
  /** @type {Map<string, { fail: (why: string) => void, onMessage?: (msg: any) => void }>} jobs the Worker owes an answer */
  const jobs = new Map();
  /** This match has asked for bot work, so the server wants to hear about the tab. */
  let asked = false;
  let reportedHidden = false;
  /** @type {null | true | Promise<void>} this match's wait for the screen: true once it has settled (or the wait gave up) */
  let screen = null;
  /** (fork review) Bumped by clear(): a warm-up queued for a match that is over starts nothing in the next one. */
  let epoch = 0;

  /** Run `fn` once the screen has what it needs (BOT_SCREEN_WAIT_MS at most); at once when it has, or the Worker is up. */
  const afterScreen = (fn) => {
    if (w || screen === true) { fn(); return; }
    if (!screen) {
      let wait;
      try { wait = screenSettled(BOT_SCREEN_WAIT_MS); } catch { wait = true; }
      if (typeof wait?.then !== 'function') screen = true;
      else {
        const p = wait.then(() => {}, () => {}).then(() => { if (screen === p) screen = true; });
        screen = p;
      }
    }
    if (screen === true) fn();
    else screen.then(fn);
  };

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
    if (msg.t === 'loaded') { inst.onLoaded(); return; }
    if (msg.t === 'load-failed') { inst.onLoaded(new Error(msg.message)); return; }
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

  /**
   * The live Worker, created on the first job; null when this browser cannot run one. One content set per Worker, so a job for another
   * set starts a new one (that only happens across rooms).
   * @param {string | null} cs
   */
  const worker = (cs = null) => {
    if (w && w.cs !== cs) { kill(); failAll('another content set'); }
    if (w || broken) return w;
    const inst = { port: null, cs, ready: () => {}, onLoaded: () => {}, loaded: null, isLoaded: false };
    const scriptRan = new Promise((resolve) => { inst.ready = resolve; });
    const engineIn = new Promise((resolve, reject) => { inst.onLoaded = (err) => (err ? reject(err) : resolve()); });
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
    inst.loaded = scriptRan.then(() => loadContent(cs)).then(({ content, transfer }) => {
      if (w === inst) inst.port.postMessage({ t: 'content', content }, transfer);
      return engineIn;
    }).then(() => { inst.isLoaded = true; });
    inst.loaded.catch((err) => {
      if (w !== inst) return;
      log.warn?.('[botHost] content unavailable', err);
      kill();
      failAll('no content');
    });
    return inst;
  };

  /** Hand a job over once the Worker can read it; a job dropped meanwhile never goes. Its `onReady` hears of that moment first. */
  const post = (id, msg, cs = null) => {
    const inst = worker(cs);
    if (!inst) { const job = jobs.get(id); jobs.delete(id); job?.fail('no module Worker'); return; }
    inst.loaded.then(() => {
      if (w !== inst || !jobs.has(id)) return;
      const job = jobs.get(id);
      job.onReady?.();
      inst.port.postMessage(msg);
      // a hurry that came while the job waited for the Worker: the Worker only knows the job from here on
      if (job.hurried) inst.port.postMessage({ t: 'hurry', id });
    }, () => { /* failAll answered it */ });
  };

  /** A bot-only boss field: it reports through the frames a human's battle uses. A failure stays silent: the server's watchdog moves it on. */
  const startLive = (battleId, spec, { elapsed, speed }, cs) => {
    jobs.set(battleId, {
      live: true,
      fail: () => {},
      onMessage(m) {
        if (m.t === 'live-progress') { net.send('b.progress', m.msg); return; }
        if (m.t !== 'live-done') return;
        jobs.delete(battleId);
        net.send('b.progress', m.msg);
        net.send('b.result', { battleId, result: m.result, ...(cs ? { cs } : {}) });
      },
    });
    post(battleId, { t: 'live', id: battleId, spec, elapsed, speed }, cs);
  };

  const onBattle = (msg) => {
    if (!msg || typeof msg.battleId !== 'string' || !msg.spec || typeof msg.spec !== 'object') return;
    const { battleId, spec, cs = null } = msg;
    asked = true;
    if (isHidden()) { reportTab(); return; }
    if (broken) { answerBattle(battleId, { error: true }); return; }
    if (msg.live) { startLive(battleId, spec, msg.live, cs); return; }
    jobs.set(battleId, {
      fail: () => answerBattle(battleId, { error: true }),
      onMessage(m) {
        if (m.t !== 'battle-done') return;
        jobs.delete(battleId);
        answerBattle(battleId, { result: m.result, timeline: m.timeline });
      },
    });
    post(battleId, { t: 'battle', id: battleId, spec }, cs);
  };

  const drop = (id) => {
    if (jobs.delete(id)) w?.port.postMessage({ t: 'cancel', id });
  };

  const clear = () => {
    epoch++;
    kill();
    jobs.clear();
    asked = false;
    reportedHidden = false;
    screen = null;
  };

  const startTask = (id, world, { budgetMs, onBatch, onFail, onReady, cs = null }) => {
    const job = {
      fail: onFail,
      onReady,
      posted: false,
      hurried: false,
      onMessage(m) {
        if (m.t !== 'batch') return;
        if (m.batch === 'final') jobs.delete(id);
        onBatch(m);
      },
      /** Hand the task to the Worker: once the screen has settled, or at once on a hurry (every human is Ready). */
      go() {
        if (job.posted || jobs.get(id) !== job) return;
        job.posted = true;
        post(id, { t: 'task', id, world, budgetMs }, cs);
      },
    };
    jobs.set(id, job);
    afterScreen(() => job.go());
  };

  const onTask = (msg) => {
    if (!msg || typeof msg.taskId !== 'string' || !msg.world || typeof msg.world !== 'object') return;
    const { taskId } = msg;
    const cs = msg.cs ?? null;
    asked = true;
    // the Worker this task runs on is not up yet (or holds another content set): the server waits for b.botLoaded
    const starting = !isHidden() && !broken && !(w && w.isLoaded && w.cs === cs);
    net.send('b.botReceived', { taskId, ...(starting ? { starting: true } : {}) });
    if (isHidden()) { reportTab(); return; }
    if (broken) { net.send('b.botMoves', { taskId, error: true }); return; }
    startTask(taskId, msg.world, {
      budgetMs: msg.budgetMs,
      cs,
      onBatch: (b) => net.send('b.botMoves', { taskId, batch: b.batch, moves: b.moves, ...(b.memo ? { memo: b.memo } : {}) }),
      onFail: () => net.send('b.botMoves', { taskId, error: true }),
      onReady: starting ? () => net.send('b.botLoaded', { taskId }) : undefined,
    });
  };

  const ack = (id, { stale = false } = {}) => {
    if (stale) jobs.delete(id);
    if (w) w.port.postMessage({ t: 'ack', id, stale });
  };
  /** (fork review) A hurry also ends a task's wait for the screen: the humans are waiting for this seat now. */
  const hurry = (id) => {
    const job = jobs.get(id);
    if (!job) return;
    job.hurried = true;
    if (job.go && !job.posted) { job.go(); return; } // post() sends the hurry right after the task
    if (w) w.port.postMessage({ t: 'hurry', id });
  };

  const offBattle = net.on('b.botBattle', onBattle);
  const offCancel = net.on('b.botBattleCancel', (msg) => { if (msg && typeof msg.battleId === 'string') drop(msg.battleId); });
  const offStatus = net.on('status', (snap) => { if (!snap || snap.status !== 'online') clear(); });
  const hasLive = () => [...jobs.values()].some((job) => job.live);
  const offPool = net.on('b.pool', (msg) => { if (msg && w && hasLive()) w.port.postMessage({ t: 'pool', hp: msg.hp, acked: msg.acked }); });
  const offEnd = net.on('b.end', (msg) => {
    if (!msg || !jobs.get(msg.battleId)?.live) return;
    if (msg.reason === 'takeover') { drop(msg.battleId); return; }
    // after the job itself, which may still be waiting for the Worker to load
    const inst = w;
    inst?.loaded.then(() => { if (w === inst) inst.port.postMessage({ t: 'end', id: msg.battleId, reason: msg.reason }); }, () => {});
  });
  const offTask = net.on('b.botTask', onTask);
  // Started once the screen has what it needs and the page has time, so the briefing's own loading goes first. A bot seat's
  // task waits for the screen the same way; a battle builds it at once.
  const offWarm = net.on('b.botWarm', (msg) => {
    asked = true;
    if (isHidden()) { reportTab(); return; }
    const at = epoch;
    // (fork review) only for the match that asked: clear() in between means another match, maybe of another content set
    const start = () => { if (asked && at === epoch) worker(msg?.cs ?? null)?.loaded?.catch(() => {}); };
    afterScreen(() => {
      if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(start, { timeout: 5000 });
      else setTimeout(start, 1000);
    });
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
