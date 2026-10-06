// server/announce.js — operator notices ("server restarting in 5 min") pushed to every online player.
//
// scripts/announce.mjs (run over SSH on the host) writes a small JSON file, by default logs/announce.json:
//   { id, text, createdAt, until }   (ms epochs; `id` is unique per notice)
// The running server checks the file every `pollMs` (a stat, no network) and, when a new notice appears, sends
//   sys.notice { id, text, until }
// to every connected session; a session that says hello while the notice is active gets it too. The client shows
// it once per page as a long warn toast (public/js/main.js). A notice created before this server started is
// ignored, so a "restarting soon" notice does not come back after the restart it announced. Deleting the file
// (announce.mjs --clear) only stops new players from receiving it; toasts already shown expire on their own.

import fsp from 'node:fs/promises';
import { sendSession } from './net.js';

/** Longest notice text (the client's toast() caps at 200 too). */
export const NOTICE_MAX_LEN = 200;
/** Default interval between file checks. */
export const NOTICE_POLL_MS = 2000;

/**
 * A notice read from the file, or null when it is malformed.
 * @param {unknown} raw parsed JSON
 * @returns {{ id: number, text: string, createdAt: number, until: number } | null}
 */
export function parseNotice(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id, text, createdAt, until } = /** @type {any} */ (raw);
  if (!Number.isFinite(id) || !Number.isFinite(createdAt) || !Number.isFinite(until)) return null;
  if (typeof text !== 'string') return null;
  const t = text.trim().slice(0, NOTICE_MAX_LEN);
  if (!t) return null;
  return { id, text: t, createdAt, until };
}

/** Watches the notice file and delivers its notice (see the header). */
export class NoticeBoard {
  /**
   * @param {{
   *   file: string,
   *   registry: import('./net.js').SessionRegistry,
   *   startedAt: number,
   *   pollMs?: number,
   *   now?: () => number,
   *   log?: { info: Function, warn: Function },
   * }} opts
   */
  constructor({ file, registry, startedAt, pollMs = NOTICE_POLL_MS, now = Date.now, log }) {
    this.file = file;
    this.registry = registry;
    this.startedAt = startedAt;
    this.pollMs = pollMs;
    this.now = now;
    this.log = log || { info() {}, warn() {} };
    /** @type {{ id: number, text: string, createdAt: number, until: number } | null} the notice in force */
    this.notice = null;
    /** @type {string | null} mtime + size of the file at the last read (null = no file) */
    this.stamp = null;
    this.busy = false;
    this.timer = null;
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

  /** The notice in force right now (not expired, not from before this server started), or null. */
  active() {
    const n = this.notice;
    if (!n || n.createdAt < this.startedAt || this.now() >= n.until) return null;
    return n;
  }

  /** The frame for a notice. */
  frame(n) {
    return { t: 'sys.notice', id: n.id, text: n.text, until: n.until };
  }

  /** Re-read the file when it changed; broadcast a new active notice. */
  async check() {
    if (this.busy) return;
    this.busy = true;
    try {
      let st = null;
      try {
        st = await fsp.stat(this.file);
      } catch (e) {
        if (e?.code !== 'ENOENT') this.log.warn(`[notice] cannot read ${this.file}: ${e?.code || e}`);
      }
      const stamp = st ? `${st.mtimeMs}:${st.size}` : null;
      if (stamp === this.stamp) return;
      this.stamp = stamp;
      if (!st) {
        if (this.notice) this.log.info('[notice] cleared');
        this.notice = null;
        return;
      }
      let parsed = null;
      try {
        parsed = parseNotice(JSON.parse(await fsp.readFile(this.file, 'utf8')));
      } catch { /* malformed: handled below */ }
      if (!parsed) {
        this.log.warn(`[notice] ignored malformed ${this.file}`);
        return;
      }
      const isNew = parsed.id !== this.notice?.id;
      this.notice = parsed;
      if (isNew && this.active()) this.log.info(`[notice] sent to ${this.broadcast()} player(s): ${parsed.text}`);
    } finally {
      this.busy = false;
    }
  }

  /** Send the active notice to every connected session. @returns {number} sessions reached */
  broadcast() {
    const n = this.active();
    if (!n) return 0;
    const msg = this.frame(n);
    let sent = 0;
    for (const s of this.registry.all()) if (sendSession(s, msg)) sent++;
    return sent;
  }

  /** After a session's `welcome`: hand it the active notice (the client ignores ids it already showed). */
  onHello(session) {
    const n = this.active();
    if (n) sendSession(session, this.frame(n));
  }
}
