// public/js/regions.js — (fork) which server's socket this page uses (DESIGN §8.7; keys: shared/regions.js; the server's
// side: server/regions.js). The page itself never moves: storage, art cache and stats stay on the main domain, and only the
// socket goes to a region. Without regions in /healthz everything here is idle and the socket is the page's own, as ever.
//
// Three names for a region:
//   * current: the region of the live socket (a room lives there, whoever's key it was);
//   * home: where this browser makes rooms and searches — ?region=<id> for this tab (the operator's private test), else
//     the player's setting, else the faster server by ping (only while the operator has turned that on), else the page's;
//   * a token's region: a reconnect token is valid on one server, so a reload or a reopened tab goes back to that server.
//
// A join by key to another region opens a second socket first and joins there, and only then leaves the old room, so a bad
// key never costs a room: that session's token then moves to the main socket (the new hello replaces the probe socket).
// A page that loses another region's server falls back to the page's own, sooner when it has never reached it, and never
// while it holds a seat there: that seat outlives a short outage.
//
// Kept free of the store and the DOM (injected), so test/ui/regions.test.js can drive it.

import { ERR } from '../../shared/constants.js';
import { regionOfCode, regionSocketUrl } from '../../shared/regions.js';

const K_CONFIG = 'sp.regions';      // localStorage: the last /healthz regions, so a return visit connects to the right server at once
const K_TOKENS = 'sp.regionTokens'; // localStorage: { [token]: region id }, newest last
const K_BEST = 'sp.regionBest';     // localStorage: the region the last ping test chose
export const K_PREF = 'sp.pref.region'; // localStorage: 'auto' (the default) or a region id
const SS_FORCE = 'sp.regionForce';  // sessionStorage: ?region=<id>, this tab only

const TOKENS_MAX = 8;
/** A switch of home needs this much better ping, so a browser between two servers does not flip on every load. */
export const SWITCH_GAIN_MS = 20;
export const PROBE_SAMPLES = 3;
export const PROBE_TIMEOUT_MS = 4000;
/** Failed reconnects before another region is given up: a server restart gets its time, a dead first connect does not. */
export const FALLBACK_ATTEMPTS = 6;
export const FALLBACK_ATTEMPTS_FIRST = 2;
const WELCOME_WAIT_MS = 8000;
/** After a welcome the server resends a resumed room at once: this long without one means there is no seat to keep. */
export const SETTLE_GRACE_MS = 1500;

const readJson = (store, key, fallback) => {
  try { const v = JSON.parse(store?.getItem(key) ?? 'null'); return v ?? fallback; } catch { return fallback; }
};
const write = (store, key, value) => {
  try { if (value == null) store?.removeItem(key); else store?.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* private mode */ }
};
const read = (store, key) => { try { return store?.getItem(key) ?? null; } catch { return null; } };

/** A /healthz `regions` body, or null when it is not one. */
export function parseConfig(raw) {
  if (!raw || typeof raw.self !== 'string' || !Array.isArray(raw.list) || raw.list.length < 2) return null;
  if (!raw.list.every((r) => r && typeof r.id === 'string' && typeof r.host === 'string')) return null;
  if (!raw.list.some((r) => r.id === raw.self)) return null;
  return { self: raw.self, list: raw.list.map((r) => ({ id: r.id, host: r.host })), auto: raw.auto === true };
}

/**
 * The region a ping test picks: the fastest, but `previous` keeps its place unless another beats it by `gain`.
 * @param {Record<string, number>} rtts @param {string | null} previous @returns {string | null}
 */
export function pickRegion(rtts, previous, gain = SWITCH_GAIN_MS) {
  let best = null;
  for (const [id, ms] of Object.entries(rtts)) if (Number.isFinite(ms) && (best == null || ms < rtts[best])) best = id;
  if (best == null) return null;
  const old = previous != null ? rtts[previous] : NaN;
  return Number.isFinite(old) && old - rtts[best] < gain ? previous : best;
}

/**
 * @param {{ net: any, identity: any, makeNet: (url: string) => any, socketPath: () => string, secure: () => boolean,
 *   local?: any, session?: any, search?: string, WebSocket?: any, now?: () => number, setTimeout?: Function,
 *   clearTimeout?: Function, busy?: () => boolean, inMatch?: () => boolean, notify?: (what: string, region: string) => void,
 *   makeError: (code: string) => Error, [more: string]: any }} deps
 *   busy: this player is in a room, a queue or a match (their socket stays where it is); notify: tell the player something
 *   ('down': that region was given up; 'move-failed': a matched group could not be reached)
 */
export function createRegions(deps) {
  const { net, identity, local = null, session = null } = deps;
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimeout || ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearTimer = deps.clearTimeout || ((id) => globalThis.clearTimeout(id));
  const busy = () => !!deps.busy?.();
  const inMatch = () => !!deps.inMatch?.();
  const notify = (what, region) => deps.notify?.(what, region);

  let config = parseConfig(readJson(local, K_CONFIG, null));
  /** the region the socket is on or connecting to; null: the page's own, regions unknown */
  let current = null;
  const down = new Set();
  let probing = null;
  let probedOnce = false;
  let everOnline = false;
  /** a join or a move on another region is under way: the socket is about to change, leave it alone */
  let crossing = 0;
  /** when the server of the current socket last welcomed this page; 0: not yet */
  let welcomedAt = 0;
  /** @type {Set<(info: object) => void>} */
  const listeners = new Set();

  const has = (id) => !!config?.list.some((r) => r.id === id);
  const hostOf = (id) => config?.list.find((r) => r.id === id)?.host ?? null;
  const usable = (id) => has(id) && !down.has(id);
  const urlOf = (id) => regionSocketUrl(hostOf(id), deps.socketPath(), deps.secure());

  const pref = () => read(local, K_PREF) || 'auto';
  const force = () => read(session, SS_FORCE);

  function home() {
    if (!config) return null;
    const forced = force();
    if (forced && usable(forced)) return forced;
    if (config.auto) {
      const p = pref();
      if (p !== 'auto' && usable(p)) return p;
      const best = read(local, K_BEST);
      if (best && usable(best)) return best;
    }
    return config.self;
  }

  const tokenRegions = () => { const v = readJson(local, K_TOKENS, {}); return v && typeof v === 'object' ? v : {}; };
  function rememberToken(token, id) {
    if (typeof token !== 'string' || !id) return;
    const map = tokenRegions();
    delete map[token];
    map[token] = id;
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - TOKENS_MAX))) delete map[k];
    write(local, K_TOKENS, map);
  }

  /** Net asks this at every connect: the token's region when the token has one, else home. */
  function getUrl() {
    if (!config) { current = null; return null; }
    let token;
    try { token = identity.getToken(); } catch { token = null; }
    const owner = token ? tokenRegions()[token] : null;
    current = owner && usable(owner) ? owner : home();
    if (owner && owner !== current) { try { identity.clearToken(); } catch { /* its server is gone */ } }
    return urlOf(current);
  }

  function emit() {
    const info = snapshot();
    for (const fn of listeners) { try { fn(info); } catch (e) { console.warn('[regions] listener failed', e); } }
  }

  /** Move the socket to `id`'s server. Without a room there is nothing to keep, so the old token goes too. */
  function moveTo(id) {
    if (!usable(id) || id === current) return false;
    try { identity.clearToken(); } catch { /* none */ }
    welcomedAt = 0;
    net.switchServer();
    emit();
    return true;
  }

  /** Nobody is in a room here and the socket is not at home: go home. */
  function settle() {
    if (!config || crossing > 0 || busy()) return false;
    const target = home();
    if (!target || current == null || target === current) return false;
    // A token may have a seat behind it (a reload in a room, a reopened tab): moving would lose it, so hear from its server
    // first. onWelcome comes back here once a resumed room would have arrived.
    let token;
    try { token = identity.getToken(); } catch { token = null; }
    if (token && !welcomedAt) return false;
    if (welcomedAt && now() - welcomedAt < SETTLE_GRACE_MS) return false;
    return moveTo(target);
  }

  // ---- ping test ---------------------------------------------------------------------------------------------------

  /** Round trip of a `ping` on a short socket of its own (no hello: no session, no seat). Infinity: no answer. */
  function pingOnce(id) {
    return new Promise((resolve) => {
      const WS = deps.WebSocket || globalThis.WebSocket;
      let best = Infinity;
      let left = PROBE_SAMPLES;
      let ws = null;
      let timer = null;
      let at = 0;
      const finish = () => {
        clearTimer(timer);
        try { ws?.close(1000, 'probe'); } catch { /* ignore */ }
        resolve(best);
      };
      const next = () => {
        if (left-- <= 0) { finish(); return; }
        at = now();
        try { ws.send(JSON.stringify({ t: 'ping', c: at })); } catch { finish(); }
      };
      timer = setTimer(finish, PROBE_TIMEOUT_MS);
      try { ws = new WS(urlOf(id)); } catch { finish(); return; }
      ws.onopen = next;
      ws.onerror = finish;
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev?.data); } catch { return; }
        if (m?.t !== 'pong') return;
        best = Math.min(best, now() - at);
        next();
      };
    });
  }

  /** The background ping test: never awaited by the page's start, and only while it can change something. */
  function probe() {
    if (probing) return probing;
    if (!config?.auto || force() || pref() !== 'auto') return Promise.resolve(null);
    probing = (async () => {
      const ids = config.list.map((r) => r.id).filter(usable);
      const times = await Promise.all(ids.map(pingOnce));
      const rtts = Object.fromEntries(ids.map((id, i) => [id, times[i]]));
      const chosen = pickRegion(rtts, read(local, K_BEST));
      if (chosen) write(local, K_BEST, chosen);
      settle();
      return rtts;
    })().finally(() => { probing = null; });
    return probing;
  }

  // ---- joining another region --------------------------------------------------------------------------------------

  /**
   * Send a join to `id`'s server on a second socket; once it is answered ok, leave this server's room and bring the main
   * socket over. On any failure nothing here has changed: the reason is thrown.
   */
  async function requestAcross(id, type, fields) {
    if (!usable(id)) throw deps.makeError('REGION_DOWN');
    crossing++;
    const probeNet = deps.makeNet(urlOf(id));
    let token;
    probeNet.on('welcome', (m) => { token = m?.token ?? token; });
    try {
      try {
        probeNet.setName(net.helloName || net.name || identity.loadName());
        await probeNet.request(type, fields);
      } catch (err) {
        try { probeNet.close(); } catch { /* ignore */ }
        if (err?.code === 'TIMEOUT' || err?.code === 'OFFLINE' || err?.code === 'DISCONNECTED' || err?.code === 'CLOSED') throw deps.makeError('REGION_DOWN');
        throw err;
      }
      // a socket that is away would only hold this up; its seat goes with its grace time
      if (net.status === 'online' && busy()) { try { await net.request('room.leave'); } catch { /* this server just went away */ } }
      identity.saveToken(token);
      rememberToken(token, id);
      welcomedAt = 0;
      await new Promise((resolve) => {
        let timer = null;
        const done = () => { clearTimer(timer); net.off('welcome', done); resolve(); };
        timer = setTimer(done, WELCOME_WAIT_MS);
        net.on('welcome', done);
        net.switchServer();
      });
      // the main socket's hello replaced this one (server close 4001); if it did not, nothing may keep the seat's old socket
      try { probeNet.close(); } catch { /* ignore */ }
      emit();
    } finally {
      crossing--;
    }
  }

  /**
   * A join by key from anywhere. The key names the region; a room a server does not know gets one try on the others, so
   * a room older than the split, or a changed region list, still works.
   * @param {string} type 'room.join' | 'room.spectate' @param {{ code: string }} fields
   */
  async function join(type, fields) {
    const target = regionOfCode(fields.code, config?.list || []);
    if (!target) return net.request(type, fields);
    const here = current ?? config.self;
    const order = [target, ...config.list.map((r) => r.id).filter((id) => id !== target)];
    if (order[0] !== here && inMatch()) throw deps.makeError(ERR.ROOM_STARTED);
    let first = null;
    for (const id of order) {
      if (!usable(id)) continue;
      try {
        return await (id === here ? net.request(type, fields) : requestAcross(id, type, fields));
      } catch (err) {
        if (err?.code !== ERR.ROOM_NOT_FOUND && err?.code !== 'REGION_DOWN') throw err;
        first = first ?? err;
      }
    }
    throw first ?? deps.makeError(ERR.ROOM_NOT_FOUND);
  }

  /** room.move: matchmaking placed this group on another server (server/crossMatch.js). */
  async function follow(msg) {
    const fields = { code: msg.code, ticket: msg.ticket };
    try {
      if (msg.region === current) await net.request('room.join', fields);
      else await requestAcross(msg.region, 'room.join', fields);
      return true;
    } catch (err) {
      console.warn('[regions] a matched group could not be reached', err);
      notify('move-failed', msg.region);
      settle();
      return false;
    }
  }

  // ---- wiring ------------------------------------------------------------------------------------------------------

  /** Every /healthz body the page reads (ui/buildGuard.js). */
  function onHealth(h) {
    const next = parseConfig(h?.regions);
    const changed = JSON.stringify(next) !== JSON.stringify(config);
    config = next;
    if (changed) write(local, K_CONFIG, next);
    if (!next) { current = null; return; }
    if (current == null) {
      // connected before the regions were known: to the page's own server, and that is where this token belongs
      current = next.self;
      try { rememberToken(identity.getToken(), current); } catch { /* none yet */ }
    }
    if (changed) emit();
    settle(); // a tab that asked for a region before the regions were known
    // once per page: a return visit re-measures in the background, the first visit measures at all
    if (!probedOnce) { probedOnce = true; void probe(); }
  }

  /** @param {{ token?: string }} msg welcome */
  function onWelcome(msg) {
    everOnline = true;
    welcomedAt = now();
    if (config && current) rememberToken(msg?.token, current);
    emit();
    setTimer(settle, SETTLE_GRACE_MS + 50);
  }

  /** The main socket's status (Net 'status'). */
  function onStatus(snap) {
    if (!config || !current || current === config.self || snap?.status !== 'reconnecting') return;
    // a seat outlives a short outage (the server keeps it for 10 minutes): in a room or a match, keep trying, as on one server
    if (everOnline && busy()) return;
    if ((snap.attempt ?? 0) < (everOnline ? FALLBACK_ATTEMPTS : FALLBACK_ATTEMPTS_FIRST)) return;
    const lost = current;
    down.add(lost);
    notify('down', lost);
    try { identity.clearToken(); } catch { /* none */ }
    everOnline = false;
    welcomedAt = 0;
    net.switchServer();
    emit();
  }

  /** The player's setting. Out of a room it applies now; in one, when they leave. @param {string} value 'auto' or an id */
  function setPreference(value) {
    write(local, K_PREF, value === 'auto' ? null : value);
    if (value === 'auto') void probe();
    settle();
    emit();
  }

  function snapshot() {
    return {
      enabled: !!config,
      auto: !!config?.auto,
      list: config ? config.list.map((r) => r.id) : [],
      current: config ? current ?? config.self : null,
      home: home(),
      preference: pref(),
      forced: force(),
    };
  }

  // ?region=<id> this tab only; ?region=auto ends it
  try {
    const asked = new URLSearchParams(deps.search || '').get('region');
    if (asked === 'auto') write(session, SS_FORCE, null);
    else if (asked && /^[a-z][a-z0-9-]{0,15}$/.test(asked)) write(session, SS_FORCE, asked);
  } catch { /* no URL parser */ }

  return {
    getUrl, home, join, follow, probe, settle, onHealth, onWelcome, onStatus, setPreference, snapshot,
    /** main.js: what the store knows (busy, inMatch) and how to tell the player (notify). */
    configure(more) { Object.assign(deps, more); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Regions known and not given up: the settings list. */
    usable: () => (config ? config.list.map((r) => r.id).filter(usable) : []),
  };
}
