// server/announce.js — operator notices ("server restarting in 5 min"). scripts/announce.mjs writes
// logs/announce.json `{ id, text, createdAt, until }`; this polls it and sends `sys.notice { id, text, until }` to every
// connected session, and to each new session while it is active. A notice created before the server started is
// ignored, so a restart warning does not come back after the restart.

import fsp from 'node:fs/promises';
import { sendSession } from './net.js';

/** Longest notice text (the client's toast() caps at 200 too). */
export const NOTICE_MAX_LEN = 200;
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
    /** @type {{ id: number, text: string, createdAt: number, until: number } | null} */
    this.notice = null;
    /** @type {string | null} mtime:size at the last read, null = no file */
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

  active() {
    const n = this.notice;
    if (!n || n.createdAt < this.startedAt || this.now() >= n.until) return null;
    return n;
  }

  frame(n) {
    return { t: 'sys.notice', id: n.id, text: n.text, until: n.until };
  }

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

  /** @returns {number} sessions reached */
  broadcast() {
    const n = this.active();
    if (!n) return 0;
    const msg = this.frame(n);
    let sent = 0;
    for (const s of this.registry.all()) if (sendSession(s, msg)) sent++;
    return sent;
  }

  /** The client ignores ids it already showed, so a reconnect does not repeat the toast. */
  onHello(session) {
    const n = this.active();
    if (n) sendSession(session, this.frame(n));
  }
}
