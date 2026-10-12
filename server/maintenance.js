// server/maintenance.js — planned maintenance, set by the operator with scripts/maintenance.mjs. It writes
// logs/maintenance.json `{ createdAt, at, closed, stopWhenIdle, backIn, backAt, message }` (a stable format: docs/DEPLOY.md
// §1.6); this polls it (like announce.js) and every player gets `sys.maintenance` (frame() below), which the client
// shows as a bar (public/js/ui/maintenance.js):
//   * at: a scheduled maintenance time (ms); the client counts down to it on the server's clock. Reaching it does nothing
//     by itself: running matches are never cut.
//   * closed: no new matches — Lobby.startMatch refuses (ERR.MAINTENANCE), so do room.create, solo matchmaking and
//     「搜寻队友」; running matches play on.
//   * stopWhenIdle: one-shot — once no match is live (Lobby.stats().matches === 0) `onStop` runs; server/http/boot.js
//     runMain wires it to the same clean shutdown as SIGTERM. Restarting the server is up to whatever runs it. Before it
//     stops, players get a last frame with `stopping` and the expected return (`backAt`, from backAt or now + backIn
//     minutes), shown while their page reconnects; the file is removed then (one-shot).
//   * backIn / backAt: the expected downtime (minutes) or return time (ms), shown in the bar; message: free text shown too.
// A file written before this server started is removed at start, so a "closed" from before a restart does not come back.
// Removing the file (scripts/maintenance.mjs --cancel) sends a cleared state.

import fsp from 'node:fs/promises';
import { sendSession } from './net.js';

export const MAINTENANCE_POLL_MS = 2000;
/** Longest free-text message (like announce.js NOTICE_MAX_LEN). */
export const MAINTENANCE_MESSAGE_MAX = 200;

/**
 * A maintenance state read from the file, or null when it is malformed or empty.
 * @param {unknown} raw parsed JSON
 * @returns {{ createdAt: number, at: number | null, closed: boolean, stopWhenIdle: boolean, backIn: number | null,
 *   backAt: number | null, message: string | null } | null}
 */
export function parseMaintenance(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { createdAt, at, closed, stopWhenIdle, backIn, backAt, message } = /** @type {any} */ (raw);
  if (!Number.isFinite(createdAt)) return null;
  const text = typeof message === 'string' ? message.trim().slice(0, MAINTENANCE_MESSAGE_MAX) : '';
  const state = {
    createdAt,
    at: Number.isFinite(at) ? at : null,
    closed: closed === true,
    stopWhenIdle: stopWhenIdle === true,
    backIn: Number.isFinite(backIn) && backIn > 0 ? backIn : null,
    backAt: Number.isFinite(backAt) ? backAt : null,
    message: text || null,
  };
  return state.at != null || state.closed || state.stopWhenIdle || state.message ? state : null;
}

export class MaintenanceBoard {
  /**
   * @param {{
   *   file: string,
   *   registry: import('./net.js').SessionRegistry,
   *   lobby: { stats(): { matches: number } },
   *   startedAt: number,
   *   pollMs?: number,
   *   now?: () => number,
   *   log?: { info: Function, warn: Function },
   * }} opts
   */
  constructor({ file, registry, lobby, startedAt, pollMs = MAINTENANCE_POLL_MS, now = Date.now, log }) {
    this.file = file;
    this.registry = registry;
    this.lobby = lobby;
    this.startedAt = startedAt;
    this.pollMs = pollMs;
    this.now = now;
    this.log = log || { info() {}, warn() {} };
    /** @type {ReturnType<typeof parseMaintenance>} */
    this.current = null;
    /** @type {string | null} mtime:size at the last read, null = no file */
    this.stamp = null;
    this.busy = false;
    this.timer = null;
    /** Called once when stopWhenIdle is set and no match is live (runMain: the clean shutdown). */
    this.onStop = null;
    this.stopping = false;
    this.checkedStale = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.check(); }, this.pollMs);
    this.timer.unref?.();
    void this.check();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** The state in force, or null (none, or written before this server started). */
  state() {
    const s = this.current;
    return s && s.createdAt >= this.startedAt ? s : null;
  }

  /** No new matches (Lobby asks before starting one). */
  closed() {
    return this.state()?.closed === true;
  }

  /** What /healthz reports (a stable shape: docs/DEPLOY.md §1.6). */
  report() {
    const s = this.state();
    return s ? { at: s.at, closed: s.closed, stopWhenIdle: s.stopWhenIdle, backIn: s.backIn, backAt: s.backAt, message: s.message } : null;
  }

  /** @param {{ stopping?: boolean, backAt?: number | null }} [extra] */
  frame(extra = {}) {
    const s = this.state();
    return {
      t: 'sys.maintenance', at: s?.at ?? null, closed: s?.closed === true, stopWhenIdle: s?.stopWhenIdle === true,
      backIn: s?.backIn ?? null, backAt: extra.backAt !== undefined ? extra.backAt : s?.backAt ?? null, message: s?.message ?? null,
      stopping: extra.stopping === true, serverNow: this.now(),
    };
  }

  async check() {
    // stopping: the file is gone on purpose, and players must keep the "back around …" frame
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      if (!this.checkedStale) {
        this.checkedStale = true;
        await this.removeStale();
      }
      await this.read();
      await this.checkIdle();
    } finally {
      this.busy = false;
    }
  }

  /** A file from before this start would merge into the next scripts/maintenance.mjs run: remove it. */
  async removeStale() {
    try {
      const old = parseMaintenance(JSON.parse(await fsp.readFile(this.file, 'utf8')));
      if (old && old.createdAt < this.startedAt) {
        await fsp.rm(this.file, { force: true });
        this.log.info('[maintenance] removed a maintenance file from before this start');
      }
    } catch { /* none, or malformed: read() reports it */ }
  }

  async read() {
    let st = null;
    try {
      st = await fsp.stat(this.file);
    } catch (e) {
      if (e?.code !== 'ENOENT') this.log.warn(`[maintenance] cannot read ${this.file}: ${e?.code || e}`);
    }
    const stamp = st ? `${st.mtimeMs}:${st.size}` : null;
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    const before = JSON.stringify(this.report());
    if (!st) {
      this.current = null;
    } else {
      let parsed = null;
      try {
        parsed = parseMaintenance(JSON.parse(await fsp.readFile(this.file, 'utf8')));
      } catch { /* malformed: handled below */ }
      if (!parsed) this.log.warn(`[maintenance] ignored malformed or empty ${this.file}`);
      this.current = parsed;
    }
    const after = JSON.stringify(this.report());
    if (after === before) return;
    const r = this.report();
    this.log.info(r
      ? `[maintenance] ${[r.at != null ? `at ${new Date(r.at).toISOString()}` : null, r.closed ? 'closed to new matches' : null, r.stopWhenIdle ? 'stop when idle' : null].filter(Boolean).join(', ')} — sent to ${this.broadcast()} player(s)`
      : `[maintenance] cleared — sent to ${this.broadcast()} player(s)`);
  }

  /** stopWhenIdle: run onStop once as soon as no match is live. */
  async checkIdle() {
    if (this.stopping || !this.state()?.stopWhenIdle) return;
    if (this.lobby.stats().matches > 0) return;
    this.stopping = true;
    const s = this.state();
    const backAt = s.backAt ?? (s.backIn != null ? this.now() + Math.round(s.backIn * 60000) : null);
    const msg = this.frame({ stopping: true, backAt });
    let sent = 0;
    for (const session of this.registry.all()) if (sendSession(session, msg)) sent++;
    this.log.info(`[maintenance] no match is live: stopping the server (told ${sent} player(s)${backAt != null ? `, back around ${new Date(backAt).toISOString()}` : ''})`);
    // one-shot: the setting is used up (removed before the process can exit)
    await fsp.rm(this.file, { force: true }).catch(() => {});
    try { this.onStop?.(); } catch (e) { this.log.warn(`[maintenance] stop failed: ${e?.message || e}`); }
  }

  /** @returns {number} sessions reached */
  broadcast() {
    const msg = this.frame();
    let sent = 0;
    for (const s of this.registry.all()) if (sendSession(s, msg)) sent++;
    return sent;
  }

  /** A player who connects while maintenance is set gets it at once. */
  onHello(session) {
    if (this.state()) sendSession(session, this.frame());
  }
}
