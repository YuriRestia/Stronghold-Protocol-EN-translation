// public/js/ui/buildGuard.js — the "this page is running an outdated build" guard.
//
// WHY: every module a page imports lives in its module map for the whole page lifetime, so a deploy can never reach an
// already-open tab — not even a client-only one, which is served `Cache-Control: no-cache` and would be picked up by a
// reload. A client-only battle fix shipped exactly that way and stayed invisible on the reporting player's page: the
// nginx log shows the page loaded the PRE-fix module blob and made no module request at all for the rest of the session.
//
// HOW: the server stamps a short hash of the runtime it serves into `/healthz.build` (server/http/buildTag.js).
// The first successful check of a page records that tag as "the build this page runs" — IN MEMORY, because one page is
// one set of loaded modules: nothing must survive a reload, and a duplicated tab must not inherit the first tab's tag.
// A later check reporting a DIFFERENT tag means the server changed under this page:
//   * outside a match the page reloads itself, once;
//   * during a match the guard never throws the player's game away — `onStale` fires (the connection banner offers
//     刷新页面) and the reload happens by itself as soon as the match, settlement screen included, is over.
// A check that cannot read a build (`/healthz` down or restarting, no `build` field, no answer in time) is 'unknown' and
// NEVER reloads: a restarting server must not turn a playing page into the browser's error page. A new tag is acted on
// only after two checks in a row report the SAME one, so a deploy that is still copying files cannot ping-pong a page.
//
// Behind the router (zero-downtime restarts, server/generation.js) a newer generation does not change the page's own
// /healthz — the old generation keeps serving its build. Its `sys.retire` calls `retire()` instead: the page goes to `/`
// (`home`, public/js/gen.js goHome) right away outside a match, else as soon as the match, settlement included, is over.
//
// Kept dependency-free and injectable (fetch / reload / inMatch / timers) so test/ui/buildGuard.test.js can drive it.

/** How often a page re-asks the server for its build tag. */
export const BUILD_CHECK_MS = 60_000;
/** Give up on a `/healthz` that does not answer: a request left hanging must not stop the guard from ever checking again. */
export const BUILD_FETCH_TIMEOUT_MS = 5_000;
/** How many checks in a row must report the same NEW build before the page acts on it. */
export const BUILD_CONFIRMATIONS = 2;
/** fetchBuild()'s answer for a generation the router has dropped (HTTP 410). */
export const GONE = '\u0000gone';

/**
 * Fetch `/healthz` and return its `build` tag (null when unavailable, not reported, or too slow). Never throws.
 * @param {Function} fetchFn
 * @param {{ healthUrl?: string, timeoutMs?: number, setTimeout?: Function, clearTimeout?: Function }} [o]
 *   healthUrl: the page's own generation's /healthz (public/js/gen.js genUrl), default '/healthz'
 * @returns {Promise<string|null>}
 */
export async function fetchBuild(fetchFn, o = {}) {
  const healthUrl = typeof o.healthUrl === 'string' && o.healthUrl ? o.healthUrl : '/healthz';
  const timeoutMs = Number.isFinite(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : BUILD_FETCH_TIMEOUT_MS;
  const setT = o.setTimeout || ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearT = o.clearTimeout || ((h) => globalThis.clearTimeout(h));
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const tooSlow = new Promise((_, reject) => {
    timer = setT(() => { try { ctrl?.abort(); } catch { /* ignore */ } reject(new Error('timeout')); }, timeoutMs);
  });
  try {
    const res = await Promise.race([fetchFn(healthUrl, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }), tooSlow]);
    // 410: the router no longer knows this page's generation (scripts/router.mjs) — it is gone for good
    if (res && res.status === 410) return GONE;
    if (!res || !res.ok) return null;
    const body = await res.json();
    return body && typeof body.build === 'string' && body.build ? body.build : null;
  } catch {
    return null;
  } finally {
    if (timer != null) clearT(timer);
  }
}

/**
 * One check, against the build this page already knows.
 * @param {{ fetchFn?: Function, known?: string|null, healthUrl?: string, timeoutMs?: number, setTimeout?: Function,
 *           clearTimeout?: Function }} [o]
 * @returns {Promise<{ status: 'first'|'current'|'new'|'unknown'|'gone', build: string|null }>}
 */
export async function checkBuildOnce(o = {}) {
  const fetchFn = o.fetchFn || ((url, init) => globalThis.fetch(url, init));
  const build = await fetchBuild(fetchFn, o);
  if (build === GONE) return { status: 'gone', build: null };
  if (!build) return { status: 'unknown', build: null };            // unreachable / not reported: never a reload
  if (!o.known) return { status: 'first', build };
  return { status: o.known === build ? 'current' : 'new', build };
}

/**
 * Watch for a new build.
 * @param {{ fetchFn?: Function, reload?: Function, home?: Function, inMatch?: () => boolean, healthUrl?: string,
 *           intervalMs?: number, timeoutMs?: number,
 *           setInterval?: Function, clearInterval?: Function, setTimeout?: Function, clearTimeout?: Function,
 *           onStale?: (info: { build: string, known: string|null, waiting: boolean }) => void }} [o]
 *   home: how a retired page leaves its generation (public/js/gen.js goHome; default: reload)
 * @returns {{ stop: () => void, check: () => Promise<object>, retire: () => void, settle: () => boolean,
 *             stale: () => boolean, retired: () => boolean, known: () => string|null }}
 */
export function startBuildGuard(o = {}) {
  const fetchFn = o.fetchFn || ((url, init) => globalThis.fetch(url, init));
  const reload = o.reload || (() => globalThis.location.reload());
  const home = o.home || reload;
  const inMatch = typeof o.inMatch === 'function' ? o.inMatch : () => false;
  const setIv = o.setInterval || ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearIv = o.clearInterval || ((h) => globalThis.clearInterval(h));
  const intervalMs = Number.isFinite(o.intervalMs) && o.intervalMs > 0 ? o.intervalMs : BUILD_CHECK_MS;
  let known = null;      // the build this page runs — memory only (one page == one set of loaded modules)
  let candidate = null;  // the last new build seen; needs BUILD_CONFIRMATIONS checks in a row to be acted on
  let seen = 0;          // consecutive checks that reported `candidate`
  let stale = false;     // a new build is confirmed → reload as soon as no match is on screen
  let retired = false;   // sys.retire: a newer generation took over → `home()` as soon as no match is on screen
  let pending = false;
  let timer = null;
  let stopped = false;

  const stopTimer = () => { if (timer != null) { clearIv(timer); timer = null; } };
  const reloadNow = () => { stopped = true; stopTimer(); reload(); };
  // a retired generation (sys.retire) is left for `/`, not reloaded: a reload would load the same old generation again
  const goHomeNow = () => { stopped = true; stopTimer(); home(); };
  const settle = () => {
    if (stopped || inMatch()) return false;
    if (retired) { goHomeNow(); return true; }
    if (stale) { reloadNow(); return true; }
    return false;
  };

  const check = async () => {
    if (stopped) return { status: 'stopped', build: null };
    if (pending) return { status: 'pending', build: null };
    pending = true;
    let r;
    try { r = await checkBuildOnce({ fetchFn, known, healthUrl: o.healthUrl, timeoutMs: o.timeoutMs, setTimeout: o.setTimeout, clearTimeout: o.clearTimeout }); }
    finally { pending = false; }
    if (stopped) return { status: 'stopped', build: null };
    if (r.status === 'unknown') { candidate = null; seen = 0; return r; }   // review: a failed check never reloads
    // the generation is gone (missed sys.retire, e.g. a page asleep in the background): its match is over too
    if (r.status === 'gone') { retired = true; settle(); return r; }
    if (r.status === 'first') { known = r.build; return r; }
    if (r.status === 'current') { candidate = null; seen = 0; return r; }
    // a different build: only BUILD_CONFIRMATIONS checks in a row with the SAME tag count (a deploy that is still
    // copying files exposes a tag that keeps moving, and must not ping-pong the page)
    if (candidate !== r.build) { candidate = r.build; seen = 1; } else { seen++; }
    if (seen < BUILD_CONFIRMATIONS) return { status: 'new', build: r.build };
    const first = !stale;
    stale = true;
    const waiting = inMatch();
    if (first) { try { o.onStale?.({ build: r.build, known, waiting }); } catch { /* ignore */ } }
    if (!waiting) reloadNow();
    return { status: 'stale', build: r.build, known };
  };

  const tick = () => { if (retired) { settle(); return; } check().catch(() => {}); };
  check().catch(() => {});
  timer = setIv(tick, intervalMs);
  return {
    stop: () => { stopped = true; stopTimer(); },
    check,
    /** sys.retire: leave for the new generation now, or as soon as no match is on screen (settle()). */
    retire: () => { if (stopped) return; retired = true; settle(); },
    /** Act on a pending reload / retire now if no match is on screen (main.js calls it when the screen changes). */
    settle,
    stale: () => stale,
    retired: () => retired,
    known: () => known,
  };
}
