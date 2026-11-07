// (fork) What the game needs now loads first; what it will need later waits (owner 2026-11-07). On a first visit every
// screen used to ask for all it might want at the moment it opened, so art for a later round (the leaders' plates, 1.5 MB
// on the match screen's first frame) competed with the board, the operators and the music on screen.
//
//   loadLater(task)     run `task` (it may return a promise) once the screen has what it needs. One at a time, in order.
//   needNow(promise)    a load the screen is waiting for and the page cannot see for itself (models, the board, music).
//
// The screen has what it needs when nothing registered with needNow is still loading and every <img> in view has finished,
// for QUIET_MS in a row. An image out of view does not count: a lazy one never loads until it is scrolled to.
// A later load only ever goes later, by MAX_WAIT_MS at most, so a screen that never settles (a file that hangs, a player
// scrolling a long list) cannot keep it from arriving; its callers already cope with art that is not in yet.

const POLL_MS = 250;
const QUIET_MS = 500;
const MAX_WAIT_MS = 20000; // [ASSUMED] long enough for a screen on a slow link, short enough that a later round still has its art
const TASK_WAIT_MS = 10000; // [ASSUMED] a task that hangs does not hold up the ones behind it

const loading = new Set();
const queue = [];
let draining = false;

/**
 * @template T
 * @param {T} load the load in progress (a promise, or anything else: nothing to wait for)
 * @returns {T} the same value, so the call wraps in place
 */
export function needNow(load) {
  if (typeof load?.then !== 'function') return load;
  loading.add(load);
  const done = () => { loading.delete(load); };
  load.then(done, done);
  return load;
}

/** An <img> in view still loading. Reads layout only for images not yet complete. */
function imageInViewLoading(doc = globalThis.document) {
  if (!doc?.images) return false;
  const h = globalThis.innerHeight, w = globalThis.innerWidth;
  for (const img of doc.images) {
    if (img.complete) continue;
    const r = img.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < h && r.left < w) return true;
  }
  return false;
}

/** Whether what the screen asked for is in. */
export function screenSettled() {
  return loading.size === 0 && !imageInViewLoading();
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function waitForScreen() {
  const giveUp = Date.now() + MAX_WAIT_MS;
  let quietSince = null;
  while (Date.now() < giveUp) {
    if (!screenSettled()) quietSince = null;
    else {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= QUIET_MS) return;
    }
    await sleep(POLL_MS);
  }
}

async function drain() {
  draining = true;
  while (queue.length) {
    await waitForScreen();
    const task = queue.shift();
    let timer;
    try {
      await Promise.race([Promise.resolve().then(task), new Promise((r) => { timer = setTimeout(r, TASK_WAIT_MS); })]);
    } catch (err) {
      console.warn('[load] a later load failed', err);
    }
    clearTimeout(timer);
  }
  draining = false;
}

/**
 * Run `task` once the screen has what it needs.
 * @param {() => unknown} task
 */
export function loadLater(task) {
  queue.push(task);
  if (!draining) void drain();
}
